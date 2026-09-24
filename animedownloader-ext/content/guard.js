// Runs at document_start in MAIN world.
//
// All detection is BEHAVIOR-based, not domain/name-based, because ad networks
// rotate domains, hashes, and placement keys on every page load.
//
// Defense layers:
//  (1) neuter any third-party <script> before it executes
//       (legit animepahe scripts are all same-origin under /app/js/)
//  (2) remove any element injected as direct child of <html> that isn't
//       <head> or <body> — this is the primary evasion: ads live as
//       siblings of <body>, outside where ad-blockers scan
//  (3) block cross-host navigation (location.href/assign/replace)
//  (4) kill window.open, document.write, document.writeln
//  (5) capture-phase click blocker so the interstitial trigger never fires
//  (6) purge placement queue globals ($insert*$, *-placement-queue*)
(function () {
  "use strict";
  if (window.__nukeGuardInstalled) return;
  window.__nukeGuardInstalled = true;

  const PAGE_HOST = location.host;

  // Only the animepahe /play/ page has the click-triggered interstitial.
  // On pahe.win and kwik.cx our content scripts need to .click() buttons to
  // advance the download flow, so we keep window.open + location + DOM-sweep
  // defenses there but disable the click blocker.
  const CLICK_BLOCK_ENABLED = /(^|\.)animepahe\.pw$/i.test(PAGE_HOST);

  // Third-party script blocking only on animepahe.pw. On kwik.cx the embedded
  // player needs jQuery, hls.js, and other library CDNs; blocking them breaks
  // playback. On animepahe.pw, all legit scripts are same-origin under /app/js/
  // so anything third-party is an ad by construction.
  //
  // gogoanimes.dk is a WordPress site: its own code is same-origin, plus a
  // few library CDNs (Swiper from cdnjs). The ad tag (llvpn.com → vr-gc.com
  // vignette) and everything it chains to rotate through throwaway domains, so
  // it is an allowlist there too, just a wider one. Its player is a vidmoly
  // iframe carrying a second, heavier ad stack; vidmoly needs jwplayer, its own
  // jQuery CDN and the Chromecast SDK, nothing else.
  const TRUSTED_BY_SITE = [
    [/(^|\.)animepahe\.pw$/i, []],
    [/(^|\.)gogoanimes\.dk$/i, ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "ajax.googleapis.com", "code.jquery.com"]],
    [/(^|\.)vidmoly\.[a-z]+$/i, ["jwpcdn.com", "jwplayer.com", "staticmoly.me", "cdnjs.cloudflare.com", "gstatic.com"]],
    // animeheaven.me serves everything itself; its pop-under loader is the
    // only thing that reaches off-site.
    [/(^|\.)animeheaven\.me$/i, []],
  ];
  const siteRule = TRUSTED_BY_SITE.find(([re]) => re.test(PAGE_HOST));
  const SCRIPT_BLOCK_ENABLED = !!siteRule;
  const TRUSTED_SCRIPT_HOSTS = siteRule ? siteRule[1] : [];

  // Dynamic: matches any placement-queue global regardless of hash
  const AD_GLOBAL_RE = /^\$insert.+\$$|placement-queue[a-f0-9]+/i;

  // Cloudflare assets are ALWAYS trusted — challenge pages need Turnstile,
  // /cdn-cgi/ challenge platform scripts, and same-origin /cdn-cgi/l/ navigations
  // to complete verification. Without this whitelist, the guard breaks CF's
  // verify loop and the page bounces forever.
  const isCloudflareUrl = (url) => {
    try {
      const u = new URL(url, location.href);
      return (
        u.host === "challenges.cloudflare.com" ||
        u.host.endsWith(".cloudflare.com") ||
        u.pathname.startsWith("/cdn-cgi/")
      );
    } catch (e) {
      return false;
    }
  };

  // Detect a live Cloudflare interstitial. Title is the most reliable signal;
  // DOM markers cover edge cases where the title hasn't been parsed yet.
  let _cfActive = false;
  const detectCloudflareChallenge = () => {
    try {
      const t = document.title || "";
      if (/^Just a moment/i.test(t)) return true;
      if (document.querySelector(
        "#challenge-running, #challenge-form, #challenge-stage, #cf-please-wait, " +
        ".cf-browser-verification, .cf-challenge-running, .cf-im-under-attack"
      )) return true;
      if (document.querySelector(
        'script[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/"]'
      )) return true;
    } catch (e) {}
    return false;
  };

  const sameSite = (url) => {
    try {
      let u = new URL(url, location.href);
      // blob:https://host/<uuid> has an empty .host; judge it by its origin.
      // LiteSpeed (gogoanimes) runs every inline script as a blob: URL.
      if (u.protocol === "blob:") u = new URL(u.origin);
      return (
        u.host === PAGE_HOST ||
        u.host.endsWith("." + PAGE_HOST) ||
        PAGE_HOST.endsWith("." + u.host)
      );
    } catch (e) {
      return false;
    }
  };

  const safeRemove = (n) => { try { n.remove(); } catch (e) {} };

  // ── (4) Kill window.open ──
  try {
    Object.defineProperty(window, "open", {
      value: function () { return null; },
      writable: false,
      configurable: false,
    });
  } catch (e) {}

  // ── (3) Block cross-host location changes ──
  try {
    const LocProto = Location.prototype;
    const hrefDesc = Object.getOwnPropertyDescriptor(LocProto, "href");
    if (hrefDesc && hrefDesc.set) {
      Object.defineProperty(LocProto, "href", {
        configurable: false,
        get() { return hrefDesc.get.call(this); },
        set(val) { if (sameSite(val) || isCloudflareUrl(val) || _cfActive) hrefDesc.set.call(this, val); },
      });
    }
    const origAssign = LocProto.assign;
    const origReplace = LocProto.replace;
    Object.defineProperty(LocProto, "assign", {
      configurable: false,
      value: function (val) { if (sameSite(val) || isCloudflareUrl(val) || _cfActive) return origAssign.call(this, val); },
    });
    Object.defineProperty(LocProto, "replace", {
      configurable: false,
      value: function (val) { if (sameSite(val) || isCloudflareUrl(val) || _cfActive) return origReplace.call(this, val); },
    });
  } catch (e) {}

  // ── (4) Kill document.write ──
  try { document.write = function () {}; } catch (e) {}
  try { document.writeln = function () {}; } catch (e) {}

  // ── (1) Neuter any third-party <script> before execution ──
  const isTrustedScriptSrc = (src) => {
    if (sameSite(src)) return true;
    if (isCloudflareUrl(src)) return true; // never block CF challenge assets
    try {
      const h = new URL(src, location.href).host;
      return TRUSTED_SCRIPT_HOSTS.some((t) => h === t || h.endsWith("." + t));
    } catch (e) {
      return false;
    }
  };
  const neuterThirdPartyScript = (s) => {
    if (!SCRIPT_BLOCK_ENABLED) return false;
    if (_cfActive) return false;
    const src = s.src || s.getAttribute("src") || "";
    if (!src) return false; // inline scripts are whitelisted implicitly
    if (isTrustedScriptSrc(src)) return false;
    try { s.type = "blocked/javascript"; } catch (e) {}
    try { s.removeAttribute("src"); } catch (e) {}
    safeRemove(s);
    return true;
  };

  // ── (1b) Refuse third-party script URLs at assignment time ──
  // The gogoanimes ad loader appends an empty <script> and only THEN sets
  // .src, so the MutationObserver sees a src-less (inline) script and lets it
  // through. Catching the setter means the URL is never assigned and nothing
  // is ever fetched.
  if (SCRIPT_BLOCK_ENABLED) {
    try {
      const srcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
      Object.defineProperty(HTMLScriptElement.prototype, "src", {
        configurable: false,
        get() { return srcDesc.get.call(this); },
        set(val) {
          if (!_cfActive && !isTrustedScriptSrc(String(val))) return;
          srcDesc.set.call(this, val);
        },
      });
      const origSetAttr = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, val) {
        if (
          this instanceof HTMLScriptElement &&
          String(name).toLowerCase() === "src" &&
          !_cfActive &&
          !isTrustedScriptSrc(String(val))
        ) return;
        return origSetAttr.call(this, name, val);
      };
    } catch (e) {}
  }

  // ── (2) Rogue <html> direct-child detection ──
  const isRogueHtmlChild = (n) => {
    if (!n || n.nodeType !== 1) return false;
    if (n.parentNode !== document.documentElement) return false;
    if (n === document.head || n === document.body) return false;
    if (_cfActive) return false;
    return true;
  };

  // ── (6) Purge placement queue globals matching dynamic pattern ──
  const purgeGlobals = () => {
    let keys;
    try { keys = Object.keys(window); } catch (e) { return; }
    for (const k of keys) {
      if (!AD_GLOBAL_RE.test(k)) continue;
      try {
        const v = window[k];
        if (v && typeof v === "object") {
          if ("state" in v) v.state = false;
          if (v.subscribers) v.subscribers = {};
        }
      } catch (e) {}
      try { window[k] = undefined; } catch (e) {}
      try { delete window[k]; } catch (e) {}
    }
  };

  // ── (7) Hold animepahe's own player until our UI takes over ──
  // animepahe.js replaces the /play/ page with its own UI and its own kwik
  // iframe. Left alone, the site's player starts loading the same stream
  // first, so every episode hit kwik twice (and bulk-download tabs streamed
  // video nobody watches). Frames outside #nuke-body are parked on
  // about:blank; if our UI never mounts they are put back so the page still
  // plays.
  const HOLD_PLAYER =
    window.top === window &&
    /(^|\.)animepahe\.pw$/i.test(PAGE_HOST) &&
    location.pathname.startsWith("/play/");
  let holding = HOLD_PLAYER;
  const heldFrames = new Set();
  const holdFrame = (f) => {
    if (!holding || _cfActive) return;
    if (document.getElementById("nuke-body")?.contains(f)) return;
    const src = f.getAttribute("src");
    if (!src || src === "about:blank" || isCloudflareUrl(src)) return;
    f.dataset.adxHeldSrc = src;
    f.setAttribute("src", "about:blank");
    heldFrames.add(f);
  };
  if (HOLD_PLAYER) {
    setTimeout(() => {
      if (document.getElementById("nuke-body")) return;
      holding = false;
      heldFrames.forEach((f) => {
        if (f.isConnected && f.dataset.adxHeldSrc) f.setAttribute("src", f.dataset.adxHeldSrc);
      });
      heldFrames.clear();
    }, 10000);
  }

  // ── MutationObserver: real-time ad-node removal as they get injected ──
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") {
        if (m.target.tagName === "IFRAME") holdFrame(m.target);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.tagName === "IFRAME") holdFrame(node);
        else if (HOLD_PLAYER && node.querySelectorAll) node.querySelectorAll("iframe").forEach(holdFrame);
        if (node.nodeType !== 1) continue;
        if (node.tagName === "SCRIPT") {
          if (neuterThirdPartyScript(node)) continue;
        }
        if (isRogueHtmlChild(node)) safeRemove(node);
      }
    }
  });

  const startObserver = () => {
    if (!document.documentElement) return setTimeout(startObserver, 0);
    mo.observe(document.documentElement, HOLD_PLAYER
      ? { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }
      : { childList: true, subtree: true });
    document.querySelectorAll("iframe").forEach(holdFrame);
    // Catch anything already parsed before observer attached
    document.querySelectorAll("script[src]").forEach((s) => neuterThirdPartyScript(s));
    Array.from(document.documentElement.children).forEach((c) => {
      if (isRogueHtmlChild(c)) safeRemove(c);
    });
  };
  startObserver();

  // ── (5) Capture-phase click blocker ──
  const BAD = [
    "mousedown", "mouseup", "click", "auxclick",
    "pointerdown", "pointerup", "touchstart", "touchend", "contextmenu",
  ];
  const block = (e) => {
    if (_cfActive) return; // CF verify button / Turnstile widget must receive clicks
    const host = document.getElementById("nuke-body");
    if (host && host.contains(e.target)) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
  };
  const attachBlockers = () => {
    if (!CLICK_BLOCK_ENABLED) return;
    BAD.forEach((evt) => {
      window.addEventListener(evt, block, { capture: true });
      document.addEventListener(evt, block, { capture: true });
    });
  };
  attachBlockers();

  // ── Watchdog every 300ms — idempotent re-arm + sweep ──
  setInterval(() => {
    // Re-check CF challenge state every tick. Title/DOM markers are reliable
    // by the first tick (300ms after document_start).
    _cfActive = detectCloudflareChallenge();
    if (_cfActive) return; // stand down entirely while CF verifies

    attachBlockers();
    try { window.open = function () { return null; }; } catch (e) {}
    ["onclick", "onmousedown", "onmouseup", "onauxclick", "onpointerdown"].forEach((p) => {
      try { document.body && (document.body[p] = null); } catch (e) {}
      try { document.documentElement[p] = null; } catch (e) {}
    });

    // Sweep <html> direct children (ads inject here, not body)
    const root = document.documentElement;
    if (root) {
      Array.from(root.children).forEach((c) => {
        if (isRogueHtmlChild(c)) safeRemove(c);
      });
    }

    // Sweep third-party scripts that slipped through
    document.querySelectorAll("script[src]").forEach((s) => neuterThirdPartyScript(s));

    // Strip body siblings — only AFTER our UI is mounted
    const host = document.getElementById("nuke-body");
    const body = document.body;
    if (host && body) {
      Array.from(body.children).forEach((el) => {
        if (el === host) return;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
        safeRemove(el);
      });
    }

    // Strip meta refresh
    document.querySelectorAll('meta[http-equiv="refresh" i]').forEach(safeRemove);

    // Purge dynamic placement globals
    purgeGlobals();
  }, 300);
})();
