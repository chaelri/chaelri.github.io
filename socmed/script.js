import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  remove,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8ahT56WbEUaGAymsRNNA-DrfZnUnWIwk",
  authDomain: "test-database-55379.firebaseapp.com",
  databaseURL:
    "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test-database-55379",
  storageBucket: "test-database-55379.firebasestorage.app",
  messagingSenderId: "933688602756",
  appId: "1:933688602756:web:392a3a4ce040cb9d4452d1",
};

const DISCORD_WEBHOOK =
  "https://discord.com/api/webhooks/1455866114566394030/57vSHclXceCLQakqwaUoYtPMHSvGkpA58X2kxKZgoWAtv_2rsYsKqStcIEhiVu3x32Aj";
const PROXY_URL = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let currentSource = "CCFMain";
const SOURCES = {
  CCFMain: "https://news.google.com/rss/search?q=site:facebook.com/CCFMain",
  ElevateMain:
    "https://news.google.com/rss/search?q=site:facebook.com/ElevateMain",
};

// --- CORE LOGIC ---

async function generateScripts() {
  document.getElementById("loader").classList.remove("hidden");
  const btn = document.getElementById("generateBtn");
  btn.disabled = true;

  try {
    const corsProxy = `https://api.allorigins.win/get?url=${encodeURIComponent(
      SOURCES[currentSource]
    )}`;
    const rssRes = await fetch(corsProxy);
    const rssData = await rssRes.json();
    const parser = new DOMParser();
    const xml = parser.parseFromString(rssData.contents, "text/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, 3);
    const context = items
      .map((i) => i.querySelector("title").textContent)
      .join(" | ");

    const aiResponse = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Context: ${context}. 
                        Task: Create 3 High-Retention REEL Scripts for ${currentSource}.
                        
                        CRITICAL FORMATTING INSTRUCTIONS:
                        1. Use ONLY this layout for each script.
                        2. Do NOT use markdown symbols like ** or ##.
                        3. Separate each script with the word [NEXT_SCRIPT].
                        
                        TEMPLATE:
                        TITLE: [Catchy Production Title]
                        SOURCE: [Link or Ref]
                        ANTI-SWIPE HOOK: [Visual + Audio Hook]
                        THE VIBE: [Aesthetic description]
                        SHOT BREAKDOWN:
                        Shot 1 (0-2s): [Action]
                        Shot 2 (2-5s): [Action]
                        Shot 3 (5-8s): [Action]
                        Shot 4 (Final): [CTA]
                        EDITING TRICK: [Technical trick]
                        CAPTION: [Captivating text]`,
              },
            ],
          },
        ],
      }),
    });

    const data = await aiResponse.json();
    const suggestions =
      data.candidates[0].content.parts[0].text.split("[NEXT_SCRIPT]");

    suggestions.forEach((scriptText) => {
      if (scriptText.length < 50) return;
      push(ref(db, "content_ideas"), {
        content: scriptText.replace(/\*/g, "").trim(),
        source: currentSource,
        timestamp: Date.now(),
      });
    });
  } catch (e) {
    console.error(e);
  }
  document.getElementById("loader").classList.add("hidden");
  btn.disabled = false;
}

function renderCard(id, data) {
  const card = document.createElement("div");
  card.className = "production-card p-8 animate-in relative group";

  // Parse the structured text into a nicer HTML view
  const formattedContent = data.content
    .replace(
      /TITLE:/g,
      '<span class="text-white font-black text-xl mb-4 block">'
    )
    .replace(/SOURCE:/g, '</span><span class="section-label">Source</span>')
    .replace(
      /ANTI-SWIPE HOOK:/g,
      '<span class="section-label">Anti-Swipe Hook</span><div class="content-block text-rose-400 font-bold italic mb-4">'
    )
    .replace(/THE VIBE:/g, '</div><span class="section-label">The Vibe</span>')
    .replace(
      /SHOT BREAKDOWN:/g,
      '<span class="section-label">Shot-by-Shot Breakdown</span>'
    )
    .replace(
      /EDITING TRICK:/g,
      '<span class="section-label">Editing Trick</span>'
    )
    .replace(
      /CAPTION:/g,
      '<span class="section-label">Caption</span><div class="text-slate-500 text-xs">'
    );

  card.innerHTML = `
        <div class="flex justify-between items-start mb-6">
            <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span class="text-[10px] font-black text-slate-500 tracking-widest uppercase">${data.source} // LIVE SCRIPT</span>
            </div>
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                <button onclick="copyToRefiner('${id}')" class="w-10 h-10 bg-white/5 hover:bg-rose-500 rounded-full flex items-center justify-center transition-all">
                    <span class="material-icons text-sm text-white">auto_fix_high</span>
                </button>
                <button onclick="sendToDiscord('${id}')" class="w-10 h-10 bg-white/5 hover:bg-indigo-600 rounded-full flex items-center justify-center transition-all">
                    <span class="material-icons text-sm text-white">send</span>
                </button>
                <button onclick="deleteScript('${id}')" class="w-10 h-10 bg-white/5 hover:bg-slate-700 rounded-full flex items-center justify-center transition-all text-slate-500 hover:text-white">
                    <span class="material-icons text-sm">delete</span>
                </button>
            </div>
        </div>
        <div id="content-${id}" class="space-y-4 text-sm leading-relaxed">
            ${formattedContent}</div>
        </div>
        <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            <span>Production Board v2.0</span>
            <span>Anti-Low Retention Optimized</span>
        </div>
    `;
  document.getElementById("ideasGrid").appendChild(card);
}

// --- SYNC & ACTIONS ---
onValue(ref(db, "content_ideas"), (snap) => {
  const grid = document.getElementById("ideasGrid");
  grid.innerHTML = "";
  let count = 0;
  const data = snap.val();
  if (data) {
    Object.keys(data)
      .reverse()
      .forEach((key) => {
        if (data[key].source === currentSource) {
          renderCard(key, data[key]);
          count++;
        }
      });
  }
  document.getElementById("counter").innerText = `${count} SCRIPTS LOADED`;
});

window.copyToRefiner = (id) => {
  const text = document.getElementById(`content-${id}`).innerText;
  document.getElementById("chatInput").value = text;
  document.getElementById("chatInput").focus();
};

window.sendToDiscord = async (id) => {
  const text = document.getElementById(`content-${id}`).innerText;
  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Director's Cut Studio",
      embeds: [
        {
          title: "🎬 New Production Script",
          description: text,
          color: 15548997,
        },
      ],
    }),
  });
  alert("Script Dispatched to Discord!");
};

window.deleteScript = (id) => remove(ref(db, `content_ideas/${id}`));

// --- NAVIGATION ---
document.getElementById("sourceCCF").onclick = () => {
  currentSource = "CCFMain";
  document.getElementById("sourceCCF").classList.add("active");
  document.getElementById("sourceElevate").classList.remove("active");
  syncView();
};

document.getElementById("sourceElevate").onclick = () => {
  currentSource = "ElevateMain";
  document.getElementById("sourceElevate").classList.add("active");
  document.getElementById("sourceCCF").classList.remove("active");
  syncView();
};

function syncView() {
  onValue(ref(db, "content_ideas"), () => {}); // Trigger re-render
}

document.getElementById("generateBtn").onclick = generateScripts;
