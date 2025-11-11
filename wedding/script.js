const APPSCRIPT_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbxnflodM9ZIkOPOHForoKVhFMofbQ1TxWXvFGIWCCe4-lhbDkOoJ4uXn5Z2eoWLWZ_1/exec";

/***** State & DOM refs *****/

let data = {};
let history = []; // breadcrumb / navigation history
let currentLevel = "category"; // category / subcategory / content / search
let currentKey = null; // depends on level
let currentFilter = "all";
let calendarDate = new Date(); // tracks which month is shown
const bubbleContainer = document.getElementById("bubbleContainer");
const contentDisplay = document.getElementById("contentDisplay");
const breadcrumbs = document.getElementById("breadcrumbs");
const totalDisplay = document.getElementById("totalDisplay");
const toast = document.getElementById("toast");
const loading = document.getElementById("loading");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const darkToggle = document.getElementById("darkToggle");
const filterChips = Array.from(document.querySelectorAll(".chip"));

/***** Utilities *****/
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateValue) {
  if (!dateValue) return "N/A";
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return dateValue;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysUntil(dateValue) {
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  const diff = (d - new Date()) / 86400000;
  return Math.ceil(diff);
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = type;
  toast.style.opacity = "1";
  toast.style.visibility = "visible";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.visibility = "hidden";
  }, 3000);
}

function showLoading(show = true) {
  if (show) loading.classList.add("show");
  else loading.classList.remove("show");
}

/***** Data fetching & refresh *****/
function fetchData() {
  // Use Apps Script server-side function getSheetData
  fetch(APPSCRIPT_WEBHOOK + "?action=getData",{ cache: 'no-store' })
    .then((res) => res.json())
    .then((resultData) => {
      {
        console.log(resultData);
        data = resultData;
        // If no data, show message
        if (!data || Object.keys(data).length === 0) {
          bubbleContainer.innerHTML =
            '<div style="padding:12px;color:var(--muted)">No data found in the sheet.</div>';
          totalDisplay.innerHTML = "No data";
          return;
        }
        // Update totals and render current view (preserve state/search)
        const grand = calculateGrandTotal(data);
        totalDisplay.innerHTML = `<div style="font-weight:700">Grand Total</div><div class="small">Estimated: <strong>₱${grand.totalEst.toLocaleString()}</strong> · Actual: <strong>₱${grand.totalAct.toLocaleString()}</strong></div>`;
        renderUpcomingDeadlines();
        renderCalendar();
        if (currentLevel === "search" && searchInput.value.trim()) {
          renderSearchResults(searchInput.value.trim());
        } else {
          renderBubbles(currentLevel, currentKey);
        }
      }
    });
}

// initial fetch + periodic
fetchData();
//setInterval(fetchData, 10000); // 10s

// 💍 Countdown Setup
const weddingDate = new Date("July 2, 2026 00:00:00").getTime();

function updateCountdown() {
  const now = new Date().getTime();
  const diff = weddingDate - now;

  if (diff <= 0) {
    document.getElementById("weddingCountdownTitle").textContent =
      "💍 It’s Wedding Day!";
    document.getElementById("countdownTimer").textContent =
      "🎉 Happily ever after starts now!";
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  document.getElementById(
    "weddingCountdownTitle"
  ).textContent = `💍 ${days} days until July 2, 2026`;

  document.getElementById(
    "countdownTimer"
  ).textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Start timer
updateCountdown();
setInterval(updateCountdown, 1000);

// Floating hearts effect
setInterval(() => {
  const heart = document.createElement("div");
  heart.className = "heart";
  heart.textContent = "💗";
  heart.style.left = Math.random() * 90 + "%";
  heart.style.animationDuration = 4 + Math.random() * 3 + "s";
  document.getElementById("countdownContainer").appendChild(heart);
  setTimeout(() => heart.remove(), 7000);
}, 2000);

/***** Totals helpers *****/
function calculateSubcategoryTotal(items) {
  let totalEst = 0,
    totalAct = 0;
  items.forEach((it) => {
    totalEst += it.estimated || 0;
    totalAct += it.actual || 0;
  });
  return { totalEst, totalAct };
}
function calculateCategoryTotal(catData) {
  let totalEst = 0,
    totalAct = 0;
  for (const sub in catData) {
    const t = calculateSubcategoryTotal(catData[sub]);
    totalEst += t.totalEst;
    totalAct += t.totalAct;
  }
  return { totalEst, totalAct };
}
function calculateGrandTotal(dataObj) {
  let e = 0,
    a = 0;
  for (const cat in dataObj) {
    const t = calculateCategoryTotal(dataObj[cat]);
    e += t.totalEst;
    a += t.totalAct;
  }
  return { totalEst: e, totalAct: a };
}

/***** Rendering: bubbles / content / breadcrumbs *****/
function renderBubbles(level = "category", key = null) {
  try {
    bubbleContainer.innerHTML = "";
    if (level !== "content") contentDisplay.style.display = "none";
    renderBreadcrumbs();

    if (level === "category") {
      for (const category in data) {
        const totals = calculateCategoryTotal(data[category]);
        const progress =
          totals.totalEst > 0 ? (totals.totalAct / totals.totalEst) * 100 : 0;
        const html = `<span class="title">${escapeHtml(
          category
        )}</span><span class="amount">Est: ₱${totals.totalEst.toLocaleString()}<br>Act: ₱${totals.totalAct.toLocaleString()}</span>`;
        const bubble = createBubble(html, "category", "", progress);
        bubble.onclick = () => {
          contentDisplay.style.display = "none";
          bubblePop(bubble);
          currentLevel = "subcategory";
          currentKey = category;
          renderBubbles("subcategory", category);
        };
        bubbleContainer.appendChild(bubble);
      }
    } else if (level === "subcategory") {
      const subcategories = data[key] || {};
      for (const sub in subcategories) {
        const totals = calculateSubcategoryTotal(subcategories[sub]);
        const progress =
          totals.totalEst > 0 ? (totals.totalAct / totals.totalEst) * 100 : 0;
        const html = `<span class="title">${escapeHtml(
          sub
        )}</span><span class="amount">Est: ₱${totals.totalEst.toLocaleString()}<br>Act: ₱${totals.totalAct.toLocaleString()}</span>`;
        const bubble = createBubble(html, "subcategory", "", progress);
        bubble.onclick = () => {
          contentDisplay.style.display = "none";
          bubblePop(bubble);
          currentLevel = "content";
          currentKey = { category: key, subcategory: sub };
          renderBubbles("content", { category: key, subcategory: sub });
        };
        bubbleContainer.appendChild(bubble);
      }
    } else if (level === "content") {
      const { category, subcategory } = key || {};
      const contents = (data[category] && data[category][subcategory]) || [];
      contents.forEach((item) => {
        if (!passesFilter(item)) return;
        const progress =
          item.estimated > 0 ? (item.actual / item.estimated) * 100 : 100;
        const html = `<span class="title">${escapeHtml(
          item.task
        )}</span><span class="subtitle">${escapeHtml(
          item.notes || ""
        )}</span><span class="amount">Est: ₱${(
          item.estimated || 0
        ).toLocaleString()}<br>Act: ₱${(
          item.actual || 0
        ).toLocaleString()}</span><br><span class="small">DEADLINE: ${formatDate(
          item.deadline
        )}</span>`;
        const bubble = createBubble(
          html,
          "content",
          item.responsible || "",
          progress
        );
        bubble.onclick = () => {
          bubblePop(bubble);
          contentDisplay.style.display = "block";
          currentLevel = "content";
          currentKey = { category, subcategory };
          contentDisplay.innerHTML = renderTaskDetails(
            category,
            subcategory,
            item
          );
        };
        bubbleContainer.appendChild(bubble);
      });
    }
  } catch (e) {
    console.error("renderBubbles error", e);
    alert("Error rendering bubbles:\n" + (e.message || e));
  }
}

// Search (flattened)
function renderSearchResults(query) {
  bubbleContainer.innerHTML = "";
  contentDisplay.style.display = "none";
  renderBreadcrumbs({ search: query });
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const matches = [];
  for (const cat in data) {
    for (const sub in data[cat]) {
      const items = data[cat][sub];
      for (const it of items) {
        if (
          (it.task || "").toString().toLowerCase().includes(q) ||
          (it.notes || "").toString().toLowerCase().includes(q) ||
          (it.responsible || "").toString().toLowerCase().includes(q)
        ) {
          matches.push({ category: cat, subcategory: sub, item: it });
        }
      }
    }
  }

  if (matches.length === 0) {
    bubbleContainer.innerHTML = `<div style="padding:12px;color:var(--muted)">No results found for "${escapeHtml(
      query
    )}"</div>`;
    return;
  }

  matches.forEach((match) => {
    const it = match.item;
    if (!passesFilter(it)) return;
    const progress = it.estimated > 0 ? (it.actual / it.estimated) * 100 : 100;
    const html = `<span class="title">${escapeHtml(
      it.task
    )}</span><span class="subtitle">${escapeHtml(
      match.category
    )} › ${escapeHtml(match.subcategory)}</span><span class="amount">Est: ₱${(
      it.estimated || 0
    ).toLocaleString()}<br>Act: ₱${(it.actual || 0).toLocaleString()}</span>`;
    const bubble = createBubble(
      html,
      "content",
      it.responsible || "",
      progress
    );
    bubble.onclick = () => {
      bubblePop(bubble);
      contentDisplay.style.display = "block";
      history.push({
        level: "search",
        name: query,
        context: {
          category: match.category,
          subcategory: match.subcategory,
          task: it.task,
        },
      });
      currentLevel = "content";
      currentKey = { category: match.category, subcategory: match.subcategory };
      contentDisplay.innerHTML = renderTaskDetails(
        match.category,
        match.subcategory,
        it
      );
    };
    bubbleContainer.appendChild(bubble);
  });
}

// Create bubble element (without conic border)
function createBubble(
  htmlContent,
  type = "category",
  responsible = "",
  progress = 0
) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  bubble.innerHTML = `<div class="contentInner">${htmlContent}</div>`;
  // add progress label
  const pl = document.createElement("div");
  pl.className = "progressLabel";
  pl.textContent = `${Math.round(Math.min(Math.max(progress, 0), 100))}%`;
  bubble.appendChild(pl);

  // add indicators and badges
  if (type === "content") {
    const lower = (responsible || "").toLowerCase();
    const hasKarla = lower.includes("karla");
    const hasC = lower.includes("c") || lower.includes("dudu") || lower === "c"; // heuristic
    if (hasKarla) {
      const ind = document.createElement("div");
      ind.className = "indicator karla";
      ind.textContent = "K";
      bubble.appendChild(ind);
    }
    if (hasC) {
      const ind2 = document.createElement("div");
      ind2.className = "indicator c";
      ind2.textContent = "C";
      ind2.style.left = hasKarla ? "40px" : "10px";
      bubble.appendChild(ind2);
    }
    // deadline badge (we'll add via separate function when rendering content bubbles)
    // quick-edit container is appended in the addQuickEdit helper
    addDeadlineBadgeToBubble(bubble, type, htmlContent);
    addQuickEdit(bubble, type, responsible);
  }
  return bubble;
}

// bubble animation feedback
function bubblePop(bubble) {
  bubble.style.transform = "scale(1.06)";
  setTimeout(() => (bubble.style.transform = ""), 180);
}

/***** Deadline badge on bubble *****/
function addDeadlineBadgeToBubble(bubble, type, contentHtmlOrItem) {
  // We cannot parse deadline from htmlContent; the addDeadlineBadgeWhenRenderingContent will do it separately.
  // Keep this function for legacy compatibility (no-op here).
}

// We'll add deadline badge where we have item.deadline (in content rendering)
function appendDeadlineBadge(bubbleEl, deadlineValue) {
  if (!deadlineValue) return;
  const d = new Date(deadlineValue);
  if (isNaN(d.getTime())) return;
  const days = (d - new Date()) / 86400000;
  const badge = document.createElement("div");
  badge.className = "deadline-badge";
  if (days <= 3) badge.classList.add("deadline-urgent");
  else if (days <= 7) badge.classList.add("deadline-soon");
  else badge.classList.add("deadline-normal");
  badge.textContent = days <= 0 ? "DUE" : `${Math.ceil(days)}d`;
  bubbleEl.appendChild(badge);
}

/***** Render details panel for a task (used when clicking the bubble) *****/
function renderTaskDetails(category, subcategory, item) {
  return `
      <h2 style="margin-top:0">${escapeHtml(item.task)}</h2>
      <p><strong>Phase:</strong> ${escapeHtml(
        category
      )} · <strong>Section:</strong> ${escapeHtml(subcategory)}</p>
      <p><strong>Duration:</strong> ${escapeHtml(item.duration || "N/A")}</p>
      <p><strong>Deadline:</strong> ${formatDate(item.deadline)}</p>
      <p><strong>Responsible:</strong> ${escapeHtml(
        item.responsible || "N/A"
      )}</p>
      <p><strong>Status:</strong> <select id="statusSelect">
        <option value="Not Started" ${
          item.status === "Not Started" ? "selected" : ""
        }>Not Started</option>
        <option value="In Progress" ${
          item.status === "In Progress" ? "selected" : ""
        }>In Progress</option>
        <option value="Done" ${
          item.status === "Done" ? "selected" : ""
        }>Done</option>
      </select></p>
      <p><strong>Notes:</strong> ${escapeHtml(item.notes || "")}</p>
      <p><strong>Estimated Cost:</strong> ₱<input type="number" id="estimatedInput" value="${
        item.estimated || 0
      }" min="0" step="0.01"></p>
      <p><strong>Actual Cost:</strong> ₱<input type="number" id="actualInput" value="${
        item.actual || 0
      }" min="0" step="0.01"></p>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button onclick="saveChanges('${category.replace(
          /'/g,
          "\\'"
        )}', '${subcategory.replace(/'/g, "\\'")}', '${item.task.replace(
    /'/g,
    "\\'"
  )}')">Save</button>
      </div>
    `;
}

/***** Save changes (calls server updateItem) *****/
window.saveChanges = function (category, subcategory, task) {
  const statusEl = document.getElementById("statusSelect");
  const estimatedEl = document.getElementById("estimatedInput");
  const actualEl = document.getElementById("actualInput");

  const status = statusEl ? statusEl.value : "Not Started";
  const estimated = estimatedEl ? estimatedEl.value : "0";
  const actual = actualEl ? actualEl.value : "0";

  // basic validation
  if (isNaN(Number(estimated)) || isNaN(Number(actual))) {
    showToast("Estimated and Actual must be numbers", "error");
    return;
  }

  showLoading(true);
  fetch(APPSCRIPT_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateItem",
      category,
      subcategory,
      task,
      status,
      estimated,
      actual,
    }),
  });
  setTimeout(() => {
    showLoading(false);
    showToast("Update sent!", "success");
    fetchData()
  }, 2000);
};

/***** Filter chips logic *****/
function passesFilter(item) {
  const lower = (item.responsible || "").toLowerCase();
  if (currentFilter === "karla") return lower.includes("karla");
  if (currentFilter === "c") return lower.includes("c"); // heuristic—matches names with 'c'
  if (currentFilter === "progress") return item.status === "In Progress";
  if (currentFilter === "done") return item.status === "Done";
  return true;
}
// set chip handlers
filterChips.forEach((ch) => {
  ch.addEventListener("click", () => {
    filterChips.forEach((x) => x.classList.remove("active"));
    ch.classList.add("active");
    currentFilter = ch.dataset.filter || "all";
    // re-render current view
    if (currentLevel === "search" && searchInput.value.trim())
      renderSearchResults(searchInput.value.trim());
    else renderBubbles(currentLevel, currentKey);
  });
});

/***** Search (debounced) *****/
const doSearchDebounced = debounce(() => {
  const q = searchInput.value.trim();
  if (!q) {
    currentLevel = "category";
    currentKey = null;
    renderBubbles("category", null);
  } else {
    currentLevel = "search";
    renderSearchResults(q);
  }
}, 260);
searchInput.addEventListener("input", doSearchDebounced);
clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  doSearchDebounced();
});

/***** Breadcrumbs *****/
function renderBreadcrumbs(searchContext) {
  breadcrumbs.innerHTML = "";
  const homeSpan = document.createElement("span");
  homeSpan.innerHTML = "🏠 Home";
  homeSpan.style.cursor = "pointer";
  homeSpan.onclick = () => {
    contentDisplay.style.display = "none";
    history = [];
    currentLevel = "category";
    currentKey = null;
    searchInput.value = "";
    renderBubbles("category", null);
  };
  breadcrumbs.appendChild(homeSpan);

  if (searchContext && searchContext.search) {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "›";
    breadcrumbs.appendChild(sep);
    const s = document.createElement("span");
    s.textContent = `Search: "${searchContext.search}"`;
    s.onclick = () => renderSearchResults(searchContext.search);
    breadcrumbs.appendChild(s);
    return;
  }

  if (history.length === 0) return;
  history.forEach((item, index) => {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "›";
    breadcrumbs.appendChild(sep);
    const span = document.createElement("span");
    span.textContent = item.name;
    span.onclick = () => {
      contentDisplay.style.display = "none";
      history = history.slice(0, index + 1);
      if (item.level === "category") {
        currentLevel = "subcategory";
        currentKey = item.name;
        renderBubbles("subcategory", item.name);
      } else if (item.level === "subcategory") {
        currentLevel = "content";
        currentKey = { category: item.parent, subcategory: item.name };
        renderBubbles("content", currentKey);
      } else if (item.level === "content") {
        currentLevel = "content";
        currentKey = item.parent;
        renderBubbles("content", item.parent);
        const contents =
          data[item.parent.category][item.parent.subcategory] || [];
        const contentItem = contents.find((c) => c.task === item.name);
        if (contentItem) {
          contentDisplay.style.display = "block";
          contentDisplay.innerHTML = renderTaskDetails(
            item.parent.category,
            item.parent.subcategory,
            contentItem
          );
        }
      } else if (item.level === "search") {
        currentLevel = "search";
        renderSearchResults(item.name);
      }
    };
    breadcrumbs.appendChild(span);
  });
}

/***** Render content bubbles with quick-edit & deadline badge inline *****/
// We override the earlier createBubble behavior for content-level items to attach quick-edit and deadline badge with correct data.
function createContentBubble(item, category, subcategory) {
  const progress =
    item.estimated > 0 ? (item.actual / item.estimated) * 100 : 100;
  const html = `<span class="title">${escapeHtml(
    item.task
  )}</span><span class="subtitle">${escapeHtml(
    item.notes || ""
  )}</span><span class="amount">Est: ₱${(
    item.estimated || 0
  ).toLocaleString()}<br>Act: ₱${(item.actual || 0).toLocaleString()}</span>`;
  const bubble = document.createElement("div");
  bubble.className = "bubble content";
  bubble.innerHTML = `<div class="contentInner">${html}</div>`;
  // progress label
  const pl = document.createElement("div");
  pl.className = "progressLabel";
  pl.textContent = `${Math.round(Math.min(Math.max(progress, 0), 100))}%`;
  bubble.appendChild(pl);
  // indicators
  const lower = (item.responsible || "").toLowerCase();
  if (lower.includes("karla")) {
    const ind = document.createElement("div");
    ind.className = "indicator karla";
    ind.textContent = "K";
    bubble.appendChild(ind);
  }
  if (lower.includes("c") || lower.includes("dudu")) {
    const ind2 = document.createElement("div");
    ind2.className = "indicator c";
    ind2.textContent = "C";
    ind2.style.left = lower.includes("karla") ? "40px" : "10px";
    bubble.appendChild(ind2);
  }
  // deadline badge
  appendDeadlineBadge(bubble, item.deadline);

  // click to open details
  bubble.addEventListener("click", () => {
    currentLevel = "content";
    currentKey = { category, subcategory };
    contentDisplay.style.display = "block";
    contentDisplay.innerHTML = renderTaskDetails(category, subcategory, item);
    bubblePop(bubble);
  });

  return bubble;
}

/***** Overwrite renderBubbles content-level call to use createContentBubble for correct badges & quick-edit *****/
// We'll wrap original renderBubbles to replace content creation with createContentBubble
const originalRenderBubbles = renderBubbles;
renderBubbles = function (level = "category", key = null) {
  // Re-implement to use createContentBubble for content
  try {
    bubbleContainer.innerHTML = "";
    if (level !== "content") contentDisplay.style.display = "none";
    renderBreadcrumbs();

    if (level === "category") {
      for (const category in data) {
        const totals = calculateCategoryTotal(data[category]);
        const progress =
          totals.totalEst > 0 ? (totals.totalAct / totals.totalEst) * 100 : 0;
        const html = `<span class="title">${escapeHtml(
          category
        )}</span><span class="amount">Est: ₱${totals.totalEst.toLocaleString()}<br>Act: ₱${totals.totalAct.toLocaleString()}</span>`;
        const bubble = createBubble(html, "category", "", progress);
        bubble.onclick = () => {
          contentDisplay.style.display = "none";
          bubblePop(bubble);
          history.push({ level: "category", name: category });
          currentLevel = "subcategory";
          currentKey = category;
          renderBubbles("subcategory", category);
        };
        bubbleContainer.appendChild(bubble);
      }
    } else if (level === "subcategory") {
      const subcategories = data[key] || {};
      for (const sub in subcategories) {
        const totals = calculateSubcategoryTotal(subcategories[sub]);
        const progress =
          totals.totalEst > 0 ? (totals.totalAct / totals.totalEst) * 100 : 0;
        const html = `<span class="title">${escapeHtml(
          sub
        )}</span><span class="amount">Est: ₱${totals.totalEst.toLocaleString()}<br>Act: ₱${totals.totalAct.toLocaleString()}</span>`;
        const bubble = createBubble(html, "subcategory", "", progress);
        bubble.onclick = () => {
          contentDisplay.style.display = "none";
          bubblePop(bubble);
          history.push({ level: "subcategory", name: sub, parent: key });
          currentLevel = "content";
          currentKey = { category: key, subcategory: sub };
          renderBubbles("content", { category: key, subcategory: sub });
        };
        bubbleContainer.appendChild(bubble);
      }
    } else if (level === "content") {
      const { category, subcategory } = key || {};
      const contents = (data[category] && data[category][subcategory]) || [];
      contents.forEach((item) => {
        if (!passesFilter(item)) return;
        const bubble = createContentBubble(item, category, subcategory);
        bubbleContainer.appendChild(bubble);
      });
    }
  } catch (e) {
    console.error("renderBubbles error", e);
    alert("Error rendering bubbles:\n" + (e.message || e));
  }
};

/***** Search function uses createContentBubble for matches *****/
renderSearchResults = function (query) {
  bubbleContainer.innerHTML = "";
  contentDisplay.style.display = "none";
  renderBreadcrumbs({ search: query });
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const matches = [];
  for (const cat in data) {
    for (const sub in data[cat]) {
      for (const it of data[cat][sub]) {
        if (
          (it.task || "").toString().toLowerCase().includes(q) ||
          (it.notes || "").toString().toLowerCase().includes(q) ||
          (it.responsible || "").toString().toLowerCase().includes(q)
        ) {
          matches.push({ category: cat, subcategory: sub, item: it });
        }
      }
    }
  }
  if (matches.length === 0) {
    bubbleContainer.innerHTML = `<div style="padding:12px;color:var(--muted)">No results found for "${escapeHtml(
      query
    )}"</div>`;
    return;
  }
  matches.forEach((m) => {
    if (!passesFilter(m.item)) return;
    const bubble = createContentBubble(m.item, m.category, m.subcategory);
    bubbleContainer.appendChild(bubble);
  });
};

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthTitle = document.getElementById("calendarMonth");
  if (!grid) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  monthTitle.textContent = calendarDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  grid.innerHTML = "";

  // Collect deadlines in this month
  const tasks = [];
  for (const cat in data) {
    for (const sub in data[cat]) {
      for (const item of data[cat][sub]) {
        if (!item.deadline) continue;
        const d = new Date(item.deadline);
        if (d.getMonth() === month && d.getFullYear() === year)
          tasks.push({ ...item, date: d, category: cat, subcategory: sub });
      }
    }
  }

  // Render blank cells before start
  for (let i = 0; i < startDay; i++) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    grid.appendChild(cell);
  }

  // Render each day
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    cell.innerHTML = `<div class="date">${day}</div>`;
    if (
      day === new Date().getDate() &&
      month === new Date().getMonth() &&
      year === new Date().getFullYear()
    ) {
      cell.classList.add("today");
    }

    const todayTasks = tasks.filter((t) => t.date.getDate() === day);
    todayTasks.forEach((t) => {
      const dot = document.createElement("div");
      dot.className = "deadline-dot";
      dot.textContent = t.task.slice(0, 10) + (t.task.length > 10 ? "…" : "");
      dot.title = `${t.task}\n${t.category} › ${t.subcategory}`;
      cell.appendChild(dot);
      if (t.status === "Done") dot.style.background = "#4caf50";
      else if (t.status === "In Progress") dot.style.background = "#f59e0b";
      else dot.style.background = "#9ca3af";
    });

    grid.appendChild(cell);
  }
}

document.getElementById("prevMonth").addEventListener("click", () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
});

// 📆 View more (modal)
document.getElementById("viewAllDeadlines").addEventListener("click", (e) => {
  e.preventDefault();
  renderDeadlineModal();
});

function renderDeadlineModal() {
  const modal = document.getElementById("deadlineModal");
  const list = document.getElementById("deadlineList");
  const allTasks = [];

  for (const cat in data) {
    for (const sub in data[cat]) {
      for (const item of data[cat][sub]) {
        if (!item.deadline) continue;
        const d = new Date(item.deadline);
        if (!isNaN(d))
          allTasks.push({
            ...item,
            deadline: d,
            category: cat,
            subcategory: sub,
          });
      }
    }
  }

  allTasks.sort((a, b) => a.deadline - b.deadline);

  list.innerHTML = allTasks
    .map((t) => {
      const daysLeft = Math.ceil((t.deadline - new Date()) / 86400000);
      const due =
        daysLeft <= 0
          ? `<span style="color:var(--danger)">OVERDUE</span>`
          : `<span>${daysLeft} d</span>`;
      return `<div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:4px 0;">
      <strong>${t.task}</strong> (${t.category} › ${t.subcategory})<br>
      <small>${t.deadline.toLocaleDateString()} – ${due}</small>
    </div>`;
    })
    .join("");

  modal.style.display = "flex";
}

// Close modal
document.querySelector(".modal .close").addEventListener("click", () => {
  document.getElementById("deadlineModal").style.display = "none";
});
window.addEventListener("click", (e) => {
  if (e.target.id === "deadlineModal")
    document.getElementById("deadlineModal").style.display = "none";
});
// 📆 View more (modal)
document.getElementById("viewAllDeadlines").addEventListener("click", (e) => {
  e.preventDefault();
  renderDeadlineModal();
});

function renderDeadlineModal() {
  const modal = document.getElementById("deadlineModal");
  const list = document.getElementById("deadlineList");
  const allTasks = [];

  for (const cat in data) {
    for (const sub in data[cat]) {
      for (const item of data[cat][sub]) {
        if (!item.deadline) continue;
        const d = new Date(item.deadline);
        if (!isNaN(d))
          allTasks.push({
            ...item,
            deadline: d,
            category: cat,
            subcategory: sub,
          });
      }
    }
  }

  allTasks.sort((a, b) => a.deadline - b.deadline);

  list.innerHTML = allTasks
    .map((t) => {
      const daysLeft = Math.ceil((t.deadline - new Date()) / 86400000);
      const due =
        daysLeft <= 0
          ? `<span style="color:var(--danger)">OVERDUE</span>`
          : `<span>${daysLeft} d</span>`;
      return `<div style="border-bottom:1px solid rgba(0,0,0,0.08);padding:4px 0;">
        <strong>${t.task}</strong> (${t.category} › ${t.subcategory})<br>
        <small>${t.deadline.toLocaleDateString()} – ${due}</small>
      </div>`;
    })
    .join("");

  modal.style.display = "flex";
}

// Close modal
document.querySelector(".modal .close").addEventListener("click", () => {
  document.getElementById("deadlineModal").style.display = "none";
});
window.addEventListener("click", (e) => {
  if (e.target.id === "deadlineModal")
    document.getElementById("deadlineModal").style.display = "none";
});

function renderUpcomingDeadlines() {
  const box = document.getElementById("upcomingDeadlines");
  if (!data || Object.keys(data).length === 0) {
    box.innerHTML = "";
    return;
  }

  const list = getUpcomingDeadlines(data, 5);
  if (list.length === 0) {
    box.innerHTML =
      '<p style="font-size:13px;color:var(--muted);margin:0;">No upcoming deadlines.</p>';
    return;
  }

  const html = list
    .map((item) => {
      const due =
        item.daysLeft <= 0
          ? `<span class="days overdue">OVERDUE</span>`
          : `<span class="days">${item.daysLeft}d | ${formatDate(
              item.deadline
            )}</span>`;
      return `
        <div class="upcoming-item">
          <div>
            <strong>${escapeHtml(item.task)}</strong><br>
            <span class="small">${escapeHtml(item.category)} › ${escapeHtml(
        item.subcategory
      )}</span>
          </div>
          <div>
            <span class="small">${item.responsible}</span><br>
            ${due}
          </div>
        </div>`;
    })
    .join("");

  box.innerHTML = `<h3 style="margin-top:0;">📅 Upcoming Deadlines</h3>${html}`;
}

/***** Add deadline badge helper used by createContentBubble *****/
function appendDeadlineBadge(bubbleEl, deadlineValue) {
  if (!deadlineValue) return;
  const d = new Date(deadlineValue);
  if (isNaN(d.getTime())) return;
  const daysLeft = (d - new Date()) / 86400000;
  const badge = document.createElement("div");
  badge.className = "deadline-badge";
  if (daysLeft <= 3) badge.classList.add("deadline-urgent");
  else if (daysLeft <= 7) badge.classList.add("deadline-soon");
  else badge.classList.add("deadline-normal");
  badge.textContent = daysLeft <= 0 ? "DUE" : `${Math.ceil(daysLeft)}d`;
  bubbleEl.appendChild(badge);
}

function getUpcomingDeadlines(data, limit = 5) {
  const tasks = [];
  const now = new Date();

  for (const cat in data) {
    for (const sub in data[cat]) {
      for (const item of data[cat][sub]) {
        if (!item.deadline) continue;
        const d = new Date(item.deadline);
        if (isNaN(d)) continue;
        const daysLeft = Math.ceil((d - now) / 86400000);
        tasks.push({
          category: cat,
          subcategory: sub,
          task: item.task,
          responsible: item.responsible || "",
          deadline: d,
          daysLeft,
        });
      }
    }
  }

  // Sort by soonest date
  tasks.sort((a, b) => a.deadline - b.deadline);
  return tasks.slice(0, limit);
}

// 💕 Add Task Modal Logic (standalone)
const addBtn = document.getElementById("addTaskBtn");
const addModal = document.getElementById("addTaskModalWrapper");
const closeAdd = document.querySelector(".close-add");
const addTaskForm = document.getElementById("addTaskForm");

addBtn.addEventListener("click", () => (addModal.style.display = "flex"));
closeAdd.addEventListener("click", () => (addModal.style.display = "none"));
window.addEventListener("click", (e) => {
  if (e.target === addModal) addModal.style.display = "none";
});

addTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const newTask = {
    category: document.getElementById("newCategory").value.trim(),
    subcategory: document.getElementById("newSubcategory").value.trim(),
    task: document.getElementById("newTask").value.trim(),
    responsible: document.getElementById("newResponsible").value.trim(),
    deadline: document.getElementById("newDeadline").value,
    estimated: parseFloat(document.getElementById("newEstimated").value) || 0,
    notes: document.getElementById("newNotes").value.trim(),
  };

  loading.classList.add("show");
  fetch(APPSCRIPT_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "addNewTask",
      taskObj: newTask,
    }),
  });
  setTimeout(() => {
    loading.classList.remove("show");
    showToast("Task added successfully!", "success");
    addModal.style.display = "none";
    addTaskForm.reset();
    fetchData();
  }, 1200);
});

/***** Expose small debug helpers (optional) *****/
window.__wb = { fetchData, renderBubbles, renderSearchResults };

/***** Dark mode init *****/
if (localStorage.getItem("wb_dark") === "1") {
  document.body.classList.add("dark");
  darkToggle.textContent = "☀️";
}
darkToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  darkToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem("wb_dark", isDark ? "1" : "0");
});
