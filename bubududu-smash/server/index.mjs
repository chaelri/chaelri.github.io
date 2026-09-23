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

const TICK_HZ = 60;        // how often the rules advance
const TICK = 1 / TICK_HZ;
const SEND_HZ = 30;        // how often both players are told
const KEYFRAME_MS = 1000;  // ...and told everything

/* How many of a player's inputs to keep in hand before simulating them.
 *
 * Nought would mean every scrap of jitter shows up as a tick with nothing to
 * run, and a tick with nothing to run has to repeat the last input — which is
 * a tick the client will replay differently, because the client never
 * repeated anything. Two is about 33 ms of slack, which covers ordinary
 * jitter without putting any noticeable delay on the shot. */
const BUFFER_MIN = 2;
/* ...and the ceiling. A client whose clock runs fast, or one coming back from
 * a hitch, arrives with a backlog; left alone it would be simulated late for
 * ever. Two at a time drains it in a second or so. */
const BUFFER_MAX = 8;

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

    /* Inputs are QUEUED, not applied on arrival.
     *
     * Applying them the moment they land ties the simulation to the network's
     * timing: two arriving between ticks means the first is simulated for no
     * time at all, and a gap means the last one is stretched. Neither is
     * something the client can reproduce when it replays, and the difference
     * is the error. Queued and consumed one per tick, the server runs exactly
     * the sequence the client ran, only later.
     *
     * A packet carries the last six ticks; anything already queued or already
     * simulated is dropped by number.
     */
    this.queued = { p1: [], p2: [] };
    this.headTick = { p1: 0, p2: 0 };
    this.onMessage("input", (client, packet) => {
      const role = this.roles.get(client.sessionId);
      if (!role) return;
      for (const p of Array.isArray(packet) ? packet : [packet]) {
        if (!p || !Number.isFinite(p.n) || p.n <= this.headTick[role]) continue;
        this.headTick[role] = p.n;
        this.queued[role].push(p);
      }
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
    // A new connection numbers its ticks from one, so everything the room was
    // holding about the last one has to go with it.
    sim.state.resetInput(role);
    this.queued[role] = [];
    this.headTick[role] = 0;
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

  /** One player's next input, or nothing if we are choosing to wait. */
  feed(role) {
    const q = this.queued[role];
    if (!q.length) return;

    /* Nothing is being simulated between rounds — so BANK nothing either.
     *
     * A countdown is three seconds, and a client mints a tick through every
     * one of them whether or not anybody is moving. Queuing those and paying
     * them out one per tick once play starts means the server spends the
     * first three seconds of the round simulating inputs the player gave
     * before it began, and catching up two at a time while the client only
     * ever ran them once. That is a steadily growing error that resets at
     * every correction and comes straight back — a quarter of a tile per
     * tick, which is the whole of the tail the bench was showing.
     */
    if (sim.state.phase !== "play") {
      while (q.length) {
        const p = q.shift();
        sim.applyPacket(role, { n: p.n, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s });
      }
      return;
    }

    // Hold a couple back as slack against jitter.
    if (q.length <= BUFFER_MIN) return;
    const take = q.length > BUFFER_MAX ? 2 : 1;
    for (let i = 0; i < take && q.length; i++) {
      const p = q.shift();
      sim.applyPacket(role, { n: p.n, l: p.l, r: p.r, h: p.h, d: p.d, j: p.j, s: p.s });
    }
  }

  tick(deltaMs) {
    /* A whole number of ticks. Colyseus hands back however long it actually
     * was, and feeding that straight in makes the physics a function of how
     * busy the box is. The leftover is carried. */
    this.acc = (this.acc || 0) + Math.min(0.25, deltaMs / 1000);
    let guard = 0;
    while (this.acc >= TICK && guard++ < 8) {
      this.acc -= TICK;
      this.feed("p1");
      this.feed("p2");
      sim.step(TICK);
    }

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
      /* How far into each player's thumbs this picture is.
       *
       * The one number a client cannot work out for itself, and the one that
       * makes reconciliation possible rather than approximate: it says which
       * of the inputs you have sent are already baked into what you are
       * looking at, so you can re-run exactly the ones that are not.
       *
       * The pads themselves used to ride here too, so each phone could carry
       * the OTHER player forward off his buttons. They do not any more —
       * nobody predicts anybody else now, they interpolate between the
       * positions in these snapshots, which is both smoother and true.
       */
      ak: sim.state.acks,
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
