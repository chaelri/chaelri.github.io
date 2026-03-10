(function () {
  "use strict";

  const HREF = window.location.href;
  const GEMINI_PROXY = "https://gemini-proxy-668755364170.asia-southeast1.run.app";

  if (HREF.includes("/anime/") || HREF.match(/\/anime\/\d+/)) {
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
        `https://animepahe.si/anime?searchFilter=${encodeURIComponent(title)}&episodeNumber=${input.value}&auto=true`
      );
    };

    wrapper.append(btn, input);
    h4.appendChild(wrapper);
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
          const downloadLink = `https://animepahe.si/anime?searchFilter=${encodeURIComponent(title)}&auto=true`;

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
    </div>
  </header>
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
