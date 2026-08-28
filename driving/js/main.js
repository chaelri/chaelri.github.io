// main.js — renderer, cameras, three mirrors, fixed-step physics loop,
// collisions and all the glue between the modules.

import * as THREE from 'three';
import { Vehicle, SPEC } from './vehicle.js';
import { buildCar } from './carmodel.js';
import { World, GRID, HW, LANE } from './world.js';
import { Traffic } from './traffic.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { skyTexture } from './textures.js';
import { clamp, clamp01, lerp, wrapAngle, rad2deg, obbOverlap, dist2, expSmooth } from './util.js';

const FIXED = 1 / 120;
const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.acc = 0;

    this.opts = {
      traffic: 14,
      seed: 1,
      sound: true,
      mirrors: true,
      night: false,
      shadows: true,
    };

    this.hud = new Hud();
    this.sound = new Sound();
    this.input = new Input();
    this.paused = true;
    this.started = false;

    this.state = {
      view: 0,
      headlights: false,
      indL: false,
      indR: false,
      indT: 0,
      blink: false,
      indStartPsi: 0,
      horn: false,
      wrongSideT: 0,
      lastFault: {},
      surface: 'road',
    };

    this._lights();
    this._player();
    this._mirrors();
    this._menu();

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ------------------------------------------------------------ scene bits */

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xbcd6f0, 0x4a4438, 0.85);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 1;
    s.camera.far = 160;
    s.camera.left = -34;
    s.camera.right = 34;
    s.camera.top = 34;
    s.camera.bottom = -34;
    s.bias = -0.0006;
    s.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.applyTimeOfDay();
  }

  applyTimeOfDay() {
    const night = this.opts.night;
    if (this.envRT) this.envRT.dispose();
    const sky = skyTexture(night);
    this.envRT = this.pmrem.fromEquirectangular(sky);
    this.scene.environment = this.envRT.texture;
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(night ? 0x0b1020 : 0xb9cbdc, 90, night ? 240 : 420);
    this.hemi.intensity = night ? 0.16 : 0.85;
    this.hemi.color.setHex(night ? 0x2a3550 : 0xbcd6f0);
    this.sun.intensity = night ? 0.16 : 2.5;
    this.sun.color.setHex(night ? 0x8fa8d8 : 0xfff0d8);
    this.renderer.toneMappingExposure = night ? 1.25 : 1.02;
    if (night && !this.state.headlights) this.setHeadlights(true);
    if (this.traffic) this.traffic.setHeadlights(night);
  }

  _player() {
    this.vehicle = new Vehicle(SPEC);
    this.car = buildCar({ detail: 'high', color: 0xd9dde2 });

    this.carRoot = new THREE.Group();
    this.bodyNode = new THREE.Group();
    this.carRoot.add(this.bodyNode);
    this.bodyNode.add(this.car.group);
    // Wheels stay level with the road while the body pitches and rolls.
    for (const w of this.car.wheels) this.carRoot.add(w.steerNode);
    this.scene.add(this.carRoot);

    // Cameras that live in the car.
    this.camCockpit = new THREE.PerspectiveCamera(66, 1, 0.08, 900);
    this.camCockpit.position.copy(this.car.anchors.driverEye);
    this.camCockpit.rotation.set(-0.06, -Math.PI / 2, 0, 'YXZ');
    this.camHood = new THREE.PerspectiveCamera(72, 1, 0.08, 900);
    this.camHood.position.copy(this.car.anchors.hood);
    this.camHood.rotation.set(-0.06, -Math.PI / 2, 0, 'YXZ');
    this.bodyNode.add(this.camCockpit, this.camHood);

    // World-space cameras.
    this.camChase = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
    this.camTop = new THREE.PerspectiveCamera(46, 1, 0.5, 1200);
    this.scene.add(this.camChase, this.camTop);
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();

    // Headlights.
    this.headlamps = [];
    for (const z of [-0.56, 0.56]) {
      const sp = new THREE.SpotLight(0xfff3d6, 0, 62, 0.5, 0.45, 1.3);
      sp.position.set(1.98, 0.79, z);
      const tgt = new THREE.Object3D();
      tgt.position.set(24, -1.6, z * 1.6);
      this.bodyNode.add(sp, tgt);
      sp.target = tgt;
      this.headlamps.push(sp);
    }
  }

  _mirrors() {
    const dpr = Math.min(devicePixelRatio, 1.6);
    const mk = (w, h) => {
      const rt = new THREE.WebGLRenderTarget(Math.round(w * dpr), Math.round(h * dpr), {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
      });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      return rt;
    };

    this.mirrorScene = new THREE.Scene();
    this.mirrorCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(1, 1);

    const defs = [
      { key: 'rear', frame: $('frame-rear'), w: 820, h: 200, fov: 27, yaw: Math.PI / 2, pitch: -0.09, anchor: 'rearMirror' },
      { key: 'left', frame: $('frame-left'), w: 360, h: 270, fov: 52, yaw: Math.PI / 2 - 0.35, pitch: -0.13, anchor: 'mirrorLeft' },
      { key: 'right', frame: $('frame-right'), w: 360, h: 270, fov: 52, yaw: Math.PI / 2 + 0.35, pitch: -0.13, anchor: 'mirrorRight' },
    ];

    this.mirrors = defs.map((d) => {
      const rt = mk(d.w, d.h);
      const cam = new THREE.PerspectiveCamera(d.fov, d.w / d.h, 0.06, 700);
      cam.position.copy(this.car.anchors[d.anchor]);
      cam.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
      this.bodyNode.add(cam);
      const mat = new THREE.MeshBasicMaterial({
        map: rt.texture,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(quad, mat);
      mesh.frustumCulled = false;
      this.mirrorScene.add(mesh);
      return { ...d, rt, cam, mesh };
    });
  }

  /* ---------------------------------------------------------------- layout */

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    for (const c of [this.camCockpit, this.camHood, this.camChase, this.camTop]) {
      c.aspect = w / h;
      c.updateProjectionMatrix();
    }
    this.layoutMirrors(w, h);
  }

  layoutMirrors(W, H) {
    const rw = clamp(W * 0.3, 230, 470);
    const rh = rw * 0.235;
    const sw = clamp(W * 0.135, 118, 240);
    const sh = sw * 0.75;
    const rects = {
      rear: { x: (W - rw) / 2, y: 10, w: rw, h: rh },
      left: { x: Math.max(12, W * 0.035), y: H * 0.44, w: sw, h: sh },
      right: { x: W - sw - Math.max(12, W * 0.035), y: H * 0.44, w: sw, h: sh },
    };
    for (const m of this.mirrors) {
      const r = rects[m.key];
      m.rect = r;
      m.frame.style.left = r.x + 'px';
      m.frame.style.top = r.y + 'px';
      m.frame.style.width = r.w + 'px';
      m.frame.style.height = r.h + 'px';
      // Position the composite quad in normalised device coordinates.
      const ndcX = ((r.x + r.w / 2) / W) * 2 - 1;
      const ndcY = 1 - ((r.y + r.h / 2) / H) * 2;
      m.mesh.position.set(ndcX, ndcY, 0);
      // Negative X scale mirrors the image, exactly like real mirror glass.
      m.mesh.scale.set(-(r.w / W) * 2, (r.h / H) * 2, 1);
      m.cam.aspect = r.w / r.h;
      m.cam.updateProjectionMatrix();
    }
  }

  setMirrorsVisible(on) {
    this.opts.mirrors = on;
    for (const m of this.mirrors) {
      m.frame.style.display = on ? 'block' : 'none';
      m.mesh.visible = on;
    }
  }

  /* ----------------------------------------------------------------- world */

  buildWorld() {
    if (this.world) this.world.dispose();
    if (this.traffic) this.traffic.dispose();
    this.world = new World(this.scene, this.opts.seed, { night: this.opts.night });
    this.traffic = new Traffic(this.scene, this.world, this.opts.traffic, this.opts.seed);
    this.traffic.setHeadlights(this.opts.night);
    if (this.mission) this.mission.markers.removeFromParent();
    this.mission = new MissionRunner(this.scene, this.world, this.hud);
  }

  startMission(id) {
    this.mission.reset(id);
    const def = MISSIONS.find((m) => m.id === id);
    this.hud.setMission(def.name, def.hint);
    const p = this.mission.startPose || this.world.spawn;
    this.vehicle.reset(p.x, p.y, p.psi);
    this.vehicle.engineOn = false;
    this.vehicle.we = 0;
    this.vehicle.gearPos = 'P';
    for (const c of this.world.cones) {
      c.knocked = false;
      if (c.mesh) {
        c.mesh.rotation.set(0, 0, 0);
        c.mesh.position.set(c.x, 0, -c.y);
      }
    }
    this.syncCar(1);
    $('result').hidden = true;
  }

  respawn() {
    const v = this.vehicle;
    const w = this.world;
    // Drop the car back on the nearest lane, pointing the sensible way.
    const info = w.laneInfo(v.x, v.y);
    let x = v.x;
    let y = v.y;
    let psi = v.psi;
    if (info) {
      if (info.axis === 'x') {
        const dir = Math.abs(wrapAngle(psi)) < Math.PI / 2 ? 1 : -1;
        y = info.center - dir * (LANE / 2);
        psi = dir > 0 ? 0 : Math.PI;
      } else {
        const dir = wrapAngle(psi) > 0 ? 1 : -1;
        x = info.center + dir * (LANE / 2);
        psi = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    const eng = v.engineOn;
    v.reset(x, y, psi);
    v.engineOn = eng;
    v.we = eng ? 800 * (Math.PI / 30) : 0;
    v.gearPos = 'P';
    this.hud.toast('Recovered — you are back on the road', 'info');
  }

  /* ------------------------------------------------------------------ menu */

  _menu() {
    const list = $('mission-list');
    list.innerHTML = MISSIONS.map(
      (m) => `<button class="mcard" data-id="${m.id}"><b>${m.name}</b><span>${m.blurb}</span></button>`
    ).join('');
    this.selected = 'free';
    const sync = () =>
      [...list.children].forEach((c) => c.classList.toggle('sel', c.dataset.id === this.selected));
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.mcard');
      if (!b) return;
      this.selected = b.dataset.id;
      sync();
    });
    sync();

    $('opt-traffic').addEventListener('input', (e) => {
      this.opts.traffic = +e.target.value;
      $('opt-traffic-v').textContent = e.target.value;
    });
    $('opt-seed').addEventListener('change', (e) => (this.opts.seed = Math.max(1, +e.target.value | 0)));
    $('opt-sound').addEventListener('change', (e) => {
      this.opts.sound = e.target.checked;
      this.sound.setMuted(!e.target.checked);
    });
    $('opt-mirrors').addEventListener('change', (e) => this.setMirrorsVisible(e.target.checked));
    $('opt-night').addEventListener('change', (e) => {
      this.opts.night = e.target.checked;
      this.applyTimeOfDay();
    });
    $('opt-shadows').addEventListener('change', (e) => {
      this.opts.shadows = e.target.checked;
      this.renderer.shadowMap.enabled = e.target.checked;
      this.scene.traverse((o) => {
        if (o.material) o.material.needsUpdate = true;
      });
    });

    $('btn-drive').addEventListener('click', () => this.go());
    $('btn-close').addEventListener('click', () => this.resume());
    $('result-retry').addEventListener('click', () => {
      $('result').hidden = true;
      this.startMission(this.mission.id);
      this.resume();
    });
    $('result-menu').addEventListener('click', () => {
      $('result').hidden = true;
      this.openMenu();
    });

    // Discrete key actions.
    const I = this.input;
    I.on('shiftUp', () => this.doShift(-1));
    I.on('shiftDown', () => this.doShift(1));
    I.on('ignition', () => {
      if (this.paused) return;
      this.vehicle.toggleIgnition();
      this.sound.click(300, 0.08, 0.06);
    });
    I.on('camera', () => {
      if (this.paused) return;
      this.state.view = (this.state.view + 1) % 4;
      this.hud.toast(['Cockpit', 'Bonnet', 'Chase', 'Overhead'][this.state.view], 'info', 1200);
    });
    I.on('indLeft', () => this.signal(-1));
    I.on('indRight', () => this.signal(1));
    I.on('hornDown', () => {
      this.state.horn = true;
      this.sound.horn(true);
    });
    I.on('hornUp', () => {
      this.state.horn = false;
      this.sound.horn(false);
    });
    I.on('lights', () => this.setHeadlights(!this.state.headlights));
    I.on('mirrors', () => this.setMirrorsVisible(!this.opts.mirrors));
    I.on('daynight', () => {
      this.opts.night = !this.opts.night;
      $('opt-night').checked = this.opts.night;
      this.applyTimeOfDay();
    });
    I.on('respawn', () => !this.paused && this.respawn());
    I.on('newmap', () => {
      if (this.paused) return;
      this.opts.seed = (this.opts.seed + 1) % 99999 || 1;
      $('opt-seed').value = this.opts.seed;
      this.hud.toast('Generating a new town…', 'info');
      setTimeout(() => {
        this.buildWorld();
        this.startMission(this.mission.id);
      }, 30);
    });
    I.on('pause', () => (this.paused ? this.resume() : this.openMenu()));
    I.on('help', () => $('controls-help').toggleAttribute('open'));

    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }

  doShift(dir) {
    if (this.paused) return;
    const before = this.vehicle.gearPos;
    this.vehicle.requestShift(dir);
    if (this.vehicle.gearPos !== before) this.sound.click(900, 0.05, 0.09);
  }

  signal(side) {
    const s = this.state;
    if (side < 0) {
      s.indL = !s.indL;
      s.indR = false;
    } else {
      s.indR = !s.indR;
      s.indL = false;
    }
    s.indStartPsi = this.vehicle.psi;
    s.indT = 0;
    if (s.indL || s.indR) this.sound.click(1500, 0.03, 0.1);
  }

  setHeadlights(on) {
    this.state.headlights = on;
    if (!this.car) return;
    for (const l of this.headlamps) l.intensity = on ? 190 : 0;
    this.car.materials.head.emissiveIntensity = on ? 2.4 : 0.15;
  }

  openMenu() {
    this.paused = true;
    this.input.enabled = false;
    $('overlay').classList.remove('hidden');
    $('btn-close').hidden = !this.started;
    $('btn-drive').innerHTML = this.started
      ? '<span class="material-symbols-outlined">play_arrow</span> Start this exercise'
      : '<span class="material-symbols-outlined">directions_car</span> Get in the car';
  }

  resume() {
    this.paused = false;
    this.input.enabled = true;
    $('overlay').classList.add('hidden');
    this.clock.getDelta();
  }

  go() {
    if (!this.world) this.buildWorld();
    if (this.opts.sound) {
      this.sound.start();
      this.sound.resume();
    }
    this.started = true;
    this.hud.show(true);
    this.setMirrorsVisible(this.opts.mirrors);
    this.startMission(this.selected);
    this.resume();
  }

  /* ------------------------------------------------------------- collisions */

  collide(dt) {
    const v = this.vehicle;
    const A = v.obb();
    let worst = 0;

    const hit = (B, movable) => {
      const mtv = obbOverlap(A, B);
      if (!mtv) return;
      v.x += mtv.nx * mtv.depth * (movable ? 0.55 : 1.0);
      v.y += mtv.ny * mtv.depth * (movable ? 0.55 : 1.0);
      A.x = v.x;
      A.y = v.y;
      const px = (v.x + B.x) / 2;
      const py = (v.y + B.y) / 2;
      const mag = v.applyImpulse(mtv.nx, mtv.ny, px, py, movable ? 0.12 : 0.22);
      if (movable && B.ref) {
        B.ref.x -= mtv.nx * mtv.depth * 0.45;
        B.ref.y -= mtv.ny * mtv.depth * 0.45;
        B.ref.v = Math.max(0, B.ref.v - mag * 0.6);
      }
      worst = Math.max(worst, mag);
    };

    for (const c of this.world.colliders) {
      if (dist2(c.x, c.y, v.x, v.y) > 100) continue;
      hit(c, false);
    }
    for (const b of this.traffic.obbs()) {
      if (dist2(b.x, b.y, v.x, v.y) > 100) continue;
      hit(b, true);
    }

    // Cones tip over rather than stopping the car.
    for (const c of this.world.cones) {
      if (c.knocked) continue;
      if (dist2(c.x, c.y, v.x, v.y) > 16) continue;
      if (obbOverlap(A, { x: c.x, y: c.y, hx: 0.24, hy: 0.24, rot: 0 })) {
        c.knocked = true;
        if (c.mesh) {
          c.mesh.rotation.z = Math.PI / 2.1;
          c.mesh.position.y = 0.12;
          c.mesh.position.x += Math.cos(v.psi) * 0.6;
          c.mesh.position.z -= Math.sin(v.psi) * 0.6;
        }
        this.mission.fault('cone');
        this.sound.thud(0.4);
      }
    }

    if (worst > 0.8 && this.cooldown('collision', 1.2)) {
      this.mission.fault('collision');
      this.sound.thud(clamp(worst / 4, 0.3, 1.4));
    }
  }

  cooldown(key, secs) {
    const t = performance.now() / 1000;
    const last = this.state.lastFault[key] || -99;
    if (t - last < secs) return false;
    this.state.lastFault[key] = t;
    return true;
  }

  surfaceCheck() {
    const v = this.vehicle;
    const c = Math.cos(v.psi);
    const s = Math.sin(v.psi);
    const w = this.world;
    const pts = [
      [1.18, -0.745],
      [1.18, 0.745],
      [-1.37, -0.745],
      [-1.37, 0.745],
    ];
    let grip = 0;
    let kerb = false;
    let off = 0;
    for (const [fx, fy] of pts) {
      // Body-frame offset: forward along heading, lateral to the left.
      const x = v.x + fx * c - fy * s;
      const y = v.y + fx * s + fy * c;
      const surf = w.surfaceAt(x, y);
      if (surf === 'kerb') kerb = true;
      if (surf !== 'road' && surf !== 'lot') off++;
      grip += w.gripFor(surf);
    }
    grip /= pts.length;
    const centre = w.surfaceAt(v.x, v.y);
    this.state.surface = centre;

    if (kerb && v.kmh > 4 && this.cooldown('kerb', 1.6)) {
      this.mission.fault('kerb');
      this.sound.thud(0.5);
    }
    if (off >= 3 && v.kmh > 6 && this.cooldown('offroad', 3)) this.mission.fault('offroad');

    return { grip, rollExtra: centre === 'grass' ? 2.2 : centre === 'dirt' ? 1.1 : 0, kerb };
  }

  ruleCheck(dt) {
    const v = this.vehicle;
    const w = this.world;
    if (v.kmh < 6) {
      this.state.wrongSideT = 0;
      return;
    }
    // Keep right: on a two-way road, the car should sit on the correct side.
    const info = w.laneInfo(v.x, v.y);
    if (info) {
      const heading = wrapAngle(v.psi);
      if (info.axis === 'x') {
        const dir = Math.abs(heading) < Math.PI / 2 ? 1 : -1;
        const offset = v.y - info.center;
        this.state.wrongSideT = offset * dir > 0.9 ? this.state.wrongSideT + dt : 0;
      } else {
        const dir = heading > 0 ? 1 : -1;
        const offset = v.x - info.center;
        this.state.wrongSideT = offset * dir < -0.9 ? this.state.wrongSideT + dt : 0;
      }
      if (this.state.wrongSideT > 2.2 && this.cooldown('wrongside', 6)) {
        this.mission.fault('wrongside');
        this.state.wrongSideT = 0;
      }
    }

    // Red-light check inside a signalled junction.
    let ii = -1;
    let jj = -1;
    for (let i = 0; i < GRID; i++) if (Math.abs(v.x - w.gx[i]) < HW) ii = i;
    for (let j = 0; j < GRID; j++) if (Math.abs(v.y - w.gy[j]) < HW) jj = j;
    if (ii >= 0 && jj >= 0 && w.hasLight(ii, jj)) {
      const axis = Math.abs(Math.cos(v.psi)) > Math.abs(Math.sin(v.psi)) ? 'x' : 'y';
      if (w.lightState(axis) === 'red' && v.kmh > 6 && this.cooldown('redlight', 6)) {
        this.mission.fault('redlight');
      }
    }
  }

  /* ------------------------------------------------------------ presentation */

  syncCar(alpha) {
    const v = this.vehicle;
    this.carRoot.position.set(v.x, 0, -v.y);
    this.carRoot.rotation.y = v.psi;
    this.bodyNode.rotation.set(0, 0, 0);
    // Nose dive is a rotation about the lateral axis; body roll about the
    // longitudinal one. Forward is +X and right is +Z in the car's frame.
    this.bodyNode.rotation.z = -v.pitch;
    this.bodyNode.rotation.x = v.roll;
    this.bodyNode.position.y = 0;

    for (const wl of this.car.wheels) {
      if (wl.steered) wl.steerNode.rotation.y = v.delta;
      wl.spinNode.rotation.z = -v.wheelSpin;
    }
    if (this.car.steerWheel) this.car.steerWheel.rotation.z = -v.wheelAngle;

    const m = this.car.materials;
    m.tail.emissiveIntensity = v.brake > 0.04 ? 2.6 : this.state.headlights ? 0.7 : 0.22;
    m.rev.emissiveIntensity = v.gearPos === 'R' ? 2.4 : 0.04;
    m.indL.emissiveIntensity = this.state.indL && this.state.blink ? 3.0 : 0.0;
    m.indR.emissiveIntensity = this.state.indR && this.state.blink ? 3.0 : 0.0;
  }

  activeCamera() {
    const v = this.vehicle;
    switch (this.state.view) {
      case 1:
        return this.camHood;
      case 2: {
        const back = 7.4;
        const up = 3.0;
        const want = new THREE.Vector3(v.x - Math.cos(v.psi) * back, up, -(v.y - Math.sin(v.psi) * back));
        const look = new THREE.Vector3(v.x, 1.0, -v.y);
        // Snap rather than glide when the car has been teleported (mission
        // start, respawn) — otherwise the camera drifts in from the last spot.
        if (this.chasePos.distanceToSquared(want) > 900) {
          this.chasePos.copy(want);
          this.chaseLook.copy(look);
        } else {
          this.chasePos.lerp(want, 0.12);
          this.chaseLook.lerp(look, 0.2);
        }
        this.camChase.position.copy(this.chasePos);
        this.camChase.lookAt(this.chaseLook);
        return this.camChase;
      }
      case 3:
        this.camTop.position.set(v.x, 34, -v.y + 0.01);
        this.camTop.lookAt(v.x, 0, -v.y);
        return this.camTop;
      default:
        return this.camCockpit;
    }
  }

  coach() {
    const v = this.vehicle;
    if (!v.engineOn) {
      if (v.brake < 0.25) return 'Hold the brake — press and keep holding S.';
      return 'Brake held. Press Enter to start the engine.';
    }
    if (v.gearPos === 'P') {
      if (v.brake < 0.25) return 'Hold S (brake), then press the Down arrow to leave P.';
      return 'Keep holding S and press Down until the gate reads D.';
    }
    if (v.gearPos === 'N') return 'Neutral. Press Down again for D, or Up for R.';
    if ((v.gearPos === 'D' || v.gearPos === 'L') && v.brake > 0.4 && v.kmh < 0.5)
      return 'In gear. Ease off the brake — the car creeps forward on its own.';
    if (v.gearPos === 'R' && v.brake > 0.4 && v.kmh < 0.5)
      return 'Reverse selected. Check both mirrors, then release the brake.';
    return null;
  }

  /* ------------------------------------------------------------------- loop */

  step(dt) {
    const v = this.vehicle;
    const env = this.surfaceCheck();
    v.setInput(this.input.read());
    v.update(dt, { gripScale: env.grip, rollExtra: env.rollExtra });
    this.collide(dt);
    this.ruleCheck(dt);

    const msg = v.takeMsg();
    if (msg) {
      this.hud.toast(msg.text, msg.kind === 'good' ? 'good' : msg.kind === 'bad' ? 'bad' : msg.kind);
      if (msg.kind === 'warn') this.sound.click(220, 0.08, 0.07);
    }
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const raw = Math.min(this.clock.getDelta(), 0.25);

    if (!this.paused && this.world) {
      this.acc += raw;
      let guard = 0;
      while (this.acc >= FIXED && guard < 8) {
        this.step(FIXED);
        this.acc -= FIXED;
        guard++;
      }
      if (guard >= 8) this.acc = 0;

      this.world.update(raw);
      this.traffic.update(raw, this.vehicle);

      // Indicator blink + auto-cancel after a completed turn.
      const s = this.state;
      s.indT += raw;
      const blinkNow = (s.indT % 0.72) < 0.4;
      if ((s.indL || s.indR) && blinkNow !== s.blink) this.sound.click(1200, 0.02, 0.05);
      s.blink = blinkNow;
      if (s.indL || s.indR) {
        const turned = wrapAngle(this.vehicle.psi - s.indStartPsi);
        if (Math.abs(turned) > 1.05) s.armed = true;
        if (s.armed && Math.abs(turned) < 0.25) {
          s.indL = s.indR = false;
          s.armed = false;
        }
      }

      const res = this.mission.update(raw, this.vehicle, { surface: s.surface });
      if (res) this.showResult(res);

      this.hud.update(this.vehicle, {
        headlights: s.headlights,
        indL: s.indL,
        indR: s.indR,
        blink: s.blink,
        elapsed: this.mission.elapsed,
        score: this.mission.score,
      });
      const coach = this.coach();
      this.hud.el.missionHint.textContent = coach || this.mission.def.blurb;
      this.hud.drawMap(this.world, this.vehicle, this.traffic, this.mission.target || this.mission.checkpoints[this.mission.checkIdx]);

      if (this.opts.sound)
        this.sound.update(raw, {
          rpm: this.vehicle.rpm,
          throttle: this.vehicle.throttle,
          engineOn: this.vehicle.engineOn,
          cranking: this.vehicle.starterT > 0,
          kmh: this.vehicle.kmh,
          slip: Math.max(Math.abs(this.vehicle.slipFront), Math.abs(this.vehicle.slipRear)),
          absActive: this.vehicle.absActive,
        });
    }

    this.syncCar(1);
    this.render();
  }

  render() {
    if (!this.world) return;
    const v = this.vehicle;
    // Keep the shadow frustum on the car; refresh the map once per frame only.
    this.sun.position.set(v.x + 32, 46, -v.y + 22);
    this.sun.target.position.set(v.x, 0, -v.y);
    this.sun.target.updateMatrixWorld();
    if (this.opts.shadows) this.renderer.shadowMap.needsUpdate = true;

    const cam = this.activeCamera();
    const cockpit = this.state.view === 0 || this.state.view === 1;
    this.car.group.visible = true;

    if (this.opts.mirrors && cockpit) {
      for (const m of this.mirrors) {
        this.renderer.setRenderTarget(m.rt);
        this.renderer.clear();
        this.renderer.render(this.scene, m.cam);
      }
      this.renderer.setRenderTarget(null);
    }

    this.renderer.autoClear = true;
    this.renderer.render(this.scene, cam);

    if (this.opts.mirrors && cockpit) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.mirrorScene, this.mirrorCam);
      this.renderer.autoClear = true;
    }
    for (const m of this.mirrors) m.frame.style.display = this.opts.mirrors && cockpit ? 'block' : 'none';
  }

  showResult(res) {
    const el = $('result');
    $('result-title').textContent = res.score >= 80 ? 'Nicely done' : res.score >= 55 ? 'Passed — with faults' : 'Needs work';
    $('result-score').textContent = Math.round(res.score);
    $('result-score').style.color =
      res.score >= 80 ? 'var(--good)' : res.score >= 55 ? 'var(--warn)' : 'var(--bad)';
    const rows = [['Time', `${res.elapsed.toFixed(1)} s`]];
    for (const [k, n] of Object.entries(res.faults)) rows.push([k, `×${n}`]);
    if (rows.length === 1) rows.push(['Faults', 'none']);
    $('result-list').innerHTML = rows.map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
    el.hidden = false;
    this.paused = true;
    this.input.enabled = false;
    this.sound.chime(res.score >= 55);
  }
}

/* ------------------------------------------------------------------ bootstrap */

const game = new Game();
window.__game = game;
game.buildWorld();
game.hud.setMission(MISSIONS[0].name, MISSIONS[0].hint);
$('loading').classList.add('hidden');
game.frame();
