(function () {
  "use strict";

  const HREF = window.location.href;

  if (HREF.includes("?searchFilter=")) animePaheSearchAutoClick();
  else if (HREF.includes("/play/")) animePaheClicker();
  else if (HREF.includes("/anime/")) animePaheEpisodeList();

  // ── PERSISTENT DOWNLOAD HISTORY (chrome.storage.local) ──

  function getAnimeHistory(animeId) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["animeHistory"], (result) => {
        const history = result.animeHistory || {};
        resolve(history[animeId] || { downloaded: [] });
      });
    });
  }

  function markDownloaded(animeId, epNum, title, poster) {
    if (!animeId || !epNum) return;
    chrome.storage.local.get(["animeHistory"], (result) => {
      const history = result.animeHistory || {};
      const anime = history[animeId] || { downloaded: [] };
      if (!anime.downloaded.includes(epNum)) anime.downloaded.push(epNum);
      anime.title = title;
      anime.poster = poster;
      anime.lastUpdated = Date.now();
      history[animeId] = anime;
      chrome.storage.local.set({ animeHistory: history });
    });
  }

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

        const qualities = dlLinks.map((a, i) => ({
          href: a.href,
          res: a.innerText.match(/(\d+)p/)?.[0] || "",
          size: a.innerText.match(/\(([^)]+)\)/)?.[1] || "",
          isBest: i === 0,
        }));

        const title =
          infoArea.querySelector("h1 a")?.getAttribute("title") || "Anime";
        const posterImg = infoArea.querySelector("img.anime-poster");
        // Prefer full-res poster over the .th. thumbnail if available
        const poster = posterImg
          ? (posterImg.src || "").replace(/\.th\.jpg$/, ".jpg")
          : null;
        const status =
          document.querySelector(".anime-status")?.innerText.trim() || null;
        const season =
          document.querySelector(".anime-season")?.innerText.trim() || null;
        const nextSnapshot =
          document.querySelector(".sequel img")?.dataset.src || null;
        const embedUrl =
          document.querySelector("#resolutionMenu .dropdown-item.active")?.dataset.src ||
          document.querySelector("#resolutionMenu .dropdown-item[data-src]")?.dataset.src ||
          null;
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
          const animeId = window.location.pathname.split("/")[2] || null;
          const epNum = parseInt(currentEp, 10);

          const episodes = allEpLinks.map((a) => ({
            num: parseInt(a.innerText.match(/\d+/)?.[0] || 0, 10),
            url: a.href,
            active: a === activeLink,
          }));

          getAnimeHistory(animeId).then((animeHist) => {
            const data = {
              animeId,
              epNum,
              downloadUrl: dlLinks[0].href,
              qualities,
              nextUrl,
              prevUrl,
              quality: dlLinks[0].innerText.split("(")[0].trim(),
              title,
              progress: `${currentEp} / ${actualTotal}`,
              auto: isAuto,
              poster,
              status,
              season,
              nextSnapshot,
              embedUrl,
              episodes,
              downloaded: animeHist.downloaded || [],
            };

            renderNukeUI(data);

            if (isAuto) {
              // Mark before firing — storage write is async but survives navigation
              markDownloaded(animeId, epNum, title, poster);
              chrome.runtime.sendMessage({
                action: "openTab",
                url: data.downloadUrl,
                animeId,
                animeTitle: title,
              });

              setTimeout(() => {
                if (data.nextUrl) {
                  window.location.href = data.nextUrl;
                }
                // Last episode — stay on page, UI shows SERIES COMPLETE
              }, 500);
            }
          });
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
      autoAreaHTML = `<button id="btn-start-auto" class="link-btn">ENABLE AUTO-PILOT</button>`;
    }

    const posterHTML = data.poster
      ? `<img class="poster" src="${data.poster}" alt="" onerror="this.style.display='none'">`
      : "";
    const metaBits = [];
    if (data.status) metaBits.push(data.status);
    if (data.season) metaBits.push(data.season);
    const metaHTML = metaBits.length
      ? `<div class="meta">${metaBits.join(" · ")}</div>`
      : "";
    const qualityHTML = (data.qualities || [])
      .map(
        (q) => `
          <a href="${q.href}" target="_blank" class="quality-btn ${q.isBest ? "best" : ""}" title="Download ${q.res}">
            <span class="q-res">${q.res}</span>
            ${q.size ? `<span class="q-size">· ${q.size}</span>` : ""}
          </a>`
      )
      .join("");

    const downloadedSet = new Set(data.downloaded || []);
    const doneCount = (data.episodes || []).filter((ep) => downloadedSet.has(ep.num)).length;
    const totalCount = (data.episodes || []).length;
    const gridHTML = (data.episodes || [])
      .map((ep) => {
        const done = downloadedSet.has(ep.num);
        const current = ep.active;
        const cls = ["ep-chip"];
        if (done) cls.push("done");
        if (current) cls.push("current");
        return `<a href="${ep.url}" class="${cls.join(" ")}" title="Episode ${ep.num}${done ? " (downloaded)" : ""}">${ep.num}</a>`;
      })
      .join("");
    const gridSectionHTML = totalCount
      ? `<div class="ep-label-row">
           <span class="ep-label">EPISODES</span>
           <span class="ep-progress">${doneCount} / ${totalCount} DOWNLOADED</span>
         </div>
         <div class="episode-grid">${gridHTML}</div>`
      : "";

    document.documentElement.innerHTML = `
<head>
  <title>${data.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0a;
      --fg: #fff;
      --fg-dim: rgba(255,255,255,0.55);
      --fg-ghost: rgba(255,255,255,0.25);
      --line: rgba(255,255,255,0.08);
      --line-hover: rgba(255,255,255,0.2);
      --accent: #3B97FC;
      --done: #00e676;
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg) !important; margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none !important; }
    #nuke-body { pointer-events: auto !important; position: fixed; inset: 0; z-index: 2147483647; background: var(--bg); font-family: 'Inter', sans-serif; color: var(--fg); overflow-y: auto; overflow-x: hidden; font-weight: 400; }
    .content-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 40px 60px; box-sizing: border-box; }

    .content { max-width: 900px; width: 100%; display: flex; flex-direction: column; gap: 40px; }

    .player-wrap { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 4px; overflow: hidden; }
    .player-wrap iframe { width: 100%; height: 100%; border: none; display: block; }

    .detail { display: grid; grid-template-columns: auto 1fr; gap: 64px; align-items: start; }

    .poster { width: 180px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px; display: block; }

    .info { min-width: 0; padding-top: 6px; }
    .title { font-weight: 600; font-size: 1.9rem; line-height: 1.15; letter-spacing: -0.5px; margin: 0 0 10px 0; }
    .meta { font-size: 0.8rem; color: var(--fg-dim); margin-bottom: 32px; font-weight: 400; }

    .ep { font-size: 0.7rem; color: var(--fg-dim); letter-spacing: 1.5px; font-weight: 500; margin-bottom: 20px; text-transform: uppercase; }

    .quality-row { display: flex; gap: 24px; margin-bottom: 36px; }
    .quality-btn { background: none; border: none; padding: 0; text-decoration: none; color: var(--fg-dim); font-size: 0.95rem; font-weight: 500; display: inline-flex; align-items: baseline; gap: 6px; transition: color 0.15s; cursor: pointer; }
    .quality-btn:hover { color: var(--fg); }
    .quality-btn.best { color: var(--accent); }
    .quality-btn.best:hover { color: var(--fg); }
    .q-res { font-weight: 500; }
    .q-size { font-size: 0.72rem; opacity: 0.7; font-weight: 400; }

    .ep-label-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
    .ep-label { font-size: 0.65rem; letter-spacing: 1.5px; color: var(--fg-ghost); font-weight: 500; text-transform: uppercase; }
    .ep-progress { font-size: 0.65rem; letter-spacing: 1px; color: var(--done); font-weight: 500; text-transform: uppercase; opacity: 0.8; }
    .episode-grid { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 40px; max-height: 180px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
    .episode-grid::-webkit-scrollbar { width: 4px; }
    .episode-grid::-webkit-scrollbar-thumb { background: var(--line); border-radius: 2px; }
    .ep-chip { min-width: 34px; height: 30px; padding: 0 8px; border-radius: 4px; background: none; color: var(--fg-ghost); display: inline-flex; align-items: center; justify-content: center; text-decoration: none; font-size: 0.72rem; font-weight: 500; border: 1px solid var(--line); transition: 0.12s ease; }
    .ep-chip:hover { color: var(--fg); border-color: var(--line-hover); }
    .ep-chip.done { color: var(--done); border-color: rgba(0,230,118,0.25); }
    .ep-chip.done:hover { color: var(--fg); border-color: var(--done); }
    .ep-chip.current { color: var(--accent); border-color: var(--accent); }
    .ep-chip.current.done { color: var(--done); border-color: var(--done); }

    .nav-row { display: flex; gap: 32px; margin-bottom: 24px; }
    .nav-pill { padding: 0; background: none; border: none; color: var(--fg-dim); text-decoration: none; font-size: 0.75rem; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; transition: color 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .nav-pill:hover:not(.disabled) { color: var(--fg); }
    .disabled { opacity: 0.2; pointer-events: none; }

    .auto-status { font-size: 0.7rem; color: #ffab00; letter-spacing: 1.5px; font-weight: 500; text-transform: uppercase; }
    .stop-btn { background: none; border: none; color: var(--fg-dim); padding: 0; margin-top: 8px; cursor: pointer; font-size: 0.7rem; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; font-family: inherit; transition: color 0.15s; }
    .stop-btn:hover { color: var(--fg); }

    #auto-area { display: flex; flex-direction: column; align-items: flex-start; }
    .link-btn { background: none; border: none; color: var(--accent); font-size: 0.7rem; font-weight: 500; letter-spacing: 1.5px; cursor: pointer; padding: 0; font-family: inherit; text-transform: uppercase; transition: color 0.15s; }
    .link-btn:hover { color: var(--fg); }
    .actions { display: flex; gap: 32px; align-items: center; flex-wrap: wrap; }

    /* Mobile fallback */
    @media (max-width: 720px) {
      .content-wrap { padding: 20px 16px 40px; }
      .content { gap: 28px; max-width: 360px; }
      .detail { grid-template-columns: 1fr; gap: 24px; justify-items: center; text-align: center; }
      .poster { width: 120px; }
      .info { text-align: center; width: 100%; padding-top: 0; }
      .title { font-size: 1.5rem; }
      .quality-row { justify-content: center; gap: 20px; }
      .ep-label-row { justify-content: center; gap: 24px; }
      .nav-row { justify-content: space-between; }
      .episode-grid { justify-content: center; }
      #auto-area { align-items: center; }
      .actions { justify-content: center; }
    }
  </style>
</head>
<body>
  <div id="nuke-body">
    <div class="content-wrap">
      <div class="content">
        ${data.embedUrl ? `<div class="player-wrap"><iframe id="player-iframe" src="${data.embedUrl}" allow="fullscreen; autoplay; picture-in-picture" frameborder="0"></iframe></div>` : ""}
        <div class="detail">
          <div class="poster-col">${posterHTML}</div>
          <div class="info">
            <div class="title">${data.title}</div>
            ${metaHTML}
            <div class="ep">Episode ${data.progress}</div>
            <div class="quality-row">${qualityHTML}</div>
            ${gridSectionHTML}
            <div class="nav-row">
              <a href="${data.prevUrl || "#"}" class="nav-pill ${data.prevUrl ? "" : "disabled"}">← Previous</a>
              <a href="${data.nextUrl ? data.nextUrl.replace(/[&?]auto=true/, "") : "#"}" class="nav-pill ${data.nextUrl ? "" : "disabled"}">Next →</a>
            </div>
            <div class="actions">
              <div id="auto-area">${autoAreaHTML}</div>
            </div>
          </div>
        </div>
      </div>
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

    // Mark episode as downloaded when user clicks any quality button
    document.querySelectorAll(".quality-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        markDownloaded(data.animeId, data.epNum, data.title, data.poster);
        // Reflect immediately in UI without waiting for a reload
        const chip = document.querySelector(`.ep-chip.current`);
        if (chip && !chip.classList.contains("done")) {
          chip.classList.add("done");
          if (!chip.querySelector(".check")) {
            const span = document.createElement("span");
            span.className = "check";
            span.textContent = "✓";
            chip.appendChild(span);
          }
        }
      });
    });
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
