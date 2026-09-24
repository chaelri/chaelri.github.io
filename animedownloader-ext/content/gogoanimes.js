// Runs on gogoanimes.dk (isolated world, document_end).
//
// Genre chips under every card, and NSFW cards (Ecchi / Erotica / Hentai)
// removed — the same treatment the animepahe home grid gets.
//
// gogoanimes cards don't carry genres. Every card's link does carry the
// SERIES post id in rel="…" (episode cards included), and both episode and
// anime pages list the series' genres in .genxed, so:
//   1. the sidebar Popular list prints genres inline — seed the cache free
//   2. anything else: fetch the card's own page once, parse .genxed
//   3. cache by series id in localStorage, so a series is fetched once
// gogoanimes.css keeps posters blurred until each card's verdict is in.
(function () {
  "use strict";
  if (window.__adxGogoGenres) return;
  window.__adxGogoGenres = true;

  const NSFW_RE = /\b(ecchi|erotica|hentai|nudity|explicit|sexual|sex)\b/i;
  const CACHE_KEY = "adx.gogo.genres";
  const TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const MAX_CHIPS = 4;
  // The host 503s under load — 4 parallel page fetches from one home page
  // was already enough. Two at a time, and back off on any 5xx.
  const CONCURRENCY = 2;
  const RETRY_DELAYS_MS = [3000, 8000];

  // ── cache: { [seriesId]: { g: [[name, href], ...], t: savedAt } } ──
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) {}
  let saveTimer = null;
  const saveCache = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const now = Date.now();
      for (const k of Object.keys(cache)) if (now - cache[k].t > TTL_MS) delete cache[k];
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }, 250);
  };
  const cached = (id) => {
    const hit = id && cache[id];
    return hit && Date.now() - hit.t < TTL_MS ? hit.g : null;
  };
  const remember = (id, genres) => {
    if (!id) return;
    cache[id] = { g: genres, t: Date.now() };
    saveCache();
  };

  const genresFrom = (root) =>
    Array.from(root.querySelectorAll('a[href*="/genres/"]')).map((a) => [
      a.textContent.trim(),
      a.getAttribute("href"),
    ]);
  const isNsfw = (genres) => genres.some(([name]) => NSFW_RE.test(name));

  // The host answers in ~1 s but then trickles the ~130 KB body out over
  // 7–9 s. .genxed sits ~16% of the way in, so read the stream only until
  // that block closes and cancel the rest.
  const readGenreBlock = async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const at = html.indexOf("genxed");
      if (at !== -1 && html.indexOf("</div>", at) !== -1) {
        reader.cancel().catch(() => {});
        break;
      }
    }
    return html;
  };

  // ── fetch queue: one request per series, CONCURRENCY at a time ──
  const inflight = new Map(); // seriesId -> Promise<genres|null>
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < CONCURRENCY && queue.length) {
      const job = queue.shift();
      active++;
      fetch(job.url, { credentials: "same-origin" })
        .then((r) => (r.ok ? readGenreBlock(r) : Promise.reject(r.status)))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const box = doc.querySelector(".genxed");
          return box ? genresFrom(box) : [];
        })
        .then(job.resolve, (status) => {
          const tries = job.tries || 0;
          if (status >= 500 && tries < RETRY_DELAYS_MS.length) {
            job.tries = tries + 1;
            setTimeout(() => { queue.push(job); pump(); }, RETRY_DELAYS_MS[tries]);
          } else {
            job.resolve(null); // unverifiable — reveal the card, don't cache
          }
        })
        .finally(() => { active--; pump(); });
    }
  };
  const lookup = (id, url) => {
    const hit = cached(id);
    if (hit) return Promise.resolve(hit);
    if (inflight.has(id)) return inflight.get(id);
    const p = new Promise((resolve) => { queue.push({ url, resolve }); pump(); })
      .then((g) => { if (g) remember(id, g); return g; });
    inflight.set(id, p);
    return p;
  };

  // ── card treatment ──
  const markSafe = (el) => el.setAttribute("data-adx-safe", "");
  const drop = (el) => el.classList.add("adx-nsfw");

  const renderChips = (bsx, genres) => {
    if (bsx.querySelector(".adx-genre-row")) return;
    const row = document.createElement("div");
    row.className = "adx-genre-row";
    genres.slice(0, MAX_CHIPS).forEach(([name, href]) => {
      const chip = document.createElement("a");
      chip.className = "adx-genre-chip";
      chip.textContent = name;
      chip.href = href;
      row.appendChild(chip);
    });
    bsx.appendChild(row); // after the card's <a>, never inside it
    requestAnimationFrame(() => row.classList.add("is-loaded"));
  };

  const handleCard = (bsx) => {
    if (bsx.dataset.adxSeen) return;
    bsx.dataset.adxSeen = "1";
    const link = bsx.querySelector("a[href]");
    const id = link && link.getAttribute("rel");
    const card = bsx.closest("article.bs") || bsx;
    if (!link || !id) return markSafe(bsx); // nothing to check against
    lookup(id, link.href).then((genres) => {
      if (genres && isNsfw(genres)) return drop(card);
      if (genres && genres.length) renderChips(bsx, genres);
      markSafe(bsx);
    });
  };

  // Sidebar Popular list: genres are already printed — check and seed only.
  const handleSidebarItem = (li) => {
    if (li.dataset.adxSeen) return;
    li.dataset.adxSeen = "1";
    const id = li.querySelector("a.series")?.getAttribute("rel");
    const genres = genresFrom(li);
    if (genres.length) remember(id, genres);
    if (isNsfw(genres)) return drop(li);
    markSafe(li);
  };

  const scan = () => {
    document.querySelectorAll(".serieslist li").forEach(handleSidebarItem);
    document.querySelectorAll(".bsx").forEach(handleCard);
  };

  scan();
  // Popular widget and paginated lists arrive after load; debounce the rescan.
  let scanTimer = null;
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 60);
  }).observe(document.body, { childList: true, subtree: true });
})();
