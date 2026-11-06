#!/bin/bash
# Cursor beforeShellExecution -> the same guards Claude Code runs. One copy of the rules.
# A guard that says no, or breaks, denies the command. Passing returns {} (not "allow"),
# so Cursor's own approval mode still decides.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.command // empty') || exit 1
cwd=$(printf '%s' "$input" | jq -r '.cwd // .workspace_roots[0] // empty')
[ -z "$cmd" ] && { echo '{}'; exit 0; }
payload=$(jq -n --arg c "$cmd" '{tool_input:{command:$c}}')
hooks=("$HOME/.claude/hooks/block-destructive.sh")
# The push guard is project-level in Claude Code too: other repos, like salesforce2, push normally.
case "$cwd" in
  "$HOME/chaelri.github.io"|"$HOME/chaelri.github.io/"*) hooks+=("$HOME/chaelri.github.io/.claude/hooks/no-auto-push.sh") ;;
esac
for hook in "${hooks[@]}"; do
  [ -x "$hook" ] || exit 1
  err=$(printf '%s' "$payload" | "$hook" 2>&1 >/dev/null)
  if [ $? -ne 0 ]; then
    jq -n --arg m "$err" '{permission:"deny",user_message:$m,agent_message:$m}'
    exit 0
  fi
done
echo '{}'
