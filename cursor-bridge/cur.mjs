#!/usr/bin/env node
// cur: Claude Code-style terminal front end for Cursor CLI.
// Drives `cursor-agent -p --output-format stream-json` per turn (--resume keeps the chat),
// keeps finished blocks in scrollback and redraws only a small live region at the bottom.
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';

const out = process.stdout;
const w = (s) => out.write(s);
const cols = () => Math.max(40, out.columns || 80);
const E = '\x1b[';
const st = {
  dim: (s) => `${E}2m${s}${E}22m`, bold: (s) => `${E}1m${s}${E}22m`,
  red: (s) => `${E}38;5;203m${s}${E}39m`, accent: (s) => `${E}38;5;173m${s}${E}39m`,
  code: (s) => `${E}38;5;153m${s}${E}39m`, green: (s) => `${E}38;5;114m${s}${E}39m`,
  grey: (s) => `${E}38;5;245m${s}${E}39m`,
};
const strip = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const vlen = (s) => [...strip(s)].length;
function clip(s, n) { // cut a styled line to n visible chars
  let vis = 0, res = '';
  for (const part of s.split(/(\x1b\[[0-9;]*[A-Za-z])/)) {
    if (part.startsWith('\x1b[')) { res += part; continue; }
    for (const ch of part) { if (vis >= n) return res + `${E}0m`; res += ch; vis++; }
  }
  return res;
}
function wrap(text, width) {
  const lines = [];
  for (const raw of text.split('\n')) {
    if (!raw) { lines.push(''); continue; }
    const ind = raw.match(/^(\s*(?:[-*]|\d+\.)?\s*)/)[1].length;
    let cur = '';
    for (const word of raw.split(/(?<=\s)/)) {
      if (vlen(cur + word) > width && cur.trim()) { lines.push(cur.trimEnd()); cur = ' '.repeat(Math.min(ind, 8)) + word.trimStart(); }
      else cur += word;
      while (vlen(cur) > width) { lines.push(cur.slice(0, width)); cur = cur.slice(width); }
    }
    lines.push(cur.trimEnd());
  }
  return lines;
}
function md(lines) { // light markdown styling, line by line
  let fence = false;
  return lines.flatMap((l) => {
    if (/^\s*```/.test(l)) { fence = !fence; return []; }
    if (fence) return [st.code(l)];
    const h = l.match(/^#{1,6}\s+(.*)/);
    if (h) return [st.bold(h[1])];
    return [l.replace(/\*\*([^*]+)\*\*/g, (_, x) => st.bold(x)).replace(/`([^`]+)`/g, (_, x) => st.code(x)).replace(/^(\s*)[-*] /, '$1• ')];
  });
}

// ---------- config / args ----------
const home = os.homedir();
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(`${home}/.cursor/cli-config.json`, 'utf8')); } catch {}
const argv = process.argv.slice(2);
let model = null, chatId = null, firstPrompt = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--model' || argv[i] === '-m') model = argv[++i];
  else if (argv[i] === '--resume' || argv[i] === '-r') chatId = argv[++i];
  else if (argv[i] === '-h' || argv[i] === '--help') { console.log('usage: cur [--model id] [--resume chatId] [prompt]'); process.exit(0); }
  else firstPrompt = argv.slice(i).join(' '), i = argv.length;
}
let modelName = model || cfg.model?.displayNameShort || cfg.model?.displayName || 'default model';
const cwdShort = process.cwd().replace(home, '~');

function pretty(m) {
  const x = String(m).match(/claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)(?:-([a-z]+))?(-fast)?/i);
  if (x) return `${x[1][0].toUpperCase() + x[1].slice(1)} ${x[2]}.${x[3]}${x[4] ? ' · ' + x[4] : ''}${x[5] ? ' fast' : ''}`;
  return String(m).replace(/^Claude /, '');
}
function header() {
  const team = cfg.authInfo?.teamName ? ` · ${cfg.authInfo.teamName}` : '';
  const clawd = (x) => `${E}38;2;215;119;87m${x}${E}39m`;
  const art = [clawd(' ▐▛███▜▌ '), clawd('▝▜█████▛▘'), clawd('  ▘▘ ▝▝  ')];
  const txt = [`${st.bold('Cursor CLI')} ${st.dim('via cur')}`, st.grey(`${pretty(modelName)}${team}`), st.grey(cwdShort)];
  const who = (cfg.authInfo?.displayName || '').split(' ')[0];
  put('\n' + art.map((a, i) => `  ${a}  ${txt[i]}`).join('\n') + '\n\n');
  put(`  Welcome back${who ? ' ' + who : ''}! Same memory and hooks as Claude Code.\n`);
  put(st.dim('  /help for commands · esc to interrupt · /model to switch\n\n'));
  if (chatId) put(st.dim(`  resuming ${chatId}\n\n`));
}

// ---------- live region ----------
let liveH = 0;
// row = how far down the screen committed output has reached, so the live
// region (spinner + input box) can sit pinned at the bottom with a gap above.
let row = 0;
const screenRows = () => out.rows || 30;
function put(text) {
  w(text);
  const parts = text.split('\n'); parts.pop();
  for (const l of parts) row += Math.max(1, Math.ceil(vlen(l) / cols()));
  row = Math.min(row, screenRows());
}
const gapFor = (h) => Math.max(0, screenRows() - row - h);
function clearLive() { if (liveH) { w('\r' + (liveH > 1 ? `${E}${liveH - 1}A` : '') + `${E}J`); liveH = 0; } }
function drawLive(lines) {
  clearLive();
  const max = Math.max(3, screenRows() - 2);
  let shown = lines.slice(-max).map((l) => clip(l, cols() - 1));
  shown = [...Array(gapFor(shown.length)).fill(''), ...shown];
  w(shown.join('\n')); liveH = shown.length;
}
function commit(text) { clearLive(); put(text + '\n'); }

// ---------- one turn ----------
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const VERBS = ['Working', 'Thinking', 'Tinkering', 'Pondering', 'Cooking', 'Brewing', 'Wrangling', 'Noodling', 'Puzzling', 'Crafting'];
const KIND = {
  shellToolCall: ['shell', 'ran', 'shell command'], readToolCall: ['read', 'read', 'file'],
  globToolCall: ['search', 'searched', 'pattern'], grepToolCall: ['search', 'searched', 'pattern'],
  semSearchToolCall: ['search', 'searched', 'pattern'], lsToolCall: ['ls', 'listed', 'folder'],
  editToolCall: ['edit', 'edited', 'file'], writeToolCall: ['edit', 'wrote', 'file'], deleteToolCall: ['delete', 'deleted', 'file'],
  webSearchToolCall: ['web', 'searched the web', 'time'], webFetchToolCall: ['fetch', 'fetched', 'page'],
  mcpToolCall: ['mcp', 'called', 'MCP tool'], getMcpToolsToolCall: ['mcpl', 'looked up', 'MCP tool list'], listMcpResourcesToolCall: ['mcpl', 'looked up', 'MCP tool list'], updateTodosToolCall: ['todo', 'updated', 'todo list'], taskToolCall: ['task', 'ran', 'subagent'],
};
const plural = (n, s) => `${n} ${s}${n === 1 || s.endsWith('time') ? '' : (s.endsWith('h') ? 'es' : 's')}`;
const base = (p) => (p || '').split('/').pop();

function runTurn(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'stream-json', '--stream-partial-output', '--force'];
    if (model) args.push('--model', model);
    if (chatId) args.push('--resume', chatId);
    args.push(prompt);
    const child = spawn('cursor-agent', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const t0 = Date.now(), verb = VERBS[Math.floor(Math.random() * VERBS.length)];
    let lastSeg = '', text = '', think = '', thinkT0 = 0, chars = 0, tokens = null, frame = 0, interrupted = false, err = '';
    let group = []; // {kind, label, verbWord, noun, failed, done}

    const groupSummary = (running) => {
      const order = [], counts = {};
      for (const g of group) { const k = g.verbWord + '|' + g.noun; if (!counts[k]) { counts[k] = { ...g, n: 0, names: [] }; order.push(k); } counts[k].n++; if (g.kind === 'edit' || g.kind === 'delete') counts[k].names.push(base(g.path)); }
      const parts = order.map((k) => { const c = counts[k]; const names = c.names.length ? ` (${c.names.join(', ')})` : ''; return `${c.verbWord} ${st.bold(String(c.n))} ${plural(c.n, c.noun).replace(/^\d+ /, '')}${names}`; });
      let s = parts.join(', ');
      if (running) s = s.replace(/^ran /, 'running ');
      s = s.charAt(0).toUpperCase() + s.slice(1);
      const failed = group.filter((g) => g.failed).length;
      return '  ' + st.grey(s) + (failed ? st.red(` · ${failed} failed`) : '');
    };
    const flushText = () => { if (text.trim()) lastSeg = text; if (text.trim()) commit(md(wrap(text.trim(), cols() - 4)).map((l, i) => (i ? '  ' : '● ') + l).join('\n') + '\n'); text = ''; };
    const flushThink = () => { if (think.trim()) commit(st.grey(`∴ Thought for ${Math.max(1, Math.round((Date.now() - thinkT0) / 1000))}s`) + '\n'); think = ''; };
    const flushGroup = () => { if (group.length) commit(groupSummary(false) + '\n'); group = []; };

    const render = () => {
      const lines = [];
      if (group.length) {
        lines.push(groupSummary(true));
        const last = group[group.length - 1];
        lines.push('  ' + st.dim('⎿  ' + last.label.replace(/\s+/g, ' ')));
        lines.push('');
      }
      if (think.trim()) {
        const tl = wrap(think.trim(), cols() - 6).slice(-4);
        lines.push(st.grey('∴ Thinking…'), ...tl.map((l) => '  ' + `${E}2;3m${l}${E}0m`), '');
      }
      if (text.trim()) { lines.push(...md(wrap(text.trim(), cols() - 4)).map((l, i) => (i ? '  ' : '● ') + l)); lines.push(''); }
      const secs = Math.floor((Date.now() - t0) / 1000);
      const tk = tokens ?? Math.round(chars / 4);
      const tks = tk >= 1000 ? (tk / 1000).toFixed(1) + 'k' : String(tk);
      lines.push(st.accent(`${FRAMES[frame % FRAMES.length]} ${verb}…`) + st.dim(` (${secs}s · esc to interrupt)`));
      lines.push('', ...boxIdle());
      drawLive(lines);
    };
    const timer = setInterval(() => { frame++; render(); }, 120);

    const onKey = (_s, key) => {
      if (key && (key.name === 'escape' || (key.ctrl && key.name === 'c'))) { interrupted = true; child.kill('SIGTERM'); }
    };
    if (process.stdin.isTTY) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('keypress', onKey); }

    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'system' && ev.subtype === 'init') { chatId = ev.session_id; if (ev.model) modelName = ev.model; }
        else if (ev.type === 'thinking') {
          if (ev.subtype === 'delta' && ev.text) { if (!think) thinkT0 = Date.now(); think += ev.text; chars += ev.text.length; }
          else if (ev.subtype === 'completed') flushThink();
        }
        else if (ev.type === 'assistant' && ev.timestamp_ms) {
          const t = (ev.message?.content || []).map((c) => c.text || '').join('');
          if (t && t.length > 8 && (t === text || t === lastSeg)) continue;
          if (t) { flushThink(); flushGroup(); text += t; chars += t.length; }
        } else if (ev.type === 'tool_call') {
          const [key, tc] = Object.entries(ev.tool_call || {}).find(([k]) => k.endsWith('ToolCall')) || ['', {}];
          const a = tc.args || {};
          if (ev.subtype === 'started') {
            flushThink(); flushText(); chars += JSON.stringify(a).length;
            let [kind, verbWord, noun] = KIND[key] || ['other', 'used', key.replace(/ToolCall$/, '') + ' tool'];
            const server = String(a.providerIdentifier || a.serverName || a.server || '');
            const tool = String(a.toolName || a.name || '').replace(/^mcp__[^_]+(?:-[^_]+)*__/, '');
            if (key === 'mcpToolCall' && /chrome/i.test(server + tool)) { kind = 'chrome'; verbWord = 'used'; noun = 'Claude in Chrome action'; }
            if (key === 'mcpToolCall') a.toolName = (kind === 'chrome' ? 'Claude in Chrome · ' : (server ? server + ' · ' : '')) + tool;
            const label = kind === 'shell' ? '$ ' + (a.command || '') : (a.path ? base(a.path) : a.globPattern || a.pattern || a.query || a.url || a.toolName || '') || noun;
            group.push({ id: ev.call_id, kind, verbWord, noun, label, path: a.path });
          } else {
            const g = group.find((x) => x.id === ev.call_id);
            const r = tc.result || {};
            if (g && (r.error || r.failure || r.rejected || (r.success && r.success.exitCode && r.success.exitCode !== 0))) g.failed = true;
          }
        } else if (ev.type === 'result') {
          if (ev.usage) tokens = ev.usage.outputTokens;
          if (ev.is_error) err += (ev.result || 'error') + '\n';
        }
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearInterval(timer);
      if (process.stdin.isTTY) { process.stdin.removeListener('keypress', onKey); process.stdin.setRawMode(false); }
      flushThink(); flushGroup(); flushText();
      const secs = Math.round((Date.now() - t0) / 1000);
      if (interrupted) commit('  ' + st.red('⎿  Interrupted') + '\n');
      else if (code && err.trim()) commit('  ' + st.red('⎿  ' + err.trim().split('\n').slice(-3).join('\n     ')) + '\n');
      else commit(st.dim(`  ${secs}s\n`));
      resolve();
    });
  });
}

// ---------- prompt box ----------
const FOOTER = () => st.red('  ▸▸ run everything on') + st.dim(' (cursor --force) · ! for shell · /help');
const boxIdle = () => { const r = st.dim('─'.repeat(cols() - 1)); return [r, st.bold('❯ '), r, FOOTER()]; };
function ask() {
  if (!process.stdin.isTTY) return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once('line', (l) => { rl.close(); resolve(l); }); rl.once('close', () => process.exit(0));
  });
  return new Promise((resolve) => {
    let pasting = false, pasted = '';
    // Clipboard image -> ~/.cursor/cur-images/*.png, shown as an [Image #n] token in the box.
    const pasteImage = () => {
      const dir = `${home}/.cursor/cur-images`; fs.mkdirSync(dir, { recursive: true });
      const file = `${dir}/paste-${Date.now()}.png`;
      const r = spawnSync('osascript', ['-e', `set f to open for access POSIX file "${file}" with write permission`, '-e', 'write (the clipboard as «class PNGf») to f', '-e', 'close access f'], { encoding: 'utf8' });
      if (r.status !== 0 || !fs.existsSync(file) || !fs.statSync(file).size) { try { fs.unlinkSync(file); } catch {} return false; }
      images.push(file); const tag = [...`[Image #${images.length}]`];
      buf.splice(pos, 0, ...tag); pos += tag.length; return true;
    };
    let buf = [], pos = 0, up = 0, hi = ask.hist.length, draft = [];
    const draw = () => {
      const c = cols(), inner = c - 3;
      const rule = st.dim('─'.repeat(c - 1));
      // word-wrap: break after the last space that fits, hard-break only a word longer than the line
      const starts = [0];
      for (let st0 = 0; buf.length - st0 > inner;) {
        let j = st0 + inner; while (j > st0 && buf[j - 1] !== ' ') j--;
        st0 = j > st0 ? j : st0 + inner; starts.push(st0);
      }
      let crow = starts.length - 1; while (crow > 0 && starts[crow] > pos) crow--;
      let ccol = pos - starts[crow];
      if (ccol >= inner) { crow++; ccol = 0; if (crow >= starts.length) starts.push(buf.length); }
      const n = starts.length;
      const rows = starts.map((a0, i) => (i ? '  ' : st.bold('❯ ')) + buf.slice(a0, starts[i + 1] ?? buf.length).join(''));
      const footer = FOOTER();
      const gap = gapFor(n + 3);
      w('\r' + (up ? `${E}${up}A` : '') + `${E}J` + '\n'.repeat(gap) + rule + '\n' + rows.join('\n') + '\n' + rule + '\n' + clip(footer, c - 1));
      w(`${E}${n + 2 - (1 + crow)}A\r` + `${E}${2 + ccol}C`);
      up = gap + 1 + crow;
    };
    const finish = (val) => {
      w('\r' + (up ? `${E}${up}A` : '') + `${E}J`);
      process.stdin.removeListener('keypress', onKey); process.stdout.removeListener('resize', draw);
      process.stdin.setRawMode(false); process.stdin.pause(); w(`${E}?2004l`);
      resolve(val);
    };
    const onKey = (str, key = {}) => {
      const k = key.name;
      if (pasting && k !== 'paste-end') { if (str) pasted += (k === 'return' || k === 'enter') ? '\n' : str; return; }
      if (key.ctrl && k === 'c') { if (buf.length) { buf = []; pos = 0; } else { finish(''); process.exit(0); } }
      else if (key.ctrl && k === 'd') { if (!buf.length) { finish(''); process.exit(0); } }
      else if (k === 'return' || k === 'enter') { const v = buf.join(''); if (v.trim()) ask.hist.push(v); return finish(v); }
      else if (k === 'backspace') { if (pos) { buf.splice(pos - 1, 1); pos--; } }
      else if (k === 'delete') buf.splice(pos, 1);
      else if (k === 'left') pos = Math.max(0, pos - 1);
      else if (k === 'right') pos = Math.min(buf.length, pos + 1);
      else if (k === 'home' || (key.ctrl && k === 'a')) pos = 0;
      else if (k === 'end' || (key.ctrl && k === 'e')) pos = buf.length;
      else if (key.ctrl && k === 'u') { buf.splice(0, pos); pos = 0; }
      else if (key.ctrl && k === 'w') { let i = pos; while (i && buf[i - 1] === ' ') i--; while (i && buf[i - 1] !== ' ') i--; buf.splice(i, pos - i); pos = i; }
      else if (k === 'up') { if (hi > 0) { if (hi === ask.hist.length) draft = buf; hi--; buf = [...ask.hist[hi]]; pos = buf.length; } }
      else if (k === 'down') { if (hi < ask.hist.length) { hi++; buf = hi === ask.hist.length ? draft : [...ask.hist[hi]]; pos = buf.length; } }
      else if (k === 'paste-start') { pasting = true; pasted = ''; return; }
      else if (k === 'paste-end') { pasting = false; if (!pasted) { if (!pasteImage()) return; } else { const ch = [...pasted.replace(/\r\n?/g, '\n').replace(/\n/g, ' ')]; buf.splice(pos, 0, ...ch); pos += ch.length; } }
      else if (key.ctrl && k === 'v') { if (!pasteImage()) return; }
      else if (k === 'escape' || k === 'tab' || key.ctrl || key.meta) return;
      else if (str) { const ch = [...str.replace(/[\r\n]+/g, ' ')].filter((x) => x >= ' '); buf.splice(pos, 0, ...ch); pos += ch.length; }
      draw();
    };
    process.stdin.setRawMode(true); process.stdin.resume(); w(`${E}?2004h`);
    process.stdin.on('keypress', onKey); process.stdout.on('resize', draw);
    draw();
  });
}
ask.hist = [];
const images = []; // pasted image files, numbered for the whole session
function userBlock(msg) {
  const width = cols() - 2;
  const lines = wrap(msg, width - 4);
  put(lines.map((l, i) => `${E}48;5;237m${(i ? '  ' : '❯ ') + l}${' '.repeat(Math.max(0, width - 2 - vlen(l)))}${E}0m`).join('\n') + '\n\n');
}

const HELP = `  /model [id]    switch model (no id: list models)
  /clear         start a new chat
  /resume <id>   continue a chat by id      /session  show current chat id
  !<cmd>         run a shell command        /exit     quit
  esc / ctrl+c   interrupt a running turn`;

async function main() {
  if (process.stdin.isTTY) readline.emitKeypressEvents(process.stdin);
  w(`${E}2J${E}H`); row = 0; header();
  let next = firstPrompt;
  for (;;) {
    const input = (next ?? await ask()).trim(); next = null;
    if (!input) continue;
    if (input === '/exit' || input === '/quit') process.exit(0);
    if (input === '/help') { put(HELP + '\n\n'); continue; }
    if (input === '/clear') { chatId = null; w(`${E}2J${E}3J${E}H`); row = 0; header(); continue; }
    if (input === '/session') { put(st.dim(`  ${chatId || 'no chat yet'}\n\n`)); continue; }
    if (input.startsWith('/resume')) { const id = input.split(/\s+/)[1]; if (id) { chatId = id; put(st.dim(`  resuming ${id}\n\n`)); } else put(st.dim('  usage: /resume <chatId>  (cursor-agent ls lists chats)\n\n')); continue; }
    if (input.startsWith('/model')) {
      const id = input.split(/\s+/)[1];
      if (id) { model = id; modelName = id; put(st.dim(`  model → ${id}\n\n`)); }
      else { const r = spawnSync('cursor-agent', ['--list-models'], { encoding: 'utf8' }); put(st.dim((r.stdout || r.stderr).split('\n').filter((l) => / - /.test(l)).map((l) => '  ' + l).join('\n')) + '\n\n'); }
      continue;
    }
    userBlock(input);
    if (input.startsWith('!')) {
      const r = spawnSync(process.env.SHELL || 'zsh', ['-lc', input.slice(1)], { encoding: 'utf8' });
      put(((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n').map((l) => '  ' + st.dim('⎿ ') + l).join('\n') + '\n\n');
      continue;
    }
    const refs = [...input.matchAll(/\[Image #(\d+)\]/g)].map((m) => +m[1]).filter((n) => images[n - 1]);
    await runTurn(refs.length ? `${input}\n\n(Pasted images — read each file to see it: ${[...new Set(refs)].map((n) => `[Image #${n}] ${images[n - 1]}`).join(', ')})` : input);
  }
}
main();
