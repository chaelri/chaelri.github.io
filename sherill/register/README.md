# Registration form → inbox

A QR-scannable lead capture page for Sherill. Someone scans, fills in five
fields, hits send — and the lead lands **in Sherill's and Charlie's inbox
immediately** and in a Google Sheet at the same time.

Modelled on the Microsoft Forms QR page Nissan Philippines used at the Phil
Medical Expo, but on her own site, in her own branding, and with the answers in
the body of the email instead of a "you have a new response" link.

| File | What it is |
|---|---|
| `index.html` / `register.css` / `register.js` | the form page (the only thing deployed with the site) |
| `qr.html` | booth QR + printable table card. `noindex`, not linked from the site |
| `apps-script.gs` | the backend, as deployed. **Not served with the site** — it lives in Google Apps Script |

## URLs

### The Google Forms

One per agent. Same questions, separate inbox, separate spreadsheet — a lead for
one is never emailed to the other, and neither is emailed to Charlie. He owns the
script (that's why the mail is *from* his account) but is on no distribution
list; only `[TEST]` runs reach him.

| Agent | Form | Responses |
|---|---|---|
| Sherill Obillo — sherillf20@gmail.com | https://forms.gle/sH76wAU3CHbHziaG6 | [drive-with-sherill — leads](https://docs.google.com/spreadsheets/d/1mqDSErqFUSJ8IcXfQNnk2_6KvzjQvID-W_FhHad-QJs/edit) |
| Victor Alvear — vicalvear13@gmail.com | https://forms.gle/AoV3LhXcBBwtfy3p7 | [drive-with-victor — leads](https://docs.google.com/spreadsheets/d/1B1_CA-O5hz4JNVoPvrctsXPTk8ZGvwpDDcbfChGKqIg/edit) |

Add a third agent: append an entry to `AGENTS`, then run
`createLeadForm('<key>')` once from the editor. It builds the form, makes them a
spreadsheet, and installs their trigger. Paste the logged `sheetId` back into
`AGENTS` so a re-run reuses that file instead of creating a second one.

⚠️ **A submission is matched to its agent by the form's title.** Rename a form in
the Forms UI and its leads quietly fall back to the web app's agent. Rename it
in `AGENTS[key].formTitle` and re-run instead.

### Sherill's form in detail

| | |
|---|---|
| Share link | https://forms.gle/sH76wAU3CHbHziaG6 |
| Long link | https://docs.google.com/forms/d/e/1FAIpQLSeuBohpsq7joJxms6zfFtF054WYIYHxrGmtzoJtGBE0XqxSNw/viewform |
| Edit it | https://docs.google.com/forms/d/1oVWNDr6p5MdPX_i6t44g9FI7VFIA5jdKoJoBDVRGwuQ/edit |

Built by `createLeadForm()` in `apps-script.gs` — run once from the editor, and
re-runnable if the questions change. Its answers file into the same spreadsheet
(`Form Responses 1`) and an **onFormSubmit trigger** mails the whole lead out.

Google Forms' own "get email notifications for new responses" was not enough:
it reaches the form owner only, and the mail says *you have a new response* with
a link — no answers in it. The trigger sends every field in the body, with the
customer's address as reply-to.

**The trigger is installed on the FORM, so its event object is `e.response`, not
`e.namedValues`.** Reading `namedValues` there silently yields undefined and
mails a blank lead — that happened on the first submission. `onLeadFormSubmit()`
now handles both shapes.

### The page on her own site (the branded alternative)

| Use | URL |
|---|---|
| Plain form | `/register/` |
| Event mode | `/register/?event=medical-expo` |
| Test mode (see below) | add `&test=1` |

Same destination, her own design, and it works offline-ish (falls back to
copy-and-paste). Nothing links to it right now — the site's Register card, the
"in a hurry" line and the booth QR all point at the Google Form.

Event mode adds the Company / Role fields and a "how many units" box, shows an
event banner, and tags the lead so one day's booth leads are easy to pick out
of the sheet. An unrecognised tag still works — it just prints the tag as the
event name. Known events live in `EVENTS` at the top of `register.js`.

## It is already set up (2026-08-19)

Nothing to install. For the record, this is what exists:

- **Sheet** — *drive-with-sherill — leads*, tab `Leads`
  (`1mqDSErqFUSJ8IcXfQNnk2_6KvzjQvID-W_FhHad-QJs`), in charliecayno@gmail.com's Drive.
- **Script** — *drive-with-sherill — register*, bound to that sheet
  (Extensions → Apps Script), holding `apps-script.gs` verbatim.
- **Forms** — *Register your interest — Sherill Obillo · Nissan Quezon Avenue*
  and *… — Victor Alvear · Nissan Quezon Avenue*, each with its own installable
  `onFormSubmit` trigger. Victor's edit link: https://docs.google.com/forms/d/1JRR6vQN5RpwrXHaNWx1gBZRxNMgsTROL_SUlhoh870k/edit
- **Deployment** — web app, *Execute as: Me*, *Who has access: Anyone*,
  description `register form endpoint`. Its `/exec` URL is `ENDPOINT` in
  `register.js`.
- **Authorization** — the script runs as Charlie with permission to write that
  spreadsheet and to send mail as him. That's what puts the lead in Sherill's
  inbox with no server and no API key anywhere in the repo.

Health check: opening the `/exec` URL in a browser prints
`{"ok":true,"service":"drive-with-sherill register"}`.

### Changing the script later

Edit `apps-script.gs` here, paste it into the Apps Script editor, then
**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**.
The URL stays the same, so nothing on the site changes. Apps Script keeps
serving the *old* code until you do that — saving is not deploying.

### Test mode

Two switches, same idea — exercise the real path without a fake lead reaching
Sherill. Both mail Charlie only and tag the subject `[TEST]`:

- **the page** — `/register/?test=1` (sets `test: true` in the payload)
- **the form** — set `FORM_TEST_ONLY = true` in `apps-script.gs` and save
  (triggers run the saved code, no deploy needed), then set it back to `false`

Rows still land in the sheet either way — delete them after.

## What arrives

- **Email**, to both addresses in `RECIPIENTS`, subject
  `New lead — Juan Dela Cruz (X-Trail) · Phil Medical Expo 2026`, with every
  answer in the body. Reply-to is the customer, so hitting Reply goes straight
  to them.
- **A row** in the `Leads` tab: received, event, name, mobile, email, city,
  company, role, interests, plan, timeline, units, notes, source.
- **An acknowledgement** to the customer if they left an email
  (`SEND_ACK = false` turns this off).

Gmail's free quota is 100 recipients a day — a booth day sends nowhere near it.

## If sending fails

The page never loses what someone typed. On a dead network, a script error, or
an empty `ENDPOINT`, it shows the filled-in details as text with a **Copy**
button and a Viber link — the same copy-only contract the quotation, loan and
booking forms on the main site use.

## Notes

- **A brand-new deployment is slow for its first few minutes.** Right after
  deploying, POSTs took 55–75 s and the response redirect 404'd, while the
  writes still landed. It settled to ~1–3 s on its own. Don't re-deploy chasing
  it; check the Executions view instead — if rows and emails are arriving, only
  the response is lagging.
- **`Content-Type: text/plain` on the POST is deliberate.** Apps Script web apps
  cannot answer a CORS preflight, and `application/json` triggers one. The
  script reads `e.postData.contents` either way.
- **Only this form leaves the browser.** The loan application deliberately does
  not, and must not — it carries TIN, income and a co-maker's details. See the
  note above `LOAN_REQUIREMENTS` in `js/data.js`.
- The model chips are generated from `MODELS` in `js/data.js`, so a model added
  to the site appears here with no edit. Two extras cover what the list can't:
  *Fleet / special build* and *Not sure yet*.
- There's a consent checkbox and an off-screen honeypot field. A submission
  with the honeypot filled gets a 200 and is dropped.
