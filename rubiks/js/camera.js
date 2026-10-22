// Camera tutor: scan the 6 faces, solve with the taught algorithms, then
// watch the face pointing at the webcam and step the 3D cube forward when
// the real cube does the move.
//
// Tracking compares what the camera sees against what the solution SAYS the
// back face should look like after each of the next few moves, so it only
// has to tell "matches" from "doesn't" — far easier than reading a move.
import { SCAN_ORDER, stateFromFaces, faceLetters, solve } from './solver.js';
import { parseAlg } from './cube.js';
import { COLORS } from './player.js';

const NAME = { U: 'yellow', D: 'white', F: 'green', B: 'blue', R: 'orange', L: 'red' };
const LETTERS = ['U', 'F', 'R', 'B', 'L', 'D'];
const WATCH = { face: 'B', up: 'U' }; // what the webcam sees while you solve
const LOOKAHEAD = 5;
const STABLE = 3;

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

export function mountCamera(root, api) {
  const $ = (s) => root.querySelector(s);
  const video = $('video'), overlay = $('canvas.cam-overlay');
  const grab = document.createElement('canvas');
  const gctx = grab.getContext('2d', { willReadFrequently: true });
  const panel = $('#camPanel'), hint = $('#camHint');

  const S = {
    mode: 'idle', stream: null, timer: 0,
    scanIdx: 0, raw: {}, refs: null, letters: {},
    solution: null, faces: [], stable: { j: -1, n: 0 }, busy: false, lost: 0, full: false,
  };
  let samples = [];

  // ---------------------------------------------------------- camera
  async function start() {
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    } catch (e) {
      panel.innerHTML = `<p class="cam-err">Camera blocked or not found (${e.name}). Allow camera access for this page and try again.</p>${btn('camStart', 'Try again', true)}`;
      $('#camStart').onclick = start;
      return;
    }
    video.srcObject = S.stream;
    await video.play();
    S.mode = 'scan';
    S.scanIdx = 0;
    S.raw = {};
    tick();
    render();
  }

  function stop() {
    clearTimeout(S.timer);
    S.stream?.getTracks().forEach((t) => t.stop());
    S.stream = null;
  }

  function box(w, h) {
    const size = Math.min(w, h) * 0.56;
    return { x: (w - size) / 2, y: (h - size) / 2, size };
  }

  function sample() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return [];
    const w = 320, h = Math.round((vh / vw) * 320);
    grab.width = w; grab.height = h;
    gctx.drawImage(video, 0, 0, w, h);
    const { x, y, size } = box(w, h);
    const cell = size / 3, r = Math.max(2, Math.round(cell * 0.14));
    const out = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        // raw camera pixels: camera-left is the cube's left as the camera sees it
        const cx = Math.round(x + cell * (col + 0.5)), cy = Math.round(y + cell * (row + 0.5));
        const d = gctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
        let R = 0, G = 0, B = 0;
        for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
        const n = d.length / 4;
        out.push([R / n, G / n, B / n]);
      }
    return out;
  }

  function classify(rgbs) {
    return rgbs.map((c) => {
      const L = lab(c);
      let best = 'U', bd = Infinity;
      for (const k of LETTERS) { const d = dist(L, S.refs[k]); if (d < bd) { bd = d; best = k; } }
      return best;
    }).join('');
  }

  function drawOverlay(read) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    overlay.width = vw; overlay.height = vh;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, vw, vh);
    const { x, y, size } = box(vw, vh);
    const cell = size / 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, vw / 320);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        const i = row * 3 + col;
        ctx.strokeRect(x + col * cell + 4, y + row * cell + 4, cell - 8, cell - 8);
        const c = read ? COLORS[read[i]] : samples[i] ? `rgb(${samples[i].map(Math.round).join(',')})` : null;
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + cell * (col + 0.5), y + cell * (row + 0.5), cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
  }

  function tick() {
    if (!S.stream) return;
    samples = sample();
    let read = null;
    if (S.mode === 'track' && S.refs && samples.length) {
      read = classify(samples);
      track(read);
    }
    drawOverlay(read);
    S.timer = setTimeout(tick, 80);
  }

  // ---------------------------------------------------------- scanning
  function capture() {
    if (samples.length !== 9) return;
    const { face } = SCAN_ORDER[S.scanIdx];
    S.raw[face] = samples.map((c) => c.slice());
    S.scanIdx++;
    if (S.scanIdx === 6) finishScan();
    else render();
  }

  function finishScan() {
    // each centre defines its colour; every other sticker goes to the
    // nearest centre, at most 8 per colour
    S.refs = Object.fromEntries(LETTERS.map((k) => [k, lab(S.raw[k][4])]));
    const pairs = [];
    for (const k of LETTERS)
      S.raw[k].forEach((c, i) => {
        if (i === 4) return;
        const L = lab(c);
        for (const letter of LETTERS) pairs.push({ k, i, letter, d: dist(L, S.refs[letter]) });
      });
    pairs.sort((a, b) => a.d - b.d);
    const got = {}, count = Object.fromEntries(LETTERS.map((k) => [k, 0]));
    for (const p of pairs) {
      const key = p.k + p.i;
      if (got[key] || count[p.letter] >= 8) continue;
      got[key] = p.letter;
      count[p.letter]++;
    }
    S.letters = Object.fromEntries(LETTERS.map((k) => [k, Array.from({ length: 9 }, (_, i) => (i === 4 ? k : got[k + i])).join('')]));
    S.mode = 'review';
    render();
  }

  // ---------------------------------------------------------- solving
  function doSolve() {
    const built = stateFromFaces(S.letters);
    if (built.errors) return render(built.errors);
    panel.querySelector('#camSolve').textContent = 'Solving…';
    setTimeout(() => {
      const res = solve(built.state, { full: S.full });
      if (res.error) return render([res.error]);
      S.solution = res;
      // the back face after every prefix of the solution
      const s = built.state.clone();
      const moves = parseAlg(res.alg.replace(/\[[^\]]*\]/g, ' '));
      S.faces = [faceLetters(s, WATCH.face, WATCH.up)];
      for (const m of moves) { s.move(m); S.faces.push(faceLetters(s, WATCH.face, WATCH.up)); }
      api.load({ kicker: 'Your cube', title: `${res.moves} moves · ${res.steps.length} steps`, alg: res.alg, mask: 'none' });
      S.mode = 'track';
      S.stable = { j: -1, n: 0 };
      render();
    }, 30);
  }

  const score = (a, b) => { let n = 0; for (let i = 0; i < 9; i++) if (a[i] === b[i]) n++; return n; };

  function track(read) {
    if (S.busy) return;
    const idx = api.idx();
    const cur = S.faces[idx];
    const here = score(read, cur);
    let best = -1, bs = 0;
    for (let j = idx + 1; j <= Math.min(idx + LOOKAHEAD, S.faces.length - 1); j++) {
      if (S.faces[j] === cur) continue; // looks identical — can't see this move
      const sc = score(read, S.faces[j]);
      if (sc > bs) { bs = sc; best = j; }
    }
    if (best > 0 && bs >= 8 && bs > here) {
      S.stable = S.stable.j === best ? { j: best, n: S.stable.n + 1 } : { j: best, n: 1 };
      if (S.stable.n >= STABLE) {
        S.busy = true;
        S.stable = { j: -1, n: 0 };
        api.advanceTo(best).then(() => { S.busy = false; status(); });
      }
    } else if (S.stable.n) S.stable = { j: -1, n: 0 };
    S.lost = here >= 7 || bs >= 7 ? 0 : S.lost + 1;
    status();
  }

  // ---------------------------------------------------------- UI
  const btn = (id, label, primary) => `<button class="btn${primary ? ' primary' : ''}" id="${id}">${label}</button>`;

  function netHTML(editable) {
    const face = (k) => `<div class="net-face" style="grid-area:${k}">${[...S.letters[k]].map((l, i) =>
      `<button class="net-cell" ${editable && i !== 4 ? `data-f="${k}" data-i="${i}"` : 'disabled'} style="background:${COLORS[l]}"></button>`).join('')}</div>`;
    return `<div class="net">${LETTERS.map(face).join('')}</div>`;
  }

  function status() {
    if (S.mode !== 'track') return;
    const idx = api.idx(), total = S.faces.length - 1;
    const el = panel.querySelector('#camStatus');
    if (!el) return;
    if (idx >= total) {
      el.innerHTML = '<b>Solved!</b> Nice. Scramble and scan again for another one.';
      hint.textContent = 'Solved';
      return;
    }
    const next = api.nextMove();
    const blind = S.faces[idx + 1] === S.faces[idx];
    el.innerHTML = `<div class="cam-next"><span>Next</span><b>${next.tok}</b></div>
      <div class="cam-stage-name">${next.label || ''}</div>
      ${blind ? `<div class="cam-warn">The camera can't see <b>${next.tok}</b> — do it, then press <b>Space</b> (or keep going, it will catch up).</div>` : ''}
      ${S.lost > 25 ? '<div class="cam-warn">Lost track. Hold the cube in the box, yellow on top, <b>blue facing the camera</b>. Still off? Use ← → or scan again.</div>' : ''}`;
    hint.textContent = `Blue face to the camera · move ${idx + 1} of ${total}`;
  }

  function render(errors) {
    if (S.mode === 'idle') {
      panel.innerHTML = `${btn('camStart', 'Start camera', true)}`;
      $('#camStart').onclick = start;
      hint.textContent = 'Camera off';
      return;
    }
    if (S.mode === 'scan') {
      const { face, up } = SCAN_ORDER[S.scanIdx];
      hint.innerHTML = `Show <b>${NAME[face]}</b> centre · <b>${NAME[up]}</b> on top`;
      panel.innerHTML = `
        <div class="scan-chips">${SCAN_ORDER.map((o, i) => `<span class="scan-chip ${i < S.scanIdx ? 'done' : i === S.scanIdx ? 'now' : ''}" style="--c:${COLORS[o.face]}"></span>`).join('')}</div>
        <p class="cam-big">Face ${S.scanIdx + 1} of 6: hold the <b>${NAME[face]}</b> centre to the camera with <b>${NAME[up]}</b> on top. Fill the grid, keep it flat, then capture.</p>
        <div class="row-btns" style="justify-content:flex-start">${btn('camCap', 'Capture (Enter)', true)}${S.scanIdx ? btn('camBack', 'Redo last') : ''}</div>`;
      $('#camCap').onclick = capture;
      if (S.scanIdx) $('#camBack').onclick = () => { S.scanIdx--; render(); };
      return;
    }
    if (S.mode === 'review') {
      hint.textContent = 'Check the colours';
      panel.innerHTML = `
        <p class="cam-big">Does this match your cube? Tap a sticker to change its colour.</p>
        ${netHTML(true)}
        ${errors ? `<div class="cam-err">${errors.map((e) => `<div>${e}</div>`).join('')}</div>` : ''}
        <label class="cam-toggle"><input type="checkbox" id="camFull" ${S.full ? 'checked' : ''}/> Use full OLL / PLL (one look) instead of 2-look</label>
        <div class="row-btns" style="justify-content:flex-start">${btn('camSolve', 'Solve it', true)}${btn('camRescan', 'Scan again')}</div>`;
      panel.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => {
        const k = b.dataset.f, i = +b.dataset.i;
        const arr = [...S.letters[k]];
        arr[i] = LETTERS[(LETTERS.indexOf(arr[i]) + 1) % 6];
        S.letters[k] = arr.join('');
        render();
      });
      $('#camFull').onchange = (e) => { S.full = e.target.checked; };
      $('#camSolve').onclick = doSolve;
      $('#camRescan').onclick = () => { S.mode = 'scan'; S.scanIdx = 0; render(); };
      return;
    }
    if (S.mode === 'track') {
      panel.innerHTML = `
        <p class="cam-big">Hold it like you solve: <b>yellow on top, green facing you</b> — so <b>blue faces the camera</b>, inside the box. Do the move shown; the cube on the left follows you.</p>
        <div id="camStatus"></div>
        <ol class="cam-steps">${S.solution.steps.map((s) => `<li><b>${s.label}</b> <code>${s.moves}</code></li>`).join('')}</ol>
        <div class="row-btns" style="justify-content:flex-start">${btn('camRescan', 'Scan a new cube')}</div>`;
      $('#camRescan').onclick = () => { S.mode = 'scan'; S.scanIdx = 0; S.raw = {}; render(); };
      status();
    }
  }

  render();

  return {
    stop,
    onKey(e) {
      if (S.mode === 'scan' && e.key === 'Enter') { e.preventDefault(); capture(); return true; }
      if (S.mode === 'track' && e.code === 'Space') { e.preventDefault(); api.advanceTo(api.idx() + 1); return true; }
      return false;
    },
  };
}

