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
- **Manufacturer rate promos live in `RATE_PROMOS` and expire by themselves.** First one:
  Nissan × RCBC on the X-Trail, Aug 10 – Dec 31 2026, add-on 12.81 / 17.75 / 22.88% for
  36 / 48 / 60 months against RCBC's standard 39.39 / 47.48 / 56.55%. That is roughly ₱10,000
  a month at 60 months, so quoting the standard rate on an X-Trail is badly wrong. Resolution
  is bank + model + term, and `activePromo()` gates on the promo's own dates — no cleanup task
  when it lapses. Its cash side ships as **₱40,000**, not the flyer's ₱50,000 headline: the
  extra ₱10,000 only applies to sales closed at a car display, so the bigger number is an
  "up to" in the note.
- **Her promo flyers are mixed documents** — a customer-offer panel on top, dealer operations
  underneath (display guidelines, event subsidies and their reimbursement rules, dealer
  incentive %, internal tagging requirements). Only the customer half ships, same call as the
  bank sheet's DI column and the promo master's cash-out grid.
- **Comments in `sherill/js/*` are served to the public.** A leak sweep on 2026-08-13 caught a
  code comment that named the internal programme mechanics it was explaining we withhold — no
  figures, but the terminology alone identifies the programme. Keep internal vocabulary out of
  comments, not just out of values. Worth re-running a sweep after any promo edit:
  `curl` the deployed `data.js` / `app.js` / `index.html` and grep for internal terms, but
  anchor the numeric patterns — unanchored ones match inside legitimate SRPs (`110000` hits
  `2110000`).
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

## Low all-in DP promo (added 2026-08-13)

Sherill asked for the promo down payment to show **per unit** on the site rather than
only over chat, and sent the figures herself. This is the first time promo cash-out
numbers ship — the earlier "keep Promo Cash Out out of the repo" rule was Charlie's
protective default, and the data owner has now published them deliberately. The bank
sheet's **Dealer's Incentive is still held back.**

- `DP_PROMO` (window, terms, note) + `DP_PROMO_UNITS` (variant name → pesos) in `data.js`.
  A small IIFE stamps `v.promoDp` onto the matching variants and `console.warn`s any
  lookup key that matches no variant — a rename is a loud failure, not a silent no-op.
- **All-in** = down payment + chattel mortgage + insurance, not the DP alone.
- **The bank still approves on a 20% DP basis**, so `amount financed` and the monthly are
  unchanged; the promo only changes the cash out. Getting this backwards would understate
  every monthly on the site.
- **36 / 48 / 60 months only.** At 24 and below, DP, chattel and insurance are paid
  separately and the computation differs — the calculator says so instead of guessing.
- At 30/40/50% DP the all-in figure is a different number she quotes by hand; the
  calculator surfaces that rather than showing the 20% figure.
- Everything keys off `dpPromoRunning()` — past `DP_PROMO.end` the badges, the sheet
  column and the calculator note all switch themselves off. Same discipline as `RATE_PROMOS`.
- Variants she didn't name (Terra EL, Navara EL / VE MT 4x4 / VL, KICKS, X-Trail, Urvan)
  carry no figure and stay quiet.
- ⚠️ Her list puts **Navara Calibre VE MT at ₱128K above the AT at ₱98K** — backwards from
  the usual pattern. Transcribed as sent; confirm before treating it as settled.

## Promo poster studio — `poster/` (added 2026-08-13)

Sherill posts promo images to Facebook and wanted hers to out-pull the other dealers'.
`poster/` is an internal tool (noindex, linked only from the footer) that renders a
1080 square or 1080×1920 story PNG on a canvas: her name, the model cut-out, the big
all-in figure, SRP, contact, and the not-an-official-Nissan-site line.

- Reads `../js/data.js` directly, so a promo edit reprints every poster. Nothing is typed
  into the poster code.
- **All vertical metrics live in the `SIZES` object**, not sprinkled through `draw()`.
  The square canvas is genuinely tight — it drops the perk chips that the story keeps.
- The footer is measured **up from the bottom edge** and only the phone row has a
  right-hand item; the fine print is wide enough to collide with anything beside it.
- Canvas needs `document.fonts.ready` before the first paint or Inter hasn't loaded and
  every `measureText` is wrong.
- Uses her own branding deliberately — it does not reproduce a Nissan or other-dealer
  ad layout.

## Registration → inbox (2026-08-19)

**Charlie asked for a Google Form, and that is the front door.** Live at
https://forms.gle/sH76wAU3CHbHziaG6 (long form `.../d/e/1FAIpQLSeuBohpsq7joJx.../viewform`), built by
`createLeadForm()` in `sherill/register/apps-script.gs` so the questions are
version-controlled rather than clicked into existence. The site's Register card,
the "in a hurry" line under the quotation buttons and `register/qr.html` all
point at it.

- **An `onFormSubmit` trigger does the emailing**, not Forms' built-in
  notification — that one reaches the owner only and carries no answers, just a
  "you have a new response" link. The trigger mails every field with the
  customer as `replyTo`.
- ⚠️ **The trigger is installed on the FORM, so the event object is
  `e.response` (a FormResponse) — NOT `e.namedValues`.** `namedValues` is the
  *spreadsheet* form-submit shape; reading it on a form trigger yields undefined
  and mails a blank lead. That is exactly what the first live submission did.
  `onLeadFormSubmit()` handles both shapes now.
- `FORM_TEST_ONLY = true` sends form submissions to Charlie only, tagged
  `[TEST]`. Triggers run the *saved* code, so no redeploy is needed for that
  flag — unlike the web app, which serves the deployed version.

### The branded page — `register/`

Charlie saw the Microsoft Forms QR page Nissan Philippines ran at the **Phil Medical Expo
2026** (company / name / role / company email / mobile / which vehicles) and wanted the
same for Sherill, except landing in **her** inbox and his.

`register/` is the **only form on this site that leaves the browser**. That's a deliberate
exception, not a change of policy: it's meant to be scanned off a QR at a booth by someone
with ten seconds who will not open Viber and paste a block of text. The quotation, loan
application and bookings stay copy-only — the loan form especially, it carries TIN and income.

- **Two modes, one page.** `/register/` is the plain website form; `/register/?event=<tag>`
  adds Company / Role / "how many units", shows an event banner, and tags the lead so a
  booth day is one filter in the sheet. Known events live in `EVENTS` at the top of
  `register.js`; an unknown tag still works (it title-cases the tag).
- **Delivery is a Google Apps Script web app — set up and live since 2026-08-19.**
  Sheet *drive-with-sherill — leads* (`1mqDSErqFUSJ8IcXfQNnk2_6KvzjQvID-W_FhHad-QJs`),
  script *drive-with-sherill — register* bound to it, deployed as a web app
  *Execute as me / access Anyone*. It appends a row to the `Leads` tab and emails the
  full lead to `sherillf20@gmail.com` + `charliecayno@gmail.com` with `replyTo` set to
  the customer, then acknowledges the customer if they left an email. Free Gmail quota is
  100 recipients/day — a booth day is nowhere near it.
- **Why Apps Script and not `gemini-proxy`.** The proxy was the obvious home — it already
  has Sheets endpoints and a Gmail-scoped helper — but every OAuth refresh token in this
  repo was dead on 2026-08-19, locally *and* in the Cloud Run env (`/sheets-labels` →
  `invalid_grant`). That's the OAuth consent screen sitting in **Testing**, where refresh
  tokens expire after 7 days. A lead form on that footing would break weekly. Apps Script
  runs as Charlie with no token to expire.
- **A brand-new deployment is slow for its first minutes** — POSTs took 55–75 s and the
  response redirect 404'd while the sheet writes and emails still landed; it settled to
  1–3 s on its own. Don't chase it with re-deploys.
- **`/register/?test=1`** posts through the real endpoint but mails Charlie only, subject
  `[TEST]`, no customer acknowledgement (`d.test` → `TEST_RECIPIENT` in the script). That
  is how the whole path is exercised after a change without a fake lead reaching Sherill.
- **`Content-Type: text/plain` on the POST is load-bearing.** Apps Script web apps cannot
  answer a CORS preflight, and `application/json` triggers one. text/plain keeps it a
  simple request; the script reads `e.postData.contents` either way.
- **The endpoint is not committed configured** — `ENDPOINT` in `register.js` is empty until
  the deploy URL is pasted in. With it empty the page falls back to the copy-only contract
  (fills a text block, offers Copy + Viber), so it was safe to ship before the script existed.
  The same fallback catches a dead network or a script error, and nothing typed is ever lost.
- **Apps Script serves the old code until you redeploy** — Manage deployments → New version.
  The URL stays the same.
- Model chips come from `MODELS`, plus two things the list can't cover: *Fleet / special
  build* (the ambulance conversions the medical expo asked about) and *Not sure yet*.
- Consent checkbox + an off-screen honeypot (`.hp`, positioned off-canvas, not
  `display:none`, so a bot's DOM walk still finds it). A honeypot hit gets a 200 and is dropped.
- **`[hidden] { display: none !important; }` is in `register.css` on purpose** — the event
  banner is `display: flex`, which beats the UA rule for the `hidden` attribute, and the
  empty banner showed on the plain form until this was added.
- `register/qr.html` (noindex, unlinked) generates the booth QR + a printable white table
  card, using `qrcode-generator@1.4.4` off esm.sh — same import the elevate ticket printer uses.
- Entry points on the main site: a **Register** card in the contact grid and a quiet
  "In a hurry? Just leave your details" line under the quotation buttons.

## Test drive + service booking — `#book` (added 2026-08-13)

Sherill asked for nissan.ph's "Book a test drive" and "Schedule a service appointment".
Both are **copy-only, same contract as the loan application** — no backend, no
localStorage, no personal data in a mailto/Viber URL.

- `TESTDRIVE_GROUPS` / `SERVICE_GROUPS` in `data.js` use the same `{group → fields}` shape
  as `APPLICATION_GROUPS`, so `fieldHTML()` / `groupsHTML()` / `validateForm()` in `app.js`
  are shared by all three forms. Adding a fourth form is data, not code.
- Both panels render up front and one is `hidden`, so switching tabs keeps what was typed.
- Date inputs get `min = today` — a booking in the past helps nobody.

## Form UI conventions (reworked 2026-08-13)

- `input[type="date"]` and `[type="email"]` were **missing from the base input selector**,
  so Chrome painted them as white default boxes on the dark form. The selector now lists
  every text-ish type and carries `color-scheme: dark`.
- An empty date input renders `mm/dd/yyyy` as **real text, not a placeholder**, and
  `:placeholder-shown` does not apply to it — `app.js` toggles `.is-empty` so CSS can mute
  the mask.
- Labels inside `.apply-form` are sentence case, not the site's uppercase — 17 shouty
  labels in a column is a wall. Only **required** fields get a tag; tagging the majority
  "Optional" is louder than the labels.
- `.apply-grid` is a 12-column bed with `.field--s4/6/8/12`, collapsing to 2 columns at
  860 px and 1 at 620 px. Inputs go to 16 px on phones so iOS Safari doesn't zoom on focus.
- Groups are spread across several containers within a step, so spacing is
  `.apply-group { margin-top }` plus a first-child reset — a sibling selector can't see
  the container boundaries.

## Showroom photo lightbox

`.shots__open` buttons in the model sheet open `#lightbox` (z-index 190, above the sheet's
120). Escape closes the lightbox first and leaves the sheet open, and the body stays
locked while the sheet is still up. Arrow keys and touch swipe page through.

## Gotchas

- `img { height: auto }` is load-bearing — the HTML `width`/`height` attributes otherwise beat
  `aspect-ratio` and stretched the portrait to 748 px tall.
- `history.scrollRestoration = 'manual'` — without it a reload lands mid-page and the hero
  looks blank.
- Reveal animations are `IntersectionObserver` + `opacity`/`transform` only. Screenshots taken
  <1 s after load will look half-faded; that's the animation, not a bug.
