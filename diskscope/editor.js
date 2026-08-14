/* diskscope/editor — the cutting room.

   Loads after app.js and shares its globals ($, el, api, toast, TOKEN…).

   The timeline is a plain array of clips, each a window into an asset:

       { id, asset, in, out, scale, x, y, mute }

   `in`/`out` are seconds into the source, so trimming never touches a file and
   an "edit" is a few numbers. Playback walks that array with ONE <video>
   element, re-pointing it at the next source when the playhead crosses a
   boundary — the same model the export uses, so what you see is what renders.

   Every seconds↔pixels conversion goes through E.pps (pixels per second).
   That single number is the timeline zoom. */

'use strict';

const E = {
  open: false,
  project: null,
  clips: [],
  assets: {},          // id -> asset
  sel: null,           // selected clip id
  pps: 40,             // timeline zoom
  playing: false,
  t: 0,                // playhead, seconds into the sequence
  video: null,
  activeClip: null,
  raf: 0,
  dirty: false,
  saveTimer: null,
};

const ASPECT_RATIO = { source: null, '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };
const MIN_PPS = 0.15;

/* ── open / close ───────────────────────────────────────────────────────── */

async function openEditor(focusAssetId) {
  if (!S.project) {
    toast('Add some clips to a project first', true, 'movie_edit');
    return;
  }
  E.project = await api(`/api/project?id=${encodeURIComponent(S.project.id)}`);
  E.assets = {};
  (E.project.assets || []).forEach((a) => { E.assets[a.id] = a; });
  E.clips = (E.project.clips || []).map((c) => ({ ...c }));

  // First time in, lay every asset end to end. An empty timeline next to a full
  // bin is a puzzle, not a starting point.
  if (!E.clips.length && E.project.assets.length) {
    E.clips = E.project.assets.map((a) => newClip(a));
    E.dirty = true;
  }
  if (focusAssetId) {
    const hit = E.clips.find((c) => c.asset === focusAssetId);
    if (hit) E.sel = hit.id;
  }
  if (!E.sel && E.clips.length) E.sel = E.clips[0].id;

  E.open = true;
  E.t = 0;
  $('#editor').classList.add('on');
  document.body.classList.add('editing');
  $('#ed-name').value = E.project.name;
  syncAspect();
  buildStage();
  zoomFit();
  drawAll();
  if (E.dirty) saveSoon();
}

function newClip(asset) {
  return {
    id: 'c' + Math.random().toString(36).slice(2, 10),
    asset: asset.id,
    in: 0,
    out: asset.still ? 3 : (asset.dur || 3),
    scale: 1,
    x: 0.5,
    y: 0.5,
    mute: false,
  };
}

function closeEditor() {
  pause();
  E.open = false;
  (E.vids || []).forEach((v) => { v.pause(); v.removeAttribute('src'); v.load?.(); });
  $('#editor').classList.remove('on');
  document.body.classList.remove('editing');
  cancelAnimationFrame(E.raf);
  save(true);
  refreshProject();
}

/* ── model helpers ──────────────────────────────────────────────────────── */

const clipLen = (c) => Math.max(0.02, c.out - c.in);
const total = () => E.clips.reduce((a, c) => a + clipLen(c), 0);
const selected = () => E.clips.find((c) => c.id === E.sel) || null;

/* Sequence time -> which clip, and how far into it. */
function locate(t) {
  let acc = 0;
  for (let i = 0; i < E.clips.length; i++) {
    const len = clipLen(E.clips[i]);
    if (t < acc + len || i === E.clips.length - 1) {
      return { clip: E.clips[i], i, offset: Math.max(0, Math.min(len, t - acc)), start: acc };
    }
    acc += len;
  }
  return null;
}

function startOf(id) {
  let acc = 0;
  for (const c of E.clips) {
    if (c.id === id) return acc;
    acc += clipLen(c);
  }
  return 0;
}

/* ── saving ─────────────────────────────────────────────────────────────── */

function saveSoon() {
  E.dirty = true;
  clearTimeout(E.saveTimer);
  E.saveTimer = setTimeout(() => save(), 600);
}

async function save(now) {
  if (!E.project || (!E.dirty && !now)) return;
  E.dirty = false;
  try {
    await api('/api/project-save', {
      id: E.project.id,
      clips: E.clips,
      aspect: E.project.aspect,
      name: $('#ed-name').value.trim() || E.project.name,
    });
  } catch (err) { toast(`Could not save: ${err.message}`, true); }
}

/* ── preview ────────────────────────────────────────────────────────────── */

function sourceUrl(asset) {
  return fileUrl(asset.path);
}

/* Two video elements, not one. Swapping the src of a single element makes the
   browser tear down its decoder and build a new one, which shows as a black
   flash at every cut. Instead the next clip is loaded and seeked into the
   spare element while the current one is still playing, so crossing a boundary
   is just a change of which element is on top. */
function buildStage() {
  const canvas = $('#ed-canvas');
  canvas.innerHTML = '';
  E.vids = [0, 1].map(() => {
    const v = el('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.addEventListener('ended', () => { if (E.playing) step(); });
    canvas.appendChild(v);
    return v;
  });
  E.front = 0;
  E.loaded = [null, null];      // which clip each element is holding
  showFront();
  canvas.onmousedown = startReframe;
  syncCanvasShape();
}

function showFront() {
  E.vids.forEach((v, i) => v.classList.toggle('front', i === E.front));
  E.video = E.vids[E.front];
}

const backIndex = () => 1 - E.front;

/* Park the next clip in the spare element, ready to go. */
function primeNext(fromClip) {
  const i = E.clips.indexOf(fromClip);
  const next = E.clips[i + 1];
  const spare = E.vids[backIndex()];
  if (!next) { E.loaded[backIndex()] = null; return; }
  const asset = E.assets[next.asset];
  if (!asset) return;
  const url = sourceUrl(asset);
  const already = E.loaded[backIndex()];
  if (already && already.id === next.id) return;
  E.loaded[backIndex()] = next;
  spare.pause();
  if (!spare.src.endsWith(url)) spare.src = url;
  const seat = () => { try { spare.currentTime = next.in; } catch { /* not ready */ } };
  if (spare.readyState >= 1) seat();
  else spare.addEventListener('loadedmetadata', seat, { once: true });
}

/* ── reframing by dragging the picture ──────────────────────────────────── */

/* How much of the frame is hidden off each edge, in screen pixels. This is the
   whole reframing model in two numbers: if nothing is hidden there is nothing
   to pan, and dragging one hidden pixel moves the shot by exactly one pixel. */
function hiddenPixels(clip) {
  const asset = E.assets[clip.asset];
  const canvas = $('#ed-canvas');
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!asset || !asset.w || !asset.h || !cw) return { h: 0, v: 0 };
  const fill = !!canvas.dataset.fill;
  const k = fill
    ? Math.max(cw / asset.w, ch / asset.h)      // cover
    : Math.min(cw / asset.w, ch / asset.h);     // contain
  const punch = Math.max(1, clip.scale || 1);
  return {
    h: Math.max(0, asset.w * k * punch - cw),
    v: Math.max(0, asset.h * k * punch - ch),
  };
}

function startReframe(ev) {
  const at = locate(E.t);
  if (!at) return;
  const clip = at.clip;
  const room = hiddenPixels(clip);
  if (room.h < 1 && room.v < 1) return;         // the whole frame already fits

  ev.preventDefault();
  if (clip.id !== E.sel) { E.sel = clip.id; drawTrack(); drawInspector(); }

  const x0 = ev.clientX;
  const y0 = ev.clientY;
  const at0 = frameFor(clip);
  const fromX = at0.x;
  const fromY = at0.y;
  const canvas = $('#ed-canvas');
  canvas.classList.add('panning');

  const move = (e) => {
    // Drag right and the picture follows your hand, so the window over the
    // source moves left — hence the negative sign.
    const patch = {};
    if (room.h >= 1) patch.x = Math.max(0, Math.min(1, fromX - (e.clientX - x0) / room.h));
    if (room.v >= 1) patch.y = Math.max(0, Math.min(1, fromY - (e.clientY - y0) / room.v));
    applyFraming(clip, patch);
    paintFrame(clip);
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    canvas.classList.remove('panning');
    saveSoon();
    drawInspector();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

/* The cursor has to tell you whether there is anything to grab. */
function syncPanCursor() {
  const canvas = $('#ed-canvas');
  const at = locate(E.t);
  const room = at ? hiddenPixels(at.clip) : { h: 0, v: 0 };
  canvas.classList.toggle('pannable', room.h >= 1 || room.v >= 1);
}

function syncCanvasShape() {
  const ratio = ASPECT_RATIO[E.project.aspect || 'source'];
  const stage = $('#ed-stage');
  const canvas = $('#ed-canvas');
  if (ratio) {
    canvas.style.aspectRatio = String(ratio);
    canvas.dataset.fill = '1';
  } else {
    const a = E.clips.length ? E.assets[E.clips[0].asset] : null;
    canvas.style.aspectRatio = a && a.w && a.h ? `${a.w} / ${a.h}` : '16 / 9';
    delete canvas.dataset.fill;
  }
  stage.classList.toggle('tall', !!ratio && ratio < 1);
}

/* ── keyframed motion ───────────────────────────────────────────────────── */

/* Keys live in source seconds, the same units as in/out, so trimming a clip
   never slides its motion out from under it and splitting one hands each half
   the keys that belong to it. This mirrors sample_motion() in editor.py — the
   preview and the render read the same curve. */

const smoothstep = (u) => u * u * (3 - 2 * u);

/* Returns framing only — never the key's own `t`. Spreading a whole key here
   once let its timestamp leak into a newly created keyframe, stacking every
   auto-key on top of the first one. */
const framing = (k) => ({ scale: k.scale, x: k.x, y: k.y });

function motionAt(clip, srcT) {
  const keys = clip.keys || [];
  if (!keys.length) return { scale: clip.scale || 1, x: clip.x ?? 0.5, y: clip.y ?? 0.5 };
  if (srcT <= keys[0].t) return framing(keys[0]);
  if (srcT >= keys[keys.length - 1].t) return framing(keys[keys.length - 1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (srcT >= a.t && srcT <= b.t) {
      const span = b.t - a.t;
      const u = span <= 0 ? 0 : (clip.ease ? smoothstep((srcT - a.t) / span) : (srcT - a.t) / span);
      return {
        scale: a.scale + (b.scale - a.scale) * u,
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
      };
    }
  }
  return framing(keys[keys.length - 1]);
}

/* Where the playhead sits inside a clip's source, in source seconds. */
function srcTimeOf(clip) {
  return clip.in + Math.max(0, Math.min(clipLen(clip), E.t - startOf(clip.id)));
}

const frameFor = (clip) => motionAt(clip, srcTimeOf(clip));

function keyAt(clip, srcT, tol = 0.06) {
  return (clip.keys || []).find((k) => Math.abs(k.t - srcT) <= tol) || null;
}

/* Editing a keyed clip writes into the key under the playhead, creating one if
   there isn't one — the auto-key behaviour every editor has, and without it you
   would silently edit a value the curve immediately overwrites. */
function applyFraming(clip, patch) {
  if (!clip.keys || !clip.keys.length) {
    Object.assign(clip, patch);
    return;
  }
  const t = srcTimeOf(clip);
  let k = keyAt(clip, t);
  if (!k) {
    k = { t: +t.toFixed(3), ...frameFor(clip) };
    clip.keys.push(k);
    clip.keys.sort((a, b) => a.t - b.t);
  }
  Object.assign(k, patch);
}

function toggleKey() {
  const clip = selected() || (locate(E.t) || {}).clip;
  if (!clip) return;
  clip.keys = clip.keys || [];
  const t = srcTimeOf(clip);
  const hit = keyAt(clip, t);
  if (hit) {
    clip.keys = clip.keys.filter((k) => k !== hit);
    toast(clip.keys.length ? 'Keyframe removed' : 'Motion cleared — back to a fixed frame',
      false, 'stat_minus_1');
  } else {
    clip.keys.push({ t: +t.toFixed(3), ...frameFor(clip) });
    clip.keys.sort((a, b) => a.t - b.t);
    toast(clip.keys.length === 1
      ? 'Keyframe set — move the playhead and reframe to make it travel'
      : 'Keyframe set', false, 'stat_1');
  }
  saveSoon();
  drawTrack();
  drawInspector();
}

function jumpKey(dir) {
  const clip = selected();
  if (!clip || !(clip.keys || []).length) return;
  const t = srcTimeOf(clip);
  const base = startOf(clip.id) - clip.in;
  const next = dir > 0
    ? clip.keys.find((k) => k.t > t + 0.02)
    : [...clip.keys].reverse().find((k) => k.t < t - 0.02);
  if (next) seek(base + next.t);
}

/* Mirrors the export's framing: cover+reframe on a chosen aspect, contain on
   source, punch-in as a scale about the same x/y the filter graph uses. */
function paintFrame(clip) {
  const v = E.video;
  if (!v || !clip) return;
  const f = frameFor(clip);
  const fill = !!$('#ed-canvas').dataset.fill;
  v.style.objectFit = fill ? 'cover' : 'contain';
  v.style.objectPosition = `${f.x * 100}% ${f.y * 100}%`;
  v.style.transformOrigin = `${f.x * 100}% ${f.y * 100}%`;
  v.style.transform = f.scale > 1.001 ? `scale(${f.scale})` : '';
  v.muted = !!clip.mute;
  syncPanCursor();
}

function mount(clip, offset, play) {
  const asset = E.assets[clip.asset];
  if (!asset) return;

  // If the spare element is already sitting on this clip, promote it — that is
  // the seamless path, and it is the one every boundary takes.
  const back = E.loaded[backIndex()];
  if (back && back.id === clip.id && offset < 0.25) {
    E.vids[E.front].pause();
    E.front = backIndex();
    showFront();
  }

  const url = sourceUrl(asset);
  if (!E.video.src.endsWith(url)) E.video.src = url;
  E.loaded[E.front] = clip;
  E.activeClip = clip.id;
  paintFrame(clip);

  const target = clip.in + offset;
  const land = () => {
    if (Math.abs(E.video.currentTime - target) > 0.05) {
      try { E.video.currentTime = target; } catch { /* not ready */ }
    }
    if (play) E.video.play().catch(() => {});
  };
  if (E.video.readyState >= 1) land();
  else E.video.addEventListener('loadedmetadata', land, { once: true });

  primeNext(clip);
}

function step() {
  // Called when the current clip runs out: hop to the next one.
  const at = locate(E.t);
  if (!at) return pause();
  const next = E.clips[at.i + 1];
  if (!next) { E.t = total(); return pause(); }
  E.t = startOf(next.id) + 0.001;
  mount(next, 0, E.playing);
}

function tick() {
  if (!E.open) return;
  if (E.playing) {
    const at = locate(E.t);
    if (at && E.video && !E.video.paused) {
      const into = E.video.currentTime - at.clip.in;
      if (into >= clipLen(at.clip) - 0.03) step();
      else E.t = at.start + Math.max(0, into);
      // A keyed clip has to be repainted every frame — the move IS the frame.
      if ((at.clip.keys || []).length) paintFrame(at.clip);
    }
    if (E.t >= total() - 0.02) { seek(0); pause(); }
    drawPlayhead();
    drawTime();
  }
  E.raf = requestAnimationFrame(tick);
}

function play() {
  if (!E.clips.length) return;
  E.playing = true;
  $('#ed-play').firstElementChild.textContent = 'pause';
  const at = locate(E.t);
  if (at) mount(at.clip, at.offset, true);
  cancelAnimationFrame(E.raf);
  E.raf = requestAnimationFrame(tick);
}

function pause() {
  E.playing = false;
  $('#ed-play').firstElementChild.textContent = 'play_arrow';
  (E.vids || []).forEach((v) => v.pause());
}

function seek(t) {
  E.t = Math.max(0, Math.min(total(), t));
  const at = locate(E.t);
  if (at) {
    mount(at.clip, at.offset, E.playing);
    if (at.clip.id !== E.sel) { E.sel = at.clip.id; drawInspector(); drawTrack(); }
  }
  drawPlayhead();
  drawTime();
}

/* ── operations ─────────────────────────────────────────────────────────── */

function splitAtPlayhead() {
  const at = locate(E.t);
  if (!at || at.offset < 0.05 || clipLen(at.clip) - at.offset < 0.05) {
    return toast('Move the playhead inside a clip first', true, 'content_cut');
  }
  const cut = at.clip.in + at.offset;
  const right = { ...at.clip, id: newId(), in: cut };
  // Keys are in source time, so each half simply keeps the ones that fall
  // inside it — plus one at the cut so neither half jumps at the seam.
  if ((at.clip.keys || []).length) {
    const here = motionAt(at.clip, cut);
    right.keys = [{ t: +cut.toFixed(3), ...here },
      ...at.clip.keys.filter((k) => k.t > cut)];
    at.clip.keys = [...at.clip.keys.filter((k) => k.t < cut),
      { t: +cut.toFixed(3), ...here }];
  }
  at.clip.out = cut;
  E.clips.splice(at.i + 1, 0, right);
  E.sel = right.id;
  after('Split');
}

function duplicateSel() {
  const c = selected();
  if (!c) return;
  const copy = { ...c, id: newId() };
  E.clips.splice(E.clips.indexOf(c) + 1, 0, copy);
  E.sel = copy.id;
  after('Duplicated');
}

function removeSel() {
  const c = selected();
  if (!c) return;
  const i = E.clips.indexOf(c);
  E.clips.splice(i, 1);
  E.sel = (E.clips[i] || E.clips[i - 1] || {}).id || null;
  E.t = Math.min(E.t, total());
  after('Removed');
}

function nudge(dir) {
  const c = selected();
  if (!c) return;
  const i = E.clips.indexOf(c);
  const j = i + dir;
  if (j < 0 || j >= E.clips.length) return;
  E.clips.splice(j, 0, E.clips.splice(i, 1)[0]);
  after(dir < 0 ? 'Moved left' : 'Moved right');
}

const newId = () => 'c' + Math.random().toString(36).slice(2, 10);

function after(what) {
  saveSoon();
  drawAll();
  if (what) toast(what, false, 'movie_edit');
}

/* ── drawing ────────────────────────────────────────────────────────────── */

function drawAll() {
  drawTrack();
  drawRuler();
  drawInspector();
  drawTime();
  drawPlayhead();
  syncCanvasShape();
  const at = locate(E.t);
  if (at) mount(at.clip, at.offset, false);
  $('#ed-dur').textContent = clock(total());
  $('#ed-tl-label').textContent =
    `${E.clips.length} clip${E.clips.length === 1 ? '' : 's'} · ${clock(total())}`;
}

function drawTrack() {
  const track = $('#ed-track');
  track.innerHTML = '';
  track.style.width = `${Math.max(200, total() * E.pps)}px`;

  // Clips are placed at their own start time, not laid out one after another.
  // A flex row with a 1px gutter drifts by one pixel per clip, so at 300 clips
  // the far end of the timeline sat 300px away from the ruler above it.
  let at = 0;
  E.clips.forEach((c) => {
    const asset = E.assets[c.asset] || {};
    const w = clipLen(c) * E.pps;
    const box = el('div', `ed-clip${c.id === E.sel ? ' sel' : ''}${asset.missing ? ' gone' : ''}`);
    box.style.left = `${at * E.pps}px`;
    // The gutter comes out of the width, so it is a look, not an offset.
    box.style.width = `${Math.max(2, w - 1)}px`;
    at += clipLen(c);
    box.dataset.id = c.id;
    box.title = `${asset.name || 'missing'}\n${clock(c.in)} → ${clock(c.out)}`;

    // Below a few dozen pixels a thumbnail is a smear and a name is unreadable;
    // at 300 clips that is also 300 image requests for nothing.
    if (w >= 14) {
      const thumb = el('img', 'ed-clip-thumb');
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.src = `/thumb/${encodeURIComponent(TOKEN)}/${b64Path(asset.path || '')}?v=${asset.added || 0}`;
      thumb.onerror = () => thumb.remove();
      box.appendChild(thumb);
    }

    if (w >= 54) {
      const label = el('div', 'ed-clip-label');
      label.appendChild(el('span', null, asset.name || 'missing file'));
      if (c.scale > 1.001) {
        label.appendChild(Object.assign(el('span', 'ed-tag'), { textContent: `${c.scale.toFixed(1)}×` }));
      }
      if (c.mute) label.appendChild(Object.assign(el('span', 'ms ed-tag'), { textContent: 'volume_off' }));
      box.appendChild(label);
    }
    if (w >= 40) box.appendChild(el('div', 'ed-clip-len', clock(clipLen(c))));

    (c.keys || []).forEach((k) => {
      const d = el('div', 'ed-clip-key');
      d.style.left = `${((k.t - c.in) / clipLen(c)) * 100}%`;
      box.appendChild(d);
    });

    ['in', 'out'].forEach((side) => {
      const h = el('div', `ed-handle ${side}`);
      h.onmousedown = (ev) => startTrim(ev, c, side);
      box.appendChild(h);
    });

    box.onmousedown = (ev) => {
      if (ev.target.classList.contains('ed-handle')) return;
      E.sel = c.id;
      drawTrack();
      drawInspector();
      startDrag(ev, c, idx);
    };
    track.appendChild(box);
  });
}

function drawRuler() {
  const ruler = $('#ed-ruler');
  ruler.innerHTML = '';
  const dur = total();
  ruler.style.width = `${Math.max(200, dur * E.pps)}px`;
  // Aim for a tick every ~90px, snapped to something a human counts in.
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const want = 90 / E.pps;
  const stepSize = steps.find((s) => s >= want) || 600;
  for (let t = 0; t <= dur + 0.001; t += stepSize) {
    const tick = el('div', 'ed-tick');
    tick.style.left = `${t * E.pps}px`;
    tick.appendChild(el('span', null, clock(t)));
    ruler.appendChild(tick);
  }
}

function drawPlayhead() {
  const head = $('#ed-playhead');
  head.style.left = `${E.t * E.pps}px`;
  const wrap = $('#ed-track-wrap');
  const x = E.t * E.pps;
  // Keep the playhead in view while playing without fighting a manual scroll.
  if (E.playing && (x < wrap.scrollLeft + 40 || x > wrap.scrollLeft + wrap.clientWidth - 60)) {
    wrap.scrollLeft = Math.max(0, x - wrap.clientWidth * 0.35);
  }
}

function drawTime() {
  $('#ed-time').textContent = `${clockMs(E.t)} / ${clockMs(total())}`;
}

const clockMs = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
};

function drawInspector() {
  const box = $('#ed-inspect');
  box.innerHTML = '';
  const c = selected();
  if (!c) {
    box.appendChild(el('p', 'ed-empty', 'Select a clip in the timeline.'));
    return;
  }
  const asset = E.assets[c.asset] || {};

  box.appendChild(el('h3', 'ed-h', asset.name || 'missing file'));
  box.appendChild(el('p', 'ed-sub',
    `${asset.w || '?'}×${asset.h || '?'} · ${asset.codec || ''}`));

  const trim = el('div', 'ed-rows');
  trim.appendChild(field('In', clockMs(c.in)));
  trim.appendChild(field('Out', clockMs(c.out)));
  trim.appendChild(field('Length', clockMs(clipLen(c))));
  box.appendChild(trim);

  const now = frameFor(c);
  const keyed = (c.keys || []).length > 0;

  box.appendChild(slider('Punch in', now.scale, 1, 4, 0.05, (v) => {
    applyFraming(c, { scale: v });
    paintFrame(c);
    saveSoon();
    drawTrack();
  }, (v) => `${v.toFixed(2)}×`));

  box.appendChild(motionPanel(c));

  const framing = el('div', 'ed-framing');
  framing.appendChild(el('p', 'ed-label',
    keyed ? 'Framing at the playhead — drag the picture, or this dot'
      : 'Framing — drag the picture itself, or this dot'));
  const pad = el('div', 'ed-pad');
  const dot = el('div', 'ed-pad-dot');
  const place = () => {
    const f = frameFor(c);
    dot.style.left = `${f.x * 100}%`;
    dot.style.top = `${f.y * 100}%`;
  };
  place();
  const grab = (ev) => {
    const r = pad.getBoundingClientRect();
    applyFraming(c, {
      x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
    });
    place();
    paintFrame(c);
    saveSoon();
  };
  pad.onmousedown = (ev) => {
    grab(ev);
    const move = (e) => grab(e);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  pad.appendChild(dot);
  framing.appendChild(pad);
  box.appendChild(framing);

  const mute = el('button', `ed-toggle${c.mute ? ' on' : ''}`);
  mute.appendChild(Object.assign(el('span', 'ms'), { textContent: c.mute ? 'volume_off' : 'volume_up' }));
  mute.appendChild(el('span', null, c.mute ? 'Muted' : 'Audio on'));
  mute.onclick = () => { c.mute = !c.mute; paintFrame(c); saveSoon(); drawInspector(); drawTrack(); };
  box.appendChild(mute);

  const reset = el('button', 'ed-toggle');
  reset.appendChild(Object.assign(el('span', 'ms'), { textContent: 'restart_alt' }));
  reset.appendChild(el('span', null, 'Reset framing'));
  reset.onclick = () => {
    c.scale = 1; c.x = 0.5; c.y = 0.5; c.keys = [];
    paintFrame(c); saveSoon(); drawInspector(); drawTrack();
  };
  box.appendChild(reset);
}

/* The motion panel. With no keys a clip holds one framing for its whole length;
   the moment there are two, it travels between them. */
function motionPanel(clip) {
  const wrap = el('div', 'ed-motion');
  const keys = clip.keys || [];
  const t = srcTimeOf(clip);
  const on = !!keyAt(clip, t);

  const head = el('div', 'ed-row');
  head.appendChild(el('span', null, keys.length
    ? `Motion · ${keys.length} keyframe${keys.length === 1 ? '' : 's'}`
    : 'Motion'));
  const add = el('button', `ed-key-btn${on ? ' on' : ''}`);
  add.title = on ? 'Remove the keyframe here  K' : 'Add a keyframe at the playhead  K';
  add.appendChild(Object.assign(el('span', 'ms'), { textContent: 'square' }));
  add.onclick = toggleKey;
  head.appendChild(add);
  wrap.appendChild(head);

  if (!keys.length) {
    wrap.appendChild(el('p', 'ed-hint',
      'Set a keyframe, move the playhead, then reframe — the shot travels between them.'));
    return wrap;
  }

  const strip = el('div', 'ed-keys');
  const len = clipLen(clip);
  keys.forEach((k) => {
    const d = el('button', `ed-key${Math.abs(k.t - t) <= 0.06 ? ' at' : ''}`);
    d.style.left = `${((k.t - clip.in) / len) * 100}%`;
    d.title = `${clockMs(k.t - clip.in)} · ${k.scale.toFixed(2)}×`;
    d.onclick = () => seek(startOf(clip.id) + (k.t - clip.in));
    strip.appendChild(d);
  });
  const head2 = el('div', 'ed-keys-head');
  head2.style.left = `${((t - clip.in) / len) * 100}%`;
  strip.appendChild(head2);
  wrap.appendChild(strip);

  const ease = el('button', `ed-toggle${clip.ease ? ' key' : ''}`);
  ease.appendChild(Object.assign(el('span', 'ms'), {
    textContent: clip.ease ? 'move_down' : 'trending_flat',
  }));
  ease.appendChild(el('span', null, clip.ease ? 'Eased — slows at both ends' : 'Linear — constant speed'));
  ease.onclick = () => { clip.ease = !clip.ease; saveSoon(); drawInspector(); };
  wrap.appendChild(ease);

  const clear = el('button', 'ed-toggle');
  clear.appendChild(Object.assign(el('span', 'ms'), { textContent: 'timer_off' }));
  clear.appendChild(el('span', null, 'Clear all keyframes'));
  clear.onclick = () => {
    const f = frameFor(clip);
    Object.assign(clip, { keys: [], scale: f.scale, x: f.x, y: f.y });
    saveSoon(); drawInspector(); drawTrack(); paintFrame(clip);
  };
  wrap.appendChild(clear);
  return wrap;
}

function field(label, value) {
  const row = el('div', 'ed-row');
  row.appendChild(el('span', null, label));
  row.appendChild(el('b', 'mono', value));
  return row;
}

function slider(label, value, min, max, stepSize, onInput, fmt) {
  const wrap = el('div', 'ed-slider');
  const top = el('div', 'ed-row');
  top.appendChild(el('span', null, label));
  const out = el('b', 'mono', fmt ? fmt(value) : String(value));
  top.appendChild(out);
  wrap.appendChild(top);
  const input = el('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = stepSize; input.value = value;
  input.oninput = () => {
    const v = Number(input.value);
    out.textContent = fmt ? fmt(v) : String(v);
    onInput(v);
  };
  wrap.appendChild(input);
  return wrap;
}

/* ── timeline interaction ───────────────────────────────────────────────── */

function startTrim(ev, clip, side) {
  ev.preventDefault();
  ev.stopPropagation();
  const asset = E.assets[clip.asset] || {};
  const x0 = ev.clientX;
  const from = clip[side];
  const move = (e) => {
    const delta = (e.clientX - x0) / E.pps;
    if (side === 'in') {
      clip.in = Math.max(0, Math.min(clip.out - 0.1, from + delta));
    } else {
      const cap = asset.still ? 3600 : (asset.dur || from + delta);
      clip.out = Math.min(cap, Math.max(clip.in + 0.1, from + delta));
    }
    drawTrack();
    drawRuler();
    drawTime();
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    saveSoon();
    drawAll();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

/* Reorder by dragging a clip past its neighbours. Positions are recomputed from
   the array on every swap, so the drop is always where the preview showed it. */
function startDrag(ev, clip, index) {
  const x0 = ev.clientX;
  let moved = false;
  const move = (e) => {
    const delta = e.clientX - x0;
    if (!moved && Math.abs(delta) < 5) return;
    moved = true;
    document.body.classList.add('dragging');
    const i = E.clips.indexOf(clip);
    const px = delta;
    if (px < 0 && i > 0 && Math.abs(px) > clipLen(E.clips[i - 1]) * E.pps * 0.5) {
      E.clips.splice(i - 1, 0, E.clips.splice(i, 1)[0]);
      drawTrack();
    } else if (px > 0 && i < E.clips.length - 1
               && px > clipLen(E.clips[i + 1]) * E.pps * 0.5) {
      E.clips.splice(i + 1, 0, E.clips.splice(i, 1)[0]);
      drawTrack();
    }
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.body.classList.remove('dragging');
    if (moved) { saveSoon(); drawAll(); }
    else seek(startOf(clip.id) + 0.01);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function zoomBy(k) {
  const wrap = $('#ed-track-wrap');
  const centre = (wrap.scrollLeft + wrap.clientWidth / 2) / E.pps;
  E.pps = Math.max(MIN_PPS, Math.min(400, E.pps * k));
  drawTrack(); drawRuler(); drawPlayhead();
  wrap.scrollLeft = Math.max(0, centre * E.pps - wrap.clientWidth / 2);
}

function zoomFit() {
  const wrap = $('#ed-track-wrap');
  const dur = total();
  // Low enough that an hour of footage still fits on one screen — clamping this
  // at a couple of pixels per second made "fit" a no-op on any real project.
  E.pps = dur > 0 ? Math.max(MIN_PPS, (wrap.clientWidth - 40) / dur) : 40;
  drawTrack(); drawRuler(); drawPlayhead();
}

function syncAspect() {
  $$('#ed-aspect button').forEach((b) =>
    b.classList.toggle('on', b.dataset.aspect === (E.project.aspect || 'source')));
}

/* ── export ─────────────────────────────────────────────────────────────── */

async function runExport() {
  if (!E.clips.length) return toast('Nothing on the timeline yet', true);
  await save(true);
  try {
    const job = await api('/api/project-export', { id: E.project.id });
    toast(`Rendering ${clock(total())} — watch the progress bar`, false, 'movie');
    pollJobs(true);
    return job;
  } catch (err) { toast(`Export failed: ${err.message}`, true); }
}

/* ── wiring ─────────────────────────────────────────────────────────────── */

(function wireEditor() {
  $('#ed-close').onclick = closeEditor;
  $('#ed-play').onclick = () => (E.playing ? pause() : play());
  $('#ed-split').onclick = splitAtPlayhead;
  $('#ed-dupe').onclick = duplicateSel;
  $('#ed-del').onclick = removeSel;
  $('#ed-export').onclick = runExport;
  $('#ed-zoom-in').onclick = () => zoomBy(1.6);
  $('#ed-zoom-out').onclick = () => zoomBy(1 / 1.6);
  $('#ed-zoom-fit').onclick = zoomFit;

  $('#ed-name').onchange = () => saveSoon();

  $$('#ed-aspect button').forEach((b) => {
    b.onclick = () => {
      E.project.aspect = b.dataset.aspect;
      syncAspect();
      syncCanvasShape();
      const c = selected();
      if (c) paintFrame(c);
      saveSoon();
    };
  });

  // Clicking the ruler scrubs; clicking empty track space does too.
  const scrub = (ev) => {
    const wrap = $('#ed-track-wrap');
    const r = wrap.getBoundingClientRect();
    seek((ev.clientX - r.left + wrap.scrollLeft) / E.pps);
  };
  $('#ed-ruler').onmousedown = (ev) => {
    scrub(ev);
    const move = (e) => scrub(e);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  // ⌘-scroll over the timeline zooms, like every other timeline on earth.
  $('#ed-track-wrap').addEventListener('wheel', (ev) => {
    if (!ev.metaKey && !ev.ctrlKey) return;
    ev.preventDefault();
    zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  document.addEventListener('keydown', (ev) => {
    if (!E.open) return;
    if (ev.target.tagName === 'INPUT') {
      if (ev.key === 'Escape') ev.target.blur();
      return;
    }
    const shift = ev.shiftKey;
    const cmd = ev.metaKey || ev.ctrlKey;

    /* Every shortcut this editor claims is also one Chrome claims — ⌘D would
       bookmark the page, ⌘S would save it, ⌘← would go back. While the editor
       has the keyboard, we take them and stop the browser seeing them. */
    switch (ev.key) {
      case 'Escape': closeEditor(); break;
      case ' ': ev.preventDefault(); E.playing ? pause() : play(); break;
      case 's': case 'S': ev.preventDefault(); splitAtPlayhead(); break;
      case 'd': case 'D': ev.preventDefault(); duplicateSel(); break;
      case 'k': case 'K': ev.preventDefault(); toggleKey(); break;
      case 'Backspace': case 'Delete': ev.preventDefault(); removeSel(); break;
      case 'ArrowLeft':
        ev.preventDefault();
        if (cmd) nudge(-1); else seek(E.t - (shift ? 1 : 1 / 30));
        break;
      case 'ArrowRight':
        ev.preventDefault();
        if (cmd) nudge(1); else seek(E.t + (shift ? 1 : 1 / 30));
        break;
      case 'ArrowUp': ev.preventDefault(); jumpKey(-1); break;
      case 'ArrowDown': ev.preventDefault(); jumpKey(1); break;
      case '=': case '+': ev.preventDefault(); zoomBy(1.6); break;
      case '-': case '_': ev.preventDefault(); zoomBy(1 / 1.6); break;
      case 'Home': ev.preventDefault(); seek(0); break;
      case 'End': ev.preventDefault(); seek(total()); break;
      default: break;
    }
  }, true);   // capture, so nothing downstream gets a say either

  window.addEventListener('beforeunload', () => { if (E.dirty) save(true); });
})();
