/*
  ============================================================
  Vel-v6.0 — ESP32 Brain Firmware (MAGR condition)
  ============================================================
  Runs the Map-Aware Gradient Repulsion swarm protocol. Reads
  a forward-facing VL53L1X ToF sensor over I2C, maintains a
  local occupancy grid, merges maps with the other rover over
  ESP-NOW, and sends "leftSpeed,rightSpeed\n" motor commands to
  the Arduino R3 over a serial wire.

  >>> Set ROBOT_ID to 1 on Rover A and 2 on Rover B. <<<

  ------------------------------------------------------------
  LIBRARY NEEDED (Arduino IDE: Sketch > Include Library > Manage Libraries)
  ------------------------------------------------------------
    "Adafruit VL53L1X" by Adafruit
    (Adafruit BusIO will install automatically as a dependency)

  ------------------------------------------------------------
  WIRING
  ------------------------------------------------------------
  VL53L1X ToF sensor (I2C), mounted facing forward on the rover:
      VIN -> ESP32 3V3
      GND -> ESP32 GND
      SDA -> ESP32 GPIO21
      SCL -> ESP32 GPIO22

  Serial link to the Arduino (see Arduino_Motor_Executor.ino for
  the matching wiring and the REQUIRED voltage divider):
      ESP32 TX (GPIO17) -> Arduino pin 2
      ESP32 RX (GPIO16) <- Arduino pin 3 (through the divider)

  Onboard status LED (most ESP32 dev boards: GPIO2) lights up
  solid once the local grid is READING >= COVERAGE_DONE_PERCENT
  explored, so you have a visual "stop the stopwatch" cue during
  an untethered race without needing a laptop nearby.
  ============================================================
*/

#include <esp_now.h>
#include <WiFi.h>
#include <Wire.h>
#include "Adafruit_VL53L1X.h"

// =========================================================================
// CONFIGURATION
// =========================================================================
#define ROBOT_ID 1                 // 1 on Rover A, 2 on Rover B
#define GRID_SIZE 16
#define REPULSION_GAIN 1.5f        // matches G = 1.5 from your paper
#define MOMENTUM_MU 0.99f          // matches mu = 0.99 from your paper
#define OBSTACLE_THRESHOLD_MM 150  // treat anything closer than this as a wall
#define COVERAGE_DONE_PERCENT 90   // status LED threshold
#define STATUS_LED 2

HardwareSerial ArduinoLink(2);   // ESP32 UART2
Adafruit_VL53L1X tof = Adafruit_VL53L1X();

uint8_t localGrid[GRID_SIZE][GRID_SIZE];

// Continuous pose state (non-holonomic 2WD kinematics, same model as your paper)
float posX = 8.0, posY = 8.0;
float velX = 0.0, velY = 0.0;
float heading = 0.0;

typedef struct struct_message {
  int sender_id;
  uint8_t grid[GRID_SIZE][GRID_SIZE];
} struct_message;

struct_message outgoingPacket;
struct_message incomingPacket;
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *data, int len) {
  memcpy(&incomingPacket, data, sizeof(incomingPacket));
  for (int x = 0; x < GRID_SIZE; x++)
    for (int y = 0; y < GRID_SIZE; y++)
      localGrid[x][y] |= incomingPacket.grid[x][y];
}

void sendMotorCommand(int leftPWM, int rightPWM) {
  ArduinoLink.print(leftPWM);
  ArduinoLink.print(",");
  ArduinoLink.print(rightPWM);
  ArduinoLink.print("\n");
}

int percentExplored() {
  int count = 0;
  for (int x = 0; x < GRID_SIZE; x++)
    for (int y = 0; y < GRID_SIZE; y++)
      if (localGrid[x][y] == 1) count++;
  return (count * 100) / (GRID_SIZE * GRID_SIZE);
}

void setup() {
  Serial.begin(115200);
  ArduinoLink.begin(9600, SERIAL_8N1, 16, 17);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  memset(localGrid, 0, sizeof(localGrid));

  Wire.begin();
  if (!tof.begin(0x29, &Wire)) {
    Serial.println("VL53L1X not found - check wiring!");
  }
  tof.startRanging();

  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed!");
    return;
  }
  esp_now_register_recv_cb(OnDataRecv);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);

  Serial.printf("Vel-v6.0 MAGR node %d ready.\n", ROBOT_ID);
}

unsigned long lastBroadcast = 0;

void loop() {
  int currentX = constrain((int)posX, 0, GRID_SIZE - 1);
  int currentY = constrain((int)posY, 0, GRID_SIZE - 1);
  localGrid[currentX][currentY] = 1;

  // Read the forward ToF sensor; mark the cell ahead as blocked if close.
  if (tof.dataReady()) {
    int16_t distance = tof.distance();
    tof.clearInterrupt();
    if (distance > 0 && distance < OBSTACLE_THRESHOLD_MM) {
      int aheadX = constrain(currentX + (int)round(cos(heading)), 0, GRID_SIZE - 1);
      int aheadY = constrain(currentY + (int)round(sin(heading)), 0, GRID_SIZE - 1);
      localGrid[aheadX][aheadY] = 1;
    }
  }

  // ---- Map-Aware Gradient Repulsion (3x3 Moore neighborhood, r=1) ----
  float forceX = 0, forceY = 0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      int tx = currentX + dx, ty = currentY + dy;
      if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
        if (localGrid[tx][ty] == 1) {
          forceX -= dx * REPULSION_GAIN * 0.33f;
          forceY -= dy * REPULSION_GAIN * 0.33f;
        }
      }
    }
  }

  velX = (MOMENTUM_MU * velX) + ((1.0f - MOMENTUM_MU) * forceX);
  velY = (MOMENTUM_MU * velY) + ((1.0f - MOMENTUM_MU) * forceY);

  // ---- Convert to non-holonomic (2WD) steering commands ----
  float targetHeading = atan2(velY, velX);
  float angleError = targetHeading - heading;
  while (angleError > PI) angleError -= 2 * PI;
  while (angleError < -PI) angleError += 2 * PI;

  float linearCmd = cos(angleError) * sqrt(velX * velX + velY * velY);
  float angularCmd = 1.2f * angleError;

  heading += angularCmd * 0.02f;
  posX += linearCmd * cos(heading) * 0.02f;
  posY += linearCmd * sin(heading) * 0.02f;

  int leftPWM  = constrain((int)((linearCmd - angularCmd) * 255), -255, 255);
  int rightPWM = constrain((int)((linearCmd + angularCmd) * 255), -255, 255);
  sendMotorCommand(leftPWM, rightPWM);

  // Status LED: solid once coverage threshold reached (your "stop timer" cue)
  digitalWrite(STATUS_LED, percentExplored() >= COVERAGE_DONE_PERCENT ? HIGH : LOW);

  if (millis() - lastBroadcast > 200) {
    lastBroadcast = millis();
    outgoingPacket.sender_id = ROBOT_ID;
    memcpy(outgoingPacket.grid, localGrid, sizeof(localGrid));
    esp_now_send(broadcastAddress, (uint8_t *)&outgoingPacket, sizeof(outgoingPacket));
  }

  delay(20);  // ~50 Hz loop, matches your paper's control loop rate
}
