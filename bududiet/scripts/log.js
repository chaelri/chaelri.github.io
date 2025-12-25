import { haptic } from "./ui.js";

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

    resultEl.innerHTML = "⏳ Sending to Gemini…";

    const payload = await buildPayload(text, file);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    const parsed = parseGemini(data);

    haptic("success");

    resultEl.innerHTML = `
  <div class="glass" style="padding:12px">
    <strong>${parsed.kind.toUpperCase()}</strong><br/>
    ${parsed.kind === "food" ? "➕" : "🔥"} ${parsed.kcal} kcal<br/>
    <small>${parsed.notes}</small>
  </div>
`;
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

function parseGemini(raw) {
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    return JSON.parse(text);
  } catch {
    return {
      kind: "food",
      kcal: 0,
      confidence: 0,
      notes: "Unable to parse Gemini response",
    };
  }
}
