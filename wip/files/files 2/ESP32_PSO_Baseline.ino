/*
  ============================================================
  PSO Baseline — ESP32 Brain Firmware (comparison condition)
  ============================================================
  Runs a Particle Swarm Optimization steering law instead of
  MAGR — this is the baseline your paper's Related Work argues
  against. Everything else (ToF sensing, occupancy grid for
  coverage timing, ESP-NOW packet format, Arduino serial motor
  protocol, non-holonomic conversion, 50 Hz loop) is IDENTICAL
  to ESP32_Vel_v6.ino, so the race isolates the one thing that's
  actually different: the steering algorithm.

  Expected result, per your paper's Related Work: the two rovers
  should visibly converge toward the same spot (premature
  convergence) rather than spreading out to cover the arena,
  which is the specific PSO weakness your paper predicts.

  >>> Set ROBOT_ID to 1 on Rover A and 2 on Rover B. <<<

  Library and wiring: identical to ESP32_Vel_v6.ino — a ONE-WAY
  serial link (ESP32 TX -> Arduino pin 2, no resistors needed)
  plus a shared ground. See that file's header comment for the
  full VL53L1X wiring too.
  ============================================================
*/

#include <esp_now.h>
#include <WiFi.h>
#include <Wire.h>
#include "Adafruit_VL53L1X.h"

// =========================================================================
// CONFIGURATION
// =========================================================================
#define ROBOT_ID 1
#define GRID_SIZE 16
#define OBSTACLE_THRESHOLD_MM 150
#define COVERAGE_DONE_PERCENT 90
#define STATUS_LED 2

// ---- PSO tuning constants (standard Clerc/Kennedy constriction values) ----
#define PSO_INERTIA 0.72f
#define PSO_COGNITIVE 1.49f   // pulls toward this rover's own best find
#define PSO_SOCIAL 1.49f      // pulls toward the swarm's shared best find

HardwareSerial ArduinoLink(2);
Adafruit_VL53L1X tof = Adafruit_VL53L1X();

uint8_t localGrid[GRID_SIZE][GRID_SIZE];

float posX = 8.0, posY = 8.0;
float velX = 0.0, velY = 0.0;
float heading = 0.0;

// Personal best: the most unexplored-frontier-like cell this rover has
// personally found so far (fitness = unexplored neighbors around it).
float pbestX = 8.0, pbestY = 8.0;
int   pbestFitness = -1;

// Global best: the best find reported by ANY rover, including itself.
// This shared attractor is what causes PSO's premature-convergence flaw.
float gbestX = 8.0, gbestY = 8.0;
int   gbestFitness = -1;

typedef struct struct_message {
  int sender_id;
  uint8_t grid[GRID_SIZE][GRID_SIZE];
  float pbestX;
  float pbestY;
  int pbestFitness;
} struct_message;

struct_message outgoingPacket;
struct_message incomingPacket;
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

int localFitness(int cx, int cy) {
  // Higher score = more unexplored space nearby = a more attractive
  // frontier for the swarm to converge toward.
  int score = 0;
  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      int tx = cx + dx, ty = cy + dy;
      if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
        if (localGrid[tx][ty] == 0) score++;
      }
    }
  }
  return score;
}

int percentExplored() {
  int count = 0;
  for (int x = 0; x < GRID_SIZE; x++)
    for (int y = 0; y < GRID_SIZE; y++)
      if (localGrid[x][y] == 1) count++;
  return (count * 100) / (GRID_SIZE * GRID_SIZE);
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *data, int len) {
  memcpy(&incomingPacket, data, sizeof(incomingPacket));
  for (int x = 0; x < GRID_SIZE; x++)
    for (int y = 0; y < GRID_SIZE; y++)
      localGrid[x][y] |= incomingPacket.grid[x][y];

  if (incomingPacket.pbestFitness > gbestFitness) {
    gbestFitness = incomingPacket.pbestFitness;
    gbestX = incomingPacket.pbestX;
    gbestY = incomingPacket.pbestY;
  }
}

void sendMotorCommand(int leftPWM, int rightPWM) {
  ArduinoLink.print(leftPWM);
  ArduinoLink.print(",");
  ArduinoLink.print(rightPWM);
  ArduinoLink.print("\n");
}

void setup() {
  Serial.begin(115200);
  ArduinoLink.begin(9600, SERIAL_8N1, 16, 17);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  memset(localGrid, 0, sizeof(localGrid));
  randomSeed(analogRead(0) + ROBOT_ID);

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

  Serial.printf("PSO baseline node %d ready.\n", ROBOT_ID);
}

unsigned long lastBroadcast = 0;

void loop() {
  int currentX = constrain((int)posX, 0, GRID_SIZE - 1);
  int currentY = constrain((int)posY, 0, GRID_SIZE - 1);
  localGrid[currentX][currentY] = 1;

  if (tof.dataReady()) {
    int16_t distance = tof.distance();
    tof.clearInterrupt();
    if (distance > 0 && distance < OBSTACLE_THRESHOLD_MM) {
      int aheadX = constrain(currentX + (int)round(cos(heading)), 0, GRID_SIZE - 1);
      int aheadY = constrain(currentY + (int)round(sin(heading)), 0, GRID_SIZE - 1);
      localGrid[aheadX][aheadY] = 1;
    }
  }

  int fitnessHere = localFitness(currentX, currentY);
  if (fitnessHere > pbestFitness) {
    pbestFitness = fitnessHere;
    pbestX = currentX;
    pbestY = currentY;
  }
  if (pbestFitness > gbestFitness) {
    gbestFitness = pbestFitness;
    gbestX = pbestX;
    gbestY = pbestY;
  }

  // ---- Classic PSO velocity update ----
  float r1 = random(0, 1000) / 1000.0f;
  float r2 = random(0, 1000) / 1000.0f;
  velX = PSO_INERTIA * velX
       + PSO_COGNITIVE * r1 * (pbestX - posX)
       + PSO_SOCIAL    * r2 * (gbestX - posX);
  velY = PSO_INERTIA * velY
       + PSO_COGNITIVE * r1 * (pbestY - posY)
       + PSO_SOCIAL    * r2 * (gbestY - posY);

  // ---- Convert to non-holonomic (2WD) steering (identical to Vel sketch) ----
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

  digitalWrite(STATUS_LED, percentExplored() >= COVERAGE_DONE_PERCENT ? HIGH : LOW);

  if (millis() - lastBroadcast > 200) {
    lastBroadcast = millis();
    outgoingPacket.sender_id = ROBOT_ID;
    memcpy(outgoingPacket.grid, localGrid, sizeof(localGrid));
    outgoingPacket.pbestX = pbestX;
    outgoingPacket.pbestY = pbestY;
    outgoingPacket.pbestFitness = pbestFitness;
    esp_now_send(broadcastAddress, (uint8_t *)&outgoingPacket, sizeof(outgoingPacket));
  }

  delay(20);
}
