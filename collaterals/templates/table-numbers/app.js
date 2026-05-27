import { mountEditor } from "../../shared/template-editor.js";

// Triangle prism — design ONE face in Canva at 3.5"×8" portrait
// (1050 × 2400 px @ 300 DPI). Print 3 copies per table, fold into prism.
// Or design the full 3-face unfolded sheet at 10.5"×8" (3150 × 2400 px).
// Default canvas here is the single-face shape so you batch by table number.
mountEditor({
  templateId: "table-numbers",
  title: "Table Numbers",
  subtitle: "Single prism face · 3.5″ × 8″ portrait · Canva canvas: 1050 × 2400 px",
  canvas: { w: 1050, h: 2400 },
  defaultZone: {
    x: 100, y: 900, w: 850, h: 600,
    fontFamily: "Playfair Display", fontSize: 480,
    weight: 700, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 0, lineHeight: 1,
  },
  batchMode: true,
  batchLabel: "Table numbers / names (one per line)",
  batchPlaceholder: "1\n2\n3\nHead Table\n…",
  exportPrefix: "Table",
  scale: 1,
});
