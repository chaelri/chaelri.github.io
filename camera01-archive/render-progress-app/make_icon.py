#!/usr/bin/env python3
"""Build icon.icns for Render Progress.app.

Dark-navy rounded square + blue→violet progress pill (72% filled),
tick marks above/below (one per clip slot).
"""
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ICONSET = HERE / "RenderProgress.iconset"
TARGET = HERE / "icon.icns"
ICONSET.mkdir(exist_ok=True)
for f in ICONSET.glob("*.png"):
    f.unlink()

def render(size: int) -> Image.Image:
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(S * 0.225)
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bgd = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / S
        r = int(11 + (5 - 11) * t)
        g = int(20 + (10 - 20) * t)
        b = int(38 + (26 - 38) * t)
        bgd.line([(0, y), (S, y)], fill=(r, g, b, 255))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
    img.paste(bg, (0, 0), mask)
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        [1, 1, S - 2, S - 2], radius=radius - 1,
        outline=(255, 255, 255, 22), width=max(1, S // 256)
    )
    img.alpha_composite(ring)

    pill_h = int(S * 0.18)
    pad_x = int(S * 0.13)
    pad_y = (S - pill_h) // 2
    x0, y0 = pad_x, pad_y
    x1, y1 = S - pad_x, pad_y + pill_h
    pill_r = pill_h // 2

    track = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(track).rounded_rectangle(
        [x0, y0, x1, y1], radius=pill_r,
        fill=(16, 26, 44, 255), outline=(26, 36, 56, 255),
        width=max(1, S // 256),
    )
    img.alpha_composite(track)

    fill_pct = 0.72
    fx1 = int(x0 + (x1 - x0) * fill_pct)
    grad = Image.new("RGBA", (fx1 - x0, pill_h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    STOPS = [(0.0, (59, 130, 246)),
             (0.55, (99, 102, 241)),
             (1.0, (139, 92, 246))]
    def lerp(a, b, t):
        return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    def at(t):
        for i in range(len(STOPS) - 1):
            t0, c0 = STOPS[i]; t1, c1 = STOPS[i + 1]
            if t <= t1:
                lo = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                return lerp(c0, c1, lo)
        return STOPS[-1][1]
    for x in range(grad.width):
        c = at(x / max(1, grad.width - 1))
        gd.line([(x, 0), (x, grad.height)], fill=(*c, 255))
    gm = Image.new("L", grad.size, 0)
    ImageDraw.Draw(gm).rounded_rectangle([0, 0, grad.width - 1, grad.height - 1],
                                         radius=pill_r, fill=255)
    grad.putalpha(gm)
    img.alpha_composite(grad, (x0, y0))

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(
        [x0, y0, fx1, y1], radius=pill_r, fill=(99, 102, 241, 80)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, S // 80)))
    img.alpha_composite(glow)
    img.alpha_composite(grad, (x0, y0))

    tick = (148, 163, 184, 110)
    tw = max(1, S // 256)
    th = int(S * 0.018)
    ya = y0 - int(S * 0.055)
    yb = y1 + int(S * 0.038)
    n = 19
    iw = x1 - x0
    for i in range(n):
        x = x0 + int((i + 0.5) * iw / n)
        draw.line([(x, ya), (x, ya + th)], fill=tick, width=tw)
        draw.line([(x, yb), (x, yb + th)], fill=tick, width=tw)
    return img

SIZES = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
]
hi = render(1024)
for size, name in SIZES:
    (hi if size == 1024 else hi.resize((size, size), Image.LANCZOS)).save(ICONSET / name, "PNG")
subprocess.run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(TARGET)], check=True)
print(f"built {TARGET}")
