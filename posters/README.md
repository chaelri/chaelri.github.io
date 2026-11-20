# posters

Gallery of Charlie's poster work, served at chaelri.github.io/posters/. Test locally with `python3 -m http.server` from the repo root.

## Add a poster
1. Export HD PNGs (e.g. 2160x2700) to `posters/<slug>/full/<slug>-<take>-<colour>.png`.
2. Make thumbnails: `posters/<slug>/thumb/<same name>.jpg` (max 720x900, JPEG).
3. Add an entry to `posters.js` (title, event, date, note, items; set `final:true` on the chosen one).
4. Keep the editable source page in `posters/<slug>/source.html`.
5. Commit and push.

Design rules live in the `charlie-design` skill (section 16, posters).
