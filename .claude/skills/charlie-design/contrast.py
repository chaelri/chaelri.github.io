#!/usr/bin/env python3
"""Contrast checker for charlie-design palettes (WCAG 2.x).

Usage:
  contrast.py paper=#F1EEE6 ink=#14262B primary=#1F6B77 shape=#A9D8DC accent=#C4623B
  contrast.py --pair 251F1B E9E4D9
  contrast.py --json palette.json        # {"paper":"#...","ink":"#..."}
Options:
  --pair FG BG   check one text/background pair
  --offline      skip the WebAIM cross-check
  --on-dark HEX  light text colour for dark fills (default #FFFFFF)

With roles, it checks the pairs the skill requires:
  ink on paper, ink on shape, on-dark on primary, on-dark on ink,
  primary on paper (text), accent on paper (text), on-dark on accent.
Pairs that need roles you did not give are skipped.
Exit code 1 if any required text pair is below 4.5:1 (marked FAIL).
Only the two hex codes are sent to webaim.org (cross-check), nothing else.
"""
import json, re, sys, urllib.request

HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")


def norm(h):
    m = HEX.match(h.strip())
    if not m:
        sys.exit(f"bad hex: {h!r} (use 6 digits, e.g. #E9E4D9)")
    return m.group(1).upper()


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    x, y = lum(a), lum(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def webaim(fg, bg):
    url = f"https://webaim.org/resources/contrastchecker/?fcolor={fg}&bcolor={bg}&api"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return float(json.load(r)["ratio"])
    except Exception:
        return None


def grade(r):
    if r >= 7:
        return "AAA"
    if r >= 4.5:
        return "AA"
    if r >= 3:
        return "large only"
    return "FAIL"


def check(label, fg, bg, offline):
    r = ratio(fg, bg)
    g = grade(r)
    note = ""
    if not offline:
        w = webaim(fg, bg)
        if w is None:
            note = "  (webaim unreachable)"
        elif abs(w - r) > 0.1:
            note = f"  (webaim says {w}, differs)"
        else:
            note = "  (webaim ok)"
    print(f"{label:<28} #{fg} on #{bg}  {r:5.2f}:1  {g}{note}")
    return r >= 4.5


def main(argv):
    offline = "--offline" in argv
    argv = [a for a in argv if a != "--offline"]
    on_dark = "FFFFFF"
    if "--on-dark" in argv:
        i = argv.index("--on-dark")
        on_dark = norm(argv[i + 1])
        del argv[i:i + 2]

    if argv[:1] == ["--pair"]:
        if len(argv) != 3:
            sys.exit("usage: contrast.py --pair FG BG")
        ok = check("pair", norm(argv[1]), norm(argv[2]), offline)
        return 0 if ok else 1

    roles = {}
    if argv[:1] == ["--json"]:
        roles = {k: norm(v) for k, v in json.load(open(argv[1])).items()}
    else:
        for a in argv:
            if "=" not in a:
                sys.exit(__doc__)
            k, v = a.split("=", 1)
            roles[k.strip()] = norm(v)
    if not roles:
        sys.exit(__doc__)
    roles.setdefault("on-dark", on_dark)

    # (label, fg role, bg role): the pairs the skill requires
    pairs = [
        ("ink on paper", "ink", "paper"),
        ("ink on shape", "ink", "shape"),
        ("on-dark on primary", "on-dark", "primary"),
        ("on-dark on ink", "on-dark", "ink"),
        ("primary text on paper", "primary", "paper"),
        ("accent text on paper", "accent", "paper"),
        ("on-dark on accent", "on-dark", "accent"),
    ]
    bad = 0
    ran = 0
    for label, f, b in pairs:
        if f in roles and b in roles:
            ran += 1
            if not check(label, roles[f], roles[b], offline):
                bad += 1
    if not ran:
        sys.exit("no pairs to check: give at least two of paper, ink, primary, shape, accent")
    print()
    if bad:
        print(f"{bad} pair(s) below 4.5:1. Fine for large text (>=3:1) or icons/outlines only; "
              "for body text darken the darker colour or lighten the lighter one.")
        return 1
    print("all pairs pass 4.5:1")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
