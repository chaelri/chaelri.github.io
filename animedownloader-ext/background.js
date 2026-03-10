// Service worker — handles tab creation requests from content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "openTab") {
    chrome.tabs.create({ url: msg.url, active: false });
  } else if (msg.action === "closeTab") {
    chrome.tabs.remove(sender.tab.id);
  }
});
