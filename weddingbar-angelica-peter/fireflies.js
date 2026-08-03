// =====================================================================
//  Alitaptap — drifting purple fireflies behind the glass.
//
//  A fixed full-screen canvas that sits above the page background but
//  below every card, so the frosted surfaces blur whatever floats past.
//  Deliberately cheap: a few dozen soft blobs, no images, no libraries.
// =====================================================================

(function () {
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("fireflies");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Palette drawn from the app's violets so the glow reads as one family.
  // Mostly gold — real alitaptap glow warm — with violets mixed through so
  // they belong to the same palette as the chrome.
  const HUES = [
    [244, 217, 154], // gold-soft
    [227, 178, 92],  // gold
    [244, 217, 154], // gold-soft again: weights the swarm warm
    [218, 191, 212], // lilac
    [181, 123, 181], // violet
  ];

  let w = 0;
  let h = 0;
  let dpr = 1;
  let flies = [];

  function count() {
    // Scale with viewport, but stay light on phones.
    const area = w * h;
    return Math.max(9, Math.min(24, Math.round(area / 68000)));
  }

  function makeFly() {
    const [r, g, b] = HUES[(Math.random() * HUES.length) | 0];
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 1.5,
      // Slow, wandering drift — fireflies, not snow.
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      phase: Math.random() * Math.PI * 2,
      // Each one breathes at its own pace.
      pulse: 0.006 + Math.random() * 0.014,
      color: `${r}, ${g}, ${b}`,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = count();
    if (flies.length > target) flies.length = target;
    while (flies.length < target) flies.push(makeFly());
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    for (const f of flies) {
      f.phase += f.pulse;
      // 0.18 -> 0.85 so they fade in and out rather than blinking hard.
      const alpha = 0.05 + (Math.sin(f.phase) * 0.5 + 0.5) * 0.22;

      const glow = f.r * 5.5;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glow);
      grad.addColorStop(0, `rgba(${f.color}, ${alpha})`);
      grad.addColorStop(0.35, `rgba(${f.color}, ${alpha * 0.28})`);
      grad.addColorStop(1, `rgba(${f.color}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, glow, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
      ctx.fillStyle = `rgba(255, 250, 235, ${alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      f.x += f.vx;
      f.y += f.vy;

      // Nudge the heading occasionally so paths meander.
      if (Math.random() < 0.012) {
        f.vx += (Math.random() - 0.5) * 0.09;
        f.vy += (Math.random() - 0.5) * 0.09;
        f.vx = Math.max(-0.34, Math.min(0.34, f.vx));
        f.vy = Math.max(-0.34, Math.min(0.34, f.vy));
      }

      // Wrap around the edges with a margin so nothing pops.
      const m = glow;
      if (f.x < -m) f.x = w + m;
      if (f.x > w + m) f.x = -m;
      if (f.y < -m) f.y = h + m;
      if (f.y > h + m) f.y = -m;
    }

    raf = requestAnimationFrame(draw);
  }

  let raf = null;

  function start() {
    if (raf === null) raf = requestAnimationFrame(draw);
  }
  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  resize();
  window.addEventListener("resize", resize);

  if (REDUCED) {
    // Honour the OS setting: render one still frame, never animate.
    for (const f of flies) f.phase = Math.PI / 2;
    ctx.clearRect(0, 0, w, h);
    draw();
    stop();
  } else {
    start();
    // Don't burn battery in a background tab.
    document.addEventListener("visibilitychange", () =>
      document.hidden ? stop() : start()
    );
  }
})();
