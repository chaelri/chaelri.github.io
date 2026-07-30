#!/bin/bash
# mac-toggle menu bar indicator — install / uninstall.
#
#   ./install-menubar.sh            build + install + start
#   ./install-menubar.sh uninstall  stop + remove
#
# No sudo anywhere: this runs as you, in your GUI session. It only reads pmset
# and PUTs to Firebase — the root daemon is still the only thing that writes
# system settings.
#
set -euo pipefail

LABEL="com.chaelri.mactoggle.menubar"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/Library/Application Support/mac-toggle"
BIN="$DEST_DIR/menubar"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/Library/Logs/mac-toggle-menubar.log"

case "${1:-install}" in

  install)
    if [ "$(id -u)" -eq 0 ]; then
      echo "Don't run this with sudo — it's a per-user agent." >&2
      exit 1
    fi

    echo "→ building with swiftc (takes a few seconds)"
    mkdir -p "$DEST_DIR" "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
    # -parse-as-library: the source uses @main, so swiftc must not treat the
    # file as a script with top-level code.
    swiftc -O -parse-as-library -o "$BIN" "$SRC_DIR/mac-toggle-menubar.swift"

    echo "→ writing LaunchAgent"
    cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BIN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
PLISTEOF

    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "→ running. Look for a ✓ or ✗ circle in your menu bar."
    echo "   left click = toggle · right click = menu"
    echo "   log: $LOG"
    ;;

  uninstall)
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    rm -f "$PLIST" "$BIN"
    echo "→ removed."
    ;;

  *)
    echo "usage: $0 [install|uninstall]" >&2
    exit 1
    ;;
esac
