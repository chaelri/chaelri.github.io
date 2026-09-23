// The authoritative server for BUBU DUDU SMASH.
//
// It runs js/sim.js — the same rules file the browser runs — so there is no
// second implementation to keep in step. Both phones are equal clients of it:
// neither is the host, which is the whole reason this exists. Before it, one
// player watched the live game with no latency at all and the other watched a
// copy of it, and no amount of tuning closes a gap that is built into the
// shape of the thing.
//
// Colyseus handles what is genuinely hard and genuinely solved — rooms,
// matchmaking, websockets, reconnection, backpressure — and the game state
// rides over it as plain JSON, the same snapshot format the peer-to-peer
// build already used. Modelling this state in Colyseus's schema classes would
// buy smaller packets and cost a rewrite of every nested object in the game;
// the snapshot is about 600 bytes and goes thirty times a second, which is
// nothing.

import { createServer } from "http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Room } from "@colyseus/core";

import * as sim from "../js/sim.js";
import { snapshot } from "../js/netstate.js";

const packPad = (p) =>
  [p.left ? 1 : 0, p.right ? 1 : 0, p.jumpHeld ? 1 : 0, p.drop ? 1 : 0];

const TICK_HZ = 60;        // how often the rules advance
const SEND_HZ = 30;        // how often both players are told
const KEYFRAME_MS = 1000;  // ...and told everything

class SmashRoom extends Room {
  maxClients = 2;

  onCreate() {
    this.roles = new Map();       // sessionId -> "p1" | "p2"
    this.pending = { notes: [], sfx: [], music: [], rounds: [] };
    this.shown = { banner: null, count: null, result: null };
    this.lastSend = 0;
    this.lastKey = 0;

    /* The rules reach the outside through here.
     *
     * On a phone these shake the camera and play a sound. Here they are
     * collected and handed to both players in the next update, so both see
     * the same toast and hear the same hit at the same moment — which is not
     * true of anything either of them could have worked out locally.
     */
    sim.configure({
      authority: true,
      fx: {
        sfx: (name, opts) => this.queue("sfx", opts ? [name, opts] : [name]),
        music: (...a) => this.queue("music", a),
        note: (a, colour, title, body, glyph) =>
          this.queue("notes", [a.id, a.label, colour, title, body, glyph || ""]),
        banner: (title, sub, pre) => {
          this.shown.banner = title == null ? null : [title, sub || "", pre || ""];
        },
        count: (n) => { this.shown.count = n == null ? null : n; },
        result: (kind) => { this.shown.result = kind || null; },
        rematch: (on) => { this.shown.rematch = !!on; },
        power: (a) => this.broadcast("power", {
          id: a.id, p: a.power ? a.power.type : null, ammo: a.power ? a.power.ammo : 0,
        }),
        // Camera work is per-screen and every client applies its own "at
        // least this much", so it goes as a plain event.
        shake: (v) => this.queue("cam", ["shake", v]),
        punch: (v) => this.queue("cam", ["punch", v]),
        flash: (v) => this.queue("cam", ["flash", v]),
        killCam: (k) => this.queue("cam", ["kill", k]),
        roundStart: (seed, roundNo, score) =>
          this.queue("rounds", [seed, roundNo, score]),
      },
    });

    this.onMessage("input", (client, packet) => {
      const role = this.roles.get(client.sessionId);
      if (role) sim.applyPacket(role, packet);
    });
    this.onMessage("rematch", () => sim.rematch());
    // Echoed straight back, so a client can measure its own round trip
    // rather than guess at it.
    this.onMessage("ping", (client, t) => client.send("pong", t));

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), 1000 / TICK_HZ);
    console.log(`[smash] room ${this.roomId} open`);
  }

  queue(kind, value) {
    const q = (this.pending[kind] ||= []);
    if (q.length < 24) q.push(value);
  }

  onJoin(client, options = {}) {
    /* The player says who they are, in the join options.
     *
     * Asking, rather than telling them afterwards: a `client.send` from
     * inside onJoin races the client attaching its handlers and is simply
     * lost, which is what happened the first time. The page already knows —
     * it is in the URL the QR code carries — so there is nothing to
     * negotiate. Whatever is left over is assigned if they ask for a seat
     * that is taken.
     */
    const taken = new Set(this.roles.values());
    let role = options.role === "p1" || options.role === "p2" ? options.role : "p1";
    if (taken.has(role)) role = role === "p1" ? "p2" : "p1";
    this.roles.set(client.sessionId, role);
    sim.state.pads[role].connected = true;
    // Sent anyway, for anything that wants confirming, but nothing depends
    // on it arriving.
    client.send("you", { role });
    console.log(`[smash] ${client.sessionId} joined as ${role}`);

    // Both in: play. Nobody should have to press anything.
    if (this.roles.size === 2 && sim.state.phase === "lobby") sim.startMatch();
  }

  onLeave(client) {
    const role = this.roles.get(client.sessionId);
    if (role) sim.state.pads[role].connected = false;
    this.roles.delete(client.sessionId);
    console.log(`[smash] ${client.sessionId} left`);
  }

  tick(deltaMs) {
    sim.step(Math.min(0.08, deltaMs / 1000));

    const now = Date.now();
    if (now - this.lastSend < 1000 / SEND_HZ) return;
    this.lastSend = now;

    const G = sim.state.G;
    if (!G) return;

    const keyframe = now - this.lastKey > KEYFRAME_MS;
    if (keyframe) this.lastKey = now;

    const snap = snapshot(G, {
      ph: sim.state.phase,
      sc: sim.state.score,
      rn: sim.state.roundNo,
      sd: sim.state.seed,
      wn: G.winner || 0,
      hd: this.shown,
      /* Both players' thumbs.
       *
       * Twelve bytes, and it is what lets each phone carry the OTHER player
       * forward between updates instead of stepping him thirty times a
       * second. Without it he is smooth on his own screen and stuttery on
       * yours, which is half of what "laggy" ever meant.
       */
      in: {
        p1: packPad(sim.state.pads.p1),
        p2: packPad(sim.state.pads.p2),
      },
      who: Object.fromEntries([...this.roles].map(([id, r]) => [r, id])),
    });
    // The tilemap is most of the payload and it only changes when the arena
    // crumbles. A keyframe every second covers a dropped one and anyone who
    // joined since.
    if (!keyframe && this.lastRows === snap.rows) delete snap.rows;
    else this.lastRows = snap.rows;

    for (const [kind, q] of Object.entries(this.pending)) {
      if (q.length) { snap[kind] = q; this.pending[kind] = []; }
    }

    this.broadcast("s", snap);
  }
}

const app = express();
app.get("/health", (_, res) => res.json({ ok: true }));

const server = new Server({
  transport: new WebSocketTransport({ server: createServer(app) }),
});
server.define("smash", SmashRoom);

const PORT = Number(process.env.PORT) || 2567;
server.listen(PORT).then(() => console.log(`[smash] listening on ${PORT}`));
