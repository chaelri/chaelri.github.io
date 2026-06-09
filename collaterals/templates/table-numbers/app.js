import { mountEditor } from "../../shared/template-editor.js";

// Table Numbers — placeholder. Real table-number design TBD. Each card sits on
// the table itself (e.g., a tented card or acrylic block), not on the mirror;
// the mirror layout lives in templates/mirror-chart/.
mountEditor({
  templateId: "table-numbers",
  title: "Table Numbers",
  subtitle: "5″ × 7″ portrait · 1500 × 2100 px @ 300 DPI · upload a Canva background and drop the number on top",
  canvas: { w: 1500, h: 2100 },
  defaultZone: {
    x: 250, y: 750, w: 1000, h: 600,
    fontFamily: "Playfair Display", fontSize: 480,
    weight: 700, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 4, lineHeight: 1.0,
  },
  batchMode: false,
  singleLabel: "Number / label — leave blank to export the Canva background as-is",
  singlePlaceholder: "1",
  exportPrefix: "Table Number",
  scale: 2,
});
