// TULAK! — boot, screens and the three ways to play.
//
//   solo   this phone runs the sim; you + 3 bots
//   host   this phone runs the sim and streams snapshots to one guest;
//          empty seats are bots, and a guest who drops is taken over by one
//   guest  this phone runs NO sim: it sends its stick up and draws what comes
//          back, so the two phones can never disagree about who fell

import { TUNE, CRITTERS, CRITTER_IDS, SEATS, SNAP_HZ, INPUT_HZ, MODELS } from "./config.js";
import { newMatch, step, snapshot } from "./sim.js";
import { newBrain, botInput } from "./bots.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { sfx, buzz, unlock } from "./audio.js";
import { createHost, createClient } from "./net.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem("tulak." + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("tulak." + k, v); } catch {} },
};
// Colours and taglines come from the same critters.json the models were built from.
const SPEC = await (await fetch(new URL("critters.json", MODELS))).json();

const renderer = await createRenderer($("gl"), $("labels"));
$("loading").classList.add("hidden");

/* ----------------------------------------------------------------- state --- */
let mode = "menu";
let sim = null, brains = [], mySeat = 0, acc = 0;
let hostNet = null, clientNet = null;
const guest = { present: false, critter: "axolotl", name: "Guest", input: null, seen: 0 };
let pending = [];           // host: events since the last snapshot
let gView = null;           // guest: smoothed view built from snapshots
let gSig = "";              // guest: seat signature, to notice a rematch
let lastCount = null, wake = null, snapT = 0, inT = 0;

let pick = Math.max(0, CRITTER_IDS.indexOf(store.get("critter", "yhon")));
$("name").value = store.get("name", "");
$("name").addEventListener("input", () => store.set("name", $("name").value.trim()));
const myName = () => $("name").value.trim() || "Player";

const input = createInput({
  stickZone: $("stickZone"), stickBase: $("stickBase"), stickKnob: $("stickKnob"),
  dashBtn: $("dashBtn"), abilBtn: $("abilBtn"),
});

function theme(id) {
  const [a, b, c] = SPEC[id].theme;
  const r = document.documentElement.style;
  r.setProperty("--c1", a); r.setProperty("--c2", b); r.setProperty("--deep", c);
}

function show(id) {
  for (const s of ["menu", "lobby", "joinScreen", "hud", "over"]) $(s).classList.toggle("hidden", s !== id);
}

/* ------------------------------------------------------------------ menu --- */
function renderPick() {
  const id = CRITTER_IDS[pick], c = CRITTERS[id];
  $("pickName").textContent = c.name;
  $("pickAbility").textContent = c.abilityName;
  $("pickBlurb").textContent = c.blurb;
  const bar = (label, v) => `<span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
  $("pickStats").innerHTML = bar("WEIGHT", (c.mass - 0.8) / 0.5) + bar("SPEED", (c.speed - 0.8) / 0.4);
  theme(id);
  store.set("critter", id);
  renderer.setPlayers([{ critter: id, name: "", me: false }]);
}
$("prev").onclick = () => { unlock(); sfx.tap(); pick = (pick + 3) % 4; renderPick(); };
$("next").onclick = () => { unlock(); sfx.tap(); pick = (pick + 1) % 4; renderPick(); };

function botSeats(taken) {
  const free = CRITTER_IDS.filter((c) => !taken.includes(c));
  const pool = [...free, ...CRITTER_IDS];
  return pool;
}

function startLocal(seats) {
  sim = newMatch(seats);
  brains = seats.map(() => newBrain(0.62 + Math.random() * 0.2));
  mySeat = 0;
  acc = 0;
  pending = [];
  lastCount = null;
  renderer.setPlayers(seats.map((s, i) => ({ critter: s.critter, name: s.name, me: i === mySeat })));
  enterHud();
}

function enterHud() {
  show("hud");
  input.state.enabled = true;
  const me = CRITTER_IDS[pick];
  $("abilLabel").textContent = { pound: "POUND", dive: "DIVE", float: "RING", roll: "ROLL" }[CRITTERS[me].ability];
  navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
}

$("solo").onclick = () => {
  unlock(); sfx.tap();
  const me = CRITTER_IDS[pick];
  const pool = botSeats([me]);
  mode = "solo";
  startLocal([{ critter: me, name: myName(), kind: "host" },
    ...[0, 1, 2].map((k) => ({ critter: pool[k], name: CRITTERS[pool[k]].name, kind: "bot" }))]);
};

/* ------------------------------------------------------------------ host --- */
function lobbySeats() {
  const me = CRITTER_IDS[pick];
  const seats = [{ critter: me, name: myName(), kind: "host" }];
  if (guest.present) seats.push({ critter: guest.critter, name: guest.name, kind: "guest" });
  const pool = botSeats(seats.map((s) => s.critter));
  let k = 0;
  while (seats.length < 4) { const c = pool[k++]; seats.push({ critter: c, name: CRITTERS[c].name, kind: "bot" }); }
  return seats;
}
function drawLobby() {
  $("lobbySeats").innerHTML = lobbySeats().map((s, i) => `<li><span class="dot" style="--seat:${SEATS[i].colour}"></span>${s.kind === "bot" ? "Bot" : s.name}<small>${CRITTERS[s.critter].name}${s.kind === "host" ? " · you" : s.kind === "guest" ? " · joined" : ""}</small></li>`).join("")
    + (guest.present ? "" : `<li style="opacity:.6"><span class="dot" style="--seat:#fff"></span>Waiting for a friend…<small>or start with bots</small></li>`);
}
let lobbyTimer = null;
$("host").onclick = async () => {
  unlock(); sfx.tap();
  show("lobby");
  $("lobbyCode").textContent = "····";
  guest.present = false;
  try {
    hostNet = await createHost({
      onInput: (role, msg) => {
        if (!msg) return;
        if (msg.k === "hi") {
          const was = guest.present;
          Object.assign(guest, { present: true, critter: CRITTERS[msg.critter] ? msg.critter : "axolotl", name: String(msg.name || "Guest").slice(0, 12) });
          if (!was) { sfx.beep(true); buzz(20); }
          if (mode === "menu") drawLobby();
        } else if (msg.k === "i") {
          guest.input = msg; guest.seen = performance.now();
        }
      },
      onPeers: (list) => {
        guest.present = list.some((p) => p.on);
        const pill = $("netPill");
        const g = list.find((p) => p.role === "guest");
        pill.textContent = g ? (g.relay ? "relay" : "direct") : "";
        if (mode === "menu") drawLobby();
      },
    });
  } catch (e) {
    $("lobbyCode").textContent = "offline";
    return;
  }
  const code = hostNet.code;
  $("lobbyCode").textContent = code;
  const url = `${location.origin}${location.pathname}?join=${code}`;
  try {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch { $("qr").textContent = url; }
  drawLobby();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => hostNet?.tell("guest", { k: "lobby", seats: lobbySeats() }), 1000);
};
$("lobbyStart").onclick = () => {
  unlock(); sfx.tap();
  clearInterval(lobbyTimer);
  mode = hostNet ? "host" : "solo";
  startLocal(lobbySeats());
  $("netPill").classList.toggle("hidden", !guest.present);
};
$("lobbyBack").onclick = () => { sfx.tap(); leave(); };

/* ----------------------------------------------------------------- guest --- */
$("join").onclick = () => { unlock(); sfx.tap(); show("joinScreen"); $("joinCode").focus(); };
$("joinBack").onclick = () => { sfx.tap(); leave(); };
$("joinGo").onclick = () => joinGame($("joinCode").value);
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") joinGame($("joinCode").value); });

async function joinGame(code) {
  unlock();
  code = (code || "").trim().toUpperCase();
  if (code.length !== 4) { $("joinStatus").textContent = "Codes are 4 letters."; return; }
  $("joinStatus").textContent = "Connecting…";
  try {
    clientNet?.destroy();
    clientNet = await createClient({
      code, role: "guest", name: myName(),
      onState: (m) => { $("netPill").textContent = m === "p2p" ? "direct" : m; },
      onMessage: onHostMessage,
    });
  } catch (e) {
    $("joinStatus").textContent = e.message || "Could not join.";
    return;
  }
  mode = "guest";
  const hello = () => clientNet?.send({ k: "hi", critter: CRITTER_IDS[pick], name: myName() });
  hello();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(hello, 1000);
  $("joinStatus").textContent = "In! Waiting for the host to start…";
}

function onHostMessage(msg) {
  if (!msg) return;
  if (msg.k === "lobby" && $("hud").classList.contains("hidden")) {
    $("joinStatus").innerHTML = "In! Waiting for the host to start…<br>" +
      msg.seats.map((s) => `${s.kind === "bot" ? "Bot" : s.name} · ${CRITTERS[s.critter]?.name}`).join("<br>");
  }
  if (msg.k === "s") guestSnapshot(msg);
}

function guestSnapshot(m) {
  const sig = m.p.map((p) => p[9] + p[11]).join(",");
  if (sig !== gSig || !gView) {
    gSig = sig;
    mySeat = Math.max(0, m.p.findIndex((p) => p[11] === "guest"));
    renderer.setPlayers(m.p.map((p, i) => ({ critter: p[9], name: p[10], me: i === mySeat })));
    gView = { players: m.p.map(() => ({})), tiles: new Uint8Array(m.tl.length) };
    enterHud();
    $("netPill").classList.remove("hidden");
    lastCount = null;
  }
  if (m.ph !== "matchEnd" && !$("over").classList.contains("hidden")) enterHud();
  Object.assign(gView, { phase: m.ph, phaseT: m.pt, round: m.rd, matchT: m.mt, wave: m.wv, roundWinner: m.rw, matchWinner: m.mw });
  for (let i = 0; i < m.tl.length; i++) gView.tiles[i] = +m.tl[i];
  m.p.forEach((a, i) => {
    const v = gView.players[i];
    const [x, z, y, yaw, fl, dcd, acd, wins, kos, critter, name, kind] = a;
    // targets; positions are eased toward them every frame
    const jump = v.tx === undefined || Math.hypot(x - v.tx, z - v.tz) > 3;
    Object.assign(v, { tx: x, tz: z, ty: y, tyaw: yaw, out: !!(fl & 1), falling: !!(fl & 2), dashing: !!(fl & 4),
      abil: fl & 8 ? CRITTERS[critter].ability : null, stun: !!(fl & 16), dashCd: dcd, abilCd: acd, wins, kos, critter, name, kind });
    if (jump) Object.assign(v, { x, z, y, yaw });
  });
  for (const e of m.ev || []) onEvent(e, gView.players);
}

/* ---------------------------------------------------------------- events --- */
function feed(text) {
  const d = document.createElement("div");
  d.textContent = text;
  $("feed").append(d);
  setTimeout(() => d.remove(), 2500);
}
let bannerTimer = null;
function banner(html, ms = 1100) {
  const b = $("banner");
  b.innerHTML = html;
  b.classList.add("on");
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.remove("on"), ms);
}
const nameOf = (p, i) => (i === mySeat ? "You" : p.name);

function onEvent(e, players) {
  renderer.fx(e, players);
  const me = e.who === mySeat;
  switch (e.type) {
    case "dash": if (me) sfx.dash(); break;
    case "bump":
      sfx.bump(e.power);
      if (e.who === mySeat || e.by === mySeat) buzz(e.power > 6 ? 30 : 12);
      break;
    case "pound": sfx.pound(); buzz(25); break;
    case "ability": if (e.ability !== "pound") sfx[e.ability]?.(); break;
    case "wave": sfx.crumble(); break;
    case "fall": {
      sfx.fall();
      if (me) buzz(60);
      const who = players[e.who];
      if (e.by !== null && e.by !== undefined) feed(`${nameOf(players[e.by], e.by)} → ${nameOf(who, e.who)} ${e.how === "float" ? "(bounced!)" : "TULAK!"}`);
      else feed(`${nameOf(who, e.who)} fell off`);
      break;
    }
    case "go": banner("TULAK!", 700); sfx.beep(true); buzz(20); break;
    case "roundEnd": {
      const w = e.winner;
      if (w === null) banner("DRAW!", 2400);
      else banner(`${w === mySeat ? "YOU" : players[w].name.toUpperCase()}<small>${w === mySeat ? "win the round!" : "wins the round"}</small>`, 2400);
      (w === mySeat ? sfx.win : sfx.lose)();
      break;
    }
    case "match": setTimeout(() => showOver(players, e.winner), 400); break;
  }
}

function showOver(players, winner) {
  $("banner").classList.remove("on");
  input.state.enabled = false;
  const ranked = players.map((p, i) => ({ ...p, i })).sort((a, b) => b.wins - a.wins || b.kos - a.kos);
  $("overTitle").textContent = winner === mySeat ? "YOU WIN!" : `${players[winner].name.toUpperCase()} WINS`;
  $("podium").innerHTML = ranked.map((p, k) => `<li><span class="pl">${["1st", "2nd", "3rd", "4th"][k]}</span><span class="dot" style="--seat:${SEATS[p.i].colour}"></span>${p.i === mySeat ? "You" : p.name}<small>${p.wins} round${p.wins === 1 ? "" : "s"}<br>${p.kos} KO</small></li>`).join("");
  $("again").textContent = mode === "guest" ? "Waiting for host…" : "Rematch";
  $("again").disabled = mode === "guest";
  show("over");
  if (winner === mySeat) sfx.win();
}
$("again").onclick = () => {
  unlock(); sfx.tap();
  if (mode === "guest") return;
  startLocal(mode === "host" ? lobbySeats() : sim.players.map((p) => ({ critter: p.critter, name: p.name, kind: p.kind })));
};
$("toMenu").onclick = () => { sfx.tap(); leave(); };

function leave() {
  clearInterval(lobbyTimer);
  hostNet?.destroy(); hostNet = null;
  clientNet?.destroy(); clientNet = null;
  guest.present = false;
  sim = null; gView = null; gSig = "";
  mode = "menu";
  input.state.enabled = false;
  wake?.release?.(); wake = null;
  $("netPill").classList.add("hidden");
  show("menu");
  renderPick();
}

/* ------------------------------------------------------------------- HUD --- */
let chipSig = "";
function hud(view) {
  const ps = view.players;
  const sig = ps.map((p) => `${p.wins}${p.out || p.falling ? 1 : 0}`).join("|") + mySeat;
  if (sig !== chipSig) {
    chipSig = sig;
    $("chips").innerHTML = ps.map((p, i) => `<div class="chip${i === mySeat ? " me" : ""}${p.out || p.falling ? " out" : ""}" style="--seat:${SEATS[i].colour}">
      <div class="nm">${i === mySeat ? "YOU" : p.name}</div>
      <div class="pips">${Array.from({ length: TUNE.winsNeeded }, (_, k) => (k < p.wins ? "<b>★</b>" : "☆")).join("")}</div></div>`).join("");
  }
  const left = Math.max(0, TUNE.matchCap - (view.matchT || 0));
  $("roundInfo").textContent = view.phase === "play" && left < 30 ? `SUDDEN DEATH` : `ROUND ${view.round || 1}`;

  if (view.phase === "countdown") {
    const n = Math.ceil(view.phaseT / (TUNE.countdown / 3));
    if (n !== lastCount && n >= 1 && n <= 3) { lastCount = n; banner(String(n), 0); sfx.beep(false); }
  } else lastCount = null;

  const me = ps[mySeat];
  if (me && me.critter) {
    const c = CRITTERS[me.critter];
    const d = Math.min(1, (me.dashCd || 0) / (TUNE.dash.cd * (c.dashCd || 1)));
    const a = Math.min(1, (me.abilCd || 0) / c.cd);
    setCd($("dashBtn"), d);
    setCd($("abilBtn"), a);
  }
}
function setCd(btn, v) {
  const was = +btn.dataset.cd || 0;
  btn.style.setProperty("--cd", v.toFixed(3));
  btn.dataset.cd = v;
  if (was > 0 && v === 0) { btn.classList.remove("ready"); void btn.offsetWidth; btn.classList.add("ready"); }
}

function viewOf(s) {
  return {
    phase: s.phase, phaseT: s.phaseT, round: s.round, matchT: s.matchT, wave: s.wave, tiles: s.tiles,
    players: s.players.map((p) => ({
      x: p.x, z: p.z, y: p.y, yaw: p.yaw, out: p.out, falling: p.falling, dashing: p.dashT > 0,
      abil: p.abil && (p.abilT > 0 || p.abil === "pound") ? p.abil : null, stun: p.stun > 0,
      critter: p.critter, name: p.name, kind: p.kind, wins: p.wins, kos: p.kos, dashCd: p.dashCd, abilCd: p.abilCd,
    })),
  };
}

/* ------------------------------------------------------------------ loop --- */
const DT = 1 / 60;
let last = performance.now(), menuT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (mode === "menu" || (!sim && !gView)) {
    menuT += dt;
    renderer.update({ phase: "menu", tiles: null, wave: 0, players: [{ x: 0, z: 0, y: 0, yaw: Math.sin(menuT * 0.8) * 0.7, out: false }] }, dt);
  } else if (sim) {
    acc += dt;
    while (acc >= DT) {
      const mine = input.read();
      const guestFresh = guest.present && guest.input && performance.now() - guest.seen < 3000;
      const inputs = sim.players.map((p, i) => {
        if (i === mySeat) return mine;
        if (p.kind === "guest" && guestFresh) return guest.input;
        botInput(sim, i, brains[i], DT);
        return { mx: brains[i].mx, mz: brains[i].mz, d: brains[i].d, a: brains[i].a };
      });
      step(sim, inputs, DT);
      const view = sim.players;
      for (const e of sim.events) { onEvent(e, view); if (hostNet) pending.push(e); }
      sim.events.length = 0;
      acc -= DT;
    }
    if (hostNet && mode === "host") {
      snapT += dt;
      if (snapT >= 1 / SNAP_HZ) {
        snapT = 0;
        const snap = snapshot(sim);
        snap.ev = pending;
        pending = [];
        hostNet.tell("guest", snap);
      }
    }
    const v = viewOf(sim);
    renderer.update(v, dt);
    hud(v);
  } else if (gView) {
    inT += dt;
    if (inT >= 1 / INPUT_HZ) { inT = 0; clientNet?.send({ k: "i", ...input.read() }); }
    // Ease every critter toward the latest snapshot: 20 updates a second
    // drawn at 60 fps without the stutter of snapping.
    const k = 1 - Math.exp(-dt * 16);
    for (const p of gView.players) {
      if (p.tx === undefined) continue;
      p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k; p.y += (p.ty - p.y) * k;
      let dy = p.tyaw - p.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      p.yaw += dy * k;
    }
    renderer.update(gView, dt);
    hud(gView);
  }
  requestAnimationFrame(frame);
}

renderPick();
show("menu");
const params = new URLSearchParams(location.search);
const joinCode = params.get("join");
if (joinCode) { show("joinScreen"); $("joinCode").value = joinCode.toUpperCase(); }
if (params.get("auto") === "solo") $("solo").click(); // for headless screenshots
requestAnimationFrame(frame);

// For the headless check and for poking at it from the console.
window.__tulak = { get sim() { return sim; }, get mode() { return mode; }, solo: () => $("solo").click() };
