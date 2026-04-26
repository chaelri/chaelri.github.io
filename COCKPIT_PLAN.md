# Claude Code Web Cockpit — Plan

**Status:** Active build (unparked 2026-04-26). Path #1b architecture confirmed.
**Owner:** Charlie (ccayno@azurtechnology.com)
**Date Drafted:** 2026-04-26
**Estimated Build Time:** ~12 hours (4 days × 3 hrs)

## ⚠️ Architecture Pivot (2026-04-26)

Original plan called for `claude-agent-sdk-python` reusing `~/.claude/.credentials.json` to bill against the Max subscription. **Verified: not viable.**

- Anthropic banned subscription/OAuth auth for third-party SDK apps as of Feb 2026 (policy enforcement; Consumer ToS update). The Agent SDK only accepts `ANTHROPIC_API_KEY` with separate metered billing.
- `~/.claude/.credentials.json` does not exist on macOS — Claude Code stores OAuth in Keychain.

**Pivot — Path #1b:** Cockpit becomes a UI shell that subprocesses `claude -p` (headless mode). The `claude` binary uses Keychain auth and bills against the Max subscription. Cost-savings premise preserved.

**Bonus discovery:** `claude -p` already exposes most "Smart Features" as built-in flags — `--max-budget-usd`, `--output-format stream-json`, `--model`, `--system-prompt`, `--add-dir`, `--allowed-tools`, `--permission-mode`, `--mcp-config`, `--session-id`, `--resume`, `--agents`. The cockpit shrinks ~30% in scope: it's a flag-mapper + UI, not an agent engine.

## ⚠️ Architecture Pivot v2 (2026-04-27): Always-On Without the Cockpit

The cockpit's `--append-system-prompt` knowledge-loading mechanism is now **redundant for `chaelri.github.io`** because:

1. **Root `CLAUDE.md`** (this repo) auto-loads via Claude Code's built-in CLAUDE.md discovery, and `@-imports` the entire `knowledge/` tree
2. **Per-project `<project>/CLAUDE.md`** files load deep MDs when working inside that subdirectory
3. **`.claude/hooks/`** detect knowledge-MD staleness on every Edit/Write and surface notices on next session
4. **`.claude/commands/sync-knowledge.md`** slash command provides the review-and-patch workflow

**Net result:** Charlie can open Claude Code anywhere in this repo (no cockpit needed) and get:
- Project orientation (hub map auto-loaded)
- Agent + hook patterns (knowledge/cockpit/AGENTS.md, HOOKS.md)
- Per-project deep context (when in subdir)
- Auto-staleness detection
- One-command sync workflow

**The cockpit's remaining value** is the **budget meter + lockout + mode-based UI** — useful for cost-conscious sessions but optional for daily work.

**See:** [knowledge/cockpit/AGENTS.md](knowledge/cockpit/AGENTS.md) for agent patterns, [knowledge/cockpit/HOOKS.md](knowledge/cockpit/HOOKS.md) for hook patterns.

---

## 🎯 Vision

A **local web app** that wraps Claude Code with a button-driven UI, mode-based workflows, and pre-loaded knowledge bases — para mas mabilis, mas tipid, at mas focused yung trabaho. Single source of control for both **personal** (chaelri devo) and **work** (crux Salesforce) coding sessions, plus general writing/messaging tasks.

### Problem being solved
Current Claude Code usage burns ~506M tokens/week (~$347 API-equivalent) — most of it is **wasted on repeated investigation**:
- Claude re-discovers the codebase every session (Glob → Grep → Read cycles)
- No mode awareness → defaults to Opus for everything (even simple tweaks)
- Long sessions bloat context (98% cache reads)
- Manual `/clear`, `/compact`, `/model` switching is friction

### Goal
Drop weekly token usage by **65–70%** (~150M tokens/week) by:
1. **Pre-loading curated knowledge MDs** so Claude trusts docs instead of grep-ing
2. **Mode-based routing** (right model + right context per task type)
3. **Auto-compact + auto-clear** to prevent context bloat
4. **Live budget meter** to enforce discipline before hitting limits

If successful → **Max 5x (₱6,924/mo) becomes super comfortable**, vs current borderline situation that pushes toward Max 20x (₱13,869/mo).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (localhost:5000)                       │
│  • Mode selector (cards/buttons)                │
│  • Chat UI with streaming                       │
│  • Live cost meter                              │
│  • Workspace switcher (Personal / Work)         │
│  • Tailwind CSS + Material Web Components       │
└────────────────────┬────────────────────────────┘
                     │ WebSocket (streaming)
                     ▼
┌─────────────────────────────────────────────────┐
│  FastAPI Backend (Python)                       │
│  • Mode loader (mode JSON → CLI flag set)       │
│  • Subprocess runner (spawns claude -p)         │
│  • stream-json parser (forwards to WS clients)  │
│  • Knowledge MD injector (--append-system-prompt│
│    or concatenated into system-prompt-file)     │
│  • Cost tracker (reads ~/.claude/projects/*)    │
│  • Hard cap guard (UI lockout + budget cap flag)│
└────────────────────┬────────────────────────────┘
                     │ spawns subprocess
                     ▼
┌─────────────────────────────────────────────────┐
│  claude -p (Claude Code CLI, headless)          │
│  • --output-format stream-json (NDJSON stream)  │
│  • --model / --system-prompt / --add-dir        │
│  • --allowed-tools / --permission-mode          │
│  • --max-budget-usd / --session-id / --resume   │
│  • --mcp-config / --agents                      │
│  • Keychain auth → Max 5x subscription          │
└─────────────────────────────────────────────────┘
```

### Auth model
Cockpit invokes the existing `claude` CLI as a subprocess with `-p` (print/headless mode). The CLI reads OAuth from macOS Keychain (same as interactive use) and bills against the **Max 5x subscription**. **No `ANTHROPIC_API_KEY` set.** Walang doble-billing, walang separate API metering.

Important: the Agent SDK path is explicitly *not* used because (a) it requires `ANTHROPIC_API_KEY` (separate metered billing), and (b) Anthropic's Feb 2026 ToS update bans third-party OAuth/subscription reuse.

### CLI-flag → Cockpit-feature map
Most "Smart Features" from earlier drafts are already built into `claude -p`. The cockpit composes flags rather than reimplementing logic:

| Cockpit feature | `claude -p` flag |
|---|---|
| Per-mode model | `--model opus\|sonnet\|haiku` |
| Per-mode system prompt | `--system-prompt` or `--append-system-prompt` |
| Per-mode workspace | `--add-dir <path>` |
| Per-mode tool gating | `--allowed-tools` / `--disallowed-tools` |
| Permission strictness | `--permission-mode default\|acceptEdits\|bypassPermissions\|plan` |
| Hard cap guard | `--max-budget-usd <N>` |
| Streaming output | `--output-format stream-json --include-partial-messages` |
| Session continuity | `--session-id <uuid>` / `--resume` |
| MCP servers | `--mcp-config <file>` |
| Custom agents | `--agents <json>` |
| Reasoning depth | `--effort low\|medium\|high\|xhigh\|max` |
| Skip auto-memory etc. | `--bare` (only relevant if we ever want full context isolation) |

---

## 🎛️ Mode System

### Personal Modes (chaelri.github.io / devo)

| Mode | Pre-loaded Context | Default Model | Behavior |
|---|---|---|---|
| **🗨️ Random Q&A** | None | Haiku 4.5 | Pure conversation, no file access |
| **🔧 Simple Tweak** | KEY_FILES.md, PATTERNS.md | Sonnet 4.6 | Quick edit mode, minimal investigation |
| **🐛 Bug Fix** | + ARCHITECTURE.md | Sonnet → Opus if stuck | Mid complexity, allow investigation |
| **✨ Add Feature** | + ARCHITECTURE.md + recent commits | Opus 4.7 + plan-first | Deep thinking required |
| **🏗️ Build New** | All knowledge docs | Opus + plan + research | Full architecture mode |

### Work Modes (crux-underwriting / Salesforce)

| Mode | Pre-loaded Context | Default Model | Behavior |
|---|---|---|---|
| **⚡ Salesforce Apex** | APEX_PATTERNS.md, VALIDATORS_GUIDE.md | Opus 4.7 | Complex but tipid via context |
| **📝 Create PR** | PR_STYLE.md, recent merges | Sonnet 4.6 | Format-aware writing |
| **📧 Email Draft** | EMAIL_TEMPLATES.md | Sonnet/Haiku | Pure text generation |
| **💬 Slack/Teams Msg** | None or minimal | Haiku 4.5 | Quick text drafting |

### Mode JSON Schema (example)
```json
{
  "id": "personal-feature",
  "label": "Add Feature",
  "icon": "✨",
  "category": "personal",
  "workspace": "/Users/ccayno/Documents/chaelri.github.io",
  "model": "opus-4-7",
  "plan_first": true,
  "knowledge_files": [
    "knowledge/devo/ARCHITECTURE.md",
    "knowledge/devo/PATTERNS.md",
    "knowledge/devo/KEY_FILES.md"
  ],
  "system_prompt_template": "feature_dev",
  "tools_enabled": ["Read", "Edit", "Bash", "Glob", "Grep"],
  "trust_mode": true,
  "auto_compact_threshold": 70000
}
```

---

## 📚 Knowledge Base Structure

This is the **#1 token-saver**. Pre-curated MD files na **Claude trusts as authoritative**, so it skips re-investigating the codebase.

```
chaelri.github.io/
├── knowledge/
│   ├── devo/
│   │   ├── ARCHITECTURE.md     ← "How the app works" (PWA, vanilla JS, no build)
│   │   ├── KEY_FILES.md        ← "Where everything lives"
│   │   ├── PATTERNS.md         ← "How we do things" (favorites, highlights, modals)
│   │   ├── TTS_KOKORO.md       ← "TTS specifics" (Kokoro, voice, WAV blob)
│   │   ├── AI_FEATURES.md      ← "Gemini proxy, prompts, payloads"
│   │   ├── COMMON_TASKS.md     ← "How to add a feature, modal, control"
│   │   └── DECISIONS.md        ← "Why we chose X over Y"
│   ├── crux/
│   │   ├── APEX_PATTERNS.md
│   │   ├── VALIDATORS_GUIDE.md
│   │   ├── EMAIL_TEMPLATES.md
│   │   ├── PR_STYLE.md
│   │   ├── COMMON_FLOWS.md
│   │   └── DECISIONS.md
│   └── shared/
│       ├── CODE_STYLE.md
│       └── COMMUNICATION_STYLE.md  ← Taglish, casual, etc.
```

### Trust Mode mechanism
- 🔒 **Trust mode (default):** Claude uses ONLY the knowledge MDs. No grep, no file reads. **Saves 30–50% tokens/session.** Fast responses.
- 🔓 **Verify mode:** Claude can investigate if confused. Logs gaps back to suggest MD updates.

### Self-improving loop
When Claude finds info missing in MDs, may auto-suggest:
> "I learned that `verseGlow` animation is 5s and applied to `.verse-header`. Update PATTERNS.md?"

Click "yes" → MD updates → next session walang re-investigation. **Compound knowledge over time.**

---

## 🧠 Smart Features

> **Note (post-pivot):** Several of these become thin shims over `claude -p` flags rather than custom engines. Items marked **[CLI]** delegate to the binary; items marked **[cockpit]** are still real cockpit logic.

### 1. Auto Model Router **[cockpit → CLI]**
```python
def pick_model(prompt: str, mode: str, weekly_budget: dict) -> str:
    if weekly_budget["opus_used_pct"] > 0.85:
        return "sonnet-4-6"  # Hard cap protection
    if mode in ["personal-chat", "work-message"]:
        return "haiku-4-5"
    if mode in ["personal-tweak", "work-pr", "work-email"]:
        return "sonnet-4-6"
    if any(kw in prompt.lower() for kw in ["refactor", "architecture", "complex", "debug"]):
        return "opus-4-7"
    return mode_default
```

### 2. Auto-Compact Engine **[cockpit]**
- Tracks token count per session via stream-json `usage` events
- At 70k → spawn a separate `claude -p` summarization call, replace old messages with summary, start fresh `--session-id`
- At 100k → force compact + warns user
- Saves 40–60% of cache reads (the biggest current waste)
- *Note:* Claude Code itself has `/compact`, but headless mode doesn't expose it — we orchestrate from the cockpit.

### 3. Topic-Switch Detection **[cockpit, optional]**
- Embedding similarity (using local model, e.g., MiniLM) between current prompt and last 5 messages
- Big jump → "Detected topic switch — start new session?" prompt
- Prevents 506M-token bloat sessions
- *Defer to post-MVP* — heuristic (token count + idle gap) is good enough for v1.

### 4. Live Budget Meter **[cockpit]**
- Reads `~/.claude/projects/**/*.jsonl` every 30 seconds
- Parses ccusage data for current week
- Shows progress bars: Opus, Sonnet, Total weekly cap
- Color coding: 🟢 < 60% → 🟡 60–85% → 🔴 > 85%
- At 90% Opus → blocks Opus selection in UI, forces Sonnet/Haiku

### 5. Hard Cap Guard **[cockpit + CLI]**
- UI: at 95% weekly Opus → cockpit grays out Opus modes (cockpit logic).
- CLI: every spawned `claude -p` gets `--max-budget-usd <remaining>` so the binary itself self-terminates if the cockpit's own check is bypassed.

---

## 🎨 UI Design

### Layout (Material Web Components + Tailwind)
```
┌─────────────────────────────────────────────────────┐
│  Claude Code Cockpit              ⚙️  [Settings]    │
├─────────────────────────────────────────────────────┤
│  📊 This Week                                       │
│  Opus  ████████░░ 78% │ Sonnet ███░░ 30% │ $54     │
│  ⚠️  3 days remaining — pace: ₱5,400/wk            │
├─────────────────────────────────────────────────────┤
│  💼 Personal                          🏢 Work       │
│  ┌────────┐ ┌────────┐ ┌────────┐  ┌────────┐      │
│  │ 🗨️ Q&A │ │ 🔧 Tweak│ │ 🐛 Bug │  │ ⚡ Apex │      │
│  └────────┘ └────────┘ └────────┘  └────────┘      │
│  ┌────────┐ ┌────────┐              ┌────────┐      │
│  │ ✨ Feat │ │ 🏗️ Build│              │ 📝 PR  │      │
│  └────────┘ └────────┘              └────────┘      │
├─────────────────────────────────────────────────────┤
│  💬 Conversation                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │ You: add dark mode toggle to settings       │   │
│  │                                             │   │
│  │ Claude (Sonnet • personal-tweak):          │   │
│  │ I'll add it to script.js:line 1245...      │   │
│  │ [streaming...]                              │   │
│  └─────────────────────────────────────────────┘   │
│  [Type message...]                  [🚀 Send]       │
└─────────────────────────────────────────────────────┘
```

### Stack
- **Vanilla JS** (no React/build complexity)
- **Tailwind CSS** via CDN
- **Material Web Components** (Google's official MUI for vanilla JS)
- **Chart.js** for budget visualization
- **highlight.js** for code blocks
- **xterm.js** (optional) for inline terminal output rendering
- **Monaco Editor** (optional) for diff display
- Single HTML file + small JS modules

### Aggressive Mode Toggle
- 🟢 **Safe mode** — confirms every Bash/Edit
- 🟡 **Dev mode (default)** — auto-allows reads/edits, confirms destructive ops
- 🔴 **Aggressive mode** — `--dangerously-skip-permissions` equivalent, custom guard hook blocks rm-rf-/-style operations

---

## 🛠️ Tech Stack Summary

### Backend
- **Python 3.12** (already installed at `/Users/ccayno/Documents/python/bin/python3`)
- **FastAPI** — async web framework
- **uvicorn** — ASGI server
- **`claude` CLI subprocess** — invoked via `asyncio.create_subprocess_exec`, output parsed as NDJSON (`--output-format stream-json`). **Not the Agent SDK.**
- **websockets** — streaming to browser
- **sqlite3** — session history (built-in)
- **sentence-transformers** (deferred to post-MVP) — for topic-switch detection

### Frontend
- HTML + Vanilla JS modules
- Tailwind CSS (CDN)
- Material Web Components
- Chart.js
- highlight.js

### Project Structure (planned)
```
chaelri.github.io/
├── cockpit/
│   ├── server.py              ← FastAPI app
│   ├── modes.py               ← Mode loader
│   ├── router.py              ← Model picker
│   ├── compactor.py           ← Auto-compact engine
│   ├── budget.py              ← Cost tracker
│   ├── public/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── styles.css
│   │   └── components/
│   ├── modes/                 ← JSON configs per mode
│   │   ├── personal-*.json
│   │   └── work-*.json
│   └── requirements.txt
├── knowledge/                 ← The knowledge base
│   ├── devo/
│   ├── crux/
│   └── shared/
└── (existing devo/, etc.)
```

---

## 💰 Cost Analysis

### Current State (Week of Apr 18–25, 2026)
| Metric | Value |
|---|---:|
| Weekly tokens | ~506M |
| API-equivalent cost | ~$347 |
| Subscription | Max 20x (₱13,869/mo) |
| Cache read % | 98% (huge waste) |
| Heaviest day | Apr 23 ($107.51) |
| Repos active | 2 (chaelri + crux) |

### Projected with Cockpit
| Metric | Optimistic | Realistic |
|---|---:|---:|
| Weekly tokens | ~120M | ~180M |
| API-equivalent cost | ~$80 | ~$130 |
| Cache read reduction | 60% | 45% |
| Opus hours/week | ~6 | ~12 |

### Plan Recommendations Post-Cockpit
- ✅ **Max 5x (₱6,924/mo)** — comfortable, recommended
- ⚠️ **Pro (₱1,400/mo)** — borderline; works for 70–80% of tasks but Opus-heavy days will hit caps
- ❌ **Max 20x (₱13,869/mo)** — overkill with cockpit in place

### Savings vs Current
- Stay at Max 5x post-cockpit: **₱7,000/mo saved** vs Max 20x
- **₱84,000/year** preserved (good for wedding fund 💍)
- ROI: 12 hours dev time pays back **within first month**

---

## 📅 Build Timeline (when unparked)

### Day 1 — Backend MVP (4 hours)
- [ ] Set up FastAPI project skeleton in `cockpit/`
- [ ] Build `runner.py`: async subprocess wrapper around `claude -p --output-format stream-json`, yields parsed events
- [ ] Build `/api/chat` WebSocket endpoint: receives prompt + mode, spawns runner, forwards stream-json events to client
- [ ] **Auth verification:** confirm runner works with no `ANTHROPIC_API_KEY` set; usage shows up in `~/.claude/projects/` jsonl (= Max subscription, not API key)
- [ ] Test basic prompt → response end-to-end via wscat

### Day 2 — Frontend MVP (3 hours)
- [ ] Single-page HTML with Tailwind + Material Web
- [ ] WebSocket connection for streaming responses
- [ ] Mode selector cards (4 personal + 4 work)
- [ ] Basic chat history display
- [ ] Working end-to-end demo

### Day 3 — Smart Features (3 hours)
- [ ] Mode JSON loader + system prompt templating
- [ ] Auto model router based on mode + prompt
- [ ] Auto-compact engine with token threshold
- [ ] Live budget meter (poll ccusage data)
- [ ] Hard cap guard at 90%

### Day 4 — Knowledge & Polish (2 hours)
- [ ] Write `knowledge/devo/` MDs (use Claude itself to draft, review manually)
- [ ] Write `knowledge/crux/` MDs (same approach)
- [ ] UI polish (animations, error states, dark mode)
- [ ] README with run instructions

### Post-build
- Use cockpit for 2 weeks
- Track actual usage vs projections
- Refine modes based on what irritates
- Decide Pro vs Max 5x based on real data

---

## 🚧 Open Questions / Future Decisions

### Resolved by pivot (2026-04-26):
- ~~**Auth model**~~ → `claude -p` subprocess, Keychain-backed, Max subscription billing.
- ~~**MCP integration**~~ → `--mcp-config` flag passes through; existing servers Just Work.
- ~~**Aggressive mode**~~ → `--permission-mode bypassPermissions` + `--max-budget-usd` per call (CLI does the gating).

### Still to resolve when building:
1. **Topic-switch detection** — defer to post-MVP. Start with heuristic (token count + idle gap).
2. **Knowledge MD updates** — manual approval flow vs auto-merge with diff log?
3. **Multi-session support** — single chat thread vs tabs per workspace? (Map to `--session-id` per tab.)
4. **Backup of conversations** — local SQLite only, or sync to file system? (CLI already writes to `~/.claude/projects/`, so SQLite is duplication unless we want richer queries.)
5. **stream-json schema stability** — the NDJSON event shape is undocumented and can change between Claude Code releases. Need to defensive-parse and version-pin or detect breakage.
6. **Concurrent subprocesses** — multiple cockpit tabs each spawn their own `claude -p`. Confirm OK with Keychain (likely fine; Claude Code itself runs concurrent sessions).

### Future enhancements (post-MVP):
- Voice input (browser SpeechRecognition API)
- Mobile-responsive layout (control cockpit from phone)
- Slack/Teams export for drafted messages
- PR auto-creation via gh CLI integration
- Knowledge MD auto-sync from git commits

---

## 🎯 Success Metrics

After 2 weeks of cockpit use, evaluate:

| Metric | Current | Target |
|---|---:|---:|
| Weekly tokens | 506M | < 200M |
| API-equiv cost | $347 | < $150 |
| Opus hit-cap incidents | Unknown | 0 |
| Time-to-task-start | Variable | < 30s (one click) |
| Knowledge MD coverage | 0% | 80% of common tasks |
| Sessions ended cleanly | ~50% | > 90% (auto-compact) |

If achieved → **downgrade to Max 5x with confidence**.

---

## 📝 Notes for Future-Charlie / Future-Claude

- **Unparked 2026-04-26.** Repo is clean (no leftover quick-commit clutter at root); ready to add `cockpit/` + `knowledge/` folders.
- **Architecture pivot:** SDK approach abandoned (Anthropic ToS Feb 2026 + missing `~/.claude/.credentials.json`). Cockpit now wraps `claude -p` subprocess. See top of file for full pivot rationale.
- **Don't lose:** The mental model that *pre-loaded knowledge MDs are the biggest token-saver*, more than auto-routing or auto-compact. That insight is the core of this design.
- **Reusability:** Once built, the cockpit pattern (modes + knowledge MDs + flag-mapping over `claude -p`) is **portable to other projects**. Just copy the structure, fill in new knowledge MDs, redefine modes.

---

## 🔗 Related Context

- Current Claude Code subscription: Max 20x via Anthropic web (₱13,869/mo)
- Active repos: `chaelri.github.io` (personal/devo), `crux-underwriting` (work/Salesforce)
- User preferences: Taglish, casual, dark mode default, aggressive Claude Code mode (`--dangerously-skip-permissions`)
- Wedding date: July 2, 2026 (resource allocation context — savings matter)

---

*Park file. Reopen when ready to build.*
