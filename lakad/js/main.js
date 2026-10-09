import * as THREE from "three";
import { Character } from "./character.js";
import { buildWorld, SOLIDS, POSTS } from "./world.js";

const $ = (id) => document.getElementById(id);

// ---- tuning ---------------------------------------------------------------
const WALK = 1.7, SPRINT = 4.3;          // m/s
const ACCEL = 14, AIR_ACCEL = 5;
const GRAVITY = -19, JUMP_V = 5.6;        // apex ~0.83 m: clears the 0.36 m steps easily
const COYOTE = 0.1, BUFFER = 0.12;        // forgiving jump timing
const RADIUS = 0.18, STEP_UP = 0.2;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 200);
const { sun, clouds } = buildWorld(scene);

const karla = new Character();
scene.add(karla.root, karla.helper);

// blob shadow under her so height reads clearly mid-jump
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

// ---- input ------------------------------------------------------------------
const keys = new Set();
let jumpPressedAt = -1;
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "Space") { jumpPressedAt = clock.getElapsed(); e.preventDefault(); }
  if (e.code === "KeyK") karla.helper.visible = !karla.helper.visible, syncSkel();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

// camera orbit: drag, or click once for mouse-look (Esc releases)
const cam = { yaw: Math.PI, pitch: 0.28, dist: 3.2, target: new THREE.Vector3() };
let dragging = false;
renderer.domElement.addEventListener("pointerdown", (e) => { dragging = true; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener("pointerup", () => (dragging = false));
renderer.domElement.addEventListener("dblclick", () => renderer.domElement.requestPointerLock?.());
addEventListener("pointermove", (e) => {
  if (!dragging && document.pointerLockElement !== renderer.domElement) return;
  cam.yaw -= e.movementX * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.004, -0.15, 1.2);
});
addEventListener("wheel", (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + e.deltaY * 0.001), 1.4, 9); }, { passive: true });

$("skel").onclick = () => { karla.helper.visible = !karla.helper.visible; syncSkel(); };
const syncSkel = () => $("skel").classList.toggle("on", karla.helper.visible);

// ---- player physics ---------------------------------------------------------
const P = { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, grounded: true, lastGround: 0, prevYaw: 0 };

function groundHeightAt(x, z, feetY) {
  // highest surface under her (within step-up reach of her feet)
  let h = 0;
  for (const s of SOLIDS) {
    if (x > s.min.x - RADIUS * 0.5 && x < s.max.x + RADIUS * 0.5 && z > s.min.z - RADIUS * 0.5 && z < s.max.z + RADIUS * 0.5 &&
        s.max.y <= feetY + STEP_UP + 1e-4) h = Math.max(h, s.max.y);
  }
  return h;
}

function pushOut(pos) {
  for (const s of SOLIDS) {
    if (pos.y >= s.max.y - 1e-3 || pos.y + 0.9 < s.min.y) continue;  // standing on / under it
    if (s.max.y - pos.y <= STEP_UP) continue;                         // low enough to step onto
    const cx = THREE.MathUtils.clamp(pos.x, s.min.x, s.max.x);
    const cz = THREE.MathUtils.clamp(pos.z, s.min.z, s.max.z);
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d < RADIUS) {
      if (d > 1e-6) { pos.x = cx + (dx / d) * RADIUS; pos.z = cz + (dz / d) * RADIUS; }
      else {  // centre inside the box: shove out the nearest face
        const opts = [[s.min.x - RADIUS - pos.x, 0], [s.max.x + RADIUS - pos.x, 0], [0, s.min.z - RADIUS - pos.z], [0, s.max.z + RADIUS - pos.z]];
        opts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
        pos.x += opts[0][0]; pos.z += opts[0][1];
      }
    }
  }
  for (const p of POSTS) {
    const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), r = p.r + RADIUS;
    if (d < r && d > 1e-6) { pos.x = p.x + (dx / d) * r; pos.z = p.z + (dz / d) * r; }
  }
  const R = 55, d = Math.hypot(pos.x, pos.z);
  if (d > R) { pos.x *= R / d; pos.z *= R / d; }
}

function step(dt, t) {
  // camera-relative wish direction
  const f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  const r = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const wish = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
  if (wish.lengthSq() > 0) wish.normalize();
  const top = sprinting ? SPRINT : WALK;

  const a = 1 - Math.exp(-dt * (P.grounded ? ACCEL : AIR_ACCEL));
  P.vel.x += (wish.x * top - P.vel.x) * a;
  P.vel.z += (wish.z * top - P.vel.z) * a;

  // face where she's going
  if (wish.lengthSq() > 0) {
    const want = Math.atan2(wish.x, wish.z);
    let d = want - P.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * (1 - Math.exp(-dt * 12));
  }
  const turn = Math.atan2(Math.sin(P.yaw - P.prevYaw), Math.cos(P.yaw - P.prevYaw)) / Math.max(dt, 1e-4);
  P.prevYaw = P.yaw;

  // jump (buffered + coyote time)
  if (P.grounded) P.lastGround = t;
  if (jumpPressedAt >= 0 && t - jumpPressedAt < BUFFER && t - P.lastGround < COYOTE) {
    P.vel.y = JUMP_V;
    P.grounded = false;
    P.lastGround = -1;
    jumpPressedAt = -1;
    karla.takeoff();
  }
  // short hop when Space is released early
  if (!keys.has("Space") && P.vel.y > 2) P.vel.y += GRAVITY * dt * 1.5;
  P.vel.y += GRAVITY * dt;

  P.pos.x += P.vel.x * dt;
  P.pos.z += P.vel.z * dt;
  pushOut(P.pos);

  const floor = groundHeightAt(P.pos.x, P.pos.z, P.pos.y);
  P.pos.y += P.vel.y * dt;
  if (P.pos.y <= floor) {
    if (!P.grounded && P.vel.y < -1) karla.land(-P.vel.y);
    P.pos.y = floor;
    P.vel.y = 0;
    P.grounded = true;
  } else if (P.grounded && P.pos.y - floor < STEP_UP && P.vel.y <= 0) {
    P.pos.y = floor;   // walking down a step: stay glued
    P.vel.y = 0;
  } else {
    P.grounded = false;
  }

  const speed = Math.hypot(P.vel.x, P.vel.z);
  karla.root.position.copy(P.pos);
  karla.root.rotation.y = P.yaw;
  karla.update(dt, { speed, grounded: P.grounded, vy: P.vel.y, sprinting, turn });

  blob.position.set(P.pos.x, floor + 0.005, P.pos.z);
  const air = P.pos.y - floor;
  blob.scale.setScalar(1 / (1 + air * 0.8));
  blob.material.opacity = 0.18 / (1 + air * 1.5);

  const w = karla.w;
  const state = w.air > 0.5 ? (P.vel.y > 0 ? "jump" : "fall") : w.run > 0.5 ? "sprint" : w.walk > 0.5 ? "walk" : "idle";
  if ($("state").textContent !== state) $("state").textContent = state;
}

function updateCamera(dt) {
  const head = P.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
  cam.target.lerp(head, 1 - Math.exp(-dt * 8));
  const off = new THREE.Vector3(
    Math.sin(cam.yaw) * Math.cos(cam.pitch),
    Math.sin(cam.pitch),
    Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(cam.dist);
  camera.position.copy(cam.target).add(off);
  camera.position.y = Math.max(camera.position.y, 0.25);
  camera.lookAt(cam.target);
  sun.position.set(P.pos.x + 6, 10, P.pos.z + 4);
  sun.target.position.copy(P.pos);
}

const clock = new THREE.Timer();
renderer.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 30);
  const t = clock.getElapsed();
  // fixed sub-steps keep jumps identical at any frame rate
  const n = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < n; i++) step(dt / n, t);
  updateCamera(dt);
  for (const c of clouds) { c.position.x += dt * 0.3; if (c.position.x > 40) c.position.x = -40; }
  renderer.render(scene, camera);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// test hooks (headless screenshots / console)
window.__lakad = { P, cam, karla, keys, camera, scene,
  hold(code, on = true) { on ? keys.add(code) : keys.delete(code); if (code === "Space" && on) jumpPressedAt = clock.getElapsed(); } };
