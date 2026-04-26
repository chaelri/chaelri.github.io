# Claude Code Hooks — Patterns Used in This Repo

**Purpose:** Document the hook patterns for the chaelri.github.io cockpit so any future Claude session knows how to create or modify them, regardless of subscription tier.

## What Are Hooks?

In Claude Code, **hooks** are shell commands the harness runs in response to lifecycle events. They allow automated behavior that Claude itself doesn't control — they execute in the harness, not in the model.

Hooks live in `.claude/settings.json` (project) or `~/.claude/settings.json` (user) under the `hooks` key.

## Hook Events (Most Useful)

| Event | When It Fires | Use Cases |
|-------|---------------|-----------|
| `SessionStart` | New Claude session opens | Surface stale knowledge MDs, show project context |
| `UserPromptSubmit` | User submits a prompt | Inject context, reroute prompts, log activity |
| `PreToolUse` | Before any tool runs | Block destructive ops, validate args |
| `PostToolUse` | After tool completes | React to edits/writes (e.g., flag stale docs) |
| `Stop` | Claude finishes a turn | Show summary, run linters |
| `SubagentStop` | Subagent finishes | Aggregate sub-agent results |
| `Notification` | Claude shows a notification | Log/relay to Slack/Discord |

## Hook Format

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh"
          }
        ]
      }
    ]
  }
}
```

- `matcher`: regex against tool name (e.g., `"Edit"` matches Edit only; `"Edit|Write"` matches both)
- `command`: shell command to run; receives JSON event on stdin
- `type: "command"`: standard shell hook (most common)

## Hook Input/Output

**Input (stdin, JSON):** Event-specific payload. For `PostToolUse`:
```json
{
  "tool_name": "Edit",
  "tool_input": { "file_path": "...", "old_string": "...", "new_string": "..." },
  "tool_response": { ... },
  "session_id": "...",
  "transcript_path": "..."
}
```

**Output:** Hook can:
- Exit 0 silently (no-op)
- Exit 0 with stdout → goes to Claude's view (visible context)
- Exit 2 with stderr → blocks the operation (PreToolUse/UserPromptSubmit only)
- Output JSON for advanced control:
  ```json
  { "hookSpecificOutput": { "additionalContext": "..." } }
  ```

## Patterns We've Built / Want to Build

### 1. Knowledge-MD Staleness Detector (PostToolUse)

**Goal:** When Charlie edits a file, check if it's referenced in any `knowledge/**/*.md` doc. If so, append a note to `.claude/knowledge-stale.md` so it surfaces next session.

**Hook:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/knowledge-stale-check.sh" }
        ]
      }
    ]
  }
}
```

**Script (`.claude/hooks/knowledge-stale-check.sh`):**
```bash
#!/bin/bash
# Read JSON from stdin, extract file_path, check if referenced in knowledge/*.md
# If matched, append "<file_path> changed at <date> — review <md> section" to .claude/knowledge-stale.md
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# Search knowledge/*.md for references to file_path basename or relative path
basename=$(basename "$file_path")
matches=$(grep -rl "$basename" "$CLAUDE_PROJECT_DIR/knowledge" 2>/dev/null || true)

if [ -n "$matches" ]; then
  echo "[$(date)] $file_path edited — referenced in:" >> "$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
  echo "$matches" | sed 's|^|  - |' >> "$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
  echo "" >> "$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
fi
exit 0
```

### 2. Stale-MD Surface (SessionStart)

**Goal:** If `.claude/knowledge-stale.md` exists at session start, surface it to Charlie.

**Hook:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/show-stale.sh" }
        ]
      }
    ]
  }
}
```

**Script (`.claude/hooks/show-stale.sh`):**
```bash
#!/bin/bash
stale="$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
[ ! -f "$stale" ] && exit 0
cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "🔔 Knowledge MDs may be stale. Recent edits:\n\n$(cat "$stale")\n\nRun /sync-knowledge to review and apply patches."
  }
}
EOF
```

### 3. Auto-Push Guard (PreToolUse, Bash)

**Goal:** Prevent accidental `git push` (per [feedback_no_auto_push.md](../../../../.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory/feedback_no_auto_push.md)).

**Hook:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/no-auto-push.sh" }
        ]
      }
    ]
  }
}
```

**Script:**
```bash
#!/bin/bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
if echo "$cmd" | grep -qE '\bgit\s+push\b'; then
  echo "⛔ Auto-push blocked. Charlie controls all pushes manually." >&2
  exit 2
fi
exit 0
```

### 4. Destructive Op Guard (PreToolUse, Bash) — Aggressive Mode

**Goal:** Block `rm -rf /`, `git reset --hard` against main, etc. (per [feedback_aggressive_mode.md](../../../../.claude/projects/-Users-ccayno-Documents-chaelri-github-io/memory/feedback_aggressive_mode.md)).

**Hook:** PreToolUse on Bash with regex match on dangerous patterns. Exit 2 with stderr message blocks the op.

## Slash Commands (Related)

While not technically hooks, slash commands provide a similar "shortcut" feel and integrate with the same workflow.

**Location:** `.claude/commands/<name>.md` (project) or `~/.claude/commands/<name>.md` (user).

**Format:**
```markdown
---
description: Short description for /help
---

The command body. This becomes the user prompt when /name is invoked.
Can include $ARGUMENTS for user-supplied args.
```

**`/sync-knowledge` Command (Planned):**

```markdown
---
description: Review stale knowledge MDs and apply patches based on recent edits
---

Read `.claude/knowledge-stale.md` for the list of stale references.
For each entry, read the referenced knowledge MD and the changed file (use `git diff` since the timestamp).
Propose specific patches to the MD that would bring it back in sync.
For each patch, ask the user to approve/reject before applying.
Once done, clear `.claude/knowledge-stale.md`.
```

## Environment Variables in Hooks

- `$CLAUDE_PROJECT_DIR` — absolute path to the project root (where `.claude/` lives)
- All standard env vars (PATH, HOME, etc.)

Hooks should always use `$CLAUDE_PROJECT_DIR` for paths, not relative or hardcoded.

## Debugging Hooks

- Run `claude --debug` to see hook executions
- Hook script errors don't fail the parent operation (PostToolUse) — they're logged and continued
- `PreToolUse` exit 2 + stderr blocks the operation; stderr is shown to Claude

## "Create a Hook" Trigger

When Charlie says "create a hook for X" or "make Claude do Y automatically":

1. **Identify the event:** Which lifecycle moment? (SessionStart, PostToolUse, etc.)
2. **Write the script:** `.claude/hooks/<descriptive-name>.sh` (or .js, .py — anything executable)
3. **Register in settings:** `.claude/settings.json` under `hooks.<EventName>` array
4. **Make executable:** `chmod +x .claude/hooks/<name>.sh`
5. **Test:** trigger the event, run `claude --debug` to verify the hook fires

If the request is ambiguous (e.g., "automatically X"), confirm: "automatic via hook" vs "automatic via Claude's instructions" (memory/CLAUDE.md). Hooks are the right answer when the harness should do it without Claude's involvement.
