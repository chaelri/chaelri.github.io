#!/bin/bash
# Cursor beforeShellExecution -> the same guards Claude Code runs. One copy of the rules.
# A guard that says no, or breaks, denies the command. Passing returns {} (not "allow"),
# so Cursor's own approval mode still decides.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cmd=$(jq -r '.command // empty') || exit 1
[ -z "$cmd" ] && { echo '{}'; exit 0; }
payload=$(jq -n --arg c "$cmd" '{tool_input:{command:$c}}')
for hook in "$HOME/.claude/hooks/block-destructive.sh" "$HOME/chaelri.github.io/.claude/hooks/no-auto-push.sh"; do
  [ -x "$hook" ] || exit 1
  err=$(printf '%s' "$payload" | "$hook" 2>&1 >/dev/null)
  if [ $? -ne 0 ]; then
    jq -n --arg m "$err" '{permission:"deny",user_message:$m,agent_message:$m}'
    exit 0
  fi
done
echo '{}'
