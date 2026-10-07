const vscode = require('vscode');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const WORKSPACE = 'claude.code-workspace';
const CLAUDE = path.join(os.homedir(), '.local', 'bin', 'claude.exe');

// Window size on launch (logical pixels, centred on the primary screen).
const WIDTH = 1100;
const HEIGHT = 720;

const DARK = 'One Dark Pro Night Flat';
const LIGHT = 'Default Light Modern';

// VS Code has no API to size a window, so ask Windows to do it. The window is
// found by its title, which the workspace pins to "Claude".
function resizeWindow() {
    const script = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class W {
  public delegate bool P(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
}
"@
Add-Type -AssemblyName System.Windows.Forms
# The extension activates before the window is shown and titled "Claude", and
# VS Code then restores its remembered bounds. So poll until the window exists,
# and keep re-applying for a couple of seconds after so the restore can't win.
$a = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$firstHit = $null
for ($i = 0; $i -lt 60; $i++) {
  $script:found = [IntPtr]::Zero
  [W]::EnumWindows({ param($h, $l)
    $sb = New-Object System.Text.StringBuilder 256
    [void][W]::GetWindowText($h, $sb, 256)
    if ([W]::IsWindowVisible($h) -and $sb.ToString() -eq 'Claude') { $script:found = $h; return $false }
    return $true }, [IntPtr]::Zero) | Out-Null
  if ($script:found -ne [IntPtr]::Zero) {
    if ($null -eq $firstHit) { $firstHit = $i }
    $scale = [W]::GetDpiForWindow($script:found) / 96
    $w = [int](${WIDTH} * $scale); $ht = [int](${HEIGHT} * $scale)
    [void][W]::ShowWindow($script:found, 9)
    [void][W]::MoveWindow($script:found, $a.X + [int](($a.Width - $w) / 2), $a.Y + [int](($a.Height - $ht) / 2), $w, $ht, $true)
    if ($i - $firstHit -ge 8) { break }
  }
  Start-Sleep -Milliseconds 250
}`;
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
    }).unref();
}

// Only the window opened by the Claude taskbar shortcut is touched;
// every other VS Code window ignores this extension.
async function activate(context) {
    const ws = vscode.workspace.workspaceFile;
    if (!ws || path.basename(ws.fsPath).toLowerCase() !== WORKSPACE) return;

    vscode.commands.executeCommand('setContext', 'claudeTerminal.active', true);

    // Theme is written to the workspace file, so it only affects this window
    // and is remembered for the next launch.
    context.subscriptions.push(
        vscode.commands.registerCommand('claudeTerminal.toggleTheme', () => {
            const cfg = vscode.workspace.getConfiguration('workbench');
            const isLight = cfg.get('colorTheme') === LIGHT;
            return cfg.update('colorTheme', isLight ? DARK : LIGHT, vscode.ConfigurationTarget.Workspace);
        })
    );

    resizeWindow();

    // Layout is remembered per workspace, so force it on every launch.
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

    // Same session as the claude-usage panel's terminal button (its
    // startTerminal()): skip-permissions, inherited CLAUDE_* markers scrubbed
    // so the transcript is saved, todo tools on. claude runs as the terminal's
    // process rather than typed into a shell, so it starts sooner and its exit
    // closes the window.
    const env = {};
    for (const key of Object.keys(process.env)) {
        if (/^CLAUDE(CODE)?(_|$)/.test(key)) env[key] = null;
    }
    env.CLAUDE_CODE_ENABLE_TODO_TOOLS = '1';
    const folders = vscode.workspace.workspaceFolders;
    const term = vscode.window.createTerminal({
        name: 'claude',
        shellPath: CLAUDE,
        shellArgs: ['--dangerously-skip-permissions'],
        cwd: folders && folders.length ? folders[0].uri.fsPath : undefined,
        iconPath: new vscode.ThemeIcon('sparkle'),
        env,
    });
    term.show(false);
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');

    // Quitting claude quits the app.
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((t) => {
            if (t === term) vscode.commands.executeCommand('workbench.action.closeWindow');
        })
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
