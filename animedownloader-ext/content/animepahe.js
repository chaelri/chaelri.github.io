(function () {
  "use strict";

  const HREF = window.location.href;

  // Detect when this content script is orphaned (extension was reloaded
  // while the page stayed open). Any chrome.* call after that throws
  // "Extension context invalidated." Short-circuit every call site instead
  // of crashing the MutationObserver / fetch finally chains.
  function _extAlive() {
    try { return !!chrome.runtime && !!chrome.runtime.id; }
    catch (_) { return false; }
  }

  // Home-feed hydration overlay state. Declared up-front so the router
  // dispatch below can call animePaheHomeInjector() → _showHomeLoading()
  // without tripping the temporal dead zone on this const.
  const _homeLoading = {
    overlayEl: null,
    pending: 0,
    firstRunDone: false,
    startedAt: 0,
    hideTimer: null,
    removeTimer: null,
    safetyTimer: null,
  };
  const HOME_MIN_OVERLAY_MS = 600;
  const HOME_OVERLAY_FADE_MS = 600;

  // Genre filter state. Declared up-front for the same reason as _homeLoading:
  // the router dispatch below calls animePaheHomeInjector() → _injectGenreFilterBar()
  // → _setGenreFilter() before the body of this IIFE reaches the helper
  // section, and a TDZ access on `const _genreFilter` would throw.
  const _genreFilter = { tokens: [], raw: "" };

  // Cached ref to the "Latest Releases" heading. Same TDZ-hoist reason —
  // _setGenreFilter → _applyGenreFilter → _updateFilterEmptyState → _findLatestHeading
  // touches this `let` during the synchronous router dispatch.
  let _flLatestHeading = null;

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

  // Anime details (synopsis + cover + info panel). Cache-first; opt-in fetch.
  // Background: an earlier audit (commit 69c8363) stripped fetches entirely
  // after `/play/` pages were 404'ing `/anime/{session}` on every next-ep
  // click and contributing to Cloudflare Error 1015 bans. The home grid
  // genre row legitimately needs fresh fetches for never-visited anime, so
  // callers explicitly opt in via `{ fetchIfMissing: true }`. The `/play/`
  // page call site stays cache-only (the session-vs-anime-id bug there is
  // unfixed; opting in would re-introduce the 404 spam).
  let _animepaheRateLimited = false;
  function getAnimeDetails(animeId, opts = {}) {
    return new Promise((resolve) => {
      if (!animeId) return resolve({});
      if (!_extAlive()) return resolve({});
      chrome.storage.local.get(["animeHistory"], (result) => {
        if (chrome.runtime?.lastError) return resolve({});
        const cached = result.animeHistory?.[animeId];
        if (cached?.details) {
          return resolve({
            synopsis: cached.synopsis,
            cover: cached.cover,
            details: cached.details,
          });
        }
        if (!opts.fetchIfMissing || _animepaheRateLimited) return resolve({});

        fetch(`/anime/${animeId}`, { credentials: "same-origin" })
          .then((r) => {
            if (r.status === 429 || r.status === 403) {
              _animepaheRateLimited = true;
              return Promise.reject();
            }
            return r.ok ? r.text() : Promise.reject();
          })
          .then((html) => {
            if (/Error\s*1015|You are being rate limited|Just a moment\.\.\./i.test(html)) {
              _animepaheRateLimited = true;
              return resolve({});
            }
            const doc = new DOMParser().parseFromString(html, "text/html");

            let synopsis = null;
            for (const sel of [".anime-synopsis", ".anime-summary", ".anime-description"]) {
              const el = doc.querySelector(sel);
              const text = (el?.textContent || "").trim();
              if (text && text.length > 20) { synopsis = text; break; }
            }

            let cover = null;
            const coverSrc = doc.querySelector(".anime-cover[data-src]")?.getAttribute("data-src");
            if (coverSrc) cover = coverSrc.startsWith("//") ? "https:" + coverSrc : coverSrc;

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

            const genres = Array.from(doc.querySelectorAll(".anime-genre li a"))
              .map((a) => ({ name: a.textContent.trim(), url: a.getAttribute("href") }))
              .filter((g) => g.name);

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

            if (_extAlive()) {
              chrome.storage.local.get(["animeHistory"], (r2) => {
                if (chrome.runtime?.lastError || !_extAlive()) return;
                const h = r2.animeHistory || {};
                const a = h[animeId] || { downloaded: [] };
                a.synopsis = synopsis || null;
                a.cover = cover || null;
                a.details = details;
                h[animeId] = a;
                chrome.storage.local.set({ animeHistory: h });
              });
            }
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
    setPanelStatus(panel, `Queueing ${todo.length} episodes…`);

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

    // No pre-fetch. Each /play/ page already exposes its own #pickDownload
    // link — the child tab will extract it itself (see isBulkChild fast-path
    // in animePaheClicker). The current episode's downloadUrl (pahe.win) is
    // already in hand, so it skips even the /play/ load.
    //
    // This avoids the burst of 11 same-origin /play/ fetches that tripped
    // Cloudflare's Error 1015 rate-limiter. Each child tab is a normal
    // browser navigation (full cookies, full CF clearance) and they open
    // 3 at a time via background's worker pool — gentle on animepahe.
    const items = todo.map((ep) => {
      if (ep.num === data.epNum && data.downloadUrl) {
        return { downloadUrl: data.downloadUrl, ep: ep.num };
      }
      const childUrl =
        ep.url + (ep.url.includes("?") ? "&" : "?") + "bulk_child=1";
      return { downloadUrl: childUrl, ep: ep.num };
    });

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
    const params = new URLSearchParams(window.location.search);
    const isAuto = params.get("auto") === "true";
    // bulk_child=1 means this tab was opened by a parent bulk auto-pilot.
    // We don't render the nuke UI or fetch anything — we just extract the
    // best download link straight from this page's #pickDownload and navigate
    // to pahe.win. The download flow takes over from there and the tab gets
    // auto-closed by background.js when chrome.downloads.onCreated fires.
    const isBulkChild = params.get("bulk_child") === "1";

    // Early tab-title update so the browser tab shows "EP N · Title"
    // even before the nuke UI renders (or if it never does). Stops itself
    // once set; nuke UI also sets <title> below so this is just for the
    // pre-nuke window and for the native-player fallback.
    const titleUpdater = setInterval(() => {
      const titleEl = document.querySelector(".theatre-info h1 a[title]");
      const epBtn = document.getElementById("episodeMenu");
      const animeTitle = titleEl?.getAttribute("title");
      const ep = epBtn?.innerText.match(/\d+/)?.[0];
      if (animeTitle && ep) {
        document.title = `EP ${ep} · ${animeTitle}`;
        clearInterval(titleUpdater);
      }
    }, 200);

    const findData = setInterval(() => {
      const dlMenu = document.getElementById("pickDownload");
      const scrollArea = document.querySelector("#scrollArea");
      const infoArea = document.querySelector(".theatre-info");
      const episodeBtn = document.getElementById("episodeMenu");

      // Bulk-child fast path: only #pickDownload needs to be ready. Don't wait
      // for scrollArea / infoArea / episodeBtn — this tab is throwaway.
      if (isBulkChild && dlMenu) {
        clearInterval(findData);
        const best = Array.from(dlMenu.querySelectorAll("a.dropdown-item"))
          .filter(
            (a) =>
              !a.querySelector(".badge-warning")?.innerText.toLowerCase().includes("eng")
          )
          .sort(
            (a, b) =>
              parseInt(b.innerText.match(/(\d+)p/)?.[1] || 0) -
              parseInt(a.innerText.match(/(\d+)p/)?.[1] || 0)
          )[0];
        if (best?.href) {
          window.location.href = best.href;
        }
        return;
      }

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
        const currentEp = episodeBtn.innerText.match(/\d+/)?.[0] || "1";
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
  <title>EP ${data.epNum} · ${data.title}</title>
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
      .fl-ep-total {
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.6px;
        opacity: 0.55;
        margin-top: 4px;
        line-height: 1;
        text-transform: none;
        text-shadow: none;
      }
      .fl-ep-kicker-completed ~ .fl-ep-total {
        color: #00e676;
        opacity: 0.85;
      }
      /* Genre chips under the title */
      .fl-genre-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
        min-height: 16px;
        opacity: 0;
        transition: opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .fl-genre-row.is-loaded {
        opacity: 1;
      }
      /* Per-card reveal gate — hide each .episode-wrap until its genre
         verdict is in (cached, fetched, or unverifiable), so NSFW cards
         get yanked before they ever flash on screen. Matches the vm-
         management "Select Segment" pill fade pattern: opacity 0→1 +
         translateY(8px)→0, 0.35s ease. The data-fl-prepped attribute is
         set by injectFirstButtons so cards animepahe paints before our
         script runs aren't blanked retroactively. */
      .episode-wrap[data-fl-prepped] {
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.35s ease, transform 0.35s ease;
      }
      .episode-wrap[data-fl-prepped].fl-revealed {
        opacity: 1;
        transform: translateY(0);
      }
      /* Poof — used for BOTH the NSFW yank and genre-filter hide. Switched
         from @keyframes to !important + transition because the keyframe
         path was losing the cascade fight with [data-fl-prepped].fl-revealed
         (specificity 0,3,1 beats 0,2,1) so opacity/transform stayed pinned
         to the revealed state and the animation never visibly played.
         Forced overrides + an explicit transition declaration sidestep the
         specificity battle entirely. */
      .episode-wrap.fl-poofing {
        pointer-events: none;
        opacity: 0 !important;
        transform: scale(0.78) !important;
        filter: blur(6px);
        transition: opacity 0.28s ease, transform 0.28s ease, filter 0.28s ease !important;
      }
      /* Heading row — pulls the "Latest Releases" h-tag and a clone of
         the bottom pagination into a single flex row so the page chevrons
         live next to the title instead of only at the bottom. */
      .fl-heading-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }
      .fl-pagination-top {
        margin: 0 !important;
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
      /* Genre filter bar — sticky above the home grid */
      .fl-filter-bar {
        position: sticky;
        top: 0;
        z-index: 30;
        margin: 0 0 16px 0;
        padding: 10px 0;
        background: linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 100%);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }
      .fl-filter-inner {
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 540px !important;
        width: auto !important;
        margin: 0 auto !important;
        padding: 6px 12px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        transition: border-color 0.18s ease, background 0.18s ease;
      }
      .fl-filter-inner:focus-within {
        border-color: #d5015b;
        background: rgba(213,1,91,0.10);
      }
      .fl-filter-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: rgba(255,255,255,0.55);
        transition: color 0.18s ease;
      }
      .fl-filter-inner:focus-within .fl-filter-icon {
        color: #d5015b;
      }
      .fl-filter-input {
        flex: 1 !important;
        min-width: 0;
        background: transparent !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        color: #fff !important;
        font-size: 0.95rem !important;
        font-family: inherit !important;
        padding: 6px 0 !important;
        letter-spacing: 0.3px;
      }
      .fl-filter-input::placeholder {
        color: rgba(255,255,255,0.4);
      }
      .fl-filter-clear {
        background: transparent !important;
        border: 0 !important;
        color: rgba(255,255,255,0.55) !important;
        font-size: 1.3rem !important;
        line-height: 1 !important;
        padding: 2px 8px !important;
        cursor: pointer !important;
        border-radius: 4px !important;
        flex: 0 !important;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .fl-filter-clear:hover {
        color: #fff !important;
        background: rgba(255,255,255,0.08) !important;
      }
      .fl-filter-count {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.6px;
        color: rgba(255,255,255,0.55);
        text-transform: uppercase;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        padding: 0 2px;
      }
      .fl-filter-count:empty {
        display: none;
      }
      .fl-hidden-by-filter { display: none !important; }
      .fl-filter-empty {
        max-width: 720px;
        margin: 24px auto;
        padding: 18px 16px;
        text-align: center;
        font-size: 0.85rem;
        color: rgba(255,255,255,0.55);
        background: rgba(255,255,255,0.04);
        border: 1px dashed rgba(255,255,255,0.12);
        border-radius: 8px;
      }
      /* Filtered cards collapse out of the flex/grid layout AFTER the poof
         transition completes — that's why the JS waits ~280ms before
         flipping this class. */
      .episode-wrap.fl-filtered-out {
        display: none !important;
      }
      /* No global gate — cards render immediately, genre row pops in
         per-card as each fetch lands (see .fl-genre-row opacity transition). */
      /* Small loader pill — centered over the (invisible) grid. Sparkle
         stars pop in sequence, Inter label underneath. Styled after the
         devo "Digging deeper…" indicator. */
      .fl-home-loader {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        z-index: 20;
        pointer-events: none;
        opacity: 0;
        animation: fl-loader-in 0.4s 0.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .fl-home-loader.is-hidden {
        opacity: 0 !important;
        animation: none;
        transform: translate(-50%, calc(-50% - 4px));
        transition: opacity 0.35s ease, transform 0.35s ease;
      }
      .fl-home-loader-sparks {
        position: relative;
        width: 64px;
        height: 22px;
      }
      .fl-home-loader-sparks span {
        position: absolute;
        top: 0;
        color: #ffcd3c;
        opacity: 0;
        text-shadow: 0 0 8px rgba(255, 205, 60, 0.7);
        animation: fl-loader-spark 2.1s ease-in-out infinite;
        font-family: 'Arial', sans-serif;
        line-height: 1;
      }
      .fl-home-loader-sparks span:nth-child(1) {
        left: 4px;  top: 6px;  font-size: 12px;
        animation-delay: 0s;    color: #c89a5a;
      }
      .fl-home-loader-sparks span:nth-child(2) {
        left: 24px; top: 0;    font-size: 20px;
        animation-delay: 0.25s;
      }
      .fl-home-loader-sparks span:nth-child(3) {
        left: 46px; top: 4px;  font-size: 16px;
        animation-delay: 0.5s;
      }
      .fl-home-loader-text {
        font-family: 'Inter', sans-serif;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.82);
      }
      @keyframes fl-loader-in {
        to { opacity: 1; }
      }
      @keyframes fl-loader-spark {
        0%, 75%, 100% { opacity: 0; transform: translateY(6px) scale(0.4); }
        15%           { opacity: 1; transform: translateY(0)   scale(1); }
        35%           { opacity: 0.5; transform: translateY(-4px) scale(0.8); }
        55%           { opacity: 0;   transform: translateY(-12px) scale(0.3); }
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
      .fl-search-first-icon {
        width: 11px;
        height: 11px;
        flex-shrink: 0;
      }
      .fl-search-first-label {
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

  // Home-feed hydration overlay: covers the grid until every card has its
  // genre chips applied (and NSFW cards yanked), so the user sees one
  // finished state instead of watching each card get stamped top-to-bottom.
  // State object
  // is declared at the top of the IIFE to avoid TDZ when the router
  // dispatches straight into animePaheHomeInjector().
  function _showHomeLoading() {
    // Cancel any pending fade-out from a previous batch so pagination
    // re-triggers the loader cleanly.
    clearTimeout(_homeLoading.hideTimer);
    clearTimeout(_homeLoading.removeTimer);
    document.body.classList.add("fl-home-loading");
    _homeLoading.startedAt = performance.now();

    // If a loader is still around (possibly mid-fade), restore it
    // instead of creating a duplicate.
    if (_homeLoading.overlayEl) {
      _homeLoading.overlayEl.classList.remove("is-hidden");
      return;
    }
    const host = document.querySelector(".latest-release") || document.body;
    const loader = document.createElement("div");
    loader.className = "fl-home-loader";
    loader.innerHTML =
      '<div class="fl-home-loader-sparks">' +
        '<span>\u2726</span><span>\u2728</span><span>\u2726</span>' +
      '</div>' +
      '<div class="fl-home-loader-text">Loading latest releases</div>';
    host.appendChild(loader);
    _homeLoading.overlayEl = loader;
  }

  function _hideHomeLoading() {
    const s = _homeLoading;
    if (!s.overlayEl) return;
    const elapsed = performance.now() - s.startedAt;
    const wait = Math.max(0, HOME_MIN_OVERLAY_MS - elapsed);
    clearTimeout(s.hideTimer);
    s.hideTimer = setTimeout(() => {
      document.body.classList.remove("fl-home-loading");
      s.overlayEl?.classList.add("is-hidden");
      clearTimeout(s.removeTimer);
      s.removeTimer = setTimeout(() => {
        s.overlayEl?.remove();
        s.overlayEl = null;
      }, HOME_OVERLAY_FADE_MS);
    }, wait);
  }

  function _checkHomeLoadingDrain() {
    if (!_homeLoading.firstRunDone) return;
    if (_homeLoading.pending > 0) return;
    _hideHomeLoading();
  }

  // Throttle genre hydration: /anime/{id} fetches are heavy AND Cloudflare
  // tightens fast on animepahe (Error 1015). Strict serial — one at a time,
  // with a small gap between requests — to keep the IP out of the penalty box.
  const _genreQueue = [];
  let _genreActive = 0;
  const GENRE_CONCURRENCY = 9;
  const GENRE_INTER_REQ_MS = 40;
  function _pumpGenreQueue() {
    while (_genreActive < GENRE_CONCURRENCY && _genreQueue.length) {
      const task = _genreQueue.shift();
      _genreActive++;
      Promise.resolve(task()).finally(() => {
        setTimeout(() => {
          _genreActive--;
          _pumpGenreQueue();
        }, GENRE_INTER_REQ_MS);
      });
    }
  }
  // ── Genre filter helpers ─────────────────────────────────────────
  // User types one or more words (whitespace/comma separated). All tokens
  // must match at least one chip on a card for it to stay visible. Empty
  // input → show everything. Cards still hydrating stay visible until
  // their genres land, then get re-evaluated. State object `_genreFilter`
  // is hoisted to the top of the IIFE to dodge a TDZ on early dispatch.

  function _readStoredFilter() {
    try { return sessionStorage.getItem("fl_genre_filter") || ""; }
    catch { return ""; }
  }
  function _writeStoredFilter(v) {
    try { sessionStorage.setItem("fl_genre_filter", v || ""); } catch {}
  }
  function _setGenreFilter(raw) {
    const str = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
    _genreFilter.raw = str.trim();
    _genreFilter.tokens = _genreFilter.raw
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    _writeStoredFilter(_genreFilter.raw);
    _applyGenreFilter();
  }
  function _applyGenreFilter() {
    const tokens = _genreFilter.tokens;
    const wraps = document.querySelectorAll(
      ".latest-release .episode-wrap, .episode-list-wrapper .episode-wrap"
    );
    let visible = 0;
    let hydrated = 0;
    wraps.forEach((wrap) => {
      if (!tokens.length) {
        _poofFilterShow(wrap);
        visible++;
        return;
      }
      if (!wrap.dataset.flHydrated) {
        // Genres not loaded yet — keep visible to avoid flicker, will
        // re-evaluate once _hydrateGenres finishes for this wrap.
        _poofFilterShow(wrap);
        visible++;
        return;
      }
      hydrated++;
      const chips = wrap.querySelectorAll(".fl-genre-chip");
      const haystack = Array.from(chips)
        .map((c) => (c.textContent || "").toLowerCase())
        .join(" | ");
      const match = tokens.every((tok) => haystack.includes(tok));
      if (match) {
        _poofFilterShow(wrap);
        visible++;
      } else {
        _poofFilterHide(wrap);
      }
    });
    const countEl = document.getElementById("fl-filter-count");
    if (countEl) {
      countEl.textContent = tokens.length
        ? `${visible}/${wraps.length}`
        : "";
    }
    _updateFilterEmptyState(visible, hydrated, tokens.length > 0);
  }
  function _findLatestHeading() {
    if (_flLatestHeading && document.contains(_flLatestHeading)) return _flLatestHeading;
    const candidates = document.querySelectorAll("h1, h2, h3");
    for (const el of candidates) {
      if (/latest\s*release/i.test(el.textContent || "")) {
        _flLatestHeading = el;
        return el;
      }
    }
    return null;
  }

  function _updateFilterEmptyState(visible, hydrated, hasFilter) {
    const host =
      document.querySelector(".latest-release") ||
      document.querySelector(".episode-list-wrapper");
    if (!host) return;
    let empty = document.getElementById("fl-filter-empty");
    const shouldShow = hasFilter && hydrated > 0 && visible === 0;
    if (shouldShow) {
      if (!empty) {
        empty = document.createElement("div");
        empty.id = "fl-filter-empty";
        empty.className = "fl-filter-empty";
        empty.textContent = "No anime match this genre filter on this page.";
        const bar = document.getElementById("fl-filter-bar");
        if (bar && bar.parentElement === host) {
          host.insertBefore(empty, bar.nextSibling);
        } else {
          host.insertBefore(empty, host.firstChild);
        }
      }
    } else if (empty) {
      empty.remove();
    }
    // Hide the "Latest Releases" heading too when zero matches — it's
    // pure noise next to an empty-state card.
    const heading = _findLatestHeading();
    if (heading) heading.classList.toggle("fl-hidden-by-filter", shouldShow);
  }

  function _injectGenreFilterBar() {
    if (document.getElementById("fl-filter-bar")) return;
    const host =
      document.querySelector(".latest-release") ||
      document.querySelector(".episode-list-wrapper");
    if (!host) return;
    const bar = document.createElement("div");
    bar.id = "fl-filter-bar";
    bar.className = "fl-filter-bar";
    bar.innerHTML =
      '<div class="fl-filter-inner">' +
        '<svg class="fl-filter-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>' +
        '</svg>' +
        '<input type="text" id="fl-filter-input" class="fl-filter-input"' +
        ' placeholder="Filter by genre — e.g. romance, comedy" autocomplete="off" spellcheck="false" />' +
        '<span id="fl-filter-count" class="fl-filter-count"></span>' +
        '<button type="button" id="fl-filter-clear" class="fl-filter-clear" aria-label="Clear filter">\u00D7</button>' +
      '</div>';
    host.insertBefore(bar, host.firstChild);

    const input = bar.querySelector("#fl-filter-input");
    const clearBtn = bar.querySelector("#fl-filter-clear");
    const initial = _readStoredFilter();
    if (initial) input.value = initial;
    _setGenreFilter(initial);

    let deb;
    input.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(() => _setGenreFilter(input.value), 100);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        input.value = "";
        _setGenreFilter("");
      }
    });
    clearBtn.addEventListener("click", () => {
      input.value = "";
      _setGenreFilter("");
      input.focus();
    });
  }

  // Apply details (genres + status + episode count) to a card. Returns true
  // if the card was kept (visible), false if it was yanked (NSFW). Empty/
  // missing genres just leave the row collapsed.
  function _applyCardDetails(wrap, row, details) {
    const statusRow = (details?.info || []).find((r) =>
      /status/i.test(r.label || "")
    );
    const statusVal = (statusRow?.value || "").toLowerCase().trim();
    const isFinished =
      !!statusVal && /finish|complete|ended|concluded/.test(statusVal);
    if (isFinished) {
      const kicker = wrap.querySelector(".fl-ep-kicker");
      if (kicker && !kicker.classList.contains("fl-ep-kicker-completed")) {
        kicker.innerHTML = '<span class="fl-ep-kicker-line">Completed</span>';
        kicker.classList.add("fl-ep-kicker-completed");
      }
    }

    const epRow = (details?.info || []).find((r) =>
      /^episodes?$/i.test((r.label || "").trim())
    );
    const epTotal = parseInt((epRow?.value || "").trim(), 10);
    if (Number.isFinite(epTotal) && epTotal > 0) {
      const epNumberCell = wrap.querySelector(".episode-number");
      if (epNumberCell && !epNumberCell.querySelector(".fl-ep-total")) {
        const totalEl = document.createElement("span");
        totalEl.className = "fl-ep-total";
        totalEl.textContent = `/ ${epTotal}`;
        epNumberCell.appendChild(totalEl);
      }
    }

    const genresAll = details?.genres || [];
    const isNsfw = genresAll.some((g) =>
      /\b(ecchi|erotica|hentai)\b/i.test(g.name || "")
    );
    if (isNsfw) {
      _poofRemoveCard(wrap);
      return false;
    }

    const genres = genresAll.slice(0, 3);
    if (!genres.length) { row.remove(); return true; }
    row.innerHTML = genres
      .map((g) => {
        const href = g.url || "#";
        const name = (g.name || "").replace(/</g, "&lt;");
        return `<a class="fl-genre-chip" href="${href}" title="${name}">${name}</a>`;
      })
      .join("");
    // Defer the class flip a tick so the browser registers the opacity
    // transition from 0 → 1 (set the start state, then the end state).
    requestAnimationFrame(() => row.classList.add("is-loaded"));
    return true;
  }

  const POOF_DURATION_MS = 280;

  // Poof out a card (animate then drop from DOM). Fired on NSFW yank from
  // _applyCardDetails. transitionend is unreliable here (multiple props
  // animate at once, dropped events on display toggles), so a single
  // setTimeout drives the DOM removal.
  function _poofRemoveCard(wrap) {
    if (!wrap || !wrap.isConnected) return;
    if (wrap.dataset.flPoofing === "remove") return;
    wrap.dataset.flPoofing = "remove";
    wrap.classList.add("fl-poofing");
    setTimeout(() => {
      if (wrap.isConnected) wrap.remove();
    }, POOF_DURATION_MS + 20);
  }

  // Animate-out a card for the genre filter, then collapse it out of layout.
  // Idempotent: rapid filter typing doesn't restart the animation.
  function _poofFilterHide(wrap) {
    if (!wrap || !wrap.isConnected) return;
    if (wrap.dataset.flPoofing === "filter") return;
    wrap.dataset.flPoofing = "filter";
    wrap.classList.add("fl-poofing");
    setTimeout(() => {
      if (wrap.dataset.flPoofing === "filter") {
        wrap.classList.add("fl-filtered-out");
      }
    }, POOF_DURATION_MS + 20);
  }

  // Reverse poof — reveal a previously filter-hidden card. Drops the
  // display:none gate first so the transition has something to animate
  // back from, then on next frame removes .fl-poofing so opacity/scale
  // un-wind to the visible state.
  function _poofFilterShow(wrap) {
    if (!wrap) return;
    delete wrap.dataset.flPoofing;
    wrap.classList.remove("fl-filtered-out");
    requestAnimationFrame(() => wrap.classList.remove("fl-poofing"));
  }

  // Subtle reveal — opacity 0→1 + translateY(8px)→0 over 0.35s. Deferred
  // by one frame so the browser commits the data-fl-prepped initial state
  // BEFORE we flip .fl-revealed; otherwise sync cache hits snap-paint
  // without animating. Style matches vm-management's "Select Segment"
  // pill fade so the whole repo feels consistent.
  function _revealCard(wrap) {
    if (!wrap || !wrap.isConnected) return;
    if (wrap.classList.contains("fl-revealed")) return;
    requestAnimationFrame(() => {
      if (wrap.isConnected) wrap.classList.add("fl-revealed");
    });
  }

  function _hydrateGenres(wrap, animeId) {
    const titleWrap = wrap.querySelector(".episode-title-wrap");
    if (!titleWrap || titleWrap.querySelector(".fl-genre-row")) return;
    const row = document.createElement("div");
    row.className = "fl-genre-row";
    titleWrap.appendChild(row);

    // Fast path: if this anime is already cached, render synchronously
    // without queueing — skips the serial throttle entirely. Only cache
    // misses pay the rate-limit-safe queue cost.
    if (!_extAlive()) return;
    chrome.storage.local.get(["animeHistory"], (result) => {
      if (chrome.runtime?.lastError) return; // context died mid-flight
      const cached = result.animeHistory?.[animeId];
      if (cached?.details) {
        _applyCardDetails(wrap, row, cached.details);
        if (wrap.isConnected) wrap.dataset.flHydrated = "1";
        _applyGenreFilter();
        return;
      }

      // Cache miss: queue the fetch but DON'T block the reveal on it. The
      // staggered reveal in injectFirstButtons already handed the user a
      // visible card; the genre row will fade in here when the fetch lands,
      // and NSFW cards will yank themselves (brief flash trade-off).
      _homeLoading.pending++;
      _genreQueue.push(() =>
        getAnimeDetails(animeId, { fetchIfMissing: true })
          .then(({ details }) => { _applyCardDetails(wrap, row, details); })
          .catch(() => row.remove())
          .finally(() => {
            if (wrap.isConnected) wrap.dataset.flHydrated = "1";
            _homeLoading.pending--;
            _checkHomeLoadingDrain();
            _applyGenreFilter();
          })
      );
      _pumpGenreQueue();
    });
  }

  function animePaheHomeInjector() {
    injectFLStyles();
    _injectGenreFilterBar();

    const injectFirstButtons = () => {
      // Re-attempt filter-bar injection in case the home host wasn't in the
      // DOM during the first call (or AJAX pagination swapped it out).
      _injectGenreFilterBar();
      const fresh = document.querySelectorAll(".episode-wrap:not([data-fl-done])");
      if (!fresh.length) return;
      // New wave of cards — either initial load or pagination/AJAX.
      // No global gate: each card pops in card-by-card via per-row fades.
      _homeLoading.firstRunDone = false;

      fresh.forEach((wrap, idx) => {
        wrap.dataset.flDone = "1";
        // Visibility gate (opacity 0 + translateY) is applied immediately so
        // animepahe's freshly-painted cards don't flash in raw. The reveal
        // is then staggered ~40ms per card so they cascade in instead of
        // popping all at once on AJAX page change. We no longer wait for
        // genre verification — the throttled fetch queue (300ms gap × 12
        // cards = ~4s) was the stutter on next/prev. NSFW removal still
        // happens when the fetch lands, but the card may briefly flash.
        wrap.dataset.flPrepped = "1";
        setTimeout(() => _revealCard(wrap), idx * 40);
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

      _homeLoading.firstRunDone = true;
    };

    injectFirstButtons();
    _syncTopPagination();

    // Observe the whole home container so pagination that swaps out
    // .episode-list-wrapper still triggers our hook.
    const target =
      document.querySelector(".latest-release") ||
      document.querySelector(".episode-list-wrapper") ||
      document.body;
    if (target) {
      const onMutation = () => {
        if (!_extAlive()) return; // extension reloaded — stop touching chrome.*
        injectFirstButtons();
        _syncTopPagination();
      };
      new MutationObserver(onMutation).observe(target, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Mirror the bottom pagination strip next to the "Latest Releases" heading.
  // Deep-clones the <ul.pagination> and wraps both into a flex row so the
  // chevrons sit on the right of the title. Click forwarding maps each cloned
  // .page-link to its original counterpart by index, so animepahe's own
  // click handlers (which may be JS-bound, not href-based) still drive the
  // navigation. Re-runs whenever the MutationObserver fires so the clone
  // stays in sync after AJAX page changes.
  function _syncTopPagination() {
    const heading = _findLatestHeading();
    // CRITICAL: exclude our own clone — it carries the .pagination class
    // from deep-cloning, and since it sits higher in the DOM, the plain
    // ".pagination" selector would return the clone itself. The diff
    // check `clone.innerHTML !== pagination.innerHTML` would then compare
    // the clone to itself and never rebuild, stranding the top strip on
    // the prior page number after AJAX swaps.
    const pagination = document.querySelector(".pagination:not(.fl-pagination-top)");
    if (!heading || !pagination) return;

    let row = document.getElementById("fl-heading-row");
    if (!row) {
      row = document.createElement("div");
      row.id = "fl-heading-row";
      row.className = "fl-heading-row";
      heading.parentNode.insertBefore(row, heading);
      row.appendChild(heading);
    }

    let clone = row.querySelector(".fl-pagination-top");
    const needsRebuild = !clone || clone.innerHTML !== pagination.innerHTML;
    if (!clone) {
      clone = pagination.cloneNode(true);
      clone.classList.add("fl-pagination-top");
      row.appendChild(clone);
    } else if (needsRebuild) {
      clone.innerHTML = pagination.innerHTML;
    }

    if (needsRebuild) {
      const origLinks = pagination.querySelectorAll(".page-link");
      clone.querySelectorAll(".page-link").forEach((cBtn, i) => {
        cBtn.addEventListener("click", (e) => {
          e.preventDefault();
          origLinks[i]?.click();
          // animepahe's AJAX page swap may land outside the observed
          // .latest-release subtree, so the MutationObserver isn't a
          // reliable trigger for resyncing the top clone. Poll for a
          // couple of seconds after every forwarded click to catch the
          // new pagination state regardless.
          [80, 200, 400, 800, 1500].forEach((t) =>
            setTimeout(_syncTopPagination, t)
          );
        });
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
        firstBtn.title = "Watch from Episode 1";
        firstBtn.innerHTML =
          '<svg class="fl-search-first-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<path d="M8 5v14l11-7z"/>' +
          '</svg>' +
          '<span class="fl-search-first-label">EP 1</span>';
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
