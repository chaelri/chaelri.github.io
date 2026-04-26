# Claude Code Agents — Patterns Used in This Repo

**Purpose:** Document the agent (subagent) patterns we've built around the chaelri.github.io cockpit so any future Claude session — regardless of subscription tier — knows how to invoke or create these.

## What Are Agents?

In Claude Code, **agents** (also called **subagents**) are specialized Claude instances spawned via the `Agent` tool. Each agent has its own context window, runs independently, and returns a single result to the parent. They're useful for:

1. **Parallelizing independent research** (e.g., scan 5 directories in parallel)
2. **Protecting parent context** from large tool outputs (e.g., grep-heavy work)
3. **Specialized expertise** (Explore for code search, Plan for architecture, etc.)

## Built-in Subagents

These come with Claude Code (no setup required):

| Subagent | Purpose | When to Use |
|----------|---------|-------------|
| `Explore` | Fast codebase exploration | Find files, search code, answer codebase questions. Specify thoroughness: "quick" / "medium" / "very thorough" |
| `general-purpose` | Open-ended research + code | Multi-step tasks, complex searches, executing changes |
| `Plan` | Architectural planning | Design implementation strategy before coding |
| `claude-code-guide` | Claude Code/SDK/API questions | "How do I configure hooks?" "How does Agent SDK work?" |
| `statusline-setup` | Configure status line | One-off settings task |

## Custom Agents (How to Define)

Custom agents live in `.claude/agents/<name>.md` (project) or `~/.claude/agents/<name>.md` (user).

**Format:**
```markdown
---
name: my-agent-name
description: One-line description of what this agent does
tools: Read, Edit, Bash, Grep  # optional, restricts available tools
---

System prompt for the agent. Be specific about:
- What this agent should focus on
- Quality bars (cite line numbers, avoid invention, etc.)
- Output format expectations
- Any project-specific conventions
```

**Invoke with:** `Agent({ subagent_type: "my-agent-name", description: "...", prompt: "..." })`

## Patterns We've Used in This Repo

### 1. Knowledge-MD Generation (Codebase → Markdown)

**Used to populate `knowledge/<project>/` directories.**

**Prompt skeleton:**
```
Produce a knowledge base for `/Users/ccayno/Documents/chaelri.github.io/<project>/`.
Output ONE response with N markdown files using `# === knowledge/<project>/<name>.md ===` headers
so they can be split programmatically.

Files needed:
1. SUMMARY.md (~80-150 lines) — quick reference: file structure, key globals, entry points
2. ARCHITECTURE.md (~150-300 lines) — system overview, data flow, integrations
3. KEY_FILES.md (~100-250 lines) — file-by-file map with line ranges
4. PATTERNS.md (~150-300 lines) — recurring code patterns
5. DECISIONS.md (~100-200 lines) — architectural choices + rationale

Quality bar: Use Glob/Grep aggressively. Cite real names, real lines. Mark uncertainty
with "unknown — verify before relying on this." Don't invent.
```

**Subagent type:** `Explore`

### 2. Parallel Multi-Project Survey

**Used to deep-dive 17 projects in parallel.**

Spawn N agents in a single message (parallel execution):
```js
// Pseudo-code
[
  Agent({ subagent_type: "Explore", description: "Deep-dive devo-mobile", prompt: "..." }),
  Agent({ subagent_type: "Explore", description: "Deep-dive guard-exit", prompt: "..." }),
  // ... 15 more
]
```

Each runs independently with `run_in_background: true`. Notification arrives when each completes.

### 3. Hub-Level Mapping

**Used to produce `knowledge/hub/PROJECTS.md`.**

Single agent that surveys all top-level dirs:
```
Map every directory under chaelri.github.io with:
- 1-line purpose
- Status (active/parked/archived)
- Tech stack
- Key entry files
- Deployment target
- Notable quirks

Output ONE markdown document as table-of-contents + sections.
```

### 4. Plan Verification (Second Opinion)

**Used to verify load-bearing assumptions before building.**

Example: "Does `claude-agent-sdk-python` reuse Max subscription auth?"
```js
Agent({
  subagent_type: "claude-code-guide",
  description: "Verify SDK auth model",
  prompt: "Research whether claude-agent-sdk-python supports OAuth/subscription auth or only ANTHROPIC_API_KEY. Return: is path #1 achievable today, partially, or not? Cite docs URLs."
})
```

## When to Spawn vs Do Directly

**Spawn an agent when:**
- Work would generate >500 lines of tool output
- Multiple independent searches/reads needed (parallelize)
- Specialized expertise needed (Explore for codebases, Plan for architecture)
- Need to protect parent context from grep-heavy work

**Don't spawn when:**
- Target is already known (use Read/Edit/Grep directly)
- Single tool call resolves it
- Cost outweighs benefit (~$30-50 per Opus-tier agent run)

## Cost Awareness

Each Opus-tier agent run is ~$30-50 in tokens. For a full repo survey of 17 projects, expect ~$300-500. Use `claude-haiku-4-5` for cheaper agents (10× cost reduction) where the task allows it.

## Cockpit Mode = Pseudo-Agent

The cockpit's `cockpit/modes/*.json` files act like agents — each mode is a pre-configured Claude Code invocation:

```json
{
  "id": "personal-feature",
  "label": "Add Feature",
  "model": "opus",
  "permission_mode": "plan",
  "max_budget_usd": 5.00,
  "knowledge_files": [
    "knowledge/devo/SUMMARY.md",
    "knowledge/devo/ARCHITECTURE.md",
    "knowledge/devo/PATTERNS.md"
  ],
  "append_system_prompt": "Feature-development mode. Plan-first..."
}
```

When the cockpit invokes `claude -p` with these flags, the result is essentially an agent run. See `cockpit/server.py` `build_config()` for the mapping.

## "Create an Agent" Trigger

When Charlie says "create an agent for X" or "make a subagent that does Y":

1. Determine if it's a **built-in case** (Explore, Plan, etc.) — just use the tool with appropriate prompt
2. Determine if it's a **custom subagent** — write to `.claude/agents/<name>.md` with frontmatter + system prompt
3. Determine if it's a **cockpit mode** — write to `cockpit/modes/<name>.json` and document in `knowledge/cockpit/MODES.md`

If in doubt, ask which type. Default to custom subagent if the task is "specialized expertise + repeated use."
