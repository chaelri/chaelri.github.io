# SETUP — Bootstrap the Claude Rules in This Repo

If a future Charlie (or future Claude on a fresh machine) says **"do the claude rules in this repo"** or **"set this repo up"**, follow these steps in order. Idempotent — safe to re-run.

---

## What This Repo Has

A self-contained "always-on" Claude Code system that doesn't require the cockpit Python app:

- **`CLAUDE.md`** at root + per-project — auto-loaded by Claude Code on any session opened anywhere in this repo. Pulls in the entire `knowledge/` tree via `@-imports`.
- **`knowledge/`** — 65+ MD files documenting every project (architecture, patterns, decisions). Plus hub map (`hub/PROJECTS.md`) and agent/hook patterns (`cockpit/AGENTS.md`, `cockpit/HOOKS.md`).
- **`.claude/settings.json`** + **`.claude/hooks/*.sh`** — auto-detect knowledge-MD staleness on every Edit/Write; surface notices on next session; block auto-`git push`.
- **`.claude/commands/sync-knowledge.md`** — the `/sync-knowledge` slash command for review-and-patch workflow.

Once set up, Claude Code on this machine knows about every project here without re-investigating.

---

## One-Time Setup Steps

### 1. Verify `jq` is installed (required by hooks)

```bash
jq --version
```

If "command not found":
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install -y jq

# WSL/other Linux
# (use distro's package manager)
```

### 2. Make hook scripts executable

```bash
chmod +x .claude/hooks/*.sh
```

(Git usually preserves the executable bit, but re-running this is harmless.)

### 3. Verify hooks load

```bash
python3 -c "import json; json.load(open('.claude/settings.json'))" && echo "settings.json valid"
```

Expected: `settings.json valid`.

### 4. Test the no-auto-push hook (should refuse `git push`)

```bash
echo '{"tool_input": {"command": "git push"}}' | bash .claude/hooks/no-auto-push.sh
echo "exit code: $?"
```

Expected: `⛔ Auto-push blocked. Charlie controls all pushes manually.` and `exit code: 2`.

### 5. (Optional) If you want to use the cockpit Python app

```bash
cd cockpit
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Run with: `unset ANTHROPIC_API_KEY && .venv/bin/uvicorn server:app --host 127.0.0.1 --port 5050 --reload`

The cockpit is **optional** — the always-on knowledge system works without it.

---

## Verification

After setup, open a new Claude session anywhere in this repo. Claude should:

1. Auto-load the root `CLAUDE.md` (it lists every project, conventions, agent/hook patterns).
2. If you open inside a project subdirectory (`devo/`, `tayo/`, etc.), also auto-load that project's `CLAUDE.md` with its deep MDs.
3. Edit any file → the `PostToolUse` hook checks if it's referenced in any knowledge MD; if so, appends a note to `.claude/knowledge-stale.md`.
4. Open a fresh session after edits → `SessionStart` hook surfaces the stale list.
5. Run `/sync-knowledge` → reviews stale entries, proposes patches via git diff, asks for approval per patch.

If any of those don't work, see "Troubleshooting" below.

---

## Conventions Claude Should Already Know (from root CLAUDE.md)

- **No auto-push:** never run `git push` automatically. Charlie controls all pushes.
- **No auto-commit:** don't commit unless asked.
- **`weddingtest/` is the LIVE wedding invitation** despite the misleading name. Never suggest deleting.
- **`guard-exit-interview/` requires dual-repo push:** every change goes to BOTH `chaelri.github.io` AND `guard-exit-tracker`.
- **`monthsary/` was rebuilt 2026-04-26** — moved from root to subdir, Firebase upgraded.
- **No emoji in code/docs unless requested.**
- **Taglish (Filipino + English) tone is OK** for AI features in devo/tayo/etc.

---

## "Just Set This Up" Trigger

If Charlie says:
- "do the claude rules in this repo"
- "set up the claude system"
- "bootstrap this repo"
- "make sure my hooks work"

Then:
1. Read this file (`SETUP.md`)
2. Run steps 1–4 above (skip step 5 unless explicitly asked about the cockpit)
3. Report which steps passed/failed
4. If any failed, troubleshoot using the section below

Don't re-create the knowledge MDs or CLAUDE.md files unless they're missing. They're committed to git and travel with the repo.

---

## Troubleshooting

### "jq: command not found" when editing files
The `PostToolUse` hook silently fails if `jq` isn't installed. Knowledge-MD staleness won't be detected.
**Fix:** Install `jq` (step 1 above).

### `git push` works automatically (no block)
The `no-auto-push.sh` hook isn't being called.
**Fix:**
- Verify `.claude/settings.json` has the `PreToolUse > Bash` hook entry
- Verify `chmod +x .claude/hooks/no-auto-push.sh`
- Run `claude --debug` to see which hooks are firing

### Hooks don't fire at all
- Check Claude Code is reading project-level settings: `claude --debug` and look for `settings.json` load
- Some Claude Code versions require `~/.claude/settings.json` to opt into project hooks. If so, add `"enableProjectHooks": true` to your user settings.

### `@-imports` in CLAUDE.md don't load
- Check the file paths are correct (relative to the CLAUDE.md file)
- Some older Claude Code versions don't support `@-imports`. Update with `claude update`.

### Per-project CLAUDE.md doesn't auto-load
- Confirm the project subdirectory has its own CLAUDE.md
- Open Claude **inside** that subdirectory (`cd devo && claude`), not at the repo root

---

## What Won't Transfer From Charlie's Mac

If you're setting up on a different user account or machine:

- **User-level memory at `~/.claude/projects/-Users-ccayno-...`** — tied to the original Mac's username. Won't transfer. The most important conventions are duplicated in the root `CLAUDE.md`.
- **macOS Keychain auth** — each machine logs into Claude Code separately. Run `claude` once and authenticate.
- **Cockpit Python venv** — gitignored. Re-run step 5 if you want it.
- **`settings.local.json`** — per-machine overrides (gitignored).

Everything else (CLAUDE.md tree, knowledge/, hooks, slash commands) is in git and will work as soon as you complete steps 1–4.
