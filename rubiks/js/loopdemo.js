// Small cubes that play one example forever, no hover or click needed.
// Markup: <div class="demo" data-setup="R U' R'" data-alg="R U R'"
//           data-mask="f2l" data-pieces="pair"><div class="demo-cube"></div>
//           <div class="demo-moves"></div></div>
import { CubePlayer } from './player.js';
import { parseAlg } from './cube.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Named piece sets, by home position.
const PIECES = {
  pair: [[1, -1, 1], [1, 0, 1]], // the front-right corner + edge
};

export function demoHTML({ setup = '', alg, mask = 'none', pieces = '', caption = '' }) {
  return `<div class="demo" data-setup="${esc(setup)}" data-alg="${esc(alg)}" data-mask="${mask}" data-pieces="${pieces}">
    <div class="demo-cube"></div>
    <div class="demo-moves"></div>
    ${caption ? `<div class="demo-cap">${caption}</div>` : ''}
  </div>`;
}

// Starts every .demo under root; returns a function that stops them all.
export function mountDemos(root) {
  const players = [];
  for (const host of root.querySelectorAll('.demo')) {
    const p = new CubePlayer(host.querySelector('.demo-cube'), { interactive: false });
    players.push(p);
    run(p, host);
  }
  return () => players.forEach((p) => p.destroy());
}

async function run(p, host) {
  const setup = parseAlg(host.dataset.setup || '');
  const moves = parseAlg(host.dataset.alg);
  const pieces = PIECES[host.dataset.pieces];
  const label = host.querySelector('.demo-moves');
  label.innerHTML = moves.map((m) => `<span class="tok" data-mv="${esc(m.tok)}">${esc(m.tok)}</span>`).join(' ');
  const toks = [...label.children];
  const mark = (i) => toks.forEach((t, j) => { t.classList.toggle('on', j === i); t.classList.toggle('done', j < i); });
  while (!p.dead) {
    p.reset();
    p.setMask(host.dataset.mask || 'none');
    if (pieces) p.dimExceptPieces(pieces);
    p.applyNow(setup);
    mark(-1);
    await wait(1000);
    for (let i = 0; i < moves.length && !p.dead; i++) {
      mark(i);
      if (!(await p.animate(moves[i], 650))) break;
      await wait(180);
    }
    mark(moves.length);
    await wait(1400);
  }
}
