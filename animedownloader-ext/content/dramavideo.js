// Runs at document_start in MAIN world on dramavideo.se (a gogoanimes player).
//
// dramavideo's wrapper page ships aclib — Adcash's ad library — as a ~635 KB
// obfuscated INLINE script, then calls aclib.runPop({ zoneId }). aclib lays
// invisible overlays over every <video>, <iframe> and <a> on the page, so the
// first click on the player (and every click-to-pause) lands on an ad instead
// of the video. Being inline, no network rule can stop it.
//
// Claiming the `aclib` global first, as a non-configurable accessor, means
// the library can neither install itself nor be called: its assignment is
// dropped (or its defineProperty throws and aborts it), and runPop hits our
// no-op. Nothing else on the page is touched — the full guard.js broke this
// player's playback when it was tried here.
(function () {
  "use strict";
  const noop = function () {};
  const stub = new Proxy({}, { get: () => noop });
  try {
    Object.defineProperty(window, "aclib", {
      configurable: false,
      get() { return stub; },
      set() {},
    });
  } catch (e) {}
})();
