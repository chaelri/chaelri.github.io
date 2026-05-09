// ===========================================================================
// ir-led-receiver-v2.ino — same wiring as v1, but with carrier-envelope
// filtering so the captured timings are clean (no 38kHz aliasing noise).
// ---------------------------------------------------------------------------
// THE PROBLEM v1 HAD: ADC sample rate (~25-50us) is too slow to track the
// 38kHz carrier directly. Each "mark" appeared as a flurry of fast 48-285us
// pulses because the ADC was catching aliased samples of the carrier.
//
// FIX: peak-hold envelope detection.
//   - Sample ADC continuously
//   - Any reading above trigger threshold = "we just saw light"
//   - Stay in MARK state as long as there was a high reading within the
//     last CARRIER_GAP_US microseconds (defaults to 100us)
//   - Only flip to SPACE state after sustained darkness for > CARRIER_GAP_US
//   - Smallest real bit-space is ~350us so 100us gap is safely below
//
// This collapses the noisy carrier into clean envelopes that match what
// IRsend.sendRaw() expects. Still capture/replay verbatim — no protocol
// decoding needed.
//
// Wiring: SAME as v1 (and aircon.ino). GPIO3 -> 100Ω -> LED+ ; LED- -> GND.
// USAGE:
//   1. Upload, open Serial Monitor at 115200.
//   2. Wait 2 sec for baseline measurement.
//   3. Hold real remote LED TOUCHING the ESP32 IR LED dome.
//   4. Press POWER on real remote — capture happens automatically.
//   5. Sketch dumps a clean uint16_t rawData[] array.
//   6. Copy that array — paste into ir-replay.ino (next file we'll write).
// ===========================================================================

#include <Arduino.h>

const int IR_LED_PIN  = 3;          // ADC1_CH3 on ESP32-C3
const int LED_PIN     = 8;
const int CAPTURE_BUF = 400;
const unsigned long CARRIER_GAP_US  = 100;     // sustained-low to call it space
const unsigned long IDLE_TIMEOUT_US = 80000;   // 80 ms of nothing = end of frame

uint32_t timings[CAPTURE_BUF];

void setup() {
  Serial.begin(115200);
  pinMode(IR_LED_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  analogReadResolution(12);

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  IR LED receiver v2 (carrier-filtered)");
  Serial.println("========================================\n");
}

int measureBaseline() {
  long sum = 0; int n = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 1500) { sum += analogRead(IR_LED_PIN); n++; }
  return sum / n;
}

void loop() {
  Serial.println("Measuring baseline (1.5 sec, sit still)...");
  int baseline = measureBaseline();
  int trigger  = baseline + 30;
  Serial.printf("Baseline: %d  Trigger: %d\n", baseline, trigger);
  Serial.println("\n>>> Touch real remote to LED. Press POWER.");
  Serial.println("    (waits up to 30 sec)\n");

  // --- Wait for first detection ---
  unsigned long waitStart = millis();
  while (analogRead(IR_LED_PIN) <= trigger) {
    if (millis() - waitStart > 30000) {
      Serial.println("(timeout — try again, retake baseline)");
      return;
    }
  }

  digitalWrite(LED_PIN, LOW);

  // --- Capture with envelope detection ---
  int count = 0;
  bool inMark = true;
  unsigned long edgeTime = micros();
  unsigned long lastHigh = edgeTime;

  while (count < CAPTURE_BUF) {
    unsigned long now = micros();
    bool high = (analogRead(IR_LED_PIN) > trigger);
    if (high) lastHigh = now;

    if (inMark) {
      // In a mark. Flip to space only when no high seen for CARRIER_GAP_US.
      if (now - lastHigh > CARRIER_GAP_US) {
        timings[count++] = lastHigh - edgeTime;   // mark ended at last high
        edgeTime = lastHigh;
        inMark = false;
      }
    } else {
      // In a space. Flip to mark on the very next high.
      if (high) {
        timings[count++] = now - edgeTime;
        edgeTime = now;
        inMark = true;
      }
    }

    // End of frame: long enough silence
    if (!inMark && (now - lastHigh > IDLE_TIMEOUT_US)) break;
  }

  digitalWrite(LED_PIN, HIGH);

  // --- Dump as sendRaw-compatible array ---
  Serial.println("\n========================================");
  Serial.printf("Captured %d clean transitions:\n\n", count);
  Serial.println("uint16_t rawData[] = {");
  for (int i = 0; i < count; i++) {
    Serial.printf("%lu", timings[i]);
    if (i < count - 1) Serial.print(", ");
    if ((i + 1) % 8 == 0) Serial.println();
  }
  Serial.println("\n};\n");
  Serial.printf("// Replay with: irsend.sendRaw(rawData, %d, 38);\n", count);
  Serial.println("========================================\n");

  // Quick sanity check on what was captured
  int marks = 0, spaces = 0;
  unsigned long maxV = 0, minV = 99999999;
  for (int i = 0; i < count; i++) {
    if (i % 2 == 0) marks++; else spaces++;
    if (timings[i] > maxV) maxV = timings[i];
    if (timings[i] < minV) minV = timings[i];
  }
  Serial.printf("Stats: %d marks, %d spaces, range %lu-%lu us\n",
                marks, spaces, minV, maxV);
  Serial.println("\nWaiting 5 sec, then ready for another capture.\n");
  delay(5000);
}
