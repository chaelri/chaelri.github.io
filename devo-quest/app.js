/* devo quest: Bible reading as a quest map. Vanilla JS, no build.
   Data: nasb-split/<book>/<ch>.json (shared with devo). AI + TTS: gemini-proxy.
   Progress lives in localStorage under "dq.state.v1" only (no Firebase). */
const PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app';
const KEY = 'dq.state.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const isPhone = () => matchMedia('(max-width:1023.98px)').matches;

/* ---------- books + regions ---------- */
let BOOKS = [];
const REGIONS = [
  { id: 'law', name: 'law', from: 0, to: 4, x: 18, y: 26, w: 150 },
  { id: 'history', name: 'history', from: 5, to: 16, x: 44, y: 18, w: 170 },
  { id: 'wisdom', name: 'wisdom', from: 17, to: 21, x: 74, y: 30, w: 180 },
  { id: 'prophets', name: 'prophets', from: 22, to: 38, x: 24, y: 68, w: 170 },
  { id: 'gospels', name: 'gospels', from: 39, to: 42, x: 54, y: 62, w: 160 },
  { id: 'letters', name: 'acts & letters', from: 43, to: 65, x: 82, y: 76, w: 160 },
];
const nice = n => n.toLowerCase().split(' ').map((w, i) => (i && ['of'].includes(w)) ? w : w.replace(/^[a-z]/, c => c.toUpperCase())).join(' ');
async function loadBooks() {
  const idx = await (await fetch('nasb-split/index.json')).json();
  BOOKS = Object.entries(idx).map(([n, ch], i) => ({ name: nice(n), slug: n.toLowerCase().replace(/ /g, '-'), ch, i }));
  BOOKS.forEach(b => b.region = REGIONS.find(r => b.i >= r.from && b.i <= r.to).id);
}
const book = slug => BOOKS.find(b => b.slug === slug);
const short = (b) => b.name.replace('Song of Solomon', 'Song').replace('Psalms', 'Psalm');
const refOf = (slug, ch) => `${short(book(slug))} ${ch}`;

/* ---------- state ---------- */
const S = Object.assign({
  xp: 0, cleared: {}, progress: {}, gems: {}, thanks: [], talk: {},
  streak: { n: 0, last: null, best: 0 }, book: 'psalms', theme: '', voice: 'en-US-BrianNeural',
  lastVisit: null, badges: {},
}, (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const day = (d = new Date()) => d.toLocaleDateString('en-CA');
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
function streakNow() { const l = S.streak.last; if (!l) return 0; return daysBetween(l, day()) <= 1 ? S.streak.n : 0; }
function lvl(xp = S.xp) { let n = 1, need = 200, rest = xp; while (rest >= need) { rest -= need; n++; need = 50 * (n + 3); } return { n, into: rest, need }; }
const XP = { read: 30, reflect: 20, gem: 10, thanks: 20, chest: 50, book: 100, region: 300 };
const UNLOCKS = [
  [5, 'postcard frames', 'soon'], [6, 'dusk trail', 'theme:dusk'], [8, "lumi's hats", 'soon'],
  [10, 'night trail', 'theme:night'], [12, 'warm reading voice', 'voice'], [15, 'golden trail', 'theme:golden'], [20, 'lumi evolves', 'soon'],
];
const key = (slug, ch) => `${slug}.${ch}`;
const clearedIn = slug => Object.keys(S.cleared).filter(k => k.startsWith(slug + '.')).length;
function nextCh(slug) { const b = book(slug); for (let c = 1; c <= b.ch; c++) if (!S.cleared[key(slug, c)]) return c; return null; }
function regionDone(r) { const bs = BOOKS.filter(b => b.region === r.id); const tot = bs.reduce((a, b) => a + b.ch, 0); const got = bs.reduce((a, b) => a + clearedIn(b.slug), 0); return { tot, got, pct: tot ? got / tot : 0 }; }
const totalCleared = () => Object.keys(S.cleared).length;

/* ---------- lumi: jelly, eyes + floating marks (emotion option c) ---------- */
const HEART = '<path d="M12 21C5 15 1 11 1 6.5A5.5 5.5 0 0 1 12 4a5.5 5.5 0 0 1 11 2.5C23 11 19 15 12 21z" fill="var(--accent)"/>';
function lumi(emo = 'idle', z = .3) {
  const two = (c, extra = '') => `<i class="ey ${c}" style="left:30%;${extra}"></i><i class="ey ${c}" style="right:30%;${extra}"></i>`;
  const E = {
    idle: [two('e-dot'), ''],
    happy: [two('e-arc'), '<i class="spark" style="right:-24px;top:-16px"></i><i class="spark" style="left:-32px;top:32px;animation-delay:.4s"></i>'],
    think: [two('e-dot', 'width:16px;height:22px;top:32%;transform:translateX(8px)'), '<div class="dots3"><i></i><i></i><i></i></div>'],
    curious: ['<i class="ey e-dot" style="left:30%"></i><i class="ey e-dot" style="right:28%;width:26px;height:34px;top:37%"></i>', '<span class="mark">?</span>'],
    wow: [two('e-big'), '<span class="mark">!</span>'],
    love: [`<svg class="ey e-heart" style="left:26%" viewBox="0 0 24 22">${HEART}</svg><svg class="ey e-heart" style="right:26%" viewBox="0 0 24 22">${HEART}</svg>`, `<svg style="position:absolute;right:-24px;top:-40px;width:52px;animation:floaty 2s infinite" viewBox="0 0 24 22">${HEART}</svg>`],
    proud: [two('e-cup'), '<i class="spark" style="right:-24px;top:-24px;width:56px;height:56px;background:var(--primary)"></i>'],
    sleepy: [two('e-line'), '<span class="mark" style="font-size:48px">z<span style="font-size:32px">z</span></span>'],
    miss: [two('e-dot', 'top:48%;height:22px'), '<i class="tear"></i>'],
  }[emo] || [two('e-dot'), ''];
  return `<div class="lumi" data-emo="${emo}" style="--z:${z}"><div class="body blob">${E[0]}</div>${E[1]}</div>`;
}
function setLumi(el, emo) { if (!el) return; const z = el.style.getPropertyValue('--z'); el.outerHTML = lumi(emo, z); }

/* ---------- AI (gemini-proxy) ---------- */
async function ai(prompt) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ task: 'summary', contents: [{ parts: [{ text: prompt }] }] }) });
    if (!r.ok) throw new Error('server');
    const d = await r.json();
    return (d?.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/\*\*/g, '').trim();
  } finally { clearTimeout(t); }
}
const LUMI = 'You are lumi, a small friendly jelly guide in a Bible reading game called devo quest. Speak simply and warmly, like a kind friend. No emoji, no markdown, no headings.';

/* ---------- chapter text ---------- */
const TEXT = {};
async function chapter(slug, ch) {
  const k = key(slug, ch);
  if (!TEXT[k]) TEXT[k] = await (await fetch(`nasb-split/${slug}/${ch}.json`)).json();
  return TEXT[k];
}

/* ---------- shell ---------- */
const NAV = [['world', 'world'], ['trail', 'quest'], ['satchel', 'satchel'], ['me', 'me']];
function shell() {
  $('#app').innerHTML = `<header>
    <button class="logo" data-go="#/world"><i class="blob"></i>devo quest</button>
    <div class="dnav">${NAV.map(([k, n]) => `<a href="#/${k}" data-nav="${k}">${n}</a>`).join('')}</div>
    <div class="stat"><span class="flame" id="flame"></span><b id="streak">0</b><span class="hide-m">day streak</span></div>
    <div class="xp"><small id="lvlTxt"></small><div class="bar"><i id="lvlBar"></i></div></div></header>
    <main id="view"></main>
    <nav class="bn">${NAV.map(([k, n]) => `<a href="#/${k}" data-nav="${k}"><i></i>${n}</a>`).join('')}</nav>`;
}
function hud() {
  const L = lvl(), s = streakNow();
  $('#streak').textContent = s; $('#flame').classList.toggle('off', !s);
  $('#lvlTxt').textContent = `lvl ${L.n} · ${L.into} / ${L.need} xp`;
  $('#lvlBar').style.width = (L.into / L.need * 100) + '%';
  document.body.dataset.t = S.theme || '';
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t);
  t.animate([{ opacity: 0, transform: 'translate(-50%,16px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 250, fill: 'forwards' });
  setTimeout(() => t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => t.remove()), 2200); }

/* curtain screen change (Web Animations API so OS reduce-motion does not hide it) */
let firstRender = true;
async function curtain(fn, msg) {
  const c = $('#curtain'), bar = $('#curtain .cbar i'); $('#cmsg').textContent = msg || 'loading';
  const ease = 'cubic-bezier(.7,0,.2,1)';
  await c.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration: 460, easing: ease, fill: 'forwards' }).finished;
  const work = fn();
  bar.animate([{ width: '0%' }, { width: '100%' }], { duration: 500, fill: 'forwards' });
  await Promise.all([work, wait(520)]);
  await c.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-110%)' }], { duration: 520, easing: ease, fill: 'forwards' }).finished;
  c.getAnimations().forEach(a => a.cancel()); bar.getAnimations().forEach(a => a.cancel());
}

/* ---------- router ---------- */
async function route() {
  stopListen();
  const [, name = 'world', a, b] = (location.hash || '#/world').split('/');
  const fn = SCREENS[name] || SCREENS.world;
  const navKey = { read: 'trail', win: 'trail' }[name] || name;
  $$('[data-nav]').forEach(x => x.classList.toggle('on', x.dataset.nav === navKey));
  const draw = async () => { const v = $('#view'); v.innerHTML = ''; await fn(v, a, b); v.firstElementChild?.classList.add('rise'); hud(); };
  if (firstRender) { firstRender = false; await draw(); } else await curtain(draw, { read: 'opening the chapter', win: 'counting your loot', trail: 'walking the trail' }[name]);
}
const go = h => { if (location.hash === h) route(); else location.hash = h; };

/* ---------- WORLD ---------- */
async function world(v) {
  const cur = book(S.book), nc = nextCh(S.book);
  const gap = S.lastVisit ? daysBetween(S.lastVisit, day()) : 0;
  const readToday = S.streak.last === day();
  const mood = gap >= 3 ? 'miss' : readToday ? 'happy' : 'sleepy';
  const hello = { miss: ['missed you!', `it's been ${gap} days. one chapter today?`], happy: ['nice work today', 'you already cleared a stop. another one?'], sleepy: ['lumi is sleepy', 'no chapter yet today. read one to wake lumi up'] }[mood];
  const done = totalCleared(), curReg = cur.region;
  v.innerHTML = `<div class="screen">
   <div class="stage map" id="mapStage">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${REGIONS.map(r => r.x + ',' + r.y).join(' ')}" fill="none" stroke="var(--ink)" stroke-opacity=".3" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    ${REGIONS.map((r, i) => { const p = regionDone(r); const c = p.pct >= 1 ? 'full' : p.got ? 'part' : 'none';
      const nb = BOOKS.filter(b => b.region === r.id).length;
      return `<button class="isle blob ${c} ${r.id === curReg ? 'here' : ''}" data-region="${r.id}" style="left:${r.x}%;top:${r.y}%;width:min(${r.w}px,30%);animation-delay:-${i}s"><b>${r.name}</b><small>${nb} books${p.got ? ' · ' + Math.max(1, Math.round(p.pct * 100)) + '%' : ''}</small></button>`; }).join('')}
   </div>
   <div class="col">
    <div class="card"><div class="row">${lumi(mood, .3)}<div><h3>${hello[0]}</h3><p class="muted">${hello[1]}</p></div></div>
     ${nc ? `<div class="row"><button class="btn" data-go="#/read/${S.book}/${nc}">read ${esc(refOf(S.book, nc))}</button><button class="btn sm line hide-m" data-go="#/trail/${S.book}">see the trail</button></div>` : `<p class="muted">You finished ${esc(cur.name)}. Pick a new book on the map.</p>`}</div>
    <div class="card hide-m"><h3>your journey</h3><div class="row" style="align-items:flex-end"><b style="font-size:61px;line-height:.9">${done}</b><span class="muted">of 1,189 chapters</span></div><div class="bar"><i style="width:${done / 1189 * 100}%"></i></div><p class="muted">now walking: ${esc(cur.name)} · tap an island to pick a book</p></div>
   </div></div>`;
  S.lastVisit = day(); save();
}
function openRegion(id) {
  const r = REGIONS.find(x => x.id === id);
  const bs = BOOKS.filter(b => b.region === id);
  modal(`<div class="row between"><h3 style="font-size:38px;line-height:.95">${r.name}</h3><button class="btn sm line" data-close>close</button></div>
   <div class="books scroll">${bs.map(b => { const g = clearedIn(b.slug); return `<button class="bk ${b.slug === S.book ? 'cur' : ''}" data-book="${b.slug}"><b>${esc(b.name)}</b><span class="muted">${g} / ${b.ch}</span><div class="bar"><i style="width:${g / b.ch * 100}%"></i></div></button>`; }).join('')}</div>`);
}
function modal(html) {
  closeModal();
  const o = document.createElement('div'); o.className = 'overlay'; o.id = 'modal';
  o.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-close]')) closeModal(); });
  document.body.append(o);
  o.querySelector('.panel').animate([{ transform: 'translateY(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  (o.querySelector('[data-safe]') || o.querySelector('button'))?.focus();
}
function closeModal() { $('#modal')?.remove(); }

/* ---------- TRAIL ---------- */
async function trail(v, slug) {
  slug = slug && book(slug) ? slug : S.book; S.book = slug; save();
  const b = book(slug), nc = nextCh(slug), got = clearedIn(slug);
  const items = []; // bottom (ch 1) to top
  for (let c = 1; c <= b.ch; c++) { items.push({ t: 'ch', c }); if (c % 5 === 0 && c < b.ch) items.push({ t: 'chest', c }); }
  const STEP = 112, H = items.length * STEP + 200;
  const pos = items.map((it, i) => ({ ...it, x: 50 + 30 * Math.sin(i * .85), y: H - 120 - i * STEP }));
  v.innerHTML = `<div class="screen">
   <div class="stage trail" id="trail"><div class="inner" style="height:${H}px">
    <div class="bg-blob blob" style="width:60%;height:${Math.min(H, 900)}px;left:-20%;bottom:0;background:var(--shape);opacity:.25"></div>
    ${S.theme === 'night' ? Array.from({ length: Math.round(H / 90) }, (_, i) => `<i class="star" style="left:${(i * 37) % 96 + 2}%;top:${(i * 89) % H}px"></i>`).join('') : ''}
    <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" style="height:${H}px"><polyline points="${pos.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="var(--ink)" stroke-opacity=".35" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    ${pos.map(p => {
      if (p.t === 'chest') { const open = S.cleared[key(slug, p.c)]; return `<div class="node chest ${open ? 'open' : ''}" style="left:${p.x}%;top:${p.y}px"><div class="dot blob">${open ? '' : 'chest'}</div></div>`; }
      const cl = S.cleared[key(slug, p.c)], now = p.c === nc;
      const stars = cl ? `<div class="stars">${[0, 1, 2].map(i => `<i class="${i < cl.stars ? '' : 'no'}"></i>`).join('')}</div>` : '';
      return `<button class="node ${cl ? 'done' : now ? 'now' : 'lock'}" data-ch="${p.c}" ${now ? 'id="nowNode"' : ''} style="left:${p.x}%;top:${p.y}px" aria-label="${esc(refOf(slug, p.c))}">${now ? lumi('idle', .28) : ''}<div class="dot blob" style="animation-delay:-${p.c % 7}s">${cl ? '✓' : p.c}</div>${stars}</button>`;
    }).join('')}
   </div></div>
   <div class="col">
    <div class="card" id="trailCard">${trailCard(slug, nc)}</div>
    <div class="card hide-m"><div class="row between"><h3>${esc(b.name)}</h3><b>${got} / ${b.ch}</b></div><div class="bar"><i style="width:${got / b.ch * 100}%"></i></div><p class="muted">a chest waits every 5 stops · +50 xp</p><div class="row"><button class="btn sm line" data-go="#/world">change book</button></div></div>
   </div></div>`;
  requestAnimationFrame(() => { const t = $('#trail'), n = $('#nowNode') || $(`[data-ch="${b.ch}"]`); if (t && n) t.scrollTop = n.offsetTop - t.clientHeight / 2; });
}
function trailCard(slug, c) {
  if (!c) return `<div class="row">${lumi('proud', .3)}<div><h3>${esc(book(slug).name)} cleared!</h3><p class="muted">every stop on this trail is done</p></div></div><div class="row"><button class="btn" data-go="#/world">pick a new book</button></div>`;
  const cl = S.cleared[key(slug, c)];
  if (cl) return `<div class="row">${lumi('happy', .3)}<div><h3>${esc(refOf(slug, c))} · cleared</h3><p class="muted">${cl.stars} of 3 stars · ${cl.date}</p></div></div><div class="row"><button class="btn sm" data-go="#/read/${slug}/${c}">read again</button><button class="btn sm line" data-pick="">back to today</button></div>`;
  const isNext = c === nextCh(slug);
  return `<div class="row">${lumi(isNext ? 'idle' : 'curious', .3)}<div><h3>${esc(refOf(slug, c))}</h3><p class="muted">${isNext ? "today's stop · 4 steps · up to +80 xp" : 'a stop further up the trail'}</p></div></div><div class="row"><button class="btn" data-go="#/read/${slug}/${c}">${isNext ? 'start reading' : 'jump ahead'}</button></div>`;
}

/* ---------- READ ---------- */
let R = null; // current reading session
const STEPS = [['read', 'read or listen', 'to the end of the chapter'], ['reflect', 'reflect with lumi', 'answer one question'], ['gem', 'keep a gem', 'tap a verse to save it'], ['thanks', 'say thanks', 'one line of gratitude']];
async function read(v, slug, ch) {
  slug = book(slug) ? slug : S.book; ch = Math.max(1, Math.min(+ch || 1, book(slug).ch));
  const k = key(slug, ch), text = await chapter(slug, ch);
  S.progress[k] = S.progress[k] || {}; S.talk[k] = S.talk[k] || [];
  R = { slug, ch, k, text, p: S.progress[k], talk: S.talk[k], pick: null };
  v.innerHTML = `<div class="screen">
   <div class="read" id="readBox">
    <div class="row between" style="flex-wrap:wrap"><h2>${esc(refOf(slug, ch))}</h2><div class="row" style="gap:8px"><button class="btn sm line" data-go="#/trail/${slug}">trail</button><button class="btn sm" id="listenBtn" data-act="listen">listen</button></div></div>
    <div class="vs" id="verses">${Object.entries(text).map(([n, t]) => `<p class="v ${S.gems[k + '.' + n] ? 'kept' : ''}" data-v="${n}"><sup>${n}</sup>${esc(t.replace(/¶/g, ""))}</p>`).join('')}</div>
    <div class="endread" id="endRead"></div>
   </div>
   <div class="col hide-m" id="sidePanel">${questPanel()}</div>
   <button class="sheetbar only-m" id="sheetBar" data-act="sheet"></button>
  </div>`;
  paintRead(); startTalk();
}
function questPanel(chatFirst) {
  const steps = `<div class="card"><div class="row between"><h3>quest steps</h3><b id="stepCount"></b></div><div class="bar"><i id="stepBar"></i></div><div class="steps" id="steps"></div></div>`;
  const chat = `<div class="card chat" id="chatCard"><div class="lhead"><span id="lumiSlot">${lumi('idle', .32)}</span><div><h3>lumi</h3><p class="muted" id="lumiSub">your guide</p></div></div>
    <div class="msgs" id="msgs"></div>
    <div class="chips"><button class="btn sm line" data-ask="simple">explain simply</button><button class="btn sm line" data-ask="fact">fun fact</button><button class="btn sm line" data-ask="who">who wrote this?</button></div>
    <form class="ask" id="askForm"><input id="askIn" placeholder="answer lumi or ask anything" autocomplete="off"><button class="btn sm">send</button></form></div>`;
  return chatFirst ? chat + steps : steps + chat;
}
const doneCount = () => STEPS.filter(([s]) => R.p[s]).length;
function paintRead() {
  if (!R) return;
  const host = $('#modal .panel') || document;
  const st = $('#steps', host);
  if (st) {
    const next = STEPS.find(([s]) => !R.p[s])?.[0];
    st.innerHTML = STEPS.map(([s, t, d]) => `<button class="step ${R.p[s] ? 'done' : 'todo'} ${s === next ? 'next' : ''}" data-step="${s}"><span class="ck ${R.p[s] ? 'blob' : ''}">${R.p[s] ? '✓' : ''}</span><span><b>${t}</b><small>${d}</small></span><em>+${XP[s]}</em></button>${s === 'thanks' && R.thanksOpen && !R.p.thanks ? `<div class="thanks"><textarea id="thanksIn" placeholder="today I'm thankful for..."></textarea><div class="row"><button class="btn sm" data-act="saveThanks">save</button></div></div>` : ''}`).join('');
    $('#stepCount', host).textContent = `${doneCount()} / 4`;
    $('#stepBar', host).style.width = doneCount() / 4 * 100 + '%';
  }
  $('#endRead').innerHTML = R.p.read
    ? `${lumi('happy', .3)}<p class="muted">${doneCount()} of 4 steps done${doneCount() < 4 ? ' · more steps = more stars' : ''}</p><button class="btn" data-act="clear">clear this stop</button>`
    : `<button class="btn" data-act="readDone">I finished reading · +30 xp</button>`;
  const bar = $('#sheetBar');
  if (bar) { const next = STEPS.find(([s]) => !R.p[s]); bar.innerHTML = `${lumi(R.emo || 'idle', .24)}<div class="txt"><b>${doneCount()} of 4 · ${next ? next[1] : 'all steps done'}</b><span class="muted">tap to talk with lumi</span></div><span class="btn sm">open</span>`; }
}
function setStep(s) {
  if (R.p[s]) return; R.p[s] = 1; save(); paintRead();
  toast(`+${XP[s]} xp · ${STEPS.find(x => x[0] === s)[1]}`);
}
/* chat */
function paintMsgs() {
  const box = $('#msgs', $('#modal .panel') || document); if (!box) return;
  box.innerHTML = R.talk.map(m => `<div class="bub ${m.me ? 'me' : m.q ? 'q' : ''}">${esc(m.t)}</div>`).join('') + (R.typing ? '<div class="bub" style="opacity:.6">...</div>' : '');
  box.scrollTop = box.scrollHeight;
}
function emo(e, sub) {
  R.emo = e;
  const host = $('#modal .panel') || document;
  const slot = $('#lumiSlot', host); if (slot) slot.innerHTML = lumi(e, .32);
  if (sub) { const s = $('#lumiSub', host); if (s) s.textContent = sub; }
  const bar = $('#sheetBar .lumi'); if (bar) setLumi(bar, e);
}
const chText = () => Object.entries(R.text).map(([n, t]) => `${n} ${t}`).join(' ').slice(0, 9000);
async function startTalk() {
  paintMsgs();
  if (R.talk.length) { emo(R.p.reflect ? 'happy' : 'curious'); return; }
  const r = R; emo('think', 'thinking of a question'); R.typing = 1; paintMsgs();
  try {
    const q = await ai(`${LUMI}\nThe reader is about to read ${refOf(r.slug, r.ch)} (NASB). Text: ${chText()}\nAsk ONE short personal reflection question about this chapter (max 22 words). Output only the question.`);
    if (R !== r) return;
    R.typing = 0; R.talk.push({ q: 1, t: q || 'What stood out to you most in this chapter?' }); save(); paintMsgs(); emo('curious', 'asks you');
  } catch (e) { if (R !== r) return; R.typing = 0; R.talk.push({ q: 1, t: 'What stood out to you most in this chapter?' }); save(); paintMsgs(); emo('curious', 'asks you'); }
}
async function send(text, kind) {
  const r = R; if (!text) return;
  const answering = !R.p.reflect && R.talk.some(m => m.q) && !kind;
  R.talk.push({ me: 1, t: text }); R.typing = 1; save(); paintMsgs(); emo('think', 'typing');
  const lastQ = [...R.talk].reverse().find(m => m.q)?.t || '';
  const prompt = kind === 'fact' ? `${LUMI}\nGive ONE surprising, accurate historical or cultural fact about ${refOf(r.slug, r.ch)} in max 45 words.`
    : kind === 'simple' ? `${LUMI}\nExplain ${refOf(r.slug, r.ch)} in simple words for a busy reader, max 80 words. Text: ${chText()}`
    : kind === 'who' ? `${LUMI}\nWho wrote ${book(r.slug).name} and when, and why it matters for reading chapter ${r.ch}? Max 60 words.`
    : answering ? `${LUMI}\nYou asked about ${refOf(r.slug, r.ch)}: "${lastQ}". The reader answered: "${text}". Reply warmly in 2-3 short sentences, and point to one verse in the chapter by number. Text: ${chText()}`
    : `${LUMI}\nThe reader is reading ${refOf(r.slug, r.ch)} (NASB). Text: ${chText()}\nRecent chat: ${R.talk.slice(-6).map(m => (m.me ? 'reader: ' : 'lumi: ') + m.t).join(' | ')}\nAnswer the reader's latest message in max 90 words.`;
  try {
    const a = await ai(prompt);
    if (R !== r) return;
    R.typing = 0; R.talk.push({ t: a || "Hmm, I couldn't think of an answer. Try asking another way?" }); save(); paintMsgs();
    emo(kind === 'fact' ? 'wow' : 'happy', kind === 'fact' ? 'fun fact!' : 'your guide');
    if (answering) setStep('reflect');
  } catch (e) {
    if (R !== r) return;
    R.typing = 0; R.talk.push({ t: "I can't reach the internet right now. Try again in a bit?" }); save(); paintMsgs(); emo('miss', 'offline');
    if (answering) setStep('reflect');
  }
}
/* verse pick + gem */
function pickVerse(n) {
  $$('.vact').forEach(x => x.remove()); $$('.v.pick').forEach(x => x.classList.remove('pick'));
  if (R.pick === n) { R.pick = null; return; }
  R.pick = n; const p = $(`.v[data-v="${n}"]`); p.classList.add('pick');
  const kept = S.gems[R.k + '.' + n];
  p.insertAdjacentHTML('afterend', `<div class="vact"><button class="btn sm" data-act="gem">${kept ? 'remove gem' : 'keep as gem'}</button><button class="btn sm line" data-act="askVerse">ask lumi about v${n}</button></div>`);
}
function toggleGem() {
  const n = R.pick, gk = R.k + '.' + n;
  if (S.gems[gk]) { delete S.gems[gk]; $(`.v[data-v="${n}"]`).classList.remove('kept'); toast('gem removed'); }
  else { S.gems[gk] = { date: day(), note: '' }; $(`.v[data-v="${n}"]`).classList.add('kept'); emo('love', 'gem saved'); setStep('gem'); if (!R.p.gem) toast('gem kept'); }
  save(); pickVerse(n);
}
/* listen (Edge TTS via proxy, verse by verse) */
let LS = null;
async function tts(text) {
  const r = await fetch(`${PROXY}/edge-tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: S.voice }) });
  if (!r.ok) throw new Error('tts');
  const { audioBase64 } = await r.json();
  return URL.createObjectURL(new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], { type: 'audio/mpeg' }));
}
function stopListen() { if (LS) { LS.stop = 1; LS.audio?.pause(); LS = null; } $$('.v.speak').forEach(x => x.classList.remove('speak')); const b = $('#listenBtn'); if (b) b.textContent = 'listen'; }
async function listen() {
  if (LS) { stopListen(); return; }
  const me = LS = { stop: 0 }; $('#listenBtn').textContent = 'stop'; emo('idle', 'listening with you');
  const vs = Object.entries(R.text); let next = tts(vs[0][1]);
  for (let i = 0; i < vs.length; i++) {
    if (me.stop) return;
    let url; try { url = await next; } catch (e) { toast("can't load the voice right now"); stopListen(); return; }
    if (i + 1 < vs.length) next = tts(vs[i + 1][1]);
    if (me.stop) return;
    $$('.v.speak').forEach(x => x.classList.remove('speak'));
    const el = $(`.v[data-v="${vs[i][0]}"]`); el?.classList.add('speak'); el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    me.audio = new Audio(url);
    await new Promise(res => { me.audio.onended = res; me.audio.onerror = res; me.audio.play().catch(res); });
  }
  if (!me.stop) { stopListen(); setStep('read'); emo('happy'); }
}
/* clear the stop */
function clearStop() {
  const { slug, ch, k, p } = R; const first = !S.cleared[k];
  const before = S.xp, L0 = lvl(before).n, lines = [];
  STEPS.forEach(([s, t]) => { if (p[s] && !p['paid_' + s]) { lines.push([t, XP[s]]); p['paid_' + s] = 1; } });
  const stars = ['reflect', 'gem', 'thanks'].filter(s => p[s]).length;
  let chest = false, bookDone = false, regionDoneNow = false, streakUp = false;
  if (first) {
    if (S.streak.last !== day()) {
      S.streak.n = S.streak.last && daysBetween(S.streak.last, day()) === 1 ? S.streak.n + 1 : 1;
      S.streak.last = day(); S.streak.best = Math.max(S.streak.best, S.streak.n); streakUp = true;
      const bonus = Math.min(2 * S.streak.n, 30); lines.push([`day ${S.streak.n} streak bonus`, bonus]);
    }
    S.cleared[k] = { stars, date: day() };
    if (ch % 5 === 0 && ch < book(slug).ch) { chest = true; lines.push(['opened a chest', XP.chest]); }
    if (clearedIn(slug) === book(slug).ch) { bookDone = true; lines.push([`finished ${book(slug).name}`, XP.book]); }
    const reg = REGIONS.find(r => r.id === book(slug).region);
    if (bookDone && regionDone(reg).pct >= 1) { regionDoneNow = true; lines.push([`cleared ${reg.name}`, XP.region]); }
  } else S.cleared[k].stars = Math.max(S.cleared[k].stars, stars);
  const gain = lines.reduce((a, l) => a + l[1], 0); S.xp += gain;
  const L1 = lvl().n; const unlocked = UNLOCKS.filter(u => u[0] > L0 && u[0] <= L1);
  S.lastWin = { slug, ch, stars: S.cleared[k].stars, lines, gain, before, after: S.xp, streak: streakNow(), gems: Object.keys(S.gems).filter(g => g.startsWith(k + '.')).length, levelUp: L1 > L0 ? L1 : 0, unlocked, chest, bookDone, regionDoneNow, streakUp };
  save(); go(`#/win/${slug}/${ch}`);
}

/* ---------- WIN ---------- */
async function win(v) {
  const w = S.lastWin; if (!w) return go('#/trail');
  const L0 = lvl(w.before), L1 = lvl(w.after);
  const big = w.levelUp || w.bookDone || [7, 30, 100].includes(w.streak);
  const nc = nextCh(w.slug);
  v.innerHTML = `<div class="screen"><div class="win">
   <div class="bg-blob blob" style="width:220px;height:200px;left:6%;top:8%;background:var(--shape);opacity:.5"></div>
   <div class="bg-blob blob" style="width:160px;height:150px;right:8%;top:20%;background:var(--accent);opacity:.25;animation-delay:-2s"></div>
   <div class="card">
    ${lumi(big ? 'proud' : 'happy', .4)}
    <div class="starsbig">${[0, 1, 2].map(i => `<i class="blob ${i < w.stars ? '' : 'no'}" style="animation-delay:-${i * 2}s"></i>`).join('')}</div>
    <h2>${esc(refOf(w.slug, w.ch))} cleared</h2>
    <div class="loot"><div><b>+${w.gain}</b><small>xp</small></div><div><b>${w.streak}</b><small>day streak</small></div><div><b>${w.gems}</b><small>gem${w.gems === 1 ? '' : 's'} kept</small></div></div>
    ${w.lines.length ? `<div class="lines">${w.lines.map(([t, x]) => `<div><span>${esc(t)}</span><b>+${x}</b></div>`).join('')}</div>` : ''}
    <div style="width:100%;display:flex;flex-direction:column;gap:8px"><div class="row between"><small style="font-size:12px;font-weight:600" id="winLvl">lvl ${L0.n}</small><small style="font-size:12px;font-weight:600" id="winXp">${L0.into} / ${L0.need} xp</small></div><div class="bar"><i id="winBar" style="width:${L0.into / L0.need * 100}%"></i></div></div>
    ${w.levelUp ? `<p class="muted"><b>level ${w.levelUp}!</b>${w.unlocked.length ? ' unlocked: ' + w.unlocked.map(u => u[1]).join(', ') : ''}</p>` : ''}
    <div class="row" style="flex-wrap:wrap;justify-content:center"><button class="btn line" data-go="#/trail/${w.slug}">back to the trail</button>${nc ? `<button class="btn" data-go="#/read/${w.slug}/${nc}">next stop · ${esc(refOf(w.slug, nc))}</button>` : ''}</div>
   </div></div></div>`;
  setTimeout(() => { const b = $('#winBar'); if (!b) return;
    if (L1.n > L0.n) { b.style.width = '100%'; setTimeout(() => { b.style.transition = 'none'; b.style.width = '0%'; requestAnimationFrame(() => { b.style.transition = ''; b.style.width = L1.into / L1.need * 100 + '%'; }); $('#winLvl').textContent = 'lvl ' + L1.n; }, 900); }
    else b.style.width = L1.into / L1.need * 100 + '%';
    $('#winXp').textContent = `${L1.into} / ${L1.need} xp`; }, 700);
}

/* ---------- SATCHEL ---------- */
let SAT = { tab: 'gems', sel: null };
async function satchel(v) {
  const gk = Object.keys(S.gems).sort((a, b) => (S.gems[b].date || '').localeCompare(S.gems[a].date || ''));
  if (SAT.sel && !S.gems[SAT.sel]) SAT.sel = null;
  if (!SAT.sel && gk.length && !isPhone()) SAT.sel = gk[0];
  const cols = ['var(--shape)', 'var(--primary)', 'var(--accent)'];
  const gemRef = g => { const [s, c, n] = g.split('.'); return `${short(book(s))} ${c}:${n}`; };
  let left = '';
  if (SAT.tab === 'gems') left = gk.length ? `<div class="gems">${gk.map((g, i) => `<button class="gem ${g === SAT.sel ? 'sel' : ''}" data-gem="${g}"><i class="blob" style="background:${cols[i % 3]};animation-delay:-${i % 5}s"></i><b>${esc(gemRef(g))}</b><small>kept ${S.gems[g].date}</small></button>`).join('')}</div>`
    : `<div class="empty">${lumi('curious', .5)}<h3>no gems yet</h3><p class="muted">while reading, tap a verse and keep it as a gem</p></div>`;
  if (SAT.tab === 'thanks') left = S.thanks.length ? `<div class="col">${[...S.thanks].reverse().map(t => `<div class="card"><p style="font-size:20px">${esc(t.text)}</p><span class="muted">${esc(t.ref)} · ${t.date}</span></div>`).join('')}</div>`
    : `<div class="empty">${lumi('curious', .5)}<h3>nothing yet</h3><p class="muted">the "say thanks" step saves here</p></div>`;
  if (SAT.tab === 'badges') left = `<div class="card"><div class="badges">${badgeList().map(([n, ok, p], i) => `<div class="badge"><i class="blob" style="background:${ok ? cols[i % 3] : 'var(--soft)'};animation-delay:-${i}s"></i><small>${n}</small>${p ? `<small>${p}</small>` : ''}</div>`).join('')}</div></div>`;
  let detail = '';
  if (SAT.sel && SAT.tab === 'gems') {
    const [s, c, n] = SAT.sel.split('.'); const t = (await chapter(s, c))[n];
    detail = `<div class="card"><div class="row">${lumi('love', .3)}<div><h3>${esc(gemRef(SAT.sel))}</h3><p class="muted">kept ${S.gems[SAT.sel].date}</p></div></div>
      <p style="font-size:24px;line-height:1.35">“${esc(t)}”</p>
      <textarea class="note" id="gemNote" placeholder="add a note to this gem">${esc(S.gems[SAT.sel].note || '')}</textarea>
      <div class="row" style="flex-wrap:wrap"><button class="btn sm" data-act="saveNote">save note</button><button class="btn sm line" data-go="#/read/${s}/${c}">open chapter</button><button class="btn sm line" data-act="dropGem">remove</button></div></div>`;
  }
  v.innerHTML = `<div class="screen">
   <div class="col" style="min-height:0"><div class="row between" style="flex-wrap:wrap"><h2 style="font-size:38px;line-height:.95">satchel</h2><div class="tabs">${[['gems', `gems ${gk.length}`], ['thanks', `thanks ${S.thanks.length}`], ['badges', 'badges']].map(([k, n]) => `<a data-tab="${k}" class="${SAT.tab === k ? 'on' : ''}">${n}</a>`).join('')}</div></div>
    <div class="scroll" style="min-height:0;flex:1">${left}</div></div>
   <div class="col ${detail ? '' : 'hide-m'}">${detail || `<div class="card"><h3>what goes in here</h3><p class="muted">gems: verses you keep while reading, with your notes. thanks: your gratitude lines. badges: milestones on the journey.</p></div>`}</div>
  </div>`;
  if (isPhone() && detail) { modal(`<div class="row between"><span></span><button class="btn sm line" data-close>close</button></div><div class="scroll">${detail}</div>`); }
}
function badgeList() {
  const best = Math.max(S.streak.best, streakNow()), books = BOOKS.filter(b => clearedIn(b.slug) === b.ch).length, n = totalCleared(), g = Object.keys(S.gems).length;
  const full = Object.values(S.cleared).filter(c => c.stars === 3).length;
  return [['first stop', n >= 1, n ? '' : '0 / 1'], ['7-day streak', best >= 7, best >= 7 ? '' : `${best} / 7`], ['30-day streak', best >= 30, best >= 30 ? '' : `${best} / 30`],
    ['10 gems', g >= 10, g >= 10 ? '' : `${g} / 10`], ['3 stars x10', full >= 10, full >= 10 ? '' : `${full} / 10`], ['finish a book', books >= 1, ''],
    ['100 chapters', n >= 100, n >= 100 ? '' : `${n} / 100`], ['clear a region', REGIONS.some(r => regionDone(r).pct >= 1), ''], ['whole Bible', n >= 1189, n >= 1189 ? '' : `${n} / 1189`]];
}

/* ---------- ME ---------- */
async function me(v) {
  const L = lvl();
  const road = [...new Set([1, 2, 3, 4, ...UNLOCKS.map(u => u[0]), L.n])].sort((a, b) => a - b).filter(n => n >= Math.max(1, L.n - 3)).slice(0, 9);
  const looks = [['', 'trail', 1, ['#F4EBDD', '#2F6B4F', '#E8B04B']], ['dusk', 'dusk', 6, ['#F3DCCF', '#7A3B69', '#F0A07A']], ['night', 'night', 10, ['#121A33', '#4A66C9', '#F2D06B']], ['golden', 'golden', 15, ['#FFF3D1', '#7A5C0E', '#F2C230']]];
  v.innerHTML = `<div class="screen stack">
   <div class="col scroll">
    <div class="card"><div class="row">${lumi('proud', .36)}<div><h2>level ${L.n}</h2><p class="muted">${S.xp} xp total · ${L.need - L.into} xp to level ${L.n + 1}</p></div></div><div class="bar"><i style="width:${L.into / L.need * 100}%"></i></div></div>
    <div class="card"><h3>level road</h3><div class="road">${road.map(n => { const u = UNLOCKS.find(x => x[0] === n);
      return `<div class="lv ${n < L.n ? 'got' : n === L.n ? 'now' : ''}"><div class="dot blob" style="animation-delay:-${n % 6}s">${n}</div><div><b>${u ? esc(u[1]) : n === L.n ? 'you are here' : 'level ' + n}</b><small>${u ? (u[2] === 'soon' ? 'reward coming soon' : n <= L.n ? 'unlocked' : 'unlocks at level ' + n) : ''}</small></div><span class="muted">${n === L.n ? `${L.into} / ${L.need}` : ''}</span></div>`; }).join('')}</div></div>
   </div>
   <div class="col scroll">
    <div class="card"><h3>map look</h3><div class="looks">${looks.map(([t, n, at, c]) => `<button class="look ${S.theme === t ? 'on' : ''}" data-theme="${t}" ${L.n < at ? 'disabled' : ''}><i>${c.map(x => `<b style="background:${x}"></b>`).join('')}</i>${n}${L.n < at ? ' · lvl ' + at : ''}</button>`).join('')}</div>
     <div class="row between"><span class="muted">reading voice</span><div class="row" style="gap:8px"><button class="btn sm ${S.voice === 'en-US-BrianNeural' ? '' : 'line'}" data-voice="en-US-BrianNeural">calm</button><button class="btn sm ${S.voice === 'en-US-AvaNeural' ? '' : 'line'}" data-voice="en-US-AvaNeural" ${L.n < 12 ? 'disabled' : ''}>warm${L.n < 12 ? ' · lvl 12' : ''}</button></div></div></div>
    <div class="card"><h3>how you earn xp</h3><div class="earn">${[['read or listen to a chapter', '+30'], ['reflect with lumi', '+20'], ['keep a gem', '+10'], ['say thanks', '+20'], ['daily streak bonus', '+2 / day, max +30'], ['open a chest (every 5 stops)', '+50'], ['finish a book', '+100'], ['clear a region', '+300']].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div></div>
    <div class="card"><div class="row between"><span class="muted">start over from zero</span><button class="btn sm line" data-act="reset">reset progress</button></div></div>
   </div></div>`;
}

const SCREENS = { world, trail, read, win, satchel, me };

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-region],[data-book],[data-ch],[data-act],[data-step],[data-ask],[data-tab],[data-gem],[data-theme],[data-voice],[data-pick],.v');
  if (!t) return;
  const d = t.dataset;
  if (d.go) { closeModal(); return go(d.go); }
  if (d.region) return openRegion(d.region);
  if (d.book) { S.book = d.book; save(); closeModal(); return go(`#/trail/${d.book}`); }
  if (d.ch) { $$('.node.sel').forEach(n => n.classList.remove('sel')); t.classList.add('sel'); $('#trailCard').innerHTML = trailCard(S.book, +d.ch); if (isPhone()) $('#trailCard').scrollIntoView({ behavior: 'smooth' }); return; }
  if ('pick' in d) { $$('.node.sel').forEach(n => n.classList.remove('sel')); $('#trailCard').innerHTML = trailCard(S.book, nextCh(S.book)); return; }
  if (t.classList.contains('v')) return pickVerse(t.dataset.v);
  if (d.tab) { SAT.tab = d.tab; return satchel($('#view')); }
  if (d.gem) { SAT.sel = d.gem; return satchel($('#view')); }
  if (d.theme !== undefined) { S.theme = d.theme; save(); hud(); return me($('#view')); }
  if (d.voice) { S.voice = d.voice; save(); return me($('#view')); }
  if (d.ask) { const q = { simple: 'explain this chapter simply', fact: 'tell me a fun fact', who: 'who wrote this?' }[d.ask]; return send(q, d.ask); }
  if (d.step) {
    if (d.step === 'thanks' && !R.p.thanks) { R.thanksOpen = !R.thanksOpen; paintRead(); $('#thanksIn')?.focus(); }
    if (d.step === 'gem' && !R.p.gem) { closeModal(); toast('tap any verse to keep it'); }
    if (d.step === 'read' && !R.p.read) { closeModal(); $('#endRead').scrollIntoView({ behavior: 'smooth' }); }
    if (d.step === 'reflect' && !R.p.reflect) { const i = $('#askIn', $('#modal .panel') || document); i?.focus(); }
    return;
  }
  switch (d.act) {
    case 'listen': return listen();
    case 'readDone': setStep('read'); emo('happy'); return;
    case 'clear': return clearStop();
    case 'gem': return toggleGem();
    case 'askVerse': { const n = R.pick; const msg = `What does verse ${n} mean? "${R.text[n]}"`; if (isPhone()) openSheet(); return send(msg, 'verse'); }
    case 'saveThanks': { const val = $('#thanksIn').value.trim(); if (!val) return; S.thanks.push({ text: val, ref: refOf(R.slug, R.ch), date: day() }); R.thanksOpen = false; emo('love', 'thank you!'); setStep('thanks'); return; }
    case 'sheet': return openSheet();
    case 'saveNote': S.gems[SAT.sel].note = $('#gemNote').value; save(); toast('note saved'); return;
    case 'dropGem': delete S.gems[SAT.sel]; SAT.sel = null; save(); closeModal(); return satchel($('#view'));
    case 'reset': return modal(`<h3>reset all progress?</h3><p class="muted">xp, levels, cleared stops, gems and thanks will be wiped. This can't be undone.</p><div class="row" style="display:grid;grid-template-columns:1fr 1fr"><button class="btn line" data-close data-safe>keep my progress</button><button class="btn" style="background:var(--accent)" data-act="resetYes">reset</button></div>`);
    case 'resetYes': localStorage.removeItem(KEY); location.hash = '#/world'; location.reload(); return;
  }
});
function openSheet() {
  modal(`<div class="row between"><span></span><button class="btn sm line" data-close>close</button></div><div class="col scroll" style="flex:1;min-height:0">${questPanel(1)}</div>`);
  paintRead(); paintMsgs(); emo(R.emo || 'idle');
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'askForm') return; e.preventDefault();
  const i = e.target.querySelector('input'); const v = i.value.trim(); i.value = ''; send(v);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
const _close = closeModal;
// keep the sheet bar in sync after closing the phone sheet
closeModal = function () { const had = $('#modal'); _close(); if (had && R && $('#sheetBar')) paintRead(); };
addEventListener('hashchange', () => { closeModal(); route(); });

(async () => {
  shell();
  try { await loadBooks(); } catch (e) { $('#view').innerHTML = '<div class="empty"><h3>could not load the Bible data</h3></div>'; return; }
  if (!book(S.book)) S.book = 'psalms';
  route();
})();
