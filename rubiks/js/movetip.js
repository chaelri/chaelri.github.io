// Move tips: hover (or tap) any move token and a small card shows that one
// turn looping on a mini cube, with what to do in plain words. Tokens are any
// element with data-mv="R'"; algHTML() wraps an algorithm string in them.
import { parseMove, parseAlg } from './cube.js';
import { CubePlayer } from './player.js';

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

// Camera per face, so the layer that turns is the one facing you.
function viewFor(face) {
  const f = face.toUpperCase();
  if (f === 'L' || f === 'M') return { yaw: -0.62, pitch: 0.5 };
  if (f === 'D' || f === 'E') return { yaw: 0.62, pitch: -0.5 };
  // B stays seen from the front, the way you hold it: its top row and right column move.
  return { yaw: 0.62, pitch: 0.5 };
}

let tip, mini, gen = 0, hideT = 0, anchor = null;

function ensure() {
  if (tip) return;
  tip = document.createElement('div');
  tip.className = 'movetip';
  tip.innerHTML = `<div class="mt-cube"></div><div class="mt-body"><div class="mt-tok"></div><div class="mt-what"></div><div class="mt-how"></div><div class="mt-hold">Hold: yellow on top, green facing you</div></div>`;
  document.body.appendChild(tip);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// pre: the moves that lead up to this one (case setup + earlier moves), so the
// tip shows the real cube at that moment; without it, a solved cube.
async function loop(mv, pre) {
  const g = ++gen;
  const before = pre ? parseAlg(pre) : [];
  while (g === gen) {
    mini.reset();
    mini.applyNow(before);
    mini.dimExcept(mv);
    await wait(450);
    if (g !== gen) return;
    await mini.animate(mv, 750);
    if (g !== gen) return;
    await wait(900);
  }
}

function place(el) {
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight, pad = 8;
  let top = r.top - h - 10;
  if (top < 70) top = r.bottom + 10;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
  top = Math.max(pad, Math.min(window.innerHeight - h - pad, top));
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function showTip(el) {
  const d = describe(el.dataset.mv);
  if (!d) return;
  ensure();
  clearTimeout(hideT);
  anchor = el;
  tip.querySelector('.mt-tok').textContent = el.dataset.mv;
  tip.querySelector('.mt-what').textContent = d.what + (d.hand ? ` · ${d.hand}` : '');
  tip.querySelector('.mt-how').textContent = d.how;
  tip.classList.add('on');
  if (!mini) mini = new CubePlayer(tip.querySelector('.mt-cube'), { interactive: false });
  // in a case: the same view as that case's cube, so the colours line up
  const pre = el.dataset.pre;
  const v = pre !== undefined ? { yaw: 0.62, pitch: el.dataset.view === 'bottom' ? -0.5 : 0.5 } : viewFor(d.mv.face);
  mini.look(v.yaw, v.pitch, true);
  tip.querySelector('.mt-hold').textContent = pre !== undefined ? 'Your cube at this move: the lit layer turns.' : 'Hold: yellow on top, green facing you';
  place(el);
  loop(d.mv, pre);
}

export function hideTip(delay = 0) {
  clearTimeout(hideT);
  hideT = setTimeout(() => {
    if (!tip) return;
    tip.classList.remove('on');
    gen++;
    anchor = null;
  }, delay);
}

export function mountMoveTips() {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-mv]');
    if (el && el !== anchor) showTip(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-mv]');
    if (el && !el.contains(e.relatedTarget)) hideTip(120);
  });
  // touch: a tap shows the tip for a few seconds
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest('[data-mv]');
    if (!el) return hideTip();
    showTip(el);
    hideTip(4500);
  });
  window.addEventListener('scroll', () => anchor && hideTip(), { passive: true });
}
