# drive-with-sherill

Personal site for **Sherill Obillo** — Nissan Marketing Professional at **Nissan Quezon Avenue**.
Built as a static, no-build page: vanilla JS + hand-written CSS + Material Symbols.

Live: `drive-with-sherill.vercel.app` (Vercel project `drive-with-sherill`).
Also served from this repo at `/sherill/` on GitHub Pages.

## Sections

| # | Section | What's in it |
|---|---------|--------------|
| 1 | Home | "Find Your Next Nissan", Sherill's photo, auto-cycling model reel, badges (free quotation / financing / trade-in) |
| 2 | Nissan models | All 8 models, filter chips, full variant + price tables, colors, specs — in a **light** slide-over sheet with a 3D-turning cut-out of the car |
| 3 | Promos | August–September 2026 offers + financing partners |
| 4 | KICKS e-POWER | How e-POWER works (4 steps), ownership benefits, powertrain comparison table |
| 5 | Get a quotation | Name, mobile, model, variant, cash/financing, DP slider, term, bank, trade-in → live monthly estimate |
| 6 | Contact me | Viber, call, email, showroom map |

## Files

```
sherill/
├── index.html          all markup; content containers are filled by app.js
├── style.css           the whole design system (no framework)
├── js/data.js          ← EDIT THIS to change prices, variants, colors, promos
├── js/app.js           rendering, motion, quotation engine
└── assets/
    ├── sherill.webp      portrait (cropped from her Patrol flyer)
    ├── models/*.webp     official Nissan PH key visuals, 1400×787 (cards + hero reel)
    └── models/cut/*.webp    transparent cut-outs (model detail sheet turntable)
```

## Updating prices

Everything a client sees comes from `js/data.js`:

- `MODELS[].variants[]` — `{ name, trans, price, lto?, note? }`. Set `price: null` plus a
  `note` when a variant has no published SRP yet (renders as "Ask for price").
- `MODELS[].colorGroups[]` — `{ label, colors: [{ name, hex, extra?, roof? }] }`.
  `extra` is the premium-color surcharge; `roof` renders a two-tone swatch.
- `PROMOS[]` — the promo cards. `AGENT.promoWindow` is the date range shown above them.
- `FACTOR_RATES` — indicative monthly amortization factors per term. The estimate is
  `(SRP − down payment) × factor`. Clearly labelled as an estimate in the UI.

No build step. Save the file, reload the page.

## Notes on the data

- Prices are SRP, VAT-inclusive, taken from nissan.ph's price guide (August 2026) and
  Sherill's own flyers for Terra / Patrol / Almera / Livina (which carry the premium-color
  rows that the website's summary table omits).
- **KICKS e-POWER prices need confirming with Sherill.** Public listings disagree
  (₱1.179M/1.279M/1.479M vs ₱1.239M/1.339M/1.539M for EL/VE/VL) and the price guide
  doesn't list the model at all. The `LE Plus` variant she mentioned isn't published
  anywhere public, so it renders as "Ask for price" rather than carrying an invented number.
- Model photography is Nissan Philippines' own imagery from nissan.ph, cropped to 16:9.
- `models/cut/` holds transparent cut-outs, made with `tools-cutout.swift` (macOS Vision
  subject segmentation — the same engine as Preview's "Remove Background"). Rebuild one with:
  `swiftc -O -parse-as-library tools-cutout.swift -o cutout && ./cutout in.jpg out.png`.
  The model sheet spins them with a CSS 3D turntable (perspective + rotateY), and they follow
  your cursor on hover.

## Design / performance

- Only `transform` and `opacity` are animated — no layout-thrashing properties.
- Scroll work is `requestAnimationFrame`-batched; reveals and the hero reel use
  `IntersectionObserver` and stop when off-screen or when the tab is hidden.
- Full `prefers-reduced-motion` support (animations off, reel stops auto-advancing).
- Images are WebP, lazy-loaded below the fold, with intrinsic `width`/`height` set.

## The quotation form has no backend

Nothing is stored or posted anywhere. The form composes a message and hands it to the
user's own app: Viber (copies the text to the clipboard, then opens the chat — Viber
can't accept pre-filled text from a link), SMS, email, or plain clipboard copy.

The same goes for the loan application and the test drive / service bookings — copy-only
by design, because they carry real PII.

## Registration → her inbox

**Google Form:** https://forms.gle/sH76wAU3CHbHziaG6 — the link Sherill hands out and the one the booth QR
encodes. Answers file into the *drive-with-sherill — leads* sheet and an Apps
Script trigger emails the whole lead to her and to Charlie the moment it's
submitted.

### `register/` — the branded page, same destination

`register/` is a QR-scannable lead capture page: five fields, Send, and the lead lands in
Sherill's and Charlie's inbox plus a Google Sheet. Built for booths and expos, where
nobody is going to copy a block of text into Viber.

- `/register/` on her site, `/register/?event=medical-expo` for an event (adds company /
  role / units and tags the lead).
- Delivery is a Google Apps Script web app, **deployed and live since 2026-08-19** —
  the code is `register/apps-script.gs`, the account-side details are in
  `register/README.md`. It writes to the *drive-with-sherill — leads* sheet and mails
  both inboxes. If it ever fails, the page falls back to the copy-only contract above.
- `/register/?test=1` runs a real submission that emails Charlie only, tagged `[TEST]`.
- `register/qr.html` prints the booth QR card. `noindex`, not linked from the site.

## Disclaimer

This is a Nissan sales professional's personal site — not an official Nissan Philippines
website. That's stated in the footer. All model names, prices and trademarks belong to Nissan.
