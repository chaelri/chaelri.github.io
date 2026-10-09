// Shared by board.html and phone.html. No internet: nothing here loads from a CDN.
const M = {
  peso: (n) => "₱" + Math.round(n).toLocaleString("en-US"),
  esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  // the engine logs with a plain "P" so the save file stays ASCII
  money: (s) => M.esc(s).replace(/\bP(\d[\d,]*)/g, "₱$1"),

  async board() {
    for (;;) {
      try { return await (await fetch("/api/board")).json(); }
      catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
    }
  },

  // Live table state. EventSource reconnects by itself; on top of that we
  // restart it if it goes quiet (a phone waking from sleep keeps a dead socket).
  live(onState, onLink) {
    let es, last = Date.now();
    const open = () => {
      if (es) es.close();
      es = new EventSource("/events");
      es.onopen = () => { last = Date.now(); onLink && onLink(true); };
      es.onmessage = (e) => { last = Date.now(); onLink && onLink(true); onState(JSON.parse(e.data)); };
      es.onerror = () => onLink && onLink(false);
    };
    open();
    setInterval(() => { if (Date.now() - last > 40000) open(); }, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) open(); });
  },

  async post(url, body) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch (e) {
      return { ok: false, error: "Can't reach the Mac. Same WiFi?" };
    }
  },

  // ---- tiny synth, no audio files ----
  ac: null,
  tone(freq, dur, type = "sine", vol = 0.12, when = 0) {
    try {
      M.ac = M.ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = M.ac.currentTime + when, o = M.ac.createOscillator(), g = M.ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(M.ac.destination); o.start(t); o.stop(t + dur);
    } catch (e) {}
  },
  sfx: {
    dice() { for (let i = 0; i < 6; i++) M.tone(180 + Math.random() * 260, 0.05, "square", 0.05, i * 0.06); },
    coin() { M.tone(988, 0.08, "square", 0.06); M.tone(1319, 0.25, "square", 0.06, 0.08); },
    pay() { M.tone(440, 0.12, "triangle", 0.12); M.tone(330, 0.2, "triangle", 0.12, 0.1); },
    card() { M.tone(660, 0.1, "sine", 0.1); M.tone(880, 0.15, "sine", 0.1, 0.08); M.tone(1100, 0.2, "sine", 0.08, 0.16); },
    step() { M.tone(700, 0.03, "sine", 0.05); },
    turn() { M.tone(523, 0.12, "sine", 0.1); M.tone(784, 0.2, "sine", 0.1, 0.12); },
    jail() { M.tone(200, 0.3, "sawtooth", 0.06); M.tone(150, 0.4, "sawtooth", 0.06, 0.25); },
    win() { [523, 659, 784, 1047].forEach((f, i) => M.tone(f, 0.3, "triangle", 0.1, i * 0.15)); },
  },
};
