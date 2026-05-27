import { mountEditor } from "../../shared/template-editor.js";

mountEditor({
  templateId: "invitation",
  title: "Invitation",
  subtitle: "5″ × 7″ portrait · Canva canvas: 1500 × 2100 px (300 DPI)",
  canvas: { w: 1500, h: 2100 },
  defaultZone: {
    x: 200, y: 900, w: 1100, h: 300,
    fontFamily: "Great Vibes", fontSize: 150,
    weight: 400, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 2, lineHeight: 1.1,
  },
  batchMode: false,
  singleLabel: "Variable text (couple names / RSVP code, etc.) — leave blank to export the background as-is",
  singlePlaceholder: "Charlie & Karla",
  exportPrefix: "Invitation",
  scale: 1,
});
