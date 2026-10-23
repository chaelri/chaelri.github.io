# Devo UI — the house style

**Reference component: the Quick Context card** (`.inline-ai-card` in `style.css`, built by `_inlineCard()` in `js/04-passage.js`). Charlie called it "the best thing in the app" (2026-10-23) — its font, spacing, action placement and motion are the bar. Any new panel, card or sheet in the reader should look like a sibling of it. When something "doesn't have the same vibe", diff it against these values first.

## Card shell

| Property | Value |
|---|---|
| Surface | `#1b2238` (dark). No border. |
| Radius | `14px` |
| Padding | `16px` |
| Gap from the button row | `8px` top margin |
| Width | full width of the reading column — no `max-width` cap |

Light mode: `#f5f5fa` surface for Ask and Notes. (Quick Context itself still renders dark in light mode with a white Dig Deeper footer — known inconsistency, not yet fixed.)

## Header row

`display:flex; justify-content:space-between; align-items:center; margin-bottom:8px`

- **Label** (left): `11px`, weight `700`, `letter-spacing:1.5px`, `uppercase`, `rgba(255,255,255,0.5)`. Short noun: QUICK CONTEXT, ASK, NOTES.
- **Close** (right): bare `✕`, `18px`, no background, `rgba(255,255,255,0.6)` → `0.9` on hover. It closes through the same path as the toggle button, so the collapse animation and the button's lit state stay in sync.

## Body text

- `15px / 22px`, `rgba(255,255,255,0.92)`.
- Key terms **bold** at weight `800`, pure `#fff` — the AI is told to bold them (`AI_TONE`).
- Verse references are pink (`#db2777`) with a dotted underline and open the peek sheet.

## Footer action (optional)

A full-width row separated from the body by a slightly darker band: small icon + spaced-caps label + chevron (`✦ DIG DEEPER ›`). One action per card.

## Loading

`sparkleLoaderHTML(text)` — three gold `✦` pulsing in sequence above a `13px/600` label ("Quick context…"). It renders INSIDE the card under the real header, so the card's shape is already final while it loads. Inside a chat bubble the loader is one row (sparkles beside the text), sized like a message.

## Motion

- **Open:** `_revealFromButton(panel, btn, cls)` — the panel grows out of the tapped button: height `0fr → 1fr` (verses below are pushed, never jump), fade in, `translateY(-8px) scale(0.97) → none`, origin at the button's x-centre. `0.42s cubic-bezier(0.22, 1, 0.36, 1)`.
- **Close:** `_collapsePanel(panel, btn, done)` — the exact reverse, `0.3s cubic-bezier(0.4, 0, 0.2, 1)`, then `done()` empties/hides. Taps during the collapse are ignored.
- **Content swap** (loader → answer): `.ai-card-body--fresh` fades up `4px` in `0.32s`; the shell never repaints.
- **New item in a list** (a just-added note): rises in `10px` + `scale(0.96)`, `0.42s`.
- Every animation has a `prefers-reduced-motion` off-switch.

## Notes

Saved notes are a plain navy card: `#1b2238`, `14px` radius, `12px 16px` padding, `15px/22px` text, no pink rule or wash (Charlie dropped the pink 2026-10-23). Inside the Notes card a note sits one step darker (`rgba(17,26,47,0.9)`, `12px` radius) so it still reads as its own item.

## Inputs

- One `1px` border. Reflection boxes: on focus it turns blue `rgba(124,195,255,0.5)` with a soft drop glow `0 8px 24px rgba(72,107,236,0.25)` — no second ring, no pink.
- An input that already sits inside a card (the Notes card) gets NO highlight on focus, only a slightly brighter border (`rgba(255,255,255,0.18)`). Charlie removed the glow there 2026-10-23.
- Nothing around an input may clip that glow — `.verse` is `display:flow-root`, not `overflow:hidden`; the swipe slide is clipped on `.verse-swipe-track` (`overflow-x:clip`) instead.
- Textareas auto-grow (`autoExpand`) instead of showing a resize handle; a button beside one keeps its own height (`align-items:flex-end`).

## Applied across the app (2026-10-23 clean pass, dark mode)

- **Buttons** (Listen, library, more, prev/next, Study/Reflect/Retell): filled `#1b2238`, no outline, `#222b45` on hover.
- **Favourited verse:** no box behind the text — the filled heart is the marker.
- **Saved note** sits directly under its verse, above the Context/Ask/Note row.
- **Guided Reflection** (modal + desktop sidebar): each question is a card with a grey `QUESTION N` label, `15px` regular text, answer box inside. Refresh sits in the modal's title row.
- **Dashboard:** Favourites and Notes cards use `#1b2238`, no border, `14px` radius. Pink stays on references and labels. Continue Reading keeps its pink glow because it's the main button on the page.

## Checklist for a new panel

1. Uses the card shell, header row and body text above (copy the values — the reader panels share one CSS block at the end of `style.css`).
2. Opens with `_revealFromButton`, closes with `_collapsePanel`, and its ✕ goes through the toggle button.
3. Loader is `sparkleLoaderHTML` inside the finished card.
4. Checked in dark AND light mode, with a real screenshot.
