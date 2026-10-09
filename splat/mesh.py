"""Turn part of a Gaussian-splat .ply into a vertex-coloured triangle mesh.

    python mesh.py in.ply out.ply --center cx,cy,cz --radii rx,ry,rz [--voxel 0.0025]

Selects splats inside an ellipsoid (file coords: y-down, z-forward), builds a
density volume (each splat adds its opacity, then a Gaussian blur stands in for
the splat footprint), extracts the surface with marching cubes, keeps the
largest connected piece, Taubin-smooths it, and colours each vertex from its
nearest splats (opacity- and distance-weighted DC colour).
"""
import argparse
import numpy as np
import trimesh
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--center", required=True)
ap.add_argument("--radii", required=True)
ap.add_argument("--exclude", action="append", default=[], help="box x0,y0,z0,x1,y1,z1 to drop (repeatable)")
ap.add_argument("--voxel", type=float, default=0.0025)
ap.add_argument("--blur", type=float, default=1.6, help="sigma in voxels")
ap.add_argument("--level", type=float, default=0.35, help="iso level as a fraction of the 90th-pct density")
ap.add_argument("--smooth", type=int, default=12)
ap.add_argument("--min-piece", type=float, default=0.05, help="keep pieces at least this fraction of the largest")
ap.add_argument("--view", default="0,0,1",
                help="direction the scan was seen from (file coords) for view-dependent colour; 'dc' = flat base colour")
a = ap.parse_args()

raw = open(a.src, "rb").read()
h = raw.index(b"end_header\n") + len(b"end_header\n")
names = [l.split()[-1].decode() for l in raw[:h].split(b"\n") if l.startswith(b"property")]
d = np.frombuffer(raw[h:], dtype=np.dtype([(n, "<f4") for n in names]))
xyz = np.stack([d["x"], d["y"], d["z"]], 1).astype(np.float64)
op = 1 / (1 + np.exp(-d["opacity"].astype(np.float64)))
C0 = 0.28209479177387814
dc = np.stack([d["f_dc_0"], d["f_dc_1"], d["f_dc_2"]], 1).astype(np.float64)
nrest = sum(n.startswith("f_rest_") for n in names) // 3
if a.view == "dc" or nrest < 15:
    rgb = np.clip(0.5 + C0 * dc, 0, 1)
else:
    # degree-3 spherical harmonics, the 3DGS layout: f_rest is channel-major (R 1..15, G, B)
    rest = np.stack([d[f"f_rest_{i}"] for i in range(45)], 1).astype(np.float64).reshape(-1, 3, 15)
    x, y, z = np.array([float(v) for v in a.view.split(",")]) / np.linalg.norm([float(v) for v in a.view.split(",")])
    xx, yy, zz = x * x, y * y, z * z
    C1, C2, C3 = 0.4886025119029199, [1.0925484305920792, -1.0925484305920792, 0.31539156525252005,
                                      -1.0925484305920792, 0.5462742152960396], \
        [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
         -0.4570457994644658, 1.445305721320277, -0.5900435899266435]
    basis = np.array([-C1 * y, C1 * z, -C1 * x,
                      C2[0] * x * y, C2[1] * y * z, C2[2] * (2 * zz - xx - yy), C2[3] * x * z, C2[4] * (xx - yy),
                      C3[0] * y * (3 * xx - yy), C3[1] * x * y * z, C3[2] * y * (4 * zz - xx - yy),
                      C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy),
                      C3[5] * z * (xx - yy), C3[6] * x * (xx - 3 * yy)])
    rgb = np.clip(0.5 + C0 * dc + rest @ basis, 0, 1)
sig = np.exp(np.stack([d["scale_0"], d["scale_1"], d["scale_2"]], 1).astype(np.float64)).prod(1) ** (1 / 3)

c = np.array([float(v) for v in a.center.split(",")])
r = np.array([float(v) for v in a.radii.split(",")])
sel = (((xyz - c) / r) ** 2).sum(1) <= 1
for e in a.exclude:
    b = [float(v) for v in e.split(",")]
    sel &= ~np.all((xyz > b[:3]) & (xyz < b[3:]), axis=1)
p, w, col, sg = xyz[sel], op[sel], rgb[sel], sig[sel]
print(f"{sel.sum()} splats selected")

lo = p.min(0) - 6 * a.voxel
dims = np.ceil((p.max(0) + 6 * a.voxel - lo) / a.voxel).astype(int)
grid = np.zeros(dims)
ijk = ((p - lo) / a.voxel).astype(int)
# each splat blurs at its own size: bucket by footprint, blur each bucket once
sv = np.clip(sg / a.voxel, a.blur, a.blur * 3)
edges = np.geomspace(sv.min(), sv.max() * 1.0001, 7)
for lo_e, hi_e in zip(edges[:-1], edges[1:]):
    m = (sv >= lo_e) & (sv < hi_e)
    if not m.any():
        continue
    g = np.zeros(dims)
    np.add.at(g, tuple(ijk[m].T), w[m])
    grid += gaussian_filter(g, np.sqrt(lo_e * hi_e))
iso = a.level * np.percentile(grid[grid > 1e-6], 90)
verts, faces, _, _ = marching_cubes(grid, iso, spacing=(a.voxel,) * 3)
verts += lo
m = trimesh.Trimesh(verts, faces, process=True)
parts = sorted(m.split(only_watertight=False), key=lambda q: -len(q.faces))
# keep every substantial piece: with a sharp field the face and the hair can
# come out as separate shells, and "largest only" silently drops the face
big = [q for q in parts if len(q.faces) >= a.min_piece * len(parts[0].faces)]
m = trimesh.util.concatenate(big)
print(f"marching cubes: {len(parts)} pieces, kept {len(big)} ({[len(q.faces) for q in big[:6]]}), {len(m.faces)} faces")
trimesh.smoothing.filter_taubin(m, iterations=a.smooth)

dist, idx = cKDTree(p).query(m.vertices, k=12)
wt = w[idx] / (dist + a.voxel) ** 2
vc = (col[idx] * wt[..., None]).sum(1) / wt.sum(1)[:, None]
m.visual.vertex_colors = np.c_[(vc * 255).round(), np.full(len(vc), 255)].astype(np.uint8)
m.export(a.dst)
print(f"{len(m.vertices)} verts, {len(m.faces)} faces -> {a.dst}")
