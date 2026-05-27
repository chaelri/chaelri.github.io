import { mountEditor } from "../../shared/template-editor.js";

mountEditor({
  templateId: "menu",
  title: "Menu",
  subtitle: "5″ × 7″ portrait · Canva canvas: 1500 × 2100 px (300 DPI)",
  canvas: { w: 1500, h: 2100 },
  defaultZone: {
    x: 200, y: 1850, w: 1100, h: 180,
    fontFamily: "Dancing Script", fontSize: 90,
    weight: 700, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 0, lineHeight: 1.15,
  },
  batchMode: false,
  singleLabel: "Variable text (couple name, table tag, etc.) — leave blank to export the background as-is",
  singlePlaceholder: "Charlie & Karla",
  exportPrefix: "Menu",
  scale: 1,
});
