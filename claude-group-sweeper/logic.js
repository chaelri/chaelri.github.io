// Title format comes from Claude in Chrome 1.0.105: "Claude" or "Claude (MCP)",
// optionally prefixed with a status (hourglass = running, bell = needs
// permission, check = done). Custom session names never match, so they are left alone.
const TITLE = /^(⌛|🔔|✅)?️?\s*Claude( \(MCP\))?$/u;

export const DONE_AFTER_MIN = 5;
export const IDLE_AFTER_MIN = 60;
export const STUCK_AFTER_MIN = 360;

// force = toolbar click: skip the waits, but still never touch running or
// permission-waiting groups.
export function shouldSweep(title, ageMin, force = false) {
  const match = TITLE.exec(title || "");
  if (!match) return false;
  const status = match[1];
  if (status === "🔔") return false;
  if (status === "⌛") return !force && ageMin >= STUCK_AFTER_MIN;
  if (force) return true;
  return ageMin >= (status === "✅" ? DONE_AFTER_MIN : IDLE_AFTER_MIN);
}
