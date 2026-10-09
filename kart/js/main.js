// Board: owns the race. Phones only send inputs and get their HUD back.
import { buildTrack, HALF } from "./track.js";
import { createRace, step, standings } from "./sim.js";
import { createWorld } from "./render.js";
import { ICON, ITEM_NAME, ORDINAL } from "./icons.js";
import { FLAT } from "../assets/flat.js";
import { Sound } from "./sound.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const MAX = Math.min(4, +params.get("max") || 3);
const SLOT_COLORS = ["#e8312b", "#2a6fe8", "#2fb24c", "#ffb703"];
const CPU_COLORS = ["#ff8a1f", "#8a5cff", "#00b3c7", "#ff5fa8", "#f2f2f2", "#7a4b2a"];
const CPU_NAMES = ["Bubu", "Dudu", "Ming", "Tisoy", "Inday", "Kulot"];
const CHARS = ["yhon", "axolotl", "capybara", "hedgehog"];

const T = buildTrack();
const world = await createWorld(T, $("gl"));
const sound = new Sound();

// ---------------- players ----------------
let players = [];        // {pid, name, char, color, slot, input, online, kb, lastSeen}
let phase = "lobby";     // lobby | race | results
let settings = { cpus: 0, laps: 3 };
let race = null, demo = null, cams = {}, resultsAt = 0;

function freeSlot() {
  for (let i = 0; i < MAX; i++) if (!players.some((p) => p.slot === i)) return i;
  return -1;
}
function player(pid) { return players.find((p) => p.pid === pid); }

// ---------------- network ----------------
let ws = null;
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=board`);
  ws.onmessage = (e) => onServer(JSON.parse(e.data));
  ws.onclose = () => { $("offline").style.display = "block"; setTimeout(connect, 1000); };
  ws.onopen = () => { $("offline").style.display = "none"; };
}
function send(to, m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ to, m })); }
connect();

function onServer(msg) {
  if (msg.t === "hello") { const p = player(msg.pid); if (p) { p.online = true; reply(p); } else send(msg.pid, { t: "board" }); }
  if (msg.t === "bye") { const p = player(msg.pid); if (p) { p.online = false; p.lastSeen = performance.now(); } }
  if (msg.t === "msg") onPhone(msg.pid, msg.m);
  renderLobby();
}

function reply(p) {
  send(p.pid, { t: "joined", slot: p.slot, color: p.color, name: p.name, char: p.char, max: MAX });
}

function onPhone(pid, m) {
  let p = player(pid);
  if (m.t === "in") {
    if (p) { p.input = m; p.lastSeen = performance.now(); p.online = true; }
    return;
  }
  if (m.t === "join") {
    const name = String(m.name || "").trim().slice(0, 12) || "Player";
    const char = CHARS.includes(m.char) ? m.char : "yhon";
    if (!p) {
      if (phase === "race") return send(pid, { t: "wait", why: "A race is on. You're in the next one!" , queued: queue(pid, name, char) });
      const slot = freeSlot();
      if (slot < 0) return send(pid, { t: "full", max: MAX });
      p = { pid, name, char, color: SLOT_COLORS[slot], slot, input: {}, online: true, lastSeen: performance.now() };
      players.push(p);
      sound.join();
    } else { p.name = name; p.char = char; p.online = true; }
    reply(p);
    renderLobby();
    return;
  }
  if (!p) return;
  if (m.t === "char" && CHARS.includes(m.char) && phase !== "race") { p.char = m.char; reply(p); renderLobby(); }
  if (m.t === "leave" && phase !== "race") { players = players.filter((q) => q !== p); renderLobby(); }
  if (m.t === "start") startRace();
  if (m.t === "again" && phase === "results") startRace();
}

const waiting = new Map();
function queue(pid, name, char) { waiting.set(pid, { name, char }); return true; }

// keyboard players (for testing at the Mac, or a 4th person without a phone)
const KB = [
  { left: "ArrowLeft", right: "ArrowRight", gas: "ArrowUp", brake: "ArrowDown", drift: "ShiftRight", item: "Slash" },
  { left: "KeyA", right: "KeyD", gas: "KeyW", brake: "KeyS", drift: "ShiftLeft", item: "KeyE" },
];
const keys = new Set();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  sound.unlock();
  if (e.code === "KeyK" && phase !== "race") addKeyboard();
  if (e.code === "Enter" && phase !== "race") startRace();
  if (e.code === "KeyM") sound.toggle();
  if (e.code === "Escape" && phase !== "lobby") toLobby();
  for (const p of players) if (p.kb !== undefined && e.code === KB[p.kb].item) p.input.i = (p.input.i || 0) + 1;
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", () => sound.unlock());
function addKeyboard() {
  const used = players.filter((p) => p.kb !== undefined).map((p) => p.kb);
  const kb = [0, 1].find((k) => !used.includes(k));
  const slot = freeSlot();
  if (kb === undefined || slot < 0) return;
  players.push({ pid: "kb" + kb, name: kb ? "WASD" : "Arrows", char: CHARS[slot % 4], color: SLOT_COLORS[slot], slot, input: { i: 0 }, online: true, kb });
  renderLobby();
}
function keyboardInputs() {
  for (const p of players) {
    if (p.kb === undefined) continue;
    const k = KB[p.kb];
    p.input = { t: "in", s: (keys.has(k.right) ? 1 : 0) - (keys.has(k.left) ? 1 : 0), g: keys.has(k.gas) ? 1 : 0, b: keys.has(k.brake) ? 1 : 0, d: keys.has(k.drift) ? 1 : 0, i: p.input.i || 0 };
  }
}

// ---------------- races ----------------
function makeRacers(humans, cpus) {
  const out = [];
  for (let i = 0; i < cpus; i++) out.push({ id: "cpu" + i, name: CPU_NAMES[i], char: CHARS[(i + 1) % 4], color: CPU_COLORS[i], human: false });
  for (const p of humans) out.push({ id: p.pid, name: p.name, char: p.char, color: p.color, human: true });
  return out;
}

function startDemo() {
  demo = createRace(T, makeRacers([], 6), { seed: Math.floor(Math.random() * 1e6), countdown: 0.5, laps: 99 });
  world.bind(demo);
}

function startRace() {
  if (phase === "race") return;
  // late arrivals who waited during the last race get seats now
  for (const [pid, w] of waiting) {
    const slot = freeSlot();
    if (slot >= 0 && !player(pid)) players.push({ pid, name: w.name, char: w.char, color: SLOT_COLORS[slot], slot, input: {}, online: true });
  }
  waiting.clear();
  const humans = [...players].sort((a, b) => a.slot - b.slot);
  if (!humans.length) { flash("Scan the QR with a phone first (or press K to drive with the keyboard)"); return; }
  sound.unlock();
  phase = "race";
  race = createRace(T, makeRacers(humans, settings.cpus), { seed: Math.floor(Math.random() * 1e6), laps: settings.laps, countdown: 4.2 });
  race.autopilot = params.has("autopilot");  // testing: the CPU drives the human karts
  world.bind(race);
  cams = {};
  for (const p of humans) cams[p.pid] = world.chaseCam();
  for (const p of players) reply(p);
  $("lobby").classList.remove("show");
  $("results").classList.remove("show");
  sound.music("race");
  layout();
}

function toLobby() {
  phase = "lobby";
  race = null;
  $("results").classList.remove("show");
  $("lobby").classList.add("show");
  startDemo();
  sound.music("lobby");
  layout();
  renderLobby();
}

// ---------------- layout ----------------
let views = [];
function layout() {
  const W = innerWidth, H = innerHeight;
  $("huds").innerHTML = "";
  views = [];
  if (phase === "lobby" || !race) { $("map").style.display = "none"; return; }
  const hs = race.karts.filter((k) => k.human).sort((a, b) => player(a.id).slot - player(b.id).slot);
  const n = hs.length;
  let rects;
  if (n === 1) rects = [[0, 0, W, H]];
  else if (n === 2) rects = [[0, 0, W, H / 2], [0, H / 2, W, H / 2]];
  else if (n === 3) rects = [[0, 0, W / 3, H], [W / 3, 0, W / 3, H], [2 * W / 3, 0, W / 3, H]];   // three columns
  else rects = [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
  hs.forEach((k, i) => {
    const [x, y, w, h] = rects[i].map(Math.round);
    const el = document.createElement("div");
    el.className = "hud";
    Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    el.style.setProperty("--c", k.color);
    el.innerHTML = `<div class="tag">${esc(k.name)}</div><div class="place"></div><div class="lap"></div>
      <div class="itembox"><div class="ic"></div></div><div class="coins">${ICON.coin}<span></span></div>
      <div class="msg"></div><div class="drift"></div>`;
    $("huds").appendChild(el);
    // tall narrow columns: widen the lens so corners stay visible
    cams[k.id].userData.fovAdd = w / h < 1 ? Math.min(24, (1 - w / h) * 48) : 0;
    views.push({ k, x, y, w, h, el, cam: cams[k.id], own: k.id, last: {} });
  });
  // the 4th quadrant (4 players) is the map; otherwise a small overlay in a free corner
  const m = $("map");
  const quad = n === 4;
  m.style.display = quad ? "flex" : "block";
  if (quad) Object.assign(m.style, { left: Math.round(W / 2) + "px", top: Math.round(H / 2) + "px", width: Math.round(W / 2) + "px", height: Math.round(H / 2) + "px" });
  else if (n === 3) Object.assign(m.style, { left: Math.round(W / 3 + 10) + "px", top: (H - 210) + "px", width: "230px", height: "190px" });
  else Object.assign(m.style, { left: "10px", top: (n === 2 ? H / 2 - 215 : H - 250) + "px", width: "270px", height: "210px" });
  m.classList.toggle("quad", quad);
  m.classList.toggle("small", !quad);
}
addEventListener("resize", layout);

// ---------------- HUD ----------------
function hud(v, st) {
  const k = v.k, L = v.last;
  const set = (key, sel, html) => { if (L[key] !== html) { L[key] = html; v.el.querySelector(sel).innerHTML = html; } };
  set("place", ".place", `${k.place}<small>${ORDINAL(k.place).slice(-2)}</small>`);
  v.el.querySelector(".place").dataset.p = k.place;
  set("lap", ".lap", k.finished ? "FINISH" : `LAP <b>${Math.min(st.laps, Math.max(1, k.lap + 1))}</b>/${st.laps}`);
  set("coins", ".coins span", String(k.coins));
  let item = "";
  if (k.roulette > 0) item = ICON[["boost", "banana", "green", "red", "star", "bolt", "triple"][Math.floor(st.t * 14) % 7]];
  else if (k.item) item = ICON[k.item] + (k.item === "triple" && k.itemCount < 3 ? `<i>x${k.itemCount}</i>` : "");
  set("item", ".itembox .ic", item);
  v.el.querySelector(".itembox").classList.toggle("spin", k.roulette > 0);
  let msg = "";
  if (st.phase === "countdown") {
    const c = Math.ceil(st.countdown - 0.7);
    msg = c > 3 ? "" : c > 0 ? `<span class="count">${c}</span>` : `<span class="count go">GO!</span>`;
  } else if (st.phase === "race" && st.t - st.raceStart < 1) msg = `<span class="count go">GO!</span>`;
  else if (k.finished) msg = `<span class="fin">${ORDINAL(k.finishPlace)}!</span><small>${fmt(k.time)}</small>`;
  else if (k.wrong > 1) msg = `<span class="warn">WRONG WAY</span>`;
  else if (v.lapMsg && st.t < v.lapMsg.until) msg = v.lapMsg.html;
  set("msg", ".msg", msg);
  const dl = k.drift ? k.driftLevel : -1;
  set("drift", ".drift", dl > 0 ? ["", "MINI TURBO", "SUPER TURBO", "ULTRA TURBO"][dl] : "");
  v.el.querySelector(".drift").dataset.l = dl;
}
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; }

// minimap
const mapC = $("mapc"), mctx = mapC.getContext("2d");
let mapScale = null;
function drawMap(st) {
  const m = $("map"), W = m.clientWidth, H = m.clientHeight;
  const quad = m.classList.contains("quad");
  const mw = quad ? W * 0.62 : W, mh = H;
  const pr = devicePixelRatio;
  if (mapC.width !== Math.round(mw * pr) || mapC.height !== Math.round(mh * pr)) {
    mapC.width = Math.round(mw * pr); mapC.height = Math.round(mh * pr);
    mapC.style.width = mw + "px"; mapC.style.height = mh + "px";
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of T.S) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const s = Math.min((mw - 40) / (x1 - x0), (mh - 40) / (z1 - z0));
    mapScale = { s, ox: mw / 2 - (x0 + x1) / 2 * s, oz: mh / 2 - (z0 + z1) / 2 * s };
  }
  const { s, ox, oz } = mapScale;
  const P = (x, z) => [ox + x * s, oz + z * s];
  mctx.setTransform(pr, 0, 0, pr, 0, 0);
  mctx.clearRect(0, 0, mw, mh);
  mctx.lineJoin = "round"; mctx.lineCap = "round";
  for (const [w, c] of [[HALF * 2 * s + 8, "rgba(0,0,0,.35)"], [HALF * 2 * s + 3, "#fff"], [HALF * 2 * s, "#555a63"]]) {
    mctx.beginPath();
    T.S.forEach((p, i) => { const [x, y] = P(p.x, p.z); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
    mctx.closePath(); mctx.lineWidth = w; mctx.strokeStyle = c; mctx.stroke();
  }
  const s0 = T.S[0], [sx, sy] = P(s0.x, s0.z);
  mctx.save(); mctx.translate(sx, sy); mctx.rotate(Math.atan2(s0.nz, s0.nx)); mctx.fillStyle = "#fff"; mctx.fillRect(-HALF * s, -2, HALF * 2 * s, 4); mctx.restore();
  for (const k of [...st.karts].sort((a, b) => a.human - b.human)) {
    const [x, y] = P(k.x, k.z);
    mctx.beginPath(); mctx.arc(x, y, k.human ? 7 : 5, 0, 7);
    mctx.fillStyle = k.color; mctx.fill();
    mctx.lineWidth = k.human ? 3 : 1.5; mctx.strokeStyle = k.human ? "#fff" : "#000"; mctx.stroke();
  }
  if (quad) {
    const rows = standings(st).map((k) => `<div class="${k.human ? "hu" : ""}"><b>${k.place}</b><i style="background:${k.color}"></i>${esc(k.name)}${k.finished ? `<span>${fmt(k.time)}</span>` : ""}</div>`).join("");
    if ($("stand").dataset.h !== rows) { $("stand").innerHTML = rows; $("stand").dataset.h = rows; }
  }
}

// ---------------- events -> sound, fx, phones ----------------
function onEvents(st) {
  for (const e of st.events) {
    world.fx(e, st);
    const k = e.k && st.karts.find((q) => q.id === e.k);
    const human = k && k.human;
    const v = k && views.find((x) => x.k === k);
    switch (e.t) {
      case "go": sound.go(); break;
      case "coin": if (human) sound.coin(); break;
      case "roll": if (human) sound.roulette(); break;
      case "got": if (human) sound.got(); break;
      case "boost": case "pad": case "miniturbo": if (human) sound.boost(e.level || 1); break;
      case "spark": if (human && e.level) sound.spark(e.level); break;
      case "hit": if (human) { sound.hit(); send(k.id, { t: "fx", e: "hit" }); } break;
      case "fire": case "drop": if (human) sound.throw(); break;
      case "star": if (human) sound.star(); break;
      case "bolt": sound.bolt(); break;
      case "bump": if (human) sound.bump(); break;
      case "lap":
        if (human) {
          sound.lap(e.lap === st.laps);
          if (v) v.lapMsg = { until: st.t + 2.2, html: e.lap === st.laps ? `<span class="final">FINAL LAP!</span>` : `<span class="lapm">LAP ${e.lap}</span>` };
        }
        break;
      case "finish": if (human) { sound.finish(e.place); send(k.id, { t: "fx", e: "finish", place: e.place }); } break;
      case "done": resultsAt = st.t + 3; break;
    }
  }
  st.events.length = 0;
}

let lastStatus = 0;
function statusToPhones(now) {
  if (now - lastStatus < 150) return;
  lastStatus = now;
  for (const p of players) {
    if (p.kb !== undefined) continue;
    const k = race && race.karts.find((q) => q.id === p.pid);
    const m = { t: "st", phase: race ? race.phase : "lobby", screen: phase, n: race ? race.karts.length : 0 };
    if (k) Object.assign(m, { place: k.place, lap: Math.min(race.laps, k.lap + 1), laps: race.laps, coins: k.coins, item: k.item, count: k.itemCount,
      roulette: k.roulette > 0, finished: k.finished, fp: k.finishPlace || 0, time: k.time, cd: race.phase === "countdown" ? race.countdown : 0 });
    send(p.pid, m);
  }
}

// ---------------- results ----------------
function showResults() {
  phase = "results";
  const rows = standings(race);
  $("podium").innerHTML = rows.map((k) => `<div class="row${k.human ? " hu" : ""}" style="--c:${k.color}">
    <b>${ORDINAL(k.place)}</b><canvas data-char="${k.char}" width="96" height="96"></canvas><span class="nm">${esc(k.name)}</span>
    <span class="tm">${k.finished ? fmt(k.time) : "--"}</span></div>`).join("");
  portraits($("podium"));
  $("results").classList.add("show");
  sound.music("lobby");
  for (const p of players) send(p.pid, { t: "results", place: (race.karts.find((k) => k.id === p.pid) || {}).place });
}
$("again").onclick = () => startRace();
$("back").onclick = () => toLobby();

// ---------------- lobby UI ----------------
function portraits(root) {
  root.querySelectorAll("canvas[data-char]").forEach((c) => {
    const f = FLAT[c.dataset.char];
    if (!f) return;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    try { f.draw(x, c.width / 2, c.height * 0.92, c.width * 0.8, c.height * 0.8, { t: 0, air: 0, run: 0, squash: 0, rise: 0, walk: 0, stride: 1, dir: 1, face: 1 }); } catch (e) {}
  });
}

let net = null, pick = null;
async function refreshNet() {
  try { net = await (await fetch("/api/net")).json(); } catch (e) { return; }
  if (!net.ips.find((n) => n.ip === pick)) pick = net.ips[0] ? net.ips[0].ip : null;
  const url = pick ? `http://${pick}:${net.http}/p` : "";
  if ($("url").textContent !== url) {
    $("url").textContent = url || "Connect this Mac to WiFi or a hotspot (no internet needed)";
    if (url) {
      const q = qrcode(0, "M"); q.addData(url); q.make();
      $("qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    } else $("qr").innerHTML = "";
  }
  $("nets").innerHTML = net.ips.length > 1 ? net.ips.map((n) => `<button data-ip="${n.ip}" class="${n.ip === pick ? "on" : ""}">${esc(n.label)}</button>`).join("") : "";
}
$("nets").onclick = (e) => { const b = e.target.closest("button"); if (b) { pick = b.dataset.ip; refreshNet(); } };
setInterval(() => phase === "lobby" && refreshNet(), 4000);
refreshNet();

function renderLobby() {
  const cards = [];
  for (let i = 0; i < MAX; i++) {
    const p = players.find((q) => q.slot === i);
    cards.push(p ? `<div class="slot on" style="--c:${p.color}"><canvas data-char="${p.char}" width="160" height="160"></canvas>
      <div class="pn">${esc(p.name)}</div><div class="pc">${FLAT[p.char] ? FLAT[p.char].name : ""}${p.kb !== undefined ? " &middot; keyboard" : p.online ? "" : " &middot; reconnecting"}</div></div>`
      : `<div class="slot" style="--c:${SLOT_COLORS[i]}"><div class="empty">P${i + 1}</div><div class="pc">Scan to join</div></div>`);
  }
  const html = cards.join("");
  if ($("slots").dataset.h !== html) { $("slots").innerHTML = html; $("slots").dataset.h = html; portraits($("slots")); }
  $("go").disabled = !players.length;
}
$("go").onclick = () => startRace();
$("cpus").onchange = (e) => (settings.cpus = +e.target.value);
$("laps").onchange = (e) => (settings.laps = +e.target.value);
$("snd").onclick = () => { sound.unlock(); sound.toggle(); $("snd").textContent = sound.on ? "Sound on" : "Sound off"; };

function flash(t) { $("flash").textContent = t; $("flash").classList.add("show"); setTimeout(() => $("flash").classList.remove("show"), 2600); }

// drop phones that vanished while sitting in the lobby
setInterval(() => {
  if (phase === "race") return;
  const now = performance.now();
  const before = players.length;
  players = players.filter((p) => p.kb !== undefined || p.online || now - (p.lastSeen || now) < 25000);
  if (players.length !== before) renderLobby();
}, 3000);

// ---------------- main loop ----------------
const DT = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  keyboardInputs();
  acc += dt;
  if (phase === "lobby" && demo) {
    while (acc >= DT) { step(demo, DT, null); acc -= DT; }
    demo.events.length = 0;
    world.update(demo, dt);
    const lead = standings(demo)[0];
    world.droneFollow(lead, now / 1000);
    world.render([{ cam: world.drone, x: 0, y: 0, w: innerWidth, h: innerHeight, own: null }]);
    return;
  }
  if (!race) return;
  const inputs = {};
  for (const p of players) {
    const i = p.input || {};
    // phones with "auto gas" send g=1 themselves; a phone that's gone quiet stops pressing anything
    const stale = p.kb === undefined && (!p.online || performance.now() - (p.lastSeen || 0) > 1500);
    inputs[p.pid] = stale ? { steer: 0, gas: 0, brake: 0, drift: 0, item: i.i || 0 } : { steer: i.s || 0, gas: i.g, brake: i.b, drift: i.d, item: i.i || 0 };
  }
  let steps = 0;
  while (acc >= DT && steps < 6) { step(race, DT, inputs); onEvents(race); acc -= DT; steps++; }
  if (steps === 6) acc = 0;
  sound.countdown(race);
  world.update(race, dt);
  for (const v of views) {
    world.follow(v.cam, v.k, dt, v.k.finished ? "orbit" : "chase");
    hud(v, race);
  }
  world.render(views);
  if ($("map").style.display !== "none") drawMap(race);
  statusToPhones(now);
  if (race.phase === "done" && phase === "race" && race.t > resultsAt) showResults();
}

startDemo();
sound.music("lobby");
renderLobby();
layout();
requestAnimationFrame(frame);
window.__karera = { get race() { return race; }, get demo() { return demo; }, startRace, addKeyboard, players: () => players, keys };
