// Adding and editing entries: the photo flow, the typed flow, exercise, steps,
// and the review sheet where the AI's guess can be argued with.

import { METRICS } from "./config.js";
import {
  state,
  addEntry,
  updateEntry,
  deleteEntry,
  me,
  partner,
  entriesFor,
  totalsFor,
  recentMeals,
  recentWorkouts,
} from "./store.js";
import {
  prepImage,
  analyzeMealPhoto,
  analyzeMealText,
  analyzeExercise,
  sumItems,
  burnFromMet,
  burnFromSteps,
} from "./ai.js";
import { openSheet, confirmSheet, toast, burst, fieldHTML } from "./ui.js";
import { dayKey, clockLabel, esc, icon, fmt, num, round, uid, haptic, $ } from "./util.js";

// Fallback intensity when an old entry predates the stored MET.
const DEFAULT_MET_FALLBACK = 4;

/* ------------------------------------------------------------ chooser --- */

export function openAddSheet(date = dayKey()) {
  openSheet({
    title: "Log something",
    subtitle: date === dayKey() ? "Right now" : `For ${date}`,
    icon: "add_circle",
    build(body, sheet) {
      const choice = (pick, ic, label, note, extra = "") => `
        <button class="choice ${extra} tap" data-pick="${pick}">
          <span class="choice-icon">${icon(ic)}</span>
          <span class="choice-text"><b>${esc(label)}</b><small>${esc(note)}</small></span>
        </button>`;

      body.innerHTML = `
        <div class="choice-grid">
          ${choice("camera", "photo_camera", "Take a photo", "Point at the plate, I'll read it", "choice--hero")}
          ${choice("library", "image", "From gallery", "Pick a picture")}
          ${choice("describe", "edit_note", "Type it", '"2 pandesal, kape"')}
          ${choice("exercise", "directions_run", "Movement", "Walk, gym, steps — anything")}
        </div>`;

      body.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pick]");
        if (!btn) return;
        const pick = btn.dataset.pick;
        sheet.close();
        if (pick === "camera") pickImage({ camera: true, date });
        else if (pick === "library") pickImage({ camera: false, date });
        else if (pick === "describe") openDescribeSheet(date);
        else if (pick === "exercise") openMoveSheet(date);
      });
    },
  });
}

/* -------------------------------------------------------- photo flow ---- */

export function pickImage({ camera = true, date = dayKey() } = {}) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  // `capture` opens the camera straight away on iOS; without it you get the
  // photo picker, which is what "From gallery" wants.
  if (camera) input.setAttribute("capture", "environment");
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (file) runPhotoFlow(file, date);
  });
  input.click();
}

async function runPhotoFlow(file, date) {
  const sheet = openSheet({ title: "Reading your plate", icon: "auto_awesome", build: renderThinking });

  try {
    const img = await prepImage(file);
    sheet.body.querySelector(".thinking-photo")?.setAttribute("src", img.thumb);

    const analysis = await analyzeMealPhoto({ base64: img.base64, mimeType: img.mimeType });
    sheet.close();

    if (!analysis.isFood) {
      toast("I couldn't find food in that one — try again or type it", { tone: "warn", icon: "no_food" });
      return;
    }
    haptic(12);
    openReviewSheet({
      date,
      analysis,
      thumb: img.thumb,
      photo: { base64: img.base64, mimeType: img.mimeType },
      source: "photo",
    });
  } catch (err) {
    console.error(err);
    sheet.close();
    toast(err.message || "That didn't work. Try again.", { tone: "danger", icon: "error" });
  }
}

function renderThinking(body) {
  body.innerHTML = `
    <div class="thinking">
      <div class="thinking-frame">
        <img class="thinking-photo" alt="" />
        <div class="thinking-scan"></div>
      </div>
      <div class="thinking-lines">
        <p class="thinking-title">Looking at the food…</p>
        <p class="thinking-step" id="thinkStep">Spotting what's on the plate</p>
      </div>
    </div>`;

  const steps = [
    "Spotting what's on the plate",
    "Checking brands and labels",
    "Sizing up the portions",
    "Counting sugar and sodium",
    "Almost there…",
  ];
  let i = 0;
  const node = body.querySelector("#thinkStep");
  const timer = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);
    node.style.opacity = "0";
    setTimeout(() => {
      node.textContent = steps[i];
      node.style.opacity = "1";
    }, 180);
  }, 1500);
  // The sheet element is removed on close, so clean up when it leaves the DOM.
  new MutationObserver((_, obs) => {
    if (!body.isConnected) {
      clearInterval(timer);
      obs.disconnect();
    }
  }).observe(document.body, { childList: true });
}

/* --------------------------------------------------------- typed meal --- */

export function openDescribeSheet(date = dayKey()) {
  openSheet({
    title: "What did you eat?",
    subtitle: "Plain words are fine — Taglish too",
    icon: "edit_note",
    build(body, sheet) {
      // Your own recent meals beat invented examples, and tapping one skips the
      // AI entirely: the breakdown is already stored, so it just opens the
      // review sheet ready to save.
      const recents = recentMeals(5);
      const examples = ["1 cup rice + adobo", "Jollibee Chickenjoy 1pc", "2 pandesal + kape", "Milk tea, medium"];

      body.innerHTML = `
        <textarea class="ta" id="mealText" rows="3" placeholder="1 cup rice, 2 pcs chicken adobo, 1 can coke"></textarea>
        ${recents.length ? `<p class="chips-label">${icon("history", "sm")}Had it again?</p>` : ""}
        <div class="hint-chips">
          ${
            recents.length
              ? recents
                  .map(
                    (r, i) =>
                      `<button class="hint-chip hint-chip--recent tap" data-recent="${i}">
                         <span>${esc(r.title)}</span><i>${fmt(r.kcal)}</i>
                       </button>`
                  )
                  .join("")
              : examples.map((s) => `<button class="hint-chip tap" data-fill="${esc(s)}">${esc(s)}</button>`).join("")
          }
        </div>
        <button class="btn btn-primary btn-block" id="goText">${icon("auto_awesome")}Estimate it</button>`;

      const ta = body.querySelector("#mealText");
      body.querySelectorAll("[data-fill]").forEach((chip) => {
        chip.onclick = () => {
          ta.value = chip.dataset.fill;
          ta.focus();
        };
      });
      body.querySelectorAll("[data-recent]").forEach((chip) => {
        chip.onclick = () => {
          const r = recents[Number(chip.dataset.recent)];
          if (!r) return;
          haptic(10);
          sheet.close();
          openReviewSheet({
            date,
            analysis: {
              isFood: true,
              title: r.title,
              brand: r.brand || "",
              items: r.items || [],
              assumptions: r.assumptions || "",
              confidence: r.confidence || "medium",
              tip: "",
            },
            thumb: r.thumb || "",
            photo: r.thumb ? { base64: r.thumb.split(",")[1], mimeType: "image/jpeg" } : null,
            source: r.source || "manual",
          });
        };
      });

      body.querySelector("#goText").onclick = async () => {
        const text = ta.value.trim();
        if (!text) return toast("Type what you ate first", { tone: "warn" });
        const btn = body.querySelector("#goText");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>Thinking…`;
        try {
          const analysis = await analyzeMealText(text);
          sheet.close();
          if (!analysis.isFood) return toast("I couldn't turn that into food", { tone: "warn" });
          haptic(12);
          openReviewSheet({ date, analysis, source: "text", typed: text });
        } catch (err) {
          console.error(err);
          btn.disabled = false;
          btn.innerHTML = `${icon("auto_awesome")}Estimate it`;
          toast(err.message || "That didn't work", { tone: "danger", icon: "error" });
        }
      };
      setTimeout(() => ta.focus(), 260);
    },
  });
}

/* ------------------------------------------------------------- review --- */
/* The screen Charlie asked for: whatever the AI decided is editable, and a
   free-text correction re-runs the read against the same photo. */

export function openReviewSheet({ date, analysis, thumb = "", photo = null, source = "photo", typed = "", existing = null }) {
  const draft = {
    title: analysis.title || "Meal",
    brand: analysis.brand || "",
    items: analysis.items.map((i) => ({ ...i, _id: uid() })),
    assumptions: analysis.assumptions || "",
    confidence: analysis.confidence || "medium",
    tip: analysis.tip || "",
    time: existing ? new Date(existing.ts) : new Date(),
  };

  openSheet({
    title: existing ? "Edit meal" : "Does this look right?",
    icon: "restaurant",
    wide: true,
    build(body, sheet) {
      body.innerHTML = `
        <div class="review">
          ${thumb ? `<img class="review-photo" src="${thumb}" alt="" />` : ""}
          <div class="review-idline">
            <input class="review-title" id="rvTitle" value="${esc(draft.title)}" placeholder="What is it?" />
            <input class="review-brand" id="rvBrand" value="${esc(draft.brand)}" placeholder="Brand (optional)" />
          </div>
          ${
            draft.assumptions
              ? `<p class="review-assume">${icon("info", "sm")}<span>${esc(draft.assumptions)}</span>
                 <b class="conf conf--${draft.confidence}">${draft.confidence}</b></p>`
              : ""
          }

          <div class="totals" id="rvTotals"></div>

          <div class="section-head section-head--tight">
            <h3>Breakdown</h3>
            <button class="link-btn tap" id="rvAddItem">${icon("add")}Add item</button>
          </div>
          <div class="items" id="rvItems"></div>

          <div class="fixit">
            <p class="fixit-label">${icon("psychology_alt", "sm")}Not quite right? Tell me what to change.</p>
            <div class="fixit-row">
              <input id="rvHint" placeholder="e.g. 2 cups rice, no egg" />
              <button class="btn btn-soft tap" id="rvRerun">${icon("refresh")}</button>
            </div>
          </div>

          <label class="field field--inline" for="rvTime">
            <span class="field-label">${icon("schedule", "sm")}When</span>
            <input id="rvTime" type="time" value="${toTimeValue(draft.time)}" />
          </label>

          <div class="sheet-actions">
            ${existing ? `<button class="btn btn-ghost btn-danger-text tap" id="rvDelete">${icon("delete")}Delete</button>` : ""}
            <button class="btn btn-primary btn-grow tap" id="rvSave">${icon("check")}${existing ? "Save changes" : "Log it"}</button>
          </div>
        </div>`;

      const itemsHost = body.querySelector("#rvItems");
      const totalsHost = body.querySelector("#rvTotals");

      const renderItems = () => {
        itemsHost.innerHTML = draft.items.map(itemRowHTML).join("");
      };

      const renderTotals = () => {
        const t = sumItems(draft.items);
        totalsHost.innerHTML = METRICS.map((m) => {
          const v = t[m.key];
          return `
            <div class="total tone-${m.tone}">
              <span class="total-value">${m.key === "sugar_g" ? Math.round(v * 10) / 10 : fmt(v)}</span>
              <span class="total-unit">${m.unit}</span>
              <span class="total-label">${m.label}</span>
            </div>`;
        }).join("");
      };

      // One delegated listener for every number/text field in the list.
      itemsHost.addEventListener("input", (e) => {
        const input = e.target.closest("[data-field]");
        if (!input) return;
        const row = input.closest("[data-item]");
        const item = draft.items.find((i) => i._id === row.dataset.item);
        if (!item) return;
        const field = input.dataset.field;
        item[field] = field === "name" || field === "qty" ? input.value : Math.max(0, num(input.value));
        // Editing added sugar upward drags the total with it, or an item ends
        // up claiming more added sugar than it contains.
        if (field === "sugar_g") item.sugar_total_g = Math.max(num(item.sugar_total_g), item.sugar_g);
        renderTotals();
      });

      itemsHost.addEventListener("click", (e) => {
        const del = e.target.closest("[data-del]");
        if (!del) return;
        haptic(8);
        draft.items = draft.items.filter((i) => i._id !== del.dataset.del);
        renderItems();
        renderTotals();
      });

      body.querySelector("#rvAddItem").onclick = () => {
        draft.items.push({ _id: uid(), name: "", qty: "", kcal: 0, sugar_g: 0, sodium_mg: 0 });
        renderItems();
        itemsHost.lastElementChild?.querySelector("input")?.focus();
      };

      const rerun = body.querySelector("#rvRerun");
      if (rerun) {
        rerun.onclick = async () => {
          const hint = body.querySelector("#rvHint").value.trim();
          if (!hint) return toast("Tell me what to fix first", { tone: "warn" });
          rerun.disabled = true;
          rerun.innerHTML = `<span class="spinner"></span>`;
          try {
            const describeDraft = () =>
              [
                draft.title,
                draft.brand ? `(${draft.brand})` : "",
                draft.items.map((i) => `${i.name}${i.qty ? ` ${i.qty}` : ""}`).join(", "),
              ]
                .filter(Boolean)
                .join(" — ");
            const next = photo
              ? await analyzeMealPhoto({ ...photo, hint, previous: draft })
              : await analyzeMealText(
                  `${typed || describeDraft()}. Correction from the person who ate it: ${hint}`
                );
            draft.title = next.title || draft.title;
            draft.brand = next.brand || draft.brand;
            draft.items = next.items.map((i) => ({ ...i, _id: uid() }));
            draft.assumptions = next.assumptions;
            draft.tip = next.tip || draft.tip;
            body.querySelector("#rvTitle").value = draft.title;
            body.querySelector("#rvBrand").value = draft.brand;
            body.querySelector("#rvHint").value = "";
            renderItems();
            renderTotals();
            haptic(12);
            toast("Updated", { tone: "good", icon: "auto_awesome" });
          } catch (err) {
            toast(err.message || "Couldn't redo that", { tone: "danger" });
          } finally {
            rerun.disabled = false;
            rerun.innerHTML = icon("refresh");
          }
        };
      }

      const del = body.querySelector("#rvDelete");
      if (del) {
        del.onclick = async () => {
          const ok = await confirmSheet({
            title: "Delete this entry?",
            message: `"${draft.title}" will be removed from ${date}.`,
            icon: "delete",
          });
          if (!ok) return;
          await deleteEntry(date, existing.id);
          sheet.close();
          toast("Deleted", { icon: "delete" });
        };
      }

      body.querySelector("#rvSave").onclick = async () => {
        const t = sumItems(draft.items);
        if (!draft.items.length) return toast("Add at least one item", { tone: "warn" });

        const payload = {
          kind: "meal",
          title: body.querySelector("#rvTitle").value.trim() || "Meal",
          brand: body.querySelector("#rvBrand").value.trim(),
          items: draft.items.map(({ _id, ...rest }) => rest),
          kcal: round(t.kcal, 1),
          // sugar_g is the free-sugar total — the figure the goal judges.
          sugar_g: round(t.sugar_g, 0.1),
          sugar_total_g: round(Math.max(t.sugar_total_g, t.sugar_g), 0.1),
          sodium_mg: round(t.sodium_mg, 1),
          assumptions: draft.assumptions,
          confidence: draft.confidence,
          source,
          ts: fromTimeValue(body.querySelector("#rvTime").value, date, existing?.ts),
        };
        if (thumb) payload.thumb = thumb;

        const btn = body.querySelector("#rvSave");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>Saving`;

        try {
          if (existing) await updateEntry(date, existing.id, payload);
          else await addEntry({ ...payload, date });
          haptic(14);
          burst($("#fab"));
          sheet.close();
          toast(existing ? "Saved" : draft.tip || "Logged. Ang galing mo.", {
            tone: "good",
            icon: existing ? "check" : "celebration",
          });
        } catch (err) {
          console.error(err);
          btn.disabled = false;
          btn.innerHTML = `${icon("check")}Log it`;
          toast("Couldn't save — check your connection", { tone: "danger" });
        }
      };

      renderItems();
      renderTotals();
    },
  });
}

function itemRowHTML(item) {
  return `
    <div class="item" data-item="${item._id}">
      <div class="item-top">
        <input class="item-name" data-field="name" value="${esc(item.name)}" placeholder="Item" />
        <button class="item-del tap" data-del="${item._id}" aria-label="Remove">${icon("close")}</button>
      </div>
      <input class="item-qty" data-field="qty" value="${esc(item.qty)}" placeholder="How much?" />
      <div class="item-nums">
        ${METRICS.map(
          (m) => `
          <label class="numbox tone-${m.tone}">
            <span class="numbox-label">${m.label}</span>
            <span class="numbox-row">
              <input data-field="${m.key}" type="number" inputmode="decimal" min="0"
                     step="${m.step}" value="${num(item[m.key])}" />
              <span class="numbox-unit">${m.unit}</span>
            </span>
          </label>`
        ).join("")}
      </div>
    </div>`;
}

/* ----------------------------------------------------------- exercise --- */

export function openMoveSheet(date = dayKey()) {
  const weightKg = num(state.profile?.weightKg, me().weightKg);
  const recentMoves = recentWorkouts(4);
  // One box, not a Workout/Steps toggle. Steps accumulate across a whole day
  // while everything else here is a session, so making you pick a lane first
  // was asking the wrong question — just say what you did.
  const examples = ["30 min brisk walk", "4 km/h treadmill, 60 mins", "8,500 steps", "1 hour badminton"];

  openSheet({
    title: "Log movement",
    subtitle: "Burned calories go back into today's budget",
    icon: "directions_run",
    build(body, sheet) {
      body.innerHTML = `
        <div class="pane">
          <textarea class="ta" id="moveText" rows="2"
            placeholder="30 min brisk walk sa park — or 8,500 steps"></textarea>
          ${recentMoves.length ? `<p class="chips-label">${icon("history", "sm")}Did it again?</p>` : ""}
          <div class="hint-chips">
            ${
              recentMoves.length
                ? recentMoves
                    .map(
                      (r, i) =>
                        `<button class="hint-chip hint-chip--recent tap" data-move="${i}">
                           <span>${esc(r.title)}</span><i>${fmt(r.burn)}</i>
                         </button>`
                    )
                    .join("")
                : examples.map((x) => `<button class="hint-chip tap" data-fill="${esc(x)}">${esc(x)}</button>`).join("")
            }
          </div>
          <button class="btn btn-primary btn-block" id="moveGo">${icon("auto_awesome")}Estimate the burn</button>
        </div>`;

      const ta = body.querySelector("#moveText");
      body.querySelectorAll("[data-fill]").forEach((c) => (c.onclick = () => (ta.value = c.dataset.fill)));

      body.querySelectorAll("[data-move]").forEach((c) => {
        c.onclick = () => {
          const r = recentMoves[Number(c.dataset.move)];
          if (!r) return;
          haptic(10);
          sheet.close();
          // Recompute the burn — the weight on file may have changed since.
          const burn = r.steps
            ? burnFromSteps({ steps: r.steps, weightKg })
            : burnFromMet({ met: r.met || DEFAULT_MET_FALLBACK, minutes: r.minutes, weightKg });
          openMoveConfirm({
            date,
            draft: {
              activity: r.activity || r.title,
              minutes: r.minutes,
              steps: r.steps,
              met: r.met || DEFAULT_MET_FALLBACK,
              paceKph: r.paceKph || 0,
              distanceKm: r.distanceKm || 0,
              burn,
            },
            weightKg,
            typed: r.described || "",
          });
        };
      });

      body.querySelector("#moveGo").onclick = async () => {
        const text = ta.value.trim();
        if (!text) return toast("Say what you did first", { tone: "warn" });
        const btn = body.querySelector("#moveGo");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span>Thinking…`;
        try {
          const parsed = await analyzeExercise(text);
          // A step count is the better basis when one was actually given;
          // otherwise intensity × time.
          const burn = parsed.steps
            ? burnFromSteps({ steps: parsed.steps, weightKg })
            : burnFromMet({ met: parsed.met, minutes: parsed.minutes, weightKg });
          sheet.close();
          openMoveConfirm({ date, draft: { ...parsed, burn }, weightKg, typed: text });
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = `${icon("auto_awesome")}Estimate the burn`;
          toast(err.message || "Couldn't read that", { tone: "danger" });
        }
      };

      setTimeout(() => ta.focus(), 260);
    },
  });
}

/** Second step of the workout flow — everything the AI guessed, editable. */
function openMoveConfirm({ date, draft, weightKg, existing = null, typed = "" }) {
  // Steps only belong on screen if this log is actually about steps. Charlie
  // never mentioned any and a zeroed Steps box just implied he'd got it wrong.
  const stepBased = num(draft.steps) > 0;

  openSheet({
    title: existing ? "Edit movement" : "Sounds right?",
    icon: "bolt",
    build(body, sheet) {
      const paceLine = () => {
        const bits = [];
        if (draft.paceKph) bits.push(`${draft.paceKph} km/h`);
        if (draft.distanceKm) bits.push(`${draft.distanceKm} km`);
        if (draft.minutes) bits.push(`${fmtMinutes(draft.minutes)}`);
        bits.push(`${fmt(weightKg)} kg`);
        if (draft.met) bits.push(`MET ${draft.met}`);
        return bits.join(" · ");
      };

      body.innerHTML = `
        ${
          typed
            ? `<p class="said-line">${icon("format_quote", "sm")}<span>${esc(typed)}</span></p>`
            : ""
        }
        ${
          draft.understood
            ? `<p class="review-assume">${icon("check_circle", "sm")}<span>${esc(draft.understood)}</span></p>`
            : ""
        }
        ${fieldHTML({ id: "mcAct", label: "Activity", value: draft.activity })}
        <div class="${stepBased ? "two-col" : ""}">
          ${fieldHTML({
            id: "mcMin",
            label: "Minutes",
            value: draft.minutes,
            type: "text",
            inputmode: "decimal",
            suffix: "min",
          })}
          ${
            stepBased
              ? fieldHTML({ id: "mcSteps", label: "Steps", value: draft.steps, type: "text", inputmode: "numeric" })
              : ""
          }
        </div>
        <div class="burn-box">
          <span class="burn-label">Estimated burn</span>
          <div class="burn-value"><b id="mcBurn">${fmt(draft.burn)}</b><span>kcal</span></div>
          <p class="burn-note" id="mcNote">${esc(paceLine())}</p>
        </div>

        <div class="fixit">
          <p class="fixit-label">${icon("psychology_alt", "sm")}Not quite right? Tell me what to change.</p>
          <div class="fixit-row">
            <input id="mcHint" placeholder="e.g. it was uphill, 5 km/h" />
            <button class="btn btn-soft tap" id="mcRerun">${icon("refresh")}</button>
          </div>
        </div>

        <label class="field field--inline" for="mcTime">
          <span class="field-label">${icon("schedule", "sm")}When</span>
          <input id="mcTime" type="time" value="${toTimeValue(existing ? new Date(existing.ts) : new Date())}" />
        </label>

        <div class="sheet-actions">
          ${existing ? `<button class="btn btn-ghost btn-danger-text tap" id="mcDelete">${icon("delete")}Delete</button>` : ""}
          <button class="btn btn-primary btn-grow tap" id="mcSave">${icon("check")}${existing ? "Save" : "Log it"}</button>
        </div>`;

      const recalc = () => {
        const minutes = num(body.querySelector("#mcMin").value);
        const steps = stepBased ? num(body.querySelector("#mcSteps").value) : 0;
        const burn = steps
          ? burnFromSteps({ steps, weightKg })
          : burnFromMet({ met: draft.met, minutes, weightKg });
        body.querySelector("#mcBurn").textContent = fmt(burn);
        return { minutes, steps, burn };
      };
      body.querySelector("#mcMin").addEventListener("input", recalc);
      body.querySelector("#mcSteps")?.addEventListener("input", recalc);

      const rerun = body.querySelector("#mcRerun");
      rerun.onclick = async () => {
        const hint = body.querySelector("#mcHint").value.trim();
        if (!hint) return toast("Tell me what to fix first", { tone: "warn" });
        rerun.disabled = true;
        rerun.innerHTML = `<span class="spinner"></span>`;
        try {
          const base = typed || `${draft.activity}, ${fmtMinutes(draft.minutes)}`;
          const next = await analyzeExercise(`${base}. Correction from the person who did it: ${hint}`);
          Object.assign(draft, next);
          draft.burn = next.steps
            ? burnFromSteps({ steps: next.steps, weightKg })
            : burnFromMet({ met: next.met, minutes: next.minutes, weightKg });
          body.querySelector("#mcAct").value = draft.activity;
          body.querySelector("#mcMin").value = draft.minutes;
          body.querySelector("#mcBurn").textContent = fmt(draft.burn);
          body.querySelector("#mcNote").textContent = paceLine();
          body.querySelector("#mcHint").value = "";
          haptic(12);
          toast("Updated", { tone: "good", icon: "auto_awesome" });
        } catch (err) {
          toast(err.message || "Couldn't redo that", { tone: "danger" });
        } finally {
          rerun.disabled = false;
          rerun.innerHTML = icon("refresh");
        }
      };

      const delBtn = body.querySelector("#mcDelete");
      if (delBtn) {
        delBtn.onclick = async () => {
          const ok = await confirmSheet({
            title: "Delete this?",
            message: "It won't count toward today anymore.",
            icon: "delete",
          });
          if (!ok) return;
          await deleteEntry(date, existing.id);
          sheet.close();
          toast("Deleted", { icon: "delete" });
        };
      }

      body.querySelector("#mcSave").onclick = async () => {
        const { minutes, steps, burn } = recalc();
        const activity = body.querySelector("#mcAct").value.trim() || "Movement";
        await saveMove({
          date,
          title: activity,
          activity,
          minutes,
          steps,
          burn,
          met: draft.met,
          described: typed || draft.understood || "",
          paceKph: draft.paceKph,
          distanceKm: draft.distanceKm,
          ts: fromTimeValue(body.querySelector("#mcTime").value, date, existing?.ts),
          existingId: existing?.id,
        });
        sheet.close();
      };
    },
  });
}

/** 60.5 → "60 min 30 s"; whole numbers stay plain. */
function fmtMinutes(mins) {
  const m = num(mins);
  const whole = Math.floor(m);
  const secs = Math.round((m - whole) * 60);
  return secs ? `${fmt(whole)} min ${secs} s` : `${fmt(whole)} min`;
}

async function saveMove({
  date,
  title,
  activity,
  minutes = 0,
  steps = 0,
  burn,
  met = null,
  described = "",
  paceKph = 0,
  distanceKm = 0,
  ts = null,
  existingId = null,
}) {
  const payload = {
    kind: "exercise",
    title,
    activity,
    // Not rounded to whole minutes — a 60:30 walk should stay 60:30.
    minutes: round(num(minutes), 0.1),
    steps: Math.round(num(steps)),
    burn: Math.round(num(burn)),
    met: met || null,
    // What you actually typed, kept so the log can show it back to you.
    described: String(described || "").slice(0, 200),
    paceKph: round(num(paceKph), 0.1),
    distanceKm: round(num(distanceKm), 0.01),
    source: "manual",
  };
  // The time is editable on both paths — you rarely log a workout the moment
  // you finish it.
  if (existingId) await updateEntry(date, existingId, { ...payload, ts: ts || Date.now() });
  else await addEntry({ ...payload, date, ts: ts || Date.now() });
  haptic(14);
  burst($("#fab"));
  toast(`+${fmt(payload.burn)} kcal back in the budget`, { tone: "good", icon: "bolt" });
}


/* ------------------------------------------------------- partner's day --- */
/* You two eat the same food most days, so seeing the other's log and copying a
   row onto your own is the shortcut that actually gets used. Read-only on their
   side — copying writes to YOUR day, never to theirs. */

export function openPartnerSheet(date = dayKey()) {
  const other = partner();
  const list = entriesFor(date, state.partner.days);
  const t = totalsFor(date, state.partner.days, state.partner.profile);

  openSheet({
    title: `${other.name}'s day`,
    subtitle: list.length
      ? `${t.meals} meal${t.meals === 1 ? "" : "s"}${t.burn ? ` · ${fmt(t.burn)} kcal burned` : ""}`
      : "nothing logged yet",
    icon: "favorite",
    wide: true,
    build(body, sheet) {
      body.innerHTML = `
        <div class="totals">
          ${METRICS.map((m) => {
            const over = t.net[m.key] > t.budget[m.key];
            return `
              <div class="total tone-${m.tone} ${over ? "is-over" : ""}">
                <span class="total-value">${m.key === "sugar_g" ? Math.round(t.net[m.key] * 10) / 10 : fmt(t.net[m.key])}</span>
                <span class="total-unit">of ${fmt(t.budget[m.key])} ${m.unit}</span>
                <span class="total-label">${m.label}</span>
              </div>`;
          }).join("")}
        </div>
        ${
          list.length
            ? `<div class="timeline timeline--sheet">${list.map(partnerRowHTML).join("")}</div>`
            : `<p class="muted-note">${esc(other.name)} hasn't logged anything today.</p>`
        }`;

      body.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-copy]");
        if (btn) {
          const src = list.find((x) => x.id === btn.dataset.copy);
          if (src) {
            haptic(10);
            copyFromPartner(src, other);
          }
          return;
        }
        const look = e.target.closest("[data-view]");
        if (look) {
          const src = list.find((x) => x.id === look.dataset.view);
          if (src) openPartnerEntrySheet(src, other);
        }
      });
      void sheet;
    },
  });
}


/** Her meal, read only — the full breakdown before you decide to copy it. */
function openPartnerEntrySheet(entry, other) {
  const isMove = entry.kind === "exercise";
  openSheet({
    title: entry.title || (isMove ? "Movement" : "Meal"),
    subtitle: `${other.name} · ${clockLabel(entry.ts)}${entry.brand ? ` · ${entry.brand}` : ""}`,
    icon: isMove ? "bolt" : "restaurant",
    build(body, sheet) {
      body.innerHTML = `
        ${entry.thumb ? `<img class="review-photo" src="${entry.thumb}" alt="" />` : ""}
        ${
          isMove
            ? `<div class="burn-box">
                 <span class="burn-label">Burned</span>
                 <div class="burn-value"><b>${fmt(entry.burn)}</b><span>kcal</span></div>
                 <p class="burn-note">${esc(entry.activity || entry.title || "")}${
                   entry.minutes ? ` · ${fmtMinutes(entry.minutes)}` : ""
                 }${entry.steps ? ` · ${fmt(entry.steps)} steps` : ""}</p>
               </div>`
            : `<div class="totals">
                 ${METRICS.map(
                   (m) => `
                   <div class="total tone-${m.tone}">
                     <span class="total-value">${
                       m.key === "sugar_g" ? Math.round(num(entry[m.key]) * 10) / 10 : fmt(entry[m.key])
                     }</span>
                     <span class="total-unit">${m.unit}</span>
                     <span class="total-label">${m.label}</span>
                   </div>`
                 ).join("")}
               </div>`
        }
        ${
          entry.items?.length
            ? `<ul class="detail-items">${entry.items
                .map(
                  (i) => `
              <li>
                <div><b>${esc(i.name)}</b>${i.qty ? `<span>${esc(i.qty)}</span>` : ""}</div>
                <div class="detail-nums">
                  <span class="tone-kcal">${fmt(i.kcal)}<i>kcal</i></span>
                  <span class="tone-sugar">${Math.round(num(i.sugar_g) * 10) / 10}<i>g</i></span>
                  <span class="tone-sodium">${fmt(i.sodium_mg)}<i>mg</i></span>
                </div>
              </li>`
                )
                .join("")}</ul>`
            : ""
        }
        ${sugarNoteHTML(entry)}
        ${entry.described ? `<p class="said-line">${icon("format_quote", "sm")}<span>${esc(entry.described)}</span></p>` : ""}
        ${entry.assumptions ? `<p class="review-assume">${icon("info", "sm")}<span>${esc(entry.assumptions)}</span></p>` : ""}
        <button class="btn btn-primary btn-block tap" id="peSame">${icon("add")}I had this too</button>`;

      body.querySelector("#peSame").onclick = () => {
        haptic(10);
        sheet.close();
        copyFromPartner(entry, other);
      };
    },
  });
}

/**
 * Copying never writes straight away — it opens the normal review sheet so the
 * distribution is on screen and the portions can be adjusted first. She eats
 * less than he does; the numbers rarely transfer one for one.
 */
function copyFromPartner(src, other) {
  const date = dayKey();
  if (src.kind === "exercise") {
    const weightKg = num(state.profile?.weightKg, me().weightKg);
    const burn = src.steps
      ? burnFromSteps({ steps: src.steps, weightKg })
      : burnFromMet({ met: src.met || DEFAULT_MET_FALLBACK, minutes: src.minutes, weightKg });
    openMoveConfirm({
      date,
      draft: {
        activity: src.activity || src.title,
        minutes: src.minutes,
        steps: src.steps,
        met: src.met || DEFAULT_MET_FALLBACK,
        paceKph: src.paceKph || 0,
        distanceKm: src.distanceKm || 0,
        burn,
      },
      weightKg,
      typed: src.described || "",
    });
    return;
  }

  openReviewSheet({
    date,
    analysis: {
      isFood: true,
      title: src.title,
      brand: src.brand || "",
      items: src.items || [],
      assumptions: src.assumptions || "",
      confidence: src.confidence || "medium",
      tip: `Same as ${other.name}`,
    },
    thumb: src.thumb || "",
    photo: src.thumb ? { base64: src.thumb.split(",")[1], mimeType: "image/jpeg" } : null,
    source: src.source || "manual",
  });
}

function partnerRowHTML(e) {
  const isMove = e.kind === "exercise";
  const thumb = e.thumb
    ? `<img src="${e.thumb}" alt="" loading="lazy" />`
    : icon(isMove ? "directions_run" : "restaurant");

  const stats = isMove
    ? `<span class="stat tone-burn">−${fmt(e.burn)}<i>kcal</i></span>`
    : `<span class="stat tone-kcal">${fmt(e.kcal)}<i>kcal</i></span>
       <span class="stat tone-sugar">${Math.round(num(e.sugar_g) * 10) / 10}<i>g</i></span>
       <span class="stat tone-sodium">${fmt(e.sodium_mg)}<i>mg</i></span>`;

  return `
    <article class="entry entry--partner">
      <div class="entry-thumb${isMove ? " entry-thumb--move" : ""}" data-view="${esc(e.id)}">${thumb}</div>
      <div class="entry-main" data-view="${esc(e.id)}" role="button" tabindex="0">
        <p class="entry-title"><span class="entry-name">${esc(e.title || "Meal")}</span></p>
        <p class="entry-sub">${esc(clockLabel(e.ts))}${e.brand ? ` · ${esc(e.brand)}` : ""}${
          !isMove && e.items?.length ? ` · ${e.items.length} item${e.items.length === 1 ? "" : "s"}` : ""
        }${isMove && e.minutes ? ` · ${fmt(e.minutes)} min` : ""}</p>
        <div class="entry-stats">${stats}</div>
      </div>
      <button class="same-btn tap" data-copy="${esc(e.id)}" aria-label="Log the same">
        ${icon("add")}Same
      </button>
    </article>`;
}

/* ------------------------------------------------------ entry details --- */

export function openEntrySheet(date, id) {
  const entry = state.days?.[date]?.[id];
  if (!entry) return;

  if (entry.kind === "exercise") {
    openMoveConfirm({
      date,
      draft: {
        activity: entry.activity || entry.title,
        minutes: entry.minutes,
        steps: entry.steps,
        met: entry.met || DEFAULT_MET_FALLBACK,
        paceKph: entry.paceKph || 0,
        distanceKm: entry.distanceKm || 0,
        burn: entry.burn,
      },
      weightKg: num(state.profile?.weightKg, me().weightKg),
      existing: entry,
      typed: entry.described || "",
    });
    return;
  }

  openSheet({
    title: entry.title || "Meal",
    subtitle: `${clockLabel(entry.ts)}${entry.brand ? ` · ${entry.brand}` : ""}`,
    icon: "restaurant",
    build(body, sheet) {
      body.innerHTML = `
        ${entry.thumb ? `<img class="review-photo" src="${entry.thumb}" alt="" />` : ""}
        <div class="totals">
          ${METRICS.map(
            (m) => `
            <div class="total tone-${m.tone}">
              <span class="total-value">${m.key === "sugar_g" ? Math.round(num(entry[m.key]) * 10) / 10 : fmt(entry[m.key])}</span>
              <span class="total-unit">${m.unit}</span>
              <span class="total-label">${m.label}</span>
            </div>`
          ).join("")}
        </div>
        ${
          entry.items?.length
            ? `<ul class="detail-items">${entry.items
                .map(
                  (i) => `
              <li>
                <div><b>${esc(i.name)}</b>${i.qty ? `<span>${esc(i.qty)}</span>` : ""}</div>
                <div class="detail-nums">
                  <span class="tone-kcal">${fmt(i.kcal)}<i>kcal</i></span>
                  <span class="tone-sugar">${Math.round(num(i.sugar_g) * 10) / 10}<i>g</i></span>
                  <span class="tone-sodium">${fmt(i.sodium_mg)}<i>mg</i></span>
                </div>
              </li>`
                )
                .join("")}</ul>`
            : ""
        }
        ${sugarNoteHTML(entry)}
        ${entry.assumptions ? `<p class="review-assume">${icon("info", "sm")}<span>${esc(entry.assumptions)}</span></p>` : ""}
        <div class="sheet-actions">
          <button class="btn btn-ghost btn-grow tap" id="deDup">${icon("content_copy")}Log again</button>
          <button class="btn btn-soft btn-grow tap" id="deEdit">${icon("edit")}Edit</button>
        </div>
        <button class="btn-quiet tap" id="deDel">${icon("delete")}Delete this entry</button>`;

      body.querySelector("#deEdit").onclick = () => {
        sheet.close();
        openReviewSheet({
          date,
          analysis: {
            title: entry.title,
            brand: entry.brand,
            items: entry.items || [],
            assumptions: entry.assumptions,
            confidence: entry.confidence,
            isFood: true,
            tip: "",
          },
          thumb: entry.thumb || "",
          // The 400 px thumbnail is the only copy of the photo we keep, and it
          // is plenty for a re-read — so "tell me what it really is" still
          // works when editing a meal logged days ago.
          photo: entry.thumb ? { base64: entry.thumb.split(",")[1], mimeType: "image/jpeg" } : null,
          source: entry.source || "manual",
          existing: entry,
        });
      };

      body.querySelector("#deDup").onclick = async () => {
        await addEntry({
          ...entry,
          id: undefined,
          date: dayKey(),
          ts: Date.now(),
        });
        haptic(12);
        burst($("#fab"));
        sheet.close();
        toast("Logged again for today", { tone: "good", icon: "content_copy" });
      };

      body.querySelector("#deDel").onclick = async () => {
        const ok = await confirmSheet({
          title: "Delete this entry?",
          message: `"${entry.title}" will be removed.`,
          icon: "delete",
        });
        if (!ok) return;
        await deleteEntry(date, id);
        sheet.close();
        toast("Deleted", { icon: "delete" });
      };
    },
  });
}

/**
 * The whole sugar figure, shown once per meal and only when it differs from the
 * part that counts. Nutrition panels print totals, so this is what you check a
 * packet against — but it has no business crowding the main screen.
 */
function sugarNoteHTML(entry) {
  const free = num(entry.sugar_g);
  const total = num(entry.sugar_total_g);
  if (!(total > free + 0.05)) return "";
  const natural = Math.round((total - free) * 10) / 10;
  return `<p class="sugar-note">${icon("water_drop", "sm")}<span><b>${
    Math.round(total * 10) / 10
  } g</b> sugar in total — ${natural} g of that is natural, from fruit or milk, which WHO doesn't count.</span></p>`;
}

/* ------------------------------------------------------------- helpers -- */

function toTimeValue(d) {
  // The <input type="time"> wants the device's local wall clock; both phones
  // are on Manila time so this matches the day key.
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fromTimeValue(value, date, fallbackTs) {
  if (!value) return fallbackTs || Date.now();
  const [h, m] = value.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, h, m, 0, 0);
  return dt.getTime();
}
