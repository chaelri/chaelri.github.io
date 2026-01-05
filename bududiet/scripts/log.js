import { haptic } from "./ui.js";
import { state } from "./state.js";
import { getDB } from "./sync/firebase.js";
import {
  ref,
  push,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Using the streaming endpoint from your first project
const ENDPOINT =
  "https://gemini-chat-156359566254.asia-southeast1.run.app/api/chat";

const SYSTEM_PROMPT = `
You are a calorie estimator chat bot. 
When the user describes food or exercise, provide a helpful response.

CRITICAL RULE: At the END of EVERY response, you MUST include a JSON block with the estimation.
If the conversation continues (e.g., user says "only half" or "add a soda"), RE-CALCULATE the total based on the WHOLE conversation so far and provide an updated JSON block reflecting the final state of the meal/activity.

Rules for JSON:
- Respond with ONLY valid JSON inside a markdown code block.
- Schema:
{
  "kind": "food" | "exercise",
  "items": [
    { "name": string, "amount": string, "kcal": number }
  ],
  "totalKcal": number,
  "confidence": number
}
- totalKcal MUST equal sum of item kcal.

Maintain a conversational tone but never omit the JSON block.
`;

/* =============================
   State & Helpers
============================= */

let chatHistory = [];
let selectedImageData = null;
let pendingLogEntry = null;

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

function createBubble(role, text) {
  const window = document.getElementById("chatWindow");
  const div = document.createElement("div");
  // Delta: Use 'prose' class for better markdown styling and padding
  div.className =
    role === "user" ? "user-bubble-static" : "ai-bubble-static prose";

  if (role === "ai") {
    div.innerHTML = typeof marked !== "undefined" ? marked.parse(text) : text;
  } else {
    div.innerText = text;
  }

  window.appendChild(div);
  window.scrollTop = window.scrollHeight;
  return div;
}

/**
 * Delta: Aggressive cleaner.
 * Prevents "```json" or raw JSON blocks from appearing during streaming.
 */
function cleanTextForDisplay(text) {
  const jsonMarkers = ["```json", "```", '{\n  "kind"'];
  let clean = text;

  for (const marker of jsonMarkers) {
    const index = clean.indexOf(marker);
    if (index !== -1) {
      clean = clean.substring(0, index);
    }
  }
  return clean.trim();
}

/* =============================
   Bind UI
============================= */

export function bindLog() {
  const btn = document.getElementById("sendLogBtn");
  const textInput = document.getElementById("logText");
  const fileInput = document.getElementById("logImage");
  const attachBtn = document.getElementById("attachBtn");
  const saveBtn = document.getElementById("saveConfirmedBtn");
  const previewContainer = document.getElementById("imagePreview");
  const previewImg = document.getElementById("previewImg");
  const removeImg = document.getElementById("removeImg");

  if (!btn) return;

  // Handle Attachments
  attachBtn.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      selectedImageData = {
        mimeType: file.type,
        data: event.target.result.split(",")[1],
      };
      previewImg.src = event.target.result;
      previewContainer.style.display = "block";
    };
    reader.readAsDataURL(file);
  };

  removeImg.onclick = () => {
    selectedImageData = null;
    fileInput.value = "";
    previewContainer.style.display = "none";
  };

  // Main Chat Send
  btn.onclick = async () => {
    const text = textInput.value.trim();
    if (!text && !selectedImageData) return;

    // UI Feedback
    createBubble("user", text);
    const aiBubble = createBubble("ai", "...");

    const currentMessage = text;
    const currentImage = selectedImageData;

    // Reset Input
    textInput.value = "";
    selectedImageData = null;
    fileInput.value = "";
    previewContainer.style.display = "none";
    document.getElementById("confirmCard").style.display = "none";

    // Delta: Always include the System Prompt context so Gemini remembers its JSON duties
    const promptWithContext =
      chatHistory.length === 0
        ? `${SYSTEM_PROMPT}\n\nUser: ${currentMessage}`
        : `Context: ${SYSTEM_PROMPT}\n\nUser Update: ${currentMessage}`;

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptWithContext,
          history: chatHistory,
          image: currentImage,
        }),
      });

      if (!response.ok) throw new Error("Connection lost");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullAiResponse = "";
      aiBubble.innerHTML = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullAiResponse += chunk;

        const displayText = cleanTextForDisplay(fullAiResponse);

        if (typeof marked !== "undefined") {
          aiBubble.innerHTML = marked.parse(displayText || "...");
        } else {
          aiBubble.innerText = displayText || "...";
        }

        document.getElementById("chatWindow").scrollTop =
          document.getElementById("chatWindow").scrollHeight;
      }

      // Finalize history (store raw user message for history efficiency)
      chatHistory.push({ role: "user", parts: [{ text: currentMessage }] });
      chatHistory.push({ role: "model", parts: [{ text: fullAiResponse }] });

      // Try to parse calories
      const parsed = parseGemini(fullAiResponse, currentMessage);
      if (parsed) {
        pendingLogEntry = parsed;
        showConfirmation(parsed);
      }
    } catch (err) {
      aiBubble.innerText = "Error: " + err.message;
      aiBubble.style.color = "#ff8888";
    }
  };

  // Confirm and Save
  saveBtn.onclick = async () => {
    if (!pendingLogEntry) return;

    await saveLog(pendingLogEntry);
    haptic("success");

    document.getElementById("logResult").innerHTML = `
      <div class="glass" style="padding:12px; border-left: 4px solid #4CAF50;">
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
    }, 800);
  };
}

function showConfirmation(data) {
  const card = document.getElementById("confirmCard");
  const display = document.getElementById("pendingLogDisplay");

  const icon = data.kind === "food" ? "🍕" : "🏃‍♂️";
  const color = data.kind === "food" ? "#ff9800" : "#03a9f4";

  display.innerHTML = `
    <div style="display:flex; justify-content: space-between; align-items: center;">
      <span>${icon} ${data.kind.toUpperCase()}</span>
      <span style="color: ${color}; font-size: 24px;">${data.kcal} kcal</span>
    </div>
    <div style="font-size: 12px; opacity: 0.7; font-weight: normal; margin-top: 4px;">
      ${data.notes.replace(/\n/g, ", ")}
    </div>
  `;

  card.style.display = "block";
  document.getElementById("chatWindow").scrollTop =
    document.getElementById("chatWindow").scrollHeight;
}

/* =============================
   Gemini handling
============================= */

function parseGemini(combinedText, userText = "") {
  const match = combinedText.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const data = JSON.parse(match[0]);
    const exerciseHint =
      /walk|walking|run|ran|running|jog|exercise|workout|steps|km|min/i.test(
        userText
      );
    const kind = exerciseHint ? "exercise" : data.kind || "food";
    const kcal = Number(data.totalKcal);

    if (!Number.isFinite(kcal)) return null;

    return {
      kind,
      kcal,
      confidence: data.confidence ?? 0,
      notes: formatItems(data.items) || data.notes || "",
      items: data.items || [],
    };
  } catch (err) {
    console.error("[Gemini] JSON.parse failed", err);
    return null;
  }
}

/* =============================
   Save log
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

  state.today.logs.push(log);
  if (log.kind === "food") state.today.net += log.kcal;
  if (log.kind === "exercise") state.today.net -= log.kcal;

  try {
    const db = getDB();
    const logsRef = ref(db, `users/${state.user.uid}/logs/${todayKey}`);
    await push(logsRef, log);

    // Reset local session history after save
    chatHistory = [];
    pendingLogEntry = null;
  } catch (e) {
    console.error("RTDB write failed", e);
  }

  setLive();
}
