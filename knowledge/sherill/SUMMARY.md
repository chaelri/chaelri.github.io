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
  image animated with `rotateY(±14deg)` and a counter-animated contact shadow. No WebGL, no
  plate or border around the car — it floats directly on the sheet's white. It is an **idle
  sway only, not interactive**: a `bindTurntable` pointer handler existed but was never called
  from anywhere, so the "Move your cursor to turn it" hint promised an interaction that never
  ran. Charlie caught it 2026-08-13; the hint, the dead function and the orphaned
  `.turntable__hint` / `.is-manual` CSS were all removed. Don't re-add the hint without
  actually wiring the handler.
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
- **The price authority is the dealership's internal promo master, not nissan.ph and not the
  scanned flyer.** Sherill has two documents and they are NOT equivalent:
  - **`INTERNAL PROMO-AUGUST -SEPT 2026.pdf`** — the real one. Marked *Confidential*, prepared
    by the F&I Manager, GM-approved, carries an explicit promo period. Filed at
    `~/Documents/` (outside this repo on purpose). **Use this.**
  - A scanned **"SALES COPY"** flyer — abbreviated, and it misled us twice on 2026-08-13
    before the PDF arrived. Do not treat it as complete.
- **Only the price/variant/inclusives half of that PDF is public.** Its **Cash Discount** and
  per-bank **Promo Cash Out** columns are deliberately NOT in `data.js` — that's the
  dealership's subsidy structure and Sherill's negotiating room, and anything in this repo is
  readable via view-source. Same rule as the bank sheet's DI column. See
  `~/Documents/sherill-bank-DI-internal.md`.
- **Two corrections the scan caused, don't reintroduce them:**
  - Almera VL is **₱1,199,000**. The scan's ₱1,199,000-vs-₱1,219,000 confusion is because
    ₱1,219,000 is the *premium-colour* row, not the base.
  - Patrol has **six** rows and its base is **₱5,335,000** (no rear display). The scan listed
    only the rear-display tier renamed by colour, which made it look like a 4-row lineup
    starting at ₱5,385,000 — collapsing it that way deletes a genuinely cheaper option.
    Colour surcharges relative to base: premium colour +₱30,000, 2-tone +₱20,000,
    premium 2-tone +₱50,000, rear display +₱50,000.
- **KICKS prices are confirmed as of 2026-08-13** — EL ₱1,179,000 / VE ₱1,279,000 /
  VL ₱1,479,000, each +₱20,000 for premium colour. There is **no "LE Plus"** in the master
  list, so the old "ask for price" placeholder is gone. The long-standing "unconfirmed, ask
  her" note is retired.
- **X-Trail e-POWER's palette was wrong before 2026-08-13.** Champagne Silver / Gun Metallic /
  Galaxy Black never existed on the PH car. The real four are Cardinal Red Metallic, Sahara
  Dune Metallic, Everest White, Stealth Pearl Gray, sold as four price tiers: base
  ₱2,290,000 (red / dune), premium monotone ₱2,310,000 (white / gray), 2-tone ₱2,310,000
  (dune + black roof), premium 2-tone ₱2,320,000 (white or gray + black roof).
- **Navara colours are per-variant-group**, not one flat list — VL 4x2/4x4, VE Calibre 4x2
  MT/AT, and EL 4x2 MT + VE 4x4 MT each have their own set. The pre-2026-08-13 flat list
  (Twilight Gray, Burning Red, Stealth Pearl Gray) was wrong on all three.
- **Open with Sherill:** PRO-4X 4x4 AT and Calibre-X AT 4x2 have no colour list yet, and
  First United Finance & Leasing appears twice in the bank sheet with different 36/48-month
  rates (both are on the site, labelled, pending her answer).
- **KICKS e-POWER prices are unconfirmed** — the official price guide omits the model and
  public listings disagree by ~₱60k per variant. Her "LE Plus" variant isn't published
  anywhere, so it renders as "Ask for price" instead of an invented number. **Ask her.**
- **The auto loan application (`#apply`) is copy-only, and that is a hard constraint.** Added
  2026-08-13 at Sherill's request — she wanted the in-house credit application on the site,
  "di lang quote". It collects real PII: TIN, monthly income, home address, employer, plus a
  co-maker's details, i.e. a *third party's* data. There is no backend, so the only transport
  is the clipboard. Specifically: it never touches localStorage, and the email button opens a
  **blank** message — do NOT "finish the job" by prefilling a `mailto` body, because that
  would put the applicant's TIN and income into a URL. The only URLs the flow builds are
  Sherill's own Viber number and email plus a static subject. An on-form notice also tells
  applicants not to upload IDs to the page.
- **Requirements come from Sherill's message, not the promo flyer** — she lists **3** valid
  government IDs (the flyer says 2), ITR 1707 w/ AFS for self-employed, and proof of billing
  for all three categories. Her formal `CREDIT APPLICATION FORM- MGM_2026.xlsx` has more
  (bank references, 3 personal references, a partnership/corporation sheet); the site
  deliberately implements only her practical field list.
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
