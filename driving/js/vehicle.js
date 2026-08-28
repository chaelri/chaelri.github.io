// vehicle.js — the driving model.
//
// Frame: X forward, Y left, psi CCW (left-positive). vx = forward speed,
// vy = lateral speed (left-positive), r = yaw rate.
//
// Drivetrain is modelled the way a real automatic behaves, because that is the
// whole point of the sim:
//   engine (torque curve + friction, own inertia)
//     -> torque converter (capacity + torque ratio, slips at low speed)
//        -> 4-speed planetary box (shift schedule w/ hysteresis + kickdown)
//           -> final drive -> front wheels
// Idle torque through an unlocked converter is what makes the car creep
// forward the moment you lift off the brake. Lifting the throttle at speed
// with the converter locked is what gives engine braking; the L gate holds a
// low gear so the engine drags harder.

import { clamp, clamp01, lerp, moveTowards, tableLookup, deg2rad } from './util.js';

const RPM = Math.PI / 30; // rpm -> rad/s
const G = 9.81;
const RHO = 1.225;

export const SPEC = {
  mass: 1150,
  izz: 1580,
  wheelbase: 2.55,
  a: 1.18, // CG -> front axle
  b: 1.37, // CG -> rear axle
  track: 1.49,
  cgHeight: 0.53,
  wheelR: 0.303,

  mu: 1.02,
  cFront: 66000, // cornering stiffness per axle, N/rad
  cRear: 74000,

  cd: 0.3,
  frontArea: 2.15,
  crr: 0.0135,

  maxBrakeForce: 11200,
  handbrakeForce: 3400,
  parkPawlForce: 26000,

  steerRatio: 15.43,
  maxWheelDeg: 540,
  maxRoadWheel: deg2rad(35),

  idleRPM: 780,
  redlineRPM: 6200,
  revLimitRPM: 6400,
  engineInertia: 0.26,
  convCap: 2.55e-3, // stall around 2300 rpm at full throttle
  gears: [2.847, 1.552, 1.0, 0.7],
  reverse: 2.343,
  final: 4.237,
  driveEff: 0.92,

  fuelCapacity: 42,
};

const TORQUE_CURVE = [
  [700, 76],
  [1000, 96],
  [1400, 110],
  [1800, 120],
  [2400, 131],
  [3000, 137],
  [3600, 140],
  [4200, 141],
  [4800, 136],
  [5400, 126],
  [6000, 112],
  [6400, 88],
];

export const GATE = ['P', 'R', 'N', 'D', 'L'];

export class Vehicle {
  constructor(spec = SPEC) {
    this.s = { ...spec };
    this.reset(0, 0, 0);
  }

  reset(x = 0, y = 0, psi = 0) {
    this.x = x;
    this.y = y;
    this.psi = psi;
    this.vx = 0;
    this.vy = 0;
    this.r = 0;
    this.ax = 0;
    this.ay = 0;

    this.we = 0; // engine speed, rad/s
    this.engineOn = false;
    this.starterT = 0;
    this.stalled = false;

    this.gearPos = 'P';
    this.gear = 1;
    this.pendingGear = 1;
    this.shiftT = 0;
    this.shiftDur = 0.4;
    this.shiftTorque = 1;
    this.timeSinceShift = 9;
    this.lockup = false;

    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.handbrake = 0;
    this.rawThrottle = 0;
    this.rawBrake = 0;
    this.rawSteer = 0;

    this.wheelAngle = 0; // steering wheel, right-positive, rad
    this.delta = 0; // road wheel, left-positive, rad
    this.wheelSpin = 0;

    this.pitch = 0;
    this.roll = 0;
    this.bodyHeave = 0;

    this.slipFront = 0;
    this.slipRear = 0;
    this.wheelspin = 0;
    this.absActive = false;
    this.engineBraking = 0;

    this.odometer = 0;
    this.time = 0;
    this.lastMsg = null;
  }

  get rpm() {
    return this.we / RPM;
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  get kmh() {
    return Math.abs(this.vx) * 3.6;
  }
  get inGear() {
    return this.gearPos === 'D' || this.gearPos === 'L' || this.gearPos === 'R';
  }
  get displayGear() {
    if (this.gearPos === 'D') return 'D' + this.gear;
    if (this.gearPos === 'L') return 'L' + this.gear;
    return this.gearPos;
  }

  msg(text, kind = 'info') {
    this.lastMsg = { text, kind };
  }
  takeMsg() {
    const m = this.lastMsg;
    this.lastMsg = null;
    return m;
  }

  obb() {
    // Car footprint in the math frame (length along heading).
    return { x: this.x, y: this.y, hx: 2.21, hy: 0.865, rot: this.psi, ref: this };
  }

  /* ------------------------------------------------------------- controls */

  setInput(inp) {
    this.rawThrottle = clamp01(inp.throttle || 0);
    this.rawBrake = clamp01(inp.brake || 0);
    this.rawSteer = clamp(inp.steer || 0, -1, 1);
    this.handbrake = clamp01(inp.handbrake || 0);
  }

  toggleIgnition() {
    if (this.engineOn) {
      if (this.kmh > 3) {
        this.msg('Stop the car before switching the engine off', 'warn');
        return;
      }
      this.engineOn = false;
      this.msg('Engine off', 'info');
      return;
    }
    if (this.gearPos !== 'P' && this.gearPos !== 'N') {
      this.msg('Shift to P or N before starting', 'warn');
      return;
    }
    if (this.brake < 0.2) {
      this.msg('Hold the brake (S) to start the engine', 'warn');
      return;
    }
    this.starterT = 0.75;
    this.msg('Starting…', 'info');
  }

  // dir: -1 moves toward P, +1 moves toward L (like pulling the lever down).
  requestShift(dir) {
    const i = GATE.indexOf(this.gearPos);
    const j = clamp(i + dir, 0, GATE.length - 1);
    if (i === j) return;
    const to = GATE[j];
    const from = this.gearPos;

    if (!this.engineOn && from === 'P') {
      this.msg('Start the engine first (Enter)', 'warn');
      return;
    }
    if (from === 'P' && this.brake < 0.25) {
      this.msg('Brake-shift interlock — hold S to leave P', 'warn');
      return;
    }
    if (to === 'P' && this.kmh > 1.0) {
      this.msg('Come to a full stop before selecting P', 'warn');
      return;
    }
    if ((to === 'R' || from === 'R') && this.kmh > 4) {
      this.msg('Too fast to change direction — stop first', 'warn');
      return;
    }
    if ((to === 'R' || to === 'D') && this.brake < 0.2 && this.kmh < 4) {
      this.msg('Hold the brake (S) when selecting ' + to, 'warn');
      return;
    }

    this.gearPos = to;
    if (to === 'D' || to === 'L') this.gear = 1;
    this.timeSinceShift = 0;
    this.msg('Gear: ' + to, 'good');
  }

  /* ---------------------------------------------------------------- update */

  update(dt, env = {}) {
    const S = this.s;
    this.time += dt;
    const grip = env.gripScale !== undefined ? env.gripScale : 1;
    const rollExtra = env.rollExtra || 0;

    /* pedals: real travel takes time, which matters for smooth stops -------- */
    this.throttle = moveTowards(this.throttle, this.rawThrottle, dt / (this.rawThrottle > this.throttle ? 0.2 : 0.12));
    this.brake = moveTowards(this.brake, this.rawBrake, dt / (this.rawBrake > this.brake ? 0.14 : 0.1));

    /* steering: hands move the wheel at a finite rate ----------------------- */
    const kmh = this.kmh;
    const maxW = deg2rad(S.maxWheelDeg);
    const target = this.rawSteer * maxW;
    if (Math.abs(this.rawSteer) > 0.02) {
      const rate = deg2rad(lerp(560, 250, clamp01(kmh / 80)));
      this.wheelAngle = moveTowards(this.wheelAngle, target, rate * dt);
    } else {
      // Self-centring: caster pulls the wheel back, faster with more speed.
      const back = deg2rad(lerp(70, 560, clamp01(kmh / 45)));
      this.wheelAngle = moveTowards(this.wheelAngle, 0, back * dt);
    }
    this.wheelAngle = clamp(this.wheelAngle, -maxW, maxW);
    this.delta = -clamp(this.wheelAngle / S.steerRatio, -S.maxRoadWheel, S.maxRoadWheel);

    /* starter / ignition ---------------------------------------------------- */
    let Tstarter = 0;
    if (this.starterT > 0) {
      this.starterT -= dt;
      Tstarter = 95;
      if (this.rpm > 420) {
        this.engineOn = true;
        this.starterT = 0;
        this.msg('Engine running', 'good');
      }
      if (this.starterT <= 0 && !this.engineOn) this.msg('Failed to start — try again', 'warn');
    }

    /* transmission timing --------------------------------------------------- */
    this.timeSinceShift += dt;
    if (this.shiftT > 0) {
      this.shiftT -= dt;
      const p = clamp01(1 - this.shiftT / this.shiftDur);
      if (p >= 0.5 && this.gear !== this.pendingGear) this.gear = this.pendingGear;
      // Torque dips through the shift then ramps back in.
      this.shiftTorque = p < 0.5 ? clamp01(1 - p / 0.42) * 0.45 + 0.05 : clamp01((p - 0.5) / 0.42);
      if (this.shiftT <= 0) {
        this.shiftT = 0;
        this.shiftTorque = 1;
        this.timeSinceShift = 0;
      }
    }

    const rpmNow = this.rpm;
    if (this.gearPos === 'D' && this.shiftT === 0 && this.engineOn) {
      const upAt = lerp(2000, 6050, this.throttle);
      const dnAt = lerp(1120, 3000, this.throttle);
      if (rpmNow > upAt && this.gear < S.gears.length && this.timeSinceShift > 0.6 && this.vx > 1.0) {
        this._startShift(this.gear + 1);
      } else if (this.gear > 1 && this.timeSinceShift > 0.45) {
        // Where the engine would land one gear down.
        const projected = rpmNow * (S.gears[this.gear - 2] / S.gears[this.gear - 1]);
        const safe = projected < upAt * 0.94 && projected < S.redlineRPM * 0.94;
        if (rpmNow < dnAt && safe) this._startShift(this.gear - 1);
        else if (this.throttle > 0.85 && rpmNow < upAt * 0.6 && safe) this._startShift(this.gear - 1);
      }
    } else if (this.gearPos === 'L' && this.shiftT === 0) {
      // Low gate: holds 1st, allows 2nd only past ~45 km/h.
      const want = kmh > 45 ? 2 : 1;
      if (want !== this.gear && this.timeSinceShift > 0.5) this._startShift(want);
    }

    /* drivetrain ------------------------------------------------------------ */
    let ratio = 0;
    if (this.gearPos === 'R') ratio = -S.reverse * S.final;
    else if (this.gearPos === 'D' || this.gearPos === 'L') ratio = S.gears[this.gear - 1] * S.final;

    const wheelOmega = this.vx / S.wheelR;
    let wt = ratio !== 0 ? wheelOmega * ratio : 0; // turbine speed, rad/s
    if (wt < 0) wt = 0; // rolling against the selected direction: converter stalls

    // Engine torque with an idle governor.
    let th = this.throttle;
    if (this.engineOn && rpmNow < S.idleRPM + 120 && th < 0.5) {
      th = Math.max(th, clamp01((S.idleRPM + 120 - rpmNow) / 320) * 0.62);
    }
    let Tcomb = this.engineOn ? tableLookup(TORQUE_CURVE, clamp(rpmNow, 600, 6400)) * th : 0;
    if (rpmNow > S.revLimitRPM) Tcomb = 0;
    else if (rpmNow > S.redlineRPM) Tcomb *= clamp01((S.revLimitRPM - rpmNow) / (S.revLimitRPM - S.redlineRPM));
    const Tfric = 5.8 + 0.0078 * Math.max(rpmNow, 0) + (this.engineOn ? 0 : 14);

    // Lock-up clutch: top gears at cruise, and always in L so the engine can
    // actually hold the car back on a downhill / long deceleration.
    const wantLock =
      this.engineOn &&
      ratio !== 0 &&
      this.gearPos !== 'R' &&
      this.shiftT === 0 &&
      wt > S.idleRPM * RPM * 1.12 &&
      (this.gear >= 3 || this.gearPos === 'L') &&
      this.throttle < 0.8;

    let Tturbine = 0;
    if (wantLock) {
      this.lockup = true;
      this.we = Math.max(wt, S.idleRPM * RPM);
      Tturbine = Tcomb - Tfric;
    } else {
      this.lockup = false;
      let Tpump = 0;
      if (ratio !== 0 && this.we > 1) {
        const cap = S.convCap;
        if (wt <= this.we) {
          const sr = clamp01(wt / this.we);
          Tpump = cap * this.we * this.we * (1 - sr * sr);
          const TR = lerp(2.1, 1.0, clamp01(sr / 0.86));
          Tturbine = Tpump * TR;
        } else {
          // Coasting: the wheels drive the converter, which drags the engine up.
          const isr = clamp01(this.we / wt);
          Tpump = -cap * wt * wt * (1 - isr * isr);
          Tturbine = Tpump;
        }
      }
      const dwe = (Tcomb + Tstarter - Tfric - Tpump) / S.engineInertia;
      this.we = Math.max(0, this.we + dwe * dt);
    }
    this.we = clamp(this.we, 0, S.revLimitRPM * RPM * 1.05);
    if (this.engineOn && this.we < 260 * RPM) {
      this.engineOn = false;
      this.stalled = true;
      this.msg('Engine stalled', 'bad');
    }

    let Twheel = Tturbine * ratio * S.driveEff * this.shiftTorque;
    let Fdrive = Twheel / S.wheelR;
    this.engineBraking = Fdrive < -60 && this.throttle < 0.05 ? clamp01(-Fdrive / 2200) : 0;

    /* vertical loads + longitudinal resistances ----------------------------- */
    const L = S.wheelbase;
    const W = S.mass * G;
    const dz = (S.mass * this.ax * S.cgHeight) / L;
    const Fzf = Math.max(320, (W * S.b) / L - dz);
    const Fzr = Math.max(320, (W * S.a) / L + dz);

    // Front-wheel drive: traction is limited by the front axle.
    const tracLimit = S.mu * grip * Fzf;
    if (Math.abs(Fdrive) > tracLimit) {
      this.wheelspin = clamp01((Math.abs(Fdrive) / tracLimit - 1) * 1.2);
      Fdrive = Math.sign(Fdrive) * tracLimit;
    } else {
      this.wheelspin *= Math.exp(-dt / 0.2);
    }

    let Fbrake = this.brake * S.maxBrakeForce * (0.4 + 0.6 * grip);
    if (this.handbrake > 0.1) Fbrake += this.handbrake * S.handbrakeForce;
    if (this.gearPos === 'P') Fbrake += S.parkPawlForce;
    // Crude ABS: cap total braking at the friction available.
    const brakeLimit = S.mu * grip * W * 1.02;
    this.absActive = Fbrake > brakeLimit && Math.abs(this.vx) > 1.2;
    if (this.absActive) Fbrake = brakeLimit * (0.88 + 0.12 * Math.sin(this.time * 60));

    const vAbs = Math.abs(this.vx);
    const moving = vAbs > 0.06;
    const sgn = moving ? Math.sign(this.vx) : 0;
    const Frr = S.crr * (1 + (env.rollExtra || 0)) * W;
    const Faero = 0.5 * RHO * S.cd * S.frontArea * this.vx * vAbs;

    let Fx = Fdrive - sgn * (Frr + Fbrake) - Faero;

    /* lateral tyre forces ---------------------------------------------------- */
    const d = this.delta;
    const cd_ = Math.cos(d);
    const sd = Math.sin(d);
    const vFy = this.vy + S.a * this.r;
    const vRy = this.vy - S.b * this.r;
    // Front wheel velocity resolved into the (steered) wheel frame.
    const vlong = this.vx * cd_ + vFy * sd;
    const vlat = -this.vx * sd + vFy * cd_;
    const guard = 1.2;
    const alphaF = -Math.atan2(vlat, Math.max(Math.abs(vlong), guard));
    const alphaR = -Math.atan2(vRy, Math.max(vAbs, guard));
    this.slipFront = alphaF;
    this.slipRear = alphaR;

    const hbGrip = 1 - 0.62 * this.handbrake;
    const capF = S.mu * grip * Fzf;
    const capR = S.mu * grip * Fzr * hbGrip;
    // Friction ellipse: longitudinal demand eats into lateral capacity.
    const usedF = Math.min(Math.abs(Fdrive) + Math.abs(sgn * Fbrake * 0.62), capF * 0.98);
    const usedR = Math.min(Math.abs(sgn * Fbrake * 0.38), capR * 0.98);
    const latCapF = Math.sqrt(Math.max(0, capF * capF - usedF * usedF));
    const latCapR = Math.sqrt(Math.max(0, capR * capR - usedR * usedR));
    const Fyf = latCapF * Math.tanh((S.cFront * alphaF) / Math.max(latCapF, 1));
    const Fyr = latCapR * Math.tanh((S.cRear * alphaR) / Math.max(latCapR, 1));

    Fx += -Fyf * sd;

    /* integrate --------------------------------------------------------------- */
    const axBody = Fx / S.mass + this.vy * this.r;
    const ayBody = (Fyf * cd_ + Fyr) / S.mass - this.vx * this.r;
    const rdot = (S.a * Fyf * cd_ - S.b * Fyr) / S.izz;

    let vxN = this.vx + axBody * dt;
    let vyN = this.vy + ayBody * dt;
    let rN = this.r + rdot * dt;

    // Standstill handling. The car may only stay put while the drive force is
    // too small to beat the brakes and rolling resistance — otherwise idle
    // creep could never get going.
    const holdForce = Fbrake + Frr;
    if (sgn !== 0 && Math.sign(vxN) !== sgn && Math.abs(Fdrive) < holdForce) vxN = 0;
    if (!moving && Math.abs(Fdrive) <= holdForce) vxN = 0;

    // Below walking pace the tyres do not slip: fall back to exact Ackermann
    // geometry so the turning circle and reversing behaviour are correct.
    const blend = clamp01((Math.abs(vxN) - 1.4) / 5.0);
    if (blend < 1) {
      const rKin = (vxN * Math.tan(d)) / L;
      const vyKin = rKin * S.b;
      rN = lerp(rKin, rN, blend);
      vyN = lerp(vyKin, vyN, blend);
    }
    if (vxN === 0) {
      vyN *= 0.15;
      rN *= 0.15;
    }

    this.ax = (vxN - this.vx) / dt;
    this.ay = ayBody;
    this.vx = vxN;
    this.vy = vyN;
    this.r = rN;

    this.psi += this.r * dt;
    const c = Math.cos(this.psi);
    const s = Math.sin(this.psi);
    // Forward = (cos psi, sin psi); left = (-sin psi, cos psi).
    this.x += (this.vx * c - this.vy * s) * dt;
    this.y += (this.vx * s + this.vy * c) * dt;
    this.odometer += Math.abs(this.vx) * dt;

    this.wheelSpin += (this.vx / S.wheelR) * dt;

    /* body attitude for the camera / model ------------------------------------ */
    const pitchT = clamp(-this.ax * 0.011, -0.055, 0.055);
    const rollT = clamp(this.ay * 0.009, -0.05, 0.05);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 9);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 9);
  }

  _startShift(g) {
    if (g === this.gear) return;
    this.pendingGear = g;
    this.shiftDur = g > this.gear ? 0.42 : 0.34;
    this.shiftT = this.shiftDur;
  }

  // Applied by the collision solver.
  applyImpulse(nx, ny, px, py, restitution = 0.25) {
    // Impulse expressed in the body frame.
    const c = Math.cos(this.psi);
    const s = Math.sin(this.psi);
    const lnx = nx * c + ny * s;
    const lny = -nx * s + ny * c;
    const vn = this.vx * lnx + this.vy * lny;
    if (vn >= 0) return 0;
    const j = -(1 + restitution) * vn;
    this.vx += j * lnx;
    this.vy += j * lny;
    // Contact arm in body coordinates gives the spin.
    const dx = px - this.x;
    const dy = py - this.y;
    const armx = dx * c + dy * s;
    const army = -dx * s + dy * c;
    const torque = armx * (j * lny * this.s.mass) - army * (j * lnx * this.s.mass);
    this.r += clamp(torque / this.s.izz, -1.6, 1.6);
    return Math.abs(vn);
  }
}
