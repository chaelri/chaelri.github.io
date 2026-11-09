---
name: house-style
description: Build or restyle any web page/app in Charlie's devo house style (navy cards, Nunito, Editors Note headings, pink used sparingly, soft rise motion, mobile-first). Use whenever Charlie asks to create a website/page/UI, says "gandahan mo", "make it nice", "devo style", or a page looks plain/"sakit sa mata".
---

# House style (from devo, the reference app)

Source of truth: `knowledge/devo/DESIGN.md` + `devo/style.css`. Charlie's bar is devo's Quick Context card: calm navy, no borders, small spaced-caps labels, one clear action. A good example built with this skill: `karla-jobs/index.html`.

## Tokens (copy into `:root`)

```css
--bg1:#121b33; --bg2:#0b1220;            /* body: radial-gradient(circle at top,var(--bg1),var(--bg2)) fixed */
--sheet:#121829; --card:#1b2238; --inner:rgba(17,26,47,.9); --hover:#222b45; --sel:#2b3554;
--text:#e6edf7; --body:rgba(255,255,255,.92); --mute:rgba(255,255,255,.55); --label:rgba(255,255,255,.5);
--pink:#db2777; --pink-glow:rgba(219,39,119,.35); --gold:#f5c76b; --green:#5fd3a5; --amber:#f0b46a;
--ease:cubic-bezier(.22,1,.36,1); --ease-out:cubic-bezier(.4,0,.2,1);
```
Light mode (`prefers-color-scheme:light`): bg `#f7f7fb→#eef0f7`, card `#fff`, inner `#f3f4fa`, sel `#e6e8f4`, text `#18203a`, mute `#6b7290`.

### Alternate palette: "Claude warm" (3 colours, used by `karla-jobs/`)
Same design system, swap only the tokens. Colours: dark brown `#2A1A14`, cream `#FFF3E9`, Claude orange `#D97757` (accent replaces pink everywhere, incl. sparkles and warnings).
```css
--bg1:#3a2519; --bg2:#2A1A14; --sheet:#3a271e; --card:#36241c; --inner:#24160f; --hover:#432d23; --sel:#4d3328;
--text:#FFF3E9; --mute:rgba(255,243,233,.6); --label:rgba(255,243,233,.5);
--pink:#D97757; --pink-glow:rgba(217,119,87,.35); --pink-hover:#c4643f;
/* light: bg #FFF8F2→#FFF3E9, card #fffaf6, inner #f8e9dd, sel #f3d9c7, text #2A1A14 */
```
Ask which palette when Charlie doesn't say; default to devo navy.

## Type
- Body: **Nunito** 400/600/700/800 from Google Fonts, `15px/22px`.
- Display heading: **Editors Note italic** (`devo/assets/EditorsNote-Italic.ttf`, load with `@font-face` via a relative path), ~34px, one word in pink: `Hi <b>Karla</b>`.
- Labels: `11px`, weight 700, `letter-spacing:1.5px`, uppercase, `--label` colour. Short nouns (PAY, HOURS, QUICK CONTEXT).
- Card title 18/24 weight 800; secondary line 14px `--mute`.

## Components
- **Card**: `--card`, radius 14, padding 16, NO border, NO outline, 12px gap between cards. Header row: label left, status pill / ✕ right.
- **Inner block** (facts, nested items): `--inner`, radius 12, padding 12–14. Facts as a 2-col label/value grid, not chips.
- **Buttons**: filled `--inner` or `--card`, radius 12, height 44 (tap target), weight 700. Hover `--hover`, active `scale(.97)`.
  ONE primary per card: pink fill + `0 6px 20px var(--pink-glow)`. Secondary = ghost (no bg, `--mute` text). External links end in `↗`.
- **Tabs / segmented**: grid of small cards with a big number + caps label; selected = `--sel` bg and pink number. Never a pink pill.
- **Warnings**: amber, but as a collapsible `<details>` checklist with small amber dots, never a wall of orange text.
- **Loading**: three gold `✦` pulsing in sequence above a short label, inside the final layout so nothing jumps.
- **Empty state**: Editors Note line ("All caught up") + one plain sentence on what happens next.
- **Toast + Undo** for any state change instead of confirm dialogs: bottom centre, `--sheet`, 5 s.
- Pink is for: the one main action, references/links, progress fills, the highlighted word in the heading. Nothing else.

## Motion
- New items: rise `translateY(10px) scale(.96) → none`, `.42s var(--ease)`.
- Removing an item: collapse `grid-template-rows:1fr→0fr` + fade, `.3s var(--ease-out)`, then update data.
- Panels open from their button (grow + fade), close in reverse.
- Always add `@media (prefers-reduced-motion:reduce)` that kills animation/transition.

## Layout and UX rules
- Mobile-first: `max-width:640px` content column, 16px side gutter, safe-area padding, no horizontal scroll.
- Lead with what the user needs to decide; move metadata (file names, ids) out of the way.
- Turn raw data into human values: relative times ("2h ago"), monthly peso estimates for hourly/USD pay, sentence-case lists split from `;`.
- No emoji in UI chrome (✦ ✕ › ↗ glyphs are fine). No taglines, hero banners or self-narrating captions.
- Text is plain and warm; Taglish only where the app already uses it.

## Checklist before shipping
1. Tokens + Nunito + Editors Note wired; body has the radial navy background.
2. No borders on cards; one primary action per card; labels in spaced caps.
3. Loading, empty, and error states designed (not blank).
4. Dark AND light mode checked; 375px width checked.
5. Reduced-motion fallback present.
6. Look at a real screenshot before saying it's done.
