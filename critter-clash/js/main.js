// CRITTER CLASH — boot, screens, unlocks and the three ways to play.
//
//   solo   this phone runs the sim; you vs a bot
//   host   this phone runs the sim and streams snapshots to one guest (a bot
//          stands in if nobody joins, or if the guest goes quiet)
//   guest  runs NO sim: sends its placement, draws what comes back
//
// You play the squad you have unlocked. Both sides always field the same
// number of critters: a bot matches yours, and online it is the smaller of
// the two squads.

import { TUNE, CRITTERS, CRITTER_IDS, UNLOCKS, TROPHIES, SNAP_HZ, MODELS, ULT } from "./config.js";
import { newMatch, step, place, setPlacement, setReady, snapshot, autoPlace, SIDES } from "./sim.js";
import { newBrain, botStep, botSquad } from "./bots.js";
import { createRenderer } from "./render.js";
import { sfx, buzz, unlock as unlockAudio } from "./audio.js";
import { createHost, createClient } from "./net.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem("critterclash." + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("critterclash." + k, v); } catch {} },
};
const SPEC = await (await fetch(new URL("critters.json", MODELS))).json();
const renderer = await createRenderer($("gl"), $("overlay"));
$("loading").classList.add("hidden");

/* -------------------------------------------------------------- progress --- */
let trophies = Math.max(0, +store.get("trophies", 0) || 0);
const unlocked = (tr = trophies) => UNLOCKS.filter((u) => tr >= u.at).map((u) => u.id);

function theme(id) {
  const [a, b, c] = SPEC[id].theme;
  const r = document.documentElement.style;
  r.setProperty("--c1", a); r.setProperty("--c2", b); r.setProperty("--deep", c);
}
theme("capybara");

function drawMenu() {
  $("trophies").textContent = trophies;
  const next = UNLOCKS.find((u) => trophies < u.at);
  const prevAt = [...UNLOCKS].reverse().find((u) => trophies >= u.at)?.at ?? 0;
  $("nextUnlock").textContent = next ? `${CRITTERS[next.id].name} at ${next.at} 🏆` : "full squad unlocked!";
  $("unlockBar").style.width = next ? `${((trophies - prevAt) / (next.at - prevAt)) * 100}%` : "100%";
  const have = unlocked();
  $("roster").innerHTML = UNLOCKS.map((u) => have.includes(u.id)
    ? `<div class="rc"><b>${CRITTERS[u.id].name}</b><span>${CRITTERS[u.id].role}</span></div>`
    : `<div class="rc locked"><b>🔒 ${u.at} 🏆</b><span>???</span></div>`).join("");
}

/* ----------------------------------------------------------------- state --- */
let mode = "menu";
let sim = null, brain = null, mySeat = 0, acc = 0;
let hostNet = null, clientNet = null, lobbyTimer = null;
const guest = { present: false, name: "Guest", squad: ["yhon", "hedgehog"], seen: 0 };
let pending = [], snapT = 0;
let g = null, gPlace = null, gReady = false, gRound = 0;
let drag = null, hoverCell = -1, lastSec = -1, wake = null, lastHitSfx = 0;
let revealQueue = [], revealing = null, revealT = 0;

$("name").value = store.get("name", "");
$("name").addEventListener("input", () => store.set("name", $("name").value.trim()));
const myName = () => $("name").value.trim() || "Player";

function show(id) {
  for (const s of ["menu", "lobby", "joinScreen", "hud", "over", "unlock"]) $(s).classList.toggle("hidden", s !== id);
}

function startLocal(seats) {
  sim = newMatch(seats);
  brain = newBrain();
  mySeat = 0;
  acc = 0;
  pending = [];
  renderer.setSeat(0);
  enterHud(seats);
}
function enterHud(seats) {
  show("hud");
  $("themName").textContent = seats[1 - mySeat].name;
  lastSec = -1;
  navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
}

$("solo").onclick = () => {
  unlockAudio(); sfx.tap();
  mode = "solo";
  const mine = unlocked();
  startLocal([{ name: myName(), kind: "host", squad: mine }, { name: "Bot", kind: "bot", squad: botSquad(mine.length) }]);
};

/* ------------------------------------------------------------------ host --- */
function hostSeats() {
  const mine = unlocked();
  if (!guest.present) return [{ name: myName(), kind: "host", squad: mine }, { name: "Bot", kind: "bot", squad: botSquad(mine.length) }];
  const n = Math.min(mine.length, guest.squad.length);
  return [{ name: myName(), kind: "host", squad: mine.slice(0, n) }, { name: guest.name, kind: "guest", squad: guest.squad.slice(0, n) }];
}
function drawLobby() {
  const s = hostSeats();
  const line = (x, c) => `<li><span class="dot" style="--seat:${c}"></span>${x.name}<small>${x.squad.map((id) => CRITTERS[id].name).join(", ")}</small></li>`;
  $("lobbySeats").innerHTML = line(s[0], "#2fb8ff") + (guest.present ? line(s[1], "#ff5fa2")
    : `<li style="opacity:.6"><span class="dot" style="--seat:#fff"></span>Waiting for a friend…<small>or start vs a bot</small></li>`);
}
$("host").onclick = async () => {
  unlockAudio(); sfx.tap();
  show("lobby");
  $("lobbyCode").textContent = "····";
  guest.present = false;
  try {
    hostNet = await createHost({
      onInput: (role, msg) => {
        if (!msg) return;
        guest.seen = performance.now();
        if (msg.k === "hi") {
          const was = guest.present;
          const sq = (Array.isArray(msg.squad) ? msg.squad : []).filter((id) => CRITTER_IDS.includes(id));
          Object.assign(guest, { present: true, name: String(msg.name || "Guest").slice(0, 12), squad: sq.length >= 2 ? sq : ["yhon", "hedgehog"] });
          if (!was) { sfx.beep(true); buzz(20); }
          if (mode === "menu") drawLobby();
        } else if (msg.k === "prep" && sim && sim.seats[1].kind === "guest" && msg.round === sim.round) {
          setPlacement(sim, 1, msg.place);
          if (msg.ready) setReady(sim, 1);
        }
      },
      onPeers: (list) => {
        guest.present = list.some((p) => p.on);
        const gp = list.find((p) => p.role === "guest");
        $("netPill").textContent = gp ? (gp.relay ? "relay" : "direct") : "";
        if (mode === "menu") drawLobby();
      },
    });
  } catch {
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
  lobbyTimer = setInterval(() => hostNet?.tell("guest", { k: "lobby", seats: hostSeats() }), 1000);
};
$("lobbyStart").onclick = () => {
  unlockAudio(); sfx.tap();
  clearInterval(lobbyTimer);
  mode = hostNet && guest.present ? "host" : "solo";
  startLocal(hostSeats());
  $("netPill").classList.toggle("hidden", mode !== "host");
};
$("lobbyBack").onclick = () => { sfx.tap(); leave(); };

/* ----------------------------------------------------------------- guest --- */
$("join").onclick = () => { unlockAudio(); sfx.tap(); show("joinScreen"); $("joinCode").focus(); };
$("joinBack").onclick = () => { sfx.tap(); leave(); };
$("joinGo").onclick = () => joinGame($("joinCode").value);
$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") joinGame($("joinCode").value); });

async function joinGame(code) {
  unlockAudio();
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
  const hello = () => clientNet?.send({ k: "hi", name: myName(), squad: unlocked() });
  hello();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => { hello(); if (g?.phase === "prep") sendPrep(); }, 700); // the channel does not retransmit
  $("joinStatus").textContent = "In! Waiting for the host to start…";
}
const sendPrep = () => clientNet?.send({ k: "prep", round: gRound, place: gPlace, ready: gReady });

function onHostMessage(m) {
  if (!m) return;
  if (m.k === "lobby" && $("hud").classList.contains("hidden")) {
    $("joinStatus").innerHTML = "In! Waiting for the host to start…<br>" + m.seats.map((s) => `${s.name}: ${s.squad.map((id) => CRITTERS[id].name).join(", ")}`).join("<br>");
  }
  if (m.k !== "s") return;
  const seats = m.seats.map(([name, kind, squad]) => ({ name, kind, squad }));
  if (!g) {
    mySeat = 1;
    renderer.setSeat(1);
    g = { units: [] };
    gPlace = autoPlace(seats[1].squad);
    enterHud(seats);
    $("netPill").classList.remove("hidden");
  }
  if (m.ph !== "matchEnd" && !$("over").classList.contains("hidden")) { gPlace = autoPlace(seats[1].squad); enterHud(seats); }
  if (m.rd !== gRound) { gRound = m.rd; gReady = false; }
  Object.assign(g, { phase: m.ph, phaseT: m.pt, round: m.rd, wins: m.w, ready: m.rdy, seats });
  if (m.u) {
    const old = g.units;
    g.units = m.u.map(([seat, idi, x, z, hp, max, face, ult, stun, shield], i) => {
      const o = old[i] && old[i].id === CRITTER_IDS[idi] && old[i].seat === seat ? old[i] : { x, z };
      return Object.assign(o, { seat, id: CRITTER_IDS[idi], tx: x, tz: z, hp, max, face, alive: hp > 0, ult, stun, shield });
    });
  } else g.units = [];
  g.shots = m.sh.map(([x, z, seat]) => ({ x, z, seat }));
  for (const e of m.ev || []) onEvent(e);
}

/* ---------------------------------------------------------- your move --- */
// PREP: drag one of your critters onto a cell of your half (a critter already
// there swaps with it). A plain tap on a critter then a tap on a cell works too.
let picked = null;
const prepOpen = () => { const v = view(); return v && v.phase === "prep" && !v.ready?.[mySeat]; };
$("touch").addEventListener("pointerdown", (e) => {
  unlockAudio();
  if (!prepOpen()) return;
  const id = renderer.pickCritter(e.clientX, e.clientY);
  if (id) {
    drag = { id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    $("touch").setPointerCapture(e.pointerId);
    buzz(8);
  } else if (picked) {
    const cell = renderer.pickCell(e.clientX, e.clientY);
    if (cell >= 0) movePlace(picked, cell);
    picked = null;
  }
});
$("touch").addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointer) return;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
  const p = renderer.groundAt(e.clientX, e.clientY);
  if (p) { drag.x = p.x; drag.z = p.z; }
  hoverCell = renderer.pickCell(e.clientX, e.clientY);
});
const dropDrag = (e) => {
  if (!drag || e.pointerId !== drag.pointer) return;
  const d = drag;
  drag = null;
  hoverCell = -1;
  if (!d.moved) { picked = d.id; return; } // a tap: pick it, the next tap places it
  const cell = renderer.pickCell(e.clientX, e.clientY);
  if (cell >= 0) movePlace(d.id, cell);
};
$("touch").addEventListener("pointerup", dropDrag);
$("touch").addEventListener("pointercancel", () => { drag = null; hoverCell = -1; });

function movePlace(id, cell) {
  if (mode === "guest") {
    const other = Object.keys(gPlace).find((k) => gPlace[k] === cell);
    if (other) gPlace[other] = gPlace[id];
    gPlace[id] = cell;
    sendPrep();
  } else place(sim, 0, id, cell);
  sfx.place();
  buzz(10);
}
$("readyBtn").onclick = () => {
  sfx.tap();
  picked = null;
  if (mode === "guest") { gReady = true; sendPrep(); }
  else setReady(sim, 0);
};

/* ---------------------------------------------------------------- events --- */
let bannerTimer = null;
function banner(html, ms = 1100) {
  const b = $("banner");
  b.innerHTML = html;
  b.classList.add("on");
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.remove("on"), ms);
}
function onEvent(e) {
  renderer.fx(e);
  const v = view(), u = v?.units?.[e.u];
  const now = performance.now();
  switch (e.type) {
    case "round": banner(`ROUND ${e.round}<small>place your squad</small>`, 1500); sfx.beep(false); break;
    case "fight": banner("FIGHT!", 900); sfx.beep(true); buzz(25); break;
    case "hit": if (now - lastHitSfx > 90) { lastHitSfx = now; sfx.bump(6); } break;
    case "slam": sfx.pound(); break;
    case "shoot": sfx.dive(); break;
    case "heal": sfx.float(); break;
    case "ko": sfx.fall(); if (u && u.seat === mySeat) buzz(40); break;
    case "ult": {
      ({ yhon: sfx.pound, hedgehog: sfx.roll, axolotl: sfx.dive, capybara: sfx.float })[e.id]?.();
      if (e.id === "capybara") sfx.win();
      buzz(u && u.seat === mySeat ? 45 : 20);
      const t = document.createElement("div");
      t.className = `ultToast s${u ? u.seat === mySeat ? 0 : 1 : 0}`;
      t.innerHTML = `${CRITTERS[e.id].name}<b>${ULT[e.id].name}!</b>`;
      $("hud").append(t);
      setTimeout(() => t.remove(), 1500);
      break;
    }
    case "roundEnd": {
      const w = e.winner;
      if (w === null) banner("DRAW!", 2400);
      else banner(`${w === mySeat ? "YOU" : v.seats[w].name.toUpperCase()}<small>${w === mySeat ? "win the round!" : "wins the round"}${e.how === "time" ? " (on time)" : ""}</small>`, 2400);
      (w === mySeat ? sfx.win : sfx.lose)();
      break;
    }
    case "match": setTimeout(() => showOver(e.winner), 500); break;
  }
}

function showOver(winner) {
  $("banner").classList.remove("on");
  const v = view();
  const won = winner === mySeat;
  $("overTitle").textContent = won ? "YOU WIN!" : `${v.seats[winner].name.toUpperCase()} WINS`;
  $("podium").innerHTML = [winner, 1 - winner].map((i, k) => `<li><span class="pl">${k ? "2nd" : "1st"}</span><span class="dot" style="--seat:${i === 0 ? "#2fb8ff" : "#ff5fa2"}"></span>${i === mySeat ? "You" : v.seats[i].name}<small>${v.wins[i]} round${v.wins[i] === 1 ? "" : "s"}</small></li>`).join("");
  // Trophies: something for every match, more for a win.
  const before = unlocked();
  const gain = won ? TROPHIES.win : TROPHIES.loss;
  trophies += gain;
  store.set("trophies", trophies);
  $("gained").textContent = `+${gain}`;
  revealQueue = unlocked().filter((id) => !before.includes(id));
  $("again").textContent = mode === "guest" ? "Waiting for host…" : "Rematch";
  $("again").disabled = mode === "guest";
  show("over");
  if (won) sfx.win();
  if (revealQueue.length) setTimeout(nextReveal, 1400);
}

function nextReveal() {
  const id = revealQueue.shift();
  if (!id) { revealing = null; show("over"); return; }
  revealing = id;
  revealT = 0;
  const c = CRITTERS[id];
  $("unlockName").textContent = c.name;
  $("unlockRole").textContent = c.role;
  $("unlockBlurb").textContent = c.blurb;
  theme(id);
  show("unlock");
  sfx.win();
  buzz(50);
  const box = $("confetti");
  const cols = ["#ffd23f", "#ff5fa2", "#2fb8ff", "#6dff8a", "#ffffff"];
  box.innerHTML = Array.from({ length: 60 }, () => `<i style="left:${Math.random() * 100}%;background:${cols[Math.floor(Math.random() * cols.length)]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.6}s"></i>`).join("");
  setTimeout(() => (box.innerHTML = ""), 4000);
}
$("unlockOk").onclick = () => { sfx.tap(); theme("capybara"); nextReveal(); };

$("again").onclick = () => {
  unlockAudio(); sfx.tap();
  if (mode === "guest") return;
  startLocal(mode === "host" ? hostSeats() : [{ ...sim.seats[0], squad: unlocked() }, { name: "Bot", kind: "bot", squad: botSquad(unlocked().length) }]);
};
$("toMenu").onclick = () => { sfx.tap(); leave(); };

function leave() {
  clearInterval(lobbyTimer);
  hostNet?.destroy(); hostNet = null;
  clientNet?.destroy(); clientNet = null;
  guest.present = false;
  sim = null; g = null; gRound = 0; gPlace = null;
  mode = "menu";
  wake?.release?.(); wake = null;
  $("netPill").classList.add("hidden");
  renderer.setSeat(0);
  mySeat = 0;
  theme("capybara");
  drawMenu();
  show("menu");
}

/* ------------------------------------------------------------------- HUD --- */
function view() {
  if (sim) {
    return {
      phase: sim.phase, phaseT: sim.phaseT, round: sim.round, wins: sim.wins, ready: sim.ready, seats: sim.seats,
      place: sim.place[0], units: sim.units, shots: sim.shots,
    };
  }
  if (g) return { ...g, place: gPlace, ready: [g.ready?.[0], gReady || g.ready?.[1]] };
  return null;
}

function hud(v) {
  const pips = (n) => Array.from({ length: TUNE.winsNeeded }, (_, k) => (k < n ? "<b>★</b>" : "☆")).join("");
  $("pipsMe").innerHTML = pips(v.wins[mySeat]);
  $("pipsThem").innerHTML = pips(v.wins[1 - mySeat]);
  const prep = v.phase === "prep", fight = v.phase === "fight";
  $("phaseName").textContent = prep ? "PREP" : fight ? "FIGHT" : v.phase === "roundEnd" ? "ROUND" : "";
  $("phaseT").textContent = prep || fight ? Math.max(0, Math.ceil(v.phaseT)) : "–";
  const sec = Math.ceil(v.phaseT);
  if (prep && sec <= 3 && sec >= 1 && sec !== lastSec) { lastSec = sec; sfx.beep(false); }
  $("prepBar").classList.toggle("hidden", !prep);
  if (prep) {
    const ready = !!v.ready?.[mySeat];
    $("readyBtn").disabled = ready;
    $("prepHint").textContent = ready ? `Waiting for ${v.seats[1 - mySeat].name}…` : picked ? `Now tap a square for ${CRITTERS[picked].name}` : "Drag your critters into place";
  }
}

/* ------------------------------------------------------------------ loop --- */
const DT = 1 / 60;
let last = performance.now(), menuT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim) {
    acc += dt;
    while (acc >= DT) {
      // a guest who has gone quiet for 4 s is handed to the bot
      const guestGone = sim.seats[1].kind === "guest" && performance.now() - guest.seen > 4000;
      if (sim.seats[1].kind === "bot" || guestGone) botStep(sim, 1, brain, DT);
      step(sim, DT);
      for (const e of sim.events) { onEvent(e); if (hostNet) pending.push(e); }
      sim.events.length = 0;
      acc -= DT;
    }
    if (mode === "host") {
      snapT += dt;
      if (snapT >= 1 / SNAP_HZ) {
        snapT = 0;
        const snap = snapshot(sim);
        snap.ev = pending;
        pending = [];
        hostNet.tell("guest", snap);
      }
    }
  } else if (g) {
    const k = 1 - Math.exp(-dt * 14);
    for (const u of g.units) { u.x += (u.tx - u.x) * k; u.z += (u.tz - u.z) * k; }
  }

  const s = SIDES[mySeat];
  if (revealing) {
    revealT += dt;
    renderer.update({ phase: "reveal", roster: [{ id: revealing, x: 0, z: s * 2.2, face: (s > 0 ? 0 : Math.PI) + Math.sin(revealT * 1.5) * 0.6 }] }, dt);
  } else if (mode === "menu" || !view()) {
    menuT += dt;
    const have = unlocked();
    const xs = [-2.1, -0.7, 0.7, 2.1];
    renderer.update({
      phase: "menu",
      roster: UNLOCKS.map((u, i) => ({ id: u.id, x: xs[i], z: s * 1.6, face: (s > 0 ? 0 : Math.PI) + Math.sin(menuT * 0.9 + i) * 0.35, locked: !have.includes(u.id) })),
    }, dt);
  } else {
    const v = view();
    renderer.update({ ...v, drag: drag && drag.moved && drag.x !== undefined ? { id: drag.id, x: drag.x, z: drag.z } : null, hoverCell }, dt);
    hud(v);
  }
  requestAnimationFrame(frame);
}

drawMenu();
show("menu");
const params = new URLSearchParams(location.search);
const joinCode = params.get("join");
if (joinCode) { show("joinScreen"); $("joinCode").value = joinCode.toUpperCase(); }
if (params.get("auto") === "solo") $("solo").click(); // for headless screenshots
requestAnimationFrame(frame);

window.__cc = {
  get sim() { return sim; }, get g() { return g; }, get mode() { return mode; },
  move: movePlace, ready: () => $("readyBtn").click(),
  setTrophies: (n) => { trophies = n; store.set("trophies", n); drawMenu(); },
};
