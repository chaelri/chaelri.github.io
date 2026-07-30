#!/bin/bash
# claude-usage — install / uninstall the menu bar usage indicator.
#
#   ./install.sh            build + install + start
#   ./install.sh uninstall  stop + remove
#
# No sudo: per-user LaunchAgent, running as you, in your GUI session.
#
set -euo pipefail

LABEL="com.chaelri.claudeusage"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/Library/Application Support/claude-usage"
BIN="$DEST_DIR/claude-usage"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/Library/Logs/claude-usage.log"

case "${1:-install}" in

  install)
    if [ "$(id -u)" -eq 0 ]; then
      echo "Don't run this with sudo — it needs YOUR keychain, not root's." >&2
      exit 1
    fi

    echo "→ building with swiftc"
    mkdir -p "$DEST_DIR" "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
    # -parse-as-library because the source uses @main
    swiftc -O -parse-as-library -o "$BIN" "$SRC_DIR/claude-usage.swift"

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
    echo "→ running. Look for a percentage in your menu bar."
    echo
    echo "   The FIRST refresh will pop a keychain prompt:"
    echo "     \"claude-usage wants to use your confidential information\""
    echo "   Click ALWAYS ALLOW, or the percentage stays as a dash."
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
