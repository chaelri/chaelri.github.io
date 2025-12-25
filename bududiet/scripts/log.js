import { haptic } from "./ui.js";
import { state } from "./state.js";

const ENDPOINT = "https://gemini-proxy-668755364170.asia-southeast1.run.app";
const SYSTEM_PROMPT = `
You are a calorie estimator.
Return ONLY valid JSON, no markdown, no commentary.

Schema:
{
  "kind": "food" | "exercise",
  "kcal": number,          // positive integer
  "confidence": 0.0-1.0,   // float
  "notes": string          // short explanation
}

Rules:
- Food adds calories (positive kcal)
- Exercise burns calories (positive kcal)
- If unsure, make best estimate
- Never return text outside JSON
`;

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

    if (parsed.kcal === 0 && parsed.confidence === 0) {
      saveLog({
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

    saveLog(parsed);

    haptic("success");

    resultEl.innerHTML = `
  <div class="glass" style="padding:12px">
    Saved ✔ Redirecting to Home…
  </div>
`;

    setTimeout(async () => {
      const { switchTab } = await import("./tabs.js");
      await switchTab("home");

      // force wheel animation AFTER DOM updates
      requestAnimationFrame(() => {
        import("./today.js").then((m) => m.bindToday(true));
      });
    }, 500);
  };
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

  try {
    const parsed = JSON.parse(text);

    // 🔑 user intent wins over Gemini ambiguity
    if (exerciseHint) {
      parsed.kind = "exercise";
    }

    return parsed;
  } catch {
    return {
      kind: exerciseHint ? "exercise" : "food",
      kcal: 0,
      confidence: 0,
      notes: "Unable to parse Gemini response",
      _raw: text || raw,
    };
  }
}

function saveLog(entry) {
  const todayKey = getTodayKey();

  if (state.today.date !== todayKey) {
    state.today.date = todayKey;
    state.today.logs = [];
    state.today.net = 0;
  }

  const log = {
    ...entry,
    ts: Date.now(),
  };

  state.today.logs.push(log);

  if (entry.kind === "food") state.today.net += entry.kcal;
  if (entry.kind === "exercise") state.today.net -= entry.kcal;

  persistToday();
}

function persistToday() {
  const key = getStorageKey();
  localStorage.setItem(key, JSON.stringify(state.today));
}

function restoreToday() {
  const key = getStorageKey();
  const raw = localStorage.getItem(key);
  if (!raw) return;

  state.today = JSON.parse(raw);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getStorageKey() {
  return `bududiet:${state.user.email}:today`;
}

restoreToday();
