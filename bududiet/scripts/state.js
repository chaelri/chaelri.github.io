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

export function restoreToday() {
  if (!state.user) return;

  const key = `bududiet:${state.user.email}:today`;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    state.today = JSON.parse(raw);
  } catch {}
}
