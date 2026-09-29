// CRITTER HEIST — boot, screens, the Critterdex and the three ways to play.
//
//   solo   this phone runs the sim; you vs a bot
//   host   this phone runs the sim and streams snapshots to one guest (a bot
//          plays for a guest who goes quiet)
//   guest  runs NO sim: sends its stick and buttons, draws what comes back

import { MATCH, RARITY, RARITY_IDS, SPECIES, SPECIES_IDS, EVENTS, SNAP_HZ, INPUT_HZ, LOCK, SEAT_COLOURS } from "./config.js";
import { newMatch, step, snapshot, actionFor, baseValue, WHERE_IDS } from "./sim.js";
import { newBrain, botInput } from "./bots.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { sfx, buzz, unlock as unlockAudio } from "./audio.js";
import { createHost, createClient } from "./net.js";

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return localStorage.getItem("critterheist." + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("critterheist." + k, v); } catch {} },
};
const renderer = await createRenderer($("gl"), $("overlay"));
$("loading").classList.add("hidden");

/* ------------------------------------------------------------ critterdex --- */
// 4 species x (4 rarities + Rainbow) = 20 entries, filled the first time you
// put one on your own pedestal.
const DEX_COLS = [...RARITY_IDS, "rainbow"];
let dex = new Set();
try { dex = new Set(JSON.parse(store.get("dex", "[]"))); } catch {}
function addToDex(species, rarity, rainbow) {
  const fresh = [];
  for (const k of [`${species}:${rarity}`, ...(rainbow ? [`${species}:rainbow`] : [])]) if (!dex.has(k)) { dex.add(k); fresh.push(k); }
  if (fresh.length) store.set("dex", JSON.stringify([...dex]));
  return fresh;
}
function drawDex() {
  $("dexCount").textContent = `${dex.size} / ${SPECIES_IDS.length * DEX_COLS.length}`;
  const colour = (r) => (r === "rainbow" ? "linear-gradient(90deg,#ff9fb5,#ffc928,#7ed957,#6fd3ff,#c4a2ff)" : RARITY[r].colour);
  $("dex").innerHTML = `<span></span>${SPECIES_IDS.map((s) => `<span class="h">${SPECIES[s].name}</span>`).join("")}` +
    DEX_COLS.map((r) => `<span class="rn">${r === "rainbow" ? "Rainbow" : RARITY[r].name}</span>` +
      SPECIES_IDS.map((s) => `<span class="cell${dex.has(`${s}:${r}`) ? " got" : ""}" style="--r:${colour(r)}"></span>`).join("")).join("");
}

/* ----------------------------------------------------------------- state --- */
let mode = "menu";
let sim = null, brain = null, guestBrain = null, mySeat = 0, acc = 0;
let hostNet = null, clientNet = null, lobbyTimer = null;
const guest = { present: false, name: "Guest", input: null, seen: 0 };
let pending = [], snapT = 0, inT = 0;
let g = null;              // guest: view built from snapshots
let wake = null, newThisMatch = 0, lastSecs = -1;

$("name").value = store.get("name", "");
$("name").addEventListener("input", () => store.set("name", $("name").value.trim()));
const myName = () => $("name").value.trim() || "Player";

const input = createInput({
  stickZone: $("stickZone"), stickBase: $("stickBase"), stickKnob: $("stickKnob"),
  actBtn: $("actBtn"), lockBtn: $("lockBtn"),
});

function show(id) {
  for (const s of ["menu", "lobby", "joinScreen", "hud", "over"]) $(s).classList.toggle("hidden", s !== id);
}

function startLocal(seats) {
  sim = newMatch(seats);
  brain = newBrain(0.7);
  guestBrain = newBrain(0.7);
  mySeat = 0;
  acc = 0;
  pending = [];
  renderer.setSeat(0);
  enterHud();
}
function enterHud() {
  show("hud");
  input.state.enabled = true;
  newThisMatch = 0;
  lastSecs = -1;
  navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
}

$("solo").onclick = () => {
  unlockAudio(); sfx.tap();
  mode = "solo";
  startLocal([{ name: myName(), kind: "host" }, { name: "Bot", kind: "bot" }]);
};

/* ------------------------------------------------------------------ host --- */
function hostSeats() {
  return [{ name: myName(), kind: "host" }, guest.present ? { name: guest.name, kind: "guest" } : { name: "Bot", kind: "bot" }];
}
function drawLobby() {
  const s = hostSeats();
  $("lobbySeats").innerHTML = `<li><span class="dot" style="--seat:#2fb8ff"></span>${s[0].name}<small>you</small></li>` +
    (guest.present ? `<li><span class="dot" style="--seat:#ff8a1f"></span>${s[1].name}<small>joined</small></li>`
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
          Object.assign(guest, { present: true, name: String(msg.name || "Guest").slice(0, 12) });
          if (!was) { sfx.beep(true); buzz(20); }
          if (mode === "menu") drawLobby();
        } else if (msg.k === "i") {
          guest.input = { mx: +msg.mx || 0, mz: +msg.mz || 0, a: msg.a | 0, l: msg.l | 0 };
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
  const hello = () => clientNet?.send({ k: "hi", name: myName() });
  hello();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(hello, 1000);
  $("joinStatus").textContent = "In! Waiting for the host to start…";
}

// The guest rebuilds a sim-shaped copy from each snapshot, so the renderer and
// the action-button label work exactly as they do on the host.
function onHostMessage(m) {
  if (!m) return;
  if (m.k === "lobby" && $("hud").classList.contains("hidden")) {
    $("joinStatus").innerHTML = "In! Waiting for the host to start…<br>" + m.seats.map((s) => s.name).join(" vs ");
  }
  if (m.k !== "s") return;
  if (!g) {
    mySeat = 1;
    renderer.setSeat(1);
    g = { players: [{}, {}], critters: [] };
    enterHud();
    $("netPill").classList.remove("hidden");
  }
  if (m.ph !== "end" && !$("over").classList.contains("hidden")) enterHud();
  Object.assign(g, { phase: m.ph, phaseT: m.pt, t: m.t, winner: m.w, box: m.box, event: m.ev ? { id: m.ev } : null, peds: m.peds, values: m.v, seats: m.seats.map(([name, kind]) => ({ name, kind })) });
  m.p.forEach(([x, z, face, carry, coins, stun, lockT, lockCd], i) => {
    const p = g.players[i];
    const jump = p.tx === undefined || Math.hypot(x - p.tx, z - p.tz) > 4;
    Object.assign(p, { seat: i, tx: x, tz: z, face, carry, coins, stun, lockT, lockCd });
    if (jump) { p.x = x; p.z = z; }
  });
  const old = new Map(g.critters.map((c) => [c.id, c]));
  g.critters = m.c.map(([id, sp, ra, rb, x, z, wh, owner, ped, guard, home]) => {
    const c = old.get(id) || { id, x, z };
    Object.assign(c, { species: SPECIES_IDS[sp], rarity: RARITY_IDS[ra], rainbow: !!rb, tx: x, tz: z, where: WHERE_IDS[wh], owner, ped, guard, home: home >= 0 ? { seat: home } : null, carrier: -1 });
    if (Math.hypot(c.x - x, c.z - z) > 4) { c.x = x; c.z = z; }
    return c;
  });
  for (const e of m.evs || []) onEvent(e);
}

/* ---------------------------------------------------------------- events --- */
let bannerTimer = null;
function banner(html, ms = 1300) {
  const b = $("banner");
  b.innerHTML = html;
  b.classList.add("on");
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.remove("on"), ms);
}
function toastNew(html) {
  const t = document.createElement("div");
  t.className = "newToast";
  t.innerHTML = html;
  $("hud").append(t);
  setTimeout(() => t.remove(), 2300);
}
function onEvent(e) {
  renderer.fx(e);
  const me = e.seat === mySeat;
  switch (e.type) {
    case "go": banner("HEIST!", 900); sfx.beep(true); buzz(25); break;
    case "buy": if (me) { sfx.buy(); buzz(12); if (e.rarity === "legendary" || e.rainbow) sfx.legendary(); } break;
    case "place":
      if (me) {
        sfx.place();
        if (e.stolen) { sfx.steal(); buzz(40); }
        const fresh = addToDex(e.species, e.rarity, e.rainbow);
        if (fresh.length) {
          newThisMatch += fresh.length;
          toastNew(`NEW in your Critterdex!<b>${e.rainbow && fresh.some((k) => k.endsWith(":rainbow")) ? "Rainbow " : RARITY[e.rarity].name + " "}${SPECIES[e.species].name}</b>`);
          sfx.legendary();
        }
      } else if (e.stolen) { banner("NAKAW!<small>they got one of yours</small>", 1400); sfx.lose(); buzz(50); }
      break;
    case "grab": if (!me) { banner("THIEF!<small>catch them!</small>", 1100); buzz(60); sfx.beep(true); } else sfx.grab(); break;
    case "caught": sfx.caught(); buzz(e.seat === mySeat ? 30 : 60); break;
    case "escape": sfx.dive?.(); break;
    case "sold": if (me) sfx.coin(); break;
    case "lock": sfx.lock(); if (!me) buzz(15); break;
    case "box": if (me) { sfx.legendary(); buzz(40); } break;
    case "event": banner(`${EVENTS[e.id].name}!<small>${EVENTS[e.id].blurb}</small>`, 2200); sfx.pound?.(); buzz(25); break;
    case "end": setTimeout(() => showOver(e.winner, e.values), 700); break;
  }
}

function showOver(winner, values) {
  $("banner").classList.remove("on");
  input.state.enabled = false;
  const v = view();
  const names = v.seats.map((s, i) => (i === mySeat ? "You" : s.name));
  $("overTitle").textContent = winner === null ? "DRAW!" : winner === mySeat ? "YOU WIN!" : `${names[winner].toUpperCase()} WINS`;
  const order = winner === 1 ? [1, 0] : [0, 1];
  $("podium").innerHTML = order.map((i, k) => `<li><span class="pl">${k ? "2nd" : "1st"}</span><span class="dot" style="--seat:${i === 0 ? "#2fb8ff" : "#ff8a1f"}"></span>${names[i]}<small><span class="coin" style="width:12px;height:12px;display:inline-block;vertical-align:-1px"></span> ${values[i]}</small></li>`).join("");
  const st = sim ? sim.players[mySeat].stats : null;
  $("overStats").innerHTML = (st ? `Bought ${st.bought} · Stole ${st.stolen} · Caught ${st.caught} thieves<br>` : "") + (newThisMatch ? `<b>${newThisMatch} new</b> in your Critterdex` : "No new Critterdex entries this time");
  $("again").textContent = mode === "guest" ? "Waiting for host…" : "Rematch";
  $("again").disabled = mode === "guest";
  show("over");
  (winner === mySeat ? sfx.win : sfx.lose)();
}
$("again").onclick = () => {
  unlockAudio(); sfx.tap();
  if (mode === "guest") return;
  startLocal(mode === "host" ? hostSeats() : sim.seats);
};
$("toMenu").onclick = () => { sfx.tap(); leave(); };

function leave() {
  clearInterval(lobbyTimer);
  hostNet?.destroy(); hostNet = null;
  clientNet?.destroy(); clientNet = null;
  guest.present = false;
  sim = null; g = null;
  mode = "menu";
  input.state.enabled = false;
  wake?.release?.(); wake = null;
  $("netPill").classList.add("hidden");
  renderer.setSeat(0);
  mySeat = 0;
  drawDex();
  show("menu");
}

/* ------------------------------------------------------------------- HUD --- */
function view() {
  if (sim) return { ...sim, values: [baseValue(sim, 0), baseValue(sim, 1)], names: sim.seats.map((x) => x.name) };
  if (g) return { ...g, names: g.seats.map((x) => x.name) };
  return null;
}
function hud(v) {
  const me = v.players[mySeat];
  $("coins").textContent = Math.floor(me.coins);
  const left = Math.max(0, MATCH.time - (v.t || 0));
  const secs = Math.ceil(left);
  $("time").textContent = v.phase === "countdown" ? Math.ceil(v.phaseT) : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  $("clock").classList.toggle("low", v.phase === "play" && left <= 20);
  if (v.phase === "play" && secs <= 10 && secs !== lastSecs) { lastSecs = secs; sfx.beep(secs <= 3); }
  const [a, b] = [v.values[mySeat], v.values[1 - mySeat]];
  $("worthMe").textContent = a;
  $("worthThem").textContent = b;
  $("meter").style.width = `${(a / Math.max(1, a + b)) * 100}%`;
  $("meter").style.background = SEAT_COLOURS[mySeat];
  $("meter").parentElement.style.background = SEAT_COLOURS[1 - mySeat];
  const ev = v.event?.id;
  $("eventChip").classList.toggle("hidden", !ev);
  if (ev) $("eventChip").innerHTML = `<b>${EVENTS[ev].name}</b>${EVENTS[ev].blurb}`;
  // the one context button
  const act = actionFor(v, mySeat);
  const live = act && ["buy", "place", "steal", "lift", "box"].includes(act.kind);
  $("actLabel").textContent = act ? act.label : me.stun > 0 ? "Dizzy!" : "—";
  $("actBtn").classList.toggle("off", !live);
  $("actBtn").classList.toggle("hot", !!live && (act.kind === "steal" || act.kind === "box"));
  const lockBtn = $("lockBtn");
  lockBtn.style.setProperty("--cd", (me.lockCd / LOCK.recharge).toFixed(3));
  lockBtn.classList.toggle("on", me.lockT > 0);
  lockBtn.firstElementChild.textContent = me.lockT > 0 ? Math.ceil(me.lockT) : ev === "brownout" ? "NO LOCK" : me.lockCd > 0 ? Math.ceil(me.lockCd) : "LOCK";
}

/* ------------------------------------------------------------------ loop --- */
const DT = 1 / 60;
// ?autobot=1: a bot plays your side too, for watching a whole match headless
const autobot = new URLSearchParams(location.search).get("autobot") === "1";
const meBrain = newBrain(0.8);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim) {
    acc += dt;
    while (acc >= DT) {
      const guestFresh = sim.seats[1].kind === "guest" && performance.now() - guest.seen < 3000 && guest.input;
      let mine = input.read();
      if (autobot) { botInput(sim, 0, meBrain, DT); mine = { mx: meBrain.mx, mz: meBrain.mz, a: meBrain.a, l: meBrain.l }; }
      const inputs = [mine, null];
      if (sim.seats[1].kind === "bot" || !guestFresh) {
        const b = sim.seats[1].kind === "bot" ? brain : guestBrain;
        botInput(sim, 1, b, DT);
        inputs[1] = { mx: b.mx, mz: b.mz, a: b.a, l: b.l };
      } else inputs[1] = guest.input;
      step(sim, inputs, DT);
      for (const e of sim.events) { onEvent(e); if (hostNet) pending.push(e); }
      sim.events.length = 0;
      acc -= DT;
    }
    if (mode === "host") {
      snapT += dt;
      if (snapT >= 1 / SNAP_HZ) {
        snapT = 0;
        const snap = snapshot(sim);
        snap.evs = pending;
        pending = [];
        hostNet.tell("guest", snap);
      }
    }
  } else if (g) {
    inT += dt;
    // The guest's camera looks from the other end of the island, so its
    // screen-up is world +z and its screen-right is world -x: flip the stick.
    if (inT >= 1 / INPUT_HZ) { inT = 0; const i = input.read(); clientNet?.send({ k: "i", ...i, mx: -i.mx, mz: -i.mz }); }
    const k = 1 - Math.exp(-dt * 16);
    for (const p of g.players) if (p.tx !== undefined) { p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k; }
    for (const c of g.critters) { c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; }
  }
  const v = view();
  if (v && mode !== "menu") { renderer.update(v, dt); hud(v); }
  else renderer.update({ phase: "menu", players: [], critters: [] }, dt);
  requestAnimationFrame(frame);
}

drawDex();
show("menu");
const params = new URLSearchParams(location.search);
const joinCode = params.get("join");
if (joinCode) { show("joinScreen"); $("joinCode").value = joinCode.toUpperCase(); }
if (params.get("auto") === "solo") $("solo").click(); // for headless screenshots
requestAnimationFrame(frame);

window.__ch = { get sim() { return sim; }, get g() { return g; }, get mode() { return mode; }, input };
