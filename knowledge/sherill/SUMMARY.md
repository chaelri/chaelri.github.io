# sherill/ — drive-with-sherill

**Built:** 2026-08-12 · **Status:** 🟢 Active (live)
**For:** Tita Sherill Obillo — Nissan Marketing Professional, Nissan Quezon Avenue.
She asked for a site of her own ("Gusto ko sana may sarili ako website").

## What it is

A one-page personal site for a Nissan *sales agent* — deliberately not branded as an
official Nissan site. Six sections: Home, Nissan models, Promos, KICKS e-POWER,
Get a quotation, Contact me.

## Deploy

- **Vercel project `drive-with-sherill`** (team `chaelris-projects`) → https://drive-with-sherill.vercel.app
- Deployed from inside `sherill/` — it is its **own** Vercel project, separate from the
  repo-root deployment (root `vercel.json` rewrites `/` to `/multiply/read/`, which is
  unrelated and untouched).
- Redeploy: `cd sherill && vercel --prod --yes`, then
  `vercel alias set <new-deployment-url> drive-with-sherill.vercel.app`
  — **the alias does not follow automatically**, every prod deploy needs the alias re-set.
- `sherill/.vercel/` and `.env.local` are gitignored (created by `vercel link`).
- Also served by GitHub Pages at `/sherill/` once pushed.

## Stack

Vanilla JS + hand-written CSS + Material Symbols Outlined. **No build step, no framework.**
Tailwind was considered (Charlie asked for it) but dropped: the v4 browser CDN is ~300 KB
of runtime JIT plus a MutationObserver scan, which fought the "buttery smooth on mobile"
requirement. The design system in `style.css` covers the same ground with no runtime cost.

## Files

- `js/data.js` — **the only file to edit for content.** MODELS (8), PROMOS, FACTOR_RATES,
  AGENT contact details, e-POWER copy, comparison table.
- `js/app.js` — rendering, motion, quotation engine, model slide-over sheet.
- `style.css` — the whole design system.
- `assets/models/*.webp` — official Nissan PH photography.
- `assets/sherill.webp` — her portrait, cropped from her own Patrol flyer.

## Decisions worth remembering

- **3D was tried and thrown away.** A three.js low-poly car (extruded side profiles, shared
  renderer, scissored viewports) worked and hit frame budget, but Charlie's call was correct:
  it read as cartoon. Real photography beats a stylised model for a car sales page.
- **Two image sets, on purpose.** `assets/models/*.webp` are the scenic key visuals
  (cards + hero reel). `assets/models/cut/*.webp` are transparent cut-outs used in
  the model detail sheet's 3D turntable — Charlie specifically wanted the car isolated there.
- **Cut-outs are made by macOS Vision, not by hand-rolled keying.** `sherill/tools-cutout.swift`
  is a ~40-line Swift tool using `VNGenerateForegroundInstanceMaskRequest` — the same subject
  segmentation as Preview's "Remove Background". Build and run it with:
      swiftc -O -parse-as-library tools-cutout.swift -o cutout
      ./cutout input.jpg output.png
  Three hand-written keying attempts came before it (flood fill + luminance ramp + per-column
  shadow clipping). All of them left white halos along rooflines and mirrors that were obvious
  at 1:1 zoom. Vision gets it right in one pass. **Don't hand-roll a matte again.**
- **Pipeline:** studio shot on white → `cutout` → crop to alpha bbox → resize to 1400 px wide
  (Lanczos) → light unsharp → WebP q90. For Patrol and X-Trail the source is Nissan PH's own
  small transparent PNG, so it gets flattened onto white and upscaled 3× *before* Vision, or
  the instance crop comes out too small.
- **The model sheet is a LIGHT panel on a dark site** — Charlie's call, and the right one.
  The panel re-points the design tokens (`--ink`, `--txt`, `--line`, …) to light values inside
  `.sheet__panel`, so every component (tables, chips, spec list, buttons) follows without
  being restyled individually. The payoff: a transparent car cut-out on white is *seamless*,
  and any residual matte fringe is white-on-white and therefore invisible. Dark grid → bright
  product sheet also reads well as a transition.
- **The detail sheet is a CSS 3D turntable.** `perspective: 1500px` on `.turntable`, the car
  image animated with `rotateY(±14deg)`, a counter-animated contact shadow, and a pointer
  handler (`bindTurntable` in app.js) that takes over the angle on hover. No WebGL, no plate
  or border around the car — it floats directly on the sheet's white.
- **Where the studio shots came from:** Zigwheels PH's colour gallery
  (`imgcdn.zigwheels.ph/large/gallery/color/…`, 930×620 manufacturer studio shots on white).
  Pick a **non-white** body colour where one exists — it segments and reads better.
- **Dead ends, don't re-run them:** `imagin.studio`'s public demo key returns a covered-car
  placeholder for every Nissan family. Brochure PDFs are dark lifestyle spreads (and their
  images are Flate-encoded, so `poppler` is required to read them at all). AutoDeal tops out
  at 700×700 and only has Terra. Zigwheels has no rendition above `/large/` (930 px).
  Nissan PH's own DAM thumbnails are 300–400 px at source — no larger rendition exists.
- **Model images come from nissan.ph's DAM** (`www-asia.nissan-cdn.net/content/dam/Nissan/ph/…`).
  The *thumbnails* linked from the price guide are only 300–400 px — too soft. The usable
  images are the desktop KV/overview JPGs on each model page (1920–2880 px), cropped to 16:9.
  Fetch them with a browser UA + `Referer: https://www.nissan.ph/`.
- **Prices** come from nissan.ph's price guide plus Sherill's own flyers (the flyers carry
  premium-color rows the website omits, and the Patrol's ₱25,000 3-year LTO column).
- **KICKS e-POWER prices are unconfirmed** — the official price guide omits the model and
  public listings disagree by ~₱60k per variant. Her "LE Plus" variant isn't published
  anywhere, so it renders as "Ask for price" instead of an invented number. **Ask her.**
- **The quotation form has no backend by design.** It composes a message and hands it to
  Viber / SMS / email / clipboard. Viber can't take pre-filled text from a deep link, so the
  Viber button copies the message first, then opens the chat, and the toast says to paste.
- **Financing estimate** = `(SRP − DP) × FACTOR_RATES[term]`, using indicative PH bank factor
  rates. Labelled an estimate everywhere it appears.
- Footer carries an explicit "not an official Nissan Philippines website" disclaimer.

## Gotchas

- `img { height: auto }` is load-bearing — the HTML `width`/`height` attributes otherwise beat
  `aspect-ratio` and stretched the portrait to 748 px tall.
- `history.scrollRestoration = 'manual'` — without it a reload lands mid-page and the hero
  looks blank.
- Reveal animations are `IntersectionObserver` + `opacity`/`transform` only. Screenshots taken
  <1 s after load will look half-faded; that's the animation, not a bug.
