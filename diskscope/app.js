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
  // A 401 means this tab is holding a token the server no longer honours.
  // Every later click would fail the same way, so say it once, loudly, instead
  // of firing "bad token" at whatever the user happens to press next.
  if (res.status === 401) { showStale(); throw new Error('this page is out of date'); }
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

let staleShown = false;
function showStale() {
  if (staleShown) return;
  staleShown = true;
  clearTimeout(pollTimer);
  clearTimeout(jobTimer);
  const bar = el('div', 'stale-bar');
  bar.appendChild(Object.assign(el('span', 'ms'), { textContent: 'sync_problem' }));
  bar.appendChild(el('span', null, 'diskscope restarted — this page is out of date.'));
  const b = el('button', 'mini', 'Reload');
  b.onclick = () => location.reload();
  bar.appendChild(b);
  document.body.appendChild(bar);
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
  thumbs: true,
  previewMuted: true,
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
  marked: new Set(),       // multi-select, for sending a batch to a project
  anchor: null,            // where a shift-range starts from
  project: null,           // the open project, if any
};

/* ── boot ───────────────────────────────────────────────────────────────── */

(async function boot() {
  applyTheme(localStorage.getItem('diskscope:theme') || 'dark');
  restorePrefs();
  wire();

  try {
    const cfg = await api('/api/config');
    S.root = cfg.root;
    S.home = cfg.home;
    S.volume = cfg.volume;
    S.trash = cfg.trash;
    S.hostApp = cfg.hostApp;
    S.wholeDisk = cfg.wholeDisk;
    drawTrash();
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
  loadProjects();
  pollJobs();
})();

/* ── auto clip ──────────────────────────────────────────────────────────── */

const AUTO = { target: 300, moment: 8, perClip: false };

function openAuto() {
  if (!S.project || !S.project.assets.length) {
    return toast('Add clips to a project first', true, 'auto_awesome');
  }
  const n = S.project.assets.length;
  $('#auto-sum').textContent = `${fmtCount(n)} clip${n === 1 ? '' : 's'} in “${S.project.name}”`;
  syncAuto();
  $('#auto-scrim').classList.add('on');
  $('#auto-box').classList.add('on');
}

function closeAuto() {
  $('#auto-scrim').classList.remove('on');
  $('#auto-box').classList.remove('on');
}

function syncAuto() {
  $$('#auto-target button').forEach((b) => b.classList.toggle('on',
    b.dataset.t === 'every' ? AUTO.perClip : (!AUTO.perClip && Number(b.dataset.t) === AUTO.target)));
  $$('#auto-moment button').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === AUTO.moment));
}

async function runAuto() {
  try {
    await api('/api/project-auto', {
      id: S.project.id, target: AUTO.target, moment: AUTO.moment, perClip: AUTO.perClip,
    });
    closeAuto();
    toast('Listening, then cutting — watch the progress bar', false, 'auto_awesome');
    pollJobs(true);
    watchAuto();
  } catch (err) { toast(`Auto clip failed: ${err.message}`, true); }
}

/* When the cut lands, go straight into reviewing it — the point of an auto
   edit is the thing it made, not the notification that it finished. */
function watchAuto() {
  clearInterval(S.autoWatch);
  S.autoWatch = setInterval(async () => {
    let jobs;
    try { jobs = (await api('/api/jobs')).jobs || []; } catch { return; }
    const auto = jobs.find((j) => j.kind === 'auto');
    if (!auto || auto.state === 'running') return;
    clearInterval(S.autoWatch);
    if (auto.state !== 'done') return;
    const m = auto.meta || {};
    // The cut is its own project, so switch to it — the one it was made from
    // is still in the picker, untouched.
    await loadProjects(m.project);
    toast(`“${m.name}” · ${fmtCount(m.clips)} moments · ${clock(m.seconds)}`,
      false, 'auto_awesome');
    openReview('picks');
  }, 1500);
}

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

  // The volume figures come back on every poll, so the gauge tracks a trash, an
  // empty, or anything else touching the disk without waiting for a rescan.
  if (st.volume && S.volume) {
    const moved = S.volume.used !== st.volume.used;
    Object.assign(S.volume, st.volume);
    $('#vol-used').textContent = sizeText(S.volume.used);
    $('#vol-total').textContent = `of ${sizeText(S.volume.total)}`;
    $('#foot-left').textContent = `${sizeText(S.volume.free)} free`;
    if (moved) drawVolume();
  }
  if (st.trash) { S.trash = st.trash; drawTrash(); }

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
  const app = S.hostApp || 'the terminal running serve.py';
  const n = el('div', 'notice');
  n.appendChild(Object.assign(el('span', 'ms'), { textContent: 'lock' }));
  n.appendChild(el('span', null,
    `Some folders — including the Trash — can’t be read until ${app} has Full ` +
    'Disk Access. Everything else still scans.'));
  const b = el('button', 'mini', 'Open Settings');
  b.onclick = openFdaSettings;
  n.appendChild(b);
  $('#volume-card').insertBefore(n, $('#scan-strip'));
}

/* macOS offers no API to grant this — the pane is as far as anything can go,
   the toggle is the user's. The grant only takes effect once the app is
   quit and reopened, which is worth saying out loud. */
async function openFdaSettings() {
  const app = S.hostApp || 'your terminal';
  try {
    await api('/api/fda', {});
    toast(`Add ${app} to the list, then quit and reopen it`, false, 'lock_open');
  } catch (err) { toast(String(err), true); }
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
      bytes: elsewhere, color: 'var(--k-system)', path: null,
    });
  }
  S.volume.segments = segs;

  const bar = $('#vol-bar');
  const legend = $('#vol-legend');
  legend.innerHTML = '';

  /* Segments are matched by label and updated in place. Rebuilding them meant
     every poll that moved a byte replayed the whole staggered sweep from zero,
     which reads as a flicker rather than as an update. The sweep is an
     entrance — it belongs to a segment appearing, not to it changing. */
  const seen = new Set();
  segs.forEach((s, i) => {
    seen.add(s.label);
    let seg = bar.querySelector(`.vol-seg[data-key="${CSS.escape(s.label)}"]`);
    const fresh = !seg;
    if (fresh) {
      seg = el('div', 'vol-seg');
      seg.dataset.key = s.label;
      bar.appendChild(seg);
    }
    seg.style.background = s.color;
    seg.title = `${s.label} — ${sizeText(s.bytes)}`;
    // ~/.Trash lives inside one of these segments; remember which, so the band
    // can be drawn at that segment's own edge instead of guessing at pixels.
    if (s.path && S.home && (S.home + '/').startsWith(s.path.replace(/\/?$/, '/'))) {
      seg.dataset.holdsTrash = String(s.bytes);
    } else {
      delete seg.dataset.holdsTrash;
    }

    const width = `${(s.bytes / total) * 100}%`;
    if (fresh) {
      requestAnimationFrame(() => setTimeout(() => { seg.style.width = width; }, 40 + i * 45));
    } else {
      seg.style.width = width;      // the CSS transition eases it from where it was
    }

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

  // A folder that shrank out of the top six leaves its bar behind otherwise.
  bar.querySelectorAll('.vol-seg').forEach((seg) => {
    if (!seen.has(seg.dataset.key)) seg.remove();
  });
  $('#vol-bar .vol-shimmer')?.remove();

  if (S.trash?.bytes) {
    const b = el('button');
    b.style.color = 'var(--danger)';
    b.appendChild(el('i', 'stripe'));
    const name = el('span', null, 'In Trash');
    name.style.color = 'var(--text-2)';
    b.appendChild(name);
    b.appendChild(el('b', null, sizeText(S.trash.bytes)));
    b.title = 'Counted inside the segments above — emptying the Trash frees it';
    b.onclick = () => $('#trash-strip').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    legend.appendChild(b);
  }

  $('#vol-used').textContent = sizeText(S.volume.used);
  $('#foot-left').textContent = `${sizeText(S.volume.free)} free`;
  drawTrashBand();
}

/* Drawn at the trailing edge of whichever segment actually contains ~/.Trash —
   normally Users. Anchoring it to the end of *used* instead put it over the
   system-and-snapshots chunk, which is the one place those bytes are not. */
function drawTrashBand() {
  const bar = $('#vol-bar');
  const total = S.volume?.total;
  const bytes = S.trash?.bytes || 0;
  let band = document.getElementById('vol-trash');
  const host = bar?.querySelector('.vol-seg[data-holds-trash]');
  if (!total || !bytes || !host) { if (band) band.remove(); return; }
  if (!band || band.parentElement !== host) {
    if (band) band.remove();
    band = el('div', 'vol-trash');
    band.id = 'vol-trash';
    host.appendChild(band);
  }
  // As a share of its host segment, so it rides that segment's own animation
  // and stays correct however the bar is scaled.
  const hostBytes = Number(host.dataset.holdsTrash) || bytes;
  band.style.width = `${Math.min(100, (bytes / hostBytes) * 100)}%`;
  band.title = `${S.trash.partial ? 'At least ' : ''}${sizeText(bytes)} in the Trash — `
    + 'emptying it turns this into free space';
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
  S.selected = opts.select || null;
  closeSheet();          // the panel described a row in the folder we just left
  syncNavButtons();
  syncJumps();
  const listed = reload();
  // Landing in the right folder and leaving you to find the file yourself is
  // only half the jump. The row cannot be scrolled to until it exists, which
  // is after the listing comes back.
  if (opts.select) {
    listed.then(() => {
      document.querySelector(`#rows .row[data-path="${CSS.escape(opts.select)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
}

function syncNavButtons() {
  $('#btn-back').disabled = S.hIndex <= 0;
  $('#btn-fwd').disabled = S.hIndex >= S.history.length - 1;
}

function goBack() {
  if (S.hIndex <= 0) return;
  S.hIndex--;
  S.path = S.history[S.hIndex];
  S.selected = null;
  closeSheet();
  syncNavButtons();
  reload();
}
function goForward() {
  if (S.hIndex >= S.history.length - 1) return;
  S.hIndex++;
  S.path = S.history[S.hIndex];
  S.selected = null;
  closeSheet();
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
  // Deep paths overflow: keep the folder you are actually in on screen.
  wrap.scrollLeft = wrap.scrollWidth;
  // …and the left-edge fade only exists to say that something is off-screen,
  // so it follows the scroll rather than being painted on every path.
  const syncFade = () => wrap.classList.toggle('scrolled', wrap.scrollLeft > 1);
  wrap.onscroll = syncFade;
  syncFade();
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

  // The tiles about to be thrown away are still observed; drop them before the
  // new ones register or the observer keeps every detached row alive.
  if (thumbObserver) thumbObserver.disconnect();
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
    // A folder we were refused is not an empty folder — ~/.Trash reads exactly
    // like this without Full Disk Access, and saying "empty" would be a lie.
    const denied = S.listing?.error && /denied|not permitted/i.test(S.listing.error);
    $('#empty-text').textContent = denied
      ? `macOS won’t let this folder be read — ${S.hostApp || 'the terminal running serve.py'} needs Full Disk Access`
      : S.listing?.error ? `Can’t read this folder — ${S.listing.error}`
        : S.query ? `No match for “${S.query}”`
          : S.minSize ? 'Nothing above that size here' : 'This folder is empty';
    $('#empty-act').classList.toggle('hidden', !denied);
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
  row.dataset.i = i;
  row.tabIndex = 0;
  if (e.dir) row.classList.add('drillable');
  if (S.selected === e.path) row.classList.add('sel');
  if (S.marked.has(e.path)) row.classList.add('marked');

  // Any row can be dragged to the tray; dragging one of a marked set takes the
  // whole set, which is what makes "select a dozen, throw them in" work.
  row.draggable = true;
  row.ondragstart = (ev) => {
    const batch = S.marked.has(e.path) ? [...S.marked] : [e.path];
    ev.dataTransfer.effectAllowed = 'copy';
    ev.dataTransfer.setData('text/plain', batch.join('\n'));
    dragPayload = batch;
    document.body.classList.add('dragging');
  };
  row.ondragend = () => {
    dragPayload = null;
    document.body.classList.remove('dragging');
  };

  const tile = el('div', 'tile');
  tile.appendChild(Object.assign(el('span', 'ms'), { textContent: kind.icon }));
  if (S.thumbs && e.thumb) wantThumb(tile, e);
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
  // No Reveal and no Details button: double-clicking a row already reveals it,
  // and selecting one already opens the panel. Space reveals whatever is
  // selected, which is how a folder still gets there.
  if (!e.dir) {
    acts.appendChild(iconAct('library_add', 'Add to project', (ev) => {
      ev.stopPropagation();
      addToProject(S.marked.has(e.path) ? [...S.marked] : [e.path]);
    }));
    if (S.mergeReady && VIDEO_RE.test(e.name)) {
      acts.appendChild(iconAct('smart_display', 'Upload to YouTube', (ev) => {
        ev.stopPropagation();
        openMerge(S.marked.has(e.path) ? [...S.marked] : [e.path]);
      }));
    }
  }
  const trash = iconAct('delete', `Move ${e.name} to Trash`, (ev) => {
    ev.stopPropagation();
    rowTrash(e, trash);
  });
  trash.classList.add('danger');
  acts.appendChild(trash);
  // Arming then confirming the trash button IS a double click, and dblclick is a
  // separate event — stopPropagation on the click never sees it, so the row's
  // own dblclick would fire Reveal (or open the folder) underneath.
  acts.ondblclick = (ev) => ev.stopPropagation();
  row.appendChild(acts);

  const chev = el('div', 'row-chev');
  if (e.dir) chev.appendChild(Object.assign(el('span', 'ms'), { textContent: 'chevron_right' }));
  else chev.style.width = '18px';
  row.appendChild(chev);

  row.onclick = (ev) => {
    if (ev.metaKey || ev.ctrlKey) return markToggle(e);
    if (ev.shiftKey) return markRange(e);
    // A plain click is where the next shift-range will start from.
    S.marked.clear();
    setAnchor(e.path, false);
    syncMarks();
    if (e.dir) { S.selected = e.path; return navigate(e.path); }
    select(e);
  };
  row.ondblclick = () => { if (!e.dir) reveal(e.path); };
  return row;
}

/* Moving the selection must not rebuild 400 rows — swap the class in place and
   let the panel follow. That is what makes holding ↓ feel like a list and not
   like a re-render. */
function select(entry) {
  S.selected = entry.path;
  let node = null;
  $$('#rows .row').forEach((r) => {
    const on = r.dataset.path === S.selected;
    r.classList.toggle('sel', on);
    if (on) node = r;
  });
  // Focus follows the selection. Clicking a row focuses it, and the first key
  // press then makes Chrome decide the ring should be visible — so without this
  // the ring stays on the row you clicked while the highlight walks away from
  // it, and two different rows look current.
  node?.focus({ preventScroll: true });
  openSheet(entry);
}

/* ── multi-select ───────────────────────────────────────────────────────── */

/* A second, coarser selection than S.selected: that one drives the inspector
   and only ever holds one row, this one is the batch you are about to send
   somewhere. ⌘-click toggles, shift-click takes the run in between. */

let dragPayload = null;

/* Shift extends from the anchor, and the anchor moves on any plain or ⌘ click —
   including a plain click, which is the one that used to leave it unset so the
   first shift-click had nothing to reach back to.
   `markBase` is what was selected when the anchor was placed, so shifting again
   REPLACES the run instead of piling ranges on top of each other. Without it,
   shifting down and then back up leaves both runs marked. */
function setAnchor(path, keepExisting) {
  S.anchor = path;
  S.markBase = new Set(keepExisting ? S.marked : []);
}

function markToggle(entry) {
  if (S.marked.has(entry.path)) S.marked.delete(entry.path);
  else S.marked.add(entry.path);
  setAnchor(entry.path, true);
  syncMarks();
}

function markRange(entry) {
  const list = visibleEntries().slice(0, S.limit);
  const to = list.findIndex((e) => e.path === entry.path);
  if (to < 0) return;
  const from = S.anchor ? list.findIndex((e) => e.path === S.anchor) : -1;
  if (from < 0) {
    S.marked.add(entry.path);
    setAnchor(entry.path, true);
    return syncMarks();
  }
  // Direction is irrelevant once both ends are indices.
  const [a, b] = from < to ? [from, to] : [to, from];
  const next = new Set(S.markBase);
  for (let i = a; i <= b; i++) if (!list[i].dir) next.add(list[i].path);
  S.marked = next;
  syncMarks();
}

function syncMarks() {
  $$('#rows .row').forEach((r) => r.classList.toggle('marked', S.marked.has(r.dataset.path)));
  const n = S.marked.size;
  $('#list-mark').classList.toggle('hidden', !n);
  $('#list-mark-text').textContent = `${fmtCount(n)} selected`;
  // The button says what it will take. One click sends a batch to the Trash, so
  // the size has to be on the button, not in a dialog after the fact.
  const bytes = markedBytes();
  $('#mark-trash').textContent = bytes ? `Trash · ${sizeText(bytes)}` : 'Trash';
  if (n) drawTray();
}

const markedBytes = () =>
  [...S.marked].reduce((a, p) => a + (S.entries.find((e) => e.path === p)?.size || 0), 0);

async function trashMarked() {
  const paths = [...S.marked];
  if (!paths.length) return;
  const bytes = markedBytes();
  const btn = $('#mark-trash');
  btn.disabled = true;
  btn.textContent = 'Trashing…';
  try {
    const res = await api('/api/trash-many', { paths });
    bumpTrash(res.freed, res.trash);
    // Drop them locally first so the list settles before the refetch.
    const gone = new Set(paths);
    S.entries = S.entries.filter((e) => !gone.has(e.path));
    clearMarks();
    render();
    reload();
    toast(res.failed?.length
      ? `Trashed ${fmtCount(res.trashed)} of ${fmtCount(res.requested)} — ${res.failed[0]}`
      : `${fmtCount(res.trashed)} → Trash · ${sizeText(bytes)} reclaimable`,
    !!res.failed?.length, 'delete');
  } catch (err) {
    toast(`Trash failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    syncMarks();
  }
}

function clearMarks() {
  S.marked.clear();
  S.anchor = null;
  S.markBase = new Set();
  syncMarks();
}

/* ── projects ───────────────────────────────────────────────────────────── */

async function loadProjects(pickId) {
  let res;
  try { res = await api('/api/projects'); } catch { return; }
  S.ffmpeg = res.ffmpeg;
  S.mergeReady = res.merge;
  $('#mark-merge').classList.toggle('hidden', !res.merge);
  S.projects = res.projects || [];
  const want = pickId || S.project?.id || localStorage.getItem('diskscope:project');
  const found = S.projects.find((p) => p.id === want) || S.projects[0];
  if (found) await openProject(found.id);
  else { S.project = null; drawTray(); drawProjects(); }
}

async function openProject(id) {
  try {
    S.project = await api(`/api/project?id=${encodeURIComponent(id)}`);
    localStorage.setItem('diskscope:project', id);
  } catch {
    // The remembered project is gone — deleted here or elsewhere. Forget it and
    // fall back to another, rather than leaving the whole panel blank because
    // of a stale id in localStorage.
    S.project = null;
    localStorage.removeItem('diskscope:project');
    S.projects = (S.projects || []).filter((p) => p.id !== id);
    if (S.projects.length) return openProject(S.projects[0].id);
  }
  drawTray();
  drawProjects();
}

async function refreshProject() {
  // Refetch the list too: clip counts and durations on the cards go stale the
  // moment anything is edited.
  if (S.project) await loadProjects(S.project.id);
}

async function newProject(name) {
  const p = await api('/api/project-new', { name: name || `Project ${(S.projects?.length || 0) + 1}` });
  await loadProjects(p.id);
  toast(`Created “${p.name}”`, false, 'movie_edit');
  return p;
}

/* Both routes into a project — the drop and the row button — land here. */
async function addToProject(paths) {
  if (!paths || !paths.length) return;
  if (!S.ffmpeg) {
    return toast('ffmpeg isn’t on PATH — install it with: brew install ffmpeg', true);
  }
  if (!S.project) await newProject();
  if (!S.project) return;
  const label = paths.length === 1 ? baseName(paths[0]) : `${paths.length} files`;
  toast(`Reading ${label}…`, false, 'hourglass_top');
  try {
    const res = await api('/api/project-add', { id: S.project.id, paths });
    await refreshProject();
    const n = res.added.length;
    const bad = res.skipped.length;
    toast(
      n ? `Added ${fmtCount(n)} to “${S.project.name}”${bad ? ` · ${bad} skipped` : ''}`
        : bad ? `Nothing added — ${bad} not readable by ffmpeg` : 'Already in the project',
      !n, n ? 'library_add' : 'error');
    clearMarks();
  } catch (err) { toast(`Could not add: ${err.message}`, true); }
}

/* A project is a thing you come back to over days — it needs somewhere it can
   be seen, not just a dock in the corner that only exists while one is open. */
function drawProjects() {
  const card = $('#projects-card');
  const list = S.projects || [];
  card.classList.toggle('hidden', !list.length);
  if (!list.length) return;

  const total = list.reduce((a, p) => a + (p.duration || 0), 0);
  $('#projects-meta').textContent =
    `${fmtCount(list.length)} project${list.length === 1 ? '' : 's'}` +
    (total ? ` · ${clock(total)} cut` : '');

  const row = $('#projects-row');
  row.innerHTML = '';
  list.forEach((p) => {
    const card2 = el('div', `proj${p.id === S.project?.id ? ' on' : ''}`);
    card2.onclick = () => openProject(p.id);

    const shot = el('div', 'proj-shot');
    if (p.poster) {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = `/thumb/${encodeURIComponent(TOKEN)}/${b64Path(p.poster)}?v=${p.created || 0}`;
      img.onerror = () => img.remove();
      shot.appendChild(img);
    }
    shot.appendChild(Object.assign(el('span', 'ms'), { textContent: 'movie_edit' }));
    card2.appendChild(shot);

    const body = el('div', 'proj-body');
    body.appendChild(el('div', 'proj-name', p.name));
    body.appendChild(el('div', 'proj-meta',
      p.clips
        ? `${fmtCount(p.clips)} clip${p.clips === 1 ? '' : 's'} · ${clock(p.duration)}`
        : `${fmtCount(p.assets)} in the bin · not cut yet`));
    body.appendChild(el('div', 'proj-when', `edited ${relAge(Math.max(0, (Date.now() / 1000) - (p.updated || 0)))} ago`));

    card2.appendChild(body);

    const acts = el('div', 'proj-acts');
    const act = (icon, title, fn) => {
      const b = el('button', 'row-act');
      b.title = title;
      b.appendChild(Object.assign(el('span', 'ms'), { textContent: icon }));
      b.onclick = async (ev) => {
        ev.stopPropagation();
        if (p.id !== S.project?.id) await openProject(p.id);
        fn();
      };
      acts.appendChild(b);
    };
    act('auto_awesome', 'Auto clip', openAuto);
    act('rate_review', 'Review', () => openReview());
    act('movie_edit', 'Open in the editor', () => openEditor());
    const del = el('button', 'row-act danger');
    del.title = 'Delete this project';
    del.appendChild(Object.assign(el('span', 'ms'), { textContent: 'delete' }));
    del.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Delete “${p.name}”?\n\nYour footage is not touched — only the edit.`)) return;
      await api('/api/project-delete', { id: p.id });
      if (S.project?.id === p.id) S.project = null;
      loadProjects();
    };
    acts.appendChild(del);
    card2.appendChild(acts);

    // An export is the point of a project, so the card says whether one exists
    // and walks you to it. It gets its own row rather than a line in the body:
    // beside the action icons there is only room for "Exported ·…". The server
    // reports exports that are still on disk, so this never points at nothing.
    if (p.export) {
      const ex = el('button', 'proj-export');
      ex.title = `${p.export.path}\n\nShow it in the file list`;
      ex.appendChild(Object.assign(el('span', 'ms'), { textContent: 'movie' }));
      ex.appendChild(el('span', null,
        `Exported · ${sizeText(p.export.bytes)} · ${relAge(Math.max(0, (Date.now() / 1000) - (p.export.at || 0)))} ago`));
      ex.appendChild(Object.assign(el('span', 'ms go'), { textContent: 'arrow_forward' }));
      ex.onclick = (ev) => { ev.stopPropagation(); goToExport(p.export); };
      card2.appendChild(ex);
    }
    row.appendChild(card2);
  });

  const add = el('button', 'proj new');
  add.appendChild(Object.assign(el('span', 'ms'), { textContent: 'add' }));
  add.appendChild(el('span', null, 'New project'));
  add.onclick = () => {
    const name = prompt('Project name', `Project ${(S.projects?.length || 0) + 1}`);
    if (name !== null) newProject(name.trim() || undefined);
  };
  row.appendChild(add);
}

/* Walk to the exported file inside diskscope itself — this is a file browser,
   so being handed off to Finder to answer "where did it go" is an admission of
   defeat. Only possible when the export sits inside whatever was scanned;
   outside that there is no listing to walk to, and Finder is the honest
   fallback rather than a dead button. */
function goToExport(ex) {
  const dir = parentOf(ex.path);
  const inRoot = dir === S.root || dir.startsWith(S.root === '/' ? '/' : `${S.root}/`);
  if (!inRoot) return reveal(ex.path);
  if (S.view !== 'list') setView('list');
  navigate(dir, { select: ex.path });
}

function drawTray() {
  const tray = $('#tray');
  const p = S.project;
  tray.classList.toggle('hidden', !p && !S.marked.size);
  if (!p) {
    $('#tray-name-text').textContent = 'No project';
    $('#tray-meta').textContent = '';
    $('#tray-assets').innerHTML = '';
    $('#tray-hint').classList.remove('hidden');
    return;
  }
  $('#tray-name-text').textContent = p.name;
  const secs = (p.clips || []).reduce((a, c) => a + Math.max(0, c.out - c.in), 0);
  $('#tray-meta').textContent =
    `${fmtCount(p.assets.length)} asset${p.assets.length === 1 ? '' : 's'}` +
    (p.clips.length ? ` · ${p.clips.length} clip${p.clips.length === 1 ? '' : 's'} · ${clock(secs)}` : '');

  const wrap = $('#tray-assets');
  wrap.innerHTML = '';
  $('#tray-hint').classList.toggle('hidden', p.assets.length > 0);
  p.assets.forEach((a) => {
    const card = el('div', `tray-card${a.missing ? ' gone' : ''}`);
    card.title = `${a.name}\n${a.w}×${a.h} · ${clock(a.dur)}`;
    const img = el('img');
    img.alt = '';
    img.src = `/thumb/${encodeURIComponent(TOKEN)}/${b64Path(a.path)}?v=${a.added}`;
    img.onerror = () => img.remove();
    card.appendChild(img);
    card.appendChild(el('span', 'tray-dur', a.still ? 'still' : clock(a.dur)));
    const x = el('button', 'tray-x');
    x.appendChild(Object.assign(el('span', 'ms'), { textContent: 'close' }));
    x.title = 'Remove from project';
    x.onclick = async (ev) => {
      ev.stopPropagation();
      await api('/api/project-remove-asset', { id: p.id, asset: a.id });
      refreshProject();
    };
    card.appendChild(x);
    card.onclick = () => openEditor(a.id);
    wrap.appendChild(card);
  });
}

const clock = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${(r < 10 ? '0' : '')}${r.toFixed(r < 10 ? 1 : 0).replace(/\.0$/, '')}`;
};

function trayMenu() {
  const menu = $('#tray-menu');
  menu.innerHTML = '';
  (S.projects || []).forEach((p) => {
    const b = el('button', p.id === S.project?.id ? 'on' : '');
    b.appendChild(el('span', null, p.name));
    b.appendChild(el('span', 'ms tick', 'check'));
    b.onclick = () => { menu.classList.remove('open'); openProject(p.id); };
    menu.appendChild(b);
  });
  if (S.projects?.length) menu.appendChild(el('div', 'menu-sep'));
  const add = el('button', null, 'New project…');
  add.onclick = () => {
    menu.classList.remove('open');
    const name = prompt('Project name', `Project ${(S.projects?.length || 0) + 1}`);
    if (name !== null) newProject(name.trim() || undefined);
  };
  menu.appendChild(add);
  if (S.project) {
    const del = el('button', null, `Delete “${S.project.name}”`);
    del.style.color = 'var(--danger)';
    del.onclick = async () => {
      menu.classList.remove('open');
      if (!confirm(`Delete the project “${S.project.name}”?\n\nYour footage is not touched.`)) return;
      await api('/api/project-delete', { id: S.project.id });
      S.project = null;
      localStorage.removeItem('diskscope:project');
      loadProjects();
    };
    menu.appendChild(del);
  }
  menu.classList.toggle('open');
}

/* ── merge & upload ─────────────────────────────────────────────────────── */

/* The encode/concat/upload pipeline is camera01-archive/merge-upload.sh — this
   is only a way to point it at a selection and watch it without a terminal. */

const VIDEO_RE = /\.(mp4|mov|m4v|mkv|avi|insv|lrv|lrf|mts|m2ts|3gp|mpg|mpeg|wmv|flv)$/i;
const M = {
  paths: [], privacy: 'unlisted', upload: true, sort: true, trashAfter: false,
  // Re-encoding a file that is already 1080p H.264 costs minutes and a
  // generation of quality for nothing, so this answers itself from a probe
  // rather than making you know the answer. `why` is what it found.
  encode: true, why: '',
};

/* `which` is an explicit list of paths, or nothing to mean "whatever is
   selected". Guarded because wiring this straight to onclick hands it a
   MouseEvent, which is not a list and has no .filter. */
function openMerge(which) {
  const from = Array.isArray(which) ? which : [...S.marked];
  const paths = from.filter((p) => VIDEO_RE.test(p));
  if (!paths.length) return toast('Select some video files first', true, 'movie_filter');
  if (!S.mergeReady) {
    return toast('camera01-archive/merge-upload.sh isn’t where diskscope expects it', true);
  }
  // Sorted the same way the script will sort them, so the list you approve is
  // the order that gets rendered.
  M.paths = [...paths].sort(byDigits);
  M.upload = true;
  M.sort = true;
  M.trashAfter = false;
  // Assume an encode until the probe comes back, so a slow ffprobe can never
  // leave the dialog offering to skip work it hasn't checked.
  M.encode = true;
  M.why = 'checking…';

  // One clip is not a merge — it is an upload, and saying "Merge" over a single
  // file just makes you wonder what it is merging with.
  const one = M.paths.length === 1;
  $('#merge-box').classList.toggle('single', one);
  $('#merge-head-title').textContent = one ? 'Upload to YouTube' : 'Merge & Upload';
  $('#merge-go-label').textContent = one ? 'Upload' : 'Start';

  // Sizes are what the listing knows; the true running time is ffprobe's answer
  // and the job reports it once the pipeline has actually looked.
  const bytes = M.paths.reduce((a, p) => a + (S.entries.find((e) => e.path === p)?.size || 0), 0);
  $('#merge-sum').textContent = (one ? baseName(M.paths[0]) :
    `${fmtCount(M.paths.length)} clips`) +
    (bytes ? ` · ${sizeText(bytes)}` : '') + ` · from ${shortPath(parentOf(M.paths[0]))}`;
  $('#merge-title').value = suggestTitle(M.paths);
  drawMergeList();
  syncMergeToggles();
  $('#merge-scrim').classList.add('on');
  $('#merge-box').classList.add('on');
  setTimeout(() => $('#merge-title').select(), 60);
  checkEncode(M.paths);
}

/* Late answers are dropped: open the dialog on one clip, close it, open it on
   another, and the first probe must not land on the second selection. */
let encodeSeq = 0;
async function checkEncode(paths) {
  const seq = ++encodeSeq;
  let res;
  try { res = await api('/api/merge-check', { paths }); } catch { res = null; }
  if (seq !== encodeSeq) return;
  M.encode = !(res && res.ok);
  M.why = res ? res.why : 'could not check — encoding to be safe';
  syncMergeToggles();
}

const parentOf = (p) => p.slice(0, p.lastIndexOf('/'));
const byDigits = (a, b) =>
  (baseName(a).replace(/\D/g, '') || '').localeCompare(baseName(b).replace(/\D/g, '') || '');

/* A first guess from the folder, since that is usually the day or the outing. */
function suggestTitle(paths) {
  const dated = () => {
    const stamp = baseName(paths[0]).match(/(20\d{2})(\d{2})(\d{2})/);
    if (!stamp) return null;
    const d = new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T12:00:00`);
    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  };
  // For one clip the date it was shot beats the folder it happens to sit in.
  if (paths.length === 1) return dated() || baseName(paths[0]).replace(/\.[^.]+$/, '');
  const folder = baseName(parentOf(paths[0]));
  if (folder && !/^\d{4}-\d{2}-\d{2}$/.test(folder) && folder !== 'untitled folder') return folder;
  return dated() || folder || 'Merged clips';
}

function drawMergeList() {
  const list = $('#merge-list');
  list.innerHTML = '';
  M.paths.forEach((p) => {
    const li = el('li');
    li.appendChild(el('span', 'merge-n', ''));
    li.appendChild(el('span', null, baseName(p)));
    list.appendChild(li);
  });
}

function syncMergeToggles() {
  $$('#merge-privacy button').forEach((b) => b.classList.toggle('on', b.dataset.p === M.privacy));
  $('#merge-upload-toggle').classList.toggle('on', M.upload);
  $('#merge-upload-toggle').lastElementChild.textContent =
    M.upload ? 'Upload to YouTube when it’s merged' : 'Render only — don’t upload';
  const enc = $('#merge-encode-toggle');
  enc.classList.toggle('on', M.encode);
  enc.lastElementChild.textContent = M.encode
    ? `Re-encode to 1080p first${M.why ? ` — ${M.why}` : ''}`
    : `Upload as-is, no re-encode — ${M.why}`;

  $('#merge-sort-toggle').classList.toggle('on', M.sort);
  $('#merge-sort-toggle').lastElementChild.textContent =
    M.sort ? 'Order chronologically by filename' : 'Keep the order shown';

  // Deleting the source only makes sense once YouTube has it, so this follows
  // the upload toggle and is worded as what it will do, not as a setting.
  const trash = $('#merge-trash-toggle');
  const n = M.paths.length;
  trash.classList.toggle('on', M.trashAfter && M.upload);
  trash.classList.toggle('armed', M.trashAfter && M.upload);
  trash.lastElementChild.textContent = !M.upload
    ? 'Nothing to delete — not uploading'
    : M.trashAfter
      ? `Trash the ${n === 1 ? 'source clip' : n + ' source clips'} once the link is live`
      : `Keep the source${n === 1 ? '' : 's'} after uploading`;
  trash.style.opacity = M.upload ? '1' : '0.4';
  trash.style.pointerEvents = M.upload ? '' : 'none';

  $('#merge-privacy').style.opacity = M.upload ? '1' : '0.4';
  $('#merge-privacy').style.pointerEvents = M.upload ? '' : 'none';
}

function closeMerge() {
  $('#merge-scrim').classList.remove('on');
  $('#merge-box').classList.remove('on');
}

async function startMerge() {
  const title = $('#merge-title').value.trim();
  if (!title) { $('#merge-title').focus(); return toast('It needs a title', true); }
  try {
    await api('/api/merge', {
      paths: M.paths, title, privacy: M.privacy, upload: M.upload, sort: M.sort,
      trashAfter: M.trashAfter, encode: M.encode,
    });
    closeMerge();
    clearMarks();
    toast(`Started “${title}” — progress is bottom left`, false, 'rocket_launch');
    pollJobs(true);
  } catch (err) { toast(`Could not start: ${err.message}`, true); }
}

/* ── job progress ───────────────────────────────────────────────────────── */

/* Anything that takes minutes shows a real percentage and an ETA, never a
   spinner — ffmpeg reports its position, so there is no excuse not to. */
let jobTimer = null;
const dismissedJobs = new Set();

async function pollJobs(fast) {
  clearTimeout(jobTimer);
  let res;
  try { res = await api('/api/jobs'); } catch { jobTimer = setTimeout(pollJobs, 3000); return; }
  const jobs = (res.jobs || []).filter((j) => !dismissedJobs.has(j.id));
  drawJobs(jobs);
  const busy = jobs.some((j) => j.state === 'running');
  if (busy || fast) jobTimer = setTimeout(() => pollJobs(busy), busy ? 700 : 2500);
}

/* Cards are patched in place, never rebuilt. Throwing the list away and
   recreating it on every poll replayed each card's entrance animation twice a
   second, which is the blinking. */
function drawJobs(jobs) {
  const wrap = $('#jobs');
  const alive = new Set(jobs.map((j) => j.id));
  [...wrap.children].forEach((c) => { if (!alive.has(c.dataset.id)) c.remove(); });

  jobs.forEach((j) => {
    const existing = wrap.querySelector(`.job[data-id="${j.id}"]`);
    if (existing && existing.dataset.state === j.state) return patchJob(existing, j);
    const card = buildJob(j);
    if (existing) existing.replaceWith(card);
    else wrap.appendChild(card);
    // The project card carries the export, so it has to hear about it the
    // moment there is one. This only runs on a state change — patchJob takes
    // the other polls — so it fires once per finished export.
    if (j.kind === 'export' && j.state === 'done') refreshProject();
    // A job that failed or was called off has said everything it has to say.
    // Let it go on its own instead of making you sweep up after it. Finished
    // ones stay, because they carry the link and the Reveal button.
    if (j.state === 'error' || j.state === 'cancelled') {
      setTimeout(() => {
        dismissedJobs.add(j.id);
        card.classList.add('going');
        setTimeout(() => card.remove(), 260);
      }, 5000);
    }
  });
}

/* Only the numbers move between polls. */
function patchJob(card, j) {
  card.querySelector('.job-label').textContent = j.label;
  card.querySelector('.job-bar i').style.width = `${j.state === 'done' ? 100 : j.percent}%`;
  if (j.state === 'running') {
    const spans = card.querySelectorAll('.job-foot > span');
    if (spans[0]) spans[0].textContent = `${j.percent.toFixed(0)}%`;
    if (spans[1]) spans[1].textContent = j.eta != null ? `${clock(j.eta)} left` : 'estimating…';
  }
}

function buildJob(j) {
  const card = el('div', `job ${j.state}`);
  card.dataset.id = j.id;
  card.dataset.state = j.state;
  const top = el('div', 'job-top');
  top.appendChild(Object.assign(el('span', 'ms'), {
    textContent: j.state === 'done' ? 'check_circle'
      : j.state === 'error' ? 'error'
        : j.kind === 'merge' ? 'movie_filter' : 'movie',
  }));
  top.appendChild(el('span', 'job-label', j.label));
  // Running: cancel. Finished: dismiss — a card that has said its piece and
  // cannot be got rid of is just clutter sitting over the page.
  // Different jobs, different buttons. One stops work in progress, the other
  // tidies away a card that has finished talking — showing the same × for both
  // is how four running exports got cancelled by someone clearing the pile.
  const running = j.state === 'running';
  const x = el('button', `job-x${running ? ' stop' : ''}`);
  x.appendChild(Object.assign(el('span', 'ms'), {
    textContent: running ? 'stop_circle' : 'close',
  }));
  x.title = running ? 'Stop this render' : 'Dismiss';
  x.onclick = () => {
    if (running) api('/api/job-cancel', { id: j.id }).then(() => pollJobs(true));
    else { dismissedJobs.add(j.id); card.remove(); }
  };
  top.appendChild(x);
  card.appendChild(top);

  const bar = el('div', 'job-bar');
  const fill = el('i');
  fill.style.width = `${j.state === 'done' ? 100 : j.percent}%`;
  bar.appendChild(fill);
  card.appendChild(bar);

  const foot = el('div', 'job-foot');
  if (j.state === 'running') {
    foot.appendChild(el('span', null, `${j.percent.toFixed(0)}%`));
    foot.appendChild(el('span', null,
      j.eta != null ? `${clock(j.eta)} left` : 'estimating…'));
  } else if (j.state === 'done') {
    foot.appendChild(el('span', null, `Done in ${clock(j.elapsed)}`));
    const acts = el('span', 'job-acts');
    if (j.link) {
      // The whole point of the run — make it one click, and copyable.
      // A link is not a path: /api/open resolves against the filesystem and
      // refuses anything outside the scan root, so a youtu.be URL could never
      // have worked through it. The browser opens a URL by itself.
      const open = el('button', 'job-link', 'Open on YouTube');
      open.onclick = () => window.open(j.link, '_blank', 'noopener');
      acts.appendChild(open);
      const copy = el('button', 'job-link', 'Copy link');
      copy.onclick = async () => {
        await navigator.clipboard.writeText(j.link);
        toast('YouTube link copied', false, 'content_copy');
      };
      acts.appendChild(copy);
    }
    if (j.output) {
      const b = el('button', 'job-link', 'Reveal');
      b.onclick = () => reveal(j.output);
      acts.appendChild(b);
    }
    foot.appendChild(acts);
  } else {
    foot.appendChild(el('span', null, j.error || j.state));
  }
  card.appendChild(foot);
  return card;
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

/* ── thumbnails ─────────────────────────────────────────────────────────── */

/* Quick Look does the rendering on the Python side; the only decision here is
   *when* to ask. A folder holding 400 clips must not fire 400 requests the
   moment it draws, so a row asks only once it is actually near the viewport —
   and a file Quick Look has already refused is never asked about twice. */

const thumbFailed = new Set();
const thumbSeen = new Set();
let thumbObserver = null;

/* mtime rides along as ?v= so an edited file lands on a different URL and the
   browser can cache the rest — re-rendering the list rebuilds every <img>. */
const thumbUrl = (e) =>
  `/thumb/${encodeURIComponent(TOKEN)}/${b64Path(e.path)}?v=${e.mtime || 0}`;

function wantThumb(tile, entry) {
  if (thumbFailed.has(entry.path)) return;
  tile.classList.add('thumbing');
  tile.__entry = entry;
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver((items) => {
      items.forEach((it) => {
        if (!it.isIntersecting) return;
        thumbObserver.unobserve(it.target);
        loadThumb(it.target);
      });
    }, { rootMargin: '400px 0px' });
  }
  thumbObserver.observe(tile);
}

function loadThumb(tile) {
  const entry = tile.__entry;
  if (!entry || thumbFailed.has(entry.path)) return;
  const img = el('img');
  img.alt = '';
  img.decoding = 'async';
  // Arrow-keying down the list re-renders every row. A thumbnail already in the
  // browser cache should just be there — fading it in again reads as a flicker.
  if (thumbSeen.has(entry.path)) tile.classList.add('shot', 'instant');
  img.onload = () => {
    thumbSeen.add(entry.path);
    // A tall frame in a 16:9 box loses most of its height to the crop. Centring
    // that would show a document's middle and a vertical clip's midriff — the
    // top is where the title and the faces are.
    if (img.naturalHeight > img.naturalWidth) img.style.objectPosition = 'center top';
    tile.classList.add('shot');
  };
  img.onerror = () => {
    // Nothing Quick Look can draw — keep the kind icon, and stop asking.
    thumbFailed.add(entry.path);
    thumbSeen.delete(entry.path);
    img.remove();
    tile.classList.remove('thumbing', 'shot', 'instant');
  };
  img.src = thumbUrl(entry);
  tile.appendChild(img);
}

/* ── player ─────────────────────────────────────────────────────────────── */

/* Media goes through /media/<token>/<base64url-path> rather than a query
   string. Chrome hands <video src> to the network service, and a URL carrying
   ?token=…&path=… gets dropped by privacy extensions before it reaches the
   socket — the request simply never arrives and the player sits on `stalled`
   forever with no error to catch. A plain path segment always survives. */
function b64Path(path) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(path)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fileUrl(path) {
  return `/media/${encodeURIComponent(TOKEN)}/${b64Path(path)}`;
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
    if (compact) {
      // Selecting a row starts the clip. Muted by default — arrowing down a
      // folder of thirty videos should not shout — but the moment you unmute
      // one, every later selection keeps the sound.
      v.autoplay = true;
      v.loop = true;
      v.muted = S.previewMuted;

      let forced = false;
      v.onvolumechange = () => {
        // Chrome's own fallback below also fires volumechange. Remembering that
        // as a preference would silently undo an unmute the user just made.
        if (forced) { forced = false; return; }
        if (v.muted === S.previewMuted) return;
        S.previewMuted = v.muted;
        savePrefs();
      };
      // The autoplay policy rejects the promise rather than throwing.
      v.play().catch(() => { forced = true; v.muted = true; v.play().catch(() => {}); });
    }
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
  const stage = $('#preview-stage');
  stage.innerHTML = '';
  if (!entry || entry.dir || !entry.preview) return;
  $('#sheet-preview').classList.remove('hidden');
  stage.appendChild(makePlayer(entry, true));
}

function openTheater(entry) {
  if (!entry || entry.dir || !entry.preview) return;
  S.theaterItem = entry;

  // Carry the playhead over so expanding mid-clip doesn't restart it.
  const small = $('#preview-stage').firstElementChild;
  const at = small && 'currentTime' in small ? small.currentTime : 0;
  const wasPlaying = small && 'paused' in small && !small.paused;
  const wasMuted = small && 'muted' in small ? small.muted : S.previewMuted;
  if (small && 'pause' in small) small.pause();

  const stage = $('#theater-stage');
  stage.innerHTML = '';
  const big = makePlayer(entry, false);
  if ('currentTime' in big) {
    big.muted = wasMuted;      // expanding a muted clip must not suddenly shout
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

let detailTimer = null;

/* Fills the docked panel. The text goes in synchronously so holding ↓ feels
   immediate; the expensive half — building a player and asking the server for
   ctime — waits for the selection to settle, or arrowing past a 17 GB clip
   would open a range request per keypress. */
function openSheet(entry) {
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

  // The panel carries every action the row does — losing the row's buttons to
  // decluttering shouldn't cost you the action itself.
  const canYt = !entry.dir && S.mergeReady && VIDEO_RE.test(entry.name);
  $('#act-yt').classList.toggle('hidden', !canYt);
  $('#act-proj').classList.toggle('hidden', !!entry.dir);
  $('#act-proj').classList.toggle('span', !canYt);

  dropPreview();
  $('#sheet').classList.add('on');

  clearTimeout(detailTimer);
  detailTimer = setTimeout(() => settleDetails(entry), 170);
}

async function settleDetails(entry) {
  if (S.sheetItem !== entry) return;
  fillPreview(entry);
  try {
    const info = await api(`/api/info?path=${encodeURIComponent(entry.path)}`);
    if (S.sheetItem !== entry) return;
    $('#sheet-ctime').textContent = fmtDateFull(info.ctime);
    if (info.size != null) $('#sheet-size').textContent = sizeText(info.size);
    if (info.items != null) $('#sheet-items').textContent = `${fmtCount(info.items)} items`;
  } catch { /* the row already shows everything essential */ }
}

/* Tear the media down rather than just hiding it, so Chrome drops the range
   request it is holding against a multi-gigabyte file. */
function dropPreview() {
  const stage = $('#preview-stage');
  const media = stage.firstElementChild;
  if (media && 'pause' in media) media.pause();
  if (media && 'src' in media) media.removeAttribute('src');
  stage.innerHTML = '';
  $('#sheet-preview').classList.add('hidden');
}

function closeSheet() {
  clearTimeout(detailTimer);
  $('#sheet').classList.remove('on');
  dropPreview();
  S.sheetItem = null;
}

/* One click trashes. The Trash is the undo — anything here is recoverable from
   Finder, so making you confirm twice would be ceremony for nothing. The
   irreversible step is Empty Trash, and that is where the confirmation lives.
   The lockout is the real hazard guard: without it a fast second click lands on
   whichever row slid up into that spot. */
let trashBusy = false;

async function rowTrash(entry, btn) {
  if (trashBusy) return;
  trashBusy = true;
  if (btn) btn.classList.add('going');
  try {
    const res = await api('/api/trash', { path: entry.path });
    bumpTrash(res.size ?? entry.size, res.trash);
    toast(`${entry.name} → Trash · ${sizeText(entry.size)} reclaimable`, false, 'delete');
    if (S.sheetItem && S.sheetItem.path === entry.path) closeSheet();
    // Drop it locally first so the list and its total settle before the refetch.
    S.entries = S.entries.filter((e) => e.path !== entry.path);
    render();
    reload();
  } catch (err) {
    if (btn) btn.classList.remove('going');
    toast(`Trash failed: ${err.message}`, true);
  } finally {
    setTimeout(() => { trashBusy = false; }, 320);
  }
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

/* A declaration, not a const: wire() runs before this line is reached, and a
   const would still be in its temporal dead zone. */
function doTrash() {
  if (S.sheetItem) rowTrash(S.sheetItem, null);
}

/* ── the Trash itself ───────────────────────────────────────────────────── */

/* Trashing frees nothing on its own — the bytes sit in ~/.Trash until it is
   emptied. So the strip shows what is waiting there, ticks up the instant you
   trash something, and the gauge above it moves for real once you empty. */
function bumpTrash(size, fromServer) {
  S.trash = fromServer
    || { bytes: (S.trash?.bytes || 0) + (size || 0), items: (S.trash?.items || 0) + 1 };
  drawTrash();
}

function drawTrash() {
  const strip = $('#trash-strip');
  const t = S.trash || { bytes: 0, items: 0 };
  strip.classList.toggle('hidden', !t.items && !t.bytes);
  drawTrashBand();          // the bar has to move the moment the number does
  if (!t.items && !t.bytes) return;
  const share = S.volume?.total ? (t.bytes / S.volume.total) * 100 : 0;
  // Without Full Disk Access the figure comes from Finder, which won't size
  // folders — say "at least" rather than quietly under-reporting.
  $('#trash-text').textContent =
    `${t.partial ? 'at least ' : ''}${sizeText(t.bytes)} in the Trash` +
    (t.items ? ` · ${fmtCount(t.items)} item${t.items === 1 ? '' : 's'}` : '') +
    (share >= 0.1 && !t.partial ? ` · ${share.toFixed(1)}% of the disk` : '');
}

let emptyArmed = false;
let emptyTimer = null;

function disarmEmpty() {
  emptyArmed = false;
  clearTimeout(emptyTimer);
  const b = $('#trash-empty');
  b.classList.remove('armed');
  b.textContent = 'Empty Trash';
}

async function emptyTrash() {
  const t = S.trash || { bytes: 0 };
  if (!emptyArmed) {
    // The only step in this app nothing can undo.
    emptyArmed = true;
    const b = $('#trash-empty');
    b.classList.add('armed');
    b.textContent = `Delete ${sizeText(t.bytes)} for good?`;
    emptyTimer = setTimeout(disarmEmpty, 5000);
    return;
  }
  disarmEmpty();
  $('#trash-empty').textContent = 'Emptying…';
  try {
    const res = await api('/api/trash-empty', {});
    if (res.volume) Object.assign(S.volume, res.volume);
    S.trash = res.trash || { bytes: 0, items: 0 };
    toast(`Trash emptied — ${sizeText(t.bytes)} freed`, false, 'delete_forever');
  } catch (err) {
    toast(`Could not empty the Trash: ${err.message}`, true);
  }
  $('#trash-empty').textContent = 'Empty Trash';
  drawTrash();
  drawVolume();
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
    view: S.view, sort: S.sort, desc: S.desc, thumbs: S.thumbs,
    previewMuted: S.previewMuted,
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
  $$('#sort-chips button').forEach((b) => {
    const on = b.dataset.sort === S.sort;
    b.classList.toggle('on', on);
    b.classList.toggle('asc', on && !S.desc);
    b.title = on
      ? `Sorted by ${b.dataset.sort === 'mtime' ? 'date' : b.dataset.sort} — click to reverse`
      : '';
  });
  $('#sort-menu button[data-toggle="thumbs"]').classList.toggle('on', S.thumbs);
  $('#sort-menu button[data-toggle="folders"]').classList.toggle('on', S.foldersFirst);
  $('#sort-menu button[data-toggle="hidden"]').classList.toggle('on', S.showHidden);
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

  // Clicking the active sort reverses it, the way a column header does.
  $$('#sort-chips button').forEach((b) => {
    b.onclick = () => {
      if (S.sort === b.dataset.sort) S.desc = !S.desc;
      else { S.sort = b.dataset.sort; S.desc = b.dataset.sort !== 'name'; }
      syncControls();
      savePrefs();
      if (S.view === 'kinds') setView('list'); else render();
    };
  });
  $('#sort-menu button[data-toggle="thumbs"]').onclick = () => {
    S.thumbs = !S.thumbs; syncControls(); savePrefs(); render();
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

  $('#sheet-close').onclick = () => { S.selected = null; render(); closeSheet(); };

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
  $('#act-yt').onclick = () => S.sheetItem && openMerge([S.sheetItem.path]);
  $('#act-proj').onclick = () => S.sheetItem && addToProject([S.sheetItem.path]);
  $('#act-trash').onclick = doTrash;

  $('#trash-browse').onclick = () => {
    const path = `${S.home}/.Trash`;
    // Only browsable in-app when the Trash is inside whatever we scanned.
    if (!path.startsWith(S.root === '/' ? '/' : S.root + '/')) {
      return $('#trash-finder').click();
    }
    if (S.view !== 'list') setView('list');
    navigate(path);
  };
  $('#trash-finder').onclick = async () => {
    try {
      await api('/api/trash-open', {});
      toast('Opened the Trash in Finder', false, 'folder_open');
    } catch (err) { toast(String(err), true); }
  };
  $('#trash-empty').onclick = emptyTrash;
  $('#empty-act').onclick = openFdaSettings;

  // -- projects + tray -- //
  $('#mark-add').onclick = () => addToProject([...S.marked]);
  $('#mark-merge').onclick = () => openMerge();
  $('#mark-trash').onclick = trashMarked;
  $('#mark-clear').onclick = clearMarks;

  $('#merge-close').onclick = closeMerge;
  $('#merge-cancel').onclick = closeMerge;
  $('#merge-scrim').onclick = closeMerge;
  $('#merge-go').onclick = startMerge;
  $('#merge-title').onkeydown = (ev) => { if (ev.key === 'Enter') startMerge(); };
  $$('#merge-privacy button').forEach((b) => {
    b.onclick = () => { M.privacy = b.dataset.p; syncMergeToggles(); };
  });
  $('#merge-upload-toggle').onclick = () => { M.upload = !M.upload; syncMergeToggles(); };
  $('#merge-encode-toggle').onclick = () => {
    M.encode = !M.encode;
    // Overriding the probe should not leave its verdict on screen as if it
    // still applied — the toggle now says what you chose, not what it found.
    M.why = M.encode ? 'your call' : 'your call — it will be copied, not encoded';
    syncMergeToggles();
  };
  $('#merge-trash-toggle').onclick = () => { M.trashAfter = !M.trashAfter; syncMergeToggles(); };
  $('#merge-sort-toggle').onclick = () => {
    M.sort = !M.sort;
    if (M.sort) M.paths = [...M.paths].sort(byDigits);
    drawMergeList();
    syncMergeToggles();
  };
  $('#tray-name').onclick = (ev) => { ev.stopPropagation(); trayMenu(); };
  $('#tray-menu').onclick = (ev) => ev.stopPropagation();
  document.addEventListener('click', () => $('#tray-menu').classList.remove('open'));
  $('#tray-min').onclick = () => {
    const t = $('#tray');
    t.classList.toggle('folded');
    $('#tray-min').firstElementChild.textContent =
      t.classList.contains('folded') ? 'expand_less' : 'expand_more';
  };
  $('#tray-auto').onclick = openAuto;
  $('#tray-review').onclick = () => openReview();
  $('#auto-close').onclick = closeAuto;
  $('#auto-cancel').onclick = closeAuto;
  $('#auto-scrim').onclick = closeAuto;
  $('#auto-go').onclick = runAuto;
  $$('#auto-target button').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.t === 'every') AUTO.perClip = true;
      else { AUTO.perClip = false; AUTO.target = Number(b.dataset.t); }
      syncAuto();
    };
  });
  $$('#auto-moment button').forEach((b) => {
    b.onclick = () => { AUTO.moment = Number(b.dataset.m); syncAuto(); };
  });
  $('#tray-edit').onclick = () => openEditor();

  const tray = $('#tray');
  tray.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    tray.classList.add('over');
  });
  tray.addEventListener('dragleave', (ev) => {
    if (!tray.contains(ev.relatedTarget)) tray.classList.remove('over');
  });
  tray.addEventListener('drop', (ev) => {
    ev.preventDefault();
    tray.classList.remove('over');
    const text = ev.dataTransfer.getData('text/plain');
    const paths = dragPayload || (text ? text.split('\n').filter(Boolean) : []);
    addToProject(paths.filter((p) => p.startsWith('/')));
  });
  // Clicking anywhere else backs out of the armed Empty rather than leaving a
  // loaded button sitting there.
  document.addEventListener('click', (ev) => {
    if (emptyArmed && ev.target.id !== 'trash-empty') disarmEmpty();
  });

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
    select(list[next]);
    document.querySelector(`.row[data-path="${CSS.escape(S.selected)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
    const e = list[idx];
    if (e?.dir) navigate(e.path);
    else if (e) select(e);
    return;
  }
  if (ev.key === 'ArrowLeft') { goUp(); return; }
  if (ev.key === ' ') {
    ev.preventDefault();
    const e = list[idx];
    if (e) reveal(e.path);
  }
}
