# gemini-proxy/drive-helper.mjs — Summary

**Added:** 2026-05-21
**Status:** 🟢 Active local CLI

Local Node CLI for reading/writing Charlie's Google Drive from this repo. Lives at `gemini-proxy/drive-helper.mjs`. Complements (does NOT replace) the existing `gemini-proxy/upload-drive` Cloud Run endpoint that the sns-dq app uses.

## Why it exists

The Cloud-Run endpoint and the `gemini-proxy/setup-drive-oauth.sh` flow both use the `drive.file` scope — per-file access only, sufficient for *uploads* but invisible to files the app didn't create. That meant we couldn't `ls` an arbitrary shared folder (e.g., photos someone else uploaded). This helper uses its **own OAuth client** in GCP project `gen-lang-client-0614956024`, kept in **Testing** mode with Charlie added as a test user, so the full `drive` scope works without going through Google's app-verification gate.

## Files (gitignored)

| File | Purpose |
|---|---|
| `gemini-proxy/.drive-client.json` | OAuth client ID + secret, downloaded from Cloud Console → Credentials |
| `gemini-proxy/.drive-creds.json` | Refresh token saved after one-time `auth` command |

Both are in `.gitignore` (see `# Drive OAuth` section). **Do not commit either.**

## Commands

```bash
cd gemini-proxy
node drive-helper.mjs auth                            # one-time, opens browser
node drive-helper.mjs ls <folderId>                   # list a folder's children
node drive-helper.mjs get <fileId> [outPath]          # download a file (or export Google-native to PDF)
node drive-helper.mjs put <localPath> <folderId>      # upload a local file
```

Folder ID is the chunk after `/folders/` in the Drive share URL. File IDs come from `ls`.

## Quirks / load-bearing details

- **Quota project header is required.** Drive API rejects user-credential ADC requests without `x-goog-user-project: gen-lang-client-0614956024`. The helper sets this automatically; if you hand-roll a curl, you must add it (`gemini-proxy/index.js` line ~160 has the same note for the Cloud Run upload endpoint).
- **Testing mode + test users.** The OAuth consent screen is configured as External · Testing. Only `charliecayno@gmail.com` is added as a test user. Adding more users requires the Audience tab in Console. Don't try to "publish to production" — that triggers verification, which we explicitly avoid.
- **Auth flow uses loopback redirect.** `cmdAuth()` spins a one-shot HTTP server on a random localhost port and writes `redirect_uri=http://127.0.0.1:<port>` so the Desktop-app client works. Make sure the OAuth client type is **Desktop app** (not Web), or the loopback redirect will be rejected.
- **Google-native exports.** `get` detects `application/vnd.google-apps.*` MIME types and exports to PDF via `/export?mimeType=...` instead of `alt=media`. Output filename gets a `.pdf` suffix in that case.
- **Scopes baked in:** `openid email https://www.googleapis.com/auth/drive`. Edit `SCOPES` at the top of the file to add anything else (e.g., `drive.readonly` to lock it down, or `gmail.readonly` for a future Gmail use-case).
- **Refresh-token gotcha.** If `auth` returns no `refresh_token`, Google has cached a prior consent. Revoke at `https://myaccount.google.com/permissions` (under "Third-party apps with account access" → `chaelri-drive`) and re-run.

## How it relates to the rest of the repo

- **sns-dq:** still uses `gemini-proxy/upload-drive` (Cloud Run) for its in-browser uploads. Unchanged.
- **anohana / towa-no-yuugure:** previously uploaded episodes via the Cloud Run endpoint. Future uploads can use either path; the helper is just more convenient for local terminal work.
- **Personal admin tasks (e.g., reading Mom's photo folder):** this is the only path — Cloud Run's `drive.file` scope can't see files the app didn't create.

## Setup history

OAuth client created via Cloud Console UI on 2026-05-21:
1. `console.cloud.google.com/auth/branding` — set app name, support email, dev email
2. `console.cloud.google.com/auth/audience` — External · Testing · added `charliecayno@gmail.com` as test user
3. `console.cloud.google.com/auth/scopes` — added `auth/drive`
4. `console.cloud.google.com/auth/clients` — created Desktop client, downloaded JSON → moved to `gemini-proxy/.drive-client.json`
5. `node drive-helper.mjs auth` → completed browser consent → refresh token saved to `.drive-creds.json`

(These steps go through the new "Google Auth Platform" UI that replaced the legacy OAuth-consent-screen page.)
