(function () {
  "use strict";

  const HREF = window.location.href;

  if (HREF.includes("?searchFilter=")) animePaheSearchAutoClick();
  else if (HREF.includes("/play/")) animePaheClicker();
  else if (HREF.includes("/anime/")) animePaheEpisodeList();
  else animePaheHomeInjector();

  if (!HREF.includes("/play/") && !HREF.includes("?searchFilter=")) {
    animePaheSearchPills();
  }

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

  // Fetch anime details (synopsis + cover image) from the /anime/{id} page.
  // Cached in animeHistory so we only fetch once per anime.
  function getAnimeDetails(animeId) {
    return new Promise((resolve) => {
      if (!animeId) return resolve({});
      chrome.storage.local.get(["animeHistory"], (result) => {
        const cached = result.animeHistory?.[animeId];
        if (cached?.details) {
          return resolve({
            synopsis: cached.synopsis,
            cover: cached.cover,
            details: cached.details,
          });
        }

        fetch(`/anime/${animeId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.text() : Promise.reject()))
          .then((html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");

            // Synopsis
            let synopsis = null;
            for (const sel of [".anime-synopsis", ".anime-summary", ".anime-description"]) {
              const el = doc.querySelector(sel);
              const text = (el?.textContent || "").trim();
              if (text && text.length > 20) { synopsis = text; break; }
            }

            // Cover image — AnimePahe stores it on .anime-cover[data-src]
            let cover = null;
            const coverSrc = doc.querySelector(".anime-cover[data-src]")?.getAttribute("data-src");
            if (coverSrc) cover = coverSrc.startsWith("//") ? "https:" + coverSrc : coverSrc;

            // Info panel — label/value pairs from .anime-info > p
            const info = [];
            doc.querySelectorAll(".anime-info > p").forEach((p) => {
              if (p.classList.contains("external-links")) return;
              const strong = p.querySelector("strong");
              if (!strong) return;
              const label = strong.textContent.trim().replace(/:\s*$/, "").trim();
              const innerLink = strong.querySelector("a");
              const clone = p.cloneNode(true);
              clone.querySelector("strong")?.remove();
              const trailing = clone.textContent.replace(/\s+/g, " ").trim();
              let value = innerLink ? innerLink.textContent.trim() : "";
              value = [value, trailing].filter(Boolean).join(" ").trim();
              if (label && value) info.push({ label, value });
            });

            // Genres
            const genres = Array.from(doc.querySelectorAll(".anime-genre li a"))
              .map((a) => ({ name: a.textContent.trim(), url: a.getAttribute("href") }))
              .filter((g) => g.name);

            // External links (AniList, MAL, etc.)
            const externals = Array.from(doc.querySelectorAll(".external-links a"))
              .map((a) => {
                const href = a.getAttribute("href") || "";
                return {
                  name: a.textContent.trim(),
                  url: href.startsWith("//") ? "https:" + href : href,
                };
              })
              .filter((e) => e.name && e.url);

            const details = { info, genres, externals };

            chrome.storage.local.get(["animeHistory"], (r2) => {
              const h = r2.animeHistory || {};
              const a = h[animeId] || { downloaded: [] };
              a.synopsis = synopsis || null;
              a.cover = cover || null;
              a.details = details;
              h[animeId] = a;
              chrome.storage.local.set({ animeHistory: h });
            });
            resolve({ synopsis, cover, details });
          })
          .catch(() => resolve({}));
      });
    });
  }


  // ── BULK AUTO-PILOT: fetch each remaining episode's download URL in
  //    parallel, hand the queue to background for sequential tab-open /
  //    download-start / close. No navigation — the current page stays put.
  // ───────────────────────────────────────────────────────────────────────

  async function fetchEpisodeDownloadInfo(episodeUrl) {
    try {
      const res = await fetch(episodeUrl, { credentials: "same-origin" });
      if (!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const dlMenu = doc.getElementById("pickDownload");
      if (!dlMenu) return null;
      const dlLinks = Array.from(dlMenu.querySelectorAll("a.dropdown-item"))
        .filter((a) => {
          const badge = a.querySelector(".badge-warning");
          return !badge?.innerText?.toLowerCase().includes("eng");
        })
        .sort((a, b) => {
          const ap = parseInt(a.innerText.match(/(\d+)p/)?.[1] || 0);
          const bp = parseInt(b.innerText.match(/(\d+)p/)?.[1] || 0);
          return bp - ap;
        });
      return dlLinks[0] ? { downloadUrl: dlLinks[0].href } : null;
    } catch (e) {
      return null;
    }
  }

  function showAutoPilotPanel(animeTitle, todoEpisodes) {
    const existing = document.getElementById("autopilot-panel");
    if (existing) existing.remove();
    const panel = document.createElement("div");
    panel.id = "autopilot-panel";
    panel.className = "autopilot-panel";
    panel.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">● Auto-Pilot</span>
        <button type="button" class="ap-close" title="Stop auto-pilot">✕</button>
      </div>
      <div class="ap-title-line">${animeTitle || "Bulk download"}</div>
      <div class="ap-status" id="ap-status">Preparing…</div>
      <div class="ap-bar"><div class="ap-fill" id="ap-fill"></div></div>
      <div class="ap-chips" id="ap-chips">${todoEpisodes
        .map((ep) => `<span class="ap-chip" data-ep="${ep.num}">${ep.num}</span>`)
        .join("")}</div>
    `;
    document.getElementById("nuke-body").appendChild(panel);
    panel.querySelector(".ap-close").addEventListener("click", () => {
      panel.dataset.cancelled = "1";
      chrome.runtime.sendMessage({ action: "cancelBatch" });
      panel.remove();
      resetAutoPilotButton();
    });
    return panel;
  }

  function setPanelStatus(panel, text) {
    const el = panel?.querySelector("#ap-status");
    if (el) el.textContent = text;
  }

  function setPanelFill(panel, done, total) {
    const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    const fill = panel?.querySelector("#ap-fill");
    if (fill) fill.style.width = pct + "%";
  }

  function markPanelChip(panel, ep, status) {
    const chip = panel?.querySelector(`.ap-chip[data-ep="${ep}"]`);
    if (!chip) return;
    chip.classList.remove("active", "done", "failed");
    if (status) chip.classList.add(status);
  }

  function resetAutoPilotButton() {
    const btn = document.getElementById("tb-auto");
    if (btn) {
      btn.classList.remove("auto-on");
      btn.title = "Start auto-pilot: download all remaining episodes (A)";
      const ico = btn.querySelector(".tb-pill-ico");
      const label = btn.querySelector(".tb-pill-label");
      if (ico) ico.textContent = "▸";
      if (label) label.textContent = "Auto-Pilot";
    }
    // Strip ?auto=true without reloading so a refresh won't restart bulk mode.
    if (/[?&]auto=true/.test(window.location.search)) {
      const cleanUrl = window.location.href
        .replace(/[&?]auto=true/, "")
        .replace(/\?$/, "");
      try { history.replaceState(null, "", cleanUrl); } catch (e) {}
    }
  }

  function markEpisodeDoneInUI(ep) {
    document.querySelectorAll(".ep-chip").forEach((chip) => {
      if (parseFloat(chip.textContent) === ep) chip.classList.add("done");
    });
  }

  async function runBulkAutoPilot(data) {
    const activeIdx = (data.episodes || []).findIndex((e) => e.active);
    if (activeIdx < 0) return;
    const todo = data.episodes.slice(activeIdx);

    const panel = showAutoPilotPanel(data.title, todo);
    setPanelStatus(panel, `Fetching links… 0 / ${todo.length}`);

    // Listen for progress from background. Attach once per panel.
    chrome.runtime.onMessage.addListener(function onBatchMsg(msg) {
      if (msg.action !== "batchProgress") return;
      if (!document.getElementById("autopilot-panel")) {
        chrome.runtime.onMessage.removeListener(onBatchMsg);
        return;
      }
      if (msg.status === "start") {
        markPanelChip(panel, msg.ep, "active");
        setPanelStatus(panel, `Downloading EP ${msg.ep} · ${msg.done} of ${msg.total}`);
      } else if (msg.status === "done") {
        markPanelChip(panel, msg.ep, "done");
        setPanelFill(panel, msg.done, msg.total);
        markEpisodeDoneInUI(msg.ep);
        const progEl = document.querySelector(".ep-progress");
        if (progEl) {
          // Count chips only — the ep-card set mirrors the chips, so counting
          // both would double the total.
          const done = document.querySelectorAll(".ep-chip.done").length;
          progEl.textContent = `${done} / ${msg.total} downloaded`;
        }
      } else if (msg.status === "failed") {
        markPanelChip(panel, msg.ep, "failed");
      } else if (msg.status === "complete") {
        setPanelStatus(panel, "Series complete ✓");
        setPanelFill(panel, 1, 1);
        setTimeout(() => panel.remove(), 4000);
        chrome.runtime.onMessage.removeListener(onBatchMsg);
        resetAutoPilotButton();
      } else if (msg.status === "cancelled") {
        chrome.runtime.onMessage.removeListener(onBatchMsg);
        resetAutoPilotButton();
      }
    });

    // Parallel-fetch download URLs (throttled) — the current episode's URL is
    // already in data.downloadUrl so we reuse it without a network round-trip.
    const items = [];
    let completed = 0;
    const report = () =>
      setPanelStatus(panel, `Fetching links… ${completed} / ${todo.length}`);

    const fetchOne = async (ep) => {
      const url =
        ep.num === data.epNum
          ? data.downloadUrl
          : (await fetchEpisodeDownloadInfo(ep.url))?.downloadUrl;
      completed += 1;
      report();
      return url ? { downloadUrl: url, ep: ep.num } : null;
    };

    const CONCURRENCY = 4;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      if (panel.dataset.cancelled) return;
      const chunk = todo.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(fetchOne));
      for (const r of results) if (r) items.push(r);
    }

    if (!items.length) {
      setPanelStatus(panel, "Failed to fetch download links");
      return;
    }

    chrome.runtime.sendMessage({
      action: "batchDownload",
      animeId: data.animeId,
      animeTitle: data.title,
      poster: data.poster,
      items,
    });
    setPanelStatus(panel, `Queued ${items.length} episodes…`);
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
              runBulkAutoPilot(data);
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

    const posterImg = data.poster
      ? `<img class="poster" src="${data.poster}" alt="" onerror="this.style.display='none'">`
      : "";
    const posterHTML = posterImg
      ? (data.animeId
        ? `<a href="/anime/${data.animeId}?view=browse" title="View anime page on AnimePahe">${posterImg}</a>`
        : posterImg)
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
    #nuke-body { pointer-events: auto !important; position: fixed; inset: 0; z-index: 2147483647; background: var(--bg); font-family: 'Inter', sans-serif; color: var(--fg); overflow-y: auto; overflow-x: hidden; font-weight: 400; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
    #nuke-body::-webkit-scrollbar { width: 10px; height: 10px; }
    #nuke-body::-webkit-scrollbar-track { background: transparent; }
    #nuke-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; transition: background 0.15s; }
    #nuke-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); background-clip: padding-box; }
    #nuke-body::-webkit-scrollbar-corner { background: transparent; }

    .top-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 16px; padding: 10px 20px; border-bottom: 1px solid var(--line); min-height: 60px; background: #0a0a0a; overflow: hidden; isolation: isolate; }
    .top-bar::before { content: ""; position: absolute; inset: -40px; background-image: var(--tb-bg, none); background-size: cover; background-position: center 30%; filter: blur(40px) saturate(1.3); opacity: 0.55; z-index: -2; }
    .top-bar::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,10,10,0.45) 0%, rgba(10,10,10,0.7) 100%); backdrop-filter: saturate(1.2); -webkit-backdrop-filter: saturate(1.2); z-index: -1; }
    .top-bar > * { position: relative; }

    .top-bar .tb-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
    .top-bar .tb-poster-link { display: block; flex-shrink: 0; line-height: 0; transition: opacity 0.15s; }
    .top-bar .tb-poster-link:hover { opacity: 0.8; }
    .top-bar .tb-poster { width: 36px; height: 54px; object-fit: cover; border-radius: 3px; background: #111; display: block; }
    .top-bar .tb-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; text-decoration: none; color: inherit; cursor: pointer; }
    .top-bar .tb-info:hover .tb-title { color: #d5015b; }
    .top-bar .tb-title { font-size: 0.92rem; font-weight: 600; letter-spacing: -0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--fg); display: block; transition: color 0.15s; }
    .top-bar .tb-sub { font-size: 0.68rem; color: var(--fg-dim); letter-spacing: 1px; text-transform: uppercase; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .top-bar .tb-sub .tb-meta-sep { color: var(--fg-ghost); margin: 0 6px; }

    .tb-logo { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; text-decoration: none; opacity: 0.9; transition: opacity 0.15s; }
    .tb-logo:hover { opacity: 1; }
    .tb-logo img { height: 22px; width: auto; display: block; }
    .tb-divider { width: 1px; height: 28px; background: rgba(255,255,255,0.15); flex-shrink: 0; }

    .tb-controls { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--line); border-radius: 999px; padding: 3px; flex-shrink: 0; }
    .tb-nav { width: 32px; height: 32px; border-radius: 999px; border: none; background: none; color: var(--fg-dim); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-family: inherit; font-size: 0.95rem; transition: 0.15s; text-decoration: none; padding: 0; }
    .tb-nav:hover:not(.disabled) { color: var(--fg); background: rgba(255,255,255,0.06); }
    .tb-nav.disabled { opacity: 0.25; pointer-events: none; }
    .tb-ep-btn { padding: 0 14px; height: 32px; background: none; border: none; color: var(--fg); font-family: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; transition: background 0.15s; text-transform: uppercase; white-space: nowrap; }
    .tb-ep-btn:hover { background: rgba(255,255,255,0.06); }
    .tb-ep-btn .tb-ep-total { color: var(--fg-dim); font-weight: 500; }
    .tb-ep-btn .tb-chev { opacity: 0.5; font-size: 0.7rem; }

    .tb-dl { display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; height: 38px; border-radius: 999px; background: var(--accent); color: #fff; text-decoration: none; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; transition: filter 0.15s; flex-shrink: 0; white-space: nowrap; }
    .tb-dl:hover { filter: brightness(1.12); }
    .tb-dl .tb-dl-ico { font-size: 0.95rem; line-height: 1; }
    .tb-dl .tb-dl-size { font-size: 0.6rem; opacity: 0.75; font-weight: 500; letter-spacing: 0.5px; }

    .tb-pill { display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; height: 38px; border-radius: 999px; border: 1px solid var(--line); color: var(--fg-dim); background: rgba(255,255,255,0.02); text-decoration: none; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; transition: 0.15s; flex-shrink: 0; white-space: nowrap; font-family: inherit; cursor: pointer; }
    .tb-pill:hover { color: var(--fg); border-color: var(--line-hover); background: rgba(255,255,255,0.06); }
    .tb-pill .tb-pill-ico { font-size: 0.8rem; line-height: 1; }
    .tb-pill.auto-on { color: #fff; background: #e53935; border-color: #e53935; }
    .tb-pill.auto-on:hover { filter: brightness(1.1); background: #e53935; border-color: #e53935; color: #fff; }

    /* Popover: episode picker — sibling of .top-bar so it escapes the glass clip */
    .tb-pop { position: fixed; z-index: 100; top: var(--pop-top, 64px); left: var(--pop-left, 50%); width: 340px; max-height: 420px; background: #0e0e0e; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); overflow: hidden; display: none; flex-direction: column; opacity: 0; transform: translate(-50%, -6px); transition: opacity 0.15s, transform 0.15s; }
    .tb-pop.is-open { display: flex; opacity: 1; transform: translate(-50%, 0); }
    .tb-pop-head { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid var(--line); }
    .tb-pop-title { font-size: 0.65rem; letter-spacing: 1.5px; color: var(--fg-ghost); font-weight: 500; text-transform: uppercase; }
    .tb-pop-progress { font-size: 0.65rem; letter-spacing: 1px; color: var(--done); font-weight: 500; text-transform: uppercase; }
    .tb-pop-grid { padding: 12px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 4px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
    .tb-pop-grid::-webkit-scrollbar { width: 4px; }
    .tb-pop-grid::-webkit-scrollbar-thumb { background: var(--line); border-radius: 2px; }

    .player-section { height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 32px 40px; box-sizing: border-box; }
    .player-wrap { width: 1400px; max-width: 100%; max-height: 100%; aspect-ratio: 16/9; background: #000; border-radius: 4px; overflow: hidden; }
    .player-wrap iframe { width: 100%; height: 100%; border: none; display: block; }

    .detail-section { position: relative; padding: 60px 40px 60px; display: flex; justify-content: center; isolation: isolate; overflow: hidden; }
    .detail-section::before { content: ""; position: absolute; inset: 0; background-image: var(--detail-bg, none); background-size: cover; background-position: center 25%; filter: blur(60px) saturate(1.3); opacity: 0.45; z-index: -2; transition: filter 0.5s ease, opacity 0.5s ease; }
    .detail-section.has-cover::before { filter: none; opacity: 0.55; }
    .detail-section::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.7) 45%, rgba(10,10,10,0.95) 80%, #0a0a0a 100%); z-index: -1; }
    .content { max-width: 900px; width: 100%; }

    .detail { display: grid; grid-template-columns: auto 1fr; gap: 64px; align-items: start; }

    .poster { width: 180px; aspect-ratio: 2/3; object-fit: cover; border-radius: 4px; display: block; }

    .info { min-width: 0; padding-top: 6px; }
    .title { font-weight: 600; font-size: 1.9rem; line-height: 1.15; letter-spacing: -0.5px; margin: 0 0 10px 0; }
    .meta { font-size: 0.8rem; color: var(--fg-dim); margin-bottom: 24px; font-weight: 400; }

    .synopsis { margin-bottom: 32px; max-width: 680px; opacity: 0; transition: opacity 0.25s ease; }
    .synopsis.loaded { opacity: 1; }
    .synopsis:empty { display: none; }
    .synopsis-text { font-size: 0.88rem; line-height: 1.65; color: rgba(255,255,255,0.78); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; font-weight: 400; }
    .synopsis-text.expanded { -webkit-line-clamp: unset; display: block; }
    .synopsis-toggle { display: inline-block; margin-top: 10px; font-size: 0.65rem; color: var(--accent); text-transform: uppercase; letter-spacing: 1.2px; cursor: pointer; font-weight: 500; background: none; border: none; padding: 0; font-family: inherit; transition: color 0.15s; }
    .synopsis-toggle:hover { color: var(--fg); }

    .info-card { margin-bottom: 32px; max-width: 680px; opacity: 0; transition: opacity 0.3s; }
    .info-card.loaded { opacity: 1; }
    .info-card:empty { display: none; }
    .info-grid { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin-bottom: 16px; font-size: 0.76rem; }
    .info-label { color: var(--fg-ghost); font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; font-size: 0.66rem; align-self: center; }
    .info-value { color: var(--fg-dim); font-weight: 400; line-height: 1.5; }
    .info-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .info-chip { display: inline-flex; padding: 4px 10px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--fg-dim); font-size: 0.66rem; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none; transition: 0.15s; }
    .info-chip:hover { background: rgba(213,1,91,0.18); color: #d5015b; }
    .info-externals { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; font-size: 0.72rem; }
    .info-externals-label { color: var(--fg-ghost); font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; font-size: 0.62rem; margin-right: 4px; }
    .info-externals a { color: #d5015b; text-decoration: none; font-weight: 500; }
    .info-externals a:hover { text-decoration: underline; }

    a.title { text-decoration: none; color: var(--fg); transition: color 0.15s; }
    a.title:hover { color: #d5015b; }
    .poster-col > a { display: inline-block; transition: opacity 0.15s; }
    .poster-col > a:hover { opacity: 0.85; }

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

    /* Thumbnail episode grid — replaces .episode-grid chips once /anime/{id}
       snapshots load. Falls back to chips if the fetch fails. */

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

    /* Auto-Pilot progress panel — floats bottom-right while bulk runs */
    .autopilot-panel { position: fixed; right: 20px; bottom: 20px; width: 340px; max-width: calc(100vw - 40px); background: rgba(14,14,14,0.96); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.7); color: var(--fg); padding: 14px 16px 16px; z-index: 50; font-family: 'Inter', sans-serif; }
    .ap-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .ap-title { font-size: 0.65rem; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); }
    .ap-close { background: none; border: none; color: var(--fg-dim); font-size: 0.9rem; cursor: pointer; padding: 2px 8px; font-family: inherit; border-radius: 4px; transition: 0.15s; }
    .ap-close:hover { color: var(--fg); background: rgba(255,255,255,0.06); }
    .ap-title-line { font-size: 0.88rem; font-weight: 600; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ap-status { font-size: 0.75rem; color: var(--fg-dim); margin-bottom: 10px; font-weight: 500; }
    .ap-bar { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-bottom: 12px; }
    .ap-fill { height: 100%; background: var(--accent); transition: width 0.45s ease; width: 0%; }
    .ap-chips { display: flex; flex-wrap: wrap; gap: 3px; max-height: 120px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
    .ap-chip { font-size: 0.6rem; font-weight: 600; color: var(--fg-ghost); padding: 3px 7px; border-radius: 3px; border: 1px solid var(--line); min-width: 22px; text-align: center; transition: 0.15s; }
    .ap-chip.active { color: var(--accent); border-color: var(--accent); background: rgba(59,151,252,0.12); }
    .ap-chip.done { color: var(--done); border-color: rgba(0,230,118,0.4); background: rgba(0,230,118,0.06); }
    .ap-chip.failed { color: #e53935; border-color: rgba(229,57,53,0.45); }

    /* Mobile fallback */
    @media (max-width: 720px) {
      .autopilot-panel { right: 10px; bottom: 10px; width: calc(100vw - 20px); }
      .top-bar { padding: 8px 12px; min-height: 52px; gap: 10px; }
      .top-bar .tb-left { gap: 10px; }
      .top-bar .tb-poster { width: 28px; height: 42px; }
      .top-bar .tb-title { font-size: 0.82rem; }
      .top-bar .tb-sub { display: none; }
      .tb-logo img { height: 18px; }
      .tb-ep-btn { padding: 0 8px; font-size: 0.68rem; }
      .tb-ep-btn .tb-ep-total, .tb-ep-btn .tb-chev { display: none; }
      .tb-dl { padding: 0 12px; height: 34px; }
      .tb-dl .tb-dl-size { display: none; }
      .tb-pill { padding: 0 10px; height: 34px; }
      .tb-pill .tb-pill-label { display: none; }
      .tb-pop { position: fixed; top: 56px; left: 8px; right: 8px; width: auto; max-width: none; transform: translate(0, -6px); }
      .tb-pop.is-open { transform: translate(0, 0); }
      .tb-pop { right: 8px; left: 8px; width: auto; }
      .player-section { height: auto; padding: 16px 12px 0; }
      .detail-section { padding: 28px 16px 40px; }
      .content { max-width: 360px; }
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
    <div class="top-bar" style="${data.poster ? `--tb-bg: url('${data.poster}')` : ""}">
      <a href="/" class="tb-logo" title="AnimePahe home">
        <img src="/app/images/apdoesnthavelogotheysaidapistooplaintheysaid.svg" onerror="this.src='/app/images/apdoesnthavelogotheysaidapistooplaintheysaid.png'" alt="AnimePahe">
      </a>
      <div class="tb-divider" aria-hidden="true"></div>
      <div class="tb-left">
        ${data.poster
          ? (data.animeId
            ? `<a class="tb-poster-link" href="/anime/${data.animeId}?view=browse" title="View anime page on AnimePahe"><img class="tb-poster" src="${data.poster}" alt=""></a>`
            : `<img class="tb-poster" src="${data.poster}" alt="">`)
          : ""}
        ${data.animeId
          ? `<a class="tb-info" href="/anime/${data.animeId}?view=browse" title="View anime page on AnimePahe">
              <div class="tb-title">${data.title}</div>
              <div class="tb-sub">${metaBits.length ? metaBits.join(`<span class="tb-meta-sep">·</span>`) : "Anime"}</div>
            </a>`
          : `<div class="tb-info">
              <div class="tb-title">${data.title}</div>
              <div class="tb-sub">${metaBits.length ? metaBits.join(`<span class="tb-meta-sep">·</span>`) : "Anime"}</div>
            </div>`}
      </div>
      <div class="tb-controls" role="group" aria-label="Episode navigation">
        <a href="${data.prevUrl || "#"}" class="tb-nav prev ${data.prevUrl ? "" : "disabled"}" title="Previous episode (J)" aria-label="Previous episode">‹</a>
        <button type="button" class="tb-ep-btn" id="tb-ep-open" title="Jump to episode" aria-haspopup="true">
          <span>EP ${(data.progress || "").split("/")[0].trim()}</span>
          <span class="tb-ep-total">/ ${(data.progress || "").split("/")[1]?.trim() || ""}</span>
          <span class="tb-chev">▾</span>
        </button>
        <a href="${data.nextUrl ? data.nextUrl.replace(/[&?]auto=true/, "") : "#"}" class="tb-nav next ${data.nextUrl ? "" : "disabled"}" title="Next episode (L)" aria-label="Next episode">›</a>
      </div>
      ${data.qualities?.[0] ? `<a href="${data.qualities[0].href}" target="_blank" id="tb-dl" class="tb-dl" title="Download ${data.qualities[0].res} (D)"><span class="tb-dl-ico">↓</span><span>${data.qualities[0].res}</span>${data.qualities[0].size ? `<span class="tb-dl-size">${data.qualities[0].size}</span>` : ""}</a>` : ""}
      <button type="button" id="tb-auto" class="tb-pill${data.auto ? " auto-on" : ""}" title="${data.auto ? "Auto-pilot running — click to stop (A)" : "Start auto-pilot: download all remaining episodes (A)"}">
        <span class="tb-pill-ico">${data.auto ? "◼" : "▸"}</span>
        <span class="tb-pill-label">${data.auto ? "Stop Auto" : "Auto-Pilot"}</span>
      </button>
    </div>
    <div class="tb-pop" id="tb-pop" role="dialog" aria-label="Episode picker">
      <div class="tb-pop-head">
        <span class="tb-pop-title">Jump to episode</span>
        ${totalCount ? `<span class="tb-pop-progress">${doneCount} / ${totalCount} downloaded</span>` : ""}
      </div>
      <div class="tb-pop-grid">${gridHTML}</div>
    </div>
    ${data.embedUrl ? `<div class="player-section"><div class="player-wrap"><iframe id="player-iframe" src="${data.embedUrl}" allow="fullscreen; autoplay; picture-in-picture" frameborder="0"></iframe></div></div>` : ""}
    <div class="detail-section" id="details" style="${data.poster ? `--detail-bg: url('${data.poster}')` : ""}">
      <div class="content">
        <div class="detail">
          <div class="poster-col">${posterHTML}</div>
          <div class="info">
            ${data.animeId
              ? `<a class="title" href="/anime/${data.animeId}?view=browse" title="View anime page on AnimePahe">${data.title}</a>`
              : `<div class="title">${data.title}</div>`}
            ${metaHTML}
            <div class="synopsis" id="synopsis-slot"></div>
            <div class="info-card" id="info-card"></div>
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

    // Mark episode as downloaded when user clicks any quality button (detail row + top-bar quick download)
    const markCurrent = () => {
      markDownloaded(data.animeId, data.epNum, data.title, data.poster);
      document.querySelectorAll(".ep-chip.current").forEach((chip) => {
        if (!chip.classList.contains("done")) {
          chip.classList.add("done");
          if (!chip.querySelector(".check")) {
            const span = document.createElement("span");
            span.className = "check";
            span.textContent = "✓";
            chip.appendChild(span);
          }
        }
      });
    };
    document.querySelectorAll(".quality-btn").forEach((btn) => {
      btn.addEventListener("click", markCurrent);
    });
    document.getElementById("tb-dl")?.addEventListener("click", markCurrent);

    // Episode picker popover — lives outside the top-bar (which has overflow:
    // hidden for the glass blur), so we position it via fixed coordinates
    // computed from the EP button's rect.
    const epBtn = document.getElementById("tb-ep-open");
    const pop = document.getElementById("tb-pop");
    const positionPop = () => {
      const rect = epBtn.getBoundingClientRect();
      const popWidth = pop.offsetWidth || 340;
      const margin = 8;
      let left = rect.left + rect.width / 2;
      // Clamp so popover never spills off the viewport edges.
      left = Math.max(margin + popWidth / 2, Math.min(window.innerWidth - margin - popWidth / 2, left));
      pop.style.setProperty("--pop-left", left + "px");
      pop.style.setProperty("--pop-top", rect.bottom + 10 + "px");
    };
    const openPop = () => {
      positionPop();
      pop.classList.add("is-open");
      requestAnimationFrame(positionPop); // re-measure once display flips
      const currentChip = pop.querySelector(".ep-chip.current");
      if (currentChip) currentChip.scrollIntoView({ block: "center" });
    };
    const closePop = () => pop.classList.remove("is-open");
    const togglePop = () => (pop.classList.contains("is-open") ? closePop() : openPop());
    window.addEventListener("resize", () => {
      if (pop.classList.contains("is-open")) positionPop();
    });
    epBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePop();
    });
    pop?.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", (e) => {
      if (pop.classList.contains("is-open") && !pop.contains(e.target) && e.target !== epBtn) {
        closePop();
      }
    });

    // Fetch anime details (synopsis + cover image + info panel) and enrich the UI
    getAnimeDetails(data.animeId).then(({ synopsis, cover, details }) => {
      if (cover) {
        const section = document.querySelector(".detail-section");
        if (section) {
          section.style.setProperty("--detail-bg", `url('${cover}')`);
          section.classList.add("has-cover");
        }
      }

      if (details) {
        const card = document.getElementById("info-card");
        if (card) {
          if (details.info?.length) {
            const grid = document.createElement("div");
            grid.className = "info-grid";
            details.info.forEach((r) => {
              const l = document.createElement("div");
              l.className = "info-label";
              l.textContent = r.label;
              const v = document.createElement("div");
              v.className = "info-value";
              v.textContent = r.value;
              grid.append(l, v);
            });
            card.appendChild(grid);
          }
          if (details.genres?.length) {
            const chips = document.createElement("div");
            chips.className = "info-chips";
            details.genres.forEach((g) => {
              const a = document.createElement("a");
              a.className = "info-chip";
              a.href = g.url || "#";
              a.textContent = g.name;
              chips.appendChild(a);
            });
            card.appendChild(chips);
          }
          if (details.externals?.length) {
            const wrap = document.createElement("div");
            wrap.className = "info-externals";
            const label = document.createElement("span");
            label.className = "info-externals-label";
            label.textContent = "External";
            wrap.appendChild(label);
            details.externals.forEach((e) => {
              const a = document.createElement("a");
              a.href = e.url;
              a.target = "_blank";
              a.rel = "noopener";
              a.textContent = e.name;
              wrap.appendChild(a);
            });
            card.appendChild(wrap);
          }
          if (card.children.length) card.classList.add("loaded");
        }
      }

      if (synopsis) {
        const slot = document.getElementById("synopsis-slot");
        if (!slot) return;
        const text = document.createElement("div");
        text.className = "synopsis-text";
        text.textContent = synopsis;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "synopsis-toggle";
        btn.textContent = "Read more";
        slot.append(text, btn);
        slot.classList.add("loaded");
        requestAnimationFrame(() => {
          if (text.scrollHeight <= text.clientHeight + 2) btn.style.display = "none";
        });
        btn.addEventListener("click", () => {
          const expanded = text.classList.toggle("expanded");
          btn.textContent = expanded ? "Show less" : "Read more";
        });
      }
    });

    // Auto-pilot toggle. Uses .auto-on class as the source of truth instead
    // of the cached `data.auto` so the button reflects live state (after
    // completion / cancellation, the class gets flipped without a reload).
    document.getElementById("tb-auto")?.addEventListener("click", () => {
      const btn = document.getElementById("tb-auto");
      if (btn.classList.contains("auto-on")) {
        chrome.runtime.sendMessage({ action: "cancelBatch" });
        document.getElementById("autopilot-panel")?.remove();
        resetAutoPilotButton();
      } else {
        const here = window.location.href;
        const next = here + (here.includes("?") ? "&" : "?") + "auto=true";
        window.location.href = next;
      }
    });

    // Keyboard shortcuts: J prev, L next, D download, A auto-pilot, Esc close popover.
    // Guard neuters window.open, so we trigger link clicks on in-DOM anchors instead.
    document.addEventListener("keydown", (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape" && pop.classList.contains("is-open")) {
        closePop();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "j" && data.prevUrl) { e.preventDefault(); window.location.href = data.prevUrl; }
      else if (k === "l" && data.nextUrl) { e.preventDefault(); window.location.href = data.nextUrl.replace(/[&?]auto=true/, ""); }
      else if (k === "d") {
        const link = document.getElementById("tb-dl");
        if (link) { e.preventDefault(); link.click(); }
      }
      else if (k === "a") {
        const btn = document.getElementById("tb-auto");
        if (btn) { e.preventDefault(); btn.click(); }
      }
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "browse") return;
    const epLast = params.get("episodeLast") === "true";
    const epNum = parseInt(params.get("episodeNumber") || "1", 10);
    const auto = params.get("auto") === "true";

    setTimeout(() => {
      document.querySelector(".btn-group.btn-group-toggle")?.children[0]?.click();
      setTimeout(() => {
        const list = document.querySelectorAll(".episode-list.row > div");
        const picked = epLast && list.length > 0
          ? list[list.length - 1]
          : (list[epNum - 1] || list[0]);
        const link = picked?.querySelector("a");
        if (link) {
          let target = link.href;
          if (auto) target += (target.includes("?") ? "&" : "?") + "auto=true";
          window.location.href = target;
        }
      }, 1000);
    }, 1000);
  }

  // ── FIRST/LAST EP PILL INJECTION (home thumbnails + search results) ──

  function injectFLStyles() {
    if (document.getElementById("fl-pill-styles")) return;
    const style = document.createElement("style");
    style.id = "fl-pill-styles";
    style.textContent = `
      .episode-snapshot { position: relative; overflow: visible !important; }
      /* Darken the bottom gradient so the title + episode count read clearly
         against any thumbnail art. */
      .episode-label-wrap {
        background: linear-gradient(to top,
          rgba(0, 0, 0, 0.78) 0%,
          rgba(0, 0, 0, 0.55) 45%,
          rgba(0, 0, 0, 0.22) 80%,
          rgba(0, 0, 0, 0) 100%) !important;
      }
      .episode-title,
      .episode-title a,
      .episode-number {
        text-shadow: none !important;
      }
      .fl-first-btn {
        position: absolute;
        top: 0;
        right: 0;
        display: flex !important;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 9px 13px;
        background: #d5015b !important;
        color: #fff !important;
        z-index: 9 !important;
        border: none !important;
        border-radius: 0 !important;
        text-decoration: none !important;
        cursor: pointer !important;
        box-sizing: border-box;
        font-family: inherit;
        text-transform: uppercase;
        line-height: 1;
        transform-origin: top right;
        transform: scale(1);
        outline: 0 solid rgba(255, 255, 255, 0);
        box-shadow: 0 0 0 rgba(213, 1, 91, 0);
        transition:
          background 0.3s ease,
          transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1),
          outline-color 0.3s ease,
          outline-width 0.3s ease !important;
      }
      .fl-first-btn:hover {
        background: #ec1670 !important;
        transform: scale(1.12) !important;
        outline: 2px solid rgba(255, 255, 255, 0.95) !important;
        outline-offset: -2px;
        box-shadow: 0 10px 32px rgba(213, 1, 91, 0.65) !important;
      }
      .fl-first-btn:hover .fl-first-btn-top {
        letter-spacing: 2.8px;
        opacity: 1;
      }
      .fl-first-btn:hover .fl-first-btn-bot {
        letter-spacing: 1px;
      }
      .fl-first-btn:active {
        background: #b01049 !important;
        transform: scale(1.04) !important;
        transition:
          background 0.08s ease,
          transform 0.08s ease,
          box-shadow 0.08s ease !important;
      }
      .fl-first-btn-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .fl-first-btn:hover .fl-first-btn-icon {
        transform: translateX(-1px) scale(1.15);
      }
      .fl-first-btn-top {
        font-size: 0.8rem;
        font-weight: 300;
        letter-spacing: 2px;
        opacity: 0.85;
        transition: letter-spacing 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
      }
      .fl-first-btn-bot {
        font-size: 0.92rem;
        font-weight: 800;
        letter-spacing: 0.6px;
        transition: letter-spacing 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      /* Episode-number cell: stacked "LATEST / EPISODE / <n>" all centered */
      .episode-number-wrap { text-align: center !important; }
      .episode-number {
        display: flex !important;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        font-size: 2rem !important;
        font-weight: 800 !important;
        line-height: 1 !important;
        text-align: center !important;
      }
      .fl-ep-kicker {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1;
        margin-bottom: 2px;
      }
      .fl-ep-kicker-line {
        font-size: 0.6rem;
        font-weight: bold !important;
        text-transform: uppercase;
        opacity: 0.6;
        text-shadow: none;
      }
      /* Genre chips under the title */
      .fl-genre-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
        min-height: 16px;
      }
      .fl-genre-chip {
        font-size: 0.55rem !important;
        font-weight: 700;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        padding: 3px 7px;
        background: rgba(255, 255, 255, 0.14);
        color: rgba(255, 255, 255, 0.88) !important;
        text-decoration: none !important;
        text-shadow: none !important;
        line-height: 1.2;
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .fl-genre-chip:hover {
        background: #d5015b;
        border-color: #d5015b;
        color: #fff !important;
      }
      /* NSFW blur — blur the thumbnail art on cards tagged ecchi/erotica/hentai.
         Hover to reveal. UI (button, gradient, title) stays sharp. */
      .fl-nsfw .episode-snapshot img {
        filter: blur(18px) saturate(0.85) brightness(0.75);
        transform: scale(1.05);
        transition: filter 0.35s ease, transform 0.35s ease;
      }
      .fl-nsfw .episode-snapshot:hover img {
        filter: blur(0) saturate(1) brightness(1);
        transform: scale(1);
      }
      .fl-nsfw .episode-snapshot::before {
        content: "HOVER TO REVEAL";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 0.58rem;
        font-weight: 700;
        letter-spacing: 1.6px;
        color: rgba(255, 255, 255, 0.75);
        background: rgba(0, 0, 0, 0.45);
        padding: 5px 10px;
        pointer-events: none;
        z-index: 3;
        transition: opacity 0.2s ease;
      }
      .fl-nsfw .episode-snapshot:hover::before {
        opacity: 0;
      }
      .search-results li { position: relative; }
      .fl-search-first {
        position: absolute;
        top: 50%;
        right: 6px;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #d5015b;
        color: #fff !important;
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        padding: 6px 10px;
        border-radius: 0;
        border: 1px solid #d5015b;
        text-decoration: none !important;
        transition: background 0.12s ease, border-color 0.12s ease;
        z-index: 6;
        cursor: pointer;
        font-family: inherit;
        line-height: 1;
      }
      .fl-search-first::before {
        content: "\\23EE";
        font-size: 0.75rem;
        line-height: 1;
      }
      .fl-search-first:hover {
        background: #ec1670;
        border-color: #ec1670;
      }
      .fl-search-first:active {
        background: #b01049;
        border-color: #b01049;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Throttle genre hydration: /anime/{id} fetches are heavy, so cap parallelism.
  const _genreQueue = [];
  let _genreActive = 0;
  const GENRE_CONCURRENCY = 3;
  function _pumpGenreQueue() {
    while (_genreActive < GENRE_CONCURRENCY && _genreQueue.length) {
      const task = _genreQueue.shift();
      _genreActive++;
      Promise.resolve(task()).finally(() => {
        _genreActive--;
        _pumpGenreQueue();
      });
    }
  }
  function _hydrateGenres(wrap, animeId) {
    const titleWrap = wrap.querySelector(".episode-title-wrap");
    if (!titleWrap || titleWrap.querySelector(".fl-genre-row")) return;
    const row = document.createElement("div");
    row.className = "fl-genre-row";
    titleWrap.appendChild(row);

    _genreQueue.push(() =>
      getAnimeDetails(animeId)
        .then(({ details }) => {
          // Relabel the episode-count kicker when the show is no longer
          // airing. AnimePahe's value for finished shows is "Finished Airing",
          // which contains BOTH "finish" and "airing" — so test the "finish"
          // marker first so we don't accidentally class it as ongoing.
          const statusRow = (details?.info || []).find((r) =>
            /status/i.test(r.label || "")
          );
          const statusVal = (statusRow?.value || "").toLowerCase().trim();
          const isFinished =
            !!statusVal && /finish|complete|ended|concluded/.test(statusVal);
          if (isFinished) {
            const kicker = wrap.querySelector(".fl-ep-kicker");
            if (kicker) {
              kicker.innerHTML = '<span class="fl-ep-kicker-line">Completed</span>';
              kicker.classList.add("fl-ep-kicker-completed");
            }
          }

          const genresAll = details?.genres || [];
          // Blur the thumbnail (and the blurred top-bar art) for NSFW tags —
          // users can hover to reveal.
          const isNsfw = genresAll.some((g) =>
            /\b(ecchi|erotica|hentai)\b/i.test(g.name || "")
          );
          if (isNsfw) wrap.classList.add("fl-nsfw");

          const genres = genresAll.slice(0, 3);
          if (!genres.length) { row.remove(); return; }
          row.innerHTML = genres
            .map((g) => {
              const href = g.url || "#";
              const name = (g.name || "").replace(/</g, "&lt;");
              return `<a class="fl-genre-chip" href="${href}" title="${name}">${name}</a>`;
            })
            .join("");
          row.classList.add("is-loaded");
        })
        .catch(() => row.remove())
    );
    _pumpGenreQueue();
  }

  function animePaheHomeInjector() {
    injectFLStyles();

    const injectFirstButtons = () => {
      document.querySelectorAll(".episode-wrap:not([data-fl-done])").forEach((wrap) => {
        wrap.dataset.flDone = "1";
        const snapshot = wrap.querySelector(".episode-snapshot");
        const titleLink = wrap.querySelector(".episode-title a");
        const href = titleLink?.getAttribute("href");
        if (!snapshot || !href) return;

        const firstBtn = document.createElement("a");
        firstBtn.className = "fl-first-btn";
        firstBtn.href = href;
        firstBtn.title = "Watch from Episode 1";
        firstBtn.setAttribute("aria-label", "Watch from Episode 1");
        firstBtn.innerHTML =
          '<svg class="fl-first-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<path d="M8 5v14l11-7z"/>' +
          '</svg>' +
          '<span class="fl-first-btn-top">Watch</span>' +
          '<span class="fl-first-btn-bot">EP 1</span>';
        firstBtn.addEventListener("click", (e) => e.stopPropagation());
        snapshot.appendChild(firstBtn);

        // Dress up the episode-number cell: add "LATEST EPISODE" kicker above
        // the big episode count so the two-line right column reads clearly.
        const epNumberCell = wrap.querySelector(".episode-number");
        if (epNumberCell && !epNumberCell.querySelector(".fl-ep-kicker")) {
          const kicker = document.createElement("div");
          kicker.className = "fl-ep-kicker";
          kicker.innerHTML =
            '<span class="fl-ep-kicker-line">Latest</span>' +
            '<span class="fl-ep-kicker-line">Episode</span>';
          epNumberCell.insertBefore(kicker, epNumberCell.firstChild);
        }

        // Async-fetch + render genres under the title (cache-backed).
        const animeId = (href.match(/\/anime\/([^/?#]+)/) || [])[1];
        if (animeId) _hydrateGenres(wrap, animeId);
      });
    };

    injectFirstButtons();
    const target =
      document.querySelector(".episode-list-wrapper") ||
      document.querySelector(".latest-release") ||
      document.body;
    if (target) {
      new MutationObserver(injectFirstButtons).observe(target, {
        childList: true,
        subtree: true,
      });
    }
  }

  function animePaheSearchPills() {
    injectFLStyles();

    const searchWrap = document.querySelector(".search-results-wrap");
    if (!searchWrap) return;

    const injectPills = () => {
      searchWrap.querySelectorAll("a:not([data-fl-done])").forEach((a) => {
        const href = a.getAttribute("href");
        if (!href || !/^\/anime\//.test(href)) return;
        a.dataset.flDone = "1";

        a.addEventListener("click", (e) => {
          if (e.target.closest(".fl-search-first")) return;
          e.preventDefault();
          const url = new URL(href, window.location.origin);
          url.searchParams.set("episodeLast", "true");
          window.location.href = url.pathname + url.search;
        });

        const firstBtn = document.createElement("span");
        firstBtn.className = "fl-search-first";
        firstBtn.textContent = "EP 1";
        firstBtn.title = "Watch from Episode 1";
        firstBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = href;
        });

        const li = a.closest("li") || a.parentElement;
        if (li) li.appendChild(firstBtn);
      });
    };

    injectPills();
    new MutationObserver(injectPills).observe(searchWrap, {
      childList: true,
      subtree: true,
    });
  }
})();
