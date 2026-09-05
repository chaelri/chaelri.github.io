// The "Me" tab: who you are, your numbers, and the two switches that change
// how the maths works.

import { PEOPLE, DEFAULT_GOALS, METRICS } from "./config.js";
import { state, saveProfile, setWho, me } from "./store.js";
import { esc, icon, fmt, num, ageFrom, haptic, avatar } from "./util.js";
import { openSheet, toast, fieldHTML } from "./ui.js";

let root = null;

export function mountProfile(container) {
  root = container;
  updateProfile();
}

export function updateProfile({ force = false } = {}) {
  if (!root) return;
  // A remote change (the partner logging a meal) must not yank the field
  // someone is halfway through editing. Our own edits pass force.
  const focused = document.activeElement;
  if (!force && root.contains(focused) && /^(INPUT|TEXTAREA)$/.test(focused.tagName)) return;
  const person = me();
  const p = state.profile || {};
  const age = ageFrom(person.birth);
  const bmr = mifflin({ sex: person.sex, weightKg: num(p.weightKg, person.weightKg), heightCm: num(p.heightCm, person.heightCm), age });
  const tdee = Math.round(bmr * 1.375); // lightly active — desk work plus some walking

  root.innerHTML = `
    <header class="day-head">
      <div>
        <p class="day-greeting">Your setup</p>
        <h1 class="day-title">${esc(person.name)}</h1>
      </div>
      <button class="who-chip tap" id="profileWho" data-accent="${person.accent}" aria-label="Switch person">
        ${avatar(person)}${icon("unfold_more", "who-caret")}
      </button>
    </header>

    <section class="card">
      <div class="section-head section-head--tight">
        <h2>Daily goals</h2>
        <button class="link-btn tap" id="resetGoals">${icon("restart_alt")}Reset</button>
      </div>
      <div class="goal-rows">
        ${METRICS.map(
          (m) => `
          <label class="goal-row tone-${m.tone}" for="goal_${m.key}">
            <span class="goal-icon">${icon(m.icon)}</span>
            <span class="goal-text">
              <b>${m.label}</b>
              <small>${goalNote(m.key)}</small>
            </span>
            <span class="goal-input">
              <input id="goal_${m.key}" type="number" inputmode="numeric" min="0" step="${m.step}"
                     value="${num(p.goals?.[m.key], DEFAULT_GOALS[m.key])}" data-goal="${m.key}" />
              <i>${m.unit}</i>
            </span>
          </label>`
        ).join("")}
      </div>
    </section>

    <section class="card">
      <div class="section-head section-head--tight"><h2>Body</h2></div>
      <div class="two-col">
        ${fieldHTML({ id: "bodyWeight", label: "Weight", value: num(p.weightKg, person.weightKg), type: "number", suffix: "kg", inputmode: "decimal" })}
        ${fieldHTML({ id: "bodyHeight", label: "Height", value: num(p.heightCm, person.heightCm), type: "number", suffix: "cm", inputmode: "decimal" })}
      </div>
      <div class="fact-grid">
        <div class="fact"><b>${age}</b><span>years old</span></div>
        <div class="fact"><b>${fmt(bmr)}</b><span>BMR kcal</span></div>
        <div class="fact"><b>${fmt(tdee)}</b><span>burn/day</span></div>
      </div>
      <p class="muted-note">${deficitNote(tdee, num(p.goals?.kcal, DEFAULT_GOALS.kcal))}</p>
    </section>

    <section class="card">
      <div class="section-head section-head--tight"><h2>Preferences</h2></div>
      ${toggleHTML("exerciseAddsBudget", "Exercise offsets what you ate", "Calories you burn come off today's total. The goal itself never moves, and sugar and sodium never budge either.", p.exerciseAddsBudget !== false)}
      ${toggleHTML("showPartner", `Show ${esc(otherName())}'s day`, "A small read-only card at the bottom of Today.", p.showPartner !== false)}
    </section>
`;

  // Goals — save on blur so a half-typed "15" doesn't briefly become the goal.
  root.querySelectorAll("[data-goal]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.goal;
      const value = Math.max(0, num(input.value));
      saveProfile({ goals: { ...state.profile.goals, [key]: value } });
      toast("Goal updated", { tone: "good", icon: "check" });
    });
  });

  root.querySelector("#resetGoals").onclick = () => {
    saveProfile({ goals: { ...DEFAULT_GOALS } });
    updateProfile({ force: true });
    toast("Back to 1,500 kcal · 50 g · 2,000 mg", { tone: "good", icon: "restart_alt" });
  };

  root.querySelector("#bodyWeight").addEventListener("change", (e) => {
    saveProfile({ weightKg: Math.max(1, num(e.target.value)) });
    updateProfile({ force: true });
  });
  root.querySelector("#bodyHeight").addEventListener("change", (e) => {
    saveProfile({ heightCm: Math.max(1, num(e.target.value)) });
    updateProfile({ force: true });
  });

  root.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      const next = !(state.profile[key] !== false);
      haptic(8);
      saveProfile({ [key]: next });
      updateProfile({ force: true });
    });
  });

  root.querySelector("#profileWho").onclick = () => openWhoSheet();
}

function goalNote(key) {
  // Short on purpose — a longer line wraps under the input on a 390 px phone.
  if (key === "kcal") return "Our shared target";
  if (key === "sugar_g") return "WHO: under 50 g";
  return "WHO: under 2,000 mg";
}

function otherName() {
  return PEOPLE.find((p) => p.id !== state.who)?.name || "your partner";
}

function toggleHTML(key, label, note, on) {
  return `
    <button class="toggle-row tap" data-toggle="${key}" role="switch" aria-checked="${on}">
      <span class="toggle-text"><b>${label}</b><small>${esc(note)}</small></span>
      <span class="toggle ${on ? "is-on" : ""}"><i></i></span>
    </button>`;
}

/** Mifflin-St Jeor — the estimate most calculators use. */
function mifflin({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

function deficitNote(tdee, goal) {
  const gap = tdee - goal;
  if (gap <= 0) return `At ${fmt(goal)} kcal you're eating around your daily burn.`;
  const kgPerWeek = ((gap * 7) / 7700).toFixed(2); // ~7,700 kcal per kg of fat
  return `A ${fmt(gap)} kcal gap against your estimated burn — roughly ${kgPerWeek} kg a week if you hold it.`;
}

/* ------------------------------------------------------- who switcher --- */

export function openWhoSheet() {
  openSheet({
    title: "Who's logging?",
    icon: "switch_account",
    build(body, sheet) {
      body.innerHTML = `
        <div class="who-grid">
          ${PEOPLE.map(
            (p) => `
            <button class="who-card tap ${p.id === state.who ? "is-active" : ""}" data-who="${p.id}" data-accent="${p.accent}">
              ${avatar(p, "who-initial--lg")}
              <b>${esc(p.name)}</b>
              ${p.id === state.who ? `<span class="who-active">${icon("check_circle")}</span>` : ""}
            </button>`
          ).join("")}
        </div>`;

      body.addEventListener("click", (e) => {
        const card = e.target.closest("[data-who]");
        if (!card) return;
        haptic(12);
        setWho(card.dataset.who);
        sheet.close();
        toast(`Hi, ${PEOPLE.find((p) => p.id === card.dataset.who).name}`, { tone: "good", icon: "waving_hand" });
      });
    },
  });
}
