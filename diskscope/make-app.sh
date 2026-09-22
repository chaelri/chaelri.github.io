#!/bin/bash
# ============================================================================
# make-app.sh — build "diskscope.app" so it can live in the Dock.
#
#   ./make-app.sh              # build into /Applications, where you look for it
#   ./make-app.sh ~/Applications
#
# The bundle is a launcher, not a copy: it remembers where this checkout lives
# and runs serve.py from here, so editing the code changes the app with no
# rebuild. Rebuild only if you move the folder.
#
# It opens in a Chrome app window — no tabs, no address bar, and no
# swipe-to-go-back, which in an editor is a trap rather than a shortcut.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# /Applications by default: it is the folder people actually search, and it is
# group-writable by admins so this needs no sudo.
DEST="${1:-/Applications}"
APP="$DEST/diskscope.app"
PORT="${PORT:-8770}"

mkdir -p "$DEST"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# -- Info.plist ------------------------------------------------------------- #
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>              <string>diskscope</string>
  <key>CFBundleDisplayName</key>       <string>diskscope</string>
  <key>CFBundleIdentifier</key>        <string>com.chaelri.diskscope</string>
  <key>CFBundleVersion</key>           <string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key>       <string>APPL</string>
  <key>CFBundleExecutable</key>        <string>diskscope</string>
  <key>CFBundleIconFile</key>          <string>diskscope</string>
  <key>NSHighResolutionCapable</key>   <true/>
  <!-- A script-based bundle has no Mach-O header to read an architecture from,
       and LaunchServices will happily start one under Rosetta. /usr/bin/python3
       is an xcrun shim with only a native half, so a translated launch died on
       "missing compatible architecture" before the server ever bound. -->
  <key>LSArchitecturePriority</key>
  <array>
    <string>arm64</string>
    <string>x86_64</string>
  </array>
  <key>LSRequiresNativeExecution</key>  <true/>
</dict>
</plist>
PLIST

# -- launcher --------------------------------------------------------------- #
# The checkout path is baked in at build time. serve.py stays where it is, so
# there is one copy of the code and no "which one am I running" confusion.
cat > "$APP/Contents/MacOS/diskscope" <<LAUNCH
#!/bin/bash
ROOT="$HERE"
PORT="$PORT"
LAUNCH
cat >> "$APP/Contents/MacOS/diskscope" <<'LAUNCH'
# Even with the plist keys, a bundle can be handed to us translated — an
# inherited Rosetta environment, an older LaunchServices record. python3 here
# is native-only, so a translated run has nothing to exec. Come back as
# ourselves rather than failing into an empty Dock icon.
if [ "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
  exec /usr/bin/arch -arm64 "$0" "$@"
fi

cd "$ROOT" || exit 1

CACHE="$HOME/Library/Caches/diskscope"
TOKEN_FILE="$CACHE/token"
PORT_FILE="$CACHE/port"
log="$HOME/Library/Logs/diskscope.log"
mkdir -p "$(dirname "$log")"

# Is it diskscope on that port, or merely something? A bare `nc -z` cannot
# tell, and the difference is the whole bug this replaced: another local
# server on 8770 meant the Dock icon opened its page carrying diskscope's
# token, and the window read "bad token" with nothing to click.
is_diskscope() {
  [ -n "$1" ] || return 1
  /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:$1/whoami" 2>/dev/null \
    | /usr/bin/grep -q '"diskscope"'
}

open_at() {
  url="http://127.0.0.1:$1/?token=$(cat "$TOKEN_FILE")"
  # An app window: no tabs, no address bar, no swipe-to-go-back.
  for chrome in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [ -x "$chrome" ]; then
      "$chrome" --app="$url" >/dev/null 2>&1 &
      return
    fi
  done
  /usr/bin/open "$url"
}

open_ui() {
  # Wait for the server to say which port it actually got — it walks up when
  # the preferred one is taken — then open that. The token survives restarts,
  # so a window opened now stays valid across relaunches.
  for _ in $(seq 1 120); do
    if [ -s "$TOKEN_FILE" ] && [ -s "$PORT_FILE" ]; then
      port="$(cat "$PORT_FILE")"
      if is_diskscope "$port"; then
        open_at "$port"
        return
      fi
    fi
    sleep 0.25
  done
}

# Already running? Just bring up a window and get out of the way, rather than
# fighting the live server for the port.
running="$PORT"
[ -s "$PORT_FILE" ] && running="$(cat "$PORT_FILE")"
if is_diskscope "$running"; then
  open_at "$running"
  exit 0
fi

open_ui &
# Foreground, so the Dock icon means "diskscope is running" and quitting it
# actually stops the server.
exec /usr/bin/python3 -u serve.py --port "$PORT" --no-open >>"$log" 2>&1
LAUNCH
chmod +x "$APP/Contents/MacOS/diskscope"

# -- icon ------------------------------------------------------------------- #
ICONSET="$(mktemp -d)/diskscope.iconset"
mkdir -p "$ICONSET"
for spec in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" \
            "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" \
            "512 512x512" "1024 512x512@2x"; do
  set -- $spec
  /usr/bin/python3 "$HERE/make-icon.py" "$ICONSET/icon_$2.png" "$1"
done
/usr/bin/iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/diskscope.icns"
rm -rf "$(dirname "$ICONSET")"

# The Finder caches bundles aggressively; touching it makes the new icon show.
/usr/bin/touch "$APP"

echo "built $APP"
echo "drag it to the Dock, or: open '$APP'"
