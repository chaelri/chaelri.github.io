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
//
// Air dates come from AniList (graphql.anilist.co, CORS-open, no key),
// searched by the show page's romaji title inside its Year, ten shows per
// request because the limit is 30 requests a minute. No match falls back to
// the site's own year.
(function () {
  "use strict";
  if (window.__adxHeavenGenres) return;
  window.__adxHeavenGenres = true;

  // animeheaven tags explicitly ("Explicit Sex", "Nudity", …), not just by genre.
  const NSFW_RE = /\b(ecchi|erotica|hentai|nudity|explicit|sexual|sex)\b/i;
  const CACHE_KEY = "adx.heaven.shows.v5";
  // a finished show's page never changes
  const TTL_MS = 60 * 24 * 60 * 60 * 1000;
  const MAX_CHIPS = 3;
  // Be a polite visitor: at most three show pages in flight, 4 a second at
  // most, and everything stops for a minute if the site says 429.
  const CONCURRENCY = 3;
  const MIN_GAP_MS = 250;
  const RATE_PAUSE_MS = 60 * 1000;
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
  // A show still airing gains episodes, so its entry goes stale sooner.
  const AIRING_TTL_MS = 3 * 24 * 60 * 60 * 1000;
  const cached = (id) => {
    const hit = cache[id];
    if (!hit) return null;
    const ttl = /finished/i.test(hit.g.status) ? TTL_MS : AIRING_TTL_MS;
    return Date.now() - hit.t < ttl ? hit.g : null;
  };

  // "29 min ago" / "5 h ago" / "370 d ago" -> milliseconds
  const AGE_UNIT_MS = { sec: 1e3, s: 1e3, min: 6e4, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6 };
  const ageMs = (txt) => {
    const m = String(txt).match(/(\d+)\s*(sec|min|mo|s|m|h|d|w|y)\b/i);
    return m ? +m[1] * AGE_UNIT_MS[m[2].toLowerCase()] : null;
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
  const bgQueue = []; // the Latest feed's older stages wait behind visible cards
  let active = 0;
  let nextStart = 0;
  let pumpTimer = null;
  const pump = () => {
    while (active < CONCURRENCY && (queue.length || bgQueue.length)) {
      const wait = nextStart - Date.now();
      if (wait > 0) {
        if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, wait);
        return;
      }
      nextStart = Date.now() + MIN_GAP_MS;
      const job = queue.shift() || bgQueue.shift();
      active++;
      fetch("/anime.php?" + job.id, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const now = Date.now();
          return {
            // every episode as [gate key, number, aired at (minutes since epoch)]
            eps: Array.from(doc.querySelectorAll('.linetitle2 a[id][onclick*="gate"]')).map((a) => {
              const age = ageMs(Array.from(a.querySelectorAll(".watch1")).pop()?.textContent || "");
              return [a.id, a.querySelector(".watch2")?.textContent.trim() || "?", age == null ? 0 : Math.round((now - age) / 6e4)];
            }),
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
            // "2022" or "2022-2023": the premiere year is what matters
            year: (doc.querySelector(".infoyear .inline:nth-of-type(2)")?.textContent.match(/\d{4}/) || [""])[0],
            title: doc.querySelector(".infotitle")?.textContent.trim() || "",
            romaji: doc.querySelector(".infotitlejp")?.textContent.trim() || "",
          };
        })
        .then(job.resolve, (status) => {
          const tries = job.tries || 0;
          if (status === 429) {
            nextStart = Date.now() + RATE_PAUSE_MS;
            (job.bg ? bgQueue : queue).unshift(job);
          } else if (status >= 500 && tries < RETRY_DELAYS_MS.length) {
            job.tries = tries + 1;
            setTimeout(() => { (job.bg ? bgQueue : queue).push(job); pump(); }, RETRY_DELAYS_MS[tries]);
          } else {
            job.resolve(null); // unverifiable — reveal, don't cache
          }
        })
        .finally(() => { active--; pump(); });
    }
  };
  const lookup = (id, bg = false) => {
    const hit = cached(id);
    if (hit) return Promise.resolve(hit);
    if (inflight.has(id)) return inflight.get(id);
    const p = new Promise((resolve) => { (bg ? bgQueue : queue).push({ id, resolve, bg }); pump(); })
      .then((g) => {
        if (g) { cache[id] = { g, t: Date.now() }; saveCache(); }
        return g;
      });
    inflight.set(id, p);
    return p;
  };

  // ── air dates (AniList) ──
  // { [showId]: { d: { s: [y, m, d], e: [y, m, d] | null } | null, t } }
  const AIRED_KEY = "adx.heaven.aired.v1";
  const AIRED_TTL_DONE = 60 * 24 * 60 * 60 * 1000;
  const AIRED_TTL_AIRING = 2 * 24 * 60 * 60 * 1000; // the end date is still coming
  const ANILIST_BATCH = 10;
  let aired = {};
  try { aired = JSON.parse(localStorage.getItem(AIRED_KEY) || "{}"); } catch (e) {}
  let airedSaveTimer = null;
  const saveAired = () => {
    clearTimeout(airedSaveTimer);
    airedSaveTimer = setTimeout(() => {
      const now = Date.now();
      for (const k of Object.keys(aired)) if (now - aired[k].t > AIRED_TTL_DONE) delete aired[k];
      try { localStorage.setItem(AIRED_KEY, JSON.stringify(aired)); } catch (e) {}
    }, 250);
  };
  const airedQueue = [];
  const airedInflight = new Map();
  let airedTimer = null;
  let airedBusy = false;
  // AniList 429s a burst even under the per-minute limit, so one request at
  // a time, spaced to stay under 30 a minute.
  const ANILIST_GAP_MS = 2100;
  let anilistPausedUntil = 0;
  const kickAired = (delay) => {
    if (airedBusy || airedTimer || !airedQueue.length) return;
    airedTimer = setTimeout(flushAired, Math.max(delay, anilistPausedUntil - Date.now()));
  };
  const ymd = (d) => (d && d.year ? [d.year, d.month, d.day].filter(Boolean) : null);
  const flushAired = () => {
    airedTimer = null;
    const wait = anilistPausedUntil - Date.now();
    if (wait > 0) { airedTimer = setTimeout(flushAired, wait); return; }
    const jobs = airedQueue.splice(0, ANILIST_BATCH);
    if (!jobs.length) return;
    airedBusy = true;
    const vars = {};
    const defs = [];
    // Each show is searched by romaji, English title, and the English title
    // up to its first ":" / " - ", all in one request: AniList search is
    // strict ("Kan Colle" never finds "KanColle"), and the year window plus
    // episode count keep the short form from landing on the wrong season.
    const fields = [];
    jobs.forEach((job, i) => {
      const y = +job.year;
      // a Winter show can premiere in the December before its Year
      const range = y ? ", startDate_greater: " + ((y - 1) * 10000 + 1200) + ", startDate_lesser: " + (y * 10000 + 1232) : "";
      job.searches.forEach((q, k) => {
        const v = "s" + i + "_" + k;
        vars[v] = q;
        defs.push("$" + v + ": String");
        fields.push("a" + i + "_" + k + ": Page(perPage: 3) { media(search: $" + v + ", type: ANIME" + range +
          ") { episodes status startDate { year month day } endDate { year month day } } }");
      });
    });
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "query(" + defs.join(", ") + ") {" + fields.join(" ") + "}", variables: vars }),
    })
      .then((res) => {
        if (res.status === 429) {
          anilistPausedUntil = Date.now() + (+res.headers.get("Retry-After") || 15) * 1000;
          return Promise.reject("rate");
        }
        return res.ok ? res.json() : Promise.reject(res.status);
      })
      .then((body) => {
        jobs.forEach((job, i) => {
          // searches are in order of trust; the first one that finds anything decides
          const list = job.searches.map((q, k) => body.data?.["a" + i + "_" + k]?.media || [])
            .find((l) => l.length) || [];
          // the same search also finds the movie / recap; the episode count picks the series
          const m = list.find((x) => x.episodes && String(x.episodes) === job.total) || list[0];
          job.resolve(m && ymd(m.startDate)
            ? { s: ymd(m.startDate), e: m.status === "FINISHED" ? ymd(m.endDate) : null }
            : job.year ? { s: [+job.year], e: null } : null);
        });
      })
      .catch((err) => {
        if (err === "rate") airedQueue.unshift(...jobs);
        else jobs.forEach((job) => job.resolve(job.year ? { s: [+job.year], e: null, soft: true } : null));
      })
      .finally(() => {
        airedBusy = false;
        anilistPausedUntil = Math.max(anilistPausedUntil, Date.now() + ANILIST_GAP_MS);
        kickAired(0);
      });
  };
  const lookupAired = (id, info) => {
    const hit = aired[id];
    if (hit && Date.now() - hit.t < (hit.d?.e ? AIRED_TTL_DONE : AIRED_TTL_AIRING)) return Promise.resolve(hit.d);
    if (airedInflight.has(id)) return airedInflight.get(id);
    const short = (info.title || "").split(/:| - /)[0].trim();
    const searches = [...new Set([info.romaji, info.title, short].filter((t) => t && t !== "-"))];
    if (!searches.length) return Promise.resolve(info.year ? { s: [+info.year], e: null } : null);
    const p = new Promise((resolve) => {
      airedQueue.push({ searches, year: info.year, total: info.total, resolve });
      kickAired(150); // gather the cards that come into view together
    }).then((d) => {
      // a network failure is not worth remembering
      if (!d?.soft) { aired[id] = { d, t: Date.now() }; saveAired(); }
      airedInflight.delete(id);
      return d;
    });
    airedInflight.set(id, p);
    return p;
  };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDay = ([y, m, d], withYear = true) =>
    !m ? String(y) : MONTHS[m - 1] + (d ? " " + d : "") + (withYear ? (d ? ", " : " ") + y : "");
  // Only the premiere matters, not when it ended.
  const fmtAired = ({ s }) => fmtDay(s);

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
      el.title = pill[0];
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
    const box = card.querySelector(".similarimg .p1, .similarimg .asp") ||
      (card.matches(".similarimg") && card.querySelector(".p1, .asp"));
    // .p1 holds the title too; the badge belongs on the framed cover link.
    const frame = box && (box.querySelector(":scope > a:has(> .coverimg)") || box);
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
    if (info && !card.matches(".popularbox2")) {
      // The line is laid out now and filled when AniList answers, so the
      // card never grows under the reader.
      const el = card.querySelector(".adx-aired") || document.createElement("div");
      if (!el.isConnected) {
        el.className = "adx-aired";
        const row = card.querySelector(".adx-genre-row");
        if (row) row.before(el);
        else (card.querySelector(".chartinfo") || card).appendChild(el);
      }
      lookupAired(showIdOf(card.querySelector('a[href*="anime.php"]')?.href), info).then((d) => {
        if (!d || el.textContent) return;
        el.textContent = fmtAired(d);
        el.title = d.s.length > 1 ? "Released (AniList)" : "Release year (animeheaven)";
      });
    }
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
    const grid = document.querySelector(".boldtext:has(> .chart, > .adx-feed-anchor), .info3:has(> .similarimg)");
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
    // the Latest feed starts at its anchor, above its first day heading
    const first = grid.querySelector(":scope > .adx-feed-anchor, :scope > .chart, :scope > .similarimg");
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
    // the player box takes the video's real shape (see .videodiv)
    const vid = document.querySelector("video.videodiv");
    const fitVideo = () => {
      if (vid.videoWidth && vid.videoHeight) document.documentElement.style.setProperty("--adx-ar", String(vid.videoWidth / vid.videoHeight));
    };
    if (vid) { vid.addEventListener("loadedmetadata", fitVideo); fitVideo(); }
    // sk is the page's own "which episode is this" variable.
    const current = (Array.from(document.scripts)
      .map((s) => s.textContent.match(/var\s+sk\s*=\s*"([0-9a-f]{32})"/))
      .find(Boolean) || [])[1];
    const wanted = keyFromHash();
    // The flag only stops an immediate reload loop (e.g. a key the server no
    // longer accepts), not a later restore of the same episode.
    const lastTry = +sessionStorage.getItem("adx.restored." + wanted) || 0;
    // No current episode at all (no key cookie yet, so the site shows its
    // 404) counts as "another episode" too: a feed link opened in a new tab.
    if (wanted && wanted !== current && Date.now() - lastTry > 10000) {
      // Opened from a link/history entry for another episode: reload onto it.
      sessionStorage.setItem("adx.restored." + wanted, String(Date.now()));
      setKey(wanted);
      location.reload();
      return;
    }
    const title = document.querySelector(".linetitle3");
    const epNum = (title?.textContent.match(/Episode\s+(\d+(?:\.\d+)?)\s*$/) || [])[1];
    // Tab title: what is playing, episode first so a narrow tab keeps it.
    const showName = title?.querySelector('a[href*="anime.php"]')?.textContent.trim() ||
      title?.textContent.replace(/\s*Episode\s+\S+\s*$/, "").trim();
    if (showName) document.title = (epNum ? "Ep " + epNum + " · " : "") + showName;
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

          // Prev / Next at the top right of the title row; a button with no
          // episode that way (first / latest) is not shown at all.
          const goTo = (ep) => {
            setKey(ep.key);
            location.href = "/gate.php#ep=" + ep.num + "&k=" + ep.key;
            location.reload();
          };
          const at = eps.findIndex((ep) => ep.key === current);
          if (at !== -1 && title) {
            const nav = document.createElement("div");
            nav.className = "adx-epnav";
            [["Prev", eps[at - 1]], ["Next", eps[at + 1]]].forEach(([label, ep]) => {
              if (!ep) return;
              const a = document.createElement("a");
              a.className = "adx-epnav-" + label.toLowerCase();
              a.href = "/gate.php#ep=" + ep.num + "&k=" + ep.key;
              a.title = "Episode " + ep.num;
              a.innerHTML = "<span></span>";
              a.firstChild.textContent = label + " · Ep " + ep.num;
              a.addEventListener("click", (e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab: the hash restores it
                e.preventDefault();
                goTo(ep);
              });
              nav.appendChild(a);
            });
            if (nav.children.length) {
              // keep "<show> Episode N" as one flex item next to the buttons
              const text = document.createElement("span");
              text.append(...title.childNodes);
              title.classList.add("adx-has-epnav");
              title.append(text, nav);
            }
          }

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

  // Anime page: the site's full-width status strip ("Finished airing" /
  // "Countdown to Episode 3 : 6 Days 23 Hours 28 Min") becomes one pill in
  // the info box, under Episodes / Year / Score. A countdown is turned into
  // the actual day and time, with the time left beside it.
  const strip = location.pathname === "/anime.php" && document.querySelector(".boldtext > .info2:has(> .inline)");
  const infoYear = document.querySelector(".infoyear");
  if (strip && infoYear) {
    const parts = strip.querySelectorAll(":scope > .inline");
    const label = parts[0]?.textContent.replace(/\s*:\s*$/, "").trim() || "";
    const value = parts[1]?.textContent.trim() || "";
    const pill = document.createElement("div");
    pill.className = "adx-airstate";
    const count = label.match(/countdown to episode\s+(\S+)/i);
    const left = value.match(/(?:(\d+)\s*days?)?\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*min)?/i);
    const ms = left ? ((+left[1] || 0) * 1440 + (+left[2] || 0) * 60 + (+left[3] || 0)) * 6e4 : 0;
    if (count && ms) {
      const at = new Date(Date.now() + ms);
      const day = at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const d = Math.floor(ms / 864e5);
      const h = Math.floor((ms % 864e5) / 36e5);
      const m = Math.round((ms % 36e5) / 6e4);
      pill.classList.add("is-next");
      pill.innerHTML = "<b></b><span></span><em></em>";
      pill.children[0].textContent = "Episode " + count[1];
      pill.children[1].textContent = day + ", " + time;
      pill.children[2].textContent = "in " + (d ? d + "d " + h + "h" : h ? h + "h " + m + "m" : m + "m");
    } else {
      const text = /finished/i.test(value + label) ? "Finished airing" : value || label;
      if (/finished/i.test(text)) pill.classList.add("is-done");
      pill.textContent = text;
    }
    if (pill.textContent) {
      infoYear.after(pill);
      strip.remove();
    }
  }

  // ── Latest (new.php): every episode, newest first, grouped by day ──
  // new.php stops at ~11 days and has no pages, so older episodes come from
  // each show's own episode list ("370 d ago"). Shows are found in stages,
  // each loaded only when the reader scrolls to the end of the one before:
  // new.php itself, the schedule (every show since the last season page),
  // then the season pages newest to oldest. Each stage completes a stretch
  // of time (its horizon); nothing older than the horizon is shown yet, so
  // the feed never shows a gap that later fills in.
  const buildFeed = () => {
    const grid = document.querySelector(".boldtext:has(> .chart)");
    if (!grid) return;
    const title = grid.querySelector(":scope > .linetitle");
    if (title?.firstChild?.nodeType === 3) title.firstChild.textContent = "Latest episodes";

    const shows = new Map(); // id -> { title, cover }
    const eps = new Map(); // "id:num" -> { id, num, key, ts }
    const cardsOf = (root) => Array.from(root.querySelectorAll(".chart, .similarimg")).map((c) => {
      const a = c.querySelector('a[href*="anime.php?"]');
      const id = showIdOf(a?.getAttribute("href"));
      const img = c.querySelector("img.coverimg");
      return id && {
        id,
        title: (c.querySelector(".charttitle a, .similarname a")?.textContent || img?.alt || "").trim(),
        cover: img?.getAttribute("src") || "",
        latest: c.querySelector(".chartepm")?.textContent.trim() || "",
        age: ageMs(c.querySelector(".charttimer")?.textContent || ""),
      };
    }).filter(Boolean);
    const addShow = (c) => { if (!shows.has(c.id)) shows.set(c.id, { title: c.title, cover: c.cover }); };
    const addEps = (id, g) => {
      if (!g || !g.eps || isNsfw(g.genres)) return;
      for (const [key, num, ts] of g.eps) if (ts) eps.set(id + ":" + num, { id, num, key, ts });
    };

    // stage 0: the page's own cards. Nothing is drawn until every one of
    // their shows is in, so the first screen is already in its final order.
    const own = cardsOf(grid);
    const now = Date.now();
    let horizon = now - Math.max(...own.map((c) => c.age || 0)) - 864e5;
    own.forEach(addShow);
    grid.querySelectorAll(":scope > .chart, :scope > a:has(> .boxitem2)").forEach((el) => el.remove());

    const anchor = document.createElement("div");
    anchor.className = "adx-feed-anchor";
    const foot = document.createElement("div");
    foot.className = "adx-feed-foot";
    foot.innerHTML = "<span></span><i><b></b></i><button type='button' hidden>Load older episodes</button>";
    const moreBtn = foot.querySelector("button");
    grid.append(anchor, foot);
    const setStatus = (text, done, total) => {
      foot.firstChild.textContent = text;
      foot.classList.toggle("is-busy", total > 0);
      foot.querySelector("b").style.width = total ? Math.round((done / total) * 100) + "%" : "0";
    };

    const PAGE = 36;
    let limit = PAGE;
    const nodes = new Map();
    const visited = localStorage.getItem("visited") || "";
    const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const dayLabel = (day) => {
      const diff = Math.round((dayOf(Date.now()) - day) / 864e5);
      const d = new Date(day);
      if (diff === 0) return "Today";
      if (diff === 1) return "Yesterday";
      const date = MONTHS_LONG[d.getMonth()] + " " + d.getDate();
      if (diff < 7) return DAYS[d.getDay()] + ", " + date;
      return date + (d.getFullYear() !== new Date().getFullYear() ? ", " + d.getFullYear() : "");
    };
    const whenLabel = (ts) => {
      const m = Math.max(0, Date.now() - ts * 6e4);
      return m < 36e5 ? Math.max(1, Math.round(m / 6e4)) + " min ago"
        : m < 864e5 ? Math.floor(m / 36e5) + " h ago"
        : Math.floor(m / 864e5) + " d ago";
    };
    const cardFor = (e) => {
      const k = e.id + ":" + e.num;
      let c = nodes.get(k);
      if (!c) {
        const show = shows.get(e.id) || {};
        c = document.createElement("div");
        c.className = "chart bc1 adx-feed-card";
        c.innerHTML =
          "<div class='chartimg'><a class='adx-feed-play'><img class='coverimg' loading='lazy' alt=''>" +
          "<div class='chartepm bc2 c1'></div></a></div>" +
          "<div class='chartinfo'><div class='charttitle c'><a class='c'></a></div><div class='charttimer c2'></div></div>";
        const img = c.querySelector("img");
        img.src = show.cover || "";
        img.alt = show.title || "";
        c.querySelector(".chartepm").textContent = e.num;
        const t = c.querySelector(".charttitle a");
        t.href = "anime.php?" + e.id;
        t.textContent = show.title || "";
        c.querySelector(".adx-feed-play").addEventListener("click", (ev) => {
          const key = c.dataset.key;
          if (!key || ev.metaKey || ev.ctrlKey || ev.shiftKey) return; // new tab: the hash restores it
          ev.preventDefault();
          setKey(key);
          location.href = c.querySelector(".adx-feed-play").href;
        });
        nodes.set(k, c);
      }
      const play = c.querySelector(".adx-feed-play");
      if (e.key) {
        c.dataset.key = e.key;
        play.href = "/gate.php#ep=" + e.num + "&k=" + e.key;
        c.classList.toggle("is-watched", visited.includes(e.key));
      } else {
        play.href = "anime.php?" + e.id; // the show's page could not be read
      }
      c.querySelector(".charttimer").textContent = whenLabel(e.ts);
      // chips and the release-date line go in before the card is shown
      c.dataset.adxSeen = "1";
      const g = cached(e.id);
      if (g) apply(c, g);
      else io.observe(c);
      return c;
    };

    let loading = false;
    let exhausted = false;
    let ready = false;
    // Append-only: what is on screen never moves. New episodes only ever go
    // below the last one shown; anything a later stage finds that would sort
    // above it is left out rather than pushed into the middle.
    //
    // One card per show, at its newest episode: a weekly show would otherwise
    // repeat down the feed once per episode. Episodes are sorted newest
    // first, so the first one kept for a show is its latest.
    const shown = new Set(); // show ids
    let lastTs = Infinity;
    let lastDay = null;
    const eligible = () => {
      const seen = new Set();
      // newest per show first, THEN the horizon / below-the-last-card rules,
      // so a show whose newest episode can't be placed is skipped outright
      return Array.from(eps.values())
        .sort((a, b) => b.ts - a.ts || (a.id < b.id ? -1 : 1))
        .filter((e) => !seen.has(e.id) && seen.add(e.id))
        .filter((e) => e.ts * 6e4 >= horizon && e.ts <= lastTs && !shown.has(e.id) &&
          !(cached(e.id) && isNsfw(cached(e.id).genres)));
    };
    const render = () => {
      if (!ready) return;
      const add = eligible().slice(0, Math.max(0, limit - shown.size));
      const frag = document.createDocumentFragment();
      for (const e of add) {
        const day = dayOf(e.ts * 6e4);
        if (day !== lastDay) {
          lastDay = day;
          const h = document.createElement("div");
          h.className = "adx-day";
          h.innerHTML = "<span></span><i></i>";
          h.firstChild.textContent = dayLabel(day);
          frag.appendChild(h);
        }
        frag.appendChild(cardFor(e));
        shown.add(e.id);
        lastTs = e.ts;
      }
      foot.before(frag);
      const more = eligible().length > 0;
      if (!loading) setStatus(exhausted && !more ? "That's every episode animeheaven lists." : "", 0, 0);
      // Older stages cost the site a request per show, so they only load on a tap.
      moreBtn.hidden = loading || exhausted || more;
      if (!moreBtn.hidden) moreBtn.textContent = "Load older episodes · " + stages[0].label;
      requestAnimationFrame(needMoreIfClose);
    };

    // ── stages ──
    const SEASONS = ["winter", "spring", "summer", "fall"];
    const seasonStart = (y, i) => new Date(y, i * 3, 1).getTime();
    const newest = Array.from(document.querySelectorAll('a[href$=".php"]'))
      .map((a) => a.getAttribute("href").match(/^\/?(\d{4})(winter|spring|summer|fall)\.php$/))
      .find(Boolean);
    let season = newest ? { y: +newest[1], i: SEASONS.indexOf(newest[2]) } : { y: 2025, i: 3 };
    const nextOf = ({ y, i }) => (i === 3 ? { y: y + 1, i: 0 } : { y, i: i + 1 });
    const prevOf = ({ y, i }) => (i === 0 ? { y: y - 1, i: 3 } : { y, i: i - 1 });
    const after = nextOf(season);
    const stages = [{ label: "back to " + MONTHS[after.i * 3] + " " + after.y, url: "/?schedule", horizon: seasonStart(after.y, after.i) }];
    const nameOf = ({ y, i }) => y + " " + SEASONS[i][0].toUpperCase() + SEASONS[i].slice(1);
    const pushSeason = () => {
      stages.push({ label: "back to " + nameOf(season), url: "/" + season.y + SEASONS[season.i] + ".php", horizon: seasonStart(season.y, season.i) });
      season = prevOf(season);
    };
    pushSeason();

    const loadStage = () => {
      const st = stages.shift();
      if (!st) { exhausted = true; horizon = -Infinity; return render(); }
      loading = true;
      moreBtn.hidden = true;
      setStatus("Finding older episodes " + st.label + "…", 0, 1);
      let sorter = null;
      fetch(st.url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => {
          const list = cardsOf(new DOMParser().parseFromString(html, "text/html"));
          if (!list.length) return Promise.reject(404);
          list.forEach(addShow);
          setStatus("", 0, 0);
          sorter = makeSorter(list, "Sorting older episodes, " + st.label);
          return Promise.all(list.map((c) => lookup(c.id, true).then((g) => { addEps(c.id, g); sorter.place(c.id, g); })));
        })
        .then(() => {
          horizon = st.horizon;
          if (st.url.includes("20")) pushSeason();
        }, (err) => {
          // the first missing season page is the end of the catalogue
          if (err === 404) { exhausted = true; horizon = -Infinity; }
          else stages.unshift(st); // a network hiccup: try this stage again on the next scroll
        })
        .finally(() => {
          const done = () => { loading = false; limit += PAGE; render(); };
          if (sorter) sorter.finish(done);
          else done();
        });
    };

    function needMoreIfClose() {
      if (loading || !foot.isConnected) return;
      if (foot.getBoundingClientRect().top > innerHeight + 1200) return;
      if (ready && eligible().length) { limit += PAGE; render(); }
    }
    moreBtn.addEventListener("click", loadStage);
    addEventListener("scroll", () => requestAnimationFrame(needMoreIfClose), { passive: true });

    // ── waiting: the shows' covers sort themselves while their pages come in ──
    // Each cover starts dim, lights up when its show is read and glides
    // (FLIP) to its place by newest episode; when all are in, the tiles fade
    // and the feed continues in that same order. A warm cache finishes
    // before the delay, so the sorter never flashes.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const makeSorter = (cards, title) => {
      const box = document.createElement("div");
      box.className = "adx-sort" + (cards.length > 120 ? " is-many" : "");
      box.innerHTML = "<div class='adx-sort-head'><span></span><em></em></div><div class='adx-sort-tiles'></div>";
      box.querySelector("span").textContent = title;
      const tilesBox = box.querySelector(".adx-sort-tiles");
      const counter = box.querySelector("em");
      const tiles = new Map(); // show id -> { el, ts }
      cards.forEach((c, i) => {
        const g = cached(c.id);
        if ((g && isNsfw(g.genres)) || tiles.has(c.id)) return;
        const el = document.createElement("div");
        el.className = "adx-sort-tile";
        el.style.setProperty("--i", i % 40);
        const img = document.createElement("img");
        img.src = c.cover;
        img.alt = "";
        el.appendChild(img);
        tilesBox.appendChild(el);
        tiles.set(c.id, { el, ts: null });
      });
      let got = 0;
      const started = Date.now();
      const count = () => {
        const left = cards.length - got;
        // time left from the pace so far, once there is a pace to go on
        const eta = got >= 6 && left ? ((Date.now() - started) / got) * left : 0;
        counter.textContent = got + " / " + cards.length +
          (eta > 90e3 ? " · ~" + Math.round(eta / 6e4) + " min left" : eta > 8e3 ? " · ~" + Math.round(eta / 5e3) * 5 + " s left" : "");
      };
      count();
      let queued = false;
      const resort = () => {
        queued = false;
        if (!box.isConnected) return;
        const list = Array.from(tiles.values());
        const before = new Map(list.map((t) => [t.el, t.el.getBoundingClientRect()]));
        const done = list.filter((t) => t.ts != null).sort((a, b) => b.ts - a.ts);
        const waiting = list.filter((t) => t.ts == null);
        tilesBox.append(...done.map((t) => t.el), ...waiting.map((t) => t.el));
        if (reduceMotion) return;
        for (const t of list) {
          const a = before.get(t.el);
          const b = t.el.getBoundingClientRect();
          const dx = a.left - b.left;
          const dy = a.top - b.top;
          if (!dx && !dy) continue;
          t.el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }],
            { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      };
      const timer = setTimeout(() => { foot.before(box); foot.classList.add("is-sorting"); }, 180);
      return {
        place(id, g) {
          got++;
          count();
          const t = tiles.get(id);
          if (!t) return;
          if (g && isNsfw(g.genres)) { t.el.remove(); tiles.delete(id); return; }
          t.ts = g && g.eps && g.eps.length ? Math.max(...g.eps.map((e) => e[2])) : 0;
          t.el.classList.add("is-in");
          if (!queued) { queued = true; requestAnimationFrame(resort); }
        },
        finish(then) {
          clearTimeout(timer);
          const end = () => { box.remove(); foot.classList.remove("is-sorting"); then(); };
          if (!box.isConnected || reduceMotion) return end();
          // let the last tile land, then fade the sorter out
          setTimeout(() => { box.classList.add("is-done"); setTimeout(end, 320); }, 560);
        },
      };
    };

    // Stage 0's shows: refetch any whose cached page predates its new episode.
    const first = makeSorter(own, "Sorting the latest episodes");
    Promise.all(own.map((c) => {
      const hit = cached(c.id);
      if (hit && c.latest && !(hit.eps || []).some(([, n]) => n === c.latest)) delete cache[c.id];
      return lookup(c.id).then((g) => {
        if (g && g.eps && g.eps.length) addEps(c.id, g);
        // the show's page could not be read: fall back to what the card says
        else if (c.latest) eps.set(c.id + ":" + c.latest, { id: c.id, num: c.latest, key: null, ts: Math.round((now - (c.age || 0)) / 6e4) });
        first.place(c.id, g);
      });
    })).then(() => first.finish(() => { ready = true; render(); }));
  };

  // The site's nav: the logo is home (the Latest feed) and the only other
  // item kept is My Bookmarks, as an icon at the top right. Schedule,
  // Popular, the season page and Random are dropped, and with them the
  // burger menu that only repeated them. (/?schedule still opens the old home.)
  document.querySelectorAll(".header a:has(> .headeritem)").forEach((a) => {
    if (!/bookmarks\.php/.test(a.getAttribute("href") || "")) return a.remove();
    a.className = "adx-bookmarks";
    a.title = "My Bookmarks";
    a.setAttribute("aria-label", "My Bookmarks");
    a.innerHTML = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linejoin='round' aria-hidden='true'><path d='M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1z'/></svg>";
  });
  // mobile bar: its home icon already goes to the feed
  document.querySelectorAll('.navitem a[href="new.php"]').forEach((a) => a.closest(".navitem").remove());
  document.querySelectorAll('a[href="/"]').forEach((a) => a.setAttribute("href", "/new.php"));
  if (location.pathname === "/new.php") document.title = "AnimeHeaven";
  if (location.pathname === "/new.php") buildFeed();

  // The whole card is the click target, as on YouTube: a click anywhere
  // that isn't already a link or button follows the card's main link
  // (the episode on the Latest feed, the show elsewhere).
  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.target.closest("a, button, input, label, .book")) return;
    const card = e.target.closest(".chart, .similarimg");
    const link = card && card.querySelector(".adx-feed-play, .chartimg a, .p1 a, a[href*='anime.php']");
    if (link) link.click();
  });

  scan();
  injectFilterBar();
  let scanTimer = null;
  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 60);
  }).observe(document.body, { childList: true, subtree: true });
})();
