// Pairing and input transport.
//
// Firebase is used ONLY as a place for the three devices to swap WebRTC
// offers. Once the handshake lands, the phones talk straight to the MacBook
// over the local WiFi — ICE picks a host candidate pair and the packets never
// leave the house. That is what makes gyro aiming feel attached to your hand
// instead of arriving from Singapore a tenth of a second late.
//
// If that fails (some routers have client isolation on, which blocks
// device-to-device traffic outright) the same input falls back to being
// written into RTDB at a lower rate. Laggy but playable, and the screen says
// so rather than pretending.
//
// What lands in the database is a room code, two SDP blobs and some ICE
// candidates, for as long as the game is open. The room deletes itself when
// the tab closes.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  remove,
  onValue,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { DB_ROOT, FIREBASE_CONFIG, ICE_SERVERS, INPUT_HZ_RELAY, P2P_TIMEOUT_MS } from "./config.js";

// No 0/O/1/I — the code gets read out loud across a room.
const ALPHABET = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";

function db() {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  return getDatabase(app);
}

function makeCode(n = 4) {
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

const randomId = () => crypto.randomUUID().slice(0, 12);

/**
 * ICE candidates routinely arrive before the offer/answer they belong to.
 * Adding one early throws, so they queue until there is a remote description
 * to hang them on.
 */
function candidateQueue(pc) {
  const pending = [];
  let open = false;
  return {
    add(c) {
      if (open) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      else pending.push(c);
    },
    flush() {
      open = true;
      for (const c of pending) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      pending.length = 0;
    },
  };
}

/* --------------------------------------------------------------- host --- */

/**
 * The MacBook. Publishes a room code, then answers whoever joins it.
 * `onInput(role, payload)` fires for every controller packet.
 */
export async function createHost({ onInput, onPeers }) {
  const d = db();
  const code = makeCode();
  const roomPath = `${DB_ROOT}/rooms/${code}`;
  const roomRef = ref(d, roomPath);

  await set(roomRef, { created: Date.now() });
  onDisconnect(roomRef).remove();

  const peers = new Map();
  const report = () =>
    onPeers?.(
      [...peers.values()].map((p) => ({
        role: p.role,
        name: p.name,
        on: p.mode !== "off",
        relay: p.mode === "relay",
      }))
    );

  function attach(peerId, info) {
    if (peers.has(peerId) || !info?.role) return;

    // One controller per role. A phone that reloads gets a new peer id, so
    // the stale record has to go or the screen shows a ghost.
    for (const [id, old] of peers) {
      if (old.role === info.role) {
        old.destroy();
        peers.delete(id);
        remove(ref(d, `${roomPath}/peers/${id}`)).catch(() => {});
      }
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const queue = candidateQueue(pc);
    const base = `${roomPath}/peers/${peerId}`;
    const rec = { role: info.role, name: info.name || info.role, mode: "off", pc, subs: [] };

    const dc = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
    dc.onopen = () => {
      rec.mode = "p2p";
      report();
    };
    dc.onclose = () => {
      if (rec.mode === "p2p") rec.mode = "relay";
      report();
    };
    dc.onmessage = (e) => {
      try {
        onInput(rec.role, JSON.parse(e.data));
      } catch {}
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) push(ref(d, `${base}/hostIce`), e.candidate.toJSON()).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        if (rec.mode === "p2p") rec.mode = "relay";
        report();
      }
    };

    rec.subs.push(
      onValue(ref(d, `${base}/answer`), async (snap) => {
        const a = snap.val();
        if (!a || pc.currentRemoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(a)).catch(() => {});
        queue.flush();
      }),
      onChildAdded(ref(d, `${base}/peerIce`), (snap) => queue.add(snap.val())),
      // The fallback lane. Ignored entirely while the data channel is up.
      onValue(ref(d, `${base}/relay`), (snap) => {
        const v = snap.val();
        if (v && rec.mode !== "p2p") {
          rec.mode = "relay";
          onInput(rec.role, v);
        }
      })
    );

    rec.destroy = () => {
      for (const un of rec.subs) un();
      try { dc.close(); } catch {}
      try { pc.close(); } catch {}
    };

    (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(ref(d, `${base}/offer`), { type: offer.type, sdp: offer.sdp });
    })().catch(() => {});

    setTimeout(() => {
      if (dc.readyState !== "open" && rec.mode === "off") {
        rec.mode = "relay";
        report();
      }
    }, P2P_TIMEOUT_MS);

    peers.set(peerId, rec);
    report();
  }

  const unsubAdd = onChildAdded(ref(d, `${roomPath}/peers`), (snap) =>
    attach(snap.key, snap.val())
  );
  const unsubGone = onChildRemoved(ref(d, `${roomPath}/peers`), (snap) => {
    const rec = peers.get(snap.key);
    if (rec) {
      rec.destroy();
      peers.delete(snap.key);
      report();
    }
  });

  return {
    code,
    peers,
    destroy() {
      unsubAdd();
      unsubGone();
      for (const rec of peers.values()) rec.destroy();
      peers.clear();
      remove(roomRef).catch(() => {});
    },
  };
}

/* ------------------------------------------------------------- client --- */

/** A phone. Streams input at whatever rate the open path can carry. */
export async function createClient({ code, role, name, onState }) {
  const d = db();
  const roomPath = `${DB_ROOT}/rooms/${code.toUpperCase()}`;

  const exists = await get(ref(d, `${roomPath}/created`));
  if (!exists.exists()) throw new Error("That code is not open. Check the screen.");

  const peerId = randomId();
  const base = `${roomPath}/peers/${peerId}`;
  const me = ref(d, base);
  await set(me, { role, name: name || role, joined: Date.now() });
  onDisconnect(me).remove();

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const queue = candidateQueue(pc);
  let dc = null;
  let mode = "connecting";

  const setMode = (m) => {
    if (m === mode) return;
    mode = m;
    onState?.(mode);
  };

  pc.ondatachannel = (e) => {
    dc = e.channel;
    dc.onopen = () => setMode("p2p");
    dc.onclose = () => setMode("relay");
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) push(ref(d, `${base}/peerIce`), e.candidate.toJSON()).catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") setMode("relay");
  };

  const subs = [
    onValue(ref(d, `${base}/offer`), async (snap) => {
      const o = snap.val();
      if (!o || pc.currentRemoteDescription) return;
      await pc.setRemoteDescription(new RTCSessionDescription(o)).catch(() => {});
      queue.flush();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await set(ref(d, `${base}/answer`), { type: answer.type, sdp: answer.sdp });
    }),
    onChildAdded(ref(d, `${base}/hostIce`), (snap) => queue.add(snap.val())),
  ];

  setTimeout(() => {
    if (!dc || dc.readyState !== "open") setMode("relay");
  }, P2P_TIMEOUT_MS);

  const relayRef = ref(d, `${base}/relay`);
  let lastRelay = 0;

  return {
    peerId,
    get mode() {
      return dc && dc.readyState === "open" ? "p2p" : mode;
    },
    send(payload) {
      if (dc && dc.readyState === "open") {
        try {
          dc.send(JSON.stringify(payload));
          return;
        } catch {}
      }
      const now = performance.now();
      if (now - lastRelay < 1000 / INPUT_HZ_RELAY) return;
      lastRelay = now;
      set(relayRef, payload).catch(() => {});
    },
    destroy() {
      for (const un of subs) un();
      try { pc.close(); } catch {}
      remove(me).catch(() => {});
    },
  };
}
