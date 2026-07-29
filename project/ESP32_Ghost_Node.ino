/*
  ============================================================
  Ghost Rover Node — Chassis-Free ESP32 (virtual agents + obstacles)
  ============================================================
  This is your 3rd ESP32. It has NO chassis, NO motors, NO ToF
  sensor, and NO serial link to any Arduino -- it's not a rover,
  it's a wireless-only broadcaster that does two things:

  1. EXTENDS ROBOT COUNT: simulates K virtual agents doing random
     walks inside the same 16x16 grid space, broadcasting their
     "discoveries" over ESP-NOW just like a real rover would.
     This lets you test the merge protocol under a higher
     effective swarm density than your 2 physical chassis allow,
     per Section VI of your paper.

  2. INJECTS IMAGINARY OBSTACLES: pre-seeds a pattern of "occupied"
     cells into its broadcast grid that don't correspond to any
     real physical obstacle in your arena. Because MAGR repulsion
     just checks "is this neighboring cell marked 1" -- it can't
     tell a real wall from an injected one -- your real rovers
     will treat these as obstacles automatically, with ZERO
     changes needed to their own firmware. This lets you test
     obstacle-avoidance behavior in a more complex virtual
     environment without physically building walls.

  IMPORTANT HONESTY NOTE: any results you get with this running
  are simulation-augmented, not a pure physical trial. If you
  write this up, say so explicitly (same as the PSO protocol
  section already does for its own pending status) -- don't let
  it get presented as an unmodified physical hardware result.

  No libraries beyond the ESP32 core needed. No ToF, no motors.
  ============================================================
*/

#include <esp_now.h>
#include <WiFi.h>

#define GRID_SIZE 16
#define NUM_VIRTUAL_AGENTS 3     // how many extra "robots" to simulate
#define GHOST_ID_BASE 100        // virtual agents report as sender_id 100,101,102...

// ---- Choose an obstacle pattern ----
// 0 = none (population extension only, no injected obstacles)
// 1 = scattered random obstacles
// 2 = a simple maze-like wall pattern
#define OBSTACLE_PATTERN 1
#define RANDOM_OBSTACLE_DENSITY 0.15f   // fraction of cells, if PATTERN==1

typedef struct struct_message {
  int sender_id;
  uint8_t grid[GRID_SIZE][GRID_SIZE];
} struct_message;

struct_message outgoingPacket;
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint8_t obstacleGrid[GRID_SIZE][GRID_SIZE];

struct VirtualAgent {
  float x, y;
  uint8_t grid[GRID_SIZE][GRID_SIZE];
};
VirtualAgent virtualAgents[NUM_VIRTUAL_AGENTS];

void buildObstaclePattern() {
  memset(obstacleGrid, 0, sizeof(obstacleGrid));
#if OBSTACLE_PATTERN == 1
  for (int x = 0; x < GRID_SIZE; x++)
    for (int y = 0; y < GRID_SIZE; y++)
      if (random(0, 1000) / 1000.0f < RANDOM_OBSTACLE_DENSITY)
        obstacleGrid[x][y] = 1;
#elif OBSTACLE_PATTERN == 2
  // simple maze: a couple of internal walls with a gap
  for (int x = 3; x < 13; x++) obstacleGrid[x][5] = 1;
  obstacleGrid[8][5] = 0;  // gap in the wall
  for (int y = 8; y < 14; y++) obstacleGrid[10][y] = 1;
#endif
}

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

  buildObstaclePattern();

  for (int i = 0; i < NUM_VIRTUAL_AGENTS; i++) {
    virtualAgents[i].x = random(2, GRID_SIZE - 2);
    virtualAgents[i].y = random(2, GRID_SIZE - 2);
    memcpy(virtualAgents[i].grid, obstacleGrid, sizeof(obstacleGrid));
  }

  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed!");
    return;
  }
  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);

  Serial.println("Ghost node ready: broadcasting virtual agents + obstacles.");
}

unsigned long lastBroadcast = 0;
unsigned long lastStep = 0;

void loop() {
  // Random-walk each virtual agent every 20ms (matches real rover loop rate)
  if (millis() - lastStep > 20) {
    lastStep = millis();
    for (int i = 0; i < NUM_VIRTUAL_AGENTS; i++) {
      VirtualAgent &a = virtualAgents[i];
      a.x += random(-100, 101) / 100.0f * 0.3f;
      a.y += random(-100, 101) / 100.0f * 0.3f;
      a.x = constrain(a.x, 0, GRID_SIZE - 1);
      a.y = constrain(a.y, 0, GRID_SIZE - 1);
      a.grid[(int)a.x][(int)a.y] = 1;
    }
  }

  // Broadcast each virtual agent's grid (obstacles + its own discoveries)
  // on the same 200ms cadence as real rovers
  if (millis() - lastBroadcast > 200) {
    lastBroadcast = millis();
    for (int i = 0; i < NUM_VIRTUAL_AGENTS; i++) {
      outgoingPacket.sender_id = GHOST_ID_BASE + i;
      memcpy(outgoingPacket.grid, virtualAgents[i].grid, sizeof(outgoingPacket.grid));
      esp_now_send(broadcastAddress, (uint8_t *)&outgoingPacket, sizeof(outgoingPacket));
      delay(5);  // small gap between packets to avoid radio collision
    }
  }
}
