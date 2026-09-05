# kain/ — Food & goals tracker (Charlie + Karla)

**Built:** 2026-09-05. Replaces the deleted `bududiet/`.
**Status:** 🟢 Active. Live at `/kain/` on GitHub Pages (not linked from the hub page).

## What it is

Photo-first food log for two people. Snap the plate → `gemini-proxy` reads it →
the day's **calories / sugar / sodium** count down from goals. Workouts and step
counts add calories back. Three concentric rings (Apple-Watch style) carry the
day; tapping a legend row moves the centre readout between the three metrics.

Goals seed at **1,500 kcal** (shared target), **50 g sugar** and **2,000 mg
sodium** (both DOH daily recommendations), editable per person.

## Stack

Vanilla ES modules, no build. Tailwind v4 browser CDN is loaded (as asked) but
every component is hand-written in `css/style.css` — the dynamic DOM would make
Tailwind's mutation scanner do a lot of work for utilities we'd hand-write
anyway. Material Symbols **Rounded**. Fonts: Outfit (UI) + Fraunces (numbers and
headings). Firebase v10 modular SDK (RTDB + anonymous auth).

**PWA with a manifest and deliberately no `sw.js`** — Charlie's explicit ask:
nothing should ever serve a stale build.

## Data model

```
kain/users/<charlie|karla>/profile                  { goals, weightKg, heightCm,
                                                      exerciseAddsBudget, showPartner }
kain/users/<charlie|karla>/days/<YYYY-MM-DD>/<id>   one entry
```

Entry is discriminated by `kind`:
- `meal` — `{ title, brand, items[], kcal, sugar_g, sodium_mg, thumb, source,
  confidence, assumptions, ts }`
- `exercise` — `{ title, activity, minutes, steps, burn, met, ts }`

Firebase project `test-database-55379` (asia-southeast1), shared with the rest of
the repo. Anonymous auth only exists to satisfy the rules; identity is a
localStorage pick (`kain.who`). Each person has their own subtree, so nothing
pools — same privacy shape as devo's per-user sync paths.

## Load-bearing decisions

- **Manila days, always.** `dayKey()` formats through `Intl` with
  `timeZone: "Asia/Manila"`, never the device clock — a phone on UTC would
  otherwise roll the day over at 8 AM.
- **Totals are summed in JS from the items array, never taken from the model.**
  LLMs recognise adobo well and add columns badly. `sumItems()` is the only
  source of an entry's kcal/sugar/sodium.
- **Exercise adds to the calorie budget only.** Sugar and sodium goals never
  move — you can't out-walk salt. Toggleable in Me (`exerciseAddsBudget`).
- **Photos are compressed twice from one decode.** 768 px q0.72 goes to Gemini
  (≈ one image tile, ~1,700 prompt tokens) and is discarded; 400 px q0.62
  (~28 KB base64) is stored on the entry as the "memory" thumbnail. ~60 MB/year
  for both of us against a 1 GB free tier. `createImageBitmap(..., {
  imageOrientation: "from-image" })` applies EXIF rotation so portrait iPhone
  shots don't reach Gemini sideways.
- **The correction loop is the point.** "Not quite right? Tell me what it really
  is" re-runs the read against the same photo with the previous reading and the
  user's sentence in the prompt. It works on old entries too, because the stored
  400 px thumbnail is enough to re-read.
- **Model fallback is required, not optional.** `gemini-3.5-flash` answers
  `503 UNAVAILABLE` ("high demand") regularly on the free-tier key — it did so
  twice in a row during the build. The proxy passes Gemini's body through
  verbatim, so **that error arrives as HTTP 200 with an `error` object inside**;
  `callGemini` checks for it explicitly, retries the same model once, then drops
  to `gemini-3.5-flash-lite`. Text jobs use `gemini-3.1-flash-lite` directly.
- **`maxOutputTokens: 3000` on the vision call.** Thinking tokens count against
  that budget on 3.x — pinakbet burned 953 of them. A 1,400 cap would truncate.
- **The document scrolls, not a nested container.** The first build had
  `.scroller { flex: 1; overflow-y: auto }` inside a `min-height: 100%` flex
  column: it just grew to fit its content, so `scrollHeight === clientHeight` and
  `scrollTo()` was a silent no-op. Tab switches now scroll `window`.
- **`.legend-bar { grid-column: 2 / -1 }` must stay scoped to `.legend-row`.**
  Global, it also caught `.avg-row` and `.partner-metric` and pushed their values
  onto a second line.
- **The history goal line is positioned in pixels after layout.** The weekday
  labels take 18 px out of the bars' box but not the line's, so a percentage on
  each meant different things; `renderChart` measures a `.bar-track` in a
  `requestAnimationFrame` instead.
- **iOS haptics via the hidden switch trick** (`util.js haptic()`) — same as
  `devo/js/01-core.js`. `navigator.vibrate` is a no-op on both their phones.

## Burn maths

- Workout: `kcal = MET × 3.5 × kg × minutes / 200`. The AI returns only the
  activity name, minutes and MET — never calories.
- Steps: `kcal = steps × kg × 0.0004` (≈0.5 kcal/kg/km, ~1,250 steps per km).
  10k steps ≈ 256 kcal at 64 kg.
- Me tab shows Mifflin-St Jeor BMR and TDEE (×1.375, lightly active) as context
  for the goal, e.g. Charlie: BMR 1,523 / burn 2,094 → a 594 kcal gap.

## People

Seeded in `js/config.js` (`PEOPLE`): Charlie (m, 2000-02-24, 161.3 cm, 64 kg,
amber) and Karla (f, 2000-02-07, 152.4 cm, 47 kg, rose). Ages compute from the
birth dates, so they don't go stale.

## UI decisions from the first visual pass (2026-09-05)

Charlie asked for an end-to-end look at every screen and modal in Chrome. What
that pass changed, and why:

- **Every editable number carries its own label.** The item rows in the review
  sheet showed `550 | 12 | 480` with only a tiny unit suffix, so telling sugar
  from sodium meant decoding `g` vs `mg`. Each box now says CALORIES / SUGAR /
  SODIUM above the field. (Watch out: a leftover `.numbox span { color: faint }`
  rule out-specified `.numbox-label` and greyed the whole box — it's gone.)
- **"Over budget" has its own red** (`--over: #ff3b30`). `--danger` (#f87171) is
  two hues from `--sugar` (#fb7185), so a blown sugar ring still read as normal.
  Rings, bars, day pills and partner values all use it.
- **The dense chart stopped shouting.** In 30-day mode 23 empty tracks looked
  like bars; they now sit at 2% opacity, the fills lose their pill radius, and
  every fifth day plus today gets a date label.
- **The day sheet no longer repeats its own date** — the subtitle carries the
  entry count instead, except on Today/Yesterday where the real date is useful.
- **Delete is demoted.** In the entry sheet it was the widest, brightest button
  on the row; it's now a quiet red text row under Log again / Edit.
- **The brand pill survives a long dish name.** The whole title line was
  truncating, so "Jollibee Chickenjoy with Jolly Spaghetti" clipped its own
  JOLLIBEE pill off the row. Only the name truncates now.
- **The tablet hero sits sideways.** At 768-1079 px the ring was marooned in the
  middle of a 720 px card; ring and legend are now side by side.
- **The empty day is a button.** "Wala pa today" was the biggest dead zone on an
  empty screen; the whole panel opens the add sheet and carries a CTA.
- **The steps field formats as you type** (`12,345`), because its own quick
  chips were already grouped and the hero number wasn't.
- Smaller: sheet header icons align to the first line of a two-line title, the
  chooser's hero option is a row rather than a stack, detail rows spell out
  `kcal`, the partner card shows units, and the `is-near` ring state (85-100%)
  finally has the soft breath it was always flagged for.

## Ring internals (2026-09-05, second pass)

- **Geometry is a constraint, not a style.** Radii 88/68/48 at a 14 stroke leave
  a hole 41% of the ring's width; the centre readout uses `cqi` units against
  `.ring-wrap` (`container-type: inline-size`) so it always fits. The first
  build used r=42/64/86 at stroke 15 — an 85 px hole — and "1,130" overlapped
  the sodium arc.
- **No glow.** The `drop-shadow` halos on the arcs were pulled ("panget din ng
  glow effect di ko trip"). Arcs are flat gradients now.
- **Bubbles ride inside the tube.** Per arc: a second circle with
  `stroke-dasharray="0.01 N"` and round caps (dashes render as dots), masked by
  a `<mask>` holding a white-stroked circle carrying the *same* dashoffset as
  the arc — so bubbles are clipped to the filled portion. `setRings` updates the
  mask alongside the arc, and CSS gives `[data-mask]` the same 1.05s transition
  or bubbles run ahead of the tube while the ring fills. Two streams (big/small,
  different durations) sell it as liquid cooling rather than a dotted border.
  **The `-40.01` / `-27.01` in the `ringFlow*` keyframes must equal the
  dash+gap periods in `ui.js`,** otherwise the loop visibly jumps.
- A first attempt floated bubbles in the middle hole and looked wrong — and had
  a real bug worth remembering: `transform: translateY(-135%)` resolves against
  the *element's own* height (6 px), not the container, so they barely moved.
  Percentage `bottom` is what resolves against the parent.

## Other fixes from the same pass

- **WHO, not DOH** — the 50 g sugar / 2,000 mg sodium figures are WHO guidance.
- **`min-width: 0` on grid/flex children.** A number input's intrinsic width is
  ~176 px, and grid items default to `min-width: auto`, so the two-column Body
  card pushed itself wider than a 390 px phone.
- **Spinner arrows killed globally** on `input[type=number]`.
- **`#movePane` needed its own `gap`.** The sheet body's gap only reaches its
  direct children, so the textarea, chips and CTA inside the pane were touching.
  That's what `.pane` is for now.
- The Me tab's "about" card was removed.

## Zoom is locked (2026-09-05)

It should feel like an app, so nothing about it zooms. Four locks, because no
single one is enough on iOS:

1. `maximum-scale=1, user-scalable=no` in the viewport meta — respected by
   Android and by iOS in standalone (Add to Home Screen) mode.
2. `touch-action: pan-x pan-y` on html/body — panning yes, pinching no.
   `touch-action: manipulation` on every button also kills double-tap zoom and
   the 300 ms tap delay.
3. **`lockZoom()` in `app.js` swallows `gesturestart` / `gesturechange` /
   `gestureend`.** Safari has ignored `user-scalable=no` since iOS 10 and does
   not honour `touch-action` for pinch, so these events are the only handle a
   web page actually gets. It also drops any `touchmove` carrying more than one
   touch, for browsers that route a pinch through touch events.
4. **Every text field is at least 16px.** iOS zooms the page whenever you focus
   an input under 16px, which is the zoom you'd hit constantly on the review
   sheet. Visual hierarchy in those fields comes from colour and weight instead
   of size — that's why `.item-qty` and `.review-brand` are 16px at weight 300.

## Known trade-offs

- **RTDB path is unauthenticated**, like every other app on this database.
  Anyone who knows the URL could read `/kain`. That's why it isn't linked from
  the root hub page — same posture as `mac-toggle/`.
- No offline queue beyond what the Firebase SDK holds in memory; the last 14 days
  are mirrored to localStorage purely so a cold start paints instantly.
- Estimates are estimates. The prompt pushes hard on Filipino sodium (toyo,
  patis, bagoong, instant noodles, fast food) because that's the number most
  likely to be badly under-guessed.
