// Mirror Seating Chart — one printable card per table, mounted in a 3×5
// grid to the 24″ × 60″ ceremony mirror. 1-up A4 cut-out sheets.
//
// Concept (mirrors the seating arranger's floor-view "View Mode" aesthetic):
// each card shows a Sacramento script family-name headline (same font as
// name-cards), a thin sage rule, the circular table diagram (central disc +
// numbered seat circles around the perimeter — filled = solid black, empty =
// dashed grey), and a numbered guest list with em-dashes for empty seats.
// Plain white; the only print decoration is the cut indicators on the A4
// sheet. Mirror placement is done by hand after cutting — this template only
// generates the paper.
//
// Mirror dimensions Karla measured: 2 ft × 5 ft (24″ × 60″). Cards sized
// 5″ × 7″ portrait (1500 × 2100 px @ 300 DPI) — 3 cols × 5 rows on the mirror
// fills ~63% horizontally (15″ of card / 24″ wide) with comfortable gutters.
// Trade-off: only 1 card per A4 print sheet, so ~14 sheets to cut for the
// full set — worth it for legibility at viewing distance.
//
// Data flow: textarea (one block per table, blank line between) → parse →
// SVG render → PNG / PDF / Drive. Pulls live tables from the wedding
// invitation Firebase via shared/seating-source.js — edits stay in
// weddingtest/guestlistmanager/seating/.

import { fetchSeatingTablesText, fetchSeatingTablesDiffText } from "../../shared/seating-source.js";
import { svgToPngBlob, downloadPng } from "../../shared/export.js";
import { uploadPngBlob, sanitizeFilename, COLLATERALS_FOLDER_URL } from "../../shared/drive.js";
import { getTemplateData, setTemplateData, setStatus, getAllStatus } from "../../shared/state.js";
import { fbGet, fbSet, fbSubscribe } from "../../shared/firebase-sync.js";

const TEMPLATE_ID = "mirror-chart";
const CARD = { w: 1500, h: 2100 };                          // 5″ × 7″ @ 300 DPI
const A4 = { w: 2480, h: 3508 };                            // A4 portrait @ 300 DPI
const A4_GRID = {
  // 1-up: card centered on the sheet. Margins absorb the leftover space
  // around it; the dashed border around the card is the cut guide.
  cols: 1, rows: 1,
  marginX: Math.round((2480 - 1500) / 2),                   // = 490
  marginY: Math.round((3508 - 2100) / 2),                   // = 704
  gap: 0,
};
const TILES_PER_SHEET = A4_GRID.cols * A4_GRID.rows;
const EXAMPLE = `Romantico | VIP 1 | 10\nDitas Romantico\nVic Romantico\nFely Romantico\nRicky Romantico\n-\n-\n-\nMauro Mangubat\nHarlene Romantico\nThess Mangubat\n\nMangubat | VIP 2 | 10\n…`;

// === Parsing ==============================================================
//
// Block format (one per table, separated by blank lines):
//   Romantico | VIP 1 | 10        ← TITLE | SUBTITLE | CAPACITY (3rd field optional)
//   Ditas Romantico               ← seat 1
//   Vic Romantico                 ← seat 2
//   -                             ← empty seat (renders as dashed grey circle + em-dash)
//   …
//
// Title stays mixed-case for the Sacramento headline; renderer uppercases the
// numbered list separately. Empty seats: any line that's "-", "—", or pure dashes.

function parseTables(text) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      const [headerLine = "", ...seatLines] = lines;
      const parts = headerLine.split("|").map((s) => (s || "").trim());
      const title = parts[0] || "";
      const subtitle = parts[1] || "";
      let capacity = Number(parts[2] || "");
      if (!Number.isFinite(capacity) || capacity <= 0) {
        capacity = seatLines.length || 10;
      }
      const seats = [];
      for (let i = 0; i < capacity; i++) {
        const raw = seatLines[i] || "";
        const isEmpty = !raw || /^[-—]+$/.test(raw);
        seats.push(isEmpty ? null : raw);
      }
      return { title, subtitle, capacity, seats };
    });
}

// === Rendering ============================================================

function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Shape detection mirrors weddingtest/guestlistmanager/seating/floor.js
// shapeFor(): VIP head tables get a long vertical "rect-tall" with chairs on
// the long sides only; the kids table is a square (chairs around like a round
// table but the table itself is square); the couple's sweetheart table is a
// wide low rectangle with 2 chairs at the top; everything else is a round
// table with chairs evenly distributed around the perimeter.
function inferShape(table) {
  const t = (table.title || "").toLowerCase();
  if (t.includes("couple")) return "couple";
  if (t.includes("kids") || t.includes("kid's")) return "square";
  if (t.includes("vip") || (table.capacity || 0) >= 11) return "rect-tall";
  return "round";
}

// Display-format a guest name: strip honorifics, lift the surname to the
// front, and keep any trailing suffix. Mirrors the Sheets formula Charlie
// uses for the master guest list (without the sorting half — just the name
// reformat). Examples:
//   "Atty. Judith Zamora"  → "ZAMORA, JUDITH"
//   "Wilfredo Romantico"   → "ROMANTICO, WILFREDO"
//   "John Paul Cruz Jr."   → "CRUZ, JOHN PAUL JR."
//   "Daniel"               → "DANIEL"
const HONORIFICS_RE = /^(MR|MRS|MS|MISS|DR|ATTY|REV|PASTOR|SIR|LOLA|LOLO)\.?\s+/i;
const SUFFIX_RE = /\s+(JR\.?|SR\.?|II|III|IV|V)$/i;

// Surname particles that combine with the next word to form a compound
// surname. Common in Filipino names (Dela Cruz, De Los Santos, Del Rosario,
// San Juan, Sta. Maria, Sto. Tomas, De Guzman, De Leon, etc.) and a few
// Spanish/Portuguese/Dutch/German imports.
const SURNAME_PARTICLES = new Set([
  "DE", "DEL", "DELA", "DA", "DI", "DU", "DOS",
  "LA", "LOS", "LAS",
  "SAN", "STA", "STO", "SANTA", "SANTO",
  "VAN", "VON", "DER", "DEN",
]);
const stripTrailingDot = (w) => w.replace(/\.$/, "");

function formatGuestName(raw) {
  if (!raw) return "";
  let s = String(raw).trim().toUpperCase();
  s = s.replace(HONORIFICS_RE, "");
  let suffix = "";
  const suffixMatch = s.match(SUFFIX_RE);
  if (suffixMatch) {
    suffix = " " + suffixMatch[1].toUpperCase();
    s = s.slice(0, -suffixMatch[0].length).trimEnd();
  }
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return (s + suffix).trim();

  // Walk backward from the last word, absorbing any particle words into the
  // surname. Handles 2-word ("Dela Cruz"), 3-word ("De Los Santos"), and the
  // trailing-period variants ("Sta. Maria") by stripping the dot before the
  // particle check.
  let surnameStart = words.length - 1;
  while (surnameStart > 0 && SURNAME_PARTICLES.has(stripTrailingDot(words[surnameStart - 1]))) {
    surnameStart--;
  }
  // If everything ended up classified as particles (input was just the
  // compound surname with no given name), return the raw string unsplit.
  if (surnameStart === 0) return (s + suffix).trim();

  const surname = words.slice(surnameStart).join(" ");
  const first = words.slice(0, surnameStart).join(" ");
  return `${surname}, ${first}${suffix}`;
}

// Map a table's title to its mini-floor-plan key. Returns null when nothing
// in the title matches a known shape (e.g., guest typed a custom block name).
function miniMapHighlightId(table) {
  const t = (table.title || "").toLowerCase().trim();
  if (t.includes("couple")) return "couple";
  if (t.includes("kids") || t.includes("kid's")) return "kids";
  const vip = t.match(/vip\s*(\d+)/);
  if (vip) return `vip${vip[1]}`;
  const tbl = t.match(/table\s*(\d+)/);
  if (tbl) return `table-${tbl[1]}`;
  return null;
}

// Schematic "you are here" floor plan, drawn in the lower-right of each card.
// Column layout per Charlie's spec — aisle splits VIP 1 (left of aisle) from
// VIP 2 (right of aisle). Four columns of regular tables:
//   col 1 (left of VIP 1):  T1 T2 T3
//   col 2 (behind VIP 1):   T4 T5 T6
//   col 3 (behind VIP 2):   T7 T8 T9
//   col 4 (right of VIP 2): Kids (top row) / T10 T11
function miniFloorPlanSVG(highlightId, { x, y, width = 520, height = 700 } = {}) {
  const W = width, H = height;
  // Sizes (font, stroke, circle radii) scale with width to keep horizontal
  // proportions clean. Header positions (stage, couple, VIPs, Kids) use the
  // original 380-baseline offsets × s. Regular-table rows are distributed in
  // whatever vertical space is left between the VIP row bottom and the
  // ENTRANCE label — so making the box portrait gives the tables breathing
  // room without distorting headers.
  const s = W / 380;
  const px = (v) => v * s;
  const HL_FILL = "#7b8a5b";
  const HL_STROKE = "#5e6b44";
  const DIM_STROKE = "#c5c0b8";
  const TXT_DIM = "#8a847e";
  const fill = (id) => (id === highlightId ? HL_FILL : "#ffffff");
  const stroke = (id) => (id === highlightId ? HL_STROKE : DIM_STROKE);
  const strokeW = (id) => (id === highlightId ? 3 * s : 1.8 * s);
  const txtFill = (id) => (id === highlightId ? "#ffffff" : TXT_DIM);

  const cx = x + W / 2;
  const parts = [];

  // Outer frame — square corners
  parts.push(`<rect x="${x}" y="${y}" width="${W}" height="${H}"
                    fill="#fafaf6" stroke="#e7e2da" stroke-width="${2 * s}"/>`);

  // Stage strip
  parts.push(`<rect x="${x + px(30)}" y="${y + px(22)}" width="${W - px(60)}" height="${px(14)}" rx="${px(6)}" ry="${px(6)}"
                    fill="#f3eedf" stroke="#d8d2c8" stroke-width="${s}"/>`);
  parts.push(`<text x="${cx}" y="${y + px(54)}" text-anchor="middle"
                    font-family="Inter, sans-serif" font-size="${px(14)}" font-weight="600"
                    letter-spacing="${1.4 * s}" fill="#a09a90">↑ STAGE</text>`);

  // Couple sweetheart pill — centered, sits above the VIP row in the aisle
  parts.push(`<rect x="${cx - px(40)}" y="${y + px(70)}" width="${px(80)}" height="${px(17)}" rx="${px(9)}" ry="${px(9)}"
                    fill="${fill("couple")}" stroke="${stroke("couple")}" stroke-width="${strokeW("couple")}"/>`);

  // VIP 1 (col 2), VIP 2 (col 3), Kids (col 4). Aisle is the gap between col 2 and col 3.
  parts.push(`<rect x="${x + px(112)}" y="${y + px(100)}" width="${px(36)}" height="${px(92)}" rx="${px(5)}" ry="${px(5)}"
                    fill="${fill("vip1")}" stroke="${stroke("vip1")}" stroke-width="${strokeW("vip1")}"/>`);
  parts.push(`<rect x="${x + px(232)}" y="${y + px(100)}" width="${px(36)}" height="${px(92)}" rx="${px(5)}" ry="${px(5)}"
                    fill="${fill("vip2")}" stroke="${stroke("vip2")}" stroke-width="${strokeW("vip2")}"/>`);
  parts.push(`<rect x="${x + px(313)}" y="${y + px(129)}" width="${px(34)}" height="${px(34)}" rx="${px(5)}" ry="${px(5)}"
                    fill="${fill("kids")}" stroke="${stroke("kids")}" stroke-width="${strokeW("kids")}"/>`);

  // Regular tables. T1 (col 1) sits alongside VIP 1 at the same y as Kids,
  // mirroring the right-side Kids→T10→T11 column structure on the left as
  // T1→T2→T3. The remaining sub-tables (T2-T11 minus T1) live in 3 rows
  // below the VIP rects.
  const tableR = px(18);
  const placeTable = (num, tx, ty) => {
    const id = `table-${num}`;
    parts.push(`<circle cx="${tx}" cy="${ty}" r="${tableR}"
                        fill="${fill(id)}" stroke="${stroke(id)}" stroke-width="${strokeW(id)}"/>`);
    parts.push(`<text x="${tx}" y="${ty + px(6)}" text-anchor="middle"
                      font-family="Inter, sans-serif" font-size="${px(17)}" font-weight="700"
                      fill="${txtFill(id)}">${num}</text>`);
  };

  // T1 alongside VIP 1 — same vertical center as Kids square (the Kids square
  // top is at px(129), height px(34), so its center y is px(146)).
  placeTable(1, x + px(50), y + px(146));

  // Sub-tables below VIPs in 3 rows, vertically CENTERED in the gap between
  // VIP-bottom and the ENTRANCE label. Fixed row spacing keeps tables close
  // together; the centering gives symmetric breathing room above and below.
  const vipBotRel = px(100 + 92);                       // VIP rect bottom edge, mini-map coords
  const entranceLabelTopRel = H - px(16) - px(14) * 0.7; // approx top of "↓ ENTRANCE" glyphs
  const subBlockCenterRel = (vipBotRel + entranceLabelTopRel) / 2;
  const subRowSpacing = px(70);
  const subRowYs = [
    subBlockCenterRel - subRowSpacing,
    subBlockCenterRel,
    subBlockCenterRel + subRowSpacing,
  ];

  // Col 1 has only T2, T3 (T1 placed above). Col 4 has T10, T11 (Kids placed
  // above as the square). Col 2 / 3 keep all three sub-rows.
  const cols = [
    { cxOff: 50,  tables: [2, 3] },
    { cxOff: 130, tables: [4, 5, 6] },
    { cxOff: 250, tables: [7, 8, 9] },
    { cxOff: 330, tables: [10, 11] },
  ];
  for (const col of cols) {
    for (let r = 0; r < col.tables.length; r++) {
      placeTable(col.tables[r], x + px(col.cxOff), y + subRowYs[r]);
    }
  }

  // Entrance marker
  parts.push(`<text x="${cx}" y="${y + H - px(16)}" text-anchor="middle"
                    font-family="Inter, sans-serif" font-size="${px(14)}" font-weight="600"
                    letter-spacing="${1.4 * s}" fill="#a09a90">↓ ENTRANCE</text>`);

  return parts.join("");
}

// Reusable seat-circle renderer. Filled = solid black outline + black number;
// empty = dashed grey + grey number (matches the floor view's empty-seat look).
function seatSVG(sx, sy, filled, seatR, label) {
  const stroke = filled ? "#2a2723" : "#cccccc";
  const dash = filled ? "" : ` stroke-dasharray="6 6"`;
  const numColor = filled ? "#2a2723" : "#cccccc";
  return `<circle cx="${sx}" cy="${sy}" r="${seatR}"
                  fill="#ffffff" stroke="${stroke}" stroke-width="3"${dash}/>
          <text x="${sx}" y="${sy + 10}" text-anchor="middle"
                font-family="Inter, sans-serif" font-size="30" font-weight="600"
                fill="${numColor}">${label}</text>`;
}

// Single card at the given origin. Stack: Sacramento positional headline →
// shape-appropriate seating diagram → numbered list with em-dashes for empty
// seats. Mirrors the seating arranger's floor-view aesthetic.
function cardLayers(table, { x = 0, y = 0 } = {}) {
  const w = CARD.w, h = CARD.h;
  const cx = x + w / 2;                  // card center (used for title only)
  const dcx = x + 1080;                  // diagram center x — lower-RIGHT, in cream band
  const title = table.title || "";
  const subtitle = table.subtitle || "";
  const seats = table.seats || [];
  const capacity = table.capacity || seats.length || 10;
  const filledCount = seats.filter((s) => s != null).length;

  // Vertical layout — names live in the top (white) half; diagram + mini-map
  // share the cream band starting at y=1200.
  const titleBaselineY = 280;
  const diagramCy      = 1650;          // center of cream band (1200-2100 → mid 1650)
  const listTopY       = 400;
  const bottomPad      = 920;

  // === Title (Sacramento) ===
  // Same script font as name-cards. Mixed-case looks natural for cursive.
  const titleSVG = title ? `
    <text x="${cx}" y="${y + titleBaselineY}" text-anchor="middle"
          font-family="Sacramento, cursive" font-size="240" font-weight="400"
          fill="#2a2723">${escapeXML(title)}</text>` : "";

  // === Diagram ===
  // Shape-specific: round table, square (Kids), rect-tall (VIP head table),
  // couple (sweetheart). Seat ordering matches floor.js — seat 1 starts at
  // the top (round/square) or top-right (rect-tall) or top-left (couple).
  const shape = inferShape(table);
  const seatR = 40;
  const gap = 8;                        // breathing room between seat and table
  const dcy = y + diagramCy;
  const diagramParts = [];

  // Center label inside the table footprint — uses the Sacramento title in
  // uppercase Inter (e.g., "TABLE 10" / "VIP 1"). Capacity X/Y is dropped per
  // Charlie's request — the seat circles themselves already show fill state.
  const centerLabelText = title.toUpperCase();
  const drawCenterText = (cx_, cy_) => {
    if (!centerLabelText) return;
    diagramParts.push(`<text x="${cx_}" y="${cy_ + 14}" text-anchor="middle"
                              font-family="Inter, sans-serif" font-size="52" font-weight="700"
                              fill="#2a2723">${escapeXML(centerLabelText)}</text>`);
  };

  if (shape === "round") {
    const tableSide = 500;
    const orbitR = tableSide / 2 + seatR + gap;
    diagramParts.push(`<circle cx="${dcx}" cy="${dcy}" r="${tableSide / 2}"
                                fill="#ffffff" stroke="#bdbdbd" stroke-width="3"/>`);
    drawCenterText(dcx, dcy);
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * 2 * Math.PI - Math.PI / 2;
      const sx = dcx + orbitR * Math.cos(angle);
      const sy = dcy + orbitR * Math.sin(angle);
      diagramParts.push(seatSVG(sx, sy, seats[i] != null, seatR, i + 1));
    }
  } else if (shape === "square") {
    // Kids square table — seats distributed evenly along the PERIMETER (not
    // a circular orbit), so seats 1 & 6 sit flush with the top & bottom
    // edge centers, and seats 3/4 & 8/9 sit flush with the right & left edges.
    const tableSide = 500;
    const halfSide = tableSide / 2;
    const side = 2 * halfSide;
    const offset = seatR + gap;
    const perimeter = 4 * side;
    const spacing = perimeter / capacity;
    diagramParts.push(`<rect x="${dcx - halfSide}" y="${dcy - halfSide}"
                              width="${tableSide}" height="${tableSide}" rx="30" ry="30"
                              fill="#ffffff" stroke="#bdbdbd" stroke-width="3"/>`);
    drawCenterText(dcx, dcy);
    // Walk clockwise from the top-center. Each seat sits perpendicular to
    // whichever edge its perimeter position falls on. Segment boundaries:
    //   [0, halfSide)            → first half of top edge (centre → TR)
    //   [halfSide, +side)        → right edge (TR → BR)
    //   [+side, +2 side)         → bottom edge (BR → BL)
    //   [+2 side, +3 side)       → left edge (BL → TL)
    //   [+3 side, perimeter)     → second half of top edge (TL → centre)
    for (let i = 0; i < capacity; i++) {
      const d = i * spacing;
      let sx, sy;
      if (d < halfSide) {
        sx = dcx + d;
        sy = dcy - halfSide - offset;
      } else if (d < halfSide + side) {
        sx = dcx + halfSide + offset;
        sy = dcy - halfSide + (d - halfSide);
      } else if (d < halfSide + 2 * side) {
        sx = dcx + halfSide - (d - halfSide - side);
        sy = dcy + halfSide + offset;
      } else if (d < halfSide + 3 * side) {
        sx = dcx - halfSide - offset;
        sy = dcy + halfSide - (d - halfSide - 2 * side);
      } else {
        sx = dcx - halfSide + (d - halfSide - 3 * side);
        sy = dcy - halfSide - offset;
      }
      diagramParts.push(seatSVG(sx, sy, seats[i] != null, seatR, i + 1));
    }
  } else if (shape === "rect-tall") {
    // VIP head table — tall narrow rectangle, seats on left & right long
    // sides only. Floor.js: seat 1 = top-right; right top→bottom (1..N/2);
    // then left bottom→top (N/2+1..N). Numbers flow clockwise around the rect.
    const tw = 280, th = 620;            // shorter than before to fit the cream band with breathing room
    const left = dcx - tw / 2, right = dcx + tw / 2;
    const top = dcy - th / 2;
    diagramParts.push(`<rect x="${left}" y="${top}" width="${tw}" height="${th}" rx="24" ry="24"
                              fill="#ffffff" stroke="#bdbdbd" stroke-width="3"/>`);
    drawCenterText(dcx, dcy);
    const seatX = seatR + gap;          // seat center, this far outside the rect edge
    const rightCount = Math.ceil(capacity / 2);
    const leftCount = capacity - rightCount;
    for (let i = 0; i < rightCount; i++) {
      const sy = top + ((i + 1) / (rightCount + 1)) * th;
      const sx = right + seatX;
      diagramParts.push(seatSVG(sx, sy, seats[i] != null, seatR, i + 1));
    }
    for (let i = 0; i < leftCount; i++) {
      const sy = top + ((leftCount - i) / (leftCount + 1)) * th;
      const sx = left - seatX;
      const seatIdx = rightCount + i;
      diagramParts.push(seatSVG(sx, sy, seats[seatIdx] != null, seatR, seatIdx + 1));
    }
  } else {
    // Couple sweetheart — this is a BENCH/SEAT (where Charlie + Karla sit
    // together), not a table with chairs around it. So the two numbered
    // markers sit INSIDE the rectangle, centered vertically. No internal
    // label — the Sacramento headline above already says "Couple". Narrower
    // (500 vs 670) so it fits inside the right-side diagram column.
    const tw = 500, th = 170;
    const left = dcx - tw / 2;
    const top = dcy - th / 2;
    diagramParts.push(`<rect x="${left}" y="${top}" width="${tw}" height="${th}" rx="20" ry="20"
                              fill="#ffffff" stroke="#bdbdbd" stroke-width="3"/>`);
    const sx1 = left + tw * 0.28;
    const sx2 = left + tw * 0.72;
    diagramParts.push(seatSVG(sx1, dcy, seats[0] != null, seatR, 1));
    diagramParts.push(seatSVG(sx2, dcy, seats[1] != null, seatR, 2));
  }
  const diagram = diagramParts.join("");

  // === Numbered list ===
  // Auto-shrink when capacity * row-height would overflow the bottom band.
  // Typical wedding tables (8–10 seats) clear this without shrinking.
  const availH = h - listTopY - bottomPad;
  const baseRowH = 72;
  const baseFontSize = 42;
  const slots = Math.max(seats.length, capacity);
  let rowH = baseRowH;
  let fontSize = baseFontSize;
  const desiredH = slots * baseRowH;
  if (desiredH > availH && desiredH > 0) {
    const k = availH / desiredH;
    rowH = baseRowH * k;
    fontSize = baseFontSize * k;
  }
  const numColRight = x + 450;          // list block sits ~30-35% from card left
  const nameColLeft = x + 500;
  const rows = [];
  for (let i = 0; i < slots; i++) {
    const ry = y + listTopY + i * rowH + fontSize * 0.78;
    const name = seats[i];
    const filled = name != null;
    const fillColor = filled ? "#2a2723" : "#bdbdbd";
    rows.push(`
      <text x="${numColRight}" y="${ry}" text-anchor="end"
            font-family="Inter, sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="700"
            fill="${fillColor}">${i + 1}.</text>
      <text x="${nameColLeft}" y="${ry}" text-anchor="start"
            font-family="Inter, sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="600"
            fill="${fillColor}" letter-spacing="0.5">${escapeXML(filled ? formatGuestName(name) : "—")}</text>
    `);
  }

  // Mini "you are here" floor-plan, lower-LEFT of the cream band. Portrait
  // (520 × 700) matches the actual reception floor's vertical orientation
  // and spreads the table circles out more vertically.
  const miniMap = miniFloorPlanSVG(miniMapHighlightId(table), {
    x: x + 80, y: y + 1300,
    width: 520, height: 700,
  });

  // Cream band visually separates the names (white, top) from the table
  // positions (cream, bottom). Painted BEFORE the diagram + mini-map so they
  // render on top of it.
  const creamBand = `<rect x="${x}" y="${y + 1200}" width="${w}" height="${h - 1200}" fill="#f3eedf"/>`;

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>
    ${creamBand}
    ${titleSVG}
    ${rows.join("")}
    ${diagram}
    ${miniMap}
  `;
}

function renderCardSVG(table) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.w} ${CARD.h}"
         width="${CARD.w}" height="${CARD.h}"
         style="max-width:100%;height:auto;display:block">
      ${cardLayers(table, { x: 0, y: 0 })}
    </svg>`;
}

function renderSheetSVG(tablesOnSheet) {
  const { w: sw, h: sh } = A4;
  const { cols, rows, marginX, marginY, gap } = A4_GRID;
  const cards = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const t = tablesOnSheet[idx];
      if (!t) continue;
      const x = marginX + c * (CARD.w + gap);
      const y = marginY + r * (CARD.h + gap);
      cards.push(cardLayers(t, { x, y }));
      cards.push(`
        <rect x="${x}" y="${y}" width="${CARD.w}" height="${CARD.h}"
              fill="none" stroke="#8c8c8c" stroke-width="2.4"
              stroke-dasharray="36 16" opacity="0.55"/>
      `);
    }
  }
  // Sheet-spanning red cut indicators between cards (matches the name-cards
  // sheet for visual consistency — red = "slice the sheet here"). Only drawn
  // for multi-up sheets; 1-up uses the per-card dashed border as the cut guide.
  if (cols > 1 || rows > 1) {
    const vCut = marginX + CARD.w + gap / 2;
    const hCut = marginY + CARD.h + gap / 2;
    cards.push(`
      <line x1="0" y1="${hCut}" x2="${sw}" y2="${hCut}"
            stroke="#d32f2f" stroke-width="2.8" stroke-dasharray="40 18" opacity="0.7"/>
      <line x1="${vCut}" y1="0" x2="${vCut}" y2="${sh}"
            stroke="#d32f2f" stroke-width="2.8" stroke-dasharray="40 18" opacity="0.7"/>
    `);
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}"
         width="${sw}" height="${sh}"
         style="max-width:100%;height:auto;display:block">
      <rect x="0" y="0" width="${sw}" height="${sh}" fill="#ffffff"/>
      ${cards.join("")}
    </svg>`;
}

// === Toast ===============================================================

function showToast(msg, kind = "ok", ms = 2400) {
  const el = document.getElementById("toast");
  const m = document.getElementById("toast-msg");
  if (!el || !m) { console.log("[toast]", msg); return; }
  m.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.className = "toast"), ms);
}

// === Mount ===============================================================

async function mount() {
  const root = document.getElementById("editor-root");
  if (!root) throw new Error("mirror-chart: #editor-root missing");

  // Hydrate state — local first (instant), then merge in latest Firebase snapshot.
  let stateBatch = String((getTemplateData(TEMPLATE_ID) || {}).batch || "");
  let previewIdx = Number((getTemplateData(TEMPLATE_ID) || {}).previewIdx) || 0;
  let printMode = false;
  try {
    const remote = await fbGet(TEMPLATE_ID);
    if (remote && typeof remote === "object") {
      if (typeof remote.batch === "string") stateBatch = remote.batch;
      if (Number.isFinite(remote.previewIdx)) previewIdx = remote.previewIdx;
      setTemplateData(TEMPLATE_ID, { batch: stateBatch, previewIdx });
    }
  } catch (e) { console.warn("fb hydrate failed", e); }

  root.innerHTML = `
    <div class="editor-header">
      <div class="title-block">
        <h1>Mirror Seating Chart</h1>
        <p>Card per table · 5″ × 7″ portrait · A4 sheet (1 card per page) · mirror layout 2 × 5 ft</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="font-size:0.74rem;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.06em">Status</label>
        <select id="status-select" class="status-select">
          <option value="pending">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="ready">Ready to print</option>
          <option value="printed">Printed</option>
        </select>
      </div>
    </div>
    <div class="editor-grid editor-compact">
      <div>
        <div class="field-block">
          <h3>Tables</h3>
          <p class="field-hint">One block per table — blank line between blocks. First line is <code>TITLE | SUBTITLE | CAPACITY</code>. Following lines: one per seat in order — use <code>-</code> for empty seats (renders as dashed grey circle + em-dash, matching the seating arranger's floor view).</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            <button type="button" id="ed-import" class="btn btn-ghost" style="font-size:0.72rem;padding:5px 9px">
              <span class="material-symbols-outlined" style="font-size:14px">group</span>
              Pull from seating arranger
            </button>
            <button type="button" id="ed-import-diff" class="btn btn-ghost" style="font-size:0.72rem;padding:5px 9px">
              <span class="material-symbols-outlined" style="font-size:14px">difference</span>
              Pull only new / reseated
            </button>
          </div>
          <textarea id="ed-batch" rows="14" placeholder="${escapeXML(EXAMPLE)}"></textarea>
          <div class="batch-nav">
            <button type="button" id="ed-prev" class="btn btn-ghost">‹</button>
            <span id="ed-counter">— of —</span>
            <button type="button" id="ed-next" class="btn btn-ghost">›</button>
          </div>
        </div>
        <div class="field-block actions">
          <button type="button" id="ed-dl" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download current
          </button>
          <button type="button" id="ed-up" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload current to Drive
          </button>
          <button type="button" id="ed-dl-all" class="btn btn-ghost">
            <span class="material-symbols-outlined">download</span>
            Download all (per-card PNGs)
          </button>
          <button type="button" id="ed-pdf-all" class="btn btn-ghost">
            <span class="material-symbols-outlined">picture_as_pdf</span>
            Download A4 PDF
          </button>
          <button type="button" id="ed-up-all" class="btn btn-primary">
            <span class="material-symbols-outlined">cloud_upload</span>
            Upload all to Drive
          </button>
          <a href="${COLLATERALS_FOLDER_URL}" target="_blank" rel="noopener" class="btn-link" style="font-size:0.74rem;text-align:center;margin-top:2px">Open Drive folder ↗</a>
        </div>
      </div>
      <div class="preview-pane">
        <div class="preview-toolbar">
          <span class="label" id="ed-preview-label">Preview · card ${CARD.w} × ${CARD.h}</span>
          <label class="toggle"><input id="ed-print-mode" type="checkbox"/> A4 sheet</label>
        </div>
        <div id="ed-stage" class="preview-stage" style="min-height:420px;width:100%"></div>
      </div>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  const statusSel  = $("status-select");
  const batchTA    = $("ed-batch");
  const prevBtn    = $("ed-prev");
  const nextBtn    = $("ed-next");
  const counter    = $("ed-counter");
  const dlBtn      = $("ed-dl");
  const upBtn      = $("ed-up");
  const dlAllBtn   = $("ed-dl-all");
  const pdfAllBtn  = $("ed-pdf-all");
  const upAllBtn   = $("ed-up-all");
  const importBtn  = $("ed-import");
  const importDiffBtn = $("ed-import-diff");
  const printCk    = $("ed-print-mode");
  const previewLbl = $("ed-preview-label");
  const stage      = $("ed-stage");

  batchTA.value = stateBatch;
  statusSel.value = getAllStatus()[TEMPLATE_ID] || "pending";
  statusSel.addEventListener("change", () => {
    setStatus(TEMPLATE_ID, statusSel.value);
    showToast(`Marked as ${statusSel.options[statusSel.selectedIndex].text}`);
  });

  const tables = () => parseTables(stateBatch);
  const sheetCount = () => {
    const n = tables().length;
    return n ? Math.ceil(n / TILES_PER_SHEET) : 0;
  };
  const currentSheetIdx = () => Math.floor(previewIdx / TILES_PER_SHEET);
  const tablesForSheet = (s) => {
    const arr = tables();
    const start = s * TILES_PER_SHEET;
    return arr.slice(start, start + TILES_PER_SHEET);
  };
  const clampIdx = () => {
    const n = tables().length;
    if (!n) { previewIdx = 0; return; }
    if (previewIdx >= n) previewIdx = n - 1;
    if (previewIdx < 0) previewIdx = 0;
  };

  function updateCounter() {
    const arr = tables();
    if (!arr.length) { counter.textContent = "— of —"; return; }
    if (printMode) {
      const total = sheetCount();
      const s = currentSheetIdx();
      const first = s * TILES_PER_SHEET + 1;
      const last = Math.min(first + TILES_PER_SHEET - 1, arr.length);
      counter.textContent = `Sheet ${s + 1} of ${total} · ${first}–${last}`;
    } else {
      counter.textContent = `${previewIdx + 1} of ${arr.length}`;
    }
  }
  function syncLabel() {
    previewLbl.textContent = printMode
      ? `Preview · A4 ${A4.w} × ${A4.h}`
      : `Preview · card ${CARD.w} × ${CARD.h}`;
  }
  function render() {
    clampIdx();
    if (printMode) {
      stage.innerHTML = renderSheetSVG(tablesForSheet(currentSheetIdx()));
    } else {
      const t = tables()[previewIdx] || { title: "", subtitle: "", guests: [] };
      stage.innerHTML = renderCardSVG(t);
    }
    updateCounter();
    syncLabel();
  }

  function persist() {
    const snap = { batch: stateBatch, previewIdx };
    setTemplateData(TEMPLATE_ID, snap);
    fbSet(TEMPLATE_ID, snap);
  }

  batchTA.addEventListener("input", () => {
    stateBatch = batchTA.value;
    previewIdx = 0;
    persist();
    render();
  });

  prevBtn.addEventListener("click", () => {
    const arr = tables();
    if (!arr.length) return;
    if (printMode) {
      const total = sheetCount();
      const s = (currentSheetIdx() - 1 + total) % total;
      previewIdx = s * TILES_PER_SHEET;
    } else {
      previewIdx = (previewIdx - 1 + arr.length) % arr.length;
    }
    persist();
    render();
  });
  nextBtn.addEventListener("click", () => {
    const arr = tables();
    if (!arr.length) return;
    if (printMode) {
      const total = sheetCount();
      const s = (currentSheetIdx() + 1) % total;
      previewIdx = s * TILES_PER_SHEET;
    } else {
      previewIdx = (previewIdx + 1) % arr.length;
    }
    persist();
    render();
  });

  printCk.addEventListener("change", () => {
    printMode = printCk.checked;
    render();
  });

  // Shared pull handler — used by both "full pull" and "diff pull" buttons.
  // Handlers may return either a plain string (the new textarea content) or
  // an object `{ text, message }`. When text is null/undefined, the textarea
  // is left alone and the message is surfaced via toast (used by the diff
  // pull when nothing changed since the last sync).
  async function runPull(btn, handler) {
    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">hourglass_top</span> Loading…`;
    try {
      const result = await handler(stateBatch);
      const text = typeof result === "string" ? result : result?.text;
      const message = (result && typeof result === "object") ? result.message : null;
      if (message && text == null) {
        showToast(message);
      } else if (text != null) {
        stateBatch = text;
        batchTA.value = text;
        previewIdx = 0;
        persist();
        render();
        const n = tables().length;
        showToast(message || `Imported ${n} ${n === 1 ? "table" : "tables"}`);
      }
    } catch (e) {
      console.error(e);
      showToast(e?.message || "Import failed", "err", 4000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  }

  importBtn.addEventListener("click", () => runPull(importBtn, fetchSeatingTablesText));
  importDiffBtn.addEventListener("click", () => runPull(importDiffBtn, fetchSeatingTablesDiffText));

  // Export helpers — re-render into a detached SVG element so we don't ship
  // the preview's inline style attribute (which would scale the export).
  const detachedSvg = (html) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    return wrap.querySelector("svg");
  };
  const cardSvgFor   = (t)    => detachedSvg(renderCardSVG(t));
  const sheetSvgFor  = (arr)  => detachedSvg(renderSheetSVG(arr));
  const tableSlug    = (t)    => sanitizeFilename(
    [t.title, t.subtitle].filter(Boolean).join(" - ") || "table"
  ).slice(0, 80);

  dlBtn.addEventListener("click", async () => {
    try {
      if (printMode) {
        const s = currentSheetIdx();
        await downloadPng(sheetSvgFor(tablesForSheet(s)), `Mirror Cards — sheet ${s + 1}.png`, { scale: 1 });
      } else {
        const t = tables()[previewIdx];
        if (!t) { showToast("List is empty", "err"); return; }
        await downloadPng(cardSvgFor(t), `Mirror Card — ${tableSlug(t)}.png`, { scale: 2 });
      }
      showToast("Downloaded");
    } catch (e) { console.error(e); showToast("Download failed", "err"); }
  });

  upBtn.addEventListener("click", async () => {
    try {
      showToast("Uploading…");
      let blob, filename;
      if (printMode) {
        const s = currentSheetIdx();
        blob = await svgToPngBlob(sheetSvgFor(tablesForSheet(s)), { scale: 1 });
        filename = `Mirror Cards — sheet ${s + 1}.png`;
      } else {
        const t = tables()[previewIdx];
        if (!t) { showToast("List is empty", "err"); return; }
        blob = await svgToPngBlob(cardSvgFor(t), { scale: 2 });
        filename = `Mirror Card — ${tableSlug(t)}.png`;
      }
      const j = await uploadPngBlob(blob, filename);
      try { await navigator.clipboard.writeText(j.link); } catch {}
      showToast("Uploaded · link copied");
      window.open(j.link, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Upload failed", "err", 4000); }
  });

  dlAllBtn.addEventListener("click", async () => {
    const arr = tables();
    if (!arr.length) { showToast("List is empty", "err"); return; }
    try {
      for (let i = 0; i < arr.length; i++) {
        showToast(`Downloading ${i + 1}/${arr.length}…`);
        await downloadPng(cardSvgFor(arr[i]), `Mirror Card — ${tableSlug(arr[i])}.png`, { scale: 2 });
        await new Promise((r) => setTimeout(r, 120));
      }
      showToast(`Downloaded ${arr.length} ${arr.length === 1 ? "PNG" : "PNGs"}`);
    } catch (e) { console.error(e); showToast("Batch download failed", "err"); }
  });

  pdfAllBtn.addEventListener("click", async () => {
    const arr = tables();
    if (!arr.length) { showToast("List is empty", "err"); return; }
    try {
      showToast("Loading PDF library…");
      const { jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      const total = Math.ceil(arr.length / TILES_PER_SHEET);
      for (let s = 0; s < total; s++) {
        showToast(`Rendering ${s + 1}/${total}…`);
        const sliceArr = arr.slice(s * TILES_PER_SHEET, s * TILES_PER_SHEET + TILES_PER_SHEET);
        const blob = await svgToPngBlob(sheetSvgFor(sliceArr), { scale: 1 });
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        if (s > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      }
      pdf.save(`Mirror Cards — A4 print sheets.pdf`);
      showToast(`PDF saved · ${total} ${total === 1 ? "page" : "pages"}`);
    } catch (e) {
      console.error(e);
      showToast(e.message || "PDF generation failed", "err", 4000);
    }
  });

  upAllBtn.addEventListener("click", async () => {
    const arr = tables();
    if (!arr.length) { showToast("List is empty", "err"); return; }
    try {
      for (let i = 0; i < arr.length; i++) {
        showToast(`Uploading ${i + 1}/${arr.length}…`);
        const blob = await svgToPngBlob(cardSvgFor(arr[i]), { scale: 2 });
        await uploadPngBlob(blob, `Mirror Card — ${tableSlug(arr[i])}.png`);
      }
      showToast(`Uploaded ${arr.length} to Drive`, "ok", 4000);
      window.open(COLLATERALS_FOLDER_URL, "_blank", "noopener");
    } catch (e) { console.error(e); showToast(e.message || "Batch upload failed", "err", 4000); }
  });

  // Live sync with other tabs / Karla's device
  fbSubscribe(TEMPLATE_ID, (remote) => {
    if (!remote || typeof remote !== "object") return;
    let dirty = false;
    if (typeof remote.batch === "string" && remote.batch !== stateBatch) {
      stateBatch = remote.batch;
      batchTA.value = stateBatch;
      dirty = true;
    }
    if (Number.isFinite(remote.previewIdx) && remote.previewIdx !== previewIdx) {
      previewIdx = remote.previewIdx;
      dirty = true;
    }
    if (dirty) render();
  });

  render();
  // Playfair Display / Inter both load via the editor page's <link>; once
  // they're ready the SVG metrics tighten up — repaint to reflect that.
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => render()).catch(() => {});
  }
}

mount();
