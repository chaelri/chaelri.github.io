# cockpit/ — Local Web Cockpit for Claude Code

The cockpit wraps `claude -p` (headless mode) with mode-based workflows, knowledge-MD pre-loading, and a live token budget meter. See the README and the parent COCKPIT_PLAN.md for full design context.

## Knowledge

@../knowledge/cockpit/AGENTS.md

@../knowledge/cockpit/HOOKS.md

@./README.md

## Quick reminders

- **Path #1b architecture:** Cockpit is a UI shell that subprocesses `claude -p`. **Not the Agent SDK.** Bills against Charlie's Max subscription via Keychain auth.
- **Never set `ANTHROPIC_API_KEY`** in this project — it would force separate API billing.
- **Verify `apiKeySource=none`** in stream-json output to confirm Max-sub auth.
- **Server-side knowledge loading is now redundant** for chaelri.github.io modes — the root CLAUDE.md auto-loads via `--add-dir` workspace + Claude Code's built-in CLAUDE.md discovery. The `knowledge_files` field in mode JSONs still works but duplicates the auto-load.
- **Cockpit modes** live in `cockpit/modes/*.json`. Adding a new mode = create the JSON file, follow existing shape.
- **Budget tracking:** `budget.py` walks `~/.claude/projects/**/*.jsonl` for weekly totals. Caps in `config.py`. Lockout at 90%.
- **Run locally:**
  ```bash
  cd cockpit && unset ANTHROPIC_API_KEY && .venv/bin/uvicorn server:app --host 127.0.0.1 --port 5050 --reload
  ```
