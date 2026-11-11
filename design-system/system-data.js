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
    { name: "mark-red", hex: "#E35353", use: "the wrong X mark only", ink: "#251F1B" }
  ],

  fonts: [
    { role: "display + body", name: "Glacial Indifference", fallback: "Outfit", weights: "Bold + Regular. use Outfit in pptx (installed on this PC)" },
    { role: "handwriting accent", name: "Lemon Tuesday", fallback: "Caveat", weights: "small, slanted, green or rust" },
    { role: "serif (rare contrast)", name: "Playfair Display", fallback: "serif", weights: "never the main voice" }
  ],

  scale: { ratio: 1.618, base: 100, labels: ["100", "61.8", "38.2", "23.6", "14.6", "9"] },

  sections: [
    {
      id: "palette", num: "01", title: "color & theme", kicker: "tokens", demo: "palette",
      lead: "paper + ink + green + mustard is the default. rust is the spice. pick 3-4 colors per piece and stick to the theme.",
      rules: [
        { t: "this palette is a default, not a rule.", d: "keep the structure (paper, ink, primary, shape color, accent) but derive the actual colors from the subject, e.g. a teal invitation gives teal + aqua + coral. re-check contrast after swapping." },
        { t: "paper, never white.", d: "the background is warm cream #E9E4D9. green or ink only when you mean it." },
        { t: "black on light, white on dark.", d: "general rule for text. transparent and alternate accents are the only exceptions." },
        { t: "contrast is accessibility.", d: ">= 3:1 for large text, >= 4.5:1 for small text. unsure? use a contrast checker." },
        { t: "use color theory.", d: "monochromatic (shades of one hue) or complementary (opposites). derive the palette from the subject photo when there is one." },
        { t: "neon and glitch live on black only.", d: "cyan #00F0FF, magenta #FF00E5, white. a deliberate effect, never the default." }
      ]
    },
    {
      id: "type", num: "02", title: "typography", kicker: "type", demo: "type",
      lead: "lowercase, bold, tight. one highlighted word per heading. weight contrast beats color contrast.",
      rules: [
        { t: "headings are lowercase + bold.", d: "line-height 0.9 to 1.0 for 2-3 line display text." },
        { t: "highlight one word.", d: "green or mustard text, or a mustard block behind it." },
        { t: "labels are UPPERCASE.", d: "bold, small, letter-spacing +200 to +300." },
        { t: "max 2 families.", d: "know the 3 classes (display, handwriting, monospace) and 3 strokes (sans, serif, slab). pair, don't pile." },
        { t: "hierarchy through weight.", d: "bold the key words, keep the rest regular." },
        { t: "judge size optically.", d: "fonts of the same point size look different. adjust by eye." }
      ]
    },
    {
      id: "scale", num: "03", title: "size = golden ratio", kicker: "scale", demo: "scale",
      lead: "bigger = x 1.618. smaller = / 1.618. BIG next to smol. never mid-size everything.",
      rules: [
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
        { t: "one spacing unit.", d: "8px (0.1in) and its multiples. equal padding everywhere." },
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
        { t: "text on a busy photo gets a solid shape.", d: "a circle or rounded rectangle in paper, white or mustard. not a faint overlay." },
        { t: "one focal point.", d: "the eye knows where to start in under a second." },
        { t: "group related, separate unrelated.", d: "at least 2 spacing units between groups." },
        { t: "no mid-line gaps.", d: "'taking students / to the next level', never 'taking      to the'." }
      ],
      dos: ["solid shape behind text on photos", "bold key words, regular rest", "ink on paper, white on green"],
      donts: ["text straight on a busy photo", "justified text with gaps", "mustard on white for small text"]
    },
    {
      id: "shapes", num: "07", title: "shapes", kicker: "vocabulary", demo: "shapes",
      lead: "flat fills only. circles, rectangles, rounded rectangles. each has a job.",
      rules: [
        { t: "circles.", d: "big background elements (partly off-canvas), small dots as bullets, a filled circle as the background for short text." },
        { t: "squares / rectangles.", d: "parallel stripes, tables, flat color blocks behind text." },
        { t: "rounded rectangles.", d: "chat bubbles, pill tags, buttons, text backgrounds, with a 2px ink outline." },
        { t: "no blur shadows.", d: "if depth is needed, use a hard offset (4px 4px 0 ink)." },
        { t: "signature details.", d: "ink outlines, name pills on subjects, hand-drawn check / X / arrows, halftone dots, diagonal stripes, faint grid paper, tiny logo bottom-left." }
      ]
    },
    {
      id: "effects", num: "08", title: "effects", kicker: "texture", demo: "effects",
      lead: "one effect family per piece, on purpose.",
      rules: [
        { t: "clip mask.", d: "photo cut into a circle or blob." },
        { t: "parallax.", d: "a cut-out subject overlapping the heading." },
        { t: "grain.", d: "subtle noise over paper or dark photos." },
        { t: "paper design.", d: "torn-paper edges on photos." },
        { t: "glitch / neon.", d: "white + cyan + magenta offsets, or blurred outline text. black background only." },
        { t: "text designs.", d: "repeated text, outline (no fill), curved text." }
      ]
    },
    {
      id: "imagery", num: "09", title: "imagery", kicker: "images", demo: null,
      lead: "flat vectors in one palette, or real photos masked into shapes.",
      rules: [
        { t: "vectors", d: "flat, one palette (Canva Pro or vector stock)." },
        { t: "background photos", d: "from Pexels, color-matched to the theme." },
        { t: "photos get rounded corners or a mask", d: "never a default rectangle with a shadow." },
        { t: "no emoji decoration.", d: "emoji only if the content itself is an emoji." }
      ]
    },
    {
      id: "recipes", num: "10", title: "layout recipes", kicker: "patterns", demo: "recipes",
      lead: "start from a recipe, then bend it.",
      rules: [
        { t: "title slide.", d: "huge lowercase two-line title, spaced-caps subtitle, one big circle partly off-canvas, tiny logo bottom-left." },
        { t: "section slide.", d: "full-bleed green, white lowercase title, 2-3 overlapping circles bottom-right." },
        { t: "do / don't.", d: "two equal samples, red X over the wrong one, green check over the right one." },
        { t: "content slide.", d: "one idea. heading with a highlighted word, a flat color block, one handwritten annotation." },
        { t: "photo grid.", d: "one big, the rest small, consistent gutters, one color-block tile." },
        { t: "poster (comic panel).", d: "grid paper, clipped panels with halftone or stripes, name pills, bordered rounded boxes for headline and date." }
      ]
    },
    {
      id: "web", num: "11", title: "web / ui translation", kicker: "code", demo: "web",
      lead: "mobile-first. the system as css.",
      rules: [
        { t: "buttons are pills.", d: "2px ink outline + hard offset shadow; hover shifts the offset." },
        { t: "cards.", d: "2px solid ink, not blur shadows." },
        { t: "16px side gutter", d: "no horizontal scroll at phone width." },
        { t: "color areas.", d: "mustard and green are the only large fills." }
      ]
    }
  ],

  css: `:root{
  --paper:#E9E4D9; --ink:#251F1B; --green:#488162; --mustard:#E3BE53; --rust:#A8341C; --white:#fff;
  --step-0:1rem; --step-1:1.618rem; --step-2:2.618rem; --step-3:4.236rem; --step-4:6.854rem;
  --u:.5rem;
  --font:"Glacial Indifference","Outfit",system-ui,sans-serif; --hand:"Lemon Tuesday","Caveat",cursive;
}
body{background:var(--paper);color:var(--ink);font:400 var(--step-0)/1.4 var(--font)}
h1,h2{font-weight:700;text-transform:lowercase;line-height:.95;letter-spacing:-.01em}
.label{font:700 .75rem var(--font);letter-spacing:.25em;text-transform:uppercase}
.hl{background:var(--mustard);padding:0 .2em}
.pill{border:2px solid var(--ink);border-radius:999px;padding:.2em .8em;background:var(--paper)}
.btn{border:2px solid var(--ink);border-radius:999px;background:var(--mustard);box-shadow:4px 4px 0 var(--ink)}
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
    "background is paper (or green/ink on purpose), not white or grey",
    "one chosen palette (default or derived from the subject): <= 4 colors + ink",
    "<= 2 font families; headings lowercase bold; one highlighted word per heading",
    "sizes follow x1.618; clear BIG vs smol; <= 3 sizes per layout",
    "text centered in its containers; equal padding; no split phrases; nothing collides",
    "contrast >= 3:1 large / 4.5:1 small; text on photos has a solid shape behind it",
    "shapes are flat; no blur shadows, no emoji decoration",
    "one focal point; one handwritten accent at most; plenty of white space",
    "looks hand-made (ink outlines, pills, hand marks). if it looks like a template, redo it"
  ],

  extend: [
    "tell Claude: \"add a rule to charlie-design: <your rule>\"",
    "Claude edits this file (system-data.js) and .claude/skills/charlie-design/SKILL.md together",
    "new live demo? add a renderer to DEMOS in index.html and set demo: 'name' on the section",
    "commit + push; GitHub Pages updates /design-system/ automatically"
  ]
};
