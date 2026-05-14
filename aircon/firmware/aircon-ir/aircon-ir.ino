// ===========================================================================
// aircon-ir.ino — ESP32-C3 SuperMini firmware for the IR-LED aircon remote.
//                 LIBRARY-ENCODED version (uses IRTcl112Ac).
// ---------------------------------------------------------------------------
// Why this isn't raw-replay anymore:
//   The first round of "raw timing" captures came from a cheap receiver that
//   truncated the second frame of each press. The library couldn't decode
//   them (they showed up as UNKNOWN at 107–110 bits instead of the proper
//   TCL112AC at 112 bits). Replaying those corrupt frames at the AC produced
//   nothing useful.
//
//   The re-sniff with a better receiver showed the real protocol:
//     * Frame 1 = a constant Type-2 preamble — same for every button press,
//                 carries no state.
//     * Frame 2 = a Type-1 state frame — carries the full new AC state
//                 (Power, Mode, Temp, Fan, Swing, etc.).
//
//   The IRTcl112Ac library encodes a clean Type-1 state frame natively.
//   Every command mutates the library's internal state and calls send().
//   No raw arrays, no preamble — just a clean 112-bit TCL112AC frame.
//
//   If for some reason this AC needs the preamble first, flip SEND_PREAMBLE
//   to true below and we'll send the captured preamble bytes ahead of the
//   state frame.
//
// FIVE COMMANDS (same RTDB schema as before — phone-ir/ remote works as-is):
//   {"cmd":"power_on"}   -> ac.on()
//   {"cmd":"power_off"}  -> ac.off()
//   {"cmd":"temp_up"}    -> ac.setTemp(ac.getTemp() + 1)
//   {"cmd":"temp_down"}  -> ac.setTemp(ac.getTemp() - 1)
//   {"cmd":"swing"}      -> ac.setSwingVertical(!ac.getSwingVertical())
//
// THREE WAYS TO TRIGGER (each one ends in sendCommand()):
//   1. Phone remote  -> /aircon/ir/command on RTDB, polled at 1 Hz
//   2. Local web UI  -> http://<esp32-ip>/  five buttons
//   3. SoftAP fallback "Aircon-IR-AP" if no known WiFi within 15 s
//
// Wiring (3-pin IR transmitter module):
//   ESP32 5V    -> module VCC
//   ESP32 GND   -> module GND
//   ESP32 GPIO3 -> module DAT
//
// Library: IRremoteESP8266 by David Conran et al. (Arduino IDE Library Manager).
// Board:   "ESP32C3 Dev Module"   USB CDC On Boot: Enabled
// Baud:    115200
// ===========================================================================

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>
#include <ir_Tcl.h>

// --- WiFi --------------------------------------------------------------------
WiFiMulti wifiMulti;

// --- SoftAP fallback (offline mode) ------------------------------------------
const char* AP_SSID = "Aircon-IR-AP";
const char* AP_PASS = "aircon24";
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 15000;

// --- Firebase RTDB -----------------------------------------------------------
const char* DB_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/command.json";
const char* STATE_URL =
  "https://test-database-55379-default-rtdb.asia-southeast1.firebasedatabase.app"
  "/aircon/ir/state.json";

// --- Pins / timing -----------------------------------------------------------
const uint16_t IR_LED_PIN = 3;     // GPIO3 -> IR transmitter module DAT
const int      STATUS_LED = 8;     // onboard blue LED, active LOW
const int      POLL_MS    = 1000;

// --- IR transmitter module quirks --------------------------------------------
// 3-pin IR transmitter modules come in two flavors:
//
//   A) "Smart" / "active" modules (KY-005 etc.) — have an onboard 38 kHz
//      oscillator + driver transistor. You feed them a logic-level signal
//      (HIGH = pulse the LED at 38 kHz, LOW = LED off). Most 3-pin "combo
//      kits" sold with a receiver are this kind.
//      ==> LIBRARY_MODULATION must be FALSE (otherwise the library's 38 kHz
//          and the module's 38 kHz fight each other and the AC sees garbage).
//
//   B) "Dumb" / "passive" modules — just an IR LED with a current-limit
//      resistor on a breakout. You have to generate the 38 kHz carrier
//      yourself.
//      ==> LIBRARY_MODULATION must be TRUE.
//
// Symptom of getting this wrong: the IR LED visibly blinks on every send
// (because some signal IS coming out) but the AC ignores it. That's exactly
// what we're seeing — flipping this to false is the most likely fix.
//
// If you switch this and the AC still ignores, try LIBRARY_INVERT = true
// (some modules treat LOW input as "LED on" instead of HIGH).
// Loopback test confirmed: module is the "dumb" type (no internal carrier),
// so the library MUST modulate at 38 kHz. INVERT doesn't matter for this
// module — leaving it false.
const bool LIBRARY_MODULATION = true;
const bool LIBRARY_INVERT     = false;

// Per-command IR pair repeats. A "pair" is one preamble + one state frame,
// matching exactly what the real TCL remote sends for one button press. We
// send the pair multiple times per command so a jittery frame still gets a
// retry, but each retry starts with a fresh preamble — the AC always sees
// "preamble → state → quiet" sequences like it does from the real remote,
// not "preamble → state → state → state ..." which seems to confuse it.
const uint16_t IR_PAIR_REPEATS = 3;
const uint16_t IR_PREAMBLE_TO_STATE_GAP_MS = 25;  // gap inside one pair
const uint16_t IR_PAIR_TO_PAIR_GAP_MS = 150;       // gap between pairs

// --- Self-verify (RX listens to our own TX) ---------------------------------
// When true and an IR receiver is wired to RX_VERIFY_PIN, the firmware polls
// the receiver for ~2 s after every command and prints what it picked up.
// Lets us confirm in real-time whether the bytes we just sent decoded as
// clean TCL112AC vs. UNKNOWN at the receiver end of the kit.
// Temporarily disabling — the IRrecv ISR running on the same ESP32-C3 might
// share RMT resources with IRsend and subtly corrupt the TX carrier timing.
// Flip back to true once we know the AC is responding cleanly.
const bool     RX_VERIFY        = false;
const uint16_t RX_VERIFY_PIN    = 2;     // IR receiver OUT (same kit)
const uint16_t RX_LISTEN_MS     = 1500;  // listen window after each send

// --- State persistence (NVS) -----------------------------------------------
// The 14-byte AC state survives reboots. If the ESP32 resets between
// commands, we reload the last-sent state so e.g. a temp_up after power_on
// still has Power: On.
Preferences prefs;
const char* kPrefsNamespace = "aircon";
const char* kPrefsStateKey  = "state";

// --- AC controller (library) -------------------------------------------------
IRTcl112Ac ac(IR_LED_PIN, LIBRARY_INVERT, LIBRARY_MODULATION);

// Separate IRsend for raw-replay diagnostic mode (same pin / flags as the
// IRTcl112Ac instance, so they emit the same kind of signal).
IRsend rawIrsend(IR_LED_PIN, LIBRARY_INVERT, LIBRARY_MODULATION);

// Receiver used for self-verify mode (listens to our own TX). 1024-entry
// buffer + 15 ms timeout + save_buffer=true is the standard config from
// the loopback sketch.
IRrecv irrecv(RX_VERIFY_PIN, 1024, /*timeout_ms=*/15, /*save_buffer=*/true);
decode_results rxResults;

// --- Diagnostic: raw replay of captured POWER-ON timings --------------------
// When TEST_RAW_REPLAY_POWER_ON is true, the "power_on" command bypasses the
// library entirely and replays the EXACT mark/space timings captured from
// Charlie's real TCL remote during the last sniff session. If the real remote
// turns the AC on, this should too. If it doesn't, the problem is in the IR
// transmitter hardware path (module type, polarity, LED strength, distance,
// aim) — no firmware change will fix it.
const bool TEST_RAW_REPLAY_POWER_ON = false;

// Frame 1 of POWER ON (Type-2 preamble, captured 2026-05-15)
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
// Frame 2 of POWER ON (Type-1 state — Power:On, Cool, 24°C, Fan High, …)
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

// --- Optional preamble pass --------------------------------------------------
// The real remote sends a Type-2 preamble frame before the Type-1 state frame.
// Most TCL split-ACs obey the state frame alone, but if Charlie's TAC-09CSA/KEI
// turns out to need the preamble, flip this to true and we'll send it first.
// The real TCL remote sends a Type-2 preamble frame, gap, then the state.
// Earlier tries with this OFF (and an ON path that corrupted the preamble's
// checksum via the library) didn't make the AC respond. This time we send
// the preamble through rawIrsend.sendTcl112Ac which preserves the bytes
// verbatim (no checksum recalc).
const bool SEND_PREAMBLE = true;
const uint8_t kTclPreamble[14] = {
  0x23, 0xCB, 0x26, 0x02, 0x00, 0x40, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x65
};

// --- Runtime state -----------------------------------------------------------
WebServer server(80);
bool      inSoftAP        = false;
String    lastCmd         = "";
uint32_t  lastDurationMs  = 0;
uint32_t  sendCount       = 0;

// --- Defaults applied at boot ----------------------------------------------
// We load the captured POWER_ON state byte-for-byte via setRaw rather than
// using the library's setMode/setTemp/setFan/etc. setters. Reason: those
// setters leave stale bits from the library's reset defaults (byte[8] had
// 0x40 from SwingV's Middle default, byte[12] missed the 0x88 Light flag).
// Going raw guarantees the encoded frame matches the sniffed Frame-2 to
// the bit. From this baseline, the library's incremental setters
// (setTemp, setSwingVertical, on/off) work fine — they only touch one or
// two specific bits, so the rest of our hand-loaded state survives.
const uint8_t POWER_ON_STATE[kTcl112AcStateLength] = {
  0x23, 0xCB, 0x26, 0x01, 0x00, 0x24, 0x03, 0x07,
  0x05, 0x00, 0x00, 0x00, 0x88, 0xD0
};

void persistState() {
  prefs.begin(kPrefsNamespace, /*readOnly=*/false);
  prefs.putBytes(kPrefsStateKey, ac.getRaw(), kTcl112AcStateLength);
  prefs.end();
}

void setupAcDefaults() {
  // Try to restore the last state from NVS first. If nothing was saved yet
  // (first boot ever), fall back to the captured POWER_ON_STATE with power
  // toggled off so the phone explicitly sends power_on to start.
  uint8_t loaded[kTcl112AcStateLength];
  prefs.begin(kPrefsNamespace, /*readOnly=*/true);
  size_t got = prefs.getBytes(kPrefsStateKey, loaded, kTcl112AcStateLength);
  prefs.end();

  if (got == kTcl112AcStateLength) {
    ac.setRaw(loaded, kTcl112AcStateLength);
    Serial.println("AC state restored from NVS.");
  } else {
    ac.setRaw(POWER_ON_STATE, kTcl112AcStateLength);
    ac.off();
    Serial.println("AC state initialized to factory defaults (no NVS yet).");
  }
}

// --- Send the current AC state out the IR LED -------------------------------
void sendIR() {
  digitalWrite(STATUS_LED, LOW);
  uint32_t t0 = millis();

  // Each iteration mimics one button press on the real remote: preamble
  // frame, short gap, state frame, then a longer quiet before the next
  // "press". Doing this N times gives the AC several independent chances
  // to catch a clean pair while NEVER stacking state frames without a
  // preceding preamble (which is what previous runs were doing).
  for (uint16_t i = 0; i < IR_PAIR_REPEATS; i++) {
    if (i > 0) delay(IR_PAIR_TO_PAIR_GAP_MS);
    if (SEND_PREAMBLE) {
      rawIrsend.sendTcl112Ac(kTclPreamble, kTcl112AcStateLength, /*repeat=*/0);
      delay(IR_PREAMBLE_TO_STATE_GAP_MS);
    }
    ac.send(/*repeat=*/0);
  }

  lastDurationMs = millis() - t0;
  sendCount++;
  digitalWrite(STATUS_LED, HIGH);

  // Persist state so a reboot mid-session doesn't lose Power/Temp/Swing.
  persistState();

  // Print TX info FIRST so it's chronologically before the RX poll output.
  Serial.printf("IR %s -> %u ms (#%u)\n",
                lastCmd.c_str(),
                (unsigned)lastDurationMs,
                (unsigned)sendCount);
  Serial.print("  bytes : ");
  uint8_t* raw = ac.getRaw();
  for (uint16_t i = 0; i < kTcl112AcStateLength; i++) {
    if (raw[i] < 0x10) Serial.print('0');
    Serial.print(raw[i], HEX);
    Serial.print(' ');
  }
  Serial.println();
  Serial.print("  decode: ");
  Serial.println(ac.toString());

  // --- Self-verify: drain the RX buffer and print what we heard ourselves
  // emit. The receiver is on the same ESP32; while ac.send() was running,
  // the IRrecv ISR was buffering each frame the LED put out. We just decode
  // every buffered frame now and compare it to what we intended to send.
  if (RX_VERIFY) {
    uint8_t* sentBytes = ac.getRaw();
    uint8_t  rxCount = 0;
    uint8_t  rxClean = 0;
    uint32_t pollEnd = millis() + RX_LISTEN_MS;
    while (millis() < pollEnd) {
      if (irrecv.decode(&rxResults)) {
        rxCount++;
        bool isTcl   = (rxResults.decode_type == TCL112AC && rxResults.bits == 112);
        bool matches = false;
        if (isTcl) {
          matches = (memcmp(rxResults.state, sentBytes, kTcl112AcStateLength) == 0);
          rxClean += matches ? 1 : 0;
        }
        Serial.printf("  rx#%u %s%s ",
                      (unsigned)rxCount,
                      isTcl ? "TCL112AC" : "UNKNOWN ",
                      matches ? " MATCH" : "");
        if (isTcl) {
          for (uint16_t i = 0; i < kTcl112AcStateLength; i++) {
            if (rxResults.state[i] < 0x10) Serial.print('0');
            Serial.print(rxResults.state[i], HEX);
            Serial.print(' ');
          }
        } else {
          Serial.printf("(bits=%u)", rxResults.bits);
        }
        Serial.println();
      }
      delay(1);
    }
    Serial.printf("  rx summary: %u captures, %u clean TCL112AC matches\n",
                  (unsigned)rxCount, (unsigned)rxClean);
  }
}

void rawReplayPowerOn() {
  digitalWrite(STATUS_LED, LOW);
  uint32_t t0 = millis();

  rawIrsend.sendRaw(POWER_ON_F1, sizeof(POWER_ON_F1) / sizeof(POWER_ON_F1[0]), 38);
  delay(25);
  rawIrsend.sendRaw(POWER_ON_F2, sizeof(POWER_ON_F2) / sizeof(POWER_ON_F2[0]), 38);

  lastDurationMs = millis() - t0;
  sendCount++;
  digitalWrite(STATUS_LED, HIGH);
  Serial.printf("IR power_on (RAW REPLAY) -> %u ms (#%u)\n",
                (unsigned)lastDurationMs, (unsigned)sendCount);
  Serial.println("  (replaying captured timings byte-for-byte — if this doesn't");
  Serial.println("   work, the issue is the IR transmitter hardware, not code)");
}

bool sendCommand(const String& cmd) {
  if (cmd == "power_on" && TEST_RAW_REPLAY_POWER_ON) {
    lastCmd = cmd;
    rawReplayPowerOn();
    return true;
  }
  if (cmd == "power_on") {
    ac.on();
  } else if (cmd == "power_off") {
    ac.off();
  } else if (cmd == "temp_up") {
    ac.setTemp(ac.getTemp() + 1);      // library clamps to its kTcl112AcTempMax
  } else if (cmd == "temp_down") {
    ac.setTemp(ac.getTemp() - 1);      // library clamps to its kTcl112AcTempMin
  } else if (cmd == "swing") {
    // The library's setSwingVertical(true) sets SwingV mode to 1 (Highest
    // only), but the captured "SWING" button sets mode 7 (full vertical
    // sweep) — byte[8] bits 3-5 = 0b111. So toggle that 3-bit field
    // directly: off (0b000) <-> swing (0b111).
    uint8_t* state = ac.getRaw();
    uint8_t  swingV = (state[8] >> 3) & 0x07;
    if (swingV == 0) {
      state[8] = (state[8] & ~0x38) | (0x07 << 3);
    } else {
      state[8] &= ~0x38;
    }
  } else {
    return false;
  }

  lastCmd = cmd;
  sendIR();
  return true;
}

// --- Publish current state to Firebase /aircon/ir/state ---------------------
String stateJson() {
  String s = "{";
  s += "\"last\":\"";        s += lastCmd;                  s += "\",";
  s += "\"duration_ms\":";   s += String(lastDurationMs);   s += ",";
  s += "\"count\":";         s += String(sendCount);        s += ",";
  s += "\"power\":";         s += (ac.getPower() ? "true" : "false"); s += ",";
  s += "\"temp\":";          s += String((int)ac.getTemp());          s += ",";
  s += "\"swing\":";         s += (ac.getSwingVertical() ? "true" : "false"); s += ",";
  s += "\"ts\":";            s += String(millis());
  s += "}";
  return s;
}
void publishState() {
  if (inSoftAP || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(STATE_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(stateJson());
  http.end();
}

// --- Naive JSON extractor (same shape as autoclicker / servo aircon) --------
String extractStr(const String& body, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = body.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = body.indexOf('"', i);
  if (j < 0) return "";
  return body.substring(i, j);
}
void applyCommand(const String& body) {
  String cmd = extractStr(body, "cmd");
  if (cmd.length() == 0) return;
  if (sendCommand(cmd)) publishState();
}

// --- Built-in web UI --------------------------------------------------------
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<title>Aircon IR</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{background:radial-gradient(1200px 800px at 50% -10%,#0c4a6e 0%,#0b1220 55%,#020617 100%);
       color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
       min-height:100dvh;display:flex;flex-direction:column;align-items:center;
       padding:env(safe-area-inset-top) 1.25rem env(safe-area-inset-bottom)}
  header{width:100%;padding:1.25rem 0 .5rem;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;color:#cbd5e1;font-weight:600}
  .pill{font-size:.65rem;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;
       padding:.35rem .7rem;border-radius:999px;border:1px solid rgba(103,232,249,.25);background:rgba(8,47,73,.5)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;width:100%;max-width:22rem;padding:1.5rem 0}
  .row{display:flex;gap:.75rem;width:100%}
  .btn{flex:1;border:none;cursor:pointer;color:#fff;border-radius:1rem;padding:1.1rem .75rem;
       font-family:inherit;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.18);
       transition:transform .1s ease, background .15s ease}
  .btn:active{transform:scale(.96)}
  .btn-on{background:linear-gradient(160deg,#22d3ee 0%,#0ea5e9 60%,#0369a1 100%);border-color:rgba(125,211,252,.35)}
  .btn-off{background:linear-gradient(160deg,#475569 0%,#334155 60%,#1e293b 100%);border-color:rgba(148,163,184,.25)}
  .btn-warm{background:rgba(15,23,42,.7)}
  footer{width:100%;padding:1rem 0 1.5rem}
  .status{display:inline-flex;align-items:center;gap:.55rem;padding:.55rem 1.1rem;border-radius:999px;
       background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.15);
       font-size:.7rem;letter-spacing:.12em;font-family:"JetBrains Mono",ui-monospace,monospace;color:#94a3b8}
  .status-dot{width:.45rem;height:.45rem;border-radius:50%;background:#475569}
</style>
</head>
<body>
<header>
  <div class="brand">Aircon · IR</div>
  <div class="pill" id="lastPill">idle</div>
</header>
<main>
  <div class="row">
    <button class="btn btn-on"  data-cmd="power_on">Power On</button>
    <button class="btn btn-off" data-cmd="power_off">Power Off</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="temp_down">Temp &minus;</button>
    <button class="btn btn-warm" data-cmd="temp_up">Temp +</button>
  </div>
  <div class="row">
    <button class="btn btn-warm" data-cmd="swing">Swing</button>
  </div>
</main>
<footer style="display:flex;justify-content:center">
  <span class="status"><span class="status-dot"></span><span id="statusText">ready</span></span>
</footer>
<script>
const $=id=>document.getElementById(id);
async function fire(cmd){
  $("statusText").textContent="sending "+cmd+"...";
  try{
    const r=await fetch("/set",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cmd})});
    const j=await r.json();
    $("lastPill").textContent=j.last+" · #"+(j.count|0);
    $("statusText").textContent=(j.last||"sent")+" · "+(j.duration_ms|0)+" ms · temp "+(j.temp|0)+"\u00B0C";
  }catch(e){$("statusText").textContent="failed";}
}
document.querySelectorAll("button[data-cmd]").forEach(b=>{
  b.addEventListener("click",()=>fire(b.dataset.cmd));
});
</script>
</body>
</html>
)rawliteral";

void sendStateResp() {
  server.send(200, "application/json", stateJson());
}

void handleRoot()  { server.send_P(200, "text/html; charset=utf-8", INDEX_HTML); }
void handleState() { sendStateResp(); }
void handleSet() {
  if (!server.hasArg("plain")) { server.send(400, "text/plain", "missing body"); return; }
  applyCommand(server.arg("plain"));
  sendStateResp();
}

void clearCommand() {
  HTTPClient http;
  http.begin(DB_URL);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"\"");
  http.end();
}

void startSoftAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  inSoftAP = true;
  Serial.println("SoftAP up: " + String(AP_SSID) + " · " + WiFi.softAPIP().toString());
}

bool tryStation() {
  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi");
  unsigned long t0 = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected: " + WiFi.SSID() + " · " + WiFi.localIP().toString());
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);

  ac.begin();
  rawIrsend.begin();
  setupAcDefaults();

  if (RX_VERIFY) {
    pinMode(RX_VERIFY_PIN, INPUT_PULLUP);
    irrecv.enableIRIn(/*pullup=*/true);
    Serial.printf("RX self-verify enabled on GPIO%u — will log decoded "
                  "frames after every send.\n", (unsigned)RX_VERIFY_PIN);
  }

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH);

  wifiMulti.addAP("CAYNO", "lokomoko");
  wifiMulti.addAP("Charlie's iPhone", "charlie24");

  // WiFi station mode first; SoftAP only if no known network shows up.
  if (!tryStation()) startSoftAP();

  server.on("/", handleRoot);
  server.on("/state", HTTP_GET,  handleState);
  server.on("/set",   HTTP_POST, handleSet);
  server.onNotFound(handleRoot);
  server.begin();

  String ip = inSoftAP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  Serial.println("Web UI: http://" + ip + "/");

  publishState();
}

void loop() {
  server.handleClient();

  static unsigned long lastPoll = 0;
  if (!inSoftAP && millis() - lastPoll >= POLL_MS) {
    lastPoll = millis();
    if (wifiMulti.run() != WL_CONNECTED) return;

    HTTPClient http;
    http.begin(DB_URL);
    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      body.trim();
      if (body.length() > 2 && body != "null" && body != "\"\"") {
        Serial.println(">>> received: " + body);
        applyCommand(body);
        clearCommand();
      }
    }
    http.end();
  }

  delay(2);
}
