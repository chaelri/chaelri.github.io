// Small synthesised sound bed. No files — every sound here is a few
// oscillators, which keeps the whole game a text-only deploy.
//
// A dark game leans on sound harder than a bright one does: when the screen is
// 90% black, the drone is most of what tells you the room is still there.

let ctx = null;
let bed = null;
let enabled = false;
let layers = null;
const listeners = new Set();

/** Browsers only allow audio to start from a real user gesture. */
export const audioState = () =>
  !ctx ? "none" : ctx.state === "running" ? "on" : "blocked";

export function onAudioState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const announce = () => listeners.forEach((f) => f(audioState()));

/**
 * Chrome will happily construct an AudioContext from a setTimeout and then
 * leave it suspended forever, which is exactly what used to happen here: the
 * game auto-started once both phones joined, so nothing ever ran inside a
 * gesture and the whole soundtrack played to nobody. Hence armAudio() below.
 */
export function startAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().then(announce, () => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  enabled = true;

  // Two detuned sines a fifth apart, barely audible — a room tone.
  const gain = ctx.createGain();
  gain.gain.value = 0.045;
  gain.connect(ctx.destination);
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.value = 55;
  osc2.frequency.value = 82.4;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.09;
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(gain.gain);
  osc1.connect(gain);
  osc2.connect(gain);
  osc1.start();
  osc2.start();
  lfo.start();
  bed = gain;

  buildLayers();
  if (ctx.state === "suspended") ctx.resume().then(announce, () => {});
  announce();
}

/**
 * Attach one-shot gesture listeners so the first click or key anywhere on the
 * screen unblocks sound, whenever that happens to be.
 */
export function armAudio() {
  const go = () => {
    startAudio();
    if (audioState() === "on") {
      for (const ev of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(ev, go, true);
    }
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"])
    window.addEventListener(ev, go, true);
}

/* ------------------------------------------------------ living layers --- */

/**
 * Two continuous voices whose gain is driven every frame rather than being
 * triggered. In a game that is 90% black these carry information the picture
 * cannot: how close the things in the dark are, and how long she has been
 * standing on nothing.
 */
function buildLayers() {
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const threatFilter = ctx.createBiquadFilter();
  threatFilter.type = "bandpass";
  threatFilter.frequency.value = 190;
  threatFilter.Q.value = 4;
  const threatGain = ctx.createGain();
  threatGain.gain.value = 0;
  src.connect(threatFilter).connect(threatGain).connect(ctx.destination);
  src.start();

  const teeterOsc = ctx.createOscillator();
  teeterOsc.type = "sine";
  teeterOsc.frequency.value = 300;
  const teeterGain = ctx.createGain();
  teeterGain.gain.value = 0;
  teeterOsc.connect(teeterGain).connect(ctx.destination);
  teeterOsc.start();

  layers = { threatFilter, threatGain, teeterOsc, teeterGain };
}

/** `threat` and `teeter` are both 0..1, pushed from the render loop. */
export function setAmbience(threat, teeter) {
  if (!ctx || !layers || ctx.state !== "running") return;
  const t = ctx.currentTime;
  layers.threatGain.gain.setTargetAtTime(threat * 0.085, t, 0.18);
  layers.threatFilter.frequency.setTargetAtTime(170 + threat * 240, t, 0.25);
  // The rising tone under her feet is the only warning Anino gets that is not
  // visual, and she is usually the one who cannot see.
  layers.teeterGain.gain.setTargetAtTime(teeter > 0.02 ? 0.055 : 0, t, 0.04);
  layers.teeterOsc.frequency.setTargetAtTime(280 + teeter * 620, t, 0.04);
}

function env(node, peak, attack, decay) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g).connect(ctx.destination);
  return t + attack + decay;
}

function tone(freq, { type = "sine", peak = 0.12, attack = 0.005, decay = 0.25, slideTo = null } = {}) {
  if (!enabled || !ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + attack + decay);
  const end = env(o, peak, attack, decay);
  o.start();
  o.stop(end + 0.02);
}

function noise({ peak = 0.1, decay = 0.3, band = 900 } = {}) {
  if (!enabled || !ctx) return;
  const len = Math.floor(ctx.sampleRate * (decay + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = band;
  src.connect(filter);
  const end = env(filter, peak, 0.01, decay);
  src.start();
  src.stop(end + 0.02);
}

export const sfx = {
  shard: () => {
    tone(880, { peak: 0.1, decay: 0.5 });
    setTimeout(() => tone(1318, { peak: 0.07, decay: 0.7 }), 70);
  },
  place: () => tone(180, { type: "triangle", peak: 0.11, decay: 0.16 }),
  take: () => tone(320, { type: "triangle", peak: 0.09, decay: 0.12 }),
  flare: () => {
    noise({ peak: 0.16, decay: 0.45, band: 1600 });
    tone(140, { type: "sawtooth", peak: 0.07, decay: 0.4, slideTo: 60 });
  },
  burn: () => noise({ peak: 0.1, decay: 0.28, band: 420 }),
  hurt: () => tone(150, { type: "square", peak: 0.13, decay: 0.3, slideTo: 70 }),
  fall: () => tone(300, { type: "sine", peak: 0.14, decay: 0.9, slideTo: 40 }),
  newLantern: () => {
    tone(523, { peak: 0.1, decay: 0.6 });
    setTimeout(() => tone(784, { peak: 0.09, decay: 0.8 }), 110);
    setTimeout(() => tone(1046, { peak: 0.08, decay: 1.1 }), 220);
  },
  won: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => tone(f, { peak: 0.1, decay: 0.8 }), i * 130)
    );
  },
  lost: () => {
    [330, 262, 196].forEach((f, i) =>
      setTimeout(() => tone(f, { type: "triangle", peak: 0.11, decay: 0.9 }), i * 190)
    );
  },
  join: () => tone(660, { peak: 0.08, decay: 0.3 }),
  // Soft, dry, and quiet — footsteps are for presence, not for listening to.
  footstep: () => noise({ peak: 0.035, decay: 0.075, band: 240 }),
  // Tells Ilaw the flare is off cooldown without him looking at the bar.
  flareReady: () => tone(1046, { peak: 0.045, decay: 0.22 }),
};

/** Duck the drone while a card is up, so the text feels like a held breath. */
export function duck(on) {
  if (!bed || !ctx) return;
  bed.gain.setTargetAtTime(on ? 0.012 : 0.045, ctx.currentTime, 0.3);
}
