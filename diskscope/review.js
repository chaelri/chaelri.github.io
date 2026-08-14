/* diskscope/review — turning 318 clips into 318 keypresses.

   Loads after app.js and editor.js, and shares their globals.

   The screen is one clip at a time. A candidate window loops in the player, the
   loudness of the whole source is drawn underneath as a map, and the window is
   a box you can slide along it. K keeps it, X skips it, and the arrows walk the
   pile. Nothing is decided for you: the suggestion is only ever a starting
   position, because loudness finds talking and waves but cannot tell a good
   moment from a passing motorbike.

   What survives becomes the project's timeline. */

'use strict';

const R = {
  open: false,
  queue: [],           // assets to review, in order
  i: 0,
  picks: new Map(),    // asset id -> {start, end}
  length: 8,
  whole: false,
  levels: [],
  step: 0.5,
  dur: 0,
  video: null,
  raf: 0,
  seq: 0,
};

const RV_LENGTHS = [5, 8, 12, 20];

/* ── open / close ───────────────────────────────────────────────────────── */

async function openReview(scope) {
  if (!S.project) return toast('Add clips to a project first', true, 'rate_review');
  const p = await api(`/api/project?id=${encodeURIComponent(S.project.id)}`);
  const all = (p.assets || []).filter((a) => !a.missing && !a.still);
  if (!all.length) return toast('Nothing to review in this project', true);

  R.project = p;
  R.all = all;
  R.i = 0;
  R.picks = new Map();
  R.open = true;

  // Coming back should restore what you chose — but a clip spanning its whole
  // asset is the one the editor lays down automatically, not a decision. Taking
  // those as picks would mark all 318 as kept before you had looked at any,
  // inverting the whole point of triage.
  const byId = {};
  all.forEach((a) => { byId[a.id] = a; });
  (p.clips || []).forEach((c) => {
    const a = byId[c.asset];
    if (!a || R.picks.has(c.asset)) return;
    // `auto` marks a moment the auto-clipper chose. Otherwise fall back to
    // geometry: a clip spanning its whole asset is the editor's placeholder.
    const whole = c.in <= 0.05 && c.out >= (a.dur || 0) - 0.05;
    if (c.auto || !whole) R.picks.set(c.asset, { start: c.in, end: c.out });
  });

  // Straight after an auto clip you want to judge the forty moments it chose,
  // not walk all 256 sources again — so default to the cut when there is one.
  R.scope = scope || (R.picks.size ? 'picks' : 'all');
  applyScope();

  $('#review').classList.add('on');
  document.body.classList.add('reviewing');
  buildReviewStage();
  syncLengthChips();
  await showCurrent();
}

function applyScope() {
  R.queue = R.scope === 'picks'
    ? R.all.filter((a) => R.picks.has(a.id))
    : R.all;
  if (!R.queue.length) { R.scope = 'all'; R.queue = R.all; }
  R.i = Math.min(R.i, R.queue.length - 1);
  $$('#rv-scope button').forEach((b) => b.classList.toggle('on', b.dataset.scope === R.scope));
  $('#rv-scope').classList.toggle('hidden', !R.picks.size);
}

function closeReview() {
  R.open = false;
  cancelAnimationFrame(R.raf);
  if (R.video) { R.video.pause(); R.video.removeAttribute('src'); R.video.load?.(); }
  $('#review').classList.remove('on');
  document.body.classList.remove('reviewing');
}

function buildReviewStage() {
  const stage = $('#rv-stage');
  stage.querySelector('video')?.remove();
  const v = el('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.muted = false;
  v.addEventListener('timeupdate', () => {
    // The window loops: this is a moment being auditioned, not a clip playing.
    const w = currentWindow();
    if (!w) return;
    if (v.currentTime >= w.end - 0.03 || v.currentTime < w.start - 0.5) {
      try { v.currentTime = w.start; } catch { /* not ready */ }
    }
  });
  R.video = v;
  stage.insertBefore(v, stage.firstChild);
}

/* ── the current clip ───────────────────────────────────────────────────── */

const currentAsset = () => R.queue[R.i] || null;

function currentWindow() {
  const a = currentAsset();
  if (!a) return null;
  return R.window || null;
}

async function showCurrent() {
  const a = currentAsset();
  if (!a) return finishReview();
  const seq = ++R.seq;

  $('#rv-count').textContent = `${R.i + 1} / ${R.queue.length}`;
  $('#rv-name').textContent = a.name;
  $('#rv-sub').textContent = `${clock(a.dur)} · ${a.w}×${a.h}`;
  $('#rv-progress i').style.width = `${((R.i) / R.queue.length) * 100}%`;
  drawKept();

  R.dur = a.dur || 0;
  R.levels = [];
  R.window = null;
  drawMap();

  // Load the video straight away; the analysis lands a moment later.
  const url = fileUrl(a.path);
  if (!R.video.src.endsWith(url)) R.video.src = url;

  let info;
  try {
    info = await api(`/api/analysis?id=${encodeURIComponent(R.project.id)}`
      + `&asset=${encodeURIComponent(a.id)}&length=${R.whole ? 8 : R.length}`);
  } catch { info = null; }
  if (seq !== R.seq || !R.open) return;    // moved on while we waited

  R.levels = info?.levels || [];
  R.step = info?.step || 0.5;

  const kept = R.picks.get(a.id);
  const sugg = (info?.suggestions || [])[0];
  R.window = kept
    ? { ...kept }
    : R.whole
      ? { start: 0, end: R.dur }
      : sugg ? { start: sugg.start, end: sugg.end }
        : { start: 0, end: Math.min(R.dur, R.length) };

  drawMap();
  seekWindow(true);
  syncKeepButton();
}

function seekWindow(play) {
  const w = currentWindow();
  if (!w || !R.video) return;
  const go = () => {
    try { R.video.currentTime = w.start; } catch { /* not ready */ }
    if (play) R.video.play().catch(() => {});
  };
  if (R.video.readyState >= 1) go();
  else R.video.addEventListener('loadedmetadata', go, { once: true });
}

/* ── the map ────────────────────────────────────────────────────────────── */

/* The loudness of the whole source, drawn once. It is both the reason a
   suggestion landed where it did and the thing you drag along to overrule it. */
function drawMap() {
  const canvas = $('#rv-canvas');
  const box = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, box.width * dpr);
  canvas.height = Math.max(1, box.height * dpr);
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, box.width, box.height);

  const css = getComputedStyle(document.documentElement);
  const dim = css.getPropertyValue('--raise-2').trim() || 'rgba(255,255,255,.1)';
  g.fillStyle = dim;

  if (!R.levels.length) {
    g.fillRect(0, box.height - 2, box.width, 2);
  } else {
    const n = R.levels.length;
    const w = Math.max(1, box.width / n);
    for (let i = 0; i < n; i++) {
      const h = Math.max(1.5, R.levels[i] * (box.height - 6));
      g.fillRect((i / n) * box.width, box.height - h, w + 0.5, h);
    }
  }
  placeWindow();
}

function placeWindow() {
  const el0 = $('#rv-window');
  const w = currentWindow();
  if (!w || !R.dur) { el0.style.display = 'none'; return; }
  el0.style.display = 'block';
  el0.style.left = `${(w.start / R.dur) * 100}%`;
  el0.style.width = `${Math.max(0.6, ((w.end - w.start) / R.dur) * 100)}%`;
  $('#rv-window-label').textContent = `${clockMs(w.start)} → ${clockMs(w.end)}`;
}

function moveWindow(startSeconds) {
  const w = currentWindow();
  if (!w) return;
  const len = w.end - w.start;
  const start = Math.max(0, Math.min(R.dur - len, startSeconds));
  R.window = { start, end: start + len };
  placeWindow();
  seekWindow(true);
}

function setLength(seconds) {
  R.whole = false;
  R.length = seconds;
  const w = currentWindow();
  if (w) {
    // Grow around the middle of what you are already looking at.
    const mid = (w.start + w.end) / 2;
    const len = Math.min(seconds, R.dur);
    moveWindow(mid - len / 2);
    R.window = { start: R.window.start, end: Math.min(R.dur, R.window.start + len) };
    placeWindow();
    seekWindow(true);
  }
  syncLengthChips();
}

function useWholeClip() {
  R.whole = true;
  R.window = { start: 0, end: R.dur };
  placeWindow();
  seekWindow(true);
  syncLengthChips();
}

function syncLengthChips() {
  $$('#rv-lengths button').forEach((b) => {
    const v = b.dataset.len;
    b.classList.toggle('on', v === 'whole' ? R.whole : (!R.whole && Number(v) === R.length));
  });
}

/* ── decisions ──────────────────────────────────────────────────────────── */

function keepCurrent() {
  const a = currentAsset();
  const w = currentWindow();
  if (!a || !w) return;
  R.picks.set(a.id, { start: +w.start.toFixed(2), end: +w.end.toFixed(2) });
  flash('keep');
  next();
}

function skipCurrent() {
  const a = currentAsset();
  if (a) R.picks.delete(a.id);
  flash('skip');
  next();
}

function flash(kind) {
  const f = $('#rv-flash');
  f.className = `rv-flash ${kind}`;
  f.textContent = kind === 'keep' ? 'Kept' : 'Skipped';
  // Restart the animation on a repeat press.
  void f.offsetWidth;
  f.classList.add('go');
  setTimeout(() => f.classList.remove('go'), 480);
}

function next() {
  if (R.i >= R.queue.length - 1) return finishReview();
  R.i++;
  showCurrent();
}

function prev() {
  if (R.i <= 0) return;
  R.i--;
  showCurrent();
}

function drawKept() {
  let secs = 0;
  R.picks.forEach((w) => { secs += Math.max(0, w.end - w.start); });
  $('#rv-kept').textContent = R.picks.size
    ? `${fmtCount(R.picks.size)} kept · ${clock(secs)}`
    : 'nothing kept yet';
}

function syncKeepButton() {
  const a = currentAsset();
  const already = a && R.picks.has(a.id);
  $('#rv-keep').classList.toggle('again', !!already);
  $('#rv-keep').lastElementChild.textContent = already ? 'Update  K' : 'Keep  K';
}

async function finishReview() {
  const kept = [];
  // Walk every asset, not just the reviewed subset, so switching scope midway
  // cannot quietly drop the picks you made in the other one. Asset order is
  // the order they were shot in.
  R.all.forEach((a) => {
    const w = R.picks.get(a.id);
    if (w) kept.push({ asset: a.id, in: w.start, out: w.end, scale: 1, x: 0.5, y: 0.5 });
  });
  if (!kept.length) {
    closeReview();
    return toast('Nothing kept — the timeline is untouched', false, 'rate_review');
  }
  try {
    await api('/api/project-save', { id: R.project.id, clips: kept });
    const secs = kept.reduce((a, c) => a + (c.out - c.in), 0);
    closeReview();
    await refreshProject();
    toast(`${fmtCount(kept.length)} clips · ${clock(secs)} on the timeline`, false, 'check_circle');
    openEditor();
  } catch (err) { toast(`Could not save: ${err.message}`, true); }
}

/* ── wiring ─────────────────────────────────────────────────────────────── */

(function wireReview() {
  $('#rv-close').onclick = closeReview;
  $('#rv-done').onclick = finishReview;
  $('#rv-keep').onclick = keepCurrent;
  $('#rv-skip').onclick = skipCurrent;
  $('#rv-prev').onclick = prev;
  $('#rv-next').onclick = () => next();
  $('#rv-analyse').onclick = async () => {
    try {
      const res = await api('/api/project-analyse', { id: S.project.id });
      if (res.nothing) return toast('Already listened to every clip', false, 'graphic_eq');
      toast('Listening to the whole project…', false, 'graphic_eq');
      pollJobs(true);
    } catch (err) { toast(String(err), true); }
  };

  $$('#rv-lengths button').forEach((b) => {
    b.onclick = () => (b.dataset.len === 'whole' ? useWholeClip() : setLength(Number(b.dataset.len)));
  });

  $$('#rv-scope button').forEach((b) => {
    b.onclick = () => {
      R.scope = b.dataset.scope;
      R.i = 0;
      applyScope();
      showCurrent();
    };
  });

  // Dragging the window along the map is the whole "no, not there — there".
  const map = $('#rv-map');
  const grabAt = (ev, offset) => {
    const r = map.getBoundingClientRect();
    const t = ((ev.clientX - r.left) / r.width) * R.dur;
    moveWindow(t - offset);
  };
  map.onmousedown = (ev) => {
    const w = currentWindow();
    if (!w || !R.dur) return;
    const r = map.getBoundingClientRect();
    const t = ((ev.clientX - r.left) / r.width) * R.dur;
    // Grabbing inside the window slides it; clicking outside jumps it there.
    const offset = (t >= w.start && t <= w.end) ? t - w.start : (w.end - w.start) / 2;
    grabAt(ev, offset);
    map.classList.add('dragging');
    const move = (e) => grabAt(e, offset);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      map.classList.remove('dragging');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  window.addEventListener('resize', () => { if (R.open) drawMap(); });

  document.addEventListener('keydown', (ev) => {
    if (!R.open || ev.target.tagName === 'INPUT') return;
    const w = currentWindow();
    switch (ev.key) {
      case 'Escape': ev.preventDefault(); closeReview(); break;
      case 'k': case 'K': ev.preventDefault(); keepCurrent(); break;
      case 'x': case 'X': ev.preventDefault(); skipCurrent(); break;
      case 'w': case 'W': ev.preventDefault(); useWholeClip(); break;
      case 'ArrowRight': ev.preventDefault(); next(); break;
      case 'ArrowLeft': ev.preventDefault(); prev(); break;
      case '[': ev.preventDefault(); if (w) moveWindow(w.start - (ev.shiftKey ? 10 : 2)); break;
      case ']': ev.preventDefault(); if (w) moveWindow(w.start + (ev.shiftKey ? 10 : 2)); break;
      case ' ':
        ev.preventDefault();
        if (R.video) R.video.paused ? R.video.play().catch(() => {}) : R.video.pause();
        break;
      case '1': case '2': case '3': case '4':
        ev.preventDefault();
        setLength(RV_LENGTHS[Number(ev.key) - 1]);
        break;
      default: break;
    }
  }, true);
})();
