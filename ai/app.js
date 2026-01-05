const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatWindow = document.getElementById("chat-window");
const fileInput = document.getElementById("file-input");
const attachBtn = document.getElementById("attach-btn");
const previewContainer = document.getElementById("image-preview-container");
const previewImg = document.getElementById("preview-img");
const removeImg = document.getElementById("remove-img");

const CLOUD_RUN_URL =
  "https://gemini-chat-156359566254.asia-southeast1.run.app";
let chatHistory = [];
let selectedImageData = null;

const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Delta: Handle Attachment Click
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImageData = {
      mimeType: file.type,
      data: event.target.result.split(",")[1], // Get base64 data only
    };
    previewImg.src = event.target.result;
    previewContainer.style.display = "flex";
  };
  reader.readAsDataURL(file);
};

removeImg.onclick = () => {
  selectedImageData = null;
  fileInput.value = "";
  previewContainer.style.display = "none";
};

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
  if (!message && !selectedImageData) return;

  // Delta: If image exists, add it to UI bubble
  addMessage("user", message, selectedImageData);

  const currentMessage = message;
  const currentImage = selectedImageData;

  // Reset UI
  userInput.value = "";
  userInput.style.height = "auto";
  selectedImageData = null;
  fileInput.value = "";
  previewContainer.style.display = "none";

  const aiBubble = addMessage("ai", "...");
  let fullAiResponse = "";

  try {
    const response = await fetch(`${CLOUD_RUN_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: currentMessage,
        history: chatHistory,
        image: currentImage, // Delta: Send image to proxy
      }),
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

    chatHistory.push({ role: "user", parts: [{ text: currentMessage }] });
    chatHistory.push({ role: "model", parts: [{ text: fullAiResponse }] });
  } catch (err) {
    aiBubble.innerText = "Error: " + err.message;
    aiBubble.classList.add("text-red-400");
  }
});

function addMessage(role, text, imageData = null) {
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

  // Delta: If user sent image, display it in the bubble
  if (imageData && role === "user") {
    const img = document.createElement("img");
    img.src = `data:${imageData.mimeType};base64,${imageData.data}`;
    img.className = "chat-img";
    bubble.appendChild(img);
  }

  const textNode = document.createElement("div");
  if (role === "user") {
    textNode.innerText = text;
  } else {
    textNode.innerHTML = marked.parse(text);
  }
  bubble.appendChild(textNode);

  if (role === "ai") {
    wrapper.innerHTML = iconHtml;
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
  }

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return textNode;
}
