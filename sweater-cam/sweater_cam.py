"""sweater-cam: live webcam filter that dresses you in a plain black sweater.

Reads the real camera, segments clothes (and optionally bare arms) with
MediaPipe's multiclass selfie model, repaints them as dark knit while keeping
the folds/shading, and sends the result to the OBS Virtual Camera so Teams
can pick it as a camera.

Keys in the preview window:  s = sweater on/off   a = sleeves on/off   q = quit
"""
import argparse
import os
import time

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

HERE = os.path.dirname(os.path.abspath(__file__))
SEG_MODEL = os.path.join(HERE, "selfie_multiclass.tflite")
HAND_MODEL = os.path.join(HERE, "hand_landmarker.task")
POSE_MODEL = os.path.join(HERE, "pose_landmarker.task")
SWEATER = os.path.join(HERE, "assets", "sweater.png")

# selfie_multiclass classes
BG, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHER = range(6)


def knit_texture(h, w):
    """Subtle vertical rib pattern (values around 0, range about +-1)."""
    x = np.arange(w, dtype=np.float32)
    y = np.arange(h, dtype=np.float32)
    ribs = np.sin(x * (2 * np.pi / 6.0))[None, :]
    stitch = 0.35 * np.sin(y * (2 * np.pi / 5.0))[:, None] * np.sign(ribs)
    noise = np.random.default_rng(7).normal(0, 0.25, (h, w)).astype(np.float32)
    tex = ribs + stitch + noise
    return cv2.GaussianBlur(tex, (3, 3), 0) / 1.6


def hand_mask(landmarker, rgb_small, ts_ms, shape):
    """White blobs over detected hands (so sleeves stop at the wrist)."""
    h, w = shape
    out = np.zeros((h, w), np.uint8)
    res = landmarker.detect_for_video(
        mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_small), ts_ms)
    for lms in res.hand_landmarks or []:
        pts = np.array([[p.x * w, p.y * h] for p in lms], np.int32)
        hull = cv2.convexHull(pts)
        cv2.fillConvexPoly(out, hull, 255)
        # pad: hull of landmarks misses the palm edge and finger thickness
        size = max(np.ptp(pts[:, 0]), np.ptp(pts[:, 1]), 20)
        out = cv2.dilate(out, cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (int(size * 0.35) | 1, int(size * 0.35) | 1)))
    return out.astype(np.float32) / 255.0


def build_mask(conf, sleeves, hands):
    """Soft 0..1 mask of where the sweater goes."""
    clothes = conf[CLOTHES]
    if not sleeves:
        return clothes
    face = conf[FACE_SKIN] > 0.5
    rows = np.where(face.any(axis=1))[0]
    skin = conf[BODY_SKIN].copy()
    if len(rows):
        top, bottom = rows[0], rows[-1]
        cols = np.where(face.any(axis=0))[0]
        fh, fw = bottom - top, cols[-1] - cols[0]
        cx = (cols[0] + cols[-1]) // 2
        skin[:bottom] = 0  # head stays as is
        # crew neck: keep a rounded neck opening under the chin, cover the rest
        neck = np.zeros_like(skin)
        cv2.ellipse(neck, (int(cx), int(bottom)), (int(fw * 0.34), int(fh * 0.38)),
                    0, 0, 360, 1.0, -1)
        neck = cv2.GaussianBlur(neck, (0, 0), max(fw * 0.04, 1))
        skin *= 1.0 - neck
    # no face found: don't guess, leave skin alone
    else:
        skin[:] = 0
    skin *= 1.0 - hands
    return np.maximum(clothes, skin)


def paint_sweater(frame, mask, tex):
    """Repaint masked area as black knit, keeping the original light/shadow."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    inside = mask > 0.5
    mean = gray[inside].mean() if inside.any() else 128.0
    shade = np.clip((gray - mean) * 0.22 + 26.0 + tex * 3.0, 8.0, 70.0)
    sweater = np.dstack([shade * 1.06, shade * 1.0, shade * 0.97])  # BGR, slightly cool
    a = mask[..., None]
    return (frame.astype(np.float32) * (1 - a) + sweater * a).clip(0, 255).astype(np.uint8)


_GRAIN = None


def finish(frame, up, mask, n):
    """Full-res composite that hides the seams: grow the edge over leftover fringe,
    strip green spill next to it, and give the sweater the webcam's grain + fine knit."""
    global _GRAIN
    h, w = mask.shape
    if _GRAIN is None or _GRAIN[0].shape != (h, w):
        rng = np.random.default_rng(3)
        xs = np.arange(w, dtype=np.float32)[None, :]
        knit = 1.6 * np.sin(xs * 2 * np.pi / 3.2) * np.ones((h, 1), np.float32)
        _GRAIN = [cv2.GaussianBlur(rng.normal(0, 3.0, (h, w)).astype(np.float32), (0, 0), 0.7) + knit
                  for _ in range(4)]
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    a = cv2.GaussianBlur(cv2.dilate(mask, k), (0, 0), 1.6)  # ~4px bigger, soft edge
    # green spill / skin halo ring just outside: pull green down to the other channels
    ring = np.clip(cv2.GaussianBlur(cv2.dilate(a, k, iterations=2), (0, 0), 3) - a, 0, 1)[..., None]
    f = frame.astype(np.float32)
    desp = f.copy()
    desp[..., 1] = np.minimum(f[..., 1], np.maximum(f[..., 0], f[..., 2]))
    f = f * (1 - ring) + desp * ring
    sweater = up.astype(np.float32) + _GRAIN[n % 4][..., None]
    finish.alpha = a
    a = a[..., None]
    return (f * (1 - a) + sweater * a).clip(0, 255).astype(np.uint8)


def replace_background(out, bg, bg_conf, sweater_a):
    """Swap the room for `bg`; you + the (wider) sweater stay in front."""
    person = np.clip((1.0 - bg_conf - 0.3) / 0.4, 0, 1)
    person = cv2.GaussianBlur(person, (0, 0), 1.5)
    fg = np.maximum(person, sweater_a)[..., None]
    return (bg * (1 - fg) + out.astype(np.float32) * fg).astype(np.uint8)


class TryOn:
    """Warp a real sweater photo onto the body from pose shoulder landmarks."""

    # asset coords (assets/sweater.png): where the arm joints sit inside the shoulders
    SH_L = (75.0, 115.0)
    SH_R = (770.0, 115.0)

    def __init__(self, asset, widen=1.5, drop=-0.14, smooth=0.5):
        rgba = cv2.imread(asset, cv2.IMREAD_UNCHANGED)
        gray = cv2.cvtColor(rgba[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
        # neutral black knit (the photo is slightly navy)
        self.bgr = np.dstack([gray * 1.04, gray, gray * 0.98])
        self.alpha = rgba[..., 3].astype(np.float32) / 255.0
        # neck opening = convex hull of the top of the sweater minus the sweater itself;
        # filled later with the dark inside of the back collar
        top = (self.alpha > 0.5).astype(np.uint8)
        top[260:] = 0
        hull = np.zeros_like(top)
        cv2.fillConvexPoly(hull, cv2.convexHull(cv2.findNonZero(top)), 1)
        hole = np.clip(hull.astype(np.float32) - self.alpha, 0, 1)
        hole[:55] = 0  # only the low part: the back collar seen through the opening
        self.hole = cv2.GaussianBlur(hole, (0, 0), 3)
        self.widen, self.drop, self.smooth = widen, drop, smooth
        self.pts = None
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
            running_mode=vision.RunningMode.VIDEO, num_poses=1))

    def shoulders(self, rgb_small, ts, w, h):
        res = self.pose.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_small), ts)
        if not res.pose_landmarks:
            return None
        lm = res.pose_landmarks[0]
        a, b = lm[11], lm[12]
        if min(getattr(a, "visibility", 1), getattr(b, "visibility", 1)) < 0.3:
            return None
        p = np.array([[a.x * w, a.y * h], [b.x * w, b.y * h]], np.float32)
        p = p[np.argsort(p[:, 0])]  # image-left first
        self.pts = p if self.pts is None else self.smooth * p + (1 - self.smooth) * self.pts
        return self.pts

    def render(self, frame, pts, keep, skin=None):
        """Composite the sweater over frame; `keep` (0..1) = face/hair/hands drawn on top."""
        h, w = frame.shape[:2]
        c = pts.mean(axis=0)
        d = (pts[1] - pts[0]) / 2 * self.widen
        sw = np.linalg.norm(pts[1] - pts[0])
        down = np.array([-d[1], d[0]]) / max(np.linalg.norm(d), 1) * sw * self.drop
        dst = np.array([c - d + down, c + d + down], np.float32)
        M, _ = cv2.estimateAffinePartial2D(np.array([self.SH_L, self.SH_R], np.float32), dst)
        if M is None:
            return frame
        img = cv2.warpAffine(self.bgr, M, (w, h), flags=cv2.INTER_LINEAR)
        a = cv2.warpAffine(self.alpha, M, (w, h), flags=cv2.INTER_LINEAR)
        hole = cv2.warpAffine(self.hole, M, (w, h), flags=cv2.INTER_LINEAR)
        scene = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean()
        inner = np.full_like(img, 24.0) * np.clip(scene / 120.0, 0.75, 1.35)
        hole_a = hole * (1.0 - np.maximum(keep, skin if skin is not None else 0))
        frame = (frame.astype(np.float32) * (1 - hole_a[..., None]) + inner * hole_a[..., None])
        # match the room's exposure a little
        img = img * np.clip(scene / 120.0, 0.75, 1.35)
        a = a * (1.0 - keep)
        a3 = a[..., None]
        return (frame.astype(np.float32) * (1 - a3) + img * a3).clip(0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--camera", type=int, default=0, help="camera index (default 0)")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--no-sleeves", dest="sleeves", action="store_false", help="only recolour clothes, leave bare arms")
    ap.add_argument("--no-vcam", action="store_true", help="preview only, don't start the virtual camera")
    ap.add_argument("--no-preview", action="store_true", help="no preview window")
    ap.add_argument("--snapshot", help="process one frame, save before|after to this path, exit")
    ap.add_argument("--image", help="use this image file instead of the camera (with --snapshot)")
    ap.add_argument("--paint-only", action="store_true", help="old mode: only darken your own clothes")
    ap.add_argument("--photo", action="store_true", help="old mode: paste the sweater photo on the shoulders")
    ap.add_argument("--bg", default=os.path.join(HERE, "backgrounds", "warm-study.jpg"),
                    help="background image behind you (default: warm study)")
    ap.add_argument("--no-bg", action="store_true", help="keep your real room")
    ap.add_argument("--no-ai", action="store_true", help="skip the SD-Turbo pass (procedural sweater only)")
    ap.add_argument("--ai-strength", type=float, default=0.6, help="how much the AI redraws (0.3-0.8)")
    args = ap.parse_args()

    if args.image:
        cap, frame = None, cv2.imread(args.image)
        ok = frame is not None
        args.snapshot = args.snapshot or "out.jpg"
    else:
        cap = cv2.VideoCapture(args.camera)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
        cap.set(cv2.CAP_PROP_FPS, args.fps)
        for _ in range(15):  # let exposure settle; first frames are often dark
            ok, frame = cap.read()
    if not ok:
        raise SystemExit("Camera did not open. Give your terminal camera access in "
                         "System Settings > Privacy & Security > Camera, or try --camera 1.")
    h, w = frame.shape[:2]

    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mp_python.BaseOptions(model_asset_path=SEG_MODEL),
        running_mode=vision.RunningMode.VIDEO,
        output_confidence_masks=True, output_category_mask=False))
    hands_lm = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=HAND_MODEL),
        running_mode=vision.RunningMode.VIDEO, num_hands=2))

    tryon = TryOn(SWEATER) if args.photo else None
    from worn import Worn
    bg = None if args.no_bg else cv2.resize(cv2.imread(args.bg), (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)
    hw, hh = w // 2, h // 2  # sweater maths at half res; face/background stay full res
    worn = None if (args.paint_only or args.photo) else Worn(SWEATER, (hh, hw))
    ai = None
    if worn is not None and not args.no_ai:
        print("Loading SD-Turbo on the Mac GPU...", flush=True)
        if args.snapshot:
            from ai_sweater import AISweater
            ai = AISweater(strength=args.ai_strength)
        else:
            from ai_sweater import AsyncAI
            ai = AsyncAI(strength=args.ai_strength)
    small_w = 512
    small_h = int(h * small_w / w)
    tex = knit_texture(h, w)
    prev = None
    enabled, sleeves = True, args.sleeves
    t0 = time.monotonic()
    last_ts = -1

    vcam = None
    if not args.no_vcam and not args.snapshot:
        import pyvirtualcam
        try:
            vcam = pyvirtualcam.Camera(w, h, args.fps, fmt=pyvirtualcam.PixelFormat.BGR, backend="obs")
            print(f"Virtual camera on: {vcam.device}. In Teams pick 'OBS Virtual Camera'.")
        except RuntimeError as e:
            raise SystemExit(f"Virtual camera failed: {e}\nOpen OBS once and click "
                             "'Start Virtual Camera' (approve the system extension), then quit OBS and rerun.")

    frames, fps_t = 0, time.monotonic()
    hands_cache = pts_cache = None
    try:
        while True:
            if frames:  # first frame already read
                ok, frame = cap.read()
                if not ok:
                    break
            frames += 1
            ts = int((time.monotonic() - t0) * 1000)
            ts = max(ts, last_ts + 1)
            last_ts = ts

            out = frame
            if enabled:
                rgb = cv2.cvtColor(cv2.resize(frame, (small_w, small_h)), cv2.COLOR_BGR2RGB)
                res = seg.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)
                conf = [np.squeeze(m.numpy_view()).astype(np.float32) for m in res.confidence_masks]
                if worn is not None:
                    if frames % 3 == 1 or hands_cache is None:
                        hands_cache = hand_mask(hands_lm, rgb, ts, (small_h, small_w))
                    full = [cv2.resize(c, (hw, hh), interpolation=cv2.INTER_LINEAR) for c in conf + [hands_cache]]
                    prev = full if prev is None else [0.6 * a + 0.4 * b for a, b in zip(full, prev)]
                    small = cv2.resize(frame, (hw, hh), interpolation=cv2.INTER_AREA)
                    worn.last_mask = None
                    out_s = worn.render(small, prev[:6], prev[6])
                    if worn.last_mask is not None:
                        if ai is not None:
                            if args.snapshot:
                                out_s = ai.render(out_s, worn.last_mask)
                            else:
                                ai.submit(out_s, worn.last_mask, worn.anchor)
                                out_s = ai.apply(out_s, worn.last_mask, worn.anchor)
                        up = cv2.resize(out_s, (w, h), interpolation=cv2.INTER_LINEAR)
                        out = finish(frame, up, cv2.resize(worn.last_mask, (w, h)), frames)
                        if bg is not None:
                            out = replace_background(out, bg, cv2.resize(prev[BG], (w, h)), finish.alpha)
                elif (sleeves or tryon) and (frames % 3 == 1 or hands_cache is None):
                    hands_cache = hand_mask(hands_lm, rgb, ts, (small_h, small_w))
                if worn is None:
                    hands = hands_cache if (sleeves or tryon) else 0.0
                    m = build_mask(conf, sleeves, hands)
                    m = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
                    prev = m if prev is None else 0.55 * m + 0.45 * prev  # less flicker
                    soft = cv2.GaussianBlur(prev, (0, 0), 3)
                    soft = np.clip((soft - 0.25) / 0.3, 0, 1)  # tighten edge, keep feather
                    out = paint_sweater(frame, soft, tex)
                    if tryon and (frames % 2 == 1 or pts_cache is None):
                        pts_cache = tryon.shoulders(rgb, ts, w, h)
                    pts = pts_cache if tryon else None
                    if pts is not None:
                        keep = np.maximum(np.maximum(conf[FACE_SKIN], conf[HAIR]), hands)
                        keep = cv2.resize(keep, (w, h), interpolation=cv2.INTER_LINEAR)
                        keep = np.clip((cv2.GaussianBlur(keep, (0, 0), 2) - 0.3) / 0.4, 0, 1)
                        skin = cv2.resize(conf[BODY_SKIN], (w, h), interpolation=cv2.INTER_LINEAR)
                        skin = np.clip((cv2.GaussianBlur(skin, (0, 0), 2) - 0.3) / 0.4, 0, 1)
                        out = tryon.render(out, pts, keep, skin)

            if args.snapshot:
                cv2.imwrite(args.snapshot, np.hstack([frame, out]))
                print("saved", args.snapshot)
                break
            if vcam:
                vcam.send(out)
            if not args.no_preview:
                label = f"sweater {'ON' if enabled else 'OFF'} | sleeves {'ON' if sleeves else 'OFF'}  [s/a/q]"
                view = out.copy()
                cv2.putText(view, label, (16, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                cv2.imshow("sweater-cam (preview)", view)
                k = cv2.waitKey(1) & 0xFF
                if k == ord("q"):
                    break
                if k == ord("s"):
                    enabled = not enabled
                if k == ord("a"):
                    sleeves = not sleeves
            if frames % 90 == 0:
                now = time.monotonic()
                extra = f" | AI {ai.last_ms:.0f} ms/update" if ai is not None and hasattr(ai, "last_ms") else ""
                print(f"{90 / (now - fps_t):.1f} fps{extra}     ", end="\r", flush=True)
                fps_t = now
    finally:
        if cap:
            cap.release()
        if vcam:
            vcam.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
