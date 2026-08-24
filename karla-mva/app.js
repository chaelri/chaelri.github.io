import { PROFILE, INTRO, POSITIONING, QA, CHECKLIST } from './data.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const KEY = 'karla-mva:v1';

const store = {
  read()  { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
  write(o){ try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} },
};
let state = Object.assign({ done: [], checks: [] }, store.read());
const save = () => store.write(state);

/* ------------------------------------------------------------------ toast */
let toastT;
function toast(msg) {
  $('#toastTxt').textContent = msg;
  const el = $('#toast');
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 1900);
}

/* ------------------------------------------------------------------ facts */
$('#facts').innerHTML = PROFILE.facts.map(f => `
  <div class="rounded-xl border border-[#1b1f27] bg-[#0d0f14] px-4 py-4">
    <span class="ms text-[20px] text-teal-300/70">${f.icon}</span>
    <div class="mt-2.5 text-[24px] font-semibold tracking-tight leading-none">${esc(f.k)}</div>
    <div class="mt-1.5 text-[12.5px] text-[#7e8896] leading-snug">${esc(f.v)}</div>
  </div>`).join('');

/* ------------------------------------------------------------------ intro */
$('#introBox').innerHTML = INTRO.lines.map((l, i) => `
  <div class="flex gap-4 ${i ? 'mt-5 pt-5 border-t border-[#171b22]' : ''}">
    <span class="shrink-0 grid place-items-center w-6 h-6 rounded-md bg-teal-300/10 text-teal-300 text-[11px] font-semibold tabular-nums mt-0.5">${i + 1}</span>
    <p class="text-[15px] leading-[1.72] text-[#cfd6de]">${esc(l)}</p>
  </div>`).join('');

$('#coachBox').innerHTML = `
  <div class="flex items-center gap-2 mb-4">
    <span class="ms text-[18px] text-amber-300/80">tips_and_updates</span>
    <span class="text-[12px] tracking-[.13em] uppercase text-[#8b95a4]">Delivery</span>
  </div>
  <ul class="space-y-3.5">${INTRO.coaching.map(c => `
    <li class="flex gap-2.5 text-[13.5px] leading-relaxed text-[#a9b3c1]">
      <span class="ms text-[15px] text-teal-300/60 mt-0.5 shrink-0">arrow_right</span><span>${esc(c)}</span>
    </li>`).join('')}</ul>`;

$('#copyIntro').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(INTRO.lines.join('\n\n')); toast('Intro script copied'); }
  catch { toast('Copy blocked — select it manually'); }
});

/* ---------------------------------------------------------- teleprompter */
$('#teleBody').innerHTML = INTRO.lines.map(l => `<p class="text-[#dfe5ec]">${esc(l)}</p>`).join('');
const tele = $('#tele');
const openTele  = () => { tele.classList.add('on');  document.body.style.overflow = 'hidden'; };
const closeTele = () => { tele.classList.remove('on'); document.body.style.overflow = ''; };
$('#teleBtn').addEventListener('click', openTele);
$('#teleClose').addEventListener('click', closeTele);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tele.classList.contains('on')) closeTele(); });

/* ------------------------------------------------------------ positioning */
$('#posGrid').innerHTML = POSITIONING.map(p => `
  <article class="rv rounded-2xl border border-[#1b1f27] bg-[#0d0f14] p-5 hover:border-[#28313d] transition-colors">
    <div class="flex items-start gap-2.5 mb-3.5">
      <span class="ms text-[17px] text-[#5f6875] mt-0.5 shrink-0">description</span>
      <p class="text-[13.5px] font-medium text-[#c9d1da] leading-snug">${esc(p.req)}</p>
    </div>
    <div class="flex items-start gap-2.5 mb-3.5 pb-3.5 border-b border-[#171b22]">
      <span class="ms text-[17px] text-amber-300/70 mt-0.5 shrink-0">fact_check</span>
      <p class="text-[12.5px] text-[#828c9a] leading-relaxed">${esc(p.truth)}</p>
    </div>
    <p class="serif text-[14.5px] italic leading-[1.65] text-teal-100/85">${esc(p.say)}</p>
  </article>`).join('');

/* -------------------------------------------------------------------- Q&A */
const cats = [...new Set(QA.map(q => q.cat))];
let activeCat = 'All';
let practice = false;

$('#cats').innerHTML = ['All', ...cats].map(c => `
  <button data-cat="${esc(c)}" class="chip catchip px-3 py-1.5 rounded-lg text-[12.5px] border">${esc(c)}</button>`).join('');

function paintCats() {
  $$('.catchip').forEach(b => {
    const on = b.dataset.cat === activeCat;
    b.className = 'chip catchip px-3 py-1.5 rounded-lg text-[12.5px] border ' +
      (on ? 'bg-teal-300 text-[#062b28] border-teal-300 font-semibold'
          : 'border-[#242a34] text-[#98a2b0] hover:border-teal-300/40 hover:text-teal-200');
  });
}

function qid(q) { return q.cat + '|' + q.q; }

function renderQA() {
  const list = QA.filter(q => activeCat === 'All' || q.cat === activeCat);
  $('#qaList').innerHTML = list.map(q => {
    const id = qid(q), done = state.done.includes(id);
    const body = q.ref === 'intro'
      ? `<p class="text-[14px] leading-[1.75] text-[#b6bfca]">${esc(q.a[0])}</p>
         <a href="#intro" class="btn inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg border border-teal-300/30 text-teal-200 text-[12.5px] hover:bg-teal-300/10">
           <span class="ms text-[16px]">north_east</span> Go to the script</a>`
      : q.a.map(p => `<p class="text-[14px] leading-[1.75] ${/^"/.test(p) ? 'serif italic text-teal-100/85 text-[15px]' : 'text-[#9fa9b6]'} mb-3 last:mb-0">${esc(p)}</p>`).join('');
    return `
    <article class="acc rounded-2xl border border-[#1b1f27] bg-[#0b0d11]" data-id="${esc(id)}">
      <div class="flex items-start gap-3 p-4 md:p-5">
        <button class="tick btn shrink-0 grid place-items-center w-6 h-6 rounded-md border mt-0.5 ${done ? 'bg-teal-300 border-teal-300 text-[#062b28]' : 'border-[#2c343f] text-transparent hover:border-teal-300/50'}"
                title="Mark as rehearsed" aria-label="Mark as rehearsed">
          <span class="ms text-[15px]">check</span>
        </button>
        <button class="head flex-1 text-left flex items-start gap-3">
          <span class="flex-1">
            <span class="block text-[14.5px] md:text-[15.5px] font-medium leading-snug ${done ? 'text-[#7c8794]' : 'text-[#dfe5ec]'}">${esc(q.q)}</span>
            <span class="mt-1.5 inline-flex items-center gap-1.5">
              <span class="text-[10.5px] tracking-[.1em] uppercase text-[#5f6875]">${esc(q.cat)}</span>
              ${q.gap ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-300/10 text-amber-300/90 border border-amber-300/20">hard</span>' : ''}
            </span>
          </span>
          <span class="ms chev text-[20px] text-[#5f6875] mt-0.5">expand_more</span>
        </button>
      </div>
      <div class="acc-body"><div class="acc-inner"><div class="px-4 md:px-5 pb-5 pl-[52px] md:pl-[56px]">${body}</div></div></div>
    </article>`;
  }).join('');

  $$('#qaList .acc').forEach(card => {
    card.querySelector('.head').addEventListener('click', () => {
      const opening = !card.classList.contains('open');
      card.classList.toggle('open', opening);
      if (!opening) card.classList.remove('revealed');   // re-blur next time it opens
      applyPractice();
    });

    // in practice mode the blurred body itself is the reveal button
    card.querySelector('.acc-inner').addEventListener('click', () => {
      if (!card.classList.contains('blurred')) return;
      card.classList.add('revealed');
      applyPractice();
    });

    card.querySelector('.tick').addEventListener('click', e => {
      e.stopPropagation();
      const id = card.dataset.id;
      const i = state.done.indexOf(id);
      if (i < 0) { state.done.push(id); toast('Marked as rehearsed'); } else { state.done.splice(i, 1); }
      save(); paintTick(card); paintProgress();
    });
  });
  applyPractice();
}

/* repaint one tick in place — a full re-render would slam the card shut */
function paintTick(card) {
  const done = state.done.includes(card.dataset.id);
  card.querySelector('.tick').className =
    'tick btn shrink-0 grid place-items-center w-6 h-6 rounded-md border mt-0.5 ' +
    (done ? 'bg-teal-300 border-teal-300 text-[#062b28]'
          : 'border-[#2c343f] text-transparent hover:border-teal-300/50');
  card.querySelector('.head span span').className =
    'block text-[14.5px] md:text-[15.5px] font-medium leading-snug ' +
    (done ? 'text-[#7c8794]' : 'text-[#dfe5ec]');
}

function applyPractice() {
  $$('#qaList .acc').forEach(c => c.classList.toggle(
    'blurred',
    practice && c.classList.contains('open') && !c.classList.contains('revealed')
  ));
}

function paintProgress() {
  const total = QA.length, n = state.done.filter(d => QA.some(q => qid(q) === d)).length;
  $('#bar').style.width = (total ? (n / total) * 100 : 0) + '%';
  $('#barTxt').textContent = `${n} of ${total} rehearsed`;
}

$('#cats').addEventListener('click', e => {
  const b = e.target.closest('.catchip'); if (!b) return;
  activeCat = b.dataset.cat; paintCats(); renderQA();
});

$('#practice').addEventListener('click', e => {
  practice = !practice;
  const b = e.currentTarget;
  b.className = 'btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12.5px] ' +
    (practice ? 'bg-amber-300/15 border-amber-300/40 text-amber-200'
              : 'border-[#242a34] text-[#c3ccd8] hover:border-teal-300/40');
  b.querySelector('.ms').textContent = practice ? 'visibility' : 'visibility_off';
  if (!practice) $$('#qaList .acc').forEach(c => c.classList.remove('revealed'));
  applyPractice();
  toast(practice ? 'Practice mode on — answer first, then reveal' : 'Practice mode off');
});

$('#expandAll').addEventListener('click', e => {
  const cards = $$('#qaList .acc');
  const anyClosed = cards.some(c => !c.classList.contains('open'));
  cards.forEach(c => { c.classList.toggle('open', anyClosed); if (!anyClosed) c.classList.remove('revealed'); });
  e.currentTarget.querySelector('.ms').textContent = anyClosed ? 'unfold_less' : 'unfold_more';
  applyPractice();
});

paintCats(); renderQA(); paintProgress();

/* -------------------------------------------------------------- checklist */
function renderChecks() {
  $('#checkGrid').innerHTML = CHECKLIST.map((c, i) => {
    const on = state.checks.includes(i);
    return `
    <button data-i="${i}" class="chk btn text-left rounded-2xl border p-5 flex items-start gap-3.5 ${on ? 'border-teal-300/35 bg-teal-300/[.05]' : 'border-[#1b1f27] bg-[#0d0f14] hover:border-[#28313d]'}">
      <span class="shrink-0 grid place-items-center w-8 h-8 rounded-lg ${on ? 'bg-teal-300 text-[#062b28]' : 'bg-[#141922] text-[#7e8896]'}">
        <span class="ms text-[18px]">${on ? 'check' : c.icon}</span>
      </span>
      <span>
        <span class="block text-[14px] font-medium mb-1 ${on ? 'text-teal-100' : 'text-[#dfe5ec]'}">${esc(c.t)}</span>
        <span class="block text-[12.5px] leading-relaxed text-[#828c9a]">${esc(c.d)}</span>
      </span>
    </button>`;
  }).join('');
  $$('.chk').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i, k = state.checks.indexOf(i);
    if (k < 0) state.checks.push(i); else state.checks.splice(k, 1);
    save(); renderChecks();
  }));
}
renderChecks();

/* ------------------------------------------------------------- CV full-screen */
$('#fsBtn').addEventListener('click', () => {
  const el = $('#cvWrap');
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())
    ?.catch(() => window.open(PROFILE.cv, '_blank'));
});
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  $('#cvFrame').style.height = on ? '100vh' : 'min(150vh,1180px)';
  $('#fsBtn').querySelector('.ms').textContent = on ? 'fullscreen_exit' : 'fullscreen';
});

/* --------------------------------------------------------------- mobile nav */
$('#navMenu').addEventListener('click', () => {
  const m = $('#mobileNav');
  m.classList.toggle('hidden'); m.classList.toggle('flex');
});
$$('#mobileNav a').forEach(a => a.addEventListener('click', () => {
  $('#mobileNav').classList.add('hidden'); $('#mobileNav').classList.remove('flex');
}));

/* ------------------------------------------------------------------ reveal */
const io = new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
const observeAll = () => $$('.rv:not(.in)').forEach(el => io.observe(el));
observeAll();
new MutationObserver(observeAll).observe(document.body, { childList: true, subtree: true });

/* --------------------------------------------------------------- scroll-spy */
const secs = ['intro', 'positioning', 'qa', 'cv', 'checklist'].map(id => document.getElementById(id));
const spy = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    $$('.navlink').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
secs.forEach(s => s && spy.observe(s));
