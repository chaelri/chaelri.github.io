// Everything you see. Reads a "view" (the host's sim, or a guest's copy of
// the snapshots) and never writes back.
//
// The camera follows YOUR bean from behind your own base, so home is always at
// the bottom of the portrait screen and their base up ahead.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OutlineEffect } from "three/addons/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WORLD, RARITY, SPECIES_IDS, SEAT_COLOURS, MODELS } from "./config.js";
import { SIDES, WALLS, pedPos, worth, earns } from "./sim.js";

const MODEL_SCALE = 1 / 56; // GLBs are in mm, ~56 mm tall
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
  const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 200);

  const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 17, bottom: -17, near: 1, far: 60 });
  sun.shadow.bias = -0.0006;
  sun.position.set(7, 20, 6);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x7a5060, 0.9));
  const rim = new THREE.DirectionalLight(0xdff4ff, 1.2);
  rim.position.set(-6, 8, -12);
  scene.add(rim);

  /* ------------------------------------------------------------ island --- */
  const grass = noOutline(new THREE.MeshStandardMaterial({ color: "#7ed957", roughness: 0.9 }));
  const dirt = new THREE.MeshStandardMaterial({ color: "#9a6038", roughness: 1 });
  const island = new THREE.Mesh(new THREE.BoxGeometry(WORLD.halfX * 2 + 0.6, 0.6, WORLD.halfZ * 2 + 0.6), [dirt, dirt, grass, dirt, dirt, dirt]);
  island.position.y = -0.3;
  island.receiveShadow = true;
  const under = new THREE.Mesh(new THREE.CylinderGeometry(WORLD.halfX * 0.95, 1, 6, 6), dirt);
  under.scale.z = WORLD.halfZ / WORLD.halfX;
  under.position.y = -3.6;
  scene.add(island, under);
  // the parade path
  const path = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.halfX * 2, 1.6), noOutline(new THREE.MeshStandardMaterial({ color: "#e8c98f", roughness: 1 })));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, WORLD.parade.z);
  path.receiveShadow = true;
  scene.add(path);
  // bases: a tinted floor, wooden walls, a gate that drops when locked, pedestals
  const wood = new THREE.MeshStandardMaterial({ color: "#c98a4b", roughness: 0.8 });
  const stone = new THREE.MeshStandardMaterial({ color: "#e9e1f0", roughness: 0.6 });
  const gates = [];
  SIDES.forEach((side, seat) => {
    const B = WORLD.base;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.halfX * 2, B.far - B.near), noOutline(new THREE.MeshStandardMaterial({ color: new THREE.Color("#7ed957").lerp(new THREE.Color(SEAT_COLOURS[seat]), 0.35), roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.015, side * (B.near + B.far) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    WORLD.pedestals.forEach((_, i) => {
      const p = pedPos(seat, i);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.35, 20), stone);
      ped.position.set(p.x, 0.175, p.z);
      ped.castShadow = ped.receiveShadow = true;
      scene.add(ped);
    });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(B.door * 2, 1.1, 0.25), noOutline(new THREE.MeshStandardMaterial({ color: SEAT_COLOURS[seat], emissive: SEAT_COLOURS[seat], emissiveIntensity: 0.6, transparent: true, opacity: 0.75 })));
    gate.position.set(0, 0.55, side * B.near);
    scene.add(gate);
    gates.push(gate);
  });
  for (const w of WALLS) {
    if (w.door) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.x1 - w.x0, 0.8, w.z1 - w.z0), wood);
    m.position.set((w.x0 + w.x1) / 2, 0.4, (w.z0 + w.z1) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // clouds far below
  const clouds = [];
  const cloudMat = noOutline(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 }));
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random(), 10, 8), cloudMat);
      b.position.set(k * 1.6 - 2.4, Math.random() * 0.6, Math.random() * 0.8);
      g.add(b);
    }
    g.position.set((Math.random() - 0.5) * 40, -9 - Math.random() * 6, (Math.random() - 0.5) * 50);
    g.userData.v = 0.3 + Math.random() * 0.5;
    scene.add(g);
    clouds.push(g);
  }

  /* ----------------------------------------------------------- models --- */
  const loader = new GLTFLoader();
  const models = {};
  await Promise.all(SPECIES_IDS.map((id) => new Promise((res, rej) => {
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

  /* ------------------------------------------------------------ beans --- */
  // The players are little beans in their colour, so they never get mixed up
  // with the critters they are collecting.
  function makeBean(seat) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: SEAT_COLOURS[seat], roughness: 0.4 });
    const bean = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 8, 18), mat);
    bean.position.y = 0.72;
    bean.castShadow = true;
    const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: "#1a0f14", roughness: 0.2 });
    for (const sx of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), white);
      eye.position.set(sx, 0.98, 0.34);
      eye.scale.z = 0.6;
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), black);
      pupil.position.set(sx, 0.98, 0.41);
      body.add(eye, pupil);
    }
    body.add(bean);
    const stars = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), noOutline(new THREE.MeshBasicMaterial({ color: "#ffe14d" })));
      s.position.set(Math.cos(k * 2.1) * 0.4, 0, Math.sin(k * 2.1) * 0.4);
      stars.add(s);
    }
    stars.position.y = 1.7;
    g.add(body, stars);
    scene.add(g);
    const label = document.createElement("div");
    label.className = `tag who s${seat}`;
    overlay.append(label);
    return { g, body, stars, label, walk: 0, px: 0, pz: 0 };
  }
  const beans = [makeBean(0), makeBean(1)];

  /* --------------------------------------------------------- critters --- */
  const ringGeo = new THREE.TorusGeometry(0.45, 0.06, 8, 32);
  const actors = new Map();
  function actor(c) {
    let a = actors.get(c.id);
    if (a && a.species === c.species) return a;
    const root = new THREE.Group();
    const model = models[c.species].clone(true);
    model.scale.setScalar(MODEL_SCALE * 0.95);
    root.add(model);
    const ring = new THREE.Mesh(ringGeo, noOutline(new THREE.MeshBasicMaterial({ color: RARITY[c.rarity].colour, transparent: true, opacity: 0.95 })));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    root.add(ring);
    scene.add(root);
    const tag = document.createElement("div");
    tag.className = "tag price";
    overlay.append(tag);
    a = { id: c.id, species: c.species, root, model, ring, tag, hop: Math.random() * 6, seen: true, pop: 0 };
    actors.set(c.id, a);
    return a;
  }

  // the mystery box
  const boxTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#b77cff"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#ffc928"; g.fillRect(52, 0, 24, 128); g.fillRect(0, 52, 128, 24);
    g.font = "bold 70px sans-serif"; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.strokeStyle = "#2a1420"; g.lineWidth = 8; g.strokeText("?", 64, 68); g.fillText("?", 64, 68);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.5 }));
  box.castShadow = true;
  box.visible = false;
  scene.add(box);

  // rain for Ulan
  const rainGeo = new THREE.BufferGeometry();
  const drops = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { drops[i * 3] = (Math.random() - 0.5) * 20; drops[i * 3 + 1] = Math.random() * 14; drops[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  const rain = new THREE.Points(rainGeo, noOutline(new THREE.PointsMaterial({ color: 0xbfe8ff, size: 0.09, transparent: true, opacity: 0.8 })));
  rain.visible = false;
  scene.add(rain);

  /* --------------------------------------------------------------- fx --- */
  const fxs = [];
  const sparkGeo = new THREE.OctahedronGeometry(0.1, 0);
  const sparkMats = {};
  const spark = (c) => (sparkMats[c] ||= noOutline(new THREE.MeshBasicMaterial({ color: c })));
  function burst(x, y, z, n, color, speed = 3.5, up = 3) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sparkGeo, spark(color));
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, u = 0.4 + Math.random();
      fxs.push({ m, vx: Math.cos(a) * speed * u, vy: up + Math.random() * 3, vz: Math.sin(a) * speed * u, life: 0.5 + Math.random() * 0.3 });
      scene.add(m);
    }
  }
  function stepFx(dt) {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      f.life -= dt;
      f.vy -= 14 * dt;
      f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
      f.m.rotation.x += dt * 8;
      f.m.scale.setScalar(Math.max(0.01, f.life * 1.6));
      if (f.life <= 0) { scene.remove(f.m); fxs.splice(i, 1); }
    }
  }
  const v3 = new THREE.Vector3();
  function screen(x, y, z) {
    v3.set(x, y, z).project(cam);
    return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, behind: v3.z > 1 };
  }
  function pop(x, y, z, text, cls) {
    const s = screen(x, y, z);
    if (s.behind) return;
    const d = document.createElement("div");
    d.className = `pop ${cls}`;
    d.textContent = text;
    d.style.transform = `translate(${s.x}px, ${s.y}px)`;
    overlay.append(d);
    setTimeout(() => d.remove(), 900);
  }
  let shake = 0, critters = [];
  function fx(e) {
    const c = critters.find((o) => o.id === e.id);
    if (e.type === "buy" && c) burst(c.x, 1, c.z, 10, RARITY[c.rarity].colour);
    if (e.type === "place" && c) { burst(c.x, 1, c.z, e.stolen ? 18 : 8, e.stolen ? "#ffc928" : "#ffffff", 3, 4); if (e.stolen) pop(c.x, 2.2, c.z, "NAKAW!", "big"); }
    if (e.type === "grab" && c) burst(c.x, 1.5, c.z, 8, "#ff5fa2");
    if (e.type === "caught" && c) { burst(c.x, 1.5, c.z, 14, "#ffffff", 4, 4); pop(c.x, 2.4, c.z, "CAUGHT!", "big"); shake = 0.3; }
    if (e.type === "escape" && c) pop(c.x, 2.2, c.z, "slipped free!", "small");
    if (e.type === "sold" && c) pop(c.x, 1.8, c.z, `+${e.coins}`, "coin");
    if (e.type === "box" && c) { burst(c.x, 1, c.z, 24, RARITY[c.rarity].colour, 5, 5); shake = 0.2; }
  }

  /* ------------------------------------------------------------ camera --- */
  let mySeat = 0, zoom = 0;
  const camAt = new THREE.Vector3();
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  /* ------------------------------------------------------------ update --- */
  let t = 0, coinT = 0;
  function update(view, dt) {
    t += dt;
    shake = Math.max(0, shake - dt);
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 25) c.position.x = -25; }
    critters = view.critters || [];
    const ev = view.event;

    // players
    (view.players || []).forEach((p, i) => {
      const b = beans[i];
      const vx = (p.x - b.px) / Math.max(dt, 1e-3), vz = (p.z - b.pz) / Math.max(dt, 1e-3);
      const speed = Math.min(8, Math.hypot(vx, vz));
      b.px = p.x; b.pz = p.z;
      b.walk += speed * dt * 3;
      b.g.position.set(p.x, speed > 0.4 ? Math.abs(Math.sin(b.walk)) * 0.12 : 0, p.z);
      b.g.rotation.y = p.face;
      b.body.rotation.x = Math.min(0.25, speed * 0.04);
      b.body.rotation.z = p.stun > 0 ? Math.sin(t * 30) * 0.2 : 0;
      b.stars.visible = p.stun > 0;
      b.stars.rotation.y = t * 6;
      const s = screen(p.x, 2.1 + (p.carry >= 0 ? 1.1 : 0), p.z);
      b.label.textContent = i === mySeat ? "YOU" : view.names?.[i] || "";
      b.label.style.transform = `translate(${s.x}px, ${s.y}px)`;
      b.label.style.display = s.behind || view.phase === "menu" ? "none" : "";
      gates[i].visible = p.lockT > 0;
      gates[i].material.opacity = p.lockT > 0 && p.lockT < 3 ? 0.35 + 0.4 * Math.abs(Math.sin(t * 8)) : 0.75;
    });

    // critters
    for (const a of actors.values()) a.seen = false;
    coinT += dt;
    const coinTick = coinT >= 1;
    if (coinTick) coinT = 0;
    for (const c of critters) {
      const a = actor(c);
      a.seen = true;
      let y = 0, scale = 1;
      if (c.where === "parade") { a.hop += dt * 7; y = Math.abs(Math.sin(a.hop)) * 0.12; a.root.rotation.y = Math.PI / 2; }
      else if (c.where === "carried") { y = 1.95; scale = 0.72; a.root.rotation.y += dt * 2; }
      else if (c.where === "pedestal") { y = 0.35 + Math.sin(t * 2 + c.id) * 0.03; a.root.rotation.y = c.owner === 0 ? Math.PI : 0; }
      else if (c.where === "returning") { a.hop += dt * 12; y = 0.3 + Math.abs(Math.sin(a.hop)) * 0.5; }
      a.root.position.set(c.x, y, c.z);
      a.root.scale.setScalar(scale);
      // rarity glow; rainbow cycles through the hues
      if (c.rainbow) a.ring.material.color.setHSL((t * 0.5 + c.id * 0.1) % 1, 0.9, 0.6);
      a.ring.scale.setScalar(c.rarity === "legendary" || c.rainbow ? 1 + Math.sin(t * 6) * 0.08 : 1);
      a.ring.visible = c.where !== "carried";
      if ((c.rarity === "legendary" || c.rainbow) && Math.random() < dt * 6) burst(c.x + (Math.random() - 0.5) * 0.8, y + 0.4, c.z + (Math.random() - 0.5) * 0.8, 1, c.rainbow ? `hsl(${(t * 180) % 360},90%,65%)` : "#ffc928", 0.3, 1.5);
      // the tag: price in the parade, earnings on a pedestal
      const s = screen(c.x, y + 1.35, c.z);
      const show = !s.behind && (c.where === "parade" || c.where === "pedestal");
      a.tag.style.display = show ? "" : "none";
      if (show) {
        a.tag.style.transform = `translate(${s.x}px, ${s.y}px)`;
        a.tag.style.setProperty("--r", c.rainbow ? "linear-gradient(90deg,#ff9fb5,#ffc928,#7ed957,#6fd3ff,#c4a2ff)" : RARITY[c.rarity].colour);
        const html = c.where === "parade" ? `<i></i>${worth(c)}` : `+${earns(c)}/s`;
        if (a.tag.innerHTML !== html) a.tag.innerHTML = html;
        a.tag.classList.toggle("earn", c.where === "pedestal");
        a.tag.classList.toggle("guard", c.guard > 0);
      }
      if (coinTick && c.where === "pedestal" && c.owner === mySeat) pop(c.x, y + 1.7, c.z, `+${earns(c)}`, "coin");
    }
    for (const [id, a] of actors) if (!a.seen) { scene.remove(a.root); a.tag.remove(); actors.delete(id); }

    box.visible = !!view.box;
    if (view.box) { box.position.set(view.box.x, 0.6 + Math.abs(Math.sin(t * 3)) * 0.35, view.box.z); box.rotation.y = t * 1.5; }

    rain.visible = ev === "ulan";
    if (rain.visible) {
      const pos = rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { let yy = pos.getY(i) - dt * 14; if (yy < 0) yy += 14; pos.setY(i, yy); }
      pos.needsUpdate = true;
    }
    const dim = ev === "brownout" ? 0.35 : 1;
    sun.intensity += (2.4 * dim - sun.intensity) * Math.min(1, dt * 3);
    path.material.color.set(ev === "golden" ? "#ffd66b" : "#e8c98f");

    // camera: follow my bean, from behind my base; pull out while carrying
    const me = view.players?.[mySeat];
    const s = SIDES[mySeat];
    const k = Math.max(1, 0.5 / cam.aspect);
    if (view.phase === "menu" || !me) {
      // the whole island from high up, turning slowly
      const ang = t * 0.08;
      camAt.set(0, 0, 0);
      cam.position.set(Math.sin(ang) * 22 * k, 30 * k, Math.cos(ang) * 22 * k);
      cam.lookAt(0, -6, 0);
    } else {
      zoom += ((me.carry >= 0 ? 1 : 0) - zoom) * Math.min(1, dt * 2);
      const tx = me.x * 0.6, tz = me.z - s * 3;
      camAt.x += (tx - camAt.x) * Math.min(1, dt * 5);
      camAt.z += (tz - camAt.z) * Math.min(1, dt * 5);
      // far enough back that most of the island's width is on screen in portrait
      const h = (21 + zoom * 3.5) * k;
      cam.position.set(camAt.x, h, camAt.z + s * (12 + zoom * 2.5) * k);
      if (shake > 0) { cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; }
      cam.lookAt(camAt.x, 0, camAt.z);
    }
    sun.position.set(camAt.x + 7, 20, camAt.z + 6);
    sun.target.position.set(camAt.x, 0, camAt.z);

    stepFx(dt);
    effect.render(scene, cam);
  }

  function setSeat(seat) { mySeat = seat; }
  function reveal(species) { return models[species]; }
  return { update, fx, setSeat, reveal };
}
