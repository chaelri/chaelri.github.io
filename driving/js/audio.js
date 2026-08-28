// audio.js — everything is synthesised with WebAudio: no sound files.
// Engine note follows the firing frequency of a four-cylinder (rpm/60 * 2),
// with intake noise, tyre roar, squeal, indicator relay tick and a horn.

import { clamp, clamp01, lerp } from './util.js';

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  return b;
}

export class Sound {
  constructor() {
    this.ready = false;
    this.muted = false;
    this.volume = 0.75;
  }

  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // ---- engine: three saws through a shared low-pass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 700;
    this.engFilter.Q.value = 1.1;
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.oscs = [];
    for (const [mult, det, lvl] of [
      [0.5, -6, 0.5],
      [1.0, 0, 1.0],
      [2.0, 7, 0.42],
      [3.0, -11, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.type = mult === 1 ? 'sawtooth' : 'square';
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = lvl;
      o.connect(g).connect(this.engFilter);
      o.start();
      this.oscs.push({ o, mult, g });
    }

    const nb = noiseBuffer(ctx);

    // ---- intake / induction noise
    this.intake = ctx.createBufferSource();
    this.intake.buffer = nb;
    this.intake.loop = true;
    this.intakeF = ctx.createBiquadFilter();
    this.intakeF.type = 'bandpass';
    this.intakeF.frequency.value = 500;
    this.intakeF.Q.value = 0.8;
    this.intakeG = ctx.createGain();
    this.intakeG.gain.value = 0;
    this.intake.connect(this.intakeF).connect(this.intakeG).connect(this.master);
    this.intake.start();

    // ---- road / tyre roar
    this.road = ctx.createBufferSource();
    this.road.buffer = nb;
    this.road.loop = true;
    this.roadF = ctx.createBiquadFilter();
    this.roadF.type = 'lowpass';
    this.roadF.frequency.value = 900;
    this.roadG = ctx.createGain();
    this.roadG.gain.value = 0;
    this.road.connect(this.roadF).connect(this.roadG).connect(this.master);
    this.road.start();

    // ---- tyre squeal
    this.squeal = ctx.createBufferSource();
    this.squeal.buffer = nb;
    this.squeal.loop = true;
    this.squealF = ctx.createBiquadFilter();
    this.squealF.type = 'bandpass';
    this.squealF.frequency.value = 1750;
    this.squealF.Q.value = 7;
    this.squealG = ctx.createGain();
    this.squealG.gain.value = 0;
    this.squeal.connect(this.squealF).connect(this.squealG).connect(this.master);
    this.squeal.start();

    // ---- horn (two detuned squares, gated)
    this.hornG = ctx.createGain();
    this.hornG.gain.value = 0;
    this.hornG.connect(this.master);
    for (const f of [440, 554]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(this.hornG);
      o.start();
    }

    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  update(dt, s) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const k = 0.06;

    const rpm = clamp(s.rpm, 0, 7000);
    const running = s.engineOn || s.cranking;
    const f0 = Math.max(12, (rpm / 60) * 2);
    for (const o of this.oscs) o.o.frequency.setTargetAtTime(f0 * o.mult, t, 0.04);

    const load = clamp01(s.throttle * 0.75 + 0.25);
    const gain = running ? lerp(0.028, 0.115, load) * lerp(0.55, 1.0, clamp01(rpm / 4200)) : 0;
    this.engGain.gain.setTargetAtTime(s.cranking ? 0.05 : gain, t, k);
    this.engFilter.frequency.setTargetAtTime(360 + rpm * 0.34 + s.throttle * 2100, t, k);

    this.intakeG.gain.setTargetAtTime(running ? 0.012 + s.throttle * 0.055 : 0, t, k);
    this.intakeF.frequency.setTargetAtTime(300 + rpm * 0.22, t, k);

    const kmh = Math.abs(s.kmh);
    this.roadG.gain.setTargetAtTime(clamp01(kmh / 90) * 0.09, t, 0.12);
    this.roadF.frequency.setTargetAtTime(400 + kmh * 12, t, 0.12);

    const slip = clamp01((Math.abs(s.slip) - 0.13) * 5) * clamp01(kmh / 12);
    const lock = s.absActive ? 0.35 : 0;
    this.squealG.gain.setTargetAtTime(Math.max(slip * 0.09, lock * 0.05), t, 0.05);
    this.squealF.frequency.setTargetAtTime(1500 + slip * 900, t, 0.08);
  }

  horn(on) {
    if (!this.ready || this.muted) return;
    this.hornG.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.012);
  }

  // Short percussive click for the indicator relay and for gear-gate feedback.
  click(freq = 1400, dur = 0.035, vol = 0.1) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.01);
  }

  thud(strength = 1) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.22);
    g.gain.setValueAtTime(clamp(0.25 * strength, 0.05, 0.6), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + 0.34);

    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2 * strength, ctx.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    n.connect(nf).connect(ng).connect(this.master);
    n.start();
    n.stop(ctx.currentTime + 0.25);
  }

  chime(good = true) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const notes = good ? [660, 880, 1174] : [440, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.5);
    });
  }
}
