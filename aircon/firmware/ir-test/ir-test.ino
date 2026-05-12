// ===========================================================================
// ir-test.ino — minimum-viable diagnostic for the IR LED + resistor + GPIO3
//               wiring. NOT a real IR signal — just a 1 Hz DC blink so you
//               can see, on a phone camera, whether GPIO3 is driving the
//               LED at all.
// ---------------------------------------------------------------------------
// USAGE
//   1. Upload this sketch to the same ESP32-C3.
//   2. Open phone camera (FRONT cam — most front cams have no IR filter;
//      rear cams usually do).
//   3. Aim at the IR LED dome ~10 cm away.
//   4. Look at the LED dome ON THE PHONE SCREEN.
//
// EXPECTED
//   * IR LED dome flashes faint purple/white on camera every 1 second
//   * Onboard blue LED on the ESP32 board flashes in sync (for reference)
//   * Serial Monitor prints "ON" / "OFF" every 500 ms at 115200 baud
//
// INTERPRETATION
//   - IR LED flashes on camera + blue flashes in sync ........ wiring OK,
//     the issue in aircon.ino is in the IR protocol, not the hardware.
//   - Blue flashes but IR LED stays dark on camera ........... wiring/LED
//     problem. Check anode/cathode (long leg = anode = resistor side),
//     check resistor contact, check GPIO3 vs other-pin mislabel.
//   - Neither blinks ......................................... wrong board
//     selected / sketch didn't upload / something deeper.
// ===========================================================================

const int IR_LED_PIN  = 3;   // GPIO3 -> 100 ohm -> IR LED anode (long leg)
const int BLUE_LED    = 8;   // onboard reference LED (active LOW)

void setup() {
  Serial.begin(115200);
  pinMode(IR_LED_PIN, OUTPUT);
  pinMode(BLUE_LED,   OUTPUT);
  digitalWrite(IR_LED_PIN, LOW);
  digitalWrite(BLUE_LED,   HIGH);  // off (active LOW)
  delay(1000);
  Serial.println("ir-test starting — watch the IR LED dome with a phone camera");
}

void loop() {
  digitalWrite(IR_LED_PIN, HIGH);   // IR LED on
  digitalWrite(BLUE_LED,   LOW);    // blue LED on (active LOW)
  Serial.println("ON");
  delay(500);

  digitalWrite(IR_LED_PIN, LOW);    // IR LED off
  digitalWrite(BLUE_LED,   HIGH);   // blue LED off
  Serial.println("OFF");
  delay(500);
}
