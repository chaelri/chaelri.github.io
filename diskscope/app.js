/* diskscope — the browser half.
   Native JS, no framework, no build. Talks to serve.py over localhost. */

'use strict';

const TOKEN = new URLSearchParams(location.search).get('token') || window.DISKSCOPE_TOKEN;

/* ── tiny helpers ───────────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body
      ? { 'X-Diskscope-Token': TOKEN, 'Content-Type': 'application/json' }
      : { 'X-Diskscope-Token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

/* macOS reports storage in decimal units, so diskscope does too — otherwise the
   numbers here would never line up with the ones in System Settings. */
const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
function fmtSize(bytes) {
  if (bytes == null) return { n: '—', u: '' };
  if (bytes === 0) return { n: '0', u: 'KB' };
  let i = 0;
  let v = bytes;
  while (v >= 1000 && i < UNITS.length - 1) { v /= 1000; i++; }
  const dp = i === 0 ? 0 : v >= 100 ? 1 : v >= 10 ? 1 : 2;
  return { n: v.toFixed(dp), u: UNITS[i] };
}
const sizeText = (b) => { const s = fmtSize(b); return s.u ? `${s.n} ${s.u}` : s.n; };

const fmtCount = (n) => (n == null ? '' : n.toLocaleString());

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const days = (Date.now() - d) / 86400000;
  if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 300) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtDateFull = (ts) =>
  ts ? new Date(ts * 1000).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }) : '—';

/* ── kind vocabulary (mirrors serve.py's KIND_BY_EXT) ───────────────────── */

const KINDS = {
  folder:   { icon: 'folder',            label: 'Folder',   color: 'var(--k-folder)' },
  video:    { icon: 'movie',             label: 'Video',    color: 'var(--k-video)' },
  image:    { icon: 'image',             label: 'Image',    color: 'var(--k-image)' },
  audio:    { icon: 'graphic_eq',        label: 'Audio',    color: 'var(--k-audio)' },
  archive:  { icon: 'folder_zip',        label: 'Archive',  color: 'var(--k-archive)' },
  document: { icon: 'description',       label: 'Document', color: 'var(--k-document)' },
  code:     { icon: 'code',              label: 'Code',     color: 'var(--k-code)' },
  app:      { icon: 'apps',              label: 'App',      color: 'var(--k-app)' },
  game:     { icon: 'stadia_controller', label: 'Game data', color: 'var(--k-game)' },
  other:    { icon: 'draft',             label: 'Other',    color: 'var(--k-other)' },
};
const KIND_ORDER = Object.keys(KINDS);
const kindOf = (k) => KINDS[k] || KINDS.other;

/* Colours for the volume bar, in the order segments are drawn. */
const SEG_COLORS = [
  'var(--k-archive)', 'var(--k-image)', 'var(--k-audio)', 'var(--k-document)',
  'var(--k-folder)', 'var(--k-video)', 'var(--k-code)', 'var(--k-app)',
];

/* ── state ──────────────────────────────────────────────────────────────── */

const S = {
  root: '',
  path: '',
  view: 'list',            // list | big | kinds
  sort: 'size',
  desc: true,
  foldersFirst: false,
  /* On by default: a tool whose whole job is "where did my disk go" must not
     hide ~/.Trash, ~/.cache or a 1.8 GB .git from you. */
  showHidden: true,
  minSize: 0,
  query: '',
  kindFilter: 'all',
  entries: [],
  listing: null,
  volume: null,
  status: null,
  history: [],
  hIndex: -1,
  limit: 400,
  selected: null,
  sheetItem: null,
};

/* ── boot ───────────────────────────────────────────────────────────────── */

(async function boot() {
  applyTheme(localStorage.getItem('diskscope:theme') || 'dark');
  restorePrefs();
  wire();

  try {
    const cfg = await api('/api/config');
    S.root = cfg.root;
    S.volume = cfg.volume;
    S.wholeDisk = cfg.wholeDisk;
    $('#vol-name').textContent = cfg.wholeDisk ? cfg.volume.name : rootLabel();
    $('#vol-total').textContent = `of ${sizeText(cfg.volume.total)}`;
    $('#vol-used').textContent = sizeText(cfg.volume.used);
    drawJumps(cfg.jumps || []);
    if (cfg.wholeDisk && !cfg.fullDiskAccess) showFullDiskNotice();
    navigate(cfg.root, { replace: true });
  } catch (err) {
    toast('Cannot reach the server — is serve.py still running?', true);
    return;
  }
  pollStatus();
})();

/* ── status polling ─────────────────────────────────────────────────────── */

let pollTimer = null;
async function pollStatus() {
  clearTimeout(pollTimer);
  let st;
  try {
    st = await api('/api/status');
  } catch {
    pollTimer = setTimeout(pollStatus, 2000);
    return;
  }
  const wasScanning = S.status && S.status.state === 'scanning';
  S.status = st;

  const strip = $('#scan-strip');
  const scanning = st.state === 'scanning';

  strip.classList.toggle('done', !scanning);
  $('#btn-rescan').classList.toggle('spin', scanning);

  if (scanning) {
    $('#scan-text').textContent =
      `Scanning · ${fmtCount(st.files)} files · ${fmtCount(st.dirs)} folders · ${sizeText(st.bytes)}`;
    $('#scan-path').textContent = st.current.replace(S.root, '~');
    $('#vol-sub').textContent = 'Measuring folders…';
  } else if (st.state === 'error') {
    $('#vol-sub').textContent = st.error;
  } else if (st.state === 'ready') {
    const pct = S.volume ? Math.round((st.bytes / S.volume.total) * 100) : 0;
    const when = st.fromCache
      ? (st.age > 90 ? `indexed ${relAge(st.age)} ago` : 'indexed just now')
      : `indexed in ${st.elapsed}s`;
    const where = S.wholeDisk ? 'Whole disk' : shortPath(S.root);
    $('#vol-sub').textContent =
      `${where} · ${sizeText(st.bytes)} across ${fmtCount(st.files)} files · ${when}` +
      (st.denied ? ` · ${fmtCount(st.denied)} folders unreadable` : '');
    $('#foot-right').textContent = `${fmtCount(st.indexed)} folders indexed${pct ? ` · ${pct}% of the volume` : ''}`;
  }

  if (wasScanning && !scanning) {
    toast(`Scan finished — ${sizeText(st.bytes)} in ${fmtCount(st.files)} files`);
    drawVolume();
    reload();
  } else if (!S.volume?.segments) {
    drawVolume();
  }

  pollTimer = setTimeout(pollStatus, scanning ? 400 : 5000);
}

const relAge = (s) =>
  s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
const shortPath = (p) => (p || '').replace(/^\/Users\/[^/]+/, '~');
const baseName = (p) => (p || '').split('/').filter(Boolean).pop() || '';
const rootLabel = () => (S.root === '/' ? (S.volume?.name || 'Macintosh HD') : baseName(S.root));

/* ── quick jumps + notices ──────────────────────────────────────────────── */

function drawJumps(paths) {
  const wrap = $('#jumps');
  wrap.innerHTML = '';
  const icons = {
    Downloads: 'download', Documents: 'description', Desktop: 'desktop_mac',
    Movies: 'movie', Library: 'inventory_2', Applications: 'apps',
  };
  paths.forEach((p) => {
    const name = baseName(p);
    const isHome = p === '/Users/' + p.split('/')[2] && !icons[name];
    const b = el('button');
    b.dataset.path = p;
    b.appendChild(Object.assign(el('span', 'ms'), {
      textContent: isHome ? 'home' : (icons[name] || 'folder'),
    }));
    b.appendChild(el('span', null, isHome ? 'Home' : name));
    b.onclick = () => { if (S.view === 'kinds') setView('list'); navigate(p); };
    wrap.appendChild(b);
  });
}

function syncJumps() {
  $$('#jumps button').forEach((b) => b.classList.toggle('on', b.dataset.path === S.path));
}

function showFullDiskNotice() {
  const n = el('div', 'notice');
  n.appendChild(Object.assign(el('span', 'ms'), { textContent: 'lock' }));
  n.appendChild(el('span', null,
    'Some folders will show as unreadable until the terminal running serve.py has ' +
    'Full Disk Access (System Settings › Privacy & Security › Full Disk Access). ' +
    'Everything else still scans.'));
  $('#volume-card').insertBefore(n, $('#scan-strip'));
}

/* ── volume bar ─────────────────────────────────────────────────────────── */

async function drawVolume() {
  if (!S.volume || !S.status || S.status.state !== 'ready') return;
  let data;
  try {
    data = await api(`/api/ls?path=${encodeURIComponent(S.root)}`);
  } catch { return; }

  const total = S.volume.total;
  const kids = data.entries
    .filter((e) => e.dir && e.size)
    .sort((a, b) => b.size - a.size);

  const top = kids.slice(0, 6);
  const restBytes = kids.slice(6).reduce((a, e) => a + e.size, 0)
    + data.entries.filter((e) => !e.dir).reduce((a, e) => a + (e.size || 0), 0);
  const scanned = S.status.bytes;
  const elsewhere = Math.max(0, S.volume.used - scanned);

  const segs = top.map((e, i) => ({
    label: e.name, bytes: e.size, color: SEG_COLORS[i % SEG_COLORS.length], path: e.path,
  }));
  if (restBytes > 0) segs.push({ label: 'Other', bytes: restBytes, color: 'var(--k-other)', path: S.root });
  if (elsewhere > total * 0.005) {
    // Whatever the volume says is used but the walk never counted: the sealed
    // system volume, other users' folders, snapshots, TCC-blocked paths.
    segs.push({
      label: S.wholeDisk ? 'macOS system & snapshots' : 'Outside this folder',
      bytes: elsewhere, color: 'var(--k-free)', path: null,
    });
  }
  S.volume.segments = segs;

  const bar = $('#vol-bar');
  bar.innerHTML = '';
  const legend = $('#vol-legend');
  legend.innerHTML = '';

  segs.forEach((s, i) => {
    const seg = el('div', 'vol-seg');
    seg.style.background = s.color;
    seg.title = `${s.label} — ${sizeText(s.bytes)}`;
    bar.appendChild(seg);
    requestAnimationFrame(() =>
      setTimeout(() => { seg.style.width = `${(s.bytes / total) * 100}%`; }, 40 + i * 45));

    const b = el('button');
    b.style.color = s.color;
    b.appendChild(el('i'));
    const name = el('span', null, s.label);
    name.style.color = 'var(--text-2)';
    b.appendChild(name);
    b.appendChild(el('b', null, sizeText(s.bytes)));
    if (s.path) b.onclick = () => { setView('list'); navigate(s.path); };
    else b.style.cursor = 'default';
    legend.appendChild(b);
  });

  $('#vol-used').textContent = sizeText(S.volume.used);
  $('#foot-left').textContent = `${sizeText(S.volume.free)} free`;
}

/* ── navigation ─────────────────────────────────────────────────────────── */

function navigate(path, opts = {}) {
  if (!opts.replace && !opts.silent) {
    S.history = S.history.slice(0, S.hIndex + 1);
    S.history.push(path);
    S.hIndex = S.history.length - 1;
  } else if (opts.replace) {
    S.history = [path];
    S.hIndex = 0;
  }
  S.path = path;
  S.limit = 400;
  S.selected = null;
  syncNavButtons();
  syncJumps();
  reload();
}

function syncNavButtons() {
  $('#btn-back').disabled = S.hIndex <= 0;
  $('#btn-fwd').disabled = S.hIndex >= S.history.length - 1;
}

function goBack() {
  if (S.hIndex <= 0) return;
  S.hIndex--;
  S.path = S.history[S.hIndex];
  syncNavButtons();
  reload();
}
function goForward() {
  if (S.hIndex >= S.history.length - 1) return;
  S.hIndex++;
  S.path = S.history[S.hIndex];
  syncNavButtons();
  reload();
}
function goUp() {
  if (S.path === S.root) return;
  navigate(S.path.slice(0, S.path.lastIndexOf('/')) || '/');
}

/* ── loading + rendering ────────────────────────────────────────────────── */

let reqSeq = 0;
async function reload() {
  const seq = ++reqSeq;
  drawCrumbs();

  if (S.view === 'kinds') return renderKinds(seq);

  let data;
  try {
    data = S.view === 'big'
      ? await api(`/api/big?path=${encodeURIComponent(S.path)}&limit=600&kind=${S.kindFilter}`)
      : await api(`/api/ls?path=${encodeURIComponent(S.path)}`);
  } catch (err) {
    if (seq !== reqSeq) return;
    return renderEmpty(String(err));
  }
  if (seq !== reqSeq) return;

  S.listing = data;
  S.entries = data.entries || [];
  render();
  if (S.view === 'list') measureUnknowns();
}

function drawCrumbs() {
  const wrap = $('#crumbs');
  wrap.innerHTML = '';
  const parts = [];
  let cur = S.path;
  while (cur && cur.length >= S.root.length) {
    parts.unshift(cur);
    if (cur === S.root) break;
    const next = cur.slice(0, cur.lastIndexOf('/'));
    if (next === cur) break;
    cur = next || '/';
  }
  parts.forEach((p, i) => {
    if (i) {
      const sep = el('span', 'crumb-sep');
      sep.appendChild(Object.assign(el('span', 'ms'), { textContent: 'chevron_right' }));
      sep.style.display = 'inline-flex';
      wrap.appendChild(sep);
    }
    const name = i === 0 ? rootLabel() : baseName(p);
    const b = el('button', `crumb${i === parts.length - 1 ? ' last' : ''}`, name);
    b.onclick = () => navigate(p);
    wrap.appendChild(b);
  });
}

function visibleEntries() {
  const q = S.query.trim().toLowerCase();
  let list = S.entries.filter((e) => {
    if (!S.showHidden && e.hidden) return false;
    if (S.minSize && (e.size || 0) < S.minSize) return false;
    if (q && !e.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const dir = S.desc ? -1 : 1;
  const cmp = {
    size: (a, b) => dir * ((a.size ?? -1) - (b.size ?? -1)),
    name: (a, b) => -dir * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    mtime: (a, b) => dir * ((a.mtime || 0) - (b.mtime || 0)),
    kind: (a, b) => dir * (KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind))
      || a.name.localeCompare(b.name),
  }[S.sort];

  list.sort(cmp);
  if (S.foldersFirst && S.view === 'list') {
    list.sort((a, b) => (b.dir === true) - (a.dir === true));
  }
  return list;
}

function render() {
  const rows = $('#rows');
  const list = visibleEntries();
  const shown = list.slice(0, S.limit);
  const max = Math.max(1, ...shown.map((e) => e.size || 0));
  const total = shown.reduce((a, e) => a + (e.size || 0), 0);
  const parentSize = S.view === 'list' ? (S.listing?.size ?? total) : total;

  rows.innerHTML = '';
  $('#empty').classList.toggle('hidden', list.length > 0);

  $('#list-title').textContent =
    S.view === 'big'
      ? `Biggest files in ${S.path === S.root ? rootLabel() : baseName(S.path)}`
      : 'Contents';
  $('#list-meta').textContent = list.length
    ? `${fmtCount(list.length)} item${list.length === 1 ? '' : 's'} · ${sizeText(total)}` +
      (list.length > shown.length ? ` · showing ${fmtCount(shown.length)}` : '')
    : '';

  if (!list.length) {
    $('#empty-text').textContent = S.query
      ? `No match for “${S.query}”`
      : S.minSize ? 'Nothing above that size here' : 'This folder is empty';
    return;
  }

  const frag = document.createDocumentFragment();
  shown.forEach((e, i) => frag.appendChild(makeRow(e, i, max, parentSize)));
  rows.appendChild(frag);

  if (list.length > shown.length) {
    const more = el('button', 'act', `Show ${fmtCount(Math.min(400, list.length - shown.length))} more`);
    more.style.margin = '8px 5px 4px';
    more.style.width = 'calc(100% - 10px)';
    more.onclick = () => { S.limit += 400; render(); };
    rows.appendChild(more);
  }
}

function makeRow(e, i, max, parentSize) {
  const kind = kindOf(e.dir ? 'folder' : e.kind);
  const row = el('div', 'row');
  row.style.setProperty('--c', kind.color);
  row.style.animationDelay = `${Math.min(i * 9, 260)}ms`;
  row.dataset.path = e.path;
  row.tabIndex = 0;
  if (e.dir) row.classList.add('drillable');
  if (S.selected === e.path) row.classList.add('sel');

  const tile = el('div', 'tile');
  tile.appendChild(Object.assign(el('span', 'ms'), { textContent: kind.icon }));
  row.appendChild(tile);

  const main = el('div', 'row-main');
  const name = el('div', 'row-name');
  name.append(...highlight(e.name, S.query));
  main.appendChild(name);

  const sub = el('div', 'row-sub');
  if (S.view === 'big') {
    // In this view the folder is the useful part — make it a jump target so a
    // 17 GB clip is one click away from the folder it's hiding in.
    const jump = el('button', 'sub-link', shortPath(e.parent || ''));
    jump.title = 'Go to this folder';
    jump.onclick = (ev) => {
      ev.stopPropagation();
      setView('list');
      navigate(e.parent);
    };
    sub.appendChild(jump);
  } else {
    const bits = [];
    if (e.skipped) bits.push('system — not scanned');
    else if (e.dir) bits.push(e.items != null ? `${fmtCount(e.items)} items` : 'measuring…');
    else bits.push(kind.label);
    bits.push(fmtDate(e.mtime));
    if (e.link) bits.push('alias');
    sub.textContent = bits.join(' · ');
  }
  main.appendChild(sub);
  row.appendChild(main);

  const bar = el('div', 'row-bar');
  const fill = el('i');
  bar.appendChild(fill);
  row.appendChild(bar);
  requestAnimationFrame(() =>
    setTimeout(() => { fill.style.width = `${Math.max(2, ((e.size || 0) / max) * 100)}%`; },
      60 + Math.min(i * 9, 260)));

  const s = fmtSize(e.size);
  const size = el('div', `row-size${e.size == null ? ' unknown' : ''}`);
  size.append(s.n);
  if (s.u) size.appendChild(el('span', 'unit', s.u));
  row.appendChild(size);

  const pct = parentSize ? ((e.size || 0) / parentSize) * 100 : 0;
  row.appendChild(el('div', 'row-pct', pct >= 0.1 ? `${pct.toFixed(pct < 10 ? 1 : 0)}%` : ''));

  const acts = el('div', 'row-acts');
  if (e.preview) {
    acts.appendChild(iconAct(
      e.preview === 'video' ? 'play_circle'
        : e.preview === 'audio' ? 'volume_up'
          : e.preview === 'image' ? 'visibility' : 'article',
      'Preview  P',
      (ev) => { ev.stopPropagation(); S.selected = e.path; openTheater(e); },
    ));
  } else {
    acts.appendChild(el('span', 'row-act-gap'));
  }
  acts.appendChild(iconAct('folder_open', 'Reveal in Finder', (ev) => {
    ev.stopPropagation();
    reveal(e.path);
  }));
  acts.appendChild(iconAct('info', 'Details', (ev) => {
    ev.stopPropagation();
    openSheet(e);
  }));
  row.appendChild(acts);

  const chev = el('div', 'row-chev');
  if (e.dir) chev.appendChild(Object.assign(el('span', 'ms'), { textContent: 'chevron_right' }));
  else chev.style.width = '18px';
  row.appendChild(chev);

  row.onclick = () => {
    S.selected = e.path;
    if (e.dir) navigate(e.path);
    else { render(); openSheet(e); }
  };
  row.ondblclick = () => { if (!e.dir) reveal(e.path); };
  return row;
}

function iconAct(icon, title, fn) {
  const b = el('button', 'row-act');
  b.title = title;
  b.appendChild(Object.assign(el('span', 'ms'), { textContent: icon }));
  b.onclick = fn;
  return b;
}

function highlight(text, q) {
  q = q.trim();
  if (!q) return [text];
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return [text];
  return [
    text.slice(0, idx),
    el('mark', null, text.slice(idx, idx + q.length)),
    text.slice(idx + q.length),
  ];
}

function renderEmpty(msg) {
  $('#rows').innerHTML = '';
  $('#empty').classList.remove('hidden');
  $('#empty-text').textContent = msg;
  $('#list-meta').textContent = '';
}

/* Folders created after the scan have no size in the index. Fill in a few of
   them quietly so the list doesn't show "—" for things that just appeared. */
async function measureUnknowns() {
  if (S.status?.state !== 'ready') return;
  const pending = S.entries
    .filter((e) => e.dir && e.size == null && !e.skipped)
    .slice(0, 12);
  for (const e of pending) {
    try {
      const r = await api('/api/measure', { path: e.path });
      e.size = r.size;
      e.items = r.items;
    } catch { e.size = 0; }
  }
  if (pending.length) render();
}

/* ── kinds view ─────────────────────────────────────────────────────────── */

async function renderKinds(seq) {
  let data;
  try {
    data = await api('/api/kinds');
  } catch (err) { return renderEmpty(String(err)); }
  if (seq !== reqSeq) return;

  const rows = $('#rows');
  rows.innerHTML = '';
  $('#empty').classList.add('hidden');
  $('#list-title').textContent = 'By kind';

  const kinds = data.kinds.filter((k) => k.bytes > 0);
  const total = kinds.reduce((a, k) => a + k.bytes, 0);
  const max = Math.max(1, ...kinds.map((k) => k.bytes));
  $('#list-meta').textContent = `${sizeText(total)} across ${fmtCount(
    kinds.reduce((a, k) => a + k.files, 0))} files`;

  kinds.forEach((k, i) => {
    const meta = kindOf(k.kind);
    const row = el('div', 'row kind-row drillable');
    row.style.setProperty('--c', meta.color);
    row.style.animationDelay = `${i * 24}ms`;

    const tile = el('div', 'tile');
    tile.appendChild(Object.assign(el('span', 'ms'), { textContent: meta.icon }));
    row.appendChild(tile);

    const main = el('div', 'row-main');
    main.appendChild(el('div', 'row-name', meta.label));
    main.appendChild(el('div', 'row-sub', `${fmtCount(k.files)} files`));
    const exts = el('div', 'kind-exts');
    k.exts.slice(0, 8).forEach((x) =>
      exts.appendChild(el('span', null, `${x.ext} ${sizeText(x.bytes)}`)));
    main.appendChild(exts);
    row.appendChild(main);

    const bar = el('div', 'row-bar');
    const fill = el('i');
    bar.appendChild(fill);
    row.appendChild(bar);
    requestAnimationFrame(() =>
      setTimeout(() => { fill.style.width = `${(k.bytes / max) * 100}%`; }, 80 + i * 24));

    const s = fmtSize(k.bytes);
    const size = el('div', 'row-size');
    size.append(s.n);
    size.appendChild(el('span', 'unit', s.u));
    row.appendChild(size);
    row.appendChild(el('div', 'row-pct', `${((k.bytes / total) * 100).toFixed(0)}%`));
    row.appendChild(el('div', 'row-acts'));

    const chev = el('div', 'row-chev');
    chev.appendChild(Object.assign(el('span', 'ms'), { textContent: 'chevron_right' }));
    row.appendChild(chev);

    row.onclick = () => { S.kindFilter = k.kind; setView('big'); };
    rows.appendChild(row);
  });
}

/* ── player ─────────────────────────────────────────────────────────────── */

/* Media goes through /media/<token>/<base64url-path> rather than a query
   string. Chrome hands <video src> to the network service, and a URL carrying
   ?token=…&path=… gets dropped by privacy extensions before it reaches the
   socket — the request simply never arrives and the player sits on `stalled`
   forever with no error to catch. A plain path segment always survives. */
function fileUrl(path) {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(path)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `/media/${encodeURIComponent(TOKEN)}/${b64}`;
}

/* Build the element that can show this file. `compact` is the little pane
   inside the details sheet; the theater gets the same thing, bigger. */
function makePlayer(entry, compact) {
  const url = fileUrl(entry.path);

  if (entry.preview === 'video') {
    const v = el('video');
    v.src = url;
    v.controls = true;
    // Never preload the body of a 17 GB clip — metadata is enough to show a
    // first frame and a duration, and seeking pulls only the ranges it needs.
    v.preload = 'metadata';
    v.playsInline = true;
    v.onerror = () => v.replaceWith(cannotPlay(entry,
      'Chrome can’t decode this codec (often HEVC or ProRes).'));
    return v;
  }

  if (entry.preview === 'audio') {
    const a = el('audio');
    a.src = url;
    a.controls = true;
    a.preload = 'metadata';
    a.onerror = () => a.replaceWith(cannotPlay(entry, 'Chrome can’t decode this audio.'));
    return a;
  }

  if (entry.preview === 'image') {
    const img = el('img');
    img.src = url;
    img.alt = entry.name;
    img.loading = 'lazy';
    img.onerror = () => img.replaceWith(cannotPlay(entry,
      'Chrome can’t render this image (HEIC needs Preview).'));
    return img;
  }

  if (entry.preview === 'pdf') {
    const f = el('iframe');
    f.src = url;
    f.style.height = compact ? '240px' : '100%';
    return f;
  }

  if (entry.preview === 'text') {
    const pre = el('pre', null, 'Loading…');
    // Read only the head of the file — a 2 GB log must not land in the DOM.
    fetch(url, { headers: { Range: 'bytes=0-131071' } })
      .then((r) => r.text())
      .then((t) => {
        pre.textContent = t + (t.length >= 131000 ? '\n\n… truncated at 128 KB' : '');
      })
      .catch(() => pre.replaceWith(cannotPlay(entry, 'Could not read this file.')));
    return pre;
  }

  return cannotPlay(entry, 'No preview for this kind of file.');
}

function cannotPlay(entry, why) {
  const box = el('div', 'preview-note');
  box.appendChild(Object.assign(el('span', 'ms'), { textContent: 'visibility_off' }));
  box.appendChild(el('span', null, why));
  const b = el('button', null, 'Open in the default app');
  b.onclick = () => openIt(entry.path);
  box.appendChild(b);
  return box;
}

function fillPreview(entry) {
  const wrap = $('#sheet-preview');
  const stage = $('#preview-stage');
  stage.innerHTML = '';
  if (!entry || entry.dir || !entry.preview) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  stage.appendChild(makePlayer(entry, true));
}

function openTheater(entry) {
  if (!entry || entry.dir || !entry.preview) return;
  S.theaterItem = entry;

  // Carry the playhead over so expanding mid-clip doesn't restart it.
  const small = $('#preview-stage').firstElementChild;
  const at = small && 'currentTime' in small ? small.currentTime : 0;
  const wasPlaying = small && 'paused' in small && !small.paused;
  if (small && 'pause' in small) small.pause();

  const stage = $('#theater-stage');
  stage.innerHTML = '';
  const big = makePlayer(entry, false);
  if ('currentTime' in big) {
    big.onloadedmetadata = () => {
      big.currentTime = at;
      if (wasPlaying) big.play().catch(() => {});
    };
  }
  stage.appendChild(big);

  $('#theater-name').textContent = entry.name;
  $('#theater-meta').textContent = `${sizeText(entry.size)} · ${shortPath(
    entry.parent || entry.path.slice(0, entry.path.lastIndexOf('/')))}`;
  $('#theater').classList.add('on');
}

function closeTheater() {
  const stage = $('#theater-stage');
  const media = stage.firstElementChild;
  if (media && 'pause' in media) media.pause();
  // Drop the src so Chrome tears the connection down instead of holding a
  // range request open against a multi-gigabyte file.
  if (media && 'src' in media) media.removeAttribute('src');
  stage.innerHTML = '';
  $('#theater').classList.remove('on');
  S.theaterItem = null;
}

/* ── detail sheet ───────────────────────────────────────────────────────── */

async function openSheet(entry) {
  S.sheetItem = entry;
  const kind = kindOf(entry.dir ? 'folder' : entry.kind);
  const icon = $('#sheet-icon');
  icon.style.setProperty('--c', kind.color);
  icon.firstElementChild.textContent = kind.icon;

  $('#sheet-name').textContent = entry.name;
  $('#sheet-kind').textContent = entry.dir ? 'Folder' : kind.label;
  $('#sheet-size').textContent = sizeText(entry.size);
  $('#sheet-where').textContent = shortPath(entry.parent || entry.path.slice(0, entry.path.lastIndexOf('/')));
  $('#sheet-mtime').textContent = fmtDateFull(entry.mtime);
  $('#sheet-ctime').textContent = '—';
  $('#sheet-items').textContent = entry.dir && entry.items != null ? `${fmtCount(entry.items)} items` : '—';
  $('#sheet-items').parentElement.classList.toggle('hidden', !entry.dir);

  // In Folder view a percentage means "of the folder you're looking at"; in Big
  // files it can only mean "of everything scanned" — say which.
  const inFolder = S.view === 'list';
  const denom = inFolder ? S.listing?.size : S.status?.bytes;
  $('#sheet-share').textContent = denom && entry.size
    ? `${((entry.size / denom) * 100).toFixed(1)}% of ${inFolder ? 'this folder' : rootLabel()}`
    : '';

  fillPreview(entry);
  disarmTrash();
  $('#scrim').classList.add('on');
  $('#sheet').classList.add('on');

  try {
    const info = await api(`/api/info?path=${encodeURIComponent(entry.path)}`);
    if (S.sheetItem !== entry) return;
    $('#sheet-ctime').textContent = fmtDateFull(info.ctime);
    if (info.size != null) $('#sheet-size').textContent = sizeText(info.size);
    if (info.items != null) $('#sheet-items').textContent = `${fmtCount(info.items)} items`;
  } catch { /* the row already shows everything essential */ }
}

function closeSheet() {
  $('#scrim').classList.remove('on');
  $('#sheet').classList.remove('on');
  const media = $('#preview-stage').firstElementChild;
  if (media && 'pause' in media) media.pause();
  if (media && 'src' in media) media.removeAttribute('src');
  $('#preview-stage').innerHTML = '';
  S.sheetItem = null;
  disarmTrash();
}

let trashArmed = false;
function disarmTrash() {
  trashArmed = false;
  const b = $('#act-trash');
  b.classList.remove('armed');
  b.lastChild.textContent = 'Move to Trash';
}

/* ── actions ────────────────────────────────────────────────────────────── */

async function reveal(path) {
  try {
    await api('/api/reveal', { path });
    toast(`Revealed ${path.split('/').pop()} in Finder`, false, 'folder_open');
  } catch (err) { toast(`Could not reveal: ${err.message}`, true); }
}

async function openIt(path) {
  try {
    await api('/api/open', { path });
    toast(`Opening ${path.split('/').pop()}`, false, 'open_in_new');
  } catch (err) { toast(`Could not open: ${err.message}`, true); }
}

async function doTrash() {
  const item = S.sheetItem;
  if (!item) return;
  if (!trashArmed) {
    trashArmed = true;
    const b = $('#act-trash');
    b.classList.add('armed');
    b.lastChild.textContent = `Trash ${sizeText(item.size)}?`;
    setTimeout(disarmTrash, 4000);
    return;
  }
  try {
    await api('/api/trash', { path: item.path });
    toast(`${item.name} moved to Trash — ${sizeText(item.size)} reclaimed`, false, 'delete');
    closeSheet();
    reload();
  } catch (err) { toast(`Trash failed: ${err.message}`, true); }
}

let toastTimer;
function toast(msg, bad, icon) {
  const t = $('#toast');
  t.innerHTML = '';
  t.appendChild(Object.assign(el('span', 'ms'), { textContent: icon || (bad ? 'error' : 'check_circle') }));
  t.appendChild(el('span', null, msg));
  t.classList.toggle('bad', !!bad);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
}

/* ── view + prefs ───────────────────────────────────────────────────────── */

function setView(view) {
  S.view = view;
  S.limit = 400;
  if (view !== 'big') S.kindFilter = 'all';
  $$('#view-seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  movePill();
  savePrefs();
  reload();
}

function movePill() {
  const seg = $('#view-seg');
  const on = seg.querySelector('button.on');
  if (!on) return;
  const pill = seg.querySelector('.seg-pill');
  pill.style.width = `${on.offsetWidth}px`;
  pill.style.transform = `translateX(${on.offsetLeft - 2}px)`;
}

function savePrefs() {
  localStorage.setItem('diskscope:prefs', JSON.stringify({
    view: S.view, sort: S.sort, desc: S.desc,
    foldersFirst: S.foldersFirst, showHidden: S.showHidden, minSize: S.minSize,
  }));
}

function restorePrefs() {
  try {
    Object.assign(S, JSON.parse(localStorage.getItem('diskscope:prefs') || '{}'));
  } catch { /* defaults are fine */ }
}

function syncControls() {
  $$('#view-seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
  $$('#min-chips button').forEach((b) => b.classList.toggle('on', Number(b.dataset.min) === S.minSize));
  $$('#sort-menu button[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === S.sort));
  $('#sort-menu button[data-toggle="dir"]').classList.toggle('on', S.desc);
  $('#sort-menu button[data-toggle="folders"]').classList.toggle('on', S.foldersFirst);
  $('#sort-menu button[data-toggle="hidden"]').classList.toggle('on', S.showHidden);
  $('#sort-label').textContent =
    { size: 'Size', name: 'Name', mtime: 'Date', kind: 'Kind' }[S.sort];
  movePill();
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  $('#btn-theme').firstElementChild.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
  localStorage.setItem('diskscope:theme', theme);
}

/* ── wiring ─────────────────────────────────────────────────────────────── */

function wire() {
  $('#btn-back').onclick = goBack;
  $('#btn-fwd').onclick = goForward;
  $('#btn-theme').onclick = () =>
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');

  $('#btn-rescan').onclick = async () => {
    try {
      await api('/api/scan', { fresh: true });
      toast('Rescanning the disk…', false, 'refresh');
      pollStatus();
    } catch (err) { toast(String(err), true); }
  };

  $$('#view-seg button').forEach((b) => { b.onclick = () => setView(b.dataset.view); });

  $$('#min-chips button').forEach((b) => {
    b.onclick = () => {
      S.minSize = Number(b.dataset.min);
      S.limit = 400;
      $$('#min-chips button').forEach((x) => x.classList.toggle('on', x === b));
      savePrefs();
      if (S.view === 'kinds') setView('list'); else render();
    };
  });

  const menu = $('#sort-menu');
  $('#sort-btn').onclick = (ev) => { ev.stopPropagation(); menu.classList.toggle('open'); };
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.onclick = (ev) => ev.stopPropagation();

  $$('#sort-menu button[data-sort]').forEach((b) => {
    b.onclick = () => {
      if (S.sort === b.dataset.sort) S.desc = !S.desc;
      else { S.sort = b.dataset.sort; S.desc = b.dataset.sort !== 'name'; }
      syncControls();
      savePrefs();
      render();
    };
  });
  $('#sort-menu button[data-toggle="dir"]').onclick = () => {
    S.desc = !S.desc; syncControls(); savePrefs(); render();
  };
  $('#sort-menu button[data-toggle="folders"]').onclick = () => {
    S.foldersFirst = !S.foldersFirst; syncControls(); savePrefs(); render();
  };
  $('#sort-menu button[data-toggle="hidden"]').onclick = () => {
    S.showHidden = !S.showHidden; syncControls(); savePrefs(); render();
  };

  let searchTimer;
  $('#search').oninput = (ev) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      S.query = ev.target.value;
      S.limit = 400;
      if (S.view !== 'kinds') render();
    }, 90);
  };

  $('#sheet-close').onclick = closeSheet;
  $('#scrim').onclick = closeSheet;

  $('#preview-expand').onclick = () => openTheater(S.sheetItem);
  $('#preview-stage').ondblclick = () => openTheater(S.sheetItem);
  $('#theater-close').onclick = closeTheater;
  $('#theater').onclick = (ev) => { if (ev.target.id === 'theater-stage') closeTheater(); };
  $('#theater-reveal').onclick = () => S.theaterItem && reveal(S.theaterItem.path);
  $('#theater-open').onclick = () => S.theaterItem && openIt(S.theaterItem.path);

  $('#act-reveal').onclick = () => S.sheetItem && reveal(S.sheetItem.path);
  $('#act-open').onclick = () => S.sheetItem && openIt(S.sheetItem.path);
  $('#act-copy').onclick = async () => {
    if (!S.sheetItem) return;
    await navigator.clipboard.writeText(S.sheetItem.path);
    toast('Path copied', false, 'content_copy');
  };
  $('#act-trash').onclick = doTrash;

  window.addEventListener('resize', movePill);
  // The segmented buttons contain Material Symbols glyphs, so their widths jump
  // when the icon font arrives — measure the pill again once it has.
  if (document.fonts) document.fonts.ready.then(movePill);
  document.addEventListener('keydown', onKey);
  syncControls();
}

function onKey(ev) {
  const typing = ev.target.tagName === 'INPUT';
  const meta = ev.metaKey || ev.ctrlKey;

  if (meta && ev.key === 'f') { ev.preventDefault(); $('#search').focus(); return; }
  if (meta && ev.key === 'r') { ev.preventDefault(); $('#btn-rescan').click(); return; }
  if (meta && ev.key === '[') { ev.preventDefault(); goBack(); return; }
  if (meta && ev.key === ']') { ev.preventDefault(); goForward(); return; }
  if (meta && ev.key === 'ArrowUp') { ev.preventDefault(); goUp(); return; }

  if (ev.key === 'Escape') {
    if ($('#theater').classList.contains('on')) return closeTheater();
    if ($('#sheet').classList.contains('on')) return closeSheet();
    if (typing) { ev.target.value = ''; S.query = ''; ev.target.blur(); render(); }
    return;
  }
  if (typing) return;

  const list = visibleEntries().slice(0, S.limit);
  const idx = list.findIndex((e) => e.path === S.selected);

  // While the theater is up the video owns the keyboard except for these.
  if ($('#theater').classList.contains('on')) {
    if (ev.key === 'p' || ev.key === 'P') closeTheater();
    return;
  }

  if (ev.key === 'p' || ev.key === 'P') {
    ev.preventDefault();
    const e = list[idx] || S.sheetItem;
    if (e?.preview) openTheater(e);
    else if (e) toast(`No preview for ${e.name}`, true, 'visibility_off');
    return;
  }

  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const next = Math.max(0, Math.min(list.length - 1, idx + (ev.key === 'ArrowDown' ? 1 : -1)));
    if (!list[next]) return;
    S.selected = list[next].path;
    render();
    document.querySelector(`.row[data-path="${CSS.escape(S.selected)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
    const e = list[idx];
    if (e?.dir) navigate(e.path);
    else if (e) openSheet(e);
    return;
  }
  if (ev.key === 'ArrowLeft') { goUp(); return; }
  if (ev.key === ' ') {
    ev.preventDefault();
    const e = list[idx];
    if (e) reveal(e.path);
  }
}
