---
name: charlie-design
description: Charlie's own graphic-design system (from his Graphic Design Workshop deck). Use for ANY visual output - web page, UI, slide deck, pptx, poster, graphic, README banner - and whenever Charlie says "maganda", "modern", "ayaw ko ng bulok/AI-looking", "design this", or asks for a presentation/page. Defines palette, type, spacing, hierarchy, shapes, effects and a pre-flight checklist. Follow ALL rules; do not fall back to generic defaults.
---

# Charlie's Design System

Source: Charlie's "Graphic Design Workshop" (58 slides, made by hand, no AI; Canva `DAFyH2pH9bo`). This is his taste. The goal is work that looks **human-designed**: confident type, warm paper background, flat colour blocks, ink outlines, hand-drawn marks. NOT: grey slabs, gradient-everything, emoji-as-decoration, symmetrical template cards, kids/cartoon styling, or the "AI deck" look (rounded white cards on pastel + centered everything).

Written fallback + live demos: `design-system/` (open `design-system/index.html`, published at `/design-system/`). All of its content lives in `design-system/system-data.js`. **When Charlie adds or changes a rule, update BOTH this file and `design-system/system-data.js`**, then commit + push.

Scope note: `house-style` (navy/Nunito/pink) is the devo-app look only. Everything else uses this skill.

## 1. Tokens

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

- **Display/body: Glacial Indifference** (Bold + Regular only). Fallback when not installed: **Outfit** (Google Fonts), then system sans. Pair with at most one accent.
- **Accent/handwriting: Lemon Tuesday** for little annotations ("pro tip!", "when it started"), fallback **Caveat**. Small, slanted, often green or rust, paired with a hand-drawn arrow.
- Serif (Playfair Display) only as a deliberate contrast, never the main voice.
- Know the 3 classifications (display, handwriting, monospace) and 3 strokes (sans, serif, slab); use max 2 families per piece.
- **Hierarchy through weight**: bold key words against regular text; weight contrast beats colour contrast.
- Headings are **lowercase, bold, tight** ("fix 2 spacing issues"). One word or number gets the highlight (green or mustard text, or a mustard block behind it): "2 types of **character spacing**", "don't exchange **clarity** with design".
- Small labels: UPPERCASE, bold, wide letter-spacing (+200 to +300).
- Fonts differ in apparent size at the same point size: judge optically, not by number.

## 3. Type scale = golden ratio (x1.618)

`bigger = x1.618`, `smaller = /1.618`. From a 100 base: 100 -> 61.8 -> 38.2 -> 23.6 -> 14.6 -> 9. Slide-scale example (px at 1920): 160 / 99 / 61 / 38 / 23 / 14. Use 3 steps per layout at most. Contrast of size is the point: **BIG next to smol**. Never mid-size everything.

## 4. Spacing (the "spacing matters" rules)

1. **Centre the text inside its container**, both axes, using optical centring (descenders and tight line-height shift the box; nudge until it looks centred).
2. **Centre the background shape inside its frame** (a block behind text gets equal margins on all sides).
3. Equal padding everywhere; one spacing unit (8px grid / 0.1in) and multiples of it.
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
- Flat fills only. No drop shadows by default; if depth is needed, use a hard offset shape (same colour family) rather than a blur.
- Signature details: ink outline (2px), pill labels attached to subjects (name tags like `MAUI`, `KD`, `CHARLIE`), hand-drawn green check / red X, hand-drawn arrows, halftone dots and diagonal stripes inside comic-style panels, faint grid-paper background texture, small logo mark bottom-left.

## 8. Effects (use one per piece, on purpose)

clip-mask (photo cut into a circle/blob shape), parallax (subject cut-out overlapping the heading), grain (subtle noise over paper/dark photos), paper design (torn-paper edges on photos), glitch (white + cyan + magenta offsets, on black), neon (blurred outline text, on black), text designs (repeated text, outline/no-fill stroke, curved text). Never stack more than one effect family.

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
Mobile-first, 16px side gutter, mustard/green as the only large colour areas, buttons = pills with ink outline and a hard offset shadow (`4px 4px 0 var(--ink)`), hover = shift the offset. Rounded-rect cards use `2px solid var(--ink)`, not blur shadows.

## 12. pptx / python-pptx / Canva notes

- 13.333 x 7.5 in, background `E9E4D9`. Set run fonts to `Glacial Indifference` (Canva has it; PowerPoint falls back to Calibri if not installed, so mention it).
- Build shapes (circles, rounded rects) with no outline except the 2px ink outline where the style calls for it; no shadows (`shape.shadow.inherit=False`).
- Lay out on a 12-col grid with 0.9in side margins; align text boxes to the same left edge.

## 13. Pre-flight checklist (run before delivering)

1. Background is paper (or green/ink on purpose), not white/grey.
2. Only palette colours; <= 4 colours + ink.
3. <= 2 font families; headings lowercase bold; one highlighted word per heading.
4. Type sizes follow x1.618; clear BIG vs smol contrast; no more than 3 sizes per layout.
5. Text is centred in its containers; equal padding; no phrase split across lines; nothing collides.
6. Contrast >= 3:1 (large) / 4.5:1 (small). Text on photos has a solid shape behind it.
7. Shapes are flat; circles/rects/rounded rects used with purpose; no blur shadows, no emoji decoration.
8. One focal point; one accent annotation at most; plenty of white space.
9. Looks hand-made: ink outlines, pills, hand marks. If it looks like a generic template, redo it.
