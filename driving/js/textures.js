// textures.js — every surface texture is generated on a 2D canvas at runtime.
// Keeps the project asset-free and instant to load.

import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas, repeat = true, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  return t;
}

function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (alpha !== undefined) d[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export function asphaltTexture() {
  const S = 512;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#4a4d51';
  x.fillRect(0, 0, S, S);
  // coarse aggregate
  for (let i = 0; i < 5200; i++) {
    const r = Math.random() * 2.2 + 0.4;
    const g = 40 + Math.random() * 60;
    x.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.35 + Math.random() * 0.5})`;
    x.beginPath();
    x.arc(Math.random() * S, Math.random() * S, r, 0, 7);
    x.fill();
  }
  // faint tyre polish bands
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `rgba(30,32,36,${0.03 + Math.random() * 0.05})`;
    x.fillRect(0, Math.random() * S, S, 8 + Math.random() * 40);
  }
  noise(x, S, S, 22);
  return finish(c);
}

export function concreteTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#b9b6ad';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const g = 150 + Math.random() * 60;
    x.fillStyle = `rgba(${g},${g - 3},${g - 10},0.35)`;
    x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  x.strokeStyle = 'rgba(120,118,110,0.55)';
  x.lineWidth = 2;
  for (let i = 0; i <= S; i += 64) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, S);
    x.stroke();
  }
  noise(x, S, S, 16);
  return finish(c);
}

export function grassTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#5d7a45';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const g = 60 + Math.random() * 70;
    x.fillStyle = `rgba(${g * 0.75},${g + 20},${g * 0.55},0.5)`;
    x.fillRect(Math.random() * S, Math.random() * S, 2, 3);
  }
  noise(x, S, S, 18);
  return finish(c);
}

export function dirtTexture() {
  const S = 256;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#8a7659';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const g = 110 + Math.random() * 60;
    x.fillStyle = `rgba(${g},${g * 0.86},${g * 0.66},0.4)`;
    x.beginPath();
    x.arc(Math.random() * S, Math.random() * S, Math.random() * 3, 0, 7);
    x.fill();
  }
  noise(x, S, S, 20);
  return finish(c);
}

// One facade atlas: 4 columns of different window styles, tiled by UV.
export function facadeTexture() {
  const W = 512,
    H = 512;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#8f8e8b';
  x.fillRect(0, 0, W, H);
  const cols = 8,
    rows = 8;
  const cw = W / cols,
    ch = H / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const px = i * cw,
        py = j * ch;
      x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
      x.fillRect(px, py, cw, ch);
      // window
      const lit = Math.random();
      const wx = px + cw * 0.18,
        wy = py + ch * 0.2,
        ww = cw * 0.64,
        wh = ch * 0.5;
      const g = x.createLinearGradient(wx, wy, wx, wy + wh);
      if (lit > 0.72) {
        g.addColorStop(0, '#ffe9b8');
        g.addColorStop(1, '#d8b775');
      } else {
        g.addColorStop(0, '#5d6f80');
        g.addColorStop(1, '#2c3a47');
      }
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      x.strokeStyle = 'rgba(35,35,38,0.75)';
      x.lineWidth = 2;
      x.strokeRect(wx, wy, ww, wh);
      x.beginPath();
      x.moveTo(wx + ww / 2, wy);
      x.lineTo(wx + ww / 2, wy + wh);
      x.stroke();
      // sill / slab band
      x.fillStyle = 'rgba(255,255,255,0.10)';
      x.fillRect(px, py + ch * 0.76, cw, ch * 0.08);
    }
  }
  noise(x, W, H, 12);
  return finish(c);
}

export function skyTexture(night = false) {
  const W = 1024,
    H = 512;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  if (night) {
    g.addColorStop(0.0, '#050914');
    g.addColorStop(0.45, '#0d1730');
    g.addColorStop(0.62, '#1d2a49');
    g.addColorStop(0.75, '#2b3350');
    g.addColorStop(1.0, '#10141f');
  } else {
    g.addColorStop(0.0, '#2f6bb5');
    g.addColorStop(0.4, '#7fb2e2');
    g.addColorStop(0.58, '#bcd7ee');
    g.addColorStop(0.72, '#dfe9f0');
    g.addColorStop(1.0, '#8d9aa2');
  }
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  if (night) {
    for (let i = 0; i < 700; i++) {
      const y = Math.random() * H * 0.62;
      x.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.75})`;
      x.fillRect(Math.random() * W, y, 1.4, 1.4);
    }
  } else {
    // soft cloud banding
    for (let i = 0; i < 40; i++) {
      const cy = Math.random() * H * 0.45;
      const cx = Math.random() * W;
      const rw = 60 + Math.random() * 220;
      const rh = 12 + Math.random() * 34;
      const grd = x.createRadialGradient(cx, cy, 0, cx, cy, rw);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.save();
      x.translate(cx, cy);
      x.scale(1, rh / rw);
      x.translate(-cx, -cy);
      x.beginPath();
      x.arc(cx, cy, rw, 0, 7);
      x.fill();
      x.restore();
    }
  }
  const t = finish(c, false, 1);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

export function tireTexture() {
  const W = 128,
    H = 128;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#1a1a1c';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#0f0f11';
  for (let i = 0; i < 12; i++) x.fillRect(0, (i * H) / 12, W, 4);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  x.fillRect(0, H * 0.42, W, 3);
  noise(x, W, H, 10);
  return finish(c);
}
