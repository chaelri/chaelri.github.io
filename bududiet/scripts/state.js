export const state = {
  user: null, // { email, name, photo }
  activeTab: "home",
  authReady: false,

  today: {
    date: null,
    logs: [], // { kind, kcal, confidence, notes, ts }
    net: 0,
  },
};

state.partner = {
  uid: null,
  email: null,
  today: {
    date: null,
    logs: [],
    net: 0,
  },
};

export function restoreToday() {
  // DB is source of truth now
}
