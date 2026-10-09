// Anime-chibi look (the reference was a low-poly hand-painted chibi): flat
// painted colour with a soft two-tone light, thin dark ink outlines from an
// inverted hull, painted faces and pointed hair strands.
import * as THREE from "three";

export const INK = new THREE.Color("#2b1f26");

// two tones, soft: light and a warm shadow, no specular
const ramp = (() => {
  const d = new Uint8Array([168, 168, 168, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 2, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export const toon = (color, extra = {}) =>
  new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: ramp, ...extra });

// inverted hull outline: back faces pushed out along the normal, flat ink
const outlineMat = (thick) => new THREE.ShaderMaterial({
  uniforms: { thick: { value: thick }, ink: { value: INK } },
  side: THREE.BackSide,
  vertexShader: `uniform float thick;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      // constant-ish screen thickness: grow with distance
      mv.xyz += n * thick * clamp(-mv.z * 0.35, 0.6, 3.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `uniform vec3 ink; void main(){ gl_FragColor = vec4(ink, 1.0); }`,
});
const OUTLINE = outlineMat(0.0045);
const OUTLINE_FINE = outlineMat(0.0025);

export function outline(mesh, fine = false) {
  const o = new THREE.Mesh(mesh.geometry, fine ? OUTLINE_FINE : OUTLINE);
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

/** tapered strand along a curve; elliptical cross-section, pointed tip */
export function strand(points, width, thick, { segs = 12, radial = 8, tipPow = 0.85 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t);
    const taper = Math.pow(1 - t, tipPow) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 2.2)));
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const v = c.clone().addScaledVector(N, Math.cos(a) * thick * taper).addScaledVector(B, Math.sin(a) * width * taper);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);   // outward-facing, so the ink hull stays behind
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** smooth hair panel: follows the points, cross-section lies along `side`
 *  (kept flat against the head instead of twisting like Frenet frames),
 *  full width most of the way with a soft rounded end */
export function ribbon(points, side, width, thick, { segs = 16, radial = 10, root = 0.7, end = 0.25 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const S = new THREE.Vector3(...side).normalize();
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t), T = curve.getTangentAt(t);
    const w = S.clone().addScaledVector(T, -S.dot(T)).normalize();     // side, made perpendicular
    const n = new THREE.Vector3().crossVectors(w, T).normalize();      // out from the head
    let k = 1;
    if (t < 0.12) k = root + (1 - root) * (t / 0.12);
    if (t > 1 - end) k = Math.cos(((t - (1 - end)) / end) * Math.PI / 2) ** 0.6;
    k = Math.max(k, 0.04);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const v = c.clone().addScaledVector(w, Math.cos(a) * width * k).addScaledVector(n, Math.sin(a) * thick * Math.max(k, 0.3));
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);   // this cross-section runs the other way round: outward-facing again
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** paint on a canvas in the head's planar front UVs: u = 0.5 + x/2R, v = 0.5 + y/2R */
export function canvasTex(size, paint) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  paint(g, size, (u) => u * size, (v) => (1 - v) * size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** sphere whose front gets planar UVs. The back maps to the texture's top row
 *  with u kept continuous, so a triangle across the seam only sweeps a column
 *  between the front point and the top edge: plain skin / solid hair at the
 *  sides, and at the bottom pole it's hidden under the chin */
export function frontMappedSphere(r, ws = 48, hs = 36) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = 0.5 + x / (2 * r);
    uv.setXY(i, u, z < -0.05 * r ? 0.995 : 0.5 + y / (2 * r));
  }
  return g;
}
