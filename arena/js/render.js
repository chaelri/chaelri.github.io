// The island in 3D, seen by one shared camera that keeps every fighter in frame.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "../vendor/three/addons/utils/BufferGeometryUtils.js";
import { R, SHORE, BOXES, CIRCLES, heightAt } from "./map.js";
import { ICON, RARITY_COLOR } from "./icons.js";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function svgTex(svg) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => { const x = c.getContext("2d"); x.drawImage(img, 8, 8, 112, 112); t.needsUpdate = true; };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" '));
  return t;
}

export async function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7cc8f0);
  scene.fog = new THREE.Fog(0x9ad6f5, 120, 320);
  const Rn = rng(77);

  scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x6a8a4a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 200 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4;
  scene.add(sun);

  // ---------------- ocean ----------------
  const seaGeo = new THREE.PlaneGeometry(420, 420, 90, 90).rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x23b5d8, roughness: 0.25, metalness: 0.1, flatShading: true }));
  sea.position.y = -0.95;   // waves peak at -0.6; the island's lowest dip is -0.2
  sea.receiveShadow = true;
  scene.add(sea);
  const foam = new THREE.Mesh(new THREE.RingGeometry(SHORE - 1.2, SHORE + 1.2, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  foam.position.y = -0.7;
  scene.add(foam);

  // ---------------- island ----------------
  {
    const geo = new THREE.PlaneGeometry(2 * (SHORE + 8), 2 * (SHORE + 8), 140, 140).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const g1 = new THREE.Color(0x7ed957), g2 = new THREE.Color(0x6cc84a), sand = new THREE.Color(0xf3dfa2), wet = new THREE.Color(0xd8c088), dirt = new THREE.Color(0xc9a46a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
      pos.setY(i, heightAt(x, z));
      c.copy(Math.floor((x + z) / 6) % 2 ? g1 : g2);
      if (d < 12) c.lerp(dirt, 0.55 * (1 - d / 12));   // trampled courtyard
      if (d > R - 3) c.lerp(sand, Math.min(1, (d - R + 3) / 4));
      if (d > SHORE - 1) c.copy(wet);
      const n = Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.025;
      col[i * 3] = c.r + n; col[i * 3 + 1] = c.g + n; col[i * 3 + 2] = c.b + n;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    scene.add(m);
    // grass tufts + flowers
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.5, 4).translate(0, 0.25, 0), new THREE.MeshLambertMaterial({ color: 0x4fae38 }), 900);
    const flower = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshLambertMaterial(), 220);
    const M = new THREE.Matrix4(), cc = new THREE.Color();
    let ti = 0, fi = 0;
    while (ti < 900) {
      const a = Rn() * 6.28, r = 13 + Rn() * (R - 16), x = Math.cos(a) * r, z = Math.sin(a) * r;
      M.makeTranslation(x, heightAt(x, z), z); tuft.setMatrixAt(ti++, M);
      if (fi < 220 && Rn() < 0.25) { M.makeTranslation(x + 0.3, heightAt(x, z) + 0.3, z); flower.setMatrixAt(fi, M); flower.setColorAt(fi++, cc.setHex([0xff7ac0, 0xffd21f, 0xffffff, 0xc58cff][Math.floor(Rn() * 4)])); }
    }
    flower.count = fi;
    scene.add(tuft, flower);
  }

  // ---------------- obstacles ----------------
  const crateTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = "#c98a4b"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#8a5526"; x.lineWidth = 6;
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(0, i * 32 + 16); x.lineTo(w, i * 32 + 16); x.stroke(); }
    x.lineWidth = 12; x.strokeStyle = "#7a4518"; x.strokeRect(6, 6, w - 12, h - 12);
    x.beginPath(); x.moveTo(10, 10); x.lineTo(w - 10, h - 10); x.stroke();
  });
  const stone = new THREE.MeshStandardMaterial({ color: 0xd2c3a3, roughness: 0.9 });
  const stoneTop = new THREE.MeshStandardMaterial({ color: 0x9fb57a, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 });
  for (const b of BOXES) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), b.kind === "wall" ? stone : crateMat);
    m.position.set(b.x, b.h / 2, b.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if (b.kind === "wall") {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.2, 0.25, b.d + 0.2), stoneTop);
      cap.position.set(b.x, b.h + 0.1, b.z);
      cap.castShadow = true;
      scene.add(cap);
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9fa8, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa0723f, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x36b04a, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
  for (const c of CIRCLES) {
    if (c.kind === "rock") {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r * 1.05, 0), rockMat);
      m.position.set(c.x, c.r * 0.55, c.z);
      m.scale.y = 0.75;
      m.rotation.set(Rn(), Rn() * 6, Rn());
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    } else {
      const palm = new THREE.Group();
      const lean = (Rn() - 0.5) * 0.5;
      for (let k = 0; k < 6; k++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.32 - k * 0.025, 0.38 - k * 0.025, 1.1, 8), trunkMat);
        seg.position.set(Math.sin(lean) * k * 0.35 * k * 0.2, 0.55 + k * 1.0, 0);
        seg.castShadow = true;
        palm.add(seg);
      }
      const top = new THREE.Vector3(Math.sin(lean) * 5 * 0.35 * 5 * 0.2, 6.2, 0);
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.2, 4, 1, true).translate(0, 2.1, 0), leafMat);
        leaf.scale.z = 0.25;
        leaf.position.copy(top);
        leaf.rotation.set(0, (k / 7) * Math.PI * 2, 1.9);
        leaf.rotation.order = "YZX";
        leaf.castShadow = true;
        palm.add(leaf);
      }
      for (let k = 0; k < 3; k++) {
        const coco = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a1f }));
        coco.position.set(top.x + Math.cos(k * 2.1) * 0.4, top.y - 0.4, Math.sin(k * 2.1) * 0.4);
        palm.add(coco);
      }
      palm.position.set(c.x, 0, c.z);
      palm.rotation.y = Rn() * 6.28;
      scene.add(palm);
    }
  }
  // distant islets on the horizon
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Rn(), r = 150 + Rn() * 60;
    const m = new THREE.Mesh(new THREE.ConeGeometry(14 + Rn() * 16, 10 + Rn() * 22, 7), new THREE.MeshLambertMaterial({ color: 0x5aa83c, flatShading: true }));
    m.position.set(Math.cos(a) * r, 2, Math.sin(a) * r);
    scene.add(m);
  }

  // ---------------- critters ----------------
  const loader = new GLTFLoader();
  const models = {};
  await Promise.all(["yhon", "axolotl", "capybara", "hedgehog"].map((id) => new Promise((res) => {
    loader.load(`assets/${id}.glb`, (gl) => {
      const byMat = new Map();
      gl.scene.updateMatrixWorld(true);
      gl.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (!["position", "normal"].includes(k)) geo.deleteAttribute(k);
        if (!byMat.has(o.material.uuid)) byMat.set(o.material.uuid, { mat: o.material, geos: [] });
        byMat.get(o.material.uuid).geos.push(geo.index ? geo.toNonIndexed() : geo);
      });
      const grp = new THREE.Group();
      for (const { mat, geos } of byMat.values()) {
        const merged = mergeGeometries(geos);
        if (!merged) continue;
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = true;
        grp.add(m);
      }
      models[id] = grp;
      res();
    }, undefined, () => res());
  })));
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xeef2ff, transparent: true, opacity: 0.42, depthWrite: false });

  // held weapons: tiny props in the critter's arms
  function weaponProp(type) {
    const g = new THREE.Group();
    const mk = (geo, color, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 })); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (type === "arnis") mk(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8).rotateX(Math.PI / 2 - 0.4), 0xa0612b, 0, 0.1, 0.5);
    else if (type === "tirador") { mk(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0x7a4b2a, 0, 0, 0.3); mk(new THREE.BoxGeometry(0.4, 0.08, 0.08), 0x7a4b2a, 0, 0.25, 0.3); }
    else if (type === "ripple") { mk(new THREE.BoxGeometry(0.16, 0.2, 0.75), 0x3a3f4b, 0, 0, 0.45); mk(new THREE.BoxGeometry(0.1, 0.3, 0.12), 0x2fb24c, 0, -0.2, 0.4); }
    else if (type === "boga") { mk(new THREE.BoxGeometry(0.18, 0.18, 1.0), 0x555555, 0, 0, 0.55); mk(new THREE.BoxGeometry(0.2, 0.22, 0.4), 0x7a4b2a, 0, -0.02, 0.05); }
    else if (type === "paltik") { mk(new THREE.BoxGeometry(0.12, 0.12, 1.4), 0x4b4f5c, 0, 0, 0.7); mk(new THREE.BoxGeometry(0.14, 0.14, 0.35), 0xb06bff, 0, 0.16, 0.45); }
    else if (type === "bazooka") { mk(new THREE.CylinderGeometry(0.17, 0.17, 1.3, 12).rotateX(Math.PI / 2), 0x4f7a2f, 0, 0.12, 0.35); mk(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12).rotateX(Math.PI / 2), 0xffb703, 0, 0.12, 1.0); }
    return g;
  }

  const fighters = new Map();
  function fighter(p) {
    let f = fighters.get(p.id);
    if (f) return f;
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const model = models[p.char] ? models[p.char].clone() : new THREE.Mesh(new THREE.SphereGeometry(0.6), new THREE.MeshStandardMaterial({ color: p.color }));
    model.scale.setScalar(models[p.char] ? 0.031 : 1);
    body.add(model);
    const ghost = models[p.char] ? models[p.char].clone() : model.clone();
    ghost.traverse((o) => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; } });
    ghost.scale.setScalar(models[p.char] ? 0.031 : 1);
    ghost.visible = false;
    root.add(ghost);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.28, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9 }));
    ring.position.y = 0.06;
    root.add(ring);
    const hand = new THREE.Group();
    hand.position.set(-0.8, 0.85, 0.3);
    hand.scale.setScalar(1.35);
    body.add(hand);
    scene.add(root);
    f = { root, body, model, ghost, ring, hand, held: null, bob: 0, squash: 0 };
    fighters.set(p.id, f);
    return f;
  }

  // ---------------- chests ----------------
  const chestMeshes = [];
  function chestMesh(gold) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: gold ? 0xe0a21a : 0x9a5b2a, roughness: 0.6, metalness: gold ? 0.5 : 0 });
    const trim = new THREE.MeshStandardMaterial({ color: gold ? 0xfff1a0 : 0xffc928, roughness: 0.3, metalness: 0.8, emissive: gold ? 0x6a4a00 : 0x2a1c00 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), wood); base.position.y = 0.4; base.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.95), trim); band.position.y = 0.7;
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.8, -0.45);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
    lid.position.set(0, 0, 0.45); lid.castShadow = true;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), trim); lock.position.set(0, 0.62, 0.48);
    lidPivot.add(lid);
    g.add(base, band, lidPivot, lock);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: gold ? 0xffd21f : 0xfff1c0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.y = 3;
    g.add(glow);
    const prog = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.55, 40, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    prog.position.y = 0.08;
    g.add(prog);
    g.scale.setScalar(1.3);
    scene.add(g);
    return { g, lidPivot, glow, prog };
  }

  // ---------------- loot on the ground ----------------
  const lootTex = {};
  for (const [k, svg] of Object.entries(ICON)) lootTex[k] = svgTex(svg);
  const beamGeo = new THREE.CylinderGeometry(0.12, 0.35, 7, 10, 1, true).translate(0, 3.5, 0);
  const lootMeshes = new Map();
  function lootMesh(it) {
    let m = lootMeshes.get(it.id);
    if (m) return m;
    const g = new THREE.Group();
    const col = new THREE.Color(RARITY_COLOR[Math.max(0, it.rarity)]);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }));
    disc.position.y = 0.05;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: lootTex[it.type], transparent: true }));
    icon.scale.set(1.6, 1.6, 1);
    icon.position.y = 1.1;
    g.add(beam, disc, icon);
    scene.add(g);
    m = { g, icon };
    lootMeshes.set(it.id, m);
    return m;
  }

  // ---------------- shots, bombs ----------------
  const shotGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const rocketGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8).rotateX(Math.PI / 2);
  const shotMat = {
    tirador: new THREE.MeshBasicMaterial({ color: 0x8a6a4a }), ripple: new THREE.MeshBasicMaterial({ color: 0xfff3a0 }),
    boga: new THREE.MeshBasicMaterial({ color: 0xffd08a }), paltik: new THREE.MeshBasicMaterial({ color: 0xe0b0ff }),
    bazooka: new THREE.MeshStandardMaterial({ color: 0x4f7a2f }),
  };
  const shotMeshes = new Map();
  const bombMeshes = new Map();
  const bombGeo = new THREE.SphereGeometry(0.42, 16, 12);
  const bombMat = new THREE.MeshStandardMaterial({ color: 0x23242a, roughness: 0.4 });
  const ghostBombMat = new THREE.MeshBasicMaterial({ color: 0xb06bff, transparent: true, opacity: 0.8 });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false });

  // ---------------- storm ----------------
  const stormTex = canvasTex(256, 64, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "rgba(176,107,255,0)"); gr.addColorStop(0.6, "rgba(176,107,255,.55)"); gr.addColorStop(1, "rgba(120,40,220,.9)");
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,.25)"; x.lineWidth = 3;
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 30, 0); x.stroke(); }
  });
  stormTex.wrapS = THREE.RepeatWrapping; stormTex.repeat.x = 12;
  const stormWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 16, 96, 1, true).translate(0, 8, 0), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  stormWall.renderOrder = 5;
  scene.add(stormWall);
  const stormFloor = new THREE.Mesh(new THREE.RingGeometry(1, 30, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a1fa8, transparent: true, opacity: 0.32, depthWrite: false }));
  stormFloor.position.y = 0.12;
  scene.add(stormFloor);

  // ---------------- particles + flashes ----------------
  const PN = 2000;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pA = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute("alpha", new THREE.BufferAttribute(pA, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { scale: { value: 500 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
      void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = min(size * scale / -mv.z, 64.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); if (r > .5) discard; gl_FragColor = vec4(vC, vA * smoothstep(.5,.1,r)); }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  const tc = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    const i = pNext; pNext = (pNext + 1) % PN;
    pPos.set([x, y, z], i * 3); pVel.set([vx, vy, vz], i * 3);
    tc.setHex(color); pCol.set([tc.r, tc.g, tc.b], i * 3);
    pSize[i] = size; pLife[i] = pMax[i] = life; pGrav[i] = grav; pA[i] = 1;
  }
  function burst(x, y, z, n, colors, speed, size, life, grav = -12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = speed * (0.35 + Math.random() * 0.65), r = Math.sqrt(1 - u * u);
      emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.25, Math.sin(a) * r * s, colors[i % colors.length], size, life * (0.6 + Math.random() * 0.4), grav);
    }
  }
  const flashes = [];
  function flash(x, z, r, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, 0.6, z);
    scene.add(m);
    const light = new THREE.PointLight(color, 60, r * 6);
    light.position.set(x, 2, z);
    scene.add(light);
    flashes.push({ m, light, t: 0, r });
  }

  // ---------------- camera ----------------
  const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
  const camT = new THREE.Vector3(0, 0, 0);
  let camDist = 60, shake = 0;
  const TILT = 0.95;   // ~54 degrees down
  function frame(st, dt, focus) {
    const pts = focus || st.players.filter((p) => p.alive);
    const use = pts.length ? pts : st.players;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of use) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    if (!use.length) { x0 = x1 = z0 = z1 = 0; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const span = Math.max((x1 - x0) / aspect * 1.05, (z1 - z0) * 1.15);
    const want = Math.max(22, Math.min(78, span * 1.3 + 16));
    camDist += (want - camDist) * Math.min(1, dt * 2.2);
    camT.x += (cx - camT.x) * Math.min(1, dt * 3);
    camT.z += (cz + 1.5 - camT.z) * Math.min(1, dt * 3);
    const sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 3);
    cam.position.set(camT.x + sx, Math.sin(TILT) * camDist, camT.z + Math.cos(TILT) * camDist + sz);
    cam.lookAt(camT.x + sx * 0.5, 0, camT.z + sz * 0.5);
  }

  // ---------------- per-frame sync ----------------
  let time = 0;
  function update(st, dt) {
    time += dt;
    // waves
    const pos = seaGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.12 + time * 1.3) * 0.17 + Math.cos(z * 0.1 + time * 1.1) * 0.17);
    }
    pos.needsUpdate = true;
    foam.material.opacity = 0.4 + Math.sin(time * 2) * 0.15;

    // fighters
    const seen = new Set();
    for (const p of st.players) {
      seen.add(p.id);
      const f = fighter(p);
      const ghost = p.ghost;
      f.model.visible = !ghost;
      f.ghost.visible = ghost;
      f.ring.visible = !ghost;
      f.hand.visible = !ghost;
      f.root.position.set(p.x, ghost ? 1.6 + Math.sin(time * 3 + p.slot) * 0.3 : 0, p.z);
      f.root.rotation.y = p.face;
      f.bob += dt * (p.moving ? 14 : 3);
      const hop = p.moving ? Math.abs(Math.sin(f.bob)) * 0.22 : Math.sin(f.bob) * 0.03;
      f.body.position.y = hop;
      f.body.rotation.z = p.moving ? Math.sin(f.bob) * 0.12 : 0;
      const hurt = p.hurtT > 0 ? 1 + p.hurtT * 0.8 : 1;
      f.body.scale.set(hurt, 2 - hurt, hurt);
      const w = p.slots ? p.slots[p.active] : null, wt = w ? w.type : null;
      if (f.held !== wt) {
        f.hand.clear();
        if (wt) f.hand.add(weaponProp(wt));
        f.held = wt;
      }
      if (p.fast > 0 && p.moving && Math.random() < 0.5) emit(p.x, 0.2, p.z, 0, 0.6, 0, 0xffffff, 0.35, 0.4);
      if (p.inStorm && p.alive && Math.random() < 0.4) emit(p.x + (Math.random() - 0.5), 1 + Math.random(), p.z + (Math.random() - 0.5), 0, 1.5, 0, 0xb06bff, 0.35, 0.5);
    }
    for (const [id, f] of fighters) if (!seen.has(id)) { scene.remove(f.root); fighters.delete(id); }

    // chests
    while (chestMeshes.length < st.chests.length) chestMeshes.push(chestMesh(st.chests[chestMeshes.length].gold));
    st.chests.forEach((c, i) => {
      const m = chestMeshes[i];
      m.g.position.set(c.x, heightAt(c.x, c.z), c.z);
      const target = c.open ? -1.9 : c.prog > 0 ? -Math.sin(time * 40) * 0.08 * Math.min(1, c.prog * 3) : 0;
      m.lidPivot.rotation.x += (target - m.lidPivot.rotation.x) * Math.min(1, dt * 12);
      m.glow.visible = !c.open;
      m.glow.material.opacity = 0.12 + Math.sin(time * 3 + i) * 0.06;
      m.prog.visible = !c.open && c.prog > 0;
      if (m.prog.visible) { m.prog.geometry.dispose(); m.prog.geometry = new THREE.RingGeometry(1.3, 1.55, 40, 1, Math.PI / 2, (c.prog / 0.7) * Math.PI * 2).rotateX(-Math.PI / 2); }
    });

    // loot
    const live = new Set(st.loot.map((l) => l.id));
    for (const [id, m] of lootMeshes) if (!live.has(id)) { scene.remove(m.g); lootMeshes.delete(id); }
    for (const it of st.loot) {
      const m = lootMesh(it);
      m.g.position.set(it.x, heightAt(it.x, it.z), it.z);
      m.icon.position.y = 1.15 + Math.sin(time * 2.5 + it.id) * 0.15;
    }

    // shots
    const liveShots = new Set(st.shots.map((s) => s.id));
    for (const [id, m] of shotMeshes) if (!liveShots.has(id)) { scene.remove(m); shotMeshes.delete(id); }
    for (const s of st.shots) {
      let m = shotMeshes.get(s.id);
      if (!m) { m = new THREE.Mesh(s.w === "bazooka" ? rocketGeo : shotGeo, shotMat[s.w] || shotMat.ripple); scene.add(m); shotMeshes.set(s.id, m); }
      m.position.set(s.x, 1.0, s.z);
      m.rotation.y = Math.atan2(s.vx, s.vz);
      if (s.w === "bazooka") emit(s.x, 1, s.z, (Math.random() - 0.5), 0.8, (Math.random() - 0.5), Math.random() < 0.5 ? 0xdddddd : 0xffa040, 0.6, 0.6, 0);
      else if (s.w === "paltik") emit(s.x, 1, s.z, 0, 0, 0, 0xe0b0ff, 0.35, 0.25);
    }
    // bombs
    const liveBombs = new Set(st.bombs);
    for (const [b, m] of bombMeshes) if (!liveBombs.has(b)) { scene.remove(m.g); bombMeshes.delete(b); }
    for (const b of st.bombs) {
      let m = bombMeshes.get(b);
      if (!m) {
        const g = new THREE.Group();
        const ball = new THREE.Mesh(bombGeo, b.ghost ? ghostBombMat : bombMat);
        ball.castShadow = true;
        const warn = new THREE.Mesh(new THREE.CircleGeometry(b.r, 40).rotateX(-Math.PI / 2), warnMat.clone());
        warn.position.y = 0.1;
        g.add(ball, warn);
        scene.add(g);
        m = { g, ball, warn };
        bombMeshes.set(b, m);
      }
      m.g.position.set(b.x, 0, b.z);
      m.ball.position.y = 0.42 + (b.y || 0) + (b.ghost ? 1.5 * Math.max(0, b.fuse) : 0);
      m.warn.material.opacity = 0.2 + (Math.sin(time * (b.fuse < 0.5 ? 40 : 14)) * 0.5 + 0.5) * 0.3;
      if (Math.random() < 0.6) emit(b.x, m.ball.position.y + 0.5, b.z, 0, 1.5, 0, 0xffb703, 0.3, 0.3);
    }

    // storm
    const s = st.storm;
    if (s) {
      stormWall.visible = s.r < R + 6;
      stormWall.scale.set(s.r, 1, s.r);
      stormWall.position.set(s.x, -1, s.z);
      stormTex.offset.x = (time * 0.05) % 1;
      stormFloor.visible = stormWall.visible;
      stormFloor.position.x = s.x; stormFloor.position.z = s.z;
      stormFloor.geometry.dispose();
      stormFloor.geometry = new THREE.RingGeometry(Math.max(0.01, s.r), s.r + 200, 96, 1).rotateX(-Math.PI / 2);
    }

    // particles + flashes
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pA[i] = 0; continue; }
      pLife[i] -= dt;
      pVel[i * 3 + 1] += pGrav[i] * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pA[i] = Math.max(0, pLife[i] / pMax[i]);
    }
    for (const k of ["position", "alpha", "color", "size"]) pGeo.attributes[k].needsUpdate = true;
    for (const f of flashes) {
      f.t += dt;
      const k = f.t / 0.35;
      f.m.scale.setScalar(f.r * (0.3 + k));
      f.m.material.opacity = Math.max(0, 0.8 * (1 - k));
      f.light.intensity = Math.max(0, 60 * (1 - k));
      if (k >= 1) { scene.remove(f.m, f.light); f.done = true; }
    }
    for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].done) flashes.splice(i, 1);
  }

  function fx(e, st) {
    const p = e.p && st.players.find((q) => q.id === e.p);
    if (e.t === "boom") { flash(e.x, e.z, e.r, 0xffa040); burst(e.x, 0.8, e.z, 46, [0xffd21f, 0xff7a1a, 0xe8312b, 0x555555], 12, 0.7, 0.8); shake = Math.min(1.6, shake + 0.9); }
    if (e.t === "hit") burst(e.x, 1.1, e.z, 8, e.shield ? [0x3fa9ff, 0xffffff] : [0xff4d4d, 0xffffff], 6, 0.3, 0.35);
    if (e.t === "spark") burst(e.x, 1, e.z, 5, [0xfff3a0, 0xffffff], 4, 0.25, 0.25);
    if (e.t === "kill") { burst(e.x, 1.2, e.z, 40, [0xffffff, 0xeef2ff, 0xb06bff], 9, 0.6, 0.9, -4); shake = Math.min(1.6, shake + 0.5); }
    if (e.t === "chest") { const c = st.chests[e.i]; burst(c.x, 1, c.z, e.gold ? 70 : 36, e.gold ? [0xffd21f, 0xfff1a0, 0xffb703] : [0xffd21f, 0xffffff, 0x3fa9ff], 9, 0.45, 0.9); }
    if (e.t === "pickup" && p) burst(p.x, 1.2, p.z, 14, [RARITY_COLOR[Math.max(0, e.rarity)].replace("#", "0x") * 1], 5, 0.35, 0.5);
    if (e.t === "use" && p) burst(p.x, 1.2, p.z, 18, e.item === "buko" ? [0x5ee35e, 0xffffff] : e.item === "kalasag" ? [0x3fa9ff, 0xffffff] : [0xffffff], 5, 0.4, 0.6, -2);
    if (e.t === "swing" && p) { const a = p.face; for (let k = -3; k <= 3; k++) emit(p.x + Math.sin(a + k * 0.25) * 1.5, 1, p.z + Math.cos(a + k * 0.25) * 1.5, 0, 0, 0, 0xffffff, 0.35, 0.18); }
    if (e.t === "shoot" && p && e.w !== "bazooka") emit(p.x + Math.sin(p.face) * 0.9, 1, p.z + Math.cos(p.face) * 0.9, 0, 0, 0, 0xfff3a0, 0.6, 0.06);
  }

  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return [(v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight, v.z < 1];
  }

  function render() {
    const W = canvas.clientWidth, H = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(W * pr) || canvas.height !== Math.floor(H * pr)) renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    pMat.uniforms.scale.value = H * pr * 0.9;
    renderer.render(scene, cam);
  }

  function reset() {
    for (const m of chestMeshes) scene.remove(m.g);
    chestMeshes.length = 0;
    for (const m of lootMeshes.values()) scene.remove(m.g);
    lootMeshes.clear();
    for (const f of fighters.values()) scene.remove(f.root);
    fighters.clear();
  }

  return { renderer, update, fx, frame, render, project, reset, cam };
}
