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
    args = ap.parse_args()

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
                hands = hand_mask(hands_lm, rgb, ts, (small_h, small_w)) if sleeves else 0.0
                m = build_mask(conf, sleeves, hands)
                m = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
                prev = m if prev is None else 0.55 * m + 0.45 * prev  # less flicker
                soft = cv2.GaussianBlur(prev, (0, 0), 3)
                soft = np.clip((soft - 0.25) / 0.3, 0, 1)  # tighten edge, keep feather
                out = paint_sweater(frame, soft, tex)

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
                print(f"{90 / (now - fps_t):.1f} fps", end="\r", flush=True)
                fps_t = now
    finally:
        cap.release()
        if vcam:
            vcam.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
