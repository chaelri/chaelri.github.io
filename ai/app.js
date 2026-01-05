const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");

const CLOUD_RUN_URL =
  "https://gemini-chat-156359566254.asia-southeast1.run.app";

let chatHistory = [];

const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isTouchDevice) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

function scrollToBottom() {
  const threshold = 150;
  const position = chatWindow.scrollTop + chatWindow.offsetHeight;
  const height = chatWindow.scrollHeight;

  if (height - position < threshold) {
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
  }
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  addMessage("user", message);
  userInput.value = "";
  userInput.style.height = "auto";

  const aiBubble = addMessage("ai", "...");
  let fullAiResponse = "";

  try {
    const response = await fetch(`${CLOUD_RUN_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, history: chatHistory }),
    });

    if (!response.ok) throw new Error("Connection lost");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    aiBubble.innerHTML = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullAiResponse += chunk;

      aiBubble.innerHTML = marked.parse(fullAiResponse);
      scrollToBottom();
    }

    chatHistory.push({ role: "user", parts: [{ text: message }] });
    chatHistory.push({ role: "model", parts: [{ text: fullAiResponse }] });
  } catch (err) {
    aiBubble.innerText = "Error: " + err.message;
    aiBubble.classList.add("text-red-400");
  }
});

function addMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className =
    role === "user"
      ? "flex flex-col items-end w-full"
      : "flex gap-4 self-start w-full chat-bubble";

  const iconHtml =
    role === "ai"
      ? `
        <div class="w-9 h-9 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center border border-blue-500 shadow-md">
            <span class="material-icons text-[18px] text-white">smart_toy</span>
        </div>`
      : "";

  const bubble = document.createElement("div");
  bubble.className =
    role === "user"
      ? "user-bubble bg-blue-600 text-white p-4 md:p-5 rounded-2xl shadow-lg w-full md:w-auto md:max-w-[80%]"
      : "ai-bubble bg-gray-900/50 border border-gray-800 p-5 md:p-6 rounded-2xl shadow-sm prose text-gray-200 w-full";

  if (role === "user") {
    bubble.innerText = text;
  } else {
    bubble.innerHTML = marked.parse(text);
  }

  if (role === "ai") {
    wrapper.innerHTML = iconHtml;
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
  }

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}
