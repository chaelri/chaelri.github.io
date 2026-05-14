// ===========================================================================
// loopback.ino — IR transmitter self-test using the same-kit IR receiver.
// ---------------------------------------------------------------------------
// Why this exists:
//   We've replayed Charlie's captured TCL112AC frames byte-for-byte, tried
//   every modulation/invert combo, and the AC still won't obey. Before
//   declaring it a hardware problem, we want one more piece of data:
//   does the IR transmitter actually emit a signal the matching receiver
//   can decode?
//
//   This sketch wires BOTH halves of the kit to the same ESP32-C3 and fires
//   the captured POWER_ON timings every 4 s out of the transmitter. The
//   receiver listens continuously and prints anything it picks up. Three
//   possible outcomes:
//
//     A) RX logs TCL112AC at 112 bits with state bytes matching the original
//        sniff (23 CB 26 02 …  then  23 CB 26 01 …). The transmitter is
//        emitting valid IR. The problem with the AC is something else —
//        distance, line-of-sight, AC IR window blocked, or this particular
//        TCL model wanting different bytes than the library produced.
//
//     B) RX logs SOMETHING but the protocol shows "UNKNOWN" or the bits
//        count is weird (e.g. 80, 90, 200). The transmitter is emitting,
//        but the signal is malformed. Likely cause: modulation flag wrong
//        for this module type. Flip LIBRARY_MODULATION below and reflash.
//
//     C) RX logs NOTHING at all across multiple TX fires. The transmitter
//        is not emitting recognizable IR. This is the hardware verdict —
//        wiring, dead LED, wrong polarity, or module is just bad.
//
// WIRING (BOTH modules to the same ESP32-C3):
//   IR transmitter VCC -> 3V3
//   IR transmitter GND -> GND
//   IR transmitter DAT -> GPIO3
//   IR receiver    VCC -> 3V3
//   IR receiver    GND -> GND
//   IR receiver    OUT -> GPIO2
//
//   Aim the two modules at each other from 10–30 cm. Slight angle is fine.
//   Don't put them touching — IR receivers can saturate from too much light.
//
// Board: "ESP32C3 Dev Module", USB CDC On Boot: Enabled.  Baud: 115200.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

// --- Pins -------------------------------------------------------------------
const uint16_t TX_PIN = 3;   // IR transmitter DAT
const uint16_t RX_PIN = 2;   // IR receiver OUT

// --- Cadence ----------------------------------------------------------------
const uint32_t SEND_INTERVAL_MS = 4000;

// --- IR transmitter library flags (flip these to debug) --------------------
// Try the combinations one at a time, reflashing between each:
//   1. MODULATION=true,  INVERT=false   (library default, for "dumb" IR LEDs)
//   2. MODULATION=false, INVERT=false   (for "smart" 3-pin modules with
//                                        their own onboard 38 kHz carrier)
//   3. MODULATION=true,  INVERT=true    (inverted-polarity dumb LED)
//   4. MODULATION=false, INVERT=true    (inverted-polarity smart module)
//
// For each combo, watch whether RX prints "TCL112AC" + matching state bytes.
const bool LIBRARY_MODULATION = true;
const bool LIBRARY_INVERT     = false;

// --- IR receiver / capture --------------------------------------------------
const uint16_t kCaptureBufferSize = 1024;
const uint8_t  kTimeout           = 15;
const uint16_t kMinUnknownSize    = 12;
const uint8_t  kTolerancePercentage = kTolerance;

IRsend irsend(TX_PIN, LIBRARY_INVERT, LIBRARY_MODULATION);
IRrecv irrecv(RX_PIN, kCaptureBufferSize, kTimeout, /*save_buffer=*/true);
decode_results results;

// === Captured POWER_ON raw timings from the most recent sniff ==============
// Frame 1: Type-2 preamble (constant across all buttons).
// Frame 2: Type-1 state (Power:On, Cool, 24°C, Fan High, SwingV Auto, …).

const uint16_t POWER_ON_F1[] = {
  3072, 1630,  436, 1150,  440, 1146,  466,  352,  442,  378,
   440,  380,  464, 1122,  526,  258,  558,  264,  554, 1062,
   530, 1056,  532,  246,  574, 1054,  530,  248,  572,  246,
   574, 1054,  532, 1054,  530,  248,  572, 1056,  530, 1056,
   528,  252,  568,  252,  568, 1056,  528,  254,  566,  252,
   566,  252,  568, 1056,  528,  256,  564,  254,  564,  254,
   564,  256,  564,  252,  566,  254,  564,  254,  566,  252,
   566,  254,  564,  254,  564,  254,  566,  254,  566,  252,
   566,  254,  564,  254,  564,  254,  564,  254,  564,  254,
   564,  254,  564,  254,  564, 1058,  528,  256,  562,  258,
   562,  256,  562,  258,  562,  258,  562,  256,  562,  256,
   562,  256,  562,  258,  562,  256,  562,  258,  562,  258,
   560,  258,  560,  258,  562,  256,  562,  256,  562,  256,
   562,  256,  564,  256,  562,  256,  562,  256,  562,  256,
   562,  256,  564,  254,  564,  254,  566,  250,  568,  252,
   568,  250,  568,  250,  570,  248,  572,  248,  572,  246,
   572,  246,  572,  246,  572,  248,  568,  252,  566,  252,
   560,  266,  524,  322,  470,  354,  462,  356,  462,  356,
   486,  330,  464,  356,  468,  350,  462,  356,  462,  356,
   462,  356,  462,  270,  576,  328,  466,  356,  488,  328,
   466,  356,  486,  328,  492,  326,  492,  326,  494,  326,
   494, 1070,  516,  324,  494, 1070,  514,  288,  530,  324,
   494, 1074,  512, 1094,  490,  326,  492
};

const uint16_t POWER_ON_F2[] = {
  3098, 1578,  512, 1074,  512, 1074,  512,  292,  524,  294,
   524,  296,  522, 1076,  510,  294,  524,  296,  522, 1076,
   510, 1076,  508,  298,  520, 1078,  498,  314,  516,  298,
   496, 1122,  486, 1100,  486,  302,  516, 1100,  462, 1122,
   464,  334,  484,  336,  482, 1124,  462,  336,  482,  336,
   482, 1124,  464,  336,  482,  336,  482,  338,  482,  336,
   482,  336,  482,  336,  482,  338,  482,  336,  482,  336,
   482,  336,  482,  336,  482,  336,  484,  336,  480,  338,
   486,  334,  480,  338,  480,  338,  498, 1108,  462,  338,
   480,  338,  480, 1124,  462,  338,  480,  338,  480, 1122,
   462, 1124,  462,  340,  480,  360,  458,  360,  460,  360,
   458,  360,  460,  360,  464, 1118,  462, 1124,  462, 1124,
   462,  360,  460,  360,  458,  360,  458,  360,  458,  360,
   458, 1124,  462,  360,  458, 1124,  462,  360,  458,  360,
   460,  360,  458,  360,  458,  360,  460,  360,  458,  360,
   460,  360,  458,  360,  458,  360,  458,  360,  458,  360,
   458,  360,  458,  360,  458,  360,  458,  360,  458,  360,
   458,  360,  458,  360,  458,  360,  458,  360,  458,  360,
   458,  360,  458,  362,  456,  362,  456,  362,  456,  364,
   456,  362,  456,  362,  456,  362,  456,  362,  456,  362,
   456,  364,  454, 1130,  456,  364,  454,  364,  454,  366,
   454, 1132,  452,  366,  452,  366,  452,  366,  450,  368,
   452, 1160,  426,  368,  450, 1160,  422, 1164,  420
};

// --- State ------------------------------------------------------------------
uint32_t lastSendMs = 0;
uint32_t sendCount  = 0;
uint32_t recvCount  = 0;

void printRxResult() {
  recvCount++;
  Serial.println();
  Serial.printf("[RX #%u, t=%us]  -- captured something! --\n",
                (unsigned)recvCount, (unsigned)(millis() / 1000));
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
    Serial.println("  >>> compare to ORIGINAL sniff bytes:");
    Serial.println("      F1 should be: 23 CB 26 02 00 40 00 00 00 00 00 00 00 65");
    Serial.println("      F2 should be: 23 CB 26 01 00 24 03 07 05 00 00 00 88 D0");
  } else {
    Serial.print  ("  value    : 0x");
    Serial.println(uint64ToString(results.value, 16));
  }
  Serial.print  ("  summary  : ");
  Serial.println(resultToHumanReadableBasic(&results));
}

void fireTransmitter() {
  sendCount++;
  Serial.println();
  Serial.printf("[TX #%u, t=%us]  firing POWER_ON raw timings out GPIO%u "
                "(mod=%s, inv=%s)\n",
                (unsigned)sendCount, (unsigned)(millis() / 1000),
                (unsigned)TX_PIN,
                LIBRARY_MODULATION ? "true" : "false",
                LIBRARY_INVERT     ? "true" : "false");
  irsend.sendRaw(POWER_ON_F1, sizeof(POWER_ON_F1) / sizeof(POWER_ON_F1[0]), 38);
  delay(25);
  irsend.sendRaw(POWER_ON_F2, sizeof(POWER_ON_F2) / sizeof(POWER_ON_F2[0]), 38);
  Serial.println("  TX done. If RX picks it up you'll see two [RX #...] entries");
  Serial.println("  within ~1 s. If nothing shows up after 3-4 fires, RX isn't");
  Serial.println("  seeing what TX emits => transmitter hardware path is bad.");
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 5000) delay(50);
  delay(500);

  pinMode(RX_PIN, INPUT_PULLUP);
  irrecv.setUnknownThreshold(kMinUnknownSize);
  irrecv.setTolerance(kTolerancePercentage);
  irrecv.enableIRIn(/*pullup=*/true);

  irsend.begin();

  Serial.println();
  Serial.println("====================================================================");
  Serial.println(" IR Loopback Test — TX(GPIO3)  -->  RX(GPIO2)");
  Serial.println("====================================================================");
  Serial.printf (" TX flags : MODULATION=%s, INVERT=%s\n",
                 LIBRARY_MODULATION ? "true" : "false",
                 LIBRARY_INVERT     ? "true" : "false");
  Serial.printf (" Cadence  : fires POWER_ON every %u ms\n",
                 (unsigned)SEND_INTERVAL_MS);
  Serial.println();
  Serial.println(" Aim the TX and RX modules at each other from 10-30 cm apart.");
  Serial.println(" Don't put them in direct contact (RX will saturate).");
  Serial.println();
  Serial.println(" Watch the log:");
  Serial.println("   * TX fires every 4 s.");
  Serial.println("   * If TX emits valid IR, RX will print a matching frame.");
  Serial.println("   * If RX is silent across 3+ TX fires, the TX hardware is the");
  Serial.println("     problem (LED, module, or wiring) — not the firmware.");
  Serial.println();
}

void loop() {
  if (irrecv.decode(&results)) printRxResult();

  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();
    fireTransmitter();
  }

  delay(2);
}
