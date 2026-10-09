"""Isolate a subject from a Gaussian-splat .ply and clean it.

    python refine.py in.ply out.ply --box x0,y0,z0,x1,y1,z1 [--keep-sh]

Steps (each prints how many splats it removed):
  1. crop to the box (scene coords, as the .ply stores them)
  2. drop near-invisible splats (opacity < --min-opacity)
  3. drop oversized blobs (largest axis > --max-scale)
  4. statistical outlier removal: mean distance to k nearest neighbours
     more than --sor-sigma standard deviations above the average (floaters)
  5. keep only the largest connected cluster (splats within --link of each other)

Needs numpy + scipy. Writes the same binary layout as the input, so any
3DGS viewer that opened the original opens the result.
"""
import argparse
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--box", required=True)
ap.add_argument("--min-opacity", type=float, default=0.05)
ap.add_argument("--max-scale", type=float, default=0.06)
ap.add_argument("--sor-k", type=int, default=16)
ap.add_argument("--sor-sigma", type=float, default=2.0)
ap.add_argument("--link", type=float, default=0.025)
ap.add_argument("--mask-out", help="also save the kept-splat mask (.npy) over the INPUT")
a = ap.parse_args()

raw = open(a.src, "rb").read()
h = raw.index(b"end_header\n") + len(b"end_header\n")
header = raw[:h]
names = [l.split()[-1].decode() for l in header.split(b"\n") if l.startswith(b"property")]
d = np.frombuffer(raw[h:], dtype=np.dtype([(n, "<f4") for n in names]))
n0 = len(d)
idx = np.arange(n0)
xyz = np.stack([d["x"], d["y"], d["z"]], 1).astype(np.float64)


def step(label, keep):
    global idx
    print(f"{label:28} -{(~keep).sum():7d}  -> {keep.sum():7d}")
    idx = idx[keep]


b = [float(v) for v in a.box.split(",")]
p = xyz[idx]
step("crop to box", np.all((p > b[:3]) & (p < b[3:]), axis=1))

op = 1 / (1 + np.exp(-d["opacity"][idx].astype(np.float64)))
step("near-invisible", op >= a.min_opacity)

sc = np.exp(np.stack([d["scale_0"], d["scale_1"], d["scale_2"]], 1)[idx].astype(np.float64)).max(1)
step("oversized blobs", sc <= a.max_scale)

p = xyz[idx]
dist, _ = cKDTree(p).query(p, k=a.sor_k + 1)
md = dist[:, 1:].mean(1)
step("floaters (SOR)", md <= md.mean() + a.sor_sigma * md.std())

p = xyz[idx]
pairs = cKDTree(p).query_pairs(a.link, output_type="ndarray")
g = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(p), len(p)))
_, lab = connected_components(g, directed=False)
step("detached pieces", lab == np.bincount(lab).argmax())

out = d[idx]
header = header.replace(f"element vertex {n0}".encode(), f"element vertex {len(out)}".encode())
with open(a.dst, "wb") as f:
    f.write(header)
    f.write(out.tobytes())
if a.mask_out:
    m = np.zeros(n0, bool)
    m[idx] = True
    np.save(a.mask_out, m)
print(f"kept {len(out)} of {n0} splats ({len(out) / n0:.0%}), {len(header) + out.nbytes:,} bytes -> {a.dst}")
