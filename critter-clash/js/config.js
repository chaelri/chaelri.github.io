// Every number that decides how CRITTER CLASH feels.
//
// PREP: spend coins in the shop (buy critters, merge duplicates up to 3
// stars, feed snacks), place your squad, maybe PUSTA!. FIGHT: they battle on
// their own, ultimates fire by themselves. Losing a round costs HP; first to
// 0 loses. You start with two critters and unlock the other two with trophies.
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
  prepTime: 25,         // shop + snacks + placement
  fightTime: 28,
  frenzy: 8,            // the last seconds of a fight: everyone attacks twice as fast
  roundEndPause: 3.2,
  hp: 20,               // each player's life; a lost round costs 1 + the winner's surviving stars
  maxRounds: 12,        // safety cap: the leader on HP wins
  radius: 0.55,         // how close two critters may stand
  jitter: 0.1,          // +/- share of random spread on every hit
};

// The shop, Merge Tactics style: small income, three offers, a reroll. Buying
// a critter you already have merges it up a star instead of adding another.
export const SHOP = {
  start: 6,             // coins in round 1
  income: 5,            // added every later round (unspent coins carry over)
  maxCoins: 12,
  critter: 3, snack: 2, reroll: 1,
  offers: 3,
  critterChance: 0.6,
  slots: [2, 3, 4],     // critters allowed on the board in rounds 1, 2, 3+
};
// Stars multiply HP and attack; 3 is the top.
export const STAR = { mult: [1, 1.7, 2.6], size: [1, 1.14, 1.28] };

// Filipino merienda. Feed one to a critter and it keeps it for the match.
// Feeding the same snack twice stacks.
export const SNACKS = {
  turon: { name: "Turon", blurb: "+35% attack" },
  halohalo: { name: "Halo-halo", blurb: "+40% HP" },
  taho: { name: "Taho", blurb: "ultimate charges 60% faster" },
  calamansi: { name: "Calamansi", blurb: "first 2 hits crit for triple" },
  balut: { name: "Balut", blurb: "gets back up once at 40% HP" },
};
export const SNACK_IDS = Object.keys(SNACKS);

// One random rule per round, shown the moment prep opens.
export const RULES = {
  ulan: { name: "Ulan", blurb: "Rain! Axolotl hits 50% harder" },
  fiesta: { name: "Fiesta", blurb: "Ultimates charge twice as fast" },
  brownout: { name: "Brownout", blurb: "Shooters see only half as far" },
  traffic: { name: "Traffic", blurb: "Everyone crawls for the first 4 s" },
  sale: { name: "Sale!", blurb: "Everything in the shop costs 1 less" },
  merienda: { name: "Merienda", blurb: "Everyone ate well: +25% HP this round" },
};

// One job each. `range` is in world units; melee is ~1.
export const CRITTERS = {
  yhon: {
    name: "Yhon Yhon", role: "Tank", blurb: "Big HP. Every third hit is a SLAM that hits everyone around him.",
    hp: 380, atk: 21, range: 1.15, cd: 1.15, speed: 1.4, slam: { every: 3, radius: 1.9, mult: 1.0 },
  },
  hedgehog: {
    name: "Hedgehog", role: "Striker", blurb: "Fast and sharp. Always goes for whoever is weakest.",
    hp: 240, atk: 24, range: 1.05, cd: 0.75, speed: 2.5,
  },
  axolotl: {
    name: "Axolotl", role: "Shooter", blurb: "Stays back and spits water balls from far away.",
    hp: 170, atk: 19, range: 4.2, cd: 1.05, speed: 1.3, shot: 9,
  },
  capybara: {
    name: "Capybara", role: "Healer", blurb: "Keeps the squad alive — heals whoever is hurt most.",
    hp: 215, atk: 10, range: 1.1, cd: 1.2, speed: 1.3, heal: { amount: 26, range: 4, cd: 1.8 },
  },
};
export const CRITTER_IDS = Object.keys(CRITTERS);

// The ultimate gauge. Every critter fills its own by dealing damage, taking
// it, or healing; at 100 the ultimate fires by itself (the healer holds it
// until someone is actually hurt). Charlie asked for them automatic.
export const ULT = {
  full: 100,
  dealt: 0.4,           // gauge per point of damage dealt
  taken: 0.25,          // ...per point taken
  healed: 0.45,         // ...per point healed
  yhon: { name: "Belly Flop", radius: 2.3, dmg: 40, stun: 0.8 },
  hedgehog: { name: "Spike Storm", dmg: 46 },
  axolotl: { name: "Tidal Wave", dmg: 40, push: 1.3 },
  capybara: { name: "Hot Spring", heal: 45, shield: 2.5 }, // shield halves damage taken
};

// Unlocks. You start with the first two; trophies open the rest.
export const UNLOCKS = [
  { id: "yhon", at: 0 },
  { id: "hedgehog", at: 0 },
  { id: "axolotl", at: 4 },
  { id: "capybara", at: 10 },
];
export const TROPHIES = { win: 3, loss: 1 };

// PUSTA!: during prep either player can stake the round — the HP it costs
// the loser doubles (both staking: x4). Once per player per round.
export const PUSTA = 2;

export const SIDE_COLOURS = { 1: "#2fb8ff", "-1": "#ff5fa2" };

// The critter GLBs and critters.json live in bubududu-smash/3d — reused, not copied.
export const MODELS = new URL("../../bubududu-smash/3d/", import.meta.url);
