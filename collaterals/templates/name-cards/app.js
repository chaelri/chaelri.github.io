import { mountEditor } from "../../shared/template-editor.js";
import { fetchSeatingBatchText } from "../../shared/seating-source.js";

mountEditor({
  templateId: "name-cards",
  title: "Name Cards",
  subtitle: "3.5″ × 2″ landscape · Canva canvas: 1050 × 600 px (300 DPI)",
  canvas: { w: 1050, h: 600 },
  fonts: ["Sacramento", "Inter"],
  zones: [
    {
      id: "name", label: "Name (script)",
      x: 100, y: 170, w: 850, h: 200,
      fontFamily: "Sacramento", fontSize: 180,
      weight: 400, italic: false, align: "center",
      color: "#000000", letterSpacing: 0, lineHeight: 1,
    },
    {
      id: "subtitle", label: "Subtitle (table # / role)",
      x: 325, y: 410, w: 400, h: 70,
      fontFamily: "Inter", fontSize: 32,
      weight: 500, italic: false, align: "center",
      color: "#000000", letterSpacing: 6, lineHeight: 1,
    },
  ],
  batchMode: true,
  batchLabel: "Guest list — name | subtitle (subtitle optional)",
  batchPlaceholder: "Karla | TABLE 1\nCharlie | TABLE 1\nNinong Pedro | TABLE 5\nNinang Maria\n…",
  // Pulls live seating from the wedding invitation's Firebase (charlie-karla-wedding).
  // Edits stay in weddingtest/guestlistmanager/seating/ — this is read-only.
  batchImport: {
    label: "Pull from seating arranger",
    icon: "group",
    handler: fetchSeatingBatchText,
  },
  // Print version: A4 portrait at 300 DPI (2480×3508), 2×2 grid of tent-fold
  // cards with subtle cut indicators down the middle and across the centre.
  printLayout: {
    type: "a4-tent-4up",
    label: "Print version · A4 (4-up)",
  },
  exportPrefix: "Name Card",
});
