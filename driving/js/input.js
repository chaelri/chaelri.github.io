// input.js — keyboard (WASD + gate), on-screen touch pads, and a tiny event bus.

import { clamp } from './util.js';

const HOLD = {
  KeyW: 'throttle',
  KeyS: 'brake',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'handbrake',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const TAP = {
  ArrowUp: 'shiftUp',
  ArrowDown: 'shiftDown',
  Enter: 'ignition',
  KeyQ: 'indLeft',
  KeyE: 'indRight',
  KeyH: 'horn',
  KeyL: 'lights',
  KeyC: 'camera',
  KeyR: 'respawn',
  KeyM: 'mirrors',
  KeyT: 'daynight',
  KeyN: 'newmap',
  KeyP: 'pause',
  Escape: 'pause',
  KeyF: 'help',
  KeyG: 'wipers',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.listeners = new Map();
    this.touch = { throttle: 0, brake: 0, steer: 0 };
    this.enabled = true;
    this.lastKeyTime = 0;

    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this._up(e));
    window.addEventListener('blur', () => this.held.clear());
    this._bindTouch();
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }

  emit(name, arg) {
    const l = this.listeners.get(name);
    if (l) for (const f of l) f(arg);
  }

  _down(e) {
    if (e.repeat) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const code = e.code;
    if (HOLD[code] || TAP[code]) e.preventDefault();
    this.lastKeyTime = performance.now();
    if (HOLD[code]) this.held.add(HOLD[code]);
    if (TAP[code]) {
      if (code === 'KeyH') this.emit('hornDown');
      this.emit(TAP[code]);
    }
  }

  _up(e) {
    const code = e.code;
    if (HOLD[code]) this.held.delete(HOLD[code]);
    if (code === 'KeyH') this.emit('hornUp');
  }

  _bindTouch() {
    const bind = (el, on, off) => {
      const start = (ev) => {
        ev.preventDefault();
        el.classList.add('pressed');
        on();
      };
      const end = (ev) => {
        ev.preventDefault();
        el.classList.remove('pressed');
        off();
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
    };
    document.querySelectorAll('[data-hold]').forEach((el) => {
      const a = el.dataset.hold;
      bind(
        el,
        () => {
          if (a === 'throttle') this.touch.throttle = 1;
          else if (a === 'brake') this.touch.brake = 1;
          else if (a === 'left') this.touch.steer = -1;
          else if (a === 'right') this.touch.steer = 1;
          else if (a === 'handbrake') this.held.add('handbrake');
        },
        () => {
          if (a === 'throttle') this.touch.throttle = 0;
          else if (a === 'brake') this.touch.brake = 0;
          else if (a === 'left' || a === 'right') this.touch.steer = 0;
          else if (a === 'handbrake') this.held.delete('handbrake');
        }
      );
    });
    document.querySelectorAll('[data-tap]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.emit(el.dataset.tap);
      });
    });
  }

  read() {
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    const t = Math.max(this.held.has('throttle') ? 1 : 0, this.touch.throttle);
    const b = Math.max(this.held.has('brake') ? 1 : 0, this.touch.brake);
    let s = 0;
    if (this.held.has('left')) s -= 1;
    if (this.held.has('right')) s += 1;
    if (s === 0) s = this.touch.steer;
    return {
      throttle: t,
      brake: b,
      steer: clamp(s, -1, 1),
      handbrake: this.held.has('handbrake') ? 1 : 0,
    };
  }
}
