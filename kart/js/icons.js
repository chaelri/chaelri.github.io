// Item icons as inline SVG, shared by the board HUD and the phone.
export const ITEM_NAME = {
  boost: "Turbo", triple: "Triple Turbo", banana: "Saging", green: "Green Shell",
  red: "Red Shell", star: "Bituin", bolt: "Kidlat",
};

const turbo = (x = 0) => `<g transform="translate(${x} 0)">
  <path d="M32 6c-10 0-20 8-20 18h40C52 14 42 6 32 6z" fill="#e8312b" stroke="#3a0b07" stroke-width="3"/>
  <circle cx="24" cy="15" r="4" fill="#fff"/><circle cx="40" cy="15" r="4" fill="#fff"/><circle cx="32" cy="10" r="3" fill="#fff"/>
  <path d="M20 24h24v10a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6z" fill="#f6e3c3" stroke="#3a0b07" stroke-width="3"/>
  <rect x="26" y="27" width="3" height="6" rx="1.5" fill="#3a0b07"/><rect x="35" y="27" width="3" height="6" rx="1.5" fill="#3a0b07"/></g>`;

export const ICON = {
  boost: `<svg viewBox="0 0 64 48">${turbo()}</svg>`,
  triple: `<svg viewBox="-24 0 112 48">${turbo(-22)}${turbo(22)}${turbo()}</svg>`,
  banana: `<svg viewBox="0 0 64 64"><path d="M14 10c-4 20 6 40 34 44 6 1 8-3 4-5-20-6-28-20-28-38 0-4-8-6-10-1z" fill="#ffd21f" stroke="#5a3f00" stroke-width="3" stroke-linejoin="round"/><path d="M14 10l-2-6 6 1z" fill="#5a3f00"/><path d="M22 18c0 14 8 26 22 32" fill="none" stroke="#e6a800" stroke-width="3"/></svg>`,
  green: shell("#2fb24c", "#155c25"),
  red: shell("#e8312b", "#6b0d09"),
  star: `<svg viewBox="0 0 64 64"><path d="M32 4l8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 24l20-2z" fill="#ffd21f" stroke="#7a5200" stroke-width="3" stroke-linejoin="round"/><circle cx="26" cy="30" r="3" fill="#3a2a00"/><circle cx="38" cy="30" r="3" fill="#3a2a00"/></svg>`,
  bolt: `<svg viewBox="0 0 64 64"><path d="M38 4L12 36h16l-6 24 30-34H36z" fill="#ffe14a" stroke="#6b5200" stroke-width="3" stroke-linejoin="round"/></svg>`,
  coin: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffc928" stroke="#7a5200" stroke-width="4"/><rect x="27" y="17" width="10" height="30" rx="4" fill="#fff3b0" stroke="#7a5200" stroke-width="3"/></svg>`,
};

function shell(c, dark) {
  return `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="40" rx="26" ry="14" fill="#fff" stroke="${dark}" stroke-width="3"/>
  <path d="M8 38c0-16 11-28 24-28s24 12 24 28z" fill="${c}" stroke="${dark}" stroke-width="3"/>
  <path d="M32 10v28M18 18l6 20M46 18l-6 20M10 30h44" stroke="${dark}" stroke-width="2.5" fill="none" opacity=".7"/></svg>`;
}

export const ORDINAL = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
