// The 3D world: terrain, road, scenery, karts with critter drivers, items,
// particles, and up to four chase cameras drawn into one canvas (split screen).
import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "../vendor/three/addons/utils/BufferGeometryUtils.js";
import { HALF, CURB, WALL, LAKE, groundAt, distToTrack } from "./track.js";

const SPARK = [0xffffff, 0x4fc3ff, 0xff9a1f, 0xd05cff];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export async function createWorld(T, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcdeaff, 260, 950);
  const R = rng(1234);

  // ---------------- sky ----------------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f86e6) }, mid: { value: new THREE.Color(0x8fcbff) }, bot: { value: new THREE.Color(0xe6f6ff) } },
    vertexShader: "varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 top, mid, bot; varying vec3 v; void main(){ float h = v.y; vec3 c = h > .12 ? mix(mid, top, smoothstep(.12,.6,h)) : mix(bot, mid, smoothstep(-.02,.12,h)); gl_FragColor = vec4(c,1.); }",
  }));
  scene.add(sky);

  // ---------------- light ----------------
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x4f7f2f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  const cx = -5, cz = -106;
  sun.position.set(cx + 160, 260, cz + 110);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 200, bottom: -200, near: 50, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ---------------- terrain ----------------
  const g = T.grid;
  {
    const geo = new THREE.PlaneGeometry((g.nx - 1) * 3, (g.nz - 1) * 3, g.nx - 1, g.nz - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color(0x74c94f), grassB = new THREE.Color(0x62b743), far = new THREE.Color(0x8cbf4a);
    const rock = new THREE.Color(0x8a7f6e), snow = new THREE.Color(0xf4f8ff), sand = new THREE.Color(0xe9d39a);
    for (let i = 0; i < pos.count; i++) {
      const ix = i % g.nx, iz = Math.floor(i / g.nx);
      const x = g.x0 + ix * 3, z = g.z0 + iz * 3;
      const h = g.h[iz * g.nx + ix], d = g.dist[iz * g.nx + ix];
      pos.setXYZ(i, x, h, z);
      // mowed stripes near the circuit, wilder grass further out, rock and snow on the peaks
      const stripe = Math.floor((x * 0.7 + z * 0.7) / 7) % 2 === 0;
      c.copy(stripe ? grassA : grassB);
      c.lerp(far, Math.min(1, Math.max(0, (d - 60) / 140)));
      if (h > 14) c.lerp(rock, Math.min(1, (h - 14) / 12));
      if (h > 36) c.lerp(snow, Math.min(1, (h - 36) / 6));
      const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      if (ld < LAKE.r + 6 && h < LAKE.level + 1.2) c.copy(sand);
      const n = (Math.sin(x * 0.37) * Math.cos(z * 0.41)) * 0.03;
      col[i * 3] = c.r + n; col[i * 3 + 1] = c.g + n; col[i * 3 + 2] = c.b + n;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---------------- road, curbs, fences ----------------
  const roadTex = canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = "#5b5e66"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 70 + Math.random() * 40;
      x.fillStyle = `rgba(${v},${v},${v + 6},.55)`;
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    x.fillStyle = "#f4f4f4";
    x.fillRect(6, 0, 7, h); x.fillRect(w - 13, 0, 7, h);
    x.fillStyle = "rgba(255,255,255,.55)";
    x.fillRect(w / 2 - 3, 0, 6, h / 2);
  });
  const curbTex = canvasTex(32, 64, (x, w, h) => {
    x.fillStyle = "#e5262b"; x.fillRect(0, 0, w, h / 2);
    x.fillStyle = "#ffffff"; x.fillRect(0, h / 2, w, h / 2);
  });
  function ribbon(lat0, lat1, lift, vScale, mat, close = true) {
    const n = T.n, P = [], UV = [], I = [];
    for (let k = 0; k <= n; k++) {
      const p = T.S[k % n];
      const s = k * T.ds;
      for (const [lat, u] of [[lat0, 0], [lat1, 1]]) {
        P.push(p.x + p.nx * lat, p.y + lift, p.z + p.nz * lat);
        UV.push(u, s / vScale);
      }
      if (k < n) { const a = k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }  // wound to face up
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  ribbon(HALF, -HALF, 0.06, 14, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1 }));
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.7 });
  ribbon(HALF + CURB, HALF, 0.09, 3, curbMat);
  ribbon(-HALF, -HALF - CURB, 0.09, 3, curbMat);

  // fences: alternating panels, MK style
  {
    const P = [], Cc = [];
    const cols = [new THREE.Color(0xe8312b), new THREE.Color(0xffffff), new THREE.Color(0x2a6fe8), new THREE.Color(0xffffff)];
    for (const side of [1, -1]) {
      for (let k = 0; k < T.n; k += 2) {
        const a = T.S[k], b = T.S[(k + 2) % T.n];
        const ax = a.x + a.nx * WALL * side, az = a.z + a.nz * WALL * side, bx = b.x + b.nx * WALL * side, bz = b.z + b.nz * WALL * side;
        const ay = groundAt(T, ax, az), by = groundAt(T, bx, bz);
        const lo = Math.min(ay, a.y) - 0.3, lo2 = Math.min(by, b.y) - 0.3;
        const ht = 1.15;
        P.push(ax, lo, az, bx, lo2, bz, ax, Math.max(ay, a.y) + ht, az, bx, lo2, bz, bx, Math.max(by, b.y) + ht, bz, ax, Math.max(ay, a.y) + ht, az);
        const c = cols[(k / 2 + (side > 0 ? 0 : 1)) % 4];
        for (let q = 0; q < 6; q++) Cc.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(Cc, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.castShadow = true;
    scene.add(m);
  }

  // start line checker + boost pads
  const checker = canvasTex(256, 32, (x, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#fff"; x.fillRect(i * 16, j * 16, 16, 16); }
  }, false);
  function decal(idx, lat, w, l, mat, lift = 0.1) {
    const p = T.S[idx];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    m.rotation.order = "YXZ";
    m.rotation.set(-Math.PI / 2, p.h, 0);
    m.position.set(p.x + p.nx * lat, p.y + lift, p.z + p.nz * lat);
    scene.add(m);
    return m;
  }
  decal(0, 0, HALF * 2, 2.6, new THREE.MeshStandardMaterial({ map: checker, roughness: 0.8 }));
  const padTex = canvasTex(64, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#ff6a00"); gr.addColorStop(1, "#ffd21f");
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = "#fff8";
    for (const y of [0, 64]) { x.beginPath(); x.moveTo(8, y + 54); x.lineTo(32, y + 14); x.lineTo(56, y + 54); x.lineTo(44, y + 54); x.lineTo(32, y + 34); x.lineTo(20, y + 54); x.fill(); }
  });
  padTex.repeat.set(1, 2);
  const padMat = new THREE.MeshBasicMaterial({ map: padTex });
  const pads = [];

  // start gate
  {
    const p = T.S[3], gate = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe8312b, roughness: 0.5 });
    for (const s of [1, -1]) {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9, 16), s > 0 ? red : pillarMat);
      pil.position.set(s * (HALF + 2.5), 4.5, 0);
      pil.castShadow = true;
      gate.add(pil);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), new THREE.MeshStandardMaterial({ color: s > 0 ? 0xffd21f : 0x2a6fe8, roughness: 0.35 }));
      ball.position.set(s * (HALF + 2.5), 10.4, 0);
      gate.add(ball);
    }
    const ban = canvasTex(1024, 160, (x, w, h) => {
      x.fillStyle = "#1546b0"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) { x.fillStyle = i % 2 ? "#fff" : "#111"; x.fillRect(i * 16, 0, 16, 14); x.fillRect(i * 16 + 16 * ((i + 1) % 2 ? 0 : 0), h - 14, 16, 14); }
      x.font = "900 96px 'Arial Black', Avenir Next, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.lineWidth = 10; x.strokeStyle = "#7a0d09"; x.strokeText("KARERA", w / 2, h / 2 + 4);
      x.fillStyle = "#ffd21f"; x.fillText("KARERA", w / 2, h / 2 + 4);
    }, false);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF + 6, 2.6, 0.8), [pillarMat, pillarMat, pillarMat, pillarMat,
      new THREE.MeshStandardMaterial({ map: ban, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: ban, roughness: 0.6 })]);
    beam.position.y = 8;
    beam.castShadow = true;
    gate.add(beam);
    gate.position.set(p.x, p.y, p.z);
    gate.rotation.y = p.h;
    scene.add(gate);
  }

  // grandstand with a crowd along the start straight
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.8 });
    const crowdGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshLambertMaterial(), 900);
    let ci = 0;
    const M4 = new THREE.Matrix4(), col = new THREE.Color();
    const pal = [0xe8312b, 0x2a6fe8, 0xffd21f, 0x2fb24c, 0xff7ac0, 0xffffff, 0xff8a1f, 0x8a5cff];
    for (let k = -14; k <= 30; k += 4) {
      const p = T.S[(k + T.n) % T.n];
      for (let row = 0; row < 5; row++) {
        const lat = -(WALL + 5 + row * 2.2);
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8 + row * 0.9, T.ds * 4 + 0.05), mat);
        const bx = p.x + p.nx * lat, bz = p.z + p.nz * lat, gy = groundAt(T, bx, bz);
        b.position.set(bx, gy + (0.8 + row * 0.9) / 2, bz);
        b.rotation.y = p.h;
        b.receiveShadow = b.castShadow = true;
        scene.add(b);
        for (let s = 0; s < 4 && ci < 900; s++) {
          const off = (s - 1.5) * 2 + (R() - 0.5) * 0.4;
          M4.makeTranslation(bx + p.tx * off, gy + 0.8 + row * 0.9 + 0.45, bz + p.tz * off);
          crowd.setMatrixAt(ci, M4);
          crowd.setColorAt(ci++, col.setHex(pal[Math.floor(R() * pal.length)]));
        }
      }
    }
    crowd.count = ci;
    crowd.userData.base = [];
    for (let i = 0; i < ci; i++) { crowd.getMatrixAt(i, M4); crowd.userData.base.push(new THREE.Vector3().setFromMatrixPosition(M4)); }
    scene.add(crowd);
    scene.userData.crowd = crowd;
  }

  // trees, pines, bushes
  {
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 7).translate(0, 1.5, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0);
    const pineGeo = mergeGeometries([new THREE.ConeGeometry(2.6, 4.2, 8).translate(0, 4, 0), new THREE.ConeGeometry(2.0, 3.6, 8).translate(0, 6.2, 0), new THREE.ConeGeometry(1.3, 3, 8).translate(0, 8.2, 0)]);
    const bushGeo = new THREE.IcosahedronGeometry(1, 1).translate(0, 0.6, 0);
    const NT = 700, NP = 450, NB = 380;
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4b2a }), NT + NP);
    const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ flatShading: true }), NT);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ flatShading: true }), NP);
    const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ flatShading: true }), NB);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    let ti = 0, ci = 0, pi = 0, bi = 0;
    const spot = (minD, maxD, maxH) => {
      for (let tries = 0; tries < 60; tries++) {
        const x = g.x0 + 60 + R() * ((g.nx - 1) * 3 - 120), z = g.z0 + 60 + R() * ((g.nz - 1) * 3 - 120);
        const d = distToTrack(T, x, z), h = groundAt(T, x, z);
        if (d < minD || d > maxD || h > maxH || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) continue;
        return [x, h, z, d];
      }
      return null;
    };
    while (ci < NT) {
      const s = spot(WALL + 4, 330, 22);
      if (!s) break;
      const k = 0.8 + R() * 0.7;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
      M4.compose(ps.set(s[0], s[1] - 0.2, s[2]), q, sc.set(k, k * (0.9 + R() * 0.3), k));
      trunks.setMatrixAt(ti++, M4);
      canopy.setMatrixAt(ci, M4);
      canopy.setColorAt(ci++, col.setHSL(0.27 + R() * 0.08, 0.62, 0.36 + R() * 0.12));
    }
    while (pi < NP) {
      const s = spot(WALL + 8, 420, 34);
      if (!s) break;
      const k = 0.8 + R() * 0.9;
      M4.compose(ps.set(s[0], s[1] - 0.2, s[2]), q.identity(), sc.set(k, k, k));
      trunks.setMatrixAt(ti++, M4);
      pines.setMatrixAt(pi, M4);
      pines.setColorAt(pi++, col.setHSL(0.33 + R() * 0.05, 0.55, 0.24 + R() * 0.08));
    }
    const flowers = [0xff7ac0, 0xffd21f, 0xffffff, 0xff8a1f, 0xc58cff];
    while (bi < NB) {
      const s = spot(WALL + 1.5, WALL + 14, 20);
      if (!s) break;
      const k = 0.7 + R() * 0.8;
      M4.compose(ps.set(s[0], s[1], s[2]), q.identity(), sc.set(k * 1.3, k, k * 1.3));
      bushes.setMatrixAt(bi, M4);
      bushes.setColorAt(bi++, R() < 0.55 ? col.setHSL(0.3, 0.6, 0.33) : col.setHex(flowers[Math.floor(R() * flowers.length)]));
    }
    trunks.count = ti; canopy.count = ci; pines.count = pi; bushes.count = bi;
    for (const m of [trunks, canopy, pines, bushes]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // lake
  {
    const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 14, 64), new THREE.MeshStandardMaterial({ color: 0x2f9fe6, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(LAKE.x, LAKE.level, LAKE.z);
    scene.add(water);
    scene.userData.water = water;
  }

  // clouds
  const clouds = [];
  {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x9fb8cf, emissiveIntensity: 0.35 });
    for (let i = 0; i < 26; i++) {
      const parts = [];
      const n = 4 + Math.floor(R() * 4);
      for (let j = 0; j < n; j++) parts.push(new THREE.IcosahedronGeometry(8 + R() * 9, 1).translate((j - n / 2) * 10 + R() * 4, R() * 5, R() * 8));
      const c = new THREE.Mesh(mergeGeometries(parts), mat);
      const a = R() * 6.28, r = 200 + R() * 600;
      c.position.set(cx + Math.cos(a) * r, 95 + R() * 70, cz + Math.sin(a) * r);
      c.scale.y = 0.6;
      c.userData.v = 1 + R() * 2;
      scene.add(c);
      clouds.push(c);
    }
  }

  // ---------------- critter drivers ----------------
  const loader = new GLTFLoader();
  const models = {};
  await Promise.all(["yhon", "axolotl", "capybara", "hedgehog"].map((id) => new Promise((res) => {
    loader.load(`assets/${id}.glb`, (gl) => {
      // merge each model's meshes by material: ~25 draw calls become ~8
      const byMat = new Map();
      gl.scene.updateMatrixWorld(true);
      gl.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(geo.attributes)) if (!["position", "normal"].includes(k)) geo.deleteAttribute(k);
        const key = o.material.uuid;
        if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [] });
        byMat.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
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

  // ---------------- karts ----------------
  const wheelGeoF = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 18).rotateZ(Math.PI / 2);
  const wheelGeoR = new THREE.CylinderGeometry(0.44, 0.44, 0.46, 18).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12).rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.25 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.6 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  function nameTag(name, color) {
    const t = canvasTex(256, 64, (x, w, h) => {
      x.font = "900 40px Avenir Next, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.lineWidth = 8; x.strokeStyle = "rgba(0,0,0,.65)"; x.strokeText(name, w / 2, h / 2);
      x.fillStyle = color; x.fillText(name, w / 2, h / 2);
    }, false);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(3.2, 0.8, 1);
    s.position.y = 3.1;
    s.renderOrder = 10;
    return s;
  }

  function buildKart(k) {
    const root = new THREE.Group();     // position + heading
    const body = new THREE.Group();     // lean, drift yaw, hop, spin
    root.add(body);
    const paint = new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.32, metalness: 0.25 });
    const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; body.add(m); return m; };
    add(new THREE.BoxGeometry(1.5, 0.32, 2.5), paint, 0, 0.42, 0);                        // tub
    add(new THREE.BoxGeometry(1.2, 0.28, 1.0), paint, 0, 0.5, 1.45, -0.22);              // nose
    add(new THREE.BoxGeometry(1.9, 0.18, 0.5), darkMat, 0, 0.32, 1.95);                  // front bumper
    add(new THREE.BoxGeometry(0.42, 0.34, 1.5), paint, 0.98, 0.42, -0.1);                 // side pods
    add(new THREE.BoxGeometry(0.42, 0.34, 1.5), paint, -0.98, 0.42, -0.1);
    add(new THREE.BoxGeometry(0.95, 0.75, 0.2), darkMat, 0, 0.9, -0.55, -0.2);             // seat back
    add(new THREE.BoxGeometry(1.1, 0.45, 0.8), chrome, 0, 0.66, -1.15);                    // engine
    for (const s of [0.28, -0.28]) add(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10), chrome, s, 0.72, -1.6, Math.PI / 2 - 0.25);
    add(new THREE.BoxGeometry(1.8, 0.08, 0.45), paint, 0, 1.25, -1.45);                    // spoiler
    for (const s of [0.6, -0.6]) add(new THREE.BoxGeometry(0.07, 0.45, 0.25), darkMat, s, 1.02, -1.45);
    const wheelSpin = [], frontPivots = [];
    for (const [x, z, front] of [[0.95, 1.05, 1], [-0.95, 1.05, 1], [1.02, -1.0, 0], [-1.02, -1.0, 0]]) {
      const piv = new THREE.Group();
      piv.position.set(x, front ? 0.36 : 0.44, z);
      const w = new THREE.Mesh(front ? wheelGeoF : wheelGeoR, tireMat);
      w.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, paint);
      hub.scale.set(front ? 0.8 : 1, 1, 1);
      w.add(hub);
      piv.add(w);
      body.add(piv);
      wheelSpin.push(w);
      if (front) frontPivots.push(piv);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), darkMat);
    wheel.position.set(0, 0.95, 0.55); wheel.rotation.x = -0.9;
    body.add(wheel);
    const flames = [];
    for (const s of [0.28, -0.28]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 10).rotateX(-Math.PI / 2), flameMat);
      f.position.set(s, 0.78, -2.05);
      f.visible = false;
      body.add(f);
      flames.push(f);
    }
    if (models[k.char]) {
      const d = models[k.char].clone();
      d.scale.setScalar(0.0175);
      d.position.set(0, 0.48, -0.25);
      body.add(d);
    }
    const tag = nameTag(k.name || "", k.color);
    root.add(tag);
    scene.add(root);
    return { root, body, paint, wheelSpin, frontPivots, flames, tag, spinA: 0, lean: 0, roll: 0, baseColor: new THREE.Color(k.color) };
  }

  // ---------------- item boxes, coins, objects ----------------
  const boxTex = canvasTex(128, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h);
    ["#ff4d6d", "#ffb703", "#5ee35e", "#3fa9ff", "#b06bff"].forEach((c, i) => gr.addColorStop(i / 4, c));
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,255,255,.35)"; x.fillRect(6, 6, w - 12, h - 12);
    x.font = "900 92px Arial Black, Arial"; x.textAlign = "center"; x.textBaseline = "middle";
    x.lineWidth = 8; x.strokeStyle = "#7a3cff"; x.strokeText("?", w / 2, h / 2 + 6);
    x.fillStyle = "#fff"; x.fillText("?", w / 2, h / 2 + 6);
  }, false);
  const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, transparent: true, opacity: 0.88, roughness: 0.2, emissive: 0x332244, emissiveMap: boxTex, emissiveIntensity: 0.6 });
  const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 24).rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.75, roughness: 0.25, emissive: 0x5a3c00, emissiveIntensity: 0.6 });
  const objGeo = {
    banana: new THREE.TorusGeometry(0.45, 0.17, 10, 18, Math.PI * 1.1),
    shell: new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.66, 0.66, 0.18, 20),
  };
  const objMat = {
    banana: new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.45 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2fb24c, roughness: 0.3 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe8312b, roughness: 0.3 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
  };

  let boxMeshes = [], coinMeshes = [];
  const objMeshes = new Map();

  // ---------------- particles ----------------
  const PN = 2400;
  const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pA = new Float32Array(PN);
  const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute("alpha", new THREE.BufferAttribute(pA, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 500 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      uniform float scale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.);
      gl_PointSize = min(size * scale / -mv.z, 48.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d);
      if (r > .5) discard; gl_FragColor = vec4(vC, vA * smoothstep(.5, .1, r)); }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pNext = 0;
  const tmpC = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    const i = pNext; pNext = (pNext + 1) % PN;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    tmpC.setHex(color);
    pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
    pSize[i] = size; pLife[i] = pMax[i] = life; pGrav[i] = grav; pA[i] = 1;
  }
  function burst(x, y, z, n, colors, speed, size, life, grav = -9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - u * u);
      emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.3, Math.sin(a) * r * s, colors[i % colors.length], size, life * (0.6 + Math.random() * 0.4), grav);
    }
  }
  function stepParticles(dt) {
    for (let i = 0; i < PN; i++) {
      if (pLife[i] <= 0) { pA[i] = 0; continue; }
      pLife[i] -= dt;
      pVel[i * 3 + 1] += pGrav[i] * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pA[i] = Math.max(0, pLife[i] / pMax[i]);
    }
    for (const k of ["position", "alpha"]) pGeo.attributes[k].needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    pGeo.attributes.size.needsUpdate = true;
  }

  // ---------------- race binding ----------------
  let karts = new Map();
  function bind(st) {
    for (const v of karts.values()) scene.remove(v.root);
    karts = new Map();
    for (const k of st.karts) karts.set(k.id, buildKart(k));
    for (const m of [...boxMeshes, ...coinMeshes, ...pads]) scene.remove(m);
    boxMeshes = st.boxes.map((b) => { const m = new THREE.Mesh(boxGeo, boxMat); m.castShadow = true; scene.add(m); return m; });
    coinMeshes = st.coins.map(() => { const m = new THREE.Mesh(coinGeo, coinMat); m.castShadow = true; scene.add(m); return m; });
    pads.length = 0;
    for (const p of st.pads) pads.push(decal(p.idx, p.lat, 4.4, 6, padMat, 0.11));
    for (const m of objMeshes.values()) scene.remove(m);
    objMeshes.clear();
  }

  function objMesh(o) {
    let m = objMeshes.get(o);
    if (m) return m;
    if (o.type === "banana") {
      m = new THREE.Mesh(objGeo.banana, objMat.banana);
      m.rotation.set(0, 0, Math.PI * 0.95);
    } else {
      m = new THREE.Group();
      const dome = new THREE.Mesh(objGeo.shell, objMat[o.type]);
      dome.position.y = 0.12;
      const rim = new THREE.Mesh(objGeo.rim, objMat.rim);
      m.add(dome, rim);
    }
    m.traverse((c) => (c.castShadow = true));
    scene.add(m);
    objMeshes.set(o, m);
    return m;
  }

  // ---------------- per-frame update ----------------
  const v3 = new THREE.Vector3();
  let time = 0;
  function update(st, dt) {
    time += dt;
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > cx + 900) c.position.x -= 1800; }
    padTex.offset.y = (padTex.offset.y - dt * 1.6) % 1;
    const crowd = scene.userData.crowd;
    if (crowd && Math.floor(time * 20) % 2 === 0) {
      const M4 = new THREE.Matrix4();
      crowd.userData.base.forEach((b, i) => {
        M4.makeTranslation(b.x, b.y + Math.max(0, Math.sin(time * 7 + i * 1.7)) * 0.35, b.z);
        crowd.setMatrixAt(i, M4);
      });
      crowd.instanceMatrix.needsUpdate = true;
    }
    st.boxes.forEach((b, i) => {
      const m = boxMeshes[i];
      const s = b.gone <= 0 ? 1 : b.gone < 0.4 ? 1 - b.gone / 0.4 : 0;   // grows back in its last 0.4 s
      m.visible = s > 0.01;
      m.scale.setScalar(Math.max(0.01, s));
      m.position.set(b.x, b.y + 1.4 + Math.sin(time * 2.4 + i) * 0.2, b.z);
      m.rotation.set(time * 0.9 + i, time * 1.3 + i, 0);
    });
    st.coins.forEach((c, i) => {
      const m = coinMeshes[i];
      m.visible = c.gone <= 0;
      m.position.set(c.x, c.y + 0.9 + Math.sin(time * 3 + i * 0.5) * 0.12, c.z);
      m.rotation.y = time * 3.2 + i * 0.4;
    });
    const live = new Set(st.objs);
    for (const [o, m] of objMeshes) if (!live.has(o)) { scene.remove(m); objMeshes.delete(o); }
    for (const o of st.objs) {
      const m = objMesh(o);
      m.position.set(o.x, o.y + (o.type === "banana" ? 0.45 : 0.3), o.z);
      if (o.type !== "banana") m.rotation.y = time * 14;
      if (o.type === "red" && Math.random() < 0.6) emit(o.x, o.y + 0.4, o.z, 0, 0.5, 0, 0xff5a3a, 0.5, 0.35);
    }

    for (const k of st.karts) {
      const v = karts.get(k.id);
      if (!v) continue;
      v.root.position.set(k.x, k.y, k.z);
      v.root.rotation.y = k.h;
      // body: spin when hit, drift yaw, lean into turns, hop
      if (k.spin > 0) v.spinA += dt * 13;
      else if (v.spinA > 0) {   // finish the current turn instead of snapping back
        const next = v.spinA + dt * 13, end = Math.ceil(v.spinA / (Math.PI * 2)) * Math.PI * 2;
        v.spinA = next >= end ? 0 : next;
      }
      const driftYaw = k.drift ? k.drift * -0.42 : 0;
      v.lean += ((k.drift ? -k.drift * 0.12 : -k.input.steer * 0.07 * Math.min(1, Math.abs(k.speed) / 15)) - v.lean) * Math.min(1, dt * 8);
      v.body.rotation.set(0, driftYaw + v.spinA, v.lean);
      v.body.position.y = k.hop > 0 ? Math.sin((0.22 - k.hop) / 0.22 * Math.PI) * 0.45 : 0;
      const sc = k.shrink > 0 ? 0.6 : 1;
      v.root.scale.setScalar(v.root.scale.x + (sc - v.root.scale.x) * Math.min(1, dt * 6));
      v.roll += k.speed * dt / 0.4;
      for (const w of v.wheelSpin) w.rotation.x = v.roll;
      for (const p of v.frontPivots) p.rotation.y = -k.input.steer * 0.45;
      const flame = k.boost > 0;
      for (const f of v.flames) { f.visible = flame; if (flame) f.scale.set(1, 1, 0.8 + Math.random() * 0.6); }
      // star: rainbow paint; recovering from a hit: blink
      if (k.star > 0) v.paint.color.setHSL((time * 2) % 1, 0.9, 0.55);
      else v.paint.color.copy(v.baseColor);
      v.root.visible = !(k.safe > 0 && k.spin <= 0 && Math.floor(time * 16) % 2 === 0);

      const fx = Math.sin(k.h), fz = Math.cos(k.h), lx = Math.cos(k.h), lz = -Math.sin(k.h);
      // drift sparks from the rear wheels
      if (k.drift && Math.random() < 0.9) {
        const col = SPARK[k.driftLevel];
        for (const s of [1, -1]) emit(k.x - fx * 1.1 + lx * s, k.y + 0.15, k.z - fz * 1.1 + lz * s,
          -fx * 3 + (Math.random() - 0.5) * 4, 1.5 + Math.random() * 2, -fz * 3 + (Math.random() - 0.5) * 4, col, k.driftLevel ? 0.5 : 0.28, 0.3, -12);
      }
      if (k.boost > 0) emit(k.x - fx * 2.1, k.y + 0.75, k.z - fz * 2.1, -fx * 6, 1, -fz * 6, Math.random() < 0.5 ? 0xff7a1a : 0xffd21f, 0.7, 0.25);
      if (k.offroad && Math.abs(k.speed) > 6 && Math.random() < 0.3) emit(k.x - fx * 1.2 + (Math.random() - 0.5) * 1.6, k.y + 0.25, k.z - fz * 1.2 + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 3, 1.8, (Math.random() - 0.5) * 3, 0xd8c79a, 0.42, 0.4, -4);
      if (k.star > 0 && Math.random() < 0.7) emit(k.x + (Math.random() - 0.5) * 2, k.y + 1 + Math.random(), k.z + (Math.random() - 0.5) * 2, 0, 1, 0, [0xffd21f, 0xff7ac0, 0x5ee35e, 0x3fa9ff][Math.floor(Math.random() * 4)], 0.45, 0.5);
    }
    stepParticles(dt);
  }

  function fx(e, st) {
    const k = e.k && st.karts.find((q) => q.id === e.k);
    if (e.t === "coin" && k) burst(k.x, k.y + 1.2, k.z, 10, [0xffd21f, 0xfff1a0], 5, 0.4, 0.5);
    if (e.t === "box" && e.x !== undefined) burst(e.x, (k ? k.y : 0) + 1.4, e.z, 22, [0xff4d6d, 0xffb703, 0x5ee35e, 0x3fa9ff, 0xb06bff], 8, 0.5, 0.6);
    if (e.t === "hit" && k) burst(k.x, k.y + 1.2, k.z, 26, [0xffffff, 0xffd21f], 9, 0.6, 0.6);
    if (e.t === "poof") burst(e.x, 1, e.z, 18, [0xffffff, 0xcccccc], 6, 0.6, 0.5, -2);
    if (e.t === "miniturbo" && k) burst(k.x - Math.sin(k.h) * 2, k.y + 0.6, k.z - Math.cos(k.h) * 2, 16, [SPARK[e.level]], 6, 0.5, 0.4);
    if (e.t === "finish" && k) for (let i = 0; i < 4; i++) burst(k.x, k.y + 4, k.z, 40, [0xff4d6d, 0xffb703, 0x5ee35e, 0x3fa9ff, 0xffffff], 14, 0.5, 1.6, -6);
    if (e.t === "bolt") for (const o of st.karts) if (o.id !== e.k) burst(o.x, o.y + 3, o.z, 20, [0xffe14a, 0xffffff], 8, 0.6, 0.5);
  }

  // ---------------- cameras ----------------
  function chaseCam() {
    const cam = new THREE.PerspectiveCamera(68, 1, 0.3, 2400);
    cam.userData = { h: 0, init: false, pos: new THREE.Vector3() };
    return cam;
  }
  function follow(cam, k, dt, mode = "chase") {
    const u = cam.userData;
    if (!u.init) { u.h = k.h; u.init = true; u.pos.set(k.x - Math.sin(k.h) * 7, k.y + 3, k.z - Math.cos(k.h) * 7); }
    // the camera follows the direction of travel, not the spinning body
    const target = k.spin > 0 ? u.h : k.h + (k.drift ? k.drift * 0.16 : 0);
    u.h += Math.atan2(Math.sin(target - u.h), Math.cos(target - u.h)) * Math.min(1, dt * (k.drift ? 3.2 : 5));
    let back = 5.5 + Math.max(0, k.speed) * 0.03, up = 2.2;
    if (mode === "orbit") { u.h += dt * 0.5; back = 9; up = 3.5; }
    const sh = k.shrink > 0 ? 0.75 : 1;
    v3.set(k.x - Math.sin(u.h) * back * sh, k.y + up * sh, k.z - Math.cos(u.h) * back * sh);
    const gy = groundAt(T, v3.x, v3.z) + 0.8;
    if (v3.y < gy) v3.y = gy;
    u.pos.lerp(v3, Math.min(1, dt * 10));
    cam.position.copy(u.pos);
    cam.lookAt(k.x + Math.sin(u.h) * 4, k.y + 1.25 * sh, k.z + Math.cos(u.h) * 4);
    const fov = 68 + (u.fovAdd || 0) + (k.boost > 0 ? 10 : 0) + Math.min(6, Math.max(0, k.speed - 20) * 0.5);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
    cam.updateProjectionMatrix();
  }
  const drone = new THREE.PerspectiveCamera(55, 1, 0.5, 2600);
  function droneFollow(k, t) {
    const a = t * 0.12;
    drone.position.set(k.x + Math.cos(a) * 34, k.y + 16, k.z + Math.sin(a) * 34);
    drone.lookAt(k.x, k.y + 1, k.z);
  }

  // views: [{cam, x, y, w, h, own}] in CSS px, y from the top
  function render(views) {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(W * pr) || canvas.height !== Math.floor(H * pr)) renderer.setSize(W, H, false);
    renderer.setScissorTest(true);
    renderer.shadowMap.needsUpdate = true;
    for (const v of views) {
      const y = H - v.y - v.h;
      renderer.setViewport(v.x, y, v.w, v.h);
      renderer.setScissor(v.x, y, v.w, v.h);
      v.cam.aspect = v.w / v.h;
      v.cam.updateProjectionMatrix();
      pMat.uniforms.scale.value = v.h * pr * 0.9;
      for (const [id, kv] of karts) kv.tag.visible = id !== v.own;
      renderer.render(scene, v.cam);
    }
    renderer.setScissorTest(false);
  }

  return { renderer, scene, bind, update, fx, chaseCam, follow, drone, droneFollow, render, models };
}
