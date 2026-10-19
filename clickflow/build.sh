#!/bin/bash
# ClickFlow — build the .app with swiftc (Xcode Command Line Tools only, no Xcode project).
#
#   ./build.sh            → build/ClickFlow.app
#   ./build.sh install    → build, then copy to /Applications and relaunch
#   ./build.sh test       → build, then run the headless self-test
#
# Signing: macOS ties the Accessibility grant to the app's code signature. An ad-hoc
# signature changes on every build (re-grant every time), so the first run creates a
# self-signed "ClickFlow Local Signing" identity in its own keychain and every build is
# signed with it. Same certificate → same designated requirement → the grant sticks.
set -euo pipefail
cd "$(dirname "$0")"

APP="build/ClickFlow.app"
IDENTITY="ClickFlow Local Signing"
KEYCHAIN="$HOME/Library/Keychains/clickflow-signing.keychain-db"
KEYCHAIN_PASS="clickflow-local-signing"   # protects only this self-signed dev certificate

ensure_identity() {
  if [ ! -f "$KEYCHAIN" ]; then
    echo "→ creating signing keychain"
    security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
    security set-keychain-settings "$KEYCHAIN"   # never auto-lock
  fi
  security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
  # codesign only finds identities in keychains on the user search list.
  if ! security list-keychains -d user | grep -q "clickflow-signing"; then
    # shellcheck disable=SC2046
    security list-keychains -d user -s $(security list-keychains -d user | tr -d '"') "$KEYCHAIN"
  fi
  if ! security find-certificate -c "$IDENTITY" "$KEYCHAIN" >/dev/null 2>&1; then
    echo "→ creating self-signed identity \"$IDENTITY\""
    local tmp; tmp="$(mktemp -d)"
    cat > "$tmp/req.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $IDENTITY
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CNF
    /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$tmp/req.cnf" \
      -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
    /usr/bin/openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
      -out "$tmp/id.p12" -passout pass:"$KEYCHAIN_PASS"
    security import "$tmp/id.p12" -k "$KEYCHAIN" -P "$KEYCHAIN_PASS" -T /usr/bin/codesign >/dev/null
    # Let codesign use the key without a GUI prompt.
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN" >/dev/null
    rm -rf "$tmp"
  fi
}

build() {
  echo "→ compiling"
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  # Swift 5 language mode: the AppKit callback glue here is main-thread by construction.
  swiftc -O -swift-version 5 -parse-as-library -target arm64-apple-macos14.0 \
    -o "$APP/Contents/MacOS/ClickFlow" $(find Sources -name '*.swift' | sort)
  cp Info.plist "$APP/Contents/Info.plist"
  cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

  ensure_identity
  echo "→ signing"
  codesign --force --sign "$IDENTITY" --identifier com.chaelri.clickflow "$APP"
  codesign --verify --strict "$APP"
  echo "✓ $APP"
}

case "${1:-build}" in
  build)
    build
    ;;
  test)
    build
    "$APP/Contents/MacOS/ClickFlow" --selftest
    ;;
  install)
    build
    if pgrep -x ClickFlow >/dev/null; then
      echo "→ quitting the running copy"
      osascript -e 'tell application id "com.chaelri.clickflow" to quit' || true
      for _ in $(seq 1 40); do pgrep -x ClickFlow >/dev/null || break; sleep 0.25; done
      pkill -x ClickFlow || true
    fi
    echo "→ installing to /Applications"
    ditto "$APP" /Applications/ClickFlow.app
    open /Applications/ClickFlow.app
    echo "✓ /Applications/ClickFlow.app"
    ;;
  backup)
    # Copies the live macros (steps + schedules) into the repo. The Discord webhook is a
    # separate file and is never included.
    src="$HOME/Library/Application Support/ClickFlow/macros.json"
    if grep -q "discord.com/api/webhooks" "$src"; then echo "✗ macros.json contains a webhook URL; not copying" >&2; exit 1; fi
    mkdir -p macros
    cp "$src" macros/macros.json
    echo "✓ macros/macros.json"
    ;;
  *)
    echo "usage: $0 [build|install|test|backup]" >&2
    exit 2
    ;;
esac
