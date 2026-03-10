(function () {
  "use strict";

  const HREF = window.location.href;

  if (HREF.includes("?searchFilter=")) animePaheSearchAutoClick();
  else if (HREF.includes("/play/")) animePaheClicker();
  else if (HREF.includes("/anime/")) animePaheEpisodeList();

  // ── PLAYER PAGE: extract best download link, open it, navigate to next ──

  function animePaheClicker() {
    const isAuto =
      new URLSearchParams(window.location.search).get("auto") === "true";

    const findData = setInterval(() => {
      const dlMenu = document.getElementById("pickDownload");
      const scrollArea = document.querySelector("#scrollArea");
      const infoArea = document.querySelector(".theatre-info");
      const episodeBtn = document.getElementById("episodeMenu");

      if (dlMenu && scrollArea && infoArea && episodeBtn) {
        clearInterval(findData);

        const dlLinks = Array.from(dlMenu.querySelectorAll("a.dropdown-item"))
          .filter(
            (a) =>
              !a.querySelector(".badge-warning")?.innerText.toLowerCase().includes("eng")
          )
          .sort(
            (a, b) =>
              parseInt(b.innerText.match(/(\d+)p/)?.[1] || 0) -
              parseInt(a.innerText.match(/(\d+)p/)?.[1] || 0)
          );

        const title =
          infoArea.querySelector("h1 a")?.getAttribute("title") || "Anime";
        const currentEp = episodeBtn.innerText.match(/\d+/)[0];
        const allEpLinks = Array.from(scrollArea.querySelectorAll("a.dropdown-item"));
        const epNumbers = allEpLinks.map((el) =>
          parseInt(el.innerText.match(/\d+/)?.[0] || 0)
        );
        const actualTotal = Math.max(...epNumbers);

        const activeLink = scrollArea.querySelector("a.active");
        const activeIdx = allEpLinks.indexOf(activeLink);
        const nextUrlRaw = allEpLinks[activeIdx + 1]?.href;
        const nextUrl = nextUrlRaw
          ? nextUrlRaw + (nextUrlRaw.includes("?") ? "&" : "?") + "auto=true"
          : null;
        const prevUrl = allEpLinks[activeIdx - 1]?.href || null;

        if (dlLinks[0]?.href) {
          const data = {
            downloadUrl: dlLinks[0].href,
            nextUrl,
            prevUrl,
            quality: dlLinks[0].innerText.split("(")[0].trim(),
            title,
            progress: `${currentEp} / ${actualTotal}`,
            auto: isAuto,
          };

          renderNukeUI(data);

          if (isAuto) {
            // Open download in background tab immediately
            chrome.runtime.sendMessage({ action: "openTab", url: data.downloadUrl });

            // Move to next episode quickly
            setTimeout(() => {
              if (data.nextUrl) {
                window.location.href = data.nextUrl;
              }
              // Last episode — stay on page, UI shows SERIES COMPLETE
            }, 500);
          }
        }
      }
    }, 100);
  }

  // ── NUKE UI: minimal full-page UI ──

  function renderNukeUI(data) {
    window.stop();
    let lastId = window.setTimeout(() => {}, 0);
    while (lastId--) {
      window.clearTimeout(lastId);
      window.clearInterval(lastId);
    }

    const isLastEp = !data.nextUrl;
    let autoAreaHTML;
    if (data.auto) {
      autoAreaHTML = isLastEp
        ? `<div class="auto-status" style="color:#00e676">SERIES COMPLETE!</div>`
        : `<div class="auto-status">AUTO-SCANNING...</div>
           <button id="btn-stop-auto" class="stop-btn">CANCEL AUTO-PILOT</button>`;
    } else {
      autoAreaHTML = `<button id="btn-start-auto" class="pill" style="background:none; color:var(--accent); font-size:0.7rem">ENABLE AUTO-PILOT</button>`;
    }

    document.documentElement.innerHTML = `
<head>
  <title>${data.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #050505; --accent: #3B97FC; }
    html, body { background: var(--bg) !important; margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none !important; }
    #nuke-body { pointer-events: auto !important; position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2147483647; background: var(--bg); font-family: 'Inter', sans-serif; color: white; text-align: center; }
    .title { font-weight: 800; font-size: 2.2rem; margin-bottom: 5px; letter-spacing: -1.5px; line-height: 1.1; padding: 0 20px; }
    .ep { font-size: 0.9rem; color: var(--accent); margin-bottom: 40px; letter-spacing: 3px; display: flex; align-items: center; gap: 15px; font-weight: bold; }
    .ep::before, .ep::after { content: ""; height: 1px; width: 30px; background: #222; }
    .btn-stack { display: flex; flex-direction: column; gap: 12px; width: 340px; }
    .pill { padding: 20px 0; width: 100%; font-size: 1.1rem; font-weight: 600; border-radius: 100px; text-decoration: none; display: flex; align-items: center; justify-content: center; transition: 0.3s; cursor: pointer; border: none; }
    .dl-pill { background: var(--accent); color: white; box-shadow: 0 10px 40px rgba(59,151,252,0.2); }
    .dl-pill:hover { transform: translateY(-3px); background: #2563eb; }
    .nav-row { display: flex; gap: 10px; }
    .nav-pill { flex: 1; padding: 15px 0; background: #111; color: #666; border-radius: 100px; text-decoration: none; font-size: 0.8rem; border: 1px solid #181818; font-weight: bold; }
    .nav-pill:hover:not(.disabled) { color: white; background: #181818; }
    .disabled { opacity: 0.1; pointer-events: none; }
    .auto-status { margin-top: 30px; font-weight: 800; font-size: 0.7rem; color: #ffab00; text-transform: uppercase; letter-spacing: 2px; }
    .stop-btn { background: none; border: 1px solid #222; color: #444; padding: 8px 15px; border-radius: 8px; margin-top: 15px; cursor: pointer; font-size: 0.6rem; font-weight: bold; }
  </style>
</head>
<body>
  <div id="nuke-body">
    <div class="title">${data.title}</div>
    <div class="ep">EPISODE ${data.progress}</div>
    <div class="btn-stack">
      <a href="${data.downloadUrl}" target="_blank" class="pill dl-pill">DOWNLOAD NOW</a>
      <div class="nav-row">
        <a href="${data.prevUrl || "#"}" class="nav-pill ${data.prevUrl ? "" : "disabled"}">PREVIOUS</a>
        <a href="${data.nextUrl ? data.nextUrl.replace(/[&?]auto=true/, "") : "#"}" class="nav-pill ${data.nextUrl ? "" : "disabled"}">NEXT</a>
      </div>
      <div id="auto-area">${autoAreaHTML}</div>
    </div>
  </div>
</body>
`;

    const startBtn = document.getElementById("btn-start-auto");
    const stopBtn = document.getElementById("btn-stop-auto");

    if (startBtn) {
      startBtn.onclick = () => {
        const sep = window.location.href.includes("?") ? "&" : "?";
        window.location.href = window.location.href + sep + "auto=true";
      };
    }
    if (stopBtn) {
      stopBtn.onclick = () => {
        window.location.href = window.location.href.replace(/[&?]auto=true/, "");
      };
    }
  }

  // ── SEARCH PAGE: auto-fill and click first result ──

  function animePaheSearchAutoClick() {
    const searchTerm = new URLSearchParams(window.location.search).get("searchFilter");
    const auto = new URLSearchParams(window.location.search).get("auto");
    const input = document.querySelector("input[name='q']");

    if (input && searchTerm) {
      input.focus();
      input.value = searchTerm;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "a", keyCode: 65, bubbles: true })
        );
        input.dispatchEvent(
          new KeyboardEvent("keyup", { key: "a", keyCode: 65, bubbles: true })
        );
        const wait = setInterval(() => {
          const first = document.querySelector(".search-results li[data-index='0'] a");
          if (first) {
            clearInterval(wait);
            let target = first.href;
            if (auto === "true")
              target += (target.includes("?") ? "&" : "?") + "auto=true";
            window.location.href = target;
          }
        }, 100);
      }, 50);
    }
  }

  // ── EPISODE LIST PAGE: click episode and navigate to player ──

  function animePaheEpisodeList() {
    const epNum =
      new URLSearchParams(window.location.search).get("episodeNumber") || 1;
    const auto =
      new URLSearchParams(window.location.search).get("auto") === "true";

    setTimeout(() => {
      document.querySelector(".btn-group.btn-group-toggle")?.children[0]?.click();
      setTimeout(() => {
        const list = document.querySelectorAll(".episode-list.row > div");
        const link = (list[epNum - 1] || list[0])?.querySelector("a");
        if (link) {
          let target = link.href;
          if (auto) target += (target.includes("?") ? "&" : "?") + "auto=true";
          window.location.href = target;
        }
      }, 1000);
    }, 1000);
  }
})();
