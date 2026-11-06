#!/bin/bash
# Cursor stop -> bling on reply (when toggled on in the panel), error alert on a failed turn.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
input=$(cat)
if [ "$(printf '%s' "$input" | jq -r '.status // empty')" = error ]; then
  printf '%s' "$input" | jq '{error:(.error // "Cursor turn failed"),cwd:(.workspace_roots[0] // "")}' | "$HOME/.claude/hooks/notify-error.sh"
else
  printf '%s' "$input" | /Library/Developer/CommandLineTools/usr/bin/python3 "$HOME/chaelri.github.io/bling/on_stop.py"
fi
echo '{}'
