import { state } from "../state.js";
import { getDB } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const PAIR = ["charliecayno@gmail.com", "kasromantico@gmail.com"];

function getPartnerEmail() {
  return PAIR.find((e) => e !== state.user.email);
}

export function initRealtimeSync() {
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
        return;
      }
    }
  });
}

function attachPartnerToday(uid) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const logsRef = ref(db(), `users/${uid}/logs/${todayKey}`);
}

function db() {
  return getDB();
}

function attachPartnerToday(uid) {
  const todayKey = new Date().toISOString().slice(0, 10);
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
}
