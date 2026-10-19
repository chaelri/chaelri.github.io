"""Builds AppIcon.ico from the Mac app's Resources/AppIcon.icns (same artwork on both).

The .icns already holds PNGs at 32-1024 px; an .ico can carry PNG entries directly, so this
needs nothing beyond the standard library:  python make-icon.py
"""
import os
import struct

here = os.path.dirname(os.path.abspath(__file__))
icns = open(os.path.join(here, "..", "Resources", "AppIcon.icns"), "rb").read()
assert icns[:4] == b"icns"

pngs = {}
i = 8
while i < len(icns):
    n = struct.unpack(">I", icns[i + 4:i + 8])[0]
    body = icns[i + 8:i + n]
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        w = struct.unpack(">I", body[16:20])[0]
        pngs.setdefault(w, body)
    i += n

sizes = [s for s in (256, 128, 64, 32) if s in pngs]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries, blobs = b"", b""
for s in sizes:
    blob = pngs[s]
    dim = 0 if s == 256 else s   # 0 means 256 in an ICONDIRENTRY
    entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset + len(blobs))
    blobs += blob

out = os.path.join(here, "AppIcon.ico")
open(out, "wb").write(header + entries + blobs)
print(f"wrote {out} ({', '.join(map(str, sizes))} px)")
