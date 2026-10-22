// Small cubes that play one example forever, no hover or click needed.
// Markup: <div class="demo" data-setup="R U' R'" data-alg="R U R'"
//           data-mask="f2l" data-pieces="pair"><div class="demo-cube"></div>
//           <div class="demo-moves"></div></div>
//
// Paused demos (case cards) show their starting position as a still picture
// and only get a live 3D cube once tapped: browsers cap live WebGL contexts
// at ~16 per page, and a tab can have a dozen cases.
import { CubePlayer } from './player.js';
import { parseAlg } from './cube.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Named piece sets, by home position.
const PIECES = {
  pair: [[1, -1, 1], [1, 0, 1]], // the front-right corner + edge
  crossEdge: [[0, -1, 1], [0, -1, 0], [0, 0, 1]], // white-green edge + the two centres it sits between
};

// paused: shows the starting position (the thing to look for) until tapped.
export function demoHTML({ setup = '', alg, mask = 'none', pieces = '', view = 'top', caption = '', paused = false }) {
  return `<div class="demo${paused ? ' paused' : ''}" data-setup="${esc(setup)}" data-alg="${esc(alg)}" data-mask="${mask}" data-pieces="${pieces}" data-view="${view}">
    <div class="demo-cube">${paused ? '<button class="demo-play" aria-label="Play"></button>' : ''}</div>
    <div class="demo-moves"></div>
    ${caption ? `<div class="demo-cap">${caption}</div>` : ''}
  </div>`;
}

// Starts every .demo under root; returns a function that stops them all.
export function mountDemos(root) {
  const players = [];
  const live = (host) => {
    const p = new CubePlayer(host.querySelector('.demo-cube'), { interactive: false });
    p.setView(host.dataset.view || 'top', true);
    players.push(p);
    return p;
  };
  // Only one case plays at a time: starting one stops the other, which goes
  // back to its still picture and gives its 3D cube back.
  let active = null;
  for (const host of root.querySelectorAll('.demo')) {
    labels(host);
    if (!host.classList.contains('paused')) { run(live(host), host, () => true); continue; }
    const src = still(host);
    const card = { p: null, playing: false };
    card.stop = () => {
      card.playing = false;
      host.classList.remove('playing');
      card.p?.destroy();
      card.p = null;
      host.querySelectorAll('.demo-moves .tok').forEach((t) => t.classList.remove('on', 'done'));
      showStill(host, src);
      if (active === card) active = null;
    };
    host.querySelector('.demo-cube').addEventListener('click', () => {
      if (card.playing) return card.stop();
      if (active) active.stop();
      active = card;
      card.playing = true;
      host.classList.add('playing');
      host.querySelector('.demo-still')?.remove();
      card.p = live(host);
      run(card.p, host, () => card.playing);
    });
  }
  return () => { active = null; players.forEach((p) => p.destroy()); };
}

function labels(host) {
  const moves = parseAlg(host.dataset.alg);
  host.querySelector('.demo-moves').innerHTML = moves.map((m) => `<span class="tok" data-mv="${esc(m.tok)}">${esc(m.tok)}</span>`).join(' ');
}

function pose(p, host) {
  p.reset();
  p.setMask(host.dataset.mask || 'none');
  const pieces = PIECES[host.dataset.pieces];
  if (pieces) p.dimExceptPieces(pieces);
  p.applyNow(parseAlg(host.dataset.setup || ''));
}

// Every still picture comes from ONE hidden renderer, kept for the page's
// life: a tab can have 60 cases, one context each would blow the cap.
let shot = null;
function still(host) {
  if (!shot) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:260px;height:234px;pointer-events:none';
    document.body.appendChild(box);
    shot = new CubePlayer(box, { interactive: false });
    shot.dead = true; // no render loop: it only draws on demand
    shot.resize();
  }
  shot.setView(host.dataset.view || 'top', true);
  pose(shot, host);
  shot.placeCamera();
  shot.renderer.render(shot.scene, shot.camera);
  const src = shot.renderer.domElement.toDataURL('image/png');
  showStill(host, src);
  return src;
}
function showStill(host, src) {
  const img = document.createElement('img');
  img.className = 'demo-still';
  img.alt = '';
  img.src = src;
  host.querySelector('.demo-cube').prepend(img);
}

async function run(p, host, isPlaying) {
  const moves = parseAlg(host.dataset.alg);
  const toks = [...host.querySelectorAll('.demo-moves .tok')];
  const mark = (i) => toks.forEach((t, j) => { t.classList.toggle('on', j === i); t.classList.toggle('done', j < i); });
  while (!p.dead) {
    pose(p, host);
    mark(-1);
    // stopped: sit on the starting position until tapped again
    if (!isPlaying()) { await new Promise((r) => { p.wake = r; }); p.wake = null; continue; }
    await wait(700);
    for (let i = 0; i < moves.length && !p.dead && isPlaying(); i++) {
      mark(i);
      if (!(await p.animate(moves[i], 650))) break;
      await wait(180);
    }
    if (!isPlaying()) continue;
    mark(moves.length);
    await wait(1400);
  }
}
