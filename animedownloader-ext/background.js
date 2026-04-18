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
  }
});

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
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== "complete") return;
  // Give the browser a beat to finalize the file write before we close.
  setTimeout(closeOldestFinishedTab, 1200);
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
