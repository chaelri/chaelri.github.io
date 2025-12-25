// scripts/sync/realtime.js
import { state } from "../state.js";
import { getDB } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// deterministic pairing
function resolvePartner() {
  if (state.user.uid === "charlie") {
    return {
      uid: "karla",
      email: "karla@local",
      name: "Karla",
    };
  }

  if (state.user.uid === "karla") {
    return {
      uid: "charlie",
      email: "charlie@local",
      name: "Charlie",
    };
  }

  return null;
}

export function initRealtimeSync() {
  console.log("[RTDB] initRealtimeSync", state.user.uid);

  // ---------- SELF ----------
  attachToday(state.user.uid, true);

  // ---------- PARTNER ----------
  const partner = resolvePartner();
  if (!partner) return;

  state.partner.uid = partner.uid;
  state.partner.email = partner.email;

  attachToday(partner.uid, false);
}

function getLocalDateKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function attachToday(uid, isSelf) {
  const todayKey = getLocalDateKey();
  const logsRef = ref(getDB(), `users/${uid}/logs/${todayKey}`);

  console.log(
    `[RTDB] listening ${isSelf ? "SELF" : "PARTNER"} →`,
    uid,
    todayKey
  );

  onValue(logsRef, (snap) => {
    const logsObj = snap.val() || {};
    const logs = Object.values(logsObj);

    let net = 0;
    for (const log of logs) {
      if (log.kind === "food") net += log.kcal;
      if (log.kind === "exercise") net -= log.kcal;
    }

    const target = isSelf ? state.today : state.partner.today;

    target.date = todayKey;
    target.logs = logs;
    target.net = net;

    console.log(
      `[RTDB] ${isSelf ? "SELF" : "PARTNER"} updated`,
      logs.length,
      "logs"
    );

    // force UI refresh
    requestAnimationFrame(() => {
      import("../logs.js").then((m) => m.bindLogs());
      import("../today.js").then((m) => m.bindToday());
      import("../insights.js").then((m) => m.bindInsights());
    });
  });
}
