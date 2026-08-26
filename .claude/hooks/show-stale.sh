#!/bin/bash
# SessionStart hook: surface stale knowledge MDs if any are pending review.

set -uo pipefail

stale="${CLAUDE_PROJECT_DIR:-}/.claude/knowledge-stale.md"
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
[ ! -s "$stale" ] && exit 0   # missing or empty

command -v jq >/dev/null 2>&1 || exit 0

# Count entries (each starts with "## ")
count=$(grep -c '^## ' "$stale" 2>/dev/null) || count=0

# Read a bounded slice directly — never `cat | head`, which SIGPIPEs cat (141).
content=$(head -200 "$stale" 2>/dev/null) || content=""

jq -n \
  --arg msg "🔔 Knowledge MDs may be stale ($count edit(s) pending review). See \`.claude/knowledge-stale.md\` or run \`/sync-knowledge\`." \
  --arg detail "$content" \
  '{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ($msg + "\n\n<details>\n" + $detail + "\n</details>") } }' 2>/dev/null

exit 0
