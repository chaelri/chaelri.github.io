import { haptic } from "./ui.js";
import { state } from "./state.js";
import { getDB } from "./sync/firebase.js";
import {
  ref,
  push,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const ENDPOINT = "https://gemini-proxy-668755364170.asia-southeast1.run.app";
const SYSTEM_PROMPT = `
You are a calorie estimator.

Analyze the food or exercise from the user input (text or image).

Return ONLY valid JSON. No markdown. No commentary.

Schema:
{
  "kind": "food" | "exercise",
  "items": [
    {
      "name": string,          // short, human-readable item name
      "amount": string,        // quantity (e.g. "1 cup", "2 pcs", "1 bottle")
      "kcal": number           // calories for this item
    }
  ],
  "totalKcal": number,        // sum of all items
  "confidence": 0.0-1.0,      // estimation confidence
  "notes": string             // short clarification if needed
}

Rules:
- Food calories are positive
- Exercise calories are positive (burned)
- If image is unclear, make reasonable assumptions
- Be concise and practical
- Itemize clearly (like a food diary)
- Never return text outside JSON
`;

function formatItems(items = []) {
  return items
    .map((i) => `${i.name} (${i.amount}) — ${i.kcal} kcal`)
    .join("\n");
}

export function bindLog() {
  const btn = document.getElementById("sendLogBtn");
  if (!btn) return;

  btn.onclick = async () => {
    const text = document.getElementById("logText").value.trim();
    const file = document.getElementById("logImage").files[0];
    const resultEl = document.getElementById("logResult");

    resultEl.innerHTML = `
    <div class="glass loading-card">
        <div class="loading-spinner"></div>
        <div style="display:flex;align-items:center;gap:8px;">
            <span class="material-icon">auto_awesome</span>
            Analyzing with Gemini…
        </div>
    </div>
    `;

    const payload = await buildPayload(text, file);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    const parsed = parseGemini(data, text);

    if (!parsed || typeof parsed.kcal !== "number") {
      await saveLog({
        kind: "food",
        kcal: 0,
        confidence: 0,
        notes: "⚠️ Gemini parse failed",
        raw: parsed._raw, // keep raw for inspection
      });

      resultEl.innerHTML = `
    <div class="glass pad-md">
      <strong>⚠️ Gemini parse failed (saved for debug)</strong>
      <pre style="
        margin-top:12px;
        max-height:240px;
        overflow:auto;
        font-size:12px;
        white-space:pre-wrap;
        opacity:0.85;
      ">${JSON.stringify(parsed._raw, null, 2)}</pre>
    </div>
  `;

      return;
    }

    await saveLog(parsed);

    haptic("success");

    resultEl.innerHTML = `
  <div class="glass" style="padding:12px">
    Saved ✔ Redirecting to Home…
  </div>
`;

    setTimeout(async () => {
      const { switchTab } = await import("./tabs.js");
      await switchTab("home");
      import("./insights.js").then((m) => m.bindInsights());

      // force wheel animation AFTER DOM updates
      requestAnimationFrame(() => {
        import("./today.js").then((m) => m.bindToday(true));
      });
    }, 500);
  };
}

async function saveLog(entry) {
  const { setSyncing, setLive } = await import("./sync/status.js");
  setSyncing();

  const todayKey = getTodayKey();

  if (state.today.date !== todayKey) {
    state.today.date = todayKey;
    state.today.logs = [];
    state.today.net = 0;
  }

  const log = {
    ...entry,
    ts: Date.now(),
    ownerUid: state.user.uid,
  };

  // ---------- LOCAL OPTIMISTIC UPDATE (KEPT) ----------
  state.today.logs.push(log);
  if (entry.kind === "food") state.today.net += entry.kcal;
  if (entry.kind === "exercise") state.today.net -= entry.kcal;

  // ---------- CLOUD (AUTHORITATIVE) ----------
  try {
    const db = getDB();
    const logsRef = ref(db, `users/${state.user.uid}/logs/${todayKey}`);
    await push(logsRef, log);
  } catch (e) {
    console.error("RTDB write failed", e);
  }

  setLive();
}

function getTodayKey() {
  return getLocalDateKey();
}

function getLocalDateKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

async function buildPayload(text, file) {
  if (file) {
    const base64 = await fileToBase64(file);
    return {
      prompt: `${SYSTEM_PROMPT}\n${text || ""}`,
      image: base64,
    };
  }

  return {
    contents: [
      {
        parts: [{ text: `${SYSTEM_PROMPT}\n${text}` }],
      },
    ],
  };
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data:image/*
    reader.readAsDataURL(file);
  });
}

function parseGemini(raw, userText = "") {
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const exerciseHint =
    /walk|walking|run|ran|running|jog|jogging|exercise|workout|cardio|steps|km|mile|min/i.test(
      userText
    );

  // 🔎 Extract first JSON object from Gemini output
  const match = text.match(/\{[\s\S]*?\}/);

  if (!match) {
    return {
      kind: exerciseHint ? "exercise" : "food",
      kcal: 0,
      confidence: 0,
      notes: "Unable to locate JSON in Gemini response",
      _raw: text || raw,
    };
  }

  try {
    const rawParsed = JSON.parse(match[0]);

    // 🔑 User intent ALWAYS wins
    if (exerciseHint) {
      rawParsed.kind = "exercise";
    }

    return {
      kind: rawParsed.kind,
      kcal: rawParsed.totalKcal ?? 0,
      confidence: rawParsed.confidence ?? 0,
      notes: formatItems(rawParsed.items) || rawParsed.notes || "",
      items: rawParsed.items || [],
    };
  } catch (err) {
    return {
      kind: exerciseHint ? "exercise" : "food",
      kcal: 0,
      confidence: 0,
      notes: "Invalid JSON returned by Gemini",
      _raw: match[0],
    };
  }
}
