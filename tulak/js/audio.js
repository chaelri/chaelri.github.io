// Every sound is synthesised — no files to load, nothing to license.
// WebAudio has to be unlocked by a touch on iOS, so `unlock()` is called from
// the first tap on any menu button.

let ac = null, master = null, noiseBuf = null;

export function unlock() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol, fromHz, toHz, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(fromHz, t);
  f.frequency.exponentialRampToValueAtTime(toHz, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  dash: () => noise(0.18, 0.35, 900, 2600),
  bump: (power = 8) => {
    const k = Math.min(1, power / 12);
    tone("sine", 180 + k * 60, 60, 0.18, 0.35 + k * 0.3);
    noise(0.08, 0.25 + k * 0.2, 2000, 600);
  },
  pound: () => { tone("sine", 120, 35, 0.5, 0.7); noise(0.35, 0.4, 500, 120); },
  dive: () => { noise(0.3, 0.3, 400, 3000); tone("sine", 500, 900, 0.25, 0.15); },
  float: () => { tone("sine", 300, 600, 0.25, 0.2); tone("sine", 450, 900, 0.25, 0.15, 0.06); },
  roll: () => { noise(0.5, 0.25, 300, 900); },
  fall: () => tone("triangle", 900, 120, 0.9, 0.22),
  crumble: () => noise(0.4, 0.18, 300, 80),
  beep: (hi) => tone("square", hi ? 880 : 520, hi ? 880 : 520, hi ? 0.35 : 0.12, 0.12),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.22, 0.2, i * 0.11)),
  lose: () => [440, 370, 311].forEach((f, i) => tone("triangle", f, f * 0.98, 0.28, 0.16, i * 0.16)),
  tap: () => tone("sine", 700, 500, 0.06, 0.12),
};

// Haptics. Android gets navigator.vibrate. iOS Safari has no vibrate API, but
// toggling an <input type="checkbox" switch> plays a real Taptic tick (17.4+) —
// the trick devo/js/01-core.js uses.
let sw = null;
export function buzz(ms = 12) {
  try { if (navigator.vibrate?.(ms)) return; } catch {}
  try {
    if (!sw) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;top:-64px;left:-64px;width:1px;height:1px;opacity:0;pointer-events:none;";
      sw = document.createElement("input");
      sw.type = "checkbox";
      sw.setAttribute("switch", "");
      label.appendChild(sw);
      document.body.appendChild(label);
    }
    sw.checked = !sw.checked;
    sw.dispatchEvent(new Event("change", { bubbles: true }));
    sw.click();
  } catch {}
}
