// State + Firebase RTDB. One module owns every read and write; views only ever
// call these functions and listen for the "change" event.
//
// Shape in the database:
//   kain/users/<who>/profile              { goals, weightKg, heightCm, flags… }
//   kain/users/<who>/days/<YYYY-MM-DD>/<entryId>   one meal or one workout
//
// There is no auth wall — anonymous sign-in only exists because the RTDB rules
// want *a* user. Who you are is a localStorage pick, exactly as Charlie asked.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  query,
  orderByKey,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  FIREBASE_CONFIG,
  DB_ROOT,
  DEFAULT_GOALS,
  PEOPLE,
  personById,
  partnerOf,
} from "./config.js";
import { dayKey, num, uid } from "./util.js";

const WHO_KEY = "kain.who";
const CACHE_KEY = (who) => `kain.cache.${who}`;

/* ------------------------------------------------------------- state --- */

export const state = {
  who: null, // "charlie" | "karla"
  ready: false, // first RTDB snapshot has landed
  online: false,
  profile: null, // my profile (goals + body)
  days: {}, // { "2026-09-05": { entryId: entry } }
  partner: { profile: null, days: {} },
};

const bus = new EventTarget();

export function onChange(fn) {
  bus.addEventListener("change", fn);
  return () => bus.removeEventListener("change", fn);
}

function emit(detail = {}) {
  bus.dispatchEvent(new CustomEvent("change", { detail }));
}

/* ------------------------------------------------------------ firebase -- */

let db = null;
let unsubs = [];

function detach() {
  unsubs.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
  unsubs = [];
}

export function defaultProfile(who) {
  const p = personById(who);
  return {
    goals: { ...DEFAULT_GOALS },
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    // Exercise gives the calorie budget back (a walk earns you dessert). Sugar
    // and sodium never move — you can't out-walk salt.
    exerciseAddsBudget: true,
    showPartner: true,
  };
}

export function normalizeProfile(who, raw) {
  const base = defaultProfile(who);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    goals: { ...base.goals, ...(raw.goals || {}) },
  };
}

export async function initStore() {
  state.who = localStorage.getItem(WHO_KEY);
  if (state.who) hydrateFromCache(state.who);

  const app = initializeApp(FIREBASE_CONFIG, "kain");
  db = getDatabase(app);
  const auth = getAuth(app);
  signInAnonymously(auth).catch((e) => console.warn("[kain] anon sign-in failed", e));

  onValue(ref(db, ".info/connected"), (snap) => {
    state.online = snap.val() === true;
    emit({ what: "connection" });
  });

  if (state.who) attach(state.who);
}

/** Point every listener at a person. Safe to call again on a user switch. */
function attach(who) {
  detach();
  const partner = partnerOf(who).id;

  unsubs.push(
    onValue(ref(db, `${DB_ROOT}/users/${who}/profile`), (snap) => {
      state.profile = normalizeProfile(who, snap.val());
      emit({ what: "profile" });
    })
  );

  // 180 day keys is a bit under half a year of history in memory — enough for
  // every chart in the app, small enough to stay instant.
  unsubs.push(
    onValue(query(ref(db, `${DB_ROOT}/users/${who}/days`), orderByKey(), limitToLast(180)), (snap) => {
      state.days = snap.val() || {};
      state.ready = true;
      saveCache(who);
      emit({ what: "days" });
    })
  );

  // The partner card only ever shows today, so a week is plenty.
  unsubs.push(
    onValue(ref(db, `${DB_ROOT}/users/${partner}/profile`), (snap) => {
      state.partner.profile = normalizeProfile(partner, snap.val());
      emit({ what: "partner" });
    })
  );
  unsubs.push(
    onValue(query(ref(db, `${DB_ROOT}/users/${partner}/days`), orderByKey(), limitToLast(7)), (snap) => {
      state.partner.days = snap.val() || {};
      emit({ what: "partner" });
    })
  );
}

/* -------------------------------------------------------------- cache --- */
/* RTDB has no disk persistence on the web, so a cold start would flash an empty
   dashboard for a second. Mirroring the last snapshot into localStorage lets
   the first paint be real data; Firebase overwrites it moments later. */

function saveCache(who) {
  try {
    const recent = {};
    Object.keys(state.days)
      .sort()
      .slice(-14)
      .forEach((k) => (recent[k] = state.days[k]));
    localStorage.setItem(
      CACHE_KEY(who),
      JSON.stringify({ days: recent, profile: state.profile })
    );
  } catch {}
}

function hydrateFromCache(who) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY(who)) || "null");
    if (!raw) {
      state.profile = defaultProfile(who);
      return;
    }
    state.days = raw.days || {};
    state.profile = normalizeProfile(who, raw.profile);
  } catch {
    state.profile = defaultProfile(who);
  }
}

/* ---------------------------------------------------------------- who --- */

export function setWho(who) {
  if (!PEOPLE.some((p) => p.id === who)) return;
  state.who = who;
  localStorage.setItem(WHO_KEY, who);
  state.days = {};
  state.ready = false;
  state.profile = defaultProfile(who);
  hydrateFromCache(who);
  if (db) attach(who);
  emit({ what: "who" });
}

export function me() {
  return personById(state.who);
}
export function partner() {
  return partnerOf(state.who);
}

/* ------------------------------------------------------------ entries --- */

export function entriesFor(date, days = state.days) {
  const bag = days?.[date] || {};
  return Object.values(bag)
    .filter(Boolean)
    .sort((a, b) => num(a.ts) - num(b.ts));
}

/** Totals for one day: what went in, what got burned, what's left. */
export function totalsFor(date, days = state.days, profile = state.profile) {
  const list = entriesFor(date, days);
  const goals = profile?.goals || DEFAULT_GOALS;
  const t = { kcal: 0, sugar_g: 0, sodium_mg: 0, burn: 0, meals: 0, workouts: 0 };

  for (const e of list) {
    if (e.kind === "exercise") {
      t.burn += num(e.burn);
      t.workouts++;
    } else {
      t.kcal += num(e.kcal);
      t.sugar_g += num(e.sugar_g);
      t.sodium_mg += num(e.sodium_mg);
      t.meals++;
    }
  }

  const addsBudget = profile?.exerciseAddsBudget !== false;
  const budget = {
    kcal: num(goals.kcal) + (addsBudget ? t.burn : 0),
    sugar_g: num(goals.sugar_g),
    sodium_mg: num(goals.sodium_mg),
  };

  return {
    ...t,
    goals,
    budget,
    left: {
      kcal: budget.kcal - t.kcal,
      sugar_g: budget.sugar_g - t.sugar_g,
      sodium_mg: budget.sodium_mg - t.sodium_mg,
    },
    logged: list.length > 0,
  };
}

/**
 * The last few distinct things you logged, newest first. Feeds the one-tap
 * repeat chips — we already know the exact breakdown of a past meal, so
 * repeating one costs no AI call at all.
 */
function recentByKind(wantExercise, limit) {
  const out = [];
  const seen = new Set();
  for (const date of Object.keys(state.days || {}).sort().reverse()) {
    for (const e of entriesFor(date).reverse()) {
      if ((e.kind === "exercise") !== wantExercise) continue;
      const key = (e.title || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...e, date });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function recentMeals(limit = 5) {
  return recentByKind(false, limit);
}

export function recentWorkouts(limit = 4) {
  return recentByKind(true, limit);
}

/** Local-first write: paint immediately, let Firebase confirm behind it. */
function localWrite(date, id, value) {
  if (!state.days[date]) state.days[date] = {};
  if (value === null) delete state.days[date][id];
  else state.days[date][id] = value;
  saveCache(state.who);
  emit({ what: "entry", date });
}

export async function addEntry(entry) {
  const date = entry.date || dayKey();
  const id = entry.id || uid();
  const value = { ...entry, id, date, ts: entry.ts || Date.now() };
  delete value.date; // the day key already carries the date
  localWrite(date, id, value);
  if (db) await set(ref(db, `${DB_ROOT}/users/${state.who}/days/${date}/${id}`), value);
  return { id, date, entry: value };
}

export async function updateEntry(date, id, patch) {
  const current = state.days?.[date]?.[id];
  if (current) localWrite(date, id, { ...current, ...patch });
  if (db) await update(ref(db, `${DB_ROOT}/users/${state.who}/days/${date}/${id}`), patch);
}

export async function deleteEntry(date, id) {
  localWrite(date, id, null);
  if (db) await remove(ref(db, `${DB_ROOT}/users/${state.who}/days/${date}/${id}`));
}

export async function saveProfile(patch) {
  state.profile = { ...state.profile, ...patch, goals: { ...state.profile.goals, ...(patch.goals || {}) } };
  emit({ what: "profile" });
  if (db) await update(ref(db, `${DB_ROOT}/users/${state.who}/profile`), state.profile);
}
