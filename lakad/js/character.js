// Chibi Karla in an anime-chibi style (flat painted colour, soft two-tone
// light, ink outlines, painted eyes, pointed hair strands) on a real bone
// hierarchy (THREE.Bone) with procedural idle / walk / sprint / jump.
// Her likeness comes from what the scan shows: dark shoulder-length hair with a
// centre part, glasses, her skin tone, black tee with a white script print,
// light grey pants, white sneakers. Units are metres, y up, facing +z.
import * as THREE from "three";
import { toon, outline, ribbon, canvasTex, frontMappedSphere } from "./style.js";

// scan medians, lifted into anime-friendly values
export const PALETTE = {
  skin: "#e0a988", skinShade: "#c98c6e",          // her warm tan
  hair: "#3d2f34", hairTip: "#2a1f25", hairShine: "#85707a",     // soft black: dark enough to read black, light enough to shade
  tee: "#2b2930", teePrint: "#f2eee8",
  pants: "#cfd2d3",
  shoe: "#fbfaf7", sole: "#f0b7c4",
  iris: "#2b1a17", irisLight: "#5e3d2e",          // very dark brown
  frame: "#d9d3d6",                               // thin clear/silver frames
  lips: "#d77f86",
};

const HEAD_R = 0.215;     // chibi: head ~45% of a ~1 m height
const HIP_Y = 0.27;

const M = {
  skin: toon(PALETTE.skin),
  tee: toon(PALETTE.tee),
  pants: toon(PALETTE.pants),
  shoe: toon(PALETTE.shoe),
  sole: toon(PALETTE.sole),
  frame: toon(PALETTE.frame),
};

function part(geo, material, parent, pos = [0, 0, 0], scale = [1, 1, 1], { ink = true, fine = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  if (ink) outline(m, fine);
  return m;
}

function bone(name, parent, pos) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(...pos);
  parent.add(b);
  return b;
}

// capsule hanging down from a bone along -y
const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14).translate(0, -len / 2, 0);

export class Character {
  constructor() {
    this.root = new THREE.Group();      // world position + facing
    this.body = new THREE.Group();      // squash & stretch
    this.root.add(this.body);
    const B = (this.bones = {});

    B.hips = bone("hips", this.body, [0, HIP_Y, 0]);
    B.spine = bone("spine", B.hips, [0, 0.06, 0]);
    B.chest = bone("chest", B.spine, [0, 0.1, 0]);
    B.neck = bone("neck", B.chest, [0, 0.075, 0]);
    B.head = bone("head", B.neck, [0, 0.025, 0]);
    B.hair = bone("hair", B.head, [0, HEAD_R * 1.2, -HEAD_R * 0.45]);

    for (const [s, x] of [["L", 1], ["R", -1]]) {
      B["upperArm" + s] = bone("upperArm" + s, B.chest, [0.105 * x, 0.04, 0]);
      B["foreArm" + s] = bone("foreArm" + s, B["upperArm" + s], [0, -0.095, 0]);
      B["hand" + s] = bone("hand" + s, B["foreArm" + s], [0, -0.085, 0]);
      B["thigh" + s] = bone("thigh" + s, B.hips, [0.055 * x, -0.025, 0]);
      B["shin" + s] = bone("shin" + s, B["thigh" + s], [0, -0.115, 0]);
      B["foot" + s] = bone("foot" + s, B["shin" + s], [0, -0.105, 0]);
    }
    this.skeleton = new THREE.Skeleton(Object.values(B));
    this.rest = Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b.position.clone()]));

    // --- body: slender, black tee with her white script print, light pants ---
    part(new THREE.CylinderGeometry(0.085, 0.1, 0.09, 24), M.pants, B.hips, [0, 0.0, 0], [1, 1, 0.8]);
    const teeMat = toon("#ffffff", { map: teeTexture() });
    const torso = new THREE.LatheGeometry(
      [[0.0, -0.035], [0.098, -0.035], [0.104, 0.0], [0.1, 0.06], [0.094, 0.11], [0.07, 0.15], [0.03, 0.165], [0.0, 0.166]]
        .map(([r, y]) => new THREE.Vector2(r, y)), 28);
    planarFront(torso, 0.11, 0.07);
    part(torso, teeMat, B.spine, [0, 0.01, 0], [1, 1, 0.78]);
    part(new THREE.CylinderGeometry(0.03, 0.034, 0.06, 14), M.skin, B.neck, [0, 0.015, 0], [1, 1, 1], { fine: true });

    for (const [s, x] of [["L", 1], ["R", -1]]) {
      part(new THREE.SphereGeometry(0.04, 18, 12), M.tee, B["upperArm" + s], [0.004 * x, -0.022, 0], [1, 1.2, 1]);
      part(limb(0.024, 0.065), M.skin, B["upperArm" + s], [0, -0.03, 0], [1, 1, 1], { fine: true });
      part(limb(0.022, 0.06), M.skin, B["foreArm" + s], [0, 0, 0], [1, 1, 1], { fine: true });
      part(new THREE.SphereGeometry(0.03, 16, 12), M.skin, B["hand" + s], [0, -0.01, 0.003], [0.9, 1.05, 0.75], { fine: true });
      part(limb(0.04, 0.07), M.pants, B["thigh" + s], [0, 0, 0]);
      part(limb(0.037, 0.06), M.pants, B["shin" + s], [0, 0, 0]);
      part(new THREE.SphereGeometry(0.04, 18, 12), M.shoe, B["foot" + s], [0, -0.004, 0.02], [1, 0.72, 1.5]);
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 18), M.sole, B["foot" + s], [0, -0.03, 0.02], [1, 1, 1.5], { ink: false });
    }

    // --- head: painted face on the front (unlit, so the eyes stay crisp) -----
    this.faceMat = new THREE.MeshBasicMaterial({ map: FACE_OPEN });
    this.headMesh = part(frontMappedSphere(HEAD_R, 64, 48), this.faceMat, B.head, [0, HEAD_R * 0.94, 0.0], [1.1, 0.95, 0.98]);
    const H = new THREE.Group();
    H.position.copy(this.headMesh.position);
    B.head.add(H);
    this.buildHair(H, B.hair);
    this.buildGlasses(H);

    this.helper = new THREE.SkeletonHelper(this.body);
    this.helper.visible = false;

    // animation state
    this.t = 0;
    this.phase = 0;
    this.w = { idle: 1, walk: 0, run: 0, air: 0 };
    this.squash = 0;   // + = squashed (landing), - = stretched (take-off)
    this.squashV = 0;
    this.hairSwing = 0;
    this.hairV = 0;
    this.blink = 0;
    this.nextBlink = 2;
  }

  // Her hair, as the scan shows it: black, sleek and flat on top with a centre
  // part, curtained over the temples, falling straight past the jaw to the
  // shoulders with softly flipped ends. A snug cap carries the part and the
  // hairline; smooth panels (not spikes) hang round the sides and back.
  buildHair(H, hairBone) {
    const R = HEAD_R;
    const hairMat = toon("#ffffff", { vertexColors: true });
    const shade = (g, top, bottom) => {   // painted gradient: sheen near the crown, darker ends
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      const A = new THREE.Color(PALETTE.hairShine), Bc = new THREE.Color(PALETTE.hair), C = new THREE.Color(PALETTE.hairTip);
      for (let i = 0; i < p.count; i++) {
        const t = THREE.MathUtils.clamp((top - p.getY(i)) / (top - bottom), 0, 1);
        // a sheen band a little below the crown, the anime "angel ring"
        const ring = Math.exp(-(((t - 0.16) / 0.05) ** 2)) * 0.8;
        const col = Bc.clone().lerp(C, t).lerp(A, ring);
        c.set([col.r, col.g, col.b], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      return g;
    };

    const cap = frontMappedSphere(R * 1.035, 64, 48);
    shade(cap, R * 1.05, -R * 1.6);
    const capMat = toon("#ffffff", { vertexColors: true, alphaMap: hairMask(), alphaTest: 0.5, side: THREE.DoubleSide });
    part(cap, capMat, H, [0, 0, 0], [1.1, 0.97, 1.0]);

    // a point on the head at azimuth a (0 = front, + = her left) and elevation e
    const on = (a, e, r = 1.08) => [Math.sin(a) * Math.cos(e) * R * r * 1.12, Math.sin(e) * R * r, Math.cos(a) * Math.cos(e) * R * r];
    const panel = (a, len, width, flip, parent = H, e0 = 1.15) => {
      const [x1, y1, z1] = on(a, 0.25), [x2, y2, z2] = on(a, -0.45, 1.09);
      const pts = [on(a, e0, 1.02), on(a, 0.75), [x1, y1, z1], [x2, y2, z2],
        [x2 * 1.02, -R * (len - 0.45), z2 * 1.0],
        [x2 * (1.02 + flip), -R * len, z2 * (1.0 + flip * 0.6)]];
      const g = ribbon(pts, [Math.cos(a), 0, -Math.sin(a)], width, R * 0.075);
      return part(shade(g, R * 1.05, -R * 1.6), hairMat, parent, [0, 0, 0], [1, 1, 1], { fine: true });
    };
    // curtain over each temple, then the side and back fall
    for (const sd of [1, -1]) {
      panel(sd * 0.98, 1.15, R * 0.26, 0.16, H, 1.3);     // the curtain, framing the face
      panel(sd * 1.25, 1.3, R * 0.34, 0.15);
      panel(sd * 1.6, 1.35, R * 0.38, 0.12);
      panel(sd * 2.0, 1.38, R * 0.42, 0.1);
      panel(sd * 2.5, 1.38, R * 0.42, 0.07);
    }
    panel(Math.PI, 1.38, R * 0.44, 0.06);
  }
  }

  // big round lenses in thin clear/silver frames, as in the scan, with glare
  buildGlasses(H) {
    const R = HEAD_R, g = new THREE.Group();
    const lensMat = new THREE.MeshBasicMaterial({ map: glare(), transparent: true, depthWrite: false });
    for (const side of [1, -1]) {
      const pos = [side * R * 0.385, -R * 0.21, R * 1.0];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.25, R * 0.014, 8, 48), M.frame);
      ring.position.set(...pos);
      ring.rotation.y = side * 0.25;
      g.add(outline(ring, true));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(R * 0.245, 40), lensMat);
      lens.position.set(...pos);
      lens.rotation.y = side * 0.25;
      g.add(lens);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.011, R * 0.011, R * 0.8, 6), M.frame);
      arm.rotation.x = Math.PI / 2;
      arm.rotation.y = side * 0.38;
      arm.position.set(side * R * 0.82, -R * 0.15, R * 0.62);
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(R * 0.07, R * 0.012, 6, 14, Math.PI), M.frame);
    bridge.position.set(0, -R * 0.15, R * 1.06);
    g.add(bridge);
    H.add(g);
  }

  /** speed: horizontal m/s; grounded; vy: vertical m/s; sprint: bool */
  update(dt, { speed, grounded, vy, sprinting, turn }) {
    this.t += dt;
    // blink every few seconds
    if (this.t > this.nextBlink) { this.blink = 0.14; this.nextBlink = this.t + 2.5 + Math.random() * 3; }
    this.blink -= dt;
    const face = this.blink > 0 ? FACE_BLINK : FACE_OPEN;
    if (this.faceMat.map !== face) this.faceMat.map = face;
    const target = { idle: 0, walk: 0, run: 0, air: 0 };
    if (!grounded) target.air = 1;
    else if (speed < 0.15) target.idle = 1;
    else if (sprinting && speed > 2.2) target.run = 1;
    else target.walk = 1;
    const k = 1 - Math.exp(-dt * 10);
    let sum = 0;
    for (const s in this.w) { this.w[s] += (target[s] - this.w[s]) * k; sum += this.w[s]; }
    for (const s in this.w) this.w[s] /= sum;

    // stride: walk cycle covers 0.42 m, run 0.95 m -> feet stay planted-ish
    const stride = 0.42 + 0.53 * this.w.run;
    this.phase += (speed * dt / stride) * Math.PI * 2;

    const poses = [
      [this.w.idle, poseIdle(this.t)],
      [this.w.walk, poseWalk(this.phase, 1)],
      [this.w.run, poseRun(this.phase)],
      [this.w.air, poseAir(vy)],
    ];
    const B = this.bones;
    for (const name in B) B[name].rotation.set(0, 0, 0);
    let hipY = 0;
    for (const [w, p] of poses) {
      if (w < 1e-3) continue;
      hipY += (p.hipY ?? 0) * w;
      for (const name in p.rot) {
        const r = p.rot[name];
        B[name].rotation.x += (r[0] ?? 0) * w;
        B[name].rotation.y += (r[1] ?? 0) * w;
        B[name].rotation.z += (r[2] ?? 0) * w;
      }
    }
    B.hips.position.y = this.rest.hips.y + hipY;
    // lean into turns
    B.spine.rotation.z += THREE.MathUtils.clamp(-turn * 0.06, -0.25, 0.25) * (speed / 4);

    // squash & stretch spring
    const a = -120 * this.squash - 14 * this.squashV;
    this.squashV += a * dt;
    this.squash += this.squashV * dt;
    const s = THREE.MathUtils.clamp(this.squash, -0.25, 0.3);
    this.body.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);

    // hair trails behind motion, springy
    const want = -0.25 * speed / 4 - (grounded ? 0 : THREE.MathUtils.clamp(vy * 0.05, -0.3, 0.3));
    this.hairV += ((want - this.hairSwing) * 90 - this.hairV * 9) * dt;
    this.hairSwing += this.hairV * dt;
    B.hair.rotation.x -= this.hairSwing;
  }

  land(impact) { this.squashV += Math.min(impact, 12) * 0.35; }
  takeoff() { this.squashV -= 2.6; }
}

// ---- painted textures ---------------------------------------------------------

// planar UVs on the front of a lathe/torso: u from x, v from y
function planarFront(g, halfW, cy) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) uv.setXY(i, 0.02, 0.98);   // back: plain tee
    else uv.setXY(i, 0.5 + p.getX(i) / (2 * halfW), 0.5 + (p.getY(i) - cy) / (2 * halfW));
  }
}

function teeTexture() {
  return canvasTex(256, (g, S, X, Y) => {
    g.fillStyle = PALETTE.tee;
    g.fillRect(0, 0, S, S);
    // her tee's white handwritten print across the chest
    g.strokeStyle = PALETTE.teePrint;
    g.lineWidth = 5;
    g.lineCap = g.lineJoin = "round";
    g.beginPath();
    const y0 = Y(0.5);
    g.moveTo(X(0.3), y0);
    for (let i = 0; i <= 40; i++) {
      const u = 0.3 + 0.4 * (i / 40);
      g.lineTo(X(u), y0 - Math.sin(i * 0.9) * 10 - (i % 9 === 4 ? 8 : 0));
    }
    g.stroke();
    // soft fold shading at the hem
    const gr = g.createLinearGradient(0, Y(0.2), 0, Y(0.0));
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(0,0,0,.25)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  });
}

// Her face, painted into the head's planar front UVs: a round full face, gentle
// almond eyes with a soft lower lid (her smiling eyes), very dark irises,
// natural brows, full soft pink lips in a closed smile, a hint of blush.
function paintFace(closed = false) {
  return canvasTex(1024, (g, S, X, Y) => {
    g.fillStyle = PALETTE.skin;
    g.fillRect(0, 0, S, S);
    // soft shade under the hairline and along the jaw
    const sh = g.createLinearGradient(0, Y(0.8), 0, Y(0.6));
    sh.addColorStop(0, "rgba(170,100,80,.45)"); sh.addColorStop(1, "rgba(170,100,80,0)");
    g.fillStyle = sh; g.fillRect(0, 0, S, Y(0.55));

    const EY = 0.395, EX = 0.175, EW = 0.085, EH = 0.066;
    const ink = "#2a1d20";
    for (const side of [-1, 1]) {
      const cx = X(0.5 + side * EX), cy = Y(EY);
      // brows: natural, soft, slightly straight
      g.strokeStyle = "#3b2a2a"; g.lineWidth = S * 0.011; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx - side * S * 0.06, Y(EY + 0.12)); g.quadraticCurveTo(cx + side * S * 0.005, Y(EY + 0.138), cx + side * S * 0.07, Y(EY + 0.118)); g.stroke();
      if (closed) {
        g.strokeStyle = ink; g.lineWidth = S * 0.01;
        g.beginPath(); g.arc(cx, cy - S * 0.03, S * EW, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      } else {
        // almond eye: white, then iris clipped by the lids
        g.save();
        g.beginPath();
        g.moveTo(cx - S * EW, cy);
        g.quadraticCurveTo(cx - side * S * 0.01, cy - S * EH * 1.55, cx + S * EW, cy - side * S * 0.0);
        g.quadraticCurveTo(cx, cy + S * EH * 0.75, cx - S * EW, cy);
        g.closePath();
        g.fillStyle = "#fbf6f2"; g.fill();
        g.clip();
        const ir = g.createLinearGradient(0, cy - S * EH, 0, cy + S * EH * 0.6);
        ir.addColorStop(0, "#120a0b"); ir.addColorStop(0.55, PALETTE.iris); ir.addColorStop(1, PALETTE.irisLight);
        g.fillStyle = ir;
        g.beginPath(); g.arc(cx, cy - S * 0.008, S * EH * 0.95, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(255,255,255,.95)";
        g.beginPath(); g.arc(cx - side * S * 0.014, cy - S * 0.026, S * 0.012, 0, Math.PI * 2); g.fill();
        g.restore();
        // upper lid line, thicker toward the outer corner
        g.strokeStyle = ink; g.lineWidth = S * 0.012;
        g.beginPath();
        g.moveTo(cx - S * EW * 1.02, cy + S * 0.002);
        g.quadraticCurveTo(cx - side * S * 0.01, cy - S * EH * 1.6, cx + S * EW * 1.05, cy - S * 0.004);
        g.stroke();
        // soft lower lid, lifted: the smile in her eyes
        g.strokeStyle = "rgba(120,70,60,.55)"; g.lineWidth = S * 0.005;
        g.beginPath(); g.moveTo(cx - S * EW * 0.8, cy + S * 0.012); g.quadraticCurveTo(cx, cy + S * EH * 0.85, cx + S * EW * 0.8, cy + S * 0.012); g.stroke();
      }
      // a hint of blush on the full cheeks
      const bx = X(0.5 + side * 0.23), by = Y(0.28);
      const bl = g.createRadialGradient(bx, by, 0, bx, by, S * 0.08);
      bl.addColorStop(0, "rgba(232,120,120,.32)"); bl.addColorStop(1, "rgba(232,120,120,0)");
      g.fillStyle = bl; g.beginPath(); g.arc(bx, by, S * 0.08, 0, Math.PI * 2); g.fill();
    }
    // nose: soft shadow on one side + a tiny tip
    g.strokeStyle = "rgba(165,95,75,.7)"; g.lineWidth = S * 0.006; g.lineCap = "round";
    g.beginPath(); g.moveTo(X(0.512), Y(0.3)); g.quadraticCurveTo(X(0.5), Y(0.285), X(0.488), Y(0.288)); g.stroke();
    // full soft lips, closed smile
    const lx = X(0.5), ly = Y(0.215), lw = S * 0.06;
    g.fillStyle = PALETTE.lips;
    g.beginPath();
    g.moveTo(lx - lw, ly);
    g.quadraticCurveTo(lx - lw * 0.5, ly - S * 0.02, lx, ly - S * 0.012);
    g.quadraticCurveTo(lx + lw * 0.5, ly - S * 0.02, lx + lw, ly);
    g.quadraticCurveTo(lx, ly + S * 0.04, lx - lw, ly);
    g.fill();
    g.strokeStyle = "#9c4f55"; g.lineWidth = S * 0.005;
    g.beginPath(); g.moveTo(lx - lw * 0.95, ly - S * 0.001); g.quadraticCurveTo(lx, ly + S * 0.008, lx + lw * 0.95, ly - S * 0.001); g.stroke();
    g.fillStyle = "rgba(255,255,255,.35)";
    g.beginPath(); g.ellipse(lx + S * 0.012, ly + S * 0.011, S * 0.012, S * 0.004, 0, 0, Math.PI * 2); g.fill();
  });
}

// lens glare: two soft diagonal streaks, like the glare in her scan
function glare() {
  return canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.fillStyle = "rgba(220,235,255,.12)";
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineCap = "round";
    g.lineWidth = S * 0.09; g.beginPath(); g.moveTo(S * 0.25, S * 0.45); g.lineTo(S * 0.48, S * 0.22); g.stroke();
    g.lineWidth = S * 0.04; g.beginPath(); g.moveTo(S * 0.36, S * 0.6); g.lineTo(S * 0.6, S * 0.36); g.stroke();
  });
}
const FACE_OPEN = paintFace(false);
const FACE_BLINK = paintFace(true);

// Hair cap alpha: white = hair. The face window's top edge is her hairline:
// high at the centre part, curtained down over the temples. A thin line from
// the window up over the crown leaves the part showing.
function hairMask() {
  return canvasTex(512, (g, S, X, Y) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, S, S);
    g.fillStyle = "#000";
    g.beginPath();
    g.moveTo(X(0.5), Y(0.8));
    g.bezierCurveTo(X(0.38), Y(0.79), X(0.22), Y(0.72), X(0.19), Y(0.5));
    g.bezierCurveTo(X(0.16), Y(0.3), X(0.2), Y(0.05), X(0.26), Y(-0.1));
    g.lineTo(X(0.74), Y(-0.1));
    g.bezierCurveTo(X(0.8), Y(0.05), X(0.84), Y(0.3), X(0.81), Y(0.5));
    g.bezierCurveTo(X(0.78), Y(0.72), X(0.62), Y(0.79), X(0.5), Y(0.8));
    g.fill();
    // the part
    g.lineWidth = S * 0.012;
    g.strokeStyle = "#000";
    g.beginPath(); g.moveTo(X(0.5), Y(0.79)); g.lineTo(X(0.5), Y(0.975)); g.stroke();   // stops short of the top row the back half samples
  });
}

// ---- poses: rotations in radians per bone, [x, y, z] -----------------------
// Leg/arm sign convention: limbs hang along -y, so +x swings the far end BACK.

function poseIdle(t) {
  const br = Math.sin(t * 2.4);
  const look = Math.sin(t * 0.45) * 0.18 + Math.sin(t * 0.17) * 0.1;
  return {
    hipY: br * 0.004,
    rot: {
      hips: [0, 0, Math.sin(t * 1.1) * 0.025],
      spine: [0.02 * br, 0, -Math.sin(t * 1.1) * 0.02],
      chest: [0.025 * br, 0, 0],
      head: [0.04 * Math.sin(t * 0.9), look, Math.sin(t * 0.7) * 0.06],
      upperArmL: [0.05 * br, 0, 0.14 + 0.02 * br],
      upperArmR: [0.05 * br, 0, -0.14 - 0.02 * br],
      foreArmL: [-0.15, 0, 0],
      foreArmR: [-0.15, 0, 0],
      thighL: [0, 0, 0.03], thighR: [0, 0, -0.03],
    },
  };
}

function poseWalk(ph, amp) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const knee = (x) => 0.1 + 0.95 * Math.max(0, x) ** 1.4;
  return {
    hipY: 0.022 * (Math.abs(c) - 0.6),        // bounce twice per cycle
    rot: {
      hips: [0, 0.14 * s, 0.07 * s],          // waddle
      spine: [0.06, -0.08 * s, -0.06 * s],
      chest: [0, -0.06 * s, 0],
      head: [-0.04, 0.05 * s, 0.07 * s],      // bobble
      thighL: [-0.62 * amp * s, 0, 0.02], thighR: [0.62 * amp * s, 0, -0.02],
      shinL: [knee(c), 0, 0], shinR: [knee(-c), 0, 0],
      footL: [-0.25 * Math.max(0, -c), 0, 0], footR: [-0.25 * Math.max(0, c), 0, 0],
      upperArmL: [0.55 * s, 0, 0.18], upperArmR: [-0.55 * s, 0, -0.18],
      foreArmL: [-0.35 - 0.2 * Math.max(0, -s), 0, 0], foreArmR: [-0.35 - 0.2 * Math.max(0, s), 0, 0],
    },
  };
}

function poseRun(ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  const knee = (x) => 0.2 + 1.7 * Math.max(0, x) ** 1.2;
  return {
    hipY: 0.05 * (Math.abs(c) - 0.5),
    rot: {
      hips: [0, 0.2 * s, 0.05 * s],
      spine: [0.3, -0.15 * s, 0],
      chest: [0.05, -0.12 * s, 0],
      head: [-0.3, 0.06 * s, 0.05 * s],      // keep looking ahead while leaning
      thighL: [-1.05 * s - 0.15, 0, 0.03], thighR: [1.05 * s - 0.15, 0, -0.03],
      shinL: [knee(c), 0, 0], shinR: [knee(-c), 0, 0],
      footL: [0.2 * s, 0, 0], footR: [-0.2 * s, 0, 0],
      upperArmL: [1.1 * s, 0, 0.3], upperArmR: [-1.1 * s, 0, -0.3],
      foreArmL: [-1.3, 0, 0], foreArmR: [-1.3, 0, 0],
    },
  };
}

function poseAir(vy) {
  const up = THREE.MathUtils.clamp(vy / 5, -1, 1);   // +1 rising, -1 falling
  const tuck = 0.5 + 0.5 * up;
  return {
    hipY: 0.02,
    rot: {
      spine: [0.08 * tuck, 0, 0],
      head: [0.12 * up, 0, 0],
      thighL: [-0.9 * tuck - 0.1, 0, 0.08], thighR: [-0.35 * tuck, 0, -0.12],
      shinL: [1.3 * tuck + 0.15, 0, 0], shinR: [0.7 * tuck + 0.25, 0, 0],
      upperArmL: [-0.3, 0, 1.2 + 0.9 * up], upperArmR: [-0.3, 0, -1.2 - 0.9 * up],
      foreArmL: [-0.4, 0, 0.3], foreArmR: [-0.4, 0, -0.3],
    },
  };
}
