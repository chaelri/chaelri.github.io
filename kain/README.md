# Kain

Food log for Charlie & Karla. Take a picture of the plate, Gemini reads it, and
the day's **calories, sugar and sodium** tick down from the goals. Movement —
a workout or a step count — earns calories back.

Live at `/kain/` on GitHub Pages. Add to Home Screen on iOS for the standalone
app; there is **no service worker**, so every launch loads the current build.

## The three numbers

| Metric  | Default goal | Where it comes from        |
|---------|--------------|----------------------------|
| Calories| 1,500 kcal   | our shared target          |
| Sugar   | 50 g         | WHO daily guidance         |
| Sodium  | 2,000 mg     | WHO daily guidance         |

Editable per person in **Me**. Charlie and Karla track separately — different
RTDB paths, one small read-only card each so you can see how the other is doing.

## Logging

- **Photo** — the plate is downscaled to 768 px in the browser, sent to Gemini
  through `gemini-proxy`, and comes back as a per-component breakdown (rice,
  ulam, sauce, drink). Every number is editable before you save. Nothing bigger
  than the 400 px thumbnail is kept.
- **"Not quite right?"** — type what it actually is ("that's tapsilog, and the
  rice is 2 cups") and the read is redone against the same photo. Works when
  editing an old meal too: the 400 px thumbnail we keep is enough to re-read.
- **Type it** — no photo, same breakdown, cheaper model.
- **Workout** — free text ("30 min brisk walk"); the AI returns the activity's
  MET and we do the arithmetic: `kcal/min = MET × 3.5 × kg / 200`.
- **Steps** — `kcal ≈ steps × kg × 0.0004` (≈0.5 kcal per kg per km, ~1,250
  steps to a km). 10k steps ≈ 256 kcal at 64 kg.
- **Log again** — repeat any past meal onto today with no AI call at all.

Burned calories are added back to the **calorie** budget only (toggle in Me).
You can't out-walk salt, so sugar and sodium never move.

## Data

```
kain/users/<charlie|karla>/profile               goals, weight, height, toggles
kain/users/<charlie|karla>/days/<YYYY-MM-DD>/<id>  one meal or one workout
```

Firebase RTDB `test-database-55379` (asia-southeast1), the same project the rest
of the repo uses. Anonymous auth only — who you are is a localStorage pick
(`kain.who`), exactly as asked. Days are **Manila days** regardless of the
device clock. The last 14 days are mirrored into localStorage so a cold start
paints real data instead of an empty dashboard.

Meal photos are compressed before anything is kept: the entry stores a 400 px
JPEG thumbnail (~21 KB, ~28 KB as base64) — enough to remember the meal by, not
an archive copy. Three meals a day for both of us is roughly 60 MB a year
against Firebase's 1 GB free tier. The 768 px frame Gemini reads is never
stored, and the original iPhone photo never leaves the phone.

## Cost

Everything goes through `gemini-proxy` on the free-tier key.

- Photo → `gemini-3.5-flash` (~1,700 input tokens: the 768 px image is about one
  tile). It answers 503 "high demand" now and then, so `ai.js` retries once and
  then falls back to `gemini-3.5-flash-lite` rather than making you re-shoot.
- Typed meals and workouts → `gemini-3.1-flash-lite`, text only.
- One request per action. Totals are summed in JS, never by the model.

## The ring

Three concentric arcs, calories outside. Two things about it are load-bearing:

- **The centre readout is sized against the ring**, not in fixed px. The
  innermost arc (r=48, 14 stroke) leaves a hole 41% of the ring's width, and the
  `cqi` font sizes in `style.css` are tuned to it. Shrink the radius or fatten
  the stroke and "1,130" starts running over the sodium arc.
- **The bubbles are inside the tubes**, like the coolant line on a watercooled
  PC. Each arc has a second dashed circle whose near-zero dashes render as dots,
  clipped by a mask that is the *filled* part of that arc — so bubbles exist
  from the ring's start round to the current progress and no further. Crawling
  the dash offset by exactly one dash+gap period loops seamlessly; two streams
  at different sizes and speeds keep it from reading as a dotted border. The
  offsets in the `ringFlow*` keyframes must stay in step with the dasharrays in
  `ui.js`.

## Files

```
index.html          shell, tab bar, manifest link
manifest.json       PWA manifest (no sw.js — deliberate, see above)
css/style.css       the whole design system
js/config.js        people, goals, models, tuning constants
js/util.js          dates (Manila), formatting, count-up, iOS haptics
js/store.js         Firebase RTDB + state + totals
js/ai.js            image prep, Gemini calls, prompts, burn maths
js/ui.js            toasts, sheets, the triple ring, confetti
js/today.js         Today screen
js/history.js       History screen + day sheet
js/profile.js       Me screen + person switcher
js/app.js           boot, tabs, wiring
```

## Notes

- **iOS haptics**: Safari has never shipped the Vibration API. `haptic()` in
  `util.js` toggles a hidden `<input type="checkbox" switch>`, which is the only
  route a web page has to the Taptic engine (same trick as `devo/js/01-core.js`).
- **Not linked from the repo's hub page** — the RTDB path is unauthenticated, so
  it isn't advertised, same posture as `mac-toggle/`.
- Numbers are estimates. Good enough to keep two people honest; not a lab.
