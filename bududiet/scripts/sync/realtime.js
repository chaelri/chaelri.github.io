import { state } from "../state.js";
import { getDB } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =============================
   Helpers
============================= */

function getLocalDateKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function computeNet(logs) {
  let net = 0;
  for (const log of logs) {
    if (log.kind === "food") net += log.kcal;
    if (log.kind === "exercise") net -= log.kcal;
  }
  return net;
}

/* =============================
   Realtime bootstrap
============================= */

export function initRealtimeSync() {
  console.log("[RTDB] initRealtimeSync called");

  const db = getDB();
  const todayKey = getLocalDateKey();

  /* ---------- SELF ---------- */
  attachToday(db, state.user.uid, (today) => {
    state.today = today;
    console.log("[RTDB] SELF hydrated", today);

    requestAnimationFrame(() => {
      import("../logs.js").then((m) => m.bindLogs());
      import("../today.js").then((m) => m.bindToday());
      import("../insights.js").then((m) => m.bindInsights());
    });
  });

  /* ---------- PARTNER (AUTO DISCOVER) ---------- */
  const usersRef = ref(db, "users");

  onValue(usersRef, (snap) => {
    const users = snap.val() || {};
    const myEmail = state.user.email;

    for (const uid in users) {
      if (users[uid]?.meta?.email && users[uid].meta.email !== myEmail) {
        state.partner.uid = uid;
        state.partner.email = users[uid].meta.email;

        console.log("[RTDB] Partner detected:", state.partner.email);

        attachToday(db, uid, (today) => {
          state.partner.today = today;

          requestAnimationFrame(() => {
            import("../logs.js").then((m) => m.bindLogs());
            import("../today.js").then((m) => m.bindToday());
          });
        });

        return;
      }
    }
  });
}

/* =============================
   Attach today logs (generic)
============================= */

function attachToday(db, uid, onUpdate) {
  const todayKey = getLocalDateKey();
  const logsRef = ref(db, `users/${uid}/logs/${todayKey}`);

  console.log("[RTDB] attachToday →", uid, todayKey);

  onValue(logsRef, (snap) => {
    const obj = snap.val() || {};
    const logs = Object.values(obj);

    const today = {
      date: todayKey,
      logs,
      net: computeNet(logs),
    };

    console.log("[RTDB] snapshot", uid, logs.length);

    onUpdate(today);
  });
}
