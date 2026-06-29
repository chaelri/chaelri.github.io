# chaelri.github.io — Project Context for Claude

This file is auto-loaded by Claude Code in every session opened anywhere in this repo. It pulls in the canonical knowledge base via `@-imports` so Claude doesn't have to re-investigate.

## First-time setup on a new machine

If hooks aren't firing or `jq` isn't installed, see [`SETUP.md`](SETUP.md). When Charlie says **"do the claude rules in this repo"** or **"set up the claude system"**, follow `SETUP.md` steps 1–4.

When Charlie says **"restore my setup"** / **"set up this laptop"** / **"i got a new laptop"** — that's a transition from the previous (returned company) laptop. Read [`LAPTOP_HANDOFF.md`](LAPTOP_HANDOFF.md) and walk through the restore checklist with him, confirming before each destructive step. That doc has the full inventory of credentials, OAuth tokens, Claude memory, and external services that needed manual handoff.

## Hub Map (every project at a glance)

@knowledge/hub/PROJECTS.md

## Cockpit / Agents / Hooks (always-on conventions)

@knowledge/cockpit/AGENTS.md

@knowledge/cockpit/HOOKS.md

## Project-specific knowledge

When working inside a specific project subdirectory, that project's `CLAUDE.md` will auto-load its deep MDs (architecture, key files, patterns, decisions). The hub map above is the broad orientation — the per-project MDs are loaded on demand.

## Optional per-project files: `LOG.md` + `QUESTIONS.md`

Two opt-in file types live alongside the existing `SUMMARY.md` / `ARCHITECTURE.md` / etc. — borrowed from the `brain-template` system but kept inside this repo's `knowledge/` tree (no `~/brain`, no install scripts).

- **`knowledge/<project>/LOG.md`** — append-only chronological notes (newest first). For things a future reader needs but can't get from the diff: a decision's *why*, a dead end, a vendor email, an outside constraint. Skip "added a button" — git log already has that.
- **`knowledge/<project>/QUESTIONS.md`** — open questions for that project. Close with `[CLOSED YYYY-MM-DD: answer]` markers; never delete. The trail is the value.

Templates: `knowledge/_templates/LOG.md`, `knowledge/_templates/QUESTIONS.md`. Both files are optional — create them only when a project actually has chronology or open questions worth tracking. When you create one, also add an `@../knowledge/<project>/LOG.md` (or `QUESTIONS.md`) line to that project's `CLAUDE.md` so it auto-loads on session start.

## Repo-wide conventions

- **No auto-push:** Never run `git push` automatically. Charlie controls all pushes manually.
- **No auto-commit:** Don't commit unless Charlie asks. The current state of `git status` is intentional.
- **Dual-repo for `guard-exit-interview/`:** Every change must be pushed to BOTH `chaelri.github.io` AND `guard-exit-tracker` repos.
- **`weddingtest/` is the live wedding invitation** despite the name. Never suggest deleting or renaming.
- **`monthsary/` rebuilt 2026-04-26:** Recently moved from root to `/monthsary/` subdir; Firebase upgraded 9.6.1 → 11.0.2.
- **Aggressive mode:** Charlie often runs `claude --dangerously-skip-permissions` with a destructive-op hook guard. Avoid running `rm -rf`, `git reset --hard <protected-branch>`, or other destructive ops without explicit confirmation.
- **No emoji unless requested:** Charlie's preference per CLAUDE.md guidance.
- **Taglish OK for AI features in devo/tayo/etc.:** Casual Filipino + English mix is the established tone for AI-generated content in those projects.

## Where things are

```
chaelri.github.io/
├── index.html              ← root hub landing page (Tailwind v4)
├── firebase.json           ← Firebase Hosting config (public: weddingbar)
├── CLAUDE.md               ← this file
├── COCKPIT_PLAN.md         ← cockpit design doc (active build)
├── knowledge/              ← MD knowledge base for Claude (this is what you're reading from)
│   ├── _templates/             ← templates for opt-in LOG.md + QUESTIONS.md
│   ├── hub/PROJECTS.md         ← hub map (every project)
│   ├── cockpit/AGENTS.md       ← agent patterns
│   ├── cockpit/HOOKS.md        ← hook patterns
│   ├── devo/                   ← 8 deep MDs for the Bible PWA
│   ├── devo-mobile/            ← 4 MDs for React Native companion
│   ├── guard-exit-interview/   ← 5 MDs for the production tracker
│   ├── tayo/                   ← 5 MDs for the journal app
│   ├── weddingtest/            ← 5 MDs for the LIVE wedding invitation
│   ├── monthsary/              ← 3 MDs for 4th monthsary page
│   ├── autoclicker/            ← 3 MDs for DIY WiFi SwitchBot build reference
│   └── <12 more parked projects>/SUMMARY.md
├── cockpit/                ← local web cockpit (FastAPI + claude -p subprocess)
├── devo/                   ← Bible devotional PWA
├── devo-mobile/            ← React Native companion (parked)
├── guard-exit-interview/   ← Guard offboarding tracker (active)
├── tayo/                   ← Charlie & Karla journal (active)
├── monthsary/              ← 4th monthsary page (active)
├── towa-no-yuugure/        ← Towa no Yuugure episode viewer (sister to anohana)
├── autoclicker/            ← DIY WiFi auto-clicker build reference + live phone remote
├── aircon/                 ← DIY WiFi aircon controller (servo on the original remote)
├── pocket-remote/          ← Battery-powered ESP32-C3+OLED remote for autoclicker + aircon
├── weddingtest/            ← LIVE wedding invitation (despite the name)
├── gemini-proxy/           ← Cloud Run backend (used by devo, pray, others)
├── functions/              ← Firebase Cloud Functions (weddingbar push)
├── vm-management/          ← Sunday volunteer mgmt (has own CLAUDE.md)
├── weddingbar/             ← Firebase Hosting public root
└── <11 more parked projects>/
```

## Quick-action triggers (recognize these and act)

When Charlie says...

- **"create an agent for X"** → see `knowledge/cockpit/AGENTS.md` "Create an Agent" section. Decide: built-in, custom subagent, or cockpit mode.
- **"create a hook for X"** → see `knowledge/cockpit/HOOKS.md` "Create a Hook" section. Identify event, write script, register in `.claude/settings.json`.
- **"make a cockpit mode for X"** → write `cockpit/modes/<name>.json`, follow existing modes in `cockpit/modes/` for shape.
- **"sync knowledge"** or `/sync-knowledge` → read `.claude/knowledge-stale.md`, propose patches to listed MDs based on git diffs.
- **"add knowledge for X"** → spawn an Explore agent following the pattern in `knowledge/cockpit/AGENTS.md` (Knowledge-MD Generation).
- **"log this for `<project>`"** or **"add a LOG entry"** → if `knowledge/<project>/LOG.md` doesn't exist yet, copy `knowledge/_templates/LOG.md` to that path and add `@../knowledge/<project>/LOG.md` to the project's `CLAUDE.md`. Then prepend a new `## YYYY-MM-DD — <title>` entry (today's date) above the marker comment.
- **"open question for `<project>`"** or **"add a question"** → same flow with `QUESTIONS.md`. Add the item under `## Open`. Close items in place with `[CLOSED YYYY-MM-DD: answer]` — never delete.

## Memory layer (auto-loaded separately)

There's a separate memory layer at `~/.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory/` that captures user preferences, project state, and feedback. That auto-loads via Claude's memory system — you don't need to import it here.
