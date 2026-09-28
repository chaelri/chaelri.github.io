// Every number that decides how TULAK! feels lives here.
//
// World units: one hex tile is ~1.7 wide, a critter is ~1.2 wide. The arena is
// a hex island of ARENA_RINGS rings round a centre tile, and it crumbles from
// the outside in — that is what keeps a round short without a timer anyone
// has to watch.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};
export const DB_ROOT = "tulak";

// Same STUN pair as bubududu-smash. Across two mobile carriers there is often
// no direct path at all; then net.js relays through Firebase, slower but it
// always works. A TURN key can be dropped into localStorage["tulak.turn"].
function extraIce() {
  try {
    const v = JSON.parse(localStorage.getItem("tulak.turn") || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...extraIce(),
];
export const P2P_TIMEOUT_MS = 6000;
export const INPUT_HZ = 30;       // guest -> host
export const INPUT_HZ_RELAY = 15;
export const SNAP_HZ = 20;        // host -> guest

export const TUNE = {
  hex: 1.0,            // tile circumradius
  arenaRings: 5,       // 91 tiles
  radius: 0.58,        // critter collision radius
  maxSpeed: 5.6,
  control: 9,          // how fast velocity chases the stick (1/s)
  stunControl: 3.2,    // ...while knocked back, so a hit carries ~2 units, not off the map
  airControl: 2.5,
  gravity: 26,
  fallOut: -7,         // y at which a faller is out

  dash: { speed: 15, time: 0.17, cd: 1.0 },
  bump: { walk: 2.0, dash: 8.5, stun: 0.42, restitution: 0.25 },

  // The island crumbles in waves: each wave shakes the outermost ring left,
  // then drops it. Later waves also punch a few random holes inside.
  firstWave: 11,
  waveEvery: 7.5,
  shakeTime: 1.3,
  holesPerWave: [0, 0, 2, 3, 3, 4],

  winsNeeded: 3,
  matchCap: 270,       // seconds; past this the next round result ends the match (leader wins, KOs break ties)
  countdown: 2.6,
  roundEndPause: 3.2,
};

// Stats are small multipliers on TUNE. Mass decides who wins a collision;
// speed is top speed. The ability is what actually tells them apart.
export const CRITTERS = {
  yhon: {
    name: "Yhon Yhon", mass: 1.12, speed: 0.92, ability: "pound", cd: 8,
    abilityName: "Ground Pound", blurb: "Jumps and slams — shockwave knocks everyone near him outward.",
  },
  axolotl: {
    name: "Axolotl", mass: 0.97, speed: 1.12, ability: "dive", cd: 5, dashCd: 0.7,
    abilityName: "Dive", blurb: "A long, fast dive — too slippery to knock while diving. Also the quickest dash to recharge.",
  },
  capybara: {
    name: "Capybara", mass: 1.04, speed: 0.95, ability: "float", cd: 10,
    abilityName: "Swim Ring", blurb: "Floats over holes for 1.8 s. Hit him while he floats and your hit bounces back at you.",
  },
  hedgehog: {
    name: "Hedgehog", mass: 1.06, speed: 1.0, ability: "roll", cd: 6,
    abilityName: "Spike Roll", blurb: "Curls up and rolls — steerable, and anything it hits goes flying. Walk into him and you bounce off.",
  },
};
export const CRITTER_IDS = Object.keys(CRITTERS);

export const ABILITY = {
  pound: { jump: 8.5, radius: 2.6, power: 8, stun: 0.45 },
  dive: { speed: 19, time: 0.34, mass: 4 },
  float: { time: 1.8, bounce: 6, reflect: 0.7, mass: 1.4 },
  roll: { speed: 11, time: 1.0, turn: 3.2, power: 12, stun: 0.5 },
  prickly: 5.5, // the hedgehog's passive: walk into him and you bounce off
};

// One colour per seat: the ring under each critter and their HUD chip.
export const SEATS = [
  { colour: "#2fb8ff", dark: "#0b5f8f" },
  { colour: "#ff5fa2", dark: "#8f1f55" },
  { colour: "#ffc928", dark: "#8a6400" },
  { colour: "#5fe07a", dark: "#1d7a33" },
];

// Where the critter GLBs live — the page reuses bubududu-smash/3d's models
// rather than keeping copies that could drift.
export const MODELS = new URL("../../bubududu-smash/3d/", import.meta.url);
