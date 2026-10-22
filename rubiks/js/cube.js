// Pure sticker model of a 3x3. No DOM, no three.js — the 3D player, the
// thumbnails and the node validator all share this one definition of a move.
//
// Frame: x right, y up, z toward the viewer (front). Each sticker has a cubie
// position p (each coord in -1..1), an outward normal n, and the letter of the
// face it started on (its colour).

export const FACES = ['U', 'D', 'F', 'B', 'R', 'L'];
export const NORMAL = {
  U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
};

// axis, sign of a clockwise quarter turn, and which layers it takes.
const MOVES = {
  R: ['x', -1, (p) => p[0] === 1],  L: ['x', 1, (p) => p[0] === -1], M: ['x', 1, (p) => p[0] === 0],
  U: ['y', -1, (p) => p[1] === 1],  D: ['y', 1, (p) => p[1] === -1], E: ['y', 1, (p) => p[1] === 0],
  F: ['z', -1, (p) => p[2] === 1],  B: ['z', 1, (p) => p[2] === -1], S: ['z', -1, (p) => p[2] === 0],
  r: ['x', -1, (p) => p[0] >= 0],   l: ['x', 1, (p) => p[0] <= 0],
  u: ['y', -1, (p) => p[1] >= 0],   d: ['y', 1, (p) => p[1] <= 0],
  f: ['z', -1, (p) => p[2] >= 0],   b: ['z', 1, (p) => p[2] <= 0],
  x: ['x', -1, () => true], y: ['y', -1, () => true], z: ['z', -1, () => true],
};

// "R", "R'", "R2", "Rw", "Rw2'", "U2'" -> { face, turns } with turns in {-1, 1, 2}
export function parseMove(tok) {
  const m = /^([RLUDFBMESrludfbxyz])(w?)(2?)('?)$/.exec(tok);
  if (!m) throw new Error('bad move ' + tok);
  let face = m[1];
  if (m[2]) face = face.toLowerCase();
  const turns = m[3] ? 2 : m[4] ? -1 : 1;
  return { face, turns, tok };
}

export function parseAlg(str) {
  return str.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean).map(parseMove);
}

export function moveInfo(mv) {
  const [axis, sign, inLayer] = MOVES[mv.face];
  // turns 2 is drawn as a half turn in the clockwise direction
  return { axis, angle: sign * mv.turns * Math.PI / 2, quarter: sign * mv.turns, inLayer };
}

export function invertMove(mv) {
  const turns = mv.turns === 2 ? 2 : -mv.turns;
  return { face: mv.face, turns, tok: fmt(mv.face, turns) };
}

export function fmt(face, turns) {
  return face + (turns === 2 ? '2' : turns === -1 ? "'" : '');
}

export function invertAlg(moves) {
  return moves.slice().reverse().map(invertMove);
}

export function algToString(moves) {
  return moves.map((m) => m.tok).join(' ');
}

// Merge adjacent turns of the same face (R R -> R2, U U' -> nothing).
export function simplify(moves) {
  const out = [];
  for (const mv of moves) {
    const last = out[out.length - 1];
    if (last && last.face === mv.face) {
      const q = (((last.turns === 2 ? 2 : last.turns) + (mv.turns === 2 ? 2 : mv.turns)) % 4 + 4) % 4;
      out.pop();
      if (q) {
        const turns = q === 3 ? -1 : q;
        out.push({ face: mv.face, turns, tok: fmt(mv.face, turns) });
      }
    } else out.push({ ...mv });
  }
  return out;
}

// Fold y / y' rotations out of a sequence by relabelling the faces that
// follow them. Only valid when the net rotation is identity, which the full
// solve guarantees.
export function removeYRotations(moves) {
  let map = { F: 'F', R: 'R', B: 'B', L: 'L', U: 'U', D: 'D' };
  const out = [];
  for (const mv of moves) {
    if (mv.face === 'y') {
      const q = ((mv.turns === 2 ? 2 : mv.turns) + 4) % 4;
      for (let i = 0; i < q; i++) map = { ...map, F: map.R, R: map.B, B: map.L, L: map.F };
    } else {
      const face = map[mv.face] || mv.face;
      out.push({ face, turns: mv.turns, tok: fmt(face, mv.turns) });
    }
  }
  return out;
}

// Integer rotation of a vector by q quarter turns (right-handed) about axis.
export function rot(v, axis, q) {
  q = ((q % 4) + 4) % 4;
  let [x, y, z] = v;
  for (let i = 0; i < q; i++) {
    if (axis === 'x') [y, z] = [-z, y];
    else if (axis === 'y') [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

export class CubeState {
  constructor() { this.reset(); }

  reset() {
    this.stickers = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const p = [x, y, z];
          for (const f of FACES) {
            const n = NORMAL[f];
            const axis = n.findIndex((c) => c !== 0);
            if (p[axis] === n[axis]) this.stickers.push({ p: [...p], n: [...n], c: f, home: [...p] });
          }
        }
    return this;
  }

  clone() {
    const s = new CubeState();
    s.stickers = this.stickers.map((t) => ({ p: [...t.p], n: [...t.n], c: t.c, home: t.home }));
    return s;
  }

  move(mv) {
    const { axis, quarter, inLayer } = moveInfo(mv);
    for (const s of this.stickers) {
      if (!inLayer(s.p)) continue;
      s.p = rot(s.p, axis, quarter);
      s.n = rot(s.n, axis, quarter);
    }
    return this;
  }

  apply(alg) {
    for (const mv of typeof alg === 'string' ? parseAlg(alg) : alg) this.move(mv);
    return this;
  }

  // Colour showing at cubie p in direction n.
  at(p, n) {
    const s = this.stickers.find((t) => eq(t.p, p) && eq(t.n, n));
    return s ? s.c : null;
  }

  // The face-letter grid of one face, as seen by the thumbnails.
  centerOf(face) {
    return this.at(NORMAL[face], NORMAL[face]);
  }

  // A cubie (by home position) is solved when every sticker sits on the face
  // whose centre has its colour.
  pieceSolved(home) {
    return this.stickers
      .filter((t) => eq(t.home, home))
      .every((t) => eq(t.p, home) && this.centerOf(faceOfNormal(t.n)) === t.c);
  }

  isSolved() {
    return this.stickers.every((t) => this.centerOf(faceOfNormal(t.n)) === t.c);
  }
}

export function eq(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

export function faceOfNormal(n) {
  return FACES.find((f) => eq(NORMAL[f], n));
}
