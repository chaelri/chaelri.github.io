// ===========================================================================
// sniffer.ino — re-capture Charlie's TCL TAC-09CSA/KEI remote with a known-
//               good IR receiver, three presses per button, auto-labelled.
// ---------------------------------------------------------------------------
// Why this exists:
//   The first round of captures (from tsop-decoder.ino) didn't replay cleanly
//   on the new IR transmitter. Best guess: the AC was in a non-default state
//   when we captured, so every Frame-1 we recorded encoded "AC mode X / temp Y
//   / fan Z" rather than the canonical default. Replaying them re-asserts
//   that old state instead of doing what the button name says.
//
//   This sniffer captures 3 presses per button so we can see the pattern:
//     - Frame 1 should stay identical across the 3 presses of the same button
//       (it's the *current state*, which doesn't change between rapid presses).
//     - Frame 2 should also stay identical across the 3 presses of the same
//       button — it's the button code, which IS the button.
//     - Frame 1 between different buttons may differ if the AC mutates its
//       state after each press (e.g. TEMP+1 raises temp → next Frame 1 shows
//       the higher temp).
//
//   Cross-checking these will tell us which frame the AC actually obeys, and
//   whether we need to send the library's own clean state frame instead of
//   replaying captured state frames.
//
// HARDWARE
//   1× VS1838B / TSOP4838 IR receiver module — 3 pins, OUT/GND/VCC, no
//   external resistor needed (built into the module).
//   ESP32-C3 SuperMini (same board used everywhere else in this project).
//
// WIRING
//
//        IR receiver module                ESP32-C3 SuperMini
//       ┌──────────────────┐              ┌──────────────────┐
//       │  ●  ●  ●         │              │                  │
//       │ OUT GND VCC      │              │   3V3  GND  GPIO2│
//       │    ▓▓▓▓          │              │                  │
//       │   (3-pin TO-92)  │              │                  │
//       └──────────────────┘              └──────────────────┘
//
//   IR receiver OUT  -> ESP32-C3 GPIO2
//   IR receiver GND  -> ESP32-C3 GND
//   IR receiver VCC  -> ESP32-C3 3V3   (5V also fine for most modules)
//
//   The IR transmitter (aircon-ir.ino) sits on GPIO3 — pins don't conflict,
//   so both can stay wired up at the same time if you want.
//
// HOW TO USE
//   1. Flash this sketch (Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled).
//   2. Open Serial Monitor @ 115200 baud.
//   3. Point Charlie's real TCL remote at the receiver from ~10 cm away.
//   4. Press buttons in this exact order, THREE TIMES each, ~1 s gap between
//      individual presses, ~3 s gap when moving to the next button:
//        a. POWER ON
//        b. POWER OFF
//        c. TEMP +1
//        d. TEMP -1
//        e. SWING (vertical)
//   5. Copy the entire Serial Monitor output and send it back.
//
//   The firmware auto-labels each capture with the current button name,
//   the press # (1-3 within that button), and the frame # (1 or 2 within
//   that press). Total expected output: 5 × 3 × 2 = 30 captures.
//
// Board: "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:  115200
// Library: IRremoteESP8266 by David Conran et al.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRutils.h>
#include <IRac.h>

// --- Capture config ---------------------------------------------------------
const uint16_t kRecvPin            = 2;     // GPIO2 -> IR receiver OUT
const uint32_t kBaudRate           = 115200;
const uint16_t kCaptureBufferSize  = 1024;  // entries; TCL frames are ~230
const uint8_t  kTimeout          = 15;    // ms idle = end-of-frame (per-frame, not per-press)
const uint16_t kMinUnknownSize     = 12;    // ignore noise shorter than this
const uint8_t  kTolerancePercentage   = kTolerance;  // library default (~25%)
const uint32_t kPressGapMs         = 200;   // ms idle = new press (frames are <50 ms apart)

// --- Sequence config (5 buttons × 3 presses × 2 frames = 30 captures) -------
const char* kButtons[]      = { "POWER ON", "POWER OFF", "TEMP +1", "TEMP -1", "SWING" };
const uint8_t kButtonCount  = sizeof(kButtons) / sizeof(kButtons[0]);
const uint8_t kPressesPerBtn = 3;

IRrecv irrecv(kRecvPin, kCaptureBufferSize, kTimeout, /*save_buffer=*/true);
decode_results results;

uint32_t lastCaptureMs = 0;
uint8_t  buttonIdx     = 0;     // 0..kButtonCount-1
uint8_t  pressNum      = 0;     // 1..kPressesPerBtn
uint8_t  frameNum      = 0;     // 1..2
uint16_t captureSeq    = 0;     // global counter

void printBanner() {
  Serial.println();
  Serial.println("==================================================================");
  Serial.println(" Aircon IR Sniffer — TCL TAC-09CSA/KEI re-capture");
  Serial.println("==================================================================");
  Serial.printf (" Receiver pin   : GPIO%u\n", kRecvPin);
  Serial.printf (" New-press gap  : >%u ms (anything shorter is a 2nd frame)\n",
                 (unsigned)kPressGapMs);
  Serial.println();
  Serial.println(" Press each button THREE times, in this exact order:");
  for (uint8_t i = 0; i < kButtonCount; i++) {
    Serial.printf("   %u. %-12s (3 presses, ~1 s apart)\n", i + 1, kButtons[i]);
  }
  Serial.println();
  Serial.println(" Each press emits 2 IR frames (state frame + button-code frame).");
  Serial.println(" Total expected: 5 buttons × 3 presses × 2 frames = 30 captures.");
  Serial.println();
  Serial.printf (" Starting on: %s\n", kButtons[0]);
  Serial.println(" Listening...");
  Serial.println();
}

void setup() {
  Serial.begin(kBaudRate);
  while (!Serial && millis() < 5000) delay(50);
  delay(500);

  irrecv.setUnknownThreshold(kMinUnknownSize);
  irrecv.setTolerance(kTolerancePercentage);
  irrecv.enableIRIn();

  printBanner();
}

void loop() {
  if (!irrecv.decode(&results)) return;

  // Classify this capture (new press vs. follow-up frame of current press).
  uint32_t now = millis();
  bool newPress = (now - lastCaptureMs) > kPressGapMs;
  lastCaptureMs = now;

  if (newPress) {
    pressNum++;
    frameNum = 1;
    if (pressNum > kPressesPerBtn) {
      // We've consumed all 3 presses for the current button — advance.
      Serial.println();
      Serial.printf(">>> Done capturing %s (3 presses). ",
                    kButtons[buttonIdx]);
      buttonIdx = (buttonIdx + 1) % kButtonCount;
      pressNum = 1;
      if (buttonIdx == 0) {
        Serial.println("Full sequence complete. Power-cycle to redo.");
      } else {
        Serial.printf("Next button: %s\n", kButtons[buttonIdx]);
      }
      Serial.println();
    }
  } else {
    frameNum++;
  }
  captureSeq++;

  // ----- Print the capture in a paste-friendly, deterministic format -------
  Serial.printf("===== [%s]  press %u / frame %u  (capture #%u) =====\n",
                kButtons[buttonIdx], pressNum, frameNum, captureSeq);

  Serial.print  ("Protocol      : ");
  Serial.println(typeToString(results.decode_type, results.repeat));

  Serial.print  ("Bits          : ");
  Serial.println(results.bits);

  if (hasACState(results.decode_type)) {
    Serial.print("State bytes   : ");
    for (uint16_t i = 0; i < results.bits / 8; i++) {
      if (results.state[i] < 0x10) Serial.print('0');
      Serial.print(results.state[i], HEX);
      Serial.print(' ');
    }
    Serial.println();
  } else {
    Serial.print  ("Value (hex)   : 0x");
    Serial.println(uint64ToString(results.value, 16));
  }

  // Library's one-liner summary (matches the format Charlie used in v1).
  Serial.print  ("Summary       : ");
  Serial.println(resultToHumanReadableBasic(&results));

  // For A/C protocols, library can also decode mode/temp/fan to text.
  String acFields = IRAcUtils::resultAcToString(&results);
  if (acFields.length() > 0) {
    Serial.print  ("AC fields     : ");
    Serial.println(acFields);
  }

  // Raw timings — what we'll feed sendRaw() if we end up replaying.
  Serial.println("Raw timings (paste into sendRaw if needed):");
  Serial.println(resultToSourceCode(&results));
  Serial.println();

  yield();
}
