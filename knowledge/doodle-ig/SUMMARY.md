# doodle-ig: AI doodle Instagram + PDF books (backlog idea)

Status: **backlog / temp**, parked 2026-11-27. Charlie wants to continue it later.

## The idea
Copy the approach of `@easy_drawing_ideas__` (3.3M followers, all AI doodle images, no videos) for a new niche:
**newlyweds + psychology**: cute doodles of the first years of marriage, each post carrying one real idea from couple research (mostly Gottman's newlywed studies). Sell PDF workbooks through one link in the bio.

## Pages (local, open with `python3 -m http.server --bind 127.0.0.1` from `doodle-ig/`)
- `doodle-ig/index.html`: the chosen combo plan (sample feed, 4 name options, 3 first-book options, first 30 posts, funnel)
- `doodle-ig/niches.html`: the research + all niche options (6 family-life niches + the 15 topics from Charlie's video, scored)

## Research findings (100 posts, Oct 4 to Nov 25 2026)
- About 2 posts/day, still images only, Instagram tags them "AI content" and they still go viral.
- Median 11K likes; 23 posts over 50K, 35 under 5K. Hits are posts people send to a partner/parent: a 10-slide dad comic (177K, 10.5K reposts), "National Send Your Wife Money Day" (164K), "How to say NO to your wife" (134K).
- Formats: dialogue comic, hard-truth quote, numbered carousel, before/after split. Pink paper, brown ink, chunky hand lettering, same doodle family.
- Captions are 1 to 2 soft lines; only 4 of 100 mention a book or link.
- Funnel: feeling post, then a book-page post with a footer ("Love drawing these? 100 more inside, link in bio"), then one bio link straight to the Shopify collection, then a PDF in the same style.
- Shop (easydrawingideas.ca, Shopify): 39 products, 33 are old physical craft items (2024). All 5 new products since Aug 2026 are PDFs matching post topics (Know Your Kids Better, Never Stop Dating Your Spouse, Anywhere Play, You Can Draw 100 Cute Things, Date Nights for Tired Couples), ~₱400 to ₱1,400.
- Real-photo craft posts (his old niche) flop: all 6 under 2.5K likes.

## Open picks (ask Charlie)
- Account name: 1 `@first.years.drawn` (my pick), 2 `@married.mind`, 3 `@tiny.marriage.lessons`, 4 `@us.in.doodles`. Handles NOT checked for availability.
- First book: A "52 Questions for the First Years" ~₱450 (my pick), B "Fight Better" repair guide ~₱600, C "Bids: 100 tiny ways to turn toward each other" ~₱550.

## Next steps when resumed
1. Charlie picks name + book (e.g. "1 + A").
2. Write all 30 posts (15 feeling, 9 psychology carousels, 6 book pages; days 1 to 8 are drafted in index.html).
3. Lock one AI illustration style prompt (same couple, same pink, same lettering) and test it.
4. Outline + build the first PDF; pick a store (Shopify, Gumroad, or Payhip).

## Gotchas
- Instagram internal API calls via Chrome were blocked by the permission classifier; reading post pages' `og:description` (likes, comments, caption) worked but is throttled (~20s/post at times). Be polite.
- Psychology claims used: bids 86% vs 33% (Gottman newlyweds, 6 years), 5:1 ratio in conflict, flooding ~100 bpm + 20-minute break. Keep claims sourced.
