#!/bin/bash
# PreToolUse hook on Bash: block automatic git push.
# Charlie controls all pushes manually (per memory: feedback_no_auto_push.md).
#
# Explicit-authorization bypass: prefix the command with `CLAUDE_ALLOW_PUSH=1`.
# Use this only when Charlie has explicitly said "push it" in the current turn.

set -euo pipefail

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
[ -z "$cmd" ] && exit 0

# Explicit bypass: command starts with CLAUDE_ALLOW_PUSH=1 (visible to user in tool call)
if echo "$cmd" | grep -qE '(^|[^[:alnum:]_])CLAUDE_ALLOW_PUSH=1\b'; then
  exit 0
fi

# Match `git push` (with surrounding spaces, start, or end)
if echo "$cmd" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+push([^[:alnum:]_]|$)'; then
  echo "⛔ Auto-push blocked. Charlie controls all pushes manually." >&2
  echo "    If Charlie just told you to push, prefix with: CLAUDE_ALLOW_PUSH=1 git push ..." >&2
  exit 2
fi

exit 0
