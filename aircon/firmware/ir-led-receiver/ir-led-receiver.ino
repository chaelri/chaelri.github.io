// ===========================================================================
// ir-led-receiver.ino — use the IR LED itself as a crude photodiode to
// capture raw timings from Charlie's real TAC-09CSA/KEI remote.
// ---------------------------------------------------------------------------
// PRINCIPLE: an IR LED in photovoltaic mode (no bias) generates a tiny voltage
// when illuminated by IR light. Not as sensitive as a TSOP4838 receiver, but
// works for STRONG signals held VERY CLOSE (remote touching the LED dome is
// best). Reads ADC continuously on GPIO3 (which is ADC1_CH3 on ESP32-C3).
//
// Wiring: SAME AS aircon.ino — GPIO3 -> 100Ω -> IR LED anode (long, +),
//         IR LED cathode (short, -) -> GND. We just switch GPIO3 to INPUT.
//
// USAGE:
//   1. Upload sketch, open Serial Monitor at 115200 baud.
//   2. PHASE 1 — LIVENESS PROBE (15 sec). Sketch prints live ADC readings
//      with min/max/range. Hold your REAL remote with its LED touching
//      the ESP32's IR LED dome. Press POWER. Watch for the range to JUMP.
//      - Range jumps > 50 when pressing button → IR LED is alive, real
//        remote is firing. We're good. Move to Phase 2.
//      - Range stays flat → IR LED is dead OR your remote isn't firing
//        (battery? aim?). Try a different button, fresh batteries.
//   3. PHASE 2 — CAPTURE MODE. Sketch listens for IR pulses and dumps
//      raw timing arrays. Hold remote touching LED, press POWER once.
//      Sketch prints a uint16_t array we can paste into a sender sketch
//      and replay verbatim with IRsend.sendRaw() — no protocol decoding
//      needed.
//
// LIMITATIONS:
//   - Sample rate ~25us → marginal for clean capture; may need 2-3 tries
//   - No 38kHz carrier filtering → captures envelopes only, but that's
//     enough for sendRaw replay (which re-modulates at 38kHz)
//   - VERY strong signal needed — remote LED must touch our IR LED dome
// ===========================================================================

#include <Arduino.h>

const int IR_LED_PIN  = 3;          // ADC1_CH3 on ESP32-C3
const int LED_PIN     = 8;
const int CAPTURE_BUF = 600;        // max transitions to record
const unsigned long IDLE_TIMEOUT_US = 50000;  // 50 ms gap = end of frame
const int PROBE_DURATION_MS = 15000;          // Phase 1 length

uint32_t timings[CAPTURE_BUF];
int triggerADC = 0;
int baselineADC = 0;

void setup() {
  Serial.begin(115200);
  pinMode(IR_LED_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  analogReadResolution(12);                   // 0..4095
  // Default attenuation is 11dB ~ 0..3.3V — fine for our purpose

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  IR LED as crude photodiode receiver");
  Serial.println("========================================\n");

  // ---------- Phase 0: ambient baseline ----------
  Serial.println("Measuring ambient baseline (2 sec, sit still)...");
  long sum = 0; int samples = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 2000) { sum += analogRead(IR_LED_PIN); samples++; }
  baselineADC = sum / samples;
  triggerADC  = baselineADC + 30;
  Serial.printf("Baseline: %d  ·  Trigger: %d  ·  ADC samples/sec: %d\n\n",
                baselineADC, triggerADC, samples / 2);

  // ---------- Phase 1: liveness probe ----------
  Serial.println("--- PHASE 1: LIVENESS PROBE (15 sec) ---");
  Serial.println("Hold real remote LED TOUCHING the ESP32's IR LED dome.");
  Serial.println("Press buttons. Watch the 'range' value. If it jumps");
  Serial.println("by 50+ when pressing → LED is alive. If always 0-5 →");
  Serial.println("LED is dead or remote isn't firing.\n");

  int probeMin = 4095, probeMax = 0;
  unsigned long probeStart = millis();
  unsigned long lastPrint = 0;
  while (millis() - probeStart < PROBE_DURATION_MS) {
    int v = analogRead(IR_LED_PIN);
    if (v < probeMin) probeMin = v;
    if (v > probeMax) probeMax = v;
    if (millis() - lastPrint >= 200) {
      lastPrint = millis();
      Serial.printf("now=%4d  min=%4d  max=%4d  range=%4d\n",
                    v, probeMin, probeMax, probeMax - probeMin);
    }
  }

  Serial.println("\n--- PHASE 1 RESULT ---");
  Serial.printf("Total range observed: %d\n", probeMax - probeMin);
  if (probeMax - probeMin >= 50) {
    Serial.println("✓ LED is RESPONSIVE to IR. Moving to capture mode.");
  } else {
    Serial.println("✗ LED appears DEAD or unresponsive (range < 50).");
    Serial.println("  Possible causes:");
    Serial.println("  - IR LED reversed (try swapping its legs)");
    Serial.println("  - Wrong wavelength (LED is visible/850nm, not 940nm)");
    Serial.println("  - Dead LED");
    Serial.println("  Will still attempt capture, but expect it to fail.");
  }
  Serial.println("\n--- PHASE 2: CAPTURE (waits for IR pulse) ---\n");
  delay(2000);
}

void loop() {
  // Wait for first IR detection
  unsigned long waitStart = millis();
  while (analogRead(IR_LED_PIN) <= triggerADC) {
    if (millis() - waitStart > 20000) {
      Serial.println("(20 s no signal — touch real remote to dome, press button)");
      waitStart = millis();
    }
  }

  digitalWrite(LED_PIN, LOW);

  // Capture pulse-edge transitions
  int count = 0;
  bool curMark = true;
  unsigned long edgeAt = micros();
  unsigned long lastSampleHigh = micros();

  while (count < CAPTURE_BUF) {
    bool nowMark = (analogRead(IR_LED_PIN) > triggerADC);
    unsigned long now = micros();
    if (nowMark) lastSampleHigh = now;

    if (nowMark != curMark) {
      timings[count++] = now - edgeAt;
      edgeAt = now;
      curMark = nowMark;
    }
    if (!curMark && (now - lastSampleHigh > IDLE_TIMEOUT_US)) break;
  }

  digitalWrite(LED_PIN, HIGH);

  // Dump as a sendRaw-compatible array
  Serial.println("\n========================================");
  Serial.printf("Captured %d transitions (in microseconds):\n\n", count);
  Serial.println("uint16_t rawData[] = {");
  for (int i = 0; i < count; i++) {
    Serial.printf("%lu", timings[i]);
    if (i < count - 1) Serial.print(", ");
    if ((i + 1) % 8 == 0) Serial.println();
  }
  Serial.println("\n};\n");
  Serial.printf("// Replay with: irsend.sendRaw(rawData, %d, 38);\n", count);
  Serial.println("========================================\n");
  Serial.println("Press button again for another capture, or copy the array.\n");
  delay(3000);
}
