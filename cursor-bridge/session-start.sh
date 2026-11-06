#!/bin/bash
# Cursor sessionStart: loads the shared memory in every folder, plus the stale-knowledge count.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cat >/dev/null
msg="Charlie's standing rules live in shared memory. Before anything else, read /Users/charliecayno/.claude/projects/-Users-charliecayno-chaelri-github-io/memory/MEMORY.md, and open any linked file in that folder before acting on what it mentions. Save new memories there in the same format."
stale="$HOME/chaelri.github.io/.claude/knowledge-stale.md"
if [ -s "$stale" ]; then
  msg="$msg Knowledge MDs: $(grep -c '^## ' "$stale") edit(s) pending review in .claude/knowledge-stale.md (run /sync-knowledge only when Charlie asks)."
fi
jq -n --arg m "$msg" '{additional_context:$m}'
