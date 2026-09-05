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
- **Exercise offsets intake; the goal never moves.** `totalsFor` returns
  `budget` (always the raw goals) and `net` (`kcal - burn` when
  `exerciseAddsBudget`, sugar/sodium untouched), and `left = budget - net`.
  Every goal comparison and meter in the app, history, partner sheet and the
  Discord embed uses `t.net[key]`; `t.kcal` is only the "eaten" chip. The
  earlier version inflated `budget.kcal` by the burn, which showed the target
  as 1,700 after a workout — the remaining number was the same but the goal
  appeared to drift, which Charlie flagged: "1500 kcal pa rin kahit nag-add ako
  ng workout, pero may indicator na parang nabawasan." The calorie legend row
  carries that indicator: `710 eaten − 200 moved`.
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

## Suggestion chips are your own history (2026-09-05)

The typed-meal and workout sheets used to offer invented examples. They now show
your **last 5 distinct meals / 4 workouts** (`recentMeals` / `recentWorkouts` in
`store.js`, newest first, deduped by title). Tapping one **skips Gemini
entirely** — the breakdown is already stored, so it opens the review sheet
prefilled and costs nothing. Workouts recompute the burn against the current
weight rather than reusing the stored number. The invented examples remain as
the empty-history fallback.

## Discord notifications (2026-09-05)

Every new log posts an embed to the couple's Discord channel: author line
("Charlie ate something"), the dish, the item breakdown, three inline fields,
and `▰▱` meters for the day. Amber for Charlie, rose for Karla, green for
movement, red when the day is over any goal. A meal's stored thumbnail rides
along as a multipart attachment so the post shows the actual plate.

**The webhook URL is server-side only.** kain is static GitHub Pages, so a URL
in the bundle is public, and scrapers hunt Discord webhooks specifically —
GitHub's own push protection blocks them for that reason. It lives on Cloud Run
as `KAIN_DISCORD_WEBHOOK`; the client posts a summary to `POST /kain-notify` on
`gemini-proxy` and only that service knows the destination.

The endpoint is public, so it is hardened rather than trusted: whitelisted
`who`, whitelisted `kind`, every number clamped, every string capped,
`@everyone`/`@here` defanged plus `allowed_mentions: { parse: [] }`, image capped
at 400 KB, and a rolling 30/hour per IP + 120/hour global limit. A missing env
var returns `{ok:true, skipped}` — a notification must never surface as an error
while someone is mid-log.

Wired at **`addEntry` in store.js**, not at each call site, so edits and deletes
stay silent by construction.

## Seeing each other's day (2026-09-05)

The partner card on Today now lists the other person's actual meal names and
opens `openPartnerSheet()` — their totals plus every entry, each with a one-tap
**Same** button that copies the row onto *your* day (new id, current timestamp).
Read-only on their side: copying only ever writes to the tapper's own subtree.
Charlie's framing: "parang ganon magasawa namin kami e."

Also: the AI tweak box in the review sheet used to render only for a fresh photo
or fresh typed meal, so a meal you came back to had no way to ask for a change.
It is always present now; without a photo the re-read describes the current
draft (title, brand, items) and appends the correction.

## Movement is one box (2026-09-05)

Workout and Steps were separate tabs. Merged, because the split asked the wrong
question first: **steps accumulate across a whole day while everything else here
is a session**, and sometimes a step count is all you have ("di na natrack kung
saan nagpunta so steps na lang"). One textarea now takes any of them.

The prompt got substantially stricter, after "4km per hour 60 mins 30sec" came
back as plain *Walking, 60 min, MET 2.8* with the pace and the 30 seconds
thrown away:

- **Pace-aware METs** — a walking table by km/h (3.2→2.8, 4.0→3.0, 4.8→3.5,
  5.6→4.3, 6.4→5.0) plus running, so intensity follows what was described.
- **Fractional minutes** — "60 mins 30sec" is 60.5, not 60. `saveMove` no longer
  rounds to whole minutes either.
- **`pace_kph` / `distance_km`** when stated or derivable, shown in the burn note.
- **`understood`** — a plain echo of what was read, displayed on the confirm
  sheet so a misread is obvious before saving.
- **Bare step counts** are a first-class log: name it Walking, keep the steps,
  infer minutes at ~110 steps/min, never invent a pace or route.
- Steps never invented from a distance.

The confirm sheet keeps the raw sentence (`described` on the entry), shows the
Steps field **only when steps were actually mentioned**, and carries the same
"tell me what to change" box the meal sheet has. Result for that input:
*Walking at 4 km/h · 60.5 min · MET 3.0 · 4.03 km · 201 kcal*.

## Copying from your partner

Tapping a row in the partner sheet opens their entry read-only (totals, full
item breakdown, their assumptions). **Same** does not write immediately — it
opens the normal review sheet prefilled, so the distribution is visible and
portions can be adjusted first. Charlie's ask: "when I click same, makikita yung
distribution bago i actually log it." She eats less than he does; the numbers
rarely transfer one for one.

## The offset is visible on the ring too (2026-09-05)

`setRings(root, pcts, ghosts)` takes an optional third map. For calories it gets
the *pre-offset* share, drawn as `.ring-give` on the same radius **underneath**
the solid arc — so the only green that shows is the stretch between net and
eaten. No arc-segment maths: it's the same dashoffset trick as a progress arc,
just at a further percentage, hidden behind the one on top.

**`setRings` no longer runs inside `requestAnimationFrame`.** The rAF was there
to give the browser a "from" offset before transitioning, but rAF never fires in
a throttled or background tab — the rings then sat empty until something else
forced an update. It now forces a reflow (`void root.offsetWidth`) at the top of
`setRings`, which does the same job and always runs. (Found because the test
iframe was being throttled and the arcs stayed at zero.)

## Ring centre, faces, and small removals (2026-09-05)

- **The middle of the ring is a button.** It swaps between `left` (what's still
  available) and `total` (what counts so far, with "of 1,500 kcal" under it —
  the total mode shows `net`, so the number always agrees with how far the ring
  has filled). Both that choice and the focused metric are saved to the profile
  (`ringMode`, `ringMetric`), so the ring opens the way you left it on either
  phone. A small `swap_vert` in the eyebrow is the only affordance.
- **Real photos** replace the C/K initials everywhere — chip, welcome gate,
  switcher, partner card — copied from `money/assets/` into
  `kain/assets/people/` so kain stays self-contained. `avatar()` in `util.js`
  keeps the initial *behind* the image as the fallback. **No `loading="lazy"`**:
  the avatar is rendered while `#app` is still hidden and Chrome then never
  loads it. The Discord embed's author icon uses the same files off GitHub Pages.
- **Movement logs have an editable time**, same as meals — you rarely log a
  workout the moment you finish it. `saveMove` takes `ts` on both the create and
  the update path.
- **Scrollbars are hidden app-wide** (`scrollbar-width: none` +
  `::-webkit-scrollbar { width: 0 }`). Scrolling is untouched; the bar was just
  noise down the side of what is meant to feel like an app.
- Removed: the "Saved on this device" subtitle and the "Male · 26" line from the
  person cards.
- **Timeline tiles say what kind of entry it is.** A meal without a photo always
  gets `restaurant` (it used to show `edit_note` when typed, which described how
  it was logged rather than what it was), on an amber tile — mirroring the green
  tile movement already had.

## Known trade-offs

- **`/kain` has no backups and is in daily real use.** Never delete or write
  that RTDB node for testing — a single REST `DELETE` on it wiped a real log on
  2026-09-05, and because the localStorage cache follows the server, the device
  copy went too. Test read-only, or seed under a separate root.
- **RTDB path is unauthenticated**, like every other app on this database.
  Anyone who knows the URL could read `/kain`. That's why it isn't linked from
  the root hub page — same posture as `mac-toggle/`.
- No offline queue beyond what the Firebase SDK holds in memory; the last 14 days
  are mirrored to localStorage purely so a cold start paints instantly.
- Estimates are estimates. The prompt pushes hard on Filipino sodium (toyo,
  patis, bagoong, instant noodles, fast food) because that's the number most
  likely to be badly under-guessed.
