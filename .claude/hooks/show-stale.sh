#!/bin/bash
# SessionStart hook: surface stale knowledge MDs if any are pending review.

set -uo pipefail

stale="${CLAUDE_PROJECT_DIR:-}/.claude/knowledge-stale.md"
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
[ ! -s "$stale" ] && exit 0   # missing or empty

command -v jq >/dev/null 2>&1 || exit 0

# Count entries (each starts with "## ")
count=$(grep -c '^## ' "$stale" 2>/dev/null) || count=0

jq -n \
  --arg msg "Knowledge MDs: $count edit(s) pending review in .claude/knowledge-stale.md (run /sync-knowledge only when Charlie asks)." \
  '{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: $msg } }' 2>/dev/null

exit 0
