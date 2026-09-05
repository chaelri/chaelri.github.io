// Adding and editing entries: the photo flow, the typed flow, exercise, steps,
// and the review sheet where the AI's guess can be argued with.

import { METRICS } from "./config.js";
import { state, addEntry, updateEntry, deleteEntry, me } from "./store.js";
import {
  prepImage,
  analyzeMealPhoto,
  analyzeMealText,
  analyzeExercise,
  sumItems,
  burnFromMet,
  burnFromSteps,
} from "./ai.js";
import { openSheet, confirmSheet, toast, burst, fieldHTML, segmentedHTML, wireSegmented } from "./ui.js";
import { dayKey, clockLabel, esc, icon, fmt, num, round, uid, haptic, $ } from "./util.js";

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
          ${choice("exercise", "directions_run", "Workout", "Earn some back")}
          ${choice("steps", "footprint", "Steps", "Log today's count")}
        </div>`;

      body.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pick]");
        if (!btn) return;
        const pick = btn.dataset.pick;
        sheet.close();
        if (pick === "camera") pickImage({ camera: true, date });
        else if (pick === "library") pickImage({ camera: false, date });
        else if (pick === "describe") openDescribeSheet(date);
        else if (pick === "exercise") openMoveSheet(date, "workout");
        else if (pick === "steps") openMoveSheet(date, "steps");
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
      body.innerHTML = `
        <textarea class="ta" id="mealText" rows="3" placeholder="1 cup rice, 2 pcs chicken adobo, 1 can coke"></textarea>
        <div class="hint-chips">
          ${["1 cup rice + adobo", "Jollibee Chickenjoy 1pc", "2 pandesal + kape", "Milk tea, medium"]
            .map((s) => `<button class="hint-chip tap" data-fill="${esc(s)}">${esc(s)}</button>`)
            .join("")}
        </div>
        <button class="btn btn-primary btn-block" id="goText">${icon("auto_awesome")}Estimate it</button>`;

      const ta = body.querySelector("#mealText");
      body.querySelectorAll("[data-fill]").forEach((chip) => {
        chip.onclick = () => {
          ta.value = chip.dataset.fill;
          ta.focus();
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

          ${
            photo || typed
              ? `<div class="fixit">
                   <p class="fixit-label">${icon("psychology_alt", "sm")}Not quite right? Tell me what it really is.</p>
                   <div class="fixit-row">
                     <input id="rvHint" placeholder="e.g. that's tapsilog, and the rice is 2 cups" />
                     <button class="btn btn-soft tap" id="rvRerun">${icon("refresh")}</button>
                   </div>
                 </div>`
              : ""
          }

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
            const next = photo
              ? await analyzeMealPhoto({ ...photo, hint, previous: draft })
              : await analyzeMealText(`${typed}. Correction: ${hint}`);
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
          sugar_g: round(t.sugar_g, 0.1),
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

export function openMoveSheet(date = dayKey(), mode = "workout") {
  const weightKg = num(state.profile?.weightKg, me().weightKg);

  openSheet({
    title: "Log movement",
    subtitle: "Burned calories go back into today's budget",
    icon: "directions_run",
    build(body, sheet) {
      body.innerHTML = `
        ${segmentedHTML("moveMode", [
          { value: "workout", label: "Workout", icon: "fitness_center" },
          { value: "steps", label: "Steps", icon: "footprint" },
        ], mode)}
        <div id="movePane" class="pane"></div>`;

      const pane = body.querySelector("#movePane");
      const paint = (m) => (m === "steps" ? paintSteps() : paintWorkout());
      wireSegmented(body, "moveMode", paint);

      function paintWorkout() {
        pane.innerHTML = `
          <textarea class="ta" id="moveText" rows="2" placeholder="30 min brisk walk sa park"></textarea>
          <div class="hint-chips">
            ${["30 min brisk walk", "1 hour badminton", "45 min gym, weights", "20 min jog"]
              .map((s) => `<button class="hint-chip tap" data-fill="${esc(s)}">${esc(s)}</button>`)
              .join("")}
          </div>
          <button class="btn btn-primary btn-block" id="moveGo">${icon("auto_awesome")}Estimate the burn</button>`;

        const ta = pane.querySelector("#moveText");
        pane.querySelectorAll("[data-fill]").forEach((c) => (c.onclick = () => (ta.value = c.dataset.fill)));

        pane.querySelector("#moveGo").onclick = async () => {
          const text = ta.value.trim();
          if (!text) return toast("Describe the workout first", { tone: "warn" });
          const btn = pane.querySelector("#moveGo");
          btn.disabled = true;
          btn.innerHTML = `<span class="spinner"></span>Thinking…`;
          try {
            const parsed = await analyzeExercise(text);
            const burn = parsed.steps
              ? burnFromSteps({ steps: parsed.steps, weightKg })
              : burnFromMet({ met: parsed.met, minutes: parsed.minutes, weightKg });
            sheet.close();
            openMoveConfirm({ date, draft: { ...parsed, burn }, weightKg });
          } catch (err) {
            btn.disabled = false;
            btn.innerHTML = `${icon("auto_awesome")}Estimate the burn`;
            toast(err.message || "Couldn't read that", { tone: "danger" });
          }
        };
      }

      function paintSteps() {
        pane.innerHTML = `
          <div class="steps-pane">
            <div class="steps-value">
              <input id="stepsInput" type="text" inputmode="numeric" value="5,000" aria-label="Steps" />
              <span>steps</span>
            </div>
            <p class="steps-burn" id="stepsBurn"></p>
            <div class="hint-chips hint-chips--center">
              ${[3000, 5000, 8000, 10000, 12000]
                .map((n) => `<button class="hint-chip tap" data-steps="${n}">${fmt(n)}</button>`)
                .join("")}
            </div>
            <button class="btn btn-primary btn-block" id="stepsSave">${icon("check")}Log steps</button>
          </div>`;

        const input = pane.querySelector("#stepsInput");
        const burnLine = pane.querySelector("#stepsBurn");
        // A grouped number is the whole point of this screen, so the field is
        // text and re-formats as you type.
        const readSteps = () => num(input.value.replace(/[^\d]/g, ""));
        const refresh = () => {
          const steps = readSteps();
          const burn = burnFromSteps({ steps, weightKg });
          burnLine.innerHTML = `≈ <b>${fmt(burn)}</b> kcal burned at ${fmt(weightKg)} kg`;
        };
        input.addEventListener("input", () => {
          const digits = input.value.replace(/[^\d]/g, "").slice(0, 6);
          input.value = digits ? Number(digits).toLocaleString("en-US") : "";
          refresh();
        });
        pane.querySelectorAll("[data-steps]").forEach((c) => {
          c.onclick = () => {
            input.value = Number(c.dataset.steps).toLocaleString("en-US");
            refresh();
            haptic(6);
          };
        });
        refresh();

        pane.querySelector("#stepsSave").onclick = async () => {
          const steps = readSteps();
          if (steps <= 0) return toast("How many steps?", { tone: "warn" });
          await saveMove({
            date,
            title: `${fmt(steps)} steps`,
            activity: "Walking",
            steps,
            minutes: Math.round(steps / 110), // ~110 steps a minute at a normal pace
            burn: burnFromSteps({ steps, weightKg }),
          });
          sheet.close();
        };
      }

      paint(mode);
    },
  });
}

/** Second step of the workout flow — everything the AI guessed, editable. */
function openMoveConfirm({ date, draft, weightKg, existing = null }) {
  openSheet({
    title: existing ? "Edit movement" : "Sounds right?",
    icon: "bolt",
    build(body, sheet) {
      body.innerHTML = `
        ${fieldHTML({ id: "mcAct", label: "Activity", value: draft.activity })}
        <div class="two-col">
          ${fieldHTML({ id: "mcMin", label: "Minutes", value: draft.minutes, type: "number", inputmode: "numeric" })}
          ${fieldHTML({ id: "mcSteps", label: "Steps", value: draft.steps || 0, type: "number", inputmode: "numeric" })}
        </div>
        <div class="burn-box">
          <span class="burn-label">Estimated burn</span>
          <div class="burn-value"><b id="mcBurn">${fmt(draft.burn)}</b><span>kcal</span></div>
          <p class="burn-note">${esc(draft.activity)} at ${fmt(weightKg)} kg${
            draft.met ? ` · MET ${draft.met}` : ""
          }</p>
        </div>
        <div class="sheet-actions">
          ${existing ? `<button class="btn btn-ghost btn-danger-text tap" id="mcDelete">${icon("delete")}Delete</button>` : ""}
          <button class="btn btn-primary btn-grow tap" id="mcSave">${icon("check")}${existing ? "Save" : "Log it"}</button>
        </div>`;

      const recalc = () => {
        const minutes = num(body.querySelector("#mcMin").value);
        const steps = num(body.querySelector("#mcSteps").value);
        const burn = steps
          ? burnFromSteps({ steps, weightKg })
          : burnFromMet({ met: draft.met, minutes, weightKg });
        body.querySelector("#mcBurn").textContent = fmt(burn);
        return { minutes, steps, burn };
      };
      body.querySelector("#mcMin").addEventListener("input", recalc);
      body.querySelector("#mcSteps").addEventListener("input", recalc);

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
          existingId: existing?.id,
        });
        sheet.close();
      };
    },
  });
}

async function saveMove({ date, title, activity, minutes = 0, steps = 0, burn, met = null, existingId = null }) {
  const payload = {
    kind: "exercise",
    title,
    activity,
    minutes: Math.round(num(minutes)),
    steps: Math.round(num(steps)),
    burn: Math.round(num(burn)),
    met: met || null,
    source: "manual",
  };
  if (existingId) await updateEntry(date, existingId, payload);
  else await addEntry({ ...payload, date, ts: Date.now() });
  haptic(14);
  burst($("#fab"));
  toast(`+${fmt(payload.burn)} kcal back in the budget`, { tone: "good", icon: "bolt" });
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
        met: entry.met || 4,
        burn: entry.burn,
      },
      weightKg: num(state.profile?.weightKg, me().weightKg),
      existing: entry,
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
