import { shouldSweep } from "./logic.js";

const key = (groupId) => `g:${groupId}`;
const minutesSince = (ms) => (Date.now() - ms) / 60000;

// One storage key per group, so concurrent events cannot overwrite each other.
async function touch(groupId, title) {
  await chrome.storage.local.set({ [key(groupId)]: { title, since: Date.now() } });
}

async function sweep(force = false) {
  const groups = await chrome.tabGroups.query({});
  const store = await chrome.storage.local.get(null);
  const live = new Set();
  let swept = 0;

  for (const group of groups) {
    const id = key(group.id);
    live.add(id);
    const seen = store[id];
    if (!seen || seen.title !== group.title) {
      await touch(group.id, group.title);
      if (!force) continue;
    }
    const age = seen && seen.title === group.title ? minutesSince(seen.since) : 0;
    if (!shouldSweep(group.title, age, force)) continue;
    const tabs = await chrome.tabs.query({ groupId: group.id });
    const ids = tabs.map((tab) => tab.id);
    if (!ids.length) continue;
    try {
      await chrome.tabs.ungroup(ids);
      swept++;
    } catch (err) {
      console.warn("ungroup failed", group.id, err); // usually a tab mid-drag; next tick retries
    }
  }

  const stale = Object.keys(store).filter((k) => k.startsWith("g:") && !live.has(k));
  if (stale.length) await chrome.storage.local.remove(stale);
  return swept;
}

chrome.tabGroups.onUpdated.addListener((group) => {
  chrome.storage.local.get(key(group.id)).then((store) => {
    if (store[key(group.id)]?.title !== group.title) touch(group.id, group.title);
  });
});

// Navigation inside a group means a session is still using it: restart its timer.
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (change.status !== "complete" || tab.groupId < 0) return;
  chrome.tabGroups.get(tab.groupId).then((g) => touch(g.id, g.title)).catch(() => {});
});

chrome.action.onClicked.addListener(async () => {
  const swept = await sweep(true);
  await chrome.action.setBadgeText({ text: String(swept) });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
});

chrome.alarms.create("sweep", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => sweep());
