// The text laid over the arena: the round banner, the countdown cards, and
// the dimming behind them.
//
// This lives on its own because BOTH phones have to show it and only one of
// them is running the rules. The host calls these directly; the guest is sent
// the same arguments over the wire and calls them too, so there is one copy
// of the markup rather than two that drift the first time a class changes.
//
// Karla saw none of this before it was shared: setBanner and setCount were
// private to screen.js, so on her phone the arena dimmed behind a result and
// nothing appeared on top of it.

const $ = (s) => document.querySelector(s);

// Three beats, and they spell the game. A fourth card repeating the whole
// title straight after SMASH was the name three times in two seconds.
export const COUNT_WORDS = { 3: "BUBU", 2: "DUDU", 1: "SMASH!" };

let countHide = null;

/**
 * The big text in the middle.
 *
 * `pre` sits ABOVE the headline — the final score goes there, because under
 * the name it read as a footnote to the sentence rather than as the result.
 * Wrapped in `.bwrap` so the plate behind a result can be the size of the
 * TEXT rather than of the screen.
 */
export function setBanner(title, sub, pre) {
  const banner = $("#banner");
  if (!banner) return;
  banner.innerHTML =
    `<div class="bwrap">` +
    (pre ? `<div class="bp">${pre}</div>` : "") +
    `<div class="bt">${title}</div>` +
    `<div class="bs">${sub || ""}</div>` +
    `</div>`;
  banner.classList.add("in");
}

export function hideBanner() {
  $("#banner")?.classList.remove("in");
}

/**
 * One countdown card.
 *
 * Replacing the whole element is what restarts the CSS animation — re-setting
 * the text alone would leave the pop and the shock ring already finished.
 */
export function setCount(n) {
  const el = $("#count");
  if (!el) return;
  clearTimeout(countHide);
  const word = COUNT_WORDS[n];
  if (!word) return clearCount();
  el.innerHTML =
    `<div class="count word${n === 1 ? " go" : ""}">` +
    `<span class="ring"></span><span class="num">${word}</span></div>`;
  // The round title lives in the middle of the screen too, so it steps up out
  // of the way for as long as the card is there rather than sitting under it.
  document.body.classList.add("counting");
  // The round banner also says BUBU DUDU SMASH, and `body.counting` has it
  // parked small and up out of the way. Letting it sit there until the class
  // came off meant it SLID BACK DOWN to the middle at full size and then
  // faded — a second title animation straight after the title card, which
  // read as the intro playing twice. Dropped the moment the last card is up.
  if (n === 1) hideBanner();
}

export function clearCount() {
  const el = $("#count");
  clearTimeout(countHide);
  if (el) el.innerHTML = "";
  document.body.classList.remove("counting");
}

/**
 * Whether a result is on screen, and how final it is.
 *
 * Drives the scrim behind the banner. `null` clears it, "round" dims the
 * arena, "match" dims it further.
 */
export function setResult(kind) {
  document.body.classList.toggle("result", !!kind);
  document.body.classList.toggle("final", kind === "match");
}

/* ------------------------------------------------------------- notes --- */

// How many notes can be stacked beside one player at once, and how long each
// one lives. The cap exists because the notes sit over the arena.
const NOTE_MAX = 4;
const NOTE_MS = 2900;

/**
 * A note beside a player — and NOT at the expense of the last one.
 *
 * This used to be a single card whose innerHTML was replaced. Pick two things
 * up in the same second — which the coin rewards make ordinary, since one of
 * them can hand you a Dudu while a power-up orb is still under your feet —
 * and the first was simply gone before it had been read. Now each note is its
 * own element on a stack with its own clock.
 *
 * A note whose title is already on the stack REFRESHES that one instead of
 * adding a second: stacking a power-up three times should say so once, in a
 * card that keeps jumping, not build a tower of identical cards.
 */
export function showNote(a, colour, title, body, glyph = "") {
  const el = a.id === "p1" ? $("#toastL") : $("#toastR");
  if (!el) return;

  const kill = (note) => {
    if (note.dataset.dying) return;
    note.dataset.dying = "1";
    note.classList.remove("in");
    setTimeout(() => note.remove(), 320);
  };

  const live = [...el.querySelectorAll(".note")].filter((n) => !n.dataset.dying);
  let note = live.find((n) => n.dataset.title === title);

  if (note) {
    // Same thing again — refresh it in place and bump it so the change is
    // visible, rather than quietly swapping the text under the reader.
    note.querySelector(".ds").textContent = body;
    note.classList.remove("bump");
    void note.offsetWidth;                 // restart the animation
    note.classList.add("bump");
  } else {
    // Oldest first out, so the newest arrival is never the one dropped.
    for (const old of live.slice(0, Math.max(0, live.length - (NOTE_MAX - 1)))) kill(old);

    note = document.createElement("div");
    note.className = "note";
    note.dataset.title = title;
    note.style.setProperty("--tc", colour);
    note.innerHTML =
      `<div class="who">${a.label}</div>` +
      `<div class="nm">${title}<em>${glyph}</em></div>` +
      `<div class="ds"></div>`;
    note.querySelector(".ds").textContent = body;
    el.appendChild(note);
    // One frame on the shelf so the transition has something to run from.
    requestAnimationFrame(() => note.classList.add("in"));
  }

  clearTimeout(note._t);
  note._t = setTimeout(() => kill(note), NOTE_MS);
}
