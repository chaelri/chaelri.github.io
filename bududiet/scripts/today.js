// scripts/today.js
import { state } from "./state.js";

let idleInitialized = false;
let idleTimer = null;

export function bindToday(animate = false) {
  console.log(
    "[UI] bindToday() called. net =",
    state.today.net,
    "logs =",
    state.today.logs.length
  );

  // ---------- SELF ----------
  bindWheel(
    {
      circle: "wheelProgress",
      value: "wheelValue",
      icon: "wheelIcon",
      label: "selfLabel",
    },
    state.today,
    getGoal(state.user),
    animate,
    true
  );

  // ---------- PARTNER ----------
  if (state.partner?.today) {
    bindWheel(
      {
        circle: "wheelProgressPartner",
        value: "wheelValuePartner",
        icon: "wheelIconPartner",
        label: "partnerLabel",
      },
      state.partner.today,
      getGoal(state.partner),
      false,
      false
    );
  }
}

// =============================
// Wheel renderer
// =============================
function bindWheel(ids, source, goal, animate = false, enableIdle = false) {
  const circle = document.getElementById(ids.circle);
  const value = document.getElementById(ids.value);
  const icon = document.getElementById(ids.icon);
  const label = document.getElementById(ids.label);

  if (!circle || !value || !icon) return;

  const net = source?.net || 0;

  // ===== Label (NAME) =====
  if (label && source === state.partner?.today) {
    label.textContent = state.partner.name;
  }
  if (label && source === state.today) {
    label.textContent = state.user.name;
  }

  // ===== Progress ring =====
  const pct = Math.min(Math.abs(net) / goal, 1);
  const circumference = 565;
  const offset = circumference * (1 - pct);

  if (animate) {
    circle.style.transition = "none";
    circle.style.strokeDashoffset = circumference;

    requestAnimationFrame(() => {
      circle.style.transition =
        "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)";
      circle.style.strokeDashoffset = offset;
    });
  } else {
    circle.style.strokeDashoffset = offset;
  }

  value.textContent = `${net} kcal`;

  // ===== Icon state =====
  icon.classList.remove("wheel-ok", "wheel-warning", "wheel-over");

  if (net < 0) {
    icon.textContent = "local_fire_department";
    icon.classList.add("wheel-ok");
  } else if (net > goal) {
    icon.textContent = "sentiment_very_dissatisfied";
    icon.classList.add("wheel-over");
  } else if (net > goal * 0.9) {
    icon.textContent = "sentiment_neutral";
    icon.classList.add("wheel-warning");
  } else if (net > goal * 0.6) {
    icon.textContent = "sentiment_satisfied";
    icon.classList.add("wheel-ok");
  } else {
    icon.textContent = "sentiment_satisfied_alt";
    icon.classList.add("wheel-ok");
  }

  // ===== Idle animation (SELF ONLY) =====
  if (enableIdle && !idleInitialized) {
    startIdleBehavior(icon);
    idleInitialized = true;
  }
}

// =============================
// Idle animation system
// =============================
function startIdleBehavior(iconEl) {
  if (!iconEl) return;

  const idleAnimations = [
    "idle-pulse",
    "idle-pulse",
    "idle-wobble",
    "idle-pulse",
    "idle-shake",
  ];

  function triggerIdle() {
    const anim =
      idleAnimations[Math.floor(Math.random() * idleAnimations.length)];

    iconEl.classList.add(anim);
    iconEl.addEventListener(
      "animationend",
      () => iconEl.classList.remove(anim),
      { once: true }
    );

    scheduleNext();
  }

  function scheduleNext() {
    idleTimer = setTimeout(triggerIdle, 3000 + Math.random() * 5000);
  }

  scheduleNext();
}

// =============================
// Goal logic (LOCAL USERS)
// =============================
export function getGoal(user) {
  if (!user) return 1500;
  return user.name === "Charlie" ? 1100 : 1500;
}
