#!/usr/bin/env python3
"""px_contrast.py  (Charlie, 2026-11-20)  Real-pixel contrast for text over artwork.
usage: px_contrast.py rects.json notext.png [--large 99] [--pct 97]
  rects.json : the "rects" array from poster-check.js (n,l,t,r,b,fs,c)  [or a {"take":[...]} map -> pass --take a]
  notext.png : screenshot of the same page with ALL text made transparent (inject `*{color:transparent!important}`),
               same size/scale as the rects (use scale 1; for a 2x screenshot pass --scale 2).
Measures the WORST background spot behind each text box (brightest 97th percentile for light text, darkest 3rd for
dark text), WCAG ratio vs the real text colour. Need 4.5 (text < --large px) or 3 (>= --large px). Exit 1 on failure.
Needs only Pillow. Boxes are line boxes, so tall script fonts can reach a neighbouring shape: judge outliers by eye."""
import json,sys
from PIL import Image
def lin(c):
    c/=255.0
    return c/12.92 if c<=.03928 else ((c+.055)/1.055)**2.4
def lum(p): return .2126*lin(p[0])+.7152*lin(p[1])+.0722*lin(p[2])
def pct(v,q):
    v=sorted(v); return v[min(len(v)-1,int(len(v)*q/100))]
a=sys.argv[1:]; opt=lambda k,d: type(d)(a[a.index(k)+1]) if k in a else d
rects=json.load(open(a[0])); 
if isinstance(rects,dict): rects=rects[opt('--take','')]
im=Image.open(a[1]).convert('RGB'); sc=opt('--scale',1); large=opt('--large',99); q=opt('--pct',97)
bad=0
for r in rects:
    box=tuple(int(v*sc) for v in (r['l'],r['t'],r['r'],r['b']))
    vals=[lum(p) for p in im.crop(box).getdata()]
    fg=tuple(int(x) for x in r['c'].split(',')); lf=lum(fg)
    bg=pct(vals,q) if lf>.4 else pct(vals,100-q)
    hi,lo=max(lf,bg),min(lf,bg); ratio=(hi+.05)/(lo+.05); need=3 if r['fs']>=large else 4.5
    ok=ratio>=need; bad+=not ok
    print(f"{'ok  ' if ok else 'FAIL'} {r['n']:14s} {r['fs']:>3}px  {ratio:5.2f}:1  need {need}")
sys.exit(1 if bad else 0)
