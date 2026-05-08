# AutoClicker Carrier PCB v1.0

A 40 × 25 mm carrier board that takes the breadboard rats-nest off the bench and turns the ESP32-C3 SuperMini + MG90S servo into a clean, screw-mountable module.

## What it does

- Sockets the ESP32-C3 SuperMini on two 1×8 female header strips (no soldering of the module — pull it off any time)
- Routes 5V / GND / GPIO3 through copper traces to a 3-pin JST-PH connector for the MG90S pigtail
- Holds a 470 µF electrolytic across the 5V rail to absorb servo inrush spikes
- Lights a small red status LED whenever the board is powered
- Drops into any enclosure via four M2 mounting holes

USB-C lives on the SuperMini itself — it pokes off the LEFT short edge of the carrier so you can plug a powerbank straight in.

## Dimensions

| Item                  | Value                          |
|-----------------------|--------------------------------|
| Outline               | 40.0 × 25.0 mm                 |
| Thickness             | 1.6 mm (standard FR-4)         |
| Layers                | 2                              |
| Mounting holes        | 4 × Ø 2.2 mm (M2), 3 mm inset  |
| Header pitch          | 2.54 mm                        |
| Header row spacing    | 17.78 mm (0.7", SuperMini std) |
| Servo connector       | JST-PH 3-pin, 2.0 mm pitch     |
| Cap pad pitch         | 5.0 mm                         |

## Bill of materials

| Ref | Qty | Part                                    | Notes                          | ~₱ each |
|-----|-----|-----------------------------------------|--------------------------------|---------|
| —   | 1   | Bare PCB                                | JLCPCB 40×25 mm, 2-layer       | ~22 (5-pack ≈ ₱110) |
| J1  | 1   | 1×8 female header, 2.54 mm × 2          | Sockets the SuperMini          | 10      |
| J2  | 1   | JST-PH 3-pin vertical header            | For MG90S pigtail              | 15      |
| C1  | 1   | 470 µF / 16 V electrolytic, 5 mm pitch  | Servo bulk decoupling          | 5       |
| D1  | 1   | 5 mm red LED                            | Power indicator                | 2       |
| R1  | 1   | 330 Ω 1/4 W resistor                    | LED current limit              | 1       |
| —   | 4   | M2 × 6 mm machine screw + nut           | Optional, for enclosure        | 8 set   |

Total **~₱65** in components per board, plus the shared PCB cost. SuperMini and servo come from the existing build.

## Schematic (textual)

```
  [USB-C 5V] ─┬─ ESP32-C3 5V ───┬───── J2 pin 1 (5V, red wire)
              │                 ├──[+] C1 [−]── ESP32-C3 GND
              └──── R1 ── D1[A] D1[K] ── ESP32-C3 GND
  ESP32-C3 GND ─────────────────┴───── J2 pin 3 (GND, brown wire)
  ESP32-C3 GPIO3 ────────────────────  J2 pin 2 (SIG, orange/yellow wire)
```

Three signal nets total. No transistor, no MOSFET, no flyback diode — the servo is a non-inductive load (from the firmware's perspective; the gear motor's brushes are inside the servo's own controller).

## Manufacturing

### Option A — JLCPCB (recommended starting point)

1. Open `autoclicker-carrier.svg` in [KiCad PcbNew](https://www.kicad.org/) → **File ▸ Import ▸ Graphics**, scale 1.0, layer `Edge.Cuts` for the outline + `F.SilkS` for labels.
2. Place footprints from the standard libraries:
   - `Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical` × 2
   - `Connector_JST:JST_PH_S3B-PH-K_1x03_P2.00mm_Horizontal`
   - `Capacitor_THT:CP_Radial_D8.0mm_P5.00mm`
   - `LED_THT:LED_D5.0mm`
   - `Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P2.54mm_Vertical`
   - `MountingHole:MountingHole_2.2mm_M2`
3. Route the three traces shown above on the **top** copper layer (default 0.4 mm trace width is fine for ~1 A).
4. Pour a GND fill on the bottom layer and stitch with a few vias for thermal mass.
5. **File ▸ Plot** → Gerbers + drill files (Excellon, metric, decimal). Zip them.
6. Upload to JLCPCB. Defaults are correct for this design: 1.6 mm FR-4, HASL lead-free, 2 layers, green soldermask, white silkscreen. Order qty 5 — minimum is cheaper than qty 1.

### Option B — toner transfer / hand-etched

The design is simple enough (3 nets) that a hand-routed single-sided board works. Mirror the SVG, print on glossy paper, transfer with a hot iron onto copper-clad, etch with ferric chloride. Drill with a 1.0 mm bit for the through-holes and 2.2 mm for mounting.

## Assembly

1. Solder the two 1×8 female headers first — flip the board upside-down on a flat surface with the headers in place to ensure they sit perpendicular.
2. Solder J2 (JST-PH), watching polarity against the silkscreen.
3. Solder C1 with the **long lead in the `+` pad** (left side, near the trace from 5V). Cap polarity is critical — backwards = bulging cap.
4. Solder R1 (any direction) and D1 (long lead = anode = `+` end, marked on silk).
5. Plug the SuperMini onto the headers. USB-C should poke off the left short edge.
6. Plug the MG90S pigtail onto J2. Check the wire colors against the silkscreen: red (5V) → pin 1, orange/yellow (signal) → pin 2, brown (GND) → pin 3. **MG90S pin order can differ between clones — always verify against the silkscreen, not your last build.**

## File map

```
pcb/
├── autoclicker-carrier.kicad_pro   ← KiCad project file (open this one in KiCad)
├── autoclicker-carrier.kicad_pcb   ← Board layout — opens in PcbNew
├── autoclicker-carrier.svg         ← 1:1 reference drawing (Inkscape / browser)
└── README.md                       ← this document
```

### Opening in KiCad

1. Install [KiCad 8 or later](https://www.kicad.org/download/) (free, cross-platform).
2. Open KiCad. **File ▸ Open Project** → pick `autoclicker-carrier.kicad_pro`.
3. From the project window, double-click the PCB file (or click the green **PCB Editor** button) to open the board in PcbNew. You'll see:
   - 40 × 25 mm board outline on `Edge.Cuts`
   - 4 mounting holes (M2, NPTH)
   - 2 socket strips for the SuperMini (J1 with the 5V/GND/SIG nets assigned, J2 as passthrough)
   - JST-PH 3-pin servo connector (J3)
   - 470 µF cap (C1), 5 mm LED (D1), 330 Ω resistor (R1)
   - Pre-routed copper: +5V / SIG / LED_A on **F.Cu** (top), GND on **B.Cu** (bottom)
   - Silkscreen labels: AUTOCLICKER, v1.0, pin labels at the JST, USB-C arrow, GPIO3 callout
4. Run **Inspect ▸ Design Rules Checker** — should pass with default DRC. If anything trips, the most likely cause is footprint clearances tighter than the global 0.2 mm clearance.
5. **File ▸ Plot…** to export Gerbers (defaults are fine — turn on `F.Cu / B.Cu / F.SilkS / F.Mask / B.Mask / Edge.Cuts`). Then **Generate Drill Files…** for the Excellon `.drl`. Zip everything in `gerber/` and upload to JLCPCB.

### Note on embedded footprints

The footprints (`Custom:PinSocket_1x08_Horizontal`, etc.) are **embedded in the .kicad_pcb file** — they don't reference any external library, so they'll resolve cleanly even on a fresh KiCad install with no extra libraries downloaded. The standard libraries (`MountingHole`, `Connector_JST`, `Capacitor_THT`, `LED_THT`, `Resistor_THT`) are also referenced for the parts that match KiCad's defaults; if you don't have them installed (highly unusual), KiCad will fall back to the embedded copies.

### No schematic — that's intentional

This is a board-only project (no `.kicad_sch`). The netlist is defined directly via pad net assignments in the PCB file. To add a schematic later: **File ▸ New ▸ Schematic**, draw the symbols, and run **Tools ▸ Update PCB from Schematic** to sync.

The SVG (`autoclicker-carrier.svg`) is a reference drawing — useful as an Inkscape source for graphics or as a printable 1:1 template, but it's not what you fab from. Always generate Gerbers from KiCad.

## Status

Designed but not yet manufactured. v1.0 is a paper design. Once a batch is fabbed and assembled, this file will be updated with errata.
