// Runs on animeheaven.me/gate.php (isolated world, document_end), after
// vendor/anime4k-webgpu.js.
//
// animeheaven only serves 720p (the download button is the same file; its
// "1080p" is the original release's name), which a Retina screen stretches
// ~2.4x. Anime4K (WebGPU compute shaders) redraws each frame onto a canvas
// laid over the video, upscaled to the player's real pixel size. Always Mode
// B, the soft restore, which is kinder to the smearing a ~1 Mbps encode
// leaves behind than Mode A; there is no switch. Without WebGPU the page is
// left exactly as the site made it.
//
// The canvas takes no pointer events, so clicks, double-clicks, keys and the
// native controls still belong to the <video>. While the controls are up, the
// canvas fades out toward the bottom so they show through. Fullscreen has to
// take the video's box, or the canvas would be left behind, so a transparent
// button over the native fullscreen button takes its clicks (plus
// double-click and F).
//
// Reading the frames needs CORS: the <video> is crossOrigin='anonymous' and
// every *.animeheaven.me video host answers with ACAO https://animeheaven.me.
(function () {
  "use strict";
  if (window.__adxHeavenA4k) return;
  window.__adxHeavenA4k = true;

  const A4K = window["anime4k-webgpu"];
  const vid = document.getElementById("vid");
  const box = vid && vid.parentElement;
  if (!A4K || !vid || !box || !navigator.gpu) return;

  const CONTROLS_IDLE_MS = 2600; // Chrome hides its controls after ~2.5 s still

  const canvas = document.createElement("canvas");
  canvas.className = "adx-a4k";
  // Chrome never tells the page about clicks on its own controls, so its
  // fullscreen button can only take the bare <video> fullscreen, leaving the
  // canvas behind. A transparent button sits exactly over it and catches the
  // click first: the native one stays where it is, but the click is ours.
  const fsHit = document.createElement("button");
  fsHit.type = "button";
  fsHit.className = "adx-a4k-fshit";
  fsHit.setAttribute("aria-label", "Fullscreen");
  box.append(canvas, fsHit);

  let broken = false;
  const enhancing = () => !broken;

  // ── GPU state; rebuilt whole (device and all) on any size change ──
  let device = null;
  let ctx = null;
  let gen = 0; // bumps on every rebuild, so an old frame loop stops itself
  let frame = null; // { input, preset, pipe, bind, vw, vh, view:[x,y,w,h] }

  const BLIT = `
    @group(0) @binding(0) var samp: sampler;
    @group(0) @binding(1) var tex: texture_2d<f32>;
    struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
    @vertex fn vs(@builtin(vertex_index) i: u32) -> V {
      let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
      var o: V;
      o.pos = vec4f(p[i], 0, 1);
      o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
      return o;
    }
    @fragment fn fs(v: V) -> @location(0) vec4f {
      return vec4f(textureSample(tex, samp, v.uv).rgb, 1);
    }`;

  const stop = () => {
    gen += 1;
    frame = null;
    canvas.classList.remove("is-live");
    if (device) { device.destroy(); device = null; }
  };

  const fail = (why, err) => {
    console.warn("[adx a4k]", why, err || "");
    broken = true;
    stop();
    fsHit.hidden = true; // the native fullscreen button is fine for plain video
  };

  const draw = (my) => {
    if (my !== gen || !frame || vid.readyState < 2) return;
    // the plain <video> holding fullscreen covers the canvas: skip the work
    if (document.fullscreenElement === vid) return;
    try {
      device.queue.copyExternalImageToTexture({ source: vid }, { texture: frame.input }, [frame.vw, frame.vh]);
    } catch (e) {
      // SecurityError here means the frame is cross-origin without CORS
      fail("cannot read the video frame", e);
      return;
    }
    const enc = device.createCommandEncoder();
    frame.preset.pass(enc);
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setViewport(...frame.view, 0, 1);
    pass.setPipeline(frame.pipe);
    pass.setBindGroup(0, frame.bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
    canvas.classList.add("is-live");
  };

  const loop = (my) => {
    vid.requestVideoFrameCallback(() => {
      if (my !== gen) return;
      draw(my);
      loop(my);
    });
  };

  const build = async () => {
    stop();
    const my = gen;
    if (broken) return;
    const vw = vid.videoWidth;
    const vh = vid.videoHeight;
    if (!vw || !vh) return; // loadedmetadata calls again

    // the canvas covers the <video>'s box; the picture sits letterboxed in it
    const r = vid.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    Object.assign(canvas.style, {
      left: r.left - br.left + "px",
      top: r.top - br.top + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
    const dpr = devicePixelRatio || 1;
    const cw = Math.round(r.width * dpr);
    const ch = Math.round(r.height * dpr);
    const s = Math.min(cw / vw, ch / vh);
    const tw = Math.round(vw * s);
    const th = Math.round(vh * s);

    let dev;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) throw new Error("no WebGPU adapter");
      dev = await adapter.requestDevice();
    } catch (e) {
      fail("WebGPU unavailable", e);
      return;
    }
    if (my !== gen) { dev.destroy(); return; }
    device = dev;
    device.lost.then((info) => {
      if (device === dev && info.reason !== "destroyed") fail("GPU device lost", info.message);
    });

    canvas.width = cw;
    canvas.height = ch;
    ctx = ctx || canvas.getContext("webgpu");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });

    const input = device.createTexture({
      size: [vw, vh, 1],
      format: "rgba16float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const preset = new A4K.ModeB({
      device,
      inputTexture: input,
      nativeDimensions: { width: vw, height: vh },
      targetDimensions: { width: tw, height: th },
    });
    const mod = device.createShaderModule({ code: BLIT });
    const pipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: mod, entryPoint: "vs" },
      fragment: { module: mod, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const bind = device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: device.createSampler({ magFilter: "linear", minFilter: "linear" }) },
        { binding: 1, resource: preset.getOutputTexture().createView() },
      ],
    });
    frame = { input, preset, pipe, bind, vw, vh, view: [(cw - tw) / 2, (ch - th) / 2, tw, th] };
    draw(my); // a paused video still shows the enhanced frame
    loop(my);
  };

  // Resizes come in bursts (window drag, fullscreen), and a rebuild is a new
  // device plus every pipeline, so wait for the size to settle.
  let buildTimer = 0;
  const rebuildSoon = (ms = 150) => {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(build, ms);
  };
  new ResizeObserver(() => rebuildSoon()).observe(vid);
  vid.addEventListener("loadedmetadata", () => rebuildSoon(0));
  // a seek while paused presents one frame; make sure it is drawn
  vid.addEventListener("seeked", () => draw(gen));

  // ── the native controls: fade the canvas away while they are showing ──
  let idleTimer = 0;
  const setControls = (on) => box.classList.toggle("adx-a4k-ctl", on);
  const poke = () => {
    setControls(true);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setControls(vid.paused), CONTROLS_IDLE_MS);
  };
  box.addEventListener("pointermove", poke);
  box.addEventListener("pointerdown", poke);
  box.addEventListener("pointerleave", () => {
    clearTimeout(idleTimer);
    setControls(vid.paused);
  });
  vid.addEventListener("pause", () => setControls(true));
  vid.addEventListener("play", () => poke());
  vid.addEventListener("keydown", poke);
  setControls(vid.paused);

  // ── fullscreen belongs to the box, so the canvas goes with the video ──
  // The cover button, double-click and F are all real page events, so they
  // carry the user activation a fullscreen request needs.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen().catch((e) => console.warn("[adx a4k] fullscreen", e));
  };
  fsHit.addEventListener("click", (e) => {
    e.stopPropagation();
    fsHit.blur(); // Space and the arrows go back to the video
    toggleFullscreen();
  });
  // double-click: take it before the <video>'s own default handler
  vid.addEventListener("dblclick", (e) => {
    if (!enhancing()) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFullscreen();
  }, true);
  addEventListener("keydown", (e) => {
    if (e.key !== "f" && e.key !== "F") return;
    if (e.metaKey || e.ctrlKey || e.altKey || !enhancing()) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    toggleFullscreen();
  });
})();
