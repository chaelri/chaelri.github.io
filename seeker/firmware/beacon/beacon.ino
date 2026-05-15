// =====================================================================
//  Seeker · BEACON (Board A — the "hidden" device, no OLED)
//  ---------------------------------------------------------------------
//  Role:
//    • Broadcasts a tiny ESP-NOW packet ~10× per second.
//    • Listens for a 1-byte "ack" from the Finder.
//    • Onboard LED blinks slow when alone, fast when Finder is hearing.
//
//  Hardware:
//    ESP32-C3 Super Mini (no display). Onboard LED on GPIO8 (active LOW).
//
//  Setup:
//    1. Upload  mac_printer.ino  to the FINDER first, note its MAC.
//    2. Paste that MAC into  FINDER_MAC[]  below.
//    3. Upload this sketch to the BEACON.
//
//  Arduino board settings:
//    Board:            ESP32C3 Dev Module
//    USB CDC On Boot:  Enabled
//    CPU Freq:         160 MHz
//    Flash Size:       4MB
//    Partition:        Default 4MB with spiffs
//
//  Compile requirements (IMPORTANT — read or you'll get errors):
//    • Arduino-ESP32 core v3.0.0 or newer.
//      The ESP-NOW recv callback signature changed between v2.x and v3.x:
//        v3.x:  void cb(const esp_now_recv_info_t *info, const uint8_t *data, int len)
//        v2.x:  void cb(const uint8_t *mac,             const uint8_t *data, int len)
//      This sketch uses the v3.x signature. If you see an error like
//        "invalid conversion from 'void(*)(const esp_now_recv_info_t*, ...'"
//      then go to Boards Manager → "esp32 by Espressif Systems" → install 3.0.0+.
//    • No external libraries — everything used here is built into the ESP32 core.
// =====================================================================

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// ===== EDIT THIS: the Finder board's MAC address =====================
//  Get this by running mac_printer.ino on the Finder.
//  Replace the six bytes below.
uint8_t FINDER_MAC[6] = { 0x70, 0xAF, 0x09, 0x3B, 0xD1, 0xEC };

// ===== Pins / timing knobs ===========================================
const int      LED_PIN              = 8;     // onboard LED (active LOW)
const uint32_t BROADCAST_INTERVAL   = 100;   // ms between packets (10 Hz)
const uint32_t ACK_TIMEOUT_MS       = 3000;  // Finder counts as "out of range" after this
const uint32_t BLINK_FAST_PERIOD_MS = 250;   // when Finder is hearing us
const uint32_t BLINK_SLOW_PERIOD_MS = 1000;  // when alone

// ===== Packet shape ==================================================
// Keep this small — ESP-NOW packets up to 250 bytes are allowed but smaller
// = faster + less radio congestion.
struct __attribute__((packed)) BeaconPacket {
  uint32_t seq;   // increments each send (debug aid)
  uint32_t ms;    // millis() at send time
};

// ===== State =========================================================
BeaconPacket pkt    = {0, 0};
uint32_t lastSendMs = 0;
uint32_t lastAckMs  = 0;
bool     finderHeard = false;

// ===== Callbacks =====================================================

// Sent callback — useful for debugging only; we don't gate on this.
void onDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  // Logic remains the same, the compiler just needs these specific parameter types
  // Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

// Receive callback — Finder sends back a 1-byte ack.
// Signature matches Arduino-ESP32 core v3.x (newer info struct).
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  // Any reply from the Finder counts — content doesn't matter.
  lastAckMs    = millis();
  finderHeard  = true;
}

// ===== Setup =========================================================
void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);   // OFF (active LOW)

  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("[seeker · beacon] booting...");

  // STA mode is mandatory for ESP-NOW.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("[seeker · beacon] ESP-NOW init FAILED — halting");
    while (true) { delay(1000); }
  }

  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  // Register the Finder as a peer so we can unicast to it.
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, FINDER_MAC, 6);
  peer.channel = 0;      // 0 = use current channel
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) {
    Serial.println("[seeker · beacon] failed to add Finder peer");
  }

  Serial.printf("[seeker · beacon] my MAC: %s\n", WiFi.macAddress().c_str());
  Serial.printf("[seeker · beacon] broadcasting to: %02X:%02X:%02X:%02X:%02X:%02X\n",
                FINDER_MAC[0], FINDER_MAC[1], FINDER_MAC[2],
                FINDER_MAC[3], FINDER_MAC[4], FINDER_MAC[5]);
  Serial.println("[seeker · beacon] ready");
}

// ===== Loop ==========================================================
void loop() {
  uint32_t now = millis();

  // ---- 1. Send a packet every BROADCAST_INTERVAL ms ----
  if (now - lastSendMs >= BROADCAST_INTERVAL) {
    lastSendMs = now;
    pkt.seq++;
    pkt.ms = now;
    esp_now_send(FINDER_MAC, (uint8_t *)&pkt, sizeof(pkt));
  }

  // ---- 2. Did we lose contact with the Finder? ----
  if (finderHeard && (now - lastAckMs > ACK_TIMEOUT_MS)) {
    finderHeard = false;
    Serial.println("[seeker · beacon] finder went silent");
  }

  // ---- 3. Blink the onboard LED ----
  //   slow blink (1 Hz)  → no Finder in range
  //   fast blink (4 Hz)  → Finder is hearing us
  uint32_t period = finderHeard ? BLINK_FAST_PERIOD_MS : BLINK_SLOW_PERIOD_MS;
  bool ledOn = ((now / (period / 2)) % 2) == 0;
  digitalWrite(LED_PIN, ledOn ? LOW : HIGH);   // active LOW
}
