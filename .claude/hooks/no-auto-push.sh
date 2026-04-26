#!/bin/bash
# PreToolUse hook on Bash: block automatic git push.
# Charlie controls all pushes manually (per memory: feedback_no_auto_push.md).

set -euo pipefail

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
[ -z "$cmd" ] && exit 0

# Match `git push` (with surrounding spaces, start, or end)
if echo "$cmd" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+push([^[:alnum:]_]|$)'; then
  echo "⛔ Auto-push blocked. Charlie controls all pushes manually. Ask before pushing." >&2
  exit 2
fi

exit 0
