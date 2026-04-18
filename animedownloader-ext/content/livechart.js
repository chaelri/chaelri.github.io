(function () {
  "use strict";

  const HREF = window.location.href;
  // AI search features disabled — they hit Gemini which was driving cost.
  // Setting to empty means any lingering AI fetch fails fast.
  const GEMINI_PROXY = "";
  const AI_DISABLED = true;

  if (HREF.includes("/search")) {
    liveChartSearchView();
  } else if (HREF.includes("/anime/") || HREF.match(/\/anime\/\d+/)) {
    liveChartAnimeOnlyView();
  } else {
    liveChartAnimeListView();
  }

  // ── INDIVIDUAL ANIME PAGE: inject "Scan All Episodes" button ──

  function liveChartAnimeOnlyView() {
    injectCSS();
    const h4 = document.querySelector("h4");
    if (!h4) return;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex; align-items:center; gap:8px; margin-top:10px;";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = "Scan All Episodes";
    btn.className = "aesthetic-download-btn";
    btn.style.width = "fit-content";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "input-episode";
    input.value = 1;
    input.title = "Start from episode";

    btn.onclick = () => {
      const title = h4.innerText.split("\n")[0].trim();
      window.open(
        `https://animepahe.pw/anime?searchFilter=${encodeURIComponent(title)}&episodeNumber=${input.value}&auto=true`
      );
    };

    wrapper.append(btn, input);
    h4.appendChild(wrapper);
  }

  // ── /search PAGE: live search against LiveChart with bulk-download actions ──

  function liveChartSearchView() {
    const wait = setInterval(() => {
      // The page may still be rendering results — wait until body exists
      if (!document.body) return;
      clearInterval(wait);

      const initialResults = parseSearchResults(document);
      const initialQuery =
        new URL(location.href).searchParams.get("q") || "";

      renderSearchUI(initialQuery, initialResults);
    }, 50);
  }

  function parseSearchResults(root) {
    return Array.from(root.querySelectorAll(".anime-item")).map((el) => {
      const titleLink = el.querySelector('a[data-anime-item-target="mainTitle"]');
      const title = titleLink?.innerText?.trim() || el.dataset.title || "";
      const liveChartUrl = titleLink
        ? new URL(titleLink.getAttribute("href"), location.origin).href
        : null;

      const img = el.querySelector(".anime-item__poster-wrap img");
      let poster = img?.src || "";
      const srcset = img?.getAttribute("srcset");
      if (srcset) {
        // srcset format: "small 1x, large 2x" — take the highest-res
        const parts = srcset.split(",").map((s) => s.trim().split(" ")[0]);
        if (parts.length) poster = parts[parts.length - 1];
      }

      const titleExtra = el.querySelector(".title-extra")?.innerText?.trim() || "";
      const info = el.querySelector(".info")?.innerText?.trim() || "";
      const [datePart, ratingPart] = info
        .split("·")
        .map((s) => s.trim().replace(/^\s*[\u2605\u2B50]\s*/, ""));

      return {
        title,
        liveChartUrl,
        poster,
        titleExtra,
        date: datePart || "",
        rating: (ratingPart || "").replace(/[^\d.]/g, ""),
      };
    });
  }

  function renderSearchUI(initialQuery, initialResults) {
    window.stop();
    let lastId = window.setTimeout(() => {}, 0);
    while (lastId--) {
      window.clearTimeout(lastId);
      window.clearInterval(lastId);
    }

    document.documentElement.innerHTML = `
<head>
  <meta charset="UTF-8">
  <title>Search — AnimeDownloader</title>
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
    html, body { background: var(--bg); margin: 0; padding: 0; height: 100%; }
    body { font-family: 'Inter', sans-serif; color: var(--fg); font-weight: 400; overflow-x: hidden; }

    header { position: sticky; top: 0; z-index: 10; background: rgba(10,10,10,0.92); backdrop-filter: blur(20px); border-bottom: 1px solid var(--line); }
    .header-inner { max-width: 960px; margin: 0 auto; padding: 28px 40px 24px; }
    .brand { font-size: 0.7rem; letter-spacing: 2px; text-transform: uppercase; color: var(--fg-ghost); font-weight: 500; margin-bottom: 14px; }
    .search-row { display: flex; align-items: center; gap: 14px; position: relative; }
    .search-input { flex: 1; background: none; border: none; border-bottom: 1px solid var(--line); padding: 14px 0; color: var(--fg); font-size: 1.4rem; font-weight: 500; outline: none; font-family: inherit; letter-spacing: -0.3px; }
    .search-input::placeholder { color: var(--fg-ghost); font-weight: 400; }
    .search-input:focus { border-bottom-color: var(--accent); }
    .search-count { font-size: 0.7rem; color: var(--fg-dim); letter-spacing: 1px; text-transform: uppercase; font-weight: 500; min-width: 80px; text-align: right; }

    .wrap { max-width: 960px; margin: 0 auto; padding: 28px 40px 80px; }
    .empty, .loading { padding: 60px 20px; text-align: center; color: var(--fg-dim); font-size: 0.9rem; font-weight: 400; }

    .grid { display: flex; flex-direction: column; gap: 2px; }
    .card { display: grid; grid-template-columns: 80px 1fr auto; gap: 20px; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--line); transition: background 0.15s; }
    .card:hover { background: rgba(255,255,255,0.025); }
    .poster { width: 80px; aspect-ratio: 2/3; object-fit: cover; border-radius: 3px; display: block; background: #111; }
    .info { min-width: 0; }
    .title { font-weight: 600; font-size: 1rem; line-height: 1.25; margin: 0 0 4px 0; letter-spacing: -0.2px; }
    .title a { color: var(--fg); text-decoration: none; }
    .title a:hover { color: var(--accent); }
    .meta { font-size: 0.75rem; color: var(--fg-dim); font-weight: 400; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .meta .sep { color: var(--fg-ghost); }
    .rating { color: #ffab00; font-weight: 500; }
    .actions { display: flex; gap: 20px; align-items: center; }
    .dl-btn { background: none; border: none; color: var(--done); font-size: 0.7rem; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; text-decoration: none; padding: 8px 0; font-family: inherit; cursor: pointer; transition: color 0.15s; white-space: nowrap; }
    .dl-btn:hover { color: var(--fg); }
    .lc-btn { color: var(--fg-dim); font-size: 0.7rem; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; text-decoration: none; transition: color 0.15s; white-space: nowrap; }
    .lc-btn:hover { color: var(--fg); }

    @media (max-width: 720px) {
      .header-inner { padding: 20px 20px 16px; }
      .search-input { font-size: 1.1rem; }
      .wrap { padding: 20px 16px 60px; }
      .card { grid-template-columns: 64px 1fr; gap: 14px; padding: 14px 4px; }
      .poster { width: 64px; }
      .actions { grid-column: 1 / -1; justify-content: flex-end; gap: 16px; }
      .title { font-size: 0.95rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <div class="brand">AnimeDownloader · LiveChart Search</div>
      <div class="search-row">
        <input class="search-input" id="q" type="text" placeholder="Search anime by title…" autocomplete="off">
        <span class="search-count" id="count"></span>
      </div>
    </div>
  </header>
  <div class="wrap">
    <div id="grid" class="grid"></div>
  </div>
</body>
`;

    const input = document.getElementById("q");
    const grid = document.getElementById("grid");
    const count = document.getElementById("count");

    let abortCtl = null;
    let debounceTimer = null;

    const renderResults = (results, query) => {
      count.textContent = query ? `${results.length} result${results.length === 1 ? "" : "s"}` : "";
      if (!query) {
        grid.innerHTML = `<div class="empty">Type a title above to search LiveChart's full database.</div>`;
        return;
      }
      if (!results.length) {
        grid.innerHTML = `<div class="empty">No matches for "${query}".</div>`;
        return;
      }
      grid.innerHTML = results.map((r) => {
        const dlUrl = `https://animepahe.pw/anime?searchFilter=${encodeURIComponent(r.title)}&auto=true`;
        const poster = r.poster
          ? `<img class="poster" src="${r.poster}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
          : `<div class="poster"></div>`;
        const metaBits = [];
        if (r.titleExtra) metaBits.push(r.titleExtra.replace(/^\(|\)$/g, ""));
        if (r.date) metaBits.push(r.date);
        const metaHTML = metaBits
          .map((b) => `<span>${b}</span>`)
          .join('<span class="sep">·</span>');
        const ratingHTML = r.rating
          ? `<span class="sep">·</span><span class="rating">★ ${r.rating}</span>`
          : "";
        const lcHTML = r.liveChartUrl
          ? `<a class="lc-btn" href="${r.liveChartUrl}">LiveChart</a>`
          : "";
        return `
          <div class="card">
            ${poster}
            <div class="info">
              <div class="title"><a href="${r.liveChartUrl || "#"}">${r.title}</a></div>
              <div class="meta">${metaHTML}${ratingHTML}</div>
            </div>
            <div class="actions">
              ${lcHTML}
              <a class="dl-btn" href="${dlUrl}" target="_blank">▶ Bulk Download</a>
            </div>
          </div>`;
      }).join("");
    };

    const runSearch = async (query) => {
      if (abortCtl) abortCtl.abort();
      abortCtl = new AbortController();

      grid.innerHTML = `<div class="loading">Searching…</div>`;
      count.textContent = "";

      try {
        const res = await fetch(`/search?q=${encodeURIComponent(query)}`, {
          signal: abortCtl.signal,
          credentials: "same-origin",
        });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const results = parseSearchResults(doc);
        renderResults(results, query);
        try {
          history.replaceState(null, "", `/search?q=${encodeURIComponent(query)}`);
        } catch (e) {}
      } catch (e) {
        if (e.name !== "AbortError") {
          grid.innerHTML = `<div class="empty">Search failed: ${e.message}</div>`;
        }
      }
    };

    input.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const q = e.target.value.trim();
      if (q.length === 0) {
        renderResults([], "");
        return;
      }
      if (q.length < 2) return;
      debounceTimer = setTimeout(() => runSearch(q), 300);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length >= 1) runSearch(q);
      }
    });

    // Seed from URL — render initial results immediately, skip re-fetch
    input.value = initialQuery;
    if (initialQuery) {
      renderResults(initialResults, initialQuery);
    } else {
      renderResults([], "");
    }
    input.focus();
  }

  // ── SEASON LIST PAGE: full UI reconstruction + AI search ──

  function liveChartAnimeListView() {
    const wait = setInterval(() => {
      const animeCards = document.querySelectorAll(".anime-card");
      const headerBox = document.querySelector(".page-header-box");

      if (animeCards.length > 0 && headerBox) {
        clearInterval(wait);

        const seasonTitle = headerBox.querySelector("h1")?.innerText || "Anime List";
        const seasonSub =
          headerBox.querySelector(".page-header-box__sub-title")?.innerText || "";
        const prevLink = headerBox.querySelector(".-previous a")?.href;
        const nextLink = headerBox.querySelector(".-next a")?.href;

        const scrapedData = Array.from(animeCards).map((card) => {
          const titleLink = card.querySelector(".main-title a");
          const title = titleLink?.innerText.trim() || "N/A";
          const liveChartUrl = titleLink
            ? new URL(titleLink.getAttribute("href"), location.origin).href
            : null;
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

          const releaseInfo =
            card.querySelector(".release-schedule-info")?.innerText || "";
          const upcomingEpMatch = releaseInfo.match(/EP(\d+)/);
          let currentEpisodes = "0";

          if (upcomingEpMatch) {
            currentEpisodes = Math.max(0, parseInt(upcomingEpMatch[1]) - 1).toString();
          } else {
            const countPart = epParts[0]?.trim() || "";
            if (countPart.includes("of")) {
              currentEpisodes = countPart.match(/(\d+)\s+of/)?.[1] || "0";
            } else if (totalEpisodes !== "??") {
              currentEpisodes = totalEpisodes;
            }
          }

          const countdownEl = card.querySelector("time[data-timestamp]");
          const timestamp = countdownEl
            ? parseInt(countdownEl.getAttribute("data-timestamp"))
            : null;
          const countdownStatic = countdownEl
            ? countdownEl.innerText.trim()
            : "Finished";

          const studio =
            card.querySelector(".anime-studios li a")?.innerText.trim() || "N/A";
          const description =
            card.querySelector(".anime-synopsis")?.innerText.trim() ||
            "No description available.";
          const downloadLink = `https://animepahe.pw/anime?searchFilter=${encodeURIComponent(title)}&auto=true`;

          return {
            title, rating, genres, thumbnail,
            currentEpisodes, totalEpisodes,
            countdown: countdownStatic, timestamp,
            studio, description, downloadLink, liveChartUrl,
          };
        });

        reconstructLiveChartUI(scrapedData, { seasonTitle, seasonSub, prevLink, nextLink });
      }
    }, 100);
  }

  function reconstructLiveChartUI(data, nav) {
    window.stop();

    // Clear all timers from the original page
    let lastId = window.setTimeout(() => {}, 0);
    while (lastId--) {
      window.clearTimeout(lastId);
      window.clearInterval(lastId);
    }

    // Replace the entire page HTML — NO inline <script> tags (blocked by CSP)
    document.documentElement.innerHTML = `
<head>
  <meta charset="UTF-8">
  <title>ANIME | ${nav.seasonTitle}</title>
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
    .search-link { display: inline-flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--border); color: white; padding: 10px 18px; border-radius: 100px; text-decoration: none; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px; transition: 0.2s; cursor: pointer; font-family: inherit; }
    .search-link:hover { border-color: var(--accent); color: var(--accent); }
    .search-link .material-symbols-outlined { font-size: 18px; }
    .search-link .kbd { font-size: 0.65rem; color: var(--text-muted); background: var(--bg); border: 1px solid var(--border); padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-left: 4px; }

    /* Compact anchored dropdown — no backdrop, no full-screen modal */
    .search-wrapper { position: relative; }
    .sd-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 460px; max-height: 70vh; background: #0e0e0e; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03); display: flex; flex-direction: column; overflow: hidden; z-index: 1100; transform: translateY(-4px); opacity: 0; pointer-events: none; transition: transform 0.15s ease, opacity 0.15s ease; }
    .sd-dropdown.is-open { transform: translateY(0); opacity: 1; pointer-events: auto; }
    .sd-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
    .sd-head .material-symbols-outlined { font-size: 18px; color: var(--text-muted); }
    .sd-input { flex: 1; background: none; border: none; color: white; font-size: 0.9rem; font-weight: 500; outline: none; font-family: inherit; padding: 4px 0; }
    .sd-input::placeholder { color: var(--text-muted); font-weight: 400; }
    .sd-close { background: none; border: 1px solid var(--border); color: var(--text-muted); width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; padding: 0; transition: 0.15s; }
    .sd-close:hover { color: white; border-color: var(--text-muted); }
    .sd-body { flex: 1; overflow-y: auto; padding: 4px 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .sd-body::-webkit-scrollbar { width: 4px; }
    .sd-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .sd-hint, .sd-empty, .sd-loading { padding: 30px 16px; text-align: center; color: var(--text-muted); font-size: 0.8rem; }
    .sd-result { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center; padding: 8px 14px; text-decoration: none; color: white; transition: background 0.12s; cursor: pointer; border: none; background: none; font-family: inherit; width: 100%; text-align: left; }
    .sd-result:hover, .sd-result:focus-visible { background: rgba(255,255,255,0.05); outline: none; }
    .sd-result-poster { width: 40px; aspect-ratio: 2/3; object-fit: cover; border-radius: 3px; background: var(--bg); }
    .sd-result-info { min-width: 0; }
    .sd-result-title { font-size: 0.82rem; font-weight: 600; line-height: 1.25; margin: 0 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sd-result-meta { font-size: 0.68rem; color: var(--text-muted); display: flex; gap: 5px; flex-wrap: wrap; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sd-result-meta .sep { color: #444; }
    .sd-result-meta .star { color: #ffab00; }
    .sd-result-dl { color: #00e676; font-size: 0.6rem; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; white-space: nowrap; }
    .sd-result-dl .material-symbols-outlined { font-size: 12px; vertical-align: middle; margin-right: 1px; }

    /* Spinning loader */
    @keyframes sd-spin { to { transform: rotate(360deg); } }
    .sd-loader { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px 16px; color: var(--text-muted); font-size: 0.75rem; }
    .sd-loader .material-symbols-outlined { font-size: 18px; color: var(--accent); animation: sd-spin 1.2s linear infinite; }

    @media (max-width: 720px) {
      .search-link { padding: 8px 14px; font-size: 0.75rem; }
      .search-link .kbd { display: none; }
      .sd-dropdown { width: calc(100vw - 24px); right: 12px; left: 12px; }
    }
    .toolbar { max-width: 1400px; margin: 20px auto; padding: 0 20px; display: flex; flex-wrap: wrap; gap: 15px; align-items: center; }
    .search-box { flex: 1; min-width: 300px; display: flex; gap: 10px; align-items: center; }
    .search-box input { flex: 1; background: var(--card); border: 1px solid var(--border); padding: 14px 20px; border-radius: 12px; color: white; outline: none; font-weight: 600; font-size: 0.9rem; font-family: 'Inter', sans-serif; }
    .search-box input:focus { border-color: var(--accent); }
    .filter-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none; }
    .sort-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-muted); padding: 10px 20px; border-radius: 100px; cursor: pointer; font-size: 0.8rem; font-weight: 600; white-space: nowrap; transition: 0.2s; font-family: 'Inter', sans-serif; }
    .sort-btn.active { color: var(--accent); border-color: var(--accent); background: rgba(59,151,252,0.1); }
    .ai-btn { background: linear-gradient(135deg, #7c3aed, #3B97FC); border: none; color: white; padding: 10px 20px; border-radius: 100px; cursor: pointer; font-size: 0.8rem; font-weight: 800; white-space: nowrap; transition: 0.2s; letter-spacing: 0.5px; font-family: 'Inter', sans-serif; }
    .ai-btn:hover { opacity: 0.85; transform: scale(1.03); }
    .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .ai-status { font-size: 0.75rem; color: #a78bfa; font-weight: 600; padding: 0 10px; }
    .main-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 15px; max-width: 1400px; margin: 0 auto; padding: 20px; }
    .infra-card { background: var(--card); border: 1px solid var(--border); border-radius: 15px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s, border-color 0.3s; position: relative; cursor: pointer; }
    .infra-card:hover { transform: translateY(-5px); border-color: var(--accent); }
    .infra-card.ai-match { border-color: #7c3aed; box-shadow: 0 0 20px rgba(124,58,237,0.2); }
    .ai-score-badge { position: absolute; top: 12px; left: 12px; background: linear-gradient(135deg, #7c3aed, #3B97FC); color: white; padding: 3px 8px; border-radius: 100px; font-size: 0.6rem; font-weight: 800; z-index: 5; }
    .poster-area { height: 310px; width: 100%; overflow: hidden; position: relative; background: #111; }
    .poster-area img { width: 100%; height: 100%; object-fit: cover; transition: 0.5s; display: block; }
    .rating-badge { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.85); padding: 4px 8px; border-radius: 6px; font-weight: 800; color: #ffab00; border: 1px solid #333; font-size: 0.75rem; backdrop-filter: blur(5px); }
    .ep-status { position: absolute; bottom: 12px; left: 12px; background: var(--accent); color: white; padding: 4px 10px; border-radius: 100px; font-weight: 800; font-size: 0.65rem; }
    .card-body { padding: 15px; flex: 1; display: flex; flex-direction: column; }
    .card-title { font-size: 0.95rem; font-weight: 800; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; letter-spacing: -0.3px; }
    .studio-line { font-size: 0.65rem; color: var(--accent); font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .description { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .ai-reason { font-size: 0.7rem; color: #a78bfa; margin-bottom: 10px; font-style: italic; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
    .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 15px; }
    .tag { font-size: 0.6rem; background: #181818; padding: 3px 8px; border-radius: 4px; color: #888; font-weight: 600; border: 1px solid #222; }
    .meta-footer { margin-top: auto; border-top: 1px solid var(--border); padding-top: 12px; display: flex; justify-content: space-between; align-items: center; }
    .countdown-box { font-size: 0.7rem; color: #ffab00; font-weight: 800; }
    .dl-btn { background: #fff; color: #000; text-decoration: none; width: 36px; height: 36px; border-radius: 10px; transition: 0.2s; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .dl-btn:hover { background: var(--accent); color: white; }
    .dl-btn .material-symbols-outlined { font-size: 20px; }
    @media (max-width: 768px) {
      .main-grid { grid-template-columns: 1fr; padding: 10px; }
      .infra-card { flex-direction: row; height: 160px; }
      .poster-area { width: 110px; height: 100%; flex-shrink: 0; }
      .card-body { padding: 10px; }
      .description, .tags, .rating-badge { display: none; }
      .meta-footer { border: none; padding-top: 5px; }
    }

    /* Card detail modal */
    .card-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; pointer-events: none; transition: opacity 0.18s ease; }
    .card-modal-overlay.is-open { opacity: 1; pointer-events: auto; }
    .card-modal { background: var(--card); border: 1px solid var(--border); border-radius: 16px; max-width: 760px; width: 100%; max-height: 90vh; overflow-y: auto; display: grid; grid-template-columns: 240px 1fr; position: relative; box-shadow: 0 40px 100px rgba(0,0,0,0.6); scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .card-modal::-webkit-scrollbar { width: 4px; }
    .card-modal::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .cm-poster-col { background: #000; }
    .cm-poster-col img { width: 100%; height: 100%; object-fit: cover; display: block; aspect-ratio: 2/3; }
    .cm-body { padding: 28px 28px 24px; min-width: 0; }
    .cm-close { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.7); border: 1px solid var(--border); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: inherit; font-size: 1.2rem; line-height: 1; padding: 0; transition: 0.15s; z-index: 2; }
    .cm-close:hover { background: var(--bg); border-color: var(--accent); color: var(--accent); }
    .cm-studio { font-size: 0.7rem; color: var(--accent); font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 8px; }
    .cm-title { font-size: 1.45rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.5px; margin-bottom: 14px; }
    .cm-meta-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; font-size: 0.75rem; font-weight: 600; }
    .cm-rating { color: #ffab00; }
    .cm-ep { color: white; background: var(--accent); padding: 3px 10px; border-radius: 100px; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.5px; }
    .cm-countdown { color: #ffab00; font-weight: 800; }
    .cm-description { font-size: 0.85rem; color: #ccc; line-height: 1.6; margin-bottom: 18px; white-space: pre-wrap; }
    .cm-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 22px; }
    .cm-tags .tag { font-size: 0.65rem; background: #181818; padding: 4px 10px; border-radius: 4px; color: #aaa; font-weight: 600; border: 1px solid #222; }
    .cm-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .cm-btn { flex: 1; min-width: 140px; padding: 12px 16px; border-radius: 10px; text-decoration: none; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; text-align: center; transition: 0.2s; border: none; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .cm-btn .material-symbols-outlined { font-size: 16px; }
    .cm-btn-primary { background: var(--accent); color: white; }
    .cm-btn-primary:hover { background: #2563eb; }
    .cm-btn-secondary { background: #181818; color: #ccc; border: 1px solid var(--border); }
    .cm-btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
    @media (max-width: 600px) {
      .card-modal { grid-template-columns: 1fr; max-height: 94vh; }
      .cm-poster-col img { aspect-ratio: 3/2; max-height: 260px; }
      .cm-body { padding: 22px; }
      .cm-title { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="nav-container">
      <div class="season-nav">
        <a href="${nav.prevLink || "#"}" class="nav-btn"><span class="material-symbols-outlined">arrow_back_ios_new</span></a>
        <div class="season-info">
          <span>${nav.seasonSub}</span>
          <h1>${nav.seasonTitle}</h1>
        </div>
        <a href="${nav.nextLink || "#"}" class="nav-btn"><span class="material-symbols-outlined">arrow_forward_ios</span></a>
      </div>
      <div class="search-wrapper">
        <button type="button" id="open-search-dropdown" class="search-link" title="Search all anime on LiveChart (⌘K)">
          <span class="material-symbols-outlined">search</span>
          Search all anime
          <span class="kbd">⌘K</span>
        </button>
        <div id="sd-dropdown" class="sd-dropdown" role="dialog" aria-label="Search LiveChart" aria-hidden="true">
          <div class="sd-head">
            <span class="material-symbols-outlined">search</span>
            <input type="text" id="sd-input" class="sd-input" placeholder="Search title, studio…" autocomplete="off" spellcheck="false">
            <button type="button" class="sd-close" id="sd-close" aria-label="Close">×</button>
          </div>
          <div class="sd-body" id="sd-results">
            <div class="sd-hint">Type a title to search LiveChart.</div>
          </div>
        </div>
      </div>
    </div>
  </header>
  <div class="toolbar">
    <div class="search-box">
      <input type="text" id="infra-search" placeholder="Search title, studio, genre…">
    </div>
    <div class="filter-row">
      <button class="sort-btn" data-sort="rating">Rating</button>
      <button class="sort-btn" data-sort="title">Title</button>
      <button class="sort-btn" data-sort="episodes">Progress</button>
    </div>
  </div>
  <div id="infra-grid" class="main-grid"></div>
  <div id="card-modal" class="card-modal-overlay" aria-hidden="true" role="dialog">
    <div class="card-modal">
      <button type="button" class="cm-close" id="card-modal-close" aria-label="Close">×</button>
      <div class="cm-poster-col"><img id="cm-poster" src="" alt=""></div>
      <div class="cm-body">
        <div class="cm-studio" id="cm-studio"></div>
        <div class="cm-title" id="cm-title"></div>
        <div class="cm-meta-row">
          <span class="cm-rating" id="cm-rating"></span>
          <span class="cm-ep" id="cm-ep"></span>
          <span class="cm-countdown" id="cm-countdown" data-ts=""></span>
        </div>
        <div class="cm-description" id="cm-description"></div>
        <div class="cm-tags" id="cm-tags"></div>
        <div class="cm-actions">
          <a id="cm-dl" class="cm-btn cm-btn-primary" href="#" target="_blank"><span class="material-symbols-outlined">download</span>Bulk Download</a>
          <a id="cm-lc" class="cm-btn cm-btn-secondary" href="#" target="_blank">View on LiveChart</a>
        </div>
      </div>
    </div>
  </div>
</body>
`;

    // ── All JS runs here in the content script — no inline scripts needed ──

    let currentFilter = "";
    let currentSort = { key: null, dir: 1 };

    function updateCountdowns() {
      const now = Math.floor(Date.now() / 1000);
      document.querySelectorAll("[data-ts]").forEach((el) => {
        const target = parseInt(el.dataset.ts);
        if (!target) return;
        const diff = target - now;
        if (diff <= 0) { el.innerText = "Releasing Now"; return; }
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        el.innerText = `${d}d ${h}h ${m}m ${s}s`;
      });
    }

    function render() {
      const grid = document.getElementById("infra-grid");
      let items = [...data];

      if (currentFilter) {
        const q = currentFilter.toLowerCase();
        items = items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.studio.toLowerCase().includes(q) ||
            i.genres.some((g) => g.toLowerCase().includes(q))
        );
      }

      if (currentSort.key) {
        items.sort((a, b) => {
          let valA = a[currentSort.key];
          let valB = b[currentSort.key];
          if (currentSort.key === "rating") {
            valA = valA === "N/A" ? -1 : parseFloat(valA);
            valB = valB === "N/A" ? -1 : parseFloat(valB);
          } else if (currentSort.key === "episodes") {
            valA = parseInt(a.currentEpisodes) || 0;
            valB = parseInt(b.currentEpisodes) || 0;
          } else {
            valA = (valA || "").toLowerCase();
            valB = (valB || "").toLowerCase();
          }
          return valA < valB ? -1 * currentSort.dir : valA > valB ? 1 * currentSort.dir : 0;
        });
      }

      grid.innerHTML = items
        .map(
          (item) => `
        <div class="infra-card" data-title="${item.title.replace(/"/g, "&quot;")}">
          <div class="poster-area">
            <img src="${item.thumbnail}" loading="lazy" onerror="this.src='https://placehold.co/300x450/111/444?text=No+Poster'">
            <div class="rating-badge">${item.rating}</div>
            <div class="ep-status">EP ${item.currentEpisodes} / ${item.totalEpisodes}</div>
          </div>
          <div class="card-body">
            <div class="studio-line">${item.studio}</div>
            <div class="card-title" title="${item.title}">${item.title}</div>
            <div class="description">${item.description}</div>
            <div class="tags">${item.genres.map((g) => `<span class="tag">${g}</span>`).join("")}</div>
            <div class="meta-footer">
              <div class="countdown-box" data-ts="${item.timestamp}">${item.countdown}</div>
              <a href="${item.downloadLink}" target="_blank" class="dl-btn"><span class="material-symbols-outlined">download</span></a>
            </div>
          </div>
        </div>`
        )
        .join("");

      updateCountdowns();
    }

    // runAISearch removed — AI disabled.

    // ── Attach event listeners ──

    // Plain title/studio/genre filter on current season's already-loaded data
    document.getElementById("infra-search").addEventListener("input", (e) => {
      currentFilter = e.target.value;
      render();
    });

    document.querySelectorAll(".sort-btn[data-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.sort;
        if (currentSort.key === key) currentSort.dir *= -1;
        else {
          currentSort.key = key;
          currentSort.dir = key === "rating" || key === "episodes" ? -1 : 1;
        }
        document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render();
      });
    });

    render();
    setInterval(updateCountdowns, 1000);

    // ── Card detail modal ──

    const modalOverlay = document.getElementById("card-modal");
    const modalCloseBtn = document.getElementById("card-modal-close");
    const cmPoster = document.getElementById("cm-poster");
    const cmTitle = document.getElementById("cm-title");
    const cmStudio = document.getElementById("cm-studio");
    const cmRating = document.getElementById("cm-rating");
    const cmEp = document.getElementById("cm-ep");
    const cmCountdown = document.getElementById("cm-countdown");
    const cmDescription = document.getElementById("cm-description");
    const cmTags = document.getElementById("cm-tags");
    const cmDl = document.getElementById("cm-dl");
    const cmLc = document.getElementById("cm-lc");

    const openCardModal = (item) => {
      cmPoster.src = item.thumbnail;
      cmPoster.onerror = () => {
        cmPoster.src = "https://placehold.co/300x450/111/444?text=No+Poster";
      };
      cmTitle.innerText = item.title;
      cmStudio.innerText = item.studio === "N/A" ? "" : item.studio;
      cmRating.innerText = item.rating === "N/A" ? "" : "★ " + item.rating;
      cmEp.innerText = `EP ${item.currentEpisodes} / ${item.totalEpisodes}`;
      cmCountdown.dataset.ts = item.timestamp || "";
      cmCountdown.innerText = item.countdown;
      cmDescription.innerText = item.description;
      cmTags.innerHTML = item.genres
        .map((g) => `<span class="tag">${g}</span>`)
        .join("");
      cmDl.href = item.downloadLink;
      if (item.liveChartUrl) {
        cmLc.href = item.liveChartUrl;
        cmLc.style.display = "";
      } else {
        cmLc.style.display = "none";
      }
      modalOverlay.classList.add("is-open");
      modalOverlay.setAttribute("aria-hidden", "false");
    };
    const closeCardModal = () => {
      modalOverlay.classList.remove("is-open");
      modalOverlay.setAttribute("aria-hidden", "true");
    };

    document.getElementById("infra-grid").addEventListener("click", (e) => {
      if (e.target.closest(".dl-btn")) return;
      const card = e.target.closest(".infra-card");
      if (!card) return;
      const title = card.getAttribute("data-title");
      const item = data.find((i) => i.title === title);
      if (item) openCardModal(item);
    });
    modalCloseBtn.addEventListener("click", closeCardModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeCardModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalOverlay.classList.contains("is-open")) {
        closeCardModal();
      }
    });

    // ── Inline search-all dropdown (command-palette style) ──

    const sdDropdown = document.getElementById("sd-dropdown");
    const sdWrapper = sdDropdown?.closest(".search-wrapper");
    const sdInput = document.getElementById("sd-input");
    const sdResults = document.getElementById("sd-results");
    const sdOpenBtn = document.getElementById("open-search-dropdown");
    const sdCloseBtn = document.getElementById("sd-close");

    let sdAbort = null;
    let sdDebounce = null;

    const openSearch = () => {
      sdDropdown.classList.add("is-open");
      sdDropdown.setAttribute("aria-hidden", "false");
      setTimeout(() => sdInput.focus(), 20);
    };
    const closeSearch = () => {
      sdDropdown.classList.remove("is-open");
      sdDropdown.setAttribute("aria-hidden", "true");
      if (sdAbort) sdAbort.abort();
    };
    const isOpen = () => sdDropdown.classList.contains("is-open");

    sdOpenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isOpen() ? closeSearch() : openSearch();
    });
    sdCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSearch();
    });
    // Click outside the wrapper (button + dropdown) to close
    document.addEventListener("click", (e) => {
      if (!isOpen()) return;
      if (sdWrapper && !sdWrapper.contains(e.target)) closeSearch();
    });
    // Don't let clicks inside the dropdown bubble up to close it
    sdDropdown.addEventListener("click", (e) => e.stopPropagation());

    document.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        isOpen() ? closeSearch() : openSearch();
      } else if (e.key === "Escape" && isOpen()) {
        closeSearch();
      }
    });

    const escapeHTML = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const renderResultCard = (r) => {
      const dlUrl = `https://animepahe.pw/anime?searchFilter=${encodeURIComponent(r.title)}&auto=true`;
      const poster = r.poster
        ? `<img class="sd-result-poster" src="${escapeHTML(r.poster)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<div class="sd-result-poster"></div>`;
      const metaBits = [];
      if (r.titleExtra) metaBits.push(escapeHTML(r.titleExtra.replace(/^\(|\)$/g, "")));
      if (r.date) metaBits.push(escapeHTML(r.date));
      const metaHTML = metaBits
        .map((b) => `<span>${b}</span>`)
        .join('<span class="sep">·</span>');
      const ratingHTML = r.rating
        ? `<span class="sep">·</span><span class="star">★ ${escapeHTML(r.rating)}</span>`
        : "";
      return `
        <a class="sd-result" href="${dlUrl}" target="_blank" rel="noopener">
          ${poster}
          <div class="sd-result-info">
            <div class="sd-result-title">${escapeHTML(r.title)}</div>
            <div class="sd-result-meta">${metaHTML}${ratingHTML}</div>
          </div>
          <span class="sd-result-dl"><span class="material-symbols-outlined">download</span></span>
        </a>`;
    };

    const renderSdResults = (results, query) => {
      if (!query) {
        sdResults.innerHTML = `<div class="sd-hint">Type a title to search LiveChart.</div>`;
        return;
      }
      if (!results.length) {
        sdResults.innerHTML = `<div class="sd-empty">No matches for "${escapeHTML(query)}".</div>`;
        return;
      }
      sdResults.innerHTML = results.map(renderResultCard).join("");
    };

    const runSdSearch = async (query) => {
      if (sdAbort) sdAbort.abort();
      sdAbort = new AbortController();
      sdResults.innerHTML = `
        <div class="sd-loader">
          <span class="material-symbols-outlined">progress_activity</span>
          <span>Searching LiveChart…</span>
        </div>`;
      try {
        const res = await fetch(`/search?q=${encodeURIComponent(query)}`, {
          signal: sdAbort.signal,
          credentials: "same-origin",
        });
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const results = parseSearchResults(doc);
        renderSdResults(results, query);
      } catch (e) {
        if (e.name !== "AbortError") {
          sdResults.innerHTML = `<div class="sd-empty">Search failed: ${e.message}</div>`;
        }
      }
    };

    sdInput.addEventListener("input", (e) => {
      clearTimeout(sdDebounce);
      const q = e.target.value.trim();
      if (q.length === 0) {
        renderSdResults([], "");
        return;
      }
      if (q.length < 2) return;
      sdDebounce = setTimeout(() => runSdSearch(q), 250);
    });

    // AI search + AniList poster enrichment removed — was a Gemini cost path.
  }

  // ── Shared helpers ──

  function injectCSS() {
    if (document.getElementById("aesthetic-styles")) return;
    const style = document.createElement("style");
    style.id = "aesthetic-styles";
    style.innerText = `
      .aesthetic-download-btn { background: #3B97FC !important; color: white !important; border: none; padding: 10px 16px; font-weight: bold; cursor: pointer; transition: background 0.2s; border-radius: 10px; font-size: 14px; }
      .aesthetic-download-btn:hover { background: #2563eb !important; }
      .input-episode { border: 1px solid #eee; border-radius: 8px; width: 50px; text-align: center; font-weight: bold; padding: 10px 5px; font-size: 14px; }
    `;
    document.head.appendChild(style);
  }
})();
