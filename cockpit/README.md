# Claude Code Cockpit

Local web UI that wraps `claude -p` (Claude Code CLI in headless mode) with
mode-based workflows, knowledge-MD pre-loading, and a live budget meter.

**Auth model:** Uses your existing Claude Code Keychain auth → bills against
your Max subscription. No `ANTHROPIC_API_KEY` is set or required.

## Setup

```bash
cd cockpit
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# Make sure ANTHROPIC_API_KEY is NOT set (would force API billing)
unset ANTHROPIC_API_KEY

uvicorn server:app --host 127.0.0.1 --port 5000 --reload
```

Open http://127.0.0.1:5000

## Smoke test the runner alone

```bash
python runner.py
```

Should print a `[init]` line with `apiKeySource=none` and a `[result]` line
with cost. If `apiKeySource` is anything other than `none`, you're billing
against an API key — check your env.

## Layout

- `server.py` — FastAPI app, WebSocket endpoint at `/ws/chat`
- `runner.py` — async subprocess wrapper, parses stream-json NDJSON
- `modes/*.json` — mode definitions (model, system prompt, tool gates, etc.)
- `public/index.html` — minimal frontend (Day 2 will replace this)

## Day status

- ✅ Day 1: Backend MVP — `server.py`, `runner.py`, mode JSON loader
- ✅ Day 2: Frontend MVP — Tailwind dark UI, mode cards, WS streaming, multi-turn `--resume`
- ✅ Day 3: Budget meter — `budget.py` walks `~/.claude/projects/*.jsonl`, weekly totals by family, lockout at 90%
- ✅ Day 4: Knowledge MDs (`knowledge/devo/`) + UI polish (markdown rendering, cancel button, resumed indicator)

## UI notes

- **Cancel button**: closes the WebSocket. Server's disconnect handler SIGTERMs the in-flight subprocess. Reconnect happens automatically (~1.5s) but you lose `session_id` continuity — cancel = new session.
- **New session**: server-side reset of `session_id` (subsequent turns won't pass `--resume`). Also clears the conversation cost meter in the header.
- **Budget meter**: polls `/api/budget` every 30s. Weekly window is Mon 00:00 UTC → now. Edit `cockpit/config.py` to tune caps.
- **Markdown rendering**: assistant text blocks are rendered via marked.js. Thinking blocks remain plain in `<details>`.
