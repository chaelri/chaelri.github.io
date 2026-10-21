// ==UserScript==
// @name         TETR.IO Clean — No Ads, BGM Volume, Performance
// @namespace    charlie.tetrio.clean
// @version      1.0.0
// @description  Blocks ads/trackers + adblock-recovery popups, auto-removes injected ad DOM, smooth BGM volume panel, and a lean performance preset.
// @match        https://tetr.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Settings (persisted in localStorage under tclean:*)
   * ------------------------------------------------------------------ */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tclean:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tclean:' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const S = {
    bgm: store.get('bgm', 1),          // 0..2 multiplier on top of TETR.IO's own music volume
    muted: store.get('muted', false),
    perf: store.get('perf', true),     // lean graphics preset
  };
  let blockedCount = 0;

  /* ------------------------------------------------------------------ *
   * 1. Ad / tracker host blocklist (what TETR.IO actually loads)
   *    Freestar (pub.network) -> Prebid, GPT, Amazon APS, ID5, IntentIQ,
   *    Primis video, Google Funding Choices (adblock-recovery "sniffer").
   * ------------------------------------------------------------------ */
  const AD_HOSTS = /(^|\.)(pub\.network|freestar\.(com|io)|doubleclick\.net|googlesyndication\.com|googletagservices\.com|googleadservices\.com|adservice\.google\.[a-z.]+|fundingchoicesmessages\.google\.com|amazon-adsystem\.com|intentiq\.com|durationmedia\.net|fastclick\.net|crwdcntrl\.net|id5-sync\.com|rapidedge\.io|primis\.tech|sekindo\.com|hadronid\.net|criteo\.(com|net)|adnxs\.com|rubiconproject\.com|pubmatic\.com|openx\.net|casalemedia\.com|indexww\.com|33across\.com|sharethrough\.com|lijit\.com|sonobi\.com|yieldmo\.com|adsrvr\.org|teads\.tv|taboola\.com|outbrain\.com|audigent\.com|pubcid\.org|amxrtb\.com|smartadserver\.com|3lift\.com|triplelift\.com|gumgum\.com|connatix\.com|kargo\.com|seedtag\.com|ogury\.io|wurfl\.io|scorecardresearch\.com|quantserve\.com|moatads\.com|adsafeprotected\.com|doubleverify\.com|confiant-integrations\.net|liadm\.com|rlcdn\.com|bidswitch\.net|onetag-sys\.com|media\.net)$/i;

  function isAdUrl(u) {
    if (!u) return false;
    try { return AD_HOSTS.test(new URL(String(u), location.href).hostname); } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ *
   * 2. Kill the ad provider at the source.
   *    TETR.IO's own loader ("Ceriad") checks `window.freestar`; if it is
   *    missing it adds body.ceriad_unavailable + ceriad_disabled and
   *    unmounts every ad slot by itself — no nag, no broken UI.
   * ------------------------------------------------------------------ */
  try {
    Object.defineProperty(window, 'freestar', { configurable: false, get() { return undefined; }, set() {} });
  } catch (e) {}
  // Google Funding Choices (adblock detector / "please disable your adblocker" popup)
  try {
    Object.defineProperty(window, 'googlefc', { configurable: false, get() { return { callbackQueue: { push() {} }, controlledMessagingFunction() {} }; }, set() {} });
  } catch (e) {}

  /* ------------------------------------------------------------------ *
   * 3. Network-level blocking: <script>/<iframe>/<img> src, fetch, XHR,
   *    sendBeacon. Blocked scripts fire `error` so loaders fail fast.
   * ------------------------------------------------------------------ */
  function fakeError(el) {
    blockedCount++;
    setTimeout(() => { try { el.dispatchEvent(new Event('error')); } catch (e) {} }, 0);
  }
  for (const Ctor of [HTMLScriptElement, HTMLIFrameElement, HTMLImageElement]) {
    const d = Object.getOwnPropertyDescriptor(Ctor.prototype, 'src');
    if (!d || !d.set) continue;
    Object.defineProperty(Ctor.prototype, 'src', {
      configurable: true, enumerable: d.enumerable,
      get() { return d.get.call(this); },
      set(v) { if (isAdUrl(v)) { fakeError(this); return; } d.set.call(this, v); },
    });
  }
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) {
    if (typeof n === 'string' && n.toLowerCase() === 'src' && /^(SCRIPT|IFRAME|IMG)$/.test(this.tagName) && isAdUrl(v)) { fakeError(this); return; }
    return origSetAttr.call(this, n, v);
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const u = input && typeof input === 'object' && 'url' in input ? input.url : input;
    if (isAdUrl(u)) { blockedCount++; return Promise.reject(new TypeError('Failed to fetch')); }
    return origFetch.apply(this, arguments);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    if (isAdUrl(u)) { blockedCount++; this.__tcBlocked = true; }
    return origOpen.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__tcBlocked) { setTimeout(() => this.dispatchEvent(new Event('error')), 0); return; }
    return origSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { if (isAdUrl(u)) { blockedCount++; return true; } return origBeacon(u, d); };
  }
  const origWOpen = window.open;
  window.open = function (u) { if (isAdUrl(u)) { blockedCount++; return null; } return origWOpen.apply(this, arguments); };

  /* ------------------------------------------------------------------ *
   * 4. CSS: ads are never painted (applied before first render).
   *    Selectors are specific so TETR.IO's own UI is untouched.
   * ------------------------------------------------------------------ */
  const AD_SELECTORS = [
    '[id^="ceriad-"]', '.ceriad', '#fs-sticky-footer', '.fs-sticky-footer',
    '[id^="_fs-"]', '.__fs-ancillary', '.__fs-branding', '.fs-branding-spacer',
    '[id^="google_ads_iframe"]', '[id^="primis"]', '[id*="primisPlayer"]', '[id^="Player-Div-Sekindo"]',
    'iframe[name="googlefcPresent"]', '.fc-ab-root', '.fc-dialog-container', '.fc-dialog-overlay', '.fc-consent-root',
    'iframe[src*="doubleclick.net"]', 'iframe[src*="pub.network"]', 'iframe[src*="amazon-adsystem"]', 'iframe[src*="primis.tech"]',
  ];
  const css = `
${AD_SELECTORS.join(',\n')} { display:none !important; visibility:hidden !important; width:0 !important; height:0 !important; pointer-events:none !important; }
`;
  function injectStyle(text, id) {
    const s = document.createElement('style');
    s.id = id; s.textContent = text;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }
  injectStyle(css, 'tclean-adhide');

  /* ------------------------------------------------------------------ *
   * 5. DOM sniffer: anything ad-like that gets injected is removed in the
   *    same microtask (before paint), and parser-inserted ad scripts are
   *    neutralised before they execute.
   * ------------------------------------------------------------------ */
  const AD_MATCH = AD_SELECTORS.join(',');
  const KEEP_SLOT = /^ceriad-/; // game-owned containers: hide + empty, don't delete (game keeps refs)
  function scrub(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SCRIPT' && node.src && isAdUrl(node.src)) {
      node.type = 'javascript/blocked'; node.remove(); blockedCount++; return;
    }
    if ((node.tagName === 'IFRAME' || node.tagName === 'IMG') && node.src && isAdUrl(node.src)) { node.remove(); blockedCount++; return; }
    let targets = [];
    if (node.matches && node.matches(AD_MATCH)) targets.push(node);
    if (node.querySelectorAll) targets = targets.concat([...node.querySelectorAll(AD_MATCH)]);
    for (const t of targets) {
      if (!t.isConnected) continue;
      if (KEEP_SLOT.test(t.id) || t.classList.contains('ceriad')) { t.replaceChildren(); }
      else { t.remove(); blockedCount++; }
    }
  }
  function fixBodyClasses() {
    const b = document.body; if (!b) return;
    if (!b.classList.contains('ceriad_disabled')) b.classList.add('ceriad_disabled');
    if (!b.classList.contains('ceriad_unavailable')) b.classList.add('ceriad_unavailable');
    if (b.classList.contains('mpmpu-mounted')) b.classList.remove('mpmpu-mounted');
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') { if (m.target === document.body) fixBodyClasses(); continue; }
      for (const n of m.addedNodes) scrub(n);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  /* Purge tracker IDs left in localStorage by the ad stack (less junk, less work). */
  try {
    Object.keys(localStorage).forEach((k) => {
      if (/^(id5id|criteo|cto_|_iiq|aps:|apstag|pbjs-|_GESPSK|amxId|_pubcid|panoramaId|_cc_id|wurflrtd|fs\.itf)/.test(k)) localStorage.removeItem(k);
    });
  } catch (e) {}

  /* ------------------------------------------------------------------ *
   * 6. BGM volume hook.
   *    TETR.IO's audio engine creates ONE AudioContext; the very first
   *    GainNode it makes (before any sound buffer) is the BGM bus. We slot
   *    our own gain between that bus and the speakers, so this slider only
   *    affects music — SFX are untouched.
   * ------------------------------------------------------------------ */
  const BAC = window.BaseAudioContext || window.AudioContext;
  const userGains = new WeakMap();
  const ctxState = new WeakMap();
  const liveGains = new Set();
  function targetGain() { return S.muted ? 0 : S.bgm; }
  function getUserGain(ctx) {
    let g = userGains.get(ctx);
    if (!g) {
      g = origCreateGain.call(ctx);
      g.gain.value = targetGain();
      origConnect.call(g, ctx.destination);
      userGains.set(ctx, g); liveGains.add(g);
    }
    return g;
  }
  const origCreateGain = BAC.prototype.createGain;
  const origCreateSrc = BAC.prototype.createBufferSource;
  const origConnect = AudioNode.prototype.connect;
  BAC.prototype.createBufferSource = function () {
    const st = ctxState.get(this) || {}; st.hadSource = true; ctxState.set(this, st);
    return origCreateSrc.apply(this, arguments);
  };
  BAC.prototype.createGain = function () {
    const node = origCreateGain.apply(this, arguments);
    const st = ctxState.get(this) || {};
    if (!st.bgmFound && !st.hadSource) { st.bgmFound = true; node.__tcBgm = true; }
    ctxState.set(this, st);
    return node;
  };
  AudioNode.prototype.connect = function (dest) {
    if (this.__tcBgm && dest && dest === this.context.destination) {
      origConnect.call(this, getUserGain(this.context));
      return dest;
    }
    return origConnect.apply(this, arguments);
  };
  function applyVolume(smooth = true) {
    const v = targetGain();
    liveGains.forEach((g) => {
      const t = g.context.currentTime;
      g.gain.cancelScheduledValues(t);
      if (smooth) { g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(v, t, 0.12); }
      else g.gain.setValueAtTime(v, t);
    });
  }

  /* ------------------------------------------------------------------ *
   * 7. Performance preset — applied to TETR.IO's own config before the
   *    game reads it. Original values are backed up and restored when off.
   * ------------------------------------------------------------------ */
  const LEAN = {
    graphics: 'minimal', particles: 0, bloom: 0, chroma: 0, flashwave: 0,
    shakiness: 0, background: 0.3, emotes_anim: false, nosuperlobbyanim: true,
    nozenithanim: true, fire: false, powersave: false,
  };
  function applyPerf(on) {
    try {
      const raw = localStorage.getItem('userConfig'); if (!raw) return false;
      const cfg = JSON.parse(raw); cfg.video = cfg.video || {};
      if (on) {
        if (!store.get('perfBackup', null)) {
          const bak = {}; Object.keys(LEAN).forEach((k) => (bak[k] = cfg.video[k])); store.set('perfBackup', bak);
        }
        Object.assign(cfg.video, LEAN);
      } else {
        const bak = store.get('perfBackup', null);
        if (bak) { Object.keys(bak).forEach((k) => { if (bak[k] !== undefined) cfg.video[k] = bak[k]; }); store.set('perfBackup', null); }
      }
      localStorage.setItem('userConfig', JSON.stringify(cfg));
      return true;
    } catch (e) { return false; }
  }
  if (S.perf) applyPerf(true);

  /* ------------------------------------------------------------------ *
   * 8. Floating control panel (Alt+M toggles). Smooth animated slider.
   * ------------------------------------------------------------------ */
  const PANEL_CSS = `
#tclean-fab{position:fixed;left:14px;bottom:14px;z-index:2147483646;width:42px;height:42px;border-radius:50%;
  background:rgba(20,22,32,.82);border:1px solid rgba(255,255,255,.14);color:#fff;display:grid;place-items:center;cursor:pointer;
  backdrop-filter:blur(6px);box-shadow:0 6px 20px rgba(0,0,0,.35);transition:transform .25s cubic-bezier(.2,.9,.3,1.3),background .2s;font:600 18px system-ui}
#tclean-fab:hover{transform:scale(1.08);background:rgba(40,44,64,.92)}
#tclean-panel{position:fixed;left:14px;bottom:66px;z-index:2147483647;width:270px;padding:16px 16px 14px;border-radius:16px;
  background:rgba(18,20,30,.94);border:1px solid rgba(255,255,255,.12);color:#e9ecf5;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;
  box-shadow:0 18px 50px rgba(0,0,0,.5);backdrop-filter:blur(10px);
  opacity:0;transform:translateY(14px) scale(.96);transform-origin:bottom left;pointer-events:none;
  transition:opacity .28s ease,transform .32s cubic-bezier(.2,.9,.3,1.15)}
#tclean-panel.open{opacity:1;transform:none;pointer-events:auto}
#tclean-panel h3{margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3c0;display:flex;justify-content:space-between}
.tc-row{display:flex;align-items:center;gap:10px;margin:10px 0}
.tc-label{flex:1}
.tc-val{min-width:44px;text-align:right;font-variant-numeric:tabular-nums;color:#fff;font-weight:600}
.tc-slider{position:relative;height:28px;flex:1;cursor:pointer;touch-action:none}
.tc-track{position:absolute;left:0;right:0;top:12px;height:4px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden}
.tc-fill{position:absolute;left:0;top:0;bottom:0;width:50%;border-radius:4px;background:linear-gradient(90deg,#5b8cff,#b46bff)}
.tc-mark{position:absolute;top:8px;width:2px;height:12px;left:50%;background:rgba(255,255,255,.35);border-radius:1px}
.tc-thumb{position:absolute;top:5px;left:50%;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;
  box-shadow:0 2px 8px rgba(0,0,0,.4),0 0 0 0 rgba(140,120,255,.4);transition:box-shadow .2s,transform .15s}
.tc-slider:hover .tc-thumb,.tc-slider.drag .tc-thumb{box-shadow:0 2px 8px rgba(0,0,0,.4),0 0 0 7px rgba(140,120,255,.22);transform:scale(1.1)}
.tc-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:5px 9px;cursor:pointer;font:inherit;transition:background .2s}
.tc-btn:hover{background:rgba(255,255,255,.16)}
.tc-sw{width:38px;height:22px;border-radius:22px;background:rgba(255,255,255,.18);position:relative;cursor:pointer;transition:background .25s}
.tc-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .28s cubic-bezier(.2,.9,.3,1.3)}
.tc-sw.on{background:#6b7bff}.tc-sw.on::after{transform:translateX(16px)}
.tc-foot{margin-top:10px;font-size:11px;color:#8890aa;display:flex;justify-content:space-between}
.tc-note{font-size:11px;color:#8890aa;margin:-4px 0 6px}
`;
  function buildUI() {
    injectStyle(PANEL_CSS, 'tclean-ui');
    const fab = document.createElement('div');
    fab.id = 'tclean-fab'; fab.title = 'TETR.IO Clean (Alt+M)'; fab.textContent = '♪';
    const p = document.createElement('div');
    p.id = 'tclean-panel';
    p.innerHTML = `
      <h3><span>TETR.IO Clean</span><span style="color:#6b7bff">●</span></h3>
      <div class="tc-row"><span class="tc-label">BGM volume</span><span class="tc-val" id="tc-v">100%</span></div>
      <div class="tc-row">
        <button class="tc-btn" id="tc-mute">🔊</button>
        <div class="tc-slider" id="tc-s"><div class="tc-track"><div class="tc-fill" id="tc-f"></div></div><div class="tc-mark"></div><div class="tc-thumb" id="tc-t"></div></div>
      </div>
      <div class="tc-note">Middle mark = 100% (TETR.IO’s own level). Up to 200%.</div>
      <div class="tc-row"><span class="tc-label">Performance mode</span><div class="tc-sw" id="tc-perf"></div></div>
      <div class="tc-note" id="tc-perfnote">Minimal graphics, no particles/bloom/shake. Reload to apply.</div>
      <div class="tc-foot"><span>Blocked: <b id="tc-b">0</b></span><span>Alt+M</span></div>`;
    document.body.appendChild(fab); document.body.appendChild(p);

    const $ = (id) => p.querySelector('#' + id);
    const slider = $('tc-s'), fill = $('tc-f'), thumb = $('tc-t'), val = $('tc-v'), mute = $('tc-mute'), perf = $('tc-perf');
    const MAX = 2;
    let shown = S.bgm; // animated display value
    let raf = 0;
    function render() {
      const target = S.muted ? 0 : S.bgm;
      shown += (target - shown) * 0.22;           // smooth easing toward target
      if (Math.abs(target - shown) < 0.002) shown = target;
      const pct = (shown / MAX) * 100;
      fill.style.width = pct + '%'; thumb.style.left = pct + '%';
      val.textContent = Math.round(shown * 100) + '%';
      mute.textContent = S.muted || S.bgm === 0 ? '🔇' : S.bgm < 0.6 ? '🔉' : '🔊';
      raf = shown !== target ? requestAnimationFrame(render) : 0;
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(render); };
    function setFromX(x) {
      const r = slider.getBoundingClientRect();
      let v = Math.max(0, Math.min(1, (x - r.left) / r.width)) * MAX;
      if (Math.abs(v - 1) < 0.04) v = 1;          // snap to 100%
      S.bgm = Math.round(v * 100) / 100; S.muted = false;
      store.set('bgm', S.bgm); store.set('muted', false);
      applyVolume(true); kick();
    }
    slider.addEventListener('pointerdown', (e) => { slider.setPointerCapture(e.pointerId); slider.classList.add('drag'); setFromX(e.clientX); });
    slider.addEventListener('pointermove', (e) => { if (slider.classList.contains('drag')) setFromX(e.clientX); });
    slider.addEventListener('pointerup', () => slider.classList.remove('drag'));
    slider.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      S.bgm = Math.max(0, Math.min(MAX, Math.round((S.bgm + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
      store.set('bgm', S.bgm); applyVolume(true); kick();
    }, { passive: false });
    mute.addEventListener('click', () => { S.muted = !S.muted; store.set('muted', S.muted); applyVolume(true); kick(); });
    perf.classList.toggle('on', S.perf);
    perf.addEventListener('click', () => {
      S.perf = !S.perf; store.set('perf', S.perf); perf.classList.toggle('on', S.perf);
      applyPerf(S.perf);
      $('tc-perfnote').textContent = 'Saved — reload TETR.IO (F5) to apply.';
    });
    // keep keystrokes inside the panel from reaching the game
    p.addEventListener('keydown', (e) => e.stopPropagation());
    const toggle = () => { p.classList.toggle('open'); if (p.classList.contains('open')) { $('tc-b').textContent = blockedCount; kick(); } };
    fab.addEventListener('click', toggle);
    window.addEventListener('keydown', (e) => { if (e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); toggle(); } }, true);
    document.addEventListener('pointerdown', (e) => { if (p.classList.contains('open') && !p.contains(e.target) && e.target !== fab) p.classList.remove('open'); });
    setInterval(() => { if (p.classList.contains('open')) $('tc-b').textContent = blockedCount; }, 1000);
    shown = S.muted ? 0 : S.bgm; kick();
  }

  function onReady() {
    fixBodyClasses();
    scrub(document.body);
    buildUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else onReady();
})();