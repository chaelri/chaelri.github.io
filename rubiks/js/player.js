// three.js 3x3 with animated layer turns. Cubies keep their identity, so a
// mask can grey pieces out by where they belong rather than where they are.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACES, NORMAL, moveInfo, invertMove } from './cube.js';

export const COLORS = {
  U: '#ffd200', D: '#f4f4f0', F: '#00a651', B: '#1460d6', R: '#ff6a13', L: '#d7192f',
};
const GREY = '#4a4f5a';

const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function stickerShape(size, r) {
  const s = new THREE.Shape();
  const h = size / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

export class CubePlayer {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    // lit from above AND below so the white face reads as white in the bottom view
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc8ccd8, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const under = new THREE.DirectionalLight(0xffffff, 1.4);
    under.position.set(3, -8, 5);
    this.scene.add(under);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.mats = {};
    for (const [k, c] of Object.entries({ ...COLORS, grey: GREY }))
      this.mats[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.6 });
    const bodyGeo = new RoundedBoxGeometry(0.98, 0.98, 0.98, 3, 0.1);
    const stickerGeo = new THREE.ShapeGeometry(stickerShape(0.84, 0.13), 4);

    this.cubies = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (!x && !y && !z) continue;
          const g = new THREE.Group();
          g.position.set(x, y, z);
          g.userData.home = [x, y, z];
          g.add(new THREE.Mesh(bodyGeo, bodyMat));
          g.userData.stickers = [];
          for (const f of FACES) {
            const n = NORMAL[f];
            const ax = n.findIndex((c) => c !== 0);
            if ([x, y, z][ax] !== n[ax]) continue;
            const m = new THREE.Mesh(stickerGeo, this.mats[f]);
            const nv = new THREE.Vector3(...n);
            m.position.copy(nv).multiplyScalar(0.495);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
            m.userData.face = f;
            g.add(m);
            g.userData.stickers.push(m);
          }
          this.root.add(g);
          this.cubies.push(g);
        }

    // camera orbit
    this.view = { yaw: 0.62, pitch: 0.5 };
    this.viewTarget = { ...this.view };
    this.bindDrag();
    this.queue = Promise.resolve();
    this.epoch = 0;
    this.speed = 1;
    this.busy = false;

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(host);
    this.resize();
    const loop = () => {
      this.view.yaw += (this.viewTarget.yaw - this.view.yaw) * 0.12;
      this.view.pitch += (this.viewTarget.pitch - this.view.pitch) * 0.12;
      this.placeCamera();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole cube in frame on tall phones
    this.camera.fov = w / h < 0.9 ? 30 / Math.min(1, (w / h) / 0.9) : 30;
    this.camera.updateProjectionMatrix();
  }

  placeCamera() {
    const r = 11.5, { yaw, pitch } = this.view;
    this.camera.position.set(r * Math.cos(pitch) * Math.sin(yaw), r * Math.sin(pitch), r * Math.cos(pitch) * Math.cos(yaw));
    this.camera.lookAt(0, 0, 0);
  }

  setView(name, snap = false) {
    this.viewTarget = name === 'bottom' ? { yaw: 0.62, pitch: -0.5 } : { yaw: 0.62, pitch: 0.5 };
    if (snap) this.view = { ...this.viewTarget };
  }

  bindDrag() {
    const el = this.renderer.domElement;
    let last = null;
    el.addEventListener('pointerdown', (e) => { last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      last = [e.clientX, e.clientY];
      this.viewTarget.yaw -= dx * 0.01;
      this.viewTarget.pitch = Math.max(-1.35, Math.min(1.35, this.viewTarget.pitch + dy * 0.01));
      this.view = { ...this.viewTarget };
    });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.style.touchAction = 'none';
  }

  setMask(mask) {
    for (const c of this.cubies) {
      const [hx, hy, hz] = c.userData.home;
      const isEdge = [hx, hy, hz].filter((v) => v !== 0).length === 2;
      const isCenter = [hx, hy, hz].filter((v) => v !== 0).length === 1;
      for (const s of c.userData.stickers) {
        const f = s.userData.face;
        let on = true;
        if (mask === 'cross') on = isCenter || (isEdge && hy === -1) || f === 'D';
        else if (mask === 'f2l') on = hy <= 0 || isCenter;
        else if (mask === 'oll') on = hy <= 0 || f === 'U';
        // look 1 of 2-look OLL: only the edges count, so the top corners go grey
        else if (mask === 'olledge') on = hy <= 0 || (f === 'U' && !(hx && hz));
        s.material = on ? this.mats[f] : this.mats.grey;
      }
    }
  }

  reset() {
    this.epoch = (this.epoch || 0) + 1;
    this.root.quaternion.identity();
    for (const c of this.cubies) {
      if (c.parent !== this.root) this.root.attach(c);
      c.position.set(...c.userData.home);
      c.quaternion.identity();
    }
    this.pivot.quaternion.identity();
  }

  layer(mv) {
    const { inLayer } = moveInfo(mv);
    return this.cubies.filter((c) => inLayer([Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z)]));
  }

  // Apply instantly (setup positions, scrubbing).
  applyNow(moves) {
    for (const mv of moves) {
      const { axis, angle } = moveInfo(mv);
      const q = new THREE.Quaternion().setFromAxisAngle(AXIS[axis], angle);
      for (const c of this.layer(mv)) {
        c.position.applyQuaternion(q);
        c.quaternion.premultiply(q);
        this.snap(c);
      }
    }
  }

  snap(c) {
    c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
    const m = new THREE.Matrix4().makeRotationFromQuaternion(c.quaternion);
    const e = m.elements.map((v) => Math.round(v));
    m.fromArray(e);
    c.quaternion.setFromRotationMatrix(m);
  }

  // Animated single move. Moves queue behind each other so two can never
  // turn the same pivot at once; reset() cancels whatever is queued or
  // mid-turn. Resolves true if the move was applied, false if cancelled.
  animate(mv, ms) {
    const epoch = this.epoch;
    const run = () => new Promise((resolve) => {
      if (epoch !== this.epoch) return resolve(false);
      const { axis, angle } = moveInfo(mv);
      const cubies = this.layer(mv);
      this.pivot.quaternion.identity();
      for (const c of cubies) this.pivot.attach(c);
      const dur = (ms ?? 300) * (Math.abs(angle) > 2 ? 1.45 : 1) / this.speed;
      const start = performance.now();
      const tick = (now) => {
        if (epoch !== this.epoch) return resolve(false);
        const t = Math.min(1, (now - start) / dur);
        this.pivot.quaternion.setFromAxisAngle(AXIS[axis], angle * ease(t));
        if (t < 1) return requestAnimationFrame(tick);
        for (const c of cubies) { this.root.attach(c); this.snap(c); }
        this.pivot.quaternion.identity();
        resolve(true);
      };
      requestAnimationFrame(tick);
    });
    this.queue = this.queue.then(run);
    return this.queue;
  }

  animateInverse(mv, ms) { return this.animate(invertMove(mv), ms); }
}
