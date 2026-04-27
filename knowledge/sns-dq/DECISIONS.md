# sns-dq — Decisions & Rationale

Captures the non-obvious choices made while building the app, so future sessions don't re-relitigate them.

## Drive uploads use OAuth user refresh token, NOT a service account

**Decision:** Proxy auths as `charliecayno@gmail.com` via a stored OAuth refresh token (gcloud's built-in Web client + the `drive.file` scope), not the Cloud Run default service account.

**Why:** Tried the SA path first. It returns HTTP 403 "Service Accounts do not have storage quota — leverage shared drives." Service accounts only have storage quota inside Workspace **Shared Drives**, never in consumer (`@gmail.com`) Drives — folder sharing doesn't help. So for any consumer-Gmail target, OAuth user flow is the only option.

**Setup:** `gemini-proxy/setup-drive-oauth.sh` runs `gcloud auth application-default login --scopes=...drive.file...`, extracts refresh_token + client_id + client_secret from the resulting ADC file, and pushes them to Cloud Run as env vars `DRIVE_OAUTH_CLIENT_ID`, `DRIVE_OAUTH_CLIENT_SECRET`, `DRIVE_OAUTH_REFRESH_TOKEN`. One-shot.

**Quota project header:** Drive API rejects user-credential requests without `x-goog-user-project` — the proxy hardcodes `gen-lang-client-0614956024` on every Drive call. Without it: HTTP 403 "requires a quota project."

**Scope is `drive.file` not `drive`:** First attempt used full `drive` scope and got "App is blocked" (gcloud's built-in OAuth client can't consent to sensitive scopes for consumer accounts). `drive.file` is non-sensitive and lets the app create files in any folder the user has access to (the file is then accessible by the app). Sufficient for our write-only use case.

## Text formatting is a server-side Gemini call, not local heuristics

**Decision:** Each Generate / Reformat hits `gemini-proxy` with a JSON-mode request that returns `{questions:[{runs:[…]}]}`.

**Why:** Picking which words to emphasize is a judgment call (verb vs. noun, central vs. supporting). Heuristic rules ("bold all nouns") sound plausible but produce mediocre, mechanical results. Gemini-flash-lite at temperature 0.6 nails it ~90% of the time, and the cost per call is negligible.

**Wording-preservation safety net:** AI output must concatenate to the cleaned input verbatim per question (`reconcileWithInput`). On any mismatch, that question falls back to a single literal `normal` run. The AI can change the *emphasis* but never the *wording* — which is the whole point.

## Input parser drops everything that isn't a numbered question

**Decision:** When the input contains any line matching `^\s*(?:\d+[.)]|Q\d+[:.]?|\(\d+\)…)\s+`, the parser keeps ONLY those numbered lines (and their direct continuation lines). Anything before the first numbered prefix is treated as preamble and silently dropped.

**Why:** Charlie's source text often has prefixes like `Discussion Questions: *PENDING APPROVAL` before the actual numbered questions. A regex matching specific header strings is fragile (can't anticipate `*PENDING APPROVAL`, `for week of …`, etc.). The numbered prefixes themselves are an unambiguous signal — anything outside them is not a question.

**Fallback:** If the input has *no* numbered prefixes anywhere, fall back to splitting on blank lines and dropping any block whose first line matches a heading-like regex.

## Three-tier weight, not two

**Decision:** `normal` = Regular (400), `bold` = Bold (700), `italic` = Bold Italic (700 italic). Wide enough contrast that each tier is unambiguously distinct.

**Why we got here:** Started at all-ExtraBold (800) to match the SNS reference's heavy feel — but with no contrast, every word read as emphasized. Tried (700/800/800-italic) — too subtle. Tried (600/700/700-italic) — body still felt heavy. Charlie pointed at a reference image where the body text reads as truly Regular. Settled on (400/700/700-italic).

## Layout pinned to measured pixels of the template

**Decision:** Content rect is `x=168..1700, y=280..940`. The "1." aligns with the "D" of the pre-stamped "Discussion Questions:" header. Auto-fit between 36–104 px.

**Why:** The empty template has the header + logo baked in. Initial guesses (x=80) put the numbered list left of the header text — looked wrong. Measured the actual pre-stamped header in `template.png` with PIL: header sits at `x[168..1099], y[156..234]`. Using those exact bounds (with comfortable margins below + on the right to clear the logo) makes the rendered output indistinguishable from a Canva export.

**Auto-fit range matters:** Kept the upper bound at 64 originally — but a 2-question input only filled 35% of the canvas height, looked tiny vs. the reference. Bumped to 104 so short inputs scale up.

## No service worker

**Decision:** PWA manifest only, no `sw.js`.

**Why:** Charlie explicitly said no caching needed. The app is small and the only network calls (Gemini, Drive upload) inherently require online anyway. Without a SW, every load gets the latest code without cache-bust dance. Trade-off accepted: no offline mode, but offline mode wouldn't be useful for a tool whose core work is API-driven.

## Filename convention: `DQ SNS <Full Month> <Day>.png`

**Decision:** Default filename uses full month name (e.g. `DQ SNS April 27.png`), not the abbreviation (`Apr`).

**Why:** Charlie's existing manual exports use the full-month form. Matching it keeps Drive folder ordering / search behaviour consistent with his historical files.

## Drive folder is hardcoded server-side

**Decision:** The proxy's `SNS_DQ_FOLDER_ID` is a const, not a request parameter.

**Why:** The endpoint is publicly reachable (Cloud Run `--allow-unauthenticated` to keep CORS simple from the static site). Hardcoding the folder makes the worst-case abuse pattern "someone spams this one folder," which Charlie can wipe in 5 seconds. If we accepted folder ID as input, abuse could write to any of his folders. Trade-off: minor security mitigation in exchange for losing flexibility we don't need.
