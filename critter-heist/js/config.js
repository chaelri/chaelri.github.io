// Every number that decides how CRITTER HEIST feels.
//
// One small island. Your base at the bottom, theirs at the top, a parade of
// critters walking across the middle. Buy critters, put them on pedestals
// where they earn coins, steal the other side's best ones. Richest base when
// the clock runs out wins.
//
// World: seat 0's base is at +z, seat 1's at -z ("side" = +1 / -1). x runs
// across the island, the parade walks along z = 0.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL: "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};
export const DB_ROOT = "critterheist";

// Same STUN pair as bubududu-smash; across two mobile carriers net.js falls
// back to relaying through Firebase. A TURN key can go in localStorage["critterheist.turn"].
function extraIce() {
  try {
    const v = JSON.parse(localStorage.getItem("critterheist.turn") || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...extraIce(),
];
export const P2P_TIMEOUT_MS = 6000;
export const INPUT_HZ = 30;
export const INPUT_HZ_RELAY = 15;
export const SNAP_HZ = 20;

export const MATCH = {
  time: 240,            // seconds
  startCoins: 30,
  events: [80, 160],    // seconds into the match when a surprise happens
  eventTime: 20,
};

export const WORLD = {
  halfX: 8.5,           // island half-width
  halfZ: 14,            // island half-length
  base: { halfX: 5, near: 8.6, far: 13.2, door: 1.3, wall: 0.35 }, // z from near..far (times side); door half-width
  // pedestals, written for side +1 (x, z); mirrored for the other base
  pedestals: [[-3.2, 10.2], [0, 10.2], [3.2, 10.2], [-3.2, 12.2], [0, 12.2], [3.2, 12.2]],
  parade: { z: 0, from: -10.5, to: 10.5, speed: 1.15, every: 2.1 },
};

export const PLAYER = {
  radius: 0.45,
  speed: 4.4,
  carrySlow: 0.85,      // walking speed while carrying
  reach: 1.35,          // how close you must be to buy / grab / place
  tagReach: 0.5,        // gap between owner and thief that counts as a touch
  stun: 1.1,            // a caught thief stands dazed this long
};

export const LOCK = { time: 15, recharge: 45 };

// Rarity: how often it shows up in the parade, what it costs, what it earns.
export const RARITY = {
  common: { name: "Common", weight: 74, price: 10, income: 1, colour: "#d9d0c8" },
  rare: { name: "Rare", weight: 18, price: 60, income: 4, colour: "#4fb8ff" },
  epic: { name: "Epic", weight: 6, price: 180, income: 10, colour: "#b77cff" },
  legendary: { name: "Legendary", weight: 2, price: 500, income: 28, colour: "#ffc928" },
};
export const RARITY_IDS = Object.keys(RARITY);
// A Rainbow "mutation" can land on any rarity.
export const RAINBOW = { chance: 1 / 40, price: 3, income: 5 };

// Species are looks, each with one small quirk.
export const SPECIES = {
  yhon: { name: "Yhon Yhon", quirk: "Heavy: can't be grabbed for 3 s after being placed.", guard: 3 },
  hedgehog: { name: "Hedgehog", quirk: "Spiky: whoever carries him walks even slower.", carrySlow: 0.68 },
  axolotl: { name: "Axolotl", quirk: "Slippery: wriggles free from a thief after 7 s and swims home.", escape: 7 },
  capybara: { name: "Capybara", quirk: "Friendly: critters next to him earn 20% more.", boost: 0.2 },
};
export const SPECIES_IDS = Object.keys(SPECIES);

export const EVENTS = {
  golden: { name: "Golden Hour", blurb: "The parade is all Rare or better!" },
  brownout: { name: "Brownout", blurb: "No door can lock!" },
  box: { name: "Mystery Box", blurb: "A box dropped in the middle. First one there opens it!" },
  ulan: { name: "Ulan", blurb: "Rain! Everyone slides on the wet grass." },
};

// Blue vs orange: pink was too close to Yhon Yhon, and a pink bean carrying
// him read as two beans.
export const SEAT_COLOURS = ["#2fb8ff", "#ff8a1f"];
export const TROPHIES = { win: 3, loss: 1 };

// The critter GLBs and critters.json live in bubududu-smash/3d — reused, not copied.
export const MODELS = new URL("../../bubududu-smash/3d/", import.meta.url);
