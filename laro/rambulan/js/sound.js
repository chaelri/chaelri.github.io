// All audio is synthesized: no files, nothing to download.
// A little chiptune loop for the lobby and the fight, plus game sounds.
const SONGS = {
  // bars of [chord root midi, chord quality]; 16 steps per bar
  fight: { bpm: 140, bars: [[45, "min"], [41, "maj"], [43, "maj"], [40, "min"]],
    lead: [69, 0, 72, 0, 76, 74, 72, 0, 69, 0, 67, 69, 0, 72, 0, 0] },
  race: { bpm: 152, bars: [[48, "maj"], [45, "min"], [41, "maj"], [43, "maj"], [48, "maj"], [45, "min"], [41, "maj"], [43, "sus"]],
    lead: [72, 0, 76, 79, 0, 76, 74, 72, 74, 0, 76, 0, 79, 0, 81, 79] },
  lobby: { bpm: 112, bars: [[41, "maj7"], [43, "maj"], [40, "min7"], [45, "min"]],
    lead: [0, 0, 69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0] },
};
const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10] };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ac = null; this.on = true; this.song = null; this.stepN = 0; this.nextT = 0; this.lastCount = null;
  }
  unlock() {
    if (!this.ac) {
      try {
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ac.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ac.destination);
        this.musicBus = this.ac.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
        const len = this.ac.sampleRate * 0.5, b = this.ac.createBuffer(1, len, this.ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
        setInterval(() => this.schedule(), 25);
      } catch (e) { return; }
    }
    if (this.ac.state === "suspended") this.ac.resume();
  }
  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? 0.55 : 0; }
  music(name) { this.song = SONGS[name] ? name : null; this.stepN = 0; if (this.ac) this.nextT = this.ac.currentTime + 0.05; }

  tone(f, dur, type = "square", vol = 0.12, when = 0, bus, slide) {
    if (!this.ac || !this.on) return;
    const t = (when || this.ac.currentTime), o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, when = 0, filt = 2000, type = "lowpass", bus) {
    if (!this.ac || !this.on) return;
    const t = when || this.ac.currentTime, s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = filt;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus || this.master); s.start(t); s.stop(t + dur);
  }
  schedule() {
    if (!this.ac || !this.song || !this.on) return;
    const S = SONGS[this.song], st = 60 / S.bpm / 4;
    if (this.nextT < this.ac.currentTime) this.nextT = this.ac.currentTime + 0.02;
    while (this.nextT < this.ac.currentTime + 0.12) {
      const i = this.stepN % 16, bar = S.bars[Math.floor(this.stepN / 16) % S.bars.length];
      const root = bar[0], ch = QUAL[bar[1]], t = this.nextT, B = this.musicBus;
      if (i % 4 === 0) this.tone(hz(root - 12), st * 3, "triangle", 0.5, t, B);           // bass
      if (i % 4 === 2) this.tone(hz(root - 12 + 7), st * 1.6, "triangle", 0.35, t, B);
      this.tone(hz(root + 12 + ch[i % ch.length]), st * 0.9, "square", 0.05, t, B);       // arpeggio
      const n = S.lead[i];
      if (n && Math.floor(this.stepN / 32) % 2 === 1) this.tone(hz(n), st * 1.8, "square", 0.07, t, B);
      if (i % 4 === 0) this.tone(140, 0.12, "sine", 0.6, t, B, 45);                        // kick
      if (i % 8 === 4) this.noise(0.12, 0.25, t, 1800, "bandpass", B);                     // snare
      if (i % 2 === 1) this.noise(0.03, 0.1, t, 8000, "highpass", B);                      // hat
      this.nextT += st;
      this.stepN++;
    }
  }
  countdown(race) {
    if (!race || race.phase !== "countdown") { this.lastCount = null; return; }
    const c = Math.ceil(race.countdown - 0.7);
    if (c !== this.lastCount && c >= 1 && c <= 3) this.tone(523, 0.25, "square", 0.18);
    this.lastCount = c;
  }
  go() { this.tone(1047, 0.6, "square", 0.2); this.tone(1319, 0.6, "square", 0.12); }
  join() { this.tone(660, 0.1, "square", 0.12); this.tone(990, 0.18, "square", 0.12, this.ac && this.ac.currentTime + 0.08); }
  coin() { const t = this.ac && this.ac.currentTime; this.tone(988, 0.07, "square", 0.1); this.tone(1319, 0.22, "square", 0.1, t + 0.07); }
  roulette() { if (!this.ac) return; for (let i = 0; i < 12; i++) this.tone(700 + (i % 3) * 200, 0.04, "square", 0.05, this.ac.currentTime + i * 0.1); }
  got() { this.tone(880, 0.12, "triangle", 0.18); this.tone(1320, 0.2, "triangle", 0.15, this.ac && this.ac.currentTime + 0.1); }
  boost(level) { this.noise(0.6, 0.25, 0, 900, "lowpass"); this.tone(200, 0.5, "sawtooth", 0.08, 0, null, 500 + level * 150); }
  spark(level) { this.tone(1200 + level * 300, 0.06, "square", 0.05); }
  hit() { this.tone(600, 0.5, "sawtooth", 0.14, 0, null, 120); this.noise(0.3, 0.2, 0, 1200); }
  throw() { this.tone(400, 0.15, "triangle", 0.12, 0, null, 900); }
  bump() { this.tone(90, 0.15, "sine", 0.3, 0, null, 50); }
  star() { if (!this.ac) return; for (let i = 0; i < 8; i++) this.tone(hz(72 + [0, 4, 7, 12][i % 4]), 0.1, "square", 0.08, this.ac.currentTime + i * 0.08); }
  bolt() { this.noise(0.8, 0.4, 0, 3000, "highpass"); this.tone(1500, 0.6, "sawtooth", 0.08, 0, null, 80); }
  lap(final) {
    if (!this.ac) return;
    const notes = final ? [72, 76, 79, 84, 79, 84] : [72, 76, 79];
    notes.forEach((n, i) => this.tone(hz(n), 0.14, "square", 0.12, this.ac.currentTime + i * 0.09));
  }
  finish(place) {
    if (!this.ac) return;
    const good = place <= 3;
    const notes = good ? [72, 76, 79, 84, 88, 91] : [67, 65, 64, 60];
    notes.forEach((n, i) => this.tone(hz(n), good ? 0.2 : 0.3, "square", 0.13, this.ac.currentTime + i * (good ? 0.11 : 0.2)));
  }
  shoot(w) {
    if (w === "boga") { this.noise(0.25, 0.35, 0, 1400); this.tone(120, 0.15, "square", 0.12, 0, null, 60); }
    else if (w === "paltik") { this.noise(0.4, 0.3, 0, 3000); this.tone(900, 0.3, "sawtooth", 0.08, 0, null, 120); }
    else if (w === "bazooka") { this.noise(0.5, 0.25, 0, 600); this.tone(180, 0.4, "sawtooth", 0.1, 0, null, 400); }
    else if (w === "ripple") this.noise(0.06, 0.18, 0, 2500, "bandpass");
    else this.tone(500, 0.08, "triangle", 0.12, 0, null, 250);
  }
  swing() { this.noise(0.12, 0.2, 0, 1500, "bandpass"); }
  hurt() { this.tone(220, 0.12, "square", 0.1, 0, null, 140); }
  boom() { this.noise(0.9, 0.55, 0, 500); this.tone(90, 0.6, "sine", 0.4, 0, null, 30); }
  ko() { if (!this.ac) return; [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.18, "square", 0.12, this.ac.currentTime + i * 0.1)); }
  chest(gold) { if (!this.ac) return; const n = gold ? [72, 76, 79, 84, 88] : [72, 76, 79]; n.forEach((m, i) => this.tone(hz(m), 0.16, "triangle", 0.14, this.ac.currentTime + i * 0.07)); }
  pickup(r) { this.tone(hz(76 + r * 3), 0.1, "square", 0.08); this.tone(hz(83 + r * 3), 0.16, "square", 0.08, this.ac && this.ac.currentTime + 0.07); }
  use(item) { if (item === "buko") this.tone(500, 0.4, "sine", 0.15, 0, null, 900); else if (item === "kalasag") this.tone(300, 0.4, "triangle", 0.15, 0, null, 1200); else this.throw(); }
  storm() { this.tone(110, 1.2, "sawtooth", 0.08, 0, null, 70); this.noise(1.2, 0.15, 0, 400); }
  ghost() { this.tone(700, 0.5, "sine", 0.08, 0, null, 300); }
  empty() { this.tone(1400, 0.03, "square", 0.05); }
  win() { if (!this.ac) return; [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(hz(n), 0.2, "square", 0.13, this.ac.currentTime + i * 0.11)); }
}
