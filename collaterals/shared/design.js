// Shared design tokens for the wedding collaterals studio.
// Kept as a tiny token reference — the per-template editor doesn't render
// inline floral artwork anymore (the Canva PNG IS the artwork), but these
// constants are still imported by other apps/docs and useful as defaults if
// a future template wants to fall back to programmatic decoration.

export const COUPLE = {
  first: "Charlie",
  second: "Karla",
  monogram: "C & K",
  monogramTight: "C&K",
  dateLong: "July 2, 2026",
  dateShort: "07.02.26",
  dateNumeric: "07-02-26",
  hashtag: "#CharliesGoldenKarla",
  venue: "",
};

export const PALETTE = {
  paper: "#faf9f6",
  ink: "#2a2723",
  inkSoft: "#5b5550",
  sage: "#7b8a5b",
  sageDeep: "#5e6b44",
  blush: "#d8a7a0",
  amber: "#e2b86c",
  lilac: "#a695c8",
  poppy: "#d96e57",
  leaf: "#6f8a55",
  border: "#e7e2da",
};

export const FONTS = {
  serif: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
  script: '"Dancing Script", "Pinyon Script", cursive',
  sans: '"Inter", system-ui, sans-serif',
};
