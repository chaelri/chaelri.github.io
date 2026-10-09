// Pastel playground: soft ground, candy platforms to hop on, round trees,
// flowers, clouds. Every mesh is generated here; no binary assets.
import * as THREE from "three";

export const SOLIDS = [];   // { min: Vector3, max: Vector3 } axis-aligned boxes you can stand on / bump into
export const POSTS = [];    // { x, z, r } round obstacles (tree trunks)

const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const lin = (hex) => new THREE.Color(hex);

function groundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#bfe3b4";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? "rgba(255,255,255,.18)" : "rgba(120,170,110,.16)";
    g.beginPath();
    g.arc(rng() * 256, rng() * 256, 1 + rng() * 2.5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r); shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d); shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(r, h / 3);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h - bev * 2, bevelEnabled: true, bevelSize: bev * 0.8, bevelThickness: bev, bevelSegments: 4, curveSegments: 8 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2 + bev, 0);
  return geo;
}

function platform(scene, x, z, w, d, top, color) {
  const h = top;
  const m = new THREE.Mesh(roundedBox(w, h, d, 0.12), new THREE.MeshStandardMaterial({ color: lin(color), roughness: 0.65 }));
  m.position.set(x, h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  SOLIDS.push({ min: new THREE.Vector3(x - w / 2, 0, z - d / 2), max: new THREE.Vector3(x + w / 2, top, z + d / 2) });
}

function tree(scene, x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.0 * s, 12), new THREE.MeshStandardMaterial({ color: lin("#c99a78"), roughness: 0.8 }));
  trunk.position.y = 0.5 * s;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: lin(["#8fd19e", "#a7dca0", "#f4b6c8"][Math.floor(rng() * 3)]), roughness: 0.7 });
  for (const [dx, dy, dz, r] of [[0, 1.35, 0, 0.62], [0.32, 1.12, 0.1, 0.42], [-0.3, 1.18, -0.12, 0.45], [0.05, 1.7, -0.05, 0.42]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 3), leafMat);
    b.position.set(dx * s, dy * s, dz * s);
    g.add(b);
  }
  g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  g.position.set(x, 0, z);
  scene.add(g);
  POSTS.push({ x, z, r: 0.2 * s });
}

function flower(scene, x, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 5), new THREE.MeshStandardMaterial({ color: lin("#6fb07a") }));
  stem.position.y = 0.08;
  g.add(stem);
  const col = ["#ffd1dc", "#fff1a8", "#cfe3ff", "#e8d4ff", "#ffffff"][Math.floor(rng() * 5)];
  const pm = new THREE.MeshStandardMaterial({ color: lin(col), roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pm);
    const a = (i / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.04, 0.17, Math.sin(a) * 0.04);
    p.scale.set(1, 0.4, 1);
    g.add(p);
  }
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: lin("#ffc66b") }));
  mid.position.y = 0.175;
  g.add(mid);
  g.position.set(x, 0, z);
  g.rotation.y = rng() * 6;
  scene.add(g);
}

function cloud(scene, x, y, z) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rng() * 0.7, 16, 12), m);
    b.position.set(i * 1.0 - 2, rng() * 0.5, rng() * 0.6);
    g.add(b);
  }
  g.position.set(x, y, z);
  scene.add(g);
  return g;
}

export function buildWorld(scene) {
  scene.background = lin("#cfe8ff");
  scene.fog = new THREE.Fog(lin("#e6f0ff"), 18, 55);

  // sky dome: pastel gradient
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: lin("#a9d4ff") }, bottom: { value: lin("#ffe3ee") } },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, h)), 1.); }",
  }));
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(lin("#fff6fb"), lin("#b9e0b0"), 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(lin("#fff3e6"), 2.2);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -12; sc.right = sc.top = 12; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // a little staircase, a stepping-stone run and a tall perch
  const steps = ["#ffd1dc", "#ffe3b3", "#fff1a8", "#d4f5c9", "#cfe3ff", "#e8d4ff"];
  steps.forEach((c, i) => platform(scene, 3 + i * 0.9, -2, 0.9, 1.6, 0.18 + i * 0.18, c));
  platform(scene, 9.2, -2, 2.4, 2.4, 1.26, "#f7c5d6");
  [[-3, 3, 0.35], [-4.6, 4.2, 0.6], [-6.2, 5.6, 0.85], [-7.6, 7.2, 1.1], [-8.6, 9.2, 1.4]].forEach(([x, z, t], i) =>
    platform(scene, x, z, 1.1, 1.1, t, steps[i % steps.length]));
  platform(scene, -2, -6, 3, 1.2, 0.5, "#cfe3ff");
  platform(scene, 1.5, 6, 2, 2, 0.3, "#fff1a8");

  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 9 + rng() * 22;
    tree(scene, Math.cos(a) * r, Math.sin(a) * r, 0.8 + rng() * 0.6);
  }
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2, r = 1.5 + rng() * 25;
    flower(scene, Math.cos(a) * r, Math.sin(a) * r);
  }
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push(cloud(scene, (rng() - 0.5) * 70, 9 + rng() * 6, -20 - rng() * 30));

  return { sun, clouds };
}
