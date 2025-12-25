import { haptic } from "./ui.js";

const ENDPOINT = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

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

    haptic("success");

    resultEl.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  };
}

async function buildPayload(text, file) {
  if (file) {
    const base64 = await fileToBase64(file);
    return {
      prompt: text || undefined,
      image: base64,
    };
  }

  return {
    contents: [
      {
        parts: [{ text }],
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
