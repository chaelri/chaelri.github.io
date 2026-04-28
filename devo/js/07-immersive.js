
function ttsImmersiveOpen() {
  const el = document.getElementById("ttsImmersive");
  if (!el) return;

  // Always reset reflection panel state so a fresh TTS session is clean
  const reflPanel = document.getElementById("ttsImmReflPanel");
  if (reflPanel) reflPanel.hidden = true;
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "";
  // Reflect btn starts hidden — only revealed when TTS finishes AND reflection is loaded
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

  // Set passage title
  const name = BIBLE_META[bookEl?.value]?.name || "";
  const ch = chapterEl?.value || "";
  const titleEl = document.getElementById("ttsImmTitle");
  if (titleEl) titleEl.textContent = name && ch ? `${name} ${ch}` : "";

  // Reset load bar + status
  const immBar = document.getElementById("ttsImmLoadBar");
  if (immBar) immBar.style.width = "0%";
  const immStatus = document.getElementById("ttsImmStatusEl");
  if (immStatus) immStatus.textContent = "";

  // Build scrubber dots from queue
  ttsImmersiveBuildScrubber();

  // Wire buttons
  document.getElementById("ttsImmPrevBtn").onclick = ttsPrevVerse;
  document.getElementById("ttsImmNextBtn").onclick = ttsNextVerse;
  document.getElementById("ttsImmPauseBtn").onclick = pauseResumeTTS;
  document.getElementById("ttsImmCloseBtn").onclick = stopTTS;

  // Prev/next verse slots are tappable to jump
  document.getElementById("ttsImmSlotPrev").onclick = () => { if (ttsIdx > 0) ttsPrevVerse(); };
  document.getElementById("ttsImmSlotNext").onclick = () => { if (ttsIdx < ttsQueue.length - 1) ttsNextVerse(); };

  // Double-tap current verse to favorite
  const curSlot = document.getElementById("ttsImmSlotCur");
  if (curSlot) {
    curSlot.addEventListener("click", _immHandleDoubleTap);
  }

  el.hidden = false;
}

async function _loadTtsImmersiveBg(bookName, ch) {
  const el = document.getElementById("ttsImmersive");
  if (!el || !bookName) return;
  el.querySelector(".tts-imm-scene-bg")?.remove();
  try {
    const prompt = buildScenePrompt(bookName, ch, null, "Wide cinematic establishing shot, atmospheric, moody lighting, depth of field");
    const dataUrl = await callImageGen(prompt, "9:16");
    if (el.hidden) return;
    const bg = document.createElement("div");
    bg.className = "tts-imm-scene-bg";
    const img = new Image();
    img.style.cssText = "width:100%;height:100%;object-fit:cover;position:absolute;inset:0;";
    img.onload = () => {
      if (el.hidden) return;
      el.prepend(bg);
      requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add("visible")));
    };
    img.src = dataUrl;
    bg.appendChild(img);
  } catch {}
}

function ttsImmersiveClose() {
  const el = document.getElementById("ttsImmersive");
  if (el) el.hidden = true;
  _immDoubleTapCount = 0;
  clearTimeout(_immDoubleTapTimer);
  _immCancelAutoRefl();
  if (_immVerseUpdateTimer) { clearTimeout(_immVerseUpdateTimer); _immVerseUpdateTimer = null; }
  // Reset all panels and any disabled states
  const pausePanel = document.getElementById("ttsImmPausePanel");
  if (pausePanel) pausePanel.hidden = true;
  const pauseActionsRow = document.querySelector(".tts-imm-pause-actions");
  if (pauseActionsRow) pauseActionsRow.hidden = false;
  ["ttsImmPauseNote","ttsImmPauseContext","ttsImmPauseAsk"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove("active");
  });
  const immPauseBtn = document.getElementById("ttsImmPauseBtn");
  if (immPauseBtn) { immPauseBtn.disabled = false; immPauseBtn.classList.remove("tts-imm-btn-pulse"); }
  const immPrevBtn = document.getElementById("ttsImmPrevBtn");
  if (immPrevBtn) immPrevBtn.disabled = false;
  const immNextBtn = document.getElementById("ttsImmNextBtn");
  if (immNextBtn) immNextBtn.disabled = false;
  const ctxPanel = document.getElementById("ttsImmContextPanel");
  if (ctxPanel) ctxPanel.hidden = true;
  const panel = document.getElementById("ttsImmReflPanel");
  if (panel) panel.hidden = true;
  const versePopup = document.getElementById("ttsImmVersePopup");
  if (versePopup) versePopup.hidden = true;
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "";
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;
}

function _ttsImmStartPlayback(gen) {
  if (gen !== ttsGen) return;
  const ctxPanel = document.getElementById("ttsImmContextPanel");
  if (ctxPanel) ctxPanel.hidden = true;

  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "";

  const immBar = document.getElementById("ttsImmLoadBar");
  if (immBar) {
    const pct = ttsQueue.length > 0 ? `${(_ttsReadyCount / ttsQueue.length) * 100}%` : "0%";
    immBar.style.width = pct;
  }
  const immStatus = document.getElementById("ttsImmStatusEl");
  if (immStatus) immStatus.textContent = "";

  ttsImmersiveBuildScrubber();
  document.getElementById("ttsImmPrevBtn").onclick = ttsPrevVerse;
  document.getElementById("ttsImmNextBtn").onclick = ttsNextVerse;
  document.getElementById("ttsImmPauseBtn").onclick = pauseResumeTTS;
  document.getElementById("ttsImmSlotPrev").onclick = () => { if (ttsIdx > 0) ttsPrevVerse(); };
  document.getElementById("ttsImmSlotNext").onclick = () => { if (ttsIdx < ttsQueue.length - 1) ttsNextVerse(); };
  const curSlot = document.getElementById("ttsImmSlotCur");
  if (curSlot) curSlot.addEventListener("click", _immHandleDoubleTap);

  ttsPlayAt(0, gen);
}

function ttsImmContextOpen(gen) {
  const el = document.getElementById("ttsImmersive");
  if (!el) return;

  el.hidden = false;

  // Hide stage + footer, hide reflection panel, hide reflect btn
  const stage = document.querySelector(".tts-imm-stage");
  if (stage) stage.style.display = "none";
  const footer = document.querySelector(".tts-imm-footer");
  if (footer) footer.style.display = "none";
  const reflPanel = document.getElementById("ttsImmReflPanel");
  if (reflPanel) reflPanel.hidden = true;
  const reflectBtn = document.getElementById("ttsImmReflectBtn");
  if (reflectBtn) reflectBtn.hidden = true;

  // Set passage title
  const name = BIBLE_META[bookEl?.value]?.name || "";
  const ch = chapterEl?.value || "";
  const titleEl = document.getElementById("ttsImmTitle");
  if (titleEl) titleEl.textContent = name && ch ? `${name} ${ch}` : "";

  // Generate immersive background image
  _loadTtsImmersiveBg(name, ch);

  // Close button stops TTS
  document.getElementById("ttsImmCloseBtn").onclick = stopTTS;

  // Show loading screen instead of context
  const ctxPanel = document.getElementById("ttsImmContextPanel");
  const ctxContent = document.getElementById("ttsImmContextContent");
  if (ctxContent) {
    ctxContent.innerHTML = `
      <div class="tts-imm-loader">
        <div class="story-sparkle-row">
          <span class="story-sparkle">✦</span>
          <span class="story-sparkle">✦</span>
          <span class="story-sparkle">✦</span>
        </div>
        <div class="tts-imm-loader-text">Preparing audio…</div>
        <div class="tts-imm-loader-bar-wrap">
          <div class="tts-imm-loader-bar" id="ttsImmLoaderBar"></div>
        </div>
        <div class="tts-imm-loader-count" id="ttsImmLoaderCount">0 / ${ttsQueue.length}</div>
      </div>`;
  }
  if (ctxPanel) ctxPanel.hidden = false;

  // Hide the start button — we auto-start
  const startBtn = document.getElementById("ttsImmContextStart");
  if (startBtn) startBtn.style.display = "none";

  // Poll for first verse ready, then auto-start. Also live-updates the
  // loader bar + counter so the user sees verses landing during cold-start.
  const loaderBar = document.getElementById("ttsImmLoaderBar");
  const loaderCount = document.getElementById("ttsImmLoaderCount");
  const pollId = setInterval(() => {
    if (gen !== ttsGen) { clearInterval(pollId); return; }
    if (loaderBar && ttsQueue.length) {
      loaderBar.style.width = `${(_ttsReadyCount / ttsQueue.length) * 100}%`;
    }
    if (loaderCount) loaderCount.textContent = `${_ttsReadyCount} / ${ttsQueue.length}`;
    // Start as soon as the first verse is synthesized
    if (_ttsReadyCount >= 1) {
      clearInterval(pollId);
      if (startBtn) startBtn.style.display = "";
      _ttsImmStartPlayback(gen);
    }
  }, 150);
}

function ttsImmersiveBuildScrubber() {
  const scrubber = document.getElementById("ttsImmScrubber");
  if (!scrubber) return;
  scrubber.innerHTML = ttsQueue.map((item, i) =>
    `<button class="tts-imm-dot" data-idx="${i}">${item.verseNum}</button>`
  ).join("");
  scrubber.querySelectorAll(".tts-imm-dot").forEach(dot => {
    dot.onclick = () => {
      const idx = parseInt(dot.dataset.idx);
      ttsGen++;
      if (ttsAudio) { ttsAudio.onended = null; ttsAudio.pause(); ttsAudio = null; }
      ttsPlayAt(idx, ttsGen);
    };
  });
}

function ttsImmersiveUpdate(index) {
  if (index < 0 || index >= ttsQueue.length) return;

  const prev = ttsQueue[index - 1];
  const cur  = ttsQueue[index];
  const next = ttsQueue[index + 1];

  // Cancel any in-flight deferred update
  if (_immVerseUpdateTimer) {
    clearTimeout(_immVerseUpdateTimer);
    _immVerseUpdateTimer = null;
    const cs = document.getElementById("ttsImmSlotCur");
    if (cs) cs.classList.remove("tts-verse-exit", "tts-verse-anim");
  }

  // Phase 1: exit animation on current slot, fade side slots out
  const curSlot  = document.getElementById("ttsImmSlotCur");
  const prevSlot = document.getElementById("ttsImmSlotPrev");
  const nextSlot = document.getElementById("ttsImmSlotNext");
  if (curSlot) {
    curSlot.classList.remove("tts-verse-anim");
    void curSlot.offsetWidth;
    curSlot.classList.add("tts-verse-exit");
  }
  if (prevSlot) prevSlot.style.opacity = "0";
  if (nextSlot) nextSlot.style.opacity = "0";

  // Phase 2: after exit, swap content and animate in
  _immVerseUpdateTimer = setTimeout(() => {
    _immVerseUpdateTimer = null;

    // Prev slot
    const prevNum  = document.getElementById("ttsImmPrevNum");
    const prevText = document.getElementById("ttsImmPrevText");
    if (prevNum)  prevNum.textContent  = prev ? `Verse ${prev.verseNum}` : "";
    if (prevText) prevText.textContent = prev ? _immPreview(prev.text) : "";

    // Current slot
    const curNum  = document.getElementById("ttsImmCurNum");
    const curText = document.getElementById("ttsImmCurText");
    const _renderCurText = () => {
      if (!curText) return;
      const words = (cur.text || "").split(/\s+/).filter(Boolean);
      if (!words.length) { curText.textContent = cur.text || ""; return; }
      curText.innerHTML = words
        .map((w, i) => `<span class="tts-imm-word" data-idx="${i}">${_escapeSSML(w)}</span>`)
        .join(" ");
    };
    if (curSlot) {
      curSlot.classList.remove("tts-verse-exit");
      if (curNum) curNum.textContent = `Verse ${cur.verseNum}`;
      _renderCurText();
      void curSlot.offsetWidth;
      curSlot.classList.add("tts-verse-anim");
    } else {
      if (curNum) curNum.textContent = `Verse ${cur.verseNum}`;
      _renderCurText();
    }

    // Next slot
    const nextNum  = document.getElementById("ttsImmNextNum");
    const nextText = document.getElementById("ttsImmNextText");
    if (nextNum)  nextNum.textContent  = next ? `Verse ${next.verseNum}` : "";
    if (nextText) nextText.textContent = next ? _immPreview(next.text) : "";

    // Restore side slot opacity (CSS transition handles fade-in)
    if (prevSlot) prevSlot.style.opacity = "";
    if (nextSlot) nextSlot.style.opacity = "";

    // Favorite badge for current verse
    const favBadge = document.getElementById("ttsImmFavBadge");
    if (favBadge && cur) {
      const curKey = keyOf(bookEl.value, chapterEl.value, cur.verseNum);
      favBadge.classList.toggle("visible", isFavorite(curKey));
    }

    // Scrubber: activate current dot and scroll it into view
    document.querySelectorAll("#ttsImmScrubber .tts-imm-dot").forEach((d, i) => {
      d.classList.toggle("active", i === index);
    });
    const activeDot = document.querySelector(`#ttsImmScrubber .tts-imm-dot[data-idx="${index}"]`);
    if (activeDot) activeDot.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

    // Nav buttons
    const prevBtn = document.getElementById("ttsImmPrevBtn");
    const nextBtn = document.getElementById("ttsImmNextBtn");
    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= ttsQueue.length - 1;

    // Reset pause button to pause icon
    const pauseBtn = document.getElementById("ttsImmPauseBtn");
    if (pauseBtn && !ttsPaused) {
      pauseBtn.innerHTML = '<span class="material-symbols-outlined">pause</span>';
      pauseBtn.onclick = pauseResumeTTS;
    }
  }, 120);
}

function _immPreview(text) {
  const words = text.split(/\s+/);
  return words.length > 8 ? words.slice(0, 8).join(" ") + "\u2026" : text;
}

function _immHandleDoubleTap() {
  _immDoubleTapCount++;
  if (_immDoubleTapCount === 2) {
    _immDoubleTapCount = 0;
    clearTimeout(_immDoubleTapTimer);
    const item = ttsQueue[ttsIdx];
    if (!item) return;
    const key = keyOf(bookEl.value, chapterEl.value, item.verseNum);
    toggleFavorite(key);
    // Sync the verse element in #output
    const favIcon = document.querySelector(`.favorite-indicator[data-key="${key}"]`);
    if (favIcon) {
      const isFav = isFavorite(key);
      const wrap = favIcon.closest(".verse");
      if (wrap) wrap.classList.toggle("highlighted", isFav);
      favIcon.textContent = isFav ? "favorite" : "favorite_border";
      favIcon.style.color = isFav ? "#c83086" : "";
    }
    // Update persistent fav badge
    const favBadge = document.getElementById("ttsImmFavBadge");
    if (favBadge) favBadge.classList.toggle("visible", isFavorite(key));
    const heart = document.getElementById("ttsImmHeart");
    if (heart) {
      heart.classList.remove("popping");
      void heart.offsetWidth;
      heart.classList.add("popping");
      heart.addEventListener("animationend", () => heart.classList.remove("popping"), { once: true });
    }
  } else {
    _immDoubleTapTimer = setTimeout(() => { _immDoubleTapCount = 0; }, 350);
  }
}

// ── Immersive Guided Reflection ──────────────────────────────────────────────

function ttsImmReflectionOpen() {
  const textAreas = Array.from(document.querySelectorAll('#aiReflection textarea[id^="reflection-"]'));
  if (textAreas.length === 0) {
    const status = document.getElementById("ttsImmStatusEl");
    if (status) {
      status.textContent = "Reflection not ready yet";
      status.style.opacity = "0.7";
      setTimeout(() => { status.style.opacity = ""; status.textContent = ""; }, 2500);
    }
    return;
  }
  // Hide stage + footer, show reflection panel
  const stage = document.querySelector(".tts-imm-stage");
  const footer = document.querySelector(".tts-imm-footer");
  if (stage) stage.style.display = "none";
  if (footer) footer.style.display = "none";
  const panel = document.getElementById("ttsImmReflPanel");
  if (panel) panel.hidden = false;

  _immReflIndex = 0;
  ttsImmReflectionShow(_immReflIndex);
}

function ttsImmReflectionShow(index) {
  const textAreas = Array.from(document.querySelectorAll('#aiReflection textarea[id^="reflection-"]'));
  const total = textAreas.length;
  const ta = textAreas[index];
  if (!ta) return;

  document.getElementById("ttsImmReflProgress").textContent = `${index + 1} / ${total}`;

  // Question text is in the <li> or <p> just before the textarea
  const questionText = ta.previousElementSibling?.textContent?.trim() || `Question ${index + 1}`;
  const questionEl = document.getElementById("ttsImmReflQuestion");
  questionEl.innerHTML = _immParseVerseRefs(questionText);
  questionEl.querySelectorAll(".tts-imm-verse-ref").forEach(chip => {
    chip.onclick = () => _immShowVersePopup(
      parseInt(chip.dataset.start),
      parseInt(chip.dataset.end)
    );
  });

  const myArea = document.getElementById("ttsImmReflArea");
  myArea.value = ta.value;
  myArea.oninput = () => {
    ta.value = myArea.value;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
  myArea.focus({ preventScroll: true });

  const backBtn = document.getElementById("ttsImmReflBack");
  const nextBtn = document.getElementById("ttsImmReflNext");
  const copyBtn = document.getElementById("ttsImmReflCopy");
  const doneBtn = document.getElementById("ttsImmReflDone");
  const statusEl = document.getElementById("ttsImmReflStatus");
  statusEl.textContent = "";

  // Back: go to prev question, or return to TTS stage on Q1
  backBtn.textContent = index === 0 ? "← Verses" : "← Back";
  backBtn.onclick = () => {
    if (index === 0) {
      document.getElementById("ttsImmReflPanel").hidden = true;
      const stage = document.querySelector(".tts-imm-stage");
      if (stage) stage.style.display = "";
      const footer = document.querySelector(".tts-imm-footer");
      if (footer) footer.style.display = "";
    } else {
      _immReflIndex--;
      ttsImmReflectionShow(_immReflIndex);
    }
  };

  if (index < total - 1) {
    nextBtn.hidden = false;
    nextBtn.textContent = "Next →";
    nextBtn.onclick = () => {
      _immReflIndex++;
      ttsImmReflectionShow(_immReflIndex);
    };
    copyBtn.hidden = true;
    if (doneBtn) doneBtn.hidden = true;
  } else {
    nextBtn.hidden = true;
    copyBtn.hidden = false;
    copyBtn.onclick = async () => {
      await copyNotesBtn.onclick?.();
      statusEl.textContent = "✅ Notes copied!";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    };
    if (doneBtn) {
      doneBtn.hidden = false;
      doneBtn.onclick = () => stopTTS();
    }

    // Generate a completion scene image
    const reflSceneMnt = document.getElementById("ttsImmReflStatus");
    if (reflSceneMnt) {
      const name = BIBLE_META[bookEl?.value]?.name || "";
      const ch = chapterEl?.value || "";
      if (name && ch) {
        reflSceneMnt.innerHTML = `<div class="refl-scene-wrap"><div class="story-scene-shimmer" style="width:100%;height:120px;border-radius:12px"></div></div>`;
        callImageGen(buildScenePrompt(name, ch, null, "Peaceful closing scene, sunset, quiet moment of prayer and reflection"), "21:9").then(dataUrl => {
          reflSceneMnt.innerHTML = `<div class="refl-scene-wrap"><img src="${dataUrl}" class="refl-scene-img" alt="Reflection scene"></div>`;
        }).catch(() => { reflSceneMnt.innerHTML = ""; });
      }
    }
  }
}

function _immParseVerseRefs(text) {
  // Escape HTML first, then replace verse refs with tappable chips
  // Handles: v. 1, v1, vv. 2-3, vv2-3, vv 3-5
  const escaped = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return escaped.replace(/\bvv?\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi, (match, start, end) => {
    return `<span class="tts-imm-verse-ref" data-start="${start}" data-end="${end || start}">${match}</span>`;
  });
}

function _immShowVersePopup(startVerse, endVerse) {
  const popup = document.getElementById("ttsImmVersePopup");
  const content = document.getElementById("ttsImmVersePopupContent");
  if (!popup || !content) return;

  const rows = [];
  for (let v = startVerse; v <= endVerse; v++) {
    const item = ttsQueue.find(q => String(q.verseNum) === String(v));
    if (item) {
      rows.push(`
        <div class="tts-imm-verse-popup-row">
          <span class="tts-imm-verse-popup-num">v.${v}</span>
          <span class="tts-imm-verse-popup-text">${item.text}</span>
        </div>`);
    }
  }

  content.innerHTML = rows.length
    ? rows.join("")
    : `<span class="tts-imm-verse-popup-text" style="opacity:0.5">Verse not found.</span>`;

  popup.hidden = false;

  document.getElementById("ttsImmVersePopupClose").onclick = () => { popup.hidden = true; };
  document.getElementById("ttsImmVersePopupBackdrop").onclick = () => { popup.hidden = true; };
}

