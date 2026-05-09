// ===========================================================================
// protocol-finder.ino — figure out which IR protocol Charlie's aircon uses
// ---------------------------------------------------------------------------
// TCL TAC-09CSA/KEI is NOT in IRremoteESP8266's TCL112AC supported list,
// so we don't know which protocol it uses. This sketch cycles through the
// 16 most likely aircon protocols, sending a "power on, cool, 24C, fan auto"
// command on each. Watch the aircon — when it beeps or turns on, note the
// LAST line printed in Serial Monitor BEFORE the reaction.
//
// Wiring: same as aircon.ino (GPIO3 -> 100 ohm -> IR LED anode, GND -> cathode)
// Board:  ESP32C3 Dev Module · USB CDC On Boot: Enabled · 115200 baud
// Aim:    Point IR LED straight at aircon's IR window (under LCD), 1m max.
// ===========================================================================

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>

#include <ir_Tcl.h>
#include <ir_Coolix.h>
#include <ir_Midea.h>
#include <ir_Gree.h>
#include <ir_Sharp.h>
#include <ir_Hitachi.h>
#include <ir_Daikin.h>
#include <ir_Panasonic.h>
#include <ir_Toshiba.h>
#include <ir_Samsung.h>
#include <ir_LG.h>
#include <ir_Fujitsu.h>
#include <ir_Whirlpool.h>
#include <ir_Mitsubishi.h>
#include <ir_Carrier.h>
#include <ir_Haier.h>

const int IR_LED_PIN = 3;
const int LED_PIN    = 8;          // onboard blue (active LOW)
const int GAP_MS     = 5000;       // pause between protocols

// One sender per protocol — they all share GPIO3.
IRTcl112Ac     acTcl    (IR_LED_PIN);
IRCoolixAC     acCoolix (IR_LED_PIN);
IRMideaAC      acMidea  (IR_LED_PIN);
IRGreeAC       acGree   (IR_LED_PIN);
IRSharpAc      acSharp  (IR_LED_PIN);
IRHitachiAc    acHitachi(IR_LED_PIN);
IRDaikinESP    acDaikin (IR_LED_PIN);
IRPanasonicAc  acPana   (IR_LED_PIN);
IRToshibaAC    acToshiba(IR_LED_PIN);
IRSamsungAc    acSamsung(IR_LED_PIN);
IRLgAc         acLg     (IR_LED_PIN);
IRFujitsuAC    acFuji   (IR_LED_PIN);
IRWhirlpoolAc  acWhirl  (IR_LED_PIN);
IRMitsubishiAC acMitsu  (IR_LED_PIN);
IRCarrierAc64  acCarrier(IR_LED_PIN);
IRHaierAC      acHaier  (IR_LED_PIN);

void blinkBlue() {
  digitalWrite(LED_PIN, LOW);  delay(80);
  digitalWrite(LED_PIN, HIGH);
}

#define FIRE(label, body) do { \
  Serial.print(">>> "); Serial.println(label); \
  body; blinkBlue(); \
} while(0)

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  acTcl.begin();    acCoolix.begin();  acMidea.begin();   acGree.begin();
  acSharp.begin();  acHitachi.begin(); acDaikin.begin();  acPana.begin();
  acToshiba.begin();acSamsung.begin(); acLg.begin();      acFuji.begin();
  acWhirl.begin();  acMitsu.begin();   acCarrier.begin(); acHaier.begin();

  delay(2000);
  Serial.println("\n========================================");
  Serial.println("  Aircon protocol finder (16 brands)");
  Serial.println("========================================");
  Serial.println("Make sure aircon is OFF before starting.");
  Serial.println("Aim IR LED at aircon's IR window, 1m max.");
  Serial.println("When aircon BEEPS or LCD wakes — read Serial!");
  Serial.println("Each cycle is ~80 seconds.");
  Serial.println("========================================\n");
  delay(3000);
}

void loop() {
  FIRE("[ 1/16] TCL112AC",   { acTcl.setPower(true);    acTcl.setMode(kTcl112AcCool);     acTcl.setTemp(24); acTcl.setFan(kTcl112AcFanAuto); acTcl.send(); });
  delay(GAP_MS);
  FIRE("[ 2/16] COOLIX",     { acCoolix.on(); acCoolix.setMode(kCoolixCool); acCoolix.setTemp(24); acCoolix.setFan(kCoolixFanAuto); acCoolix.send(); });
  delay(GAP_MS);
  FIRE("[ 3/16] MIDEA",      { acMidea.on(); acMidea.setMode(kMideaACCool); acMidea.setTemp(24, true); acMidea.setFan(kMideaACFanAuto); acMidea.send(); });
  delay(GAP_MS);
  FIRE("[ 4/16] GREE",       { acGree.on(); acGree.setMode(kGreeCool); acGree.setTemp(24); acGree.setFan(kGreeFanAuto); acGree.send(); });
  delay(GAP_MS);
  FIRE("[ 5/16] SHARP",      { acSharp.on(); acSharp.setMode(kSharpAcCool); acSharp.setTemp(24); acSharp.setFan(kSharpAcFanAuto); acSharp.send(); });
  delay(GAP_MS);
  FIRE("[ 6/16] HITACHI",    { acHitachi.on(); acHitachi.setMode(kHitachiAcCool); acHitachi.setTemp(24); acHitachi.setFan(kHitachiAcFanAuto); acHitachi.send(); });
  delay(GAP_MS);
  FIRE("[ 7/16] DAIKIN",     { acDaikin.on(); acDaikin.setMode(kDaikinCool); acDaikin.setTemp(24); acDaikin.setFan(kDaikinFanAuto); acDaikin.send(); });
  delay(GAP_MS);
  FIRE("[ 8/16] PANASONIC",  { acPana.on(); acPana.setMode(kPanasonicAcCool); acPana.setTemp(24); acPana.setFan(kPanasonicAcFanAuto); acPana.send(); });
  delay(GAP_MS);
  FIRE("[ 9/16] TOSHIBA",    { acToshiba.on(); acToshiba.setMode(kToshibaAcCool); acToshiba.setTemp(24); acToshiba.setFan(kToshibaAcFanAuto); acToshiba.send(); });
  delay(GAP_MS);
  FIRE("[10/16] SAMSUNG",    { acSamsung.on(); acSamsung.setMode(kSamsungAcCool); acSamsung.setTemp(24); acSamsung.setFan(kSamsungAcFanAuto); acSamsung.send(); });
  delay(GAP_MS);
  FIRE("[11/16] LG",         { acLg.on(); acLg.setMode(kLgAcCool); acLg.setTemp(24); acLg.setFan(kLgAcFanAuto); acLg.send(); });
  delay(GAP_MS);
  FIRE("[12/16] FUJITSU",    { acFuji.on(); acFuji.setMode(kFujitsuAcModeCool); acFuji.setTemp(24); acFuji.setFanSpeed(kFujitsuAcFanAuto); acFuji.send(); });
  delay(GAP_MS);
  FIRE("[13/16] WHIRLPOOL",  { acWhirl.on(); acWhirl.setMode(kWhirlpoolAcCool); acWhirl.setTemp(24); acWhirl.setFan(kWhirlpoolAcFanAuto); acWhirl.send(); });
  delay(GAP_MS);
  FIRE("[14/16] MITSUBISHI", { acMitsu.on(); acMitsu.setMode(kMitsubishiAcCool); acMitsu.setTemp(24); acMitsu.setFan(kMitsubishiAcFanAuto); acMitsu.send(); });
  delay(GAP_MS);
  FIRE("[15/16] CARRIER",    { acCarrier.setPowerToggle(true); acCarrier.setMode(kCarrierAc64Cool); acCarrier.setTemp(24); acCarrier.setFan(kCarrierAc64FanAuto); acCarrier.send(); });
  delay(GAP_MS);
  FIRE("[16/16] HAIER",      { acHaier.on(); acHaier.setMode(kHaierAcCool); acHaier.setTemp(24); acHaier.setFan(kHaierAcFanAuto); acHaier.send(); });
  delay(GAP_MS);

  Serial.println("\n--- full cycle done, restarting in 3s ---\n");
  delay(3000);
}
