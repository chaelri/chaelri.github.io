// CRITTER CLASH — boot, screens, unlocks and the three ways to play.
//
//   solo   this phone runs the sim; you vs a bot
//   host   this phone runs the sim and streams snapshots to one guest (a bot
//          plays for a guest who goes quiet)
//   guest  runs NO sim: sends its shop actions, draws what comes back
//
// Your shop only offers critters you have unlocked. A bot shops from the same
// number of critters, always including a frontliner.

import { TUNE, CRITTERS, CRITTER_IDS, UNLOCKS, TROPHIES, SNAP_HZ, MODELS, ULT, SHOP, SNACKS, RULES, PUSTA } from "./config.js";
import { newMatch, step, act, snapshot, price, stakes } from "./sim.js";
import { newBrain, botStep, botPool } from "./bots.js";
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
let sim = null, brain = null, guestBrain = null, mySeat = 0, acc = 0;
let hostNet = null, clientNet = null, lobbyTimer = null;
const guest = { present: false, name: "Guest", pool: ["yhon", "hedgehog"], seen: 0, seq: 0 };
let pending = [], snapT = 0;
let g = null;                     // guest: view built from snapshots
let outbox = [], nextSeq = 1;     // guest: actions not yet acknowledged by the host
let drag = null, hoverCell = -1, lastSec = -1, wake = null, lastHitSfx = 0, lastHp = [null, null];
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
  guestBrain = newBrain();
  mySeat = 0;
  acc = 0;
  pending = [];
  guest.seq = 0;
  renderer.setSeat(0);
  enterHud(seats);
}
function enterHud(seats) {
  show("hud");
  $("themName").textContent = seats[1 - mySeat].name;
  lastSec = -1;
  lastHp = [null, null];
  offersSig = "";
  navigator.wakeLock?.request("screen").then((w) => (wake = w)).catch(() => {});
}

$("solo").onclick = () => {
  unlockAudio(); sfx.tap();
  mode = "solo";
  const mine = unlocked();
  startLocal([{ name: myName(), kind: "host", pool: mine }, { name: "Bot", kind: "bot", pool: botPool(mine.length) }]);
};

/* ------------------------------------------------------------------ host --- */
function hostSeats() {
  const mine = unlocked();
  if (!guest.present) return [{ name: myName(), kind: "host", pool: mine }, { name: "Bot", kind: "bot", pool: botPool(mine.length) }];
  return [{ name: myName(), kind: "host", pool: mine }, { name: guest.name, kind: "guest", pool: guest.pool }];
}
function drawLobby() {
  const s = hostSeats();
  const line = (x, c) => `<li><span class="dot" style="--seat:${c}"></span>${x.name}<small>${x.pool.map((id) => CRITTERS[id].name).join(", ")}</small></li>`;
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
          const pool = (Array.isArray(msg.pool) ? msg.pool : []).filter((id) => CRITTER_IDS.includes(id));
          Object.assign(guest, { present: true, name: String(msg.name || "Guest").slice(0, 12), pool: pool.length >= 2 ? pool : ["yhon", "hedgehog"] });
          if (!was) { sfx.beep(true); buzz(20); }
          if (mode === "menu") drawLobby();
        } else if (msg.k === "acts" && sim && sim.seats[1].kind === "guest" && Array.isArray(msg.a)) {
          // apply each action once, in order: the channel can drop or repeat them
          for (const [seq, a] of msg.a) if (seq > guest.seq) { guest.seq = seq; act(sim, 1, a); }
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
  const hello = () => clientNet?.send({ k: "hi", name: myName(), pool: unlocked() });
  hello();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(() => { hello(); flushOutbox(); }, 250); // resend until acknowledged
  $("joinStatus").textContent = "In! Waiting for the host to start…";
}
function flushOutbox() { if (outbox.length) clientNet?.send({ k: "acts", a: outbox }); }

function onHostMessage(m) {
  if (!m) return;
  if (m.k === "lobby" && $("hud").classList.contains("hidden")) {
    $("joinStatus").innerHTML = "In! Waiting for the host to start…<br>" + m.seats.map((s) => `${s.name}: ${s.pool.map((id) => CRITTERS[id].name).join(", ")}`).join("<br>");
  }
  if (m.k !== "s") return;
  const seats = m.seats.map(([name, kind]) => ({ name, kind }));
  if (!g) {
    mySeat = 1;
    renderer.setSeat(1);
    g = { units: [] };
    outbox = []; nextSeq = 1;
    enterHud(seats);
    $("netPill").classList.remove("hidden");
  }
  if (m.ph !== "matchEnd" && !$("over").classList.contains("hidden")) enterHud(seats);
  outbox = outbox.filter(([seq]) => seq > (m.ack || 0));
  Object.assign(g, { phase: m.ph, phaseT: m.pt, round: m.rd, rule: m.rule, slots: m.slots, seats, me: m.me, them: m.them });
  if (m.u) {
    const old = g.units;
    g.units = m.u.map(([seat, idi, x, z, hp, max, face, ult, stun, shield, star], i) => {
      const o = old[i] && old[i].id === CRITTER_IDS[idi] && old[i].seat === seat ? old[i] : { x, z };
      return Object.assign(o, { seat, id: CRITTER_IDS[idi], tx: x, tz: z, hp, max, face, alive: hp > 0, ult, stun, shield, star });
    });
  } else g.units = [];
  g.shots = m.sh.map(([x, z, seat]) => ({ x, z, seat }));
  for (const e of m.ev || []) onEvent(e);
}

/* ------------------------------------------------------------- my turn --- */
// Every prep action, for host and guest alike. The host applies it to its sim
// at once; a guest queues it (sequence-numbered) until the host confirms it.
function doAct(a) {
  if (mode === "guest") {
    outbox.push([nextSeq++, a]);
    flushOutbox();
    return true;
  }
  return act(sim, 0, a);
}

// Prep touch: drag a critter to move it; with a snack in hand, tap a critter
// to feed it.
$("touch").addEventListener("pointerdown", (e) => {
  unlockAudio();
  const v = view();
  if (!v || v.phase !== "prep" || v.me.ready) return;
  const id = renderer.pickCritter(e.clientX, e.clientY);
  if (!id) return;
  if (v.me.hand) {
    doAct({ t: "feed", id });
    sfx.float(); buzz(15);
    return;
  }
  drag = { id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
  $("touch").setPointerCapture(e.pointerId);
  buzz(8);
});
$("touch").addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointer) return;
  if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
  const p = renderer.groundAt(e.clientX, e.clientY);
  if (p) { drag.x = p.x; drag.z = p.z; }
  hoverCell = renderer.pickCell(e.clientX, e.clientY);
});
$("touch").addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.pointer) return;
  const d = drag;
  drag = null;
  hoverCell = -1;
  if (!d.moved) return;
  const cell = renderer.pickCell(e.clientX, e.clientY);
  if (cell >= 0 && doAct({ t: "move", id: d.id, cell })) { sfx.place(); buzz(10); }
});
$("touch").addEventListener("pointercancel", () => { drag = null; hoverCell = -1; });

$("offers").addEventListener("click", (e) => {
  const card = e.target.closest(".offer");
  if (!card) return;
  unlockAudio();
  if (doAct({ t: "buy", i: +card.dataset.i })) { sfx.place(); buzz(12); } else { buzz(6); sfx.tap(); }
});
$("rerollBtn").onclick = () => { if (doAct({ t: "reroll" })) { sfx.dash(); buzz(8); } };
$("pustaBtn").onclick = () => { if (doAct({ t: "pusta" })) { buzz(30); } };
$("readyBtn").onclick = () => { sfx.tap(); doAct({ t: "ready" }); };

/* ---------------------------------------------------------------- events --- */
let bannerTimer = null;
function banner(html, ms = 1100) {
  const b = $("banner");
  b.innerHTML = html;
  b.classList.add("on");
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.remove("on"), ms);
}
function toast(html, seat) {
  const t = document.createElement("div");
  t.className = `ultToast s${seat === mySeat ? 0 : 1}`;
  t.innerHTML = html;
  $("hud").append(t);
  setTimeout(() => t.remove(), 1500);
}
function onEvent(e) {
  renderer.fx(e);
  const v = view(), u = v?.units?.[e.u];
  const now = performance.now();
  switch (e.type) {
    case "round": banner(`ROUND ${e.round}<small>${RULES[e.rule].name}: ${RULES[e.rule].blurb.toLowerCase()}</small>`, 1900); sfx.beep(false); break;
    case "fight": banner("FIGHT!", 900); sfx.beep(true); buzz(25); break;
    case "frenzy": sfx.pound(); buzz(20); break;
    case "merge": if (e.seat === mySeat) { sfx.win(); buzz(30); } break;
    case "pusta": {
      const who = e.seat === mySeat ? "YOU" : v.seats[e.seat].name.toUpperCase();
      banner(`PUSTA!<small>${who} doubled the stakes</small>`, 1400);
      sfx.pound(); buzz(35);
      break;
    }
    case "hit": if (now - lastHitSfx > 90) { lastHitSfx = now; sfx.bump(6); } break;
    case "crit": sfx.bump(12); break;
    case "revive": sfx.win(); break;
    case "slam": sfx.pound(); break;
    case "shoot": sfx.dive(); break;
    case "heal": sfx.float(); break;
    case "ko": sfx.fall(); if (u && u.seat === mySeat) buzz(40); break;
    case "ult": {
      ({ yhon: sfx.pound, hedgehog: sfx.roll, axolotl: sfx.dive, capybara: sfx.float })[e.id]?.();
      buzz(u && u.seat === mySeat ? 45 : 20);
      toast(`${CRITTERS[e.id].name}<b>${ULT[e.id].name}!</b>`, u ? u.seat : 0);
      break;
    }
    case "roundEnd": {
      const w = e.winner;
      if (w === null) banner(`DRAW!<small>both lose ${e.dmg} HP</small>`, 2400);
      else banner(`${w === mySeat ? "YOU WIN" : v.seats[w].name.toUpperCase() + " WINS"}<small>${w === mySeat ? "they" : "you"} lose ${e.dmg} HP${e.how === "time" ? " (on time)" : ""}</small>`, 2400);
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
  const hp = [v.me.hp, v.them.hp]; // mine, theirs
  $("podium").innerHTML = [[won, mySeat, hp[0]], [!won, 1 - mySeat, hp[1]]].sort((a, b) => b[0] - a[0])
    .map(([, i, h], k) => `<li><span class="pl">${k ? "2nd" : "1st"}</span><span class="dot" style="--seat:${i === 0 ? "#2fb8ff" : "#ff5fa2"}"></span>${i === mySeat ? "You" : v.seats[i].name}<small>${Math.max(0, h)} HP left</small></li>`).join("");
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
  if (!id) { revealing = null; theme("capybara"); show("over"); return; }
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
$("unlockOk").onclick = () => { sfx.tap(); nextReveal(); };

$("again").onclick = () => {
  unlockAudio(); sfx.tap();
  if (mode === "guest") return;
  startLocal(mode === "host" ? hostSeats() : [{ ...sim.seats[0], pool: unlocked() }, { name: "Bot", kind: "bot", pool: botPool(unlocked().length) }]);
};
$("toMenu").onclick = () => { sfx.tap(); leave(); };

function leave() {
  clearInterval(lobbyTimer);
  hostNet?.destroy(); hostNet = null;
  clientNet?.destroy(); clientNet = null;
  guest.present = false;
  sim = null; g = null; outbox = [];
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
// One shape for both: `me` and `them` are this phone's player and the other.
function view() {
  if (sim) {
    const me = sim.p[0], them = sim.p[1];
    return {
      phase: sim.phase, phaseT: sim.phaseT, round: sim.round, rule: sim.rule, slots: sim.slots, seats: sim.seats,
      me: { hp: me.hp, coins: me.coins, shop: me.shop, board: me.board, hand: me.hand, pusta: me.pusta, ready: me.ready },
      them: { hp: them.hp, pusta: them.pusta, ready: them.ready },
      units: sim.units, shots: sim.shots,
    };
  }
  return g && g.me ? g : null;
}

let offersSig = "";
function hud(v) {
  const me = v.me, them = v.them;
  for (const [el, hp, k] of [[$("hpMe"), me.hp, 0], [$("hpThem"), them.hp, 1]]) {
    el.textContent = `♥ ${Math.max(0, hp)}`;
    if (lastHp[k] !== null && hp < lastHp[k]) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
    lastHp[k] = hp;
  }
  const prep = v.phase === "prep", fight = v.phase === "fight";
  $("phaseName").textContent = prep ? "PREP" : fight ? "FIGHT" : v.phase === "roundEnd" ? "ROUND" : "";
  $("phaseT").textContent = prep || fight ? Math.max(0, Math.ceil(v.phaseT)) : "–";
  $("hud").classList.toggle("frenzy", fight && v.phaseT <= TUNE.frenzy);
  const sec = Math.ceil(v.phaseT);
  if (prep && sec <= 3 && sec >= 1 && sec !== lastSec) { lastSec = sec; sfx.beep(false); }

  const rule = RULES[v.rule];
  $("ruleChip").innerHTML = rule ? `<b>${rule.name}</b>${rule.blurb}` : "";
  const mult = (me.pusta ? PUSTA : 1) * (them.pusta ? PUSTA : 1);
  $("stakeChip").classList.toggle("hidden", mult === 1 || v.phase === "roundEnd");
  $("stakeChip").textContent = `STAKES x${mult}`;

  $("shopSheet").classList.toggle("hidden", !prep);
  if (!prep) return;
  $("coins").textContent = me.coins;
  $("rerollBtn").disabled = me.coins < SHOP.reroll;
  $("pustaBtn").classList.toggle("on", !!me.pusta);
  $("pustaBtn").innerHTML = me.pusta ? "STAKED <small>x2</small>" : "PUSTA! <small>x2</small>";
  $("shopSheet").classList.toggle("waiting", !!me.ready);
  $("shopSheet").classList.toggle("held", !!me.hand);
  const count = Object.keys(me.board).length;
  $("readyBtn").disabled = !!me.ready || !count;
  $("prepHint").textContent = me.ready ? `Waiting for ${v.seats[1 - mySeat].name}…`
    : me.hand ? `Tap a critter to feed it ${SNACKS[me.hand].name}`
    : !count ? "Buy a critter to start"
    : `${count}/${v.slots} on the board · drag to move`;

  const sig = JSON.stringify([me.shop, me.coins, me.board, me.hand, v.rule, v.slots]);
  if (sig !== offersSig) {
    offersSig = sig;
    $("offers").innerHTML = me.shop.map((o, i) => {
      const cost = price(v.rule, o.kind);
      let cls = o.kind, name, sub;
      if (o.kind === "critter") {
        const have = me.board[o.id];
        name = CRITTERS[o.id].name;
        if (have) { cls += have.star < 3 ? " merge" : " cant"; sub = have.star < 3 ? `merge to ${"★".repeat(have.star + 1)}` : "already ★★★"; }
        else { sub = CRITTERS[o.id].role; if (count >= v.slots) cls += " cant"; }
      } else {
        name = SNACKS[o.id].name;
        sub = SNACKS[o.id].blurb;
        if (me.hand || !count) cls += " cant";
      }
      if (me.coins < cost) cls += " cant";
      if (o.sold) cls += " sold";
      return `<div class="offer ${cls}" data-i="${i}"><div class="price">${cost}</div><b>${name}</b><span>${sub}</span></div>`;
    }).join("");
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
      if (sim.seats[1].kind === "bot") botStep(sim, 1, brain, DT);
      // a guest who has gone quiet for 5 s is played by a bot until they return
      else if (performance.now() - guest.seen > 5000) botStep(sim, 1, guestBrain, DT);
      step(sim, DT);
      for (const e of sim.events) { onEvent(e); if (hostNet) pending.push(e); }
      sim.events.length = 0;
      acc -= DT;
    }
    if (mode === "host") {
      snapT += dt;
      if (snapT >= 1 / SNAP_HZ) {
        snapT = 0;
        const snap = snapshot(sim, guest.seq);
        snap.ev = pending;
        pending = [];
        hostNet.tell("guest", snap);
      }
    }
  } else if (g) {
    const k = 1 - Math.exp(-dt * 14);
    for (const u of g.units) { u.x += (u.tx - u.x) * k; u.z += (u.tz - u.z) * k; }
  }

  const s = mySeat === 0 ? 1 : -1;
  const v = view();
  if (revealing) {
    revealT += dt;
    renderer.update({ phase: "reveal", roster: [{ id: revealing, x: 0, z: s * 2.2, face: (s > 0 ? 0 : Math.PI) + Math.sin(revealT * 1.5) * 0.6 }] }, dt);
  } else if (mode === "menu" || !v) {
    menuT += dt;
    const have = unlocked();
    const xs = [-2.1, -0.7, 0.7, 2.1];
    renderer.update({
      phase: "menu",
      roster: UNLOCKS.map((u, i) => ({ id: u.id, x: xs[i], z: s * 1.6, face: (s > 0 ? 0 : Math.PI) + Math.sin(menuT * 0.9 + i) * 0.35, locked: !have.includes(u.id) })),
    }, dt);
  } else {
    renderer.update({ ...v, board: v.me.board, drag: drag && drag.moved && drag.x !== undefined ? { id: drag.id, x: drag.x, z: drag.z } : null, hoverCell }, dt);
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
  act: doAct,
  setTrophies: (n) => { trophies = n; store.set("trophies", n); drawMenu(); },
};
