// missions.js — practice tasks, live feedback and LTO-style fault scoring.

import * as THREE from 'three';
import { clamp, clamp01, rad2deg, wrapAngle, obbCorners, pointInObb, dist2 } from './util.js';

export const MISSIONS = [
  {
    id: 'free',
    name: 'Free drive',
    blurb: 'Open town, live traffic and lights. No timer — just get used to the car.',
    hint: 'Hold S, press Enter to start, then hold S and press Down to D.',
  },
  {
    id: 'perp',
    name: 'Back-in parking',
    blurb: 'Reverse into a marked bay between two parked cars. The classic LTO manoeuvre.',
    hint: 'Line up past the bay, select R, then swing in. Watch both mirrors.',
    par: 100,
  },
  {
    id: 'parallel',
    name: 'Parallel parking',
    blurb: 'Reverse into a 7 m kerbside gap and finish square inside the yellow box.',
    hint: 'Stop level with the front car, full lock right, then straighten.',
    par: 120,
  },
  {
    id: 'angle',
    name: 'Angle parking',
    blurb: 'Drive forward into a 45-degree bay without touching the lines.',
    hint: 'Approach wide, turn late, creep in on the brake.',
    par: 70,
  },
  {
    id: 'slalom',
    name: 'Cone slalom',
    blurb: 'Weave through seven cones at walking pace. Tests low-speed steering.',
    hint: 'Use creep and the brake pedal only. Do not touch a cone.',
    par: 80,
  },
  {
    id: 'city',
    name: 'City route',
    blurb: 'Three checkpoints across town. Obey the lights and keep right.',
    hint: 'Signal your turns. Red light or wrong lane costs you points.',
    par: 220,
  },
];

const FAULTS = {
  collision: { pts: 18, label: 'Collision' },
  cone: { pts: 6, label: 'Cone hit' },
  kerb: { pts: 5, label: 'Kerb strike' },
  offroad: { pts: 4, label: 'Left the road' },
  redlight: { pts: 14, label: 'Ran a red' },
  wrongside: { pts: 8, label: 'Wrong side' },
  overspeed: { pts: 5, label: 'Over 40 km/h in the lot' },
  harsh: { pts: 3, label: 'Harsh braking' },
};

export class MissionRunner {
  constructor(scene, world, hud) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.markers = new THREE.Group();
    scene.add(this.markers);
    this.reset('free');
  }

  reset(id) {
    this.def = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
    this.id = this.def.id;
    this.elapsed = 0;
    this.faults = {};
    this.faultCount = 0;
    this.done = false;
    this.settleT = 0;
    this.checkIdx = 0;
    this.target = null;
    this.checkpoints = [];
    this.markers.clear();
    this.startPose = null;

    const w = this.world;
    if (this.id === 'perp') {
      this.target = w.bays.find((b) => b.cell === 'range' && b.kind === 'perp' && b.target) || null;
      this.startPose = this.target ? { x: this.target.x - 8, y: this.target.y - 8.5, psi: 0 } : null;
    } else if (this.id === 'parallel') {
      this.target = w.bays.find((b) => b.kind === 'parallel') || null;
      this.startPose = this.target ? { x: this.target.x + 2.9, y: this.target.y + 10, psi: -Math.PI / 2 } : null;
    } else if (this.id === 'angle') {
      this.target = w.bays.find((b) => b.kind === 'angle') || null;
      this.startPose = this.target ? { x: this.target.x - 12, y: this.target.y - 8, psi: 0 } : null;
    } else if (this.id === 'slalom') {
      const c = w.cones;
      if (c.length) {
        this.startPose = { x: c[0].x - 8, y: c[0].y + (c[0].y > 0 ? -1.6 : 1.6), psi: 0 };
        this.slalomEnd = { x: c[c.length - 1].x + 8, y: c[c.length - 1].y };
      }
    } else if (this.id === 'city') {
      const rngPts = [];
      for (let k = 0; k < 3; k++) {
        const i = 1 + ((k * 2 + 1) % (w.gx.length - 2));
        const j = 1 + ((k * 3 + 2) % (w.gy.length - 2));
        rngPts.push({ x: w.gx[i], y: w.gy[j] });
      }
      this.checkpoints = rngPts;
      this.startPose = { ...w.spawn };
    } else {
      this.startPose = { ...w.spawn };
    }

    this._buildMarkers();
  }

  _buildMarkers() {
    this.markers.clear();
    const mkRing = (x, y, r, color) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.14, 8, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.9;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.94, r * 0.94, 5, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        })
      );
      pillar.position.y = 2.5;
      g.add(ring, pillar);
      g.position.set(x, 0, -y);
      this.markers.add(g);
      return g;
    };

    if (this.target) {
      const b = this.target;
      const g = new THREE.Group();
      const geo = new THREE.BoxGeometry(b.hl * 2, 0.02, b.hw * 2);
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x33d68b, transparent: true, opacity: 0.28, toneMapped: false })
      );
      m.position.y = 0.06;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(b.hl * 2, 0.9, b.hw * 2)),
        new THREE.LineBasicMaterial({ color: 0x33d68b, transparent: true, opacity: 0.75 })
      );
      edges.position.y = 0.45;
      g.add(m, edges);
      g.position.set(b.x, 0, -b.y);
      g.rotation.y = b.psi;
      this.markers.add(g);
      this.targetMesh = g;
    }
    if (this.id === 'slalom' && this.slalomEnd) mkRing(this.slalomEnd.x, this.slalomEnd.y, 2.4, 0x33d68b);
    if (this.id === 'city') {
      this.cpMeshes = this.checkpoints.map((p, i) => {
        const g = mkRing(p.x, p.y, 3.2, i === 0 ? 0x33d68b : 0x4ea8ff);
        g.visible = i === 0;
        return g;
      });
    }
  }

  fault(kind) {
    const f = FAULTS[kind];
    if (!f) return;
    this.faults[kind] = (this.faults[kind] || 0) + 1;
    this.faultCount++;
    this.hud.toast(f.label + (this.faults[kind] > 1 ? ` ×${this.faults[kind]}` : ''), 'bad', 1800);
  }

  get score() {
    let s = 100;
    for (const [k, n] of Object.entries(this.faults)) s -= FAULTS[k].pts * n;
    if (this.def.par && this.elapsed > this.def.par) s -= Math.min(15, (this.elapsed - this.def.par) / 8);
    return clamp(s, 0, 100);
  }

  // Geometry of "is the car properly inside the bay?".
  bayCheck(v) {
    const b = this.target;
    if (!b) return null;
    const car = { x: v.x, y: v.y, hx: 2.21, hy: 0.865, rot: v.psi };
    const corners = obbCorners(car);
    const box = { x: b.x, y: b.y, hx: b.hl + 0.06, hy: b.hw + 0.06, rot: b.psi };
    let inside = 0;
    for (const [cx, cy] of corners) if (pointInObb(cx, cy, box)) inside++;
    const dHead = Math.min(
      Math.abs(wrapAngle(v.psi - b.psi)),
      Math.abs(wrapAngle(v.psi - b.psi - Math.PI))
    );
    const d = Math.hypot(v.x - b.x, v.y - b.y);
    return { inside, corners: corners.length, headErr: rad2deg(dHead), dist: d };
  }

  update(dt, v, ctx) {
    if (this.done) return;
    this.elapsed += dt;

    const rows = [];
    let complete = false;

    if (this.target) {
      const c = this.bayCheck(v);
      const allIn = c.inside === 4;
      const square = c.headErr < 8;
      const stopped = v.kmh < 0.6;
      const parked = v.gearPos === 'P';
      rows.push({ label: 'Inside the box', value: `${c.inside}/4`, state: allIn ? 'ok' : 'no' });
      rows.push({
        label: 'Alignment',
        value: `${c.headErr.toFixed(1)}°`,
        state: square ? 'ok' : 'no',
      });
      rows.push({ label: 'Distance', value: `${c.dist.toFixed(1)} m` });
      rows.push({ label: 'Selector', value: v.gearPos, state: parked ? 'ok' : '' });
      if (allIn && square && stopped && parked) {
        this.settleT += dt;
        if (this.settleT > 0.7) complete = true;
      } else this.settleT = 0;
      if (this.targetMesh) {
        const col = allIn && square ? 0x33d68b : allIn ? 0xffb02e : 0x4ea8ff;
        this.targetMesh.children.forEach((m) => m.material.color.setHex(col));
      }
    } else if (this.id === 'slalom') {
      const knocked = this.world.cones.filter((c) => c.knocked).length;
      rows.push({ label: 'Cones standing', value: `${this.world.cones.length - knocked}/${this.world.cones.length}` });
      rows.push({ label: 'Speed', value: `${v.kmh.toFixed(0)} km/h`, state: v.kmh < 20 ? 'ok' : 'no' });
      if (this.slalomEnd) {
        const d = Math.hypot(v.x - this.slalomEnd.x, v.y - this.slalomEnd.y);
        rows.push({ label: 'To finish', value: `${d.toFixed(0)} m` });
        if (d < 2.6 && v.kmh < 3) complete = true;
      }
    } else if (this.id === 'city') {
      const cp = this.checkpoints[this.checkIdx];
      if (cp) {
        const d = Math.hypot(v.x - cp.x, v.y - cp.y);
        rows.push({ label: 'Checkpoint', value: `${this.checkIdx + 1}/${this.checkpoints.length}` });
        rows.push({ label: 'Distance', value: `${d.toFixed(0)} m` });
        if (d < 5.5) {
          if (this.cpMeshes[this.checkIdx]) this.cpMeshes[this.checkIdx].visible = false;
          this.checkIdx++;
          if (this.checkIdx < this.cpMeshes.length) this.cpMeshes[this.checkIdx].visible = true;
          this.hud.toast(
            this.checkIdx >= this.checkpoints.length ? 'Route complete' : 'Checkpoint',
            'good',
            1500
          );
          if (this.checkIdx >= this.checkpoints.length) complete = true;
        }
      }
    } else {
      rows.push({ label: 'Distance driven', value: `${(v.odometer / 1000).toFixed(2)} km` });
      rows.push({ label: 'Surface', value: ctx.surface });
      rows.push({ label: 'Gear', value: v.displayGear });
    }

    this.hud.setMetrics(rows);
    this.hud.setFaults(
      Object.entries(this.faults).map(([k, n]) => FAULTS[k].label + (n > 1 ? ` ×${n}` : ''))
    );

    if (complete) {
      this.done = true;
      return { finished: true, score: this.score, elapsed: this.elapsed, faults: { ...this.faults } };
    }
    return null;
  }
}

export { FAULTS };
