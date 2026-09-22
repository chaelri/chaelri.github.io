// The controller. Runs on both phones; the role picked on the join screen
// decides which half of this file is live.
//
// The gyro maths is the part worth reading.
//
// iOS gives alpha/beta/gamma — a Z-X'-Y'' intrinsic rotation taking the device
// frame to the Earth frame (X east, Y north, Z up). Rather than trying to
// reason about what "beta" means when the phone is held sideways, we build the
// rotation matrix and ask a direct question: where, on the ground, is the top
// edge of this phone pointing?
//
// That heading is then taken RELATIVE to wherever the phone was pointing when
// you tapped Re-centre, which is why there is no compass call here at all.
// webkitCompassHeading would be absolute and drift-free, but it is a
// magnetometer reading, and the thing you are sitting next to while you play
// is a laptop full of magnets.

import { INPUT_HZ, ROLES, TUNING } from "./config.js";
import { createClient } from "./net.js";

const $ = (s) => document.querySelector(s);

const els = {
  join: $("#join"),
  pad: $("#pad"),
  code: $("#code"),
  err: $("#err"),
  roleBtns: [...document.querySelectorAll("[data-role]")],
  joinBtn: $("#joinBtn"),
  link: $("#link"),
  state: $("#state"),
  dial: $("#dial"),
  stick: $("#stick"),
  nub: $("#nub"),
  haptic: $("#haptic"),
};

const params = new URLSearchParams(location.search);
if (params.get("r")) els.code.value = params.get("r").toUpperCase();

let role = params.get("role") || null;
let client = null;

/* ------------------------------------------------------------ haptics --- */
// The hidden switch trick: toggling an iOS switch control fires the system
// haptic. There is no other way to get a tap out of Safari.
function tick() {
  if (!els.haptic) return;
  els.haptic.checked = !els.haptic.checked;
}

/* --------------------------------------------------------------- gyro --- */

const ori = { a: 0, b: 0, g: 0, ok: false };

function onOrientation(e) {
  if (e.alpha === null) return;
  ori.a = (e.alpha * Math.PI) / 180;
  ori.b = (e.beta * Math.PI) / 180;
  ori.g = (e.gamma * Math.PI) / 180;
  ori.ok = true;
}

/** Device axes expressed in the Earth frame. Columns of the W3C matrix. */
function deviceAxes() {
  const { a, b, g } = ori;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return {
    // +X, out of the right edge of the screen
    right: [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG],
    // +Y, out of the top edge
    top: [-cB * sA, cA * cB, sB],
  };
}

// Which edge we take the heading from is decided once, at calibration, and
// then held. Re-picking it live would snap the beam 90 degrees the moment the
// phone tipped past vertical.
let calib = { axis: "top", offset: 0, ready: false };

function rawHeading(axisName) {
  const ax = deviceAxes()[axisName];
  return Math.atan2(ax[0], ax[1]); // clockwise from north
}

function recentre() {
  if (!ori.ok) return;
  const ax = deviceAxes();
  // The more horizontal edge gives the steadier heading: a near-vertical
  // vector has almost no ground projection left to take an angle from.
  calib.axis = Math.abs(ax.top[2]) <= Math.abs(ax.right[2]) ? "top" : "right";
  calib.offset = rawHeading(calib.axis);
  calib.ready = true;
  tick();
}

let beam = 0;
function updateBeam() {
  if (!ori.ok || !calib.ready) return;
  const h = rawHeading(calib.axis) - calib.offset;
  // Unwrap so the beam takes the short way round, then ease slightly — the
  // gyro is never quite still and a jittering cone edge is very visible
  // against a black screen.
  let d = ((h - beam + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  beam += d * 0.35;
}

/* -------------------------------------------------------- ilaw controls --- */

let focus = 0;
let focusHeld = false;
const press = { fl: 0, ac: 0 };

function bindIlaw() {
  const pad = els.pad;
  pad.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    focusHeld = true;
    pad.setPointerCapture(e.pointerId);
    tick();
  });
  const release = () => (focusHeld = false);
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  const flareBtn = $("#flare");
  flareBtn.addEventListener("click", () => {
    if (flareBtn.classList.contains("cooling")) return;
    press.fl++;
    tick();
    // The screen owns the real cooldown; this mirrors it locally so the
    // button in your hand can tell you it is spent without a return channel.
    flareBtn.classList.add("cooling");
    setTimeout(() => flareBtn.classList.remove("cooling"), TUNING.flareCooldownMs);
  });
  $("#recentre").addEventListener("click", recentre);

  addEventListener("deviceorientation", onOrientation, true);
  // The first reading can be a frame or two out; calibrate once it lands.
  const wait = setInterval(() => {
    if (ori.ok) {
      recentre();
      clearInterval(wait);
    }
  }, 60);
}

function drawDial() {
  const c = els.dial;
  const ctx = c.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = c.clientWidth;
  if (c.width !== size * dpr) {
    c.width = c.height = size * dpr;
  }
  const R = (size * dpr) / 2;
  ctx.clearRect(0, 0, R * 2, R * 2);
  ctx.translate(R, R);

  ctx.strokeStyle = "rgba(255,195,107,0.16)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  const half = 0.46 + (0.17 - 0.46) * focus;
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.86);
  grd.addColorStop(0, "rgba(255,195,107,0.75)");
  grd.addColorStop(1, "rgba(255,195,107,0.05)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R * 0.86, beam - half, beam + half);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffe3b8";
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ------------------------------------------------------- anino controls --- */

const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
const STICK_R = 62;

function bindAnino() {
  const pad = els.pad;
  pad.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    stick.active = true;
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    stick.x = stick.y = 0;
    els.stick.style.left = e.clientX + "px";
    els.stick.style.top = e.clientY + "px";
    els.stick.classList.add("on");
    pad.setPointerCapture(e.pointerId);
    tick();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    stick.x = dx / STICK_R;
    stick.y = dy / STICK_R;
    els.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const drop = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.x = stick.y = 0;
    els.stick.classList.remove("on");
    els.nub.style.transform = "translate(-50%, -50%)";
  };
  pad.addEventListener("pointerup", drop);
  pad.addEventListener("pointercancel", drop);

  $("#lantern").addEventListener("click", () => {
    press.ac++;
    tick();
  });
}

/* --------------------------------------------------------------- send --- */

function loop() {
  if (role === "ilaw") {
    updateBeam();
    focus += ((focusHeld ? 1 : 0) - focus) * 0.22;
    drawDial();
    client?.send({ a: beam, f: focus, fl: press.fl });
  } else {
    client?.send({ mx: stick.x, my: stick.y, ac: press.ac });
  }
}

/* --------------------------------------------------------------- join --- */

for (const btn of els.roleBtns) {
  btn.addEventListener("click", () => {
    role = btn.dataset.role;
    els.roleBtns.forEach((b) => b.classList.toggle("sel", b === btn));
    els.joinBtn.disabled = false;
    els.joinBtn.textContent = `Join as ${ROLES[role].name}`;
  });
}
if (role && ROLES[role]) {
  els.roleBtns.find((b) => b.dataset.role === role)?.click();
}

async function requestGyro() {
  const D = window.DeviceOrientationEvent;
  if (!D) return "unsupported";
  if (typeof D.requestPermission !== "function") return "granted"; // not iOS
  try {
    return await D.requestPermission();
  } catch {
    return "denied";
  }
}

els.joinBtn.addEventListener("click", async () => {
  const code = els.code.value.trim().toUpperCase();
  if (code.length < 4 || !role) return;
  els.joinBtn.disabled = true;
  els.err.textContent = "";

  // Must happen inside the tap. iOS will not grant it from a callback later.
  if (role === "ilaw") {
    const res = await requestGyro();
    if (res !== "granted") {
      els.err.textContent =
        res === "unsupported"
          ? "This browser has no motion sensor. Open it in Safari."
          : "Motion access was refused — Ilaw needs it to aim. Reload and allow.";
      els.joinBtn.disabled = false;
      return;
    }
  }

  try {
    client = await createClient({
      code,
      role,
      name: ROLES[role].name,
      onState: paintState,
    });
  } catch (err) {
    els.err.textContent = err.message || "Could not join.";
    els.joinBtn.disabled = false;
    return;
  }

  document.body.dataset.role = role;
  els.join.classList.add("gone");
  els.pad.classList.remove("hidden");
  paintState(client.mode);

  if (role === "ilaw") bindIlaw();
  else bindAnino();

  setInterval(loop, 1000 / INPUT_HZ);
  setInterval(() => paintState(client.mode), 1500);

  // A controller that dims mid-level is worse than useless.
  try { await navigator.wakeLock?.request("screen"); } catch {}
  addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      try { await navigator.wakeLock?.request("screen"); } catch {}
    }
  });
});

function paintState(mode) {
  const label =
    mode === "p2p" ? "direct" : mode === "relay" ? "relay · slower" : "connecting…";
  els.state.textContent = label;
  els.state.dataset.mode = mode;
}

// Stop iOS treating a two-finger flick on the pad as a page gesture.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => {
  if (!els.pad.classList.contains("hidden")) e.preventDefault();
}, { passive: false });
