// ==UserScript==
// @name         Anime Infrastructure - Ultimate Bridge v3.2
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Full Nuke UI, Auto-Scan, GitHub Bridge, and Download All
// @author       Chaelri
// @match        *://*/*
// @match        https://chaelri.github.io/anime*
// @icon         https://www.google.com/s2/favicons?domain=livechart.me
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";

  const HREF = window.location.href;
  const LOC = window.location.hostname;

  // --- GLOBAL ACTIONS ---
  window.startAuto = function () {
    const sep = window.location.href.includes("?") ? "&" : "?";
    window.location.href = window.location.href + sep + "auto=true";
  };

  window.stopAuto = function () {
    const cleanUrl = window.location.href.replace(/[&?]auto=true/, "");
    window.location.href = cleanUrl;
  };

  // --- ROUTING ---
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
  // GITHUB BUCKET: NEW DOWNLOAD ALL FEATURE
  // ========================================================================================

  function githubBucketView() {
    const renderBucket = () => {
      const bucket = JSON.parse(GM_getValue("anime_bucket", "[]"));
      const container = document.getElementById("link-bucket");
      const header = document.querySelector("header");
      if (!container || !header) return;

      // Inject Download All Button if it doesn't exist
      if (!document.getElementById("dl-all-btn") && bucket.length > 0) {
        const dlAll = document.createElement("button");
        dlAll.id = "dl-all-btn";
        dlAll.innerHTML = `<span class="material-symbols-outlined">download_for_offline</span> DOWNLOAD ALL`;
        dlAll.onclick = () => {
          if (
            confirm(
              `Open ${bucket.length} download tabs? Make sure popups are allowed!`
            )
          ) {
            bucket.forEach((item, index) => {
              setTimeout(() => {
                window.open(item.link, "_blank");
              }, index * 400);
            });
          }
        };
        header.appendChild(dlAll);
      }

      if (bucket.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center opacity-20 text-xl font-light tracking-widest">BUCKET IS EMPTY</div>`;
        document.getElementById("dl-all-btn")?.remove();
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
  // ANIMEPAHE PLAYER: THE NUKE DASHBOARD
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
        const poster = infoArea.querySelector("img")?.src;
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
            poster: poster,
            ep: currentEp,
            progress: `${currentEp} / ${actualTotal}`,
            auto: isAuto,
          };

          let bucket = JSON.parse(GM_getValue("anime_bucket", "[]"));
          if (!bucket.find((i) => i.link === data.downloadUrl)) {
            bucket.push({
              title: data.title,
              ep: data.ep,
              progress: data.progress,
              link: data.downloadUrl,
              quality: data.quality,
              date: new Date().toLocaleDateString(),
            });
            GM_setValue("anime_bucket", JSON.stringify(bucket));
          }

          renderNuke(data);
          if (data.auto) {
            setTimeout(() => {
              if (data.nextUrl) window.location.href = data.nextUrl;
              else window.location.href = "https://chaelri.github.io/anime";
            }, 1000);
          }
        }
      }
    }, 100);
  }

  function renderNuke(data) {
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
                #nuke-ui { pointer-events: auto !important; position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2147483647; background: var(--bg); font-family: 'Inter', sans-serif; color: white; text-align: center; }
                .title { font-weight: 800; font-size: 2.2rem; margin-bottom: 5px; letter-spacing: -1.5px; line-height: 1.1; padding: 0 20px; }
                .ep { font-size: 0.9rem; color: var(--accent); margin-bottom: 40px; letter-spacing: 3px; display: flex; align-items: center; gap: 15px; text-transform: uppercase; font-weight: bold; }
                .ep::before, .ep::after { content: ""; height: 1px; width: 30px; background: #222; }
                .btn-stack { display: flex; flex-direction: column; gap: 12px; width: 340px; }
                .pill { padding: 20px 0; width: 100%; font-size: 1.1rem; font-weight: 600; border-radius: 100px; text-decoration: none; display: flex; align-items: center; justify-content: center; transition: 0.3s; cursor: pointer; border: none; }
                .dl-pill { background: var(--accent); color: white; box-shadow: 0 10px 40px rgba(59,151,252,0.2); }
                .dl-pill:hover { transform: translateY(-3px); background: #2563eb; }
                .save-pill { background: #111; color: #555; font-size: 0.8rem; border: 1px solid #181818; }
                .nav-row { display: flex; gap: 10px; }
                .nav-pill { flex: 1; padding: 15px 0; background: #111; color: #666; border-radius: 100px; text-decoration: none; font-size: 0.8rem; border: 1px solid #181818; font-weight: bold; }
                .nav-pill:hover:not(.disabled) { color: white; background: #181818; border-color: #333; }
                .disabled { opacity: 0.1; pointer-events: none; }
                .auto-status { margin-top: 30px; font-weight: 800; font-size: 0.7rem; letter-spacing: 2px; color: #ffab00; text-transform: uppercase; }
                .stop-btn { background: none; border: 1px solid #222; color: #444; padding: 8px 15px; border-radius: 8px; margin-top: 15px; cursor: pointer; font-size: 0.6rem; font-weight: bold; transition: 0.2s; }
                .stop-btn:hover { color: #ff4444; border-color: #ff4444; }
            </style>
        </head>
        <body>
            <div id="nuke-ui">
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
                    <div id="auto-ctrl">
                        ${
                          data.auto
                            ? `
                            <div class="auto-status">AUTO-SCANNING...</div>
                            <button class="stop-btn" onclick="window.stopAuto()">CANCEL AUTO-PILOT</button>
                        `
                            : `
                            <button class="pill" style="background:none; color:var(--accent); font-size:0.7rem; font-weight:bold" onclick="window.startAuto()">ENABLE AUTO-PILOT</button>
                        `
                        }
                    </div>
                </div>
            </div>
        </body>
        `;
  }

  // ========================================================================================
  // LIVECHART: SORTING & MISC
  // ========================================================================================

  function liveChartAnimeListView() {
    appendCustomCSS();
    const animeCards = document.querySelectorAll(".anime-card");
    if (animeCards.length === 0) return;
    originalOrder = Array.from(animeCards).map((card) => card.parentElement);
    animeCards.forEach((card) => {
      const btn = createButton("Download Anime", false);
      const title =
        card.querySelector("h3")?.innerText ||
        card.querySelector(".main-title")?.innerText;
      btn.onclick = () =>
        window.open(
          `https://animepahe.si/anime?searchFilter=${encodeURIComponent(
            title.trim()
          )}&auto=true`
        );
      card.appendChild(btn);
      const epInfo = card.querySelector(".anime-episodes");
      if (epInfo) {
        const badge = document.createElement("div");
        badge.className = "custom-ep-badge";
        badge.innerText = epInfo.innerText.split("×")[0].trim();
        card.querySelector(".poster-container")?.appendChild(badge);
      }
    });
    addFilterElementsByTag(animeCards);
    addSortingControls(animeCards);
  }

  function addSortingControls(animeCards) {
    const tabs = document.querySelector(".ul-tabs");
    if (!tabs) return;
    const mainContainer = originalOrder[0].parentElement;
    const executeSort = (type, btn, label, compareFn) => {
      sortState[type] = sortState[type] === "desc" ? "asc" : "desc";
      document.querySelectorAll(".custom-sort-btn").forEach((b) => {
        b.innerText = b.getAttribute("data-label");
        b.classList.remove("active");
      });
      const isAsc = sortState[type] === "asc";
      const sorted = [...originalOrder].sort((a, b) =>
        isAsc ? compareFn(a, b) : compareFn(b, a)
      );
      sorted.forEach((w) => mainContainer.appendChild(w));
      btn.classList.add("active");
      btn.innerText = label + (isAsc ? " ↑" : " ↓");
    };
    const createSortBtn = (label, type, compareFn) => {
      const btn = document.createElement("button");
      btn.className = "custom-sort-btn";
      btn.setAttribute("data-label", label);
      btn.innerText = label;
      btn.onclick = () => executeSort(type, btn, label, compareFn);
      return btn;
    };
    const bRating = createSortBtn(
      "Rating",
      "rating",
      (a, b) =>
        (parseFloat(
          a.querySelector(".anime-avg-user-rating")?.textContent || 0
        ) || -999) -
        (parseFloat(
          b.querySelector(".anime-avg-user-rating")?.textContent || 0
        ) || -999)
    );
    const bTitle = createSortBtn("Title", "title", (a, b) =>
      (a.querySelector("h3")?.innerText || "")
        .toLowerCase()
        .localeCompare((b.querySelector("h3")?.innerText || "").toLowerCase())
    );
    const bEps = createSortBtn(
      "Episodes",
      "episodes",
      (a, b) =>
        parseInt(
          a.querySelector(".anime-episodes")?.innerText.match(/(\d+)/)?.[1] || 0
        ) -
        parseInt(
          b.querySelector(".anime-episodes")?.innerText.match(/(\d+)/)?.[1] || 0
        )
    );
    const li = document.createElement("li");
    li.className = "custom-toolbar";
    const bReset = document.createElement("button");
    bReset.innerText = "Reset";
    bReset.className = "custom-sort-btn reset";
    bReset.onclick = () => {
      originalOrder.forEach((w) => mainContainer.appendChild(w));
      document
        .querySelectorAll(".custom-sort-btn")
        .forEach((b) => (b.innerText = b.getAttribute("data-label")));
    };
    li.append(bRating, bTitle, bEps, bReset);
    tabs.appendChild(li);
  }

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
    setTimeout(() => {
      if (document.title.includes("Cloudflare")) return;
      const idChecker = setInterval(() => {
        const btn = document.querySelector(".button.is-success");
        if (btn) {
          clearInterval(idChecker);
          btn.click();
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
              else clearInterval(t);
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

  function addFilterElementsByTag(animeCards) {
    const tabs = document.querySelector(".ul-tabs");
    if (!tabs) return;
    const i = document.createElement("input");
    i.type = "text";
    i.placeholder = "Search Anime...";
    i.className = "aesthetic-search";
    i.oninput = (e) => {
      const v = e.target.value.toLowerCase();
      animeCards.forEach(
        (c) =>
          (c.parentElement.style.display = c.innerText.toLowerCase().includes(v)
            ? "inline-block"
            : "none")
      );
    };
    const li = document.createElement("li");
    li.appendChild(i);
    tabs.prepend(li);
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
