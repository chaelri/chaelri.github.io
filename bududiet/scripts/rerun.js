import { haptic } from "./ui.js";

const ENDPOINT = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

const SYSTEM_PROMPT = `
You are a calorie estimator.
Return ONLY valid JSON.

Schema:
{ "kind":"food|exercise","kcal":number,"confidence":0-1,"notes":string }
`;

export async function rerunGemini(text, file) {
  const payload = await buildPayload(text, file);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const parsed = parseGemini(data);

  haptic("success");
  return parsed;
}

async function buildPayload(text, file) {
  if (file) {
    const base64 = await fileToBase64(file);
    return { prompt: `${SYSTEM_PROMPT}\n${text}`, image: base64 };
  }
  return { contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n${text}` }] }] };
}

function parseGemini(raw) {
  let text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  text = text
    .replace(/```json/i, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    return {
      kind: "food",
      kcal: 0,
      confidence: 0,
      notes: "Unable to parse Gemini response",
      _raw: text, // keep for debugging
    };
  }
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.readAsDataURL(file);
  });
}
