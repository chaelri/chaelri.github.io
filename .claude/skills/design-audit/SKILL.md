---
name: design-audit
description: Audit a real page in Claude in Chrome against Charlie's design rules - contrast (every text element, WCAG), type sizes on the x1.618 scale, spacing on the 8px unit, radii, overflow, centred text - using the JS in audit.js. Use before delivering ANY web/HTML design job, and whenever Charlie says "audit", "check the contrast", "check the spacing", or "run the checker on the page". Companion to charlie-design (rules) and its contrast.py (palette check).
---

# design-audit

Contrast is part of the audit, not just spacing and size. Run both.

## Steps
1. Serve the page (Chrome blocks `file://`): `python3 -m http.server <port> --bind 127.0.0.1`, or use Charlie's Live Server (e.g. `http://127.0.0.1:5500/...`). Kill servers you started.
2. Palette first: `python3 .claude/skills/charlie-design/contrast.py paper=#.. ink=#.. primary=#.. shape=#.. accent=#..` (design-time check; fix failing pairs before building).
3. Open the page in Claude in Chrome (reuse the existing tab group, check open tabs first; `tabs_context_mcp` then `navigate`).
4. Run the audit with `javascript_tool`. If the page is served from the repo root (Live Server), load the file in place: `const t = await (await fetch('/.claude/skills/design-audit/audit.js')).text(); eval(t)`. Otherwise read `audit.js` and paste it. It returns a compact JSON string, capped at 25 lines per issue type; slice the arrays before printing if the output truncates. Also compare `document.documentElement.scrollWidth` with `clientWidth` (a `1fr` grid column holding a `pre` needs `minmax(0,1fr)`).
5. For mobile run the same code inside a 390px fixed-position iframe (`resize_window` may not change the viewport): create the iframe, wait for load, then run the file's code with `document` replaced by `iframe.contentDocument` (or paste it into the iframe via `iframe.contentWindow.eval`).
5b. **Always the full run, never a shortened copy (Charlie, 2026-11-12).** Run the real `audit.js` unchanged (copy it next to the page and `fetch` it; do not retype a condensed version, it misses the straddle/painted-background, chip and centring checks). Run it in **every state of the page**: default, and again with each panel, sidebar, popover, menu or tab opened by clicking it, on desktop AND in the 390px iframe. Also check tap targets (every button/input/summary >= 44x44) and that focus-visible rings exist. Report all four passes (desktop default, desktop open, mobile default, mobile open).
6. Fix real issues in the source, reload, re-run until clean. Report what passed and what was fixed.

## What it checks
- **CONTRAST**: every text element, effective background (alpha-composited ancestors, opacity), WCAG 4.5:1 small / 3:1 large (>=24px or >=18.66px bold). Text over a background image is listed under CHECK-BY-EYE: screenshot it and judge the worst spot, or put a solid shape behind it.
- **SIZE off x1.618 scale**: font sizes not on the scale (web rem steps or slide px steps).
- **SPACING off 8px unit**: padding, row/column gap, margin-top/bottom not a multiple of 8.
- **RADIUS off scale**: corner radii outside 8/13/21/34 + pill.
- **STRADDLES backgrounds / painted bg differs**: samples the real painted background under each text (stacking order, so sibling shapes count) and flags text that crosses a shape edge or sits on a different colour than its ancestors say. Fix by moving the text fully onto one background or giving it a solid shape.
- **OVERFLOW**: anything wider than the viewport.
- **FLUSH (content touches the edge of its filled box)**: text or a button closer than 8px to an edge of a filled box (tinted row/cell, card, bubble, panel) where the fill ends against a different colour. Added 2026-11-12 after Charlie spotted a selected table row whose tint ended exactly at the text and at the "Open chat" button. **Why it was missed:** the spacing check only flags non-zero values that are not multiples of 8, so `padding: 0` passed; and the audit only samples what is inside the viewport, so a table below the fold was skipped. Both are fixed (the check scrolls each candidate into view). **Lesson: a check must be proven on the known bug before it is trusted:** re-create the defect (e.g. inject `padding:0`), run the audit, and confirm it flags it; only then does "0 issues" mean anything.
- **Interaction states are part of the page**: tinted/selected/hover/active rows, open panels and sidebars. Put the page in each state (click it, add the class) and run the audit in that state, then zoom a screenshot on the edges of every filled box and look at them by eye. An audit on the default state alone says nothing about states you never opened.
- Also look at native form controls (`input[type=color]`, range, checkbox): style the inner swatch/thumb too, or the browser's square default shows inside a round frame.
- **NOT CENTRED**: centred text whose text box is off its container's centre by > 2px.

## Rules for interpreting
- Intentional "wrong" demos: give them class `bad`/`fail` or `data-audit-skip` so they are skipped; never silence a real failure.
- Fix a failing contrast pair by darkening the darker or lightening the lighter colour (check with `contrast.py --pair`), never by enlarging the text.
- Common real bug: a paper/white panel inside a dark section inherits white text. Set the panel's own `color`.
- Decorative text still counts. Opacity on small text lowers contrast; avoid it on captions.
- Spacing and size are strict (see charlie-design sections 3 and 4): treat SIZE/SPACING/RADIUS lines as defects unless deliberate (say which).
