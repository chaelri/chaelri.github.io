import { state } from "../state.js";
import { getDB } from "./firebase.js";
import {
  ref,
  onValue,
  onChildRemoved,
  onChildAdded,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const PAIR = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

function getPartnerEmail() {
  return PAIR.find((e) => e !== state.user.email);
}

export function initRealtimeSync() {
  console.log("[RTDB] initRealtimeSync called");
  const db = getDB();

  // determine partner UID from users meta
  const usersRef = ref(db, "users");
  onValue(usersRef, (snap) => {
    const users = snap.val() || {};
    const partnerEmail = getPartnerEmail();

    for (const uid in users) {
      if (users[uid]?.meta?.email === partnerEmail) {
        state.partner.uid = uid;
        state.partner.email = partnerEmail;

        attachPartnerToday(uid);
        attachSelfToday(state.user.uid);
        return;
      }
    }
  });
}

function getLocalDateKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// =============================
// PARTNER — FULL SYNC
// =============================
function attachPartnerToday(uid) {
  const todayKey = getLocalDateKey();
  const logsRef = ref(getDB(), `users/${uid}/logs/${todayKey}`);

  onValue(logsRef, (snap) => {
    const logsObj = snap.val() || {};
    const logs = Object.values(logsObj);

    let net = 0;
    for (const log of logs) {
      if (log.kind === "food") net += log.kcal;
      if (log.kind === "exercise") net -= log.kcal;
    }

    state.partner.today = {
      date: todayKey,
      logs,
      net,
    };
  });

  onChildRemoved(logsRef, (snap) => {
    // ---------- UPDATE INSIGHTS ----------
    import("../insights.js").then((m) => m.bindInsights());

    const removed = snap.val();
    if (!removed || !state.partner.today) return;

    const logs = state.partner.today.logs.filter((l) => l.ts !== removed.ts);

    let net = 0;
    for (const log of logs) {
      if (log.kind === "food") net += log.kcal;
      if (log.kind === "exercise") net -= log.kcal;
    }

    state.partner.today.logs = logs;
    state.partner.today.net = net;

    // force UI refresh if Logs or Home is visible
    import("../logs.js").then((m) => m.bindLogs());
    import("../today.js").then((m) => m.bindToday());
  });
}

function attachSelfToday(uid) {
  const todayKey = getLocalDateKey();
  const logsRef = ref(getDB(), `users/${uid}/logs/${todayKey}`);

  console.log("[RTDB] attachSelfToday → listening to", todayKey);
  console.log("[RTDB] attachSelfToday");
  console.log("[RTDB] uid =", uid);
  console.log("[RTDB] todayKey =", todayKey);

  onValue(logsRef, (snap) => {
    console.log("[RTDB] self logs snapshot exists =", snap.exists());
    console.log("[RTDB] raw snapshot =", snap.val());

    const logsObj = snap.val() || {};
    const logs = Object.values(logsObj);

    let net = 0;
    for (const log of logs) {
      if (log.kind === "food") net += log.kcal;
      if (log.kind === "exercise") net -= log.kcal;
    }

    state.today = {
      date: todayKey,
      logs,
      net,
    };

    console.log("[RTDB] SELF snapshot received");
    console.log("[RTDB] logs count:", logs.length);
    console.log("[RTDB] state.today =", JSON.stringify(state.today, null, 2));

    // 🔥 FORCE UI UPDATE AFTER SNAPSHOT
    requestAnimationFrame(() => {
      import("../logs.js").then((m) => m.bindLogs());
      import("../today.js").then((m) => m.bindToday());
      import("../insights.js").then((m) => m.bindInsights());
    });
  });
}
