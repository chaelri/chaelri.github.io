// Static configuration for Kain. Everything that a future me might want to
// tweak without reading the rest of the app lives here.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
};

// Same Cloud Run proxy every other app in this repo talks to.
export const PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

// RTDB root. Everything this app writes lives under it.
export const DB_ROOT = "kain";

// Both of us are in Manila, so "today" is always a Manila day — never the
// device's timezone, which drifts when travelling or when a phone is on UTC.
export const TZ = "Asia/Manila";

// WHO daily guidance (under 2,000 mg sodium, under 50 g free sugars) plus our
// shared 1,500 kcal target. Editable per person in Me; these are seeds only.
export const DEFAULT_GOALS = {
  kcal: 1500,
  sugar_g: 50,
  sodium_mg: 2000,
};

export const PEOPLE = [
  {
    id: "charlie",
    name: "Charlie",
    initial: "C",
    sex: "male",
    birth: "2000-02-24",
    heightCm: 161.3, // 5'3.5"
    weightKg: 64,
    accent: "amber",
    photo: "assets/people/charlie.jpg",
  },
  {
    id: "karla",
    name: "Karla",
    initial: "K",
    sex: "female",
    birth: "2000-02-07",
    heightCm: 152.4, // 5'0"
    weightKg: 47,
    accent: "rose",
    photo: "assets/people/karla.jpg",
  },
];

export function personById(id) {
  return PEOPLE.find((p) => p.id === id) || PEOPLE[0];
}

export function partnerOf(id) {
  return PEOPLE.find((p) => p.id !== id) || PEOPLE[1];
}

// The three things we track, in display order. `key` matches the entry fields
// and the goal keys, so every meter is rendered from this one list.
export const METRICS = [
  { key: "kcal", label: "Calories", unit: "kcal", short: "kcal", centre: "calories", icon: "local_fire_department", tone: "kcal", step: 10 },
  { key: "sugar_g", label: "Sugar", unit: "g", short: "sugar", centre: "grams of sugar", icon: "cookie", tone: "sugar", step: 1 },
  { key: "sodium_mg", label: "Sodium", unit: "mg", short: "sodium", centre: "mg of sodium", icon: "grain", tone: "sodium", step: 50 },
];

// Models are picked per task so a text-only call never pays image-model prices.
// Both are on the proxy's whitelist (see gemini-proxy/index.js MODEL_WHITELIST).
// The free-tier key gets deprioritised, so `gemini-3.5-flash` answers 503
// ("high demand") every so often. ai.js retries it once and then drops to the
// lite model rather than making Charlie re-shoot the plate.
export const MODELS = {
  vision: "gemini-3.5-flash", // photo → food breakdown, needs the better eyes
  visionFallback: "gemini-3.5-flash-lite",
  text: "gemini-3.1-flash-lite", // exercise parsing, text-only meals
};

// Image sent to Gemini. 768px is the largest edge that still fits Gemini's
// single-tile budget, so a photo costs roughly one tile no matter the phone.
export const VISION_MAX_EDGE = 768;
export const VISION_QUALITY = 0.72;

// Thumbnail kept in RTDB with the entry — a memory of what you ate, not an
// archive copy. 400 px at q0.62 is ~21 KB of JPEG, ~28 KB once base64'd:
// three meals a day for both of us is ~60 MB a year against a 1 GB free tier.
// The 768 px frame Gemini reads is never stored.
export const THUMB_MAX_EDGE = 400;
export const THUMB_QUALITY = 0.62;

// Steps → kcal. Walking burns roughly 0.5 kcal per kg per km and ~1,250 steps
// make a km, so kcal ≈ steps × kg × 0.0004. 10k steps ≈ 256 kcal at 64 kg.
export const KCAL_PER_STEP_PER_KG = 0.0004;

// Fallback MET values when the AI can't place an activity.
export const DEFAULT_MET = 4.0;
