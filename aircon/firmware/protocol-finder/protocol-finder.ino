// ===========================================================================
// protocol-finder.ino — figure out which IR protocol Charlie's aircon uses
// ---------------------------------------------------------------------------
// TCL TAC-09CSA/KEI is NOT in IRremoteESP8266's "TCL112AC" supported list,
// so we don't know which protocol it uses. This sketch cycles through the
// four most likely TCL-family protocols, sending a "power on, cool, 24C,
// fan auto" command on each. Watch the aircon — when it beeps or turns on,
// note the LAST line printed in Serial Monitor. That's your protocol.
//
// Wiring: same as aircon.ino (GPIO3 -> 100 ohm -> IR LED anode, GND -> cathode)
// Board:  ESP32C3 Dev Module · USB CDC On Boot: Enabled · 115200 baud
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <ir_Tcl.h>
#include <ir_Coolix.h>
#include <ir_Midea.h>
#include <ir_Gree.h>

const int IR_LED_PIN = 3;
const int LED_PIN    = 8;          // onboard blue (active LOW)
const int GAP_MS     = 5000;       // pause between protocols — give aircon time to react

IRTcl112Ac acTcl   (IR_LED_PIN);
IRCoolixAC acCoolix(IR_LED_PIN);
IRMideaAC  acMidea (IR_LED_PIN);
IRGreeAC   acGree  (IR_LED_PIN);

void blinkBlue() {
  digitalWrite(LED_PIN, LOW);  delay(80);
  digitalWrite(LED_PIN, HIGH);
}

void fireTcl112() {
  Serial.println(">>> [1/4] TCL112AC — power on, cool, 24C, fan auto");
  acTcl.setPower(true);
  acTcl.setMode(kTcl112AcCool);
  acTcl.setTemp(24);
  acTcl.setFan(kTcl112AcFanAuto);
  acTcl.send();
  blinkBlue();
}

void fireCoolix() {
  Serial.println(">>> [2/4] COOLIX — power on, cool, 24C, fan auto");
  acCoolix.on();
  acCoolix.setMode(kCoolixCool);
  acCoolix.setTemp(24);
  acCoolix.setFan(kCoolixFanAuto);
  acCoolix.send();
  blinkBlue();
}

void fireMidea() {
  Serial.println(">>> [3/4] MIDEA — power on, cool, 24C, fan auto");
  acMidea.on();
  acMidea.setMode(kMideaACCool);
  acMidea.setTemp(24, true);   // true = celsius
  acMidea.setFan(kMideaACFanAuto);
  acMidea.send();
  blinkBlue();
}

void fireGree() {
  Serial.println(">>> [4/4] GREE — power on, cool, 24C, fan auto");
  acGree.on();
  acGree.setMode(kGreeCool);
  acGree.setTemp(24);
  acGree.setFan(kGreeFanAuto);
  acGree.send();
  blinkBlue();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  acTcl.begin();
  acCoolix.begin();
  acMidea.begin();
  acGree.begin();

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  Aircon protocol finder");
  Serial.println("========================================");
  Serial.println("Point ESP32 IR LED straight at the aircon's");
  Serial.println("IR receiver window (under the LCD). 1-2m max.");
  Serial.println("WATCH the aircon. When it BEEPS or its LCD wakes,");
  Serial.println("note the LAST line printed BEFORE the reaction.");
  Serial.println("That's your protocol.");
  Serial.println("========================================\n");
  delay(3000);
}

void loop() {
  fireTcl112(); delay(GAP_MS);
  fireCoolix(); delay(GAP_MS);
  fireMidea();  delay(GAP_MS);
  fireGree();   delay(GAP_MS);

  Serial.println("\n--- full cycle done, restarting in 3s ---\n");
  delay(3000);
}
