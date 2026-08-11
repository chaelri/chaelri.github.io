// Runs inside the kwik.cx /e/ player iframe embedded by our AnimePahe UI.
//
// Goal: start playback the moment the page is in view, without the user having
// to click the big Plyr play button first.
//
// The parent page can't do this itself — kwik.cx is cross-origin, so
// iframe.contentWindow.document is off limits. The autoplay has to be kicked
// from inside the frame, which is what this script is for.
//
// Chrome's autoplay policy is the complication: a fresh document has no user
// activation, so play() with sound is rejected. So we escalate:
//   1. try play() with sound  — works when Chrome's Media Engagement Index for
//      kwik.cx is high enough (it climbs as you watch more episodes)
//   2. mute + play()          — always permitted, never blocked
//   3. click Plyr's play button — for the case where the <video> element isn't
//      the thing gating playback
//
// If we land on (2) we arm a one-shot unmute: the first click/keypress ANYWHERE
// in the frame turns the sound on. That click has to happen inside the iframe —
// user activation does not cross an origin boundary, and unmuting without it
// makes Chrome pause the video right back.
(function () {
  "use strict";
  if (window.__adxKwikAutoplay) return;
  window.__adxKwikAutoplay = true;

  const POLL_MS = 400;
  const DEADLINE_MS = 30000; // give up arming after this; the page still works
  const startedAt = Date.now();

  let video = null;
  let stage = 0; // 0 = try with sound, 1 = try muted, 2 = poke Plyr's button
  let busy = false;
  let armed = false;
  let pill = null;

  const play = (v) =>
    Promise.resolve(v.play()).then(
      () => true,
      () => false
    );

  // A <video> with no source yet will reject play() for reasons that have
  // nothing to do with the autoplay policy, which would burn our escalation
  // stages. Wait until hls.js (or a plain src) has actually attached.
  const hasSource = (v) =>
    !!(v.currentSrc || v.src || v.querySelector("source") || v.readyState > 0);

  async function attempt(v) {
    if (busy) return;
    busy = true;
    try {
      if (stage === 0) {
        if (await play(v)) return done(v);
        stage = 1;
      }
      if (stage === 1) {
        v.muted = true;
        if (await play(v)) return done(v);
        stage = 2;
      }
      if (stage === 2) {
        document
          .querySelector('.plyr__control--overlaid, button[data-plyr="play"]')
          ?.click();
        await play(v);
        if (!v.paused) return done(v);
      }
    } finally {
      busy = false;
    }
  }

  function done(v) {
    stopPolling();
    if (v.muted) armUnmute(v);
  }

  // ── one-shot unmute ──────────────────────────────────────────────────────
  function armUnmute(v) {
    if (armed) return;
    armed = true;
    showPill();

    // Plyr toggles pause when you click the video surface, so swallow that
    // first click — unless it landed on a real control, which should still work.
    const onFirstGesture = (e) => {
      const onControl =
        e.target &&
        typeof e.target.closest === "function" &&
        e.target.closest(".plyr__controls, .plyr__control");
      if (!onControl && e.type !== "keydown") {
        e.stopPropagation();
        e.preventDefault();
      }
      unmute(v);
    };
    const events = ["pointerdown", "touchstart", "keydown"];
    const detach = () =>
      events.forEach((t) =>
        window.removeEventListener(t, handler, { capture: true })
      );
    const handler = (e) => {
      detach();
      onFirstGesture(e);
    };
    events.forEach((t) =>
      window.addEventListener(t, handler, { capture: true })
    );

    // User hit Plyr's own volume/mute control instead — nothing left to do.
    v.addEventListener("volumechange", function onVol() {
      if (v.muted) return;
      v.removeEventListener("volumechange", onVol);
      detach();
      hidePill();
    });
  }

  function unmute(v) {
    v.muted = false;
    if (v.volume === 0) v.volume = 1;
    if (v.paused) play(v);
    hidePill();
  }

  // ── "click for sound" hint ───────────────────────────────────────────────
  function showPill() {
    if (pill || !document.body) return;
    pill = document.createElement("div");
    pill.textContent = "🔇 Click anywhere for sound";
    pill.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:12px",
      "z-index:2147483647",
      "padding:7px 13px",
      "border-radius:999px",
      "background:rgba(15,15,18,.82)",
      "color:#fff",
      "font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif",
      "letter-spacing:.2px",
      "backdrop-filter:blur(6px)",
      "box-shadow:0 2px 12px rgba(0,0,0,.45)",
      "pointer-events:none", // clicks must reach our window-level handler
      "opacity:0",
      "transition:opacity .25s ease",
    ].join(";");
    document.body.appendChild(pill);
    requestAnimationFrame(() => pill && (pill.style.opacity = "1"));
  }

  function hidePill() {
    if (!pill) return;
    const el = pill;
    pill = null;
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }

  // ── polling loop ─────────────────────────────────────────────────────────
  let timer = setInterval(tick, POLL_MS);
  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function tick() {
    if (Date.now() - startedAt > DEADLINE_MS) return stopPolling();
    const v = document.querySelector("video");
    if (!v) return;
    video = v;
    if (!v.paused && !v.ended) return done(v);
    if (!hasSource(v)) return;
    attempt(v);
  }

  tick();

  // hls.js can attach after our first few ticks; a canplay is the cleanest
  // signal that a retry is worth it.
  document.addEventListener(
    "canplay",
    (e) => {
      if (e.target && e.target.tagName === "VIDEO" && e.target.paused) {
        attempt(e.target);
      }
    },
    true
  );

  // The frame may render while the tab is in the background, where Chrome
  // refuses to start playback at all. Retry when it actually becomes visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const v = video || document.querySelector("video");
    if (v && v.paused && hasSource(v)) attempt(v);
  });
})();
