import { CubeState, parseAlg, invertAlg, algToString, simplify, removeYRotations, eq } from './cube.js';
import { CubePlayer } from './player.js';
import { isoSVG, topSVG } from './thumbs.js';
import * as C from './content.js';
import { algHTML, describe, mountMoveTips } from './movetip.js';
import { mountScan } from './scan.js';
import { demoHTML, mountDemos } from './loopdemo.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- player
const player = new CubePlayer($('#viewport'));
const ui = {
  moves: $('#moves'), play: $('#btnPlay'), loop: $('#btnLoop'),
  kicker: $('#stageKicker'), title: $('#stageTitle'), view: $('#viewBtn'), say: $('#mvSay'),
};
// Loop is on by default: a case keeps replaying until you pause it.
const P = { steps: [], labels: {}, setup: [], idx: 0, playing: false, loop: true, gen: 0, view: 'top' };
mountMoveTips();

// "[Label] R U R'" -> steps + label positions
function parseWithLabels(str) {
  const steps = [], labels = {};
  for (const tok of (str || '').match(/\[[^\]]*\]|[^\s()]+/g) || []) {
    if (tok[0] === '[') labels[steps.length] = tok.slice(1, -1);
    else steps.push(parseAlg(tok)[0]);
  }
  return { steps, labels };
}

function load(c, { autoplay = false } = {}) {
  P.gen++;
  P.playing = false;
  const { steps, labels } = parseWithLabels(c.alg);
  P.steps = steps;
  P.labels = labels;
  P.setup = c.setup !== undefined ? parseAlg(c.setup) : invertAlg(steps);
  P.idx = 0;
  P.mask = c.mask || 'none';
  player.reset();
  player.setMask(P.mask);
  setView(c.view || 'top', true);
  player.applyNow(P.setup);
  ui.kicker.textContent = c.kicker || '';
  ui.title.textContent = c.title || '';
  renderMoves();
  syncPlay();
  if (autoplay && steps.length) {
    const g = P.gen;
    setTimeout(() => { if (g === P.gen) play(); }, 550);
  }
}

function setView(v, snap = false) {
  P.view = v;
  player.setView(v, snap);
  ui.view.textContent = v === 'bottom' ? 'Top view' : 'Bottom view';
}
ui.view.addEventListener('click', () => setView(P.view === 'bottom' ? 'top' : 'bottom'));

function renderMoves() {
  if (!P.steps.length) {
    ui.moves.innerHTML = '<span class="empty">Pick a case to see it move.</span>';
    return;
  }
  let h = '';
  P.steps.forEach((m, i) => {
    if (P.labels[i] !== undefined) h += `<span class="mv-label" data-i="${i}">${esc(P.labels[i])}</span>`;
    const pre = algToString(P.setup.concat(P.steps.slice(0, i)));
    h += `<button class="mv" data-i="${i}" data-mv="${esc(m.tok)}" data-pre="${esc(pre)}" data-view="${P.view}">${esc(m.tok)}</button>`;
  });
  ui.moves.innerHTML = h;
  markMoves();
}

function markMoves() {
  ui.moves.querySelectorAll('.mv').forEach((b) => {
    const i = +b.dataset.i;
    b.classList.toggle('done', i < P.idx);
    b.classList.toggle('next', i === P.idx && P.playing);
  });
  const cur = ui.moves.querySelector('.mv.next');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  sayMove();
}

// The move under way (or up next) in plain words, under the move strip.
function sayMove() {
  if (!P.steps.length) { ui.say.innerHTML = ''; return; }
  if (P.idx >= P.steps.length) {
    ui.say.innerHTML = `<span class="dim">${P.playing && P.loop ? 'Done. Playing it again…' : 'Done. Press play to watch it again.'}</span>`;
    return;
  }
  const tok = P.steps[P.idx].tok, d = describe(tok);
  ui.say.innerHTML = `<span class="say-k">${P.playing ? 'Now' : 'Next'}</span><b>${esc(tok)}</b>` +
    (d ? `<span>${esc(d.what)}: ${esc(d.how)}</span>` : '');
}

function syncPlay() {
  ui.play.classList.toggle('playing', P.playing);
  ui.loop.classList.toggle('on', P.loop);
  markMoves();
}

// Jump anywhere: rebuild from the setup instantly.
function seek(i) {
  P.gen++;
  P.playing = false;
  player.reset();
  player.applyNow(P.setup);
  player.applyNow(P.steps.slice(0, i));
  P.idx = i;
  syncPlay();
}

async function play() {
  if (!P.steps.length) return;
  if (P.idx >= P.steps.length) seek(0);
  const g = ++P.gen;
  P.playing = true;
  syncPlay();
  while (g === P.gen && P.idx < P.steps.length) {
    markMoves();
    if (await player.animate(P.steps[P.idx])) P.idx++;
    if (g !== P.gen) { syncPlay(); return; }
    markMoves();
    if (P.idx >= P.steps.length && P.loop) {
      await wait(900);
      if (g !== P.gen) return;
      seek(0);
      P.gen = g;
      P.playing = true;
      await wait(350);
    }
  }
  if (g !== P.gen) return;
  P.playing = false;
  syncPlay();
  // show the finished result for a beat, then go back to the first step
  await wait(1300);
  if (g === P.gen) seek(0);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pause() { P.gen++; P.playing = false; syncPlay(); }

let stepping = false;
async function step(dir) {
  if (stepping) return;
  pause();
  stepping = true;
  if (dir > 0 && P.idx < P.steps.length) {
    if (await player.animate(P.steps[P.idx], 220)) P.idx++;
  } else if (dir < 0 && P.idx > 0) {
    if (await player.animateInverse(P.steps[P.idx - 1], 220)) P.idx--;
  }
  stepping = false;
  syncPlay();
}

// Used by "Solve mine": step forward / back one move, animated.
const guideApi = {
  load: (c) => load(c),
  idx: () => P.idx,
  async advanceTo(j) {
    pause();
    j = Math.min(j, P.steps.length);
    while (P.idx < j) {
      if (!(await player.animate(P.steps[P.idx], 260))) break;
      P.idx++;
      syncPlay();
    }
  },
  async back() {
    pause();
    if (P.idx > 0 && (await player.animateInverse(P.steps[P.idx - 1], 260))) P.idx--;
    syncPlay();
  },
};

ui.play.addEventListener('click', () => (P.playing ? pause() : play()));
$('#btnNext').addEventListener('click', () => step(1));
$('#btnPrev').addEventListener('click', () => step(-1));
$('#btnRestart').addEventListener('click', () => seek(0));
ui.loop.addEventListener('click', () => { P.loop = !P.loop; syncPlay(); });
$('#speed').addEventListener('input', (e) => {
  player.speed = +e.target.value;
  $('#speedVal').textContent = (+e.target.value).toFixed(2).replace(/0$/, '') + '×';
});
ui.moves.addEventListener('click', (e) => {
  const t = e.target.closest('[data-i]');
  if (t) seek(+t.dataset.i);
});

// ---------------------------------------------------------------- helpers
const stateFor = (alg, setup) => {
  const s = new CubeState();
  if (setup !== undefined) return s.apply(setup);
  return s.apply(invertAlg(parseWithLabels(alg).steps));
};

function caseCard(c, i) {
  return `<button class="card" data-case="${i}">
    <div class="thumb">${c.svg}</div>
    <div class="row">${c.num ? `<span class="num">${c.num}</span>` : ''}<span class="name">${esc(c.name)}</span></div>
    <code class="alg">${algHTML(c.alg)}</code>
    ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
  </button>`;
}

// Wire every [data-case] in the lesson to a list of case objects.
let registry = [];
function register(c) { registry.push(c); return registry.length - 1; }

// "Then: ... ▸" takes you to the card that picks up where a case left you. It
// does not play it: you compare first. That card stays highlighted with a
// note of where you came from (and the U turn to do first), and "← Back".
let pathSeq = 0;
function pick(card, from, auf) {
  document.querySelectorAll('.case-demo.picked').forEach((c) => c.classList.remove('picked'));
  document.querySelectorAll('.from-bar').forEach((x) => x.remove());
  card.classList.add('picked');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!from) return;
  if (!from.id) from.id = `case-from-${++pathSeq}`;
  const name = [from.querySelector('.case-n')?.textContent, from.querySelector('.case-t')?.textContent].filter(Boolean).join(' · ');
  card.insertAdjacentHTML('afterbegin', `<div class="from-bar"><button class="back" data-back="${from.id}">← Back</button>
    <span>From <b>${esc(name)}</b>${auf ? `. Turn <b>${esc(auf)}</b> first, then compare.` : '. Compare with your cube.'}</span></div>`);
}
$('#lesson').addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (back) return pick(document.getElementById(back.dataset.back));
  const b = e.target.closest('[data-goto]');
  if (!b) return;
  const t = document.getElementById(b.dataset.goto);
  if (t) pick(t, b.closest('.case-demo'), b.querySelector('b')?.textContent || '');
});

$('#lesson').addEventListener('click', (e) => {
  const card = e.target.closest('[data-case]');
  if (!card) return;
  document.querySelectorAll('.card.active').forEach((x) => x.classList.remove('active'));
  card.classList.add('active');
  load(registry[+card.dataset.case], { autoplay: true });
  if (window.matchMedia('(max-width: 900px)').matches)
    $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// PLL recognition cards: a real case + which side stickers to look at.
const isCorner = (t) => t.p[0] !== 0 && t.p[2] !== 0;
const pll = (name) => C.PLL_2LOOK.find((c) => c.name.startsWith(name)).alg;
const RECOG_A = [
  { title: 'Headlights on all 4 sides', text: 'Every side has matching corners → corners are done. Go to Part B.', alg: pll('Ua'), hl: isCorner },
  { title: 'Headlights on 1 side → T perm', text: 'One side has matching corners (outlined). Turn U so they are on the LEFT, then T perm. Edges can still be wrong after — normal, go to Part B.', alg: pll('T perm'), hl: (t) => isCorner(t) && t.n[0] === -1 },
  { title: 'No headlights → Y perm', text: 'No side has matching corners. Do Y perm from any angle. Then go to Part B for the edges.', alg: pll('Y perm'), hl: isCorner },
];
const RECOG_B = [
  { title: 'Solved bar → Ua', text: 'Hold the solved side at the BACK. Front edge is the same colour as the RIGHT side (its corners) → Ua.', alg: pll('Ua'), hl: (t) => t.n[2] === -1 || (t.n[2] === 1 && t.p[0] === 0) || (t.n[0] === 1 && isCorner(t)) },
  { title: 'Solved bar → Ub', text: 'Hold the solved side at the BACK. Front edge is the same colour as the LEFT side (its corners) → Ub.', alg: pll('Ub'), hl: (t) => t.n[2] === -1 || (t.n[2] === 1 && t.p[0] === 0) || (t.n[0] === -1 && isCorner(t)) },
  { title: 'Checkerboard → H perm', text: 'No solved side. Every middle sticker is the colour of the OPPOSITE side.', alg: pll('H'), hl: (t) => !isCorner(t) },
  { title: 'Neighbours swapped → Z perm', text: 'No solved side. Middles match the side NEXT to them. Hold so the front edge belongs on the left.', alg: pll('Z'), hl: (t) => !isCorner(t) },
];
function recog(list) {
  return list.map((r) => {
    const i = register({ kicker: 'PLL · recognise', title: r.title, alg: r.alg, mask: 'none' });
    return `<button class="card" data-case="${i}"><div class="thumb">${topSVG(stateFor(r.alg), 'none', false, r.hl)}</div>
      <div class="row"><span class="name">${esc(r.title)}</span></div><div class="note">${esc(r.text)}</div></button>`;
  }).join('');
}

// A "what you might have right now" card: title, what to do, looping demo.
// Starts paused on the position to look for; cases() numbers them.
function caseDemo(title, text, demo, label = 'Case %N%', id = '') {
  return `<div class="case-demo"${id ? ` id="${id}"` : ''}><div class="case-n">${label}</div>${demoHTML({ pieces: 'pair', paused: true, ...demo })}${
    title ? `<div class="case-t">${title}</div>` : ''}${text ? `<div class="case-x">${text}</div>` : ''}</div>`;
}
const inv = (alg) => algToString(invertAlg(parseWithLabels(alg).steps));
const plain = (alg) => alg.replace(/\[[^\]]*\]\s*/g, '');
// One numbered how-to step: text plus either a looping demo or a grid of case demos.
const howStep = (n, html, demo = '') => `<div class="howto-row${demo.startsWith('<div class="cases') ? ' wide' : ''}"><span class="howto-n">${n}</span>${
  demo.startsWith('<div class="cases') ? `<div>${html}${demo}</div>` : `<div>${html}</div>${demo}`}</div>`;
// ---- paths: where a case leaves you, and which card picks up from there.
// Tries every card's moves (after a U turn if needed) on the end position and
// links the first that finishes the job.
const AUFS = ['', 'U', "U'", 'U2'];
const endOf = (setup, alg) => new CubeState().apply(setup).apply(plain(alg));
function nextCase(state, algs, done) {
  for (const a of AUFS)
    for (let i = 0; i < algs.length; i++) {
      const t = state.clone();
      if (a) t.apply(a);
      if (done(t.apply(plain(algs[i])))) return { i, a };
    }
  return null;
}
const pairIn = (s) => s.pieceSolved([1, -1, 1]) && s.pieceSolved([1, 0, 1]);
const topYellow = (s) => s.stickers.filter((t) => t.c === 'U').every((t) => t.n[1] === 1);
const solvedUpToU = (s) => AUFS.some((a) => (a ? s.clone().apply(a) : s).isSolved());
const thenBtn = (id, a, label) =>
  `<button class="then" data-goto="${id}">Then: ${a ? `turn <b>${a}</b>, ` : ''}it's ${label} ▸</button>`;
// The one general "what now" line for a whole set of cases.
const nextLine = (html) => `<div class="next-line"><b>Next</b> ${html}</div>`;

const cases = (list) => `<div class="cases">${list.map((c, i) => c.replace('%N%', i + 1)).join('')}</div>`;

// ---------------------------------------------------------------- lessons
const LESSONS = {
  mine: {
    label: 'Solve mine',
    render() {
      return `
      <div class="kicker">Your cube</div>
      <h2>Solve my cube</h2>
      <div id="scanPanel" class="scan-panel"></div>`;
    },
    mount() {
      scanner = mountScan($('#lesson'), guideApi);
      if (/[?&]debug\b/.test(location.search)) Object.assign(window, { __scanner: scanner, __player: player, __P: P });
    },
    unmount() { scanner?.stop(); scanner = null; },
    stage: () => ({ kicker: 'Your cube', title: 'Scan it to start', alg: '', setup: '', mask: 'none' }),
  },

  notation: {
    label: 'Notation',
    render() {
      const block = (list) => `<div class="grid wide">${list.map((n) => {
        const i = register({ kicker: 'Notation', title: n.name, alg: n.alg, setup: '', mask: 'none' });
        return `<button class="card text" data-case="${i}"><span class="big" data-mv="${esc(n.alg)}">${esc(n.name.split(' ')[0])}</span><span class="note">${esc(n.note)}</span></button>`;
      }).join('')}</div>`;
      return `
      <div class="kicker">Reference</div>
      <h2>Notation</h2>
      <p class="lead">Every algorithm is written in these letters. A letter alone is a clockwise quarter turn of that face, as if you were looking straight at it. <code>'</code> means counter-clockwise, <code>2</code> means half turn.</p>
      <p>Hold the cube with <strong>yellow on top and green in front</strong>. Tap a move to see it.</p>
      <h3>Face turns</h3>${block(C.NOTATION.faces)}
      <h3>Wide turns and slices</h3>
      <p>Lowercase means two layers together. <code>M</code> is the middle slice between L and R.</p>${block(C.NOTATION.wide)}
      <h3>Cube rotations</h3>
      <p>Rotate the whole cube in your hands. Rotations are slow in a real solve — the F2L algorithms here avoid them.</p>${block(C.NOTATION.rotations)}`;
    },
    stage: () => ({ kicker: 'Notation', title: 'Tap a move', alg: '', setup: '', mask: 'none' }),
  },

  cross: {
    label: 'Cross',
    render() {
      return `
      <div class="kicker">Step 1</div>
      <h2>Cross — in 8 moves or less</h2>
      <p class="lead">White edges around the white centre, on the <strong>bottom</strong>. Aim for 8 moves or less.</p>
      <div class="howto">
        ${howStep(1, '<strong>White on the bottom.</strong> The cross is built on the bottom, never on top. Yellow up, green facing you.',
          demoHTML({ setup: 'z2', alg: 'z2', mask: 'cross', view: 'bottom', caption: 'Seen from below: white ends up on the bottom.' }))}
        ${howStep(2, '<strong>Pick one white edge.</strong> A white edge has white + one other colour. That colour tells you where it goes: between white and the centre of that colour.',
          demoHTML({ setup: inv('U F2'), alg: 'U F2', pieces: 'crossEdge', view: 'bottom', caption: 'White-green edge goes between the white and green centres.' }))}
        ${howStep(3, '<strong>Where is it right now?</strong> Every place the white-green edge can be, seen from below. Only it and its two centres are lit. Find yours, tap ▶ to see the fix:',
          cases([...C.CROSS_ALL, C.CROSS.find((c) => c.name.startsWith('In the wrong bottom slot'))].map((c) =>
            caseDemo(esc(c.name), c.note ? esc(c.note) : '', { setup: inv(c.alg), alg: c.alg, pieces: 'crossEdge', view: 'bottom' })))
          + nextLine('Edge is in. Do the next white edge the same way.'))}
        ${howStep(4, '<strong>Do all four.</strong> Same thing for white-orange, white-blue, white-red. Plan them all in the 15 s inspection, then go without stopping.',
          demoHTML({ setup: inv("F' R D2 L' B' D' F2"), alg: "F' R D2 L' B' D' F2", mask: 'cross', view: 'bottom', caption: 'A whole cross in 7 moves.' }))}
      </div>
      <ul class="tips">
        <li>Plan all four edges in the 15 s inspection, then do it without stopping.</li>
        <li>Keep white on the bottom the whole time — never solve it on top and flip.</li>
      </ul>
`;
    },
    stage: () => ({ kicker: 'Cross', title: 'Pick a case', alg: '', setup: '', mask: 'cross', view: 'bottom' }),
  },

  f2l: {
    label: 'F2L',
    render() {
      const STUCK = [
        { title: 'Both on top', text: 'Good, nothing to lift.', setup: "R U' R' U", alg: 'U U U U' },
        { title: 'Edge in the gap, colours match', text: 'Looks almost done, but the corner is up top. <b>R U R\'</b> lifts the edge out.', setup: "R U R' U2 R U R'", alg: "R U R'" },
        { title: 'Edge in the gap, flipped', text: 'Edge colours are the wrong way round. <b>R U R\'</b> lifts it out.', setup: "F' U' F U R U' R'", alg: "R U R'" },
        { title: 'Corner in the bottom, white facing you', text: 'Front shows green, white, green along the bottom. <b>R U R\'</b> lifts it up.', setup: "R U R' U' R U R'", alg: "R U R'" },
        { title: 'Corner in the bottom, white facing right', text: 'White shows on the right side. <b>R U R\'</b> lifts it up.', setup: "R U' R' U R U' R'", alg: "R U R'" },
        { title: 'Corner in the bottom, white facing down', text: 'Corner is in place, but the edge is still up top. <b>R U R\'</b> lifts the corner so they can pair.', setup: "F' U F U R U' R'", alg: "R U R'" },
        { title: 'Both in the gap, corner white facing you', text: 'Both are in, but twisted. <b>R U R\'</b> takes both out.', setup: "R U' R' U R U2 R' U R U' R'", alg: "R U R'" },
        { title: 'Both in the gap, corner white facing right', text: 'Both are in, but twisted. <b>R U R\'</b> takes both out.', setup: "F' U F U2 R U R' U R U' R'", alg: "R U R'" },
        { title: 'Both in the gap, edge flipped', text: 'Corner looks right, edge is flipped. <b>R U R\'</b> takes both out.', setup: "F' U F U' R U2 R' U2 R U' R'", alg: "R U R'" },
        { title: 'Stuck in a different gap', text: 'Spin the cube (<b>y\'</b> / <b>y</b>) so that gap is at the front-right, <b>R U R\'</b>, spin back.', setup: "F' U F y' R U' R' y", alg: "y' R U R' y" },
      ];
      const groups = Object.fromEntries(C.F2L_GROUPS.map((g) => [g.key, []]));
      C.F2L.forEach((alg, k) => {
        const s = stateFor(alg);
        const corner = s.stickers.find((t) => eq(t.home, [1, -1, 1]) && t.c === 'D');
        const edge = s.stickers.find((t) => eq(t.home, [1, 0, 1]) && t.c === 'F');
        const cTop = corner.p[1] === 1, eTop = edge.p[1] === 1;
        const key = k < 4 ? 'basic' : cTop && eTop ? (corner.n[1] === 1 ? 'up' : 'side') : cTop ? 'edgeSlot' : eTop ? 'cornerSlot' : 'both';
        groups[key].push(caseDemo('', C.F2L_NOTES[k] ? esc(C.F2L_NOTES[k]) : '', { setup: inv(alg), alg }, `Case ${k + 1}`, `f2l-${k + 1}`));
      });
      const body = C.F2L_GROUPS.map((g) => `
        <div class="group-head"><h3>${esc(g.title)}</h3><span class="count">${groups[g.key].length}</span></div>
        <p class="group-note">${esc(g.note)}</p>
        <div class="cases">${groups[g.key].join('')}</div>`).join('');
      return `
      <div class="kicker">Step 2</div>
      <h2>F2L — first two layers</h2>
      <p class="lead">Cross done? Now fill the 4 gaps next to it. Each gap takes one <strong>corner</strong> and one <strong>edge</strong>, and they go in together as a pair.</p>
      <div class="howto">
        <div class="howto-row"><span class="howto-n">1</span><div><strong>Hold it right.</strong> White cross on the <strong>bottom</strong>, yellow on top, <strong>green facing you</strong>. You always work on the gap at the <strong>front-right</strong>: between green (front) and orange (right).</div>
          ${demoHTML({ setup: 'z2', alg: 'z2', mask: 'f2l', caption: 'White on top? Flip it over.' })}</div>
        <div class="howto-row wide"><span class="howto-n">2</span><div><strong>Find the two pieces.</strong> The <strong>corner</strong> has white + green + orange. The <strong>edge</strong> has green + orange (no white, no yellow). They need to be in the <strong>top layer</strong>. Where are yours right now? Only those two pieces are lit below. <strong>Anything stuck: the fix is always <span class="tok" data-mv="R">R</span> <span class="tok" data-mv="U">U</span> <span class="tok" data-mv="R'">R'</span>.</strong>
          ${cases(STUCK.map((c) => {
            const n = nextCase(endOf(c.setup, c.alg), C.F2L, pairIn);
            return caseDemo(c.title, `${c.text} ${n ? thenBtn(`f2l-${n.i + 1}`, n.a, `Case ${n.i + 1} below`) : ''}`, { setup: c.setup, alg: c.alg });
          }))}</div></div>
        <div class="howto-row"><span class="howto-n">3</span><div><strong>Put the corner above the gap.</strong> Turn the top (<span class="tok" data-mv="U">U</span> / <span class="tok" data-mv="U'">U'</span>) until the corner is at the top front-right, right over the gap.</div>
          ${demoHTML({ setup: "R U' R' U2", alg: 'U2', pieces: 'pair', caption: 'Corner ends up over the front-right gap.' })}</div>
        <div class="howto-row"><span class="howto-n">4</span><div><strong>Look at two things:</strong> which way the corner's <strong>white sticker</strong> faces (you, right, or up), and <strong>where the edge</strong> is. Find the matching picture below and do its moves.</div>
          ${demoHTML({ setup: "R U' R'", alg: "R U R'", pieces: 'pair', caption: 'White faces right, edge at the back → <b>R U R\'</b>' })}</div>
        <div class="howto-row"><span class="howto-n">5</span><div><strong>Next gap.</strong> Spin the whole cube (<span class="tok" data-mv="y">y</span>) so the next empty gap is at the front-right, and repeat.</div>
          ${demoHTML({ alg: 'y', mask: 'f2l', caption: 'The whole cube turns; the next gap comes to the front-right.' })}</div>
      </div>
      <div class="callout"><strong>Don't know a letter?</strong> Hover over (or tap) any move, like <span class="tok" data-mv="R">R</span> or <span class="tok" data-mv="F'">F'</span>, to see it turn. Tap a case and the cube plays it on repeat, with each move explained under the cube. Drag the speed slider down to slow it.</div>
      <h2 style="margin-top:44px">All 41 cases</h2>
      <p class="lead">Every way the pair can sit, for the front-right gap. Find the one that looks like yours, tap ▶ to watch it.</p>
      ${nextLine('After any of these the pair is in. Spin the cube (<span class="tok" data-mv="y">y</span>) to the next empty gap and start again.')}
      ${body}`;
    },
    stage: () => ({ kicker: 'F2L', title: 'Pick a case', alg: '', setup: '', mask: 'f2l' }),
  },

  oll: {
    label: 'OLL',
    render() {
      return `
      <div class="kicker">Step 3</div>
      <h2>OLL — make the top yellow</h2>
      <p class="lead">Start with two looks: yellow cross first, then the corners. Turn <code>U</code> until it matches the picture (front = bottom of the picture).</p>
      <div class="howto">
        ${howStep(1, '<strong>Yellow on top.</strong> The bottom two layers are done; now only the top matters. It takes two looks: first a yellow cross, then yellow corners.',
          demoHTML({ setup: inv("F R U R' U' F' R U R' U R U2 R'"), alg: "F R U R' U' F' R U R' U R U2 R'", mask: 'oll', caption: 'Look 1 makes the cross, look 2 the corners.' }))}
        ${howStep(2, '<strong>Look 1: the 4 yellow edges.</strong> Ignore the corners. What shape do the yellow edges make? Hold it like the picture, then do that one.',
          cases(C.OLL_EDGES.map((c, k) => {
            // each shape sits on a real look-2 case, so the path carries on
            const setup = `${inv(C.OLL_CORNERS[[0, 1, 5][k]].alg)} ${inv(c.alg)}`;
            const n = nextCase(endOf(setup, c.alg), C.OLL_CORNERS.map((o) => o.alg), topYellow);
            return caseDemo(esc(c.name), `${esc(c.note)} ${n ? thenBtn(`oll2-${n.i}`, n.a, esc(C.OLL_CORNERS[n.i].name)) : ''}`, { setup, alg: c.alg, mask: 'olledge', pieces: '' });
          })))}
        ${howStep(3, '<strong>Look 2: the corners.</strong> Cross done. Now find which of these the corners look like, turn <span class="tok" data-mv="U">U</span> until it matches, and do it.',
          cases(C.OLL_CORNERS.map((c, k) => caseDemo(esc(c.name), esc(c.note), { setup: inv(c.alg), alg: c.alg, mask: 'oll', pieces: '' }, 'Case %N%', `oll2-${k}`)))
          + nextLine('The top is all yellow. On to PLL.'))}
      </div>
      <h2 style="margin-top:44px">Full OLL — all 57</h2>
      <p class="lead">One look instead of two. Grouped by the shape the yellow makes on top. Start with the first group (you already know half of it from 2-look), then the ones that come up most: T, P, Square, Fish, Lightning.</p>
      ${C.OLL_FULL.map((g) => `
        <div class="group-head"><h3>${esc(g.group)}</h3><span class="count">${g.cases.length}</span></div>
        <div class="cases">${g.cases.map((c) => caseDemo('', '', { setup: inv(c.alg), alg: c.alg, mask: 'oll', pieces: '' }, `OLL ${c.n}`)).join('')}</div>`).join('')}`;
    },
    stage: () => ({ kicker: 'OLL', title: 'Pick a case', alg: '', setup: '', mask: 'oll' }),
  },

  pll: {
    label: 'PLL',
    render() {
      return `
      <div class="kicker">Step 4</div>
      <h2>PLL — finish it</h2>
      <p class="lead">Move the top pieces home. Arrows show where each piece goes. Start with the 6 two-look algs, then learn all 21.</p>
      <div class="howto">
        ${howStep(1, '<strong>Corners first.</strong> Look at the corner stickers on the 4 sides. <strong>Headlights</strong> = both corners of one side are the same colour. Which do you have?',
          cases([
            { title: 'Headlights on all 4 sides', text: 'Corners are done already.', setup: inv(pll('Ua')), alg: 'U U U U' },
            { title: 'Headlights on 1 side', text: 'Turn <b>U</b> so they are on the LEFT, then T perm.', setup: `${inv(pll('Ub'))} ${inv(pll('T perm'))}`, alg: pll('T perm') },
            { title: 'No headlights', text: 'Y perm, from any side.', setup: `${inv(pll('H'))} ${inv(pll('Y perm'))}`, alg: pll('Y perm') },
          ].map((c) => {
            const edges = C.PLL_2LOOK.slice(2);
            const n = nextCase(endOf(c.setup, c.alg), edges.map((e) => e.alg), solvedUpToU);
            return caseDemo(c.title, `${c.text} ${n ? thenBtn(`pll2-${n.i}`, n.a, esc(edges[n.i].name)) : ''}`, { setup: c.setup, alg: c.alg, pieces: '' });
          })))}
        ${howStep(2, '<strong>Then the edges.</strong> Corners done: look at the middle sticker of each side.',
          cases(C.PLL_2LOOK.slice(2).map((c, k) => caseDemo(esc(c.name), esc(c.note), { setup: inv(c.alg), alg: c.alg, pieces: '' }, 'Case %N%', `pll2-${k}`)))
          + nextLine('One last turn of the top if needed (step 3), and it\'s solved.'))}
        ${howStep(3, '<strong>Last turn.</strong> If the top is solved but turned, one <span class="tok" data-mv="U">U</span> / <span class="tok" data-mv="U\'">U\'</span> / <span class="tok" data-mv="U2">U2</span> lines it up.',
          demoHTML({ setup: "U'", alg: 'U', caption: 'Solved.' }))}
      </div>
      <h3>How to tell which one you have</h3>
      <p>The white outlines show what to look at. Tap a card to load it on the cube.</p>
      <p><strong>Part A — corners.</strong> Look only at the corner stickers on the sides. <em>Headlights</em> = both corners of one side are the same colour.</p>
      <div class="grid wide">${recog(RECOG_A)}</div>
      <p style="margin-top:18px"><strong>Part B — edges.</strong> Corners done? Turn U until they match their centres, then look at the middle sticker of each side.</p>
      <div class="grid wide">${recog(RECOG_B)}</div>
      <h2 style="margin-top:44px">All 21 PLLs</h2>
      <p class="lead">One look instead of two. Find yours, tap ▶ to watch it.</p>
      <div class="cases">${C.PLL_FULL.map((c) => caseDemo('', '', { setup: inv(c.alg), alg: c.alg, pieces: '' }, `${esc(c.name)} perm`)).join('')}</div>`;
    },
    stage: () => ({ kicker: 'PLL', title: 'Pick a case', alg: '', setup: '', mask: 'none' }),
  },

  advanced: {
    label: 'Advanced',
    render() {
      const cards = C.ADVANCED.map((c) => {
        const st = new CubeState().apply(c.setup).apply(invertAlg(parseWithLabels(c.alg).steps));
        const i = register({ kicker: 'Advanced', title: c.name, alg: c.alg, setup: algToString(parseAlg(c.setup).concat(invertAlg(parseWithLabels(c.alg).steps))), mask: 'f2l', view: c.name === 'X-cross' ? 'bottom' : 'top' });
        return caseCard({ name: c.name, alg: c.alg.replace(/\[[^\]]*\]\s*/g, ''), note: c.note, svg: isoSVG(st, 'f2l', c.name === 'X-cross') }, i);
      }).join('');
      return `
      <div class="kicker">After sub-20</div>
      <h2>How the fastest do it</h2>
      <p class="lead">Yiheng Wang and other top solvers still use CFOP — these are the extras on top. Learn them only once the 4 steps are automatic.</p>
      <div class="howto">
        ${C.ADVANCED.map((c, k) => howStep(k + 1, `<strong>${esc(c.name)}.</strong> ${esc(c.note)}`,
          demoHTML({ setup: algToString(parseAlg(c.setup).concat(invertAlg(parseWithLabels(c.alg).steps))), alg: plain(c.alg), mask: 'f2l', view: c.name === 'X-cross' ? 'bottom' : 'top' }))).join('')}
      </div>
      <div class="grid wide">${cards}</div>
      <h3>The rest of the toolkit</h3>
      <ul class="tips">
        <li><strong>Keyhole</strong> — use an empty slot as a shortcut to drop in one piece, then fix the rest.</li>
        <li><strong>Multislotting</strong> — insert one pair while setting up the next in the same moves.</li>
        <li><strong>Full OLL (57)</strong> — the top turns yellow in one look instead of two.</li>
        <li><strong>COLL / ZBLL</strong> — solve the whole top layer in one algorithm, skipping PLL.</li>
        <li><strong>Colour neutral</strong> — start the cross on whichever colour is easiest, not just white.</li>
      </ul>`;
    },
    stage: () => ({ kicker: 'Advanced', title: 'Pick a technique', alg: '', setup: '', mask: 'none' }),
  },

  solve: {
    label: 'Full solve',
    render() {
      const sol = parseWithLabels(C.FULL_SOLVE).steps;
      const scramble = algToString(simplify(removeYRotations(invertAlg(sol))));
      const i = register({ kicker: 'Full solve', title: 'Cross → F2L ×4 → OLL → PLL', alg: C.FULL_SOLVE, mask: 'none' });
      const stages = [];
      for (const tok of C.FULL_SOLVE.match(/\[[^\]]*\]|[^\s]+/g)) {
        if (tok[0] === '[') stages.push({ name: tok.slice(1, -1), moves: [] });
        else stages[stages.length - 1].moves.push(tok);
      }
      return `
      <div class="kicker">Put it together</div>
      <h2>A whole CFOP solve</h2>
      <p class="lead">Every step from this site, in order. Use the stage labels above the moves to jump to any step.</p>
      <div class="grid wide"><button class="card text" data-case="${i}"><span class="big">▶</span><span class="note"><strong>Play the full solve</strong><br>${sol.length} moves, ${stages.length} stages</span></button></div>
      <h3>Scramble</h3>
      <p>Hold yellow on top, green in front and do this scramble on your real cube, then follow along.</p>
      <p><code>${algHTML(scramble)}</code></p>
      <h3>Solution</h3>
      <ul class="tips">${stages.map((s) => `<li><strong>${esc(s.name)}</strong> — <code>${algHTML(s.moves.join(' '))}</code></li>`).join('')}</ul>
      <div class="callout"><code>y</code> between F2L pairs turns the cube so the next slot is front-right. Real solves try to avoid these, but they keep the example readable.</div>`;
    },
    stage: () => ({ kicker: 'Full solve', title: 'Cross → F2L ×4 → OLL → PLL', alg: C.FULL_SOLVE, mask: 'none' }),
  },

  timer: {
    label: 'Timer',
    render() {
      return `
      <div class="kicker">Practice</div>
      <h2>Timer</h2>
      <div class="timer-box" id="timerBox">
        <div class="scramble" id="scr"></div>
        <div class="clock" id="clock">0.00</div>
        <div class="clock-hint" id="hint">Hold <strong>Space</strong> (or touch here) until green, let go to start. Any key stops.</div>
        <div class="row-btns">
          <button class="btn primary" id="newScr">New scramble</button>
          <button class="btn" id="delLast">Delete last</button>
          <button class="btn" id="clearAll">Clear all</button>
        </div>
      </div>
      <div class="stats" id="stats"></div>
      <div class="times" id="times"></div>
      <h3>Drills that actually make you faster</h3>
      <ul class="tips">
        <li><strong>Slow solves, zero pauses.</strong> 5 a day at half speed. Your eyes learn to look ahead.</li>
        <li><strong>Cross only.</strong> 15 s inspection, then the cross with eyes closed. Check how many edges are right.</li>
        <li><strong>Algorithm reps.</strong> Pick one F2L / PLL case, 20 reps in a row, then mix it into solves.</li>
        <li><strong>Average of 12, every day.</strong> Ao12 is the number to track, not your best single.</li>
      </ul>`;
    },
    mount: mountTimer,
    stage: () => ({ kicker: 'Timer', title: 'Your scramble', alg: '', setup: TIMER.scramble, mask: 'none' }),
  },
};

// ---------------------------------------------------------------- timer
const TIMER = { scramble: '', state: 'idle', start: 0, raf: 0, holdT: 0, times: loadTimes() };

function loadTimes() {
  try { return JSON.parse(localStorage.getItem('rubiks.times.v1')) || []; } catch { return []; }
}
function saveTimes() {
  try { localStorage.setItem('rubiks.times.v1', JSON.stringify(TIMER.times.slice(-500))); } catch { /* private mode */ }
}

function genScramble(n = 20) {
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'], axis = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  const out = [];
  while (out.length < n) {
    const f = faces[(Math.random() * 6) | 0];
    const a = out[out.length - 1], b = out[out.length - 2];
    if (a && a[0] === f) continue;
    if (a && b && axis[a[0]] === axis[f] && axis[b[0]] === axis[f]) continue;
    out.push(f + ['', "'", '2'][(Math.random() * 3) | 0]);
  }
  return out.join(' ');
}

const fmt = (ms) => (ms == null ? '–' : ms === Infinity ? 'DNF' : (ms / 1000).toFixed(2));
function avg(list, n) {
  if (list.length < n) return null;
  const s = list.slice(-n).sort((a, b) => a - b).slice(1, -1);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function mountTimer() {
  newScramble();
  renderStats();
  $('#newScr').onclick = () => newScramble();
  $('#delLast').onclick = () => { TIMER.times.pop(); saveTimes(); renderStats(); };
  $('#clearAll').onclick = () => { TIMER.times = []; saveTimes(); renderStats(); };
  const box = $('#timerBox');
  box.addEventListener('touchstart', (e) => { if (e.target.closest('button')) return; e.preventDefault(); press(); }, { passive: false });
  box.addEventListener('touchend', (e) => { if (e.target.closest('button')) return; e.preventDefault(); release(); }, { passive: false });
}

function newScramble() {
  TIMER.scramble = genScramble();
  const el = $('#scr');
  if (el) el.textContent = TIMER.scramble;
  load({ kicker: 'Timer', title: 'Your scramble — match it on your cube', alg: '', setup: TIMER.scramble, mask: 'none' }, { autoplay: false });
}

function renderStats() {
  const t = TIMER.times;
  const best = t.length ? Math.min(...t) : null;
  $('#stats').innerHTML = [['Solves', t.length], ['Best', fmt(best)], ['Ao5', fmt(avg(t, 5))], ['Ao12', fmt(avg(t, 12))]]
    .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('#times').innerHTML = t.slice(-40).reverse().map((x) => `<span>${fmt(x)}</span>`).join('');
}

function press() {
  const clock = $('#clock');
  if (!clock) return;
  if (TIMER.state === 'running') return stop();
  if (TIMER.state !== 'idle') return;
  TIMER.state = 'holding';
  clock.className = 'clock hold';
  TIMER.holdT = setTimeout(() => { if (TIMER.state === 'holding') { TIMER.state = 'ready'; clock.className = 'clock ready'; clock.textContent = '0.00'; } }, 350);
}
function release() {
  const clock = $('#clock');
  if (!clock) return;
  clearTimeout(TIMER.holdT);
  if (TIMER.state === 'ready') {
    TIMER.state = 'running';
    clock.className = 'clock';
    TIMER.start = performance.now();
    const tick = () => {
      if (TIMER.state !== 'running') return;
      clock.textContent = ((performance.now() - TIMER.start) / 1000).toFixed(2);
      TIMER.raf = requestAnimationFrame(tick);
    };
    tick();
  } else if (TIMER.state === 'holding') {
    TIMER.state = 'idle';
    clock.className = 'clock';
  } else if (TIMER.state === 'stopped') {
    TIMER.state = 'idle';
  }
}
function stop() {
  cancelAnimationFrame(TIMER.raf);
  const ms = performance.now() - TIMER.start;
  TIMER.state = 'stopped';
  $('#clock').textContent = (ms / 1000).toFixed(2);
  TIMER.times.push(Math.round(ms));
  saveTimes();
  renderStats();
  newScramble();
}

// ---------------------------------------------------------------- tabs
const ORDER = ['mine', 'cross', 'f2l', 'oll', 'pll', 'advanced', 'solve', 'notation', 'timer'];
const STEP_NO = { cross: 1, f2l: 2, oll: 3, pll: 4 };
let current = null;
let scanner = null;
let stopDemos = null;

function open(key, push = true) {
  if (!LESSONS[key]) key = 'cross';
  LESSONS[current]?.unmount?.();
  stopDemos?.();
  current = key;
  registry = [];
  const L = LESSONS[key];
  $('#lesson').innerHTML = L.render();
  stopDemos = mountDemos($('#lesson'));
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.key === key)));
  if (L.mount) { load(L.stage()); L.mount(); }
  else load(L.stage(), { autoplay: false });
  if (push) history.replaceState(null, '', '#' + key);
  window.scrollTo({ top: 0 });
}

$('#tabs').innerHTML = ORDER.map((k) =>
  `<button class="tab" role="tab" data-key="${k}">${STEP_NO[k] ? `<span class="n">${STEP_NO[k]}</span>` : ''}${LESSONS[k].label}</button>`).join('');
$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) open(t.dataset.key);
});
window.addEventListener('hashchange', () => open(location.hash.slice(1), false));

// ---------------------------------------------------------------- keys
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (current === 'mine' && scanner?.onKey(e)) return;
  if (current === 'timer') {
    if (e.code === 'Space' || TIMER.state === 'running') {
      e.preventDefault();
      if (!e.repeat) press();
    }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); P.playing ? pause() : play(); }
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Home') seek(0);
});
document.addEventListener('keyup', (e) => {
  if (current === 'timer' && (e.code === 'Space' || TIMER.state === 'stopped')) { e.preventDefault(); release(); }
});

open(location.hash.slice(1) || 'cross', false);
