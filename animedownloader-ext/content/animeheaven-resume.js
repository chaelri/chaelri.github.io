// Runs on animeheaven.me/gate.php (isolated world, document_end).
//
// The episode sometimes just stops: the video host drops a range request and
// Chrome's <video> sits waiting forever, until a page refresh. This watches
// for a video that should be playing but whose time has not moved, and
// recovers in place without losing the spot:
//   1. after STALL_MS, nudge: seek to the same time (a fresh range request)
//   2. still stuck after another STALL_MS, reload the source at that time
// A reload is at most one per RELOAD_GAP_MS, so a host that is really down is
// not hammered; going back online retries at once.
(function () {
  "use strict";
  if (window.__adxHeavenResume) return;
  window.__adxHeavenResume = true;

  const vid = document.getElementById("vid");
  if (!vid) return;

  const STALL_MS = 5000;
  const RELOAD_GAP_MS = 8000;

  let lastT = -1;
  let stuckSince = 0;
  let nudged = false;
  let lastReload = 0;
  let wantPlay = false; // the user pressed play and has not paused since

  vid.addEventListener("play", () => { wantPlay = true; });
  vid.addEventListener("pause", () => {
    // a pause we did not cause while recovering is the user's
    if (!recovering) wantPlay = false;
  });
  vid.addEventListener("ended", () => { wantPlay = false; });

  let recovering = false;

  const reload = (t) => {
    const src = vid.currentSrc || vid.src;
    if (!src) return;
    lastReload = Date.now();
    recovering = true;
    console.info("[adx resume] reloading the source at", t.toFixed(1));
    vid.addEventListener("loadedmetadata", () => {
      vid.currentTime = t;
      vid.play().catch(() => {}).finally(() => { recovering = false; });
    }, { once: true });
    vid.src = src;
    vid.load();
  };

  const recover = (now) => {
    const t = vid.currentTime;
    if (!nudged) {
      nudged = true;
      console.info("[adx resume] stalled, nudging at", t.toFixed(1));
      vid.currentTime = t;
      if (vid.paused) vid.play().catch(() => {});
      stuckSince = now;
      return;
    }
    if (now - lastReload < RELOAD_GAP_MS) return;
    reload(t);
    stuckSince = now;
  };

  setInterval(() => {
    const now = Date.now();
    const shouldMove = wantPlay && !vid.ended && !vid.seeking && navigator.onLine;
    const t = vid.currentTime;
    if (!shouldMove || t !== lastT) {
      lastT = t;
      stuckSince = now;
      nudged = false;
      return;
    }
    if (now - stuckSince >= STALL_MS) recover(now);
  }, 1000);

  // the host errored out (network drop mid-file): reload at the same spot
  vid.addEventListener("error", () => {
    if (wantPlay && Date.now() - lastReload >= RELOAD_GAP_MS) reload(vid.currentTime || lastT || 0);
  });
  addEventListener("online", () => {
    if (wantPlay && (vid.paused || vid.readyState < 3)) reload(vid.currentTime);
  });
})();
