#!/bin/bash
# PostToolUse hook: detect when an edit is likely to invalidate a knowledge MD.
# Uses size threshold + identifier matching + dedupe to reduce false positives.
#
# Append to .claude/knowledge-stale.md so it surfaces next session.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")
[ -z "$file_path" ] && exit 0

# Only check files inside the project
case "$file_path" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

rel_path="${file_path#$CLAUDE_PROJECT_DIR/}"

# Skip files where edits don't affect knowledge MDs
case "$rel_path" in
  knowledge/*) exit 0 ;;
  .claude/*) exit 0 ;;
  CLAUDE.md|*/CLAUDE.md) exit 0 ;;
  SETUP.md|COCKPIT_PLAN.md) exit 0 ;;
  # Binary / asset files — never affect architecture MDs
  *.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.webp) exit 0 ;;
  *.mp3|*.mp4|*.m4a|*.wav|*.ogg) exit 0 ;;
  *.woff|*.woff2|*.ttf|*.eot) exit 0 ;;
  *.lock|*-lock.json|package-lock.json|yarn.lock|bun.lockb) exit 0 ;;
  *.log|*.tmp|*.bak) exit 0 ;;
  # Vendored / generated content
  *node_modules/*) exit 0 ;;
  *.venv/*) exit 0 ;;
  *.next/*|*dist/*|*build/*) exit 0 ;;
esac

# Get the change content
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
case "$tool_name" in
  Edit)
    old=$(echo "$input" | jq -r '.tool_input.old_string // ""')
    new=$(echo "$input" | jq -r '.tool_input.new_string // ""')
    ;;
  MultiEdit)
    # Concatenate all old/new strings from edits array
    old=$(echo "$input" | jq -r '.tool_input.edits // [] | map(.old_string) | join("\n")')
    new=$(echo "$input" | jq -r '.tool_input.edits // [] | map(.new_string) | join("\n")')
    ;;
  Write)
    old=""
    new=$(echo "$input" | jq -r '.tool_input.content // ""')
    ;;
  *)
    exit 0
    ;;
esac

# Threshold: skip trivially small edits (< 5 lines total in old + new)
old_lines=$(printf "%s" "$old" | grep -c '^' 2>/dev/null || echo 0)
new_lines=$(printf "%s" "$new" | grep -c '^' 2>/dev/null || echo 0)
total_lines=$((old_lines + new_lines))
[ "$total_lines" -lt 5 ] && exit 0

# Extract identifiers worth tracking (4+ chars, common JS/Python decl forms)
identifiers=$(printf "%s\n%s" "$old" "$new" | \
  grep -oE '\b(function|const|let|var|class|def|async[[:space:]]+function)[[:space:]]+[a-zA-Z_$][a-zA-Z0-9_$]{3,}' 2>/dev/null | \
  awk '{print $NF}' | sort -u | grep -v '^$' || true)

# Also catch arrow-function assignments like `const foo = (...) =>`
arrow_funcs=$(printf "%s\n%s" "$old" "$new" | \
  grep -oE '\b[a-zA-Z_$][a-zA-Z0-9_$]{3,}[[:space:]]*=[[:space:]]*(async[[:space:]]+)?(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)[[:space:]]*=>' 2>/dev/null | \
  awk -F'=' '{gsub(/[[:space:]]/, "", $1); print $1}' | sort -u | grep -v '^$' || true)

all_ids=$(printf "%s\n%s" "$identifiers" "$arrow_funcs" | sort -u | grep -v '^$' || true)

# Match against knowledge MDs:
# 1. If we extracted identifiers, search for those (whole-word match)
# 2. If no identifiers (e.g., CSS edit), fall back to basename match
matches=""
if [ -n "$all_ids" ]; then
  # Build pattern of identifiers; -w ensures whole-word
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    found=$(grep -rlw -F "$id" "$CLAUDE_PROJECT_DIR/knowledge" 2>/dev/null || true)
    if [ -n "$found" ]; then
      matches=$(printf "%s\n%s" "$matches" "$found")
    fi
  done <<< "$all_ids"
fi

# Fallback: if no identifier matches, try basename + relative path
if [ -z "$(echo "$matches" | grep -v '^$' || true)" ]; then
  basename=$(basename "$file_path")
  # Only fall back if the file is "documented" — otherwise the edit is
  # probably in a file the knowledge MDs don't care about.
  matches=$(grep -rl -F -e "$basename" -e "$rel_path" "$CLAUDE_PROJECT_DIR/knowledge" 2>/dev/null || true)
fi

# Dedupe and clean
matches=$(echo "$matches" | sort -u | grep -v '^$' || true)
[ -z "$matches" ] && exit 0

# Dedupe within session: if same file flagged in last hour, skip.
stale_log="$CLAUDE_PROJECT_DIR/.claude/knowledge-stale.md"
if [ -f "$stale_log" ]; then
  # Find most recent timestamp for this file in the log
  last_ts=$(grep -B1 -F "Edited:** \`$rel_path\`" "$stale_log" 2>/dev/null | \
    grep -E '^## [0-9]{4}' | tail -1 | sed 's/^## //' || true)
  if [ -n "$last_ts" ]; then
    # Convert to epoch (try GNU then BSD date)
    last_epoch=$(date -d "$last_ts" +%s 2>/dev/null || \
                 date -j -f "%Y-%m-%d %H:%M:%S" "$last_ts" +%s 2>/dev/null || \
                 echo 0)
    now_epoch=$(date +%s)
    if [ "$last_epoch" != "0" ] && [ $((now_epoch - last_epoch)) -lt 3600 ]; then
      # Already flagged within last hour, skip
      exit 0
    fi
  fi
fi

# Write the stale entry
ts=$(date +"%Y-%m-%d %H:%M:%S")
{
  echo "## $ts"
  echo "**Edited:** \`$rel_path\` (~$total_lines lines)"
  if [ -n "$all_ids" ]; then
    ids_inline=$(echo "$all_ids" | tr '\n' ' ' | sed 's/[[:space:]]*$//' | head -c 200)
    echo "**Identifiers touched:** \`$ids_inline\`"
  fi
  echo ""
  echo "**Knowledge MDs that may be affected:**"
  echo "$matches" | sed "s|^$CLAUDE_PROJECT_DIR/|  - |"
  echo ""
} >> "$stale_log"

exit 0
