// Board: owns the match. Phones send stick inputs and get their status back.
import { createMatch, step, C, W, ULTS } from "./sim.js";
import { createWorld } from "./render.js";
import { ICON, NAME, RARITY_COLOR } from "./icons.js";
import { FLAT } from "../assets/flat.js";
import { Sound } from "./sound.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX = 4;
const SLOT_COLORS = ["#e8312b", "#2a6fe8", "#2fb24c", "#ffb703"];
const BOT_NAMES = ["Bubu", "Dudu", "Ming"];
const CHARS = ["yhon", "axolotl", "capybara", "hedgehog"];

const world = await createWorld($("gl"));
const sound = new Sound();

let players = [];          // {pid, name, char, color, slot, input, online, lastSeen, kb}
let screen = "lobby";      // lobby | match | results
let settings = { bots: 0 };
let match = null, demo = null;

function freeSlot() { for (let i = 0; i < MAX; i++) if (!players.some((p) => p.slot === i)) return i; return -1; }
const player = (pid) => players.find((p) => p.pid === pid);

// ---------------- network ----------------
let ws = null;
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=board`);
  ws.onmessage = (e) => onServer(JSON.parse(e.data));
  ws.onclose = () => { $("offline").style.display = "block"; setTimeout(connect, 1000); };
  ws.onopen = () => ($("offline").style.display = "none");
}
const send = (to, m) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ to, m }));
connect();

function onServer(msg) {
  if (msg.t === "hello") { const p = player(msg.pid); if (p) { p.online = true; reply(p); } else send(msg.pid, { t: "board" }); }
  if (msg.t === "bye") { const p = player(msg.pid); if (p) { p.online = false; p.lastSeen = performance.now(); } }
  if (msg.t === "msg") onPhone(msg.pid, msg.m);
  renderLobby();
}
function reply(p) { send(p.pid, { t: "joined", slot: p.slot, color: p.color, name: p.name, char: p.char }); }

// Change someone's critter. In a match it takes effect at the next round
// (straight away during the countdown, or while they're a ghost).
function setChar(p, char) {
  p.char = char;
  const q = match && screen === "match" && match.players.find((x) => x.id === p.pid);
  if (q) {
    if (match.phase === "countdown" || q.ghost) { q.char = char; q.pendingChar = null; }
    else q.pendingChar = char === q.char ? null : char;
  }
  reply(p);
  renderLobby();
}

function onPhone(pid, m) {
  let p = player(pid);
  if (m.t === "in") { if (p) { p.input = m; p.lastSeen = performance.now(); p.online = true; } return; }
  if (m.t === "join") {
    const name = String(m.name || "").trim().slice(0, 12) || "Player";
    const char = CHARS.includes(m.char) ? m.char : "yhon";
    if (!p) {
      if (screen === "match") return send(pid, { t: "wait", why: "A match is on. You're in the next one!" });
      const slot = freeSlot();
      if (slot < 0) return send(pid, { t: "full", max: MAX });
      p = { pid, name, char, color: SLOT_COLORS[slot], slot, input: {}, online: true, lastSeen: performance.now() };
      players.push(p);
      sound.join();
    } else { p.name = name; p.char = char; p.online = true; }
    reply(p); renderLobby();
    return;
  }
  if (!p) return;
  if (m.t === "char" && CHARS.includes(m.char)) setChar(p, m.char);
  if (m.t === "leave" && screen !== "match") { players = players.filter((q) => q !== p); renderLobby(); }
  if (m.t === "start" || (m.t === "again" && screen === "results")) startMatch();
}

// keyboard player for testing at the Mac: WASD move, arrows aim + fire, F loot, G use, R swap
const keys = new Set();
addEventListener("keydown", (e) => {
  keys.add(e.code); sound.unlock();
  if (e.code === "KeyK" && screen !== "match") addKeyboard();
  if (e.code === "Enter" && screen !== "match") startMatch();
  if (e.code === "KeyM") sound.toggle();
  if (e.code === "Escape" && screen !== "lobby") toLobby();
  const kb = players.find((p) => p.kb !== undefined);
  if (kb) { if (e.code === "KeyG") kb.input.u = (kb.input.u | 0) + 1; if (e.code === "KeyR") kb.input.w = (kb.input.w | 0) + 1; if (e.code === "KeyQ") kb.input.x = (kb.input.x | 0) + 1; }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("pointerdown", () => sound.unlock());
function addKeyboard() {
  const slot = freeSlot();
  if (slot < 0 || players.some((p) => p.kb !== undefined)) return;
  players.push({ pid: "kb", name: "Keyboard", char: CHARS[slot], color: SLOT_COLORS[slot], slot, input: {}, online: true, kb: 0 });
  renderLobby();
}
function keyboardInput() {
  const p = players.find((q) => q.kb !== undefined);
  if (!p) return;
  const k = (c) => (keys.has(c) ? 1 : 0);
  Object.assign(p.input, { mx: k("KeyD") - k("KeyA"), mz: k("KeyS") - k("KeyW"), ax: k("ArrowRight") - k("ArrowLeft"), az: k("ArrowDown") - k("ArrowUp"), l: k("KeyF") });
}

// ---------------- matches ----------------
function roster(humans, bots) {
  const out = humans.map((p) => ({ id: p.pid, name: p.name, char: p.char, color: p.color }));
  for (let i = 0; i < bots && out.length < MAX; i++) {
    const slot = out.length;
    out.push({ id: "bot" + i, name: BOT_NAMES[i], char: CHARS[(slot + 1) % 4], color: SLOT_COLORS[slot], bot: true });
  }
  return out;
}
function startDemo() {
  demo = createMatch(roster([], 4), { seed: Math.floor(Math.random() * 1e6) });
  world.reset();
}
function startMatch() {
  if (screen === "match") return;
  const humans = [...players].sort((a, b) => a.slot - b.slot);
  if (!humans.length) { flash("Scan the QR with a phone first (or press K for a keyboard player)"); return; }
  sound.unlock();
  match = createMatch(roster(humans, settings.bots), { seed: Math.floor(Math.random() * 1e6) });
  screen = "match";
  world.reset();
  $("lobby").classList.remove("show");
  $("results").classList.remove("show");
  $("hud").classList.add("show");
  feed.length = 0;
  sound.music("fight");
  buildCards();
}
function toLobby() {
  screen = "lobby"; match = null;
  $("results").classList.remove("show");
  $("hud").classList.remove("show");
  $("lobby").classList.add("show");
  startDemo();
  sound.music("lobby");
  renderLobby();
}

// ---------------- HUD ----------------
function portrait(cv, c) {
  const x = cv.getContext("2d");
  x.clearRect(0, 0, cv.width, cv.height);
  try { FLAT[c].draw(x, cv.width / 2, cv.height * 0.93, cv.width * 0.82, cv.height * 0.82, { t: 0, air: 0, run: 0, squash: 0, rise: 0, walk: 0, stride: 1, dir: 1, face: 1 }); } catch (e) {}
}
function buildCards() {
  $("cards").innerHTML = match.players.map((p) => `<div class="card" id="card-${p.id}" style="--c:${p.color}">
    <canvas width="112" height="112" data-c="${p.char}"></canvas>
    <div class="cbody"><div class="cname">${esc(p.name)}<span class="wins"></span></div>
      <div class="bars"><i class="hp"></i><i class="sh"></i></div><div class="ultbar"><i></i></div>
      <div class="gear"><span class="s0"></span><span class="s1"></span><span class="it"></span></div></div></div>`).join("");
  $("cards").querySelectorAll("canvas").forEach((c) => portrait(c, c.dataset.c));
  $("tags").innerHTML = match.players.map((p) => `<div class="tag" id="tag-${p.id}" style="--c:${p.color}"><b>${esc(p.name)}</b><div class="mini"><i class="hp"></i><i class="sh"></i></div></div>`).join("");
}
const slotHTML = (s, on) => s ? `<span class="slot${on ? " on" : ""}" style="--r:${RARITY_COLOR[Math.max(0, W[s.type].rarity)]}">${ICON[s.type]}<em>${s.ammo === Infinity || s.ammo === null ? "" : s.ammo}</em></span>` : `<span class="slot empty${on ? " on" : ""}">${ICON.fists}</span>`;
function hud(st) {
  for (const p of st.players) {
    const c = $("card-" + p.id);
    if (!c) continue;
    c.classList.toggle("dead", !p.alive);
    const cv = c.querySelector("canvas");
    if (cv.dataset.c !== p.char) { cv.dataset.c = p.char; portrait(cv, p.char); }
    c.querySelector(".ultbar i").style.width = p.ult + "%";
    c.classList.toggle("ready", p.alive && p.ult >= 100);
    c.querySelector(".hp").style.width = (p.hp / C.hp) * 100 + "%";
    c.querySelector(".sh").style.width = (p.shield / C.shieldMax) * 100 + "%";
    const wins = (p.crown ? ICON.crown : "") + ICON.star.repeat(p.wins);
    if (c.dataset.w !== wins) { c.querySelector(".wins").innerHTML = wins; c.dataset.w = wins; }
    const gear = p.ghost ? `<span class="ghosttag">${ICON.ghost} MULTO</span>` : slotHTML(p.slots[0], p.active === 0) + slotHTML(p.slots[1], p.active === 1)
      + (p.item ? `<span class="slot item">${ICON[p.item.type]}<em>${p.item.count > 1 ? "x" + p.item.count : ""}</em></span>` : "");
    if (c.dataset.g !== gear) { c.querySelector(".gear").innerHTML = gear; c.dataset.g = gear; }
    // head tags
    const t = $("tag-" + p.id);
    const [x, y, vis] = world.project(p.x, p.ghost ? 4.4 : 2.9, p.z);
    t.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    t.style.display = vis ? "" : "none";
    t.classList.toggle("ghost", p.ghost);
    t.querySelector(".hp").style.width = (p.hp / C.hp) * 100 + "%";
    t.querySelector(".sh").style.width = (p.shield / C.shieldMax) * 100 + "%";
  }
  // damage numbers
  for (const d of dmgs) {
    d.t += 1 / 60;
    const [x, y] = world.project(d.x, 2 + d.t * 2.2, d.z);
    d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - d.t)})`;
    d.el.style.opacity = Math.max(0, 1 - d.t / 0.9);
  }
  while (dmgs.length && dmgs[0].t > 0.9) dmgs.shift().el.remove();
  // King Yhon
  const k = st.king;
  $("kingbar").classList.toggle("show", !!(k && k.alive));
  if (k && k.alive) {
    $("kingbar").querySelector("i").style.width = (k.hp / k.max) * 100 + "%";
    const [x, y, vis] = world.project(k.x, k.drop > 0 ? 7 + k.drop * 22 : 7, k.z);
    $("kingtag").style.display = vis ? "" : "none";
    $("kingtag").style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  } else $("kingtag").style.display = "none";
  // banner + storm
  let banner = "", sub = "";
  if (st.phase === "countdown") { const c = Math.ceil(st.phaseT - 0.6); banner = c > 0 ? String(c) : "RAMBULAN!"; sub = c > 0 ? `Round ${st.round}` : ""; }
  else if (st.phase === "fight" && st.roundT < 1) banner = "RAMBULAN!";
  else if (announce && performance.now() < announce.until) { banner = announce.b; sub = announce.s; }
  else if (st.phase === "roundEnd") {
    const w = st.players.find((p) => p.id === st.winner);
    banner = w ? `${esc(w.name)} wins!` : "Nobody survived!";
    sub = st.champion ? "" : w ? `Round ${st.round} &middot; first to ${C.roundsToWin} wins the match` : "";
  }
  if ($("banner").dataset.h !== banner + sub) { $("banner").innerHTML = banner ? `<b>${banner}</b>${sub ? `<small>${sub}</small>` : ""}` : ""; $("banner").dataset.h = banner + sub; }
  const s = st.storm;
  $("storm").textContent = st.phase !== "fight" ? `Round ${st.round}` : s.next > 0 ? `Storm in ${Math.ceil(s.next)}s` : s.r > 1 ? "Storm closing in!" : "Storm everywhere!";
  $("storm").classList.toggle("warn", st.phase === "fight" && s.next <= 0);
  // kill feed
  const now = performance.now();
  const html = feed.filter((f) => now - f.at < 7000).map((f) => `<div>${f.html}</div>`).join("");
  if ($("feed").dataset.h !== html) { $("feed").innerHTML = html; $("feed").dataset.h = html; }
}
const dmgs = [];
let announce = null;
const say = (b, s, ms = 2600) => (announce = { b, s, until: performance.now() + ms });
const feed = [];
function name(st, id) { const p = st.players.find((q) => q.id === id); return p ? `<b style="color:${p.color}">${esc(p.name)}</b>` : ""; }

function onEvents(st) {
  for (const e of st.events) {
    world.fx(e, st);
    if (st !== match) continue;
    switch (e.t) {
      case "fight": sound.go(); break;
      case "shoot": sound.shoot(e.w); break;
      case "swing": sound.swing(); break;
      case "hit": {
        sound.hurt();
        if (e.king) { const el = document.createElement("div"); el.className = "dmg king"; el.textContent = e.dmg; $("dmgs").appendChild(el); dmgs.push({ el, x: e.x + (Math.random() - 0.5) * 2, z: e.z, t: 0 }); break; }
        const el = document.createElement("div");
        el.className = "dmg" + (e.shield ? " sh" : "");
        el.textContent = e.dmg;
        $("dmgs").appendChild(el);
        dmgs.push({ el, x: e.x + (Math.random() - 0.5), z: e.z, t: 0 });
        send(e.p, { t: "fx", e: "hit" });
        break;
      }
      case "boom": sound.boom(); break;
      case "kill": {
        sound.ko();
        const how = e.w === "storm" ? "the storm" : e.w === "multo" ? `a ghost bomb` : NAME[e.w] || e.w;
        if (e.w === "king") { feed.push({ at: performance.now(), html: `<b style="color:#ffd21f">King Yhon</b> <span class="ic">${ICON.crown}</span> ${name(st, e.p)}` }); send(e.p, { t: "fx", e: "ko" }); break; }
        feed.push({ at: performance.now(), html: e.by && e.by !== e.p ? `${name(st, e.by)} <span class="ic">${ICON[e.w] || ICON.bomba}</span> ${name(st, e.p)}` : `${name(st, e.p)} was taken by ${how}` });
        send(e.p, { t: "fx", e: "ko" });
        break;
      }
      case "chest": sound.chest(e.gold); break;
      case "orb": sound.pickup(1); if (e.full) send(e.p, { t: "fx", e: "ultready" }); break;
      case "ult": { sound.boom(); feed.push({ at: performance.now(), html: `${name(st, e.p)} <span class="ic">${ICON.ult}</span> <b>${ULTS[e.char].name}!</b>` }); break; }
      case "king": sound.storm(); say("KING YHON!", "Last hit takes his crown and his OP loot"); feed.push({ at: performance.now(), html: `<span class="ic">${ICON.crown}</span> <b style="color:#ffd21f">King Yhon has appeared!</b>` }); break;
      case "kingland": case "kingslam": sound.boom(); break;
      case "kingdown": {
        sound.win();
        const who = st.players.find((q) => q.id === e.by);
        say(who ? `${esc(who.name)} took the crown!` : "King Yhon is down!", "OP loot dropped");
        feed.push({ at: performance.now(), html: `${who ? name(st, e.by) : "Someone"} <span class="ic">${ICON.crown}</span> <b style="color:#ffd21f">King Yhon</b>` });
        break;
      }
      case "pickup": sound.pickup(Math.max(0, e.rarity)); break;
      case "use": sound.use(e.item); break;
      case "storm": sound.storm(); feed.push({ at: performance.now(), html: `<b style="color:#d9a6ff">The storm is closing in!</b>` }); break;
      case "ghostbomb": sound.ghost(); break;
      case "empty": sound.empty(); break;
      case "roundEnd": sound.lap(false); break;
      case "match": sound.win(); setTimeout(showResults, 2500); break;
    }
  }
  st.events.length = 0;
}

let lastStatus = 0;
function statusToPhones(now) {
  if (now - lastStatus < 120) return;
  lastStatus = now;
  for (const p of players) {
    if (p.kb !== undefined) continue;
    const m = { t: "st", screen };
    const q = match && match.players.find((x) => x.id === p.pid);
    if (q) Object.assign(m, {
      phase: match.phase, round: match.round, alive: q.alive, ghost: q.ghost, hp: Math.ceil(q.hp), shield: Math.ceil(q.shield),
      slots: q.slots.map((s) => s && { type: s.type, ammo: s.ammo === Infinity ? null : s.ammo }), active: q.active,
      item: q.item, near: q.near, wins: q.wins, ghostCd: Math.max(0, q.ghostCd), cd: match.phase === "countdown" ? match.phaseT : 0,
      winner: match.phase === "roundEnd" ? match.winner : null, me: q.id,
      ult: Math.floor(q.ult), char: q.char, next: q.pendingChar || null, crown: !!q.crown, king: match.king.alive ? Math.ceil((match.king.hp / match.king.max) * 100) : null,
    });
    send(p.pid, m);
  }
}

function showResults() {
  if (!match) return;
  screen = "results";
  const rows = [...match.players].sort((a, b) => b.wins - a.wins || b.kills - a.kills);
  $("podium").innerHTML = rows.map((p, i) => `<div class="row" style="--c:${p.color}"><b>${i + 1}</b><canvas width="96" height="96" data-c="${p.char}"></canvas>
    <span class="nm">${esc(p.name)}</span><span class="st">${ICON.star.repeat(p.wins)}</span><span class="k">${p.kills} KO</span></div>`).join("");
  $("podium").querySelectorAll("canvas").forEach((c) => portrait(c, c.dataset.c));
  const champ = match.players.find((p) => p.id === match.champion);
  $("champ").textContent = champ ? `${champ.name} is the champion!` : "Match over";
  $("results").classList.add("show");
  for (const p of players) send(p.pid, { t: "results", champ: champ && champ.name, me: p.pid === match.champion });
}
$("again").onclick = () => startMatch();
$("back").onclick = () => toLobby();

// ---------------- lobby ----------------
let net = null, pick = null;
async function refreshNet() {
  try { net = await (await fetch("/api/net")).json(); } catch (e) { return; }
  if (!net.ips.find((n) => n.ip === pick)) pick = net.ips[0] ? net.ips[0].ip : null;
  const url = pick ? `http://${pick}:${net.http}/p` : "";
  if ($("url").textContent !== url) {
    $("url").textContent = url || "Connect this Mac to WiFi or a hotspot (no internet needed)";
    if (url) { const q = qrcode(0, "M"); q.addData(url); q.make(); $("qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); }
  }
}
setInterval(() => screen === "lobby" && refreshNet(), 4000);
refreshNet();
function renderLobby() {
  const cards = [];
  for (let i = 0; i < MAX; i++) {
    const p = players.find((q) => q.slot === i);
    cards.push(p ? `<div class="pslot on" data-pid="${p.pid}" style="--c:${p.color}" title="Click to change critter"><canvas data-c="${p.char}" width="150" height="150"></canvas><div class="pn">${esc(p.name)}</div>
      <div class="pc">${FLAT[p.char].name} &middot; <i>${ULTS[p.char].name}</i>${p.kb !== undefined ? " &middot; keyboard" : p.online ? "" : " &middot; reconnecting"}</div><div class="swap">&#8635; click to change</div></div>`
      : `<div class="pslot" style="--c:${SLOT_COLORS[i]}"><div class="empty">P${i + 1}</div><div class="pc">Scan to join</div></div>`);
  }
  const html = cards.join("");
  if ($("slots").dataset.h !== html) { $("slots").innerHTML = html; $("slots").dataset.h = html; $("slots").querySelectorAll("canvas").forEach((c) => portrait(c, c.dataset.c)); }
  $("go").disabled = !players.length;
}
$("go").onclick = () => startMatch();
$("slots").addEventListener("click", (e) => {
  const card = e.target.closest("[data-pid]");
  if (!card) return;
  const p = player(card.dataset.pid);
  if (p) { setChar(p, CHARS[(CHARS.indexOf(p.char) + 1) % CHARS.length]); sound.join(); }
});
$("bots").onchange = (e) => (settings.bots = +e.target.value);
$("snd").onclick = () => { sound.unlock(); sound.toggle(); $("snd").textContent = sound.on ? "Sound on" : "Sound off"; };
function flash(t) { $("flash").textContent = t; $("flash").classList.add("show"); setTimeout(() => $("flash").classList.remove("show"), 2600); }
setInterval(() => {
  if (screen === "match") return;
  const now = performance.now(), n = players.length;
  players = players.filter((p) => p.kb !== undefined || p.online || now - (p.lastSeen || now) < 25000);
  if (players.length !== n) renderLobby();
}, 3000);

// ---------------- loop ----------------
const DT = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  keyboardInput();
  const st = screen === "lobby" ? demo : match;
  if (!st) return;
  if (st === match) {
    for (const p of players) {
      const q = match.players.find((x) => x.id === p.pid);
      if (!q) continue;
      const stale = p.kb === undefined && (!p.online || now - (p.lastSeen || 0) > 1500);
      const i = p.input || {};
      q.input = stale ? { mx: 0, mz: 0, ax: 0, az: 0, l: 0, w: q.input.w, u: q.input.u, x: q.input.x } : { mx: +i.mx || 0, mz: +i.mz || 0, ax: +i.ax || 0, az: +i.az || 0, l: i.l ? 1 : 0, w: i.w | 0, u: i.u | 0, x: i.x | 0 };
    }
  }
  let n = 0;
  while (acc >= DT && n < 6) { step(st, DT); onEvents(st); acc -= DT; n++; }
  if (n === 6) acc = 0;
  if (st === demo && st.phase === "matchEnd") startDemo();
  world.update(st, dt);
  world.frame(st, dt, st === demo ? null : (st.phase === "fight" || st.phase === "countdown") ? null : st.players.filter((p) => p.alive || p.id === st.winner));
  world.render();
  if (st === match) { hud(st); statusToPhones(now); }
}

startDemo();
sound.music("lobby");
renderLobby();
requestAnimationFrame(frame);
window.__rambulan = { get match() { return match; }, startMatch, addKeyboard, players: () => players, keys, settings };
