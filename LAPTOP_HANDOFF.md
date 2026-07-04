# Laptop Handoff — local-only state inventory

**Purpose:** this laptop (company-owned, returned around the time the working relationship at Azur Technology ends) holds machine-local files that the GitHub repo deliberately doesn't track — OAuth refresh tokens, API keys, Claude Code memory, hooks, SSH keys, gcloud auth caches. None of those follow the repo when you clone it on a new machine. This doc is the canonical list so:

1. **Before laptop return** — you back up the files marked `BACK UP` (≈15 KB total) to personal storage (iCloud Drive, Google Drive on `charliecayno@gmail.com`, a USB stick — pick whichever you'll still have access to after return).
2. **On the new laptop** — Claude reads this file and walks through the restore checklist at the bottom. The trigger phrase is **"restore my setup"** or **"set up this laptop"**.

This doc contains **no secrets** — only paths, purposes, and re-create instructions. Safe to commit publicly.

---

## TL;DR — before returning the laptop

Do these in order. Total time ≈ 10 minutes.

1. Create a backup archive:
   ```bash
   mkdir -p ~/Desktop/laptop-handoff-backup
   cp ~/.ssh/id_rsa ~/.ssh/id_rsa.pub                              ~/Desktop/laptop-handoff-backup/
   cp /Users/ccayno/Documents/chaelri.github.io/.env               ~/Desktop/laptop-handoff-backup/repo-root.env
   cp /Users/ccayno/Documents/chaelri.github.io/devo/config.js     ~/Desktop/laptop-handoff-backup/devo-config.js
   cp /Users/ccayno/Documents/chaelri.github.io/devo-mobile/.env   ~/Desktop/laptop-handoff-backup/devo-mobile.env
   cp /Users/ccayno/Documents/chaelri.github.io/functions/service-account.json ~/Desktop/laptop-handoff-backup/
   cp /Users/ccayno/Documents/chaelri.github.io/gemini-proxy/.{drive,yt,sheets,gmail}-*.json ~/Desktop/laptop-handoff-backup/
   cp /Users/ccayno/Documents/chaelri.github.io/gemini-proxy/.credentials.md ~/Desktop/laptop-handoff-backup/
   cp -R "/Users/ccayno/.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory" ~/Desktop/laptop-handoff-backup/claude-memory
   cp ~/.claude/hooks/block-destructive.sh                         ~/Desktop/laptop-handoff-backup/ 2>/dev/null || true
   cp ~/Documents/Perifix/.env.local                               ~/Desktop/laptop-handoff-backup/perifix.env.local 2>/dev/null || true
   ```
2. Verify the archive — `ls -la ~/Desktop/laptop-handoff-backup` should show ~14 files, all small (the biggest is `service-account.json` at ~2.3 KB).
3. Upload the whole folder to your personal Google Drive (or zip + email to yourself, or copy to a USB stick you'll keep).
4. Verify GitHub Pages secret is set: visit `https://github.com/chaelri/chaelri.github.io/settings/secrets/actions` — confirm `GOOGLE_TTS_KEY` is listed. (Don't reveal the value — just confirm it exists. Without it, the deploy workflow can't rebuild `devo/config.js`.)
5. **Sign out of Chrome / Edge** profiles using the company Google account if any. Personal account (`charliecayno@gmail.com`) is the one that owns GCP project `gen-lang-client-0614956024` and `668755364170` — that survives the laptop return because it's tied to the Google identity, not the device.

That's it for the device side. Everything else lives in the cloud and stays.

---

## File-by-file inventory

### A. Repo-local gitignored files (under `/Users/ccayno/Documents/chaelri.github.io/`)

Patterns from `.gitignore` that match real files on disk:

| Path | Purpose | Backup? | Re-create on new laptop |
|---|---|---|---|
| `.env` (repo root, 76 B) | `GEMINI_API_KEY` — used by local helper scripts (proxy dev, sheets/drive helpers) | BACK UP | Copy from backup, or grab the same key from GCP Console → API Credentials → Gemini key for project `gen-lang-client-0614956024`. |
| `devo/config.js` (270 B) | Client-side keys: `window.GOOGLE_TTS_KEY`, `window.VAPID_PUBLIC_KEY`, `window.PUSH_SERVER_URL` | BACK UP (and rebuild for prod) | **Note:** the deploy workflow `.github/workflows/deploy.yml` only writes `GOOGLE_TTS_KEY` on push to `main`, so any extra constants (`VAPID_PUBLIC_KEY`, `PUSH_SERVER_URL`) in the local file get stripped from the deployed version. If you depend on those at runtime, either: (a) restore the local file from backup for local testing, or (b) extend the workflow to write the extra constants too. The `PUSH_SERVER_URL` is the gemini-proxy Cloud Run URL — non-sensitive, fine to hard-code. |
| `devo-mobile/.env` (67 B) | `EXPO_PUBLIC_GOOGLE_TTS_KEY` (same TTS key as above) | BACK UP | Copy from backup, or replicate from GitHub secret. |
| `functions/service-account.json` (2.3 KB, mode 600) | Firebase Admin SDK service account for project `test-database-55379` | BACK UP | Per Apr 2026 security update (see CLAUDE.md), this file may no longer be needed if functions use runtime IAM credentials. **Verify before relying:** check `functions/index.js` — if it calls `admin.initializeApp()` with no arg, it uses runtime IAM and the file is just a leftover. If it calls `admin.initializeApp({ credential: admin.credential.cert(require('./service-account.json')) })`, you need the file. To regenerate: Firebase Console → Project Settings → Service Accounts → Generate new private key. Keep `chmod 600`. |
| `gemini-proxy/.drive-client.json` (415 B) | OAuth Desktop client metadata (client_id + client_secret) for the `drive` scope. GCP project `gen-lang-client-0614956024`, Testing mode. | BACK UP or re-download | Re-download from GCP Console: project `gen-lang-client-0614956024` → APIs & Services → Credentials → existing "Desktop client for drive-helper" → ⇩ JSON. Save as `gemini-proxy/.drive-client.json`. |
| `gemini-proxy/.drive-creds.json` (128 B) | Refresh token from running `node drive-helper.mjs auth` | BACK UP or regenerate | `cd gemini-proxy && node drive-helper.mjs auth` opens browser, you grant access via `charliecayno@gmail.com`, token gets written. If revoked at https://myaccount.google.com/permissions, re-run. |
| `gemini-proxy/.yt-client.json` (415 B) | OAuth Desktop client for YouTube uploads (camera01-archive). Same GCP project. | BACK UP or re-download | Same flow as `.drive-client.json`. YouTube scope is restricted — the OAuth consent screen must list Charlie as a test user (already configured, no machine-specific state). |
| `gemini-proxy/.yt-creds.json` (128 B) | YouTube refresh token | BACK UP or regenerate | `cd gemini-proxy && node yt-helper.mjs auth`. |
| `gemini-proxy/.sheets-creds.json` (277 B) | Google Sheets API refresh token (for `sheets-helper.mjs`) | BACK UP or regenerate | Re-run the helper's auth subcommand (`node sheets-helper.mjs` will print instructions if not authed). |
| `gemini-proxy/.gmail-creds.json` (128 B) | Gmail API refresh token | BACK UP or regenerate | Same pattern. Check `gemini-proxy/` for `gmail-helper.mjs` or similar — if no helper script exists in the repo, this token may be vestigial / unused. |
| `gemini-proxy/.credentials.md` | Firebase Auth admin passwords for `guard-exit-interview` + `guard-stay-interview` (Wilfredo, kasromantico, Charlie). Plaintext markdown, gitignored. | **BACK UP** | If lost, rotate via Firebase Admin SDK: `getAuth().updateUser(uid, { password: 'NewPw' })` using `functions/service-account.json`. Full script pattern is inside the file itself. Memory pointer at `~/.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory/reference_admin_credentials.md`. |
| `.claude/knowledge-stale.md` | Hook-generated list of files edited that are referenced in `knowledge/*.md`. Cleared by `/sync-knowledge`. | SKIP | Regenerates automatically as you edit. |
| `.claude/settings.local.json` (69 B) | Just allows `Bash(open:*)` | SKIP | Re-add the one permission if needed, or skip. |
| `.DS_Store`, `node_modules/`, `*.log`, `.firebase/` | macOS/runtime junk | SKIP | n/a |

### B. ~/.claude/ machine-local Claude Code state

| Path | Purpose | Backup? | Notes |
|---|---|---|---|
| `~/.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory/` | 21 files. MEMORY.md index + 20 feedback/user/project/reference MDs. User preferences for this repo specifically. | **BACK UP** | Restore to the same path on the new laptop (the dir name is derived from the project's absolute path, so if your new laptop puts the repo at `/Users/ccayno/Documents/chaelri.github.io/`, the path is identical and Claude auto-loads it). Different username → rename the dir segment accordingly. |
| `~/.claude/settings.json` | Global Claude Code settings + permission allowlist. **The current file contains personal API tokens embedded in allowlist patterns** (Salesforce, Vercel, GitHub) — do NOT bulk-copy. | DO NOT BACK UP | On the new laptop, generate a minimal version: see the `~/.claude/settings.json` snippet template at the bottom of this doc. Then ratchet up allowlist patterns as needed during use. |
| `~/.claude/hooks/block-destructive.sh` (1.7 KB) | Aggressive-mode safety guard. Blocks `rm -rf`, `git reset --hard <protected-branch>`, etc. before they reach the shell. | Optional BACK UP | Restoring makes aggressive mode (`claude --dangerously-skip-permissions`) safe again. Without it, aggressive mode is genuinely dangerous. |
| `~/.claude/cache/`, `debug/`, `file-history/`, `image-cache/`, `paste-cache/`, `session-env/`, `sessions/`, `shell-snapshots/`, `tasks/`, `telemetry/` | Runtime caches | SKIP | Regenerate automatically. |
| `~/.claude/plugins/` | Installed Claude Code plugins (Vercel, etc.). | SKIP | Re-install on new laptop via `/plugin install <name>` or the plugins UI. |
| **Project-local hooks** (`<repo>/.claude/hooks/`, `<repo>/.claude/settings.json`) | These ARE in the repo (committed). | n/a | Clone the repo, hooks come along. May need `chmod +x` on hook scripts. |

### C. Other home-directory state

| Path | Purpose | Backup? | Notes |
|---|---|---|---|
| `~/.ssh/id_rsa` + `~/.ssh/id_rsa.pub` | SSH keys for GitHub push (this repo + `guard-exit-tracker`) | **BACK UP** | After restoring on new laptop: `chmod 600 ~/.ssh/id_rsa && chmod 644 ~/.ssh/id_rsa.pub`. Confirm GitHub still trusts the key: `ssh -T git@github.com` should greet you by username. Alternative: generate a fresh keypair and add the new pubkey to GitHub. |
| `~/.gitconfig` | `user.name = Charlie Michael Cayno`, `user.email = charliecayno@gmail.com`, plus git-lfs filter | regenerate | One liner: `git config --global user.name "Charlie Michael Cayno" && git config --global user.email "charliecayno@gmail.com"`. Re-install git-lfs if any project uses it (none of this repo's projects do, as of writing). |
| `~/.config/gcloud/` | gcloud CLI auth cache (access tokens, ADC) | SKIP (re-auth) | Run `gcloud auth login` and `gcloud auth application-default login` on the new laptop. Pick `charliecayno@gmail.com`. Set active project: `gcloud config set project gen-lang-client-0614956024` (for OAuth helpers) or `gcloud config set project 668755364170` (for gemini-proxy Cloud Run). |
| `~/Documents/Perifix/.env.local` | Sibling project (chaelri/perifix-website): Firebase web config + Supabase keys + service account path | **BACK UP** | Separate repo, but local-only env file. If lost, regenerate by copying values from the Firebase + Supabase + Vercel consoles for that project. |
| `~/Desktop/Camera01/` | Daily Insta360/phone clip source folders for camera01-archive | SKIP | Per `knowledge/camera01-archive/SUMMARY.md`: "YouTube is the archive." Folders are wiped after upload. Empty on a new machine = no problem. |
| `~/.zshrc` / `~/.bashrc` | Shell config | inspect first | If you've added any custom `export ANTHROPIC_API_KEY=…`, `export OPENAI_API_KEY=…`, `PATH` entries, etc., note them. Default macOS shell is fine to leave alone. |

### D. Cloud / external state — stays put, no backup needed

These survive the laptop return automatically because they live outside the device:

| Resource | URL / ID | Owner identity |
|---|---|---|
| Cloud Run `gemini-proxy` | `https://gemini-proxy-668755364170.asia-southeast1.run.app`, GCP project `668755364170`, region `asia-southeast1` | Verify with `gcloud projects describe 668755364170` after re-auth. Likely Charlie's personal GCP. |
| Cloud Scheduler daily reminder | Project `668755364170`, 3 PM PHT, hits `/send-reminder` | Same project. |
| GCP OAuth project for helpers | `gen-lang-client-0614956024` (Drive + YouTube + Sheets clients) | Personal (`charliecayno@gmail.com`), Testing mode. |
| Firebase RTDB | `test-database-55379` (`asia-southeast1`) — devo, autoclicker, aircon, weddingbar, elevate-eo, etc. all use this | Same Google identity. |
| GitHub Pages | Auto-deploys all projects under `chaelri.github.io` on push to `main`. Plus `guard-exit-tracker` (dual-push) and `elevate-eo-campus-unite-2026`. | GitHub account `chaelri`. |
| Vercel | `guard-exit-tracker` web app | Personal Vercel account; auth via `vercel login` on new laptop. |
| YouTube archive videos | Unlisted videos under `charliecayno@gmail.com` YouTube channel | Tied to the Google identity. Links in `knowledge/camera01-archive/` persist. |

### E. Things to verify before relying on them

- `functions/service-account.json` — confirm whether `functions/index.js` actually loads this file or uses runtime IAM. If runtime IAM, the file is dead weight and you don't need to back it up.
- `gemini-proxy/.gmail-creds.json` — confirm whether any helper script actually uses Gmail. If not, this is vestigial and won't matter on the new laptop.
- `devo/config.js` extra constants (`VAPID_PUBLIC_KEY`, `PUSH_SERVER_URL`) — the deploy workflow only writes `GOOGLE_TTS_KEY`. If push notifications stop working on deployed devo, the workflow needs updating to write the VAPID public key too (the matching private key already lives in the Cloud Run env). The push server URL is non-sensitive — hard-code it if needed.

---

## New-laptop restore checklist

When you (or future-Claude) read this section after Claude is set up on the new machine, walk top to bottom. **Stop and ask before doing anything destructive.**

1. **Clone the repo** to `/Users/<your-username>/Documents/chaelri.github.io/` (same path layout means the memory directory path matches).
2. **Restore SSH key**: `cp ~/Desktop/laptop-handoff-backup/id_rsa ~/.ssh/ && chmod 600 ~/.ssh/id_rsa && cp ~/Desktop/laptop-handoff-backup/id_rsa.pub ~/.ssh/`. Test: `ssh -T git@github.com`.
3. **Git config**: `git config --global user.name "Charlie Michael Cayno" && git config --global user.email "charliecayno@gmail.com"`.
4. **Restore credential files** into the repo (paths relative to repo root):
   - `gemini-proxy/.drive-client.json`, `.drive-creds.json`
   - `gemini-proxy/.yt-client.json`, `.yt-creds.json`
   - `gemini-proxy/.sheets-creds.json`, `.gmail-creds.json`
   - `functions/service-account.json` (chmod 600)
   - `devo/config.js`, `.env`, `devo-mobile/.env`
5. **Restore Claude memory**: `mkdir -p ~/.claude/projects/-Users-<your-username>-Documents-chaelri-github-io/ && cp -R ~/Desktop/laptop-handoff-backup/claude-memory ~/.claude/projects/-Users-<your-username>-Documents-chaelri-github-io/memory`. Verify Claude picks it up by opening a new session in the repo and asking "what do you remember about me" — `MEMORY.md` should auto-load.
6. **Restore destructive-op guard** (optional, recommended if you'll use aggressive mode): `mkdir -p ~/.claude/hooks && cp ~/Desktop/laptop-handoff-backup/block-destructive.sh ~/.claude/hooks/ && chmod +x ~/.claude/hooks/block-destructive.sh`. Wire it in via `~/.claude/settings.json` PreToolUse hook (see template at the bottom).
7. **Re-auth Google services**:
   - `gcloud auth login` (pick `charliecayno@gmail.com`)
   - `gcloud auth application-default login`
   - `gcloud config set project gen-lang-client-0614956024`
   - Optional: `firebase login` if you'll deploy Firebase Functions
8. **Smoke tests**:
   - `cd gemini-proxy && node drive-helper.mjs ls 1IJWFdaSe8xSuqK-FJEJjMzhyqnOBQNhW` — should list the `collaterals/` Drive folder.
   - `cd gemini-proxy && node yt-helper.mjs --help` — should print usage without auth errors.
   - Push a no-op commit to a branch, confirm GitHub Pages deploy succeeds (check Actions tab).
9. **Restore Perifix** (separate repo): clone `chaelri/perifix-website`, restore its `.env.local` from backup.
10. **If any refresh token is rejected** (Google revoked it during the gap): re-run the helper's `auth` subcommand. `drive-helper.mjs auth`, `yt-helper.mjs auth`, etc.
11. **Re-install Claude Code plugins** as needed (`/plugin` UI or `claude` CLI). The Vercel plugin was active on the old laptop.
12. **Configure `~/.claude/settings.json` from scratch** — do NOT copy the old one (it had embedded tokens). Use the minimal template below and add allowlist patterns as you encounter prompts.

### Minimal `~/.claude/settings.json` template for new laptop

```json
{
  "permissions": {
    "allow": [
      "Read(*)",
      "Glob(*)",
      "Grep(*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(ls*)",
      "Bash(cat*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/block-destructive.sh" }]
      }
    ]
  }
}
```

(Add more `Bash(...)` permissions as Claude prompts for them. Don't paste tokens into patterns — keep secrets in env or per-tool config.)

---

## Trigger phrases for future Claude

- **"restore my setup"** / **"set up this laptop"** / **"i got a new laptop"** → read this file top to bottom, walk through the restore checklist with confirmation at each destructive step.
- **"what do i need to back up"** → re-read the TL;DR + Section A/B/C tables.
- **"is my [drive/youtube/sheets] auth working"** → run the smoke test for that helper.

---

**Last reviewed:** 2026-06-30. If anything changes (new credential file, new external service, new sibling repo) — append to the appropriate table and update the TL;DR backup script.
