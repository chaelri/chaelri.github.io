// Drop-in replacement for the Firebase Realtime Database calls the app uses.
// Everything is stored in this device's localStorage: no server, no login, no cost.
const PREFIX = "moneyapp:";
const mem = {};
const listeners = {}; // path -> Set<fn>

function read(path) {
  try { const t = localStorage.getItem(PREFIX + path); if (t != null) return JSON.parse(t); } catch (e) {}
  return mem[path] ?? null;
}
function write(path, val) {
  mem[path] = val;
  try { localStorage.setItem(PREFIX + path, JSON.stringify(val)); }
  catch (e) { console.error("storage full or blocked", e); throw e; }
}
const snap = (v) => ({ val: () => v, exists: () => v != null });
function notify(path) { (listeners[path] || []).forEach((fn) => fn()); }

export function initializeApp() { return {}; }
export function getDatabase() { return {}; }
export function ref(_db, path) { return { path }; }
export function query(r, ...cs) { return { ref: r, limit: cs.reduce((n, c) => c.limit || n, 0) }; }
export function limitToLast(n) { return { limit: n }; }
export async function get(r) { return snap(read(r.path)); }
export async function set(r, val) { write(r.path, val); notify(r.path); }
export async function push(r, val) {
  const cur = read(r.path) || {};
  const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  cur[key] = val;
  const keys = Object.keys(cur);
  if (keys.length > 500) for (const k of keys.sort().slice(0, keys.length - 500)) delete cur[k];
  write(r.path, cur); notify(r.path);
}
export function onValue(target, cb, errCb) {
  const r = target.ref || target, limit = target.limit || 0;
  const fire = () => {
    let v = read(r.path);
    if (limit && v && typeof v === "object") v = Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-limit));
    try { cb(snap(v)); } catch (e) { if (errCb) errCb(e); else console.error(e); }
  };
  (listeners[r.path] = listeners[r.path] || new Set()).add(fire);
  queueMicrotask(fire);
  return () => listeners[r.path].delete(fire);
}
