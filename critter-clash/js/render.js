// Everything you see. Reads a "view" (the host's sim, or a guest's copy of
// the snapshots) and never writes back.
//
// The camera sits behind YOUR half, so your squad is at the bottom of the
// portrait screen and theirs across the board at the top, host or guest.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BOARD, MODELS, CRITTER_IDS, SIDE_COLOURS, CRITTERS } from "./config.js";
import { SIDES, CELLS, cellPos } from "./sim.js";

const MODEL_SCALE = 1.3 / 56; // GLBs are in mm, ~56 mm tall
const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };

export async function createRenderer(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: [0.16, 0.08, 0.12] });

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 200);

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sun.position.set(6, 16, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 });
  sun.shadow.bias = -0.0006;
  const rim = new THREE.DirectionalLight(0xdff4ff, 1.4);
  rim.position.set(-6, 8, -12);
  scene.add(sun, rim, new THREE.HemisphereLight(0xffffff, 0x7a5060, 0.9));

  /* ------------------------------------------------------------- board --- */
  const halfW = (BOARD.cols / 2) * BOARD.cell + 0.35;
  const halfD = BOARD.firstZ + (BOARD.rows - 0.5) * BOARD.cell + 0.35;
  const dirt = new THREE.MeshStandardMaterial({ color: "#9a6038", roughness: 1 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.6, halfD * 2), [dirt, dirt, noOutline(new THREE.MeshStandardMaterial({ color: "#6cc94c", roughness: 0.9 })), dirt, dirt, dirt]);
  slab.position.y = -0.3;
  slab.receiveShadow = true;
  const under = new THREE.Mesh(new THREE.CylinderGeometry(halfW * 0.95, 0.8, 5, 6), dirt);
  under.scale.z = halfD / halfW;
  under.position.y = -3.1;
  scene.add(slab, under);
  // the midline
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, 0.12), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
  mid.rotation.x = -Math.PI / 2;
  mid.position.y = 0.012;
  scene.add(mid);
  // tiles: a checker per half, tinted to its owner
  const tileGeo = new THREE.PlaneGeometry(BOARD.cell * 0.94, BOARD.cell * 0.94);
  const tiles = [[], []];
  SIDES.forEach((side, seat) => {
    for (let i = 0; i < CELLS; i++) {
      const col = i % BOARD.cols, row = Math.floor(i / BOARD.cols);
      const base = new THREE.Color((col + row) % 2 ? "#8fe06a" : "#7ed957").lerp(new THREE.Color(SIDE_COLOURS[side]), 0.12);
      const m = new THREE.Mesh(tileGeo, noOutline(new THREE.MeshStandardMaterial({ color: base, roughness: 0.9 })));
      m.rotation.x = -Math.PI / 2;
      const p = cellPos(side, i);
      m.position.set(p.x, 0.005, p.z);
      m.receiveShadow = true;
      m.userData = { cell: i, seat, base };
      scene.add(m);
      tiles[seat].push(m);
    }
  });

  // clouds drifting far below
  const clouds = [];
  const cloudMat = noOutline(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 }));
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.3 + Math.random(), 10, 8), cloudMat);
      b.position.set(k * 1.5 - 2.2, Math.random() * 0.6, Math.random() * 0.8);
      g.add(b);
    }
    g.position.set((Math.random() - 0.5) * 36, -8 - Math.random() * 6, (Math.random() - 0.5) * 30);
    g.userData.v = 0.3 + Math.random() * 0.5;
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
        if (["blush", "belly", "glint", "tongue", "lens"].includes(o.material.name)) o.material.userData.outlineParameters = { visible: false };
      });
      models[id] = g.scene;
      res();
    }, undefined, rej);
  })));
  // A locked critter is shown as a flat dark silhouette.
  const shadowMat = noOutline(new THREE.MeshBasicMaterial({ color: 0x2a1420 }));
  function makeModel(id, locked) {
    const m = models[id].clone(true);
    m.scale.setScalar(MODEL_SCALE);
    if (locked) m.traverse((o) => { if (o.isMesh) o.material = shadowMat; });
    return m;
  }

  // One actor per critter on the board. Keyed "seat:id".
  const actors = new Map();
  function actor(key, id, seat, locked = false) {
    let a = actors.get(key);
    if (a && a.locked === locked) return a;
    if (a) drop(key);
    const root = new THREE.Group();
    const body = new THREE.Group();
    const model = makeModel(id, locked);
    body.add(model);
    root.add(body);
    scene.add(root);
    const bar = document.createElement("div");
    bar.className = `hp s${seat}`;
    bar.innerHTML = "<i></i>";
    overlay.append(bar);
    a = { key, id, seat, locked, root, body, model, bar, fill: bar.firstChild, x: 0, z: 0, px: 0, pz: 0, speed: 0, walk: 0, squash: 0, lunge: 0, hop: 0, flash: 0, ko: -1, seen: true };
    actors.set(key, a);
    return a;
  }
  function drop(key) {
    const a = actors.get(key);
    if (!a) return;
    scene.remove(a.root);
    a.bar.remove();
    actors.delete(key);
  }

  /* ------------------------------------------------------------- shots --- */
  const shotGeo = new THREE.SphereGeometry(0.18, 12, 10);
  const shotMat = new THREE.MeshStandardMaterial({ color: "#6fd3ff", roughness: 0.2, transparent: true, opacity: 0.9 });
  const shotPool = [];

  /* --------------------------------------------------------------- fx --- */
  const fxs = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
  const sparkMats = {};
  const spark = (c) => (sparkMats[c] ||= noOutline(new THREE.MeshBasicMaterial({ color: c })));
  function burst(x, y, z, n, color, speed = 3.5, up = 3) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sparkGeo, spark(color));
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, u = 0.4 + Math.random();
      fxs.push({ m, vx: Math.cos(a) * speed * u, vy: up + Math.random() * 3, vz: Math.sin(a) * speed * u, life: 0.45 + Math.random() * 0.3, g: 14 });
      scene.add(m);
    }
  }
  function rise(x, y, z, n, color) { // heal sparkles float up
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sparkGeo, spark(color));
      m.position.set(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8);
      fxs.push({ m, vx: 0, vy: 1.5 + Math.random(), vz: 0, life: 0.8, g: 0 });
      scene.add(m);
    }
  }
  function shock(x, z, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.42, 36), noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    scene.add(m);
    fxs.push({ m, ring: r, life: 0.45, max: 0.45 });
  }
  function popText(x, y, z, text, cls) {
    const d = document.createElement("div");
    d.className = `pop ${cls}`;
    d.textContent = text;
    overlay.append(d);
    const v = new THREE.Vector3(x, y, z).project(cam);
    d.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
    setTimeout(() => d.remove(), 800);
  }
  let shake = 0;
  let units = [];
  function fx(e) {
    const u = units[e.u];
    const a = u && actors.get(`${u.seat}:${u.id}`);
    if (e.type === "swing" && a) a.lunge = 1;
    if (e.type === "shoot" && a) { a.lunge = 0.6; a.squash = 0.25; }
    if (e.type === "hit" && a) {
      a.flash = 1;
      a.squash = Math.max(a.squash, 0.25);
      burst(a.x, 0.9, a.z, 5, "#ffe14d");
      popText(a.x, 1.9, a.z, `-${e.amount}`, "dmg");
    }
    if (e.type === "slam" && a) { a.hop = 1; shock(e.x, e.z, 2.2, "#ffd0dd"); shake = Math.max(shake, 0.18); burst(e.x, 0.2, e.z, 12, "#ffffff", 5, 2); }
    if (e.type === "heal") {
      const t = units[e.to], ta = t && actors.get(`${t.seat}:${t.id}`);
      if (ta) { rise(ta.x, 0.6, ta.z, 8, "#6dff8a"); popText(ta.x, 1.9, ta.z, `+${e.amount}`, "heal"); }
      if (a) a.squash = 0.2;
    }
    if (e.type === "ko" && a) { a.ko = 0; burst(a.x, 0.8, a.z, 16, "#ffffff", 4, 4); shake = Math.max(shake, 0.25); }
  }
  function stepFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      f.life -= dt;
      if (f.ring) {
        const k = 1 - f.life / f.max;
        f.m.scale.setScalar(0.5 + k * f.ring * 2.4);
        f.m.material.opacity = 0.9 * (1 - k);
      } else {
        f.vy -= f.g * dt;
        f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
        f.m.rotation.x += dt * 8;
        f.m.scale.setScalar(Math.max(0.01, f.life * 1.6));
      }
      if (f.life <= 0) { scene.remove(f.m); if (f.ring) f.m.material.dispose(); fxs.splice(i, 1); }
    }
  }

  /* ------------------------------------------------------------ camera --- */
  let mySeat = 0;
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  function placeCamera(mode) {
    const s = SIDES[mySeat];
    const k = Math.max(1, 0.5 / cam.aspect);
    if (mode === "menu") {
      cam.position.set(0, 8 * k, s * (19 * k));
      cam.lookAt(0, -3.4, s * -1.5);
    } else if (mode === "reveal") {
      cam.position.set(0, 2.6, s * 7.4);
      cam.lookAt(0, 0.2, s * 0.2);
    } else {
      cam.position.set(0, 16.5 * k, s * (11.2 * k));
      cam.lookAt(0, 0, -s * 0.2);
    }
    if (shake > 0) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; }
  }

  /* ----------------------------------------------------------- picking --- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  /** Your own cell under a screen point, or -1. */
  function pickCell(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObjects(tiles[mySeat])[0];
    return h ? h.object.userData.cell : -1;
  }
  /** World point on the board under a screen point (for dragging). */
  function groundAt(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(ground, hitP) ? { x: hitP.x, z: hitP.z } : null;
  }
  /** Which of your critters is under (or near) a screen point, or null. */
  const proj = new THREE.Vector3();
  function pickCritter(cx, cy) {
    let best = null, bestD = 60;
    for (const a of actors.values()) {
      if (a.seat !== mySeat || a.locked || !a.root.visible) continue;
      proj.set(a.x, 0.7, a.z).project(cam);
      const d = Math.hypot((proj.x * 0.5 + 0.5) * innerWidth - cx, (-proj.y * 0.5 + 0.5) * innerHeight - cy);
      if (d < bestD) { bestD = d; best = a.id; }
    }
    return best;
  }

  /* ------------------------------------------------------------ update --- */
  let t = 0;
  function update(view, dt) {
    t += dt;
    shake = Math.max(0, shake - dt * 1.2);
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 22) c.position.x = -22; }
    for (const a of actors.values()) a.seen = false;
    units = view.units || [];

    const prep = view.phase === "prep";
    // highlight: during prep your own tiles glow, the one under a drag most
    tiles.forEach((row, seat) => row.forEach((m) => {
      const hot = prep && seat === mySeat && m.userData.cell === view.hoverCell;
      m.material.color.copy(m.userData.base);
      if (prep && seat === mySeat) m.material.color.lerp(new THREE.Color("#ffffff"), hot ? 0.55 : 0.12 + 0.06 * Math.sin(t * 4));
    }));

    // Who stands where.
    const list = [];
    if (view.phase === "menu" || view.phase === "reveal") {
      for (const r of view.roster || []) list.push({ seat: mySeat, id: r.id, x: r.x, z: r.z, hp: 1, max: 1, alive: true, face: r.face, locked: r.locked, nobar: true });
    } else if (prep) {
      // your placement (or a critter being dragged), and nothing of theirs
      for (const [id, cell] of Object.entries(view.place || {})) {
        const drag = view.drag && view.drag.id === id ? view.drag : null;
        const p = drag || cellPos(SIDES[mySeat], cell);
        list.push({ seat: mySeat, id, x: p.x, z: p.z, hp: 1, max: 1, alive: true, face: SIDES[mySeat] > 0 ? Math.PI : 0, nobar: true, lifted: !!drag });
      }
    } else {
      for (const u of units) list.push(u);
    }

    for (const u of list) {
      const a = actor(`${u.seat}:${u.id}`, u.id, u.seat, !!u.locked);
      a.seen = true;
      a.x = u.x; a.z = u.z;
      const vx = (u.x - a.px) / Math.max(dt, 1e-3), vz = (u.z - a.pz) / Math.max(dt, 1e-3);
      a.px = u.x; a.pz = u.z;
      a.speed += (Math.min(8, Math.hypot(vx, vz)) - a.speed) * Math.min(1, dt * 10);
      a.walk += a.speed * dt * 3;
      a.squash *= Math.exp(-dt * 8);
      a.lunge = Math.max(0, a.lunge - dt * 4);
      a.hop = Math.max(0, a.hop - dt * 2.2);
      a.flash = Math.max(0, a.flash - dt * 4);

      let y = 0;
      if (a.speed > 0.3) y += Math.abs(Math.sin(a.walk)) * 0.14;
      if (a.hop > 0) y += Math.sin(a.hop * Math.PI) * 0.9;
      if (u.lifted) y += 0.5 + Math.sin(t * 8) * 0.05;
      const fwd = Math.sin(a.lunge * Math.PI) * 0.35;
      a.root.position.set(u.x + Math.sin(u.face) * fwd, y, u.z + Math.cos(u.face) * fwd);
      a.root.rotation.set(0, u.face, 0);
      const breathe = Math.sin(t * 2.2 + u.x) * 0.025;
      const sq = a.squash - (a.hop > 0.5 ? 0.15 : 0);
      a.body.scale.set(1 + sq * 0.5 - breathe, 1 - sq + breathe, 1 + sq * 0.5 - breathe);
      a.body.rotation.z = a.flash > 0 ? Math.sin(t * 40) * 0.12 * a.flash : 0;

      if (!u.alive) {
        // knocked out: pops up, spins and shrinks away
        if (a.ko < 0) a.ko = 0;
        a.ko += dt;
        a.root.position.y = Math.sin(Math.min(1, a.ko * 1.6) * Math.PI) * 1.6;
        a.root.rotation.y += a.ko * 14;
        a.body.scale.setScalar(Math.max(0.001, 1 - a.ko * 1.4));
      } else a.ko = -1;

      proj.set(a.root.position.x, 1.75, a.root.position.z).project(cam);
      const showBar = !u.nobar && u.alive;
      a.bar.style.display = showBar ? "" : "none";
      if (showBar) {
        a.bar.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px)`;
        a.fill.style.width = `${Math.max(0, (u.hp / u.max) * 100)}%`;
      }
    }
    for (const [key, a] of actors) if (!a.seen) drop(key);

    // water balls in flight
    const shots = view.shots || [];
    while (shotPool.length < shots.length) { const m = new THREE.Mesh(shotGeo, shotMat); scene.add(m); shotPool.push(m); }
    shotPool.forEach((m, i) => {
      m.visible = i < shots.length;
      if (m.visible) m.position.set(shots[i].x, 0.8 + Math.sin(t * 20 + i) * 0.05, shots[i].z);
    });

    placeCamera(view.phase === "menu" ? "menu" : view.phase === "reveal" ? "reveal" : "play");
    stepFx(dt);
    effect.render(scene, cam);
  }

  function setSeat(seat) { mySeat = seat; for (const k of [...actors.keys()]) drop(k); }

  return { update, fx, setSeat, pickCell, pickCritter, groundAt };
}
