// "Was that alright, and can I eat it again?"
//
// Two halves, deliberately separated:
//
//   • The GAUGE is arithmetic — how much of today's budget this one thing costs
//     and how many times it fits. It costs nothing, it is always right, and it
//     is computed fresh against whoever is looking, so the same adobo reads
//     differently for Charlie's 1,500 kcal than for Karla's.
//   • The NOTE is the AI's — what to change next time. It is about the food
//     itself, not the person, so it is cached on the entry and fetched once
//     ever.
//
// The gauge is the honest part and it renders instantly; the note arrives after
// and can fail without taking anything with it.

import { METRICS, WEEKLY_ACTIVE_MIN, DAILY_STEP_TARGET } from "./config.js";
import { num, fmt } from "./util.js";

/* ---------------------------------------------------------- meal gauge -- */

/**
 * How many of this meal fit inside a day. This is the number Charlie actually
 * asked for — "pwede ba ulit-ulitin" — and it needs no model to answer.
 *
 * The limiting metric is the interesting part: a plate can be perfectly
 * reasonable on calories and still be a whole day's salt.
 */
export function mealGauge(entry, budget) {
  const shares = METRICS.map((m) => {
    const value = num(entry[m.key]);
    const cap = num(budget[m.key]);
    return {
      key: m.key,
      label: m.label,
      short: m.short,
      tone: m.tone,
      unit: m.unit,
      value,
      cap,
      // Share of the whole day this one item costs.
      share: cap > 0 ? value / cap : 0,
      // How many would fit before this metric alone runs out.
      fits: value > 0 && cap > 0 ? Math.floor(cap / value) : Infinity,
    };
  });

  // Whichever metric runs out first is the one that decides, and the one worth
  // naming — you can't average away a sodium problem with good calories.
  const limiter = shares.reduce((worst, s) => (s.share > worst.share ? s : worst), shares[0]);
  const fits = Math.min(...shares.map((s) => s.fits));

  return { shares, limiter, fits, ...band(fits, limiter) };
}

/**
 * Four bands, worded so that "fine" is genuinely available. Most of what these
 * two eat is ordinary food and the app should be able to say so — a tracker
 * that finds a problem in every meal stops being read.
 */
function band(fits, limiter) {
  if (fits === Infinity || fits >= 5) {
    return { tone: "easy", verdict: "Eat this as often as you like", detail: "It barely moves any of your three." };
  }
  if (fits >= 3) {
    return {
      tone: "easy",
      verdict: `Room for ${fits} of these today`,
      detail: "A normal portion of a normal day.",
    };
  }
  if (fits === 2) {
    return {
      tone: "steady",
      verdict: "Twice today and you're still fine",
      detail: `${cap(limiter.label)} is what caps it.`,
    };
  }
  if (fits === 1) {
    return {
      tone: "watch",
      verdict: "Once a day, not twice",
      detail: `A second one puts you over on ${limiter.label.toLowerCase()}.`,
    };
  }
  return {
    tone: "heavy",
    verdict: `This alone is your whole day's ${limiter.label.toLowerCase()}`,
    detail: `${Math.round(limiter.share * 100)}% of it in one go.`,
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------ movement gauge -- */

/**
 * Exercise gets no AI at all. The useful things to say about a walk are all
 * arithmetic — how it sits against WHO's 150 active minutes a week, and what
 * another quarter hour at the same effort would actually buy — and a model
 * asked to say them would only blur numbers we already know exactly.
 */
export function moveGauge(entry, { budget, weekMinutes = 0, weekSteps = 0 }) {
  const burn = num(entry.burn);
  const minutes = num(entry.minutes);
  const steps = num(entry.steps);
  const kcalBudget = num(budget.kcal);

  const weekPct = Math.min(1, weekMinutes / WEEKLY_ACTIVE_MIN);
  const lines = [];

  if (burn > 0 && kcalBudget > 0) {
    lines.push(`That's ${Math.round((burn / kcalBudget) * 100)}% of a day's calories earned back.`);
  }

  // Same effort, a bit longer — the one change that needs no new equipment,
  // no new skill and no guessing at intensity.
  if (minutes > 0 && burn > 0) {
    lines.push(`Another 15 min at this pace ≈ ${fmt(Math.round((burn / minutes) * 15))} kcal more.`);
  } else if (steps > 0) {
    const short = Math.max(0, DAILY_STEP_TARGET - weekSteps);
    lines.push(
      short > 0
        ? `${fmt(short)} more steps today would hit ${fmt(DAILY_STEP_TARGET)}.`
        : `Past ${fmt(DAILY_STEP_TARGET)} steps today.`
    );
  }

  const short = Math.max(0, WEEKLY_ACTIVE_MIN - weekMinutes);
  const tone = weekPct >= 1 ? "easy" : weekPct >= 0.5 ? "steady" : "watch";
  return {
    tone,
    verdict:
      weekPct >= 1
        ? "You've hit the week's target"
        : weekPct >= 0.5
          ? "Halfway through the week's target"
          : "Every one of these counts",
    // The week's standing goes in the header next to the bar, so it must not
    // also appear as a line — it read as the same fact stated twice.
    weekLabel: short > 0
      ? `${fmt(weekMinutes)} of ${WEEKLY_ACTIVE_MIN} active minutes — ${fmt(short)} to go`
      : `${fmt(weekMinutes)} active minutes this week, past WHO's ${WEEKLY_ACTIVE_MIN}`,
    weekMinutes,
    weekPct,
    lines,
  };
}

/** Active minutes and steps logged in the 7 days ending on `date`. */
export function weekMovement(date, entriesFor, shiftDay) {
  let minutes = 0;
  let steps = 0;
  for (let i = 0; i < 7; i++) {
    for (const e of entriesFor(shiftDay(date, -i))) {
      if (e.kind !== "exercise") continue;
      minutes += num(e.minutes);
      if (i === 0) steps += num(e.steps);
    }
  }
  return { weekMinutes: Math.round(minutes), weekSteps: Math.round(steps) };
}
