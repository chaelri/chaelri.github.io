// Moves in plain words ("Right side: turn it UP, away from you"), used by the
// caption under the big cube and the Solve mine guide. algHTML() marks each
// move of an algorithm string as a .tok.
import { parseMove } from './cube.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Holding yellow up, green front. [what turns, clockwise, counter-clockwise]
const SAY = {
  R: ['Right side', 'turn it UP, away from you', 'turn it DOWN, toward you'],
  L: ['Left side', 'turn it DOWN, toward you', 'turn it UP, away from you'],
  U: ['Top layer', 'push it to the LEFT', 'push it to the RIGHT'],
  D: ['Bottom layer', 'push it to the RIGHT', 'push it to the LEFT'],
  F: ['Front face', 'turn it like a steering wheel to the RIGHT', 'turn it like a steering wheel to the LEFT'],
  B: ['Back face', 'its top moves to the LEFT', 'its top moves to the RIGHT'],
  M: ['Middle slice (between left and right)', 'turn it DOWN, like L', 'turn it UP, like L\''],
  E: ['Middle horizontal slice', 'push it to the RIGHT, like D', 'push it to the LEFT, like D\''],
  S: ['Middle slice (between front and back)', 'turn it to the RIGHT, like F', 'turn it to the LEFT, like F\''],
  r: ['Right TWO layers', 'turn them UP, away from you', 'turn them DOWN, toward you'],
  l: ['Left TWO layers', 'turn them DOWN, toward you', 'turn them UP, away from you'],
  u: ['Top TWO layers', 'push them to the LEFT', 'push them to the RIGHT'],
  d: ['Bottom TWO layers', 'push them to the RIGHT', 'push them to the LEFT'],
  f: ['Front TWO layers', 'turn them like a steering wheel to the RIGHT', 'turn them like a steering wheel to the LEFT'],
  b: ['Back TWO layers', 'their top moves to the LEFT', 'their top moves to the RIGHT'],
  x: ['Whole cube', 'roll it so the front goes UP (like R)', 'roll it so the front goes DOWN'],
  y: ['Whole cube', 'spin it so the front goes LEFT (like U)', 'spin it so the front goes RIGHT'],
  z: ['Whole cube', 'tilt it so the top goes RIGHT (like F)', 'tilt it so the top goes LEFT'],
};

const HAND = { R: 'right hand', r: 'right hand', L: 'left hand', l: 'left hand', M: 'ring finger' };

export function describe(tok) {
  let mv;
  try { mv = parseMove(tok); } catch { return null; }
  const s = SAY[mv.face];
  if (!s) return null;
  const how = mv.turns === -1 ? s[2] : s[1];
  const twice = mv.turns === 2 ? ' — TWICE (a half turn, either way works)' : '';
  return { mv, what: s[0], how: how + twice, hand: HAND[mv.face] || '' };
}

// An algorithm as hoverable tokens; [Labels] and anything unparseable stay text.
export function algHTML(str) {
  return (str || '').split(/(\s+)/).map((t) => {
    if (!t.trim()) return t;
    return describe(t) ? `<span class="tok" data-mv="${esc(t)}">${esc(t)}</span>` : esc(t);
  }).join('');
}
