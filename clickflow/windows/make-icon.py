"""Builds AppIcon.ico in the option-B look (warm paper, ink outline, hard shadow, mustard tile,
green click ring + ink cursor). Needs Pillow:  python make-icon.py
"""
import io
import os
import struct
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
INK, SUN, GREEN, PAPER = (31, 26, 23), (244, 201, 75), (47, 107, 79), (239, 232, 216)
S = 1024  # draw big, shrink for smooth edges


def art():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m, r, o, sh = 72, 200, 36, 48  # margin, corner radius, outline, shadow offset
    box = (m, m, S - m - sh, S - m - sh)
    # hard offset shadow, then the tile with its ink outline
    d.rounded_rectangle((box[0] + sh, box[1] + sh, box[2] + sh, box[3] + sh), r, fill=INK)
    d.rounded_rectangle(box, r, fill=INK)
    d.rounded_rectangle((box[0] + o, box[1] + o, box[2] - o, box[3] - o), r - o, fill=SUN)
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    # click ring: green disc with ink outline
    rr = 250
    d.ellipse((cx - rr - 28, cy - rr - 28 + 20, cx + rr + 28, cy + rr + 28 + 20), fill=INK)
    d.ellipse((cx - rr, cy - rr + 20, cx + rr, cy + rr + 20), fill=GREEN)
    # cursor arrow (paper fill, ink outline), tip at the ring centre-left
    tip = (cx - 70, cy - 150)
    pts = [(0, 0), (0, 400), (110, 305), (190, 470), (290, 425), (210, 262), (355, 262)]
    arrow = [(tip[0] + x, tip[1] + y) for x, y in pts]
    d.polygon(arrow, fill=INK)
    inner = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(inner).polygon([(tip[0] + x * 0.86 + 20, tip[1] + y * 0.86 + 26) for x, y in pts], fill=PAPER)
    im.alpha_composite(inner)
    return im


big = art()
sizes = [256, 128, 64, 48, 32, 16]
blobs = []
for s in sizes:
    b = io.BytesIO()
    big.resize((s, s), Image.LANCZOS).save(b, "PNG")
    blobs.append(b.getvalue())

header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries, data = b"", b""
for s, blob in zip(sizes, blobs):
    dim = 0 if s == 256 else s
    entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset + len(data))
    data += blob
out = os.path.join(here, "AppIcon.ico")
open(out, "wb").write(header + entries + data)
big.resize((256, 256), Image.LANCZOS).save(os.path.join(here, "icon-preview.png"))
print("wrote", out)
