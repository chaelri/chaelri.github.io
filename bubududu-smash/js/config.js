// BUBU DUDU SMASH — a 2D platformer for two phones and one screen.
//
// Everything that decides how the game FEELS is in this file. Platformers live
// or die on about eight numbers, so they are all here, named, in one place.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};

export const DB_ROOT = "bubududu-smash";
/*
 * STUN tells a peer its own public address; that is enough on one WiFi and
 * often enough across two home connections. It is NOT enough between two
 * mobile carriers, where both sides sit behind carrier-grade NAT and no
 * direct path exists — then a TURN server has to relay the traffic.
 *
 * There is no longer a usable free TURN server without an account. The old
 * public openrelay credentials were tested and return no relay candidates at
 * all any more. So this is left as a slot: drop a free key in (Metered and
 * ExpressTURN both have free tiers big enough for two people) and the game
 * will use it. Until then, net.js falls back to relaying through Firebase,
 * which always works and is slower.
 *
 * Whatever is in localStorage under "bubududu-smash.turn" is merged in, so a
 * key can be added on the phone without touching the code:
 *
 *   localStorage["bubududu-smash.turn"] = JSON.stringify([
 *     { urls: "turn:...:80", username: "...", credential: "..." }
 *   ])
 */
function extraIce() {
  try {
    const v = JSON.parse(localStorage.getItem("bubududu-smash.turn") || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...extraIce(),
];
export const P2P_TIMEOUT_MS = 6000;
export const INPUT_HZ = 50;
export const INPUT_HZ_RELAY = 30;

// World units are tiles. A tile is a tile.
export const TILE = 1;

export const PLAYERS = [
  { id: "p1", name: "Charlie", colour: "#4cc2ff", dark: "#1b6f9e", accent: "#bfe9ff" },
  { id: "p2", name: "Karla", colour: "#ff7ba8", dark: "#a63f65", accent: "#ffd4e3" },
];

/* --------------------------------------------------------------- feel --- */
//
// These are tuned as a set. The jump is defined by how HIGH and how LONG it
// should be, and gravity is derived from that, rather than picking a gravity
// and discovering what jump you happen to get.

export const FEEL = {
  // A jump clears 3.4 tiles and takes 0.42s to reach the top.
  jumpHeight: 3.4,
  jumpRise: 0.42,

  // Falling is faster than rising. Every good platformer does this; a
  // symmetric jump arc feels floaty and wrong.
  fallMultiplier: 1.9,
  // ... except right at the apex, where gravity eases off for a moment. That
  // hang is most of what makes a jump feel readable in the air.
  apexThreshold: 2.6,
  apexMultiplier: 0.55,

  // One press is a full jump. Variable height (hold for higher) is the
  // standard platformer trick and it is genuinely more expressive, but it
  // means a tap gives you a third of a jump and you have to learn that before
  // the game is playable at all. Tap to jump, every time, no technique.
  shortHopMultiplier: 1,

  maxFall: 26,

  runSpeed: 9.2,
  groundAccel: 78,
  groundFriction: 62,
  airAccel: 46,
  airFriction: 14,

  // Grace windows. Without these a platformer feels like it is ignoring you.
  coyoteMs: 110, // jump still works just after walking off a ledge
  bufferMs: 130, // jump pressed just before landing still fires

  // Bouncing off the other player's head.
  stompBounce: 15.5,
  stompWindow: 0.45, // how far above them counts as a stomp

  // Standing on each other's head to reach high places (co-op).

  width: 0.7,
  height: 0.95,

  respawnMs: 900,

  // Health, shown as a bar. Every mode uses the same three — the arena used
  // to be one hit and out, which made a single unlucky bounce end the round
  // before either of you had done anything.
  hp: 3,
  // Lunas can take you PAST the three you start with, up to five. The extra
  // hearts are drawn gold and only exist once you have earned them, so a full
  // bar still reads as full rather than as "you are missing two".
  hpMax: 5,      // the ordinary ceiling; the Big Heart goes past it
  hurtInvulnMs: 1600,
};

/** Derived once, so the tuning above stays in units a human can picture. */
export const GRAVITY = (2 * FEEL.jumpHeight) / (FEEL.jumpRise * FEEL.jumpRise);
export const JUMP_VELOCITY = -GRAVITY * FEEL.jumpRise;

export const MODES = {
  tapakan: {
    id: "tapakan",
    name: "BUBU DUDU SMASH",
    en: "stomp",
    blurb: "One shrinking arena. Land on their head before they land on yours.",
  },
};

/* ------------------------------------------------------------ impact --- */
//
// Losing a heart used to be a character quietly disappearing. None of the
// below changes a single rule — it is all there so that a hit is FELT.
//
// Hit-stop is the important one. Freezing everything for a tenth of a second
// at the moment of contact is what fighting games use to make a blow land;
// without it no amount of shaking or flashing reads as weight.

export const HIT = {
  // A death is the only thing in a round that matters, so it gets the full
  // treatment: everything stops, the camera dives onto the body, and it all
  // resumes in slow motion while the impact frame plays out. The earlier
  // numbers were a quarter of these and it read as a stumble.
  freezeMs: 150,      // everything stops dead on contact
  slowMoMs: 620,      // then runs slow for a moment as it resumes
  slowMoRate: 0.22,
  shake: 44,          // and the screen is thrown about
  punch: 0.085,       // camera kicks in, then settles
  flashMs: 440,       // red bloom around the edges
  // How long the camera abandons its framing rule to sit on the body. Must
  // outlast the slow motion, or normal speed returns to a close-up.
  killCamMs: 1300,
  // The one that wins the match doesn't get handed back. The camera rides in
  // and STAYS in on the body while the result comes up, rather than pulling
  // out to a wide shot of nothing and freezing on a banner.
  winCamMs: 1400,
  winCamZoom: 1.25,
  // ...and then lets go. Holding indefinitely parked the camera on the spot
  // where the loser died: they are dead so they are not drawn, the winner has
  // walked out of a shot that is zoomed 25% in, and the match-over screen is
  // an empty patch of ground with both characters apparently gone.
  winCamHoldMs: 2200,
  winCamReleaseMs: 1400,

  /* The blow that takes the MATCH does not stop dead.
   *
   * Hit-stop is right for an ordinary hit: a tenth of a second of nothing is
   * what makes a blow land. On the last one it is wrong — the camera drives
   * in on a world that has already stopped, so there is nothing to watch it
   * arrive at. This one skips the freeze entirely and runs long and slow
   * instead, and the round is not called until it has played out, so the
   * burst, the debris and the falling heart all drift through the close-up.
   */
  winFreezeMs: 0,
  // Slower than any other moment in the game, and for longer. At 0.10 the
  // two seconds of wall clock are a fifth of a second of world time, so the
  // body barely drifts while the camera pushes into it — which is the point.
  winSlowMoMs: 2200,
  winSlowRate: 0.10,
};

export const ROUNDS_TO_WIN = 3;

/* ----------------------------------------------------------- powerups --- */
//
// Versus only. Co-op has nothing to win off each other, so a power-up there
// would just be a thing one of you picks up and the other watches.

/* The `id` of each one stays as it is — it is a key in the wire format, in
 * localStorage and in the tilemap, and renaming those would break a room that
 * is mid-match for no gain. Only the NAME, which is the part anybody sees,
 * is English. */
export const POWERUPS = {
  laki: {
    id: "laki", name: "Big", desc: "Twice the size. Stomps bounce off you.", en: "big",
    ms: 9000, colour: "#ffc23f",
    // Big enough to matter, not so big you cannot fit through the level.
    scale: 1.55, jump: 1.1, speed: 0.92,
  },
  baril: {
    id: "baril", name: "Gun", desc: "Six shots. Tap the gun to fire.", en: "gun",
    ammo: 6, colour: "#63d98a",
    /* `fires` means "the fire control does something while you hold this".
     *
     * It exists because four separate places used to test `type === "baril"
     * || type === "suntok"` by name — the pad's fire button, its icon, the
     * ammo chip on the card, and the cleanup that drops a spent weapon. Add a
     * fifth weapon and you have to find all four, and if you miss the first
     * one the weapon simply cannot be fired on a phone. Which is exactly what
     * happened to the Bazooka: it worked on the laptop, where the key path
     * asks the rules rather than the name, and the controller button stayed
     * dead. Charlie found it by asking how you even fire the thing. */
    fires: true,
  },
  bituin: {
    id: "bituin", name: "Star", desc: "Touch them and they are out.", en: "star",
    ms: 7000, colour: "#ff7be8",
    // The flag the rules actually ask about — see isStar(). It is on the
    // Star because the Star is what it describes, and forgetting to put it
    // here is what made the Star stop working the moment the fifteen
    // by-name checks were replaced with one by-behaviour check.
    star: true,
  },
};

export const POWERUPS_EXTRA = {
  lunas: {
    // Red, like a heart. It was green — the colour every other game uses for
    // healing — and the result was an orb, a toast and a chip that all said
    // "health" in a colour the hearts above your head never wear. One thing,
    // one colour.
    id: "lunas", name: "Heal", desc: "One heart back — or a spare, past three.", en: "heal",
    ms: 0, colour: "#ff4d6d", heal: 1,
  },
  /* Only ever out of a box, both of these — they are NOT in POWER_ORDER, so
   * the ordinary spawner will never offer them. A box is a thing you have to
   * work for, and what is in it has to be worth more than what is lying on
   * the floor for free. */
  puso: {
    id: "puso", name: "Big Heart", desc: "Nine hearts. All of them, right now.", en: "big heart",
    ms: 0, colour: "#ff2d5a",
    /* Not a heal — a SETTING.
     *
     * It was +3, capped at the Diwata's six, which meant a player on four got
     * two and the rarest pickup in the game was worth less than two Heals off
     * the floor. Charlie: "instead na + 3 hearts, just give it total of 9
     * hearts". So whoever opens it is simply on nine, from wherever they
     * were — a comeback you cannot grind for, which is the point of a box.
     *
     * Nine is three rows of three, which is why the heart bars had to learn
     * to wrap at all; see drawHearts and the card. */
    set: 9,
  },
  bazuka: {
    id: "bazuka", name: "Bazooka", desc: "One shell. It finds them, and it ends it.",
    en: "bazooka",
    // ONE shell, and it does not miss — it steers. Two of these would be the
    // whole round, and a homing one-shot you can fire twice is not a reward,
    // it is a result.
    ammo: 1, colour: "#ff8a3d",
    fires: true,
    /* Fast, and it still steers.
     *
     * It was 15 — slower than a bullet, on the theory that you should see it
     * coming. In play that read as a lobbed brick rather than a rocket, and
     * Charlie wanted "mas mabilis parang bazooka talaga". 26 is a shade past
     * a bullet; the turn rate is what keeps it dodgeable, not the speed, and
     * the warning is now the noise and the smoke trail rather than the wait.
     */
    speed: 26,
    turn: 5.4,        // radians a second it may steer
    lifeMs: 2600,
    /* ...and it does not need to touch you.
     *
     * "parang BOOM SABOGG ... its like really OP." It detonates on whatever
     * it reaches first and takes everything inside the blast with it, which
     * is the whole reason it is one shell out of one box in three. */
    blast: 4.2,       // tiles — lethal to anything inside it
    boomMs: 700,      // how long the fireball is drawn for
    shake: 46,
    freezeMs: 130,
    breaks: 3,        // tiles of '=' ledge it takes out either side
  },
  /* King Yhon Yhon's crown. Only ever from taking him down.
   *
   * A real power-up, not a set of loose fields on the actor. It started as
   * the latter — a deadline plus a bigger body — and Charlie's verdict was
   * "medyo weird yung power na narereceive". It was: the untouchability rode
   * on `invulnUntil`, which is the HIT-GRACE field, so the reward for beating
   * a boss made you flash exactly like someone who had just been hurt and put
   * a "safe" chip on your card. It did not kill on contact the way a Star
   * does. And the toast said "Star", because that is the pickup it borrowed.
   *
   * As a power it gets the chip, the timer, its own name, the star's own
   * treatment everywhere the rules ask `isStar`, and Big's size — which is
   * what was asked for: "a combination of Star and Big powerup but bigger". */
  korona: {
    id: "korona", name: "Crown", desc: "Star and Big at once. Every landing shakes the ground.",
    en: "crown",
    ms: 12000, colour: "#ffd24a",
    scale: 1.9,        // bigger than Big, which is 1.55
    jump: 1.15, speed: 1.0,
    star: true,        // untouchable, and out on contact — see isStar()
  },
  bilis: {
    id: "bilis", name: "Speed", desc: "Much quicker on your feet.", en: "speed",
    ms: 8000, colour: "#4cc2ff", speed: 1.38, jump: 1.04,
  },
  yelo: {
    id: "yelo", name: "Freeze", desc: "You froze them solid.", en: "freeze",
    // Acts on the OTHER player, so it ends the moment it is picked up.
    // 1.7s was long enough to notice and too short to use — by the time you
    // had crossed to them it had thawed. Three and a bit is a real window.
    ms: 0, colour: "#a9e8ff", freezeMs: 3200,
  },

  baliktad: {
    id: "baliktad", name: "Reverse", desc: "Their left and right are swapped.", en: "reversed",
    ms: 0, colour: "#ff9c3f", reverseMs: 5000,
  },
  // Melee. Rides the same fire control as the gun, so it needs no new button
  // and no new key — what changes is the range and the fact that you have to
  // be brave enough to walk up to them.
  suntok: {
    id: "suntok", name: "One Punch", desc: "One punch. It ends it.", en: "punch",
    ms: 0, colour: "#ff6b57",
    // ONE. It was three when the fist was the hitbox and each swing had to be
    // thrown from exactly arm's length — three chances at a coin toss. Now
    // that it throws a blast you can miss with, one is a real decision, and
    // picking up a second still stacks to two.
    punches: 1,
    fires: true,
    windupMs: 90,     // fist pulls back before it goes out
    activeMs: 200,    // and is dangerous for this long
    reach: 2.3,       // tiles in front of the body

    /* The shockwave.
     *
     * Three swings that each had to be thrown from exactly arm's length were
     * a coin toss to land, and missing with one of three is most of the
     * power-up gone. So the fist is no longer the hitbox: it is the CENTRE of
     * a blast that carries past it, in front and a little to the sides. The
     * punch is still directional and still has to be aimed — you cannot hit
     * someone behind you — but being half a tile out no longer whiffs it.
     */
    blastRadius: 2.6,   // tiles from the fist, in every forward direction
    blastBehind: 0.7,   // ...and this far back past your own shoulder
    blastMs: 420,       // how long the ring is drawn expanding
    knockback: 21,      // what it does to them if they survive it (they do not)
    cooldownMs: 420,
  },
};

/* -------------------------------------------------------- the abilities --- */
//
// One per character, on the fire button.
//
// That button already exists and is dead weight for most of a round — it does
// nothing at all unless you are holding the gun or One Punch, which is maybe a
// fifth of the time. So it carries your character's move the rest of the time,
// and a power-up takes it over while you have one. No new button, nothing new
// to reach for on a phone, and the button is always worth pressing.
//
// They are POSITION, never stats. That is the whole design rule here: the
// power-ups already own the stats lane — Bilis makes you faster, Laki makes
// you bigger — and an ability that also made you faster would make Bilis
// boring. These move you somewhere. And none of them kills: the kill in this
// game is landing on a head, and One Punch is the one thing that gets to
// shortcut it. An ability makes the kill POSSIBLE, it does not do it for you.
//
// Each answers one of the three ways this arena kills you: landed on from
// above, cornered against the shrinking edge, or dropped off it.
//
// They come in CHARGES, not one at a time. The cooldown is the same as it
// ever was; what changed is where it goes — into a stack of up to three
// rather than into a single yes-or-no. Nothing is ever used up for good, so
// there is no rationing and no counting: play without it for a few seconds
// and you are holding three, which you may spend one after another. That is
// the whole of it — a decision about WHEN, not about whether you can afford
// to. Charlie: "pwede nila istack, ipunin."
export const SKILL_CHARGES = 3;

export const ABILITY = {
  // Bubu — reach and recovery. Best at getting above someone, and the only
  // thing in the game that saves you once you are off the edge.
  hop: {
    id: "hop", name: "Air Hop", mark: "hop",
    desc: "One more jump, in mid-air.",
    colour: "#7fd4ff",
    /* No limit but the stack. It used to be one per airtime as well, which
     * meant a Bubu holding three could still only ever use one of them
     * before touching the floor — the charges were real and unspendable.
     * Three in a row IS flight, briefly, and that is the point of banking
     * them: Charlie asked for "parang lumilipad na rin si Bubu". The wait
     * afterwards is what stops it being flight for good. */
    cooldownMs: 700,
    rise: 0.92,        // of a standing jump — a save, not a better jump
  },

  // Dudu — space. Crosses what the shrinking floor opens up, and the only
  // answer to being cornered.
  dash: {
    id: "dash", name: "Dash", mark: "dash",
    desc: "A hard burst, the way you are facing.",
    colour: "#ffb84d",
    cooldownMs: 2200,
    /* About two and a half times a run, held long enough to actually GO
     * somewhere: four and a half tiles, which is a gap the shrinking floor
     * can open and a distance you cannot walk in the time you have. At 19
     * over 150ms it covered 2.8 and read as a shove rather than a dash. */
    speed: 24,         // tiles a second
    ms: 185,           // held for this long, then ordinary friction takes it
    // Off the ground it also kills your fall for the moment it lasts, so it
    // reads as a leap rather than as a shove.
    hang: 0.25,
  },

  // Yhon — the kill. He is the slowest thing on the field and this is why
  // that is survivable: from above, he arrives before you can leave.
  pound: {
    id: "pound", name: "Ground Pound", mark: "pound",
    desc: "Drop like a stone. Lands hard.",
    colour: "#ff9c3f",
    cooldownMs: 1600,
    // Terminal velocity is 26 and this is a shade past it. It was 34, which
    // is a third faster again — and every tick the two sides spend
    // disagreeing about a pound costs a third more ground at that speed.
    speed: 27,         // straight down, a shade past terminal velocity
    /* Landing shoves anyone nearby away and up, and the shove is worth what
     * the FALL was worth.
     *
     * A fixed blast made the move the same whether he dropped off a step or
     * off the top of the arena, which throws away the one decision in it:
     * how long to climb before committing. Measured from where the dive
     * began, so getting height first is what makes it hurt.
     *
     * It still does not take a heart — the kill is the stomp, and this is
     * what sets the stomp up. What it takes is their footing. */
    /* Widened hard on 2026-09-23. The first numbers (3.0 / 6.2 off a nine
     * tile dive) meant Yhon had to land almost ON somebody, which made the
     * one move he commits a whole descent to feel like a tap. It is an
     * EARTHQUAKE — it should own the platform he lands on and reach the one
     * next door off a real drop. `fallFull` came down with it so a sensible
     * jump-and-drop already gets most of the range; you should not have to
     * climb to the ceiling to feel it. */
    blast: 4.5,        // tiles from where he lands, off a short drop
    blastFar: 9.5,     // ...and off a long one
    fallFull: 7,       // tiles of dive that counts as long
    knockback: 21,
    upward: 14,
    launchMs: 380,     // no steering out of it
    // How long the ground remembers. Cosmetic, and replicated, so both
    // phones see the same crater.
    quakeMs: 760,
    crackMs: 1200,
    // You cannot steer out of it. Committing is the whole character.
    lockMs: 90,

    /* Pressing it with both feet on the floor hops him up first.
     *
     * Otherwise a standing pound is a dive of zero tiles: minimum blast, no
     * travel, nothing to see. Charlie's words — "if i didnt jump when using
     * ability of yhon, it will auto mini jump to have the same impact". The
     * rise is measured in jump velocities, and the dive begins at the apex
     * with `poundFrom` reset there, so the blast is worth the hop and not
     * worth the standing still that preceded it. */
    hop: 0.86,         // of a full jump

    /* What a landing takes out of a platform.
     *
     * Only ever '=' — the thin ledges. Punching a hole in the '#' ground
     * would cut the arena in half and strand whoever is on the far side,
     * which the shrink already does on its own schedule and does not need
     * help with. Tiles either side of the impact, scaled by the fall, and
     * only if he actually landed ON a ledge. */
    breaks: 1.6,       // tiles either side off a short drop
    breaksFar: 4.0,    // ...and off a long one
  },
};

/* ---------------------------------------------------------- the fairy --- */
//
// Fairy Yhon Yhon. She does not do anything to the other player and she does
// not do anything quickly — she follows you around and puts a heart back
// every few seconds, twice, and then she goes.
//
// The delay is the whole character. An instant two hearts is a number going
// up; two hearts arriving while you are still in the fight is something you
// play around, and it means picking her up when you are hurt is worth more
// than hoarding her. She will not spend a heal on someone already full — she
// waits, so she is never wasted.
export const DIWATA = {
  name: "Fairy Yhon",
  colour: "#ffc2dd",
  heals: 2,
  everyMs: 3000,
  // She goes one past what Lunas can reach. Lunas is lying on the floor for
  // anyone to walk over; she is one of four things ten coins might buy, so
  // she is allowed to leave you somewhere a pickup cannot.
  hpMax: 6,
  firstMs: 1200,      // the first one comes a little sooner than the rest
  leaveMs: 1100,      // flutter up and fade after the last heal
  scale: 0.46,        // of a normal character
  orbit: 1.15,        // tiles out from the player she rides at

  /* --- the wild one ------------------------------------------------------
   * Ten coins is a long way to go for her, and she was the only one of the
   * four rewards you could never simply MEET. So she also turns up on her
   * own, drifting around the arena, and whoever touches her gets her.
   * She does not sit on a platform like a power-up — she flies, which is
   * what makes her worth chasing.
   */
  wildFirstMs: 12000,
  wildEveryMs: 26000,
  wildLifeMs: 15000,     // then she wanders off
  wildSpeed: 3.4,        // tiles a second, drifting between perches
  wildHoverMs: [700, 1800],
  wildReach: [0.9, 2.4], // tiles above the ground she hovers — jumpable, always
};

/* ----------------------------------------------------------- the squad --- */
//
// Three little Bubus in red caps. They are NOT a power-up: they walk onto the
// field and stand about in a huddle exactly the way Dudu does, and whoever
// reaches them first takes them. A pickup orb made them feel like an item,
// and they are meant to feel like three more characters arriving.
export const SQUAD = {
  everyMs: 21000,
  firstMs: 13000,
  /* Two, not three.
   *
   * Half a heart each was already a nerf from a whole one, and it was still
   * the strongest thing ten coins can buy — three of them all connecting is
   * a heart and a half, which is half the bar from one reward. Charlie:
   * "instead na 3 gawin na nating 2, sobrang OP talaga e". Two is one whole
   * heart if both land, which is worth chasing coins for and is not the
   * round. */
  count: 2,
  colour: "#8fd8ff",
  scale: 0.62,
  spread: 1.1,        // tiles between them, waiting and on release
  waitMs: 13000,      // how long they hang around to be collected
  lifeMs: 9000,       // and how long they hunt once someone has

  /* Half a heart each, not a whole one.
   *
   * Three of them, each taking a full heart, is the entire bar — one reward
   * could end a round outright, and there was nothing to be done about it
   * once they were released. At a half each the squad is worth one and a
   * half hearts if every one of them connects, which is still the strongest
   * thing ten coins can buy and is no longer the whole game.
   *
   * This is the first thing in here that deals a fraction, and everything
   * downstream of `hp` had to learn to count in halves for it — see
   * killPlayer's `damage`, and the hearts in render.js and panel.js. */
  damage: 0.5,

  // Quick and jumpy, because they are small and there are three of them —
  // one that could also out-muscle you would be the whole round.
  stats: { jump: 1.12, speed: 1.12, accel: 1.3, stride: 0.8 },

  // Unclaimed they mill about on the spot rather than pacing, so they read as
  // waiting for someone rather than as three loose enemies.
  idleSpeedMul: 0.3,
  idleRange: 1.4,     // tiles either side of where they landed
};
Object.assign(POWERUPS, POWERUPS_EXTRA);

// Drawn at random rather than in strict rotation — seven in a fixed order
// means waiting most of a round to see a particular one. Never the same twice
// running, so you do not get the same pickup back to back.
/* The symbol each power-up wears lives in marks.js now, keyed by the same id
 * — it is a drawn path rather than a character, so the orb on the platform,
 * the chip in the panel and the note beside the player are all the same shape
 * on every machine. */

/* ------------------------------------------------------------- boxes --- */
/**
 * The mystery box.
 *
 * It hangs in the air and you break it by jumping into it from underneath —
 * three bumps, or one if you are BIG, or nothing at all if Yhon lands a
 * Ground Pound on it. That spread is the point: every character has a way in,
 * and each one's way is the thing that character already does.
 *
 * What comes out is deliberately better than anything on the floor, because
 * a box costs you three jumps spent standing still underneath it while
 * somebody else is trying to land on your head.
 */
export const BOX = {
  firstMs: 11000,
  everyMs: 19000,
  max: 2,              // never more than this hanging about at once
  hits: 3,             // head-bumps to break it
  // What a BIG player's bump is worth. Equal to `hits`, so it is exactly one.
  bigHits: 3,
  colour: "#ffc83d",
  // A bit bigger than it was as a crate: it is a target you are meant to
  // want to hit, and it now has a face worth reading.
  w: 1.35, h: 1.35,    // tiles
  bumpMs: 240,         // how long it is seen to jump when struck
  bob: 0.14,           // how far it drifts up and down, in tiles
  /* Weighted, and the King is the rare one — he is an event, not a pickup,
   * and an event that turns up every other box stops being one. */
  drops: [
    { id: "puso",   weight: 4 },
    { id: "bazuka", weight: 3 },
    { id: "hari",   weight: 2 },
  ],
};

/**
 * King Yhon Yhon.
 *
 * The rare thing in a box, and not a pickup at all — an event. He lands in
 * the middle of the arena with three hearts, jumps on the spot, and every
 * landing shakes the ground hard enough to throw whoever is standing on it.
 * He is hostile to everybody, Yhon included, so a Yhon who opened the box
 * gets no special treatment from his own king.
 *
 * Everything hurts him, and everything hurts him the SAME: one heart. Star,
 * gun, One Punch, a Ground Pound. That is deliberate — One Punch ends a
 * player outright, and a boss it also ends outright is not a boss, it is a
 * pickup with extra steps. Three hits from anything is three real openings
 * you have to survive making.
 *
 * Whoever lands the last one takes the crown: Star and Big at once, both
 * bigger than either is on its own, and every jump becomes a pound.
 */
export const KING = {
  hp: 3,
  colour: "#ffd24a",
  crown: "#ffe27a",
  scale: 2.9,              // times a normal body
  jumpEveryMs: 1500,       // how often he leaves the floor
  jumpVel: 17,             // tiles a second, up
  // What a landing does. The same shape as a player's Ground Pound, harder:
  // he is the size of three of them.
  blast: 7.5,              // tiles
  knockback: 24,
  upward: 16,
  launchMs: 420,
  quakeMs: 900,
  hurtInvulnMs: 700,       // so one gun burst cannot take all three hearts
  /* What taking a heart off him FEELS like.
   *
   * It was a white ellipse laid over him and a shake, which Charlie called
   * "panget ... di lang white eme". A white wash is what this game already
   * uses for a player's grace period — the least eventful thing that happens
   * to anybody — so the biggest moment in the round wore the costume of the
   * smallest.
   *
   * What follows is every tool the game has for weight, aimed at one moment:
   * the world stops, he is knocked back off his feet, a heart comes off him
   * and falls, the ground cracks under him, and he goes deep red rather than
   * pale. The last heart gets all of it doubled and a beat of slow motion,
   * because that one ends the fight. */
  hitFreezeMs: 110,        // everything stops, briefly — a death gets 150
  hitShake: 30,
  hitPunch: 0.07,
  hitRecoil: 7.5,          // tiles a second, backwards off the blow
  hitLift: 6,              // ...and up, so his feet leave the floor
  hitSquashMs: 420,        // how long the body stays deformed
  deathSlowMs: 520,        // the last heart slows the world down
  deathSlowRate: 0.3,
  lifeMs: 45000,           // he leaves if nobody can finish him
  /* What the crown does on a landing. The rest of it — the size, the star,
   * the clock — is an ordinary power-up now: POWERUPS_EXTRA.korona. */
  reward: {
    poundBlast: 5.0,
    knockback: 19,
    upward: 13,
  },
};

/* Every power-up there is, in one place.
 *
 * POWERUPS and POWERUPS_EXTRA are two objects for historical reasons, and
 * anything that wants to look one up by name had to know which half it was
 * in — or, more often, guess. */
export const ALL_POWERS = { ...POWERUPS, ...POWERUPS_EXTRA };

export const POWER_ORDER = [
  "laki", "baril", "bituin", "bilis", "yelo", "baliktad", "lunas",
  "suntok",
];

/* ------------------------------------------------------------- helper --- */
// Dudu wanders in from the edge every so often and hands out whatever you
// need most. He is not a player — he is the thing that stops a bad round
// being unrecoverable.
export const HELPER = {
  everyMs: 15000,
  firstMs: 9000,
  // Before anyone has reached him he pootles about at a fraction of his real
  // speed, stopping now and then to look lost. Once he is on your side he
  // moves at full pace — the slowness is only there to say "not yet".
  idleSpeedMul: 0.28,
  idlePauseChance: 0.5,   // per second
  idlePauseMs: [400, 1200],
  idleTurnChance: 0.35,   // per second, changes his mind about direction

  stayMs: 14000,   // how long he waits around to be met
  huntMs: 15000,   // and how long he hunts once you have reached him

  // His fifteen seconds are fifteen seconds of ACTUAL hunting. A stomp does
  // nothing to someone who is flashing, starred or shielded, so while they are
  // untouchable his clock stops and he shadows them instead of wasting the
  // window bouncing off. He is close to a sure kill otherwise — immunity is
  // meant to be the one answer to him, not a way to run the timer down.
  waitTiles: 4.2,        // how close he shadows while waiting them out
  maxStayMs: 45000,      // hard ceiling, so chained immunity can't keep him forever

  // He runs the same physics as a player, with his own feel: a little faster
  // and a little springier, because a hunter you can simply outrun is not a
  // hunter. Not so much that he is unfair — you can still lose him.
  stats: { jump: 1.06, speed: 1.05, accel: 1.15, stride: 1.05 },

  jumpCooldownMs: 320,

  // He roams on his own and only commits when the target is actually near.
  // Steering straight at them from anywhere on the map made him read as a
  // guided missile rather than a character.
  detectTiles: 11,      // inside this, he comes for you
  giveUpTiles: 16,      // outside this, he goes back to roaming
  wanderJumpChance: 0.8, // per second, while roaming

  // Closing is not the same as attacking. A stomp only lands while FALLING
  // onto a head, so once he is alongside he has to hop to get above them —
  // otherwise he just stands there next to you, which is what he did.
  pounceTiles: 2.6,     // this close and level with them, he jumps
  pounceLevel: 1.3,     // ...provided they are at roughly his height
  airDeadzone: 0.1,     // tighter steering in the air, to land ON them
  groundDeadzone: 0.4,  // looser on the ground, so he does not jitter

  // He has to aim where they WILL be. Jumping at where they are means landing
  // behind a runner every time — he is only marginally faster than they are,
  // so the whole margin goes on the lead.
  leadGround: 0.40,     // seconds of lead while closing
  leadAir: 0.22,        // and while committed to the arc

  w: 0.8,
  h: 0.95,

  // He is not always what he looks like. Rolled at the MOMENT OF CONTACT,
  // not at spawn — there is no telling a good one from a bad one until you
  // have already touched him, which is the entire point.
  //
  // A coin flip. At one in ten he was a rare surprise you would forget about
  // between sightings; at even odds, deciding whether to run at him is a real
  // decision every single time, which is the whole reason he exists.
  betrayChance: 0.5,
};

/* ----------------------------------------------------------- the coins --- */
//
// Loose change on the platforms. Ten of them buys one of the four big things
// in the game, picked at random — so there is always something to do with a
// quiet moment, and the reward is worth crossing the arena for.
export const COINS = {
  onField: 7,         // kept topped up to this many
  atOnce: 5,          // and this many are on the floor from the first second
  respawnMs: 2600,    // how long before a collected one is replaced
  perReward: 10,
  colour: "#ffc83d",
  radius: 0.34,

  // What ten coins buys. Even odds, and none of them is a dud.
  rewards: ["diwata", "dudu", "tatlo", "suntok"],
};

/* ---------------------------------------------------------- Bad Dudu --- */
//
// What Dudu turns into, one time in ten, the moment you reach him.
//
// This is deliberately NOT a dodging game. You already made the only decision
// that mattered when you chose to run at him, and asking you to react a
// second time to something you could not have predicted would just feel like
// being cheated twice. So once he has you, he has you: you are held for the
// wind-up and then thrown, and the wind-up exists to be WATCHED rather than
// escaped.
//
// The throw does not kill. It throws you at the nearer edge and the map does
// the rest, which is why it is survivable from the middle of a wide floor and
// not from anywhere near a drop.
export const BAD_HELPER = {
  transformMs: 420,     // the reveal: he shudders and goes purple
  holdMs: 620,          // held off the ground while he loads up
  launchVx: 34,
  launchVy: -12,
  launchFor: 620,       // ms with no steering and no jump after release
};
export const POWER_SPAWN_MS = 6500;   // gap between pickups appearing
export const POWER_FIRST_MS = 3000;   // first one, after the countdown

export const SHOT_SPEED = 24;
export const SHOT_LIFE = 1.5;
export const SHOT_COOLDOWN_MS = 240;
export const SHOT_RADIUS = 0.22;

/* --------------------------------------------------------------- stacks --- */
/**
 * Getting something you already have does not throw the first one away.
 *
 * Two shapes, because the skills are two shapes: anything with a clock adds
 * its full length to whatever is left, and anything you own a number of adds
 * more of them. The caps are the whole reason this is a table and not four
 * numbers buried in the rules — without them a player sitting on a coin
 * platform ends the round with a permanent Dudu and nine Bubus, and the other
 * one simply cannot play.
 */
export const STACK = {
  maxDurationMul: 3,    // of that skill's own base duration, total
  maxMinis: 9,          // three squads' worth on the field at once
  maxFairyHeals: 6,     // three Diwatas' worth of heals queued
  maxAmmoMul: 3,        // of the base magazine
  maxHelpers: 4,        // Dudus on the field at once, wild and owned together
};
