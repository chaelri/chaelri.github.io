// Every number that decides how CRITTER CLASH feels.
//
// PREP: drag your critters onto your half of the board. FIGHT: they battle on
// their own. First to 3 rounds. You start with two critters and unlock the
// other two with trophies.
//
// World: the host's half is +z (bottom of the host's screen), the other half
// -z. "side" is +1 for seat 0 and -1 for seat 1.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};
export const DB_ROOT = "critterclash";

// Same STUN pair as bubududu-smash; across two mobile carriers net.js falls
// back to relaying through Firebase. A TURN key can go in localStorage["critterclash.turn"].
function extraIce() {
  try {
    const v = JSON.parse(localStorage.getItem("critterclash.turn") || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...extraIce(),
];
export const P2P_TIMEOUT_MS = 6000;
export const INPUT_HZ_RELAY = 15;
export const SNAP_HZ = 15;

export const BOARD = {
  cols: 4, rows: 3,     // per side; row 0 is the front line
  cell: 1.7,
  firstZ: 1.4,          // z of the front row (times side)
};

export const TUNE = {
  prepTime: 15,
  fightTime: 30,        // then the side with more HP left (as a share) takes it
  roundEndPause: 3,
  winsNeeded: 3,
  radius: 0.55,         // how close two critters may stand
  jitter: 0.1,          // +/- share of random spread on every hit
};

// One job each. `range` is in world units; melee is ~1.
export const CRITTERS = {
  yhon: {
    name: "Yhon Yhon", role: "Tank", blurb: "Big HP. Every third hit is a SLAM that hits everyone around him.",
    hp: 340, atk: 21, range: 1.15, cd: 1.15, speed: 1.4, slam: { every: 3, radius: 1.9, mult: 1.0 },
  },
  hedgehog: {
    name: "Hedgehog", role: "Striker", blurb: "Fast and sharp. Always goes for whoever is weakest.",
    hp: 200, atk: 24, range: 1.05, cd: 0.75, speed: 2.5,
  },
  axolotl: {
    name: "Axolotl", role: "Shooter", blurb: "Stays back and spits water balls from far away.",
    hp: 135, atk: 19, range: 4.2, cd: 1.05, speed: 1.3, shot: 9,
  },
  capybara: {
    name: "Capybara", role: "Healer", blurb: "Keeps the squad alive — heals whoever is hurt most.",
    hp: 190, atk: 10, range: 1.1, cd: 1.2, speed: 1.3, heal: { amount: 26, range: 4, cd: 1.8 },
  },
};
export const CRITTER_IDS = Object.keys(CRITTERS);

// Unlocks. You start with the first two; trophies open the rest.
export const UNLOCKS = [
  { id: "yhon", at: 0 },
  { id: "hedgehog", at: 0 },
  { id: "axolotl", at: 4 },
  { id: "capybara", at: 10 },
];
export const TROPHIES = { win: 3, loss: 1 };

export const SIDE_COLOURS = { 1: "#2fb8ff", "-1": "#ff5fa2" };

// The critter GLBs and critters.json live in bubududu-smash/3d — reused, not copied.
export const MODELS = new URL("../../bubududu-smash/3d/", import.meta.url);
