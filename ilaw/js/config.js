// Ilaw at Anino — static configuration.
//
// One screen (the MacBook) renders the whole game and owns the simulation.
// Two phones are dumb controllers: they stream input and nothing else. That
// split means there is no state to reconcile and no way for the two phones to
// disagree about anything.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};

// RTDB root. Only ever holds a live room's handshake — see net.js for why
// nothing about the game itself is written here.
export const DB_ROOT = "ilaw";

// Rooms are swept if they were created more than this long ago, so a tab left
// open overnight does not leave litter behind.
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

// Google's public STUN. Only needed so the peers can discover each other's
// candidates; on the same WiFi the connection that actually wins is a host
// candidate pair and no traffic leaves the house.
export const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

// If the data channel has not opened by now, fall back to relaying input
// through RTDB. Slower (Manila -> Singapore -> Manila) but it always works,
// including on a router with client isolation turned on.
export const P2P_TIMEOUT_MS = 6000;

// Input send rate from each phone. The sim runs at 60; 40 Hz of input with
// interpolation on the screen side is indistinguishable.
//
// The relay rate started at 15 Hz to be careful with RTDB quota, which was
// over-cautious: two players at 30 Hz is roughly 20 MB an hour against a
// 10 GB monthly allowance. The extra rate is worth it — on the relay path the
// send rate is most of what the beam's lag feels like.
export const INPUT_HZ = 40;
export const INPUT_HZ_RELAY = 30;

export const ROLES = {
  ilaw: {
    id: "ilaw",
    name: "Ilaw",
    en: "the light",
    blurb: "You hold the lantern. Turn your phone to sweep the beam.",
    accent: "#ffc36b",
  },
  anino: {
    id: "anino",
    name: "Anino",
    en: "the shadow",
    blurb: "You walk. You cannot see anything he is not pointing at.",
    accent: "#8fb4ff",
  },
};

/* ------------------------------------------------------------ tuning --- */
// World units are roughly metres. A level is 44 x 26 of them.

export const TUNING = {
  // Walker
  walkSpeed: 6.2, //  units/sec
  walkAccel: 34,
  walkRadius: 0.42,
  invulnMs: 1200,

  // Lantern
  beamRange: 17, // how far the cone reaches
  beamRangeFocused: 26, // ... while the light player holds focus
  beamHalfAngle: 0.46, // radians, ~53 degrees wide
  beamHalfAngleFocused: 0.17, // ~19 degrees — a spotlight
  focusLerp: 9, // how fast the beam narrows/widens
  lanternGlow: 3.2, // small always-on aura so the lantern is findable
  carryOffset: 0.0, // light sits on the walker when carried

  // Flare — a panic button. Lights everything nearby, then has to recharge.
  flareRadius: 11,
  flareMs: 620,
  flareCooldownMs: 9000,

  // Anino (the creatures)
  creatureSpeed: 1.65,
  creatureSpeedFar: 3.1, // they get bolder the further she strays from the lantern
  creatureFarDist: 14,
  creatureRadius: 0.55,
  creatureHp: 1.0,
  creatureBurnRate: 1.5, // hp/sec under direct light
  creatureHealRate: 0.32, // hp/sec regained in the dark
  creatureRespawnMs: 7000,

  // Falling
  teeterMs: 620, // grace period over a void before she actually falls

  hearts: 4, // it is a game for two people on a sofa, not a trial
};

// How bright the map stays once you have already seen it. Not a gameplay aid
// so much as a mercy — without it the walker has no sense of the room at all
// and it stops being a game and starts being a corridor. It reads cool rather
// than warm because the floor slate underneath it is cool: remembered space
// should not look like lit space.
export const MEMORY_ALPHA = 0.17;
