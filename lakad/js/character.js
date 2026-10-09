// Chibi Karla: a round head wearing her face (rendered from the scan by
// tools/face_photo.py), chibi hair in her style, and a small body built in code,
// driven by a real bone hierarchy (THREE.Bone) with procedural idle / walk /
// sprint / jump. Units are metres, y up, the character faces +z.
import * as THREE from "three";

// Colours sampled from the scan (median of each region's splats)
export const PALETTE = {
  skin: new THREE.Color(0.629, 0.437, 0.341).convertSRGBToLinear(),
  tee: new THREE.Color(0.098, 0.091, 0.105).convertSRGBToLinear(),
  pants: new THREE.Color(0.703, 0.718, 0.71).convertSRGBToLinear(),
  hair: new THREE.Color(0.2, 0.165, 0.155).convertSRGBToLinear(),   // scan median, a touch warmer
  shoe: new THREE.Color(0.96, 0.95, 0.93).convertSRGBToLinear(),
  sole: new THREE.Color(0.85, 0.62, 0.66).convertSRGBToLinear(),
};

// Chibi proportions: head is ~42% of total height (~0.98 m)
const HEAD_R = 0.2;
const HIP_Y = 0.30;

const mat = (color, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
const M = {
  skin: mat(PALETTE.skin, 0.6),
  tee: mat(PALETTE.tee, 0.85),
  pants: mat(PALETTE.pants, 0.8),
  hair: mat(PALETTE.hair, 0.82),
  shoe: mat(PALETTE.shoe, 0.6),
  sole: mat(PALETTE.sole, 0.6),
};

function part(geo, material, parent, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
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
    B.spine = bone("spine", B.hips, [0, 0.07, 0]);
    B.chest = bone("chest", B.spine, [0, 0.11, 0]);
    B.neck = bone("neck", B.chest, [0, 0.085, 0]);
    B.head = bone("head", B.neck, [0, 0.03, 0]);
    B.hair = bone("hair", B.head, [0, HEAD_R * 1.25, -HEAD_R * 0.35]);

    for (const [s, x] of [["L", 1], ["R", -1]]) {
      B["upperArm" + s] = bone("upperArm" + s, B.chest, [0.135 * x, 0.045, 0]);
      B["foreArm" + s] = bone("foreArm" + s, B["upperArm" + s], [0, -0.1, 0]);
      B["hand" + s] = bone("hand" + s, B["foreArm" + s], [0, -0.09, 0]);
      B["thigh" + s] = bone("thigh" + s, B.hips, [0.07 * x, -0.03, 0]);
      B["shin" + s] = bone("shin" + s, B["thigh" + s], [0, -0.125, 0]);
      B["foot" + s] = bone("foot" + s, B["shin" + s], [0, -0.115, 0]);
    }
    this.skeleton = new THREE.Skeleton(Object.values(B));
    this.rest = Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b.position.clone()]));

    // --- body: round bean, black tee over light pants ---------------------
    part(new THREE.SphereGeometry(0.13, 32, 20), M.pants, B.hips, [0, 0.02, 0], [1, 0.72, 0.86]);
    part(new THREE.SphereGeometry(0.145, 32, 24), M.tee, B.spine, [0, 0.085, 0], [1, 1.02, 0.82]);
    part(new THREE.CylinderGeometry(0.038, 0.045, 0.07, 16), M.skin, B.neck, [0, 0.02, 0]);

    for (const [s, x] of [["L", 1], ["R", -1]]) {
      part(new THREE.SphereGeometry(0.052, 20, 14), M.tee, B["upperArm" + s], [0.005 * x, -0.02, 0], [1, 1.15, 1]);
      part(limb(0.034, 0.06), M.skin, B["upperArm" + s], [0, -0.035, 0]);
      part(limb(0.032, 0.06), M.skin, B["foreArm" + s], [0, 0, 0]);
      part(new THREE.SphereGeometry(0.04, 18, 14), M.skin, B["hand" + s], [0, -0.012, 0.004], [0.9, 1, 0.8]);
      part(limb(0.058, 0.07), M.pants, B["thigh" + s], [0, 0, 0]);
      part(limb(0.054, 0.065), M.pants, B["shin" + s], [0, 0, 0]);
      part(new THREE.SphereGeometry(0.05, 20, 14), M.shoe, B["foot" + s], [0, -0.005, 0.025], [1, 0.72, 1.45]);
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), M.sole, B["foot" + s], [0, -0.034, 0.025], [1, 1, 1.45]);
    }

    // --- head: sphere with planar front UVs (the face texture is a flat
    // front view of her head; tools/face_photo.py puts the face in a fixed slot)
    const hg = new THREE.SphereGeometry(HEAD_R, 72, 54);
    const pos = hg.attributes.position, uv = hg.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // back half samples a plain skin corner of the texture, never a mirrored face
      if (z < 0) uv.setXY(i, 0.03, 0.03);
      else uv.setXY(i, 0.5 + x / (2 * HEAD_R), 0.5 + y / (2 * HEAD_R));
    }
    this.faceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, map: drawnFace(),
      emissive: 0xffffff, emissiveIntensity: 0.45 });
    this.faceMat.emissiveMap = this.faceMat.map;
    this.headMesh = part(hg, this.faceMat, B.head, [0, HEAD_R * 0.98, 0.0], [1, 0.97, 0.94]);

    // --- hair: her dark shoulder-length cut with a centre part ----------------
    const H = new THREE.Group();
    H.position.copy(this.headMesh.position);
    B.head.add(H);
    // one shell all round the head; the face opening (rounded, with curved
    // bangs and a little centre part) is cut by an alpha mask in the same
    // planar front mapping the face texture uses
    const hs = new THREE.SphereGeometry(HEAD_R * 1.06, 72, 54, 0, Math.PI * 2, 0, Math.PI * 0.8);
    const hp = hs.attributes.position, hu = hs.attributes.uv;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      if (z < 0) hu.setXY(i, 0.01, 0.99);
      else hu.setXY(i, 0.5 + x / (2 * HEAD_R * 1.06), 0.5 + y / (2 * HEAD_R * 1.06));
    }
    const hairMat = M.hair.clone();
    hairMat.alphaMap = hairMask();
    hairMat.alphaTest = 0.5;
    hairMat.side = THREE.DoubleSide;
    part(hs, hairMat, H, [0, 0, 0], [1, 0.98, 0.97]);
    // locks framing the face, down to the jaw
    for (const x of [1, -1]) {
      const lock = part(new THREE.CapsuleGeometry(HEAD_R * 0.2, HEAD_R * 0.75, 8, 16), M.hair, H,
        [x * HEAD_R * 0.9, -HEAD_R * 0.42, HEAD_R * 0.26], [0.9, 1, 0.7]);
      lock.rotation.z = x * 0.12;
    }
    // shoulder-length fall behind, on its own springy bone
    part(new THREE.CapsuleGeometry(HEAD_R * 0.78, HEAD_R * 0.9, 10, 28).translate(0, -HEAD_R * 0.75, 0),
      M.hair, B.hair, [0, 0, 0], [1.12, 1, 0.5]);

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
  }

  /** her face from the scan (assets/face.png + .json); keeps the drawn face if missing */
  async loadFace(base) {
    const meta = await (await fetch(base + ".json")).json();
    const tex = await new THREE.TextureLoader().loadAsync(base + ".png");
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.faceMat.map = this.faceMat.emissiveMap = tex;
    this.faceMat.needsUpdate = true;
    // body skin matches the face's own tone
    M.skin.color.setRGB(...meta.skin, THREE.SRGBColorSpace);
  }

  /** speed: horizontal m/s; grounded; vy: vertical m/s; sprint: bool */
  update(dt, { speed, grounded, vy, sprinting, turn }) {
    this.t += dt;
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

// Fallback face (no scan on this machine): simple chibi eyes + smile,
// laid out in the same slot the photo face uses.
function drawnFace() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#" + PALETTE.skin.clone().convertLinearToSRGB().getHexString();
  g.fillRect(0, 0, 256, 256);
  const Y = (v) => 256 * (1 - v);
  g.fillStyle = "#2b2228";
  for (const x of [0.39, 0.61]) { g.beginPath(); g.ellipse(256 * x, Y(0.42), 11, 15, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#fff";
  for (const x of [0.4, 0.62]) { g.beginPath(); g.arc(256 * x, Y(0.44), 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "rgba(240,120,130,.35)";
  for (const x of [0.31, 0.69]) { g.beginPath(); g.ellipse(256 * x, Y(0.33), 14, 8, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "#8a4a50"; g.lineWidth = 4; g.lineCap = "round";
  g.beginPath(); g.arc(128, Y(0.3), 12, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Hair alpha: white = hair. Black = the face opening: an oval from the brows
// down, open below the chin, topped by bangs that sweep down toward the
// temples with a small notch at the centre part. Same (u, v) as the face.
function hairMask() {
  const S = 512, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, S, S);
  const X = (u) => u * S, Y = (v) => (1 - v) * S;
  g.fillStyle = "#000";
  g.beginPath();
  // bangs line: from the left temple, up to the part, back down to the right temple
  g.moveTo(X(0.15), Y(0.5));
  g.bezierCurveTo(X(0.2), Y(0.7), X(0.38), Y(0.68), X(0.485), Y(0.7));
  g.lineTo(X(0.5), Y(0.74));
  g.lineTo(X(0.515), Y(0.7));
  g.bezierCurveTo(X(0.62), Y(0.68), X(0.8), Y(0.7), X(0.85), Y(0.5));
  // down the cheeks to under the chin, and out the bottom
  g.bezierCurveTo(X(0.9), Y(0.3), X(0.84), Y(0.1), X(0.78), Y(-0.05));
  g.lineTo(X(0.22), Y(-0.05));
  g.bezierCurveTo(X(0.16), Y(0.1), X(0.1), Y(0.3), X(0.15), Y(0.5));
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
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
