const viewRoot = document.getElementById("view-root");
const tabs = Array.from(document.querySelectorAll(".tab"));

let currentTab = null;
let startX = null;

export function initTabs() {
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  initSwipe();
}

export async function switchTab(tab) {
  if (tab === currentTab) return;

  currentTab = tab;

  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));

  const res = await fetch(`./views/${tab}.html`);
  const html = await res.text();

  viewRoot.innerHTML = html;
  if (tab === "profile") {
    import("./profile.js").then((m) => m.bindProfile());
  }
}

function initSwipe() {
  viewRoot.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  viewRoot.addEventListener("touchend", (e) => {
    if (startX === null) return;

    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;

    if (Math.abs(diff) > 60) {
      const dir = diff > 0 ? -1 : 1;
      swipeTab(dir);
    }

    startX = null;
  });
}

function swipeTab(direction) {
  const order = ["home", "logs", "add", "insights", "profile"];
  const idx = order.indexOf(currentTab);
  const next = order[idx + direction];

  if (next) switchTab(next);
}
