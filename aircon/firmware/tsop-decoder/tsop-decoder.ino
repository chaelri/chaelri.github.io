// ===========================================================================
// tsop-decoder.ino — sniff every button of Charlie's TAC-09CSA/KEI remote
//                    with a TSOP4838 + ESP32-C3 SuperMini.
// ---------------------------------------------------------------------------
// One-time sketch. Press every button on the real remote, copy the Serial
// output, and we'll either (a) confirm the library's TCL112AC encoding is
// correct and stick with aircon.ino, or (b) extract raw timings to replay
// for any button the library doesn't decode cleanly.
//
// HARDWARE
//   - 1× TSOP4838 IR receiver module (or VS1838B clone — same thing). 3 pins.
//   - ESP32-C3 SuperMini (the same board the main aircon.ino uses).
//
// WIRING (3 wires, no resistor — TSOP module has it built in):
//
//       TSOP4838 module                      ESP32-C3 SuperMini
//      ┌────────────────┐                   ┌──────────────────┐
//      │  ●  ●  ●       │                   │                  │
//      │ OUT GND VCC    │                   │   3V3  GND  GPIO2│
//      │     ▓▓▓▓       │                   │                  │
//      │     dome ▶▶▶   │ ◀── aim remote    │                  │
//      └────────────────┘                   └──────────────────┘
//             │    │    │                         │    │    │
//             │    │    └─────── VCC ────────────►│ 3V3│    │
//             │    └──────────── GND ─────────────│    │GND │
//             └───────────────── OUT ─────────────│    │ ── │GPIO2
//
//   Bare 3-leg part (no breakout)? Dome facing you, leads down:
//     left = OUT,  middle = GND,  right = VCC.
//
//   GPIO2 is the ESP32-C3's boot-strapping pin but the TSOP's open-drain
//   output idles HIGH (pulled up internally) so boot mode is unaffected.
//   If you ever see weird reset behavior, switch to GPIO4 and update
//   TSOP_PIN below.
//
// USAGE
//   1. Wire as above.
//   2. Upload this sketch (Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled).
//   3. Open Serial Monitor at 115200 baud.
//   4. Hold the real TCL remote ~10 cm from the TSOP4838 dome.
//   5. Press the buttons in the order printed at the top of the Serial Monitor.
//   6. Copy the whole Serial output to Claude — done.
//
// Library required: IRremoteESP8266 (already used by aircon.ino). Install
// via Arduino IDE Library Manager → search "IRremoteESP8266" by David Conran.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRutils.h>
#include <IRac.h>  // IRAcUtils::resultAcToString lives here, not in IRutils.h

const uint16_t TSOP_PIN             = 2;    // GPIO2 — TSOP OUT
const uint16_t kCaptureBufferSize   = 1024; // big enough for any aircon frame
const uint8_t  kTimeout             = 35;   // ms — kept LOW on purpose so the
                                            // TAC-09CSA's multi-burst frames
                                            // split cleanly. We group them
                                            // back together in software (see
                                            // kNewPressGapMs below).
const uint16_t kMinUnknownSize      = 12;   // min length to even try decoding
const uint32_t kNewPressGapMs       = 800;  // gap between captures longer than
                                            // this counts as a NEW physical
                                            // press; anything within it is
                                            // labeled "frame 2/3/…" of the
                                            // same press.

IRrecv irrecv(TSOP_PIN, kCaptureBufferSize, kTimeout, true);
decode_results results;
uint32_t pressCount   = 0;
uint32_t lastDecodeMs = 0;
uint32_t frameInPress = 0;

// Suggested press order — print at startup so Charlie can tick them off as
// he goes. Covers every distinct state field the TCL remote can produce.
const char* PRESS_LIST[] = {
  "POWER ON",
  "MODE -> COOL",
  "MODE -> DRY",
  "MODE -> FAN",
  "MODE -> HEAT",
  "MODE -> AUTO",
  "TEMP +1  (e.g. 24 -> 25)",
  "TEMP -1  (e.g. 25 -> 24)",
  "FAN  -> AUTO",
  "FAN  -> LOW",
  "FAN  -> MED",
  "FAN  -> HIGH",
  "SWING (vertical)",
  "TURBO",
  "ECO / SLEEP",
  "POWER OFF"
};
const size_t PRESS_LIST_N = sizeof(PRESS_LIST) / sizeof(PRESS_LIST[0]);

void printChecklist() {
  Serial.println("Suggested press order — work down the list, one press each:");
  for (size_t i = 0; i < PRESS_LIST_N; i++) {
    Serial.print("  ");
    if (i + 1 < 10) Serial.print(' ');
    Serial.print(i + 1);
    Serial.print(". ");
    Serial.println(PRESS_LIST[i]);
  }
  Serial.println();
  Serial.println("Between presses, wait ~1 s so each capture lands on its own line.");
  Serial.println("If a press doesn't print anything, re-aim and try again.");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(50);
  delay(2000);

  Serial.println();
  Serial.println("============================================================");
  Serial.println("  TSOP4838 IR sniffer — TAC-09CSA/KEI button capture");
  Serial.println("============================================================");
  Serial.println("Wiring:");
  Serial.println("  TSOP VCC -> ESP32 3.3V");
  Serial.println("  TSOP GND -> ESP32 GND");
  Serial.print  ("  TSOP OUT -> ESP32 GPIO"); Serial.println(TSOP_PIN);
  Serial.println();
  printChecklist();
  Serial.println("Aim the real TCL remote at the TSOP dome. Begin:");
  Serial.println();

  irrecv.setUnknownThreshold(kMinUnknownSize);
  irrecv.enableIRIn();
}

void loop() {
  if (!irrecv.decode(&results)) return;

  // Group bursts that arrive close together as ONE physical press. The
  // TAC-09CSA/KEI sends a "header" burst (identical for every button) and a
  // separate "payload" burst (button-specific) within ~50-300 ms. We need
  // BOTH — the payload burst is where TEMP/MODE/SWING actually live.
  uint32_t now = millis();
  bool newPress = (lastDecodeMs == 0) || ((now - lastDecodeMs) > kNewPressGapMs);
  if (newPress) {
    pressCount++;
    frameInPress = 1;
  } else {
    frameInPress++;
  }
  lastDecodeMs = now;

  Serial.println();
  Serial.print("===== Press #");
  Serial.print(pressCount);
  Serial.print("  (frame ");
  Serial.print(frameInPress);
  Serial.print(")");
  if (pressCount <= PRESS_LIST_N && frameInPress == 1) {
    Serial.print("  (expected: ");
    Serial.print(PRESS_LIST[pressCount - 1]);
    Serial.print(")");
  }
  Serial.println(" =====");

  Serial.print("Protocol      : ");
  Serial.println(typeToString(results.decode_type, results.repeat));

  Serial.print("Bits          : ");
  Serial.println(results.bits);

  if (hasACState(results.decode_type)) {
    Serial.print("State bytes   : ");
    uint16_t nBytes = results.bits / 8;
    for (uint16_t i = 0; i < nBytes; i++) {
      if (results.state[i] < 0x10) Serial.print("0");
      Serial.print(results.state[i], HEX);
      Serial.print(" ");
    }
    Serial.println();
  } else {
    Serial.print("Value (hex)   : 0x");
    serialPrintUint64(results.value, HEX);
    Serial.println();
  }

  Serial.print("Summary       : ");
  Serial.println(resultToHumanReadableBasic(&results));

  String desc = IRAcUtils::resultAcToString(&results);
  if (desc.length() > 0) {
    Serial.print("AC fields     : ");
    Serial.println(desc);
  }

  Serial.println();
  Serial.println("Raw timings (paste into sendRaw if library can't replay):");
  Serial.println(resultToSourceCode(&results));

  if (pressCount < PRESS_LIST_N) {
    Serial.print(">>> Next: ");
    Serial.println(PRESS_LIST[pressCount]);
  } else if (pressCount == PRESS_LIST_N) {
    Serial.println(">>> Checklist complete — extra presses are bonus captures.");
  }
  Serial.println();

  irrecv.resume();
}
