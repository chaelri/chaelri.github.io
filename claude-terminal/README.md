# claude-terminal

The **Claude** taskbar app on Windows: one click opens a small, centred window
that is nothing but a terminal running `claude --dangerously-skip-permissions`
in this repo. Quitting claude closes the window.

It is a stripped-down VS Code window, not a separate program:

- `Claude.code-workspace.template` hides everything (activity bar, status bar,
  tabs, sidebars, command center), maximises the panel and pins the window
  title to `Claude`.
- `extension/` is a tiny local extension that only acts inside that workspace.
  It opens the claude terminal (same env as the claude-usage panel's terminal
  button: `CLAUDE_*` markers scrubbed so the transcript is saved, todo tools on),
  closes the window when claude exits, sizes the window to 1100x720 centred via
  a hidden PowerShell `MoveWindow` (VS Code has no window-size API), and adds a
  light/dark toggle (`Ctrl+Alt+T`, or the button in the terminal title bar).
- The shortcut launches VS Code with other UI-adding extensions disabled for
  this window only, and uses `claude.exe`'s own icon.

## Install

```powershell
powershell -ExecutionPolicy Bypass -File claude-terminal\install.ps1
```

Writes `%USERPROFILE%\ClaudeTerminal\Claude.code-workspace` (kept if it exists,
since the theme toggle saves into it), junctions the extension into
`~/.vscode/extensions/chaelri.claude-terminal-1.0.0` so edits here are live on
the next launch, and creates Desktop + Start Menu shortcuts. Pin to the taskbar
by hand; Windows has no API for that.

Expects VS Code in the per-user location and claude at `~/.local/bin/claude.exe`.
