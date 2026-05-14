// ===========================================================================
// sniffer.ino — re-capture Charlie's TCL TAC-09CSA/KEI remote with a known-
//               good IR receiver. 5 presses total (one per button), live
//               per-press confirmation so you can copy/paste at the end.
// ---------------------------------------------------------------------------
// Capture plan:
//   Press 1: POWER (turns the AC ON — assumes AC starts OFF)
//   Press 2: TEMP +
//   Press 3: TEMP -
//   Press 4: SWING
//   Press 5: POWER (turns the AC back OFF)
//
//   After each press the sketch prints "[OK] Press N/5 captured" and shows
//   which button to press next. Full log stays in the Serial Monitor
//   scrollback so you can copy/paste everything at the end.
//
// HARDWARE
//   1× VS1838B / TSOP4838 IR receiver module (OUT/GND/VCC, no resistor).
//   ESP32-C3 SuperMini.
//
// WIRING
//   IR receiver OUT  -> ESP32-C3 GPIO2
//   IR receiver GND  -> ESP32-C3 GND
//   IR receiver VCC  -> ESP32-C3 3V3   (5V also fine on most modules)
//
//   The transmitter (aircon-ir.ino) lives on GPIO3 — pins don't conflict,
//   so both can stay wired up at the same time.
//
// BEFORE YOU START
//   1. Make sure the AC is currently OFF. The sequence assumes the first
//      POWER press will turn it ON.
//   2. Flash this sketch (Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled).
//   3. Open Serial Monitor @ 115200 baud. Hit reset to re-print the banner
//      if you missed it.
//   4. Follow the "NEXT" prompts the sketch prints between presses. Aim the
//      remote at the receiver from ~10 cm. ~1 s between presses is plenty.
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

// --- Capture config (names match library's IRrecvDumpV3 example) ------------
const uint16_t kRecvPin              = 2;
const uint32_t kBaudRate             = 115200;
const uint16_t kCaptureBufferSize    = 1024;
const uint8_t  kTimeout              = 15;
const uint16_t kMinUnknownSize       = 12;
const uint8_t  kTolerancePercentage  = kTolerance;

// --- Press / sequence pacing ------------------------------------------------
const uint32_t kPressGapMs       = 200;   // quiet ms = new press (frames <50ms apart)
const uint32_t kPressCompleteMs  = 800;   // quiet ms = press is done -> announce

// --- The expected sequence: 5 presses, in order ----------------------------
struct PressEntry {
  const char* btn;      // which button on the remote
  const char* action;   // what this press should do
};
const PressEntry kSequence[] = {
  { "POWER",  "turn AC ON  (AC must start OFF)" },
  { "TEMP +", "raise the temperature by 1" },
  { "TEMP -", "lower the temperature by 1" },
  { "SWING",  "toggle vertical swing" },
  { "POWER",  "turn AC OFF" },
};
const uint8_t kSeqLen = sizeof(kSequence) / sizeof(kSequence[0]);

IRrecv irrecv(kRecvPin, kCaptureBufferSize, kTimeout, /*save_buffer=*/true);
decode_results results;

// --- Capture state ----------------------------------------------------------
int16_t   pressIdx     = -1;     // -1 = none yet; otherwise 0..kSeqLen-1 (or beyond = extra)
uint8_t   frameCount   = 0;
uint32_t  lastCaptureMs = 0;
bool      announced    = true;   // true = "previous press already wrapped up"

void announceNext(uint8_t nextIdx) {
  if (nextIdx >= kSeqLen) return;
  Serial.println();
  Serial.println("--------------------------------------------------------------------");
  Serial.printf (" NEXT (press %u of %u):  press the [%s] button on the remote\n",
                 (unsigned)(nextIdx + 1), (unsigned)kSeqLen, kSequence[nextIdx].btn);
  Serial.printf (" Expected: %s\n", kSequence[nextIdx].action);
  Serial.println("--------------------------------------------------------------------");
}

void printBanner() {
  Serial.println();
  Serial.println("====================================================================");
  Serial.println(" Aircon IR Sniffer — TCL TAC-09CSA/KEI re-capture (5 presses)");
  Serial.println("====================================================================");
  Serial.printf (" Receiver pin     : GPIO%u\n", kRecvPin);
  Serial.printf (" New-press gap    : >%u ms\n", (unsigned)kPressGapMs);
  Serial.printf (" Press-done quiet : >%u ms\n", (unsigned)kPressCompleteMs);
  Serial.println();
  Serial.println(" BEFORE YOU START: turn the AC OFF (point the remote AWAY from");
  Serial.println(" the sniffer). The sequence assumes you'll start from OFF.");
  Serial.println();
  Serial.println(" Plan — one click per button, in this order:");
  Serial.println("   #1  POWER   -> turn AC ON");
  Serial.println("   #2  TEMP +  -> raise temp");
  Serial.println("   #3  TEMP -  -> lower temp");
  Serial.println("   #4  SWING   -> toggle vertical swing");
  Serial.println("   #5  POWER   -> turn AC OFF");
  Serial.println();
  Serial.println(" After each press you'll see a '[OK] Press N/5 captured' line.");
  Serial.println(" Wait for it before pressing the next button.");
  Serial.println();
  announceNext(0);
}

void printFrame() {
  Serial.printf("  -- frame %u --\n", (unsigned)frameCount);

  Serial.print  ("  protocol : ");
  Serial.println(typeToString(results.decode_type, results.repeat));

  Serial.print  ("  bits     : ");
  Serial.println(results.bits);

  if (hasACState(results.decode_type)) {
    Serial.print("  state    : ");
    for (uint16_t i = 0; i < results.bits / 8; i++) {
      if (results.state[i] < 0x10) Serial.print('0');
      Serial.print(results.state[i], HEX);
      Serial.print(' ');
    }
    Serial.println();
  } else {
    Serial.print  ("  value    : 0x");
    Serial.println(uint64ToString(results.value, 16));
  }

  Serial.print  ("  summary  : ");
  Serial.println(resultToHumanReadableBasic(&results));

  String acFields = IRAcUtils::resultAcToString(&results);
  if (acFields.length() > 0) {
    Serial.print  ("  ac decode: ");
    Serial.println(acFields);
  }

  Serial.println("  raw timings:");
  Serial.println(resultToSourceCode(&results));
}

void announcePressComplete() {
  Serial.println();
  if (pressIdx < (int16_t)kSeqLen) {
    Serial.printf("[OK] Press %u/%u captured: [%s] (%u frame%s)\n",
                  (unsigned)(pressIdx + 1), (unsigned)kSeqLen,
                  kSequence[pressIdx].btn,
                  (unsigned)frameCount, frameCount == 1 ? "" : "s");
    if (frameCount != 2) {
      Serial.printf("     ^ heads-up: expected 2 frames, got %u. "
                    "If you want, just press the same button again — "
                    "the sketch will log extras and you can pick the best one later.\n",
                    (unsigned)frameCount);
    }
    if (pressIdx + 1 < (int16_t)kSeqLen) {
      announceNext(pressIdx + 1);
    } else {
      Serial.println();
      Serial.println("====================================================================");
      Serial.println(" *** ALL 5 PRESSES CAPTURED ***");
      Serial.println(" Scroll up, select the entire log from the first banner to here,");
      Serial.println(" copy it, and paste it back. Done.");
      Serial.println("====================================================================");
      Serial.println();
    }
  } else {
    // We're past press 5 — user pressed extras. Just acknowledge.
    Serial.printf("[..] Extra press #%u captured (%u frame%s). "
                  "All 5 planned presses were already logged above.\n",
                  (unsigned)(pressIdx + 1),
                  (unsigned)frameCount, frameCount == 1 ? "" : "s");
  }
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
  // Background: if a press hasn't been "wrapped up" yet and the line went
  // quiet for kPressCompleteMs, announce that the press is done and prompt
  // the user for the next one. This is what gives the live per-press feedback.
  if (pressIdx >= 0 && !announced && (millis() - lastCaptureMs) > kPressCompleteMs) {
    announcePressComplete();
    announced = true;
  }

  if (!irrecv.decode(&results)) return;

  uint32_t now = millis();
  bool firstEver = (pressIdx < 0);
  bool newPress  = firstEver || (now - lastCaptureMs) > kPressGapMs;

  if (newPress) {
    pressIdx++;
    frameCount = 1;
    announced = false;

    Serial.println();
    Serial.println("====================================================================");
    if (pressIdx < (int16_t)kSeqLen) {
      Serial.printf(" PRESS %u of %u  ->  [%s]  (expected: %s)\n",
                    (unsigned)(pressIdx + 1), (unsigned)kSeqLen,
                    kSequence[pressIdx].btn, kSequence[pressIdx].action);
    } else {
      Serial.printf(" EXTRA PRESS #%u  (beyond the 5-press plan)\n",
                    (unsigned)(pressIdx + 1));
    }
    Serial.println("====================================================================");
  } else {
    frameCount++;
  }
  lastCaptureMs = now;

  printFrame();
  yield();
}
