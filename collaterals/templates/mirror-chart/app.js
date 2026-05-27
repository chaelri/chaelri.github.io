import { mountEditor } from "../../shared/template-editor.js";

// 24"×60" mirror. 300 DPI = 7200 × 18000 (huge — most printers don't need that
// for vinyl). 100 DPI = 2400 × 6000, plenty sharp at viewing distance.
// Choose 100 DPI as the default and let Charlie design in Canva at the same
// size. If the printer demands 300 DPI he can bump to 7200 × 18000 in Canva
// Pro and update the canvas here too.
mountEditor({
  templateId: "mirror-chart",
  title: "Mirror Seating Chart",
  subtitle: "24″ × 60″ portrait · Canva canvas: 2400 × 6000 px (100 DPI)",
  canvas: { w: 2400, h: 6000 },
  defaultZone: {
    x: 200, y: 200, w: 2000, h: 400,
    fontFamily: "Playfair Display", fontSize: 240,
    weight: 700, italic: true, align: "center",
    color: "#2a2723", letterSpacing: 4, lineHeight: 1.1,
  },
  batchMode: false,
  singleLabel: "Optional title overlay — leave blank to export the Canva mirror as-is",
  singlePlaceholder: "Find Your Seat",
  exportPrefix: "Mirror Chart",
  scale: 1,
});
