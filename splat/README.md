# splat

A viewer for Gaussian-splat scans (.ply / .spz / .splat / .ksplat / .sog), plus a cleanup script for isolating one subject. It works offline: three.js 0.186 and Spark 2.3.1 are vendored in `vendor/`.

## View

```
python3 view.py ~/Downloads/scan.ply   # serves + opens it
python3 view.py                        # empty viewer, drag a file in
```

Drag to orbit, scroll or pinch to zoom, right-drag to pan. The bottom bar has **Turntable** (auto-spin) and a light/dark background switch.

## Refine (isolate a person)

```
~/Desktop/enclosure/.venv/bin/python refine.py in.ply out.ply \
    --box=x0,y0,z0,x1,y1,z1 [--sor-sigma 1.2] [--min-opacity 0.1]
```

Steps: crop to the box → drop near-invisible splats → drop oversized blobs → remove statistical-outlier floaters → keep the largest connected piece. Each step prints what it removed. The output keeps the full layout, spherical harmonics included.

Phone scans are **y-down, z-forward** (camera frame): the box's y runs head (low) to feet (high), and z is depth away from the phone. The viewer flips them upright.

`scans/` is gitignored; scans of people stay on this Mac.

### Karla (2026-10-09)

Source `Barangay V.ply` (189,581 splats, with a 10,242-splat sky dome at r = 240 m). Isolated with:

```
--box=-0.19,-0.12,-0.2,0.47,0.52,0.32 --sor-sigma 1.2 --min-opacity 0.1   → 104,810 splats
```

The grey smear behind her knee in side views is real but under-captured scan data, not a floater.
