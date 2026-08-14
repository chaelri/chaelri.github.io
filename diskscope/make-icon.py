#!/usr/bin/env python3
"""Draw diskscope's icon and write it as a PNG.

Stdlib only — no Pillow, no ImageMagick, nothing to install. A PNG is just
zlib-compressed scanlines with a CRC per chunk, which is about forty lines of
code, and that is a much smaller price than a dependency.

    python3 make-icon.py out.png 1024

The mark is the volume bar the app is built around: a dark rounded square with
a ring reading mostly-full, drawn in the same blue the UI uses.
"""

import math
import struct
import sys
import zlib


def png(path, size, pixels):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    raw = bytearray()
    for y in range(size):
        raw.append(0)                       # filter: none
        for x in range(size):
            raw += bytes(pixels[y][x])
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    out += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(out)


def blend(dst, src, a):
    return [int(d + (s - d) * a) for d, s in zip(dst, src)] + [255]


def draw(size):
    s = float(size)
    # macOS icons sit in a safe area with a margin; matching it stops the icon
    # looking bigger than its neighbours in the Dock.
    pad = s * 0.09
    box = s - pad * 2
    radius = box * 0.225
    cx = cy = s / 2.0

    bg_top, bg_bot = (32, 34, 44), (16, 17, 22)
    blue, dim = (10, 132, 255), (58, 58, 62)

    ring_r = box * 0.30
    ring_w = box * 0.115
    gap = math.radians(6)
    used_end = math.radians(-90) + math.radians(360 * 0.72)

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px, py = x + 0.5, y + 0.5

            # rounded square, with a soft edge so it doesn't look sawn out
            dx = max(pad + radius - px, 0, px - (s - pad - radius))
            dy = max(pad + radius - py, 0, py - (s - pad - radius))
            dist = math.hypot(dx, dy) - radius
            inside = 1.0 - min(1.0, max(0.0, dist + 0.5))
            if inside <= 0:
                row.append((0, 0, 0, 0))
                continue

            t = (py - pad) / box
            base = [int(a + (b - a) * min(1.0, max(0.0, t))) for a, b in zip(bg_top, bg_bot)]
            col = base

            r = math.hypot(px - cx, py - cy)
            edge = abs(r - ring_r) - ring_w / 2.0
            on_ring = 1.0 - min(1.0, max(0.0, edge + 0.5))
            if on_ring > 0:
                ang = math.atan2(py - cy, px - cx)
                start = math.radians(-90)
                rel = (ang - start) % (math.pi * 2)
                lit = rel <= (used_end - start) - gap
                col = blend(col, blue if lit else dim, on_ring)

            row.append(tuple(blend(col, col, 1.0)[:3]) + (int(255 * inside),))
        rows.append(row)
    return rows


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "icon.png"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
    png(out, n, draw(n))
