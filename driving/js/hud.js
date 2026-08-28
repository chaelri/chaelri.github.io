// hud.js — instrument cluster, gear gate, steering-wheel readout, minimap,
// telltales and toasts. Pure DOM/SVG; the sim never touches the DOM directly.

import { clamp, clamp01, lerp, rad2deg, timeStr } from './util.js';
import { GRID, HW } from './world.js';

const SWEEP = 252; // degrees of needle travel
const START = 144; // degrees, measured clockwise from 12 o'clock

const $ = (id) => document.getElementById(id);

function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      rpmVal: $('rpm-val'),
      speedVal: $('speed-val'),
      tachNeedle: $('tach-needle'),
      speedNeedle: $('speedo-needle'),
      gearGate: $('gear-gate'),
      gearCurrent: $('gear-current'),
      gearSub: $('gear-sub'),
      gas: $('pedal-gas'),
      brake: $('pedal-brake'),
      wheelRot: $('wheel-rot'),
      wheelDeg: $('wheel-deg'),
      toasts: $('toasts'),
      minimap: $('minimap'),
      clock: $('clock'),
      score: $('score'),
      missionName: $('mission-name'),
      missionHint: $('mission-hint'),
      metrics: $('mission-metrics'),
      faults: $('faults'),
      tt: {
        engine: $('tt-engine'),
        indL: $('tt-indL'),
        indR: $('tt-indR'),
        hand: $('tt-hand'),
        abs: $('tt-abs'),
        eb: $('tt-eb'),
        lights: $('tt-lights'),
      },
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastQueue = [];
    this._dials();
    this.gateEls = [...this.el.gearGate.querySelectorAll('span')];
  }

  _dials() {
    const ticks = (gEl, lEl, max, step, labelStep, labelFmt) => {
      const g = $(gEl);
      const l = $(lEl);
      let s = '';
      let ls = '';
      for (let v = 0; v <= max; v += step) {
        const t = v / max;
        const deg = START + t * SWEEP;
        const major = v % labelStep === 0;
        const [x1, y1] = polar(100, 100, major ? 74 : 79, deg);
        const [x2, y2] = polar(100, 100, 86, deg);
        s += `<line class="tick${major ? ' major' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(
          1
        )}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
        if (major) {
          const [lx, ly] = polar(100, 100, 60, deg);
          ls += `<text class="dlabel" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${labelFmt(v)}</text>`;
        }
      }
      g.innerHTML = s;
      l.innerHTML = ls;
    };
    ticks('tach-ticks', 'tach-labels', 7000, 250, 1000, (v) => v / 1000);
    ticks('speedo-ticks', 'speedo-labels', 180, 10, 20, (v) => v);

    // Redline arc.
    const rz = $('tach-redzone');
    const a0 = START + (6200 / 7000) * SWEEP;
    const a1 = START + SWEEP;
    const [x0, y0] = polar(100, 100, 88, a0);
    const [x1, y1] = polar(100, 100, 88, a1);
    rz.setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)} A88 88 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`);

    this.maxRpm = 7000;
    this.maxKmh = 180;
  }

  show(on) {
    this.el.hud.classList.toggle('on', on);
  }

  toast(text, kind = 'info', ms = 2200) {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('fade'), ms - 500);
    setTimeout(() => d.remove(), ms);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setMission(name, hint) {
    this.el.missionName.textContent = name;
    this.el.missionHint.textContent = hint;
  }

  setMetrics(rows) {
    this.el.metrics.innerHTML = rows
      .map(
        (r) =>
          `<div class="metric ${r.state || ''}"><span>${r.label}</span><b>${r.value}</b></div>`
      )
      .join('');
  }

  setFaults(list) {
    this.el.faults.innerHTML = list.map((f) => `<span class="fault">${f}</span>`).join('');
  }

  update(v, extra) {
    const e = this.el;
    const rpm = v.engineOn || v.starterT > 0 ? v.rpm : 0;
    e.rpmVal.textContent = Math.round(rpm / 10) * 10;
    e.tachNeedle.setAttribute(
      'transform',
      `rotate(${START + clamp01(rpm / this.maxRpm) * SWEEP} 100 100)`
    );
    const kmh = v.kmh;
    e.speedVal.textContent = Math.round(kmh);
    e.speedNeedle.setAttribute(
      'transform',
      `rotate(${START + clamp01(kmh / this.maxKmh) * SWEEP} 100 100)`
    );

    for (const g of this.gateEls) {
      const active = g.dataset.g === v.gearPos;
      g.classList.toggle('active', active);
      g.classList.toggle('locked', !active && v.gearPos === 'P' && v.brake < 0.25);
    }
    e.gearCurrent.textContent = v.displayGear;
    e.gearSub.textContent = !v.engineOn
      ? 'engine off'
      : v.gearPos === 'P'
      ? 'parked'
      : v.gearPos === 'N'
      ? 'neutral'
      : v.gearPos === 'R'
      ? 'reverse'
      : v.shiftT > 0
      ? 'shifting'
      : v.lockup
      ? 'locked up'
      : 'converter';

    setBar(e.gas, v.throttle);
    setBar(e.brake, v.brake);

    const deg = rad2deg(v.wheelAngle);
    e.wheelRot.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
    e.wheelDeg.textContent = `${deg > 0 ? '+' : ''}${deg.toFixed(0)}°`;

    const tt = e.tt;
    tt.engine.classList.toggle('on', !v.engineOn || v.stalled);
    tt.hand.classList.toggle('on', v.handbrake > 0.1 || v.gearPos === 'P');
    tt.abs.classList.toggle('on', v.absActive);
    tt.eb.classList.toggle('on', v.engineBraking > 0.15 || v.gearPos === 'L');
    tt.lights.classList.toggle('on', !!extra.headlights);
    tt.indL.classList.toggle('on', extra.indL && extra.blink);
    tt.indR.classList.toggle('on', extra.indR && extra.blink);

    e.clock.textContent = timeStr(extra.elapsed || 0);
    e.score.textContent = Math.round(extra.score);
    e.score.style.color = extra.score >= 80 ? 'var(--good)' : extra.score >= 55 ? 'var(--warn)' : 'var(--bad)';
  }

  drawMap(world, v, traffic, target) {
    const c = this.mapCtx;
    const S = this.el.minimap.width;
    const span = (world.max - world.min) * 1.02;
    const k = S / span;
    const toX = (x) => (x - world.min) * k;
    const toY = (y) => S - (y - world.min) * k;

    c.fillStyle = '#0d1117';
    c.fillRect(0, 0, S, S);

    // Blocks.
    c.fillStyle = '#161c25';
    for (const cell of world.cells) {
      const R = world.cellRect(cell.i, cell.j);
      c.fillRect(toX(R.x0), toY(R.y1), (R.x1 - R.x0) * k, (R.y1 - R.y0) * k);
    }
    // Roads.
    c.strokeStyle = '#39434f';
    c.lineWidth = Math.max(2, 11 * k);
    c.beginPath();
    for (let i = 0; i < GRID; i++) {
      c.moveTo(toX(world.gx[i]), toY(world.gy[0] - HW));
      c.lineTo(toX(world.gx[i]), toY(world.gy[GRID - 1] + HW));
      c.moveTo(toX(world.gx[0] - HW), toY(world.gy[i]));
      c.lineTo(toX(world.gx[GRID - 1] + HW), toY(world.gy[i]));
    }
    c.stroke();

    // Lots.
    c.fillStyle = '#243040';
    for (const l of world.lots) c.fillRect(toX(l.x0), toY(l.y1), (l.x1 - l.x0) * k, (l.y1 - l.y0) * k);

    // Traffic.
    c.fillStyle = '#7c8899';
    if (traffic) for (const a of traffic.cars) c.fillRect(toX(a.x) - 1.5, toY(a.y) - 1.5, 3, 3);

    // Target.
    if (target) {
      c.strokeStyle = '#33d68b';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(toX(target.x), toY(target.y), 6, 0, 7);
      c.stroke();
    }

    // Player arrow.
    c.save();
    c.translate(toX(v.x), toY(v.y));
    c.rotate(-v.psi);
    c.fillStyle = '#4ea8ff';
    c.beginPath();
    c.moveTo(7, 0);
    c.lineTo(-5, 4.5);
    c.lineTo(-5, -4.5);
    c.closePath();
    c.fill();
    c.restore();
  }
}

// The pedal fill is the ::after pseudo-element, driven by a custom property.
function setBar(el, v) {
  el.style.setProperty('--right', `${((1 - clamp01(v)) * 100).toFixed(1)}%`);
}
