#!/bin/bash
# SessionStart hook: surface stale knowledge MDs if any are pending review.

set -euo pipefail

stale="$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
[ ! -f "$stale" ] && exit 0
[ ! -s "$stale" ] && exit 0  # empty file

# Count entries (each starts with "## ")
count=$(grep -c '^## ' "$stale" 2>/dev/null || echo "0")

# Output as additionalContext via JSON
content=$(cat "$stale" | head -200)
jq -n \
  --arg msg "🔔 Knowledge MDs may be stale ($count edit(s) pending review). See \`.claude/knowledge-stale.md\` or run \`/sync-knowledge\`." \
  --arg detail "$content" \
  '{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ($msg + "\n\n<details>\n" + $detail + "\n</details>") } }'

exit 0
