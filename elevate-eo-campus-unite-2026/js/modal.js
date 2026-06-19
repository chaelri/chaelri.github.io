// Lightweight promise-based confirm modal for the Campus UNITE app.
// Styled to match the dark-navy + yellow-tape + red theme. ESC + backdrop click cancel.

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.id = "cu-modal-host";
  document.body.appendChild(host);
  return host;
}

export function confirmModal({
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  icon = null, // material symbol name, e.g. "delete"
  singleAction = false, // hide the cancel button — for info/alerts
} = {}) {
  return new Promise((resolve) => {
    const h = ensureHost();
    const accentVar = danger ? "var(--red)" : "var(--tape)";
    const confirmBg = danger ? "var(--red)" : "var(--tape)";
    const confirmFg = danger ? "var(--on-red, #fff)" : "var(--on-tape, #07091a)";
    const iconHtml = icon
      ? `<span class="material-symbols-outlined" style="font-size:28px;color:${accentVar};">${icon}</span>`
      : "";

    h.innerHTML = `
      <div class="cu-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cu-modal-title">
        <div class="cu-modal-panel">
          <div class="cu-modal-head">
            ${iconHtml}
            <div id="cu-modal-title" class="cu-modal-title">${escapeHtml(title)}</div>
          </div>
          ${message ? `<div class="cu-modal-body">${message}</div>` : ""}
          <div class="cu-modal-actions">
            ${singleAction ? "" : `<button type="button" class="cu-modal-btn cu-modal-cancel">${escapeHtml(cancelText)}</button>`}
            <button type="button" class="cu-modal-btn cu-modal-confirm" style="background:${confirmBg};color:${confirmFg};">
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      </div>
    `;

    const backdrop = h.querySelector(".cu-modal-backdrop");
    const $confirm = h.querySelector(".cu-modal-confirm");
    const $cancel  = h.querySelector(".cu-modal-cancel");

    requestAnimationFrame(() => backdrop.classList.add("is-open"));

    function close(result) {
      backdrop.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => { h.innerHTML = ""; resolve(result); }, 160);
    }
    function onKey(e) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(false); });
    if ($cancel) $cancel.addEventListener("click", () => close(false));
    $confirm.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKey);

    setTimeout(() => $confirm.focus(), 0);
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}
