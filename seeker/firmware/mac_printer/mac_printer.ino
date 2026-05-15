// =====================================================================
//  Seeker · MAC Address Printer
//  ---------------------------------------------------------------------
//  Tiny helper sketch — upload to BOTH boards, open Serial Monitor,
//  copy the printed MAC into the matching .ino file:
//
//    Beacon's MAC  →  goes into finder.ino   (BEACON_MAC[])
//    Finder's MAC  →  goes into beacon.ino   (FINDER_MAC[])
//
//  Board target:  ESP32-C3 Dev Module (or "ESP32C3 Super Mini")
//  USB CDC On Boot: ENABLED
//  Upload speed:    115200
//  Serial Monitor:  115200 baud
// =====================================================================

#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1500);                 // give USB-CDC a moment to come up

  WiFi.mode(WIFI_STA);         // STA mode is needed before macAddress() is valid

  Serial.println();
  Serial.println("=============================================");
  Serial.println("  SEEKER · MAC printer");
  Serial.println("=============================================");
  Serial.print  ("  MAC address: ");
  Serial.println(WiFi.macAddress());
  Serial.println();
  Serial.println("  Copy the bytes above (AA:BB:CC:DD:EE:FF)");
  Serial.println("  into the matching .ino as: { 0xAA, 0xBB, ... }");
  Serial.println("=============================================");
}

void loop() {
  // Reprint every 5 s in case Serial Monitor wasn't open yet at boot.
  delay(5000);
  Serial.print("MAC: ");
  Serial.println(WiFi.macAddress());
}
