#!/bin/bash
# Open the shell-monitor TUI in its own Terminal.app window.
#
# The window is forced opaque on purpose. Terminal profiles like "Pro" ship with
# transparency, which lets whatever is behind the window bleed through the log text and
# makes the dashboard unreadable. Setting `background color` with a fourth component
# (alpha, 0-65535) overrides the profile's opacity for this window only — the profile
# itself is left alone.
#
#   ./launch.sh [--all] [--cwd <project dir>]

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARGS="${*:-}"

osascript <<OSA
tell application "Terminal"
    activate
    set w to do script "cd '$HERE' && exec python3 tui.py $ARGS"
    delay 0.3
    set win to front window
    -- {red, green, blue, alpha} — alpha 65535 is fully opaque
    set background color of win to {2200, 2600, 3400, 65535}
    set normal text color of win to {51400, 54000, 57600}
    set title displays custom title of win to true
    set custom title of win to "shell-monitor"
    set number of rows of win to 44
    set number of columns of win to 132
end tell
OSA
