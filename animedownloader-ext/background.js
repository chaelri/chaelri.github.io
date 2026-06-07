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
  cancelled: false,
  currentEp: null,
  currentTabId: null,
  currentDownloadId: null,
  pendingSettle: null, // callback installed by downloadOneEpisode; receives "complete" | "interrupted" | "timeout" | "no-download" | "cancelled"
};

function enqueueBatch(msg, originTabId) {
  batch.originTabId = originTabId;
  batch.animeId = msg.animeId;
  batch.animeTitle = msg.animeTitle;
  batch.poster = msg.poster;
  batch.total = (msg.items || []).length;
  batch.done = 0;
  batch.cancelled = false;
  batch.currentEp = null;
  batch.currentTabId = null;
  batch.currentDownloadId = null;
  batch.pendingSettle = null;
  fireAll(msg.items || []);
}

function cancelBatch() {
  batch.cancelled = true;
  if (batch.currentTabId) chrome.tabs.remove(batch.currentTabId).catch(() => {});
  if (batch.pendingSettle) batch.pendingSettle("cancelled");
  reportBatchProgress("cancelled");
  batch.total = 0;
  batch.done = 0;
  batch.active = false;
  batch.currentEp = null;
  batch.currentTabId = null;
  batch.currentDownloadId = null;
  batch.pendingSettle = null;
}

// Strict serial mode — open one tab, wait for that episode's file download
// to fully complete (chrome.downloads state="complete"), THEN move on.
// Cloudflare became sticky on animepahe so the previous worker pool (3
// concurrent) tripped 1015 even with the per-tab gap; staying truly serial
// gives the host minutes of breathing room between API hits.
const START_TIMEOUT_MS = 60_000;       // 1 min to actually kick off the download
const COMPLETE_TIMEOUT_MS = 30 * 60_000; // 30 min cap per episode file

async function fireAll(items) {
  batch.active = true;
  for (const item of items) {
    if (batch.cancelled) return;
    batch.currentEp = item.ep;
    reportBatchProgress("start", item.ep);
    try {
      await markEpDownloaded(batch.animeId, item.ep, batch.animeTitle, batch.poster);
    } catch (e) {}
    const result = await downloadOneEpisode(item);
    if (batch.cancelled) return;
    batch.done += 1;
    if (result === "complete") {
      reportBatchProgress("done", item.ep);
    } else {
      reportBatchProgress("failed", item.ep);
    }
    batch.currentEp = null;
    batch.currentTabId = null;
    batch.currentDownloadId = null;
    batch.pendingSettle = null;
  }
  if (!batch.cancelled) {
    batch.active = false;
    reportBatchProgress("complete");
    batch.total = 0;
    batch.done = 0;
  }
}

function downloadOneEpisode(item) {
  return new Promise(async (resolve) => {
    let settled = false;
    let startTimer = null;
    let completeTimer = null;

    const settle = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
      // Tab is usually already closed by kwik.js's 5s timer + the
      // downloads.onCreated auto-close — this is the belt-and-suspenders kill.
      if (batch.currentTabId) chrome.tabs.remove(batch.currentTabId).catch(() => {});
      resolve(reason);
    };

    // Called by the global downloads.onCreated listener the moment Chrome
    // registers OUR download. Promotes start-phase → complete-phase watchdog.
    const onDownloadStart = () => {
      clearTimeout(startTimer);
      completeTimer = setTimeout(() => settle("timeout"), COMPLETE_TIMEOUT_MS);
    };

    batch.pendingSettle = settle;
    batch._onDownloadStart = onDownloadStart;

    startTimer = setTimeout(() => settle("no-download"), START_TIMEOUT_MS);

    try {
      const tab = await chrome.tabs.create({ url: item.downloadUrl, active: false });
      batch.currentTabId = tab.id;
      await trackTab(tab.id, { animeId: batch.animeId, animeTitle: batch.animeTitle });
      if (batch.animeId && batch.animeTitle) {
        groupDownloadTab(tab.id, batch.animeId, batch.animeTitle).catch(() => {});
      }
    } catch (e) {
      settle("tab-error");
    }
  });
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
// Download lifecycle listeners
//
// Two modes:
//   1. Non-batch (single download, manual right-click flow) — same as before:
//      close the originating tab once the browser owns the download, since
//      kwik.js's safety timer can fail under Cloudflare challenges.
//   2. Batch / auto-pilot — strict serial. Capture the first download created
//      after each episode tab opens, then resolve the per-episode promise only
//      when that download enters a terminal state (complete / interrupted).
//      Keeps in-flight count at 1 so animepahe doesn't trip CF 1015.
// ══════════════════════════════════════════════════════════════════════════
chrome.downloads.onCreated.addListener((dl) => {
  if (batch.active && batch.currentDownloadId === null) {
    // Bind the first new download to the current episode. With concurrency=1
    // there should only ever be one in flight per episode, so the first
    // onCreated after the tab opens is ours.
    batch.currentDownloadId = dl.id;
    if (typeof batch._onDownloadStart === "function") batch._onDownloadStart();
  }
  // Tab can close now — download manager owns the bytes from here on.
  setTimeout(closeOldestFinishedTab, 400);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (batch.active && batch.currentDownloadId === delta.id && delta.state) {
    const s = delta.state.current;
    if (s === "complete") {
      if (batch.pendingSettle) batch.pendingSettle("complete");
      return;
    }
    if (s === "interrupted") {
      if (batch.pendingSettle) batch.pendingSettle("interrupted");
      return;
    }
  }
  // Fallback close in case onCreated was missed (service worker asleep).
  if (delta.state && delta.state.current === "complete") {
    setTimeout(closeOldestFinishedTab, 800);
  }
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
