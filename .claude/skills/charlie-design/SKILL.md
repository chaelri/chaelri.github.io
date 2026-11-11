---
name: charlie-design
description: Charlie's own graphic-design system (from his Graphic Design Workshop deck). Use for ANY visual output - web page, UI, slide deck, pptx, poster, graphic, README banner - and whenever Charlie says "maganda", "modern", "ayaw ko ng bulok/AI-looking", "design this", or asks for a presentation/page. Defines palette, type, spacing, hierarchy, shapes, effects and a pre-flight checklist. Follow ALL rules; do not fall back to generic defaults.
---

# Charlie's Design System

Source: Charlie's "Graphic Design Workshop" (58 slides, made by hand, no AI; Canva `DAFyH2pH9bo`). This is his taste. The goal is work that looks **human-designed**: confident type, warm paper background, flat colour blocks, ink outlines, hand-drawn marks. NOT: grey slabs, gradient-everything, emoji-as-decoration, symmetrical template cards, kids/cartoon styling, or the "AI deck" look (rounded white cards on pastel + centered everything).

Written fallback + live demos: `design-system/` (open `design-system/index.html`, published at `/design-system/`). All of its content lives in `design-system/system-data.js`. **When Charlie adds or changes a rule, update BOTH this file and `design-system/system-data.js`**, then commit + push.

Scope note: `house-style` (navy/Nunito/pink) is the devo-app look only. Everything else uses this skill.

## 1. Tokens

**The palette below is the workshop default, NOT mandatory.** What is mandatory is the structure: 3-4 colors + ink, a warm/neutral paper background, one big shape color, one accent, and the contrast rules. For any project with its own subject (an invitation, a brand, a photo set), derive a matching palette from it and map it onto the same roles (paper / ink / primary / secondary-shape / accent). Example: the baptism deck uses paper `#F1EEE6`, ink `#14262B`, teal `#1F6B77` (primary), aqua `#A9D8DC` (shapes/highlight on dark), coral `#C4623B` (accent), taken from the teal invitation. Always re-check contrast after swapping colors.

| Token | Hex | Use |
|---|---|---|
| paper | `#E9E4D9` | default background (warm cream, never pure white) |
| ink | `#251F1B` | text and outlines on light (never `#000`) |
| green | `#488162` | primary brand, highlight words, dark backgrounds |
| mustard | `#E3BE53` | secondary, highlight blocks, big shapes |
| rust | `#A8341C` | accent, sparingly (one small thing per layout) |
| white | `#FFFFFF` | text on green, panels/cards on paper |
| mark-red | `#E35353` | the "wrong" X marks only |

Rules: pick 3-4 colours per piece and **stick to the theme** (paper + ink + green + mustard is the default; rust is the spice). When a design is built around a photo/subject, derive the palette from it (e.g. teal invitation -> teal + gold + paper) but keep the same structure. Dark mode: green (`#488162`) or ink background, white text. Neon/glitch (cyan `#00F0FF`, magenta `#FF00E5`, white) only on black and only as a deliberate effect.

## 2. Typography

- **Fonts are picked by role, not by name.** One display/body family, optionally one handwriting accent. The workshop pick is below; any font that does the same job is fine.
- **Display/body: Glacial Indifference** (Bold + Regular only). Fallback when not installed: **Outfit** (Google Fonts), then system sans. Pair with at most one accent. **For pptx/Office files use Outfit** (Charlie's PC has Outfit + Caveat installed; Glacial Indifference is not installed, so Office/LibreOffice would swap in an ugly default). Never leave a deck in a font that is not installed on his machine.
- **Accent/handwriting: Lemon Tuesday** for little annotations ("pro tip!", "when it started"), fallback **Caveat**. Small, slanted, often green or rust, paired with a hand-drawn arrow.
- Serif (Playfair Display) only as a deliberate contrast, never the main voice.
- Know the 3 classifications (display, handwriting, monospace) and 3 strokes (sans, serif, slab); use max 2 families per piece.
- **Hierarchy through weight**: bold key words against regular text; weight contrast beats colour contrast.
- Headings are **bold and tight** (workshop style is lowercase, e.g. "fix 2 spacing issues"; lowercase is a choice, not a requirement). A highlighted word (green or mustard text, or a mustard block behind it) is optional: "2 types of **character spacing**".
- Small labels: usually UPPERCASE, bold, wide letter-spacing; follow what suits the layout.
- Fonts differ in apparent size at the same point size: judge optically, not by number.

## 3. Type scale = golden ratio (x1.618)

`bigger = x1.618`, `smaller = /1.618`. **One ratio for everything:** font sizes AND corner radii step by x1.618 (radii e.g. 8 / 13 / 21 / 34 px, plus full pill/circle); pick sizes from the scale, not from habit (no 11/12/13/14/15 ladders). From a 100 base: 100 -> 61.8 -> 38.2 -> 23.6 -> 14.6 -> 9. Slide-scale example (px at 1920): 160 / 99 / 61 / 38 / 23 / 14. Use 3 steps per layout at most. Contrast of size is the point: **BIG next to smol**. Never mid-size everything.

## 4. Spacing (the "spacing matters" rules)

1. **Centre the text inside its container**, both axes, using optical centring (descenders and tight line-height shift the box; nudge until it looks centred).
2. **Centre the background shape inside its frame** (a block behind text gets equal margins on all sides).
3. Spacing is judged by eye: if it looks good it is good. 8px (0.1in) multiples are a handy start, not a law.
4. Letter-spacing: wide for UPPERCASE labels, slightly tight for big display text. Line-spacing: 0.9-1.0 for 2-3 line display headings, 1.3-1.4 for body.
5. **Keep phrases together on a line.** Never let a line break split a thought ("taking students / to the next level", not "taking      to the / students   next level"). Break lines by meaning; never justify text.
6. Never let lines collide or overlap (the fix for stacked headings is leading, not smaller text).
7. White space is a feature: leave a clear margin (>= 6% of the shortest side) and don't fill every corner.

## 5. Ratio and canvas

- Square poster 1:1 (1000x1000 or 3000x3000 @ 300 dpi), portrait 4:5 / 9:16 stories, landscape 16:9 slides.
- Converting a poster to portrait means **re-flowing** the layout (recompose, stack), never stretching or cropping text.
- Decide the aspect ratio first, then compose.

## 6. Clarity beats decoration

- "Don't exchange clarity with design." If an effect hurts reading, remove the effect.
- Text on a busy photo needs a solid shape behind it (circle or rounded rectangle in paper/white/mustard), not a faint overlay.
- Contrast: text >= **3:1** if large (>= 24px, or 19px bold), >= **4.5:1** if small. On light background use ink; on dark use white. Do not put green text on mustard or mustard on white for small text (fails). When unsure, use a contrast checker (webaim.org/resources/contrastchecker).
- One focal point per layout; the eye should know where to start in under a second.
- Group related items; separate unrelated items by at least 2 spacing units.

## 7. Shapes (the graphic vocabulary)

- **Circles**: background elements (large, partly off-canvas, mustard/green/white), small dots as bullets, a filled circle as the background for a short text.
- **Squares/rectangles**: parallel stripes (decorative lines), tables, flat colour blocks behind text.
- **Rounded rectangles**: chat bubbles, pill labels/tags, buttons, text backgrounds, 2px ink outline.
- Workshop style is flat fills. Shadows are case by case: default none, hard offset (`4px 4px 0 ink`) when depth is needed; soft shadows are fine when the design calls for it (glass, floating sheets). Outlines (2px ink) are likewise optional.
- Signature details: ink outline (2px), pill labels attached to subjects (name tags like `MAUI`, `KD`, `CHARLIE`), hand-drawn green check / red X, hand-drawn arrows, halftone dots and diagonal stripes inside comic-style panels, faint grid-paper background texture, small logo mark bottom-left.

## 8. Effects (use one per piece, on purpose)

liquid glass (second style, see below), clip-mask (photo cut into a circle/blob shape), parallax (subject cut-out overlapping the heading), grain (subtle noise over paper/dark photos), paper design (torn-paper edges on photos), glitch (white + cyan + magenta offsets, on black), neon (blurred outline text, on black), text designs (repeated text, outline/no-fill stroke, curved text). Never stack more than one effect family.

**Liquid glass (Apple-style, a second style, not a lapse in the flat one):** translucent surfaces with backdrop blur (about 16-32px) + saturate, white tint at 8-20% alpha, 1px light inner border (white 25-40%), a soft highlight on the top edge, gentle soft shadow. Gradients and blur are allowed here, that is the point. Needs something colourful behind it to refract. Keep text contrast >= 4.5:1 (darker tint or solid fallback behind text). Don't mix glass with the flat/ink-outline style in the same component.

## 9. Imagery

Vectors/illustrations (flat, one palette) or real photos; cut-outs with a thick paper/white edge; background photos from Pexels with the colour theme matched. Photos get rounded corners or a mask shape, never a default rectangle with a shadow. Never use stock emoji as decoration; emoji only if the content itself is an emoji.

## 10. Layout recipes

- **Title slide**: huge lowercase two-line title (bold, line-height 0.9), a small spaced-caps subtitle, one big circle partly off-canvas, tiny logo bottom-left.
- **Section slide**: green full-bleed background, white lowercase title, 2-3 overlapping circles bottom-right.
- **Comparison (do/don't)**: two equal samples side by side, hand-drawn red X over the wrong one and green check over the right one, short caption under each.
- **Content slide**: one idea. Lowercase heading with a highlighted word at top-left, content in a flat colour block or free on paper, ONE accent annotation in handwriting.
- **List**: pill tags or numbered circles, thin ink dividers, 4-5 items max per slide.
- **Photo grid**: mix of sizes (one big, rest small), consistent gutters, rounded corners, one colour-block tile.
- **Poster (comic panel)**: grid paper background, angled/clipped panels with halftone or stripe fills, name pills, bordered rounded rectangles for the headline and date/venue.

## 11. Web / UI translation

```css
:root{
  --paper:#E9E4D9; --ink:#251F1B; --green:#488162; --mustard:#E3BE53; --rust:#A8341C; --white:#fff;
  --step-0:1rem; --step-1:1.618rem; --step-2:2.618rem; --step-3:4.236rem; --step-4:6.854rem; /* x1.618 */
  --u:.5rem; /* spacing unit; use multiples */
  --font:"Glacial Indifference","Outfit",system-ui,sans-serif; --hand:"Lemon Tuesday","Caveat",cursive;
}
body{background:var(--paper);color:var(--ink);font:400 var(--step-0)/1.4 var(--font)}
h1,h2{font-weight:700;text-transform:lowercase;line-height:.95;letter-spacing:-.01em}
.label{font:700 .75rem var(--font);letter-spacing:.25em;text-transform:uppercase}
.hl{background:var(--mustard);padding:0 .2em}          /* highlight block behind one word */
.pill{border:2px solid var(--ink);border-radius:999px;padding:.2em .8em;background:var(--paper)}
```
Mobile-first, 16px side gutter, mustard/green as the only large colour areas. Workshop-style buttons = pills with ink outline and a hard offset shadow (`4px 4px 0 var(--ink)`), hover = shift the offset; cards `2px solid var(--ink)`. Other treatments (glass, filled) are fine case by case.

## 12. pptx / python-pptx / Canva notes

- 13.333 x 7.5 in, background `E9E4D9`. Set run fonts to `Glacial Indifference` (Canva has it; PowerPoint falls back to Calibri if not installed, so mention it).
- Build shapes (circles, rounded rects) with no outline except the 2px ink outline where the style calls for it. **No shadows: `shape.shadow.inherit=False` is not enough in LibreOffice; also delete the shape's `p:style` element** (`el.remove(el.find(qn('p:style')))`).
- List rows: put the divider, the dot and the text in one cell; center the dot on the text box's vertical middle; leave >= 0.1in between divider and 2-line text. Heading boxes must end before the next column starts (give the heading a width, let it wrap). Never place text over a circle unless the contrast is >= 3:1 (>= 4.5:1 small).
- Verify by rendering: `soffice --headless --convert-to pdf` then look at it before delivering.
- Lay out on a 12-col grid with 0.9in side margins; align text boxes to the same left edge.

## 13. Pre-flight checklist (run before delivering)

1. Background is paper (or green/ink on purpose), not white/grey.
2. Only palette colours; <= 4 colours + ink.
3. <= 2 font families picked by role; headings bold and tight.
4. Font sizes AND corner radii follow x1.618; clear BIG vs smol contrast; no more than 3 sizes per layout.
5. Text is centred in its containers; spacing looks right by eye; no phrase split across lines; nothing collides.
6. Contrast >= 3:1 (large) / 4.5:1 (small). Text on photos has a solid shape behind it.
7. Shapes are flat, or deliberately liquid glass (never half and half); circles/rects/rounded rects used with purpose; no emoji decoration.
8. One focal point; one accent annotation at most; plenty of white space.
9. Looks hand-made: ink outlines, pills, hand marks. If it looks like a generic template, redo it.
