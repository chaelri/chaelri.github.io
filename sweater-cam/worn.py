"""'Worn' sweater: shape from your own body, fabric from a real knit photo.

The sweater outline is your segmented body below a crew neckline, so it follows
your real shoulders and arms. Its light and shadow come from your own body
(heavily blurred, so the print of what you wear doesn't show through), the
stitches come from a real knit photo, and a ribbed collar band sits at the base
of your neck with a soft contact shadow on the skin above it.
"""
import cv2
import numpy as np

BG, HAIR, BODY_SKIN, FACE_SKIN, CLOTHES, OTHER = range(6)


def _tileable(gray):
    """Mirror-tile a texture patch so it repeats without seams."""
    top = np.hstack([gray, gray[:, ::-1]])
    return np.vstack([top, top[::-1]])


class Worn:
    def __init__(self, asset, frame_shape, knit_scale=0.55,
                 base=30.0, shade_gain=9.0, knit_gain=0.5):
        h, w = frame_shape[:2]
        rgba = cv2.imread(asset, cv2.IMREAD_UNCHANGED)
        g = cv2.cvtColor(rgba[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
        patch = g[330:900, 200:640]  # plain body knit, away from edges and the old logo
        patch = cv2.resize(patch, None, fx=knit_scale, fy=knit_scale, interpolation=cv2.INTER_AREA)
        hp = patch - cv2.GaussianBlur(patch, (0, 0), 2.5)  # stitch detail only
        hp /= hp.std() + 1e-6
        tile = _tileable(hp)
        # fine jersey knit: faint vertical wales, no photo noise (it read as TV static)
        xs = np.arange(w, dtype=np.float32)[None, :]
        ys = np.arange(h, dtype=np.float32)[:, None]
        self.knit = (0.6 * np.sin(xs * 2 * np.pi / 3.0) * (0.8 + 0.2 * np.sin(ys * 2 * np.pi / 4.0))).astype(np.float32)
        # collar ribs: vertical ribs, a little coarser than the body knit
        x = np.arange(w, dtype=np.float32)
        self.ribs = np.sin(x * 2 * np.pi / 7.0)[None, :].repeat(h, 0)
        self.base, self.shade_gain, self.knit_gain = base, shade_gain, knit_gain
        self.geom = None
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(np.float32)

    def _neck_geometry(self, face):
        """Face box -> (cx, neckline_y, half_width, rise, face_h), smoothed."""
        rows = np.where(face.any(axis=1))[0]
        cols = np.where(face.any(axis=0))[0]
        if len(rows) < 5:
            return self.geom
        top, chin = rows[0], rows[-1]
        fh, fw = chin - top, cols[-1] - cols[0]
        g = np.array([(cols[0] + cols[-1]) / 2, chin + 0.16 * fh, 0.58 * fw, 0.26 * fh, fh], np.float32)  # lower collar = neck room
        self.geom = g if self.geom is None else 0.5 * g + 0.5 * self.geom
        return self.geom

    def render(self, frame, conf_full, hands):
        """conf_full: list of 6 confidence maps at frame size. hands: 0..1 map."""
        h, w = frame.shape[:2]
        face = conf_full[FACE_SKIN] > 0.5
        geom = self._neck_geometry(face)
        if geom is None:
            return frame
        cx, ny, rx, rise, fh = geom

        # neckline curve: U under the chin, flat at shoulder height outside it
        t = np.clip((self.xx - cx) / rx, -1, 1)
        edge_y = ny - rise * t * t
        below = np.clip((self.yy - edge_y) / 2.0 + 0.5, 0, 1)  # soft 1px-ish edge

        person = 1.0 - conf_full[BG]
        top_layer = np.maximum(np.maximum(conf_full[FACE_SKIN], conf_full[HAIR]), hands)
        body = np.clip((person - top_layer - 0.35) / 0.3, 0, 1)
        # whatever you're wearing is always covered below the chin; bare skin only below the neckline
        clothes = np.clip((conf_full[CLOTHES] + conf_full[OTHER] - 0.3) / 0.3, 0, 1) * (self.yy > ny - rise - 0.12 * fh)
        mask = np.maximum(body * below, clothes * (1 - top_layer))
        core = mask > 0.5  # the real body, used for shading
        # looser fit: a sweater sits wider than skin, mostly sideways (arms, flanks)
        kx, ky = int(0.16 * fh) | 1, int(0.05 * fh) | 1
        loose = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kx, ky)))
        mask = np.maximum(mask, loose * below * (1 - top_layer))
        mask = cv2.GaussianBlur(mask, (0, 0), 2.2)
        self.anchor = np.array([cx, ny], np.float32)

        # shading from your own body, blurred so the shirt underneath doesn't print through
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
        inside = mask > 0.5
        if not inside.any():
            return frame
        # shading spread outward from the body only (the wider fit must not pick up the wall)
        src = core.astype(np.float32)
        q = (w // 4, h // 4)  # heavy blur -> do it at quarter size, same look, much cheaper
        num = cv2.GaussianBlur(cv2.resize(gray * src, q, interpolation=cv2.INTER_AREA), (0, 0), 3.5)
        den = cv2.GaussianBlur(cv2.resize(src, q, interpolation=cv2.INTER_AREA), (0, 0), 3.5)
        fill = gray[core].mean() if core.any() else 0.0
        blur = cv2.resize(np.where(den > 0.02, num / (den + 1e-3), fill).astype(np.float32), (w, h))
        shade = (blur - blur[inside].mean()) / (blur[inside].std() + 1e-6)

        # edges of the body fall into shadow (fabric turning away from the light)
        dist = cv2.distanceTransform(inside.astype(np.uint8), cv2.DIST_L2, 5)
        ao = np.clip(dist / (0.25 * fh), 0, 1) ** 0.7 * 0.45 + 0.55

        val = (self.base + self.shade_gain * shade + self.knit_gain * 4.0 * self.knit) * ao

        # ribbed collar band just below the neckline
        band_h = 0.11 * fh
        d = self.yy - edge_y
        band = ((d > 0) & (d < band_h) & (np.abs(self.xx - cx) < rx * 1.05)).astype(np.float32)
        band = cv2.GaussianBlur(band, (0, 0), 1.0)
        rib = 2.0 * self.ribs + 1.5 * np.clip(1 - d / band_h, 0, 1)  # subtle roll; collar stays black
        seam = np.exp(-((d - band_h) ** 2) / (2 * 1.2 ** 2)) * -9.0  # dark seam under the band
        val = val + band * rib + seam * (np.abs(self.xx - cx) < rx * 1.05)

        val = np.clip(val, 6, 90)
        sweater = np.dstack([val * 1.05, val, val * 0.97])

        # contact shadow on the neck just above the collar
        above = np.clip(1 - (-d) / (0.07 * fh), 0, 1) * (d < 0) * (np.abs(self.xx - cx) < rx)
        shadow = 1 - 0.35 * above * (1 - top_layer)
        base = frame.astype(np.float32) * shadow[..., None]

        self.last_mask = mask
        a = mask[..., None]
        return (base * (1 - a) + sweater * a).clip(0, 255).astype(np.uint8)
