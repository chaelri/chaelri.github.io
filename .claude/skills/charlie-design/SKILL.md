---
name: charlie-design
description: Charlie's own graphic-design system (from his Graphic Design Workshop deck). Use for ANY visual output - web page, UI, slide deck, pptx, poster, graphic, README banner - and whenever Charlie says "maganda", "modern", "ayaw ko ng bulok/AI-looking", "design this", or asks for a presentation/page. Defines RULES (color roles, type roles, spacing, hierarchy, shapes, effects, checklist), not a fixed theme. ALWAYS ask Charlie for the mood first, then pick the palette, fonts and shape style yourself from that mood. Never reuse the workshop sample look by default.
---

# Charlie's Design System

Source: Charlie's "Graphic Design Workshop" (58 slides, made by hand, no AI; Canva `DAFyH2pH9bo`). This is his taste. The goal is work that looks **human-designed**: confident type, warm paper background, flat colour blocks, ink outlines, hand-drawn marks. NOT: grey slabs, gradient-everything, emoji-as-decoration, symmetrical template cards, kids/cartoon styling, or the "AI deck" look (rounded white cards on pastel + centered everything).

Written fallback + live demos: `design-system/` (open `design-system/index.html`, published at `/design-system/`). All of its content lives in `design-system/system-data.js`. **When Charlie adds or changes a rule, update BOTH this file and `design-system/system-data.js`**, then commit + push.

## 0. Ask the mood first (mandatory)

This system gives **rules, not a theme**. Before designing anything, ask Charlie for the mood/subject unless he already stated it in the request. Ask with one short question (AskUserQuestion, 3-4 mood options + Other), for example: calm/soft, bold/loud, playful, elegant/luxury, techy/dark, warm/earthy, retro, minimal. Also ask what the piece is about if the subject is unclear.

Then, from the mood + subject, **you choose and state in one line**: the palette (mapped to the roles in section 1), the font pair (by role, section 2) and the shape style (flat / outlined / soft / glass, section 7). **Mood only changes color, fonts and shape style. Spacing and size are strict and never change with the mood** (sections 3, 4 and 6 apply in full every time). Do not copy the workshop sample (cream + green + mustard + rust, Glacial/Outfit, ink outlines + pills) unless Charlie asks for "the workshop look" or the mood genuinely fits. Two pieces in a row should not look like the same theme. Charlie can correct the pick afterwards.

Scope note: `house-style` (navy/Nunito/pink) is the devo-app look only. Everything else uses this skill.

## 1. Color = roles, not values

A piece uses **3-4 colors + ink**, each with a job. The hex values come from the mood and subject, never from a fixed list.

| Role | Job | Constraint |
|---|---|---|
| paper | background | warm/neutral tint matched to the mood; never pure white, or flat grey unless the mood is cold-minimal |
| ink | text + outlines on light | a dark tint of the palette, never `#000` |
| primary | brand color, highlight words, dark backgrounds | one hue; the biggest color area |
| shape | big shapes, highlight blocks | second hue or a tint of the primary |
| accent | the spice | one small thing per layout, strong contrast to the rest |
| on-dark | text on primary/ink | usually white or paper |
| mark-red | the "wrong" X mark only | fixed meaning, any red |

Rules:
- Choose the palette by colour theory (monochromatic, analogous, complementary) from the **mood**, or from the subject/photo when there is one. Say the 3-4 hex values in one line before building.
- Paper + ink + primary + shape + accent is the *structure*; the hues are free. Dark mode: primary or ink as background, light text.
- Re-check contrast after choosing (section 6). Neon/glitch (cyan, magenta, white) only on black and only as a deliberate effect.
- **Sample, not default:** the workshop set was paper `#E9E4D9`, ink `#251F1B`, green `#488162`, mustard `#E3BE53`, rust `#A8341C`. Another sample: baptism deck paper `#F1EEE6`, ink `#14262B`, teal `#1F6B77`, aqua `#A9D8DC`, coral `#C4623B`. Use them only to see how roles map; never as the answer.

## 2. Typography

- **Fonts are picked by role, not by name, and chosen from the mood.** One display/body family, optionally one accent. Geometric sans = clean/modern, humanist sans = friendly, serif display = elegant/editorial, rounded = playful, mono = techy. Pick a pair that fits and name it in your one-line pick.
- **Display/body:** any family with Bold + Regular weights that suits the mood. Fallback to a system font of the same class.
- **Accent (optional):** handwriting, italic serif, mono or a second display, small, for annotations only; paired with a hand-drawn arrow if handwriting.
- A serif as main voice is fine when the mood is elegant; otherwise use it only as deliberate contrast.
- **For pptx/Office files use a font installed on Charlie's PC** (known installed: Outfit, Caveat). Never leave a deck in a font that is not installed on his machine.
- Workshop sample, for reference only: Glacial Indifference (fallback Outfit) + Lemon Tuesday (fallback Caveat).
- Know the 3 classifications (display, handwriting, monospace) and 3 strokes (sans, serif, slab); use max 2 families per piece.
- **Hierarchy through weight**: bold key words against regular text; weight contrast beats colour contrast.
- Headings are **bold and tight** (workshop style is lowercase, e.g. "fix 2 spacing issues"; lowercase is a choice, not a requirement). A highlighted word (green or mustard text, or a mustard block behind it) is optional: "2 types of **character spacing**".
- Small labels: UPPERCASE, bold, wide letter-spacing, for real labels only (column heads, buttons, captions that carry information). Never as a decorative chip (see section 6).
- Fonts differ in apparent size at the same point size: judge optically, not by number.

## 3. Type scale = golden ratio (x1.618)

`bigger = x1.618`, `smaller = /1.618`. **One ratio for everything:** font sizes AND corner radii step by x1.618 (radii e.g. 8 / 13 / 21 / 34 px, plus full pill/circle); pick sizes from the scale, not from habit (no 11/12/13/14/15 ladders). From a 100 base: 100 -> 61.8 -> 38.2 -> 23.6 -> 14.6 -> 9. Slide-scale example (px at 1920): 160 / 99 / 61 / 38 / 23 / 14. Use 3 steps per layout at most. Contrast of size is the point: **BIG next to smol**. Never mid-size everything.

## 4. Spacing (the "spacing matters" rules)

1. **Centre the text inside its container**, both axes, using optical centring (descenders and tight line-height shift the box; nudge until it looks centred).
2. **Centre the background shape inside its frame** (a block behind text gets equal margins on all sides).
3. **Spacing is strict.** Every gap, padding and margin is a multiple of the 8px unit (0.1in in pptx), stepping up by x1.618 where a bigger step is needed. Equal things get equal gaps. After it measures right, still check by eye and nudge optically (centring), then re-measure.
4. Letter-spacing: wide for UPPERCASE labels, slightly tight for big display text. Line-spacing: 0.9-1.0 for 2-3 line display headings, 1.3-1.4 for body.
5. **Keep phrases together on a line.** Never let a line break split a thought ("taking students / to the next level", not "taking      to the / students   next level"). Break lines by meaning; never justify text.
6. Never let lines collide or overlap (the fix for stacked headings is leading, not smaller text).
7. White space is a feature: leave a clear margin (>= 6% of the shortest side) and don't fill every corner.
8. **Balance (Charlie, 2026-11-13): always think about balance. What he notices first is uneven heights.** Side-by-side panels/cards share ONE height (grid `align-items:stretch`, panel `display:flex;flex-direction:column`, primary action `margin-top:auto`, media centred in the spare room). Spread visual weight evenly across columns; never leave a tall column next to a short one with dead space under it. When a tool/app has several panels, fit them in one desktop viewport so everything reads at a glance.
9. **No dead space under the content (Charlie, 2026-11-13).** A single-screen tool/page fills the viewport: wrapper `min-height:100vh` (with the 80% density `zoom`, use `calc(100vh / .8)`), header on top, panels take the rest (`flex:1`, grid `1fr` row, `minmax(0,1fr)`). Never leave an empty band under the last row. Spare room goes INSIDE the panels: media sits in a viewer box that fills the panel (video centred, contain), controls spread with `justify-content:space-between`, top and bottom margins equal. Tune column fractions so no column has a big empty gap. Verify on the real screen (1080p) in Chrome: panel bottoms ~ viewport bottom minus the page padding.

## 5. Ratio and canvas

- Square poster 1:1 (1000x1000 or 3000x3000 @ 300 dpi), portrait 4:5 / 9:16 stories, landscape 16:9 slides.
- Converting a poster to portrait means **re-flowing** the layout (recompose, stack), never stretching or cropping text.
- Decide the aspect ratio first, then compose.

## 6. Clarity beats decoration

- "Don't exchange clarity with design." If an effect hurts reading, remove the effect.
- Text on a busy photo needs a solid shape behind it (circle or rounded rectangle in paper/white/mustard), not a faint overlay.
- **Contrast & accessibility (check every chosen palette).** Ratio = (L_light + 0.05) / (L_dark + 0.05), L = relative luminance 0-1 (WCAG); 1:1 identical, 21:1 black on white. Text >= **4.5:1**; large text (>= 24px, or 19px bold) >= **3:1**; icons, outlines and button edges >= 3:1; aim for 7:1 (AAA) on long body text. Hue is not contrast: judge brightness, not color. Never use color alone for status (add a label/icon/underline). Since the mood picks the palette, compute the ratio for every text/background pair (ink on paper, light on primary, text on shape, accent on paper) before building; if a pair fails, darken the darker color or lighten the lighter one, never enlarge the text to dodge it. On photos/gradients measure the worst spot or use a solid shape. Body >= 16px, line-height >= 1.4, tap targets >= 44px, visible focus state. **Run the checker: `python3 .claude/skills/charlie-design/contrast.py paper=#.. ink=#.. primary=#.. shape=#.. accent=#..`** (WCAG math locally, cross-checked against the WebAIM API; exit 1 on a failing pair; `--pair FG BG` for one pair, `--offline` to skip the API). Live checker for people: `design-system/` section 07. When unsure, webaim.org/resources/contrastchecker.
- **No mini label chips (AI slop).** No tiny uppercase pills/tags above or below a title or in a hero: version tags ("DESIGN SYSTEM · V1"), "UPDATED <date>", "14 CHAPTERS", section kickers/eyebrows, decorative status dots. They add nothing the reader needs. A label stays only when the person must act on it or tell things apart by it: a button, a real status in a data row, a name on a photo, a column head. Title + content + the shortest real label, nothing else.
- One focal point per layout; the eye should know where to start in under a second.
- Group related items; separate unrelated items by at least 2 spacing units.

## 7. Shapes (the graphic vocabulary)

- **Circles**: background elements (large, partly off-canvas, mustard/green/white), small dots as bullets, a filled circle as the background for a short text.
- **Squares/rectangles**: parallel stripes (decorative lines), tables, flat colour blocks behind text.
- **Rounded rectangles**: chat bubbles, buttons, text backgrounds, real status tags in data rows, 2px ink outline. Not decorative chips.
- **Shape style follows the mood:** flat fills (workshop), outlined with hard offset shadow (`4px 4px 0 ink`, playful/bold), soft rounded + soft shadow (calm/friendly), sharp + thin lines (elegant/minimal), or liquid glass (section 8). Pick one and keep it consistent in the piece.
- Workshop signature details (use when the mood is playful/hand-made): ink outline (2px), name labels attached to subjects only when they actually name someone (`MAUI`, `KD`, `CHARLIE`), hand-drawn green check / red X, hand-drawn arrows, halftone dots and diagonal stripes inside comic-style panels, faint grid-paper background texture, small logo mark bottom-left.

## 8. Effects (use one per piece, on purpose)

liquid glass (second style, see below), clip-mask (photo cut into a circle/blob shape), parallax (subject cut-out overlapping the heading), grain (subtle noise over paper/dark photos), paper design (torn-paper edges on photos), glitch (white + cyan + magenta offsets, on black), neon (blurred outline text, on black), text designs (repeated text, outline, curved text; **outline text = `-webkit-text-stroke` >= 3px + `paint-order: stroke fill` with the fill = the background colour, never `color: transparent`**: variable/modern fonts have overlapping contours that show as stray lines inside the letters). Never stack more than one effect family.

**Liquid glass (Apple-style, a second style, not a lapse in the flat one):** translucent surfaces with backdrop blur (about 16-32px) + saturate, white tint at 8-20% alpha, 1px light inner border (white 25-40%), a soft highlight on the top edge, gentle soft shadow. Gradients and blur are allowed here, that is the point. Needs something colourful behind it to refract. Keep text contrast >= 4.5:1 (darker tint or solid fallback behind text). Don't mix glass with the flat/ink-outline style in the same component.

## 9. Imagery

Vectors/illustrations (flat, one palette) or real photos; cut-outs with a thick paper/white edge; background photos from Pexels with the colour theme matched. Photos get rounded corners or a mask shape, never a default rectangle with a shadow. Never use stock emoji as decoration; emoji only if the content itself is an emoji.

## 10. Layout recipes

Structure only. Colors, fonts and shape style come from the chosen mood, not from these descriptions.

- **Title slide**: huge lowercase two-line title (bold, line-height 0.9), one plain subtitle line, one big circle partly off-canvas, tiny logo bottom-left.
- **Section slide**: green full-bleed background, white lowercase title, 2-3 overlapping circles bottom-right.
- **Comparison (do/don't)**: two equal samples side by side, hand-drawn red X over the wrong one and green check over the right one, short caption under each.
- **Content slide**: one idea. Lowercase heading with a highlighted word at top-left, content in a flat colour block or free on paper, ONE accent annotation in handwriting.
- **List**: numbered circles or plain rows, thin ink dividers, 4-5 items max per slide.
- **Photo grid**: mix of sizes (one big, rest small), consistent gutters, rounded corners, one colour-block tile.
- **Poster (comic panel)**: grid paper background, angled/clipped panels with halftone or stripe fills, name labels on subjects, bordered rounded rectangles for the headline and date/venue.

## 11. Web / UI translation

```css
:root{
  /* palette: fill from the mood (section 0), roles from section 1 */
  --paper:/*bg*/; --ink:/*dark text*/; --primary:/*brand*/; --shape:/*big shapes*/; --accent:/*spice*/; --on-dark:#fff;
  --step-0:1rem; --step-1:1.618rem; --step-2:2.618rem; --step-3:4.236rem; --step-4:6.854rem; /* x1.618 */
  --u:.5rem; /* spacing unit; use multiples */
  --font:/*display+body by role*/, system-ui, sans-serif; --accent-font:/*optional*/;
}
html{zoom:.8} /* house density, see below */
body{background:var(--paper);color:var(--ink);font:400 var(--step-0)/1.4 var(--font)}
h1,h2{font-weight:700;line-height:.95;letter-spacing:-.01em} /* lowercase only if the mood suits */
.label{font:700 .75rem var(--font);letter-spacing:.25em;text-transform:uppercase}
.hl{background:var(--shape);padding:0 .2em}          /* highlight block behind one word */
.pill{border-radius:999px;padding:.2em .8em}           /* outline/shadow per shape style */
```
**House density = 80% (Charlie, 2026-11-13):** every web page renders at what Chrome shows at 80% zoom, while the browser stays at 100%. Author sizes and spacing exactly as in sections 3-4 (16px body, 8px unit), then add `html{zoom:.8}` (the second line of the CSS above). Never ask Charlie to change browser zoom: Chrome keeps one zoom per site, so zooming one page on chaelri.github.io also resizes devo and every other page on that host. Wide screens therefore get larger side margins by default; keep `max-width` as authored. **Desktop only:** wrap it as `@media(min-width:1024px){html{zoom:.8}}`. Phones stay at 100%, because 0.8 would shrink body text to about 12.8px. Accessibility minimums (>= 16px body) apply to the authored size, before the 0.8.

**Mobile is a requirement, not a nice-to-have (Charlie + Kuya, 2026-11-13).** Both use an iPhone 15 Pro Max, so the viewport is usually **430px** (about 420px with browser chrome); it must work at 360-430px and every width up. Rules: no `zoom` below 1024px; 16px gutters; no sideways scroll; tap targets >= 44px; header controls wrap into clean rows (never a ragged 3-row stack); **tables never drop columns on phones** (do not hide Before/After): turn each row into a two-line card (name + main value on line 1, muted `was <before>` + any extra value on line 2) using grid areas; show a label on any value whose column header is gone. Test every web page at 430px and 360px before delivering.

Mobile-first, 16px side gutter, primary/shape as the only large colour areas. Button and card treatment follows the chosen shape style (e.g. outlined pills with hard offset shadow `4px 4px 0 var(--ink)` and hover shift for playful; soft filled for calm; glass per section 8).

## 12. pptx / python-pptx / Canva notes

- 13.333 x 7.5 in, background = the chosen paper colour. Set run fonts to the chosen display font only if installed (else Outfit); PowerPoint falls back to Calibri if not installed, so mention it.
- Build shapes (circles, rounded rects) with no outline except the 2px ink outline where the style calls for it. **No shadows: `shape.shadow.inherit=False` is not enough in LibreOffice; also delete the shape's `p:style` element** (`el.remove(el.find(qn('p:style')))`).
- List rows: put the divider, the dot and the text in one cell; center the dot on the text box's vertical middle; leave >= 0.1in between divider and 2-line text. Heading boxes must end before the next column starts (give the heading a width, let it wrap). Never place text over a circle unless the contrast is >= 3:1 (>= 4.5:1 small).
- Verify by rendering: `soffice --headless --convert-to pdf` then look at it before delivering.
- Lay out on a 12-col grid with 0.9in side margins; align text boxes to the same left edge.

## 13. Pre-flight checklist (run before delivering)

0. **Asked the mood** (or it was stated) and stated the palette + fonts + shape style in one line. Not the workshop sample unless requested or truly fitting.
1. Background is the chosen paper (or primary/ink on purpose), not default white/grey.
2. Only the chosen palette; <= 4 colours + ink, each with a role.
3. <= 2 font families picked by role from the mood; headings bold and tight.
4. Font sizes AND corner radii follow x1.618 exactly (no off-scale sizes); clear BIG vs smol contrast; no more than 3 sizes per layout.
5. Text is centred in its containers; every gap is on the 8px unit and equal for equal elements, and looks right by eye; no phrase split across lines; nothing collides.
6. **`contrast.py` run on the chosen palette with no failing pair**, and contrast >= 3:1 (large) / 4.5:1 (small). Text on photos has a solid shape behind it.
7. Shapes are flat, or deliberately liquid glass (never half and half); circles/rects/rounded rects used with purpose; no emoji decoration.
8. **Balanced:** side-by-side panels share one height, weight is even across columns, and the content fills the viewport with no dead band underneath. One focal point; one accent annotation at most; plenty of white space; **no decorative mini label chips** (eyebrow, version, date, count, kicker).
9. Looks designed for THIS subject and mood, with one consistent shape style. If it looks like a generic template or like the last piece, redo it.
10. **Verified in Claude in Chrome (mandatory for every web/HTML design job).** Open the real page and check it against rules 3-5 and 8 before delivering; never ship on code review alone.
    - Chrome blocks `file://`: serve the folder (`python3 -m http.server <port> --bind 127.0.0.1`), navigate to it, kill the server after.
    - Run a JS audit: horizontal overflow, font sizes and radii on the x1.618 scale, text centred in pills/bars/circles (range rect vs box), collisions, equal card heights, aligned dividers/baselines, even table columns, row labels not wrapping.
    - Take real screenshots of every section and look at them (uneven image sizes, cramped legends and cramped label-to-cell gaps only show by eye).
    - `resize_window` may not change the viewport: test mobile (430px = Charlie and Kuya's iPhone 15 Pro Max, and 360px; 16px gutters, no sideways scroll, nothing hidden that desktop shows) in a fixed-position iframe and measure inside it.
    - Fix, re-check, then report what passed and what was fixed.
