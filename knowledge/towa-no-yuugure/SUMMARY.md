# towa-no-yuugure/ — Episode viewer for "Dusk Beyond the End of the World"

**Last updated:** 2026-04-28
**Status:** 🟢 Active (created 2026-04-28)
**Sister project:** `anohana/` — same architecture (vanilla JS + Drive iframe player), different theme.

## What it is

Static SPA that streams Charlie's downloaded episodes of *Towa no Yuugure* (P.A. Works, 2025) by embedding Google Drive `/preview` iframes. Mirrors the anohana viewer one-for-one structurally, but reskinned around the show's "dusk" aesthetic — warm orange/amber/violet palette for the main 12-episode "Dusk · 2238" run, cool blue accents for the EP 00 "Pre-Fall · 2038" special.

## File structure

```
towa-no-yuugure/
├── index.html       ← app shell, Tailwind CDN config, all CSS inline
├── app.js           ← episode list, intro animation, player, embers, stars
├── manifest.json    ← PWA manifest (theme #0d0817, "Towa")
├── sw.js            ← cache-first SW, name "towa-v1"
├── favicon.png      ← PIL-generated dusk horizon icon (64×64)
├── icon-192.png     ← PWA icon (192×192)
└── icon-512.png     ← PWA icon (512×512)
```

No `cover.jpg` — the hero "poster" is rendered as a pure CSS dusk-card (gradient + radial sun + horizon glow + SVG stars).

## Where the videos live

Google Drive folder: `1EfMvMTbEFj_v_15MMYhV7ucBM3TAauWn`
- Owned by `charliecayno@gmail.com` (uploaded via the same OAuth refresh-token flow that `gemini-proxy/setup-drive-oauth.sh` set up for sns-dq).
- All 13 files (EP 00 + EP 01–12) shared as "anyone with link can view".
- File IDs hardcoded in `app.js` `EPISODES` array. To replace a file, upload a new one and patch the `fileId` field.

## Key design decisions

- **EP 00 = "Pre-Fall · 2038 · Special Episode"** — rendered as a distinct *blue-themed* card placed AFTER the main 12-episode list (originally at the top, moved to the bottom per Charlie's feedback). The blue palette mirrors the show's own visual language for Pre-Fall flashbacks vs. the warm Dusk-era present.
- **Main 12 episodes** — labeled "Dusk · 2238", warm orange + violet styling.
- **No floating Japanese drift text** — initially included, removed because `position:fixed` translateX animation triggered horizontal layout jitter on some browsers.
- **No horizontal motion in embers** — embers float straight up only. Spawning container `#embers` is `position:fixed; inset:0; overflow:hidden` to hard-clip any glow that would otherwise poke past the viewport.
- **`playEpisode` accepts `{ scroll: false }`** — used by the auto-resume init path (`localStorage.towa_last_ep`) so reload doesn't yank the viewport back to nav.
- **No cover image** — the `.dusk-card` poster is pure CSS (gradient + radial sun + 1px horizon line + 6 absolute-positioned `.star` divs). Side-stepped the issue of not having an actual key visual to pull from.
- **PWA icons generated via PIL** — see the inline Python in conversation history if regeneration is ever needed.

## Episode metadata

`EPISODES` is an array of `{ ep, title, fileId, dur, era, blurb }`. `era` is `"prefall"` for EP 00 and `"dusk"` for EP 01–12. `playEpisode(index)` is index-based (not ep-based), which matters because `currentEp` stores the array index — the prologue is index 0, EP 01 is index 1, etc.

## Storage

- `localStorage.towa_last_ep` — index of last-played episode (auto-resumes on page load, but doesn't scroll).

## Deployment

GitHub Pages at `https://chaelri.github.io/towa-no-yuugure/`. Push to `main` auto-deploys.

## Common edits

- **Replace an episode file:** upload new MP4 to the Drive folder, share, swap `fileId` in `app.js`.
- **Re-theme palette:** colors are centralized in the Tailwind config block in `index.html` under `dusk` and `prefall` namespaces.
- **Tweak intro timing:** `playIntro()` in `app.js` — staggered `setTimeout` calls.
