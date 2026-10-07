# Installs the "Claude" taskbar app: a VS Code window that is only a terminal
# running claude in this repo. Safe to re-run.
#
#   powershell -ExecutionPolicy Bypass -File claude-terminal\install.ps1
#
# 1. Writes %USERPROFILE%\ClaudeTerminal\Claude.code-workspace from the template
#    (only if missing -- the theme toggle saves into it, so it is kept).
# 2. Links the extension into ~/.vscode/extensions as a junction to this folder,
#    so edits here are live on the next launch.
# 3. Creates Desktop + Start Menu shortcuts. Pin to the taskbar by hand
#    (right-click the Start Menu entry > Pin to taskbar); Windows has no API for it.

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$home_ = $env:USERPROFILE
$appDir = Join-Path $home_ 'ClaudeTerminal'
$workspace = Join-Path $appDir 'Claude.code-workspace'
$extLink = Join-Path $home_ '.vscode\extensions\chaelri.claude-terminal-1.0.0'
$code = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
$claude = Join-Path $home_ '.local\bin\claude.exe'

if (-not (Test-Path $code)) { throw "VS Code not found at $code" }
if (-not (Test-Path $claude)) { throw "claude not found at $claude" }

# 1. Workspace
New-Item -ItemType Directory -Force $appDir | Out-Null
if (-not (Test-Path $workspace)) {
    $json = (Get-Content -Raw (Join-Path $here 'Claude.code-workspace.template')).Replace('{{REPO}}', $repo.Replace('\', '\\'))
    [System.IO.File]::WriteAllText($workspace, $json)
    "wrote    $workspace"
} else {
    "kept     $workspace"
}

# 2. Extension junction. An existing link (symlink or junction) is removed with
# rmdir, which deletes only the link, never the folder it points to.
if (Test-Path $extLink) {
    $item = Get-Item $extLink -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "$extLink is a real folder, not a link -- move it away first"
    }
    cmd /c rmdir "$extLink" | Out-Null
}
cmd /c mklink /J "$extLink" "$(Join-Path $here 'extension')" | Out-Null
"linked   $extLink -> $(Join-Path $here 'extension')"

# 3. Shortcuts. Every other extension that would add UI to the window is
# disabled for it (claude-usage too -- its own panel would duplicate this).
$disabled = @(
    'anthropic.claude-code', 'chaelri.claude-usage', 'codium.codium',
    'esbenp.prettier-vscode', 'ritwickdey.liveserver',
    'pkief.material-icon-theme', 'github.copilot-chat'
)
$args_ = '--new-window ' + (($disabled | ForEach-Object { "--disable-extension $_" }) -join ' ') + " `"$workspace`""

$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
foreach ($lnkPath in @((Join-Path $home_ 'Desktop\Claude.lnk'), (Join-Path $startMenu 'Claude Terminal.lnk'))) {
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $code
    $lnk.Arguments = $args_
    $lnk.WorkingDirectory = $repo
    $lnk.IconLocation = "$claude,0"
    $lnk.WindowStyle = 1
    $lnk.Save()
    "shortcut $lnkPath"
}

''
'Done. Pin "Claude Terminal" from the Start Menu to the taskbar if it is not already.'
