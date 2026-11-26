/* tlw pick widget: <script src="/tlw.js"></script> at the end of any tlw page.
   Mark each option's choose button with data-pick="A" (add data-multi on <body> for multi-select).
   Adds a selected state to those buttons and a panel at the end of the page:
   your pick + comment box + submit. Submit POSTs to /submit (tools/tlw/serve.py). */
(() => {
  const multi = document.body.hasAttribute("data-multi");
  const picks = new Set();
  const css = `
  .tlw-pick-on{background:var(--pink,#db2777)!important;border-color:var(--pink,#db2777)!important;color:#fff!important}
  #tlwPanel{max-width:720px;margin:64px auto 0;padding:24px;border-radius:21px;background:var(--card,#1b2238);border:1px solid var(--line,rgba(255,255,255,.1));display:flex;flex-direction:column;gap:16px;font-family:inherit;color:var(--ink,#e6edf7)}
  #tlwPanel h2{font-size:24px;font-weight:800;line-height:1.1;margin:0}
  #tlwPanel .tlw-sel{color:var(--muted,#a9b0c0);font-size:15px;margin:0}
  #tlwPanel .tlw-sel b{color:var(--ink,#e6edf7)}
  #tlwPanel textarea{width:100%;min-height:96px;resize:vertical;padding:16px;border-radius:13px;border:1px solid var(--line,rgba(255,255,255,.1));background:var(--bg,#0f1424);color:inherit;font-size:16px;line-height:1.4;font-family:inherit}
  #tlwPanel textarea:focus{outline:3px solid var(--pink,#db2777);outline-offset:2px}
  #tlwPanel .tlw-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  #tlwSend{height:48px;padding:0 24px;border-radius:999px;border:0;background:var(--pink,#db2777);color:#fff;font-size:15px;font-weight:800;line-height:1;font-family:inherit;cursor:pointer}
  #tlwSend:disabled{opacity:.45;cursor:default}
  #tlwSend:focus-visible{outline:3px solid #fff;outline-offset:2px}
  #tlwMsg{font-size:15px;color:var(--muted,#a9b0c0)}`;
  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);

  const panel = document.createElement("section");
  panel.id = "tlwPanel";
  panel.innerHTML = `<h2>your answer</h2>
    <p class="tlw-sel" id="tlwSel">Nothing picked yet.</p>
    <textarea id="tlwNote" placeholder="Anything to add or change (optional)"></textarea>
    <div class="tlw-row"><button id="tlwSend" disabled>submit to Claude</button><span id="tlwMsg"></span></div>`;
  (document.querySelector(".wrap") || document.body).appendChild(panel);

  const sel = panel.querySelector("#tlwSel"), note = panel.querySelector("#tlwNote"),
        send = panel.querySelector("#tlwSend"), msg = panel.querySelector("#tlwMsg");
  const btns = () => [...document.querySelectorAll("[data-pick]")];
  const label = b => b.dataset.label || b.dataset.pick;
  const refresh = () => {
    btns().forEach(b => {
      const on = picks.has(b.dataset.pick);
      b.classList.toggle("tlw-pick-on", on);
      b.setAttribute("aria-pressed", on);
      if (!b.dataset.text) b.dataset.text = b.textContent;
      b.textContent = on ? "picked " + b.dataset.pick : b.dataset.text;
    });
    const names = btns().filter(b => picks.has(b.dataset.pick)).map(label);
    sel.innerHTML = names.length ? "Picked: <b>" + names.join(", ") + "</b>" : "Nothing picked yet.";
    send.disabled = !names.length && !note.value.trim();
    msg.textContent = "";
  };
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const k = b.dataset.pick;
    if (picks.has(k)) picks.delete(k);
    else { if (!multi) picks.clear(); picks.add(k); }
    refresh();
  });
  note.addEventListener("input", refresh);
  send.addEventListener("click", async () => {
    send.disabled = true; msg.textContent = "sending";
    const picked = btns().filter(b => picks.has(b.dataset.pick)).map(b => ({ id: b.dataset.pick, label: label(b) }));
    try {
      const r = await fetch("/submit", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: document.title, picked, comment: note.value.trim() }) });
      if (!r.ok) throw 0;
      msg.textContent = "sent. Claude has it.";
      send.textContent = "submit again";
      send.disabled = false;
    } catch { msg.textContent = "could not send. is the tlw server running?"; send.disabled = false; }
  });
  refresh();
})();
