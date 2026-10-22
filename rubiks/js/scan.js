// "Solve mine": turn your scrambled cube around in front of the webcam, it
// picks up each side by itself, then walks you through the solve one move
// at a time.
//
// No order, no buttons while scanning: a side is taken when the box has held
// 9 flat, steady colours for ~0.5 s and its centre is a colour not seen yet.
// Which face is which comes from the 6 centre colours; how each side was
// turned (4 ways each) is found afterwards by trying all 4^6 combinations
// against the piece rules, so it does not matter how the cube was held.
import { SCAN_ORDER, faceGrid, stateFromFaces, solve } from './solver.js';
import { CubePlayer, COLORS } from './player.js';
import { describe } from './movetip.js';
import { parseAlg, NORMAL } from './cube.js';

const LETTERS = ['U', 'F', 'R', 'B', 'L', 'D'];
// Rough webcam colours, only used to name the 6 centres once all are in.
const REF_RGB = { U: [225, 200, 40], D: [220, 222, 222], F: [30, 160, 85], B: [35, 85, 200], R: [240, 115, 35], L: [195, 35, 45] };
const STABLE_FRAMES = 6;   // ~0.5 s at 80 ms a frame
const FLAT_SD = 22;        // max colour spread inside one sticker patch
const NEW_FACE = 160;      // min centre distance to count as a side not seen yet
const STILL = 90;          // max colour change per square between frames (~ΔE 9)

// ---------------------------------------------------------------- colour
function lab([r, g, b]) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
// lightness counts for less than hue: shadows darken, they don't recolour
const dist = (a, b) => 0.35 * (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const REF_LAB = Object.fromEntries(LETTERS.map((k) => [k, lab(REF_RGB[k])]));
const lum = (p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11;

function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

// 3x3 grid (row-major) turned a quarter clockwise, r times
function turn(grid, r) {
  let g = grid;
  for (let k = 0; k < r; k++) g = [6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => g[i]);
  return g;
}

// ---------------------------------------------------------------- reading
// Raw faces -> letters. Takes 5 or 6 sides: with 5, the unseen side comes back
// as '?' stickers (centre known) for inferLast() to fill in.
export function readCube(faces) {
  // name the centres: the assignment of letters that best fits REF colours;
  // with 5 sides the leftover letter is the unseen one
  const centres = faces.map((f) => lab(f.rgb[4]));
  let best = null, bestCost = Infinity;
  for (const perm of permutations(LETTERS)) {
    const cost = centres.reduce((s, c, i) => s + dist(c, REF_LAB[perm[i]]), 0);
    if (cost < bestCost) { bestCost = cost; best = perm; }
  }
  const refs = Object.fromEntries(centres.map((c, i) => [best[i], c]));
  // an unseen centre still needs a reference: its nominal colour
  for (const k of best.slice(faces.length)) refs[k] = REF_LAB[k];
  // every other sticker goes to the nearest centre, at most 8 per colour
  const pairs = [];
  faces.forEach((f, fi) => f.rgb.forEach((c, i) => {
    if (i === 4) return;
    const L = lab(c);
    for (const k of LETTERS) pairs.push({ fi, i, k, d: dist(L, refs[k]) });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const got = {}, count = Object.fromEntries(LETTERS.map((k) => [k, 0]));
  for (const p of pairs) {
    const key = p.fi + ':' + p.i;
    if (got[key] || count[p.k] >= 8) continue;
    got[key] = p.k;
    count[p.k]++;
  }
  const raw = {}, orange = {};
  faces.forEach((f, fi) => {
    raw[best[fi]] = Array.from({ length: 9 }, (_, i) => (i === 4 ? best[fi] : got[fi + ':' + i]));
    // > 0 = looks more like the R (orange) centre than the L (red) one
    orange[best[fi]] = f.rgb.map((c) => { const L = lab(c); return dist(L, refs.L) - dist(L, refs.R); });
  });
  for (const k of best.slice(faces.length)) {
    raw[k] = Array.from({ length: 9 }, (_, i) => (i === 4 ? k : '?'));
    orange[k] = Array(9).fill(0);
  }
  return { raw, orange, missing: best.slice(faces.length)[0] || null };
}

// Red and orange are what webcams mix up, so they are not trusted as read.
// A corner always has exactly one of them and its other two colours fix
// which (handedness); each other colour pairs with red once and orange once
// on the edges, so of those two the more orange-looking sticker is orange.
const det = ([a, b, c]) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const isRL = (l) => l === 'R' || l === 'L';
function resolveRedOrange(faces, orange) {
  const pieces = new Map();
  for (const { face, up } of SCAN_ORDER)
    faceGrid(face, up).forEach((c, i) => {
      const key = c.p.join();
      if (!pieces.has(key)) pieces.set(key, []);
      pieces.get(key).push({ face, i, n: c.n, l: faces[face][i], o: orange[face][i] });
    });
  const edges = {};
  for (const piece of pieces.values()) {
    const rl = piece.filter((t) => isRL(t.l));
    if (rl.length !== 1 || piece.length === 1 || piece.some((t) => t.l === '?')) continue;
    const x = rl[0];
    if (piece.length === 3) {
      const actual = det(piece.map((t) => t.n));
      x.l = ['R', 'L'].find((k) => det(piece.map((t) => NORMAL[t === x ? k : t.l])) * actual > 0) || x.l;
    } else {
      const other = piece.find((t) => t !== x).l;
      (edges[other] ||= []).push(x);
    }
  }
  for (const g of Object.values(edges))
    if (g.length === 2) { g.sort((a, b) => b.o - a.o); g[0].l = 'R'; g[1].l = 'L'; }
  const out = {};
  for (const k of Object.keys(faces)) out[k] = [...faces[k]];
  for (const piece of pieces.values()) for (const t of piece) out[t.face][t.i] = t.l;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('')]));
}

// Every real edge / corner as its sorted colour letters ("FRU", "BD", ...).
const REAL = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++) {
      const p = [x, y, z];
      if (p.filter((v) => v).length < 2) continue;
      REAL.push(Object.keys(NORMAL).filter((f) => NORMAL[f].some((v, i) => v && v === p[i])).sort().join(''));
    }

// Fill the unseen side ('?') from the pieces: every piece touching it shows
// its other colour(s) on the 5 seen sides, and each real piece exists once,
// so what is missing is whatever that piece's set lacks. Returns every
// consistent filling (usually one).
function inferLast(letters) {
  if (!Object.values(letters).some((f) => f.includes('?'))) return [letters];
  const pieces = new Map();
  for (const { face, up } of SCAN_ORDER)
    faceGrid(face, up).forEach((c, i) => {
      const key = c.p.join();
      if (!pieces.has(key)) pieces.set(key, []);
      pieces.get(key).push({ face, i, l: letters[face][i] });
    });
  const used = new Set(), partial = [];
  for (const piece of pieces.values()) {
    if (piece.length === 1) continue;
    const known = piece.filter((t) => t.l !== '?').map((t) => t.l);
    if (known.length === piece.length) {
      const k = [...known].sort().join('');
      if (!REAL.includes(k) || used.has(k)) return [];
      used.add(k);
    } else partial.push({ hole: piece.find((t) => t.l === '?'), known });
  }
  for (const p of partial)
    p.cands = REAL.filter((r) => r.length === p.known.length + 1 && !used.has(r) && p.known.every((l) => r.includes(l)) && new Set(p.known).size === p.known.length);
  const out = [], pick = new Set(), choice = [];
  (function go(i) {
    if (out.length >= 6) return;
    if (i === partial.length) {
      const f = Object.fromEntries(Object.entries(letters).map(([k, v]) => [k, [...v]]));
      partial.forEach((p, j) => { f[p.hole.face][p.hole.i] = [...choice[j]].find((l) => !p.known.includes(l)); });
      out.push(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.join('')])));
      return;
    }
    for (const r of partial[i].cands) {
      if (pick.has(r)) continue;
      pick.add(r); choice[i] = r;
      go(i + 1);
      pick.delete(r);
    }
  })(0);
  return out;
}

// Try every way each side could have been turned (and the red / orange
// centres both ways round); return the first that solves.
export function solveRaw(raw, orange, opts) {
  const order = SCAN_ORDER.map((o) => o.face);
  const swapRL = (l) => (l === 'R' ? 'L' : l === 'L' ? 'R' : l);
  const variants = [
    { raw, orange },
    { raw: { ...raw, R: raw.L.map(swapRL), L: raw.R.map(swapRL), ...Object.fromEntries(['U', 'D', 'F', 'B'].map((k) => [k, raw[k].map(swapRL)])) },
      orange: { ...orange, R: orange.L.map((v) => -v), L: orange.R.map((v) => -v), ...Object.fromEntries(['U', 'D', 'F', 'B'].map((k) => [k, orange[k].map((v) => -v)])) } },
  ];
  let fewest = null;
  const found = [];
  // an unseen side has nothing to turn
  const blind = order.findIndex((k) => raw[k].includes('?'));
  for (const v of variants) for (let code = 0; code < 4096; code++) {
    if (blind >= 0 && (code >> (2 * blind)) & 3) continue;
    const faces = {}, sc = {};
    order.forEach((k, j) => {
      const r = (code >> (2 * j)) & 3;
      faces[k] = turn(v.raw[k], r);
      sc[k] = turn(v.orange[k], r);
    });
    const seen = orange ? resolveRedOrange(faces, sc) : Object.fromEntries(Object.entries(faces).map(([k, g]) => [k, g.join('')]));
    for (const letters of inferLast(seen)) {
      const built = stateFromFaces(letters);
      if (built.errors) {
        if (!fewest || built.errors.length < fewest.length) fewest = built.errors;
        continue;
      }
      // how far this reading strays from what the camera saw: every red/orange
      // sticker it relabelled, weighted by how sure the camera was
      let cost = 0;
      for (const k of order)
        for (let i = 0; i < 9; i++) if (faces[k][i] !== '?' && letters[k][i] !== faces[k][i]) cost += 1 + Math.abs(sc[k]?.[i] || 0) / 100;
      found.push({ state: built.state, cost });
    }
  }
  found.sort((a, b) => a.cost - b.cost);
  // With a side unseen, two different cubes can fit the 5 seen sides equally
  // well (its edges show only one colour each on the seen sides). Never guess
  // between them: say so, and the caller asks for the 6th side.
  let first = null;
  const tried = new Set();
  for (const f of found.slice(0, 40)) {
    const key = f.state.stickers.map((t) => t.c).join('');
    if (tried.has(key)) continue;
    tried.add(key);
    if (first && f.cost > first.cost + 1e-9) break;
    const res = solve(f.state, opts);
    if (res.error) continue;
    if (!first) { first = { res, cost: f.cost }; if (blind < 0) break; continue; }
    return { ambiguous: true };
  }
  // and with a side unseen there is no 6th side to cross-check a red/orange
  // correction against: if one was needed, ask for that side rather than trust it
  if (first && blind >= 0 && first.cost > 0) return { ambiguous: true };
  if (first) return { res: first.res };
  return { errors: fewest || ['Could not read the cube'] };
}

// ---------------------------------------------------------------- UI
export function mountScan(root, api) {
  const $ = (s) => root.querySelector(s);
  const S = { mode: 'idle', stream: null, timer: 0, faces: [], last: null, run: 0, raw: null, errors: null, moves: [], labels: {}, mini: null, gen: 0 };
  const grab = document.createElement('canvas');
  const gctx = grab.getContext('2d', { willReadFrequently: true });
  let cells = [];

  const panel = () => $('#scanPanel');

  async function start() {
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      S.mode = 'idle';
      render(`Camera blocked (${e.name}). Allow the camera for this page.`);
      return;
    }
    S.mode = 'scan';
    S.faces = [];
    S.asked6 = false;
    render();
    const v = $('video');
    v.srcObject = S.stream;
    await v.play();
    tick();
  }

  function stop() {
    clearTimeout(S.timer);
    S.stream?.getTracks().forEach((t) => t.stop());
    S.stream = null;
    S.gen++;
  }

  function box(w, h) {
    const size = Math.min(w, h) * 0.6;
    return { x: (w - size) / 2, y: (h - size) / 2, size };
  }

  function sample(v) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return [];
    const w = 320, h = Math.round((vh / vw) * 320);
    grab.width = w; grab.height = h;
    gctx.drawImage(v, 0, 0, w, h);
    const { x, y, size } = box(w, h);
    const cell = size / 3, r = Math.max(2, Math.round(cell * 0.18));
    const px = (cx, cy, rr) => {
      const d = gctx.getImageData(Math.round(cx) - rr, Math.round(cy) - rr, rr * 2, rr * 2).data, out = [];
      for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
      return out;
    };
    const out = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const cx = x + cell * (col + 0.5), cy = y + cell * (row + 0.5);
        let pts;
        if (row === 1 && col === 1) {
          // Centres often carry a printed logo (a black "Swift Block" + robot
          // can cover most of the white one): read the whole sticker and keep
          // only its 50th-90th percentile by brightness, which drops the logo
          // and any glare whatever their size.
          pts = px(cx, cy, Math.max(2, Math.round(cell * 0.36))).sort((a, b) => lum(a) - lum(b));
          pts = pts.slice(Math.floor(pts.length * 0.5), Math.ceil(pts.length * 0.9));
        } else pts = px(cx, cy, r);
        const n = pts.length;
        const m = [0, 1, 2].map((k) => pts.reduce((t, p) => t + p[k], 0) / n);
        const sd = pts.reduce((t, p) => t + (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2, 0);
        out.push({ rgb: m, sd: Math.sqrt(sd / n / 3) });
      }
    return out;
  }

  function tick() {
    if (!S.stream || S.mode !== 'scan') return;
    const v = $('video');
    cells = v ? sample(v) : [];
    if (cells.length === 9) {
      // Steady = every square's colour barely moved since the last frame.
      // (Not "same colour name": a beige white or a red that sits between red
      // and orange flips names frame to frame and would never count.)
      const labs = cells.map((c) => lab(c.rgb));
      // A scrambled side always mixes colours; 9 of the same is a wall or a shirt.
      const mixed = labs.some((L) => dist(L, labs[4]) > NEW_FACE);
      const flat = mixed && cells.every((c, i) => (i === 4 || c.sd < FLAT_SD) && Math.max(...c.rgb) > 45);
      const still = flat && S.last && labs.every((L, i) => dist(L, S.last[i]) < STILL);
      S.run = flat ? (still ? S.run + 1 : 1) : 0;
      S.last = flat ? labs : null;
      if (S.run === STABLE_FRAMES) take();
    }
    draw();
    S.timer = setTimeout(tick, 80);
  }

  function take() {
    const centre = lab(cells[4].rgb);
    if (S.faces.some((f) => dist(lab(f.rgb[4]), centre) < NEW_FACE)) return;
    S.faces.push({ rgb: cells.map((c) => c.rgb.slice()) });
    if (navigator.vibrate) navigator.vibrate(30);
    root.querySelector('.scan-cam')?.classList.remove('flash');
    void root.offsetWidth;
    root.querySelector('.scan-cam')?.classList.add('flash');
    chips();
    if (S.faces.length === 5 && !S.asked6) tryFive();
    else if (S.faces.length === 6) finish();
  }

  // 5 sides are usually enough (the last one is worked out from the pieces),
  // so the logo side can be left for last and mostly never shown. The camera
  // keeps running; if the 5 fit more than one cube, ask for the 6th.
  function tryFive() {
    S.mode = 'reading';
    say('Reading your cube…');
    setTimeout(() => {
      const rc = readCube(S.faces);
      const out = solveRaw(rc.raw, rc.orange, { full: false });
      if (out.res) {
        stop();
        ({ raw: S.raw, orange: S.orange } = rc);
        startGuide(out.res);
        return;
      }
      S.asked6 = true;
      S.mode = 'scan';
      S.run = 0;
      S.last = null;
      say('Almost! Show the <b>last side</b> too.');
      chips();
      tick();
    }, 40);
  }

  function say(html) {
    const el = $('.scan-say');
    if (el) el.innerHTML = html;
  }

  function draw() {
    const v = $('video'), cv = $('canvas.scan-overlay');
    if (!v || !cv || !v.videoWidth) return;
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    const ctx = cv.getContext('2d');
    const { x, y, size } = box(cv.width, cv.height);
    const cell = size / 3;
    const ready = S.run > 0 ? Math.min(1, S.run / STABLE_FRAMES) : 0;
    ctx.lineWidth = Math.max(3, cv.width / 200);
    ctx.strokeStyle = ready ? `rgba(255,210,0,${0.5 + ready / 2})` : 'rgba(255,255,255,0.8)';
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        ctx.strokeRect(x + col * cell + 5, y + row * cell + 5, cell - 10, cell - 10);
        const c = cells[row * 3 + col];
        if (!c) continue;
        ctx.fillStyle = `rgb(${c.rgb.map(Math.round).join(',')})`;
        ctx.beginPath();
        ctx.arc(x + cell * (col + 0.5), y + cell * (row + 0.5), cell * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  function chips() {
    const el = $('#scanChips');
    if (!el) return;
    el.innerHTML = Array.from({ length: 6 }, (_, i) => {
      const f = S.faces[i];
      const optional = i === 5 && !S.asked6 && !f;
      return `<span class="scan-chip${f ? ' done' : ''}${optional ? ' optional' : ''}" style="--c:${f ? `rgb(${f.rgb[4].map(Math.round).join(',')})` : 'transparent'}"></span>`;
    }).join('') + `<span class="scan-count">${S.faces.length}/${S.asked6 ? 6 : 5}</span>`;
  }

  function finish() {
    stop();
    S.mode = 'thinking';
    render();
    setTimeout(() => {
      ({ raw: S.raw, orange: S.orange } = readCube(S.faces));
      S.edited = false;
      solveNow();
    }, 40);
  }

  function solveNow() {
    const out = solveRaw(S.raw, S.edited ? null : S.orange, { full: false });
    if (out.errors) {
      S.mode = 'fix';
      S.errors = out.errors;
      render();
      return;
    }
    startGuide(out.res);
  }

  function startGuide(res) {
    const steps = [], labels = {};
    for (const st of res.steps) {
      labels[steps.length] = simpleLabel(st.label);
      for (const m of parseAlg(st.moves)) steps.push(m.tok);
    }
    S.moves = steps;
    S.labels = labels;
    api.load({ kicker: 'Your cube', title: `${steps.length} moves`, alg: res.alg, mask: 'none' });
    S.mode = 'guide';
    render();
  }

  // ---- guide: one move at a time
  function stageAt(i) {
    let l = '';
    for (const k of Object.keys(S.labels)) if (+k <= i) l = S.labels[k];
    return l;
  }

  async function loopMini(tok) {
    const g = ++S.gen;
    const mv = parseAlg(tok)[0];
    while (g === S.gen && S.mini) {
      S.mini.reset();
      S.mini.dimExcept(mv);
      await new Promise((r) => setTimeout(r, 400));
      if (g !== S.gen) return;
      await S.mini.animate(mv, 750);
      if (g !== S.gen) return;
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  // The skeleton (and its mini cube) is built once; each move only updates text.
  function guide() {
    const el = $('#guide');
    if (!el) return;
    if (!$('#gMini')) {
      el.innerHTML = `
        <div class="g-top"><span class="g-stage" id="gStage"></span><span class="g-count" id="gCount"></span></div>
        <div class="g-bar"><i id="gBar"></i></div>
        <div class="g-main">
          <div class="g-mini" id="gMini"></div>
          <div><div class="g-move" id="gMove"></div><div class="g-say" id="gSay"></div></div>
        </div>
        <div class="row-btns g-btns">${btn('gBack', '← Back')}<button class="btn primary g-ok" id="gOk">Done ✓</button></div>
        <div class="g-next" id="gNext"></div>
        <div class="g-done" id="gDone" hidden>Solved!</div>
        <div class="row-btns" id="gAgainRow" hidden>${btn('scanAgain', 'Scan another', true)}</div>`;
      S.mini = new CubePlayer($('#gMini'), { interactive: false });
      $('#gOk').onclick = forward;
      $('#gBack').onclick = back;
      $('#scanAgain').onclick = start;
    }
    const i = api.idx(), total = S.moves.length, done = i >= total;
    $('#gDone').hidden = $('#gAgainRow').hidden = !done;
    el.querySelectorAll('.g-top, .g-bar, .g-main, .g-btns, .g-next').forEach((x) => { x.hidden = done; });
    if (done) { S.gen++; return; }
    const tok = S.moves[i], d = describe(tok);
    $('#gStage').textContent = stageAt(i);
    $('#gCount').textContent = `${i + 1} / ${total}`;
    $('#gBar').style.width = `${(i / total) * 100}%`;
    $('#gMove').textContent = tok;
    $('#gSay').innerHTML = d ? `${d.what}<br><b>${d.how}</b>` : '';
    $('#gNext').textContent = S.moves.length > i + 1 ? `then  ${S.moves.slice(i + 1, i + 4).join('  ')}` : '';
    loopMini(tok);
  }

  // Presses queue up: each one runs after the last move has finished, so
  // tapping fast can never replay a move or skip one.
  let chain = Promise.resolve();
  function forward() {
    chain = chain.then(async () => {
      if (S.mode !== 'guide' || api.idx() >= S.moves.length) return;
      await api.advanceTo(api.idx() + 1);
      guide();
    });
  }
  function back() {
    chain = chain.then(async () => {
      if (S.mode !== 'guide') return;
      await api.back();
      guide();
    });
  }

  // ---- render
  const btn = (id, label, primary) => `<button class="btn${primary ? ' primary' : ''}" id="${id}">${label}</button>`;

  function render(err) {
    const p = panel();
    if (S.mode === 'idle') {
      p.innerHTML = `${err ? `<div class="scan-err">${err}</div>` : ''}
        <button class="btn primary scan-go" id="scanStart">Start camera</button>`;
      $('#scanStart').onclick = start;
      return;
    }
    if (S.mode === 'scan') {
      p.innerHTML = `
        <div class="scan-cam"><video playsinline muted></video><canvas class="scan-overlay"></canvas></div>
        <div class="scan-row"><div class="scan-chips" id="scanChips"></div><button class="btn" id="scanReset">Start over</button></div>
        <p class="scan-say">Turn the cube slowly and show <b>5 sides</b> in the box. Leave the logo side for last; it's usually not needed.</p>`;
      chips();
      $('#scanReset').onclick = () => {
        S.faces = []; S.asked6 = false; S.mode = 'scan';
        say('Turn the cube slowly and show <b>5 sides</b> in the box. Leave the logo side for last; it\'s usually not needed.');
        chips();
      };
      return;
    }
    if (S.mode === 'thinking') {
      p.innerHTML = '<div class="scan-say big">Reading your cube…</div>';
      return;
    }
    if (S.mode === 'fix') {
      p.innerHTML = `
        <div class="scan-say big">Some colours look wrong.</div>
        <p class="scan-say">Tap a square to change it, then Solve. Or scan again in brighter light.</p>
        <div class="fix-faces">${LETTERS.map((k) => `<div class="fix-face">${S.raw[k].map((l, i) =>
          `<button class="fix-cell" ${i === 4 ? 'disabled' : `data-k="${k}" data-i="${i}"`} style="background:${COLORS[l]}"></button>`).join('')}</div>`).join('')}</div>
        <div class="row-btns">${btn('fixSolve', 'Solve', true)}${btn('scanAgain', 'Scan again')}</div>`;
      p.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
        const arr = S.raw[b.dataset.k];
        arr[+b.dataset.i] = LETTERS[(LETTERS.indexOf(arr[+b.dataset.i]) + 1) % 6];
        b.style.background = COLORS[arr[+b.dataset.i]];
        S.edited = true; // trust the hand-fixed colours as they are
      });
      $('#fixSolve').onclick = () => { S.mode = 'thinking'; render(); setTimeout(solveNow, 40); };
      $('#scanAgain').onclick = start;
      return;
    }
    if (S.mode === 'guide') {
      p.innerHTML = `<p class="scan-hold">Hold it: <b>yellow on top</b>, <b>green facing you</b></p><div id="guide"></div>`;
      guide();
    }
  }

  render();

  return {
    stop,
    // ?debug: feed 6 captured sides ({ rgb: [9 x [r,g,b]] }) without a camera
    feed(faces) { stop(); S.faces = faces; S.asked6 = false; faces.length === 5 ? tryFive() : finish(); },
    sampleFrom: (src) => sample(src),
    onKey(e) {
      if (S.mode !== 'guide') return false;
      if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); forward(); return true; }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); back(); return true; }
      return false;
    },
  };
}

// "F2L · front-right · case 12" -> "F2L · front-right"
function simpleLabel(l) {
  if (l === 'AUF') return 'Last turn';
  return l.replace(/\s*·\s*case \d+$/i, '').replace(/^F2L · take pieces out of (.*)$/, 'F2L · free the $1 gap');
}
