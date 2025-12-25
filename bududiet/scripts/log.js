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
      "name": string,
      "amount": string,
      "kcal": number
    }
  ],
  "totalKcal": number,
  "confidence": 0.0-1.0,
  "notes": string
}

Rules:
- Food calories are positive
- Exercise calories are positive (burned)
- If image is unclear, make reasonable assumptions
- Be concise and practical
- Itemize clearly (like a food diary)
- Never return text outside JSON
`;

/* =============================
   Helpers
============================= */

function getLocalDateKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatItems(items = []) {
  return items
    .map((i) => `${i.name} (${i.amount}) — ${i.kcal} kcal`)
    .join("\n");
}

/* =============================
   Bind UI
============================= */

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

    const raw = await res.json();
    const parsed = parseGemini(raw, text);

    if (!parsed) {
      await saveLog({
        kind: "food",
        kcal: 0,
        confidence: 0,
        notes: "⚠️ Gemini parse failed",
      });

      resultEl.innerHTML = `
        <div class="glass pad-md">
          <strong>⚠️ Gemini parse failed</strong>
          <pre style="margin-top:12px;font-size:12px;opacity:0.85;">
${JSON.stringify(raw, null, 2)}
          </pre>
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

      requestAnimationFrame(() => {
        import("./today.js").then((m) => m.bindToday(true));
        import("./insights.js").then((m) => m.bindInsights());
      });
    }, 500);
  };
}

/* =============================
   Gemini handling
============================= */

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
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function parseGemini(raw, userText = "") {
  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
    "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[0]);

    const exerciseHint =
      /walk|walking|run|ran|running|jog|exercise|workout|steps|km|min/i.test(
        userText
      );

    const kind = exerciseHint ? "exercise" : data.kind || "food";
    const kcal = Number(data.totalKcal) || 0;

    return {
      kind,
      kcal,
      confidence: data.confidence ?? 0,
      notes: formatItems(data.items) || data.notes || "",
      items: data.items || [],
    };
  } catch {
    return null;
  }
}

/* =============================
   Save log (unchanged logic)
============================= */

async function saveLog(entry) {
  const { setSyncing, setLive } = await import("./sync/status.js");
  setSyncing();

  const todayKey = getLocalDateKey();

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

  // optimistic local update
  state.today.logs.push(log);
  if (log.kind === "food") state.today.net += log.kcal;
  if (log.kind === "exercise") state.today.net -= log.kcal;

  try {
    const db = getDB();
    const logsRef = ref(db, `users/${state.user.uid}/logs/${todayKey}`);
    await push(logsRef, log);
  } catch (e) {
    console.error("RTDB write failed", e);
  }

  setLive();
}
