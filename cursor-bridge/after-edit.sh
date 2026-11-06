#!/bin/bash
# Cursor afterFileEdit -> Claude Code's stale-knowledge check.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
export CLAUDE_PROJECT_DIR="$HOME/chaelri.github.io"
jq '{tool_input:{file_path:.file_path}}' | "$CLAUDE_PROJECT_DIR/.claude/hooks/knowledge-stale-check.sh" >/dev/null 2>&1
exit 0
