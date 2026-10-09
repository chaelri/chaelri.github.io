// Chibi Karla in an anime-chibi style (flat painted colour, soft two-tone
// light, ink outlines, painted eyes, pointed hair strands) on a real bone
// hierarchy (THREE.Bone) with procedural idle / walk / sprint / jump.
// Her likeness comes from what the scan shows: dark shoulder-length hair with a
// centre part, glasses, her skin tone, black tee with a white script print,
// light grey pants, white sneakers. Units are metres, y up, facing +z.
import * as THREE from "three";
import { toon, outline, strand, canvasTex, frontMappedSphere } from "./style.js";

// scan medians, lifted into anime-friendly values
export const PALETTE = {
  skin: "#ecbc9b", skinShade: "#d4977a",
  hair: "#33252a", hairTip: "#1f1619", hairShine: "#6e5554",
  tee: "#2b2930", teePrint: "#f2eee8",
  pants: "#cfd2d3",
  shoe: "#fbfaf7", sole: "#f0b7c4",
  iris: "#5a3426", irisLight: "#a8724f",
  frame: "#5b4a4e",
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
    this.headMesh = part(frontMappedSphere(HEAD_R, 64, 48), this.faceMat, B.head, [0, HEAD_R * 0.96, 0.0], [1.04, 0.95, 0.96]);
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

  // Dark shoulder-length cut with a centre part, built from pointed strands
  // the way the reference's hair is: a crown cap, side-swept bangs that split
  // at the part, cheek-framing locks, and a back fall on a springy bone.
  buildHair(H, hairBone) {
    const R = HEAD_R;
    const hairMat = toon("#ffffff", { vertexColors: true });
    const shade = (g, top, bottom) => {   // painted gradient: lighter crown, darker tips
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      const A = new THREE.Color(PALETTE.hairShine), Bc = new THREE.Color(PALETTE.hair), C = new THREE.Color(PALETTE.hairTip);
      for (let i = 0; i < p.count; i++) {
        const t = THREE.MathUtils.clamp((top - p.getY(i)) / (top - bottom), 0, 1);
        const col = t < 0.25 ? A.clone().lerp(Bc, t / 0.25) : Bc.clone().lerp(C, (t - 0.25) / 0.75);
        c.set([col.r, col.g, col.b], i * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      return g;
    };

    // cap: sphere over crown and back, the face window cut by an alpha mask
    const cap = frontMappedSphere(R * 1.07, 56, 40);
    shade(cap, R * 1.1, -R * 0.6);
    const capMat = toon("#ffffff", { vertexColors: true, alphaMap: hairMask(), alphaTest: 0.5, side: THREE.DoubleSide });
    part(cap, capMat, H, [0, 0, 0], [1.03, 1.0, 1.0]);

    const add = (pts, w, th, parent = H) => part(shade(strand(pts, w, th), R * 1.1, -R * 1.9), hairMat, parent, [0, 0, 0], [1, 1, 1], { fine: true });
    // curtain bangs: her centre part, swept out over the temples to the cheeks
    for (const side of [1, -1]) {
      add([[side * R * 0.03, R * 1.06, R * 0.22], [side * R * 0.3, R * 0.86, R * 0.86], [side * R * 0.62, R * 0.45, R * 0.99], [side * R * 0.8, -R * 0.02, R * 0.86]], R * 0.3, R * 0.07);
      add([[side * R * 0.05, R * 1.06, R * 0.02], [side * R * 0.45, R * 0.92, R * 0.7], [side * R * 0.84, R * 0.35, R * 0.82], [side * R * 0.93, -R * 0.32, R * 0.7]], R * 0.32, R * 0.08);
      add([[side * R * 0.02, R * 1.02, R * 0.4], [side * R * 0.18, R * 0.8, R * 0.95], [side * R * 0.42, R * 0.56, R * 1.05]], R * 0.2, R * 0.05);
    }
    // framing locks down past the cheeks to the jaw
    for (const side of [1, -1]) {
      add([[side * R * 0.7, R * 0.8, R * 0.45], [side * R * 1.0, R * 0.2, R * 0.6], [side * R * 1.0, -R * 0.45, R * 0.52], [side * R * 0.9, -R * 0.95, R * 0.42]], R * 0.26, R * 0.08);
      add([[side * R * 0.85, R * 0.6, R * 0.1], [side * R * 1.1, -R * 0.1, R * 0.25], [side * R * 1.08, -R * 0.85, R * 0.18]], R * 0.32, R * 0.1);
      add([[side * R * 0.85, R * 0.6, -R * 0.2], [side * R * 1.1, -R * 0.1, -R * 0.15], [side * R * 1.08, -R * 1.0, -R * 0.2]], R * 0.32, R * 0.1);
      add([[side * R * 0.8, R * 0.7, R * 0.3], [side * R * 1.06, R * 0.0, R * 0.42], [side * R * 1.04, -R * 0.7, R * 0.34]], R * 0.3, R * 0.09);
    }
    // back fall: a fan of strands round the back of the head to the shoulders
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (0.18 + 0.64 * (i / 8));          // around the back
      const x = Math.cos(a) * R, z = -Math.sin(a) * R;
      const len = 1.55 + 0.12 * Math.sin(i * 1.7);
      add([[x * 0.6, R * 0.9, z * 0.6], [x * 1.08, R * 0.1, z * 1.08], [x * 1.12, -R * (len - 0.6), z * 1.05], [x * 1.18, -R * len, z * 0.98]],
        R * 0.42, R * 0.1, H);
    }
    // a couple of strands on the springy bone, so the ends swish
    for (const x of [-0.5, 0, 0.5]) {
      part(shade(strand([[x * HEAD_R, 0, 0], [x * HEAD_R * 1.1, -R * 1.0, -R * 0.12], [x * HEAD_R * 1.15, -R * 1.9, -R * 0.08]], R * 0.32, R * 0.08), 0, -R * 1.9),
        hairMat, hairBone, [0, 0, 0], [1, 1, 1], { fine: true });
    }
    // her small flyaway at the crown (the cute ahoge)
    add([[0, R * 1.05, R * 0.05], [R * 0.05, R * 1.32, R * 0.15], [R * 0.2, R * 1.38, R * 0.32]], R * 0.07, R * 0.025);
  }

  // thin round frames, as in the scan
  buildGlasses(H) {
    const R = HEAD_R, g = new THREE.Group();
    for (const side of [1, -1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.016, 8, 36), M.frame);
      ring.position.set(side * R * 0.33, -R * 0.2, R * 0.97);
      ring.rotation.y = side * 0.22;
      ring.scale.set(1.08, 0.92, 1);
      g.add(ring);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.012, R * 0.012, R * 0.75, 6), M.frame);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * R * 0.62, -R * 0.14, R * 0.62);
      arm.rotation.z = 0;
      arm.rotation.y = side * 0.45;
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(R * 0.06, R * 0.012, 6, 12, Math.PI), M.frame);
    bridge.position.set(0, -R * 0.16, R * 1.02);
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

// Anime face painted into the head's planar front UVs.
// Big warm-brown eyes low on the face, white highlights, a thick upper lash
// line, short brows, blush with hatching, a small smile.
function paintFace(closed = false) {
  return canvasTex(1024, (g, S, X, Y) => {
    g.fillStyle = PALETTE.skin;
    g.fillRect(0, 0, S, S);
    // soft shadow under the bangs
    const sh = g.createLinearGradient(0, Y(0.78), 0, Y(0.55));
    sh.addColorStop(0, "rgba(200,120,100,.55)");
    sh.addColorStop(1, "rgba(200,120,100,0)");
    g.fillStyle = sh;
    g.fillRect(0, 0, S, Y(0.5));

    const EY = 0.4, EX = 0.165, EW = 0.085, EH = 0.105;
    for (const side of [-1, 1]) {
      const cx = X(0.5 + side * EX), cy = Y(EY);
      if (closed) {
        g.strokeStyle = "#2b1f26"; g.lineWidth = S * 0.011; g.lineCap = "round";
        g.beginPath(); g.arc(cx, cy - S * 0.02, S * EW * 0.9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else {
        // white of the eye
        g.fillStyle = "#fffaf6";
        g.beginPath(); g.ellipse(cx, cy, S * EW, S * EH, 0, 0, Math.PI * 2); g.fill();
        // iris: dark top, warm brown bottom
        const ir = g.createLinearGradient(0, cy - S * EH, 0, cy + S * EH);
        ir.addColorStop(0, "#26161a"); ir.addColorStop(0.45, PALETTE.iris); ir.addColorStop(1, PALETTE.irisLight);
        g.fillStyle = ir;
        g.beginPath(); g.ellipse(cx, cy + S * 0.006, S * EW * 0.78, S * EH * 0.92, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#1c1014";
        g.beginPath(); g.ellipse(cx, cy + S * 0.004, S * EW * 0.36, S * EH * 0.45, 0, 0, Math.PI * 2); g.fill();
        // highlights
        g.fillStyle = "#ffffff";
        g.beginPath(); g.ellipse(cx - side * S * 0.026, cy - S * 0.038, S * 0.024, S * 0.03, -0.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(cx + side * S * 0.028, cy + S * 0.042, S * 0.011, 0, Math.PI * 2); g.fill();
        // thick upper lash line with a little flick outward
        g.strokeStyle = "#2b1f26"; g.lineCap = "round"; g.lineWidth = S * 0.016;
        g.beginPath();
        g.ellipse(cx, cy + S * 0.012, S * EW * 1.04, S * EH * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
        g.lineWidth = S * 0.01;
        g.beginPath(); g.moveTo(cx + side * S * EW * 0.95, cy - S * EH * 0.62); g.lineTo(cx + side * S * EW * 1.3, cy - S * EH * 0.9); g.stroke();
        // lower lid hint
        g.lineWidth = S * 0.005; g.strokeStyle = "rgba(90,52,38,.7)";
        g.beginPath(); g.arc(cx, cy - S * 0.01, S * EW * 0.95, 0.3 * Math.PI, 0.7 * Math.PI); g.stroke();
      }
      // brows
      g.strokeStyle = "#4a3433"; g.lineWidth = S * 0.007;
      g.beginPath(); g.moveTo(cx - side * S * 0.05, Y(EY + 0.15)); g.quadraticCurveTo(cx, Y(EY + 0.175), cx + side * S * 0.06, Y(EY + 0.155)); g.stroke();
      // blush + hatching
      const bl = g.createRadialGradient(X(0.5 + side * 0.21), Y(0.27), 0, X(0.5 + side * 0.21), Y(0.27), S * 0.075);
      bl.addColorStop(0, "rgba(245,130,140,.55)"); bl.addColorStop(1, "rgba(245,130,140,0)");
      g.fillStyle = bl;
      g.beginPath(); g.ellipse(X(0.5 + side * 0.21), Y(0.27), S * 0.08, S * 0.045, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(220,90,100,.55)"; g.lineWidth = S * 0.004;
      for (let i = -1; i <= 1; i++) {
        const bx = X(0.5 + side * 0.21) + i * S * 0.022;
        g.beginPath(); g.moveTo(bx - S * 0.008, Y(0.255)); g.lineTo(bx + S * 0.008, Y(0.285)); g.stroke();
      }
    }
    // nose: a tiny warm tick
    g.strokeStyle = "rgba(190,110,90,.8)"; g.lineWidth = S * 0.005;
    g.beginPath(); g.moveTo(X(0.505), Y(0.29)); g.lineTo(X(0.497), Y(0.276)); g.stroke();
    // small smile
    g.strokeStyle = "#7a3a3e"; g.lineWidth = S * 0.007; g.lineCap = "round";
    g.beginPath(); g.arc(X(0.5), Y(0.235), S * 0.028, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
  });
}
const FACE_OPEN = paintFace(false);
const FACE_BLINK = paintFace(true);

// Hair cap alpha: white = hair. Black = the face window (the strands drawn
// on top supply the bangs and the framing, so this is a plain soft oval).
function hairMask() {
  return canvasTex(256, (g, S, X, Y) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, S, S);
    g.fillStyle = "#000";
    g.beginPath();
    g.moveTo(X(0.24), Y(0.55));
    g.bezierCurveTo(X(0.3), Y(0.8), X(0.7), Y(0.8), X(0.76), Y(0.55));
    g.bezierCurveTo(X(0.82), Y(0.25), X(0.78), Y(0.0), X(0.74), Y(-0.1));
    g.lineTo(X(0.26), Y(-0.1));
    g.bezierCurveTo(X(0.22), Y(0.0), X(0.18), Y(0.25), X(0.24), Y(0.55));
    g.fill();
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
