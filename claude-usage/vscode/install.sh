#!/bin/bash
# claude-usage (VS Code) — install / uninstall the status bar indicator.
#
#   ./install.sh            link into ~/.vscode/extensions
#   ./install.sh uninstall  unlink
#
# No packaging step: VS Code loads any folder under ~/.vscode/extensions that
# has a package.json, so a symlink to the repo copy is the whole install. Edit
# the source and reload the window — no rebuild, no .vsix, no vsce, no npm.
#
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$HOME/.vscode/extensions/chaelri.claude-usage-1.0.0"

case "${1:-install}" in

  install)
    if [ ! -d "$HOME/.vscode/extensions" ]; then
      echo "No ~/.vscode/extensions — is VS Code installed?" >&2
      exit 1
    fi
    rm -rf "$EXT_DIR"
    ln -s "$SRC_DIR" "$EXT_DIR"
    echo "→ linked $EXT_DIR → $SRC_DIR"
    echo
    echo "   Reload VS Code to pick it up:"
    echo "     Cmd+Shift+P → \"Developer: Reload Window\""
    echo "   A full reload, not just \"Restart Extension Host\" — the sidebar view is"
    echo "   registered when the window builds its extension registry."
    echo "   Then click the asterisk in the activity bar for the usage panel."
    ;;

  uninstall)
    rm -rf "$EXT_DIR"
    echo "→ removed $EXT_DIR (source in the repo is untouched)."
    ;;

  *)
    echo "usage: $0 [install|uninstall]" >&2
    exit 1
    ;;
esac
