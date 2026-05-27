import { mountEditor } from "../../shared/template-editor.js";

// LED still — 16:9 HD = 1920 × 1080. If using a square LED panel, change to
// 3600 × 3600 here AND in your Canva canvas. The "video" version of this
// monogram is animated separately; this is the still backup / hold image.
mountEditor({
  templateId: "monogram",
  title: "Monogram (LED still)",
  subtitle: "16:9 HD · Canva canvas: 1920 × 1080 px",
  canvas: { w: 1920, h: 1080 },
  defaultZone: {
    x: 360, y: 900, w: 1200, h: 120,
    fontFamily: "Inter", fontSize: 60,
    weight: 500, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 8, lineHeight: 1,
  },
  batchMode: false,
  singleLabel: "Optional caption — leave blank to export the Canva monogram as-is",
  singlePlaceholder: "July 2, 2026 · Charlie & Karla",
  exportPrefix: "Monogram",
  scale: 1,
});
