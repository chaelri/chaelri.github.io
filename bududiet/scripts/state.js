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
