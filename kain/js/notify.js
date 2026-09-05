// Tells our Discord channel when one of us logs something.
//
// The webhook URL is NOT here, and must never be. This is a static site on
// GitHub Pages — anything the client holds is readable by anyone, and bots
// scrape public repos for Discord webhook URLs specifically. The proxy holds
// the URL in an env var (`KAIN_DISCORD_WEBHOOK`) and is the only thing that
// knows where the message goes; we just post a summary to it.

import { PROXY } from "./config.js";

/**
 * Fire-and-forget. A notification is a nicety — it must never delay a save or
 * surface an error while someone is logging a meal, so every failure is
 * swallowed on purpose.
 */
export function notifyEntry({ who, entry, totals }) {
  if (!who || !entry) return;

  const isMove = entry.kind === "exercise";
  const payload = {
    who,
    kind: isMove ? "exercise" : "meal",
    title: entry.title || "",
    brand: entry.brand || "",
    day: {
      kcal: totals?.kcal ?? 0,
      sugar_g: totals?.sugar_g ?? 0,
      sodium_mg: totals?.sodium_mg ?? 0,
      budget: totals?.budget || {},
    },
  };

  if (isMove) {
    payload.burn = entry.burn || 0;
    payload.minutes = entry.minutes || 0;
    payload.steps = entry.steps || 0;
  } else {
    payload.kcal = entry.kcal || 0;
    payload.sugar_g = entry.sugar_g || 0;
    payload.sodium_mg = entry.sodium_mg || 0;
    payload.items = (entry.items || []).slice(0, 8).map((i) => ({ name: i.name, qty: i.qty }));
    // The thumbnail rides along so the post shows the actual plate. It's the
    // same ~21 KB image already stored on the entry.
    if (typeof entry.thumb === "string" && entry.thumb.length < 600_000) {
      payload.thumb = entry.thumb;
    }
  }

  // keepalive so the request still goes out if the tab is closed right after.
  fetch(`${PROXY}/kain-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
