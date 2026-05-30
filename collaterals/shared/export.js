// SVG → PNG export. Each template renders as an SVG element; this turns it
// into a high-DPI PNG blob for download or Drive upload.
//
// Font handling: rasterizing an SVG via `<img src="data:image/svg+xml,...">`
// does NOT fetch external resources from inside the SVG (Google Fonts @import
// is silently ignored), which is why exports were rendering Sacramento as
// the default serif. We work around it by fetching each woff2 referenced in
// the Google Fonts CSS, base64-encoding it into the @font-face `src:`, and
// injecting the whole rewritten stylesheet inline. The browser then has no
// network calls to make — the font binary travels with the SVG.

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2" +
  "?family=Playfair+Display:ital,wght@0,400;0,700;1,400" +
  "&family=Dancing+Script:wght@500;700" +
  "&family=Inter:wght@300;400;500;600;700" +
  "&family=Great+Vibes" +
  "&family=Sacramento" +
  "&family=Allura" +
  "&display=swap";

let _inlinedCssPromise = null;
function getInlinedFontCSS() {
  if (_inlinedCssPromise) return _inlinedCssPromise;
  _inlinedCssPromise = (async () => {
    // Google Fonts negotiates by User-Agent — from a modern browser the
    // returned CSS already uses .woff2 URLs. We just need to rewrite each
    // url(https://…) to a data: URL.
    const cssText = await (await fetch(GOOGLE_FONTS_URL)).text();
    const urlRe = /url\((https?:\/\/[^)]+)\)/g;
    const seen = new Set();
    const tasks = [];
    let m;
    while ((m = urlRe.exec(cssText))) {
      const u = m[1];
      if (seen.has(u)) continue;
      seen.add(u);
      tasks.push((async () => {
        try {
          const buf = await (await fetch(u)).arrayBuffer();
          return [u, arrayBufferToBase64(buf), guessFontMime(u)];
        } catch (e) {
          console.warn("font fetch failed", u, e);
          return null;
        }
      })());
    }
    const map = new Map();
    for (const r of await Promise.all(tasks)) {
      if (r) map.set(r[0], `data:${r[2]};base64,${r[1]}`);
    }
    return cssText.replace(urlRe, (orig, u) => {
      const data = map.get(u);
      return data ? `url(${data})` : orig;
    });
  })().catch((e) => {
    // If fetching fails (offline, blocked), fall back to the @import and let
    // Chrome best-effort. Mark the cache so we don't keep retrying.
    console.warn("font inlining failed, falling back to @import", e);
    return `@import url('${GOOGLE_FONTS_URL}');`;
  });
  return _inlinedCssPromise;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function guessFontMime(u) {
  if (/\.woff2(?:\?|$)/i.test(u)) return "font/woff2";
  if (/\.woff(?:\?|$)/i.test(u))  return "font/woff";
  if (/\.ttf(?:\?|$)/i.test(u))   return "font/ttf";
  if (/\.otf(?:\?|$)/i.test(u))   return "font/otf";
  return "application/octet-stream";
}

async function ensureFontStyleInSvg(svgNode) {
  if (svgNode.querySelector("style[data-injected-fonts]")) return;
  const css = await getInlinedFontCSS();
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("data-injected-fonts", "1");
  style.textContent = css;
  svgNode.insertBefore(style, svgNode.firstChild);
}

// Compose: draw background PNG directly to canvas, then overlay a text-only
// SVG on top. Beats wrapping the background inside the SVG (which causes the
// browser's SVG rasterizer to soften the bitmap during the SVG → image trip).
//
// outputW = max(canvas.w * scale, bg native width), capped at 16000 to avoid
// OOM. Height follows the canvas aspect ratio. The text SVG is then drawn
// over the canvas at the same output size — text stays crisp at any scale,
// background stays at its own native sharpness.
export async function composeToPngBlob({ bgDataUrl, textSvgEl, canvas: cnv, scale = 1, bgRect = null } = {}) {
  const MAX_DIM = 16000;
  let bgImg = null;
  let bgW = cnv.w, bgH = cnv.h;
  if (bgDataUrl) {
    bgImg = new Image();
    await new Promise((res, rej) => {
      bgImg.onload = res;
      bgImg.onerror = (e) => rej(new Error("Background load failed: " + e));
      bgImg.src = bgDataUrl;
    });
    bgW = bgImg.naturalWidth || cnv.w;
    bgH = bgImg.naturalHeight || cnv.h;
  }

  let outW = Math.max(cnv.w * scale, bgW);
  const aspect = cnv.h / cnv.w;
  let outH = Math.round(outW * aspect);
  if (outW > MAX_DIM) {
    outW = MAX_DIM;
    outH = Math.round(outW * aspect);
  }
  if (outH > MAX_DIM) {
    outH = MAX_DIM;
    outW = Math.round(outH / aspect);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  if (bgImg) {
    // bgRect (in canvas units) lets the caller place the bg PNG inside a
    // larger output (e.g., tent-fold print layout puts the design in the
    // bottom half and leaves the top half white).
    const r = bgRect || { x: 0, y: 0, w: cnv.w, h: cnv.h };
    const sx = outW / cnv.w;
    const sy = outH / cnv.h;
    ctx.drawImage(bgImg, r.x * sx, r.y * sy, r.w * sx, r.h * sy);
  }

  // Text-only SVG → Image → drawn on top.
  const svgNode = textSvgEl.cloneNode(true);
  if (!svgNode.getAttribute("xmlns")) {
    svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  await ensureFontStyleInSvg(svgNode);
  const svgStr = new XMLSerializer().serializeToString(svgNode);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const svgImg = new Image();
    await new Promise((res, rej) => {
      svgImg.onload = res;
      svgImg.onerror = (e) => rej(new Error("Text SVG → image load failed: " + e));
      svgImg.src = svgUrl;
    });
    ctx.drawImage(svgImg, 0, 0, outW, outH);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  return await new Promise((res) => canvas.toBlob(res, "image/png", 1));
}

export async function composeToDownload({ bgDataUrl, textSvgEl, canvas: cnv, scale = 1, filename, bgRect = null }) {
  const blob = await composeToPngBlob({ bgDataUrl, textSvgEl, canvas: cnv, scale, bgRect });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : filename + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function svgToPngBlob(svgEl, { scale = 3 } = {}) {
  const svgNode = svgEl.cloneNode(true);
  const vb = svgNode.getAttribute("viewBox");
  let w, h;
  if (vb) {
    const [, , vw, vh] = vb.split(/\s+/).map(Number);
    w = vw;
    h = vh;
  } else {
    w = parseFloat(svgNode.getAttribute("width")) || svgEl.clientWidth;
    h = parseFloat(svgNode.getAttribute("height")) || svgEl.clientHeight;
  }
  if (!svgNode.getAttribute("xmlns")) {
    svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  await ensureFontStyleInSvg(svgNode);

  // Blob URL instead of data: URL — the inlined fonts push the SVG to several
  // MB and some browsers cap data: URL length.
  const svgStr = new XMLSerializer().serializeToString(svgNode);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = (e) => rej(new Error("SVG → image load failed: " + e));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, "image/png", 1));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadPng(svgEl, filename, opts) {
  const blob = await svgToPngBlob(svgEl, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : filename + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
