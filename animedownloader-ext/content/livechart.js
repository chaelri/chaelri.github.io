(function () {
  "use strict";

  const HREF = window.location.href;
  const GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

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
            studio, description, downloadLink,
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

    .sd-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); z-index: 2000; display: flex; align-items: flex-start; justify-content: center; padding: 10vh 20px 40px; opacity: 0; pointer-events: none; transition: opacity 0.15s ease; }
    .sd-overlay.is-open { opacity: 1; pointer-events: auto; }
    .sd-panel { background: #0e0e0e; border: 1px solid var(--border); border-radius: 14px; width: 100%; max-width: 720px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 40px 100px rgba(0,0,0,0.7); transform: translateY(-8px); opacity: 0; transition: transform 0.18s ease, opacity 0.18s ease; }
    .sd-overlay.is-open .sd-panel { transform: translateY(0); opacity: 1; }
    .sd-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .sd-head .material-symbols-outlined { font-size: 20px; color: var(--text-muted); }
    .sd-input { flex: 1; background: none; border: none; color: white; font-size: 1rem; font-weight: 500; outline: none; font-family: inherit; letter-spacing: -0.2px; }
    .sd-input::placeholder { color: var(--text-muted); font-weight: 400; }
    .sd-close { background: none; border: 1px solid var(--border); color: var(--text-muted); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 1rem; display: flex; align-items: center; justify-content: center; padding: 0; transition: 0.15s; }
    .sd-close:hover { color: white; border-color: var(--text-muted); }
    .sd-body { flex: 1; overflow-y: auto; padding: 8px 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .sd-body::-webkit-scrollbar { width: 4px; }
    .sd-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .sd-hint, .sd-empty, .sd-loading { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
    .sd-result { display: grid; grid-template-columns: 56px 1fr auto; gap: 14px; align-items: center; padding: 10px 18px; text-decoration: none; color: white; transition: background 0.12s; cursor: pointer; border: none; background: none; font-family: inherit; width: 100%; text-align: left; }
    .sd-result:hover, .sd-result:focus-visible { background: rgba(255,255,255,0.05); outline: none; }
    .sd-result-poster { width: 56px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px; background: var(--bg); }
    .sd-result-info { min-width: 0; }
    .sd-result-title { font-size: 0.9rem; font-weight: 600; line-height: 1.2; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sd-result-meta { font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 6px; flex-wrap: wrap; }
    .sd-result-meta .sep { color: #444; }
    .sd-result-meta .star { color: #ffab00; }
    .sd-result-dl { color: #00e676; font-size: 0.65rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; white-space: nowrap; }

    @media (max-width: 720px) {
      .search-link { padding: 8px 14px; font-size: 0.75rem; }
      .search-link .kbd { display: none; }
      .sd-overlay { padding: 8vh 12px 20px; }
      .sd-result { grid-template-columns: 44px 1fr; padding: 10px 14px; }
      .sd-result-poster { width: 44px; }
      .sd-result-dl { grid-column: 1 / -1; text-align: right; }
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
    .infra-card { background: var(--card); border: 1px solid var(--border); border-radius: 15px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.3s, border-color 0.3s; position: relative; }
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
      <button type="button" id="open-search-dropdown" class="search-link" title="Search all anime on LiveChart (⌘K)">
        <span class="material-symbols-outlined">search</span>
        Search all anime
        <span class="kbd">⌘K</span>
      </button>
    </div>
  </header>
  <div id="sd-overlay" class="sd-overlay" aria-hidden="true">
    <div class="sd-panel" role="dialog" aria-label="Search LiveChart">
      <div class="sd-head">
        <span class="material-symbols-outlined">search</span>
        <input type="text" id="sd-input" class="sd-input" placeholder="Search LiveChart's full database…" autocomplete="off" spellcheck="false">
        <button type="button" class="sd-close" id="sd-close" aria-label="Close">×</button>
      </div>
      <div class="sd-body" id="sd-results">
        <div class="sd-hint">Start typing to search all anime on LiveChart.</div>
      </div>
    </div>
  </div>
  <div class="toolbar">
    <div class="search-box">
      <input type="text" id="infra-search" placeholder='Search title, studio, genre... or try "anime with pink hair"'>
      <button class="ai-btn" id="ai-search-btn">✨ AI Search</button>
    </div>
    <div class="filter-row">
      <button class="sort-btn" data-sort="rating">Rating</button>
      <button class="sort-btn" data-sort="title">Title</button>
      <button class="sort-btn" data-sort="episodes">Progress</button>
      <button class="sort-btn" id="clear-ai-btn" style="display:none; color:#e879f9; border-color:#7c3aed;">Clear AI</button>
    </div>
    <span class="ai-status" id="ai-status"></span>
  </div>
  <div id="infra-grid" class="main-grid"></div>
</body>
`;

    // ── All JS runs here in the content script — no inline scripts needed ──

    let currentFilter = "";
    let currentSort = { key: null, dir: 1 };
    let aiResults = null;

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

      if (aiResults) {
        const aiMap = {};
        aiResults.forEach((r, i) => {
          aiMap[r.title.toLowerCase()] = { rank: i, reason: r.reason, score: i + 1 };
        });
        items = items
          .filter((i) => aiMap[i.title.toLowerCase()])
          .sort((a, b) => {
            const ra = aiMap[a.title.toLowerCase()]?.rank ?? 999;
            const rb = aiMap[b.title.toLowerCase()]?.rank ?? 999;
            return ra - rb;
          })
          .map((i) => ({
            ...i,
            _aiReason: aiMap[i.title.toLowerCase()]?.reason,
            _aiScore: aiMap[i.title.toLowerCase()]?.score,
          }));
      } else if (currentFilter) {
        const q = currentFilter.toLowerCase();
        items = items.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.studio.toLowerCase().includes(q) ||
            i.genres.some((g) => g.toLowerCase().includes(q))
        );
      }

      if (!aiResults && currentSort.key) {
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
        <div class="infra-card ${item._aiReason ? "ai-match" : ""}">
          ${item._aiScore ? `<div class="ai-score-badge">AI #${item._aiScore}</div>` : ""}
          <div class="poster-area">
            <img src="${item.thumbnail}" loading="lazy" onerror="this.src='https://placehold.co/300x450/111/444?text=No+Poster'">
            <div class="rating-badge">${item.rating}</div>
            <div class="ep-status">EP ${item.currentEpisodes} / ${item.totalEpisodes}</div>
          </div>
          <div class="card-body">
            <div class="studio-line">${item.studio}</div>
            <div class="card-title" title="${item.title}">${item.title}</div>
            ${
              item._aiReason
                ? `<div class="ai-reason">✨ ${item._aiReason}</div>`
                : `<div class="description">${item.description}</div>`
            }
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

    async function runAISearch(query) {
      const aiBtn = document.getElementById("ai-search-btn");
      const aiStatus = document.getElementById("ai-status");
      const clearBtn = document.getElementById("clear-ai-btn");

      aiBtn.disabled = true;
      aiBtn.innerText = "Searching...";
      aiStatus.innerText = "Asking AI...";

      const animeListText = data
        .map(
          (a, i) =>
            `${i + 1}. ${a.title} | Genres: ${a.genres.join(", ")} | Synopsis: ${a.description.slice(0, 150)}`
        )
        .join("\n");

      const prompt = `You are an anime expert. The user wants: "${query}"

This season's anime:
${animeListText}

Return ONLY the matching anime as a JSON array:
[{"title": "Exact Title From List", "reason": "Short reason why it matches", "score": 1}, ...]

Where score is the rank (1 = best). Only genuine matches. Raw JSON only, no markdown.`;

      try {
        const res = await fetch(GEMINI_PROXY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: "anime_search",
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });

        const resData = await res.json();
        const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        const matches = JSON.parse(cleaned);

        if (matches.length === 0) {
          aiStatus.innerText = `No matches for "${query}". Try different keywords.`;
        } else {
          aiResults = matches;
          aiStatus.innerText = `${matches.length} AI match${matches.length > 1 ? "es" : ""} for "${query}"`;
          clearBtn.style.display = "inline-block";
        }
        render();
      } catch (e) {
        aiStatus.innerText = "AI search failed. Try again.";
        console.error("[AnimeDownloader] AI search error:", e);
      } finally {
        aiBtn.disabled = false;
        aiBtn.innerText = "✨ AI Search";
      }
    }

    // ── Attach event listeners ──

    document.getElementById("infra-search").addEventListener("input", (e) => {
      currentFilter = e.target.value;
      if (!aiResults) render();
    });

    document.getElementById("infra-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = e.target.value.trim();
        if (query.length > 2) runAISearch(query);
      }
    });

    document.getElementById("ai-search-btn").addEventListener("click", () => {
      const query = document.getElementById("infra-search").value.trim();
      if (query.length > 2) runAISearch(query);
    });

    document.getElementById("clear-ai-btn").addEventListener("click", () => {
      aiResults = null;
      document.getElementById("ai-status").innerText = "";
      document.getElementById("clear-ai-btn").style.display = "none";
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
        aiResults = null;
        render();
      });
    });

    render();
    setInterval(updateCountdowns, 1000);

    // ── Inline search-all dropdown (command-palette style) ──

    const sdOverlay = document.getElementById("sd-overlay");
    const sdInput = document.getElementById("sd-input");
    const sdResults = document.getElementById("sd-results");
    const sdOpenBtn = document.getElementById("open-search-dropdown");
    const sdCloseBtn = document.getElementById("sd-close");

    let sdAbort = null;
    let sdDebounce = null;

    const openSearch = () => {
      sdOverlay.classList.add("is-open");
      sdOverlay.setAttribute("aria-hidden", "false");
      // Wait for transition, then focus
      setTimeout(() => sdInput.focus(), 20);
    };
    const closeSearch = () => {
      sdOverlay.classList.remove("is-open");
      sdOverlay.setAttribute("aria-hidden", "true");
      if (sdAbort) sdAbort.abort();
    };

    sdOpenBtn.addEventListener("click", openSearch);
    sdCloseBtn.addEventListener("click", closeSearch);
    sdOverlay.addEventListener("click", (e) => {
      if (e.target === sdOverlay) closeSearch();
    });

    document.addEventListener("keydown", (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "Escape" && sdOverlay.classList.contains("is-open")) {
        closeSearch();
      }
    });

    const renderSdResults = (results, query) => {
      if (!query) {
        sdResults.innerHTML = `<div class="sd-hint">Start typing to search all anime on LiveChart.</div>`;
        return;
      }
      if (!results.length) {
        sdResults.innerHTML = `<div class="sd-empty">No matches for "${query}".</div>`;
        return;
      }
      sdResults.innerHTML = results
        .map((r) => {
          const dlUrl = `https://animepahe.pw/anime?searchFilter=${encodeURIComponent(r.title)}&auto=true`;
          const poster = r.poster
            ? `<img class="sd-result-poster" src="${r.poster}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
            : `<div class="sd-result-poster"></div>`;
          const metaBits = [];
          if (r.titleExtra) metaBits.push(r.titleExtra.replace(/^\(|\)$/g, ""));
          if (r.date) metaBits.push(r.date);
          const metaHTML = metaBits
            .map((b) => `<span>${b}</span>`)
            .join('<span class="sep">·</span>');
          const ratingHTML = r.rating
            ? `<span class="sep">·</span><span class="star">★ ${r.rating}</span>`
            : "";
          return `
            <a class="sd-result" href="${dlUrl}" target="_blank" rel="noopener">
              ${poster}
              <div class="sd-result-info">
                <div class="sd-result-title">${r.title}</div>
                <div class="sd-result-meta">${metaHTML}${ratingHTML}</div>
              </div>
              <span class="sd-result-dl">▶ Download</span>
            </a>`;
        })
        .join("");
    };

    const runSdSearch = async (query) => {
      if (sdAbort) sdAbort.abort();
      sdAbort = new AbortController();
      sdResults.innerHTML = `<div class="sd-loading">Searching…</div>`;
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
