// ==UserScript==
// @name         Anime Downloader - Aesthetic Edition
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  Modern, cute aesthetic for LiveChart with emphasized episodes and clean sorting.
// @author       Chaelri
// @match        *://*/*
// @icon         https://www.google.com/s2/favicons?domain=livechart.me
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HREF = window.location.href;
  const LOC = window.location.hostname;
  let originalOrder = [];
  let sortState = { rating: "none", title: "none", episodes: "none" };

  if (LOC.includes("livechart.me")) {
    HREF.includes("/anime")
      ? liveChartAnimeOnlyView()
      : liveChartAnimeListView();
  } else if (LOC.includes("animepahe")) {
    if (HREF.includes("?searchFilter=")) animePaheSearchAutoClick();
    else if (HREF.includes("/play/")) animePaheClicker();
    else if (HREF.includes("/anime/")) animePaheEpisodeList();
  } else if (LOC.includes("pahe.win")) paheClicker();
  else if (LOC.includes("kwik.cx")) kwikClicker();

  // ========================================================================================
  // LIVECHART.ME - REDESIGN & SORTING
  // ========================================================================================

  function liveChartAnimeListView() {
    appendCustomCSS(); // Load aesthetic styles first
    const animeCards = document.querySelectorAll(".anime-card");
    if (animeCards.length === 0) return;

    originalOrder = Array.from(animeCards).map((card) => card.parentElement);

    animeCards.forEach((card) => {
      // Add Download Button
      const downloadButton = createButton("Download Anime", false);
      const title =
        card.querySelector("h3")?.innerText ||
        card.querySelector(".main-title")?.innerText;
      downloadButton.addEventListener("click", () => {
        if (title)
          window.open(
            `https://animepahe.si/anime?searchFilter=${encodeURIComponent(
              title.trim()
            )}`
          );
      });
      card.appendChild(downloadButton);

      // Emphasis: Move Episode count to a floating badge over the poster
      const epInfo = card.querySelector(".anime-episodes");
      if (epInfo) {
        const posterContainer = card.querySelector(".poster-container");
        const badge = document.createElement("div");
        badge.className = "custom-ep-badge";
        badge.innerText = epInfo.innerText.split("×")[0].trim(); // "12 eps"
        posterContainer?.appendChild(badge);
      }
    });

    addFilterElementsByTag(animeCards);
    addSortingControls(animeCards);
  }

  function addSortingControls(animeCards) {
    const tabs = document.querySelector(".ul-tabs");
    if (!tabs) return;
    const cardWrappers = [...originalOrder];
    const mainContainer = cardWrappers[0].parentElement;

    const executeSort = (type, btn, label, compareFn) => {
      sortState[type] = sortState[type] === "desc" ? "asc" : "desc";
      Object.keys(sortState).forEach((k) => {
        if (k !== type) sortState[k] = "none";
      });
      document.querySelectorAll(".custom-sort-btn").forEach((b) => {
        b.innerText = b.getAttribute("data-label");
        b.classList.remove("active");
      });

      const isAsc = sortState[type] === "asc";
      const sorted = [...cardWrappers].sort((a, b) =>
        isAsc ? compareFn(a, b) : compareFn(b, a)
      );
      sorted.forEach((wrapper) => mainContainer.appendChild(wrapper));

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

    const btnRating = createSortBtn("Rating", "rating", (a, b) => {
      const getR = (el) =>
        parseFloat(
          el.querySelector(".anime-avg-user-rating")?.textContent || 0
        ) || -999;
      return getR(a) - getR(b);
    });

    const btnTitle = createSortBtn("Title", "title", (a, b) => {
      const getT = (el) =>
        (el.querySelector("h3")?.innerText || "").toLowerCase();
      return getT(a).localeCompare(getT(b));
    });

    const btnEps = createSortBtn("Episodes", "episodes", (a, b) => {
      const getE = (el) =>
        parseInt(
          el.querySelector(".anime-episodes")?.innerText.match(/(\d+)/)?.[1] ||
            0
        );
      return getE(a) - getE(b);
    });

    const btnReset = document.createElement("button");
    btnReset.innerText = "Reset";
    btnReset.className = "custom-sort-btn reset";
    btnReset.onclick = () => {
      originalOrder.forEach((w) => mainContainer.appendChild(w));
      document
        .querySelectorAll(".custom-sort-btn")
        .forEach((b) => (b.innerText = b.getAttribute("data-label")));
    };

    const li = createLi();
    li.className = "custom-toolbar";
    li.append(btnRating, btnTitle, btnEps, btnReset);
    tabs.appendChild(li);
  }

  // ========================================================================================
  // LOGIC RETAINED (AnimePahe / Pahe / Kwik)
  // ========================================================================================

  function animePaheSearchAutoClick() {
    const searchTerm = new URLSearchParams(window.location.search).get(
      "searchFilter"
    );
    const input = document.querySelector("input[name='q']");
    if (input && searchTerm) {
      input.focus();
      input.value = searchTerm;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const aKeySettings = {
        key: "a",
        code: "KeyA",
        keyCode: 65,
        which: 65,
        bubbles: true,
        cancelable: true,
      };

      setTimeout(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", aKeySettings));
        input.dispatchEvent(new KeyboardEvent("keyup", aKeySettings));

        // Now start looking for the result to click
        const waitForResults = setInterval(() => {
          const firstResult = document.querySelector(
            ".search-results li[data-index='0'] a"
          );
          if (firstResult) {
            clearInterval(waitForResults);
            firstResult.click();
          }
        }, 100);

        // Timeout if no results found
        setTimeout(() => clearInterval(waitForResults), 5000);
      }, 50);
    }
  }

  function animePaheEpisodeList() {
    const epNum =
      new URLSearchParams(window.location.search).get("episodeNumber") || 1;
    setTimeout(() => {
      document
        .querySelector(".btn-group.btn-group-toggle")
        ?.children[0]?.click();
      setTimeout(() => {
        const list = document.querySelectorAll(".episode-list.row > div");
        (list[epNum - 1] || list[0])?.querySelector("a")?.click();
      }, 1000);
    }, 1000);
  }
  function animePaheClicker() {
    const params = new URLSearchParams(window.location.search);
    const isAutoMode = params.get("auto") === "true";

    let findData = setInterval(() => {
      const downloadMenu = document.getElementById("pickDownload");
      const scrollArea = document.querySelector("#scrollArea");
      const infoArea = document.querySelector(".theatre-info");
      const episodeBtn = document.getElementById("episodeMenu");

      if (downloadMenu && scrollArea && infoArea && episodeBtn) {
        const dlLinks = Array.from(
          downloadMenu.querySelectorAll("a.dropdown-item")
        );
        const bestLink = dlLinks
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
          )[0];

        const animeTitle =
          infoArea.querySelector("h1 a")?.getAttribute("title") || "Anime";
        const currentEp = episodeBtn.innerText.match(/\d+/)[0];
        const allEpLinks = Array.from(
          scrollArea.querySelectorAll("a.dropdown-item")
        );
        const epNumbers = allEpLinks.map((el) =>
          parseInt(el.innerText.match(/\d+/)?.[0] || 0)
        );
        const actualTotal = Math.max(...epNumbers);

        const buildAutoUrl = (url) => {
          if (!url) return null;
          const separator = url.includes("?") ? "&" : "?";
          return url + separator + "auto=true";
        };

        const activeLink = scrollArea.querySelector("a.active");
        const activeIdx = allEpLinks.indexOf(activeLink);
        const nextUrl = allEpLinks[activeIdx + 1]
          ? buildAutoUrl(allEpLinks[activeIdx + 1].href)
          : null;
        const prevUrl = allEpLinks[activeIdx - 1]?.href || null;

        if (bestLink?.href) {
          clearInterval(findData);
          iosFriendlyNuke({
            downloadUrl: bestLink.href,
            nextUrl: nextUrl,
            prevUrl: prevUrl,
            quality: bestLink.innerText.split("(")[0].trim(),
            title: animeTitle,
            progress: `${currentEp} / ${actualTotal}`,
            auto: isAutoMode,
          });
        }
      }
    }, 100);
  }

  function iosFriendlyNuke(data) {
    // 1. Kill existing timers (except the new one we're about to make)
    let lastId = window.setTimeout(() => {}, 0);
    while (lastId--) {
      window.clearTimeout(lastId);
      window.clearInterval(lastId);
    }

    // 2. iOS Safari fix: Clear body only, don't touch documentElement
    document.body.innerHTML = "";

    // 3. Inject Styles
    const style = document.createElement("style");
    style.innerHTML = `
        :root { --bg: #050505; --accent: #3B97FC; }
        
        /* Nuclear CSS: Hide everything except our container */
        body > :not(#ios-dashboard) { display: none !important; }

        body, html { 
            background: var(--bg) !important; 
            margin: 0; padding: 0; width: 100%; height: 100%; 
            overflow: hidden; position: fixed;
            -webkit-text-size-adjust: 100%;
        }

        #ios-dashboard { 
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            z-index: 2147483647; background: var(--bg);
            font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
            color: white; text-align: center; padding: 20px;
        }

        .anime-title { font-weight: 800; font-size: 1.8rem; margin-bottom: 8px; line-height: 1.2; padding: 0 10px; }
        .ep-progress { font-size: 0.85rem; color: var(--accent); margin-bottom: 40px; letter-spacing: 3px; font-weight: 600; }
        
        .btn-stack { display: flex; flex-direction: column; gap: 15px; width: 100%; max-width: 320px; }
        .pill { 
            -webkit-appearance: none; appearance: none;
            padding: 18px 0; width: 100%; font-size: 1.1rem; font-weight: 600; 
            border-radius: 50px; cursor: pointer; text-decoration: none; 
            display: flex; align-items: center; justify-content: center; border: none;
            transition: transform 0.2s active;
        }
        .pill:active { transform: scale(0.96); }
        
        .dl-pill { background: var(--accent); color: white; }
        .nav-row { display: flex; gap: 10px; width: 100%; }
        .nav-pill { flex: 1; padding: 14px 0; background: #1a1a1a; color: #888; border-radius: 50px; text-decoration: none; font-size: 0.9rem; }
        .disabled { opacity: 0.2; pointer-events: none; }
        
        .auto-msg { margin-top: 30px; font-size: 0.8rem; color: #ffab00; font-weight: bold; text-transform: uppercase; }
        .stop-btn { background: #222; color: #777; border: none; padding: 8px 15px; border-radius: 8px; margin-top: 10px; font-size: 0.7rem; }
    `;
    document.head.appendChild(style);

    // 4. Create Container
    const container = document.createElement("div");
    container.id = "ios-dashboard";
    container.innerHTML = `
        <div class="anime-title">${data.title}</div>
        <div class="ep-progress">EPISODE ${data.progress}</div>
        
        <div class="btn-stack">
            <a href="${
              data.downloadUrl
            }" target="_blank" class="pill dl-pill" id="dl-link">Download File</a>
            
            <div class="nav-row">
                <a href="${data.prevUrl || "#"}" class="nav-pill ${
      data.prevUrl ? "" : "disabled"
    }">Previous</a>
                <a href="${
                  data.nextUrl ? data.nextUrl.replace(/[&?]auto=true/, "") : "#"
                }" class="nav-pill ${data.nextUrl ? "" : "disabled"}">Next</a>
            </div>

            <div id="auto-ui">
                ${
                  data.auto
                    ? `
                    <div class="auto-msg">Auto-Pilot: Downloading in <span id="timer">5</span>s</div>
                    <button class="stop-btn" onclick="stopAuto()">Cancel Auto</button>
                `
                    : `
                    <button class="stop-btn" style="color:var(--accent)" onclick="startAuto()">Enable Auto-Pilot</button>
                `
                }
            </div>
        </div>
    `;
    document.body.appendChild(container);

    // 5. iOS Auto-Pilot Workaround
    if (data.auto) {
      let timeLeft = 5;
      const timer = setInterval(() => {
        timeLeft--;
        const timerEl = document.getElementById("timer");
        if (timerEl) timerEl.innerText = timeLeft;

        if (timeLeft <= 0) {
          clearInterval(timer);
          // NOTE: iOS Safari will block window.open(url) here unless popups are allowed in settings.
          // We attempt to trigger it anyway.
          document.getElementById("dl-link").click();
          const link = document.createElement('a');
          link.href = document.getElementById("dl-link").href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer'; // Important for security/performance
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);


          if (data.nextUrl) {
            setTimeout(() => {
              window.location.href = data.nextUrl;
            }, 1500);
          }
        }
      }, 1000);
      window.autoTimer = timer;
    }

    // 6. Define button actions
    window.stopAuto = () => {
      clearInterval(window.autoTimer);
      document.getElementById(
        "auto-ui"
      ).innerHTML = `<div style="color:#555; margin-top:20px; font-size:0.7rem">AUTO-PILOT STOPPED</div>`;
    };
    window.startAuto = () => {
      const sep = window.location.href.includes("?") ? "&" : "?";
      window.location.href = window.location.href + sep + "auto=true";
    };

    // 7. Surgical Guard: Monitor and kill ad-reinjection
    const observer = new MutationObserver((mutations) => {
      for (let m of mutations) {
        for (let node of m.addedNodes) {
          if (node.id !== "ios-dashboard" && node.nodeName !== "STYLE") {
            node.remove();
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
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
          setTimeout(() => {
            document
              .querySelectorAll("iframe, nav, footer, .column.is-12")
              .forEach((el) => el.remove());
          }, 1000);
          setTimeout(() => {
            btn.style.cssText =
              "margin: auto; width: 150px; height: 150px; border-radius: 50%; border: none; font-size: 4rem; display:flex; align-items:center; justify-content:center; background:#3B97FC; color:white;";
            let counter = 16;
            btn.innerHTML = counter;
            const setCounter = setInterval(() => {
              if (counter > 0) btn.innerHTML = --counter;
              else clearInterval(setCounter);
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

  function liveChartAnimeOnlyView() {
    appendCustomCSS();
    const h4 = document.querySelector("h4");
    if (!h4) return;
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    const btn = createButton("Download from AnimePahe", true);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "input-episode";
    input.value = 1;
    btn.onclick = () => {
      const title = h4.innerText.split("\n")[0];
      window.open(
        `https://animepahe.si/anime?searchFilter=${encodeURIComponent(
          title.trim()
        )}&episodeNumber=${input.value}`
      );
    };
    wrapper.append(btn, input);
    h4.appendChild(wrapper);
  }

  // ========================================================================================
  // UI HELPERS & CSS
  // ========================================================================================

  function createButton(name, small) {
    const b = document.createElement("button");
    b.type = "submit";
    b.innerText = name;
    b.className = "aesthetic-download-btn";
    if (small) b.style.width = "fit-content";
    return b;
  }

  function createLi() {
    return document.createElement("li");
  }

  function addFilterElementsByTag(animeCards) {
    const tabs = document.querySelector(".ul-tabs");
    if (!tabs) return;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search Anime...";
    input.className = "aesthetic-search";

    input.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase();
      animeCards.forEach((card) => {
        const text = card.innerText.toLowerCase();
        card.parentElement.style.display = text.includes(val)
          ? "inline-block"
          : "none";
      });
    });
    const li = createLi();
    li.appendChild(input);
    tabs.prepend(li);
  }

  function appendCustomCSS() {
    if (document.getElementById("aesthetic-styles")) return;
    const style = document.createElement("style");
    style.id = "aesthetic-styles";
    style.innerText = `
            /* Container & Card */
            .anime-card {
                border-radius: 16px !important;
                border: 1px solid #eee !important;
                overflow: hidden !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important;
                transition: transform 0.2s ease;
                background: white !important;
            }

            /* Titles */
            .main-title a { color: #333 !important; font-weight: 800 !important; font-size: 1.1rem !important; }

            /* Episode Emphasis Badge */
            .custom-ep-badge {
                position: absolute;
                top: 10px;
                right: 10px;
                background: rgba(59, 151, 252, 0.9);
                color: white;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                backdrop-filter: blur(4px);
                z-index: 10;
            }

            /* Rating Pill */
            .anime-avg-user-rating {
                background: #fdf2f2 !important;
                color: #e02424 !important;
                border-radius: 20px !important;
                padding: 2px 10px !important;
                font-weight: bold !important;
                display: inline-flex !important;
                align-items: center;
                border: 1px solid #fbd5d5 !important;
            }

            /* Genres/Tags */
            .anime-tags { margin-bottom: 10px !important; }
            .anime-tags li a {
                background: #f3f4f6 !important;
                border: none !important;
                border-radius: 6px !important;
                padding: 2px 8px !important;
                font-size: 11px !important;
                color: #6b7280 !important;
            }

            /* Modern Download Button */
            .aesthetic-download-btn {
                background: #3B97FC !important;
                color: white !important;
                border: none;
                padding: 12px;
                font-weight: bold;
                width: 100%;
                cursor: pointer;
                transition: background 0.2s;
                border-radius: 0 0 12px 12px;
            }
            .aesthetic-download-btn:hover { background: #2563eb !important; }

            /* Toolbar & Sort Buttons */
            .custom-toolbar { display: flex; gap: 8px; align-items: center; padding: 10px; }
            .custom-sort-btn {
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                padding: 6px 16px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                color: #374151;
                transition: all 0.2s;
            }
            .custom-sort-btn:hover { background: #f3f4f6; }
            .custom-sort-btn.active { background: #eff6ff; border-color: #3B97FC; color: #3B97FC; }
            .custom-sort-btn.reset { background: #3B97FC; color: white; border: none; }

            /* Search Input */
            .aesthetic-search {
                border: 1px solid #e5e7eb;
                border-radius: 25px;
                padding: 8px 20px;
                outline: none;
                width: 250px;
                transition: border 0.2s;
                margin-right: 15px;
            }
            .aesthetic-search:focus { border-color: #3B97FC; }

            .input-episode {
                border: 1px solid #eee;
                border-radius: 8px;
                width: 40px;
                text-align: center;
                font-weight: bold;
                margin-left: 10px;
            }
        `;
    document.head.appendChild(style);
  }
})();
