let el = null;

export function bindSyncStatus() {
  el = document.getElementById("syncStatus");
  if (!el) return;

  setLive();

  window.addEventListener("offline", setOffline);
  window.addEventListener("online", setLive);
}

export function setSyncing() {
  if (!el) return;
  el.innerHTML = `
    <span class="material-icon" style="font-size:14px">sync</span>
    <span>Syncing…</span>
  `;
  el.style.opacity = "0.7";
}

export function setLive() {
  if (!el) return;
  el.innerHTML = `
    <span class="material-icon" style="font-size:14px">cloud_done</span>
    <span>Live</span>
  `;
  el.style.opacity = "0.85";
}

export function setOffline() {
  if (!el) return;
  el.innerHTML = `
    <span class="material-icon" style="font-size:14px">cloud_off</span>
    <span>Offline</span>
  `;
  el.style.opacity = "0.6";
}
