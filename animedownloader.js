// ==UserScript==
// @name         Anime Infrastructure - Ultimate Bridge v4.1
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Full Nuke UI, Auto-Scan, GitHub Bridge, and Error-Free Navigation
// @author       Chaelri
// @match        *://*/*
// @match        https://chaelri.github.io/anime*
// @icon         https://www.google.com/s2/favicons?domain=livechart.me
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const HREF = window.location.href;
  const LOC = window.location.hostname;
  let originalOrder = [];
  let sortState = { rating: "none", title: "none", episodes: "none" };

  // ========================================================================================
  // ROUTING SYSTEM
  // ========================================================================================

  if (LOC.includes("livechart.me")) {
    HREF.includes("/anime")
      ? liveChartAnimeOnlyView()
      : liveChartAnimeListView();
  } else if (LOC.includes("animepahe.si")) {
    if (HREF.includes("?searchFilter=")) animePaheSearchAutoClick();
    else if (HREF.includes("/play/")) animePaheClicker();
    else if (HREF.includes("/anime/")) animePaheEpisodeList();
  } else if (LOC.includes("pahe.win")) paheClicker();
  else if (LOC.includes("kwik.cx")) kwikClicker();
  else if (HREF.includes("chaelri.github.io/anime")) githubBucketView();

  // ========================================================================================
  // ANIMEPAHE: PLAYER, SCANNER, & NUKE UI
  // ========================================================================================

  function animePaheClicker() {
    const isAuto =
      new URLSearchParams(window.location.search).get("auto") === "true";

    let findData = setInterval(() => {
      const dlMenu = document.getElementById("pickDownload");
      const scrollArea = document.querySelector("#scrollArea");
      const infoArea = document.querySelector(".theatre-info");
      const episodeBtn = document.getElementById("episodeMenu");

      if (dlMenu && scrollArea && infoArea && episodeBtn) {
        clearInterval(findData);

        const dlLinks = Array.from(dlMenu.querySelectorAll("a.dropdown-item"))
          .filter(
            (a) =>
              !a
                .querySelector(".badge-warning")
                ?.innerText.toLowerCase()
                .includes("eng")
          )
          .sort(
            (a, b) =>
              parseInt(b.innerText.match(/(\d+)p/)?.[1] || 0) -
              parseInt(a.innerText.match(/(\d+)p/)?.[1] || 0)
          );

        const title =
          infoArea.querySelector("h1 a")?.getAttribute("title") || "Anime";
        const currentEp = episodeBtn.innerText.match(/\d+/)[0];
        const allEpLinks = Array.from(
          scrollArea.querySelectorAll("a.dropdown-item")
        );
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
            nextUrl: nextUrl,
            prevUrl: prevUrl,
            quality: dlLinks[0].innerText.split("(")[0].trim(),
            title: title,
            progress: `${currentEp} / ${actualTotal}`,
            auto: isAuto,
          };

          // Save to Bucket
          let bucket = JSON.parse(GM_getValue("anime_bucket", "[]"));
          if (!bucket.find((i) => i.link === data.downloadUrl)) {
            bucket.push({
              title: data.title,
              progress: data.progress,
              link: data.downloadUrl,
              quality: data.quality,
              date: new Date().toLocaleDateString(),
            });
            GM_setValue("anime_bucket", JSON.stringify(bucket));
          }

          renderNukeUI(data);

          if (data.auto) {
            setTimeout(() => {
              if (data.nextUrl) window.location.href = data.nextUrl;
              else window.location.href = "https://chaelri.github.io/anime";
            }, 1200);
          }
        }
      }
    }, 100);
  }

  function renderNukeUI(data) {
    window.stop();
    let lastId = window.setTimeout(() => {}, 0);
    while (lastId--) {
      window.clearTimeout(lastId);
      window.clearInterval(lastId);
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
                .save-pill { background: #111; color: #555; font-size: 0.8rem; border: 1px solid #181818; pointer-events: none; }
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
                    <a href="${
                      data.downloadUrl
                    }" target="_blank" class="pill dl-pill">DOWNLOAD NOW</a>
                    <div class="pill save-pill">SAVED TO BUCKET</div>
                    <div class="nav-row">
                        <a href="${data.prevUrl || "#"}" class="nav-pill ${
      data.prevUrl ? "" : "disabled"
    }">PREVIOUS</a>
                        <a href="${
                          data.nextUrl
                            ? data.nextUrl.replace(/[&?]auto=true/, "")
                            : "#"
                        }" class="nav-pill ${
      data.nextUrl ? "" : "disabled"
    }">NEXT</a>
                    </div>
                    <div id="auto-area">
                        ${
                          data.auto
                            ? `<div class="auto-status">AUTO-SCANNING...</div><button id="btn-stop-auto" class="stop-btn">CANCEL AUTO-PILOT</button>`
                            : `<button id="btn-start-auto" class="pill" style="background:none; color:var(--accent); font-size:0.7rem">ENABLE AUTO-PILOT</button>`
                        }
                    </div>
                </div>
            </div>
        </body>
        `;

    // ATTACH JS EVENTS (Fixes ReferenceError)
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
        window.location.href = window.location.href.replace(
          /[&?]auto=true/,
          ""
        );
      };
    }
  }

  // ========================================================================================
  // GITHUB BUCKET: VIEW & DOWNLOAD ALL
  // ========================================================================================

  function githubBucketView() {
    const renderBucket = () => {
      const bucket = JSON.parse(GM_getValue("anime_bucket", "[]"));
      const container = document.getElementById("link-bucket");
      const header = document.querySelector("header");
      if (!container || !header) return;

      if (!document.getElementById("dl-all-btn") && bucket.length > 0) {
        const dlAll = document.createElement("button");
        dlAll.id = "dl-all-btn";
        dlAll.innerHTML = `<span class="material-symbols-outlined">download_for_offline</span> DOWNLOAD ALL`;
        dlAll.onclick = () => {
          bucket.forEach((item) => {
            //window.open(item.link);
            GM_openInTab(item.link, { active: false, insert: true });
          });
        };
        header.appendChild(dlAll);
      }

      if (bucket.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center opacity-20 tracking-widest text-xl">BUCKET IS EMPTY</div>`;
        return;
      }

      container.innerHTML = "";
      [...bucket].reverse().forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "anime-card-aesthetic";
        card.innerHTML = `<div class="card-header"><div class="ep-badge">EP ${item.progress}</div><div class="quality-label">${item.quality}</div></div><div class="card-body"><h3 class="card-title">${item.title}</h3><p class="card-meta">Added ${item.date}</p><div class="card-actions"><a href="${item.link}" target="_blank" class="dl-btn">DOWNLOAD</a><button class="del-btn" data-index="${index}"><span class="material-symbols-outlined">delete</span></button></div></div>`;
        container.appendChild(card);
      });

      container.querySelectorAll(".del-btn").forEach((btn) => {
        btn.onclick = () => {
          let cur = JSON.parse(GM_getValue("anime_bucket", "[]"));
          cur.reverse().splice(btn.dataset.index, 1);
          GM_setValue("anime_bucket", JSON.stringify(cur.reverse()));
          renderBucket();
        };
      });
    };
    setTimeout(renderBucket, 300);
  }

  // ========================================================================================
  // LIVECHART: INFRASTRUCTURE RECONSTRUCTION
  // ========================================================================================

  function liveChartAnimeListView() {
    const wait = setInterval(() => {
      const animeCards = document.querySelectorAll(".anime-card");
      const headerBox = document.querySelector(".page-header-box");

      if (animeCards.length > 0 && headerBox) {
        clearInterval(wait);

        const seasonTitle =
          headerBox.querySelector("h1")?.innerText || "Anime List";
        const seasonSub =
          headerBox.querySelector(".page-header-box__sub-title")?.innerText ||
          "";
        const prevLink = headerBox.querySelector(".-previous a")?.href;
        const nextLink = headerBox.querySelector(".-next a")?.href;

        const scrapedData = Array.from(animeCards).map((card) => {
          const title =
            card.querySelector(".main-title a")?.innerText.trim() || "N/A";
          const genres = Array.from(
            card.querySelectorAll(".anime-tags li a")
          ).map((g) => g.innerText.trim());

          const img = card.querySelector(".poster-container img");
          let thumbnail = "N/A";
          if (img) {
            const srcset = img.getAttribute("srcset");
            thumbnail = srcset
              ? srcset.split(",").pop().trim().split(" ")[0]
              : img.src;
          }

          const rating =
            card
              .querySelector(".anime-avg-user-rating")
              ?.innerText.trim()
              .split(" ")[0] || "N/A";
          const epMeta = card.querySelector(".anime-episodes")?.innerText || "";
          const epParts = epMeta.split("×");
          let totalEpisodes = epParts[0]?.match(/(\d+)/)?.[1] || "??";
          let duration = epParts[1]?.trim() || "N/A";

          const releaseInfo =
            card.querySelector(".release-schedule-info")?.innerText || "";
          const upcomingEpMatch = releaseInfo.match(/EP(\d+)/);
          let currentEpisodes = "0";

          if (upcomingEpMatch) {
            currentEpisodes = Math.max(
              0,
              parseInt(upcomingEpMatch[1]) - 1
            ).toString();
          } else {
            const countPart = epParts[0]?.trim() || "";
            if (countPart.includes("of")) {
              currentEpisodes = countPart.match(/(\d+)\s+of/)?.[1] || "0";
            } else if (totalEpisodes !== "??") {
              currentEpisodes = totalEpisodes;
            }
          }

          // Capture Raw Timestamp for Dynamic Timer
          const countdownEl = card.querySelector("time[data-timestamp]");
          const timestamp = countdownEl
            ? parseInt(countdownEl.getAttribute("data-timestamp"))
            : null;
          const countdownStatic = countdownEl
            ? countdownEl.innerText.trim()
            : "Finished";

          const studio =
            card.querySelector(".anime-studios li a")?.innerText.trim() ||
            "N/A";
          const description =
            card.querySelector(".anime-synopsis")?.innerText.trim() ||
            "No description available.";
          const downloadLink = `https://animepahe.si/anime?searchFilter=${encodeURIComponent(
            title
          )}&auto=true`;

          return {
            title,
            rating,
            genres,
            thumbnail,
            currentEpisodes,
            totalEpisodes,
            duration,
            countdown: countdownStatic,
            timestamp,
            studio,
            description,
            downloadLink,
          };
        });

        reconstructLiveChartUI(scrapedData, {
          seasonTitle,
          seasonSub,
          prevLink,
          nextLink,
        });
      }
    }, 100);
  }

  function reconstructLiveChartUI(data, nav) {
    window.stop();
    const newHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>INFRASTRUCTURE | ${nav.seasonTitle}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" />
        <style>
            :root { --bg: #050505; --card: #0e0e0e; --accent: #3B97FC; --text: #fff; --text-muted: #888; --border: #1a1a1a; }
            * { box-sizing: border-box; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 0; line-height: 1.5; overflow-x: hidden; }
            header { background: #000; border-bottom: 1px solid var(--border); padding: 20px; position: sticky; top: 0; z-index: 1000; }
            .nav-container { max-width: 1400px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
            .season-nav { display: flex; align-items: center; gap: 20px; }
            .season-info { text-align: center; }
            .season-info h1 { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -1px; }
            .season-info span { font-size: 0.7rem; color: var(--accent); text-transform: uppercase; letter-spacing: 2px; font-weight: 800; }
            .nav-btn { background: var(--card); border: 1px solid var(--border); color: white; padding: 8px; border-radius: 50%; cursor: pointer; display: flex; text-decoration: none; transition: 0.2s; }
            .nav-btn:hover { background: var(--border); transform: scale(1.1); }
            .toolbar { max-width: 1400px; margin: 20px auto; padding: 0 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: center; }
            .search-box { flex: 1; min-width: 300px; position: relative; }
            .search-box input { width: 100%; background: var(--card); border: 1px solid var(--border); padding: 14px 20px; border-radius: 12px; color: white; outline: none; font-weight: 600; font-size: 0.9rem; }
            .filter-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; }
            .sort-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-muted); padding: 10px 20px; border-radius: 100px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap; transition: 0.2s; }
            .sort-btn.active { color: var(--accent); border-color: var(--accent); background: rgba(59, 151, 252, 0.1); }

            .main-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 15px; max-width: 1400px; margin: 0 auto; padding: 20px; }
            .infra-card { background: var(--card); border: 1px solid var(--border); border-radius: 15px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s, border-color 0.3s; position: relative; }
            .infra-card:hover { transform: translateY(-5px); border-color: var(--accent); }

            .poster-area { height: 310px; width: 100%; overflow: hidden; position: relative; background: #111; }
            .poster-area img { width: 100%; height: 100%; object-fit: cover; transition: 0.5s; display: block; }

            .rating-badge { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.85); padding: 4px 8px; border-radius: 6px; font-weight: 800; color: #ffab00; border: 1px solid #333; font-size: 0.75rem; backdrop-filter: blur(5px); }
            .ep-status { position: absolute; bottom: 12px; left: 12px; background: var(--accent); color: white; padding: 4px 10px; border-radius: 100px; font-weight: 800; font-size: 0.65rem; box-shadow: 0 4px 15px rgba(59,151,252,0.3); }

            .card-body { padding: 15px; flex: 1; display: flex; flex-direction: column; }
            .card-title { font-size: 0.95rem; font-weight: 800; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; letter-spacing: -0.3px; }
            .studio-line { font-size: 0.65rem; color: var(--accent); font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
            .description { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

            .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 15px; }
            .tag { font-size: 0.6rem; background: #181818; padding: 3px 8px; border-radius: 4px; color: #888; font-weight: 600; border: 1px solid #222; }

            .meta-footer { margin-top: auto; border-top: 1px solid var(--border); padding-top: 12px; display: flex; justify-content: space-between; align-items: center; }
            .countdown-box { font-size: 0.7rem; color: #ffab00; font-weight: 800; }
            .dl-btn { background: #fff; color: #000; text-decoration: none; padding: 8px 18px; border-radius: 10px; font-weight: 800; font-size: 0.75rem; transition: 0.2s; border: none; cursor: pointer; display: inline-block; }
            .dl-btn:hover { background: var(--accent); color: white; }

            @media (max-width: 1024px) {
                .main-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
                .poster-area { height: 270px; }
            }
            @media (max-width: 768px) {
                .main-grid { grid-template-columns: 1fr; padding: 10px; }
                .infra-card { flex-direction: row; height: 160px; }
                .poster-area { width: 110px; height: 100%; flex-shrink: 0; }
                .card-body { padding: 10px; }
                .description, .tags, .rating-badge { display: none; }
                .meta-footer { border: none; padding-top: 5px; }
            }
        </style>
    </head>
    <body>
        <header>
            <div class="nav-container">
                <div class="season-nav">
                    <a href="${
                      nav.prevLink || "#"
                    }" class="nav-btn"><span class="material-symbols-outlined">arrow_back_ios_new</span></a>
                    <div class="season-info">
                        <span>${nav.seasonSub}</span>
                        <h1>${nav.seasonTitle}</h1>
                    </div>
                    <a href="${
                      nav.nextLink || "#"
                    }" class="nav-btn"><span class="material-symbols-outlined">arrow_forward_ios</span></a>
                </div>
                <div class="global-actions">
                    <a href="https://chaelri.github.io/anime" class="sort-btn" style="text-decoration:none; color:var(--accent); border-color:var(--accent)">BUCKET</a>
                </div>
            </div>
        </header>
        <div class="toolbar">
            <div class="search-box"><input type="text" id="infra-search" placeholder="Search title, studio, or genre..."></div>
            <div class="filter-row">
                <button class="sort-btn" data-sort="rating">Rating</button>
                <button class="sort-btn" data-sort="title">Title</button>
                <button class="sort-btn" data-sort="episodes">Progress</button>
            </div>
        </div>
        <div id="infra-grid" class="main-grid"></div>
        <script>
            const fullData = ${JSON.stringify(data)};
            let currentFilter = "";
            let currentSort = { key: null, dir: 1 };

            function updateCountdowns() {
                const now = Math.floor(Date.now() / 1000);
                document.querySelectorAll('[data-ts]').forEach(el => {
                    const target = parseInt(el.dataset.ts);
                    if (!target) return;

                    const diff = target - now;
                    if (diff <= 0) {
                        el.innerText = "Releasing Now";
                        return;
                    }

                    const d = Math.floor(diff / 86400);
                    const h = Math.floor((diff % 86400) / 3600);
                    const m = Math.floor((diff % 3600) / 60);
                    const s = diff % 60;
                    el.innerText = \`\${d}d \${h}h \${m}m \${s}s\`;
                });
            }

            function render() {
                const grid = document.getElementById("infra-grid");
                let items = [...fullData];
                if (currentFilter) {
                    const q = currentFilter.toLowerCase();
                    items = items.filter(i => i.title.toLowerCase().includes(q) || i.studio.toLowerCase().includes(q) || i.genres.some(g => g.toLowerCase().includes(q)));
                }
                if (currentSort.key) {
                    items.sort((a, b) => {
                        let valA = a[currentSort.key]; let valB = b[currentSort.key];
                        if (currentSort.key === 'rating') { valA = valA === 'N/A' ? -1 : parseFloat(valA); valB = valB === 'N/A' ? -1 : parseFloat(valB); }
                        else if (currentSort.key === 'episodes') { valA = parseInt(a.currentEpisodes) || 0; valB = parseInt(b.currentEpisodes) || 0; }
                        else { valA = (valA || "").toLowerCase(); valB = (valB || "").toLowerCase(); }
                        return valA < valB ? -1 * currentSort.dir : (valA > valB ? 1 * currentSort.dir : 0);
                    });
                }
                grid.innerHTML = items.map(item => \`
                    <div class="infra-card">
                        <div class="poster-area">
                            <img src="\${item.thumbnail}" loading="lazy" onerror="this.src='https://placehold.co/300x450/111/444?text=No+Poster'">
                            <div class="rating-badge">\${item.rating}</div>
                            <div class="ep-status">EP \${item.currentEpisodes} / \${item.totalEpisodes}</div>
                        </div>
                        <div class="card-body">
                            <div class="studio-line">\${item.studio}</div>
                            <div class="card-title" title="\${item.title}">\${item.title}</div>
                            <div class="description">\${item.description}</div>
                            <div class="tags">\${item.genres.map(g => \`<span class="tag">\${g}</span>\`).join('')}</div>
                            <div class="meta-footer">
                                <div class="countdown-box" data-ts="\${item.timestamp}">\${item.countdown}</div>
                                <a href="\${item.downloadLink}" target="_blank" class="dl-btn">SCAN</a>
                            </div>
                        </div>
                    </div>\`).join('');

                updateCountdowns();
            }

            document.getElementById("infra-search").oninput = (e) => { currentFilter = e.target.value; render(); };
            document.querySelectorAll(".sort-btn[data-sort]").forEach(btn => {
                btn.onclick = () => {
                    const key = btn.dataset.sort;
                    if (currentSort.key === key) currentSort.dir *= -1;
                    else { currentSort.key = key; currentSort.dir = (key === 'rating' || key === 'episodes') ? -1 : 1; }
                    document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    render();
                };
            });

            render();
            setInterval(updateCountdowns, 1000);
        <\/script>
    </body>
    </html>`;
    document.open();
    document.write(newHTML);
    document.close();
  }

  // ========================================================================================
  // MISC: SEARCH & HELPERS
  // ========================================================================================

  function animePaheSearchAutoClick() {
    const searchTerm = new URLSearchParams(window.location.search).get(
      "searchFilter"
    );
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
          const first = document.querySelector(
            ".search-results li[data-index='0'] a"
          );
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

  function animePaheEpisodeList() {
    const epNum =
      new URLSearchParams(window.location.search).get("episodeNumber") || 1;
    const auto =
      new URLSearchParams(window.location.search).get("auto") === "true";
    setTimeout(() => {
      document
        .querySelector(".btn-group.btn-group-toggle")
        ?.children[0]?.click();
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

  function liveChartAnimeOnlyView() {
    appendCustomCSS();
    const h4 = document.querySelector("h4");
    if (!h4) return;
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    const btn = createButton("Scan All Episodes", true);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "input-episode";
    input.value = 1;
    btn.onclick = () =>
      window.open(
        `https://animepahe.si/anime?searchFilter=${encodeURIComponent(
          h4.innerText.split("\n")[0].trim()
        )}&episodeNumber=${input.value}&auto=true`
      );
    wrapper.append(btn, input);
    h4.appendChild(wrapper);
  }

  function kwikClicker() {
    // Check if we are on iOS/iPadOS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setTimeout(() => {
      if (document.title.includes("Cloudflare")) return;

      const idChecker = setInterval(() => {
        const btn = document.querySelector(".button.is-success");
        const form = document.querySelector('form[action*="kwik.cx/d/"]');
        const tokenInput = document.querySelector('input[name="_token"]');

        if (btn && form && tokenInput) {
          clearInterval(idChecker);

          // --- START DOWNLOAD LOGIC ---
          if (isIOS) {
            // iOS WORKAROUND: Send to Shortcut
            const payload = JSON.stringify([
              {
                url: form.action,
                token: tokenInput.value,
              },
            ]);

            if (typeof GM_setClipboard !== "undefined") {
              GM_setClipboard(payload);
              // Open the shortcut tunnel
              window.location.href =
                "shortcuts://run-shortcut?name=BatchDownloader";
            }
          } else {
            // DESKTOP LOGIC: Standard auto-click
            btn.click();
          }
          // --- END DOWNLOAD LOGIC ---

          // UI Cleanup (Existing Logic)
          const title = document.querySelector(".title");
          if (title)
            title.innerText = title.innerText
              .replace("AnimePahe_", "")
              .replace(/_/g, " ");

          setTimeout(
            () =>
              document
                .querySelectorAll("iframe, nav, footer, .column.is-12")
                .forEach((el) => el.remove()),
            1000
          );

          setTimeout(() => {
            btn.style.cssText =
              "margin: auto; width: 150px; height: 150px; border-radius: 50%; border: none; font-size: 4rem; display:flex; align-items:center; justify-content:center; background:#3B97FC; color:white;";
            let c = 16;
            const t = setInterval(() => {
              if (c > 0) btn.innerHTML = --c;
              else {
                clearInterval(t);
                // If iOS, close the tab automatically after the shortcut starts
                if (isIOS) window.close();
              }
            }, 1000);
          }, 1000);
        }
      }, 100);
    }, 2000);
  }

  function paheClicker() {
    const wait = setInterval(() => {
      const btn = document.querySelector(".col-sm-6");
      if (btn?.innerText.includes("Continue")) {
        btn.querySelector("a")?.click();
        clearInterval(wait);
      }
    }, 100);
  }

  function createButton(n, s) {
    const b = document.createElement("button");
    b.type = "submit";
    b.innerText = n;
    b.className = "aesthetic-download-btn";
    if (s) b.style.width = "fit-content";
    return b;
  }

  function appendCustomCSS() {
    if (document.getElementById("aesthetic-styles")) return;
    const style = document.createElement("style");
    style.id = "aesthetic-styles";
    style.innerText = `
            .anime-card { border-radius: 16px !important; border: 1px solid #eee !important; overflow: hidden !important; box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important; transition: transform 0.2s ease; background: white !important; }
            .main-title a { color: #333 !important; font-weight: 800 !important; font-size: 1.1rem !important; }
            .custom-ep-badge { position: absolute; top: 10px; right: 10px; background: rgba(59, 151, 252, 0.9); color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; backdrop-filter: blur(4px); z-index: 10; }
            .anime-avg-user-rating { background: #fdf2f2 !important; color: #e02424 !important; border-radius: 20px !important; padding: 2px 10px !important; font-weight: bold !important; border: 1px solid #fbd5d5 !important; }
            .aesthetic-download-btn { background: #3B97FC !important; color: white !important; border: none; padding: 12px; font-weight: bold; width: 100%; cursor: pointer; transition: background 0.2s; border-radius: 0 0 12px 12px; }
            .custom-toolbar { display: flex; gap: 8px; align-items: center; padding: 10px; }
            .custom-sort-btn { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 16px; border-radius: 25px; cursor: pointer; font-size: 13px; font-weight: 600; color: #374151; }
            .custom-sort-btn.active { background: #eff6ff; border-color: #3B97FC; color: #3B97FC; }
            .custom-sort-btn.reset { background: #3B97FC; color: white; border: none; }
            .aesthetic-search { border: 1px solid #e5e7eb; border-radius: 25px; padding: 8px 20px; outline: none; width: 250px; margin-right: 15px; }
            .input-episode { border: 1px solid #eee; border-radius: 8px; width: 40px; text-align: center; font-weight: bold; margin-left: 10px; }
        `;
    document.head.appendChild(style);
  }
})();
