/* ---------- COMMENTS ---------- */

// Moved to a higher scope for reusability and efficiency
const updateMetaIndicators = (key, verseContent, newCommentCount) => {
  const isFav = isFavorite(key);
  let metaIndicators = verseContent.querySelector(".verse-meta-indicators");

  // This block should ideally not be needed if loadPassage always renders it.
  // Kept for robustness but it should rarely be hit.
  if (!metaIndicators) {
    metaIndicators = document.createElement("span");
    metaIndicators.className = "verse-meta-indicators";
    metaIndicators.style.cssText =
      "display:inline-flex; align-items:center; margin-left:8px; opacity:0.6;";
    verseContent.appendChild(metaIndicators);
  } else {
    // Clear existing indicators to rebuild, ensuring no duplicates or stale states
    metaIndicators.innerHTML = "";
  }

  // 1. Favorite Indicator
  const favIndicator = document.createElement("span");
  favIndicator.className = "material-icons favorite-indicator";
  favIndicator.style.cssText = "font-size:14px; margin-right:4px;";
  favIndicator.setAttribute("data-key", key);
  favIndicator.textContent = isFav ? "favorite" : "favorite_border";
  favIndicator.style.color = isFav ? "#c83086" : "";
  const verseWrap = verseContent.closest(".verse");
  if (verseWrap) verseWrap.classList.toggle("highlighted", isFav);
  favIndicator.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(key);
    updateMetaIndicators(key, verseContent, comments[key]?.length || 0);
    if (verseWrap) animateFavorite(verseWrap);
  };
  metaIndicators.appendChild(favIndicator);

  // 2. Note dot indicator (shows when notes exist, no interaction needed — Note button handles it)
  if (newCommentCount > 0) {
    const noteDot = document.createElement("span");
    noteDot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#c83086;display:inline-block;margin-left:2px;flex-shrink:0;";
    metaIndicators.appendChild(noteDot);
  }
};

function renderComments(key, container, { skipFocus = false } = {}) {
  container.innerHTML = "";

  // key format: "BOOKID-CHAPTER-VERSE" where VERSE may contain a dash (e.g. "1-4")
  const parts = key.split("-");
  const verseIndex = parts.slice(2).join("-");
  const verseHeader = document.getElementById(verseIndex);
  // Find the flex container that holds the verse content
  const verseContent = verseHeader.children[0];

  const commentHeader = document.createElement("div");
  commentHeader.classList.add("flex");
  container.appendChild(commentHeader);

  const commentLabel = document.createElement("div");
  commentLabel.classList.add("comment-label");
  commentLabel.innerText = "NOTES";
  commentHeader.appendChild(commentLabel);

  const verse =
    bibleData[BIBLE_META[key.split("-")[0]].name.toUpperCase()][
      key.split("-")[1]
    ][verseIndex];

  const copyVerse = document.createElement("div");
  copyVerse.classList.add("copy-verse");
  copyVerse.innerText = "COPY VERSE";
  commentHeader.appendChild(copyVerse);
  copyVerse.onclick = () => {
    copyVerse.style.opacity = "1";
    copyVerse.classList.add("ai-fade-in");
    copyVerse.innerText = "VERSE COPIED! ✅";
    setTimeout(() => {
      copyVerse.classList.remove("ai-fade-in");
      copyVerse.innerText = "COPY VERSE";
      copyVerse.style.opacity = "0.6";
    }, 2000);
    navigator.clipboard.writeText(
      `${verse}
${BIBLE_META[key.split("-")[0]].name.toUpperCase()} ${key.split("-")[1]}:${verseIndex}`,
    );
  };

  const list = comments[key] || [];

  list.forEach((obj, i) => {
    const c = document.createElement("div");
    c.className = "comment";
    c.innerHTML = `${obj.text}<button>✕</button>`;
    c.querySelector("button").onclick = () => {
      comments[key].splice(i, 1);
      saveComments();
      renderComments(key, container);
      renderSummary();
      updateMetaIndicators(key, verseContent, comments[key].length);
    };
    container.appendChild(c);
  });

  const input = document.createElement("div");
  input.className = "comment-input";
  input.innerHTML = `<textarea rows="1"></textarea><button>Add</button>`;
  input.querySelector("button").onclick = () => {
    const val = input.querySelector("textarea").value.trim();
    if (!val) return;
    if (!comments[key]) comments[key] = [];
    comments[key].push({ text: val, time: Date.now() });
    saveComments();
    renderComments(key, container);
    renderSummary();
    updateMetaIndicators(key, verseContent, comments[key].length);
  };

  container.appendChild(input);

  // Initial call to ensure indicators are correct when comments pane opens
  updateMetaIndicators(key, verseContent, list.length);

  const newTextarea = input.querySelector("textarea");
  if (!skipFocus) newTextarea.focus();
}

/* ---------- TOGGLE ALL NOTES ---------- */
let _allNotesOpen = false;

function toggleAllNotes() {
  _allNotesOpen = !_allNotesOpen;
  const btn = document.getElementById("notesToggleBtn");
  btn.classList.toggle("ctrl-icon-active", _allNotesOpen);

  document.querySelectorAll("#output .verse").forEach((wrap) => {
    const key = wrap.dataset.verseKey;
    const commentsEl = wrap.querySelector(".comments");
    if (!key || !commentsEl) return;

    if (_allNotesOpen) {
      commentsEl.hidden = false;
      renderComments(key, commentsEl, { skipFocus: true });
    } else {
      commentsEl.hidden = true;
    }
  });
}

document.getElementById("notesToggleBtn")?.addEventListener("click", toggleAllNotes);

let hasCurrentComments = false;
/* ---------- SUMMARY ---------- */
function renderSummary() {
  summaryEl.innerHTML = "";
  notesCopyStatusEl.innerHTML = "";
  copyNotesBtn.style.display = "none";

  applyReflectionVisibility();

  const single = verseEl.value;
  window.__currentSummaryItems = [];

  let items = [];
  hasCurrentComments = false;
  Object.entries(comments).forEach(([key, list]) => {
    const parts = key.split("-");
    const b = parts[0];
    const c = parts[1];
    const v = parts.slice(2).join("-"); // preserves range keys like "1-4"

    if (b !== bookEl.value || c !== chapterEl.value) return;
    if (single && parseInt(v) !== +single) return;
    if (!list.length) return;

    hasCurrentComments = true;

    items.push({ verseNum: v, list });
    window.__currentSummaryItems.push({ verseNum: parseInt(v), list }); // numeric for copy-notes sort
    checkIfHasTextAreaAnswers();
  });

  if (!items.length) {
    summaryEl.textContent = "No notes yet for this passage.";
    return;
  }

  items.sort((a, b) => parseInt(a.verseNum) - parseInt(b.verseNum));

  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "summary-item";
    block.innerHTML = `<a href="#${item.verseNum}" class="summary-verse">Verse ${item.verseNum}</a>`;

    item.list.forEach((n) => {
      const note = document.createElement("div");
      note.className = "summary-note";
      note.innerHTML = `
        ${n.text}
        <time>
          ${new Date(n.time).toLocaleString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </time>
      `;
      block.appendChild(note);
    });

    summaryEl.appendChild(block);
  });
}

const scrollTopBtn = document.getElementById("scrollTopBtn");
const layoutEl = document.querySelector(".layout");

scrollTopBtn.style.display = "none";
let _scrollBtnVisible = false;

layoutEl.addEventListener("scroll", () => {
  if (window.innerWidth > 900) return;
  const shouldShow = layoutEl.scrollTop > 160;

  if (shouldShow && !_scrollBtnVisible) {
    _scrollBtnVisible = true;
    scrollTopBtn.style.display = "flex";
    scrollTopBtn.style.animation = "scrollBtnIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards";
  } else if (!shouldShow && _scrollBtnVisible) {
    _scrollBtnVisible = false;
    scrollTopBtn.style.animation = "scrollBtnOut 0.25s ease-in forwards";
    scrollTopBtn.addEventListener("animationend", () => {
      if (!_scrollBtnVisible) scrollTopBtn.style.display = "none";
    }, { once: true });
  }
});

scrollTopBtn.onclick = () => {
  layoutEl.scrollTo({ top: 0, behavior: "smooth" });
};

/* ---------- READING PROGRESS BAR ----------
   Tracks scroll through the active reader (.layout in normal mode,
   #cmScroll in canvas/highlight mode). Hidden on dashboard. */
(function setupReadProgress() {
  const bar = document.getElementById("readProgressBar");
  const fill = document.getElementById("readProgressFill");
  if (!bar || !fill || !layoutEl) return;
  const cmOverlay = document.getElementById("canvasModeOverlay");
  let cmScroll = null;
  let raf = 0;

  function compute() {
    raf = 0;
    const cmOpen = cmOverlay && !cmOverlay.hidden;
    if (cmOpen && !cmScroll) cmScroll = document.getElementById("cmScroll");
    // Only show in canvas/highlight mode — in normal reading mode the bar
    // is visual noise per Charlie. Hidden on dashboard too.
    if (!cmOpen || !cmScroll) {
      bar.classList.remove("is-visible");
      fill.style.width = "0%";
      return;
    }
    const scroller = cmScroll;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100)) : 0;
    fill.style.width = pct.toFixed(2) + "%";
    bar.classList.add("is-visible");
  }
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(compute);
  }

  layoutEl.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);

  // #cmScroll exists from boot (it's static markup), bind once.
  cmScroll = document.getElementById("cmScroll");
  if (cmScroll) cmScroll.addEventListener("scroll", schedule, { passive: true });

  // Recompute when the layout flips between dashboard (.layout-unset) and
  // reading mode, and when the canvas overlay opens/closes.
  new MutationObserver(schedule).observe(layoutEl, {
    attributes: true,
    attributeFilter: ["class"],
  });
  if (cmOverlay) {
    new MutationObserver(schedule).observe(cmOverlay, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  schedule();
})();

/* ---------- EVENTS ---------- */
bookEl.onchange = loadChapters;
chapterEl.onchange = loadVerses;
const vSelect = document.getElementById("versionSelect");
if (vSelect) vSelect.value = currentVersion;

// Version pill toggle
function _updateVersionPills(ver) {
  document.querySelectorAll(".version-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ver === ver);
  });
}
_updateVersionPills(currentVersion);
document.querySelectorAll(".version-pill").forEach(btn => {
  btn.addEventListener("click", () => switchVersion(btn.dataset.ver));
});
loadBtn.onclick = async () => {
  output.innerHTML = "";
  stopTTS(); // fully reset TTS state so new chapter gets a fresh queue
  document.getElementById("prevChapterBtn").classList.remove("hidden");
  document.getElementById("nextChapterBtn").classList.remove("hidden");
  document.getElementById("ttsPlayBtn").classList.remove("hidden");
  document.getElementById("notesToggleBtn").classList.remove("hidden");
  document.getElementById("canvasModeBtn")?.classList.remove("hidden");
  document.getElementById("storyReflectRow")?.classList.remove("hidden");
  updateStorySeenState();
  resetAISections();

  await loadPassage();

  await runAIForCurrentPassage();
};

const prevChapterBtn = document.getElementById("prevChapterBtn");
const nextChapterBtn = document.getElementById("nextChapterBtn");

if (prevChapterBtn) {
  prevChapterBtn.onclick = () => {
    const bookKeys = Object.keys(BIBLE_META);
    let currentBookIdx = bookKeys.indexOf(bookEl.value);
    let currentChapter = parseInt(chapterEl.value);

    if (currentChapter > 1) {
      chapterEl.value = currentChapter - 1;
    } else if (currentBookIdx > 0) {
      currentBookIdx--;
      bookEl.value = bookKeys[currentBookIdx];
      loadChapters();
      const lastChapter = BIBLE_META[bookEl.value].chapters.length;
      chapterEl.value = lastChapter;
    } else {
      return; // Start of Bible
    }
    verseEl.value = "";
    loadBtn.click();
  };
}

if (nextChapterBtn) {
  nextChapterBtn.onclick = () => {
    const bookKeys = Object.keys(BIBLE_META);
    let currentBookIdx = bookKeys.indexOf(bookEl.value);
    let currentChapter = parseInt(chapterEl.value);
    const totalChapters = BIBLE_META[bookEl.value].chapters.length;

    if (currentChapter < totalChapters) {
      chapterEl.value = currentChapter + 1;
    } else if (currentBookIdx < bookKeys.length - 1) {
      currentBookIdx++;
      bookEl.value = bookKeys[currentBookIdx];
      loadChapters();
      chapterEl.value = 1;
    } else {
      return; // End of Bible
    }
    verseEl.value = "";
    loadBtn.click();
  };
}

homeBtn.onclick = () => {
  output.innerHTML = "";
  document.getElementById("prevChapterBtn").classList.add("hidden");
  document.getElementById("nextChapterBtn").classList.add("hidden");
  document.getElementById("ttsPlayBtn").classList.add("hidden");
  document.getElementById("notesToggleBtn").classList.add("hidden");
  document.getElementById("canvasModeBtn")?.classList.add("hidden");
  _allNotesOpen = false;
  document.getElementById("notesToggleBtn").classList.remove("ctrl-icon-active");
  stopTTS();
  resetAISections();
  showDashboard();
  // Keep layout-unset for dashboard view to allow scroll
  // document.querySelector(".layout").classList.add("layout-unset");
};

/* ---------- TTS BUTTON WIRING ---------- */
const ttsPlayBtn = document.getElementById("ttsPlayBtn");
const ttsPrevBtn = document.getElementById("ttsPrevBtn");
const ttsPauseBtn = document.getElementById("ttsPauseBtn");
const ttsNextBtn = document.getElementById("ttsNextBtn");
const ttsCloseBtn = document.getElementById("ttsCloseBtn");
if (ttsPlayBtn) ttsPlayBtn.onclick = playChapter;
if (ttsPrevBtn) ttsPrevBtn.onclick = ttsPrevVerse;
if (ttsPauseBtn) ttsPauseBtn.onclick = pauseResumeTTS;
if (ttsNextBtn) ttsNextBtn.onclick = ttsNextVerse;
if (ttsCloseBtn) ttsCloseBtn.onclick = stopTTS;

/* ---------- INIT ----------
 * fetchBibleData / loadBooks / showDashboard / updateControlStates were
 * moved to js/11-boot.js so they run AFTER every chunk has loaded.
 * showDashboard transitively calls stopTTS → ttsImmersiveClose (in 07);
 * triggering it here would hit a not-yet-defined function.
 */

(async () => {
  const legacy = localStorage.getItem("ai-legacy-migrated");
  if (legacy) return;

  Object.keys(localStorage)
    .filter((k) => k.startsWith("ai-"))
    .forEach(async (k) => {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (!data) return;
        await dbPut({
          id: k.replace("ai-", ""),
          ...data,
          migratedAt: Date.now(),
        });
      } catch {}
    });

  localStorage.setItem("ai-legacy-migrated", "1");
})();

if ("serviceWorker" in navigator) {
  const _registerSw = () => navigator.serviceWorker.register("sw.js");
  if (document.readyState === "complete") _registerSw();
  else window.addEventListener("load", _registerSw);
}

// ── Push Notification Subscription ───────────────────────────────────────────
function _subscribePush() {
  return new Promise(function(resolve) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("showNotification" in ServiceWorkerRegistration.prototype)) {
      alert("Push not supported. On iPhone, add to Home Screen first.");
      resolve(false);
      return;
    }

    var VAPID_KEY = "BLO1QhJelQXtbMWxhCtK8DbmQGKIJN04vU6s48J623f6xdfpJHFOW2lKaMeJMD7Tv5S-KmXpjYNA58exp0zTxBc";
    var SERVER = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

    navigator.serviceWorker.ready
      .then(function(registration) {
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_KEY
        });
      })
      .then(function(subscription) {
        var name = getUserName() || "Friend";
        var notes = "";
        try { notes = _getRecentNotesContext(); } catch(e) {}
        var passageId = localStorage.getItem("recentPassageId") || "";
        var lastPassage = "";
        if (passageId) {
          var parts = passageId.split("-");
          lastPassage = ((BIBLE_META[parts[0]] || {}).name || parts[0]) + " " + parts[1];
        }
        return fetch(SERVER + "/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON(), name: name, notes: notes, lastPassage: lastPassage })
        });
      })
      .then(function() {
        localStorage.setItem("pushEnabled", "true");
        resolve(true);
      })
      .catch(function(err) {
        alert("Subscribe failed: " + (err.message || err));
        resolve(false);
      });
  });
}

async function _unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch((window.PUSH_SERVER_URL || "https://gemini-proxy-668755364170.asia-southeast1.run.app") + "/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    localStorage.setItem("pushEnabled", "false");
  } catch (e) {
    console.error("Push unsubscribe failed:", e);
  }
}

function _getRecentNotesContext() {
  try {
    const parts = [];

    // Get notes from the past 3 days, sorted by recency
    const threeDays = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const all = _getAllNotes();
    const recent = all
      .filter(n => n.time && n.time > threeDays)
      .sort((a, b) => b.time - a.time)
      .slice(0, 8);

    // For each recent note, get its content
    recent.forEach(n => {
      if (n.type === "reflection" && n.QAs) {
        // Include actual Q&A pairs
        n.QAs.forEach(qa => {
          const answer = qa.raw?.split("\nA: ")?.[1]?.trim();
          if (answer && answer.length > 3) {
            parts.push(`[${n.title} reflection] ${answer.slice(0, 100)}`);
          }
        });
      } else if (n.type === "standalone") {
        const preview = n.preview || n.data?.body || "";
        if (preview.trim().length > 3) {
          parts.push(`[Note: ${n.title || "Untitled"}] ${preview.slice(0, 100)}`);
        }
      } else if (n.type === "verse" && n.items) {
        n.items.forEach(item => {
          if (item.text && item.text.length > 3) {
            parts.push(`[${n.title} note] ${item.text.slice(0, 80)}`);
          }
        });
      }
    });

    // Also grab raw reflection textarea values (most recent answers)
    const reflKeys = Object.keys(localStorage).filter(k => k.startsWith("reflection-"));
    reflKeys.forEach(k => {
      const val = localStorage.getItem(k);
      if (val && val.trim().length > 3 && parts.length < 10) {
        // Parse book/chapter from key: reflection-PSA-117-1-0
        const keyParts = k.replace("reflection-", "").split("-");
        const bookCode = keyParts[0];
        const ch = keyParts[1];
        const bookName = BIBLE_META[bookCode]?.name || bookCode;
        parts.push(`[${bookName} ${ch} reflection answer] ${val.trim().slice(0, 100)}`);
      }
    });

    return parts.slice(0, 8).join(" | ").slice(0, 500);
  } catch { return ""; }
}

// ── Push toggle handler (iOS-compatible) ─────────────────────────────────────
async function _handlePushToggle() {
  const btn = document.getElementById("pushBtn");
  const statusEl = document.getElementById("pushStatusText");
  if (!btn) return;

  const isOn = localStorage.getItem("pushEnabled") === "true";

  if (isOn) {
    // Turn OFF
    await _unsubscribePush();
    btn.textContent = "OFF";
    btn.classList.remove("active");
    if (statusEl) statusEl.textContent = "Get gentle nudges throughout the day";
    return;
  }

  // Turn ON — check everything step by step
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS && !isStandalone) {
    alert("To receive notifications, please add Devotion to your Home Screen first.\n\nSafari → Share → Add to Home Screen");
    return;
  }

  if (!("serviceWorker" in navigator)) {
    alert("Service workers are not supported on this browser.");
    return;
  }

  if (!("Notification" in window)) {
    alert("Notifications are not supported on this browser.");
    return;
  }

  if (!("PushManager" in window)) {
    alert("Push notifications are not available. Try closing and reopening the app.");
    return;
  }

  // Request permission — MUST be in direct user gesture
  let perm = Notification.permission;
  if (perm === "denied") {
    alert("Notifications are blocked.\n\nGo to Settings → Notifications → Devotion and turn them on.");
    return;
  }
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    alert("Notification permission was not granted (" + perm + ").");
    return;
  }

  // Subscribe
  try {
    const ok = await _subscribePush();
    if (ok) {
      btn.textContent = "ON";
      btn.classList.add("active");
      if (statusEl) statusEl.textContent = "Enabled — gentle nudges based on your reading";
    } else {
      alert("Failed to subscribe. Please try again.");
    }
  } catch (err) {
    alert("Subscribe error: " + (err.message || err));
  }
}

// ── One-time notification permission prompt ──────────────────────────────────
function _showNotifPrompt() {
  const overlay = document.createElement("div");
  overlay.className = "notif-prompt-overlay";
  overlay.innerHTML = `
    <div class="notif-prompt-card">
      <div class="notif-prompt-icon"><span class="material-icons">notifications_active</span></div>
      <div class="notif-prompt-title">Stay in the Word</div>
      <div class="notif-prompt-desc">Get gentle reminders throughout the day based on what you're reading and reflecting on.</div>
      <div class="notif-prompt-actions">
        <button class="notif-prompt-skip" id="notifPromptSkip">Not now</button>
        <button class="notif-prompt-accept" id="notifPromptAccept">Enable reminders</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));

  document.getElementById("notifPromptSkip").onclick = () => {
    localStorage.setItem("pushAsked", "true");
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 300);
  };

  document.getElementById("notifPromptAccept").onclick = async () => {
    localStorage.setItem("pushAsked", "true");
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 300);
    // Use the same handler as the button
    await _handlePushToggle();
  };
}

// Debounced push context sync — triggers after user activity
let _pushSyncTimer = null;
function _debouncedPushSync() {
  if (localStorage.getItem("pushEnabled") !== "true") return;
  clearTimeout(_pushSyncTimer);
  _pushSyncTimer = setTimeout(_syncPushContext, 10000); // 10s after last activity
}

// Re-sync notes context on each app open (if subscribed)
async function _syncPushContext() {
  if (localStorage.getItem("pushEnabled") !== "true") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const name = getUserName() || "Friend";
    const notes = _getRecentNotesContext();
    // Include last opened passage
    const passageId = localStorage.getItem("recentPassageId") || "";
    let lastPassage = "";
    if (passageId) {
      const [bookCode, ch] = passageId.split("-");
      const bookName = BIBLE_META[bookCode]?.name || bookCode;
      lastPassage = `${bookName} ${ch}`;
    }
    await fetch((window.PUSH_SERVER_URL || "https://gemini-proxy-668755364170.asia-southeast1.run.app") + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), name, notes, lastPassage }),
    });
  } catch {}
}
// Sync context after dashboard loads
setTimeout(_syncPushContext, 5000);

const initializeReflections = () => {
  const textAreas = document.querySelectorAll('textarea[id^="reflection-"]');

  if (textAreas.length > 0) {
    textAreas.forEach((area) => {
      // 1. Find the question text (the <li> right before the textarea)
      const questionText =
        area.previousElementSibling?.textContent || "Question";

      // 2. Load existing data from localStorage
      const savedData = localStorage.getItem(area.id);
      if (savedData) {
        // We only want to put the "Answer" part back into the textarea UI
        const answerOnly = savedData.split("A: ")[1] || "";
        area.value = answerOnly;
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 3. Save logic on input
      area.addEventListener("input", async () => {
        // Made async to await saveAIToStorage
        // Save in the specific format you requested (Q&A) to localStorage
        const formattedEntry = `Q: ${questionText}\nA: ${area.value}`;
        localStorage.setItem(area.id, formattedEntry);
        // Save timestamp for this devotion session so notes can group by correct day
        localStorage.setItem(`reflection-time-${devotionId()}`, String(Date.now()));
        checkIfHasTextAreaAnswers();
        _debouncedPushSync();

        // Also update IndexedDB cache for AI reflections, storing only the answer
        const devotionID = devotionId(); // Get current devotion ID
        const cachedAI = await loadAIFromStorage(); // Load existing AI data
        if (cachedAI) {
          if (!cachedAI.answers) {
            cachedAI.answers = {};
          }
          cachedAI.answers[area.id] = area.value; // Store only the answer
          await saveAIToStorage(cachedAI); // Save updated AI data
        }
      });
    });

    // Stop watching once initialized
    observer.disconnect();
  }
  checkIfHasTextAreaAnswers();
};

function checkIfHasTextAreaAnswers() {
  const nodes = document.querySelectorAll('textarea[id^="reflection-"]');
  const ids = Array.from(nodes).map((node) => node.id);

  const hasActualResponse = ids.some((id) => {
    const storedData = localStorage.getItem(id);

    if (!storedData) return false;

    const answerPart = storedData.split("A:")[1] || "";
    return answerPart.trim().length > 0;
  });

  if (hasActualResponse || hasCurrentComments) {
    copyNotesBtn.style.display = "block";
  } else {
    copyNotesBtn.style.display = "none";
  }
}

const observer = new MutationObserver(() => initializeReflections());
observer.observe(document.body, { childList: true, subtree: true });
initializeReflections();

document.addEventListener("keydown", (e) => {
  // 1. Check if the focus is in your specific comment textarea
  const textArea = e.target.closest(".comment-input textarea");
  if (!textArea) return;

  // 2. Check for the Enter key (Key Code 13)
  // We also check !e.shiftKey so users can still do a new line with Shift+Enter if they want
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // Prevents the actual new line from being added

    const addButton = textArea.parentElement.querySelector("button");
    if (addButton) {
      addButton.click();
    }
  }
});

document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]:not([href="#"])');
  if (!link) return;

  const id = link.getAttribute("href").slice(1);
  const target = document.getElementById(id);

  if (!target) return;

  e.preventDefault();

  smoothScrollTo(target, 700);

  // Highlight verse
  target.classList.remove("verse-highlight"); // reset if clicked again
  void target.offsetWidth; // force reflow
  target.classList.add("verse-highlight");
});

let isAutoScrolling = false; // Global flag
function smoothScrollTo(target, duration = 700) {
  const container = document.querySelector(".layout");
  if (!container || !target) return;

  isAutoScrolling = true;
  document.querySelector(".smart-header").classList.add("header-hidden");

  const startY = container.scrollTop;

  // Get the target's position relative to the container
  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;

  // targetTop - containerTop gives the distance from top of container to element
  // Then we add the current scroll position and subtract your 80px offset
  const targetY = targetTop - containerTop + startY - 80;

  const diff = targetY - startY;
  let startTime = null;

  // If the distance is basically zero, don't bother animating
  if (Math.abs(diff) < 2) return;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    container.scrollTop = startY + diff * easeInOutCubic(progress);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // UNLOCK: Delay slightly to ensure the scroll event finishes firing
      setTimeout(() => {
        isAutoScrolling = false;
      }, 50);
    }
  }

  requestAnimationFrame(step);
}

const header = document.querySelector(".smart-header");
const layout = document.querySelector(".layout");

// Use scrollTop for elements, not scrollY
let lastScrollY = layout.scrollTop;

layout.addEventListener("scroll", () => {
  if (isAutoScrolling) return;
  const currentScrollY = layout.scrollTop;

  if (currentScrollY > lastScrollY && currentScrollY > 50) {
    // Scrolling Down - Hide Header
    header.classList.add("header-hidden");
  } else {
    // Scrolling Up - Show Header
    header.classList.remove("header-hidden");
  }

  lastScrollY = currentScrollY;
});

// One-time migration: backfill reflection-time-* from IndexedDB updatedAt
(async () => {
  if (localStorage.getItem("refl-time-migrated")) return;
  const passageIds = new Set();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith("reflection-") || k.startsWith("reflection-time-")) continue;
    const parts = k.split("-");
    const passageId = parts.slice(1, 4).join("-");
    if (!localStorage.getItem(`reflection-time-${passageId}`)) passageIds.add(passageId);
  }
  for (const pid of passageIds) {
    const entry = await dbGet(pid);
    if (entry?.updatedAt) localStorage.setItem(`reflection-time-${pid}`, String(entry.updatedAt));
  }
  localStorage.setItem("refl-time-migrated", "1");
})();

// ── User name ─────────────────────────────────────────────────────────────────
function getUserName() { return localStorage.getItem("userName") || ""; }

function _showNamePrompt(onDone) {
  const screen = document.getElementById("namePromptScreen");
  const input  = document.getElementById("namePromptInput");
  const btn    = document.getElementById("namePromptSubmit");
  if (!screen) return;
  input.value = getUserName();
  screen.hidden = false;
  requestAnimationFrame(() => screen.classList.add("name-prompt-visible"));
  const submit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const prev = (getUserName() || "").trim().toLowerCase();
    const next = name.toLowerCase();
    localStorage.setItem("userName", name);
    // Crossing the sync-user boundary in any direction: firebase-sync.js's
    // activateSyncForUser handles both fresh activation AND swapping (it
    // tears down the previous mirror first). Deactivation is the explicit
    // off path. No page reload required for any transition.
    const SYNC_USERS = ["charlie", "karla"];
    const prevIsSync = SYNC_USERS.includes(prev);
    const nextIsSync = SYNC_USERS.includes(next);
    if (nextIsSync && next !== prev && typeof window.activateSyncForUser === "function") {
      window.activateSyncForUser(next).catch(err => console.error("Sync activation failed:", err));
    } else if (prevIsSync && !nextIsSync && typeof window.deactivateSync === "function") {
      window.deactivateSync().catch(err => console.error("Sync deactivation failed:", err));
    }
    screen.classList.remove("name-prompt-visible");
    screen.addEventListener("transitionend", () => { screen.hidden = true; }, { once: true });
    if (onDone) onDone(name);
  };
  btn.onclick = submit;
  input.onkeydown = e => { if (e.key === "Enter") submit(); };
  setTimeout(() => input.focus(), 300);
}

// ── Custom confirm dialog ──────────────────────────────────────────────────────
function _confirmDialog(message, onConfirm) {
  const dialog    = document.getElementById("confirmDialog");
  const msgEl     = document.getElementById("confirmMessage");
  const okBtn     = document.getElementById("confirmOk");
  const cancelBtn = document.getElementById("confirmCancel");
  if (!dialog) { if (confirm(message)) onConfirm(); return; }
  msgEl.textContent = message;
  dialog.hidden = false;
  requestAnimationFrame(() => dialog.classList.add("confirm-visible"));
  const close = () => {
    dialog.classList.remove("confirm-visible");
    dialog.addEventListener("transitionend", () => { dialog.hidden = true; }, { once: true });
  };
  okBtn.onclick = () => { close(); onConfirm(); };
  cancelBtn.onclick = close;
}

// script.js may be dynamically injected by firebase-sync.js AFTER the window
// `load` event has already fired (Charlie's pure-Firebase boot). In that case
// `addEventListener("load", ...)` would never trigger — so check readyState
// and run immediately if the page is already loaded.
//
// The readyState/addEventListener trigger was moved to js/11-boot.js so that
// initNotesApp (defined in 06) is already in scope by the time we fire.
const _onAppLoad = () => {
  const splash = document.getElementById("app-splash");

  setTimeout(() => {
    splash.classList.add("splash-hidden");
    if (!getUserName()) _showNamePrompt(() => renderDashboard());
  }, 2000);

  initNotesApp();
};

const aiTextareas = document.querySelectorAll("#aiReflection textarea");

aiTextareas.forEach((textarea) => {
  textarea.style.overflowY = "hidden";
  autoExpand(textarea); // Set initial height based on content
});

// 2. Event Listener restricted only to #aiReflection textareas
document.addEventListener(
  "input",
  function (event) {
    // Check if the element is a textarea AND is inside #aiReflection
    if (
      event.target.tagName.toLowerCase() === "textarea" &&
      event.target.closest("#aiReflection")
    ) {
      autoExpand(event.target);
    }
  },
  false,
);

function autoExpand(field) {
  // Reset field height so it can shrink
  field.style.height = "inherit";

  // Calculate the height
  const computed = window.getComputedStyle(field);
  const height =
    field.scrollHeight +
    parseInt(computed.getPropertyValue("border-top-width"), 10) +
    parseInt(computed.getPropertyValue("border-bottom-width"), 10);

  field.style.height = height + "px";
}

// recentPassageId restore was moved to js/11-boot.js: it must run AFTER
// loadBooks() has populated #book, otherwise bookEl.value won't take and
// BIBLE_META[bookEl.value] is undefined inside loadChapters().

