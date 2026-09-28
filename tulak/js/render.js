// Everything you see. Reads a "view" — the host's sim state, or a guest's
// interpolated copy of it — and never writes back.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { TUNE, SEATS, MODELS, CRITTER_IDS } from "./config.js";
import { TILES, SHAKING, GONE } from "./sim.js";

const MODEL_SCALE = 1.12 / 56; // GLBs are in mm, ~56 mm tall; a critter is ~1.1 units
const INK = 0x2a1420;

export async function createRenderer(canvas, labelsEl) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.006, defaultColor: [0.16, 0.08, 0.12] });

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const cam = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sun.position.set(6, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0xdff4ff, 1.6);
  rim.position.set(-6, 8, -12);
  scene.add(sun, sun.target, rim, new THREE.HemisphereLight(0xffffff, 0x7a5060, 0.9));

  /* ------------------------------------------------------------ island --- */
  const N = TILES.length;
  const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };
  const topGeo = new THREE.CylinderGeometry(TUNE.hex * 0.965, TUNE.hex * 0.965, 0.42, 6);
  const skirtGeo = new THREE.CylinderGeometry(TUNE.hex * 0.9, TUNE.hex * 0.32, 1.5, 6);
  const tops = new THREE.InstancedMesh(topGeo, noOutline(new THREE.MeshStandardMaterial({ roughness: 0.8 })), N);
  const skirts = new THREE.InstancedMesh(skirtGeo, noOutline(new THREE.MeshStandardMaterial({ color: 0x9a6038, roughness: 1 })), N);
  // Tile outlines by inverted hull: OutlineEffect does not reach into
  // instanced meshes, so each tile gets a slightly bigger ink twin drawn
  // back-faces-only behind it.
  const hullMat = noOutline(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  const hulls = new THREE.InstancedMesh(new THREE.CylinderGeometry(TUNE.hex * 1.0, TUNE.hex * 1.0, 0.5, 6), hullMat, N);
  tops.receiveShadow = true; skirts.receiveShadow = true; tops.castShadow = true;
  scene.add(tops, skirts, hulls);
  const grassA = new THREE.Color("#7ed957"), grassB = new THREE.Color("#63c748"), warn = new THREE.Color("#ff6a3d");
  const tileFall = new Float32Array(N), tilePrev = new Uint8Array(N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  const tmpCol = new THREE.Color();

  function drawTiles(tiles, t, dt) {
    for (let i = 0; i < N; i++) {
      const T = TILES[i], st = tiles ? tiles[i] : 0;
      if (st === GONE && tilePrev[i] !== GONE) tileFall[i] = 0;
      if (st !== GONE) tileFall[i] = -1;
      tilePrev[i] = st;
      let x = T.x, y = 0, z = T.z, sc = one;
      q.identity();
      if (st === SHAKING) {
        x += Math.sin(t * 60 + i) * 0.05;
        z += Math.cos(t * 53 + i * 2) * 0.05;
        y -= 0.05;
      } else if (st === GONE) {
        tileFall[i] += dt;
        const f = tileFall[i];
        y = -0.5 * 20 * f * f;
        q.setFromAxisAngle(v3.set(Math.sin(i), 0, Math.cos(i)).normalize(), f * 1.6);
        if (y < -14) sc = zero;
      }
      m4.compose(v3.set(x, y - 0.21, z), q, sc);
      tops.setMatrixAt(i, m4);
      m4.compose(v3.set(x, y - 0.25, z), q, sc);
      hulls.setMatrixAt(i, m4);
      m4.compose(v3.set(x, y - 1.15, z), q, sc);
      skirts.setMatrixAt(i, m4);
      tmpCol.copy(T.ring % 2 ? grassA : grassB);
      if (st === SHAKING) tmpCol.lerp(warn, 0.5 + 0.5 * Math.sin(t * 20));
      tops.setColorAt(i, tmpCol);
    }
    tops.instanceMatrix.needsUpdate = skirts.instanceMatrix.needsUpdate = hulls.instanceMatrix.needsUpdate = true;
    tops.instanceColor.needsUpdate = true;
  }

  // clouds drifting far below the island
  const clouds = [];
  const cloudMat = noOutline(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 }));
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random(), 10, 8), cloudMat);
      b.position.set(k * 1.6 - 2.4, Math.random() * 0.6, Math.random() * 0.8);
      g.add(b);
    }
    g.position.set((Math.random() - 0.5) * 40, -9 - Math.random() * 7, (Math.random() - 0.5) * 30 - 6);
    g.userData.v = 0.4 + Math.random() * 0.5;
    scene.add(g);
    clouds.push(g);
  }

  /* ---------------------------------------------------------- critters --- */
  const loader = new GLTFLoader();
  const models = {};
  await Promise.all(CRITTER_IDS.map((id) => new Promise((res, rej) => {
    loader.load(new URL(`${id}.glb`, MODELS).href, (g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (["blush", "belly", "glint", "tongue", "lens"].includes(o.material.name)) {
          o.material.userData.outlineParameters = { visible: false };
        }
      });
      models[id] = g.scene;
      res();
    }, undefined, rej);
  })));

  const actors = [];
  const ringGeo = new THREE.RingGeometry(0.62, 0.8, 32);
  function makeActor(seat, critter, me) {
    const root = new THREE.Group();
    const body = new THREE.Group();   // squash/lean pivot at the feet
    const spin = new THREE.Group();   // roll/tumble pivot at the belly
    const model = models[critter].clone(true);
    model.scale.setScalar(MODEL_SCALE);
    spin.position.y = 0.55;
    model.position.y = -0.55;
    spin.add(model);
    body.add(spin);
    root.add(body);
    const ring = new THREE.Mesh(ringGeo, noOutline(new THREE.MeshBasicMaterial({ color: SEATS[seat].colour, transparent: true, opacity: 0.95, depthWrite: false })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    root.add(ring);
    scene.add(root);
    const label = document.createElement("div");
    label.className = "label" + (me ? " me" : "");
    label.style.setProperty("--seat", SEATS[seat].colour);
    labelsEl.append(label);
    return { root, body, spin, model, ring, label, critter, seat, me, px: 0, pz: 0, speed: 0, walk: 0, squash: 0, wasAir: false, tumble: 0 };
  }

  function setPlayers(list) {
    for (const a of actors) { scene.remove(a.root); a.label.remove(); }
    actors.length = 0;
    list.forEach((p, i) => actors.push(makeActor(i, p.critter, p.me)));
    list.forEach((p, i) => { actors[i].label.textContent = p.me ? "YOU" : p.name; });
  }

  /* --------------------------------------------------------------- fx --- */
  const fxs = [];
  const sparkMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  const sparkGeo = new THREE.OctahedronGeometry(0.13, 0);
  const waveMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  function burst(x, z, n, color, speed = 5, y = 0.6) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sparkGeo, color ? noOutline(new THREE.MeshBasicMaterial({ color })) : sparkMat);
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, u = Math.random();
      fxs.push({ m, vx: Math.cos(a) * speed * (0.5 + u), vy: 2 + Math.random() * 4, vz: Math.sin(a) * speed * (0.5 + u), life: 0.5 + Math.random() * 0.3 });
      scene.add(m);
    }
  }
  function shock(x, z, radius, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.45, 40), waveMat.clone());
    m.material.color.set(color);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    scene.add(m);
    fxs.push({ m, ring: radius, life: 0.45, max: 0.45 });
  }
  let shakeCam = 0;
  function fx(e, players) {
    const p = e.who !== undefined ? players[e.who] : null;
    if (e.type === "bump") { burst(e.x, e.z, e.power > 6 ? 10 : 4); shock(e.x, e.z, e.power > 6 ? 1.6 : 0.8, 0xffe14d); if (e.power > 6) shakeCam = Math.max(shakeCam, 0.18); }
    if (e.type === "pound") { shock(e.x, e.z, 3.2); shock(e.x, e.z, 2.2, 0xffd0dd); burst(e.x, e.z, 14, 0xffffff, 7, 0.2); shakeCam = 0.35; }
    if (e.type === "dash" && p) burst(p.x, p.z, 4, 0xffffff, 1.5, 0.2);
    if (e.type === "fall" && p) burst(p.x, p.z, 6, 0xffffff, 2, 0.2);
  }
  function stepFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      f.life -= dt;
      if (f.ring) {
        const k = 1 - f.life / f.max;
        f.m.scale.setScalar(0.5 + k * f.ring * 2.2);
        f.m.material.opacity = 0.8 * (1 - k);
      } else {
        f.vy -= 18 * dt;
        f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
        f.m.rotation.x += dt * 8; f.m.rotation.y += dt * 6;
        f.m.scale.setScalar(Math.max(0.01, f.life * 1.8));
      }
      if (f.life <= 0) { scene.remove(f.m); fxs.splice(i, 1); }
    }
  }

  /* ------------------------------------------------------------ camera --- */
  const camTarget = new THREE.Vector3(0, 0, 0.8);
  let camHalf = 7.5;
  const PITCH = 0.95; // radians above horizontal
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  function placeCamera(dt, wantX, wantZ, wantHalf) {
    const k = 1 - Math.exp(-dt * 2.2);
    camTarget.x += (wantX - camTarget.x) * k;
    camTarget.z += (wantZ - camTarget.z) * k;
    camHalf += (wantHalf - camHalf) * k;
    // Fit the wanted half-width across the screen; in portrait the width is
    // what runs out first.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
    const dist = Math.max(camHalf / Math.tan(hfov / 2), (camHalf * 0.9) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    cam.position.set(camTarget.x, Math.sin(PITCH) * dist, camTarget.z + Math.cos(PITCH) * dist);
    if (shakeCam > 0) {
      cam.position.x += (Math.random() - 0.5) * shakeCam;
      cam.position.y += (Math.random() - 0.5) * shakeCam;
      shakeCam = Math.max(0, shakeCam - dt);
    }
    cam.lookAt(camTarget);
  }

  /* ------------------------------------------------------------ update --- */
  const proj = new THREE.Vector3();
  let t = 0;
  function update(view, dt) {
    t += dt;
    drawTiles(view.tiles, t, dt);
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 24) c.position.x = -24; }

    let sx = 0, sz = 0, n = 0, spread = 0;
    view.players.forEach((p, i) => {
      const a = actors[i];
      if (!a) return;
      const vis = !p.out;
      a.root.visible = vis;
      a.label.style.display = vis && view.phase !== "menu" ? "" : "none";
      if (!vis) return;
      // speed from motion, so a guest (who only gets positions) animates too
      const vx = (p.x - a.px) / Math.max(dt, 1e-3), vz = (p.z - a.pz) / Math.max(dt, 1e-3);
      a.px = p.x; a.pz = p.z;
      const sp = Math.min(20, Math.hypot(vx, vz));
      a.speed += (sp - a.speed) * Math.min(1, dt * 10);
      a.walk += a.speed * dt * 2.2;

      a.root.position.set(p.x, 0, p.z);
      a.body.position.y = p.y;
      a.root.rotation.y = p.yaw;
      const air = p.y > 0.05;
      if (a.wasAir && !air) a.squash = 0.35; // landed
      a.wasAir = air;
      a.squash *= Math.exp(-dt * 9);

      let sq = a.squash - (air ? 0.12 : 0);
      if (p.dashing) sq -= 0.18;
      const bob = !air && a.speed > 1 ? Math.abs(Math.sin(a.walk)) * 0.09 : Math.sin(t * 2.1 + i) * 0.015;
      a.body.position.y += bob;
      a.body.rotation.set(0, 0, 0);
      a.spin.rotation.set(0, 0, 0);

      if (p.falling) {
        a.tumble += dt * 7;
        a.spin.rotation.set(a.tumble, 0, a.tumble * 0.6);
      } else {
        a.tumble = 0;
        // lean into the run
        a.body.rotation.x = Math.min(0.35, a.speed * 0.03) + (p.dashing ? 0.25 : 0);
        if (p.stun) a.body.rotation.z = Math.sin(t * 30) * 0.18;
        if (p.abil === "roll") {
          // curled into a ball and rolling forward
          a.spin.rotation.x = t * 22;
          sq = 0.22;
        } else if (p.abil === "dive") {
          a.body.rotation.x = 1.2;
          a.body.position.y += 0.3;
        } else if (p.abil === "float") {
          a.body.position.y += 0.25 + Math.sin(t * 6) * 0.06;
        }
      }
      a.body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      a.ring.visible = !p.falling;
      a.ring.material.opacity = p.abil === "float" ? 0.5 + 0.5 * Math.sin(t * 12) : 0.95;

      proj.set(p.x, p.y + 1.55, p.z).project(cam);
      a.label.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px)`;

      if (!p.falling) { sx += p.x; sz += p.z; n++; }
    });
    if (n) { sx /= n; sz /= n; }
    // Camera: centre on the survivors and zoom to fit them with room to see
    // the edge they are fighting near — but never wider than the island left.
    const tx = sx * 0.9, tz = sz * 0.9;
    view.players.forEach((p) => { if (!p.out && !p.falling) spread = Math.max(spread, Math.hypot(p.x - tx, p.z - tz)); });
    const ringsLeft = Math.max(1, TUNE.arenaRings - (view.wave || 0) + 1);
    const arenaHalf = (ringsLeft + 0.6) * TUNE.hex * 1.6;
    if (view.phase === "menu") placeCamera(dt, 0, 2.4, 3.1);
    else placeCamera(dt, tx, tz + 0.3, Math.max(4.2, Math.min(arenaHalf * 0.85, spread + 2.4)));

    stepFx(dt);
    effect.render(scene, cam);
  }

  return { setPlayers, update, fx, models };
}
