// ===========================================================================
// tsop-decoder.ino — decode Charlie's TAC-09CSA/KEI remote with a TSOP4838
// ---------------------------------------------------------------------------
// One-time sketch to figure out the exact IR protocol used by the real
// remote. Once decoded, we update the main aircon.ino to use that protocol
// (or replay the exact raw timings) and we're done forever.
//
// HARDWARE NEEDED:
//   - 1× TSOP4838 IR receiver (or VS1838B clone — same thing). 3 pins.
//   - Lazada/Shopee search: "TSOP4838" or "VS1838 IR receiver module" (~₱30-50)
//   - Walk-in: e-Gizmo Cubao, Alex's Industrial in Raon, Deeco Mandaluyong
//
// WIRING (3 wires, no resistor needed — TSOP has it built in):
//
//   TSOP4838 module pin VCC  -----> ESP32 3.3V
//   TSOP4838 module pin GND  -----> ESP32 GND
//   TSOP4838 module pin OUT  -----> ESP32 GPIO2
//
//   (If using bare 3-leg component without breakout board, pinout from
//    the front (dome facing you, leads down) is:
//      left = OUT,  middle = GND,  right = VCC.)
//
// USAGE:
//   1. Wire as above.
//   2. Upload this sketch.
//   3. Open Serial Monitor at 115200.
//   4. Hold the real TCL remote ~10cm from the TSOP4838 dome.
//   5. Press POWER button on the real remote.
//   6. Serial prints: protocol name + hex code + state bytes + raw timings.
//   7. Send the output to Claude, who'll write the final firmware.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRutils.h>

const uint16_t TSOP_PIN = 2;                  // GPIO2
const uint16_t kCaptureBufferSize = 1024;     // big enough for any aircon frame
const uint8_t  kTimeout           = 50;       // ms between frames
const uint16_t kMinUnknownSize    = 12;       // min length to even try decoding

IRrecv irrecv(TSOP_PIN, kCaptureBufferSize, kTimeout, true);
decode_results results;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(50);

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  TSOP4838 IR decoder for TAC-09CSA/KEI");
  Serial.println("========================================");
  Serial.println("Wiring check:");
  Serial.println("  TSOP VCC -> ESP32 3.3V pin");
  Serial.println("  TSOP GND -> ESP32 GND pin");
  Serial.println("  TSOP OUT -> ESP32 GPIO2");
  Serial.println();
  Serial.println("Aim the real TCL remote at the TSOP4838 dome.");
  Serial.println("Press POWER (or any button). Output below:\n");

  irrecv.setUnknownThreshold(kMinUnknownSize);
  irrecv.enableIRIn();
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println("\n--- IR signal received ---");

    // Protocol name
    Serial.print("Protocol      : ");
    Serial.println(typeToString(results.decode_type, results.repeat));

    // Bit count
    Serial.print("Bits          : ");
    Serial.println(results.bits);

    // For state-based aircon protocols, dump the state bytes
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
      // Otherwise it's a single value
      Serial.print("Value (hex)   : 0x");
      serialPrintUint64(results.value, HEX);
      Serial.println();
    }

    // Human-readable summary (decoded fields if recognized)
    Serial.print("Summary       : ");
    Serial.println(resultToHumanReadableBasic(&results));

    // Library description (description of what was decoded)
    String desc = IRAcUtils::resultAcToString(&results);
    if (desc.length() > 0) {
      Serial.print("AC fields     : ");
      Serial.println(desc);
    }

    // Always dump raw timings as a fallback for sendRaw replay
    Serial.println("\nRaw timings (for sendRaw fallback):");
    Serial.println(resultToSourceCode(&results));

    Serial.println("--- end ---\n");
    Serial.println("Press another button (e.g. POWER OFF, TEMP+, MODE)...");
    Serial.println();

    irrecv.resume();
  }
}
