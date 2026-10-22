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

// One speed for every demo cube; the button cycles it and it is remembered.
const SPEEDS = [0.25, 0.5, 1, 2, 3];
let SPEED = 1;
try { SPEED = SPEEDS.includes(+localStorage.getItem('rubiks.demoSpeed')) ? +localStorage.getItem('rubiks.demoSpeed') : 1; } catch { /* private mode */ }
const livePlayers = new Set();
function setSpeed(v) {
  SPEED = v;
  try { localStorage.setItem('rubiks.demoSpeed', String(v)); } catch { /* private mode */ }
  document.querySelectorAll('.demo-speed').forEach((b) => { b.textContent = `${v}×`; });
  livePlayers.forEach((p) => { p.speed = v; });
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Named piece sets, by home position.
const PIECES = {
  pair: [[1, -1, 1], [1, 0, 1]], // the front-right corner + edge
  crossEdge: [[0, -1, 1], [0, -1, 0], [0, 0, 1]], // white-green edge + the two centres it sits between
};

// paused: shows the starting position (the thing to look for) until tapped.
export function demoHTML({ setup = '', alg, mask = 'none', pieces = '', view = 'top', caption = '', paused = false }) {
  return `<div class="demo${paused ? ' paused' : ''}" data-setup="${esc(setup)}" data-alg="${esc(alg)}" data-mask="${mask}" data-pieces="${pieces}" data-view="${view}">
    <div class="demo-cube"></div>
    <div class="demo-bar"><i></i></div>
    <div class="demo-btns"><button class="demo-speed" title="Speed">${SPEED}×</button><button class="demo-restart" aria-label="Restart" title="Play from the start"></button>${paused ? '<button class="demo-play" aria-label="Play"></button>' : ''}</div>
    <div class="demo-moves"></div>
    ${caption ? `<div class="demo-cap">${caption}</div>` : ''}
  </div>`;
}

// Starts every .demo under root; returns a function that stops them all.
// Each demo can: play (loop), jump to a move (tap it: the cube shows the
// frame just before it), restart (play again from the start).
export function mountDemos(root) {
  const players = [];
  // Only one case plays at a time: starting one stops the other, which goes
  // back to its still picture and gives its 3D cube back.
  let active = null;
  for (const host of root.querySelectorAll('.demo')) {
    labels(host);
    const paused = host.classList.contains('paused');
    const moves = parseAlg(host.dataset.alg);
    const toks = [...host.querySelectorAll('.demo-moves .tok')];
    const bar = host.querySelector('.demo-bar i');
    // the bar fills over a move while it turns (ms), or jumps there (0)
    const mark = (i, ms = 0) => {
      toks.forEach((t, j) => { t.classList.toggle('on', j === i); t.classList.toggle('done', j < i); });
      const n = Math.max(0, Math.min(moves.length, ms ? i + 1 : i));
      bar.style.transition = ms ? `width ${ms}ms linear` : 'none';
      bar.style.width = `${(n / moves.length) * 100}%`;
    };
    const src = paused ? still(host) : null;
    const card = { p: null, gen: 0, playing: false };

    const live = () => {
      if (card.p) return card.p;
      if (paused && active && active !== card) active.stop();
      if (paused) active = card;
      host.querySelector('.demo-still')?.remove();
      card.p = new CubePlayer(host.querySelector('.demo-cube'), { interactive: false });
      card.p.setView(host.dataset.view || 'top', true);
      card.p.speed = SPEED;
      players.push(card.p);
      livePlayers.add(card.p);
      return card.p;
    };
    const setPlaying = (on) => { card.playing = on; host.classList.toggle('playing', on); };

    // from: start at that move the first time round (skipping there), then loop
    card.play = async (from = 0) => {
      const p = live(), g = ++card.gen;
      setPlaying(true);
      let start = from;
      while (card.gen === g && !p.dead) {
        pose(p, host);
        p.applyNow(moves.slice(0, start));
        mark(start);
        await wait(start ? 300 : 700);
        for (let i = start; i < moves.length; i++) {
          if (card.gen !== g) return;
          mark(i, 650 / SPEED);
          if (!(await p.animate(moves[i], 650))) return;
          await wait(180 / SPEED);
        }
        if (card.gen !== g) return;
        mark(moves.length);
        await wait(1400);
        start = 0;
      }
    };
    // tap a move: skip to it. Playing -> carry on from there; paused -> just
    // show that frame (the cube just before the move).
    card.stepTo = (i) => {
      if (card.playing) return card.play(i);
      const p = live();
      card.gen++;
      setPlaying(false);
      pose(p, host);
      p.applyNow(moves.slice(0, i));
      mark(i);
    };
    card.stop = () => {
      card.gen++;
      setPlaying(false);
      if (!paused) return;
      card.p?.destroy();
      card.p = null;
      mark(-1);
      host.querySelector('.demo-still')?.remove();
      showStill(host, src);
      if (active === card) active = null;
    };

    host.querySelector('.demo-play')?.addEventListener('click', (e) => { e.stopPropagation(); card.playing ? card.stop() : card.play(); });
    host.querySelector('.demo-restart').addEventListener('click', (e) => { e.stopPropagation(); card.play(); });
    host.querySelector('.demo-speed').addEventListener('click', (e) => {
      e.stopPropagation();
      setSpeed(SPEEDS[(SPEEDS.indexOf(SPEED) + 1) % SPEEDS.length]);
    });
    if (paused) host.querySelector('.demo-cube').addEventListener('click', () => (card.playing ? card.stop() : card.play()));
    toks.forEach((t, i) => t.addEventListener('click', () => card.stepTo(i)));
    host.querySelector('.demo-bar').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      card.stepTo(Math.min(moves.length - 1, Math.floor(((e.clientX - r.left) / r.width) * moves.length)));
    });
    if (!paused) card.play();
  }
  return () => { active = null; players.forEach((p) => { livePlayers.delete(p); p.destroy(); }); };
}

// Each move carries everything before it (data-pre), so its hover tip can
// show this case's real cube at that moment.
function labels(host) {
  const moves = parseAlg(host.dataset.alg), setup = host.dataset.setup || '';
  host.querySelector('.demo-moves').innerHTML = moves.map((m, i) => {
    const pre = [setup, ...moves.slice(0, i).map((x) => x.tok)].join(' ').trim();
    return `<span class="tok" data-mv="${esc(m.tok)}" data-pre="${esc(pre)}" data-view="${host.dataset.view || 'top'}">${esc(m.tok)}</span>`;
  }).join(' ');
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
