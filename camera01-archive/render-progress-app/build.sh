#!/bin/bash
# Build the Swift sources and bundle the binary into a macOS .app.
# Output: Build/Render Progress.app (also placed next to the script as
# "Render Progress.app" for double-click convenience).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="Render Progress"
BIN="RenderProgress"

echo "→ swift build -c release"
cd "$HERE"
swift build -c release

BIN_PATH="$(swift build -c release --show-bin-path)/$BIN"
if [ ! -x "$BIN_PATH" ]; then
  echo "binary not found at $BIN_PATH" >&2; exit 1
fi

APP="$HERE/$NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN_PATH" "$APP/Contents/MacOS/$BIN"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>           <string>Render Progress</string>
  <key>CFBundleDisplayName</key>    <string>Render Progress</string>
  <key>CFBundleIdentifier</key>     <string>com.cayno.renderprogress</string>
  <key>CFBundleVersion</key>        <string>1.0</string>
  <key>CFBundleShortVersionString</key> <string>1.0</string>
  <key>CFBundlePackageType</key>    <string>APPL</string>
  <key>CFBundleExecutable</key>     <string>RenderProgress</string>
  <key>CFBundleIconFile</key>       <string>icon</string>
  <key>LSMinimumSystemVersion</key> <string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
</dict>
</plist>
PLIST

# Copy icon if present.
if [ -f "$HERE/icon.icns" ]; then
  cp "$HERE/icon.icns" "$APP/Contents/Resources/icon.icns"
fi

# Ad-hoc sign so Gatekeeper allows local launch.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "→ built: $APP"
ls -lh "$APP/Contents/MacOS/$BIN"
