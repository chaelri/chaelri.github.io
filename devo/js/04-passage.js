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
  const passage = `${book} ${chapter}${verse ? ':' + verse : ''}`;

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
        <div class="soap-respond-row" hidden>
          <button class="soap-respond-btn" data-passage="${_escHtml(passage)}">
            <span class="material-icons">edit_note</span> Respond
          </button>
        </div>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };

    const streamEl = mountEl.querySelector('#dig-deeper-stream');

    const aiText = await callGeminiStream(
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

    // Reveal the Respond button once streaming finishes
    const respondRow = mountEl.querySelector('.soap-respond-row');
    if (respondRow) respondRow.hidden = false;
    const respondBtn = mountEl.querySelector('.soap-respond-btn');
    if (respondBtn) {
      respondBtn.onclick = () => openSoapScreen(passage, aiText);
    }
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

  const dashboardHTML = `
  <div class="dashboard ai-fade-in">

  <div class="dash-greeting">
    <div class="dash-greeting-top">
      <div class="dash-greeting-text">${(() => { const h = new Date().getHours(); const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; const name = getUserName(); return name ? `${g}, ${name}!` : g; })()}</div>
      <button class="dash-name-edit-btn" onclick="_showNamePrompt(() => renderDashboard())" title="Edit name"><span class="material-icons">edit</span></button>
    </div>
    <div id="dashGreetingMsg" class="dash-greeting-msg"></div>
  </div>

  ${/* Daily featured story removed — was driving image-gen costs. */ ""}

  <div class="dashboard-grid">

      <!-- CONTINUE READING + FAVORITES -->
      <section class="dashboard-section">

        <div id="continue-reading" class="hidden">
          <h3><span class="material-icons dashboard-icon">book</span> Continue Reading?</h3>
          <div onclick="loadPassageById('${recentPassageId}')" style="margin-bottom: 1rem; cursor: pointer">
            <div class="dashboard-ref flex">
            ${recentPassage} <span class="material-icons right">chevron_right</span>
            </div>
          </div>
        </div>

        <div id="dashFavoritesContent">${_renderFavoritesContent(allFavoritePassages)}</div>
      </section>

      <!-- NOTES -->
      <section class="dashboard-section">
        <h3 style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span><span class="material-icons dashboard-icon">edit_note</span> Notes</span>
          <button class="dash-notes-open-btn" onclick="openNotesApp()">View all →</button>
        </h3>
        ${(() => {
          const allNotes = _getAllNotes()
            .filter(n => n.preview)
            .sort((a, b) => (b.time || 0) - (a.time || 0))
            .slice(0, 5);
          if (!allNotes.length) return `<p class="empty-state">No notes yet. Add notes to Bible verses, complete a Guided Reflection, or tap "View all" to write your first note.</p>`;
          return `<div class="dash-notes-list">${allNotes.map(n => {
            // Pass a generous upper bound; the actual visual ellipsis is done
            // by CSS line-clamp on .dash-notes-card-preview, which adapts to
            // the card's real width — narrow on mobile, much wider on desktop.
            const preview = n.preview.length > 400 ? n.preview.slice(0, 400) + "…" : n.preview;
            const dateStr = n.time ? new Date(n.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const label = n.type === "reflection" ? `<span class="dash-notes-type-label">Reflection</span>` : "";
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

      <!-- Single divider below the Continue+Favorites / Notes row -->
      <hr class="dashboard-row-divider" />

      <!-- SOAP: APPLICATIONS & PRAYERS (combined) -->
      ${_renderSoapDashCombined()}

      ${/* Daily Reminder section removed — it relied on Cloud Scheduler + Gemini personalization. */ ""}
      </div>
      </div>
      `;

  output.innerHTML = dashboardHTML;

  if (recentPassageId) {
    document.getElementById("continue-reading")?.classList.remove("hidden");
  }

  loadDashGreetingMsg();

  // Bind SOAP A&P dashboard interactions
  _bindSoapDashboard();
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
      <span><span class="material-icons dashboard-icon">favorite</span> Favorites</span>
      ${showNav ? `<div class="dash-fav-nav">
        ${favoritesPage > 0 ? `<button class="dash-fav-nav-btn" onclick="changeFavoritesPage(-1)" aria-label="Previous favorites"><span class="material-icons">chevron_left</span></button>` : ""}
        ${favoritesPage < lastPage ? `<button class="dash-fav-nav-btn" onclick="changeFavoritesPage(1)" aria-label="Next favorites"><span class="material-icons">chevron_right</span></button>` : ""}
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
        .replace(/([.,!?’])(?=[a-zA-Z0-9])/g, "$1 ")
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

// AI fetch for reflection <li> items. Returns an array of detached <li>
// elements (so caller can swap them into an existing <ol>). Used by both
// renderAIReflectionQuestions (count=3) and _smartRetryReflections (count<3).
async function _fetchReflectionLis({ book, chapter, versesText, count = 3, excludeQuestions = [] }) {
  const exclusionBlock = excludeQuestions.length
    ? `\nALREADY-ASKED QUESTIONS (DO NOT duplicate, paraphrase, or rehash these — they have been answered already):\n${excludeQuestions.map((q) => `- ${q}`).join("\n")}\n`
    : "";

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
${exclusionBlock}

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
    const lis = await _fetchReflectionLis({ book, chapter, versesText, count: 3 });
    if (!lis || lis.length === 0) {
      mount.innerHTML = "<p>Failed to generate reflection questions.</p>";
      return true;
    }
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

