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

function header() {
  const team = cfg.authInfo?.teamName ? ` · ${cfg.authInfo.teamName}` : '';
  const clawd = (x) => `${E}38;2;215;119;87m${x}${E}39m`;
  const art = [clawd(' ▐▛███▜▌ '), clawd('▝▜█████▛▘'), clawd('  ▘▘ ▝▝  ')];
  const txt = [`${st.bold('Cursor CLI')} ${st.dim('via cur')}`, st.grey(`${modelName}${team}`), st.grey(cwdShort)];
  w('\n' + art.map((a, i) => `  ${a}  ${txt[i]}`).join('\n') + '\n\n');
  if (chatId) w(st.dim(`  resuming ${chatId}\n\n`));
}

// ---------- live region ----------
let liveH = 0;
function clearLive() { if (liveH) { w('\r' + (liveH > 1 ? `${E}${liveH - 1}A` : '') + `${E}J`); liveH = 0; } }
function drawLive(lines) {
  clearLive();
  const max = Math.max(3, (out.rows || 30) - 4);
  const shown = lines.slice(-max).map((l) => clip(l, cols() - 1));
  w(shown.join('\n')); liveH = shown.length;
}
function commit(text) { clearLive(); w(text + '\n'); }

// ---------- one turn ----------
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const VERBS = ['Working', 'Thinking', 'Tinkering', 'Pondering', 'Cooking', 'Brewing', 'Wrangling', 'Noodling', 'Puzzling', 'Crafting'];
const KIND = {
  shellToolCall: ['shell', 'ran', 'shell command'], readToolCall: ['read', 'read', 'file'],
  globToolCall: ['search', 'searched', 'pattern'], grepToolCall: ['search', 'searched', 'pattern'],
  semSearchToolCall: ['search', 'searched', 'pattern'], lsToolCall: ['ls', 'listed', 'folder'],
  editToolCall: ['edit', 'edited', 'file'], writeToolCall: ['edit', 'wrote', 'file'], deleteToolCall: ['delete', 'deleted', 'file'],
  webSearchToolCall: ['web', 'searched the web', 'time'], webFetchToolCall: ['fetch', 'fetched', 'page'],
  mcpToolCall: ['mcp', 'called', 'MCP tool'], updateTodosToolCall: ['todo', 'updated', 'todo list'], taskToolCall: ['task', 'ran', 'subagent'],
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
    let text = '', think = '', thinkT0 = 0, chars = 0, tokens = null, frame = 0, interrupted = false, err = '';
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
    const flushText = () => { if (text.trim()) commit(md(wrap(text.trim(), cols() - 4)).map((l, i) => (i ? '  ' : '● ') + l).join('\n') + '\n'); text = ''; };
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
      lines.push(st.accent(`${FRAMES[frame % FRAMES.length]} ${verb}…`) + st.dim(` (${secs}s · ↓ ${tks} tokens · esc to interrupt)`));
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
          if (t) { flushThink(); flushGroup(); text += t; chars += t.length; }
        } else if (ev.type === 'tool_call') {
          const [key, tc] = Object.entries(ev.tool_call || {}).find(([k]) => k.endsWith('ToolCall')) || ['', {}];
          const a = tc.args || {};
          if (ev.subtype === 'started') {
            flushThink(); flushText(); chars += JSON.stringify(a).length;
            const [kind, verbWord, noun] = KIND[key] || ['other', 'used', key.replace(/ToolCall$/, '') + ' tool'];
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
      else commit(st.dim(`  ${secs}s · ${tokens ?? Math.round(chars / 4)} tokens\n`));
      resolve();
    });
  });
}

// ---------- prompt box ----------
function ask() {
  return new Promise((resolve) => {
    const rule = st.dim('─'.repeat(cols()));
    const footer = st.red('  ▸▸ run everything on') + st.dim(' · ! for shell · /help');
    w(rule + '\n\n' + rule + '\n' + footer + `${E}2A\r`);
    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true, historySize: 200, history: ask.hist });
    let done = false;
    rl.on('SIGINT', () => { if (rl.line) { rl.write(null, { ctrl: true, name: 'u' }); } else { rl.close(); w(`\r${E}J`); process.exit(0); } });
    rl.question(st.bold('❯ '), (ans) => {
      done = true; ask.hist = rl.history; rl.close();
      const rows = Math.max(1, Math.ceil((2 + [...ans].length) / cols()));
      w(`${E}${rows + 1}A\r${E}J`);
      resolve(ans);
    });
    rl.on('close', () => { if (!done) process.exit(0); });
  });
}
ask.hist = [];
function userBlock(msg) {
  const width = cols() - 2;
  const lines = wrap(msg, width - 4);
  w(lines.map((l, i) => `${E}48;5;237m${(i ? '  ' : '❯ ') + l}${' '.repeat(Math.max(0, width - 2 - vlen(l)))}${E}0m`).join('\n') + '\n\n');
}

const HELP = `  /model [id]    switch model (no id: list models)
  /clear         start a new chat
  /resume <id>   continue a chat by id      /session  show current chat id
  !<cmd>         run a shell command        /exit     quit
  esc / ctrl+c   interrupt a running turn`;

async function main() {
  if (process.stdin.isTTY) readline.emitKeypressEvents(process.stdin);
  w(`${E}2J${E}H`); header();
  let next = firstPrompt;
  for (;;) {
    const input = (next ?? await ask()).trim(); next = null;
    if (!input) continue;
    if (input === '/exit' || input === '/quit') process.exit(0);
    if (input === '/help') { w(HELP + '\n\n'); continue; }
    if (input === '/clear') { chatId = null; w(`${E}2J${E}3J${E}H`); header(); continue; }
    if (input === '/session') { w(st.dim(`  ${chatId || 'no chat yet'}\n\n`)); continue; }
    if (input.startsWith('/resume')) { const id = input.split(/\s+/)[1]; if (id) { chatId = id; w(st.dim(`  resuming ${id}\n\n`)); } else w(st.dim('  usage: /resume <chatId>  (cursor-agent ls lists chats)\n\n')); continue; }
    if (input.startsWith('/model')) {
      const id = input.split(/\s+/)[1];
      if (id) { model = id; modelName = id; w(st.dim(`  model → ${id}\n\n`)); }
      else { const r = spawnSync('cursor-agent', ['--list-models'], { encoding: 'utf8' }); w(st.dim((r.stdout || r.stderr).split('\n').filter((l) => / - /.test(l)).map((l) => '  ' + l).join('\n')) + '\n\n'); }
      continue;
    }
    userBlock(input);
    if (input.startsWith('!')) {
      const r = spawnSync(process.env.SHELL || 'zsh', ['-lc', input.slice(1)], { encoding: 'utf8' });
      w(((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n').map((l) => '  ' + st.dim('⎿ ') + l).join('\n') + '\n\n');
      continue;
    }
    await runTurn(input);
  }
}
main();
