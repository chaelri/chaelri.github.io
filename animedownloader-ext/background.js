// Service worker — tab ops, download renaming, context menu, tab grouping,
// auto-close of completed download tabs.

// ══════════════════════════════════════════════════════════════════════════
// Tracking which tabs we opened — so we can safely close them when their
// download finishes. Persisted via chrome.storage.session so it survives
// service-worker wake/sleep cycles.
// ══════════════════════════════════════════════════════════════════════════
const TABS_KEY = "downloadTabs";

async function trackTab(tabId, meta) {
  const store = await chrome.storage.session.get(TABS_KEY);
  const tabs = store[TABS_KEY] || {};
  tabs[tabId] = { openedAt: Date.now(), ...meta };
  await chrome.storage.session.set({ [TABS_KEY]: tabs });
}

async function untrackTab(tabId) {
  const store = await chrome.storage.session.get(TABS_KEY);
  const tabs = store[TABS_KEY] || {};
  if (tabId in tabs) {
    delete tabs[tabId];
    await chrome.storage.session.set({ [TABS_KEY]: tabs });
  }
}

async function getTrackedTabs() {
  const store = await chrome.storage.session.get(TABS_KEY);
  return store[TABS_KEY] || {};
}

// ══════════════════════════════════════════════════════════════════════════
// Message routing — content scripts send tab open/close + anime metadata
// ══════════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "openTab") {
    chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
      if (!tab) return;
      trackTab(tab.id, { animeId: msg.animeId, animeTitle: msg.animeTitle });
      if (msg.animeId && msg.animeTitle) {
        groupDownloadTab(tab.id, msg.animeId, msg.animeTitle);
      }
    });
  } else if (msg.action === "closeTab") {
    untrackTab(sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  } else if (msg.action === "batchDownload") {
    enqueueBatch(msg, sender.tab?.id);
  } else if (msg.action === "cancelBatch") {
    cancelBatch();
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Batch download queue — lets the animepahe tab stay put while downloads
// happen sequentially in background tabs. Each item is opened, its download
// is kicked off by kwik.js + the browser, the tab auto-closes on
// downloads.onCreated, and then we move to the next one.
// ══════════════════════════════════════════════════════════════════════════
const batch = {
  originTabId: null,
  animeId: null,
  animeTitle: null,
  poster: null,
  total: 0,
  done: 0,
  active: false,
  tabToEp: new Map(),
  cancelled: false,
};

function enqueueBatch(msg, originTabId) {
  batch.originTabId = originTabId;
  batch.animeId = msg.animeId;
  batch.animeTitle = msg.animeTitle;
  batch.poster = msg.poster;
  batch.total = (msg.items || []).length;
  batch.done = 0;
  batch.cancelled = false;
  batch.tabToEp.clear();
  fireAll(msg.items || []);
}

function cancelBatch() {
  batch.cancelled = true;
  for (const id of batch.tabToEp.keys()) {
    chrome.tabs.remove(id).catch(() => {});
  }
  batch.tabToEp.clear();
  reportBatchProgress("cancelled");
  batch.total = 0;
  batch.done = 0;
  batch.active = false;
}

// Cap concurrent in-flight download tabs. Opening all tabs at once causes
// Chrome's Memory Saver / background-tab throttle to discard or freeze the
// surplus — symptom: only the first ~8 episodes actually download. Worker
// pool: N workers, each opens a tab and waits for it to close (download
// started → auto-close via downloads.onCreated, or hard timeout) before
// grabbing the next item.
const CONCURRENT_TABS = 3;
const TAB_TIMEOUT_MS = 90000;

async function fireAll(items) {
  batch.active = true;
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      if (batch.cancelled) return;
      const item = items[cursor++];
      reportBatchProgress("start", item.ep);
      let tabId = null;
      try {
        await markEpDownloaded(batch.animeId, item.ep, batch.animeTitle, batch.poster);
        const tab = await chrome.tabs.create({ url: item.downloadUrl, active: false });
        tabId = tab.id;
        batch.tabToEp.set(tab.id, item.ep);
        await trackTab(tab.id, { animeId: batch.animeId, animeTitle: batch.animeTitle });
        if (batch.animeId && batch.animeTitle) {
          groupDownloadTab(tab.id, batch.animeId, batch.animeTitle).catch(() => {});
        }
      } catch (e) {
        batch.done += 1;
        reportBatchProgress("failed", item.ep);
        continue;
      }
      // Block this worker until the tab closes (download started → auto-close)
      // or the timeout fires. Keeps in-flight count ≤ CONCURRENT_TABS so Chrome
      // doesn't discard background tabs.
      await waitForTabClose(tabId, TAB_TIMEOUT_MS);
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENT_TABS, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  maybeMarkComplete();
}

// When a batch-tab closes (either via our auto-close on download start, or
// kwik.js safety timeout), tick up completion and forward to the UI.
chrome.tabs.onRemoved.addListener((tabId) => {
  const ep = batch.tabToEp.get(tabId);
  if (ep === undefined) return;
  batch.tabToEp.delete(tabId);
  batch.done += 1;
  reportBatchProgress("done", ep);
  maybeMarkComplete();
});

function maybeMarkComplete() {
  if (batch.cancelled) return;
  if (batch.active && batch.tabToEp.size === 0 && batch.done >= batch.total) {
    batch.active = false;
    reportBatchProgress("complete");
    batch.total = 0;
    batch.done = 0;
  }
}

function reportBatchProgress(status, ep) {
  if (batch.originTabId == null) return;
  chrome.tabs.sendMessage(batch.originTabId, {
    action: "batchProgress",
    status,
    ep,
    done: batch.done,
    total: batch.total,
  }).catch(() => {});
}

function waitForTabClose(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(to);
      resolve();
    };
    const onRemoved = (id) => { if (id === tabId) settle(); };
    chrome.tabs.onRemoved.addListener(onRemoved);
    const to = setTimeout(() => {
      chrome.tabs.remove(tabId).catch(() => {});
      settle();
    }, timeoutMs);
  });
}

async function markEpDownloaded(animeId, ep, title, poster) {
  if (!animeId || !ep) return;
  const store = await chrome.storage.local.get(["animeHistory"]);
  const history = store.animeHistory || {};
  const a = history[animeId] || { downloaded: [] };
  if (!a.downloaded.includes(ep)) a.downloaded.push(ep);
  if (title) a.title = title;
  if (poster) a.poster = poster;
  a.lastUpdated = Date.now();
  history[animeId] = a;
  await chrome.storage.local.set({ animeHistory: history });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  untrackTab(tabId);
});

// ══════════════════════════════════════════════════════════════════════════
// Auto-close download tabs when their download actually finishes.
// Background-level safety net: kwik.js has its own 15s countdown that also
// sends closeTab, but that can fail silently on Cloudflare challenges, ad
// script interference, or network hiccups. Listening to real download state
// at the browser level is much more reliable.
// ══════════════════════════════════════════════════════════════════════════
// Fire as soon as the browser kicks off a download — tabs can close safely
// once the download is owned by the download manager (Chrome keeps pulling
// the file even after the originating tab goes away). This cuts the per-tab
// wait from ~15s down to ~1s in the happy path.
chrome.downloads.onCreated.addListener(() => {
  setTimeout(closeOldestFinishedTab, 400);
});

// Fallback: still close on completion in case onCreated was missed (e.g.,
// service-worker was asleep when the event fired).
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== "complete") return;
  setTimeout(closeOldestFinishedTab, 800);
});

async function closeOldestFinishedTab() {
  const tracked = await getTrackedTabs();
  const candidates = [];
  for (const [tabIdStr, meta] of Object.entries(tracked)) {
    const tabId = parseInt(tabIdStr, 10);
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab?.url || "";
      // Only close tabs that are on a download-host page — never animepahe
      // itself (that's the auto-pilot driver tab).
      if (/kwik\.cx|pahe\.win/.test(url)) {
        candidates.push({ tabId, openedAt: meta.openedAt });
      }
    } catch (e) {
      // Tab already closed externally — clean up our tracking.
      untrackTab(tabId);
    }
  }
  if (!candidates.length) return;
  // Close the tab that was opened longest ago — it's most likely the one
  // whose download just completed.
  candidates.sort((a, b) => a.openedAt - b.openedAt);
  const { tabId } = candidates[0];
  try {
    await chrome.tabs.remove(tabId);
  } catch (e) {}
  untrackTab(tabId);
}

// ══════════════════════════════════════════════════════════════════════════
// Context menu — right-click animepahe links to kick off auto-pilot
// Guarded: chrome.contextMenus can be undefined briefly while Chrome is
// activating a newly-granted permission; we bail quietly instead of crashing.
// ══════════════════════════════════════════════════════════════════════════
if (chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "bulk-dl-play",
        title: "Bulk download from this episode",
        contexts: ["link"],
        targetUrlPatterns: ["*://*.animepahe.pw/play/*"],
      });
      chrome.contextMenus.create({
        id: "bulk-dl-anime",
        title: "Bulk download this anime",
        contexts: ["link"],
        targetUrlPatterns: ["*://*.animepahe.pw/anime/*"],
      });
      chrome.contextMenus.create({
        id: "bulk-dl-here",
        title: "Bulk download this page",
        contexts: ["page"],
        documentUrlPatterns: [
          "*://*.animepahe.pw/play/*",
          "*://*.animepahe.pw/anime/*",
        ],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const url = info.menuItemId === "bulk-dl-here" ? tab?.url : info.linkUrl;
    if (!url) return;
    const withAuto = url + (url.includes("?") ? "&" : "?") + "auto=true";
    if (info.menuItemId === "bulk-dl-here") {
      chrome.tabs.update(tab.id, { url: withAuto });
    } else {
      chrome.tabs.create({ url: withAuto, active: true });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Tab grouping — all download tabs for an anime land in a single named group.
// Service worker may restart, so we re-check the group exists before reusing.
// ══════════════════════════════════════════════════════════════════════════
const animeGroupMap = {}; // animeId -> groupId (in-memory only; we validate before reuse)

async function groupDownloadTab(tabId, animeId, animeTitle) {
  try {
    let groupId = animeGroupMap[animeId];
    // Validate — the group may have been deleted by user or Chrome since cached
    if (groupId !== undefined) {
      try {
        await chrome.tabGroups.get(groupId);
      } catch (e) {
        groupId = undefined;
      }
    }

    if (groupId === undefined) {
      groupId = await chrome.tabs.group({ tabIds: [tabId] });
      animeGroupMap[animeId] = groupId;
      await chrome.tabGroups.update(groupId, {
        title: "🔽 " + animeTitle,
        color: "blue",
        collapsed: true,
      });
    } else {
      await chrome.tabs.group({ tabIds: [tabId], groupId });
    }
  } catch (e) {
    // Tab may have closed before group could attach — ignore silently.
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Filename rewriting
//   Input:  AnimePahe_Kimi_ni_Todoke_-_1_BD_1080p_Freehold.mp4
//   Output: Kimi ni Todoke/Kimi ni Todoke EP 1.mp4
//
// Folder + filename both use the full title so every file is self-describing
// even out of folder context. Episode is suffixed as "EP N" for natural sort.
// ══════════════════════════════════════════════════════════════════════════
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const cleaned = reformatAnimePaheName(item.filename);
  if (cleaned) {
    suggest({ filename: cleaned, conflictAction: "uniquify" });
  } else {
    suggest();
  }
});

function reformatAnimePaheName(rawName) {
  if (!rawName || !/^AnimePahe[_ ]/i.test(rawName)) return null;

  const extMatch = rawName.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0] : "";
  let base = rawName.slice(0, rawName.length - ext.length);
  base = base.replace(/^AnimePahe[_ ]+/i, "");

  const match = base.match(
    /^(.+?)_-_(\d+(?:\.\d+)?)(?:_([A-Za-z]+))?_(\d{3,4}p)(?:_.+)?$/
  );

  if (!match) {
    const fallback = base.replace(/_/g, " ").trim();
    return `${sanitize(fallback)}${ext}`;
  }

  const [, rawTitle, epRaw] = match;
  const title = sanitize(rawTitle.replace(/_/g, " ").trim());
  const ep = padEp(epRaw);

  return `${title}/${title} EP ${ep}${ext}`;
}

function padEp(epRaw) {
  // No zero-padding — "EP 1", "EP 2" as the user requested. Modern file
  // managers and media players (Finder, VLC, Plex) all use natural-sort so
  // EP 2 still correctly sorts before EP 10.
  return epRaw;
}

function sanitize(s) {
  return s
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
