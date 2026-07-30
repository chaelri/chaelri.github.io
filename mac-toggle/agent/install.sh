#!/bin/bash
# mac-toggle agent installer.
#
#   sudo ./install.sh            install + start the LaunchDaemon
#   sudo ./install.sh uninstall  stop + remove it (settings stay as they are)
#   sudo ./install.sh set-admin-password
#                                store the admin password in the SYSTEM keychain so
#                                the "require password after…" row becomes writable
#
set -euo pipefail

LABEL="com.chaelri.mactoggle"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_DST="/usr/local/libexec/mac-toggle.py"
PLIST_DST="/Library/LaunchDaemons/${LABEL}.plist"
LOG="/var/log/mac-toggle.log"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run me with sudo." >&2
    exit 1
  fi
}

case "${1:-install}" in

  install)
    need_root
    echo "→ installing agent to ${SCRIPT_DST}"
    mkdir -p /usr/local/libexec
    install -m 755 -o root -g wheel "${SRC_DIR}/mac-toggle.py" "${SCRIPT_DST}"

    echo "→ installing LaunchDaemon to ${PLIST_DST}"
    install -m 644 -o root -g wheel "${SRC_DIR}/${LABEL}.plist" "${PLIST_DST}"

    # bootout is expected to fail on a first install — that's fine.
    launchctl bootout system "${PLIST_DST}" 2>/dev/null || true
    launchctl bootstrap system "${PLIST_DST}"
    launchctl enable "system/${LABEL}"

    echo "→ started. Tailing the log for 5s…"
    sleep 5
    tail -n 20 "${LOG}" 2>/dev/null || echo "(no log yet — check ${LOG})"
    echo
    echo "Remote:  https://chaelri.github.io/mac-toggle/"
    echo "Log:     tail -f ${LOG}"
    ;;

  uninstall)
    need_root
    echo "→ stopping ${LABEL}"
    launchctl bootout system "${PLIST_DST}" 2>/dev/null || true
    rm -f "${PLIST_DST}" "${SCRIPT_DST}"
    echo "→ removed. Any settings already applied stay as they are."
    echo "  (caffeinate is released automatically when the agent stops)"
    ;;

  set-admin-password)
    need_root
    echo "This stores your macOS account password in the SYSTEM keychain so the"
    echo "agent can call 'sysadminctl -screenLock'. Root can read it back in"
    echo "plaintext. Skip this if you'd rather leave that one row read-only."
    printf "Admin password (leave blank to cancel): "
    stty -echo; read -r PW; stty echo; echo
    if [ -z "${PW}" ]; then echo "cancelled."; exit 0; fi
    security delete-generic-password -a mac-toggle -s mac-toggle-admin \
      /Library/Keychains/System.keychain >/dev/null 2>&1 || true
    security add-generic-password -a mac-toggle -s mac-toggle-admin \
      -w "${PW}" -T /usr/sbin/sysadminctl /Library/Keychains/System.keychain
    unset PW
    echo "→ stored. Restarting the agent so it picks the change up."
    launchctl kickstart -k "system/${LABEL}" 2>/dev/null || true
    ;;

  clear-admin-password)
    need_root
    security delete-generic-password -a mac-toggle -s mac-toggle-admin \
      /Library/Keychains/System.keychain >/dev/null 2>&1 || true
    echo "→ cleared."
    launchctl kickstart -k "system/${LABEL}" 2>/dev/null || true
    ;;

  *)
    echo "usage: sudo $0 [install|uninstall|set-admin-password|clear-admin-password]" >&2
    exit 1
    ;;
esac
