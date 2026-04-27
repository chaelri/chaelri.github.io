/* ═══════════════════════════════════════════════════════════════════════════
   SOAP — Application & Prayer (A & P)
   ═══════════════════════════════════════════════════════════════════════════ */

const SOAP_CATEGORIES = ["God", "Family", "Work/School", "Ministry", "Others"];

/* ── Respond Screen (full-screen overlay) ── */
let _soapScreenType = "application";
let _soapScreenPassage = "";
let _soapScreenAiText = "";
let _soapScreenCat = null;

function openSoapScreen(passage, aiText) {
  _soapScreenPassage = passage;
  _soapScreenAiText = aiText || "";
  _soapScreenType = "application";
  _soapScreenCat = null;

  const screen = document.getElementById("soapScreen");
  const title = document.getElementById("soapScreenTitle");
  title.textContent = passage;
  screen.hidden = false;
  requestAnimationFrame(() => screen.classList.add("soap-screen-open"));

  _renderSoapScreenContent();

  document.getElementById("soapScreenBack").onclick = closeSoapScreen;
}

function closeSoapScreen() {
  const screen = document.getElementById("soapScreen");
  screen.classList.remove("soap-screen-open");
  const onEnd = () => {
    screen.hidden = true;
    screen.removeEventListener("transitionend", onEnd);
    // Refresh dashboard if visible
    if (typeof renderDashboard === "function") {
      const homeBtn = document.getElementById("homeBtn");
      if (homeBtn && homeBtn.style.display === "none") renderDashboard();
    }
  };
  screen.addEventListener("transitionend", onEnd);
}

function _renderSoapScreenContent() {
  const body = document.getElementById("soapScreenBody");
  const ref = document.getElementById("soapScreenRef");
  const type = _soapScreenType;
  const isApp = type === "application";
  const placeholder = isApp
    ? "How will you apply this to your life today?"
    : "Write your prayer to God here...";
  const entries = _getSoapEntries(type).filter(e => e.passage === _soapScreenPassage);

  // Reference card
  ref.innerHTML = _soapScreenAiText ? `
    <button class="soap-ref-toggle" id="soapRefToggle">
      <span class="material-icons">chevron_right</span>
      View study notes
    </button>
    <div class="soap-ref-content" id="soapRefContent">${mdToHTML(_soapScreenAiText)}</div>
  ` : '';

  if (_soapScreenAiText) {
    const toggle = document.getElementById("soapRefToggle");
    const content = document.getElementById("soapRefContent");
    toggle.onclick = () => {
      toggle.classList.toggle("open");
      content.classList.toggle("open");
    };
  }

  // Body
  body.innerHTML = `
    <div class="soap-type-switch">
      <div class="soap-type-switch-bg at-${type}"></div>
      <button class="soap-type-switch-opt ${isApp ? 'active-application' : ''}" data-stype="application">Application</button>
      <button class="soap-type-switch-opt ${!isApp ? 'active-prayer' : ''}" data-stype="prayer">Prayer</button>
    </div>

    <div class="soap-cat-row">
      ${SOAP_CATEGORIES.map(c => `<button class="soap-cat-pill${_soapScreenCat === c ? ' active-' + type : ''}" data-cat="${_escHtml(c)}">${_escHtml(c)}</button>`).join("")}
    </div>

    <div class="soap-write-area" ${!_soapScreenCat ? 'hidden' : ''}>
      <textarea class="soap-write-textarea" id="soapWriteTA" placeholder="${placeholder}" rows="1"></textarea>
      <button class="soap-write-save save-${type}" id="soapWriteSave">Save</button>
    </div>

    ${entries.length ? `<div class="soap-entries-label">Your ${isApp ? 'applications' : 'prayers'}</div>` : ''}
    <div class="soap-entry-list" id="soapEntryList">
      ${entries.map(e => _soapScreenEntryHTML(e, type)).join("")}
    </div>
  `;

  // Bind type switch (animate in-place, no full re-render)
  body.querySelectorAll(".soap-type-switch-opt").forEach(opt => {
    opt.onclick = () => {
      const newType = opt.dataset.stype;
      if (newType === _soapScreenType) return;
      _soapScreenType = newType;
      _soapScreenCat = null;
      const isApp = newType === "application";

      // Slide the bg indicator
      const bg = body.querySelector(".soap-type-switch-bg");
      if (bg) {
        bg.className = `soap-type-switch-bg at-${newType}`;
      }

      // Update opt text colors
      body.querySelectorAll(".soap-type-switch-opt").forEach(o => {
        o.className = "soap-type-switch-opt" + (o.dataset.stype === newType ? ` active-${newType}` : "");
      });

      // Reset category pills
      body.querySelectorAll(".soap-cat-pill").forEach(p => {
        p.className = "soap-cat-pill";
      });

      // Update placeholder + save button
      const ta = body.querySelector(".soap-write-textarea");
      if (ta) ta.placeholder = isApp ? "How will you apply this to your life today?" : "Write your prayer to God here...";
      const saveBtn = body.querySelector(".soap-write-save");
      if (saveBtn) saveBtn.className = `soap-write-save save-${newType}`;

      // Hide write area (no category selected)
      const writeArea = body.querySelector(".soap-write-area");
      if (writeArea) writeArea.hidden = true;

      // Re-render just the entry list
      const entries = _getSoapEntries(newType).filter(e => e.passage === _soapScreenPassage);
      const label = body.querySelector(".soap-entries-label");
      const list = document.getElementById("soapEntryList");
      if (label) label.textContent = `Your ${isApp ? 'applications' : 'prayers'}`;
      if (label) label.style.display = entries.length ? '' : 'none';
      if (list) {
        list.innerHTML = entries.map(e => _soapScreenEntryHTML(e, newType)).join("");
        _bindSoapScreenDeleteButtons();
      }
    };
  });

  // Bind category pills
  body.querySelectorAll(".soap-cat-pill").forEach(pill => {
    pill.onclick = () => {
      _soapScreenCat = pill.dataset.cat;
      // Update pill styles
      body.querySelectorAll(".soap-cat-pill").forEach(p => {
        p.className = "soap-cat-pill" + (p.dataset.cat === _soapScreenCat ? ` active-${type}` : "");
      });
      // Show write area
      const writeArea = body.querySelector(".soap-write-area");
      if (writeArea) {
        writeArea.hidden = false;
        body.querySelector(".soap-write-textarea")?.focus();
      }
    };
  });

  // Bind save
  const saveBtn = document.getElementById("soapWriteSave");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const ta = document.getElementById("soapWriteTA");
      const text = ta?.value.trim();
      if (!text || !_soapScreenCat) return;

      const entry = {
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        category: _soapScreenCat,
        text,
        passage: _soapScreenPassage,
        time: Date.now()
      };

      const entries = _getSoapEntries(type);
      entries.unshift(entry);
      _saveSoapEntries(type, entries);
      _flushSoapToFirebase(type);

      // Re-render to show new entry
      _soapScreenCat = null;
      _renderSoapScreenContent();
    };
  }

  // Auto-resize textarea
  const ta = document.getElementById("soapWriteTA");
  if (ta) {
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    });
  }

  // Bind delete buttons
  _bindSoapScreenDeleteButtons();
}

function _soapScreenEntryHTML(entry, type) {
  return `
    <div class="soap-entry-item" data-soap-sid="${entry.id}">
      <span class="soap-entry-item-cat cat-${type}">${_escHtml(entry.category)}</span>
      <span class="soap-entry-item-text">${_escHtml(entry.text)}</span>
      <button class="soap-entry-item-del" data-sid="${entry.id}" data-stype="${type}">
        <span class="material-icons">close</span>
      </button>
    </div>`;
}

function _bindSoapScreenDeleteButtons() {
  document.querySelectorAll(".soap-entry-item-del").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.sid;
      const type = btn.dataset.stype;
      const entries = _getSoapEntries(type).filter(e => e.id !== id);
      _saveSoapEntries(type, entries);
      _flushSoapToFirebase(type);
      const item = btn.closest(".soap-entry-item");
      if (item) {
        item.style.opacity = "0";
        item.style.transform = "scale(0.95)";
        item.style.transition = "all 0.2s";
        setTimeout(() => {
          item.remove();
          // Update label visibility
          const list = document.getElementById("soapEntryList");
          if (list && !list.children.length) {
            const label = document.querySelector(".soap-entries-label");
            if (label) label.remove();
          }
        }, 200);
      }
    };
  });
}

function _soapStorageKey(type) { return `soap_${type}`; }

function _getSoapEntries(type) {
  return JSON.parse(localStorage.getItem(_soapStorageKey(type)) || "[]");
}
function _saveSoapEntries(type, entries) {
  localStorage.setItem(_soapStorageKey(type), JSON.stringify(entries));
}

function _flushSoapToFirebase(type) {
  if (typeof _fbDb === 'undefined' || !_fbDb || !_syncEnabled) return;
  const key = _soapStorageKey(type);
  const val = localStorage.getItem(key);
  if (val === null) return;
  const encodedKey = key.replace(/\./g, "__DOT__").replace(/\//g, "__SL__");
  clearTimeout(_syncDebounceTimers[encodedKey]);
  _ignoreRemoteUpdate = true;
  _fbDb.ref(`${RTDB_PATH}/${encodedKey}`).set(val).then(() => {
    _ignoreRemoteUpdate = false;
  }).catch(() => { _ignoreRemoteUpdate = false; });
}

function _soapAPButtonsHTML(book, chapter, verse) {
  return `
    <div class="soap-ap-buttons">
      <button class="soap-ap-btn soap-ap-btn--application" data-soap-type="application">
        <span class="material-icons">edit_note</span> Application
      </button>
      <button class="soap-ap-btn soap-ap-btn--prayer" data-soap-type="prayer">
        <span class="material-icons">volunteer_activism</span> Prayer
      </button>
    </div>
    <div class="soap-ap-stack"></div>
  `;
}

function _bindSoapAPButtons(container, book, chapter, verse) {
  const btns = container.querySelectorAll(".soap-ap-btn");
  const stack = container.querySelector(".soap-ap-stack");
  btns.forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.soapType;
      // If there's already an open picker for this type, don't duplicate
      if (stack.querySelector(`.soap-picker[data-soap-picker-type="${type}"]`)) return;
      _appendSoapPicker(stack, type, book, chapter, verse);
    };
  });
}

function _appendSoapPicker(stack, type, book, chapter, verse) {
  const isApp = type === "application";
  const label = isApp ? "Application" : "Prayer";
  const icon = isApp ? "edit_note" : "volunteer_activism";
  const placeholder = isApp
    ? "How will you apply this to your life today?"
    : "Write your prayer to God here...";
  const picker = document.createElement("div");
  picker.className = `soap-picker soap-picker--${type}`;
  picker.dataset.soapPickerType = type;
  picker.style.animation = "aiFadeSlideIn .25s ease-out";
  picker.innerHTML = `
    <div class="soap-pill-row">
      ${SOAP_CATEGORIES.map(c => `<button class="soap-pill" data-cat="${_escHtml(c)}">${_escHtml(c)}</button>`).join("")}
    </div>
    <div class="soap-writer" hidden>
      <textarea class="soap-textarea" placeholder="${placeholder}" rows="1"></textarea>
      <button class="soap-writer-save${isApp ? ' soap-writer-save--application' : ''}">Save</button>
    </div>
  `;
  stack.appendChild(picker);

  let selectedCat = null;
  const pills = picker.querySelectorAll(".soap-pill");
  const writer = picker.querySelector(".soap-writer");
  const textarea = picker.querySelector(".soap-textarea");
  const saveBtn = picker.querySelector(".soap-writer-save");

  // Auto-resize textarea
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  });

  pills.forEach(pill => {
    pill.onclick = () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      selectedCat = pill.dataset.cat;
      writer.hidden = false;
      textarea.focus();
    };
  });

  saveBtn.onclick = () => {
    const text = textarea.value.trim();
    if (!text || !selectedCat) return;

    const entry = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      category: selectedCat,
      text,
      passage: `${book} ${chapter}${verse ? ":" + verse : ""}`,
      time: Date.now()
    };

    const entries = _getSoapEntries(type);
    entries.unshift(entry);
    _saveSoapEntries(type, entries);

    // Replace picker with saved card
    const card = _createSoapEntryCard(entry, type);
    picker.replaceWith(card);
  };
}

function _createSoapEntryCard(entry, type) {
  const card = document.createElement("div");
  card.className = `soap-entry-card soap-entry-card--${type}`;
  card.style.animation = "aiFadeSlideIn .25s ease-out";
  card.dataset.soapId = entry.id;
  card.innerHTML = `
    <div class="soap-entry-tag">${_escHtml(entry.category)}</div>
    <span class="soap-entry-text" data-soap-id="${entry.id}" data-soap-type="${type}">${_escHtml(entry.text)}</span>
    <button class="soap-entry-edit" title="Edit"><span class="material-icons">edit</span></button>
  `;

  const textEl = card.querySelector(".soap-entry-text");
  const editBtn = card.querySelector(".soap-entry-edit");

  editBtn.onclick = () => {
    textEl.contentEditable = "true";
    textEl.focus();
    const range = document.createRange();
    range.selectNodeContents(textEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  textEl.addEventListener("blur", () => {
    textEl.contentEditable = "false";
    const newText = textEl.textContent.trim();
    if (!newText) {
      // Empty = delete
      const entries = _getSoapEntries(type).filter(e => e.id !== entry.id);
      _saveSoapEntries(type, entries);
      _flushSoapToFirebase(type);
      card.style.opacity = "0";
      card.style.transition = "opacity .2s";
      setTimeout(() => card.remove(), 200);
      return;
    }
    const entries = _getSoapEntries(type);
    const found = entries.find(e => e.id === entry.id);
    if (found) { found.text = newText; _saveSoapEntries(type, entries); }
  });

  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); textEl.blur(); }
  });

  return card;
}

/* ── SOAP Dashboard Sections ── */

/* ── Combined SOAP Dashboard — Applications & Prayers side-by-side ── */

function _renderSoapDashCombined() {
  const appEntries = _getSoapEntries("application");
  const prayEntries = _getSoapEntries("prayer");
  const allEntries = [...appEntries, ...prayEntries];

  // Build united category pills from both types
  const grouped = {};
  SOAP_CATEGORIES.forEach(c => { grouped[c] = 0; });
  allEntries.forEach(e => { grouped[e.category] = (grouped[e.category] || 0) + 1; });
  const activeCats = SOAP_CATEGORIES.filter(c => grouped[c] > 0);

  function _stackHTML(type) {
    const entries = _getSoapEntries(type);
    const isApp = type === "application";
    const label = isApp ? "Applications" : "Prayers";
    const icon = isApp ? "edit_note" : "volunteer_activism";

    if (!entries.length) {
      return `
        <div class="soap-dash-col soap-dash--${type}">
          <h3 class="soap-dash-col-title" data-soap-open-list="${type}">
            <span><span class="material-icons dashboard-icon soap-dash-icon--${type}">${icon}</span> ${label}</span>
          </h3>
          <div class="soap-empty-state">
            <span class="material-icons soap-empty-icon">${icon}</span>
            <p class="soap-empty-text">No ${label.toLowerCase()} yet</p>
            <p class="soap-empty-hint">Open <strong>Dig Deeper</strong> on any passage to add one</p>
          </div>
        </div>`;
    }

    return `
      <div class="soap-dash-col soap-dash--${type}">
        <h3 class="soap-dash-col-title" data-soap-open-list="${type}">
          <span><span class="material-icons dashboard-icon soap-dash-icon--${type}">${icon}</span> ${label}</span>
          <span class="soap-dash-count" id="soapDashCount_${type}">${entries.length}</span>
        </h3>
        <div class="soap-stack-wrap" data-soap-stack-type="${type}" data-soap-stack-idx="0">
          <div class="soap-stack" data-soap-dash-list="${type}" data-soap-open-list="${type}">
            <div class="soap-stack-card c3"></div>
            <div class="soap-stack-card c2"></div>
            <div class="soap-stack-card c1" id="soapStackFront_${type}"></div>
          </div>
          <div class="soap-stack-nav">
            <button class="soap-stack-prev" data-stack-type="${type}"><span class="material-symbols-outlined">chevron_left</span></button>
            <span class="soap-stack-counter" id="soapStackCounter_${type}"></span>
            <button class="soap-stack-next" data-stack-type="${type}"><span class="material-symbols-outlined">chevron_right</span></button>
          </div>
        </div>
      </div>`;
  }

  return `
    <section class="dashboard-section soap-dash-combined">
      <div class="soap-dash-pills" data-soap-dash-type="combined">
        <button class="soap-dash-pill active" data-filter="all">All</button>
        ${activeCats.map(c => `<button class="soap-dash-pill" data-filter="${_escHtml(c)}">${_escHtml(c)} <span class="soap-dash-pill-count">${grouped[c]}</span></button>`).join("")}
      </div>
      <div class="soap-dash-pair">
        ${_stackHTML("application")}
        ${_stackHTML("prayer")}
      </div>
    </section>`;
}

/* ── Stack card rendering + navigation ── */

let _soapCombinedFilter = "all";

function _getFilteredSoapEntries(type) {
  const entries = _getSoapEntries(type);
  return _soapCombinedFilter === "all" ? entries : entries.filter(e => e.category === _soapCombinedFilter);
}

function _renderSoapStackCard(type) {
  const entries = _getFilteredSoapEntries(type);
  const wrap = document.querySelector(`[data-soap-stack-type="${type}"]`);
  if (!wrap) return;
  let idx = parseInt(wrap.dataset.soapStackIdx) || 0;
  if (idx >= entries.length) idx = 0;
  if (idx < 0) idx = entries.length - 1;
  wrap.dataset.soapStackIdx = idx;

  const front = document.getElementById(`soapStackFront_${type}`);
  const counter = document.getElementById(`soapStackCounter_${type}`);
  const c2 = wrap.querySelector(".soap-stack-card.c2");
  const c3 = wrap.querySelector(".soap-stack-card.c3");

  // Update column count to match filtered
  const countEl = document.getElementById(`soapDashCount_${type}`);
  if (countEl) countEl.textContent = entries.length;

  if (!entries.length) {
    const label = type === "application" ? "applications" : "prayers";
    front.innerHTML = `<div class="soap-stack-empty">
      <span class="material-icons" style="font-size:28px;opacity:0.15">${type === "application" ? "edit_note" : "volunteer_activism"}</span>
      <p style="font-size:12px;color:rgba(255,255,255,0.2);margin-top:8px;font-weight:600">No ${label} here</p>
    </div>`;
    front.className = "soap-stack-card c1";
    if (counter) counter.textContent = "";
    if (c2) c2.style.display = "none";
    if (c3) c3.style.display = "none";
    return;
  }

  const e = entries[idx];
  const dateStr = new Date(e.time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isApp = type === "application";

  front.innerHTML = `
    <div class="soap-stack-cat ${isApp ? 'cat-app' : 'cat-pray'}">${_escHtml(e.category)}</div>
    <div class="soap-stack-text">${_escHtml(e.text)}</div>
    <div class="soap-stack-foot">
      <span>${_escHtml(e.passage)}</span>
      <span>${dateStr}</span>
    </div>
    <button class="soap-stack-del" data-soap-del-id="${e.id}" data-soap-del-type="${type}">
      <span class="material-icons">close</span>
    </button>
  `;
  front.className = `soap-stack-card c1 soap-stack-card--${type}`;

  if (counter) counter.textContent = `${idx + 1} of ${entries.length}`;
  if (c2) c2.style.display = entries.length > 1 ? "" : "none";
  if (c3) c3.style.display = entries.length > 2 ? "" : "none";

  // Bind delete
  const delBtn = front.querySelector(".soap-stack-del");
  if (delBtn) {
    delBtn.onclick = (ev) => {
      ev.stopPropagation();
      const id = delBtn.dataset.soapDelId;
      const t = delBtn.dataset.soapDelType;
      const arr = _getSoapEntries(t).filter(x => x.id !== id);
      _saveSoapEntries(t, arr);
      _flushSoapToFirebase(t);
      // Re-render stack
      const filtered = _getFilteredSoapEntries(t);
      if (idx >= filtered.length) wrap.dataset.soapStackIdx = Math.max(0, filtered.length - 1);
      _renderSoapStackCard(t);
      // Update section count
      const col = wrap.closest(".soap-dash-col");
      if (col) {
        const countEl = col.querySelector(".soap-dash-count");
        if (countEl) countEl.textContent = _getSoapEntries(t).length;
      }
      // Rebuild pills to reflect new category counts
      _rebuildSoapCombinedPills();
    };
  }
}

/* Rebuild the united pills after any data change */
function _rebuildSoapCombinedPills() {
  const pillRow = document.querySelector('[data-soap-dash-type="combined"]');
  if (!pillRow) return;
  const allEntries = [..._getSoapEntries("application"), ..._getSoapEntries("prayer")];
  const grouped = {};
  SOAP_CATEGORIES.forEach(c => { grouped[c] = 0; });
  allEntries.forEach(e => { grouped[e.category] = (grouped[e.category] || 0) + 1; });
  const activeCats = SOAP_CATEGORIES.filter(c => grouped[c] > 0);

  // If current filter no longer has entries, reset to "all"
  if (_soapCombinedFilter !== "all" && !grouped[_soapCombinedFilter]) {
    _soapCombinedFilter = "all";
    ["application", "prayer"].forEach(t => {
      const w = document.querySelector(`[data-soap-stack-type="${t}"]`);
      if (w) { w.dataset.soapStackIdx = "0"; }
    });
    ["application", "prayer"].forEach(t => _renderSoapStackCard(t));
  }

  pillRow.innerHTML = `
    <button class="soap-dash-pill${_soapCombinedFilter === "all" ? " active" : ""}" data-filter="all">All</button>
    ${activeCats.map(c => `<button class="soap-dash-pill${_soapCombinedFilter === c ? " active" : ""}" data-filter="${_escHtml(c)}">${_escHtml(c)} <span class="soap-dash-pill-count">${grouped[c]}</span></button>`).join("")}
  `;
  _bindSoapCombinedPills();
}

function _bindSoapCombinedPills() {
  const pillRow = document.querySelector('[data-soap-dash-type="combined"]');
  if (!pillRow) return;
  pillRow.querySelectorAll(".soap-dash-pill").forEach(pill => {
    pill.onclick = () => {
      pillRow.querySelectorAll(".soap-dash-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      _soapCombinedFilter = pill.dataset.filter;
      ["application", "prayer"].forEach(t => {
        const w = document.querySelector(`[data-soap-stack-type="${t}"]`);
        if (w) { w.dataset.soapStackIdx = "0"; }
      });
      ["application", "prayer"].forEach(t => _renderSoapStackCard(t));
    };
  });
}

function _bindSoapStackNav() {
  document.querySelectorAll(".soap-stack-prev").forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.stackType;
      const wrap = document.querySelector(`[data-soap-stack-type="${type}"]`);
      if (!wrap) return;
      let idx = parseInt(wrap.dataset.soapStackIdx) || 0;
      const entries = _getFilteredSoapEntries(type);
      wrap.dataset.soapStackIdx = (idx - 1 + entries.length) % entries.length;
      const front = wrap.querySelector(".c1");
      if (front) { front.style.animation = "none"; front.offsetHeight; front.style.animation = "stackFlip 0.25s ease-out"; }
      _renderSoapStackCard(type);
    };
  });
  document.querySelectorAll(".soap-stack-next").forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.stackType;
      const wrap = document.querySelector(`[data-soap-stack-type="${type}"]`);
      if (!wrap) return;
      let idx = parseInt(wrap.dataset.soapStackIdx) || 0;
      const entries = _getFilteredSoapEntries(type);
      wrap.dataset.soapStackIdx = (idx + 1) % entries.length;
      const front = wrap.querySelector(".c1");
      if (front) { front.style.animation = "none"; front.offsetHeight; front.style.animation = "stackFlip 0.25s ease-out"; }
      _renderSoapStackCard(type);
    };
  });
}

function _bindSoapDashboard() {
  _soapCombinedFilter = "all";
  _bindSoapCombinedPills();
  // Bind clickable titles + card stacks → open list panel
  document.querySelectorAll("h3[data-soap-open-list]").forEach(el => {
    el.onclick = () => openSoapListPanel(el.dataset.soapOpenList);
  });
  document.querySelectorAll(".soap-stack[data-soap-open-list]").forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest(".soap-stack-del") || ev.target.closest(".soap-stack-nav")) return;
      const type = el.dataset.soapOpenList;
      const wrap = document.querySelector(`[data-soap-stack-type="${type}"]`);
      const idx = wrap ? parseInt(wrap.dataset.soapStackIdx) || 0 : 0;
      openSoapListPanel(type, idx);
    };
  });
  // Initialize stacks
  ["application", "prayer"].forEach(t => _renderSoapStackCard(t));
  _bindSoapStackNav();
}

function _bindSoapDeleteButtons() { /* handled by stack nav */ }
function _bindSoapDashEditables() { /* handled inline */ }

/* ═══════════════════════════════════════════════════════════════════
   SOAP List Panel — fullscreen list of all Applications / Prayers
   ═══════════════════════════════════════════════════════════════════ */

let _soapListType = "application";
let _soapListFilter = "all";
let _soapListHeroIdx = 0;

function openSoapListPanel(type, heroIdx) {
  _soapListType = type;
  _soapListFilter = "all";
  _soapListHeroIdx = heroIdx || 0;
  const panel = document.getElementById("soapListPanel");
  panel.hidden = false;
  panel.className = `soap-list-panel soap-list-panel--${type}`;
  requestAnimationFrame(() => panel.classList.add("soap-list-open"));

  const isApp = type === "application";
  document.getElementById("soapListIcon").textContent = isApp ? "edit_note" : "volunteer_activism";
  document.getElementById("soapListTitle").textContent = isApp ? "Applications" : "Prayers";

  _renderSoapListPills();
  _renderSoapListItems();

  document.getElementById("soapListBack").onclick = closeSoapListPanel;
}

function closeSoapListPanel() {
  const panel = document.getElementById("soapListPanel");
  panel.classList.remove("soap-list-open");
  panel.addEventListener("transitionend", () => {
    panel.hidden = true;
  }, { once: true });
  // Refresh dashboard stacks in case items were deleted
  _rebuildSoapCombinedPills();
  ["application", "prayer"].forEach(t => {
    _renderSoapStackCard(t);
    // Update column title count
    const col = document.querySelector(`.soap-dash-col.soap-dash--${t}`);
    if (col) {
      const countEl = col.querySelector(".soap-dash-count");
      if (countEl) countEl.textContent = _getSoapEntries(t).length;
    }
  });
}

function _renderSoapListPills() {
  const entries = _getSoapEntries(_soapListType);
  const grouped = {};
  SOAP_CATEGORIES.forEach(c => { grouped[c] = 0; });
  entries.forEach(e => { grouped[e.category] = (grouped[e.category] || 0) + 1; });
  const activeCats = SOAP_CATEGORIES.filter(c => grouped[c] > 0);

  const pillsEl = document.getElementById("soapListPills");
  pillsEl.innerHTML = `
    <button class="soap-list-pill${_soapListFilter === "all" ? " active" : ""}" data-filter="all">All</button>
    ${activeCats.map(c => `<button class="soap-list-pill${_soapListFilter === c ? " active" : ""}" data-filter="${_escHtml(c)}">${_escHtml(c)} <span class="soap-list-pill-count">${grouped[c]}</span></button>`).join("")}
  `;
  pillsEl.querySelectorAll(".soap-list-pill").forEach(pill => {
    pill.onclick = () => {
      _soapListFilter = pill.dataset.filter;
      pillsEl.querySelectorAll(".soap-list-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      _renderSoapListItems();
    };
  });

  // Update count
  document.getElementById("soapListCount").textContent = entries.length;
}

function _renderSoapListHero() {
  const entries = _getSoapEntries(_soapListType);
  const filtered = _soapListFilter === "all" ? entries : entries.filter(e => e.category === _soapListFilter);
  const heroEl = document.getElementById("soapListHero");
  if (!filtered.length) { heroEl.innerHTML = ""; return; }

  const idx = Math.min(_soapListHeroIdx, filtered.length - 1);
  const e = filtered[idx];
  const isApp = _soapListType === "application";
  const dateStr = new Date(e.time).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  heroEl.innerHTML = `
    <div class="soap-list-hero-card soap-list-hero--${_soapListType}">
      <div class="soap-stack-cat ${isApp ? 'cat-app' : 'cat-pray'}">${_escHtml(e.category)}</div>
      <div class="soap-list-hero-text">${_escHtml(e.text)}</div>
      <div class="soap-stack-foot">
        <span class="soap-list-passage-link" data-passage="${_escHtml(e.passage)}">${_escHtml(e.passage)}</span>
        <span>${dateStr}</span>
      </div>
    </div>`;
  _bindSoapPassageLinks(heroEl);
}

function _renderSoapListItems() {
  const entries = _getSoapEntries(_soapListType);
  const filtered = _soapListFilter === "all" ? entries : entries.filter(e => e.category === _soapListFilter);
  const container = document.getElementById("soapListItems");
  const emptyEl = document.getElementById("soapListEmpty");
  const divider = document.getElementById("soapListDivider");

  // Render hero card
  _renderSoapListHero();

  if (!filtered.length) {
    container.innerHTML = "";
    emptyEl.hidden = false;
    divider.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  // If only the hero exists, no list needed
  if (filtered.length <= 1) {
    container.innerHTML = "";
    divider.hidden = true;
    emptyEl.hidden = true;
    return;
  }

  // Exclude the hero entry from the list
  const heroIdx = Math.min(_soapListHeroIdx, filtered.length - 1);
  const heroId = filtered[heroIdx]?.id;
  const listEntries = filtered.filter(e => e.id !== heroId);
  divider.hidden = listEntries.length === 0;

  container.innerHTML = listEntries.map((e, i) => {
    const dateStr = new Date(e.time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `
      <div class="soap-list-row" style="animation-delay:${i * 0.04}s" data-soap-list-id="${e.id}">
        <div class="soap-list-row-body">
          <div class="soap-list-row-top">
            <span class="soap-list-row-cat">${_escHtml(e.category)}</span>
            <span class="soap-list-row-passage soap-list-passage-link" data-passage="${_escHtml(e.passage)}">${_escHtml(e.passage)}</span>
          </div>
          <div class="soap-list-row-text">${_escHtml(e.text)}</div>
          <div class="soap-list-row-date">${dateStr}</div>
        </div>
        <button class="soap-list-row-del" data-del-id="${e.id}">
          <span class="material-icons">close</span>
        </button>
      </div>`;
  }).join("");

  // Bind delete buttons
  container.querySelectorAll(".soap-list-row-del").forEach(btn => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.delId;
      const row = btn.closest(".soap-list-row");
      row.style.transition = "opacity 0.25s, transform 0.25s";
      row.style.opacity = "0";
      row.style.transform = "translateX(40px)";
      row.addEventListener("transitionend", () => {
        const arr = _getSoapEntries(_soapListType).filter(x => x.id !== id);
        _saveSoapEntries(_soapListType, arr);
        _flushSoapToFirebase(_soapListType);
        _renderSoapListPills();
        _renderSoapListItems();
      }, { once: true });
    };
  });

  // Bind row tap → swap into hero
  container.querySelectorAll(".soap-list-row").forEach(row => {
    row.onclick = (ev) => {
      if (ev.target.closest(".soap-list-row-del") || ev.target.closest(".soap-list-passage-link")) return;
      const id = row.dataset.soapListId;
      const entries = _getSoapEntries(_soapListType);
      const idx = entries.findIndex(e => e.id === id);
      if (idx >= 0) {
        _soapListHeroIdx = idx;
        _renderSoapListItems();
        // Scroll to top so hero is visible
        document.getElementById("soapListScroll").scrollTo({ top: 0, behavior: "smooth" });
      }
    };
  });

  // Bind passage links
  _bindSoapPassageLinks(container);

  // Ensure empty state is hidden when we have items
  emptyEl.hidden = true;
}

/* ── Verse popover from passage string ── */

function _bindSoapPassageLinks(root) {
  root.querySelectorAll(".soap-list-passage-link").forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      _showSoapVersePopover(el.dataset.passage, el);
    };
  });
}

function _parsePassageString(passage) {
  // "Exodus 35:5-19" → { bookCode, chapter, startVerse, endVerse }
  // "1 John 3:16" → single verse
  // "Genesis 1" → whole chapter
  const match = passage.match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!match) return null;
  const bookName = match[1].trim();
  const chapter = match[2];
  const startVerse = match[3] ? parseInt(match[3]) : null;
  const endVerse = match[4] ? parseInt(match[4]) : (startVerse || null);

  // Reverse lookup: book name → BIBLE_META code
  const bookUpper = bookName.toUpperCase();
  let bookCode = null;
  for (const key of Object.keys(BIBLE_META)) {
    if (BIBLE_META[key].name.toUpperCase() === bookUpper) {
      bookCode = key;
      break;
    }
  }
  if (!bookCode) return null;
  return { bookCode, chapter, startVerse, endVerse };
}

function _showSoapVersePopover(passage, anchorEl) {
  const parsed = _parsePassageString(passage);
  if (!parsed) return;

  const { bookCode, chapter, startVerse, endVerse } = parsed;
  const bookName = BIBLE_META[bookCode]?.name || bookCode;
  const bookUpper = bookName.toUpperCase();
  const bookData = bibleData?.[bookUpper];
  if (!bookData || !bookData[chapter]) return;

  // Build verse numbers list
  const verseNums = [];
  if (startVerse && endVerse) {
    for (let v = startVerse; v <= endVerse; v++) verseNums.push(v);
  } else {
    // Whole chapter — first 10
    Object.keys(bookData[chapter]).sort((a, b) => parseInt(a) - parseInt(b)).slice(0, 10).forEach(k => verseNums.push(parseInt(k)));
  }
  if (!verseNums.length) return;

  const verseLabel = startVerse ? (startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`) : "";
  const refLabel = `${bookName} ${chapter}${verseLabel ? ":" + verseLabel : ""}`;

  const bodyHTML = verseNums.map(v => {
    const text = getVerseText(bookCode, chapter, String(v));
    if (!text || text === "Verse text not found.") return "";
    return `<div class="verse-peek-row"><span class="verse-peek-num">v.${v}</span><span>${_escHtml(text)}</span></div>`;
  }).join("");

  // Remove any existing peek
  document.querySelector(".verse-peek-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "verse-peek-overlay";

  const bubble = document.createElement("div");
  bubble.className = "verse-peek-bubble";
  bubble.innerHTML = `
    <div class="verse-peek-header">
      <div class="verse-peek-ref">${refLabel}</div>
    </div>
    <div class="verse-peek-body-wrap">
      <div class="verse-peek-body">${bodyHTML || '<span style="opacity:0.4">No verses found.</span>'}</div>
    </div>
    <div class="verse-peek-tail"></div>`;

  const peekWrap = bubble.querySelector(".verse-peek-body-wrap");
  const checkPeekScroll = () => {
    const atEnd = peekWrap.scrollHeight - peekWrap.scrollTop - peekWrap.clientHeight < 8;
    peekWrap.classList.toggle("peek-scrolled-end", atEnd);
  };
  peekWrap.addEventListener("scroll", checkPeekScroll);
  peekWrap.addEventListener("touchmove", e => e.stopPropagation());
  overlay.addEventListener("touchmove", e => {
    if (!peekWrap.contains(e.target)) e.preventDefault();
  }, { passive: false });

  overlay.appendChild(bubble);
  document.body.appendChild(overlay);
  requestAnimationFrame(checkPeekScroll);

  // Position bubble near anchor
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    requestAnimationFrame(() => {
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 8;
      let left = anchorCenterX - bw / 2;
      left = Math.max(pad, Math.min(left, vw - bw - pad));
      let top = rect.top - bh - 10;
      let tailBelow = true;
      if (top < pad) { top = rect.bottom + 10; tailBelow = false; }
      top = Math.max(pad, Math.min(top, vh - bh - pad));
      bubble.style.left = left + "px";
      bubble.style.top = top + "px";
      const tail = bubble.querySelector(".verse-peek-tail");
      const tailX = anchorCenterX - left;
      tail.style.left = Math.max(18, Math.min(tailX, bw - 18)) + "px";
      if (!tailBelow) tail.classList.add("verse-peek-tail-top");
    });
  } else {
    bubble.style.left = "50%";
    bubble.style.top = "50%";
    bubble.style.transform = "translate(-50%, -50%)";
  }

  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });
}

