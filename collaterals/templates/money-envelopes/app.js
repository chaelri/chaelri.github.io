import { mountEditor } from "../../shared/template-editor.js";

mountEditor({
  templateId: "money-envelopes",
  title: "Money Envelopes",
  subtitle: "A4 landscape flat · Canva canvas: 3508 × 2480 px (300 DPI)",
  canvas: { w: 3508, h: 2480 },
  defaultZone: {
    x: 700, y: 1080, w: 2100, h: 320,
    fontFamily: "Dancing Script", fontSize: 180,
    weight: 700, italic: false, align: "center",
    color: "#2a2723", letterSpacing: 0, lineHeight: 1.15,
  },
  batchMode: true,
  batchLabel: "Recipient names (one per line) — leave empty for blank envelopes",
  batchPlaceholder: "Family Cruz\nNinong Pedro\nTita Maria\n…",
  exportPrefix: "Envelope",
  scale: 1,
});
