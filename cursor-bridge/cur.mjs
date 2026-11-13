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
const rgb = (hex) => (s) => `${E}38;2;${parseInt(hex.slice(0, 2), 16)};${parseInt(hex.slice(2, 4), 16)};${parseInt(hex.slice(4), 16)}m${s}${E}39m`;
// Colours sampled from Claude Code 2.1.321 in a 24-bit terminal.
const st = {
  dim: (s) => `${E}2m${s}${E}22m`, bold: (s) => `${E}1m${s}${E}22m`,
  red: rgb('ff6b80'), accent: rgb('d77757'), verb: rgb('eb9f7f'),
  code: rgb('b1b9f9'), green: rgb('4eba65'), grey: rgb('999999'), rule: rgb('888888'), white: rgb('ffffff'),
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
const inline = (t) => t
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_, x) => `\u0001${x}\u0002`)
  .replace(/`([^`]+)`/g, (_, x) => st.code(x))
  .replace(/\*\*([^*]+)\*\*/g, (_, x) => st.bold(x))
  .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, (_, p, x) => `${p}${E}3m${x}${E}23m`)
  .replace(/\u0001/g, `${E}4m`).replace(/\u0002/g, `${E}24m`);
// wrap one styled line; each output line re-opens styles still active at the break
function wrapStyled(line, width, indent = '') {
  const out = []; let cur = '', curLen = 0, open = '';
  for (const word of line.split(/(?<= )/)) {
    const wl = vlen(word);
    if (curLen + wl > width && curLen > indent.length) { out.push(cur.trimEnd() + `${E}0m`); cur = indent + open; curLen = indent.length; }
    cur += word; curLen += wl;
    for (const m of word.matchAll(/\x1b\[([0-9;]*)m/g)) open = /^(0|22|23|24|39)$/.test(m[1]) ? '' : open + m[0];
  }
  out.push(cur.trimEnd());
  return out;
}
function md(text, width) {
  const src = text.split('\n'), res = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    if (/^\s*```/.test(l)) { // code block
      i++; while (i < src.length && !/^\s*```/.test(src[i])) { res.push('  ' + st.code(clip(src[i], width - 2))); i++; }
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) { // table
      const rows = [];
      while (i < src.length && /^\s*\|.*\|\s*$/.test(src[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(src[i])) rows.push(src[i].trim().slice(1, -1).split('|').map((c) => inline(c.trim()))); i++; }
      i--;
      const n = Math.max(...rows.map((r) => r.length)), w = Array(n).fill(0);
      rows.forEach((r) => r.forEach((c, j) => { w[j] = Math.max(w[j], vlen(c)); }));
      const bar = (l, m, r) => l + w.map((x) => '─'.repeat(x + 2)).join(m) + r;
      const cell = (c, j, center) => { const pad = w[j] - vlen(c), lp = center ? Math.floor(pad / 2) : 0; return ' ' + ' '.repeat(lp) + c + ' '.repeat(pad - lp) + ' '; };
      res.push(clip(bar('┌', '┬', '┐'), width));
      rows.forEach((r, ri) => {
        if (ri > 0) res.push(clip(bar('├', '┼', '┤'), width));
        res.push(clip('│' + w.map((_, j) => cell(r[j] ?? '', j, ri === 0)).join('│') + '│', width));
      });
      res.push(clip(bar('└', '┴', '┘'), width));
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { res.push(st.grey('─'.repeat(Math.min(width, 40)))); continue; }
    const h = l.match(/^#{1,6}\s+(.*)/);
    if (h) { res.push(...wrapStyled(st.bold(inline(h[1].replace(/\*\*/g, ''))), width)); continue; }
    const li = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/);
    if (li) {
      const lead = li[1].replace(/\t/g, '  ') + (/\d/.test(li[2]) ? li[2] : '-') + ' ';
      res.push(...wrapStyled(lead + inline(li[3]), width, ' '.repeat(lead.length)));
      continue;
    }
    const q = l.match(/^>\s?(.*)/);
    if (q) { res.push(...wrapStyled(inline(q[1]), width - 2).map((x) => st.grey('▎ ') + st.grey(x))); continue; }
    if (!l.trim()) { if (res.length && res[res.length - 1] !== '') res.push(''); continue; }
    res.push(...wrapStyled(inline(l), width));
  }
  while (res.length && res[res.length - 1] === '') res.pop();
  return res;
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
  const team = cfg.authInfo?.teamName ? ` · Cursor ${cfg.authInfo.teamName}` : ' · Cursor';
  const clawd = (x) => `${E}38;2;215;119;87m${x}${E}39m`;
  const art = [clawd(' ▐▛███▜▌ '), clawd('▝▜█████▛▘'), clawd('  ▘▘ ▝▝  ')];
  let ver = '';
  try { ver = fs.realpathSync(`${home}/.local/bin/cursor-agent`).match(/versions\/([\d.]+)/)?.[1] || ''; } catch {}
  const txt = [`${st.bold('Cursor CLI')}${ver ? ' ' + st.grey('v' + ver) : ''}`, st.grey(`${pretty(modelName).replace(/ · (low|medium|high|xhigh|max)\b/, '').replace(/ \d+[KM]\b.*$/, '')}${team}`), st.grey(cwdShort)];
  put('\n' + art.map((a, i) => `  ${a}  ${txt[i]}`).join('\n') + '\n\n');
  if (chatId) put(st.grey(`  resuming ${chatId}\n\n`));
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
let liveUp = 0; // rows the cursor sits above the live region's last line (it parks inside the input box)
function clearLive() { if (liveH) { const u = liveH - 1 - liveUp; w('\r' + (u > 0 ? `${E}${u}A` : '') + `${E}J`); liveH = 0; liveUp = 0; } }
// top = in-progress output, flows right under the chat; bottom = spinner + input box,
// pinned to the last rows of the window; the gap goes between them.
function drawLive(top, bottom = [], cursor = null) {
  clearLive();
  const max = Math.max(1, screenRows() - bottom.length - 1);
  const t = top.slice(-max).map((l) => clip(l, cols() - 1)), b = bottom.map((l) => clip(l, cols() - 1));
  const shown = [...t, ...Array(gapFor(t.length + b.length)).fill(''), ...b];
  w(shown.join('\n')); liveH = shown.length; liveUp = 0;
  if (cursor) { liveUp = b.length - 1 - cursor.row; w((liveUp ? `${E}${liveUp}A` : '') + '\r' + (cursor.col ? `${E}${cursor.col}C` : '')); }
}
function commit(text) { clearLive(); put(text + '\n'); }

// ---------- one turn ----------
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const VERBS = ['Working', 'Thinking', 'Tinkering', 'Pondering', 'Cooking', 'Brewing', 'Wrangling', 'Noodling', 'Puzzling', 'Crafting'];
const PAST = { Working: 'Worked', Thinking: 'Thought', Tinkering: 'Tinkered', Pondering: 'Pondered', Cooking: 'Cooked', Brewing: 'Brewed', Wrangling: 'Wrangled', Noodling: 'Noodled', Puzzling: 'Puzzled', Crafting: 'Crafted' };
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
    let sendNow = false, lastSeg = '', text = '', think = '', thinkT0 = 0, chars = 0, tokens = null, frame = 0, interrupted = false, err = '';
    let group = []; // {kind, label, verbWord, noun, failed, done}

    const groupSummary = (running) => {
      const order = [], counts = {};
      for (const g of group) { const k = g.verbWord + '|' + g.noun; if (!counts[k]) { counts[k] = { ...g, n: 0, names: [] }; order.push(k); } counts[k].n++; if (g.kind === 'edit' || g.kind === 'delete') counts[k].names.push(base(g.path)); }
      const parts = order.map((k) => { const c = counts[k]; const names = c.names.length ? ` (${c.names.join(', ')})` : ''; return `${c.verbWord} ${st.bold(String(c.n))} ${plural(c.n, c.noun).replace(/^\d+ /, '')}${names}`; });
      let s = parts.join(', ');
      if (running) s = s.replace(/^ran /, 'running ');
      s = s.charAt(0).toUpperCase() + s.slice(1);
      const failed = group.filter((g) => g.failed).length;
      return '  ' + (running ? s + '…' : st.grey(s)) + (failed ? st.red(` · ${failed} failed`) : '');
    };
    const flushText = () => { if (text.trim()) lastSeg = text; if (text.trim()) commit(md(text.trim(), cols() - 4).map((l, i) => (i ? '  ' : st.white('⏺') + ' ') + l).join('\n') + '\n'); text = ''; };
    const flushThink = () => { think = ''; };
    const flushGroup = () => { if (group.length) commit(groupSummary(false) + '\n'); group = []; };

    const render = () => {
      const lines = [];
      if (group.length) {
        lines.push(groupSummary(true));
        const last = group[group.length - 1];
        lines.push('  ' + st.grey('⎿  ' + last.label.replace(/\s+/g, ' ')));
        lines.push('');
      }
      if (think.trim()) {
        const tl = wrap(think.trim(), cols() - 6).slice(-4);
        lines.push(st.grey('∴ Thinking…'), ...tl.map((l) => '  ' + `${E}2;3m${l}${E}0m`), '');
      }
      if (text.trim()) { lines.push(...md(text.trim(), cols() - 4).map((l, i) => (i ? '  ' : st.white('⏺') + ' ') + l)); lines.push(''); }
      const secs = Math.floor((Date.now() - t0) / 1000);
      const tk = tokens ?? Math.round(chars / 4);
      const tks = tk >= 1000 ? (tk / 1000).toFixed(1) + 'k' : String(tk);
      const box = boxLines(true);
      const qd = queue.flatMap((q, i) => [...userRows(q.replace(/\s+/g, ' '), true), ...(i < queue.length - 1 ? [''] : [])]);
      if (qd.length) qd.push('  ' + st.grey(sendNow ? 'sending now…' : 'ctrl+c to send now'), '');
      const bottom = [...qd, st.accent(FRAMES[frame % FRAMES.length]) + ' ' + st.verb(verb) + st.accent('…') + ' ' + st.grey(`(${secs}s${think.trim() ? ' · thinking' : ''})`), ''];
      box.lines[box.lines.length - 1] = FOOTER(true);
      drawLive(lines, [...bottom, ...box.lines], { row: bottom.length + box.row, col: box.col });
    };
    const timer = setInterval(() => { frame++; render(); }, 120);

    const stop = () => { if (!interrupted) { interrupted = true; child.kill('SIGTERM'); } };
    const onKey = (str, key = {}) => {
      if (!ed.pasting && key.name === 'escape') return stop();
      // ctrl+c with something typed or queued: stop this reply and send that right away (enter / ctrl+enter just queue)
      if (!ed.pasting && key.ctrl && key.name === 'c' && (ed.buf.length || queue.length)) {
        const v = ed.buf.join('');
        if (v.trim()) { queue.unshift(v); hist.push(v); ed.hi = hist.length; }
        ed.buf = []; ed.pos = 0; sendNow = true; render(); return stop();
      }
      const r = edKey(str, key);
      if (r === 'ctrlc') return stop();
      if (r && r.submit !== undefined) { if (r.submit.trim()) queue.push(r.submit); }
      if (r) render();
    };
    if (process.stdin.isTTY) { rawOn(); process.stdin.on('keypress', onKey); }

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
      if (process.stdin.isTTY) { process.stdin.removeListener('keypress', onKey); rawOff(); }
      flushThink(); flushGroup(); flushText();
      const secs = Math.round((Date.now() - t0) / 1000);
      if (interrupted) commit('  ' + st.red('⎿  Interrupted') + (sendNow ? st.grey(' · sending your message now') : '') + '\n');
      else if (code && err.trim()) commit('  ' + st.red('⎿  ' + err.trim().split('\n').slice(-3).join('\n     ')) + '\n');
      else { const t = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); commit(st.grey(`✻ ${PAST[verb]} for ${secs}s · done ${t}`) + '\n'); }
      resolve();
    });
  });
}

// ---------- input editor (shared by the idle prompt and a running turn) ----------
const FOOTER = (busy) => '  ' + st.red('⏵⏵ run everything on') + st.grey(' (cursor --force)' + (busy ? ' · esc to interrupt' + (ed.buf.length && !queue.length ? ' · ctrl+c to send now' : '') : ''));
const hist = [], queue = [];
const ed = { buf: [], pos: 0, hi: 0, draft: [], pasting: false, pasted: '' };
// Clipboard image -> ~/.cursor/cur-images/*.png, shown as an [Image #n] token in the box.
function pasteImage() {
  const dir = `${home}/.cursor/cur-images`; fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/paste-${Date.now()}.png`;
  const r = spawnSync('osascript', ['-e', `set f to open for access POSIX file "${file}" with write permission`, '-e', 'write (the clipboard as «class PNGf») to f', '-e', 'close access f'], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(file) || !fs.statSync(file).size) { try { fs.unlinkSync(file); } catch {} return false; }
  images.push(file); const tag = [...`[Image #${images.length}]`];
  ed.buf.splice(ed.pos, 0, ...tag); ed.pos += tag.length; return true;
}
// The box: rule, word-wrapped input rows, rule, footer. Returns the lines and where the cursor goes.
function boxLines(busy = false) {
  const { buf, pos } = ed, c = cols(), inner = c - 3;
  const rule = st.rule('─'.repeat(c - 1));
  const starts = [0];
  for (let s0 = 0; buf.length - s0 > inner;) {
    let j = s0 + inner; while (j > s0 && buf[j - 1] !== ' ') j--;
    s0 = j > s0 ? j : s0 + inner; starts.push(s0);
  }
  let crow = starts.length - 1; while (crow > 0 && starts[crow] > pos) crow--;
  let ccol = pos - starts[crow];
  if (ccol >= inner) { crow++; ccol = 0; if (crow >= starts.length) starts.push(buf.length); }
  const rows = starts.map((a0, i) => (i ? '  ' : (busy ? st.grey('❯') : '❯') + ' ') + buf.slice(a0, starts[i + 1] ?? buf.length).join(''));
  return { lines: [rule, ...rows, rule, FOOTER()], row: 1 + crow, col: 2 + ccol };
}
// One key into the editor. Returns { submit } on Enter, 'redraw', 'ctrlc' / 'ctrld' on an empty box, or null.
function edKey(str, key = {}) {
  const k = key.name;
  if (ed.pasting && k !== 'paste-end') { if (str) ed.pasted += (k === 'return' || k === 'enter') ? '\n' : str; return null; }
  if (key.ctrl && k === 'c') { if (!ed.buf.length) return 'ctrlc'; ed.buf = []; ed.pos = 0; return 'redraw'; }
  if (key.ctrl && k === 'd') return ed.buf.length ? null : 'ctrld';
  if (k === 'return' || k === 'enter') { const v = ed.buf.join(''); ed.buf = []; ed.pos = 0; if (v.trim()) hist.push(v); ed.hi = hist.length; return { submit: v }; }
  const { buf } = ed;
  if (k === 'backspace') { if (ed.pos) { buf.splice(ed.pos - 1, 1); ed.pos--; } }
  else if (k === 'delete') buf.splice(ed.pos, 1);
  else if (k === 'left') ed.pos = Math.max(0, ed.pos - 1);
  else if (k === 'right') ed.pos = Math.min(buf.length, ed.pos + 1);
  else if (k === 'home' || (key.ctrl && k === 'a')) ed.pos = 0;
  else if (k === 'end' || (key.ctrl && k === 'e')) ed.pos = buf.length;
  else if (key.ctrl && k === 'u') { buf.splice(0, ed.pos); ed.pos = 0; }
  else if (key.ctrl && k === 'w') { let i = ed.pos; while (i && buf[i - 1] === ' ') i--; while (i && buf[i - 1] !== ' ') i--; buf.splice(i, ed.pos - i); ed.pos = i; }
  else if (k === 'up') { if (ed.hi > 0) { if (ed.hi === hist.length) ed.draft = buf; ed.hi--; ed.buf = [...hist[ed.hi]]; ed.pos = ed.buf.length; } }
  else if (k === 'down') { if (ed.hi < hist.length) { ed.hi++; ed.buf = ed.hi === hist.length ? ed.draft : [...hist[ed.hi]]; ed.pos = ed.buf.length; } }
  else if (k === 'paste-start') { ed.pasting = true; ed.pasted = ''; return null; }
  else if (k === 'paste-end') { ed.pasting = false; if (!ed.pasted) { if (!pasteImage()) return null; } else { const ch = [...ed.pasted.replace(/\r\n?/g, '\n').replace(/\n/g, ' ')]; buf.splice(ed.pos, 0, ...ch); ed.pos += ch.length; } }
  else if (key.ctrl && k === 'v') { if (!pasteImage()) return null; }
  else if (k === 'escape' || k === 'tab' || key.ctrl || key.meta) return null;
  else if (str) { const ch = [...str.replace(/[\r\n]+/g, ' ')].filter((x) => x >= ' '); buf.splice(ed.pos, 0, ...ch); ed.pos += ch.length; }
  return 'redraw';
}
function rawOn() { if (process.stdin.isTTY) { process.stdin.setRawMode(true); process.stdin.resume(); w(`${E}?2004h`); } }
function rawOff() { if (process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); w(`${E}?2004l`); } }

function ask() {
  if (queue.length) return Promise.resolve(queue.shift());
  if (!process.stdin.isTTY) return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once('line', (l) => { rl.close(); resolve(l); }); rl.once('close', () => process.exit(0));
  });
  return new Promise((resolve) => {
    const effort = (String(model || modelName).match(/\b(low|medium|high|xhigh|max)\b/i) || [])[1];
    const draw = () => {
      const b = boxLines(), tag = effort ? st.grey(`◐ ${effort.toLowerCase()} · /model`) : '';
      const top = tag ? ' '.repeat(Math.max(0, cols() - 2 - vlen(tag))) + tag : '';
      drawLive([], [top, ...b.lines], { row: b.row + 1, col: b.col });
    };
    const done = () => { clearLive(); process.stdin.removeListener('keypress', onKey); process.stdout.removeListener('resize', draw); rawOff(); };
    const onKey = (str, key) => {
      const r = edKey(str, key);
      if (r === 'ctrlc' || r === 'ctrld') { done(); process.exit(0); }
      if (r && r.submit !== undefined) { done(); resolve(r.submit); return; }
      if (r === 'redraw') draw();
    };
    rawOn(); process.stdin.on('keypress', onKey); process.stdout.on('resize', draw);
    draw();
  });
}
const images = []; // pasted image files, numbered for the whole session
// A sent message as grey-backed rows; dim = a queued message, drawn at lower contrast.
function userRows(msg, dim = false) {
  const width = cols() - 2;
  const lines = wrap(msg, width - 4);
  const W = dim ? `${E}38;2;130;130;130m` : `${E}38;2;255;255;255m`, BG = dim ? `${E}48;2;40;40;40m` : `${E}48;2;55;55;55m`;
  const sty = (l) => dim ? l : l.replace(/`([^`]+)`/g, (_, x) => `${E}38;2;177;185;249m${x}${W}`).replace(/\*\*([^*]+)\*\*/g, (_, x) => `${E}1m${x}${E}22m`);
  return lines.map((l, i) => { const t = sty(l); return `${BG}${i ? '  ' : `${E}38;2;${dim ? '100;100;100' : '153;153;153'}m❯${W} `}${W}${t}${' '.repeat(Math.max(0, width - 2 - vlen(t)))}${E}0m`; });
}
function userBlock(msg) { put(userRows(msg).join('\n') + '\n\n'); }

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
    if (input === '/session') { put(st.grey(`  ${chatId || 'no chat yet'}\n\n`)); continue; }
    if (input.startsWith('/resume')) { const id = input.split(/\s+/)[1]; if (id) { chatId = id; put(st.grey(`  resuming ${id}\n\n`)); } else put(st.grey('  usage: /resume <chatId>  (cursor-agent ls lists chats)\n\n')); continue; }
    if (input.startsWith('/model')) {
      const id = input.split(/\s+/)[1];
      if (id) { model = id; modelName = id; put(st.grey(`  model → ${id}\n\n`)); }
      else { const r = spawnSync('cursor-agent', ['--list-models'], { encoding: 'utf8' }); put(st.grey((r.stdout || r.stderr).split('\n').filter((l) => / - /.test(l)).map((l) => '  ' + l).join('\n')) + '\n\n'); }
      continue;
    }
    userBlock(input);
    if (input.startsWith('!')) {
      const r = spawnSync(process.env.SHELL || 'zsh', ['-lc', input.slice(1)], { encoding: 'utf8' });
      put(((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n').map((l) => '  ' + st.grey('⎿ ') + l).join('\n') + '\n\n');
      continue;
    }
    const refs = [...input.matchAll(/\[Image #(\d+)\]/g)].map((m) => +m[1]).filter((n) => images[n - 1]);
    await runTurn(refs.length ? `${input}\n\n(Pasted images — read each file to see it: ${[...new Set(refs)].map((n) => `[Image #${n}] ${images[n - 1]}`).join(', ')})` : input);
  }
}
main();
