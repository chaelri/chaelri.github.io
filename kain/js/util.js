// Small helpers shared by every view: dates, formatting, DOM, haptics.
import { TZ } from "./config.js";

/* ---------------------------------------------------------------- dates -- */

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Manila time, whatever the device clock is set to. */
export function dayKey(d = new Date()) {
  return dayFmt.format(d);
}

/** Shift a YYYY-MM-DD key by n days without touching timezones. */
export function shiftDay(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function daysBack(n, from = dayKey()) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(shiftDay(from, -i));
  return out;
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const longDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

function asUTC(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekdayLabel(key) {
  return weekdayFmt.format(asUTC(key));
}
export function longDateLabel(key) {
  return longDateFmt.format(asUTC(key));
}
export function shortDateLabel(key) {
  return shortDateFmt.format(asUTC(key));
}

/** "Today" / "Yesterday" / "Mon, Sep 1" */
export function friendlyDate(key) {
  const today = dayKey();
  if (key === today) return "Today";
  if (key === shiftDay(today, -1)) return "Yesterday";
  return `${weekdayLabel(key)}, ${shortDateLabel(key)}`;
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});
export function clockLabel(ts) {
  return timeFmt.format(new Date(ts)).toLowerCase().replace(" ", "");
}

const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false });
export function hourOf(ts = Date.now()) {
  return Number(hourFmt.format(new Date(ts)));
}

/** Meal slot from the clock — used to group the timeline. */
export function mealSlot(ts) {
  const h = hourOf(ts);
  if (h < 11) return "Breakfast";
  if (h < 15) return "Lunch";
  if (h < 18) return "Merienda";
  if (h < 22) return "Dinner";
  return "Late night";
}

export function greeting() {
  const h = hourOf();
  if (h < 11) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Whole years between an ISO birth date and today. */
export function ageFrom(birth) {
  const today = dayKey();
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

/* ------------------------------------------------------------- numbers -- */

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function round(n, step = 1) {
  const v = Math.round((Number(n) || 0) / step) * step;
  return Number(v.toFixed(step < 1 ? 1 : 0));
}

export function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function fmt(n) {
  return Math.round(num(n)).toLocaleString("en-US");
}

/** 1234 → "1.2k" for tight spots. */
export function compact(n) {
  const v = Math.round(num(n));
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("en-US");
}

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ DOM -- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, className = "", html = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function icon(name, cls = "") {
  return `<span class="material-symbols-outlined ${cls}">${name}</span>`;
}

/**
 * Someone's face, with their initial underneath as the fallback — if the photo
 * ever fails to load the circle still reads as them rather than going blank.
 */
export function avatar(person, extraClass = "") {
  return `<span class="who-initial ${extraClass}" data-accent="${person.accent}">${person.initial}${
    person.photo ? `<img src="${person.photo}" alt="" />` : ""
  }</span>`;
}

/** Count a number element up to its new value — the app's signature motion. */
export function countUp(node, to, { duration = 620, format = fmt } = {}) {
  if (!node) return;
  const from = num(node.dataset.value, 0);
  const target = num(to);
  node.dataset.value = String(target);
  if (from === target) {
    node.textContent = format(target);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = format(target);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = clamp((now - t0) / duration, 0, 1);
    // easeOutExpo — fast off the line, gentle landing.
    const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    node.textContent = format(from + (target - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* -------------------------------------------------------------- haptics -- */
/* iOS has never shipped the Vibration API, so navigator.vibrate is a silent
   no-op on both our phones. Safari 17.4+ does play a real Taptic tick when an
   <input type="checkbox" switch> flips, and a hidden one toggled in code is the
   only route a web page has to that engine. Same trick as devo/js/01-core.js. */
let _hapticSwitch = null;

export function haptic(ms = 8) {
  try {
    if (navigator.vibrate?.(ms)) return;
  } catch {}
  try {
    if (!_hapticSwitch) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      // Rendered but out of reach — display:none would stop Safari treating it
      // as a real control, and the haptic goes with it.
      label.style.cssText =
        "position:fixed;top:-64px;left:-64px;width:1px;height:1px;opacity:0;pointer-events:none;";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      label.appendChild(input);
      document.body.appendChild(label);
      _hapticSwitch = input;
    }
    _hapticSwitch.checked = !_hapticSwitch.checked;
    _hapticSwitch.dispatchEvent(new Event("change", { bubbles: true }));
    _hapticSwitch.click();
  } catch {}
}

/* ---------------------------------------------------------------- misc -- */

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
