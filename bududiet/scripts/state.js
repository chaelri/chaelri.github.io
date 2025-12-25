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
    const restored = JSON.parse(raw);

    // 🔑 logs are source of truth
    let net = 0;
    for (const log of restored.logs || []) {
      if (log.kind === "food") net += log.kcal;
      if (log.kind === "exercise") net -= log.kcal;
    }

    state.today = {
      ...restored,
      net,
    };
  } catch {}
}
