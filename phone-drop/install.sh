#!/bin/bash
# phone-drop — install / uninstall the iCloud "To Mac" inbox watcher.
#
#   ./install.sh            install + start
#   ./install.sh uninstall  stop + remove
#
# No sudo: per-user LaunchAgent, running as you, in your GUI session.
#
set -euo pipefail

LABEL="com.chaelri.phonedrop"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="$HOME/Library/Application Support/phone-drop"
BIN="$DEST_DIR/phone-drop"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/Library/Logs/phone-drop.log"
INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/To Mac"

case "${1:-install}" in

  install)
    if [ "$(id -u)" -eq 0 ]; then
      echo "Don't run this with sudo — it has to read YOUR iCloud Drive." >&2
      exit 1
    fi

    mkdir -p "$DEST_DIR" "$INBOX" "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
    echo "→ building with swiftc"
    swiftc -O -o "$BIN" "$SRC_DIR/phone-drop.swift"
    # stable identifier, so any privacy grant macOS attaches survives rebuilds
    codesign -f -s - -i "$LABEL" "$BIN"

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
  <key>WatchPaths</key>
  <array>
    <string>${INBOX}</string>
  </array>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
PLISTEOF

    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    # bootout is async; bootstrapping into the gap fails with I/O error 5
    for _ in $(seq 20); do
      launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || break
      sleep 0.2
    done
    launchctl bootstrap "gui/$(id -u)" "$PLIST"

    echo "✓ watching: $INBOX"
    echo "  files land in: $HOME/Downloads/From iPhone"
    echo "  log: $LOG"
    ;;

  uninstall)
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    rm -f "$PLIST"
    rm -rf "$DEST_DIR"
    echo "✓ removed (the iCloud 'To Mac' folder was left in place)"
    ;;

  *)
    echo "usage: $0 [install|uninstall]" >&2
    exit 1
    ;;
esac
