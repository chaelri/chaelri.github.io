// traffic.js — AI cars that keep right, obey lights, queue behind each other
// and behind you. Kinematic bicycle model: accurate enough at town speeds and
// cheap enough to run a dozen of them inside four render passes.

import * as THREE from 'three';
import { GRID, BLOCK, HW, LANE } from './world.js';
import { buildCar, BODY_COLORS } from './carmodel.js';
import { clamp, clamp01, lerp, wrapAngle, Rng, dist2 } from './util.js';

const WB = 2.55;
const HALF_L = 2.21;
const HALF_W = 0.865;

export class Traffic {
  constructor(scene, world, count = 14, seed = 7, keepClear = null) {
    this.scene = scene;
    this.world = world;
    this.rng = new Rng(seed ^ 0x9e37);
    this.cars = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    // A handful of prototypes, cloned per car — one build pass each.
    // Six prototypes are plenty of variety and keep the build under ~150 ms.
    const palette = BODY_COLORS.slice(0, 6);
    this.protos = palette.map((c) => buildCar({ detail: 'low', color: c }));
    // Never drop a car on top of where the player starts.
    this.keepClear = keepClear || world.spawn || null;

    for (let i = 0; i < count; i++) this._spawn(i);
  }

  _randomState() {
    const rng = this.rng;
    const axis = rng.chance(0.5) ? 'x' : 'y';
    const dir = rng.chance(0.5) ? 1 : -1;
    const line = rng.int(0, GRID - 1);
    let node = rng.int(1, GRID - 2);
    node = clamp(node + dir, 0, GRID - 1);
    return { axis, dir, line, node };
  }

  _spawn(i) {
    const rng = this.rng;
    let st = null;
    let pt = null;
    for (let tries = 0; tries < 40; tries++) {
      st = this._randomState();
      const g = this._alongGrid(st);
      const from = g[st.node - st.dir] !== undefined ? g[st.node - st.dir] + st.dir * HW : g[st.node] - st.dir * 30;
      const to = g[st.node] - st.dir * HW;
      const t = lerp(from, to, rng.range(0.15, 0.85));
      pt = this._lanePoint(st, t);
      let ok = true;
      for (const c of this.cars) if (dist2(c.x, c.y, pt.x, pt.y) < 12 * 12) ok = false;
      if (this.keepClear && dist2(this.keepClear.x, this.keepClear.y, pt.x, pt.y) < 30 * 30) ok = false;
      if (ok) break;
    }
    const proto = this.protos[i % this.protos.length];
    const g = proto.group.clone(true);
    // Give every car its own brake-light material so they light independently.
    const tail = g.getObjectByName('lampTail');
    if (tail) tail.material = tail.material.clone();
    this.group.add(g);

    const car = {
      id: i,
      x: pt.x,
      y: pt.y,
      psi: this._headingOf(st),
      v: 6,
      st,
      path: [],
      idx: 0,
      turning: false,
      mesh: g,
      tail,
      wheels: [0, 1, 2, 3].map((k) => ({
        steer: g.getObjectByName('wheel' + k),
        spin: g.getObjectByName('spin' + k),
        steered: k < 2,
      })),
      spin: 0,
      waiting: false,
      stuck: 0,
    };
    this._extendPath(car);
    this.cars.push(car);
  }

  /* -------------------------------------------------------------- geometry */

  _alongGrid(st) {
    return st.axis === 'x' ? this.world.gx : this.world.gy;
  }
  _crossGrid(st) {
    return st.axis === 'x' ? this.world.gy : this.world.gx;
  }

  // Point on the correct (right-hand) lane at along-axis coordinate t.
  _lanePoint(st, t) {
    const cross = this._crossGrid(st)[st.line];
    if (st.axis === 'x') return { x: t, y: cross - st.dir * (LANE / 2) };
    return { x: cross + st.dir * (LANE / 2), y: t };
  }

  _headingOf(st) {
    if (st.axis === 'x') return st.dir > 0 ? 0 : Math.PI;
    return st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // Where the current road meets the junction the car is heading into.
  _entryCoord(st) {
    return this._alongGrid(st)[st.node] - st.dir * HW;
  }

  _turnOptions(st) {
    const { axis, dir, line, node } = st;
    const opts = [];
    const push = (o) => {
      const g = o.axis === 'x' ? GRID : GRID;
      if (o.node >= 0 && o.node < g && o.line >= 0 && o.line < GRID) opts.push(o);
    };
    if (axis === 'x') {
      push({ axis: 'x', dir, line, node: node + dir, kind: 'straight' });
      // Heading +X: right is -Y. Heading -X: right is +Y.
      push({ axis: 'y', dir: dir > 0 ? -1 : 1, line: node, node: line + (dir > 0 ? -1 : 1), kind: 'right' });
      push({ axis: 'y', dir: dir > 0 ? 1 : -1, line: node, node: line + (dir > 0 ? 1 : -1), kind: 'left' });
    } else {
      push({ axis: 'y', dir, line, node: node + dir, kind: 'straight' });
      // Heading +Y: right is +X. Heading -Y: right is -X.
      push({ axis: 'x', dir: dir > 0 ? 1 : -1, line: node, node: line + (dir > 0 ? 1 : -1), kind: 'right' });
      push({ axis: 'x', dir: dir > 0 ? -1 : 1, line: node, node: line + (dir > 0 ? -1 : 1), kind: 'left' });
    }
    return opts;
  }

  _extendPath(car) {
    const st = car.st;
    const g = this._alongGrid(st);
    const entry = this._entryCoord(st);
    // Straight run up to the stop line.
    const start = car.path.length ? null : this._along(car);
    const from = start !== null ? start : g[st.node - st.dir] + st.dir * HW;
    const steps = Math.max(2, Math.round(Math.abs(entry - from) / 6));
    for (let k = 1; k <= steps; k++) {
      const t = lerp(from, entry, k / steps);
      car.path.push({ ...this._lanePoint(st, t), turn: false });
    }
    car.stopIndex = car.path.length - 1;

    // Choose the next road and arc through the junction.
    const opts = this._turnOptions(st);
    const weights = opts.map((o) => (o.kind === 'straight' ? 0.55 : 0.225));
    let pick = opts[0];
    let roll = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        pick = opts[i];
        break;
      }
    }
    const st2 = { axis: pick.axis, dir: pick.dir, line: pick.line, node: pick.node };
    // Grid indices of the junction being crossed.
    const ji = st.axis === 'x' ? st.node : st.line;
    const jj = st.axis === 'x' ? st.line : st.node;
    // Exit coordinate along the new road, measured from that same junction.
    const exitT =
      (st2.axis === 'x' ? this.world.gx[ji] : this.world.gy[jj]) + st2.dir * HW;
    const P0 = this._lanePoint(st, entry);
    const P1 = this._lanePoint(st2, exitT);
    const C = { x: st.axis === 'x' ? P1.x : P0.x, y: st.axis === 'x' ? P0.y : P1.y };
    const N = pick.kind === 'straight' ? 3 : 7;
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const it = 1 - t;
      car.path.push({
        x: it * it * P0.x + 2 * it * t * C.x + t * t * P1.x,
        y: it * it * P0.y + 2 * it * t * C.y + t * t * P1.y,
        turn: pick.kind !== 'straight',
      });
    }
    car.nextState = st2;
    car.turnKind = pick.kind;
  }

  _along(car) {
    return car.st.axis === 'x' ? car.x : car.y;
  }

  /* ---------------------------------------------------------------- update */

  update(dt, player) {
    const w = this.world;
    for (const car of this.cars) {
      // Retire and respawn anything that wandered off the network.
      if (Math.abs(car.x) > 1e4 || Math.abs(car.y) > 1e4) continue;

      if (car.idx >= car.path.length - 3) {
        if (car.nextState) {
          car.st = car.nextState;
          car.nextState = null;
        }
        // Trim consumed waypoints so the array stays short.
        car.path = car.path.slice(car.idx);
        car.stopIndex = Math.max(0, (car.stopIndex || 0) - car.idx);
        car.idx = 0;
        this._extendPath(car);
      }

      // --- target speed
      const inTurn = car.path[Math.min(car.idx + 1, car.path.length - 1)].turn;
      let target = inTurn ? 4.4 : 8.4;

      // Junction discipline: stop at the line for a red, and give way if the
      // box is already occupied.
      const stopPt = car.path[Math.min(car.stopIndex || 0, car.path.length - 1)];
      const dStop = Math.hypot(stopPt.x - car.x, stopPt.y - car.y);
      const beforeLine = car.idx <= (car.stopIndex || 0);
      if (beforeLine && dStop < 34) {
        const hasLight = w.hasLight(
          car.st.axis === 'x' ? car.st.node : car.st.line,
          car.st.axis === 'x' ? car.st.line : car.st.node
        );
        let mustStop = false;
        if (hasLight) {
          const state = w.lightState(car.st.axis);
          if (state === 'red' || (state === 'amber' && dStop > 6)) mustStop = true;
        }
        if (!mustStop && dStop < 12) {
          const jx = car.st.axis === 'x' ? w.gx[car.st.node] : w.gx[car.st.line];
          const jy = car.st.axis === 'x' ? w.gy[car.st.line] : w.gy[car.st.node];
          for (const o of this.cars) {
            if (o === car) continue;
            if (Math.abs(o.x - jx) < HW + 1 && Math.abs(o.y - jy) < HW + 1) {
              const dOther = Math.hypot(o.x - jx, o.y - jy);
              if (dOther < dStop) mustStop = true;
            }
          }
        }
        if (mustStop) target = Math.min(target, clamp((dStop - 1.6) * 0.85, 0, target));
      }

      // --- car / player ahead
      const cx = Math.cos(car.psi);
      const cy = Math.sin(car.psi);
      const consider = (ox, oy, halfL) => {
        const rx = ox - car.x;
        const ry = oy - car.y;
        const fwd = rx * cx + ry * cy;
        const lat = -rx * cy + ry * cx;
        if (fwd > 0.5 && fwd < 22 && Math.abs(lat) < 2.5) {
          const gap = fwd - (HALF_L + halfL + 1.2);
          target = Math.min(target, clamp(gap * 1.15, 0, target));
        }
      };
      for (const o of this.cars) if (o !== car) consider(o.x, o.y, HALF_L);
      if (player) consider(player.x, player.y, HALF_L);
      for (const p of w.parkedCars) consider(p.x, p.y, HALF_L * 0.6);

      // --- longitudinal
      const accel = 2.3;
      const decel = target < car.v - 3 ? 6.5 : 4.2;
      car.v = clamp(car.v + clamp(target - car.v, -decel * dt, accel * dt), 0, 14);
      car.waiting = car.v < 0.4 && target < 0.5;

      // --- pure pursuit
      const ld = clamp(3.2 + car.v * 0.75, 3.5, 13);
      let i = car.idx;
      let acc = 0;
      let px = car.x;
      let py = car.y;
      while (i < car.path.length - 1 && acc < ld) {
        acc += Math.hypot(car.path[i].x - px, car.path[i].y - py);
        px = car.path[i].x;
        py = car.path[i].y;
        i++;
      }
      const tgt = car.path[Math.min(i, car.path.length - 1)];
      const ang = wrapAngle(Math.atan2(tgt.y - car.y, tgt.x - car.x) - car.psi);
      const delta = clamp(Math.atan2(2 * WB * Math.sin(ang), Math.max(ld, 2)), -0.61, 0.61);

      car.psi += ((car.v * Math.tan(delta)) / WB) * dt;
      car.x += Math.cos(car.psi) * car.v * dt;
      car.y += Math.sin(car.psi) * car.v * dt;
      car.spin += (car.v / 0.303) * dt;
      car.delta = delta;

      // Advance along the path.
      while (
        car.idx < car.path.length - 1 &&
        Math.hypot(car.path[car.idx].x - car.x, car.path[car.idx].y - car.y) < 3.0
      ) {
        car.idx++;
      }

      // --- presentation
      car.mesh.position.set(car.x, 0, -car.y);
      car.mesh.rotation.y = car.psi;
      for (const wl of car.wheels) {
        if (wl.steer && wl.steered) wl.steer.rotation.y = delta;
        if (wl.spin) wl.spin.rotation.z = -car.spin;
      }
      if (car.tail) car.tail.material.emissiveIntensity = target < car.v - 0.3 || car.v < 0.6 ? 2.4 : 0.28;
    }
  }

  obbs() {
    return this.cars.map((c) => ({ x: c.x, y: c.y, hx: HALF_L, hy: HALF_W, rot: c.psi, kind: 'ai', ref: c }));
  }

  setHeadlights(on) {
    for (const c of this.cars) {
      const h = c.mesh.getObjectByName('lampHead');
      if (h) {
        if (!h.userData.own) {
          h.material = h.material.clone();
          h.userData.own = true;
        }
        h.material.emissiveIntensity = on ? 2.2 : 0.15;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
