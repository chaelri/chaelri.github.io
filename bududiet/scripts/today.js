// scripts/today.js
import { state } from "./state.js";

let idleInitialized = false;
let idleTimer = null;

export function bindToday(animate = false) {
  // SELF
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

  // PARTNER
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

function bindWheel(ids, source, goal, animate, enableIdle) {
  const circle = document.getElementById(ids.circle);
  const value = document.getElementById(ids.value);
  const icon = document.getElementById(ids.icon);
  const label = document.getElementById(ids.label);

  if (!circle || !value || !icon) return;

  if (label) {
    label.textContent =
      ids.label === "selfLabel" ? state.user.name : state.partner?.name || "";
  }

  const net = source?.net || 0;
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
  } else {
    icon.textContent = "sentiment_satisfied_alt";
    icon.classList.add("wheel-ok");
  }

  if (enableIdle && !idleInitialized) {
    startIdleBehavior(icon);
    idleInitialized = true;
  }
}

function startIdleBehavior(iconEl) {
  const anims = ["idle-pulse", "idle-wobble", "idle-shake"];
  const run = () => {
    const a = anims[Math.floor(Math.random() * anims.length)];
    iconEl.classList.add(a);
    iconEl.addEventListener("animationend", () => iconEl.classList.remove(a), {
      once: true,
    });
    idleTimer = setTimeout(run, 4000 + Math.random() * 4000);
  };
  idleTimer = setTimeout(run, 4000);
}

function getGoal(user) {
  return user?.uid === "charlie" ? 1100 : 1500;
}
