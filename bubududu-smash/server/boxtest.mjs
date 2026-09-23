/* Does a mystery box actually open, and does the King actually fall?
 *
 * The soak proves none of this throws, and the browser cannot be made to
 * prove it at all: a box turns up every nineteen seconds, the King is two
 * chances in nine of one, and a background tab throttles the loop that would
 * have to run to reach either. So the rules get driven directly.
 *
 * Every check here is a thing Charlie asked for in words, and is written to
 * fail if that sentence stops being true:
 *
 *   "It needs 3 jumps for other characters"
 *   "If any character has BIG power up it can break it in 1 jump"
 *   "yhon can just do a ground pound and its instantly broken"
 *   "big heart with 3 health dag dag"
 *   "aim assisted bazooka that will 1 shot the other character"
 *   "King ... 3 hearts u have to defeat it"
 *   "Star can just hit 1 heart as well sa kanya and even baril"
 *   "kung sino makalast hit ... will have a combination of Star and Big"
 */
import * as sim from "../js/sim.js";
import { BOX, KING, POWERUPS, FEEL, DIWATA } from "../js/config.js";

const quiet = {
  sfx: () => {}, music: () => {}, note: () => {}, banner: () => {}, count: () => {},
  result: () => {}, rematch: () => {}, power: () => {}, shake: () => {}, punch: () => {},
  flash: () => {}, killCam: () => {}, roundStart: () => {},
};

function world(p1 = "bubu", p2 = "yhon") {
  sim.configure({ authority: true, fx: quiet });
  sim.state.newSession();
  sim.state.pads.p1.connected = true;
  sim.state.pads.p2.connected = true;
  sim.state.pads.p1.char = p1;
  sim.state.pads.p2.char = p2;
  sim.startRound(4242);
  for (let i = 0; i < 600 && sim.state.phase !== "play"; i++) sim.step(sim.TICK);
  if (sim.state.phase !== "play") throw new Error("never reached play");
  return sim.state.G;
}

let bad = 0;
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
  if (!cond) bad++;
};

/** Put a box directly over a player's head and return it. */
function placeBox(G, a, drop) {
  const b = { x: a.x, y: a.y - 2.6, hits: BOX.hits, born: G.time, bumpAt: -9, drop };
  G.boxes.push(b);
  return b;
}

/** One head-bump: stand under it, moving up. */
function bump(G, a, b) {
  a.x = b.x;
  a.y = b.y + b.h_ || b.y + 1.4;   // head just under the box
  a.y = b.y + a.h + 0.4;
  a.vy = -6;
  sim.step(sim.TICK);
}

/* ---- 1. three bumps, and not two ---------------------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const b = placeBox(G, a, "puso");
  bump(G, a, b);
  bump(G, a, b);
  ok("box   two bumps is not enough", G.boxes.length === 1 && G.boxes[0].hits === 1,
      `hits ${G.boxes[0] && G.boxes[0].hits}`);
  bump(G, a, b);
  ok("box   the third opens it", G.boxes.length === 0 && G.powers.some((q) => q.type === "puso"),
      `boxes ${G.boxes.length} powers ${G.powers.map((q) => q.type).join(",")}`);
}

/* ---- 2. BIG opens it in one ------------------------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  a.power = { type: "laki", until: G.time + 99, ammo: 0 };
  const b = placeBox(G, a, "puso");
  bump(G, a, b);
  ok("box   BIG opens it in one", G.boxes.length === 0,
      `boxes ${G.boxes.length}`);
}

/* ---- 3. Yhon's pound opens it outright --------------------------------- */
{
  const G = world("yhon", "bubu");
  const a = G.actors.find((q) => q.id === "p1");
  // A box beside him on the floor, and a pound landing next to it.
  const b = { x: a.x + 1, y: a.y - 0.5, hits: BOX.hits, born: G.time, bumpAt: -9, drop: "puso" };
  G.boxes.push(b);
  a.pounding = true;
  a.poundFrom = a.y - 6;
  a.vy = ABILITYSPEED();
  for (let i = 0; i < 40 && G.boxes.length; i++) sim.step(sim.TICK);
  ok("box   a Ground Pound opens it outright", G.boxes.length === 0,
      `boxes ${G.boxes.length}`);
}
function ABILITYSPEED() { return 27; }

/* ---- 4. the Big Heart is worth three, past the ordinary ceiling --------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  a.hp = 3;
  G.powers.push({ x: a.x, y: a.y - a.h / 2, type: "puso", born: G.time });
  for (let i = 0; i < 6 && G.powers.length; i++) sim.step(sim.TICK);
  ok("drop  Big Heart puts you on nine", a.hp === POWERUPS.puso.set, `hp ${a.hp}`);
  ok("drop  ...from wherever you were, not +3", a.hp > FEEL.hpMax);
}
/* ...and from one heart it is still nine, because it SETS rather than adds. */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  a.hp = 1;
  G.powers.push({ x: a.x, y: a.y - a.h / 2, type: "puso", born: G.time });
  for (let i = 0; i < 6 && G.powers.length; i++) sim.step(sim.TICK);
  ok("drop  ...even from one heart", a.hp === POWERUPS.puso.set, `hp ${a.hp}`);
}

/* ---- 5. the bazooka steers, and it ends it ----------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  a.power = { type: "bazuka", until: Infinity, ammo: 1 };
  // Put the target well above the line of fire — a bullet would sail under.
  o.x = a.x + 7; o.y = a.y - 4; o.vx = 0; o.vy = 0;
  a.face = 1;
  a.shotAt = -9999;
  const before = o.hp;
  // Fire arrives as an incrementing counter on the input packet, not a flag —
  // `s` in applyPacket. A boolean edge can be lost on an unordered channel;
  // a counter going up cannot.
  sim.applyPacket("p1", { n: 1, s: 1 });
  sim.step(sim.TICK);
  const shell = G.shots[0];
  ok("bazuka fires a homing shell", !!shell && shell.homing === true);
  let turned = false;
  for (let i = 0; i < 60 && G.shots.length; i++) {
    const s0 = G.shots[0];
    if (s0 && Math.abs(s0.vy) > 1) turned = true;
    o.y = a.y - 4; o.x = a.x + 7; o.vy = 0;   // hold it there to be shot at
    sim.step(sim.TICK);
  }
  ok("bazuka the shell steers upward at it", turned);
  ok("bazuka one shell takes the whole bar", o.hp < before - 0.9 || o.dead,
      `hp ${before} -> ${o.hp}`);
}

/* ---- 5b. ...and it does not have to touch you ------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  const def = POWERUPS.bazuka;
  // Stand him well clear of where it will go off — inside the blast, but
  // nowhere near the point of impact.
  o.x = a.x + 14; o.y = a.y; o.vx = 0;
  const hpWas = o.hp;
  bazookaAt(G, a.x + 14 - def.blast * 0.7, o.y - o.h / 2, "p1");
  ok("bazuka the BLAST kills, not the contact", o.hp < hpWas || o.dead,
     `hp ${hpWas} -> ${o.hp} at ${(def.blast * 0.7).toFixed(1)} tiles`);
}
/* ...and not a tile further than it says it does. */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  const def = POWERUPS.bazuka;
  o.x = a.x + 14; o.y = a.y; o.vx = 0;
  const hpWas = o.hp;
  bazookaAt(G, o.x - def.blast * 1.6, o.y - o.h / 2, "p1");
  ok("bazuka ...and spares anyone outside it", o.hp === hpWas && !o.dead,
     `hp ${hpWas} -> ${o.hp}`);
}

/** Detonate a shell at a point, by putting one there and letting it expire. */
function bazookaAt(G, x, y, owner) {
  G.shots.push({ x, y, vx: 0, vy: 0, owner, life: 0.001, born: G.time,
                 homing: true, lethal: true });
  sim.step(sim.TICK);
  sim.step(sim.TICK);
}

/* ---- 6. the King takes three, and only one at a time ------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  sim.__test_summonKing
    ? sim.__test_summonKing({ x: a.x, y: a.y })
    : G.boxes.push({ x: a.x, y: a.y - 3, hits: 0, born: G.time, bumpAt: G.time, drop: "hari" });
  for (let i = 0; i < 4 && !G.king; i++) sim.step(sim.TICK);
  ok("king  a box can let him out", !!G.king, `king ${!!G.king}`);
  if (G.king) {
    ok("king  he arrives with three", G.king.hp === KING.hp, `hp ${G.king.hp}`);

    // Two shots inside his grace window take ONE heart, not two.
    const k = G.king;
    const fire = () => {
      G.shots.push({ x: k.actor.x - 0.2, y: k.actor.y - k.actor.h / 2, vx: 1, vy: 0,
                     owner: "p1", life: 1, born: G.time });
      sim.step(sim.TICK);
    };
    fire(); fire();
    ok("king  two hits in one window is worth one heart", k.hp === KING.hp - 1, `hp ${k.hp}`);

    // Wait out the window and finish him.
    for (let guard = 0; guard < 400 && k.hp > 0; guard++) {
      if (sim.state.G.time >= k.hurtUntil) fire(); else sim.step(sim.TICK);
    }
    ok("king  three hits put him down", k.hp <= 0, `hp ${k.hp}`);
    ok("king  the last hitter is crowned",
       a.power && a.power.type === "korona", `power ${a.power && a.power.type}`);
    ok("king  the crown IS a star — out on contact, not just safe",
       !!POWERUPS.korona.star);
    ok("king  the crown is bigger than Big",
       a.w > a.baseW * POWERUPS.laki.scale,
       `w ${a.w.toFixed(2)} vs big ${(a.baseW * POWERUPS.laki.scale).toFixed(2)}`);
    ok("king  ...and it runs on its own clock, like any power-up",
       a.power && a.power.until > sim.state.G.time, `until ${a.power && a.power.until}`);
  }
}

/* ---- 7. the star and the fist take one heart, not the lot ------------- */
for (const how of ["bituin", "suntok"]) {
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  G.boxes.push({ x: a.x, y: a.y - 3, hits: 0, born: G.time, bumpAt: G.time, drop: "hari" });
  for (let i = 0; i < 4 && !G.king; i++) sim.step(sim.TICK);
  if (!G.king) { ok(`king  ${how} setup`, false); continue; }
  const k = G.king;
  a.power = { type: how, until: Infinity, ammo: 3 };
  a.x = k.actor.x; a.y = k.actor.y; a.face = 1;
  if (how === "suntok") {
    a.x = k.actor.x - 1.2;
    a.punch = { at: G.time, face: 1, hit: false };
  }
  for (let i = 0; i < 20 && k.hp === KING.hp; i++) {
    a.x = how === "suntok" ? k.actor.x - 1.2 : k.actor.x;
    a.y = k.actor.y;
    sim.step(sim.TICK);
  }
  ok(`king  ${how} takes exactly one heart`, k.hp === KING.hp - 1, `hp ${k.hp}`);
}

/* ---- 7b. ANY character can stomp him, holding nothing ------------------ */
for (const char of ["bubu", "dudu", "yhon"]) {
  const G = world(char, char === "bubu" ? "yhon" : "bubu");
  const a = G.actors.find((q) => q.id === "p1");
  G.boxes.push({ x: a.x, y: a.y - 3, hits: 0, born: G.time, bumpAt: G.time, drop: "hari" });
  for (let i = 0; i < 4 && !G.king; i++) sim.step(sim.TICK);
  const k = G.king;
  if (!k) { ok(`king  ${char} stomp setup`, false); continue; }
  a.power = null;                       // empty-handed, on purpose
  let bounced = false;
  for (let i = 0; i < 30 && k.hp === KING.hp; i++) {
    // drop him onto the King's head
    a.x = k.actor.x;
    a.y = k.actor.y - k.actor.h - 0.3;
    a.vy = 8;
    sim.step(sim.TICK);
    if (a.vy < 0) bounced = true;
  }
  ok(`king  ${char} can stomp him with nothing in hand`, k.hp === KING.hp - 1, `hp ${k.hp}`);
  ok(`king  ...and bounces off rather than trading a body`, bounced);
}

/* ---- 8. his landing throws whoever is on the floor -------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  G.boxes.push({ x: a.x, y: a.y - 3, hits: 0, born: G.time, bumpAt: G.time, drop: "hari" });
  for (let i = 0; i < 4 && !G.king; i++) sim.step(sim.TICK);
  const k = G.king;
  let thrown = false;
  if (k) {
    for (let i = 0; i < 400 && !thrown; i++) {
      a.x = k.actor.x + 1.5;                 // stand right beside him
      sim.step(sim.TICK);
      if ((a.launchFor || 0) > 0) thrown = true;
    }
  }
  ok("king  standing next to a landing throws you", thrown);
}

/* ---- 9. the crown makes every landing a pound ------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  a.power = { type: "korona", until: G.time + 9, ammo: 0 };
  a.y -= 3; a.vy = 4; a.grounded = false;    // drop him onto the floor
  o.x = a.x + 1.5;
  let pounded = false;
  for (let i = 0; i < 90 && !pounded; i++) {
    o.x = a.x + 1.5;
    sim.step(sim.TICK);
    if ((o.launchFor || 0) > 0) pounded = true;
  }
  ok("crown every landing is a Ground Pound", pounded);
}

/* ---- 10. nothing follows you out of the grave ------------------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  a.reversedUntil = G.time + 5;
  a.frozenUntil = G.time + 5;
  const hpWas = a.hp;
  killPlayerViaStomp(G, o, a);
  ok("death clears Reverse", !(a.reversedUntil > G.time),
     `reversedUntil ${a.reversedUntil}`);
  ok("death clears Freeze", !(a.frozenUntil > G.time),
     `frozenUntil ${a.frozenUntil}`);
  ok("death still costs a heart", a.hp === hpWas - 1, `hp ${hpWas} -> ${a.hp}`);
}

/* ---- 11. a hit costs a heart and leaves you where you were ------------- */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const o = G.actors.find((q) => q.id === "p2");
  a.x = 14; a.y = 13; a.vx = 0; a.vy = 0;
  for (let i = 0; i < 20; i++) sim.step(sim.TICK);      // let him settle
  const where = { x: a.x, y: a.y };
  const hpWas = a.hp;
  killPlayerViaStomp(G, o, a);
  ok("hit   costs a heart", a.hp === hpWas - 1, `hp ${hpWas} -> ${a.hp}`);
  ok("hit   does NOT take you off the board", !a.dead && !a.respawn,
     `dead ${a.dead} respawn ${a.respawn}`);
  ok("hit   leaves you roughly where you were",
     Math.abs(a.x - where.x) < 4, `x ${where.x.toFixed(1)} -> ${a.x.toFixed(1)}`);
  ok("hit   shoves you, and marks it as a launch", (a.launchFor || 0) > 0);
  ok("hit   gives you a moment of grace", a.invulnUntil > sim.state.G.time);
}

/* ...but falling off the map still puts you back. */
{
  const G = world();
  const a = G.actors.find((q) => q.id === "p1");
  const hpWas = a.hp;
  a.y = G.level.h + 4;                                   // below the world
  for (let i = 0; i < 20 && !a.dead; i++) sim.step(sim.TICK);
  ok("fall  still takes you off the board", a.dead || a.y < G.level.h,
     `dead ${a.dead} y ${a.y.toFixed(1)}`);
  ok("fall  ...and still costs a heart", a.hp === hpWas - 1, `hp ${hpWas} -> ${a.hp}`);
}

/** Land `by` on `victim`'s head, which is the ordinary way anyone loses one. */
function killPlayerViaStomp(G, by, victim) {
  const hpWas = victim.hp;
  for (let i = 0; i < 40 && victim.hp === hpWas && !victim.dead; i++) {
    by.x = victim.x;
    by.y = victim.y - victim.h - 0.3;
    by.vy = 9;
    sim.step(sim.TICK);
  }
}

console.log(bad
  ? `\nBOX FAIL — ${bad} check(s)`
  : "\nBOX OK — a box opens three ways, and the King goes down in three");
process.exit(bad ? 1 : 0);
