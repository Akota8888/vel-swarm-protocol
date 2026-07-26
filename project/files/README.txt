VEL vs. PSO RACE — SETUP GUIDE
================================

WHAT YOU NEED PER ROVER
------------------------
- 1x LAFVIN 2WD chassis + Arduino Uno R3 + TB6612FNG shield (from your kit)
- 1x ESP32-WROOM-32 dev board
- 1x VL53L1X ToF sensor (I2C)
- Jumper wires, a small breadboard
- Resistors for the voltage divider: one ~1k ohm, one ~2k ohm (any close
  values work fine, e.g. 1k+2.2k)
- 18650 batteries (already have)

LIBRARIES TO INSTALL (Arduino IDE > Sketch > Include Library > Manage Libraries)
------------------------------------------------------------
- "Adafruit VL53L1X" (installs "Adafruit BusIO" automatically)
- ESP32 board support: File > Preferences > Additional Board Manager URLs,
  add: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  then Tools > Board > Boards Manager > search "esp32" > install.

WHAT GOES ON EACH BOARD
------------------------
1. Arduino Uno R3 (both rovers): flash Arduino_Motor_Executor.ino as-is.
   Same code on both — it just executes whatever the ESP32 tells it.

2. ESP32 #1 (Rover A):
   - For the Vel-v6.0 trial: flash ESP32_Vel_v6.ino with ROBOT_ID set to 1
   - For the PSO trial:      flash ESP32_PSO_Baseline.ino with ROBOT_ID set to 1

3. ESP32 #2 (Rover B):
   - Same two files, but set ROBOT_ID to 2 before flashing.

You'll re-flash the ESP32s between the Vel trials and the PSO trials
(swap which .ino is loaded), since they're two different experiments,
not something that runs on the same boards at the same time.

WIRING CHECKLIST (do this once, works for both algorithms)
------------------------------------------------------------
[ ] VL53L1X -> ESP32: VIN->3V3, GND->GND, SDA->GPIO21, SCL->GPIO22
[ ] ESP32 GPIO17 (TX) -> Arduino pin 2 (direct wire, no resistor needed)
[ ] ESP32 GPIO16 (RX) <- Arduino pin 3, THROUGH the voltage divider:
        Arduino pin 3 --[1k]--+--[2k]-- GND
                              |
                          ESP32 GPIO16
[ ] Common ground: Arduino GND, ESP32 GND, and battery GND all tied together
[ ] TB6612FNG STBY pin wired and confirmed HIGH (nothing spins without this)

If you're not sure your TB6612FNG pins match the defaults in the code,
flash Arduino_Motor_Executor/Pin_Test/Pin_Test.ino by itself first and
watch which wheel moves when, per its comments.

RUNNING A TRIAL
------------------------
1. Power both rovers, place them at their starting positions in the arena.
2. Start your stopwatch the moment you power them on (or release them).
3. Watch the ESP32's onboard LED (usually next to the USB port) on each
   rover — it turns solid ON once that rover's own occupancy grid has
   marked 90% of its 16x16 cells explored. You can change
   COVERAGE_DONE_PERCENT in the code if you want a different threshold.
4. Stop the timer when the condition you care about is met — e.g. both
   LEDs on, or a fixed time cap if you're measuring % coverage instead
   (see the earlier discussion about picking one metric).
5. Log: trial number, algorithm (Vel or PSO), time, and any notes
   (collision, got stuck, battery low, etc).
6. Repeat for your planned number of trials per condition.

WHAT SHOULD HAPPEN
------------------------
- Vel-v6.0 trials: the two rovers should spread out and cover different
  parts of the arena.
- PSO trials: per your paper's Related Work, both rovers are expected to
  drift toward the same shared "best find" and cluster near it instead
  of spreading out — this is the premature convergence failure mode
  you're testing for. If you see this happen, that's your predicted
  result, not a malfunction.

Once you have real times from both conditions, send them to me and I'll
build the actual comparison charts for your board.
