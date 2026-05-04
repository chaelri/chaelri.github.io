function saveComments() {
  localStorage.setItem("bibleComments", JSON.stringify(comments));
}

const keyOf = (b, c, v) => `${b}-${c}-${v}`;
const devotionId = () =>
  `${bookEl.value}-${chapterEl.value}-${verseEl.value || ""}`;

function resetAISections() {
  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
  const ntEcho = document.getElementById("ntEchoCard");
  if (ntEcho) {
    ntEcho.innerHTML = "";
    ntEcho.hidden = true;
  }
}

async function fetchInlineQuickContext(
  { book, chapter, verse, text },
  mountEl,
) {
  // Show sparkle loader inside a card shell
  mountEl.innerHTML = `<div class="inline-ai-card">
    <div class="ai-card-gradient">
      <div class="ai-card-header">
        <span class="ai-card-label">Quick Context</span>
        <button class="ai-card-close" title="Close">✕</button>
      </div>
      ${sparkleLoaderHTML('Quick context…')}
    </div>
  </div>`;
  mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };

  try {
    const aiText = await callGemini(`You are a Bible study assistant. Be extremely concise.

Explain ${book} ${chapter}:${verse} in exactly 2-3 short sentences. Start directly with the verse reference (e.g., "${book} ${chapter}:${verse} tells us..."). Cover what it means in context and why it matters. No headers, no bullet points, no fluff, no greetings — just the core insight.

IMPORTANT: Bold the key theological terms and important words using **double asterisks**.

"${text}"`);

    mountEl.innerHTML = `<div class="inline-ai-card">
      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Quick Context</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <div class="ai-md-content">${mdToHTML(aiText)}</div>
      </div>
      <div class="inline-ai-dig-footer" title="Dig Deeper">
        <span class="material-icons">auto_awesome</span>
        <span class="dig-footer-label">Dig Deeper</span>
        <span class="material-icons chevron">chevron_right</span>
      </div>
    </div>`;

    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };
    mountEl.querySelector('.inline-ai-dig-footer').onclick = () => {
      fetchInlineDigDeeper({ book, chapter, verse, text }, mountEl);
    };
  } catch {
    mountEl.innerHTML = `<div class="inline-ai-card">
      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Quick Context</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;">Failed to load quick context.</p>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };
  }
}

async function toggleVerseChat(key, book, chapter, verse, text, mountEl) {
  if (mountEl.querySelector(".verse-chat-wrapper")) {
    mountEl.innerHTML = "";
    // Reset chat memory on close — user wants every reopen to start fresh
    // ("pag inopen ulit dapat refreshed"). Suggestions/followups too.
    delete verseChatHistories[key];
    if (window._chatSuggestions) delete window._chatSuggestions[key];
    if (window._chatFollowups) delete window._chatFollowups[key];
    return;
  }

  // Track suggestions and follow-ups per key.
  if (!window._chatSuggestions) window._chatSuggestions = {};
  if (!window._chatFollowups) window._chatFollowups = {};
  // History always starts empty on open (we wiped it on the previous close,
  // but be defensive in case the chat was first-opened in a stale path).
  verseChatHistories[key] = [];
  const hasHistory = false;


  mountEl.innerHTML = `
    <div class="verse-chat-wrapper">
      <div class="chat-history${hasHistory ? "" : " hidden"}" id="chat-hist-${key}"></div>
      <div id="chat-empty-${key}" class="${hasHistory ? "hidden" : ""}">
        <div class="chat-empty-state">
          <span class="material-icons">chat_bubble_outline</span>
          <span class="chat-empty-text">Ask anything about this verse</span>
          <div class="chat-suggestions" id="chat-suggest-${key}">
            ${sparkleLoaderHTML('Loading questions…')}
          </div>
        </div>
      </div>
      <div id="chat-followups-${key}" class="chat-followups" style="display:none"></div>
      <div id="chat-typing-${key}" class="chat-typing" style="display:none">
        ${sparkleLoaderHTML('Thinking…')}
      </div>
      <div class="chat-input-area">
        <textarea placeholder="Ask about this verse..." id="chat-input-${key}"></textarea>
        <button class="chat-send-btn" id="chat-send-${key}"><span class="material-icons">send</span></button>
      </div>
    </div>
  `;

  const input = document.getElementById(`chat-input-${key}`);
  const sendBtn = document.getElementById(`chat-send-${key}`);
  const histEl = document.getElementById(`chat-hist-${key}`);
  const emptyEl = document.getElementById(`chat-empty-${key}`);
  const suggestEl = document.getElementById(`chat-suggest-${key}`);
  const followupsEl = document.getElementById(`chat-followups-${key}`);
  const typingEl = document.getElementById(`chat-typing-${key}`);

  // Render existing history if any
  if (hasHistory) {
    renderChatHistory(key, histEl);
    // Show follow-ups if we have them
    if (window._chatFollowups[key]?.length) {
      renderFollowups(key);
    }
  }

  // Update send button active state
  const updateSendState = () => {
    sendBtn.classList.toggle('active', !!input.value.trim());
  };
  input.addEventListener('input', updateSendState);

  // Fetch suggested questions
  if (!hasHistory) {
    fetchSuggestedQuestions(book, chapter, verse, text, key, suggestEl);
  }

  async function fetchSuggestedQuestions(bk, ch, v, vt, k, el) {
    try {
      const raw = await callGemini(`Generate 4 unique, thought-provoking questions someone might ask about ${bk} ${ch}:${v}: "${vt}"

RULES:
- Questions should be specific to THIS verse, not generic.
- Focus on: real-life application, surprising insights, theological implications, emotional/relational angles.
- Do NOT ask about word meanings or historical context (those are covered elsewhere).
- Each question must be 1 short sentence, under 10 words.
- Return ONLY the 4 questions, one per line, no numbers, no bullets, no extra text.`);

      const questions = raw.split('\n').map(q => q.trim()).filter(q => q.length > 5).slice(0, 4);
      window._chatSuggestions[k] = questions;

      el.innerHTML = [...questions].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip${q === _IMAGE_CHIP_TEXT ? ' chat-img-chip' : ''}">${q}</button>`
      ).join('');

      el.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => {
          const q = chip.textContent;
          window._chatFollowups[k] = questions.filter(s => s !== q);
          performSend(q);
        };
      });
    } catch {
      el.innerHTML = ['What does this verse mean?', 'How can I apply this today?'].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip${q === _IMAGE_CHIP_TEXT ? ' chat-img-chip' : ''}">${q}</button>`
      ).join('');
      el.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => performSend(chip.textContent);
      });
    }
  }

  function renderFollowups(k) {
    const chips = window._chatFollowups[k] || [];
    if (!chips.length) { followupsEl.style.display = 'none'; return; }
    followupsEl.style.display = '';
    followupsEl.innerHTML = `<span class="chat-followups-label">Keep exploring</span>` +
      chips.map(q =>
        `<button class="chat-followup-chip">${q}</button>`
      ).join('');
    followupsEl.querySelectorAll('.chat-followup-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.textContent;
        window._chatFollowups[k] = (window._chatFollowups[k] || []).filter(s => s !== q);
        performSend(q);
      };
    });
  }

  const performSend = async (questionOverride) => {
    const question = questionOverride || input.value.trim();
    if (!question) return;

    if (!verseChatHistories[key]) verseChatHistories[key] = [];
    verseChatHistories[key].push({ role: "user", text: question });
    input.value = "";
    updateSendState();

    // Hide empty state, show history
    emptyEl.classList.add("hidden");
    histEl.classList.remove("hidden");
    renderChatHistory(key, histEl);

    // Show typing indicator, hide follow-ups
    typingEl.style.display = '';
    followupsEl.style.display = 'none';
    histEl.scrollTop = histEl.scrollHeight;

    try {
      // Image generation request
      if (_isImageRequest(question)) {
        const isDefault = question === _IMAGE_CHIP_TEXT;
        const prompt = isDefault
          ? buildScenePrompt(book, chapter, verse, text.slice(0, 80))
          : `Scene from ${book} ${chapter}:${verse}. "${text.slice(0, 80)}". User request: ${question}. No text, no words, no letters in the image.`;
        const dataUrl = await callImageGen(prompt, "16:9");
        verseChatHistories[key].push({ role: "model", image: dataUrl, text: "" });
        typingEl.style.display = 'none';
        renderChatHistory(key, histEl);
        renderFollowups(key);
        return;
      }

      const historyStr = verseChatHistories[key].length > 1
        ? `HISTORY: ${JSON.stringify(verseChatHistories[key].slice(-5).map(m => m.image ? { role: m.role, text: "[generated image]" } : m))}`
        : '';

      // Push a streaming message placeholder so we can update it in place
      verseChatHistories[key].push({ role: "model", text: "", streaming: true });
      typingEl.style.display = 'none';
      renderChatHistory(key, histEl);

      const answer = await callGeminiStream(
        `You are a Bible study assistant. ${AI_TONE}

CONTEXT (for reference): ${book} ${chapter}:${verse} - "${text}"
${historyStr}

RULES:
- Be very concise (max 3 sentences).
- Answer the question directly and straightforwardly.
- Only relate your answer to the verse context if the question is clearly about the verse. If the question is general (e.g. about theology, history, a word meaning, or any topic), answer it on its own merits without forcing a verse connection.
- Stay youth-friendly and encouraging.
- Do NOT start with greetings like "Hey there!" or "Great question!" — start directly with the answer.
- Bold key theological terms using **double asterisks**.

QUESTION: ${question}`,
        (_delta, full) => {
          const msg = verseChatHistories[key][verseChatHistories[key].length - 1];
          if (msg && msg.streaming) {
            msg.text = full;
            renderChatHistory(key, histEl);
            histEl.scrollTop = histEl.scrollHeight;
          }
        }
      );

      const lastMsg = verseChatHistories[key][verseChatHistories[key].length - 1];
      if (lastMsg) {
        lastMsg.text = answer;
        delete lastMsg.streaming;
      }
      if (verseChatHistories[key].length > 10) verseChatHistories[key].shift();

      renderChatHistory(key, histEl);
      renderFollowups(key);
    } catch (err) {
      console.error("[Verse Chat Error]", err);
      typingEl.style.display = 'none';
      const msg = err?.message?.length > 10 && err.message.length < 200 ? err.message : "Sorry, something went wrong.";
      verseChatHistories[key].push({ role: "model", text: msg });
      renderChatHistory(key, histEl);
    }
  };

  sendBtn.onclick = () => performSend();
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSend();
    }
  };
}

function renderChatHistory(key, container) {
  const history = verseChatHistories[key] || [];
  // While a streaming bubble is still empty, show the sparkle loader inside
  // it. As soon as the first chunk of text lands, it swaps to the text.
  const botBubbleHTML = (msg) => {
    if (msg.text) {
      return msg.text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }
    return msg.streaming ? sparkleLoaderHTML('Thinking…') : '';
  };

  const renderMsg = (msg) => {
    const div = document.createElement('div');
    if (msg.role === 'user') {
      div.className = 'chat-msg user chat-msg-new';
      div.innerHTML = msg.text;
    } else if (msg.image) {
      div.className = 'chat-msg bot chat-msg-new';
      div.innerHTML = `<img src="${msg.image}" class="chat-gen-img" alt="Generated scene">`;
    } else {
      div.className = 'chat-msg bot' + (msg.streaming ? '' : ' chat-msg-new');
      div.innerHTML = botBubbleHTML(msg);
    }
    return div;
  };

  // Append newly-arrived messages
  const existing = container.children.length;
  for (let i = existing; i < history.length; i++) {
    container.appendChild(renderMsg(history[i]));
  }

  // If the last message is streaming, update its DOM in place each tick
  // instead of rebuilding the whole list — keeps the typing animation smooth.
  const last = history[history.length - 1];
  if (last && last.streaming && container.lastElementChild) {
    container.lastElementChild.innerHTML = botBubbleHTML(last);
  }

  container.scrollTop = container.scrollHeight;
}

// Image generation in verse chat disabled — was a Gemini image-API cost driver.
const _IMAGE_CHIP_TEXT = null;
function _isImageRequest() { return false; }

function _digDeeperEffectsHTML() {
  return `<span class="dig-spark ds1 material-icons">auto_awesome</span>
    <span class="dig-spark ds2 material-icons">auto_awesome</span>
    <span class="dig-spark ds3 material-icons">auto_awesome</span>
    <span class="dig-spark ds4 material-icons">auto_awesome</span>
    <span class="dig-spark ds5 material-icons">auto_awesome</span>
    <span class="dig-spark ds6 material-icons">auto_awesome</span>
    <span class="dig-spark ds7 material-icons">auto_awesome</span>
    <span class="dig-spark ds8 material-icons">auto_awesome</span>
    <div class="dig-orbit do1"></div>
    <div class="dig-orbit do2"></div>`;
}

async function fetchInlineDigDeeper({ book, chapter, verse, text }, mountEl) {
  mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}

    <div class="ai-card-gradient">
      <div class="ai-card-header">
        <span class="ai-card-label">Dig Deeper</span>
        <button class="ai-card-close" title="Close">✕</button>
      </div>
      ${sparkleLoaderHTML('Digging deeper…')}
    </div>
  </div>`;
  mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };

  const verseText = text || '';

  try {
    // Build the final card shell immediately so streaming has a text target.
    // Pre-fill the content area with the sparkle loader so the user sees
    // activity while we wait for the first streamed chunk.
    mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}

      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Dig Deeper</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <div class="ai-md-content" id="dig-deeper-stream">${sparkleLoaderHTML('Digging deeper…')}</div>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };

    const streamEl = mountEl.querySelector('#dig-deeper-stream');

    await callGeminiStream(
      `You are a premium Bible study tool. ${AI_TONE}

${book} ${chapter}:${verse}: "${verseText}"

Give a dense, high-value word study. NO fluff. Every word must earn its place. ~120 words total.

#### Original Language
- **English Word** — Greek/Hebrew script (transliteration, pronunciation) — meaning. Max 2-3 key words.
- Example format: **Word** — λόγος (logos, LOH-goss) — reason, divine utterance.

#### Deeper Meaning
- 2 sharp insights. Connect to broader theology. One sentence each.

#### Cross-References
- 3 verses max. **Reference** — one-line why it matters.

#### Takeaway
- One powerful sentence for real life. Make it hit.

STRICT: No greetings. No "this verse tells us". No padding. Start with #### Original Language immediately.`,
      (_delta, full) => {
        streamEl.innerHTML = mdToHTML(full);
      }
    );

  } catch (err) {
    console.error(err);
    mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}
  
      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Dig Deeper</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;">Failed to load deeper context.</p>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };
  }
}

/* ---------- PASSAGE TITLE ---------- */
function updatePassageTitle() {
  const book = bookEl.options[bookEl.selectedIndex]?.text || "";
  const chapter = chapterEl.value;
  const verse = verseEl.value;

  let title = `${book} ${chapter}`;
  if (verse) title += `:${verse}`;

  passageTitleEl.textContent = title;
  summaryTitleEl.textContent = title;
}

/* ---------- UX MODE ---------- */
const verseCtrl = verseEl.closest(".control");

verseEl.onchange = () => {
  updateControlStates();
  updatePassageTitle();
  renderSummary();
};

function updateControlStates() {
  document.querySelectorAll(".control").forEach((c) => {
    const field = c.querySelector("input, select");
    c.classList.toggle("has-value", !!field?.value);
  });
}

// NEW: Helper to format key back to human-readable reference
const formatKey = (key) => {
  const [bookId, chapter, verse] = key.split("-");
  const bookName = BIBLE_META[bookId]?.name || bookId;
  return `${bookName} ${chapter}${verse ? ":" + verse : ""}`;
};

// Open daily story without navigating away from dashboard
async function _openDailyStory(bookKey, ch) {
  const bookName = BIBLE_META[bookKey]?.name;
  if (!bookName) return;

  // Ensure bible data is loaded
  if (!bibleData) await fetchBibleData();

  const bookContent = bibleData[bookName.toUpperCase()];
  if (!bookContent || !bookContent[ch]) return;

  // Build versesText from the chapter data
  const chapterData = bookContent[ch];
  const versesText = Object.entries(chapterData)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([v, text]) => `${v}. ${text.trim().replace(/([.!?,;:])(?=[a-zA-Z])/g, "$1 ").replace(/\s+/g, " ")}`)
    .join("\n");

  // Temporarily set __aiPayload so the story modal can use it
  const prevPayload = window.__aiPayload;
  window.__aiPayload = { book: bookName.toUpperCase(), chapter: String(ch), versesText };

  // Temporarily set selects for markStorySeen
  const prevBook = bookEl.value;
  const prevCh = chapterEl.value;
  bookEl.value = bookKey;
  loadChapters();
  chapterEl.value = ch;

  // Store restore info — will be cleaned up when story/reflect modal closes
  window._dailyStoryRestore = {
    prevPayload,
    prevBook,
    prevCh,
  };

  await openStoryModal();
}

function loadPassageById(id, scrollToVerse) {
  const [bookId, chapter, verse] = id.split("-");

  // Set the select elements
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();

  // Always load full chapter, then scroll to the verse
  const targetVerse = scrollToVerse || verse;
  verseEl.value = "";

  // Trigger load then scroll to the verse
  loadBtn.click();

  if (targetVerse) {
    // Wait for rendering to finish, then scroll
    requestAnimationFrame(() => {
      setTimeout(() => {
        const verseEl2 = document.getElementById(targetVerse);
        if (verseEl2) {
          verseEl2.scrollIntoView({ behavior: "smooth", block: "center" });
          verseEl2.classList.add("verse-highlight");
          setTimeout(() => verseEl2.classList.remove("verse-highlight"), 5000);
        }
      }, 300);
    });
  }
}

function dashNoteGoToVerse(verseKey, verseNum) {
  const [bookId, chapter] = verseKey.split("-");
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = "";
  loadBtn.click();

  requestAnimationFrame(() => {
    setTimeout(() => {
      const verseEl2 = document.getElementById(verseNum);
      if (verseEl2) {
        verseEl2.scrollIntoView({ behavior: "smooth", block: "center" });
        verseEl2.classList.add("verse-highlight");
        setTimeout(() => verseEl2.classList.remove("verse-highlight"), 5000);
        // Auto-open the note section for this verse
        const wrap = verseEl2.closest(".verse");
        if (wrap) {
          const commentsEl = wrap.querySelector(".comments");
          if (commentsEl) {
            commentsEl.hidden = false;
            renderComments(verseKey, commentsEl);
          }
        }
      }
    }, 400);
  });
}

function dashNoteGoToReflection(passageKey) {
  const [bookId, chapter] = passageKey.split("-");
  bookEl.value = bookId;
  loadChapters();
  chapterEl.value = chapter;
  loadVerses();
  verseEl.value = "";
  loadBtn.click();

  // Wait for passage + reflections to load, then open reflect modal
  requestAnimationFrame(() => {
    setTimeout(() => openReflectModal(), 600);
  });
}

/* ---------- BOOKS ---------- */
function loadBooks() {
  bookEl.innerHTML = "";

  Object.entries(BIBLE_META).forEach(([id, book]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = book.name;
    bookEl.appendChild(o);
  });

  bookEl.value = "JHN";
  loadChapters();
}

// ── Dashboard Clock (Philippine Time) ────────────────────────────────────────
let _dashClockTimer = null;
function _startDashClock() {
  _updateDashClock();
  _dashClockTimer = setInterval(_updateDashClock, 15000); // update every 15s
}
function _stopDashClock() {
  if (_dashClockTimer) { clearInterval(_dashClockTimer); _dashClockTimer = null; }
}
function _updateDashClock() {
  const el = document.getElementById("dashClock");
  if (!el) return;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const mm = String(m).padStart(2, "0");
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = now.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();
  el.innerHTML = `<span class="dash-clock-day">${weekday}</span><span class="dash-clock-date">${monthDay}</span><span class="dash-clock-row"><span class="dash-clock-time">${h12}:${mm}</span><span class="dash-clock-ampm">${ampm}</span></span>`;
}

// Renamed and updated from showLanding to showDashboard
async function showDashboard() {
  stopTTS(); // always stop audio when returning to dashboard

  if (!bibleData) {
    await fetchBibleData();
  }

  // lockAppScroll(true); // FIX: Removed to allow dashboard scrolling on mobile
  document.querySelector(".summary").style.display = "none";

  passageTitleEl.hidden = true;
  toggleReflectionBtn.hidden = true;
  summaryTitleEl.hidden = true;
  document.getElementById("storyReflectRow")?.classList.add("hidden");
  homeBtn.style.display = "none"; // HIDE HOME BUTTON ON DASHBOARD
  const dashBrandRow = document.getElementById("dashBrandRow");
  if (dashBrandRow) dashBrandRow.hidden = false;
  _startDashClock();

  favoritesPage = 0;

  aiContextSummaryEl.innerHTML = "";
  const reflection = document.getElementById("aiReflection");
  if (reflection) {
    reflection.innerHTML = "";
    reflection.style.display = "none";
  }
  // Clean up the NT-echo card so the dashboard render starts from a clean
  // state. Lives inside the hidden .summary aside; resetting keeps state
  // sane for the next passage load.
  const ntEcho = document.getElementById("ntEchoCard");
  if (ntEcho) { ntEcho.innerHTML = ""; ntEcho.hidden = true; }

  summaryEl.innerHTML = "";
  copyNotesBtn.style.display = "none";

  // Display loading state first
  output.innerHTML = `
    <div class="landing">
      <div class="landing-card">
        <h2>Loading Dashboard...</h2>
      </div>
    </div>
  `;

  // Ensure layout is unset for dashboard view to allow vertical scrolling
  document.querySelector(".layout").classList.add("layout-unset");

  await renderDashboard();
  _playViewAnim(output, "view-enter");
}

function getVerseText(bookId, chapter, verse) {
  const bookName = BIBLE_META[bookId]?.name.toUpperCase();
  const bookData = bibleData?.[bookName];
  if (!bookData || !bookData[chapter]) return "Verse text not found.";

  const chapterData = bookData[chapter];
  // Regex to fix ".Word" -> ". Word"
  const clean = (txt) =>
    txt
      .trim()
      .replace(/([.!?,;:])(?=[a-zA-Z])/g, "$1 ")
      .replace(/\s+/g, " ");

  if (chapterData[verse]) return clean(chapterData[verse]);

  const rangeKey = Object.keys(chapterData).find((k) => {
    if (!k.includes("-")) return false;
    const [start, end] = k.split("-").map(Number);
    const v = Number(verse);
    return v >= start && v <= end;
  });

  return rangeKey ? clean(chapterData[rangeKey]) : "Verse text not found.";
}

async function renderDashboard() {
  const favoritesKeys = Object.keys(favorites).sort(
    (a, b) => favorites[b] - favorites[a],
  );

  // 1. Get favorite passages data (UPDATED)
  const allFavoritePassages = favoritesKeys.map((key) => {
    const [bookId, chapter, verse] = key.split("-");
    const verseToFetch = verse || "1"; // Default to verse 1 if chapter selected
    const verseText = getVerseText(bookId, chapter, verseToFetch);
    return {
      key,
      verseText,
      time: favorites[key],
    };
  });

  const startFavIndex = favoritesPage * FAV_PAGE_SIZE;
  const endFavIndex = startFavIndex + FAV_PAGE_SIZE;
  const favoritePassages = allFavoritePassages.slice(
    startFavIndex,
    endFavIndex,
  );

  const totalFavPages = Math.ceil(allFavoritePassages.length / FAV_PAGE_SIZE);

  // 1. Get recent notes (from localStorage)
  let recentNotes = [];

  Object.entries(comments).forEach(([key, list]) => {
    if (list && list.length) {
      const [bookId, chapter, verse] = key.split("-");
      const verseToFetch = verse || "1";
      const verseText = getVerseText(bookId, chapter, verseToFetch);

      // Push EVERY note in the list to the recentNotes array
      list.forEach((note) => {
        recentNotes.push({
          key,
          latestNoteTime: note.time, // Using the individual note time
          noteText: note.text, // Using the individual note text
          verseText,
        });
      });
    }
  });

  // Sort globally so the absolute newest notes appear first
  recentNotes.sort((a, b) => b.latestNoteTime - a.latestNoteTime);

  // 2. Get reflection answer counts and actual Q&A from localStorage (UPDATED TO REMOVE IDB DEPENDENCY)
  const reflectionPassages = {}; // Store { passageId: { QAs: ["Q:...\nA:...", ...], keys: ["reflection-JHN-1-1-0", ...], latestTime: 0 } }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("reflection-")) {
      const reflectionIdParts = key.split("-");
      // The structure is reflection-B-C-V-INDEX. The passage ID is B-C-V.
      // Note: Passage ID here is B-C-V if single verse, or B-C- if whole chapter
      const passageId = reflectionIdParts.slice(1, 4).join("-");

      const rawValue = localStorage.getItem(key);
      const answer = rawValue.split("\nA: ")[1]?.trim() || "";

      if (answer.length > 0) {
        if (!reflectionPassages[passageId]) {
          reflectionPassages[passageId] = { QAs: [], keys: [] };
        }
        reflectionPassages[passageId].QAs.push(rawValue); // Store the full Q&A string
        reflectionPassages[passageId].keys.push(key);
        // NOTE: Since the only timestamp is on 'comment' entries, and we cannot use IDB,
        // we can't reliably sort reflection passages by time. We'll simply list them.
      }
    }
  }

  // 3. Prepare recent reflections data structure
  let recentReflections = Object.keys(reflectionPassages).map((passageId) => {
    const data = reflectionPassages[passageId];
    return {
      id: passageId,
      // Since no reliable timestamp is available, we use the average time of the notes
      // to try and guess the correct order, falling back to 0 if no notes exist.
      // Fallback to 0 if no notes, relying on JS object key insertion order otherwise (unreliable but necessary without proper data).
      updatedAt:
        recentNotes.find((n) => n.key.startsWith(passageId))?.latestNoteTime ||
        0,
      reflectionCount: data.QAs.length,
      QAs: data.QAs,
    };
  });

  // Sort by the best available proxy time
  recentReflections.sort((a, b) => b.updatedAt - a.updatedAt);

  // Clean up the updatedAt proxy if it was 0 for better visual presentation in dashboard
  recentReflections = recentReflections.map((r) => ({
    ...r,
    updatedAt: r.updatedAt || Date.now(), // Fallback to current time if 0, so it displays something
  }));

  // Game-feel ambient layer: floating pink motes drifting up across the
  // dashboard area + twinkling sparkles scattered behind. Generated once per
  // dashboard render with randomized CSS custom properties so each particle
  // has its own duration/delay/path. All behind prefers-reduced-motion so
  // users with that OS setting see a still page.
  const moteCount = 18;
  const twinkleCount = 10;
  const motesHTML = Array.from({ length: moteCount }, () => {
    const x = Math.random() * 100;
    const dur = 9 + Math.random() * 12;       // 9–21s
    const delay = -(Math.random() * 20);       // start mid-flight so the field is full from t=0
    const scale = 0.55 + Math.random() * 0.95; // 0.55–1.5
    const opacity = 0.18 + Math.random() * 0.42;
    const drift = (Math.random() - 0.5) * 40;  // ±20px lateral drift
    return `<span class="dash-ambient-mote" style="--m-x:${x}%;--m-d:${dur}s;--m-l:${delay}s;--m-s:${scale};--m-o:${opacity};--m-drift:${drift}px"></span>`;
  }).join("");
  const twinklesHTML = Array.from({ length: twinkleCount }, () => {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const dur = 3 + Math.random() * 4;         // 3–7s
    const delay = -(Math.random() * 6);
    const scale = 0.6 + Math.random() * 0.9;
    return `<span class="dash-twinkle" style="--t-x:${x}%;--t-y:${y}%;--t-d:${dur}s;--t-l:${delay}s;--t-s:${scale}"></span>`;
  }).join("");

  const dashboardHTML = `
  <div class="dashboard ai-fade-in">

  <div class="dash-ambient" aria-hidden="true">${motesHTML}</div>
  <div class="dash-twinkles" aria-hidden="true">${twinklesHTML}</div>

  <div class="dash-greeting">
    <div class="dash-greeting-top">
      <div class="dash-greeting-text">${(() => { const h = new Date().getHours(); const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; const name = getUserName(); return name ? `${g}, ${name}!` : g; })()}</div>
      <button class="dash-name-edit-btn" onclick="_showNamePrompt(() => renderDashboard())" title="Edit name"><span class="material-icons">edit</span></button>
    </div>
    <div id="dashGreetingMsg" class="dash-greeting-msg"></div>
    <div id="dashProvCard" class="dash-prov-card"></div>
    <div class="dash-journal-row">
      <button type="button" id="dashObedLink" class="dash-journal-link dash-journal-link--obed dash-journal-link-empty" onclick="openObedienceJournal()">
        <span class="material-symbols-outlined">menu_book</span>
        <span>Obedience journal</span>
        <span id="dashObedCount" class="dash-journal-count"></span>
        <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
      </button>
      <button type="button" id="dashGratLink" class="dash-journal-link dash-journal-link--grat dash-journal-link-empty" onclick="openGratitudeJournal()">
        <span class="material-symbols-outlined">favorite</span>
        <span>Gratitude journal</span>
        <span id="dashGratCount" class="dash-journal-count"></span>
        <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
      </button>
      <button type="button" id="dashPrayLink" class="dash-journal-link dash-journal-link--pray dash-journal-link-empty" onclick="openPrayersJournal()">
        <span class="material-symbols-outlined">volunteer_activism</span>
        <span>Prayers</span>
        <span id="dashPrayCount" class="dash-journal-count"></span>
        <span class="material-symbols-outlined dash-journal-arrow">arrow_forward</span>
      </button>
    </div>
  </div>

  ${/* Daily featured story removed — was driving image-gen costs. */ ""}

  <div class="dashboard-grid">

      <!-- CONTINUE READING + FAVORITES -->
      <section class="dashboard-section">

        <div id="continue-reading" class="hidden">
          <h3><span><span class="material-icons dashboard-icon dashboard-icon--book">book</span> Pick up where you left off</span></h3>
          <button class="dash-continue-btn" onclick="loadPassageById('${recentPassageId}')" aria-label="Resume ${recentPassage}">
            <div class="dash-continue-text">
              <span class="dash-continue-ref">${recentPassage}</span>
              <div id="dashContinueRecap" class="dash-continue-recap"></div>
            </div>
            <span class="material-icons dash-continue-chev">arrow_forward</span>
          </button>
        </div>

        <div id="dashFavoritesContent">${_renderFavoritesContent(allFavoritePassages)}</div>
      </section>

      <!-- NOTES -->
      <section class="dashboard-section">
        <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span><span class="material-icons dashboard-icon dashboard-icon--notes">edit_note</span> Notes</span>
          <button class="dash-notes-open-btn" onclick="openNotesApp()">View all →</button>
        </h3>
        ${(() => {
          const allNotes = _getAllNotes()
            .filter(n => n.preview)
            .sort((a, b) => (b.time || 0) - (a.time || 0))
            .slice(0, 5);
          if (!allNotes.length) return `<p class="empty-state">No notes yet. Add notes to Bible verses, complete a Guided Reflection, or tap "View all" to write your first note.</p>`;
          // Only show the type label when the visible set contains both
          // reflections and verse notes — otherwise every row carries the same
          // tag and it reads as visual noise.
          const types = new Set(allNotes.map(n => n.type));
          const showTypeLabel = types.size > 1;
          return `<div class="dash-notes-list">${allNotes.map(n => {
            // Pass a generous upper bound; the actual visual ellipsis is done
            // by CSS line-clamp on .dash-notes-card-preview, which adapts to
            // the card's real width — narrow on mobile, much wider on desktop.
            const preview = n.preview.length > 400 ? n.preview.slice(0, 400) + "…" : n.preview;
            const dateStr = n.time ? new Date(n.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const label = showTypeLabel
              ? `<span class="dash-notes-type-label">${n.type === "reflection" ? "Reflection" : "Verse note"}</span>`
              : "";
            let onclick = `openNotesApp()`;
            if (n.type === "verse" && n.verseKeys?.length) {
              const firstKey = n.verseKeys.sort((a,b) => {
                const va = parseInt(a.split("-")[2] || "1"), vb = parseInt(b.split("-")[2] || "1");
                return va - vb;
              })[0];
              const verseNum = firstKey.split("-")[2] || "";
              onclick = `dashNoteGoToVerse('${_escHtml(firstKey)}', '${_escHtml(verseNum)}')`;
            } else if (n.type === "reflection" && n.passageKey) {
              onclick = `dashNoteGoToReflection('${_escHtml(n.passageKey)}')`;
            }
            return `<div class="dash-notes-card" onclick="${onclick}">
              <div class="dash-notes-card-date">${dateStr}${label}</div>
              <div class="dash-notes-card-preview">${_escHtml(preview)}</div>
            </div>`;
          }).join("")}</div>`;
        })()}
      </section>

      ${/* "Create & Share" removed — opened the AI image creator. */ ""}

      ${/* Daily Reminder section removed — it relied on Cloud Scheduler + Gemini personalization. */ ""}
      </div>
      </div>
      `;

  output.innerHTML = dashboardHTML;

  if (recentPassageId) {
    document.getElementById("continue-reading")?.classList.remove("hidden");
    loadDashContinueRecap();
  }

  loadDashGreetingMsg();
  loadDashProverb();
  _refreshObedienceJournalLink();
  _refreshGratitudeJournalLink();
  _refreshPrayersJournalLink();
}

function _typewriterReveal(el, msg) {
  el.textContent = "";
  const cursor = document.createElement("span");
  cursor.className = "dash-greeting-cursor";
  el.appendChild(cursor);
  let i = 0;
  const type = () => {
    if (cursor.parentNode !== el) return; // el was replaced, bail out
    if (i < msg.length) {
      el.insertBefore(document.createTextNode(msg[i++]), cursor);
      setTimeout(type, 32);
    } else {
      setTimeout(() => cursor.remove(), 600);
    }
  };
  type();
}

async function _loadDashFeaturedImage() {
  const card = document.getElementById("dashFeaturedStory");
  const bg = document.getElementById("dashFeaturedBg");
  if (!card || !bg) return;
  const bookName = card.dataset.bookName;
  const ch = card.dataset.ch;
  const prompt = buildScenePrompt(bookName, ch, null, "Overview scene of the entire chapter");
  try {
    const dataUrl = await callImageGen(prompt, "21:9");
    bg.style.backgroundImage = `url(${dataUrl})`;
    bg.classList.add("dash-featured-bg-loaded");
  } catch {}
}

// Short AI recap rendered under the "Pick up where you left off" ref. Cached
// by passage id in localStorage under the `passageRecap-` prefix — that prefix
// is in firebase-sync.js's SYNC_DYNAMIC_PREFIXES, so for Charlie the cache
// rides the existing localStorage→RTDB mirror and the same recap shows up on
// every device. For other users it's just plain localStorage.
async function loadDashContinueRecap() {
  const el = document.getElementById("dashContinueRecap");
  if (!el || !recentPassageId) return;

  const cacheKey = `passageRecap-${recentPassageId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    el.textContent = cached;
    el.classList.add("dash-continue-recap-ready");
    return;
  }

  // Cache miss — show subtle dim loader, then fetch.
  el.innerHTML = `<span class="dash-continue-recap-loader"><span class="rdot"></span><span class="rdot"></span><span class="rdot"></span></span>`;

  const refLabel = recentPassage || recentPassageId;
  const prompt = `Write ONE short, casual sentence (max 18 words) recapping what ${refLabel} is about, written for someone returning to it. No "this chapter" preamble — start with the substance. Reply with ONLY the sentence, no quotes, no emojis.`;

  try {
    const res = await fetch("https://gemini-proxy-668755364170.asia-southeast1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (msg && document.getElementById("dashContinueRecap") === el) {
      localStorage.setItem(cacheKey, msg);
      el.textContent = msg;
      el.classList.add("dash-continue-recap-ready");
    } else if (document.getElementById("dashContinueRecap") === el) {
      el.textContent = "";
    }
  } catch {
    if (document.getElementById("dashContinueRecap") === el) el.textContent = "";
  }
}

async function loadDashGreetingMsg() {
  const el = document.getElementById("dashGreetingMsg");
  if (!el) return;

  const name = getUserName();
  const h = new Date().getHours();
  const timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // One AI generation per (user, day, time-of-day) bucket. The greeting
  // doesn't need to refresh on every dashboard render — those fire any time
  // Firebase pushes a remote update, and a fresh prompt every time costs
  // tokens AND looks twitchy. Bucket key changes ~3x/day.
  const cacheKey = `${name}::${today}::${timeOfDay}`;

  let cachedMsg = "";
  let cacheHit = false;
  try {
    const raw = localStorage.getItem("dashGreetingCacheV2");
    if (raw) {
      const obj = JSON.parse(raw);
      cachedMsg = obj.msg || "";
      cacheHit = obj.key === cacheKey && !!cachedMsg;
    }
  } catch {}

  // Cache hit → render and stop. No network, no typewriter (avoid re-animating
  // on every renderDashboard tick).
  if (cacheHit) {
    el.textContent = cachedMsg;
    el.style.opacity = "";
    return;
  }

  // Cache miss → show stale msg dimmed (or loading dots) while we fetch.
  if (cachedMsg) {
    el.textContent = cachedMsg;
    el.style.opacity = "0.4";
  } else {
    el.innerHTML = `<span class="dash-greeting-glow-loader"><span class="gdot"></span><span class="gdot"></span><span class="gdot"></span></span>`;
  }

  const notesCtx = _getRecentNotesContext();
  const prompt = notesCtx
    ? `You are greeting ${name || "a friend"} in a Bible devotion app this ${timeOfDay}. Their recent reflections and notes: "${notesCtx.slice(0, 300)}". Write ONE sentence (max 18 words) referencing something from their notes. You may reference personal content (like people they mention) BUT never combine personal names with divine attributes or glory — that would be idolatry. Keep God's glory for God alone. Be warm, casual, like a close friend. No emojis, no guilt. Reply with ONLY the sentence.`
    : `Write ONE warm greeting sentence (max 15 words) for ${name || "a friend"} opening a Bible app this ${timeOfDay}. Casual, caring, like a friend. No emojis, no guilt. Reply with ONLY the sentence.`;

  try {
    const res = await fetch("https://gemini-proxy-668755364170.asia-southeast1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    const msg = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (msg) {
      localStorage.setItem("dashGreetingCacheV2", JSON.stringify({ msg, key: cacheKey }));
      if (document.getElementById("dashGreetingMsg") === el) {
        el.style.opacity = "";
        _typewriterReveal(el, msg);
      }
    } else if (cachedMsg) {
      el.style.opacity = "";
    }
  } catch {
    // Keep showing cached if fetch fails
    if (cachedMsg) { el.style.opacity = ""; }
    else el.textContent = "";
  }
}

// Build the favorites section HTML. Pure function — takes the precomputed
// allFavoritePassages list, reads the global favoritesPage, returns markup.
// Used by both renderDashboard (initial render) and changeFavoritesPage
// (swap-in-place so prev/next doesn't trigger the dashboard's fade-in
// animation on every click).
function _renderFavoritesContent(allFavoritePassages) {
  const total = allFavoritePassages.length;
  const lastPage = Math.max(0, Math.ceil(total / FAV_PAGE_SIZE) - 1);
  if (favoritesPage > lastPage) favoritesPage = lastPage; // guard
  const start = favoritesPage * FAV_PAGE_SIZE;
  const pageItems = allFavoritePassages.slice(start, start + FAV_PAGE_SIZE);
  const showNav = total > FAV_PAGE_SIZE;
  const header = `
    <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span><span class="material-icons dashboard-icon dashboard-icon--fav">favorite</span> Favorites</span>
      ${showNav ? `<div class="dash-fav-nav" aria-label="Favorites pagination">
        <button class="dash-fav-nav-btn" onclick="changeFavoritesPage(-1)" aria-label="Previous favorites"${favoritesPage <= 0 ? ' disabled' : ''}><span class="material-icons">chevron_left</span></button>
        <span class="dash-fav-nav-page">${favoritesPage + 1}/${lastPage + 1}</span>
        <button class="dash-fav-nav-btn" onclick="changeFavoritesPage(1)" aria-label="Next favorites"${favoritesPage >= lastPage ? ' disabled' : ''}><span class="material-icons">chevron_right</span></button>
      </div>` : ""}
    </h3>`;
  const body = total
    ? `<div class="dash-fav-list">
        ${pageItems.map((item) => {
          const ref = formatKey(item.key);
          const raw = (item.verseText || "").replace(/\s+/g, " ").trim();
          const preview = raw && raw !== "Verse text not found."
            ? (raw.length > 110 ? raw.slice(0, 110) + "…" : raw)
            : "";
          return `<div class="dash-fav-row" onclick="loadPassageById('${item.key}')">
            <div class="dash-fav-row-ref">${ref}<span class="material-icons dash-fav-row-chev">chevron_right</span></div>
            ${preview ? `<div class="dash-fav-row-text">${_escHtml(preview)}</div>` : ""}
          </div>`;
        }).join("")}
      </div>`
    : `<p class="empty-state">No favorite verses yet. Double-click a verse or tap the <span class="material-icons" style="font-size:1em; vertical-align:middle; color:#c83086;">favorite_border</span> icon to add one!</p>`;
  return header + body;
}

function changeFavoritesPage(delta) {
  favoritesPage = Math.max(0, favoritesPage + delta);
  // Swap only the favorites section's content — re-rendering the whole
  // dashboard would re-fire the section fade-in animations, which is jarring
  // on what should feel like a tiny pagination interaction.
  const mount = document.getElementById("dashFavoritesContent");
  if (!mount) { renderDashboard(); return; } // fallback if dashboard not visible
  const allFavoritePassages = Object.keys(favorites)
    .sort((a, b) => favorites[b] - favorites[a])
    .map((key) => {
      const [bookId, chapter, verse] = key.split("-");
      const verseToFetch = verse || "1";
      return { key, verseText: getVerseText(bookId, chapter, verseToFetch), time: favorites[key] };
    });
  mount.innerHTML = _renderFavoritesContent(allFavoritePassages);
}

/* ---------- CHAPTERS ---------- */
function loadChapters() {
  chapterEl.innerHTML = "";

  const chapters = BIBLE_META[bookEl.value].chapters;
  chapters.forEach((_, i) => {
    const o = document.createElement("option");
    o.value = i + 1;
    o.textContent = i + 1;
    chapterEl.appendChild(o);
  });

  loadVerses();
}

/* ---------- VERSES ---------- */
function loadVerses() {
  verseEl.innerHTML = `<option value="">All verses</option>`;

  const count = BIBLE_META[bookEl.value].chapters[chapterEl.value - 1];

  for (let i = 1; i <= count; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = i;
    verseEl.appendChild(o);
  }

  if (!output.querySelector(".dashboard")) {
    updatePassageTitle();
  }

  renderSummary();
}
async function fetchWithTimeout(url, timeout = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchAllOriginsUnli(url) {
  while (true) {
    try {
      const res = await fetchWithTimeout(url, 4000);
      if (!res.ok) throw new Error("allorigins failed");
      return await res.json();
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("allorigins retrying due to error:", err);
      }
      // retry immediately, unli
    }
  }
}

/* ---------- LOAD PASSAGE ---------- */
async function loadPassage() {
  document.querySelector(".layout").classList.remove("layout-unset");
  showLoading();
  lockAppScroll(false);
  updatePassageTitle();
  document.querySelector(".summary").style.display = "block";

  passageTitleEl.hidden = false;
  toggleReflectionBtn.hidden = false;
  summaryTitleEl.hidden = false;
  homeBtn.style.display = "inline-flex"; // SHOW HOME BUTTON
  const dashBrandRow2 = document.getElementById("dashBrandRow");
  if (dashBrandRow2) dashBrandRow2.hidden = true;
  _stopDashClock();

  try {
    titleForGemini = passageTitleEl.textContent;

    const bookId = bookEl.value;
    let bookName = BIBLE_META[bookId].name.toUpperCase();
    const chapterNum = chapterEl.value;
    const single = verseEl.value;

    recentPassageId = `${bookId}-${chapterNum}`;
    recentPassage = `${bookName} ${chapterNum}`;
    localStorage.setItem("recentPassageId", recentPassageId);
    localStorage.setItem("recentPassage", recentPassage);
    _debouncedPushSync();

    if (!bibleData) {
      await fetchBibleData();
    }

    /* ---------- GET LOCAL VERSES ---------- */
    const bookContent = bibleData[bookName];
    if (!bookContent) throw new Error(`Book ${bookName} not found in JSON.`);

    const chapterContent = bookContent[chapterNum];
    if (!chapterContent)
      throw new Error(`Chapter ${chapterNum} not found in ${bookName}.`);

    let verses = Object.entries(chapterContent).map(([vNum, text]) => ({
      book_id: bookId,
      chapter: Number(chapterNum),
      verse: vNum, // Keep as string (e.g. "1-4")
      text: text
        .trim()
        .replace(/([.,!?])(?=[a-zA-Z0-9])/g, "$1 ")
        .replace(/\s+/g, " "),
    }));

    // Sort by numeric start so range keys like "1-4" don’t get pushed to the end
    // (JS Object.entries puts integer-like keys first, non-integer strings after)
    verses.sort((a, b) => parseInt(a.verse) - parseInt(b.verse));

    // Logic to filter single verse including range overlap
    if (single) {
      verses = verses.filter((v) => {
        if (v.verse == single) return true;
        if (v.verse.includes("-")) {
          const [start, end] = v.verse.split("-").map(Number);
          return +single >= start && +single <= end;
        }
        return false;
      });
    }

    // Generate Payload for AI before filtering for single verse
    const fullVersesText = verses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");

    window.__aiPayload = {
      book: bookName,
      chapter: chapterNum,
      isSingle: single,
      versesText: single
        ? verses.map((v) => `${v.verse}. ${v.text}`).join("\n")
        : fullVersesText,
    };

    /* ---------- RENDER ---------- */
    output.innerHTML = "";
    _allNotesOpen = false;
    document.getElementById("notesToggleBtn")?.classList.remove("ctrl-icon-active");

    let isInsideQuote = false;

    verses.forEach((v) => {
      const key = keyOf(v.book_id, v.chapter, v.verse);
      const count = comments[key]?.length || 0;
      const isFav = isFavorite(key);

      let formattedText = "";

      // If we are already inside a quote from the previous verse,
      // start this verse with the opening span.
      if (isInsideQuote) {
        formattedText += '<span class="quote-style">';
      }

      for (let char of v.text) {
        if (
          char === '"' ||
          char === "“" ||
          char === "”" ||
          char === `‘` ||
          char === `’`
        ) {
          if (!isInsideQuote) {
            // Transition: Outside -> Inside
            formattedText += '<span class="quote-style">' + char;
            isInsideQuote = true;
          } else {
            // Transition: Inside -> Outside
            formattedText += char + "</span>";
            isInsideQuote = false;
          }
        } else {
          formattedText += char;
        }
      }

      // SAFETY: If the verse ends but the quote is still open,
      // close the span for this div so it doesn't break the layout.
      if (isInsideQuote) {
        formattedText += "</span>";
      }

      const wrap = document.createElement("div");
      wrap.className = "verse" + (isFav ? " highlighted" : "");
      wrap.dataset.verseKey = key;
      wrap.innerHTML = `
        <div id="${
          v.verse
        }" class="verse-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="verse-content">
            <span class="verse-num">${v.verse}</span>${formattedText}
            <span class="verse-meta-indicators" style="display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;">
              <span class="material-icons favorite-indicator" style="font-size:14px; margin-right:4px; ${
                isFav ? 'color:#c83086;"' : '"'
              } data-key="${key}">${isFav ? "favorite" : "favorite_border"}</span>
            </span>
          </div>
        </div>
        <div class="verse-actions">
          <button class="verse-action-btn" data-action="context"><span class="material-icons">auto_awesome</span><span>Context</span></button>
          <button class="verse-action-btn" data-action="ask"><span class="material-icons">chat_bubble_outline</span><span>Ask</span></button>
          <button class="verse-action-btn" data-action="note"><span class="material-icons">edit_note</span><span>Note</span></button>
        </div>
        <div class="inline-ai-mount"></div>
        <div class="comments ai-fade-in" hidden></div>
      `;

      // ... keep your existing listener code here ...
      const commentsEl = wrap.querySelector(".comments");
      const headerEl = wrap.querySelector(".verse-header");
      const aiBtn = wrap.querySelector('[data-action="context"]');

      // New: Favorite icon listener
      const favIndicator = wrap.querySelector(".favorite-indicator");
      const verseContentEl = wrap.querySelector(".verse-content"); // Get verseContent for updateMetaIndicators

      // Double-click: toggle favorite
      headerEl.ondblclick = (e) => {
        e.stopPropagation();
        toggleFavorite(key);
        wrap.classList.toggle("highlighted", isFavorite(key));
        updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
        animateFavorite(wrap);
      };

      aiBtn.onclick = (e) => {
        e.stopPropagation();
        const mount = wrap.querySelector(".inline-ai-mount");
        if (mount.innerHTML.trim()) {
          mount.innerHTML = "";
          return;
        }
        fetchInlineQuickContext(
          {
            book: BIBLE_META[v.book_id].name,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
          },
          mount,
        );
      };

      const chatBtn = wrap.querySelector('[data-action="ask"]');
      chatBtn.onclick = (e) => {
        e.stopPropagation();
        const mount = wrap.querySelector(".inline-ai-mount");
        toggleVerseChat(
          key,
          BIBLE_META[v.book_id].name,
          v.chapter,
          v.verse,
          v.text,
          mount,
        );
      };

      const noteActionBtn = wrap.querySelector('[data-action="note"]');
      if (noteActionBtn) {
        noteActionBtn.onclick = (e) => {
          e.stopPropagation();
          commentsEl.hidden = !commentsEl.hidden;
          if (!commentsEl.hidden) renderComments(key, commentsEl);
        };
      }

      if (favIndicator) {
        favIndicator.onclick = (e) => {
          e.stopPropagation();
          toggleFavorite(key);
          wrap.classList.toggle("highlighted", isFavorite(key));
          updateMetaIndicators(key, verseContentEl, comments[key]?.length || 0);
          animateFavorite(wrap);
        };
      }

      output.appendChild(wrap);
    });

    // Add Reflect button below the last verse
    const reflectRow = document.createElement("div");
    reflectRow.className = "passage-end-reflect";
    reflectRow.innerHTML = `
      <button class="passage-end-reflect-btn" onclick="openReflectModal()">Reflect</button>
    `;
    output.appendChild(reflectRow);

    renderSummary();
    hideLoading();
    // Drill-in transition: passage rises + fades into place after dashboard
    // fades out. Same easing as the canvas overlay so all view-changes feel
    // like one motion vocabulary.
    _playViewAnim(output, "view-enter");

    // Background TTS prefetch — fire-and-forget. Cache hits are instant IDB
    // reads; cache misses queue behind the 10-slot semaphore and stream into
    // IDB so a later Listen tap is silent. 3-day TTL keeps DB size bounded
    // even if the user spam-flips chapters.
    if (typeof _ttsPrefetchChapter === "function") _ttsPrefetchChapter();
  } catch (err) {
    console.error(err);
    hideLoading();
    showLoadError(
      `Failed to load passage. Check if ${VERSION_FILES[currentVersion]} is present.`,
    );
  }
}

async function runAIForCurrentPassage() {
  if (!window.__aiPayload) return;

  // NT-echo card has its own per-chapter cache (independent of the IDB AI
  // cache), so kick it off here regardless of whether the context/reflection
  // pair is cached. Fire-and-forget — the card renders into its own slot.
  loadNtEcho();

  // Set loading flags synchronously before any await so playChapter()/ttsImmContextOpen()
  // always sees them as true when TTS opens the context screen right after this call.
  _contextLoading = true;
  _reflectionLoading = true;

  const cached = await loadAIFromStorage();
  if (
    cached &&
    cached.contextHTML &&
    cached.reflectionHTML &&
    cached.contextHTML != "<p>Failed to generate context summary.</p>" &&
    cached.reflectionHTML != "<p>Failed to generate reflection questions.</p>"
  ) {
    aiContextSummaryEl.innerHTML = cached.contextHTML;
    const reflMount = document.getElementById("aiReflection");
    reflMount.innerHTML = cached.reflectionHTML;
    _ensureReflectionRetryUI(reflMount);
    applyReflectionVisibility();
    _contextLoading = false;
    _reflectionLoading = false;
    initializeReflections();
    return;
  }

  const { book, chapter, isSingle, versesText } = window.__aiPayload;
  titleForGemini = `${book} ${chapter}`;

  if (isSingle) {
    let verseNum;
    verseNum = versesText.split(".")[0];
    titleForGemini = `${book} ${chapter}:${verseNum}`;
  }

  await Promise.all([
    renderAIContextSummary().then(() => { _contextLoading = false; }),
    renderAIReflectionQuestions({ book, chapter, versesText }).then(() => {
      _reflectionLoading = false;
      // If TTS already finished while reflection was loading, show the reflect button now
      if (_ttsFinished) {
        const reflectBtn = document.getElementById("ttsImmReflectBtn");
        const ready = document.querySelectorAll('#aiReflection textarea[id^="reflection-"]').length > 0;
        if (reflectBtn && ready) {
          reflectBtn.hidden = false;
          reflectBtn.onclick = () => { _immCancelAutoRefl(); ttsImmReflectionOpen(); };
        }
      }
    }),
  ]);

  await saveAIToStorage({
    contextHTML:
      aiContextSummaryEl.innerHTML !=
      "<p>Failed to generate context summary.</p>"
        ? aiContextSummaryEl.innerHTML
        : null,
    reflectionHTML:
      document.getElementById("aiReflection").innerHTML !=
      "<p>Failed to generate reflection questions.</p>"
        ? document.getElementById("aiReflection").innerHTML
        : null,
    answers: {},
  });
}

function showLoadError(message) {
  output.innerHTML = `
    <div style="
      background: linear-gradient(180deg, #1f2937, #111827);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
    ">
      <p style="margin:0 0 12px; font-weight:600;">
        ⚠️ ${message}
      </p>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="retryLoadBtn" class="primary">Retry</button>
        <button id="closeLoadBtn" class="secondary">✕ Close</button>
      </div>
    </div>
  `;

  document.getElementById("retryLoadBtn").onclick = () => {
    loadPassage();
  };

  document.getElementById("closeLoadBtn").onclick = () => {
    output.innerHTML = "";
  };
}

function showLoading() {
  // Prevent duplicates
  if (document.getElementById("ai-loading-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "ai-loading-overlay";
  overlay.className = "ai-loading-overlay";

  const card = document.createElement("div");
  card.className = "ai-loading-card";

  const spinner = document.createElement("div");
  spinner.className = "ai-spinner";

  const text = document.createElement("span");
  text.id = "ai-loading-text";
  text.textContent = "Generating context… (up to 15s) ⏳";

  card.appendChild(spinner);
  card.appendChild(text);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // smoother, readable keep-alive (does NOT block completion)
  let seconds = 15;
  const messages = [
    "Reading ancient scrolls 📜",
    "Aligning verses ✨",
    "Consulting apostles 🕊️",
    "Almost there 🙏",
  ];

  let msgIndex = 0;
  let dots = 0;

  window.__aiLoadingInterval = setInterval(() => {
    seconds = Math.max(0, seconds - 1);

    // animate dots smoothly
    dots = (dots + 1) % 4;
    const dotStr = ".".repeat(dots);

    // change message every 4s (not every second)
    if (seconds % 4 === 3 && msgIndex < messages.length - 1) {
      msgIndex++;
    }

    text.textContent = `${messages[msgIndex]}${dotStr} (${seconds}s)`;

    if (seconds <= 0) clearInterval(window.__aiLoadingInterval);
  }, 1000);
  // subtle pulse so user "feels" loading
  card.style.animation = "aiPulse 1.6s ease-in-out infinite";
}

function hideLoading() {
  const overlay = document.getElementById("ai-loading-overlay");
  if (overlay) {
    overlay.remove();
    clearInterval(window.__aiLoadingInterval);
  }
}

async function renderAIContextSummary() {
  const { book, chapter, versesText } = window.__aiPayload || {};
  const bookChapter = titleForGemini || `${book} ${chapter}`;

  aiContextSummaryEl.innerHTML = `<div style="padding:20px 0;text-align:center;">${sparkleLoaderHTML('Generating summary…')}</div>`;

  const quickPrompt = `You are a Bible study assistant. Give a brief structured summary for ${bookChapter}.

FORMAT (follow exactly — 3 sections, each 1-2 sentences max):
CONTEXT: [Brief background — what's happening at this point in the book]
WHAT_HAPPENS: [What occurs in this chapter]
WATCH_FOR: [One key thing the reader should pay attention to]

Keep it concise and clear. No bullet points, no numbering. Casual tone, like a friend giving you a heads-up.

PASSAGE:
${versesText || ''}`;

  const fullPrompt = `You are a Bible study assistant. Give a detailed context summary for ${bookChapter}.

RULES:
- Do NOT start with greetings or intro sentences. Start directly with the content.
- Use these exact section headers with ## markdown: ## Background, ## Key Themes, ## Watch For
- Use bullet points with bold key terms using **double asterisks**
- Reference specific verse numbers
- Be thorough but readable
- Friendly English tone, casual yet respectful

Here are the verses:
${versesText || ''}`;

  try {
    // Render the scaffold immediately so streaming has a target.
    aiContextSummaryEl.innerHTML = `
      <div class="ai-fade-in">
        <div id="ai-quick-mount">
          <div class="summary-quick-card summary-quick-skeleton">
            <div class="summary-quick-label">Before you read</div>
            <div class="summary-quick-title">${(book || '').toUpperCase()} ${chapter}</div>
            <div style="padding:20px 0;text-align:center;">${sparkleLoaderHTML('…')}</div>
          </div>
        </div>
        <div class="summary-full-section" id="ai-full-mount"></div>
      </div>`;

    const quickMount = document.getElementById('ai-quick-mount');
    const fullMount = document.getElementById('ai-full-mount');

    // Fire both in parallel. Quick stays non-streaming (we need to parse
    // structured CONTEXT:/WHAT_HAPPENS:/WATCH_FOR: sections). Full streams
    // so the user sees text appearing almost immediately.
    const quickPromise = callGemini(quickPrompt).then((quickText) => {
      const quick = parseQuickSummary(quickText);
      let html = `
        <div class="summary-quick-card">
          <div class="summary-quick-label">Before you read</div>
          <div class="summary-quick-title">${(book || '').toUpperCase()} ${chapter}</div>`;
      if (quick.context) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">Context</div>
          <div class="summary-quick-section-text">${quick.context}</div>
        </div>`;
      }
      if (quick.whatHappens) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">What Happens</div>
          <div class="summary-quick-section-text">${quick.whatHappens}</div>
        </div>`;
      }
      if (quick.watchFor) {
        html += `<div class="summary-quick-section">
          <div class="summary-quick-section-title">Watch For</div>
          <div class="summary-quick-section-text">${quick.watchFor}</div>
        </div>`;
      }
      html += `</div>`;
      quickMount.innerHTML = html;
    });

    const fullPromise = callGeminiStream(fullPrompt, (_chunk, full) => {
      // Re-render progressively. summaryMdToHTML is fast (~<1ms on typical input).
      fullMount.innerHTML = summaryMdToHTML(full);
    });

    await Promise.all([quickPromise, fullPromise]);
  } catch (err) {
    console.error(err);
    aiContextSummaryEl.innerHTML = "<p>Failed to generate context summary.</p>";
  }
}

function parseQuickSummary(text) {
  let context = '', whatHappens = '', watchFor = '';
  const lines = text.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (/^CONTEXT:/i.test(t)) context = t.replace(/^CONTEXT:\s*/i, '');
    else if (/^WHAT.?HAPPENS:/i.test(t)) whatHappens = t.replace(/^WHAT.?HAPPENS:\s*/i, '');
    else if (/^WATCH.?FOR:/i.test(t)) watchFor = t.replace(/^WATCH.?FOR:\s*/i, '');
  }
  // Fallback
  if (!context && !whatHappens && !watchFor) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    context = sentences[0] || text;
    whatHappens = sentences[1] || '';
    watchFor = sentences[2] || '';
  }
  return { context, whatHappens, watchFor };
}

function summaryMdToHTML(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) { html += '<div style="height:8px"></div>'; continue; }
    if (t.startsWith('#### ')) { html += `<h3>${t.slice(5)}</h3>`; continue; }
    if (t.startsWith('### ')) { html += `<h3>${t.slice(4)}</h3>`; continue; }
    if (t.startsWith('## ')) { html += `<h2>${t.slice(3)}</h2>`; continue; }
    if (t.startsWith('# ')) { html += `<h1>${t.slice(2)}</h1>`; continue; }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      html += `<div class="md-bullet"><span class="md-bullet-dot">•</span><span class="md-bullet-text">${inlineMd(t.slice(2))}</span></div>`;
      continue;
    }
    const numMatch = t.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      html += `<div class="md-bullet"><span class="md-num">${numMatch[1]}.</span><span class="md-bullet-text">${inlineMd(numMatch[2])}</span></div>`;
      continue;
    }
    html += `<p>${inlineMd(t)}</p>`;
  }
  return html;
}

// Idempotent: ensures (a) the delegated retry-click handler is wired on
// #aiReflection, (b) the .ai-refl-retry button exists in the DOM, and
// (c) the button's enabled/tooltip state matches current answer count.
function _ensureReflectionRetryUI(mount) {
  if (!mount) return;

  if (!mount.dataset.retryWired) {
    mount.dataset.retryWired = "1";

    // Click → smart retry: only regenerate questions WITHOUT an answer.
    mount.addEventListener("click", async (e) => {
      const btn = e.target.closest(".ai-refl-retry");
      if (!btn || !mount.contains(btn)) return;
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add("ai-refl-retry-spinning");
      try {
        await _smartRetryReflections();
      } catch (err) {
        console.error("[reflection retry]", err);
      } finally {
        const stillBtn = mount.querySelector(".ai-refl-retry");
        if (stillBtn) stillBtn.classList.remove("ai-refl-retry-spinning");
        _refreshRetryButtonState(mount);
      }
    });

    // Input on any reflection textarea → recompute button state. Delegation
    // means it works for textareas added later (partial regen creates new ones).
    mount.addEventListener("input", (e) => {
      if (e.target?.tagName === "TEXTAREA") _refreshRetryButtonState(mount);
    });
  }

  if (!mount.querySelector(".ai-refl-retry")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-refl-retry";
    btn.setAttribute("aria-label", "Regenerate reflection questions");
    btn.title = "Regenerate questions";
    btn.innerHTML = `<span class="material-symbols-outlined">refresh</span>`;
    mount.insertBefore(btn, mount.firstChild);
  }

  _refreshRetryButtonState(mount);
}

// Reads the current answer state and updates the retry button:
//   - all 3 textareas have non-empty values → disabled + tooltip "All
//     questions answered"
//   - otherwise → enabled + default tooltip
function _refreshRetryButtonState(mount) {
  if (!mount) return;
  const btn = mount.querySelector(".ai-refl-retry");
  if (!btn) return;
  const tas = [...mount.querySelectorAll('textarea[id^="reflection-"]')];
  if (tas.length === 0) {
    btn.disabled = false;
    btn.title = "Regenerate questions";
    btn.classList.remove("ai-refl-retry-done");
    return;
  }
  const allAnswered = tas.every((t) => (t.value || "").trim().length > 0);
  if (allAnswered) {
    btn.disabled = true;
    btn.title = "All questions answered ✓";
    btn.classList.add("ai-refl-retry-done");
  } else {
    btn.disabled = false;
    btn.title = "Regenerate unanswered questions";
    btn.classList.remove("ai-refl-retry-done");
  }
}

// Smart retry: regenerates ONLY questions without an answer. Falls back to
// full regen when no answers exist yet (or structure is missing).
async function _smartRetryReflections() {
  const mount = document.getElementById("aiReflection");
  if (!mount) return;
  const payload = window.__aiPayload;
  if (!payload) throw new Error("no aiPayload");

  const ol = mount.querySelector("ol");
  const lis = ol ? [...ol.children].filter((el) => el.tagName === "LI") : [];
  if (!ol || lis.length === 0) {
    // No structured questions yet — full regen.
    return await _fullRetryReflections();
  }

  const slots = lis.map((li) => {
    const ta = li.querySelector("textarea");
    const question = li.querySelector("p")?.textContent?.trim() || "";
    const answer = (ta?.value || "").trim();
    return { li, ta, question, answer, answered: !!answer };
  });

  const unansweredIdx = slots
    .map((s, i) => (s.answered ? -1 : i))
    .filter((i) => i >= 0);

  if (unansweredIdx.length === 0) return;
  if (unansweredIdx.length === slots.length) {
    return await _fullRetryReflections();
  }

  const answeredQuestions = slots.filter((s) => s.answered).map((s) => s.question);
  const newLis = await _fetchReflectionLis({
    book: payload.book,
    chapter: payload.chapter,
    versesText: payload.versesText,
    count: unansweredIdx.length,
    excludeQuestions: answeredQuestions,
    recentPriorQs: _getRecentReflQs(),
    angles: _pickAnglesForPassage(payload.book, payload.chapter),
  });
  if (!newLis || newLis.length === 0) {
    return await _fullRetryReflections();
  }

  // Snapshot answers BEFORE swap so we can restore them after.
  const answersById = {};
  mount.querySelectorAll('textarea[id^="reflection-"]').forEach((ta) => {
    if (ta.id && ta.value) answersById[ta.id] = ta.value;
  });

  // In-place swap. If AI returned fewer than requested, only swap what we got.
  const swapCount = Math.min(unansweredIdx.length, newLis.length);
  for (let n = 0; n < swapCount; n++) {
    const targetIdx = unansweredIdx[n];
    const targetLi = ol.children[targetIdx];
    if (targetLi) ol.replaceChild(newLis[n], targetLi);
  }

  // Re-key textarea ids positionally (matches initializeReflections format).
  mount.querySelectorAll("textarea").forEach((ta, i) => {
    ta.id = `reflection-${devotionId()}-${i}`;
  });

  // Wire input listeners on the NEW textareas only (existing ones already
  // have listeners from the previous initializeReflections pass). Wire link
  // click handlers on new lis only.
  for (let n = 0; n < swapCount; n++) {
    const idx = unansweredIdx[n];
    const li = ol.children[idx];
    const ta = li.querySelector("textarea");
    if (ta) _wireReflectionTextarea(ta);
    li.querySelectorAll("a.reflection-link").forEach(_wireReflectionLink);
  }

  // Restore answers by id (preserved textareas stay populated; new ones
  // don't have a saved value yet).
  Object.entries(answersById).forEach(([id, value]) => {
    const ta = mount.querySelector(`#${CSS.escape(id)}`);
    if (ta) ta.value = value;
  });

  // Persist updated reflection HTML so a reload reflects the new state.
  const updated = (await loadAIFromStorage()) || {};
  await saveAIToStorage({
    ...updated,
    reflectionHTML:
      mount.innerHTML !== "<p>Failed to generate reflection questions.</p>"
        ? mount.innerHTML
        : null,
  });
}

// Full-regenerate path used when no answers exist or partial fails.
async function _fullRetryReflections() {
  const mount = document.getElementById("aiReflection");
  if (!mount) return;
  const payload = window.__aiPayload;
  if (!payload) return;
  const existing = (await loadAIFromStorage()) || {};
  await saveAIToStorage({ ...existing, reflectionHTML: null, answers: {} });
  await renderAIReflectionQuestions(payload);
  const updated = (await loadAIFromStorage()) || {};
  await saveAIToStorage({
    ...updated,
    reflectionHTML:
      mount.innerHTML !== "<p>Failed to generate reflection questions.</p>"
        ? mount.innerHTML
        : null,
  });
}

// Wires the input listener used by initializeReflections — extracted so we
// can wire NEW textareas added during partial regen without re-wiring
// existing ones (which would double-fire saves).
function _wireReflectionTextarea(area) {
  if (!area || area.dataset.wiredInput === "1") return;
  area.dataset.wiredInput = "1";
  const questionText = area.previousElementSibling?.textContent || "Question";
  area.addEventListener("input", async () => {
    const formattedEntry = `Q: ${questionText}\nA: ${area.value}`;
    localStorage.setItem(area.id, formattedEntry);
    localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));
    if (typeof checkIfHasTextAreaAnswers === "function") checkIfHasTextAreaAnswers();
    if (typeof _debouncedPushSync === "function") _debouncedPushSync();
    const cachedAI = await loadAIFromStorage();
    if (cachedAI) {
      if (!cachedAI.answers) cachedAI.answers = {};
      cachedAI.answers[area.id] = area.value;
      await saveAIToStorage(cachedAI);
    }
  });
}

// Wires the verse-reference link click → smooth-scroll + glow.
function _wireReflectionLink(link) {
  if (!link || link.dataset.wired === "1") return;
  link.dataset.wired = "1";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const rawRef =
      link.textContent.replace(/[^0-9,\-–\s]/g, "").trim() ||
      (link.getAttribute("href")?.replace("#", "") || "");
    const verseNum = rawRef.replace(/[^0-9]/g, " ").trim().split(/\s+/)[0];
    if (!verseNum) return;
    const allVerses = document.querySelectorAll("#output .verse");
    const target = Array.from(allVerses).find(
      (el) => el.querySelector(".verse-num")?.textContent?.trim() === verseNum,
    );
    const header = target?.querySelector(".verse-header") || target;
    if (header) {
      header.scrollIntoView({ behavior: "smooth", block: "center" });
      header.classList.remove("verseGlow");
      void header.offsetWidth;
      header.classList.add("verseGlow");
    }
  });
}

// Old Testament book IDs in BIBLE_META. Used to gate features that only make
// sense on OT chapters (e.g. NT-echo card, which surfaces the NT passage that
// fulfills or echoes the OT one).
const _OT_BOOK_IDS = new Set([
  "GEN","EXO","LEV","NUM","DEU",
  "JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH","EST",
  "JOB","PSA","PRO","ECC","SNG",
  "ISA","JER","LAM","EZK","DAN",
  "HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL",
]);

// NT-echo card: looks up the single most relevant New Testament passage that
// fulfills or comments on the current OT chapter (e.g. Lev → Hebrews 7-10,
// Genesis covenants → Romans 4). Cached by chapter (not verse) since the echo
// applies to the whole chapter; key prefix `ntEcho-` is in
// SYNC_DYNAMIC_PREFIXES so for sync users it rides the existing
// localStorage→RTDB mirror.
async function loadNtEcho() {
  const card = document.getElementById("ntEchoCard");
  if (!card) return;

  const payload = window.__aiPayload;
  if (!payload || !payload.book || !payload.chapter) {
    card.hidden = true;
    return;
  }

  // payload.book is the all-caps book NAME (e.g. "LEVITICUS") set by
  // loadPassage. _bookNameToId resolves it back to the BIBLE_META key.
  const bookId = _bookNameToId(payload.book);
  if (!bookId || !_OT_BOOK_IDS.has(bookId)) {
    card.hidden = true;
    return;
  }

  const cacheKey = `ntEcho-${bookId}-${payload.chapter}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      _renderNtEchoCard(card, obj);
      return;
    } catch {}
  }

  // Loading state — same dot-loader the dashboard recap uses.
  card.hidden = false;
  card.innerHTML = `
    <div class="nt-echo-label"><span class="material-symbols-outlined">link</span> Looking for the NT echo…</div>
    <div class="nt-echo-loader"><span class="rdot"></span><span class="rdot"></span><span class="rdot"></span></div>
  `;

  const bookName = (window.BIBLE_META?.[bookId]?.name) || payload.book;
  const prompt = `For the Old Testament chapter ${bookName} ${payload.chapter}, identify the single most directly relevant New Testament passage that FULFILLS, COMMENTS ON, or ECHOES its content.

Examples of strong matches:
- Leviticus sacrifice/priesthood → Hebrews 7–10
- Genesis covenant with Abraham → Romans 4 or Galatians 3
- Israel's wilderness → 1 Corinthians 10
- Day of Atonement → Hebrews 9
- Passover → 1 Corinthians 5:7 or John 1:29
- Tabernacle / temple → Hebrews 8–9 or John 2
- Davidic kingship → Acts 2 / Hebrews 1
- Suffering servant prophecies → 1 Peter 2 / Acts 8

Reply with ONLY a JSON object on a single line. No markdown, no code fences, no explanation around it.

JSON shape:
{"book":"<full NT book name>","chapter":<integer>,"startVerse":<integer>,"endVerse":<integer>,"note":"<one short sentence — max 24 words — explaining in casual gospel-centered tone WHY this NT passage is the echo. No 'this passage' / 'this chapter'. No academic words. No emojis. Address the reader as 'you' if natural.>"}

Now produce the JSON for ${bookName} ${payload.chapter}:`;

  try {
    const res = await fetch("https://gemini-proxy-668755364170.asia-southeast1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
    });
    const data = await res.json();
    let raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    // Some responses prepend prose before the JSON — slice from first { to last }.
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      raw = raw.slice(firstBrace, lastBrace + 1);
    }
    const obj = JSON.parse(raw);
    if (!obj.book || !obj.chapter || !obj.note) throw new Error("incomplete echo");

    localStorage.setItem(cacheKey, JSON.stringify(obj));

    // Only render if the user is still on the same chapter (they may have
    // navigated away while the request was in flight).
    if (window.__aiPayload?.book === payload.book && window.__aiPayload?.chapter === payload.chapter) {
      _renderNtEchoCard(card, obj);
    }
  } catch (err) {
    console.warn("[nt-echo] fetch failed:", err?.message || err);
    card.hidden = true;
  }
}

function _renderNtEchoCard(card, data) {
  const { book, chapter, startVerse, endVerse, note } = data || {};
  if (!book || !chapter || !note) { card.hidden = true; return; }

  const sv = Number(startVerse) || 1;
  const ev = Number(endVerse) || sv;
  const refLabel = ev > sv ? `${book} ${chapter}:${sv}–${ev}` : `${book} ${chapter}:${sv}`;

  card.hidden = false;
  card.innerHTML = `
    <div class="nt-echo-label"><span class="material-symbols-outlined">link</span> NT echo</div>
    <div class="nt-echo-ref">${_escHtml(refLabel)}</div>
    <div class="nt-echo-note">${_escHtml(note)}</div>
    <button class="nt-echo-read-btn" type="button">
      Read this <span class="material-symbols-outlined">arrow_forward</span>
    </button>
  `;
  const btn = card.querySelector(".nt-echo-read-btn");
  if (btn) {
    btn.onclick = () => {
      const targetBookId = _bookNameToId(book);
      if (!targetBookId) return;
      // loadPassageById takes "BOOK-CHAPTER-VERSE"; pass the start verse so the
      // glow animation lands on the relevant verse when the chapter renders.
      loadPassageById(`${targetBookId}-${chapter}-${sv}`);
    };
  }
}

// Five reflection angles the prompt rotates through so consecutive chapters
// don't all hit the same shape. _pickAnglesForPassage picks 3 of these
// deterministically per book+chapter so retries on the same chapter use the
// same angle mix (the AI rephrases within them) but neighboring chapters get
// distinctly different mixes.
const _REFLECTION_ANGLES = [
  { id: "character", label: "CHARACTER OF GOD",      desc: "What this passage reveals about who God is — His holiness, mercy, justice, attention, or love. The question should make the reader pause on God Himself, not their own behavior." },
  { id: "heart",     label: "HEART PRINCIPLE",       desc: "The underlying heart-attitude the passage exposes or invites — pride, fear, trust, complacency, longing. Names a real internal posture, not a moral lesson." },
  { id: "christ",    label: "CHRIST FULFILLMENT",    desc: "How Jesus completes, fulfills, or replaces what is pictured here (especially for OT shadows — sacrifice, priest, purity, rest, kingdom). Connects the chapter to the gospel without making the reader perform OT ritual." },
  { id: "identity",  label: "IDENTITY IN CHRIST",    desc: "Who the reader is now in light of this passage and the gospel — beloved, forgiven, adopted, sealed, free. Reframes the OT command from 'must I' to 'who am I'." },
  { id: "prayer",    label: "PRAYER-SHAPED",         desc: "A question the reader could pray honestly in one breath — surfaces a felt confession, a longing, a thanksgiving, or a cry. Language should be visceral, not polished." },
];

function _hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function _pickAnglesForPassage(book, chapter) {
  const seed = _hashStr(`${book || ""}-${chapter || ""}`);
  const pool = [..._REFLECTION_ANGLES];
  const picked = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = (Math.floor(seed / Math.pow(7, i))) % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// Rolling buffer of the last ~15 reflection questions the user has seen
// across recent chapters. Passed to the prompt as "RECENTLY ASKED" so the AI
// varies tone/openings/angles from them. Cross-chapter scope: this is what
// stops the Leviticus 23 → 24 → 25 questions from feeling identical.
const _RECENT_REFL_KEY = "devo.recentReflQs";
const _RECENT_REFL_MAX = 15;

function _getRecentReflQs() {
  try {
    const raw = localStorage.getItem(_RECENT_REFL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch { return []; }
}

function _appendRecentReflQs(questions) {
  if (!questions || !questions.length) return;
  const arr = _getRecentReflQs();
  for (const q of questions) {
    const t = (q || "").trim();
    if (!t) continue;
    arr.push(t);
  }
  while (arr.length > _RECENT_REFL_MAX) arr.shift();
  try { localStorage.setItem(_RECENT_REFL_KEY, JSON.stringify(arr)); } catch {}
}

// AI fetch for reflection <li> items. Returns an array of detached <li>
// elements (so caller can swap them into an existing <ol>). Used by both
// renderAIReflectionQuestions (count=3) and _smartRetryReflections (count<3).
async function _fetchReflectionLis({ book, chapter, versesText, count = 3, excludeQuestions = [], recentPriorQs = [], angles = null }) {
  const exclusionBlock = excludeQuestions.length
    ? `\nALREADY-ASKED QUESTIONS (DO NOT duplicate, paraphrase, or rehash these — they have been answered already):\n${excludeQuestions.map((q) => `- ${q}`).join("\n")}\n`
    : "";

  const priorBlock = recentPriorQs.length
    ? `\nRECENTLY ASKED ACROSS THE READER'S PRIOR CHAPTERS (vary tone, opening words, sentence shape, and angle from these — DO NOT echo their phrasings):\n${recentPriorQs.map((q) => `- ${q}`).join("\n")}\n`
    : "";

  const pickedAngles = angles && angles.length === 3 ? angles : _pickAnglesForPassage(book, chapter);
  const angleBlock = `\nREQUIRED ANGLE COVERAGE FOR THIS BATCH (each numbered question must clearly land on ONE of these angles; ALL three angles must appear across the ${count > 1 ? count : 3}-question set):\n${pickedAngles.map((a, i) => `${i + 1}. ${a.label} — ${a.desc}`).join("\n")}\n`;

  const prompt = `
IMPORTANT OUTPUT RULES (STRICT):
- Respond with RAW HTML ONLY
- DO NOT use code blocks
- DO NOT use backticks
- DO NOT write the word html
- The FIRST character must be "<"
- Use ONE outer div only
- EACH question must be followed by a <textarea> for the user's answer
- Textareas must be empty and user-editable


ALLOWED TAGS:
div, p, ol, li, textarea, a

BANNED (DO NOT USE):
- strong, em, b, i, span, mark, code — DO NOT wrap any words in styling tags
- DO NOT highlight or style quoted Bible phrases — just write them as plain text in the sentence


ROLE:
You generate DISCUSSION AND REFLECTION QUESTIONS.
You must NOT give answers.
You must NOT speak as God.


COVENANT RULE (CRITICAL — NON-NEGOTIABLE — APPLIES TO ALL OLD TESTAMENT PASSAGES):

The reader is a Christian living AFTER the resurrection of Jesus, under the NEW COVENANT (Hebrews 8–10, Acts 10:9–16, Mark 7:19, Galatians 3:23–25, Colossians 2:16–17, Romans 14:14, 1 Timothy 4:3–5).

This means the following OT laws are NO LONGER BINDING on the reader:
- Dietary laws (clean/unclean animals, food restrictions) — Jesus declared all foods clean (Mark 7:19; Acts 10:15)
- Ceremonial purity laws (washing rituals, touching dead things, bodily-discharge rules)
- Sacrificial laws (animal offerings, priestly rituals)
- Civil/theocratic laws (stoning, ancient Israel's national legal code)
- Festival and Sabbath ceremonial observance (Colossians 2:16)

The reader is fully redeemed and FREE from these requirements. Therefore:

⛔ HARD FORBIDDEN — NEVER ASK THESE QUESTION TYPES (zero tolerance):
- "What unclean food will you avoid this week?"
- "What food choice will you make differently this week, reflecting God's call to be set apart?"
- "How will you keep yourself ceremonially clean…?"
- "Which sacrifice / offering will you bring…?"
- "How will you observe this purity / dietary / ritual law in your life today?"
- ANY question that asks the reader to literally obey, perform, or modify their behavior to match an OT ceremonial / dietary / sacrificial / civil command.
- ANY question that implies the reader is still under those laws.

These questions are biblically WRONG for a NT believer. They contradict the gospel of grace and Christ's finished work. If you generate one, the question is rejected.

✅ INSTEAD, redirect to one of these four NT-faithful angles:

  1. CHARACTER OF GOD revealed by the law (His holiness, justice, care, distinction-making, attention to detail) → "What does this passage show you about who God is — and how does that shape your worship today?"

  2. HEART PRINCIPLE behind the ceremony, applied to NT life (set-apart living, the seriousness of sin, costly devotion, separation from worldliness — NOT the literal ritual) → "Where in your life is God calling you to be 'set apart' in a way that honors Him — not in food, but in attitudes, relationships, or habits?"

  3. CHRIST FULFILLMENT — how the OT shadow points to Jesus (the true sacrifice, the true priest, the true purity, the true Sabbath rest) → "Knowing Jesus fulfilled this law on your behalf, how does that change the way you carry guilt or strive for holiness this week?"

  4. NT-PARALLEL TRANSFER — the OT principle re-expressed in NT moral terms (e.g., bodily holiness → 1 Cor 6:19–20; food laws → Romans 14 / 1 Cor 8 freedom-and-love; Sabbath → Hebrews 4 rest in Christ) → "How might you live out the heart of this passage — set-apart devotion to God — through love, integrity, or self-control today?"

CONCRETE REWRITE EXAMPLES (study these — match this style):

  Passage: Leviticus 11 (clean/unclean food)
  ❌ BAD:  "What specific food choice will you make differently this week, reflecting God's call to be set apart?"
  ✅ GOOD: "Jesus declared all foods clean — so what NON-food area of your life does God still call you to set apart for Him?"

  Passage: Leviticus 11
  ❌ BAD:  "What unclean food will you avoid?"
  ✅ GOOD: "What does God's careful attention to clean vs. unclean reveal about His character — and how does that shape your awe of Him today?"

  Passage: Leviticus 16 (Day of Atonement)
  ❌ BAD:  "How will you bring a sin offering this week?"
  ✅ GOOD: "Jesus is the true and final sacrifice — what guilt are you still carrying that He has already paid for?"

  Passage: Leviticus 19 (holiness code)
  ❌ BAD:  "How will you keep yourself ceremonially pure?"
  ✅ GOOD: "What's one way you've been blending in with the world that God is asking you to live differently in?"

SELF-CHECK BEFORE EMITTING EACH QUESTION:
1. Does this question ask the reader to literally perform / observe / avoid something the OT ritual law commanded? → If YES, REWRITE. The reader is not under that law.
2. Does the question imply the reader still needs to "keep" or "fulfill" a ceremonial / dietary / sacrificial requirement? → If YES, REWRITE. Christ fulfilled it.
3. Does the question point to God's character, the heart-principle, Christ's fulfillment, or a NT-shaped application? → If YES, KEEP IT.

For NT passages, universal moral commands (love, honesty, sexual purity, prayer, generosity, justice, the fruit of the Spirit), and creation/wisdom literature (Proverbs, Psalms, etc.), apply normally — this covenant rule only restricts OT ceremonial / dietary / sacrificial / civil law from being treated as still-binding.


TASK:
Generate EXACTLY ${count} numbered questions based on the passage.
${angleBlock}${exclusionBlock}${priorBlock}
FRESHNESS RULE (STRICT — defeats user fatigue from reading similar OT chapters back-to-back):
- Across THIS batch, the 3 questions must use AT LEAST 2 DIFFERENT opening words. Don't open all three with "What" / "How" / "Where".
- Sentence shapes within this batch must differ — don't make all three follow the same "X — and Y?" or "What's one Z?" template.
- If RECENTLY-ASKED-ACROSS-PRIOR-CHAPTERS is present above, your questions must read distinctly from those — different angle, different opening, different rhythm. Avoid stock phrases the AI tends to lean on (e.g., "set apart", "what does this reveal about", "reflect on", "consider how", "wrestle with").
- Each question must feel earned by THIS specific chapter — name a concrete detail (a person, an action, an object, a number, a place) from the passage so the question can't have been asked of any other chapter.


CRITICAL LINKING RULE (MUST FOLLOW):
- EVERY verse reference MUST be written as an <a> link
- Link format: <a href="#X" class="reflection-link">v. X</a> or <a href="#X" class="reflection-link">vv. X–Y</a>
- The href MUST always point to the FIRST verse in the reference
- DO NOT include any verse numbers outside of <a> tags
- STRICTOR RULE: DO NOT include parentheses around the link or the text inside the link (e.g., write "v. 5", NOT "(v. 5)" and NOT "<a>(v. 5)</a>")
- If a question references multiple verses or ranges, EACH one must be linked
- Final output must contain ZERO plain-text verse references and ZERO parentheses surrounding verse links


QUESTION STYLE (STRICT — FOLLOW EXACTLY):
- CONVERSATIONAL tone — like a friend asking over coffee, NOT a preacher, pastor, theologian, or textbook author
- HARD MAX: 20 WORDS PER QUESTION. Count the words. If 21+, rewrite shorter.
- Address the reader directly ("you", "your") — ALWAYS second person
- ONE single idea per question. If you're tempted to use "considering…", "in light of…", "given that…" — STOP and split into two questions or pick one angle
- Use plain, everyday English. A 16-year-old should understand every word without a dictionary
- Prefer CONCRETE over abstract. "What would you do if…" beats "What does this teach you about…"
- At least ONE question must name a specific action for THIS WEEK
- VARY the opening — don't start every question with "What" or "How"

BANNED WORDS / PHRASES (do not use any of these):
- theological, implications, undeserving, unified, turning towards, in light of, considering, ultimate, collective response, encompassing, holistic, grapple, wrestle with, challenge your understanding, sovereign, providence, salvific, eschatological

FORBIDDEN PATTERNS:
- "What does X teach you about Y?" — school-quiz phrasing, don't use
- "How does X challenge your understanding of Y?" — academic, don't use
- Compound questions with "and" connecting two different concepts
- Questions that restate the verse before asking (just ask the question)

GOOD EXAMPLES (write like these):
- "Where in your life are you running from something God is asking you to do? (vv. 1–3)"
- "What's one thing you're stubbornly holding onto that God is calling you to let go of? (v. 5)"
- "How would your week look if you took v. 8 seriously starting tomorrow?"
- "Who in your life needs the same mercy God gave Nineveh — and what's stopping you? (v. 10)"
- "Name one habit you'd cut this week if you really believed v. 9 applied to you."

BAD EXAMPLES (do NOT write like these):
- "What does their collective response, from the common people to the king, teach you about the power of a unified turning towards God?" — too long, academic, multi-concept
- "Considering God's ultimate compassion, how does this passage challenge your understanding of mercy, even to those who might seem undeserving?" — 3 concepts crammed in, jargon

PERSONALIZATION RULE (STRICT):
- ALL questions MUST be directly addressed to the reader
- Never use "people today", "believers", "society", "we as a community"

DO NOT:
- Provide answers
- Preach or moralize
- Explain theology
- Use parentheses around the verse link (write "v. 5" not "(v. 5)")

STRUCTURE:
- NO title
- NO intro sentence
- An <ol> with EXACTLY ${count} <li> items
- Inside each <li>:
  - A single <p> containing the full question text (including the verse link)
  - A <textarea> immediately after the <p>


PASSAGE:
${book} ${chapter}

${versesText}
`;

  const res = await fetch("https://gemini-proxy-668755364170.asia-southeast1.run.app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: "summary", contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  let rawHTML = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!rawHTML) return [];

  rawHTML = rawHTML.replace(/\s*style="[^"]*"/gi, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = rawHTML;
  tmp.querySelectorAll("li").forEach((li) => {
    if (!li.querySelector("textarea")) {
      const ta = document.createElement("textarea");
      ta.setAttribute("placeholder", "Write your thoughts here...");
      li.appendChild(ta);
    }
  });
  tmp.querySelectorAll("ol > textarea, ul > textarea, div > textarea").forEach((ta) => {
    if (!ta.closest("li")) ta.remove();
  });
  return [...tmp.querySelectorAll("li")];
}

async function renderAIReflectionQuestions({ book, chapter, versesText }) {
  const mount = document.getElementById("aiReflection");
  mount.classList.add("ai-fade-in");
  _ensureReflectionRetryUI(mount);

  mount.innerHTML = `
  <div class="ai-shimmer">
    <div class="ai-shimmer-block"></div>
    <div class="ai-shimmer-block"></div>
    <div class="ai-shimmer-block short"></div>
  </div>
`;

  try {
    const recentPriorQs = _getRecentReflQs();
    const angles = _pickAnglesForPassage(book, chapter);
    const lis = await _fetchReflectionLis({ book, chapter, versesText, count: 3, recentPriorQs, angles });
    if (!lis || lis.length === 0) {
      mount.innerHTML = "<p>Failed to generate reflection questions.</p>";
      return true;
    }
    // Track the new questions in the cross-chapter rolling buffer so the next
    // chapter's prompt knows to vary from them. Only the initial render writes
    // here — retries operate within a single chapter and shouldn't pollute the
    // cross-chapter signal.
    const newQuestionTexts = lis
      .map((li) => li.querySelector("p")?.textContent?.trim())
      .filter(Boolean);
    _appendRecentReflQs(newQuestionTexts);

    const olHtml = `<ol>${lis.map((li) => li.outerHTML).join("")}</ol>`;
    mount.innerHTML = `
      <button type="button" class="ai-refl-retry" aria-label="Regenerate reflection questions" title="Regenerate questions">
        <span class="material-symbols-outlined">refresh</span>
      </button>
      ${olHtml}
    `;

    setTimeout(restoreSavedReflectionAnswers, 0);

    mount.querySelectorAll("textarea").forEach((ta, i) => {
      ta.id = `reflection-${devotionId()}-${i}`;
    });

    mount.querySelectorAll("a.reflection-link").forEach(_wireReflectionLink);

    initializeReflections();
    _refreshRetryButtonState(mount);
  } catch (e) {
    console.error(e);
    mount.innerHTML = "<p>Failed to generate reflection questions.</p>";
  }
  return true;
}

async function restoreSavedReflectionAnswers() {
  const cached = await loadAIFromStorage();
  if (!cached?.answers) return;

  document.querySelectorAll("#aiReflection textarea").forEach((ta) => {
    if (cached.answers[ta.id] !== undefined) {
      ta.value = cached.answers[ta.id];
    }
  });
}

// =============================================================================
// DASH PROVERB NUGGET — small inline dashboard card. AI picks one practical
// Proverbs topic + the matching verse + a concrete one-line application.
// Refreshable on tap; cache also auto-expires every 8 hours so the nugget
// rotates ~3× per day on its own without any user action.
// =============================================================================

const _DASH_PROV_KEY = "dashProverbCache";
const _DASH_PROV_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Rolling buffer of the last N verse refs we've shown — fed to the prompt as
// an exclusion list so the AI doesn't keep landing on the same Proverbs verses
// (it has a strong bias toward famous ones like 3:5–6, 13:20, 23:22 etc).
const _RECENT_PROV_REFS_KEY = "dashProverbRecentRefs";
const _RECENT_PROV_REFS_MAX = 12;

function _getRecentProvRefs() {
  try {
    const raw = localStorage.getItem(_RECENT_PROV_REFS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _appendRecentProvRef(ref) {
  if (!ref) return;
  const arr = _getRecentProvRefs();
  arr.push(ref);
  while (arr.length > _RECENT_PROV_REFS_MAX) arr.shift();
  try { localStorage.setItem(_RECENT_PROV_REFS_KEY, JSON.stringify(arr)); } catch {}
}

async function loadDashProverb(forceFresh = false) {
  const card = document.getElementById("dashProvCard");
  if (!card) return;

  if (forceFresh) {
    try { localStorage.removeItem(_DASH_PROV_KEY); } catch {}
  } else {
    const cached = localStorage.getItem(_DASH_PROV_KEY);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        const fresh = obj && obj.data && obj.ts && (Date.now() - obj.ts) < _DASH_PROV_TTL_MS;
        if (fresh) {
          // The cached payload only stores coordinates (topic, chapter,
          // startVerse, endVerse, apply). Re-resolve text + ref from the
          // currently-active Bible JSON so version flips (NASB ↔ Easy)
          // automatically pick up the right wording.
          const resolved = await _resolveProverbForRender(obj.data);
          if (resolved) {
            _renderDashProverb(card, resolved);
            return;
          }
        }
      } catch {}
    }
  }

  card.innerHTML = `
    <div class="dash-prov-loader">
      <span class="rdot"></span><span class="rdot"></span><span class="rdot"></span>
    </div>
  `;

  // Retry loop — the proverb card is ambient/idle UI, so we shouldn't ever
  // show "Couldn't load" unless the network is genuinely down. Each attempt
  // re-rolls a random chapter so a single bad chapter pick (or a flaky
  // Gemini response) doesn't poison subsequent tries. Backoff caps at ~8s
  // and gives up only after MAX_TRIES; the final fallback keeps the same
  // try-again button behavior we had before.
  const MAX_TRIES = 6;
  const baseDelay = 700;

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    // If we know the browser is offline, wait until it comes back rather
    // than burning retries against guaranteed failures.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await new Promise((resolve) => {
        const onBack = () => { window.removeEventListener("online", onBack); resolve(); };
        window.addEventListener("online", onBack);
      });
    }

    // Force breadth across all of Proverbs (31 chapters, ~915 verses) by
    // pre-rolling a random chapter client-side and telling the AI to pull
    // from it. Each retry re-rolls so a "verse missing" failure doesn't
    // loop on the same chapter forever.
    const randomChapter = Math.floor(Math.random() * 31) + 1;
    const recentRefs = _getRecentProvRefs();
    const lastTopic = localStorage.getItem("dashProverbLastTopic") || "";

    const exclusionLines = [];
    if (recentRefs.length) {
      exclusionLines.push(`DO NOT use any of these recently-shown verse refs (pick something different): ${recentRefs.join(", ")}.`);
    }
    if (lastTopic) {
      exclusionLines.push(`Avoid this recently-shown topic: "${lastTopic}". Pick a clearly different angle.`);
    }
    const exclusionBlock = exclusionLines.length ? `\n${exclusionLines.join("\n")}\n` : "";

    const prompt = `Pick ONE simple, practical topic from the book of Proverbs that a young adult Christian could apply TODAY. We will pull the actual verse text from a local Bible JSON afterward — so all you need to give us is COORDINATES (chapter + verse range) plus the topic name and a one-line application.

CHAPTER LOCK: Pick verse(s) SPECIFICALLY from Proverbs chapter ${randomChapter}. (The chapter is pre-rolled at random to force breadth across the whole book instead of the same famous verses.) Pick a single verse if a single verse stands; pick a range of 2–3 verses only if they form one tight thought.
${exclusionBlock}
If chapter ${randomChapter} truly has no usable verse for a young adult NT believer (rare — almost every Proverbs chapter has actionable wisdom), you may pick from the closest neighboring chapter; but DEFAULT to staying inside chapter ${randomChapter}.

Topic should be specific and practical — examples of variety: patience, restraint, integrity in small things, what you laugh at, contentment, listening before speaking, generosity, anger, the tongue, hard work, pride, money, planning, parents, neighbors, the heart, fear of the Lord, choosing friends.

Return ONLY this JSON object on a single line. No markdown, no code fences, no preamble:

{"topic":"<2–3 word topic in Title Case>","chapter":<integer>,"startVerse":<integer>,"endVerse":<integer>,"apply":"<one short concrete sentence — max 22 words — naming a SPECIFIC thing to do today; casual; an actual action, NOT 'reflect on...' or 'consider how...'>"}

Notes on the JSON:
- "chapter" is an integer (the Proverbs chapter you picked; should equal ${randomChapter} unless the rare neighbor-chapter fallback is needed).
- "startVerse" and "endVerse" are integers. If you're picking one verse, set endVerse equal to startVerse.
- DO NOT include the verse text. We pull it locally.

Example shape:
{"topic":"The Tongue","chapter":18,"startVerse":21,"endVerse":21,"apply":"Send one true encouragement to someone before lunch. Notice what shifts in you afterward."}

Now produce the JSON for Proverbs chapter ${randomChapter}:`;

    try {
      const text = await callGemini(prompt);
      let raw = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) raw = raw.slice(firstBrace, lastBrace + 1);
      const obj = JSON.parse(raw);

      const chapter = Math.max(1, Math.min(31, parseInt(obj.chapter, 10) || 0));
      const startVerse = Math.max(1, parseInt(obj.startVerse, 10) || 0);
      const endVerse = Math.max(startVerse, parseInt(obj.endVerse, 10) || startVerse);
      if (!obj.topic || !chapter || !startVerse || !obj.apply) throw new Error("incomplete coords");

      // Coords-only payload. Verse text is pulled from bibleData on render
      // (and re-pulled if the user flips between NASB and Easy mid-session).
      const data = {
        topic: String(obj.topic).trim(),
        chapter,
        startVerse,
        endVerse,
        apply: String(obj.apply).trim(),
      };

      const resolved = await _resolveProverbForRender(data);
      if (!resolved) throw new Error("verse missing in bibleData");

      try {
        localStorage.setItem(_DASH_PROV_KEY, JSON.stringify({ data, ts: Date.now() }));
        localStorage.setItem("dashProverbLastTopic", data.topic);
      } catch {}
      _appendRecentProvRef(resolved.ref);

      if (document.getElementById("dashProvCard") === card) {
        _renderDashProverb(card, resolved);
      }
      return;
    } catch (err) {
      console.warn(`[dash-proverb] attempt ${attempt + 1}/${MAX_TRIES} failed`, err?.message || err);
      // If the dashboard re-rendered while we were mid-flight, the loader
      // card we're holding has been replaced — bail out without writing.
      if (document.getElementById("dashProvCard") !== card) return;
      // Last attempt — fall through to the failure card below.
      if (attempt === MAX_TRIES - 1) break;
      // Exponential backoff, capped at 8s. Capped low because the proverb
      // card is ambient and we want the user to see a result while they're
      // still on the dashboard.
      const delay = Math.min(8000, baseDelay * Math.pow(1.7, attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (document.getElementById("dashProvCard") !== card) return;
  card.innerHTML = `<p class="dash-prov-fail">Couldn't load — <button type="button" class="dash-prov-fail-retry">try again</button></p>`;
  card.querySelector(".dash-prov-fail-retry")?.addEventListener("click", () => loadDashProverb(true));
}

// Resolves coords-only payload to the renderable shape the card expects.
// Pulls the verse text from the currently-loaded Bible JSON (bibleData)
// so version flips automatically pick up the new wording.
async function _resolveProverbForRender(coords) {
  if (!coords || !coords.chapter || !coords.startVerse) return null;

  if (!bibleData) {
    try { await fetchBibleData(); } catch {}
  }
  const provBook = bibleData?.["PROVERBS"];
  if (!provBook) return null;

  const chData = provBook[String(coords.chapter)];
  if (!chData) return null;

  const sv = coords.startVerse;
  const ev = Math.max(sv, coords.endVerse || sv);
  const verseTexts = [];
  for (let v = sv; v <= ev; v++) {
    const t = chData[String(v)];
    if (!t) break;
    // bibleData has pilcrow markers (¶) at the start of some verses to mark
    // paragraph breaks. They're not part of the actual text — strip them.
    const cleaned = String(t)
      .replace(/^[¶\s]+/, "")
      .replace(/\s¶\s/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    verseTexts.push(cleaned);
  }
  if (verseTexts.length === 0) return null;

  const text = verseTexts.join(" ");
  const ref = ev > sv ? `Proverbs ${coords.chapter}:${sv}–${ev}` : `Proverbs ${coords.chapter}:${sv}`;

  return {
    topic: coords.topic,
    ref,
    text,
    apply: coords.apply,
  };
}

function _renderDashProverb(card, data) {
  // Wrap in a .dash-prov-inner so the swap animation targets ONLY the card's
  // content, not the card frame. The card itself stays put; only the body
  // fades on refresh.
  card.innerHTML = `
    <div class="dash-prov-inner">
      <div class="dash-prov-header">
        <span class="dash-prov-topic">${_escHtml(data.ref)}</span>
        <button type="button" class="dash-prov-refresh" title="Different proverb" aria-label="Different proverb">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </div>
      <blockquote class="dash-prov-verse">
        <span class="dash-prov-text">${_escHtml(data.text)}</span>
      </blockquote>
      <div class="dash-prov-apply">
        <span class="dash-prov-apply-label">Apply today:</span>
        <span class="dash-prov-apply-text">${_escHtml(data.apply)}</span>
      </div>
      <div class="dash-prov-cta">
        <button type="button" class="dash-prov-commit dash-prov-commit--done" data-status="done">
          <span class="material-symbols-outlined">check</span>
          <span>I did this</span>
        </button>
        <button type="button" class="dash-prov-commit dash-prov-commit--todo" data-status="todo">
          <span class="material-symbols-outlined">schedule</span>
          <span>I'll do this</span>
        </button>
      </div>
    </div>
  `;
  card.querySelector(".dash-prov-refresh")?.addEventListener("click", () => loadDashProverb(true));
  card.querySelectorAll(".dash-prov-commit").forEach((btn) => {
    btn.addEventListener("click", () => _showProvCommitForm(card, data, btn.dataset.status));
  });
}

// Replace the inner CTA with a small note form. Cancel returns to the default
// card; Save logs the entry with the chosen status (done | todo) and shows
// the saved state with an Undo affordance.
function _showProvCommitForm(card, data, status) {
  const inner = card.querySelector(".dash-prov-inner");
  if (!inner) return;
  const cta = inner.querySelector(".dash-prov-cta");
  if (!cta) return;

  const isDone = status === "done";
  const labelHtml = isDone
    ? `What did you do? <span class="dash-prov-done-optional">(optional — just for your journal)</span>`
    : `Want to add a note? <span class="dash-prov-done-optional">(optional — you can add follow-ups later)</span>`;
  const placeholder = isDone
    ? "e.g. called my mom, listened more than I talked, sent that thank-you message..."
    : "e.g. plan to call this weekend, want to think about who first...";
  const saveIcon = isDone ? "bookmark_add" : "schedule";
  const saveLabel = isDone ? "Save to journal" : "Save to To Do";

  cta.outerHTML = `
    <div class="dash-prov-done-form" data-status="${status}">
      <label class="dash-prov-done-label">${labelHtml}</label>
      <textarea class="dash-prov-done-input" rows="2" placeholder="${placeholder}"></textarea>
      <div class="dash-prov-done-form-actions">
        <button type="button" class="dash-prov-done-cancel">Cancel</button>
        <button type="button" class="dash-prov-done-save">
          <span class="material-symbols-outlined">${saveIcon}</span>
          ${saveLabel}
        </button>
      </div>
    </div>
  `;
  const ta = inner.querySelector(".dash-prov-done-input");
  ta?.focus();
  // Mirror the auto-grow pattern the reflect-modal textareas use
  // (08-story.js:1127). The global autoExpand() resets via
  // `style.height = "inherit"` which inflates inside flex-column parents;
  // "auto" is what works.
  if (ta) {
    ta.style.overflowY = "hidden";
    const grow = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    grow();
    ta.addEventListener("input", grow);
    requestAnimationFrame(grow);
  }
  inner.querySelector(".dash-prov-done-cancel")?.addEventListener("click", () => _renderDashProverb(card, data));
  inner.querySelector(".dash-prov-done-save")?.addEventListener("click", () => {
    const txt = (ta?.value || "").trim();
    const now = Date.now();
    const id = `obed-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = {
      id,
      ts: now,
      status,
      doneTs: status === "done" ? now : null,
      topic: data.topic,
      ref: data.ref,
      verseText: data.text,
      applyText: data.apply,
      thread: txt ? [{ id: `${id}-n0`, ts: now, text: txt }] : [],
    };
    _addObedienceEntry(entry);
    _showProvSavedState(card, data, entry.id, status);
    _refreshObedienceJournalLink();
  });
  // Save on Cmd/Ctrl+Enter for fast journaling.
  ta?.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      inner.querySelector(".dash-prov-done-save")?.click();
    }
  });
}

function _showProvSavedState(card, data, entryId, status) {
  const inner = card.querySelector(".dash-prov-inner");
  if (!inner) return;
  const isDone = status === "done";
  const icon = isDone ? "check_circle" : "schedule";
  const title = isDone ? "Logged. Done." : "Saved to To Do.";
  const sub = isDone
    ? "It's in your obedience journal."
    : "Follow up anytime — add notes or mark done from the journal.";
  inner.innerHTML = `
    <div class="dash-prov-saved" data-status="${status}">
      <span class="material-symbols-outlined dash-prov-saved-icon">${icon}</span>
      <div class="dash-prov-saved-text">
        <div class="dash-prov-saved-title">${_escHtml(title)}</div>
        <div class="dash-prov-saved-sub">${_escHtml(sub)}</div>
      </div>
      <button type="button" class="dash-prov-saved-undo">Undo</button>
    </div>
  `;
  inner.querySelector(".dash-prov-saved-undo")?.addEventListener("click", () => {
    _deleteObedienceEntry(entryId);
    _refreshObedienceJournalLink();
    _renderDashProverb(card, data);
  });
}

// =============================================================================
// OBEDIENCE JOURNAL — running log of what Charlie's actually done in response
// to the daily Proverbs nuggets. Stored locally + synced via Firebase so both
// devices see the same journal. Viewable in a modal opened from the small link
// below the proverb card.
// =============================================================================

const _OBED_JOURNAL_KEY = "obedienceJournal";
const _OBED_JOURNAL_MAX = 200; // hard cap; FIFO-trim oldest if exceeded.

function _getObedienceJournal() {
  try {
    const raw = localStorage.getItem(_OBED_JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(_normalizeObedEntry) : [];
  } catch { return []; }
}

// Migrate legacy entries (single `didText` string, no status) into the new
// shape (status + thread). Done in-memory on read; persisted shape gets
// upgraded on the next save.
function _normalizeObedEntry(e) {
  if (!e || typeof e !== "object") return e;
  if (!e.status) {
    e.status = "done";
    e.doneTs = e.doneTs || e.ts || Date.now();
  }
  if (!Array.isArray(e.thread)) {
    e.thread = e.didText
      ? [{ id: `${e.id}-n0`, ts: e.ts || Date.now(), text: String(e.didText) }]
      : [];
  }
  delete e.didText;
  return e;
}

function _saveObedienceJournal(arr) {
  try { localStorage.setItem(_OBED_JOURNAL_KEY, JSON.stringify(arr)); } catch {}
}

function _addObedienceEntry(entry) {
  const arr = _getObedienceJournal();
  arr.unshift(_normalizeObedEntry(entry)); // newest first
  while (arr.length > _OBED_JOURNAL_MAX) arr.pop();
  _saveObedienceJournal(arr);
  return arr;
}

function _deleteObedienceEntry(id) {
  const arr = _getObedienceJournal().filter((e) => e.id !== id);
  _saveObedienceJournal(arr);
  return arr;
}

function _setObedienceStatus(id, status) {
  const arr = _getObedienceJournal();
  const idx = arr.findIndex((e) => e.id === id);
  if (idx < 0) return;
  arr[idx].status = status;
  arr[idx].doneTs = status === "done" ? Date.now() : null;
  _saveObedienceJournal(arr);
}

function _appendObedienceNote(id, text) {
  const arr = _getObedienceJournal();
  const idx = arr.findIndex((e) => e.id === id);
  if (idx < 0) return;
  if (!Array.isArray(arr[idx].thread)) arr[idx].thread = [];
  arr[idx].thread.push({
    id: `${id}-n${arr[idx].thread.length}-${Date.now()}`,
    ts: Date.now(),
    text: String(text),
  });
  _saveObedienceJournal(arr);
}

function _refreshObedienceJournalLink() {
  const link = document.getElementById("dashObedLink");
  const countEl = document.getElementById("dashObedCount");
  if (!link || !countEl) return;
  const n = _getObedienceJournal().length;
  countEl.textContent = n > 0 ? `${n}` : "";
  link.classList.toggle("dash-obed-link-empty", n === 0);
}

function openObedienceJournal() {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  if (!overlay || !content) return;

  const entries = _getObedienceJournal();
  const todos = entries.filter((e) => e.status !== "done");
  const dones = entries.filter((e) => e.status === "done");

  const body = entries.length === 0
    ? `<div class="obed-empty">
         <span class="material-symbols-outlined">menu_book</span>
         <p>No entries yet.</p>
         <p class="obed-empty-sub">Tap "I did this" or "I'll do this" on a Proverb to start logging — a running record of how you've been answering God in the small things.</p>
       </div>`
    : `
      <section class="obed-section obed-section--todo">
        <h3 class="obed-section-title">
          <span class="material-symbols-outlined">schedule</span>
          To Do
          <span class="obed-section-count">${todos.length}</span>
        </h3>
        ${todos.length
          ? `<ul class="obed-list">${todos.map(_renderObedienceEntry).join("")}</ul>`
          : `<p class="obed-section-empty">Nothing pending.</p>`
        }
      </section>
      <section class="obed-section obed-section--done">
        <h3 class="obed-section-title">
          <span class="material-symbols-outlined">check_circle</span>
          Done
          <span class="obed-section-count">${dones.length}</span>
        </h3>
        ${dones.length
          ? `<ul class="obed-list">${dones.map(_renderObedienceEntry).join("")}</ul>`
          : `<p class="obed-section-empty">Nothing here yet.</p>`
        }
      </section>
    `;

  content.innerHTML = `
    <div class="obed-modal">
      <header class="obed-modal-header">
        <span class="obed-eyebrow">Obedience Journal</span>
        <h2 class="obed-title">What you're answering God with</h2>
        <p class="obed-sub">Each Proverb you commit to lands here. Add follow-up notes, mark Done, or move things back to To Do — it's a thread, not a one-shot.</p>
      </header>
      ${body}
    </div>
  `;
  overlay.hidden = false;

  // Delegated click handler for per-entry actions.
  content.addEventListener("click", _handleObedAction);
}

function _handleObedAction(e) {
  const btn = e.target.closest("[data-obed-action]");
  if (!btn) return;
  const action = btn.dataset.obedAction;
  const id = btn.dataset.id;
  if (!action || !id) return;

  if (action === "delete") {
    _deleteObedienceEntry(id);
  } else if (action === "mark-done") {
    _setObedienceStatus(id, "done");
  } else if (action === "mark-todo") {
    _setObedienceStatus(id, "todo");
  } else if (action === "add-note") {
    _showObedAddNoteForm(id);
    return; // no full re-render — inline form
  } else {
    return;
  }
  _refreshObedienceJournalLink();
  openObedienceJournal();
}

// Inline note form per entry. Replaces the entry's actions row with a small
// textarea + Save / Cancel; saving appends to the thread and re-renders the
// modal so the new note shows in chronological order.
function _showObedAddNoteForm(entryId) {
  const li = document.querySelector(`.obed-item[data-id="${entryId}"]`);
  if (!li || li.querySelector(".obed-note-form")) return;
  const actions = li.querySelector(".obed-item-actions");
  if (!actions) return;

  const form = document.createElement("div");
  form.className = "obed-note-form";
  form.innerHTML = `
    <textarea class="obed-note-input" placeholder="Update — what did you do, try, or feel about it?" rows="2"></textarea>
    <div class="obed-note-form-actions">
      <button type="button" class="obed-note-cancel">Cancel</button>
      <button type="button" class="obed-note-save">
        <span class="material-symbols-outlined">add</span>
        Add note
      </button>
    </div>
  `;
  actions.parentNode.insertBefore(form, actions);
  actions.style.display = "none";

  const ta = form.querySelector(".obed-note-input");
  ta.style.overflowY = "hidden";
  const growNote = () => {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  };
  growNote();
  ta.addEventListener("input", growNote);
  requestAnimationFrame(growNote);
  ta.focus();

  const close = () => {
    form.remove();
    actions.style.display = "";
  };
  const save = () => {
    const txt = (ta.value || "").trim();
    if (!txt) { close(); return; }
    _appendObedienceNote(entryId, txt);
    _refreshObedienceJournalLink();
    openObedienceJournal();
  };

  form.querySelector(".obed-note-cancel").addEventListener("click", close);
  form.querySelector(".obed-note-save").addEventListener("click", save);
  ta.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
  });
}

function closeObedienceJournal() {
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.hidden = true;
}

// Strip pilcrow paragraph markers from cached verse text. Old journal entries
// were saved before _resolveProverbForRender stripped them, so this cleans
// them up at render time too.
function _stripPilcrow(s) {
  return String(s || "")
    .replace(/^[¶\s]+/, "")
    .replace(/\s¶\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _formatObedDate(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function _renderObedienceEntry(e) {
  const isDone = e.status === "done";
  const created = _formatObedDate(e.ts);
  const completed = isDone && e.doneTs ? _formatObedDate(e.doneTs) : null;

  const threadHtml = (e.thread || []).map((t) => `
    <div class="obed-thread-note">
      <span class="obed-thread-date">${_formatObedDate(t.ts)}</span>
      <span class="obed-thread-text">${_escHtml(t.text)}</span>
    </div>
  `).join("");

  return `
    <li class="obed-item" data-id="${_escHtml(e.id)}" data-status="${e.status}">
      <div class="obed-item-row">
        <span class="obed-item-topic">${_escHtml(e.ref || e.topic || "")}</span>
        <span class="obed-item-date">${created}${completed && completed !== created ? ` → ${completed}` : ""}</span>
        <button type="button" class="obed-delete-btn" data-obed-action="delete" data-id="${_escHtml(e.id)}" aria-label="Delete entry" title="Delete entry">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <blockquote class="obed-item-verse">${_escHtml(_stripPilcrow(e.verseText || ""))}</blockquote>
      <div class="obed-item-apply"><span class="obed-label">Call:</span> ${_escHtml(e.applyText || "")}</div>
      ${threadHtml ? `<div class="obed-thread">${threadHtml}</div>` : ""}
      <div class="obed-item-actions">
        <button type="button" class="obed-action-btn obed-action-add" data-obed-action="add-note" data-id="${_escHtml(e.id)}">
          <span class="material-symbols-outlined">add</span>
          Add note
        </button>
        ${isDone
          ? `<button type="button" class="obed-action-btn obed-action-revert" data-obed-action="mark-todo" data-id="${_escHtml(e.id)}">
              <span class="material-symbols-outlined">undo</span>
              Move to To Do
            </button>`
          : `<button type="button" class="obed-action-btn obed-action-done" data-obed-action="mark-done" data-id="${_escHtml(e.id)}">
              <span class="material-symbols-outlined">check</span>
              Mark done
            </button>`
        }
      </div>
    </li>
  `;
}

// =============================================================================
// GRATITUDE JOURNAL — free-form list of random things Charlie's thankful for.
// Different from the obedience journal: no Proverb tie-in, just open-ended
// thanks. Modal has an always-on input at the top + the running list below.
// =============================================================================

const _GRAT_JOURNAL_KEY = "gratitudeJournal";
const _GRAT_JOURNAL_MAX = 500;

function _getGratitudeEntries() {
  try {
    const raw = localStorage.getItem(_GRAT_JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _saveGratitudeEntries(arr) {
  try { localStorage.setItem(_GRAT_JOURNAL_KEY, JSON.stringify(arr)); } catch {}
}

function _addGratitudeEntry(entry) {
  const arr = _getGratitudeEntries();
  arr.unshift(entry); // newest first
  while (arr.length > _GRAT_JOURNAL_MAX) arr.pop();
  _saveGratitudeEntries(arr);
  return arr;
}

function _deleteGratitudeEntry(id) {
  const arr = _getGratitudeEntries().filter((e) => e.id !== id);
  _saveGratitudeEntries(arr);
  return arr;
}

function _refreshGratitudeJournalLink() {
  const link = document.getElementById("dashGratLink");
  const countEl = document.getElementById("dashGratCount");
  if (!link || !countEl) return;
  const n = _getGratitudeEntries().length;
  countEl.textContent = n > 0 ? `${n}` : "";
  link.classList.toggle("dash-journal-link-empty", n === 0);
}

function openGratitudeJournal() {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  if (!overlay || !content) return;

  const entries = _getGratitudeEntries();
  const listBody = entries.length === 0
    ? `<div class="grat-empty">
         <span class="material-symbols-outlined">favorite</span>
         <p>Nothing here yet.</p>
         <p class="grat-empty-sub">Type the smallest thing — coffee, a friend, that you woke up. Anything you're grateful for.</p>
       </div>`
    : `<ul class="grat-list">${entries.map(_renderGratitudeEntry).join("")}</ul>`;

  content.innerHTML = `
    <div class="grat-modal">
      <header class="grat-modal-header">
        <span class="grat-eyebrow">Gratitude Journal</span>
        <h2 class="grat-title">Things you're thankful for</h2>
        <p class="grat-sub">Random thanks, big or small. Add as many as you want.</p>
      </header>
      <div class="grat-add">
        <textarea class="grat-add-input" placeholder="I'm thankful for..." rows="2"></textarea>
        <div class="grat-add-row">
          <span class="grat-add-hint">⌘/Ctrl+Enter to save</span>
          <button type="button" class="grat-add-save">
            <span class="material-symbols-outlined">add</span>
            Add to journal
          </button>
        </div>
      </div>
      ${listBody}
    </div>
  `;
  overlay.hidden = false;

  // Wire add input — same auto-grow pattern the reflect-modal textareas use.
  // Direct "auto" → scrollHeight (NOT the global autoExpand which uses
  // "inherit" and breaks inside flex-column parents).
  const ta = content.querySelector(".grat-add-input");
  if (ta) {
    ta.style.overflowY = "hidden";
    const growGrat = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    growGrat();
    ta.addEventListener("input", growGrat);
    requestAnimationFrame(growGrat);
    ta.focus();

    const trySave = () => {
      const txt = (ta.value || "").trim();
      if (!txt) return;
      _addGratitudeEntry({
        id: `grat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        text: txt,
      });
      _refreshGratitudeJournalLink();
      openGratitudeJournal(); // re-render the modal with the new entry
    };
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") trySave();
    });
    content.querySelector(".grat-add-save")?.addEventListener("click", trySave);
  }

  content.querySelectorAll(".grat-delete-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (!id) return;
      _deleteGratitudeEntry(id);
      _refreshGratitudeJournalLink();
      openGratitudeJournal();
    };
  });
}

function _renderGratitudeEntry(e) {
  const date = new Date(e.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `
    <li class="grat-item">
      <div class="grat-item-row">
        <span class="grat-item-date">${date} · ${time}</span>
        <button type="button" class="grat-delete-btn" data-id="${_escHtml(e.id)}" aria-label="Delete entry" title="Delete entry">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="grat-item-text">${_escHtml(e.text)}</div>
    </li>
  `;
}

// =============================================================================
// PRAYERS JOURNAL — free-form list of prayer requests. Mirrors the gratitude
// journal pattern (open-ended add input on top, list below). Replaces the old
// SOAP "Prayer" feature which lived inside Dig Deeper.
// =============================================================================

const _PRAY_JOURNAL_KEY = "prayersJournal";
const _PRAY_JOURNAL_MAX = 500;

function _getPrayersEntries() {
  try {
    const raw = localStorage.getItem(_PRAY_JOURNAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _savePrayersEntries(arr) {
  try { localStorage.setItem(_PRAY_JOURNAL_KEY, JSON.stringify(arr)); } catch {}
}

function _addPrayerEntry(entry) {
  const arr = _getPrayersEntries();
  arr.unshift(entry);
  while (arr.length > _PRAY_JOURNAL_MAX) arr.pop();
  _savePrayersEntries(arr);
  return arr;
}

function _deletePrayerEntry(id) {
  const arr = _getPrayersEntries().filter((e) => e.id !== id);
  _savePrayersEntries(arr);
  return arr;
}

function _refreshPrayersJournalLink() {
  const link = document.getElementById("dashPrayLink");
  const countEl = document.getElementById("dashPrayCount");
  if (!link || !countEl) return;
  const n = _getPrayersEntries().length;
  countEl.textContent = n > 0 ? `${n}` : "";
  link.classList.toggle("dash-journal-link-empty", n === 0);
}

function openPrayersJournal() {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  if (!overlay || !content) return;

  const entries = _getPrayersEntries();
  const listBody = entries.length === 0
    ? `<div class="grat-empty">
         <span class="material-symbols-outlined">volunteer_activism</span>
         <p>Nothing here yet.</p>
         <p class="grat-empty-sub">Write a prayer — for yourself, family, ministry, or anything on your heart.</p>
       </div>`
    : `<ul class="grat-list">${entries.map(_renderPrayerEntry).join("")}</ul>`;

  content.innerHTML = `
    <div class="grat-modal pray-modal">
      <header class="grat-modal-header">
        <span class="grat-eyebrow">Prayers</span>
        <h2 class="grat-title">Prayer requests</h2>
        <p class="grat-sub">Lift them up. Keep them in front of you. Add as many as you want.</p>
      </header>
      <div class="grat-add">
        <textarea class="grat-add-input" placeholder="Lord, I pray..." rows="2"></textarea>
        <div class="grat-add-row">
          <span class="grat-add-hint">⌘/Ctrl+Enter to save</span>
          <button type="button" class="grat-add-save">
            <span class="material-symbols-outlined">add</span>
            Add prayer
          </button>
        </div>
      </div>
      ${listBody}
    </div>
  `;
  overlay.hidden = false;

  const ta = content.querySelector(".grat-add-input");
  if (ta) {
    ta.style.overflowY = "hidden";
    const growPray = () => {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    };
    growPray();
    ta.addEventListener("input", growPray);
    requestAnimationFrame(growPray);
    ta.focus();

    const trySave = () => {
      const txt = (ta.value || "").trim();
      if (!txt) return;
      _addPrayerEntry({
        id: `pray-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        text: txt,
      });
      _refreshPrayersJournalLink();
      openPrayersJournal();
    };
    ta.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") trySave();
    });
    content.querySelector(".grat-add-save")?.addEventListener("click", trySave);
  }

  content.querySelectorAll(".grat-delete-btn").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (!id) return;
      _deletePrayerEntry(id);
      _refreshPrayersJournalLink();
      openPrayersJournal();
    };
  });
}

function _renderPrayerEntry(e) {
  const date = new Date(e.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `
    <li class="grat-item">
      <div class="grat-item-row">
        <span class="grat-item-date">${date} · ${time}</span>
        <button type="button" class="grat-delete-btn" data-id="${_escHtml(e.id)}" aria-label="Delete prayer" title="Delete prayer">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="grat-item-text">${_escHtml(e.text)}</div>
    </li>
  `;
}

// Real-time journal sync — fired by firebase-sync.js when remote obedience,
// gratitude, or prayers journal data lands. Refreshes the dashboard pill counts
// and, if the matching modal is open, re-renders its contents in place so
// Charlie ↔ Karla edits flow live without a page reload.
window.addEventListener("devo:journal-sync", (e) => {
  const keys = (e?.detail?.keys) || [];
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  const modalOpen = overlay && !overlay.hidden && content;

  if (keys.includes("obedienceJournal")) {
    _refreshObedienceJournalLink();
    if (modalOpen && content.querySelector(".obed-modal")) {
      // Preserve any in-progress inline note form before re-render.
      const draft = content.querySelector(".obed-note-form .obed-note-input")?.value || "";
      const draftEntryId = content.querySelector(".obed-note-form")?.closest(".obed-item")?.dataset.id;
      openObedienceJournal();
      if (draft && draftEntryId) {
        // Re-open the inline note form on the same entry and restore the draft.
        _showObedAddNoteForm(draftEntryId);
        const ta = document.querySelector(`.obed-item[data-id="${draftEntryId}"] .obed-note-input`);
        if (ta) ta.value = draft;
      }
    }
  }

  if (keys.includes("gratitudeJournal")) {
    _refreshGratitudeJournalLink();
    if (modalOpen && content.querySelector(".grat-modal:not(.pray-modal)")) {
      const draft = content.querySelector(".grat-add-input")?.value || "";
      openGratitudeJournal();
      const ta = document.querySelector(".grat-add-input");
      if (ta && draft) ta.value = draft;
    }
  }

  if (keys.includes("prayersJournal")) {
    _refreshPrayersJournalLink();
    if (modalOpen && content.querySelector(".pray-modal")) {
      const draft = content.querySelector(".grat-add-input")?.value || "";
      openPrayersJournal();
      const ta = document.querySelector(".pray-modal .grat-add-input");
      if (ta && draft) ta.value = draft;
    }
  }
});


