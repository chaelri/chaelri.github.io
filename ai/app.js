const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");

const CLOUD_RUN_URL =
  "https://gemini-chat-156359566254.asia-southeast1.run.app";

let chatHistory = [];

// Delta: Auto-expand textarea logic
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
  if (this.scrollHeight > 200) {
    this.style.overflowY = "scroll";
    this.style.height = "200px";
  } else {
    this.style.overflowY = "hidden";
  }
});

// Delta: Handle Enter to submit vs Shift+Enter for newline
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  addMessage("user", message);

  // Reset textarea height
  userInput.value = "";
  userInput.style.height = "auto";

  const aiBubble = addMessage("ai", "Thinking...");
  let fullAiResponse = "";

  try {
    const response = await fetch(`${CLOUD_RUN_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, history: chatHistory }),
    });

    if (!response.ok) throw new Error("Connection failed");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    aiBubble.innerHTML = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullAiResponse += chunk;

      // Delta: Render Markdown into HTML as the chunks arrive
      aiBubble.innerHTML = marked.parse(fullAiResponse);

      chatWindow.scrollTop = chatWindow.scrollHeight;
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
      : "flex gap-3 self-start max-w-[85%] md:max-w-[70%]";

  const iconHtml =
    role === "ai"
      ? `
        <div class="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center border border-blue-500 shadow-sm">
            <span class="material-icons text-sm text-white">auto_awesome</span>
        </div>`
      : "";

  const bubble = document.createElement("div");
  bubble.className =
    role === "user"
      ? "bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none max-w-[85%] md:max-w-[70%] shadow-lg"
      : "bg-gray-800/50 border border-gray-700 p-4 rounded-2xl rounded-tl-none shadow-sm prose text-gray-200";

  // Delta: Use innerHTML to allow Markdown to render
  if (role === "user") {
    bubble.innerText = text; // User messages usually don't need markdown
  } else {
    bubble.innerHTML = marked.parse(text); // AI messages ALWAYS parsed
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
