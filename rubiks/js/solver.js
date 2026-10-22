// CFOP solver for a real (scanned) cube, using the same case database the
// lessons teach. Pure — no DOM — so node can test it.
//
// Cross: optimal, from a breadth-first distance table over the 4 white edges.
// F2L / OLL / PLL: try every taught algorithm with every U pre-turn in a
// simulator and keep the shortest that does the job. The cube is never
// rotated: back slots are solved with relabelled algorithms, so the camera
// keeps seeing the same face.
import { CubeState, parseAlg, parseMove, removeYRotations, simplify, rot, eq, faceOfNormal, NORMAL } from './cube.js';
import * as C from './content.js';

const FACE_MOVES = [];
for (const f of 'UDFBRL') for (const t of [1, -1, 2]) FACE_MOVES.push({ face: f, turns: t, tok: f + (t === 2 ? '2' : t === -1 ? "'" : '') });
const AUF = ['', 'U', "U'", 'U2'];

// ---------------------------------------------------------------- helpers
const posSolved = (s, positions) =>
  s.stickers.every((t) => !positions.some((p) => eq(p, t.p)) || s.centerOf(faceOfNormal(t.n)) === t.c);

const CROSS_POS = [[0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0]];
const SLOT_POS = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, z]) => [[x, -1, z], [x, 0, z]]);
const SLOT_NAME = { '1,1': 'front-right', '-1,1': 'front-left', '-1,-1': 'back-left', '1,-1': 'back-right' };
const crossSolved = (s) => posSolved(s, CROSS_POS);
const slotSolved = (s, i) => posSolved(s, SLOT_POS[i]);
const f2lSolved = (s) => crossSolved(s) && [0, 1, 2, 3].every((i) => slotSolved(s, i));
const topPos = [];
for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) topPos.push([x, 1, z]);

const run = (s, alg) => s.clone().apply(alg);
const len = (alg) => (alg.trim() ? alg.trim().split(/\s+/).length : 0);

// ---------------------------------------------------------------- cross
// Location of a white edge sticker among the 24 edge-sticker spots.
const EDGE_SPOTS = [];
new CubeState().stickers.forEach((t) => { if (t.p.filter((v) => v).length === 2) EDGE_SPOTS.push({ p: t.p, n: t.n }); });
const spotIndex = (p, n) => EDGE_SPOTS.findIndex((e) => eq(e.p, p) && eq(e.n, n));
const MOVE_TABLE = FACE_MOVES.map((mv) => {
  const s = new CubeState().move(mv);
  // where does the sticker that started at spot i end up?
  const base = new CubeState();
  return EDGE_SPOTS.map((e) => {
    const i = base.stickers.findIndex((t) => eq(t.p, e.p) && eq(t.n, e.n));
    const t = s.stickers[i];
    return spotIndex(t.p, t.n);
  });
});
const CROSS_HOME = CROSS_POS.map((p) => spotIndex(p, [0, -1, 0]));
const enc = (a) => ((a[0] * 24 + a[1]) * 24 + a[2]) * 24 + a[3];
let CROSS_DIST = null;
function crossTable() {
  if (CROSS_DIST) return CROSS_DIST;
  CROSS_DIST = new Int8Array(24 ** 4).fill(-1);
  let frontier = [CROSS_HOME];
  CROSS_DIST[enc(CROSS_HOME)] = 0;
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const st of frontier)
      for (const T of MOVE_TABLE) {
        const n = st.map((i) => T[i]);
        const k = enc(n);
        if (CROSS_DIST[k] === -1) { CROSS_DIST[k] = d + 1; next.push(n); }
      }
    frontier = next;
  }
  return CROSS_DIST;
}

function solveCross(s) {
  const D = crossTable();
  // white sticker of each cross edge, by the colours it must sit between
  let st = CROSS_POS.map((home) => {
    const side = faceOfNormal([home[0], 0, home[2]]);
    const piece = s.stickers.filter((t) => t.c === 'D' || t.c === side);
    const white = piece.find((t) => t.c === 'D' && t.p.filter((v) => v).length === 2 &&
      s.stickers.some((q) => eq(q.p, t.p) && q.c === side));
    return spotIndex(white.p, white.n);
  });
  const out = [];
  while (D[enc(st)] > 0) {
    const d = D[enc(st)];
    const i = MOVE_TABLE.findIndex((T) => D[enc(st.map((x) => T[x]))] === d - 1);
    out.push(FACE_MOVES[i].tok);
    st = st.map((x) => MOVE_TABLE[i][x]);
  }
  return out.join(' ');
}

// ---------------------------------------------------------------- F2L
// Algorithm `alg` performed while looking at the cube turned by y^k.
const inFrame = (k, alg) => {
  const ys = Array(k).fill('y').join(' ');
  const back = Array(k).fill("y'").join(' ');
  return removeYRotations(parseAlg(`${ys} ${alg} ${back}`)).map((m) => m.tok).join(' ');
};

// y^k turns the slot at original index FRAME_SLOT[k] to the front-right.
const FRAME_SLOT = [0, 3, 2, 1];
const slotLabel = (i) => SLOT_NAME[SLOT_POS[i][0][0] + ',' + SLOT_POS[i][0][2]];

// Best single taught algorithm (any slot, any U pre-turn) that solves at least
// one more slot without breaking the cross or a solved slot.
function findInsert(s) {
  const before = [0, 1, 2, 3].map((i) => slotSolved(s, i));
  let best = null;
  for (let k = 0; k < 4; k++) {
    if (before[FRAME_SLOT[k]]) continue;
    for (const a of AUF)
      for (let ci = 0; ci < C.F2L.length; ci++) {
        const moves = inFrame(k, `${a} ${C.F2L[ci]}`);
        const t = run(s, moves);
        if (!crossSolved(t)) continue;
        const after = [0, 1, 2, 3].map((i) => slotSolved(t, i));
        const gained = after.filter((v, i) => v && !before[i]).length;
        if (!gained || before.some((v, i) => v && !after[i])) continue;
        const score = len(moves) / gained;
        if (!best || score < best.score) best = { moves, score, ci, t, slot: after.findIndex((v, i) => v && !before[i]) };
      }
  }
  return best;
}

function solveF2L(s, steps) {
  for (let guard = 0; guard < 16 && !f2lSolved(s); guard++) {
    const ins = findInsert(s);
    if (ins) {
      steps.push({ label: `F2L · ${slotLabel(ins.slot)} · case ${ins.ci + 1}`, moves: ins.moves });
      s = ins.t;
      continue;
    }
    // Nothing inserts directly: a piece is stuck in the wrong slot. Lift an
    // unsolved slot's contents into the top layer — preferring a lift that
    // makes an insert possible — and look again.
    let pick = null;
    for (let k = 0; k < 4; k++) {
      if (slotSolved(s, FRAME_SLOT[k])) continue;
      const moves = inFrame(k, "R U R'");
      const t = run(s, moves);
      const opt = { k, moves, t };
      if (findInsert(t)) { pick = opt; break; }
      pick = pick || opt;
    }
    if (!pick) return null;
    steps.push({ label: `F2L · take pieces out of ${slotLabel(FRAME_SLOT[pick.k])}`, moves: pick.moves });
    s = pick.t;
  }
  return f2lSolved(s) ? s : null;
}

// ---------------------------------------------------------------- last layer
function bestOf(s, list, ok, post = ['']) {
  let best = null;
  for (const a of AUF)
    for (const c of list)
      for (const b of post) {
        const moves = `${a} ${c.alg} ${b}`.trim().replace(/\s+/g, ' ');
        const t = run(s, moves);
        if (!f2lSolved(t) || !ok(t)) continue;
        if (!best || len(moves) < len(best.moves)) best = { moves, name: c.name, t };
      }
  return best;
}

const yellowUp = (s, filter = () => true) =>
  s.stickers.filter((t) => t.c === 'U' && filter(t)).every((t) => t.n[1] === 1);
const isEdge = (t) => t.p.filter((v) => v).length === 2;
const isCorner = (t) => t.p.filter((v) => v).length === 3;
const llSolvedUpToU = (s, filter) =>
  AUF.some((a) => { const t = run(s, a); return posSolved(t, topPos.filter((p) => filter(p))); });
const cornerPos = (p) => p[0] && p[2];

export function solve(start, { full = false } = {}) {
  let s = start.clone();
  const steps = [];
  const cross = solveCross(s);
  steps.push({ label: 'Cross', moves: cross });
  s = run(s, cross);

  s = solveF2L(s, steps);
  if (!s) return { error: 'F2L got stuck — a sticker is probably misread.' };

  if (!yellowUp(s)) {
    if (full) {
      const r = bestOf(s, C.OLL_FULL.flatMap((g) => g.cases.map((c) => ({ name: `OLL ${c.n}`, alg: c.alg }))), (t) => yellowUp(t));
      if (!r) return { error: 'No OLL fits — a sticker is probably misread.' };
      steps.push({ label: `OLL · ${r.name}`, moves: r.moves }); s = r.t;
    } else {
      if (!yellowUp(s, isEdge)) {
        const r = bestOf(s, C.OLL_EDGES, (t) => yellowUp(t, isEdge));
        if (!r) return { error: 'No OLL fits — a sticker is probably misread.' };
        steps.push({ label: `OLL edges · ${r.name}`, moves: r.moves }); s = r.t;
      }
      if (!yellowUp(s)) {
        const r = bestOf(s, C.OLL_CORNERS, (t) => yellowUp(t));
        if (!r) return { error: 'No OLL fits — a sticker is probably misread.' };
        steps.push({ label: `OLL corners · ${r.name}`, moves: r.moves }); s = r.t;
      }
    }
  }

  if (!s.isSolved()) {
    const solvedLL = (t) => AUF.some((a) => run(t, a).isSolved());
    if (full) {
      if (!solvedLL(s)) {
        const r = bestOf(s, C.PLL_FULL.map((c) => ({ name: `${c.name} perm`, alg: c.alg })), solvedLL);
        if (!r) return { error: 'No PLL fits — a sticker is probably misread.' };
        steps.push({ label: `PLL · ${r.name}`, moves: r.moves }); s = r.t;
      }
    } else {
      if (!llSolvedUpToU(s, cornerPos)) {
        const r = bestOf(s, C.PLL_2LOOK.slice(0, 2).map((c) => ({ name: c.name.split(' (')[0], alg: c.alg })), (t) => llSolvedUpToU(t, cornerPos));
        if (!r) return { error: 'No PLL fits — a sticker is probably misread.' };
        steps.push({ label: `PLL corners · ${r.name}`, moves: r.moves }); s = r.t;
      }
      if (!solvedLL(s)) {
        const r = bestOf(s, C.PLL_2LOOK.slice(2).map((c) => ({ name: c.name, alg: c.alg })), solvedLL);
        if (!r) return { error: 'No PLL fits — a sticker is probably misread.' };
        steps.push({ label: `PLL edges · ${r.name}`, moves: r.moves }); s = r.t;
      }
    }
    const a = AUF.find((x) => run(s, x).isSolved());
    if (a === undefined) return { error: 'Could not finish — a sticker is probably misread.' };
    if (a) { steps.push({ label: 'AUF', moves: a }); s = run(s, a); }
  }

  const clean = steps.map((st) => ({ ...st, moves: simplify(parseAlg(st.moves || '')).map((m) => m.tok).join(' ') }))
    .filter((st) => st.moves);
  const alg = clean.map((st) => `[${st.label}] ${st.moves}`).join(' ');
  return { steps: clean, alg, moves: clean.reduce((n, st) => n + len(st.moves), 0) };
}

// ---------------------------------------------------------------- facelets
// A face as the camera sees it head-on: `up` is the face on top of the
// picture. Rows top→bottom, columns left→right.
export const SCAN_ORDER = [
  { face: 'F', up: 'U' }, { face: 'R', up: 'U' }, { face: 'B', up: 'U' },
  { face: 'L', up: 'U' }, { face: 'U', up: 'B' }, { face: 'D', up: 'F' },
];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function faceGrid(face, up) {
  const n = NORMAL[face], u = NORMAL[up], r = cross3(u, n);
  const cells = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      cells.push({ p: [0, 1, 2].map((i) => n[i] + r[i] * (col - 1) + u[i] * (1 - row)), n });
  return cells;
}

// What the camera sees on `face` (9 letters) for a cube state.
export function faceLetters(s, face, up) {
  return faceGrid(face, up).map((c) => s.at(c.p, c.n)).join('');
}

// Build a CubeState from 6 scanned faces ({ F: 'FFRUB...', ... } — 9 letters
// each, letter = the face whose centre has that colour). Returns errors
// instead of a state when the stickers can't make a real cube.
export function stateFromFaces(faces) {
  const s = new CubeState();
  const at = new Map();
  for (const { face, up } of SCAN_ORDER) {
    const letters = faces[face];
    faceGrid(face, up).forEach((c, i) => at.set(c.p.join() + '|' + c.n.join(), letters[i]));
  }
  const counts = {};
  for (const v of at.values()) counts[v] = (counts[v] || 0) + 1;
  const errors = Object.keys(NORMAL).filter((f) => counts[f] !== 9).map((f) => `${f}: ${counts[f] || 0} stickers (need 9)`);
  if (errors.length) return { errors };
  const seen = new Set();
  for (const t of s.stickers) t.c = at.get(t.p.join() + '|' + t.n.join());
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const piece = s.stickers.filter((t) => eq(t.p, [x, y, z]));
        if (!piece.length) continue;
        const home = [0, 0, 0];
        for (const t of piece) NORMAL[t.c].forEach((v, i) => { home[i] += v; });
        const ok = piece.every((t) => NORMAL[t.c].some((v, i) => v && home[i] === v)) &&
          home.filter((v) => v).length === piece.length && Math.max(...home.map(Math.abs)) === 1;
        const key = home.join();
        if (!ok || seen.has(key)) {
          errors.push(`Impossible piece at ${faceNames([x, y, z])}: ${piece.map((t) => t.c).join('/')}`);
          continue;
        }
        seen.add(key);
        for (const t of piece) t.home = home;
      }
  return errors.length ? { errors } : { state: s };
}

function faceNames(p) {
  return ['RL', 'UD', 'FB'].map((pair, i) => (p[i] === 1 ? pair[0] : p[i] === -1 ? pair[1] : '')).join('');
}

export { crossSolved, f2lSolved, rot, parseMove };
