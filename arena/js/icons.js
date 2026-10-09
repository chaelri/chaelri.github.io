// Weapon + item icons as inline SVG: the Mac HUD, the loot sprites in 3D, and the phones.
export const RARITY_COLOR = ["#b8c0cc", "#3fa9ff", "#b06bff", "#ffb703"];
export const RARITY_NAME = ["Common", "Rare", "Epic", "Legendary"];
export const NAME = {
  fists: "Kamao", arnis: "Arnis", tirador: "Tirador", ripple: "Ripple", boga: "Boga", paltik: "Paltik", bazooka: "Bazooka",
  buko: "Buko Juice", kalasag: "Kalasag", bomba: "Bomba", shoes: "Rubber Shoes",
};
const S = 'stroke="#1a1030" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
export const ICON = {
  fists: `<svg viewBox="0 0 64 64"><path d="M16 30c0-6 4-9 8-9h16c6 0 10 4 10 10v8c0 9-7 15-16 15h-4c-8 0-14-6-14-14z" fill="#ffcc99" ${S}/><path d="M24 21v10M32 21v10M40 22v9" ${S} fill="none"/></svg>`,
  arnis: `<svg viewBox="0 0 64 64"><rect x="29" y="4" width="8" height="56" rx="4" fill="#a0612b" ${S} transform="rotate(35 33 32)"/><rect x="29" y="40" width="8" height="12" fill="#e8312b" ${S} transform="rotate(35 33 32)"/></svg>`,
  tirador: `<svg viewBox="0 0 64 64"><path d="M32 60V34M32 34L16 12M32 34L48 12" fill="none" stroke="#7a4b2a" stroke-width="8" stroke-linecap="round"/><path d="M16 12C24 26 40 26 48 12" fill="none" stroke="#e8312b" stroke-width="3"/><circle cx="32" cy="22" r="4" fill="#666"/></svg>`,
  ripple: `<svg viewBox="0 0 64 64"><rect x="6" y="22" width="44" height="14" rx="3" fill="#3a3f4b" ${S}/><rect x="46" y="25" width="14" height="6" fill="#3a3f4b" ${S}/><rect x="20" y="34" width="9" height="20" rx="2" fill="#2fb24c" ${S}/><rect x="10" y="34" width="8" height="12" rx="2" fill="#3a3f4b" ${S}/></svg>`,
  boga: `<svg viewBox="0 0 64 64"><rect x="4" y="26" width="34" height="10" rx="3" fill="#7a4b2a" ${S}/><rect x="34" y="23" width="26" height="7" rx="2" fill="#555" ${S}/><rect x="34" y="31" width="22" height="6" rx="2" fill="#555" ${S}/><path d="M8 36l-4 14h10l4-14" fill="#7a4b2a" ${S}/></svg>`,
  paltik: `<svg viewBox="0 0 64 64"><rect x="2" y="28" width="60" height="7" rx="2" fill="#4b4f5c" ${S}/><rect x="20" y="18" width="18" height="8" rx="3" fill="#b06bff" ${S}/><path d="M6 35l-2 14h9l4-14" fill="#7a4b2a" ${S}/><circle cx="29" cy="22" r="2" fill="#fff"/></svg>`,
  bazooka: `<svg viewBox="0 0 64 64"><rect x="4" y="22" width="52" height="16" rx="6" fill="#4f7a2f" ${S}/><path d="M56 20h6v20h-6z" fill="#ffb703" ${S}/><rect x="22" y="38" width="8" height="12" fill="#4f7a2f" ${S}/><path d="M60 30h-8" stroke="#e8312b" stroke-width="5"/></svg>`,
  buko: `<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="22" fill="#5aa83c" ${S}/><ellipse cx="32" cy="24" rx="12" ry="5" fill="#fff6d6" ${S}/><path d="M38 8l-4 18" stroke="#ff5fa8" stroke-width="4" stroke-linecap="round"/></svg>`,
  kalasag: `<svg viewBox="0 0 64 64"><path d="M32 4l24 8v16c0 16-11 26-24 32C19 54 8 44 8 28V12z" fill="#3fa9ff" ${S}/><path d="M32 14l14 5v10c0 10-6 16-14 20" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/></svg>`,
  bomba: `<svg viewBox="0 0 64 64"><circle cx="30" cy="38" r="20" fill="#2b2d33" ${S}/><rect x="26" y="12" width="10" height="9" fill="#555" ${S}/><path d="M33 12c4-6 10-6 14-2" fill="none" stroke="#a0612b" stroke-width="3"/><circle cx="50" cy="9" r="5" fill="#ffb703"/><circle cx="23" cy="31" r="4" fill="#fff" opacity=".5"/></svg>`,
  shoes: `<svg viewBox="0 0 64 64"><path d="M6 40c0-10 6-20 14-20 4 8 10 10 18 12 12 2 20 6 20 12v4H6z" fill="#e8312b" ${S}/><rect x="6" y="46" width="52" height="8" rx="3" fill="#fff" ${S}/><path d="M24 30l6 3M28 26l6 3" stroke="#fff" stroke-width="3"/></svg>`,
  ghost: `<svg viewBox="0 0 64 64"><path d="M12 58V28a20 20 0 0 1 40 0v30l-7-6-6 6-7-6-6 6-7-6z" fill="#eef2ff" ${S}/><circle cx="25" cy="28" r="4" fill="#1a1030"/><circle cx="39" cy="28" r="4" fill="#1a1030"/></svg>`,
  star: `<svg viewBox="0 0 64 64"><path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z" fill="#ffd21f" ${S}/></svg>`,
};
