// ═══════════════════════════════════════════════════════════════════════════
// STORY MODAL — Interactive story breakdown (mirrors mobile app)
// ═══════════════════════════════════════════════════════════════════════════
let _storySlides = [];
let _storyIndex = 0;

function markStorySeen() {
  const key = `${bookEl.value}_${chapterEl.value}`;
  const seen = JSON.parse(localStorage.getItem("storySeenHistory") || "{}");
  seen[key] = Date.now();
  localStorage.setItem("storySeenHistory", JSON.stringify(seen));
  document.getElementById("storyBtn")?.classList.add("story-seen");
}
function updateStorySeenState() {
  const key = `${bookEl.value}_${chapterEl.value}`;
  const seen = JSON.parse(localStorage.getItem("storySeenHistory") || "{}");
  const btn = document.getElementById("storyBtn");
  if (btn) btn.classList.toggle("story-seen", !!seen[key]);
}

async function openStoryModal() {
  markStorySeen();
  const modal = document.getElementById("storyModal");
  const content = document.getElementById("storyContent");
  modal.hidden = false;
  _storySlides = [];
  _storyIndex = 0;

  // Hide nav bar and progress bar while loading
  const navBar = modal.querySelector(".story-nav-bar");
  if (navBar) navBar.hidden = true;
  const progressBar = document.getElementById("storyProgressBar");
  if (progressBar) progressBar.hidden = true;

  // Show loading
  content.innerHTML = `
    <div class="story-loading">
      <div class="story-sparkle-row"><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span></div>
      <div class="story-loading-text">Generating stories...</div>
    </div>`;
  updateStoryProgress(0, 1);
  document.getElementById("storyCounter").textContent = "";

  if (!window.__aiPayload) { closeStoryModal(); return; }
  const { book, chapter, versesText } = window.__aiPayload;

  try {
    const storyKey = `story_${book}_${chapter}`;
    let glance, segments, closing;

    const cached = await _getStoryCache(storyKey);
    if (cached) {
      glance = cached.glance;
      segments = cached.segments;
      closing = cached.closing;
    } else {
      [glance, segments, closing] = await Promise.all([
        fetchStoryGlance(book, chapter, versesText),
        fetchStoryTimeline(book, chapter, versesText),
        fetchStoryClosing(book, chapter, versesText),
      ]);
      _saveStoryCache(storyKey, { glance, segments, closing });
    }

    // Build slides array
    _storySlides.push({ type: "glance", data: glance, book, chapter });
    _storySlides.push({ type: "map", data: segments, book, chapter });
    segments.forEach(seg => _storySlides.push({ type: "segment", data: seg, book, chapter }));
    if (closing) {
      _storySlides.push({ type: "recap", data: closing, book, chapter });
      _storySlides.push({ type: "reflect", data: closing, book, chapter });
    }

    if (navBar) navBar.hidden = false;
    if (progressBar) progressBar.hidden = false;
    renderStorySlide();
  } catch (e) {
    content.innerHTML = `
      <div class="story-loading">
        <span class="material-symbols-outlined" style="font-size:36px;color:#6b7a94">error_outline</span>
        <div class="story-loading-text">${e.message || "Failed to load"}</div>
        <button class="primary" onclick="openStoryModal()" style="margin-top:8px">Retry</button>
      </div>`;
  }
}

function _storyToReflect() {
  // Open reflect modal on top of story modal — no closing, no flash
  openReflectModal();
  // Then silently hide story behind it
  const storyModal = document.getElementById("storyModal");
  storyModal.hidden = true;
  storyModal.querySelector(".story-content").innerHTML = "";
}

function closeStoryModal() {
  const modal = document.getElementById("storyModal");
  const content = document.getElementById("storyContent");
  content.innerHTML = `
    <div class="story-loading">
      <div class="story-sparkle-row"><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span></div>
      <div class="story-loading-text">Happy reading</div>
    </div>`;
  setTimeout(() => {
    modal.classList.add("fade-out");
    setTimeout(() => { modal.hidden = true; modal.classList.remove("fade-out"); _restoreDailyStory(); }, 250);
  }, 350);
}

function _restoreDailyStory() {
  const r = window._dailyStoryRestore;
  if (!r) return;
  // Only restore if reflect modal is also closed
  const reflectModal = document.getElementById("reflectModal");
  if (reflectModal && !reflectModal.hidden) return; // reflect still open, defer
  bookEl.value = r.prevBook;
  loadChapters();
  chapterEl.value = r.prevCh;
  window.__aiPayload = r.prevPayload;
  window._dailyStoryRestore = null;
}

function updateStoryProgress(current, total) {
  const bar = document.getElementById("storyProgressBar");
  bar.innerHTML = Array.from({ length: total }, (_, i) =>
    `<div class="story-progress-seg"><div class="story-progress-fill" style="width:${i <= current ? '100%' : '0%'}; opacity:${i <= current ? 1 : 0.3}"></div></div>`
  ).join("");
}

// For chapter map: animate progress segments one by one in sync with nodes
function animateMapProgress(total, segCount) {
  const bar = document.getElementById("storyProgressBar");
  const segs = bar.querySelectorAll(".story-progress-fill");
  // Slide 0 (at-a-glance) and 1 (map) are already filled.
  // We just need the current slide (index 1) to be filled. That's already handled.
  // No extra animation needed since progress is per-slide not per-node.
}

function renderStorySlide() {
  const content = document.getElementById("storyContent");
  const counter = document.getElementById("storyCounter");
  const total = _storySlides.length;
  const slide = _storySlides[_storyIndex];
  if (!slide) return;

  updateStoryProgress(_storyIndex, total);
  counter.textContent = `${_storyIndex + 1} / ${total}`;

  // Fade transition
  content.classList.add("fade-out");
  setTimeout(() => {
    content.scrollTop = 0;
    content.innerHTML = buildSlideHTML(slide);
    content.classList.remove("fade-out");
    content.classList.add("fade-in");
    // Update nav button states
    updateStoryNavButtons();
    // Wire segment footer buttons
    wireSegmentFooter(content);
    // Prefetch next slide's image (one ahead only)
    _prefetchNextStoryImage();
  }, 200);
}

function _prefetchNextStoryImage() {
  const next = _storySlides[_storyIndex + 1];
  if (!next || next.type !== "segment") return;
  const seg = next.data;
  const bookName = BIBLE_META[next.book]?.name || next.book;
  const ctx = seg.title || seg.content?.quote || "";
  callImageGen(buildScenePrompt(bookName, next.chapter, seg.verses, ctx), "16:9").catch(() => {});
}

function storyNext() {
  if (_storyIndex >= _storySlides.length - 1) { closeStoryModal(); return; }
  _storyIndex++;
  renderStorySlide();
}
function storyPrev() {
  if (_storyIndex <= 0) return;
  _storyIndex--;
  renderStorySlide();
}
function updateStoryNavButtons() {
  const prevBtn = document.getElementById("storyPrevBtn");
  const nextBtn = document.getElementById("storyNextBtn");
  if (!prevBtn || !nextBtn) return;
  prevBtn.disabled = _storyIndex <= 0;
  const isLast = _storyIndex >= _storySlides.length - 1;
  nextBtn.innerHTML = isLast
    ? `<span>Done</span><span class="material-symbols-outlined">check</span>`
    : `<span>Next</span><span class="material-symbols-outlined">arrow_forward</span>`;
}

function wireSegmentFooter(container) {
  const digBtn = container.querySelector(".story-dig-btn");
  const askBtn = container.querySelector(".story-ask-btn");
  const expandEl = container.querySelector("#storySegExpand");
  if (!digBtn || !expandEl) return;

  digBtn.onclick = () => {
    const { verses, book, chapter } = digBtn.dataset;
    fetchStoryDigDeeper(book, chapter, verses, expandEl);
  };
  if (askBtn) {
    askBtn.onclick = () => {
      const { verses, book, chapter } = askBtn.dataset;
      openStoryAskAI(book, chapter, verses, expandEl);
    };
  }
}

function _getVersesText(book, chapter, verses) {
  const allVerses = document.querySelectorAll("#output .verse");
  const rangeMatch = verses.match(/(\d+)\s*[-–]\s*(\d+)/);
  let start, end;
  if (rangeMatch) {
    start = parseInt(rangeMatch[1], 10);
    end = parseInt(rangeMatch[2], 10);
  } else {
    start = end = parseInt(verses, 10) || 1;
  }
  const texts = [];
  for (let v = start; v <= end; v++) {
    const t = _peekGetVerseText(v, allVerses);
    if (t) texts.push(`${v}. ${t}`);
  }
  return texts.join("\n");
}

async function fetchStoryDigDeeper(book, chapter, verses, mountEl) {
  mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}

    <div class="ai-card-gradient">
      <div class="ai-card-header">
        <span class="ai-card-label">Dig Deeper — ${book} ${chapter}:${verses}</span>
        <button class="ai-card-close" title="Close">✕</button>
      </div>
      ${sparkleLoaderHTML('Digging deeper…')}
    </div>
  </div>`;
  mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };

  const passageText = _getVersesText(book, chapter, verses);
  const passage = `${book} ${chapter}:${verses}`;
  try {
    const aiText = await callGemini(`You are a premium Bible study tool. ${AI_TONE}

${book} ${chapter}:${verses}:
"${passageText}"

Give a dense, high-value study of this passage. ~180 words total.

#### Key Themes
- 2-3 key themes or theological concepts in this passage. One sentence each, bold the key term.

#### Deeper Meaning
- 2-3 sharp insights connecting these verses. One sentence each.

#### Cross-References
- 3 verses max. **Reference** — one-line why it connects.

#### Suggested Practical Application
- 2-3 concrete, actionable ways to live this out today. Be specific, not vague. Keep each to one sentence.
- Do NOT instruct or command — frame as gentle suggestions ("Consider...", "Try...", "You might...").
- Let the Holy Spirit do the convicting — just offer the tool.

STRICT: No greetings. No padding. Start with #### Key Themes immediately.`);

    mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}
  
      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Dig Deeper — ${esc(book)} ${chapter}:${esc(verses)}</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <div class="ai-md-content">${mdToHTML(aiText)}</div>
        <div class="soap-respond-row">
          <button class="soap-respond-btn" data-passage="${_escHtml(passage)}">
            <span class="material-icons">edit_note</span> Respond
          </button>
        </div>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };
    const respondBtn = mountEl.querySelector('.soap-respond-btn');
    if (respondBtn) {
      respondBtn.onclick = () => openSoapScreen(passage, aiText);
    }
  } catch {
    mountEl.innerHTML = `<div class="inline-ai-card dig-deeper">
    ${_digDeeperEffectsHTML()}
  
      <div class="ai-card-gradient">
        <div class="ai-card-header">
          <span class="ai-card-label">Dig Deeper</span>
          <button class="ai-card-close" title="Close">✕</button>
        </div>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;">Failed to load. Try again.</p>
      </div>
    </div>`;
    mountEl.querySelector('.ai-card-close').onclick = () => { mountEl.innerHTML = ''; };
  }
}

async function openStoryAskAI(book, chapter, verses, mountEl) {
  const key = `story_${book}_${chapter}_${verses}`;
  // Toggle off if already open
  if (mountEl.querySelector(".verse-chat-wrapper")) {
    mountEl.innerHTML = "";
    return;
  }

  const passageText = _getVersesText(book, chapter, verses);
  if (!verseChatHistories[key]) verseChatHistories[key] = [];
  const hasHistory = verseChatHistories[key].length > 0;

  mountEl.innerHTML = `
    <div class="verse-chat-wrapper">
      <div class="chat-history${hasHistory ? "" : " hidden"}" id="chat-hist-${key}"></div>
      <div id="chat-empty-${key}" class="${hasHistory ? "hidden" : ""}">
        <div class="chat-empty-state">
          <span class="material-icons">chat_bubble_outline</span>
          <span class="chat-empty-text">Ask anything about ${esc(book)} ${chapter}:${esc(verses)}</span>
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
        <textarea placeholder="Ask about these verses..." id="chat-input-${key}"></textarea>
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

  if (hasHistory) {
    renderChatHistory(key, histEl);
    if (window._chatFollowups?.[key]?.length) {
      renderStoryFollowups(key, followupsEl, performSend);
    }
  }

  const updateSendState = () => sendBtn.classList.toggle('active', !!input.value.trim());
  input.addEventListener('input', updateSendState);

  // Fetch suggested questions for verse range
  if (!hasHistory) {
    try {
      const raw = await callGemini(`Generate 4 unique, thought-provoking questions someone might ask about ${book} ${chapter}:${verses}:
"${passageText}"

RULES:
- Questions should be specific to THIS passage, not generic.
- Focus on: real-life application, surprising insights, theological implications, emotional/relational angles.
- Each question must be 1 short sentence, under 10 words.
- Return ONLY the 4 questions, one per line, no numbers, no bullets.`);

      const questions = raw.split('\n').map(q => q.trim()).filter(q => q.length > 5).slice(0, 4);
      if (!window._chatSuggestions) window._chatSuggestions = {};
      window._chatSuggestions[key] = questions;

      suggestEl.innerHTML = [...questions].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip${q === _IMAGE_CHIP_TEXT ? ' chat-img-chip' : ''}">${q}</button>`
      ).join('');
      suggestEl.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => {
          const q = chip.textContent;
          if (!window._chatFollowups) window._chatFollowups = {};
          window._chatFollowups[key] = questions.filter(s => s !== q);
          performSend(q);
        };
      });
    } catch {
      suggestEl.innerHTML = ['What is the main message here?', 'How can I apply this today?'].filter(Boolean).map(q =>
        `<button class="chat-suggestion-chip">${q}</button>`
      ).join('');
      suggestEl.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.onclick = () => performSend(chip.textContent);
      });
    }
  }

  function renderStoryFollowups(k, el, sendFn) {
    const chips = window._chatFollowups?.[k] || [];
    if (!chips.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `<span class="chat-followups-label">Keep exploring</span>` +
      chips.map(q => `<button class="chat-followup-chip">${q}</button>`).join('');
    el.querySelectorAll('.chat-followup-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.textContent;
        window._chatFollowups[k] = (window._chatFollowups[k] || []).filter(s => s !== q);
        sendFn(q);
      };
    });
  }

  async function performSend(questionOverride) {
    const question = questionOverride || input.value.trim();
    if (!question) return;

    verseChatHistories[key].push({ role: "user", text: question });
    input.value = "";
    updateSendState();

    emptyEl.classList.add("hidden");
    histEl.classList.remove("hidden");
    renderChatHistory(key, histEl);

    typingEl.style.display = '';
    followupsEl.style.display = 'none';
    histEl.scrollTop = histEl.scrollHeight;

    try {
      // Image generation request
      if (_isImageRequest(question)) {
        const isDefault = question === _IMAGE_CHIP_TEXT;
        const prompt = isDefault
          ? buildScenePrompt(book, chapter, verses, passageText.slice(0, 80))
          : `Scene from ${book} ${chapter}:${verses}. "${passageText.slice(0, 80)}". User request: ${question}. No text, no words, no letters in the image.`;
        const dataUrl = await callImageGen(prompt, "16:9");
        verseChatHistories[key].push({ role: "model", image: dataUrl, text: "" });
        typingEl.style.display = 'none';
        renderChatHistory(key, histEl);
        renderStoryFollowups(key, followupsEl, performSend);
        return;
      }

      const historyStr = verseChatHistories[key].length > 1
        ? `HISTORY: ${JSON.stringify(verseChatHistories[key].slice(-5).map(m => m.image ? { role: m.role, text: "[generated image]" } : m))}`
        : '';

      const answer = await callGemini(`You are a Bible study assistant. ${AI_TONE}

CONTEXT: ${book} ${chapter}:${verses} - "${passageText}"
${historyStr}

RULES:
- Be very concise (max 3 sentences).
- Answer the question directly.
- Stay youth-friendly and encouraging.
- Start directly with the answer.
- Bold key theological terms using **double asterisks**.

QUESTION: ${question}`);

      verseChatHistories[key].push({ role: "model", text: answer });
      if (verseChatHistories[key].length > 10) verseChatHistories[key].shift();

      typingEl.style.display = 'none';
      renderChatHistory(key, histEl);
      renderStoryFollowups(key, followupsEl, performSend);
    } catch (err) {
      console.error("[Story Chat Error]", err);
      typingEl.style.display = 'none';
      const msg = err?.message?.length > 10 && err.message.length < 200 ? err.message : "Sorry, something went wrong.";
      verseChatHistories[key].push({ role: "model", text: msg });
      renderChatHistory(key, histEl);
    }
  }

  sendBtn.onclick = () => performSend();
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); performSend(); }
  };
}

// ── Slide HTML builders ──────────────────────────────────────────────────
function buildSlideHTML(slide) {
  switch (slide.type) {
    case "glance": return buildGlanceHTML(slide);
    case "map": return buildMapHTML(slide);
    case "segment": return buildSegmentHTML(slide);
    case "recap": return buildRecapHTML(slide);
    case "reflect": return buildReflectHTML(slide);
    default: return "";
  }
}

function buildGlanceHTML({ data, book, chapter }) {
  const chars = (data.characters || []).map(c =>
    `<div class="story-chip"><div class="story-chip-name">${esc(c.name)}</div>${c.role ? `<div class="story-chip-role">${esc(c.role)}</div>` : ""}</div>`
  ).join("");

  return `
    <div class="story-sparkle-cluster top-left">
      <span class="story-bg-sparkle big" style="transform:rotate(-15deg)">✦</span>
      <span class="story-bg-sparkle sm1-tl">✦</span>
      <span class="story-bg-sparkle sm2-tl">✦</span>
    </div>
    <div class="story-sparkle-cluster bottom-right">
      <span class="story-bg-sparkle big" style="transform:rotate(20deg)">✦</span>
      <span class="story-bg-sparkle sm1-br">✦</span>
      <span class="story-bg-sparkle sm2-br">✦</span>
    </div>
    <div class="story-label">AT A GLANCE</div>
    <div class="story-title">${esc(book)} ${chapter}</div>
    <div class="story-oneline">
      <span class="story-oneline-highlight">${esc(data.oneLineSubject)} </span>
      <span class="story-oneline-rest">${esc(data.oneLineRest)}</span>
    </div>
    ${chars ? `<div class="story-characters-label">Characters</div><div class="story-chips">${chars}</div>` : ""}
    ${data.setting ? `<div class="story-meta-row"><span class="material-icons story-meta-icon">place</span><div><div class="story-meta-label">Setting</div><div class="story-meta-value">${esc(data.setting)}</div></div></div>` : ""}
    ${data.timeline ? `<div class="story-meta-row"><span class="material-icons story-meta-icon">schedule</span><div><div class="story-meta-label">Timeline</div><div class="story-meta-value">${esc(data.timeline)}</div></div></div>` : ""}
  `;
}

function buildMapHTML({ data: segments, book, chapter }) {
  // Each node gets: line grows down FIRST, then node fades in
  // Timing: node0 at 0.3s, line1 at 0.5s, node1 at 0.7s, line2 at 0.9s, node2 at 1.1s ...
  const parts = segments.map((seg, i) => {
    const isLast = i === segments.length - 1;
    const nodeDelay = 0.3 + i * 0.4; // node appears
    const lineDelay = nodeDelay - 0.2; // line grows just before node

    const line = i > 0
      ? `<div class="story-map-line" style="opacity:0;animation:mapLineGrow 0.3s ease-out ${lineDelay}s forwards"></div>`
      : "";
    const circle = isLast
      ? `<div class="story-map-circle last"><span class="material-icons" style="font-size:18px">flag</span></div>`
      : `<div class="story-map-circle">${i + 1}</div>`;
    return `${line}<div class="story-map-node" style="animation-delay:${nodeDelay}s">${circle}<div><div class="story-map-title">${esc(seg.title)}</div><div class="story-map-verse story-verse-link" onclick="openVersePeek('${esc(seg.verses)}', this)">Verses ${esc(seg.verses)}</div></div></div>`;
  }).join("");

  return `
    <span class="story-map-bg-icon pin"><span class="material-icons" style="font-size:80px">place</span></span>
    <span class="story-map-bg-icon flag"><span class="material-icons" style="font-size:60px">flag</span></span>
    <span class="story-map-bg-icon compass"><span class="material-icons" style="font-size:70px">explore</span></span>
    <div class="story-label">CHAPTER MAP</div>
    <div class="story-title">${esc(book)} ${chapter}</div>
    <div>${parts}</div>
  `;
}

function buildSegmentHTML({ data: seg, book, chapter }) {
  let html = "";

  // Scene image banner — starts hidden, expands in when image arrives
  const sceneId = `scene_${book}_${chapter}_${(seg.verses || "").replace(/\D/g,"_")}`;
  html += `<div class="story-scene-banner story-scene-hidden" id="${sceneId}"></div>`;

  // Image gen fires in background — no shimmer, just appears when ready
  const bookName = BIBLE_META[book]?.name || book;
  const sceneCtx = seg.title || seg.content?.quote || "";
  const imgPrompt = buildScenePrompt(bookName, chapter, seg.verses, sceneCtx);
  callImageGen(imgPrompt, "16:9").then(dataUrl => {
    const el = document.getElementById(sceneId);
    if (!el) return;
    const kbIdx = (sceneId.charCodeAt(6) + sceneId.charCodeAt(sceneId.length - 1)) % 3;
    const kb = ["kenBurns1","kenBurns2","kenBurns3"][kbIdx];
    el.innerHTML = `<img src="${dataUrl}" alt="Scene illustration" class="story-scene-img" style="--ken-burns:${kb}">`;
    requestAnimationFrame(() => el.classList.remove("story-scene-hidden"));
  }).catch(() => {
    const el = document.getElementById(sceneId);
    if (el) el.remove();
  });

  switch (seg.displayType) {
    case "conversation": html += buildConversationHTML(seg); break;
    case "teaching": html += buildTeachingHTML(seg); break;
    case "contrast": html += buildContrastHTML(seg); break;
    case "narration":
    case "sequence":
    case "list":
    default:
      html += buildScrapbookHTML(seg); break;
  }
  html += buildSegmentFooterHTML(seg, book, chapter);
  return html;
}

function buildSegmentFooterHTML(seg, book, chapter) {
  const verses = seg.verses || "";
  // Calculate delay based on number of animated items in the slide
  const itemCount = (seg.content.points || seg.content.steps || seg.content.messages || []).length || 2;
  const delay = Math.min(itemCount * 0.6 + 0.5, 4);
  return `
    <div class="story-segment-footer" style="--footer-delay:${delay}s">
      <button class="story-seg-btn story-dig-btn" data-verses="${esc(verses)}" data-book="${esc(book)}" data-chapter="${esc(chapter)}">
        <span class="material-icons">auto_awesome</span>
        <span>Dig Deeper</span>
      </button>
      <button class="story-seg-btn story-ask-btn" data-verses="${esc(verses)}" data-book="${esc(book)}" data-chapter="${esc(chapter)}">
        <span class="material-icons">chat</span>
        <span>Ask a Question</span>
      </button>
    </div>
    <div class="story-seg-expand" id="storySegExpand"></div>
  `;
}

function buildScrapbookHTML(seg) {
  const items = seg.content.points || seg.content.steps || seg.content.rows || [];
  const verseStart = parseInt((seg.verses || "1").match(/\d+/)?.[0] || "1", 10);
  const rotations = [-2.0, 1.8, -1.2, 2.2, -1.6, 1.4, -2.4, 1.0];

  // Build cards with connectors between them
  const parts = [];
  items.forEach((item, i) => {
    const text = typeof item === "string" ? item : (item.text || (Array.isArray(item) ? item.join(" · ") : ""));
    const vRef = (typeof item === "object" && item.verseRef) ? String(item.verseRef) : String(verseStart + i);
    const vLabel = vRef.match(/[-–]/) ? `v${vRef}` : `v${vRef}`;
    const rot = rotations[i % rotations.length];
    const isLeft = i % 2 === 0;
    const side = isLeft ? "flex-start" : "flex-end";
    const delay = i * 0.6;

    parts.push(`
      <div class="story-scrap-card" style="align-self:${side}; transform:rotate(${rot}deg); animation-delay:${delay}s; cursor:pointer" onclick="openVersePeek('${vRef}', this)">
        <div class="tape"></div>
        <span class="verse-ref">${vLabel}</span>
        <div class="story-scrap-text">${esc(text)}</div>
      </div>
    `);

    // Add connector between cards (not after last)
    if (i < items.length - 1) {
      // Diagonal from current card center to next card center (opposite side)
      // Left card center ~27.5%, right card center ~72.5% of container width
      const fromPct = isLeft ? 27.5 : 72.5;
      const toPct = isLeft ? 72.5 : 27.5;
      const dx = toPct - fromPct; // percentage
      const connH = 36; // connector height in px
      // Approximate: card width is ~55% of container, so dx in px ≈ dx% of ~340px (typical mobile width)
      // We use a CSS trick: position dots at known percentages and draw a line between them
      const animDelay = delay + 0.35;
      parts.push(`
        <div class="story-connector" style="animation-delay:${animDelay}s">
          <div class="story-connector-dot" style="left:${fromPct}%;top:-3px;animation-delay:${animDelay}s"></div>
          <div class="story-connector-dot" style="left:${toPct}%;bottom:-3px;animation-delay:${animDelay}s"></div>
          <svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" preserveAspectRatio="none">
            <line x1="${fromPct}%" y1="0" x2="${toPct}%" y2="100%" stroke="#db2777" stroke-width="1.5" opacity="0.3"/>
          </svg>
        </div>
      `);
    }
  });

  const footerDelay = (items.length - 1) * 0.6 + 0.8;
  const footer = `<div style="text-align:center;margin-top:28px;z-index:2;position:relative;opacity:0;animation:nodeIn 0.4s ease-out ${footerDelay}s forwards">
    <div style="width:40px;height:2px;border-radius:1px;background:rgba(255,255,255,0.08);margin:0 auto 12px"></div>
    <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#db2777">Verses ${esc(seg.verses)}</div>
    <div style="font-size:13px;font-weight:600;color:#6b7a94;opacity:0.5;margin-top:4px">${esc(seg.title)}</div>
  </div>`;

  return `
    <div style="position:relative; width:100%">
      <div class="story-grid-bg"></div>
      <span class="story-ambient-sparkle s1">✦</span>
      <span class="story-ambient-sparkle s2">✦</span>
      <div class="story-title" style="position:relative;z-index:2">${esc(seg.title)}</div>
      <div class="story-scrap-board" style="display:flex;flex-direction:column">${parts.join("")}</div>
      ${footer}
    </div>
  `;
}

function buildConversationHTML(seg) {
  const msgs = seg.content.messages || [];
  const speakers = [...new Set(msgs.map(m => m.speaker))];
  const sideMap = {};
  let lastSide = "right";
  speakers.forEach(s => { const newSide = lastSide === "left" ? "right" : "left"; sideMap[s] = newSide; lastSide = newSide; });

  const bubbles = msgs.map((msg, i) => {
    const side = sideMap[msg.speaker] || "left";
    const prevSpeaker = i > 0 ? msgs[i - 1].speaker : "";
    const showName = msg.speaker !== prevSpeaker;
    const cls = side === "right" ? "story-bubble-right" : "story-bubble-left";
    const radius = getBubbleRadius(msgs, i, side);
    const vRef = msg.verseRef ? String(msg.verseRef) : "";
    const vRefHTML = vRef ? `<span class="story-bubble-vref" onclick="event.stopPropagation();openVersePeek('${esc(vRef)}', this)">v.${esc(vRef)}</span>` : "";
    return `
      <div class="story-bubble-wrap ${cls}" style="animation:scrapIn 0.5s ease-out ${i * 0.6}s forwards; opacity:0">
        ${showName ? `<div class="story-speaker" ${side === "right" ? 'style="text-align:right"' : ""}>${esc(msg.speaker)}</div>` : ""}
        <div class="story-bubble" style="${radius}">${esc(msg.text)}${vRefHTML}</div>
      </div>
    `;
  }).join("");

  return `
    <div style="width:100%">
      <div class="story-label story-verse-link" onclick="openVersePeek('${esc(seg.verses)}', this)">VERSES ${esc(seg.verses)}</div>
      <div class="story-title">${esc(seg.title)}</div>
      <div class="story-chat-area">${bubbles}</div>
    </div>
  `;
}

function getBubbleRadius(msgs, i, side) {
  const R = 20, T = 4;
  const prevSame = i > 0 && msgs[i - 1].speaker === msgs[i].speaker;
  const nextSame = i < msgs.length - 1 && msgs[i + 1].speaker === msgs[i].speaker;
  let tl = R, tr = R, bl = R, br = R;
  if (side === "right") {
    if (prevSame) tr = T;
    if (nextSame) br = T;
  } else {
    if (prevSame) tl = T;
    if (nextSame) bl = T;
  }
  return `border-radius:${tl}px ${tr}px ${br}px ${bl}px`;
}

function buildTeachingHTML(seg) {
  const { quote, speaker, explanation } = seg.content;
  const verseRef = seg.content.verseRef || seg.verses;
  const explHTML = explanation ? boldify(explanation) : "";
  return `
    <span class="story-watermark open">\u201C</span>
    <span class="story-watermark close">\u201D</span>
    <div class="story-label story-verse-link" onclick="openVersePeek('${esc(seg.verses)}', this)">VERSES ${esc(seg.verses)}</div>
    <div class="story-title">${esc(seg.title)}</div>
    <div class="story-quote-card">
      <span class="material-icons" style="color:#db2777;opacity:0.5;margin-bottom:10px">format_quote</span>
      <div class="story-quote-text">${esc(quote || "")}</div>
      ${speaker ? `<div class="story-quote-attr"><span class="story-quote-speaker">— ${esc(speaker)}</span><span class="story-quote-ref" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px" onclick="openVersePeek('${esc(verseRef)}', this)">v. ${esc(verseRef)}</span></div>` : ""}
    </div>
    ${explHTML ? `<div class="story-explanation">${explHTML}</div>` : ""}
  `;
}

function buildContrastHTML(seg) {
  const { left, right, reflection } = seg.content;
  return `
    <div class="story-glow-circle pink"></div>
    <div class="story-glow-circle blue"></div>
    <div class="story-label story-verse-link" onclick="openVersePeek('${esc(seg.verses)}', this)">VERSES ${esc(seg.verses)}</div>
    <div class="story-title">${esc(seg.title)}</div>
    <div class="story-vs-section">
      <div class="story-vs-label">${esc(left?.label || "Before")}</div>
      <div class="story-vs-text">${boldify(left?.text || "")}</div>
    </div>
    <div class="story-vs-divider"><div class="story-vs-divider-line"></div><span class="story-vs-divider-text">VS</span><div class="story-vs-divider-line"></div></div>
    <div class="story-vs-section">
      <div class="story-vs-label">${esc(right?.label || "After")}</div>
      <div class="story-vs-text blue">${boldify(right?.text || "")}</div>
    </div>
    ${reflection ? `<div class="story-reflection-row"><span class="material-icons" style="color:#db2777;font-size:16px;margin-top:2px">lightbulb</span><div class="story-reflection-text">${boldify(reflection)}</div></div>` : ""}
  `;
}

function buildRecapHTML({ data, book, chapter }) {
  const points = (data.recapPoints || []).map((p, i) =>
    `<div class="story-recap-row"><div class="story-recap-num">${i + 1}</div><div class="story-recap-text">${esc(p)}</div></div>`
  ).join("");
  return `
    <span class="story-recap-bg-icon"><span class="material-icons" style="font-size:320px;color:#db2777">replay</span></span>
    <div class="story-label">QUICK RECAP</div>
    <div class="story-title">${esc(book)} ${chapter}</div>
    <div class="story-recap-points">${points}</div>
  `;
}

function buildReflectHTML({ data, book, chapter }) {
  return `
    <span class="story-float-heart br1"><span class="material-icons" style="font-size:28px">favorite</span></span>
    <span class="story-float-heart br2"><span class="material-icons" style="font-size:20px">favorite</span></span>
    <span class="story-float-heart br3"><span class="material-icons" style="font-size:24px">favorite</span></span>
    <span class="story-float-heart tl1"><span class="material-icons" style="font-size:22px">favorite</span></span>
    <span class="story-float-heart tl2"><span class="material-icons" style="font-size:18px">favorite</span></span>
    <span class="story-float-heart tl3"><span class="material-icons" style="font-size:26px">favorite</span></span>
    <div style="text-align:center">
      <span class="material-icons" style="font-size:32px;color:#db2777;margin-bottom:16px">favorite</span>
      <div class="story-label" style="text-align:center">REFLECT</div>
      <div class="story-title" style="text-align:center">${esc(book)} ${chapter}</div>
      <div class="story-reflect-text">${esc(data.reflectionP1 || "")}</div>
      <div class="story-reflect-text" style="margin-top:16px">${esc(data.reflectionP2 || "")}</div>
      <div class="story-reflect-closing"><span class="material-icons" style="font-size:14px;color:#db2777">auto_awesome</span> ${getReflectClosingLine()}</div>
      <div class="story-reflect-actions">
        <button class="story-reflect-action-btn" onclick="_storyToReflect()">
          Reflect this Chapter
        </button>
        <button class="story-reflect-action-btn outline" onclick="closeStoryModal()">
          Back to Reading
        </button>
      </div>
    </div>
  `;
}

// ── Story API calls ──────────────────────────────────────────────────────
async function fetchStoryGlance(book, chapter, versesText) {
  const raw = await callGemini(`You are a Bible study assistant. For ${book} Chapter ${chapter}, provide a quick visual snapshot.

Return ONLY valid JSON, no markdown fences:
{
  "characters": [{"name": "Character Name", "role": "brief role"}],
  "setting": "Location or context",
  "timeline": "Approximate time period",
  "oneLineSubject": "The key subject noun/phrase",
  "oneLineRest": "rest of the sentence"
}

RULES:
- characters: list ALL named people (max 6)
- setting: be specific
- timeline: use approximate dates or eras
- oneLineSubject + oneLineRest: one punchy sentence (max 15 words). Subject is the main noun/concept.

PASSAGE:
${versesText}`);
  try {
    const cleaned = raw.replace(/\`\`\`json\s*/gi, "").replace(/\`\`\`\s*/gi, "").trim();
    const p = JSON.parse(cleaned);
    return { characters: (p.characters || []).slice(0, 6), setting: p.setting || "", timeline: p.timeline || "", oneLineSubject: p.oneLineSubject || book, oneLineRest: p.oneLineRest || `Chapter ${chapter}` };
  } catch { return { characters: [], setting: "", timeline: "", oneLineSubject: book, oneLineRest: `Chapter ${chapter}` }; }
}

async function fetchStoryTimeline(book, chapter, versesText) {
  const verseCount = versesText.split("\n").filter(l => l.trim()).length;
  const target = Math.max(3, Math.min(10, Math.ceil(verseCount / 8)));
  const ICONS = '"light-mode","water-drop","park","pets","person","groups","favorite","local-fire-department","auto-awesome","menu-book","church","bolt","shield","visibility","healing","handshake","gavel","sailing","terrain","nightlight","celebration","warning","star","home","explore","psychology","volunteer-activism"';

  const raw = await callGemini(`You are a Bible study assistant creating an interactive story breakdown for ${book} Chapter ${chapter}.

Break the chapter into ${target} sequential segments. For EACH segment, pick the BEST displayType:

DISPLAY TYPES:
- "conversation": dialogue. Content: {"messages": [{"speaker": "Name", "text": "what they say", "verseRef": "exact verse number(s) this message is about, e.g. '3' or '4-5'"}]} — paraphrase in simple modern English, keep each message SHORT (1-2 sentences, max 20 words per message)
- "narration": action/events. Content: {"points": [{"text": "short point", "emoji": "optional emoji or empty", "verseRef": "exact verse number(s) this point is about, e.g. '3' or '4-5'"}]}
- "teaching": key concept. Content: {"quote": "the key teaching", "speaker": "who", "verseRef": "specific verse num", "explanation": "1-2 sentences"}
- "contrast": before/after. Content: {"left": {"label": "Before", "text": "..."}, "right": {"label": "After", "text": "..."}, "reflection": "1 sentence learning"}
- "sequence": step-by-step. Content: {"steps": [{"text": "step", "emoji": "optional", "verseRef": "exact verse number(s) this step is about, e.g. '7' or '8-9'"}]}

RULES:
- Every verse in exactly one segment
- Use a MIX of displayTypes
- Keep ALL text concise
- materialIcon from: ${ICONS}

Return ONLY valid JSON array:
[{"title": "Title", "materialIcon": "icon", "verses": "1-5", "displayType": "narration", "content": {}}]

PASSAGE:
${versesText}`);

  const strategies = [
    () => raw.replace(/\`\`\`json\s*/gi, "").replace(/\`\`\`\s*/gi, "").trim(),
    () => { const m = raw.match(/\[[\s\S]*\]/); return m ? m[0] : ""; },
  ];
  for (const extract of strategies) {
    try {
      const cleaned = extract();
      if (!cleaned) continue;
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 15).map(s => ({
          title: String(s.title || "Summary"),
          materialIcon: String(s.materialIcon || "auto-awesome"),
          verses: String(s.verses || ""),
          displayType: ["conversation","narration","list","teaching","contrast","sequence"].includes(s.displayType) ? s.displayType : "narration",
          content: s.content || {},
        }));
      }
    } catch {}
  }
  throw new Error("Failed to generate story. Please try again.");
}

async function fetchStoryClosing(book, chapter, versesText) {
  const raw = await callGemini(`You are a warm Bible study guide. For ${book} Chapter ${chapter}, create a closing.

Return ONLY valid JSON:
{
  "recapPoints": ["point 1", "point 2", "point 3"],
  "reflectionP1": "2 sentences MAX: a relatable feeling, linked to the chapter.",
  "reflectionP2": "2 sentences MAX: one clear takeaway + one line about God's character."
}

RULES:
- recapPoints: exactly 3, max 12 words each
- reflectionP1 + reflectionP2: KEEP IT SHORT. Max 2 sentences each, max 30 words each. DON'T start with book name. No filler. No rhetorical questions. Talk like a real person. Use "we/us/our" not "I/me/my".

PASSAGE:
${versesText}`);
  try {
    const cleaned = raw.replace(/\`\`\`json\s*/gi, "").replace(/\`\`\`\s*/gi, "").trim();
    const p = JSON.parse(cleaned);
    return { recapPoints: (p.recapPoints || []).slice(0, 5), reflectionP1: p.reflectionP1 || "", reflectionP2: p.reflectionP2 || "" };
  } catch { return null; }
}

const REFLECT_CLOSING_LINES = [
  "Take a moment to sit with this.",
  "Let this settle in your heart.",
  "No rush — just be here for a sec.",
  "Breathe. You're exactly where you need to be.",
  "Let these words stay with you today.",
  "Sit with this before you move on.",
  "Take this with you into your day.",
  "You don't have to figure it all out right now.",
  "Just let it land.",
  "Carry this truth with you today.",
];
function getReflectClosingLine() {
  return REFLECT_CLOSING_LINES[Math.floor(Math.random() * REFLECT_CLOSING_LINES.length)];
}

function boldify(text) {
  return esc(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════
// REFLECT MODAL — Shows reflection questions in a clean fullscreen view
// ═══════════════════════════════════════════════════════════════════════════
async function openReflectModal() {
  const modal = document.getElementById("reflectModal");
  const content = document.getElementById("reflectContent");
  const reflectionEl = document.getElementById("aiReflection");

  // Check if reflections are actually ready (has textareas), not just shimmer/loading state
  const hasReflections = reflectionEl && reflectionEl.querySelectorAll('textarea[id^="reflection-"]').length > 0;

  if (!hasReflections) {
    // Try to generate reflections on-the-fly if we have payload
    if (window.__aiPayload) {
      modal.hidden = false;
      content.innerHTML = `<div class="story-loading">
        <div class="story-sparkle-row"><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span><span class="story-sparkle">✦</span></div>
        <div class="story-loading-text">Generating reflections...</div>
      </div>`;
      await renderAIReflectionQuestions(window.__aiPayload);
      // Now reflectionEl should have content — re-check
      if (!reflectionEl.querySelectorAll('textarea[id^="reflection-"]').length) {
        content.innerHTML = `<div class="story-loading"><div class="story-loading-text">Failed to generate reflections.</div></div>`;
        return;
      }
    } else {
      content.innerHTML = `<div class="story-loading"><div class="story-loading-text">No reflection questions yet. Load a passage first.</div></div>`;
      modal.hidden = false;
      return;
    }
  }

  const bookName = bookEl.options[bookEl.selectedIndex]?.text || "";
  const chapter = chapterEl.value;

  // Clone and clean the HTML — strip rogue styled tags and inline styles from AI
  const cleanHTML = reflectionEl.innerHTML
    .replace(/<(strong|em|b|i|mark|span)[^>]*>(.*?)<\/\1>/gi, '$2')
    .replace(/\s*style="[^"]*"/gi, '');

  content.innerHTML = `
    <div>
      <div class="story-label">GUIDED REFLECTION</div>
      <div class="story-title">${bookName} ${chapter}</div>
      ${cleanHTML}
      <button class="reflect-copy-notes-btn" id="reflectCopyNotesBtn">
        <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:6px;">content_copy</span>Copy Notes
      </button>
    </div>`;

  modal.hidden = false;

  // Copy notes button
  document.getElementById("reflectCopyNotesBtn").onclick = async () => {
    const btn = document.getElementById("reflectCopyNotesBtn");
    await copyNotesBtn.onclick?.();
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;margin-right:6px;">content_copy</span>Copy Notes'; }, 2000);
  };

  // Convert any remaining plain-text verse refs (v. 5, vv. 2-3) into clickable links
  content.querySelectorAll("li p").forEach(p => {
    // Only process text nodes that aren't already inside <a> tags
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null);
    const replacements = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.parentElement?.tagName === "A") continue;
      const regex = /\bvv?\.?\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)/gi;
      let match;
      while (match = regex.exec(node.textContent)) {
        replacements.push({ node, fullMatch: match[0], nums: match[1], index: match.index });
      }
    }
    // Apply replacements in reverse order to preserve indices
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      const textNode = r.node;
      const before = textNode.textContent.substring(0, r.index);
      const after = textNode.textContent.substring(r.index + r.fullMatch.length);
      const link = document.createElement("a");
      link.href = `#${r.nums}`;
      link.className = "reflection-link";
      link.textContent = r.fullMatch;
      const afterNode = document.createTextNode(after);
      textNode.textContent = before;
      textNode.parentNode.insertBefore(link, textNode.nextSibling);
      textNode.parentNode.insertBefore(afterNode, link.nextSibling);
    }
  });

  // Wire verse reference links to open bottom sheet peek instead of scrolling
  content.querySelectorAll("a.reflection-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      // Extract all numbers from display text — handles "v. 8", "vv. 19-21", "vv. 19, 25"
      const verseRef = link.textContent.replace(/[^0-9,\-–\s]/g, "").trim() || link.getAttribute("href")?.replace("#", "");
      if (verseRef) openVersePeek(verseRef, link);
    });
  });

  // Restore saved values and sync textarea values
  content.querySelectorAll("textarea").forEach(ta => {
    // Restore from localStorage — extract answer only (stored as "Q: ...\nA: ...")
    if (ta.id) {
      const saved = localStorage.getItem(ta.id);
      if (saved) {
        const answerOnly = saved.includes("\nA: ") ? saved.split("\nA: ").slice(1).join("\nA: ") : saved;
        ta.value = answerOnly;
      }
    }
    // Auto-resize to fit content
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";

    ta.addEventListener("input", () => {
      const origTa = reflectionEl.querySelector(`#${ta.id}`);
      if (origTa) origTa.value = ta.value;
      // Save in Q&A format matching initializeReflections
      if (ta.id) {
        const li = ta.closest("li");
        const questionText = li?.querySelector("p")?.textContent?.trim() || "Question";
        localStorage.setItem(ta.id, `Q: ${questionText}\nA: ${ta.value}`);
      }
      // Auto-resize
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    });
  });
}

function closeReflectModal() {
  const modal = document.getElementById("reflectModal");
  const content = document.getElementById("reflectContent");
  const reflectionEl = document.getElementById("aiReflection");

  // Sync all textarea values back to the original reflection section + localStorage
  content.querySelectorAll("textarea").forEach(ta => {
    if (ta.id) {
      // Save in Q&A format
      const li = ta.closest("li");
      const questionText = li?.querySelector("p")?.textContent?.trim() || "Question";
      localStorage.setItem(ta.id, `Q: ${questionText}\nA: ${ta.value}`);
      // Sync back to original
      const orig = reflectionEl?.querySelector(`#${ta.id}`);
      if (orig) orig.value = ta.value;
    }
  });

  modal.classList.add("fade-out");
  setTimeout(() => { modal.hidden = true; modal.classList.remove("fade-out"); _restoreDailyStory(); }, 400);
}

function _peekGetVerseText(v, allVerses) {
  // Try DOM first
  const target = Array.from(allVerses).find(el =>
    el.querySelector(".verse-num")?.textContent?.trim() === String(v)
  );
  if (target) {
    const contentEl = target.querySelector(".verse-content");
    if (contentEl) {
      const clone = contentEl.cloneNode(true);
      clone.querySelectorAll(".verse-num, .verse-meta-indicators, .favorite-indicator").forEach(el => el.remove());
      return clone.textContent.trim();
    }
  }
  // Fallback: read from JSON
  if (bibleData && window.__aiPayload) {
    const { book, chapter: ch } = window.__aiPayload;
    const bookContent = bibleData[book] || bibleData[book?.toUpperCase()];
    if (bookContent && bookContent[ch] && bookContent[ch][String(v)]) {
      return bookContent[ch][String(v)].trim().replace(/([.!?,;:])(?=[a-zA-Z])/g, "$1 ").replace(/\s+/g, " ");
    }
  }
  return null;
}

function openVersePeek(rawRef, anchorEl) {
  // Parse verse numbers — handles: "8", "19-21", "19, 25", "19,25", "19, 20, 26"
  const cleaned = rawRef.replace(/[^0-9,\-–]/g, "");
  const verseNums = [];

  // Split by comma first for lists like "19, 25"
  cleaned.split(",").forEach(part => {
    part = part.trim();
    if (!part) return;
    const rangeParts = part.split(/[-–]/);
    const start = parseInt(rangeParts[0], 10);
    const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : start;
    if (!isNaN(start) && !isNaN(end)) {
      for (let v = start; v <= end; v++) verseNums.push(v);
    }
  });

  if (verseNums.length === 0) return;

  const allVerses = document.querySelectorAll("#output .verse");
  const bookName = bookEl.options[bookEl.selectedIndex]?.text || (window.__aiPayload?.book || "");
  const chapter = chapterEl.value || (window.__aiPayload?.chapter || "");

  const rows = verseNums.map(v => ({ num: v, text: _peekGetVerseText(v, allVerses) || "Verse not found." }));

  // Build label: "19, 25" for comma lists, "19–21" for ranges, "8" for single
  const verseLabel = verseNums.length === 1 ? verseNums[0] : rawRef.replace(/[^0-9,\-–\s]/g, "").trim();
  const refLabel = `${bookName} ${chapter}:${verseLabel}`;
  const bodyHTML = rows.map(r =>
    `<div class="verse-peek-row"><span class="verse-peek-num">v.${r.num}</span><span>${r.text}</span></div>`
  ).join("");

  // Remove any existing peek
  document.querySelector(".verse-peek-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "verse-peek-overlay";

  const bubble = document.createElement("div");
  bubble.className = "verse-peek-bubble";
  bubble.innerHTML = `
    <div class="verse-peek-header">
      <div class="verse-peek-ref">${refLabel}</div>
      <button class="verse-peek-goto" title="Go to passage"><span class="material-icons">open_in_new</span></button>
    </div>
    <div class="verse-peek-body-wrap">
      <div class="verse-peek-body">${bodyHTML}</div>
    </div>
    <div class="verse-peek-tail"></div>`;

  bubble.querySelector(".verse-peek-goto").onclick = () => {
    _goToPassageFromPeek(bookName, chapter, verseNums[0]);
  };

  // Hide gradient when scrolled to bottom — wrap is now the scroll container
  const peekWrap = bubble.querySelector(".verse-peek-body-wrap");
  const checkPeekScroll = () => {
    const atEnd = peekWrap.scrollHeight - peekWrap.scrollTop - peekWrap.clientHeight < 8;
    peekWrap.classList.toggle("peek-scrolled-end", atEnd);
  };
  peekWrap.addEventListener("scroll", checkPeekScroll);
  // Prevent touch events from leaking to story modal behind
  peekWrap.addEventListener("touchmove", e => e.stopPropagation());
  overlay.addEventListener("touchmove", e => {
    if (!peekWrap.contains(e.target)) e.preventDefault();
  }, { passive: false });
  requestAnimationFrame(checkPeekScroll);
  overlay.appendChild(bubble);
  document.body.appendChild(overlay);

  // Position bubble above the anchor element
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    const anchorTopY = rect.top;

    // Place bubble so its tail points at the anchor
    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;

      // Horizontal: center on anchor, clamp to viewport
      let left = anchorCenterX - bw / 2;
      left = Math.max(pad, Math.min(left, vw - bw - pad));

      // Vertical: above the anchor by default
      let top = anchorTopY - bh - 10;
      let tailBelow = true;

      // If not enough room above, show below
      if (top < pad) {
        top = rect.bottom + 10;
        tailBelow = false;
      }

      // Clamp vertically too
      top = Math.max(pad, Math.min(top, vh - bh - pad));

      bubble.style.left = left + "px";
      bubble.style.top = top + "px";

      // Position tail centered on anchor
      const tail = bubble.querySelector(".verse-peek-tail");
      const tailX = anchorCenterX - left;
      tail.style.left = Math.max(18, Math.min(tailX, bw - 18)) + "px";

      if (!tailBelow) {
        tail.classList.add("verse-peek-tail-top");
      }
    });
  } else {
    // Fallback: center on screen
    bubble.style.left = "50%";
    bubble.style.top = "50%";
    bubble.style.transform = "translate(-50%, -50%)";
  }

  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });
}

