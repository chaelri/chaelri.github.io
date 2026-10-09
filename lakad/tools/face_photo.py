"""Face photo: render Karla's face from the scan's splats (proper Gaussian
footprints, front-to-back alpha compositing, view-dependent colour) as a
straight-on image, then cut it into a face texture for the chibi head.

    python face_photo.py Karla.ply ../assets/face.png [--straighten 0.6]

The phone saw her face from ~39 deg to the side, tilted down. Rotating the
view fully frontal exposes the far cheek nobody captured (hair shows through
as blotches); --straighten picks how far toward frontal to turn.

Writes <out> (512x512 texture: skin-tone ground, the face feathered in) and
<out>.json (where the face sits, for the head's UV mapping).
"""
import argparse
import json
import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import gaussian_filter, distance_transform_edt

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--res", type=int, default=256, help="render resolution / 2")
ap.add_argument("--oval-w", type=float, default=0.9)
ap.add_argument("--oval-h", type=float, default=0.88)
ap.add_argument("--straighten", type=float, default=0.6, help="0 = phone's view, 1 = fully frontal")
ap.add_argument("--center", default="-0.01,0.03,0.05", help="head centre, file coords")
ap.add_argument("--radius", type=float, default=0.17)
ap.add_argument("--exclude", default="0.085,0.06,-1,1,1,1", help="box to drop (the shoulder), file coords")
ap.add_argument("--pitch", type=float, default=0.0, help="extra chin-up nod, degrees")
ap.add_argument("--roll", type=float, default=-4.0, help="extra head roll, degrees (+ = tilt to her left)")
ap.add_argument("--oval", type=float, default=1.9, help="face oval size, in std-devs of the skin splats")
ap.add_argument("--sh", type=float, default=0.5, help="how much view-dependent colour to keep (0 = flat base colour)")
a = ap.parse_args()

raw = open(a.src, "rb").read()
h = raw.index(b"end_header\n") + 11
names = [l.split()[-1].decode() for l in raw[:h].split(b"\n") if l.startswith(b"property")]
d = np.frombuffer(raw[h:], dtype=np.dtype([(n, "<f4") for n in names]))
F = lambda k: d[k].astype(np.float64)
xyz = np.stack([F("x"), F("y"), F("z")], 1)
op = 1 / (1 + np.exp(-F("opacity")))
scl = np.exp(np.stack([F("scale_0"), F("scale_1"), F("scale_2")], 1))
q = np.stack([F("rot_0"), F("rot_1"), F("rot_2"), F("rot_3")], 1)
q /= np.linalg.norm(q, axis=1, keepdims=True)
C0 = 0.28209479177387814
dc = np.stack([F("f_dc_0"), F("f_dc_1"), F("f_dc_2")], 1)

c0 = np.array([float(v) for v in a.center.split(",")])
ex = [float(v) for v in a.exclude.split(",")]
sel = (np.linalg.norm(xyz - c0, axis=1) < a.radius) & ~np.all((xyz > ex[:3]) & (xyz < ex[3:]), axis=1) & (op > 0.02)

# ---- frame: file (y-down, z-forward) -> upright, then straighten the face ----
FLIP = np.diag([1.0, -1.0, -1.0])
rgb_dc = np.clip(0.5 + C0 * dc, 0, 1)
skin = sel & (op > 0.3) & (rgb_dc[:, 0] > rgb_dc[:, 2] + 0.12) & (rgb_dc.mean(1) > 0.3)
p = xyz[skin] @ FLIP.T
cs = p.mean(0)
_, _, vt = np.linalg.svd(p - cs, full_matrices=False)
up, fwd = vt[0], vt[2]
up = up if up[1] > 0 else -up
fwd = fwd if fwd[2] > 0 else -fwd
fwd -= up * (fwd @ up); fwd /= np.linalg.norm(fwd)
R = np.stack([np.cross(up, fwd), up, fwd])
t = np.radians(a.pitch)
R = np.array([[1, 0, 0], [0, np.cos(t), np.sin(t)], [0, -np.sin(t), np.cos(t)]]) @ R
t = np.radians(a.roll)
R = np.array([[np.cos(t), -np.sin(t), 0], [np.sin(t), np.cos(t), 0], [0, 0, 1]]) @ R
from scipy.spatial.transform import Rotation, Slerp
M = Slerp([0, 1], Rotation.from_matrix([np.eye(3), R]))(a.straighten).as_matrix() @ FLIP

P = (xyz[sel] - c0) @ M.T                      # positions in head frame
w_, x_, y_, z_ = q[sel].T
Rq = np.stack([
    1 - 2 * (y_ * y_ + z_ * z_), 2 * (x_ * y_ - w_ * z_), 2 * (x_ * z_ + w_ * y_),
    2 * (x_ * y_ + w_ * z_), 1 - 2 * (x_ * x_ + z_ * z_), 2 * (y_ * z_ - w_ * x_),
    2 * (x_ * z_ - w_ * y_), 2 * (y_ * z_ + w_ * x_), 1 - 2 * (x_ * x_ + y_ * y_)], 1).reshape(-1, 3, 3)
L = M @ Rq * scl[sel][:, None, :]              # covariance factor in head frame
cov = L @ L.transpose(0, 2, 1)

# view-dependent colour, seen from +z in the head frame = the phone's direction
view_file = M.T @ np.array([0, 0, -1.0])       # direction of travel from camera to splat, file coords
x, y, z = view_file
xx, yy, zz = x * x, y * y, z * z
C1 = 0.4886025119029199
C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005, -1.0925484305920792, 0.5462742152960396]
C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
      -0.4570457994644658, 1.445305721320277, -0.5900435899266435]
basis = np.array([-C1 * y, C1 * z, -C1 * x, C2[0] * x * y, C2[1] * y * z, C2[2] * (2 * zz - xx - yy), C2[3] * x * z,
                  C2[4] * (xx - yy), C3[0] * y * (3 * xx - yy), C3[1] * x * y * z, C3[2] * y * (4 * zz - xx - yy),
                  C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy), C3[5] * z * (xx - yy),
                  C3[6] * x * (xx - 3 * yy)])
# stray dark splats (loose hair, scan noise) over the cheeks and chin read as dirt
# on the face: drop dark ones inside the lower half of the skin oval
Ps = (xyz[skin] - c0) @ M.T
mu, sd = Ps[:, :2].mean(0), Ps[:, :2].std(0)
e = ((P[:, :2] - mu) / (a.oval * sd)) ** 2
dark = rgb_dc[sel].mean(1) < 0.3
specks = dark & (e.sum(1) < 1) & (P[:, 1] < mu[1] + 0.2 * sd[1]) & (P[:, 2] > np.percentile(Ps[:, 2], 20))
print(f"dropping {specks.sum()} dark specks over the lower face")
keep = ~specks
P, cov, o = P[keep], cov[keep], op[sel][keep]
sel_idx = np.flatnonzero(sel)[keep]
rest = np.stack([F(f"f_rest_{i}") for i in range(45)], 1)[sel_idx].reshape(-1, 3, 15)
col = np.clip(0.5 + C0 * dc[sel_idx] + a.sh * (rest @ basis), 0, 1)

# ---- orthographic splat render along -z -------------------------------------
N = a.res * 2                                  # render at 2x, then sample the grid
lo = np.percentile(P[:, :2], 0.5, 0) - 0.006
hi = np.percentile(P[:, :2], 99.5, 0) + 0.006
span = (hi - lo).max()
lo -= ((span - (hi - lo)) / 2)
px = span / N
acc_c = np.zeros((N, N, 3)); acc_z = np.zeros((N, N)); T = np.ones((N, N))
order = np.argsort(-P[:, 2])                   # nearest to the viewer first
for i in order:
    S2 = cov[i, :2, :2] + np.eye(2) * (0.35 * px) ** 2   # low-pass so tiny splats still land on a pixel
    det = S2[0, 0] * S2[1, 1] - S2[0, 1] ** 2
    inv = np.array([[S2[1, 1], -S2[0, 1]], [-S2[0, 1], S2[0, 0]]]) / det
    r = 3 * np.sqrt(max(S2[0, 0], S2[1, 1]))
    cx, cy = (P[i, 0] - lo[0]) / px, (P[i, 1] - lo[1]) / px
    x0, x1 = int(max(cx - r / px, 0)), int(min(cx + r / px + 1, N))
    y0, y1 = int(max(cy - r / px, 0)), int(min(cy + r / px + 1, N))
    if x0 >= x1 or y0 >= y1:
        continue
    gx = (np.arange(x0, x1) + 0.5) * px + lo[0] - P[i, 0]
    gy = (np.arange(y0, y1) + 0.5) * px + lo[1] - P[i, 1]
    GX, GY = np.meshgrid(gx, gy)
    al = np.minimum(0.99, o[i] * np.exp(-0.5 * (inv[0, 0] * GX * GX + 2 * inv[0, 1] * GX * GY + inv[1, 1] * GY * GY)))
    tw = T[y0:y1, x0:x1] * al
    acc_c[y0:y1, x0:x1] += tw[..., None] * col[i]
    acc_z[y0:y1, x0:x1] += tw * P[i, 2]
    T[y0:y1, x0:x1] *= 1 - al

A = 1 - T
img = np.flipud(np.concatenate([acc_c / np.maximum(A, 1e-6)[..., None], A[..., None]], 2))
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA").save(a.dst.rsplit(".", 1)[0] + "-render.png")


# ---- face texture --------------------------------------------------------------
# Square texture = the head's front, seen flat. The face oval is scaled into a
# fixed chibi slot (FACE_* below) so the game can map it with plain planar UVs.
from scipy.ndimage import binary_closing, binary_fill_holes, gaussian_filter as gf

FACE_CX, FACE_CY = 0.5, 0.36       # oval centre, from the bottom-left (texture units)
FACE_RX = 0.35                     # oval half-width; height follows her proportions
TEX = 512

rgb = img[..., :3]
alpha = img[..., 3]
lum_ = rgb.mean(2)
skin_px = (alpha > 0.6) & (rgb[..., 0] > rgb[..., 2] + 0.07) & (lum_ > 0.33)
face_px = binary_fill_holes(binary_closing(skin_px, iterations=N // 40))
rows, cols = np.nonzero(face_px)
# robust oval: centre + spread of the face pixels (rows grow downward here)
cy_px, cx_px = rows.mean(), cols.mean()
ry_px, rx_px = 2.05 * rows.std(), 2.05 * cols.std()
skin_rgb = np.median(rgb[skin_px & (lum_ > np.percentile(lum_[skin_px], 55))], 0)
print(f"face oval {2 * rx_px:.0f}x{2 * ry_px:.0f}px, skin {skin_rgb.round(3)}")

scale = (FACE_RX * TEX) / rx_px
out_rgb = np.ones((TEX, TEX, 3)) * skin_rgb
yy, xx = np.mgrid[0:TEX, 0:TEX] + 0.5
# texture pixel -> render pixel
sx = cx_px + (xx - FACE_CX * TEX) / scale
sy = cy_px + (yy - (1 - FACE_CY) * TEX) / scale
from scipy.ndimage import map_coordinates
samp = np.stack([map_coordinates(rgb[..., k], [sy, sx], order=1, mode="nearest") for k in range(3)], -1)
sa = map_coordinates(alpha, [sy, sx], order=1, mode="constant")
# feathered oval mask: a touch wider at the cheeks/forehead so glasses and brows stay
# shifted up a little and tighter at the jaw, so hair at the temples and the
# shadow under the chin stay out
e = ((sx - cx_px) / (rx_px * a.oval_w)) ** 2 + ((sy - (cy_px - 0.04 * ry_px)) / (ry_px * a.oval_h)) ** 2
mask = np.clip((1 - e) / 0.3, 0, 1) * np.clip(sa * 1.5, 0, 1)
mask = gf(mask, 1.2)
# ground = the face's own edge tone, so the blend into the rest of the head is invisible
ring = (e > 0.55) & (e < 0.85) & (sa > 0.6)
if ring.sum() > 50:
    skin_rgb = np.median(samp[ring], 0)
out_rgb = np.ones((TEX, TEX, 3)) * skin_rgb
out_rgb = out_rgb * (1 - mask[..., None]) + samp * mask[..., None]
from PIL import ImageFilter
# the scan is soft; a gentle unsharp mask brings back eyes, glasses and lips
Image.fromarray((np.clip(out_rgb, 0, 1) * 255).astype(np.uint8)).filter(
    ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2)).save(a.dst)
meta = {"skin": skin_rgb.round(4).tolist(), "face_cx": FACE_CX, "face_cy": FACE_CY, "face_rx": FACE_RX,
        "face_ry": float(ry_px * scale / TEX), "straighten": a.straighten}
json.dump(meta, open(a.dst.rsplit(".", 1)[0] + ".json", "w"), indent=1)
print(meta)
