// Service worker — tab ops, download renaming, context menu, tab grouping

// ══════════════════════════════════════════════════════════════════════════
// Message routing — content scripts send tab open/close + anime metadata
// ══════════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "openTab") {
    chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
      if (msg.animeId && msg.animeTitle && tab) {
        groupDownloadTab(tab.id, msg.animeId, msg.animeTitle);
      }
    });
  } else if (msg.action === "closeTab") {
    chrome.tabs.remove(sender.tab.id);
  }
});

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
//   Output: Kimi ni Todoke/KnT E01.mp4
//
// Folder keeps the full title (so files remain self-describing when browsed),
// filename uses an abbreviation so VLC / Finder / media players group them
// tightly without repeating the series name on every row.
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
  const abbr = abbreviate(title) || title;
  const ep = padEp(epRaw);

  return `${title}/${abbr} E${ep}${ext}`;
}

// Particles (English + common Japanese transliterations): lowercase first letter.
const PARTICLES = new Set([
  "no", "ni", "wa", "to", "ga", "wo", "de", "mo", "ka", "ya",
  "the", "a", "an", "of", "and", "or", "on", "in", "at", "by", "for",
]);
// Structural words we drop entirely so "Chained Soldier Season 2" → "CS2"
const SKIP_WORDS = new Set(["season", "part", "cour", "arc"]);

function abbreviate(title) {
  const cleaned = title.replace(/[^\w\s]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  let out = "";
  for (const w of words) {
    const lower = w.toLowerCase();
    if (SKIP_WORDS.has(lower)) continue;
    if (/^\d+$/.test(w)) { out += w; continue; }     // keep raw numbers
    if (PARTICLES.has(lower)) { out += lower[0]; continue; } // lowercase particle
    out += w[0].toUpperCase();
  }
  return out;
}

function padEp(epRaw) {
  if (epRaw.includes(".")) {
    const [intPart, frac] = epRaw.split(".");
    return intPart.padStart(2, "0") + "." + frac;
  }
  return epRaw.padStart(2, "0");
}

function sanitize(s) {
  return s
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
