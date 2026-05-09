// ===========================================================================
// ir-replay.ino — replay the captured raw IR timings at the aircon.
// ---------------------------------------------------------------------------
// Uses the clean middle section of Charlie's capture #3 (from
// ir-led-receiver-v2 output). No protocol decoding — just blast the timing
// array verbatim through IRsend.sendRaw() with a 38 kHz carrier.
//
// Wiring: SAME as aircon.ino — GPIO3 -> 100Ω -> IR LED anode (long, +),
//         IR LED cathode (short, -) -> GND.
//
// USAGE:
//   1. Upload, open Serial Monitor at 115200.
//   2. AIM the ESP32's IR LED at the aircon's IR window (~1m).
//   3. Sketch fires the captured pattern every 5 seconds.
//   4. Watch the aircon. If it beeps / wakes / changes state → SUCCESS.
//      That means our raw capture is good enough to control it.
//   5. If nothing happens after a few cycles, switch to the alternate
//      arrays below by changing which one ACTIVE_RAW points to, OR
//      paste a fresh capture from another run.
//
// To paste a fresh capture from ir-led-receiver-v2.ino:
//   - Run that sketch, copy the uint16_t array from Serial Monitor,
//     replace the contents of `rawCapture3` below, recompile, upload.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

const int IR_LED_PIN = 3;
const int LED_PIN    = 8;

IRsend irsend(IR_LED_PIN);

// Cleaned middle of capture #3 (skipped 4 entries of pre-frame noise +
// trailing garbage at the end). Starts on a mark, alternates mark/space.
uint16_t rawCapture3[] = {
  4059, 3202, 4873, 3446, 4968, 3012, 5346, 2871,
  5441, 3446, 4969, 2822, 5345, 3060, 5346, 2822,
  5400, 3012, 5395, 2775, 5443, 3012, 5353, 2816,
  5496, 2870, 5536, 2775, 5442, 3019, 5965, 2917,
  4304, 3060, 4968, 3345, 4776, 3582, 4872, 3446,
  4628, 3685, 4966, 3345, 4683, 3684, 4966, 3393,
  4634, 3725, 4826, 3447, 4677, 3589, 4824, 3536,
  4636, 3684, 4825, 3536, 4587, 3725, 4824, 3494,
  4629, 3683, 4872, 3487, 4539, 3779, 4872, 3441,
  4634, 3678, 4871, 3446, 4583, 3779, 4919, 3345,
  4731, 3636, 4921, 3345, 4729, 3678, 4920, 3399,
  4723, 3541, 4824, 3535, 4681, 3637, 4960, 3399,
  4582, 3732, 4777, 3541, 4392, 3922
};
const int rawCapture3_len = sizeof(rawCapture3) / sizeof(rawCapture3[0]);

// Active array — change this line to test different captures.
#define ACTIVE_RAW       rawCapture3
#define ACTIVE_RAW_LEN   rawCapture3_len

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  irsend.begin();

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  IR replay — captured TAC-09CSA/KEI signal");
  Serial.println("========================================");
  Serial.printf("Replaying array of %d transitions @ 38 kHz\n", ACTIVE_RAW_LEN);
  Serial.println("AIM the IR LED at the aircon's IR window.");
  Serial.println("Fires every 5 sec.\n");
}

void loop() {
  Serial.println(">>> firing replay");
  digitalWrite(LED_PIN, LOW);
  irsend.sendRaw(ACTIVE_RAW, ACTIVE_RAW_LEN, 38);
  digitalWrite(LED_PIN, HIGH);
  delay(5000);
}
