// Sound.
//
// Two layers. The real one is a bank of CC0 samples in `audio/` (Kenney's
// Impact / Interface / Digital packs, and an 8-bit loop by Theodore Kerr for
// the music — see audio/CREDITS.md). Under it, the original oscillator
// versions of every cue survive as a fallback, so the game still sounds like
// something before the bank has finished decoding, or if the files are missing
// altogether. Nothing waits on a download.
//
// The gesture problem is handled up front rather than discovered later: a
// browser will construct an AudioContext from a timer and then leave it
// suspended forever, so armAudio() hangs one-shot listeners on the first
// click or key and the screen shows a badge until it is actually running.

// The recorded loop is mastered louder than the oscillator version was.
const MUSIC_LEVEL = 0.34;

let ctx = null;
let master = null;
let enabled = false;
const listeners = new Set();

export const audioState = () =>
  !ctx ? "none" : ctx.state === "running" ? "on" : "blocked";
export function onAudioState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const announce = () => listeners.forEach((f) => f(audioState()));

export function startAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().then(announce, () => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  enabled = true;
  if (ctx.state === "suspended") ctx.resume().then(announce, () => {});
  loadBank();
  announce();
}

export function armAudio() {
  const go = () => {
    startAudio();
    if (audioState() === "on")
      for (const ev of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(ev, go, true);
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"])
    window.addEventListener(ev, go, true);
}

/* ------------------------------------------------------------ voices --- */

function tone(freq, { type = "square", peak = 0.1, attack = 0.005, decay = 0.12, to = null, delay = 0 } = {}) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + attack + decay);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + attack + decay + 0.02);
}

function noise({ peak = 0.1, decay = 0.12, band = 900, q = 1, delay = 0, type = "bandpass" } = {}) {
  if (!enabled || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * (decay + 0.05)));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = band;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + decay + 0.05);
}

const arp = (notes, step = 0.07, o = {}) =>
  notes.forEach((f, i) => tone(f, { type: "square", peak: 0.075, decay: 0.13, delay: i * step, ...o }));

/* ------------------------------------------------------------ music --- */
//
// A small chiptune loop, generated. Scheduled against the audio clock with a
// lookahead rather than from setInterval directly — a timer fires whenever the
// main thread gets round to it, which on a frame that is busy drawing means
// audible stumbling. Notes are queued ~120ms early and play exactly on time.

let musicGain = null;
let musicTimer = null;
let nextNote = 0;
let stepN = 0;
let bpm = 132;

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Am — F — C — G. Four bars of sixteenths, one chord each.
const PROG = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [53, 57, 60] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
];
const BASS_ON = [0, 3, 6, 8, 11, 14];
const STAB_ON = [4, 12];
const LEAD_ON = [0, 2, 4, 6, 9, 10, 12, 14];

function voice(freq, at, dur, { type = "square", peak = 0.05, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(musicGain);
  o.start(at);
  o.stop(at + dur + 0.03);
}

function playStep(i, at) {
  const bar = Math.floor(i / 16) % PROG.length;
  const beat = i % 16;
  const { root, chord } = PROG[bar];
  const sixteenth = 60 / bpm / 4;

  if (BASS_ON.includes(beat)) voice(hz(root), at, sixteenth * 1.5, { type: "triangle", peak: 0.09 });
  if (STAB_ON.includes(beat))
    chord.forEach((n, k) => voice(hz(n), at, sixteenth * 1.2, { type: "square", peak: 0.022, detune: k * 4 }));
  if (LEAD_ON.includes(beat)) {
    const n = chord[(Math.floor(i / 2) + bar) % chord.length] + 12;
    voice(hz(n), at, sixteenth * 0.9, { type: "square", peak: 0.028 });
  }
  // a soft tick on the backbeat to hold the pulse together
  if (beat % 8 === 4) noise({ peak: 0.018, decay: 0.05, band: 2400, delay: Math.max(0, at - ctx.currentTime) });
}

/* ---------------------------------------------------------- the music --- */
//
// A real loop (audio/bgm.ogg) when it has decoded, and the sequencer above
// when it has not — `musicWanted` is the bridge: the game asks for music
// whenever it likes, and whichever layer is ready at that moment answers.
// When the file lands mid-round the sequencer hands over on the next call.

let musicBuffer = null;
let musicSrc = null;
let musicWanted = false;

function ensureMusicGain() {
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.connect(master);
  }
}

export function startMusic(tempo = 132) {
  if (!ctx || !enabled) return;
  musicWanted = true;
  bpm = tempo;
  ensureMusicGain();
  musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.4);

  if (musicBuffer) {
    // Drop the fallback the moment the real thing is available.
    clearInterval(musicTimer);
    musicTimer = null;
    if (musicSrc) return;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = musicBuffer;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicSrc.start();
    return;
  }

  if (musicTimer) return;
  nextNote = ctx.currentTime + 0.06;
  stepN = 0;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    while (nextNote < ctx.currentTime + 0.12) {
      playStep(stepN, nextNote);
      nextNote += 60 / bpm / 4;
      stepN = (stepN + 1) % 64;
    }
  }, 25);
}

export function stopMusic() {
  musicWanted = false;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
  clearInterval(musicTimer);
  musicTimer = null;
  if (musicSrc) {
    // Let the fade finish before the source goes, or it cuts off square.
    const src = musicSrc;
    musicSrc = null;
    try { src.stop(ctx.currentTime + 0.6); } catch {}
  }
}

/** Pull the music down so a banner or a fanfare can be heard over it. */
export function duckMusic(on) {
  if (!musicGain || !ctx) return;
  musicGain.gain.setTargetAtTime(on ? MUSIC_LEVEL * 0.28 : MUSIC_LEVEL, ctx.currentTime, 0.18);
}

export const musicPlaying = () => !!(musicTimer || musicSrc);

/* -------------------------------------------------------------- sfx --- */

const synth = {
  jump: () => tone(300, { type: "square", peak: 0.075, attack: 0.004, decay: 0.11, to: 680 }),
  land: () => noise({ peak: 0.06, decay: 0.07, band: 240, q: 0.8 }),
  step: () => noise({ peak: 0.022, decay: 0.035, band: 320 }),

  star: () => arp([988, 1319], 0.055, { peak: 0.08, decay: 0.2 }),

  // Getting stomped, and doing the stomping — different enough to tell apart
  // without looking.
  stomp: () => {
    noise({ peak: 0.16, decay: 0.1, band: 420, q: 0.6 });
    tone(220, { type: "square", peak: 0.11, decay: 0.16, to: 60 });
  },
  // Heavier than it was: a low thump you feel, a crack on top of it, and a
  // tail that rings out under the hit-stop.
  die: () => {
    tone(90, { type: "sine", peak: 0.22, attack: 0.002, decay: 0.42, to: 38 });
    noise({ peak: 0.2, decay: 0.16, band: 260, q: 0.6 });
    noise({ peak: 0.12, decay: 0.3, band: 2600, q: 0.8, delay: 0.01 });
    tone(520, { type: "triangle", peak: 0.09, decay: 0.5, to: 80, delay: 0.05 });
  },

  // One rising phrase per power-up, so you know what you grabbed with your
  // eyes on your own character rather than on the pickup.
  laki: () => arp([262, 330, 392, 523, 659], 0.06, { type: "sawtooth", peak: 0.08 }),
  baril: () => arp([440, 392, 587], 0.05, { type: "square", peak: 0.08 }),
  bituin: () => arp([523, 659, 784, 1047, 1319, 1568], 0.045, { peak: 0.07 }),
  powerEnd: () => arp([523, 392, 262], 0.06, { type: "triangle", peak: 0.05, decay: 0.16 }),
  bilis: () => arp([392, 523, 659, 880], 0.04, { type: "sawtooth", peak: 0.075 }),
  yelo: () => {
    arp([1568, 1319, 1047, 784], 0.05, { type: "sine", peak: 0.07, decay: 0.3 });
    noise({ peak: 0.05, decay: 0.4, band: 3200, q: 2 });
  },
  kalasag: () => arp([330, 415, 494, 659], 0.06, { type: "triangle", peak: 0.08 }),
  lunas: () => arp([523, 659, 784], 0.07, { type: "sine", peak: 0.09, decay: 0.34 }),
  helper: () => arp([659, 784, 988, 1319], 0.07, { type: "triangle", peak: 0.07, decay: 0.3 }),
  helperSave: () => {
    arp([392, 523, 659, 880, 1047], 0.055, { type: "triangle", peak: 0.09, decay: 0.34 });
    noise({ peak: 0.05, decay: 0.3, band: 2200 });
  },
  shieldBreak: () => {
    noise({ peak: 0.12, decay: 0.22, band: 1500, q: 0.7 });
    tone(700, { type: "triangle", peak: 0.08, decay: 0.25, to: 200 });
  },
  baliktad: () => {
    tone(392, { type: "square", peak: 0.08, decay: 0.3, to: 196 });
    tone(196, { type: "square", peak: 0.06, decay: 0.3, to: 392, delay: 0.14 });
  },

  shoot: () => {
    tone(880, { type: "square", peak: 0.07, attack: 0.002, decay: 0.07, to: 220 });
    noise({ peak: 0.04, decay: 0.05, band: 1800 });
  },
  shotHit: () => {
    noise({ peak: 0.13, decay: 0.12, band: 700, q: 0.5 });
    tone(160, { type: "square", peak: 0.09, decay: 0.14, to: 50 });
  },
  shotWall: () => noise({ peak: 0.05, decay: 0.05, band: 1200 }),

  // While the star is running, a little sparkle every so often.
  sparkle: () => tone(1568 + Math.random() * 400, { type: "sine", peak: 0.035, decay: 0.09 }),

  // A deep hit under a clear tone, so each tick has some body to it.
  count: () => {
    tone(110, { type: "sine", peak: 0.16, attack: 0.002, decay: 0.2, to: 70 });
    tone(660, { type: "square", peak: 0.09, decay: 0.16 });
    noise({ peak: 0.05, decay: 0.09, band: 900, q: 0.8 });
  },
  go: () => {
    tone(80, { type: "sine", peak: 0.22, attack: 0.002, decay: 0.4, to: 45 });
    arp([784, 1047, 1319], 0.055, { peak: 0.12, decay: 0.32 });
    noise({ peak: 0.1, decay: 0.22, band: 1800, q: 0.6 });
  },
  roundWin: () => arp([523, 659, 784, 1047], 0.09, { peak: 0.09, decay: 0.26 }),
  matchWin: () => arp([523, 659, 784, 1047, 1319, 1047, 1319, 1568], 0.1, { peak: 0.09, decay: 0.3 }),
  roundLose: () => arp([392, 330, 262], 0.11, { type: "triangle", peak: 0.08, decay: 0.3 }),
  suntok: () => {
    noise({ peak: 0.1, decay: 0.07, band: 700, q: 0.7 });
    tone(150, { type: "square", peak: 0.08, attack: 0.002, decay: 0.1, to: 60 });
  },
  tatlo: () => arp([523, 659, 784], 0.05, { type: "triangle", peak: 0.08, decay: 0.22 }),
  join: () => arp([659, 880], 0.06, { peak: 0.07, decay: 0.16 }),
  spawn: () => tone(1200, { type: "sine", peak: 0.05, decay: 0.2, to: 1800 }),
};

/* ------------------------------------------------------------ samples --- */
//
// The bank. Each cue names the files it is made of:
//   one: pick one at random  (footsteps, so they do not machine-gun)
//   all: play them together  (a thump under a crack — one file rarely has
//                             both the body and the edge a hit needs)
// `gain` is per-cue because the packs are all normalised to the same peak,
// which means a footstep arrives as loud as an explosion unless it is told
// otherwise. `vary` detunes each playback a little so repeats do not sound
// like the same recording twice.

const BANK = {
  jump:        { one: ["jump"], gain: 0.34, vary: 0.09 },
  land:        { one: ["land"], gain: 0.4, vary: 0.08 },
  step:        { one: ["step1", "step2", "step3"], gain: 0.2, vary: 0.12 },

  stomp:       { all: ["stomp", "stomp2"], gain: 0.72, vary: 0.05 },
  die:         { all: ["die", "lowdown"], gain: 0.85, vary: 0.04 },

  laki:        { one: ["laki"], gain: 0.5 },
  baril:       { one: ["baril"], gain: 0.5 },
  bituin:      { one: ["bituin"], gain: 0.55 },
  bilis:       { one: ["bilis"], gain: 0.5 },
  yelo:        { one: ["yelo"], gain: 0.55 },
  kalasag:     { one: ["kalasag"], gain: 0.5 },
  lunas:       { one: ["lunas"], gain: 0.5 },
  baliktad:    { one: ["baliktad"], gain: 0.5 },
  powerEnd:    { one: ["lowdown"], gain: 0.34 },
  suntok:      { one: ["suntok"], gain: 0.6, vary: 0.07 },
  tatlo:       { one: ["tatlo"], gain: 0.55 },

  shoot:       { one: ["shoot"], gain: 0.32, vary: 0.1 },
  shotHit:     { one: ["shothit"], gain: 0.45, vary: 0.08 },
  shotWall:    { one: ["shotwall"], gain: 0.26, vary: 0.1 },
  shieldBreak: { one: ["shieldbreak"], gain: 0.6 },

  sparkle:     { one: ["sparkle"], gain: 0.16, vary: 0.2 },

  count:       { one: ["count"], gain: 0.75 },
  go:          { all: ["go", "gohit"], gain: 0.8 },
  roundWin:    { one: ["roundwin"], gain: 0.6 },
  roundLose:   { one: ["roundlose"], gain: 0.55 },
  matchWin:    { all: ["matchwin", "matchwin2"], gain: 0.7 },

  join:        { one: ["join"], gain: 0.5 },
  spawn:       { one: ["spawn"], gain: 0.3 },
  helper:      { one: ["helper"], gain: 0.5 },
  helperSave:  { one: ["helpersave"], gain: 0.55 },
  poof:        { one: ["poof"], gain: 0.45 },
};

const BASE = new URL("../audio/", import.meta.url);
const buffers = new Map();
let bankLoading = false;

/** Every distinct file the bank refers to, plus the music. */
function bankFiles() {
  const names = new Set();
  for (const def of Object.values(BANK))
    for (const n of [...(def.one || []), ...(def.all || [])]) names.add(n);
  return [...names];
}

/**
 * Decode the bank in the background.
 *
 * Failures are per-file and silent: a missing sample just leaves that cue on
 * its oscillator version rather than taking the whole bank — and the game
 * down — with it.
 */
function loadBank() {
  if (bankLoading || !ctx) return;
  bankLoading = true;
  for (const name of bankFiles()) {
    fetch(new URL(`${name}.ogg`, BASE))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {});
  }
  fetch(new URL("bgm.ogg", BASE))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => {
      musicBuffer = buf;
      // The loop may have been asked for before the file arrived.
      if (musicWanted) startMusic();
    })
    .catch(() => {});
}

function playBuffer(name, gain, vary) {
  const buf = buffers.get(name);
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return true;
}

/** True if the cue was played from the bank; false means "use the synth". */
function playCue(key) {
  const def = BANK[key];
  if (!def || !ctx) return false;
  let played = false;
  if (def.one && def.one.length) {
    const n = def.one[Math.floor(Math.random() * def.one.length)];
    played = playBuffer(n, def.gain ?? 0.5, def.vary) || played;
  }
  for (const n of def.all || []) {
    played = playBuffer(n, def.gain ?? 0.5, def.vary) || played;
  }
  return played;
}

/**
 * The public table. Every key the game calls resolves to a sample if one has
 * decoded, and to the oscillator version otherwise — so call sites never have
 * to know or care which layer answered.
 */
export const sfx = new Proxy(
  {},
  {
    get(_, key) {
      return () => {
        if (!ctx || !enabled) return;
        if (playCue(key)) return;
        synth[key]?.();
      };
    },
  }
);
