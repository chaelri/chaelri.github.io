// Runs on animeheaven.me (isolated world, document_end).
//
// Genre chips on every show card, and NSFW shows (Ecchi / Erotica / Hentai)
// removed — same treatment as the animepahe and gogoanimes grids. The same
// page also gives airing status and the latest episode, so each card gets an
// Airing / Finished pill and, where the site shows none, an EP badge.
//
// Cards carry no genres, but every one links to anime.php?<id>, whose
// .infotags lists them (~25 KB, <1 s). The home schedule alone has ~380
// cards, so lookups are lazy: a card is only fetched once it comes within
// ~800 px of the viewport, and results are cached per show id.
// animeheaven.css keeps each poster blurred until its verdict is in.
(function () {
  "use strict";
  if (window.__adxHeavenGenres) return;
  window.__adxHeavenGenres = true;

  // animeheaven tags explicitly ("Explicit Sex", "Nudity", …), not just by genre.
  const NSFW_RE = /\b(ecchi|erotica|hentai|nudity|explicit|sexual|sex)\b/i;
  const CACHE_KEY = "adx.heaven.shows.v3";
  const TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const MAX_CHIPS = 3;
  const CONCURRENCY = 3;
  const RETRY_DELAYS_MS = [3000, 8000];
  const CARD_SEL = ".chart, .similarimg, .popularbox2";

  // ── cache: { [showId]: { g: { genres: [[name, href]], status, latest }, t } } ──
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
    const hit = cache[id];
    return hit && Date.now() - hit.t < TTL_MS ? hit.g : null;
  };

  const isNsfw = (genres) => genres.some(([name]) => NSFW_RE.test(name));

  // Tags come alphabetically and mix genres with themes ("Child
  // Protagonists", "Based On A Webtoon"). Chips show real genres first.
  const CORE = [
    "action", "adventure", "comedy", "drama", "fantasy", "horror", "mystery",
    "romance", "sci-fi", "science fiction", "slice of life", "sports",
    "supernatural", "thriller", "psychological", "mecha", "music", "isekai",
    "school life", "shounen", "shoujo", "seinen", "josei", "historical",
    "military", "martial arts", "dark fantasy",
  ];
  const rank = ([name]) => {
    const i = CORE.indexOf(name.toLowerCase());
    return i === -1 ? CORE.length : i;
  };
  const byRelevance = (genres) => genres.slice().sort((a, b) => rank(a) - rank(b));

  // popular.php reuses the episode badge for the popularity rank.
  const RANK_PAGE = /popular/i.test(location.pathname);
  if (RANK_PAGE) document.documentElement.classList.add("adx-rank-page");
  const statusPill = (status) =>
    /finished/i.test(status) ? ["Finished", "is-done"]
    : /airing|ongoing/i.test(status) ? ["Airing", "is-airing"]
    : /not yet|upcoming/i.test(status) ? ["Upcoming", "is-soon"]
    : null;
  const showIdOf = (href) => {
    try {
      const u = new URL(href, location.href);
      return u.pathname.endsWith("/anime.php") ? u.search.slice(1) : null;
    } catch (e) {
      return null;
    }
  };

  // ── fetch queue ──
  const inflight = new Map();
  const queue = [];
  let active = 0;
  const pump = () => {
    while (active < CONCURRENCY && queue.length) {
      const job = queue.shift();
      active++;
      fetch("/anime.php?" + job.id, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          return {
            genres: Array.from(doc.querySelectorAll(".infotags a")).map((a) => [
              a.textContent.trim(),
              a.getAttribute("href"),
            ]),
            // "Finished airing" / "Currently airing" / "Not yet aired"
            status: doc.querySelector(".info2 .inline")?.textContent.trim() || "",
            // episode tiles are newest first
            latest: doc.querySelector(".linetitle2 .watch2")?.textContent.trim() || "",
            // "Episodes: 12 Year: 2026 …" — the first .inline is the planned total
            total: doc.querySelector(".infoyear .inline")?.textContent.trim() || "",
          };
        })
        .then(job.resolve, (status) => {
          const tries = job.tries || 0;
          if (status >= 500 && tries < RETRY_DELAYS_MS.length) {
            job.tries = tries + 1;
            setTimeout(() => { queue.push(job); pump(); }, RETRY_DELAYS_MS[tries]);
          } else {
            job.resolve(null); // unverifiable — reveal, don't cache
          }
        })
        .finally(() => { active--; pump(); });
    }
  };
  const lookup = (id) => {
    const hit = cached(id);
    if (hit) return Promise.resolve(hit);
    if (inflight.has(id)) return inflight.get(id);
    const p = new Promise((resolve) => { queue.push({ id, resolve }); pump(); })
      .then((g) => {
        if (g) { cache[id] = { g, t: Date.now() }; saveCache(); }
        return g;
      });
    inflight.set(id, p);
    return p;
  };

  // ── card treatment ──
  const markSafe = (el) => el.setAttribute("data-adx-safe", "");

  const renderChips = (card, info) => {
    if (card.matches(".popularbox2") || card.querySelector(".adx-genre-row")) return;
    const row = document.createElement("div");
    row.className = "adx-genre-row";
    // Older shows' pages have no status strip; all episodes out = finished.
    const done = +info.latest > 0 && +info.latest >= +info.total;
    const pill = statusPill(info.status || (done ? "Finished airing" : ""));
    // Schedule cards already print the status on their timer line.
    const timerSaysIt = /finished airing/i.test(card.querySelector(".charttimer")?.textContent || "");
    if (pill && !timerSaysIt) {
      const el = document.createElement("span");
      el.className = "adx-status " + pill[1];
      el.textContent = pill[0];
      row.appendChild(el);
    }
    byRelevance(info.genres).slice(0, MAX_CHIPS).forEach(([name, href]) => {
      const chip = document.createElement("a");
      chip.className = "adx-genre-chip";
      chip.textContent = name;
      chip.href = href;
      row.appendChild(chip);
    });
    (card.querySelector(".chartinfo") || card).appendChild(row);
    requestAnimationFrame(() => row.classList.add("is-loaded"));

    // "EP 8 / 12": the schedule badge already has the latest episode, so
    // it only gains the total; search/tag cards get the whole badge.
    const total = /^\d+$/.test(info.total) ? info.total : "";
    const siteBadge = card.querySelector(".chartepm");
    if (siteBadge && total && !RANK_PAGE && !siteBadge.querySelector(".adx-total")) {
      const t = document.createElement("span");
      t.className = "adx-total";
      t.textContent = " / " + total;
      siteBadge.appendChild(t);
    }
    const frame = card.querySelector(".similarimg .p1, .similarimg .asp") ||
      (card.matches(".similarimg") && card.querySelector(".p1, .asp"));
    if (frame && info.latest && !frame.querySelector(".adx-ep")) {
      const ep = document.createElement("span");
      ep.className = "adx-ep";
      ep.textContent = "EP " + info.latest + (total ? " / " + total : "");
      frame.appendChild(ep);
    }
  };

  const apply = (card, info) => {
    if (info && isNsfw(info.genres)) return card.classList.add("adx-nsfw");
    if (info) renderChips(card, info);
    // Every tag, not just the chips shown, is what the genre filter matches.
    card.dataset.adxTags = info ? info.genres.map(([n]) => n.toLowerCase()).join(" | ") : "";
    // Status for the All / Finished / Not finished switch. A schedule
    // card's own timer line (set in tintTimers) wins over the lookup.
    if (info && card.dataset.adxStatus === undefined) {
      const done = /finished/i.test(info.status) || (+info.latest > 0 && +info.latest >= +info.total);
      card.dataset.adxStatus = done ? "done" : "airing";
    }
    markSafe(card);
    scheduleFilter();
  };

  const check = (card) => {
    if (card.dataset.adxReq) return;
    card.dataset.adxReq = "1";
    const id = showIdOf(card.querySelector('a[href*="anime.php"]')?.href);
    if (!id) {
      card.dataset.adxTags = "";
      if (card.dataset.adxStatus === undefined) card.dataset.adxStatus = "";
      markSafe(card);
      return scheduleFilter();
    }
    lookup(id).then((info) => {
      apply(card, info);
      // unverifiable: still settle it so the filter stops waiting on it
      if (card.dataset.adxStatus === undefined) card.dataset.adxStatus = "";
    });
  };

  // ── genre filter (same behaviour as the animepahe home grid) ──
  // Words are whitespace/comma separated; a card stays when EVERY word
  // appears in one of its tags — and, when the status switch isn't on All,
  // when it is (Finished) or isn't (Not finished) done airing. Genres load lazily, so while a filter is
  // active every card on the page is looked up (cached ones instantly);
  // cards still loading stay hidden and the counter shows the progress.
  const FILTER_KEY = "adx.heaven.filter";
  const QUICK = ["Action", "Comedy", "Romance", "Fantasy", "Drama", "Isekai", "Slice Of Life", "Sports", "Mystery", "Horror"];
  const STATUS_KEY = "adx.heaven.status";
  let tokens = [];
  let statusMode = "all"; // "all" | "done" | "airing" (= not finished)
  let filterTimer = null;
  const scheduleFilter = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(applyFilter, 50);
  };
  const filterable = () =>
    Array.from(document.querySelectorAll(".chart, .similarimg")).filter(
      (c) => !c.classList.contains("adx-nsfw")
    );
  const applyFilter = () => {
    const cards = filterable();
    let shown = 0;
    let pending = 0;
    const active = tokens.length > 0 || statusMode !== "all";
    for (const card of cards) {
      if (!active) {
        card.classList.remove("adx-filtered");
        continue;
      }
      const needTags = tokens.length && card.dataset.adxTags === undefined;
      const needStatus = statusMode !== "all" && card.dataset.adxStatus === undefined;
      if (needTags || needStatus) {
        pending++;
        card.classList.add("adx-filtered");
        io.unobserve(card);
        check(card);
        continue;
      }
      const hay = card.dataset.adxTags || "";
      const st = card.dataset.adxStatus;
      const hit = tokens.every((t) => hay.includes(t)) &&
        (statusMode === "all" || (statusMode === "done" ? st === "done" : st !== "done"));
      card.classList.toggle("adx-filtered", !hit);
      if (hit) shown++;
    }
    const bar = document.getElementById("adx-filter");
    if (!bar) return;
    const count = bar.querySelector(".adx-filter-count");
    count.textContent = !active ? ""
      : pending ? shown + " match · checking " + pending + "…"
      : shown + " / " + cards.length;
    bar.querySelectorAll(".adx-quick").forEach((b) =>
      b.classList.toggle("is-on", tokens.includes(b.dataset.q)));
    bar.querySelectorAll(".adx-seg button").forEach((b) =>
      b.classList.toggle("is-on", b.dataset.s === statusMode));
    const empty = document.getElementById("adx-filter-empty");
    if (empty) empty.hidden = !(active && !pending && !shown);
    // Section headings and "See More" links read as noise mid-filter.
    document.documentElement.classList.toggle("adx-filtering", active);
  };
  const setFilter = (raw) => {
    const str = String(raw || "").trim();
    tokens = str.toLowerCase().split(/[\s,]+/).filter(Boolean);
    try { sessionStorage.setItem(FILTER_KEY, str); } catch (e) {}
    applyFilter();
  };

  const injectFilterBar = () => {
    if (document.getElementById("adx-filter")) return;
    // The anime page's Related / Similar rows are a handful of shows.
    if (location.pathname === "/anime.php") return;
    const grid = document.querySelector(".boldtext:has(> .chart), .info3:has(> .similarimg)");
    if (!grid) return;
    const bar = document.createElement("div");
    bar.id = "adx-filter";
    bar.className = "adx-filter";
    bar.innerHTML =
      '<label class="adx-filter-field">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>' +
        '<input type="text" placeholder="Filter by genre — e.g. romance, comedy" autocomplete="off" spellcheck="false">' +
        '<span class="adx-filter-count"></span>' +
        '<button type="button" class="adx-filter-clear" aria-label="Clear filter">\u00D7</button>' +
      "</label>" +
      '<div class="adx-seg" role="group" aria-label="Airing status">' +
        '<button type="button" data-s="all">All</button>' +
        '<button type="button" data-s="done">Finished</button>' +
        '<button type="button" data-s="airing">Not finished</button>' +
      "</div>" +
      '<div class="adx-filter-quick"></div>';
    const quick = bar.querySelector(".adx-filter-quick");
    for (const g of QUICK) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "adx-quick";
      b.textContent = g;
      b.dataset.q = g.toLowerCase().split(" ")[0];
      quick.appendChild(b);
    }
    const empty = document.createElement("div");
    empty.id = "adx-filter-empty";
    empty.className = "adx-filter-empty";
    empty.textContent = "No anime on this page match these filters.";
    empty.hidden = true;

    // Sit above the grid: before the first card, after the section title.
    const first = grid.querySelector(":scope > .chart, :scope > .similarimg");
    grid.insertBefore(bar, first);
    grid.insertBefore(empty, first);

    const input = bar.querySelector("input");
    let deb;
    input.addEventListener("input", () => {
      clearTimeout(deb);
      deb = setTimeout(() => setFilter(input.value), 120);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      input.value = "";
      setFilter("");
    });
    bar.querySelector(".adx-filter-clear").addEventListener("click", () => {
      input.value = "";
      setFilter("");
      input.focus();
    });
    quick.addEventListener("click", (e) => {
      const b = e.target.closest(".adx-quick");
      if (!b) return;
      const words = input.value.toLowerCase().split(/[\s,]+/).filter(Boolean);
      const next = words.includes(b.dataset.q)
        ? words.filter((w) => w !== b.dataset.q)
        : words.concat(b.dataset.q);
      input.value = next.join(", ");
      setFilter(input.value);
    });

    bar.querySelector(".adx-seg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-s]");
      if (!b) return;
      statusMode = b.dataset.s;
      try { sessionStorage.setItem(STATUS_KEY, statusMode); } catch (e) {}
      applyFilter();
    });
    try {
      const saved = sessionStorage.getItem(STATUS_KEY);
      if (saved === "done" || saved === "airing") statusMode = saved;
    } catch (e) {}

    let initial = "";
    try { initial = sessionStorage.getItem(FILTER_KEY) || ""; } catch (e) {}
    input.value = initial;
    setFilter(initial);
  };

  // Only fetch what is about to be seen; a cached verdict applies at once.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        check(e.target);
      }
    },
    { rootMargin: "800px 0px" }
  );

  // The schedule's own status line: green when finished, red when a new
  // episode just dropped, neutral for the countdown.
  const tintTimers = () => {
    document.querySelectorAll(".charttimer:not([data-adx-tint])").forEach((t) => {
      const txt = t.textContent;
      t.dataset.adxTint = /finished/i.test(txt) ? "done" : /released/i.test(txt) ? "new" : "wait";
      // Only a line that states the status decides it: the schedule's
      // "Finished airing" / countdown / "Episode Released". New Episodes
      // shows "15 h ago" there and Popular the rank change — those leave
      // it to the looked-up status.
      const card = t.closest(".chart");
      const says = /finished/i.test(txt) ? "done"
        : /released/i.test(txt) || (/\b(day|hour|min)s?\b/i.test(txt) && !/ago/i.test(txt)) ? "airing"
        : null;
      if (card && says && !RANK_PAGE) card.dataset.adxStatus = says;
    });
  };

  const scan = () => {
    tintTimers();
    document.querySelectorAll(CARD_SEL).forEach((card) => {
      if (card.dataset.adxSeen) return;
      card.dataset.adxSeen = "1";
      const id = showIdOf(card.querySelector('a[href*="anime.php"]')?.href);
      const hit = id && cached(id);
      if (hit) apply(card, hit);
      else io.observe(card);
    });
    if (tokens.length) scheduleFilter();
  };

  // ── watch page (gate.php) ──
  // The episode lives in a `key` cookie, never in the URL, so a watch page
  // can't be refreshed from history, shared or bookmarked reliably, and the
  // only way around is prev/next. Put the episode in the hash, restore it on
  // load, and list every episode under the player.
  const setKey = (key) => {
    const exp = new Date(Date.now() + 48 * 60 * 60 * 1000).toUTCString();
    document.cookie = "key=" + key + ";expires=" + exp + ";path=/";
  };
  const keyFromHash = () => new URLSearchParams(location.hash.slice(1)).get("k");

  if (location.pathname === "/gate.php") {
    // sk is the page's own "which episode is this" variable.
    const current = (Array.from(document.scripts)
      .map((s) => s.textContent.match(/var\s+sk\s*=\s*"([0-9a-f]{32})"/))
      .find(Boolean) || [])[1];
    const wanted = keyFromHash();
    // The flag only stops an immediate reload loop (e.g. a key the server no
    // longer accepts), not a later restore of the same episode.
    const lastTry = +sessionStorage.getItem("adx.restored." + wanted) || 0;
    if (wanted && current && wanted !== current && Date.now() - lastTry > 10000) {
      // Opened from a link/history entry for another episode: reload onto it.
      sessionStorage.setItem("adx.restored." + wanted, String(Date.now()));
      setKey(wanted);
      location.reload();
      return;
    }
    const title = document.querySelector(".linetitle3");
    const epNum = (title?.textContent.match(/Episode\s+(\d+(?:\.\d+)?)\s*$/) || [])[1];
    if (current) {
      history.replaceState(null, "", "/gate.php#" + (epNum ? "ep=" + epNum + "&" : "") + "k=" + current);
    }

    const showId = showIdOf(title?.querySelector('a[href*="anime.php"]')?.href);
    const tools = document.querySelector(".info2.right");
    if (showId && tools) {
      fetch("/anime.php?" + showId, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const eps = Array.from(doc.querySelectorAll('.linetitle2 a[id][onclick*="gate"]'))
            .map((a) => ({
              key: a.id,
              num: a.querySelector(".watch2")?.textContent.trim() || "?",
              when: Array.from(a.querySelectorAll(".watch1")).pop()?.textContent.trim() || "",
            }))
            .reverse(); // the site lists newest first
          if (eps.length < 2) return;
          const visited = localStorage.getItem("visited") || "";

          const panel = document.createElement("section");
          panel.className = "adx-eps";
          const head = document.createElement("div");
          head.className = "adx-eps-head";
          head.textContent = "Episodes";
          const count = document.createElement("span");
          count.textContent = eps.length;
          head.appendChild(count);
          const grid = document.createElement("div");
          grid.className = "adx-eps-grid";

          let currentTile = null;
          for (const ep of eps) {
            const a = document.createElement("a");
            a.className = "adx-ep-tile";
            a.href = "/gate.php#ep=" + ep.num + "&k=" + ep.key;
            a.textContent = ep.num;
            a.title = "Episode " + ep.num + (ep.when ? " · " + ep.when : "");
            if (ep.key === current) {
              a.classList.add("is-current");
              currentTile = a;
            } else if (visited.includes(ep.key)) {
              a.classList.add("is-watched");
            }
            a.addEventListener("click", (e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab: the hash restores it
              e.preventDefault();
              setKey(ep.key);
              location.href = a.href;
              location.reload();
            });
            grid.appendChild(a);
          }
          // The site's "Download Episode N" link sits alone under the player;
          // move it (node and handlers intact) into the panel header.
          const dl = Array.from(document.querySelectorAll(".linetitle2 > a"))
            .find((a) => /download/i.test(a.textContent));
          if (dl) {
            const row = dl.parentElement;
            dl.classList.add("adx-eps-dl");
            head.appendChild(dl);
            if (!row.children.length) row.remove();
          }
          panel.append(head, grid);
          tools.after(panel);
          if (currentTile) grid.scrollTop = currentTile.offsetTop - grid.clientHeight / 2;
        })
        .catch(() => {});
    }
  }

  // ── anime page: episode list ──
  // The site lists episodes newest first as big "EPISODE / 12 / 370 d ago"
  // boxes. Rebuild them into the same panel as the watch page: a header
  // with the count and a sort toggle, compact tiles, newest one tagged.
  const epRow = location.pathname === "/anime.php" &&
    document.querySelector('.linetitle2:has(> a[onclick*="gate"] .watch2)');
  if (epRow) {
    const links = Array.from(epRow.querySelectorAll(':scope > a[onclick*="gate"]'));
    const visited = localStorage.getItem("visited") || "";
    links.forEach((a, i) => {
      const num = a.querySelector(".watch2")?.textContent.trim() || "?";
      const when = (Array.from(a.querySelectorAll(".watch1")).pop()?.textContent.trim() || "")
        .replace(/\s*([dhmwy])\s+ago/i, "$1 ago");
      const tile = document.createElement("span");
      tile.className = "adx-ep-card";
      tile.innerHTML = "<b></b><small></small>";
      tile.firstChild.textContent = num;
      tile.lastChild.textContent = when;
      // "NEW" only when the newest episode really is recent (≤ 7 days).
      const age = when.match(/(\d+)\s*([mhdwy])/i);
      const fresh = age && (/[mh]/i.test(age[2]) || (/d/i.test(age[2]) && +age[1] <= 7));
      if (i === 0 && fresh) tile.classList.add("is-new");
      if (a.id && visited.includes(a.id)) tile.classList.add("is-watched");
      a.replaceChildren(tile); // keep the <a> and its onclick: the site's own navigation
      a.title = "Episode " + num + (when ? " · " + when : "");
    });

    const panel = document.createElement("section");
    panel.className = "adx-eps adx-eps-page";
    const head = document.createElement("div");
    head.className = "adx-eps-head";
    head.innerHTML = "Episodes<span></span>";
    head.querySelector("span").textContent = links.length;
    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "adx-eps-sort";
    head.appendChild(sort);
    epRow.classList.add("adx-eps-grid", "adx-eps-cards");
    epRow.before(panel);
    panel.append(head, epRow);

    const SORT_KEY = "adx.heaven.epsort";
    const render = (oldestFirst) => {
      const order = oldestFirst ? links.slice().reverse() : links;
      epRow.append(...order);
      sort.textContent = oldestFirst ? "Oldest first" : "Newest first";
      try { localStorage.setItem(SORT_KEY, oldestFirst ? "asc" : "desc"); } catch (e) {}
    };
    let asc = true;
    try { asc = localStorage.getItem(SORT_KEY) !== "desc"; } catch (e) {}
    render(asc);
    sort.addEventListener("click", () => { asc = !asc; render(asc); });
  }

  // Anime page: colour its own "Finished airing" strip like the card pills.
  const strip = document.querySelector(".info2 > .inline.c2");
  const stripPill = strip && statusPill(strip.textContent);
  if (stripPill) strip.className = "inline adx-status " + stripPill[1];

  scan();
  injectFilterBar();
  let scanTimer = null;
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 60);
  }).observe(document.body, { childList: true, subtree: true });
})();
