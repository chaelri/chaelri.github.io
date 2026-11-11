/*
  CHARLIE'S DESIGN SYSTEM - single source of truth for the website.
  To add or change anything, edit ONLY this file (index.html renders it).
  Keep .claude/skills/charlie-design/SKILL.md in sync (same rules, text form).

  Section shape:
    { id, num, title, kicker, lead, demo, rules:[{t:'bold lead', d:'detail'}], dos:[..], donts:[..] }
  `demo` picks a built-in live demo: palette | type | scale | spacing | clarity | ratio | shapes | effects | recipes | web
  New demo = add a renderer in index.html's DEMOS object.
*/
window.SYSTEM = {
  meta: {
    name: "charlie's design system",
    source: "Graphic Design Workshop (58 slides, made by hand, no AI) - Canva DAFyH2pH9bo",
    updated: "2026-11-11",
    skill: ".claude/skills/charlie-design/SKILL.md"
  },

  tokens: [
    { name: "paper", hex: "#E9E4D9", use: "default background. warm cream, never pure white", ink: "#251F1B" },
    { name: "ink", hex: "#251F1B", use: "text + outlines on light. never #000", ink: "#E9E4D9" },
    { name: "green", hex: "#488162", use: "primary brand, highlight words, dark backgrounds", ink: "#FFFFFF" },
    { name: "mustard", hex: "#E3BE53", use: "secondary, highlight blocks, big shapes", ink: "#251F1B" },
    { name: "rust", hex: "#A8341C", use: "accent. one small thing per layout", ink: "#FFFFFF" },
    { name: "white", hex: "#FFFFFF", use: "text on green, panels on paper", ink: "#251F1B" },
    { name: "mark-red", hex: "#E35353", use: "the wrong X mark only", ink: "#160F0D" }
  ],

  fonts: [
    { role: "display + body", name: "Glacial Indifference", fallback: "Outfit", weights: "workshop sample only. pick the real family from the mood (geometric = modern, humanist = friendly, serif = elegant). Bold + Regular. in pptx use a font installed on this PC (Outfit, Caveat)" },
    { role: "accent (optional)", name: "Lemon Tuesday", fallback: "Caveat", weights: "workshop sample: small, slanted handwriting in the accent color. other moods: italic serif, mono or a second display" },
    { role: "serif (rare contrast)", name: "Playfair Display", fallback: "serif", weights: "never the main voice" }
  ],

  scale: { ratio: 1.618, base: 100, labels: ["100", "61.8", "38.2", "23.6", "14.6", "9"] },

  sections: [
    {
      id: "palette", num: "01", title: "color & theme", kicker: "tokens", demo: "palette",
      lead: "color is a set of roles (paper, ink, primary, shape, accent), not fixed values. ask the mood, pick 3-4 colors for it, keep them for the whole piece. the swatches are a sample.",
      rules: [
        { t: "the system gives rules, not a theme.", d: "claude asks for the mood first, then picks the palette, fonts and shape style from it. only the roles are fixed: paper, ink, primary, shape, accent. spacing and size never change with the mood." },
        { t: "the swatches below are one sample.", d: "the workshop set shows how roles map to colors. it is never the default answer. a teal invitation gives teal + aqua + coral; a calm mood gives something else entirely. re-check contrast after choosing." },
        { t: "paper, never default white.", d: "the background is a tint matched to the mood (the sample uses warm cream #E9E4D9). primary or ink only when you mean it." },
        { t: "black on light, white on dark.", d: "general rule for text. transparent and alternate accents are the only exceptions." },
        { t: "contrast is accessibility.", d: ">= 3:1 for large text, >= 4.5:1 for small text. unsure? use a contrast checker." },
        { t: "use color theory.", d: "monochromatic (shades of one hue) or complementary (opposites). derive the palette from the subject photo when there is one." },
        { t: "neon and glitch live on black only.", d: "cyan #00F0FF, magenta #FF00E5, white. a deliberate effect, never the default." }
      ]
    },
    {
      id: "type", num: "02", title: "typography", kicker: "type", demo: "type",
      lead: "bold, tight, with weight contrast. the font itself is flexible; the roles and pairing are the rule.",
      rules: [
        { t: "fonts are picked by role, from the mood.", d: "one display/body family, optionally one accent. geometric sans = modern, humanist = friendly, serif = elegant, rounded = playful, mono = techy. Glacial Indifference + Lemon Tuesday is just the workshop sample." },
        { t: "headings are bold + tight.", d: "line-height 0.9 to 1.0 for 2-3 line display text. lowercase is a mood choice (playful, casual), not a requirement." },
        { t: "highlight a word when it helps.", d: "primary or shape color on the word, or a shape-color block behind it. optional." },
        { t: "small labels are usually UPPERCASE.", d: "bold, small, wide letter-spacing, for real labels only (column heads, buttons, captions that carry information). never as a decorative chip, see clarity." },
        { t: "max 2 families.", d: "know the 3 classes (display, handwriting, monospace) and 3 strokes (sans, serif, slab). pair, don't pile." },
        { t: "hierarchy through weight.", d: "bold the key words, keep the rest regular." },
        { t: "judge size optically.", d: "fonts of the same point size look different. adjust by eye." }
      ]
    },
    {
      id: "scale", num: "03", title: "size = golden ratio", kicker: "scale", demo: "scale",
      lead: "bigger = x 1.618. smaller = / 1.618. BIG next to smol. never mid-size everything.",
      rules: [
        { t: "one ratio for everything.", d: "x 1.618 is the step between font sizes AND between corner radii (and spacing when you want a step bigger). pick sizes from the scale, not from habit (no 11/12/13/14/15 ladders)." },
        { t: "three steps per layout.", d: "pick a big, a medium, a small from the scale. no fourth." },
        { t: "slide scale (px @1920).", d: "160 / 99 / 61 / 38 / 23 / 14." },
        { t: "web scale (rem).", d: "6.854 / 4.236 / 2.618 / 1.618 / 1 / .618." }
      ]
    },
    {
      id: "spacing", num: "04", title: "spacing matters", kicker: "space", demo: "spacing",
      lead: "most amateur designs fail on spacing. fix these two first: center the text, center the background.",
      rules: [
        { t: "center the text inside its container.", d: "both axes, optically. descenders and tight leading shift the box, so nudge it." },
        { t: "center the background shape inside its frame.", d: "a block behind text gets equal margins on every side." },
        { t: "spacing is strict.", d: "every gap, padding and margin is a multiple of the 8px unit (0.1in), stepping by x 1.618 for bigger gaps. equal things get equal gaps. then check by eye and nudge optically. equal padding where the layout is meant to feel even." },
        { t: "letter-spacing.", d: "wide for UPPERCASE labels, slightly tight for big display text." },
        { t: "line-spacing.", d: "0.9-1.0 for display, 1.3-1.4 for body." },
        { t: "keep phrases together.", d: "break lines by meaning. never split a thought, never justify." },
        { t: "nothing collides.", d: "overlapping lines are fixed with leading, not by shrinking text." },
        { t: "white space is a feature.", d: ">= 6% margin of the shortest side. don't fill every corner." }
      ]
    },
    {
      id: "ratio", num: "05", title: "ratio & canvas", kicker: "format", demo: "ratio",
      lead: "decide the aspect ratio first, then compose. converting means re-flowing, never stretching.",
      rules: [
        { t: "square poster.", d: "1:1 at 1000x1000 or 3000x3000, 300 dpi." },
        { t: "portrait.", d: "4:5 feed posts, 9:16 stories." },
        { t: "landscape.", d: "16:9 slides and covers." },
        { t: "to portrait = recompose.", d: "stack the elements again. never stretch, never crop the text." }
      ]
    },
    {
      id: "clarity", num: "06", title: "clarity beats design", kicker: "readability", demo: "clarity",
      lead: "don't exchange clarity with design. if an effect hurts reading, the effect goes.",
      rules: [
        { t: "text on a busy photo gets a solid shape.", d: "a circle or rounded rectangle in paper, white or the shape color. not a faint overlay." },
        { t: "no mini label chips.", d: "no tiny uppercase pills or tags above a title or under it (\"DESIGN SYSTEM · V1\", \"UPDATED 2026-11-11\", \"14 CHAPTERS\", section kickers, status dots). they carry no information the reader needs and read as AI filler. a label stays only when the person must act on or tell things apart by it (a button, a real status in a data row, a name on a photo)." },
        { t: "one focal point.", d: "the eye knows where to start in under a second." },
        { t: "group related, separate unrelated.", d: "at least 2 spacing units between groups." },
        { t: "no mid-line gaps.", d: "'taking students / to the next level', never 'taking      to the'." }
      ],
      dos: ["solid shape behind text on photos", "bold key words, regular rest", "ink on paper, light on primary or ink"],
      donts: ["text straight on a busy photo", "justified text with gaps", "shape color on white for small text", "mini pill chips (version, date, count, kicker) as decoration"]
    },
    {
      id: "contrast", num: "07", title: "contrast & accessibility", kicker: "access", demo: "contrast",
      lead: "contrast is how far apart two colors are in brightness. if people can't read it, it isn't design. every new palette gets checked, because the mood picks the colors now.",
      rules: [
        { t: "how it works.", d: "each color gets a relative luminance (0 = black, 1 = white, green counts most, blue least). ratio = (lighter + 0.05) / (darker + 0.05). it runs from 1:1 (identical) to 21:1 (black on white)." },
        { t: "the thresholds (WCAG).", d: "normal text >= 4.5:1. large text (>= 24px, or >= 19px bold) >= 3:1. icons, outlines and button edges >= 3:1. 7:1 is the AAA level, aim for it on long body text." },
        { t: "hue is not contrast.", d: "two colors can look different and still fail, e.g. mustard on white or light green on cream. judge brightness, not color. squint or desaturate to test." },
        { t: "never use color alone.", d: "errors, success and links also need a label, icon or underline. about 1 in 12 men can't tell red from green." },
        { t: "check every palette you pick.", d: "run each text/background pair of the chosen palette through the checker before building: ink on paper, light on primary, text on shape, accent on paper. if a pair fails, darken the darker color or lighten the lighter one, don't enlarge the text to dodge it. claude runs .claude/skills/charlie-design/contrast.py (local WCAG math, cross-checked with the WebAIM API) on every palette." },
        { t: "text on photos and gradients.", d: "measure against the worst spot behind the text, or put a solid shape behind it (see clarity)." },
        { t: "other readability basics.", d: "body >= 16px, line-height 1.4 or more, tap targets >= 44px, visible focus state, never rely on hover alone." }
      ],
      dos: ["check every text/background pair of the chosen palette", "darken or lighten a failing color", "label status with text or an icon too"],
      donts: ["light grey text on white", "color as the only signal", "bigger text to excuse a failing pair"]
    },
    {
      id: "shapes", num: "08", title: "shapes", kicker: "vocabulary", demo: "shapes",
      lead: "flat fills only. circles, rectangles, rounded rectangles. each has a job.",
      rules: [
        { t: "circles.", d: "big background elements (partly off-canvas), small dots as bullets, a filled circle as the background for short text." },
        { t: "squares / rectangles.", d: "parallel stripes, tables, flat color blocks behind text." },
        { t: "rounded rectangles.", d: "chat bubbles, buttons, text backgrounds, real status tags in data rows (never decorative chips). outline, shadow or glass follow the chosen shape style. keep one style per piece." },
        { t: "corner radii step by x 1.618.", d: "e.g. 8 / 13 / 21 / 34 px, plus full pill/circle. don't scatter 10/12/14." },
        { t: "shape style follows the mood.", d: "flat fills, outlined with a hard offset shadow (4px 4px 0 ink), soft rounded with a soft shadow, sharp with thin lines, or liquid glass. pick one and keep it consistent in the piece." },
        { t: "workshop signature details (playful, hand-made mood).", d: "ink outlines, name labels on subjects (only when they name someone), hand-drawn check / X / arrows, halftone dots, diagonal stripes, faint grid paper, tiny logo bottom-left." }
      ]
    },
    {
      id: "effects", num: "09", title: "effects", kicker: "texture", demo: "effects",
      lead: "one effect family per piece, on purpose.",
      rules: [
        { t: "clip mask.", d: "photo cut into a circle or blob." },
        { t: "parallax.", d: "a cut-out subject overlapping the heading." },
        { t: "grain.", d: "subtle noise over paper or dark photos." },
        { t: "paper design.", d: "torn-paper edges on photos." },
        { t: "glitch / neon.", d: "white + cyan + magenta offsets, or blurred outline text. black background only." },
        { t: "text designs.", d: "repeated text, outline, curved text. outline text = stroke + paint-order: stroke fill with the fill set to the background color, never a transparent fill: modern fonts have overlapping contours and a transparent fill shows them as stray lines inside the letters (check in Chrome). stroke width at least 3px." },
        { t: "liquid glass (a second style).", d: "Apple-style translucent surfaces: backdrop blur (about 16-32px) + saturate, a white tint at 8-20% alpha, a 1px light inner border (white at 25-40%), a soft highlight on the top edge, and a gentle soft shadow. gradients and blur are allowed here, that is the point. needs something colorful behind it to refract. keep text contrast >= 4.5:1 (add a darker tint or solid fallback behind text). don't mix glass with the flat/ink-outline style in the same component." }
      ]
    },
    {
      id: "imagery", num: "10", title: "imagery", kicker: "images", demo: null,
      lead: "flat vectors in one palette, or real photos masked into shapes.",
      rules: [
        { t: "vectors", d: "flat, one palette (Canva Pro or vector stock)." },
        { t: "background photos", d: "from Pexels, color-matched to the theme." },
        { t: "photos get rounded corners or a mask", d: "never a default rectangle with a shadow." },
        { t: "no emoji decoration.", d: "emoji only if the content itself is an emoji." }
      ]
    },
    {
      id: "recipes", num: "11", title: "layout recipes", kicker: "patterns", demo: "recipes",
      lead: "start from a recipe, then bend it.",
      rules: [
        { t: "title slide.", d: "huge two-line title (lowercase if the mood suits), one plain subtitle line, one big circle partly off-canvas, tiny logo bottom-left." },
        { t: "section slide.", d: "full-bleed primary color, light title, 2-3 overlapping circles bottom-right." },
        { t: "do / don't.", d: "two equal samples, red X over the wrong one, check in the primary color over the right one." },
        { t: "content slide.", d: "one idea. heading with a highlighted word, a flat color block, one handwritten annotation." },
        { t: "photo grid.", d: "one big, the rest small, consistent gutters, one color-block tile." },
        { t: "poster (comic panel).", d: "grid paper, clipped panels with halftone or stripes, name pills, bordered rounded boxes for headline and date." }
      ]
    },
    {
      id: "web", num: "12", title: "web / ui translation", kicker: "code", demo: "web",
      lead: "mobile-first. the system as css.",
      rules: [
        { t: "buttons follow the shape style.", d: "playful: pill with 2px ink outline + hard offset shadow, hover shifts the offset. calm: soft filled. elegant: sharp, thin line. glass per the liquid glass rule." },
        { t: "cards follow the shape style.", d: "outlined, soft, thin-line or glass; never mix two styles in one piece." },
        { t: "16px side gutter", d: "no horizontal scroll at phone width." },
        { t: "color areas.", d: "primary and shape colors are the only large fills." }
      ]
    }
  ],

  css: `:root{
  /* fill the palette from the mood */
  --paper:/*bg*/; --ink:/*text*/; --primary:/*brand*/; --shape:/*big shapes*/; --accent:/*spice*/; --on-dark:#fff;
  --step-0:1rem; --step-1:1.618rem; --step-2:2.618rem; --step-3:4.236rem; --step-4:6.854rem;
  --u:.5rem;
  --font:/*by role*/, system-ui, sans-serif; --accent-font:/*optional*/;
}
body{background:var(--paper);color:var(--ink);font:400 var(--step-0)/1.4 var(--font)}
h1,h2{font-weight:700;line-height:.95;letter-spacing:-.01em}
.label{font:700 .75rem var(--font);letter-spacing:.25em;text-transform:uppercase}
.hl{background:var(--shape);padding:0 .2em}
.pill{border:2px solid var(--ink);border-radius:999px;padding:.2em .8em;background:var(--paper)}
.btn{border:2px solid var(--ink);border-radius:999px;background:var(--shape);box-shadow:4px 4px 0 var(--ink)}
.btn:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}`,

  recipes: [
    { name: "title", bg: "paper", html: "<b class=big>my <i>story</i></b><span class=c></span><span class=tag>label</span>" },
    { name: "section", bg: "green", html: "<b class=mid>section</b><span class=c2></span><span class=c3></span>" },
    { name: "do / don't", bg: "paper", html: "<span class=x>✗</span><span class=ok>✓</span><span class=bl></span><span class=bl2></span>" },
    { name: "content", bg: "paper", html: "<b class=mid>a <i>point</i></b><span class=blk></span><em>note!</em>" },
    { name: "photo grid", bg: "paper", html: "<span class=g1></span><span class=g2></span><span class=g3></span><span class=g4></span>" },
    { name: "list", bg: "paper", html: "<span class=ln></span><span class=ln></span><span class=ln></span><span class=ln></span>" }
  ],

  checklist: [
    "asked the mood; stated palette + fonts + shape style in one line; not the workshop sample unless fitting",
    "background is the chosen paper (or primary/ink on purpose), not default white or grey",
    "one chosen palette from the mood or subject: <= 4 colors + ink, each with a role",
    "<= 2 font families picked by role; headings bold and tight",
    "font sizes AND corner radii follow x1.618; clear BIG vs smol; <= 3 sizes per layout",
    "text centered in its containers; every gap on the 8px unit and equal for equal elements; no split phrases; nothing collides",
    "contrast.py run on the chosen palette, no failing pair; contrast >= 3:1 large / 4.5:1 small; text on photos has a solid shape behind it",
    "shapes are flat, or deliberately liquid glass (never half and half); no emoji decoration",
    "one focal point; one handwritten accent at most; plenty of white space; no decorative mini label chips (eyebrow, version, date, count)",
    "looks designed for this subject and mood, one consistent shape style. if it looks like a template or the last piece, redo it",
    "verified in Claude in Chrome before delivering (every web design job): JS spacing audit, real screenshots of each section, 390px mobile check; fix, re-check, then report"
  ],

  extend: [
    "tell Claude: \"add a rule to charlie-design: <your rule>\"",
    "Claude edits this file (system-data.js) and .claude/skills/charlie-design/SKILL.md together",
    "new live demo? add a renderer to DEMOS in index.html and set demo: 'name' on the section",
    "commit + push; GitHub Pages updates /design-system/ automatically"
  ]
};
