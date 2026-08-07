// claude-usage (VS Code) — the same percentage the menu bar item shows, inside
// the editor, so it's on screen while you're actually working.
//
// Two surfaces:
//   - an activity bar icon whose badge is the session percentage, and whose
//     panel draws every limit as a meter with its reset time (the primary one)
//   - an optional status bar text item (claudeUsage.showStatusBar)
//
// The panel is a WEBVIEW, not a tree. A TreeItem renders one line of label text
// plus an icon and nothing else, so the bars had to be block characters — which
// ragged-edge in the proportional UI font, can't be coloured by fill level, and
// pushed the reset time into an ellipsis at any normal sidebar width. A webview
// costs an HTML document and gets real geometry back.
//
// Same source as the Swift app: GET https://api.anthropic.com/api/oauth/usage
// with the OAuth token Claude Code keeps in the login keychain. Account
// metadata, not inference — polling it costs no tokens.
//
// UNDOCUMENTED ENDPOINT: internal API, can change without notice. Every failure
// is visible (never a stale number shown as current).

const vscode = require('vscode');
const { execFile } = require('child_process');
const https = require('https');
const crypto = require('crypto');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const USAGE_HOST = 'api.anthropic.com';
const USAGE_PATH = '/api/oauth/usage';
const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const SETTINGS_URL = 'https://claude.ai/settings/usage';

let item = null;
let panel = null;
let timer = null;
let state = { limits: [], error: null, loading: false, updatedAt: null };

/** Claude Code rotates the token, so re-read the keychain every refresh. */
function accessToken() {
    return new Promise((resolve) => {
        execFile(
            '/usr/bin/security',
            ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
            { timeout: 10000 },
            (err, stdout) => {
                if (err) return resolve(null);
                try {
                    const json = JSON.parse(String(stdout).trim());
                    resolve((json.claudeAiOauth && json.claudeAiOauth.accessToken) || json.accessToken || null);
                } catch (_) {
                    resolve(null);
                }
            }
        );
    });
}

function getUsage(token) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                host: USAGE_HOST,
                path: USAGE_PATH,
                method: 'GET',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'anthropic-beta': 'oauth-2025-04-20',
                },
                timeout: 15000,
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        return reject(new Error('Login expired — run `claude` once'));
                    }
                    if (res.statusCode !== 200) {
                        return reject(new Error('HTTP ' + res.statusCode));
                    }
                    try {
                        resolve(JSON.parse(body));
                    } catch (_) {
                        reject(new Error('Unreadable response'));
                    }
                });
            }
        );
        req.on('timeout', () => req.destroy(new Error('Timed out')));
        req.on('error', (err) => reject(err));
        req.end();
    });
}

/** Same labels the menu bar item uses, so the two read as one tool. */
function labelFor(limit) {
    if (limit.kind === 'session') return 'Session · 5 hr';
    if (limit.kind === 'weekly_all') return 'Weekly · all models';
    if (limit.kind === 'weekly_scoped') {
        // scope is { model: { id, display_name }, surface } — the readable name
        // is nested two deep, and every level can be null.
        const model = limit.scope && limit.scope.model;
        const name = model && model.display_name;
        return 'Weekly · ' + (name || 'scoped');
    }
    return String(limit.kind || 'Limit');
}

/// Panel names. The session keeps its window length — it's the one limit where
/// how long you have back matters — but the weekly rows drop nothing, since the
/// panel has real width to spend where a status bar tooltip did not.
function shortLabelFor(limit) {
    if (limit.kind === 'session') return 'Session · 5 hr';
    return labelFor(limit);
}

/** "resets 8:00 PM" today, "resets Sun 8:00 PM" later in the week. */
function resetText(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    const today = new Date();
    const sameDay =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return 'resets ' + (sameDay ? time : date.toLocaleDateString([], { weekday: 'short' }) + ' ' + time);
}

/** "in 3h 44m" — the clock time alone doesn't say how much runway is left. */
function remainingText(iso) {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    const mins = Math.round((date.getTime() - Date.now()) / 60000);
    if (mins <= 0) return 'due now';
    if (mins < 60) return 'in ' + mins + 'm';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return 'in ' + hours + 'h' + (mins % 60 ? ' ' + (mins % 60) + 'm' : '');
    const days = Math.floor(hours / 24);
    return 'in ' + days + 'd' + (hours % 24 ? ' ' + (hours % 24) + 'h' : '');
}

function updatedText() {
    if (state.loading) return 'Refreshing…';
    if (!state.updatedAt) return 'Never updated';
    const mins = Math.floor((Date.now() - state.updatedAt) / 60000);
    return 'Updated ' + (mins < 1 ? 'just now' : mins + 'm ago');
}

function sessionLimit() {
    return state.limits.find((l) => l.kind === 'session') || null;
}

function weeklyLimit() {
    return state.limits.find((l) => l.kind === 'weekly_all') || null;
}

// MARK: - the activity bar panel

/// What the webview is handed. Everything display-shaped is computed here, in
/// the extension host, so the page stays a renderer — the reset strings already
/// carry the user's locale, and the page never has to know the API's shape.
function snapshot() {
    return {
        error: state.error,
        loading: state.loading,
        updated: updatedText(),
        limits: state.limits.map((limit) => ({
            kind: String(limit.kind || ''),
            label: shortLabelFor(limit),
            percent: Math.max(0, Math.min(100, Number(limit.percent) || 0)),
            reset: resetText(limit.resets_at),
            remaining: remainingText(limit.resets_at),
        })),
    };
}

class UsagePanel {
    constructor(uri) {
        this.uri = uri;
        this.view = null;
    }

    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this.uri] };
        view.webview.html = page();
        view.webview.onDidReceiveMessage((message) => {
            if (message === 'refresh') refresh();
        });
        // A hidden webview drops posted messages, so re-send on the way back in
        // rather than leaving a stale reading on screen.
        view.onDidChangeVisibility(() => view.visible && this.post());
        // Full render, not just a post: this is also where the status bar
        // fallback stands down, now that there's a panel to read.
        render();
    }

    post() {
        if (this.view) this.view.webview.postMessage(snapshot());
    }
}

/// One static document; every update arrives by postMessage. Colours come from
/// VS Code's own theme variables so the panel follows light/dark and any custom
/// theme without a second palette to keep in sync.
function page() {
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  :root {
    /* Neutral grey reads as a recessed track against both a light and a dark
       editor background, which no single theme variable does. */
    --track: rgba(127, 127, 127, 0.22);
    /* Claude's own terracotta, hardcoded rather than pulled from a theme
       variable — it's the product's colour, the same #D97757 the menu bar app
       tints its asterisk with, and it shouldn't drift when the theme changes. */
    --calm: #d97757;
    /* The warning tiers stay theme-supplied: those are the editor's own
       vocabulary for caution and trouble, and they need to be legible against
       whatever background the theme paints, which a fixed pair can't promise. */
    --warn: var(--vscode-charts-yellow, #d18616);
    --hot: var(--vscode-charts-red, #f14c4c);
    --link: #d97757;
  }
  /* VS Code stamps vscode-light / vscode-dark / vscode-high-contrast on the
     webview body. #D97757 clears 5:1 against a dark editor but only 3.2:1
     against white, which is under the bar for 11px text — light themes get the
     same hue walked down in lightness rather than a different colour. */
  body.vscode-light { --link: #b4552f; }
  body.vscode-high-contrast { --link: #f0a184; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14px 16px 16px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    user-select: none;
  }
  .muted { color: var(--vscode-descriptionForeground); }

  .meter { position: relative; height: 6px; border-radius: 99px; background: var(--track); overflow: hidden; }
  .meter > i {
    position: absolute; inset: 0 auto 0 0;
    width: 0;
    border-radius: 99px;
    background: var(--calm);
    transition: width 420ms cubic-bezier(.2,.8,.2,1), background-color 420ms ease;
  }
  .warn .meter > i { background: var(--warn); }
  .hot .meter > i { background: var(--hot); }

  /* Hero — the 5-hour window, the one that actually runs out mid-task. */
  .hero { margin-bottom: 4px; }
  .hero .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .hero .pct {
    font-size: 30px; line-height: 1.05; font-weight: 600;
    letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
  }
  .hero .pct small { font-size: 15px; font-weight: 500; margin-left: 1px; opacity: .55; }
  .hero .name { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; }
  .hero .meter { height: 8px; margin: 9px 0 6px; }
  .hero.warn .pct { color: var(--warn); }
  .hero.hot .pct { color: var(--hot); }
  .hero .foot { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
  .hero .foot span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  hr { border: none; border-top: 1px solid var(--vscode-widget-border, var(--track)); margin: 14px 0 12px; }

  .row + .row { margin-top: 12px; }
  .row .top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
  .row .name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .pct { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .row.warn .pct { color: var(--warn); }
  .row.hot .pct { color: var(--hot); }
  .row .foot { margin-top: 5px; font-size: 11px; display: flex; justify-content: space-between; gap: 8px; }
  .row .foot span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .footer { margin-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; }
  button {
    font: inherit; font-size: 11px; color: var(--link);
    background: none; border: none; padding: 2px 4px; margin: -2px -4px;
    border-radius: 4px; cursor: pointer;
  }
  button:hover { color: var(--link); background: var(--vscode-toolbar-hoverBackground); text-decoration: underline; }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 0; }

  .notice { display: flex; gap: 9px; align-items: flex-start; font-size: 12px; line-height: 1.45; }
  .notice svg { flex: none; margin-top: 1px; color: var(--warn); }
  .notice p { margin: 0 0 4px; }

  /* A skeleton, not a spinner: the layout it settles into is already visible,
     so the first reading lands without the panel jumping. */
  .skeleton { opacity: .4; }
  .skeleton .meter > i { width: 0; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Same thresholds as the menu bar app and the status bar item, so a colour
  // means one thing across all three surfaces.
  const level = (p) => (p >= 90 ? 'hot' : p >= 75 ? 'warn' : '');

  // The fill width is carried as data and applied through CSSOM below, NOT as a
  // style attribute here. style-src carries a nonce, and a nonce makes the
  // browser ignore 'unsafe-inline' — which is the only thing that ever permits
  // inline style ATTRIBUTES, since nonces can't be written on one. A
  // style="width:7%" is therefore dropped outright and every meter reads empty.
  // CSP does not police CSSOM, so el.style.width is allowed.
  const meter = (p) => '<div class="meter"><i data-pct="' + p + '"></i></div>';

  // A limit with no window running has no reset time; drop the line rather than
  // leave an empty one holding space open.
  const footHtml = (limit) =>
    limit.reset || limit.remaining
      ? '<div class="foot muted"><span>' + esc(limit.reset || '') + '</span>' +
        '<span>' + esc(limit.remaining || '') + '</span></div>'
      : '';

  function heroHtml(limit) {
    return '<div class="hero ' + level(limit.percent) + '">' +
      '<div class="top"><div class="pct">' + Math.round(limit.percent) + '<small>%</small></div>' +
      '<div class="name muted">' + esc(limit.label) + '</div></div>' +
      meter(limit.percent) + footHtml(limit) + '</div>';
  }

  function rowHtml(limit) {
    return '<div class="row ' + level(limit.percent) + '">' +
      '<div class="top"><div class="name">' + esc(limit.label) + '</div>' +
      '<div class="pct">' + Math.round(limit.percent) + '%</div></div>' +
      meter(limit.percent) + footHtml(limit) + '</div>';
  }

  const footerHtml = (updated) =>
    '<div class="footer"><span class="muted">' + esc(updated) + '</span>' +
    '<button data-send="refresh">Refresh</button></div>';

  /// Applies every meter's fill after the markup lands. Deferred a frame so the
  /// element is laid out at width 0 first and the CSS transition has something
  /// to animate from — set in the same tick and it would jump.
  function paint() {
    requestAnimationFrame(() => {
      for (const fill of root.querySelectorAll('.meter > i')) {
        fill.style.width = fill.dataset.pct + '%';
      }
    });
  }

  function render(data) {
    if (data.error) {
      root.innerHTML =
        '<div class="notice"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
        '<path d="M8 1.5 15 14.5H1L8 1.5Zm0 4.2a.8.8 0 0 0-.8.86l.25 3.1a.55.55 0 0 0 1.1 0l.25-3.1A.8.8 0 0 0 8 5.7Z' +
        'm0 5.6a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Z"/></svg>' +
        '<div><p>' + esc(data.error) + '</p>' +
        '<p class="muted">The endpoint could not be read, so no number is shown — a stale one is never passed off as current.</p>' +
        '</div></div>' + footerHtml(data.updated);
      return;
    }

    if (!data.limits.length) {
      root.innerHTML =
        '<div class="skeleton">' +
        heroHtml({ percent: 0, label: data.loading ? 'Loading' : 'No data', reset: '', remaining: '' }) +
        '<hr>' + rowHtml({ percent: 0, label: '\\u2014', reset: '', remaining: '' }) + '</div>' +
        footerHtml(data.updated);
      return;
    }

    const session = data.limits.find((l) => l.kind === 'session');
    const rest = data.limits.filter((l) => l !== session);
    root.innerHTML =
      (session ? heroHtml(session) : '') +
      (session && rest.length ? '<hr>' : '') +
      rest.map(rowHtml).join('') +
      footerHtml(data.updated);
    paint();
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-send]');
    if (button) vscode.postMessage(button.dataset.send);
  });

  window.addEventListener('message', (event) => render(event.data));
  render({ limits: [], loading: true, updated: 'Loading…', error: null });
</script>
</body>
</html>`;
}

// MARK: - rendering

function renderBadge() {
    const view = panel && panel.view;
    if (!view) return;
    const session = sessionLimit();
    if (state.error || !session) {
        view.badge = undefined;
        return;
    }
    // Activity bar badges are numeric only — no "%" and, since 0 hides the
    // badge entirely, no mark at all on a fresh session window. The panel and
    // the optional status bar item are where the exact figure lives.
    view.badge = {
        value: Math.round(session.percent),
        tooltip:
            'Claude session ' +
            session.percent +
            '%' +
            (weeklyLimit() ? ' · weekly ' + weeklyLimit().percent + '%' : ''),
    };
}

function renderStatusBar() {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    // An unresolved panel means the activity bar view never came up — most
    // often an extension-host-only restart after the view contribution changed,
    // since VS Code builds the view registry at window load. The status bar is
    // then the only surface left, so show it whatever the setting says rather
    // than run with nothing on screen at all.
    if (!config.get('showStatusBar', false) && panel && panel.view) {
        if (item) {
            item.dispose();
            item = null;
        }
        return;
    }
    if (!item) buildItem();
    if (!item) return;

    if (state.error) {
        item.text = '$(pulse) –';
        item.backgroundColor = undefined;
    } else if (sessionLimit()) {
        const session = sessionLimit();
        const weekly = weeklyLimit();
        let text = '$(pulse) ' + session.percent + '%';
        if (config.get('showWeekly', false) && weekly) {
            text += ' · wk ' + weekly.percent + '%';
        }
        item.text = text;
        item.backgroundColor =
            session.percent >= 90
                ? new vscode.ThemeColor('statusBarItem.errorBackground')
                : session.percent >= 75
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;
    } else {
        item.text = state.loading ? '$(pulse) …' : '$(pulse) –';
        item.backgroundColor = undefined;
    }

    const tip = new vscode.MarkdownString('', true);
    tip.isTrusted = true;
    tip.appendMarkdown('**Claude plan usage**\n\n');
    if (state.error) {
        tip.appendMarkdown('$(warning) ' + state.error + '\n\n');
    } else {
        for (const limit of state.limits) {
            const reset = resetText(limit.resets_at);
            tip.appendMarkdown(
                '- ' + labelFor(limit) + ' — **' + limit.percent + '%**' + (reset ? '  \n  _' + reset + '_' : '') + '\n'
            );
        }
        tip.appendMarkdown('\n');
    }
    tip.appendMarkdown('_' + updatedText() + '_\n\n');
    tip.appendMarkdown('[Refresh](command:claudeUsage.refresh) · [Usage settings](' + SETTINGS_URL + ')');
    item.tooltip = tip;
    item.show();
}

function render() {
    renderBadge();
    renderStatusBar();
    if (panel) panel.post();
}

/// Alignment is fixed when a status bar item is created, so moving ends means
/// throwing the old item away and making a new one.
function buildItem() {
    if (item) item.dispose();
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const alignment =
        config.get('position', 'left') === 'right'
            ? vscode.StatusBarAlignment.Right
            : vscode.StatusBarAlignment.Left;
    item = vscode.window.createStatusBarItem(alignment, config.get('priority', 100));
    item.command = 'claudeUsage.refresh';
    item.name = 'Claude plan usage';
    item.text = '$(pulse) …';
    item.show();
}

async function refresh() {
    if (state.loading) return;
    state.loading = true;
    render();
    try {
        const token = await accessToken();
        if (!token) throw new Error('No Claude Code login found — run `claude` once');
        const data = await getUsage(token);
        state.limits = Array.isArray(data.limits) ? data.limits : [];
        state.error = null;
        state.updatedAt = Date.now();
    } catch (err) {
        state.error = err && err.message ? err.message : String(err);
    } finally {
        state.loading = false;
        render();
    }
}

/// Opens a terminal in the workspace root and starts a session in it. Always a
/// fresh terminal rather than reusing the active one — that one may be busy, and
/// typing into a running process would be worse than an extra tab.
function launchSession() {
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const command = config.get('launchCommand', 'claude --dangerously-skip-permissions');
    const folders = vscode.workspace.workspaceFolders;
    // Multi-root takes the first folder; that's where a repo-wide session
    // belongs, and CLAUDE.md is read from the directory it starts in.
    const cwd = folders && folders.length ? folders[0].uri.fsPath : undefined;

    // If VS Code was itself launched from inside a Claude Code session (say, a
    // `code .` in its terminal), the window inherits that session's marker
    // variables and hands them to every terminal it spawns — the new session
    // then reads as a CHILD of the old one and stops saving its transcript.
    // Setting a key to null in TerminalOptions.env removes it. Matched by
    // pattern rather than a hardcoded list so new markers are covered too;
    // anything the shell profile sets is re-applied after this.
    const scrubbed = {};
    for (const key of Object.keys(process.env)) {
        if (/^CLAUDE(CODE)?(_|$)/.test(key)) scrubbed[key] = null;
    }

    const terminal = vscode.window.createTerminal({
        name: config.get('launchTerminalName', 'claude'),
        cwd: cwd,
        iconPath: new vscode.ThemeIcon('sparkle'),
        env: scrubbed,
    });
    terminal.show();
    terminal.sendText(command, true);
}

function restartTimer() {
    if (timer) clearInterval(timer);
    const seconds = vscode.workspace.getConfiguration('claudeUsage').get('pollSeconds', 300);
    timer = setInterval(refresh, Math.max(60, seconds) * 1000);
}

function activate(context) {
    panel = new UsagePanel(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('claudeUsage.limits', panel, {
            // Keeps the view alive while the sidebar is collapsed. The activity
            // bar badge hangs off the WebviewView object, so without retention
            // VS Code tears it down the moment the panel is hidden — dropping
            // the number off the icon exactly when the panel isn't there to
            // show it, which is when the badge is the only indicator left.
            webviewOptions: { retainContextWhenHidden: true },
        }),
        { dispose: () => item && item.dispose() },
        vscode.commands.registerCommand('claudeUsage.refresh', refresh),
        vscode.commands.registerCommand('claudeUsage.launch', launchSession),
        vscode.commands.registerCommand('claudeUsage.openSettings', () =>
            vscode.env.openExternal(vscode.Uri.parse(SETTINGS_URL))
        ),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('claudeUsage.pollSeconds')) restartTimer();
            if (
                event.affectsConfiguration('claudeUsage.position') ||
                event.affectsConfiguration('claudeUsage.priority')
            ) {
                if (item) {
                    item.dispose();
                    item = null;
                }
            }
            render();
        })
    );

    render();
    refresh();
    restartTimer();
}

function deactivate() {
    if (timer) clearInterval(timer);
}

module.exports = { activate, deactivate, USAGE_URL };
