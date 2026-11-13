"""Generates the gif-maker app icons (PNG + ICO) and the SVG sources. Run: python make_icons.py
Design: dark paper tile, mint portrait screen (the 135x240 keyboard screen) with a play triangle, and a mint progress ring (the loop)."""
from PIL import Image, ImageDraw
import math, os

PAPER = (14, 18, 24); MINT = (79, 227, 161)
here = os.path.dirname(os.path.abspath(__file__))
SS = 4  # supersampling

def draw_icon(size, rounded, ring=True, scale=1.0):
    s = size * SS; k = s / 512.0
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    if rounded: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=112 * k, fill=PAPER + (255,))
    else: d.rectangle([0, 0, s, s], fill=PAPER + (255,))
    c = 256 * k
    def P(v): return c + (v - 256) * k * scale
    if ring:
        r, w = 196, 20
        ro, ri = r + w / 2, r - w / 2   # donut = outer pie minus inner disc
        d.pieslice([P(256 - ro), P(256 - ro), P(256 + ro), P(256 + ro)], start=-90, end=180, fill=MINT + (255,))
        d.ellipse([P(256 - ri), P(256 - ri), P(256 + ri), P(256 + ri)], fill=PAPER + (255,))
        for ang in (-90, 180):  # round caps
            x = 256 + r * math.cos(math.radians(ang)); y = 256 + r * math.sin(math.radians(ang)); rr = w / 2
            d.ellipse([P(x - rr), P(y - rr), P(x + rr), P(y + rr)], fill=MINT + (255,))
    sw, sh = (160, 320) if ring else (210, 380)
    d.rounded_rectangle([P(256 - sw / 2), P(256 - sh / 2), P(256 + sw / 2), P(256 + sh / 2)], radius=28 * k * scale, fill=MINT + (255,))
    t = 46 if ring else 62
    d.polygon([(P(256 - t * 0.55), P(256 - t)), (P(256 - t * 0.55), P(256 + t)), (P(256 + t * 0.95), P(256))], fill=PAPER + (255,))
    return img.resize((size, size), Image.LANCZOS)

out = lambda n: os.path.join(here, n)
draw_icon(192, True).save(out('icon-192.png'))
draw_icon(512, True).save(out('icon-512.png'))
draw_icon(512, False).save(out('icon-maskable-512.png'))          # full bleed, content already inside the 80% safe zone
draw_icon(180, False).save(out('apple-touch-icon.png'))           # iOS rounds it itself
draw_icon(32, True, ring=False).save(out('favicon-32.png'))
fav = [draw_icon(n, True, ring=False) for n in (16, 32, 48)]
fav[2].save(out('favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], append_images=fav[:2])

RING = 'stroke-dasharray="923.6 307.9"'
open(out('icon.svg'), 'w').write(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#0E1218"/>
<circle cx="256" cy="256" r="196" fill="none" stroke="#4FE3A1" stroke-width="20" stroke-linecap="round" {RING} transform="rotate(-90 256 256)"/>
<rect x="176" y="96" width="160" height="320" rx="28" fill="#4FE3A1"/>
<path d="M230.7 210v92l71.3-46z" fill="#0E1218"/>
</svg>
''')
open(out('favicon.svg'), 'w').write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#0E1218"/>
<rect x="151" y="66" width="210" height="380" rx="28" fill="#4FE3A1"/>
<path d="M221.8 194v124l83.9-62z" fill="#0E1218"/>
</svg>
''')
print('icons written')
