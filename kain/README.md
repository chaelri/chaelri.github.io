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
| Sugar   | 38 g *added* | WHO: under 10% of energy   |
| Sodium  | 2,000 mg     | WHO: flat adult limit      |

Two different kinds of number. **Sugar scales with your calorie target** —
WHO caps *free sugars* at 10% of energy, so 1,500 kcal means 38 g, not the 50 g
everyone quotes (that's 10% of 2,000). **Sodium doesn't scale**: 2,000 mg is a
flat adult figure, the same for both of you whatever you eat.

"Free sugars" means added sugar, syrups and juice — **not** the lactose in plain
milk or the sugar inside whole fruit. So the app judges you on added sugar and
keeps the total as context: a banana and 500 ml of milk is ~39 g of sugar and
**zero** that counts. Each meal's detail shows the full figure in one line; the
main screen never does.

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
- **Movement** — one box for everything: "30 min brisk walk", "4 km/h
  treadmill, 60 mins", or just "8,500 steps". Workout and Steps used to be
  separate tabs, which asked the wrong question first — steps accumulate across
  a whole day while everything else is a session. The AI reads the pace, the
  seconds and any step count; a step count wins the maths when given
  (`kcal ≈ steps × kg × 0.0004`), otherwise it's `MET × 3.5 × kg × min / 200`.
  METs are pace-aware, so 4 km/h is 3.0 and not the generic walking 2.8.
  Your own sentence is quoted back on the confirm sheet and stored with the
  entry, and a "tell me what to change" box re-runs the estimate.
- **Same as your partner** — the partner card on Today opens their full day.
  Tap a row to read their breakdown; tap **Same** and the review sheet opens
  with the whole distribution so you can adjust portions *before* anything is
  written. You eat the same food most days, but rarely the same amount.
- **Log again** — repeat any past meal onto today with no AI call at all. The
  same shortcut sits under "Had it again?" in the typed-meal sheet: your last 5
  distinct meals as chips with their calorie counts, and tapping one opens the
  review sheet with the stored breakdown already filled in. The workout sheet
  does the same with your recent workouts, re-running the burn against your
  current weight.

**The goal never moves.** A workout doesn't turn 1,500 into 1,700 — it comes
off what you ate instead, so the calorie row reads `510 / 1,500` with
`710 eaten − 200 moved` underneath. The number left over is identical either
way; this just stops the target drifting. Only calories can be offset: you
can't out-walk salt, so sugar and sodium never budge. Toggle in Me.

## Discord

Every **new** log posts an embed to our channel — who ate what, the item
breakdown, the three numbers, and a text meter for the whole day. Edits and
deletes stay quiet so the channel keeps being worth reading.

**The webhook URL is not in this repo and must never be.** This is a static
site on GitHub Pages: anything the client holds is public, and bots scrape
public repos for Discord webhook URLs specifically. The URL lives on the Cloud
Run proxy as `KAIN_DISCORD_WEBHOOK`; the browser posts a plain summary to
`POST /kain-notify` and only the proxy knows where it goes.

```bash
gcloud run services update gemini-proxy --region asia-southeast1 \
  --update-env-vars KAIN_DISCORD_WEBHOOK=<url>
```

That endpoint is public, so it is deliberately boring: strict payload shape,
hard caps on every number and string, `@everyone` / `@here` neutralised plus
`allowed_mentions: []`, and a rolling limit of 30/hour per IP and 120/hour
overall. Worst case someone wastes our quota — they still never learn the URL.
If it does leak, delete the webhook in Discord and make a new one; the URL is
the entire credential.

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
- **The give-back shows on the ring.** When exercise offsets calories, a second
  arc is drawn to where the ring *would* have reached before the offset, then
  covered by the solid arc. Whatever green tail peeks past the solid end is
  exactly what the workout clawed back — no extra maths, same dashoffset trick.
- **The bubbles are inside the tubes**, like the coolant line on a watercooled
  PC. Each arc has a second dashed circle whose near-zero dashes render as dots,
  clipped by a mask that is the *filled* part of that arc — so bubbles exist
  from the ring's start round to the current progress and no further. Crawling
  the dash offset by exactly one dash+gap period loops seamlessly; two streams
  at different sizes and speeds keep it from reading as a dotted border. The
  offsets in the `ringFlow*` keyframes must stay in step with the dasharrays in
  `ui.js`.
- **Behind the ring is an aura, not words.** Three blurred clouds — amber,
  rose, sky — orbit the ring on one shared 72 s clock with thirds-of-a-turn
  delays, so they stay 120° apart forever and no side of the card goes blank.
  Each cloud's opacity is the same fraction its ring is drawing, so a blank
  morning is nearly dark and a full day glows. `renderAura()` in `today.js`
  writes `--lit`; everything else is CSS.

  The first attempt scattered the day's meal titles here and it does not work:
  the ring leaves ~40 px either side on a phone, so every title arrived clipped
  into fragments that read as damage rather than atmosphere, and shortening them
  to one or two words didn't buy enough room. A blur has no edges to clip, and
  where it passes behind the ring's translucent track it reads as light instead
  of something showing through. Don't put text back here.

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

## Nothing zooms

Four locks, because no single one holds on iOS: `maximum-scale=1,
user-scalable=no` in the viewport meta; `touch-action: pan-x pan-y` on the page
(plus `manipulation` on buttons, which also kills the 300 ms tap delay);
`lockZoom()` in `app.js` swallowing the `gesture*` events, since Safari ignores
the meta and doesn't honour `touch-action` for pinch; and **every text field at
16px or larger**, because iOS zooms the page when you focus anything smaller.

## Notes

- **iOS haptics**: Safari has never shipped the Vibration API. `haptic()` in
  `util.js` toggles a hidden `<input type="checkbox" switch>`, which is the only
  route a web page has to the Taptic engine (same trick as `devo/js/01-core.js`).
- **Not linked from the repo's hub page** — the RTDB path is unauthenticated, so
  it isn't advertised, same posture as `mac-toggle/`.
- Numbers are estimates. Good enough to keep two people honest; not a lab.
