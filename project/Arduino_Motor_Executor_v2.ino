/*
  ============================================================
  Vel Project — Arduino Uno R3 Motor Executor (v2: verified pins)
  ============================================================
  Flash this SAME sketch onto BOTH Arduino Uno R3 boards (one
  per rover). It runs no algorithm itself -- it just listens
  for "leftSpeed,rightSpeed\n" commands over a one-way serial
  link from the ESP32 "brain" board and drives the TB6612FNG
  shield accordingly. Plug the shield straight onto the Arduino
  exactly as the LAFVIN kit instructions show -- no rewiring of
  the shield itself is needed.

  ------------------------------------------------------------
  VERIFIED PIN MAP for the LAFVIN 2WD V2.2 shield
  ------------------------------------------------------------
  Confirmed from a real teardown of this exact shield. It uses
  only ONE direction pin per motor (not two), plus a PWM speed
  pin, and does NOT expose a separate STBY pin:

      Left motor direction   -> Arduino pin D2
      Left motor speed (PWM) -> Arduino pin D5
      Right motor direction  -> Arduino pin D4
      Right motor speed (PWM)-> Arduino pin D6

  Truth table (confirmed):
      D2    D5    D4    D6    Result
      HIGH  rate  LOW   rate  drive forward
      LOW   rate  HIGH  rate  drive reverse
      LOW   rate  LOW   rate  rotate left
      HIGH  rate  HIGH  rate  rotate right

  ------------------------------------------------------------
  WIRING: Arduino <-> ESP32 serial link (ONE-WAY, no resistors)
  ------------------------------------------------------------
  Only a single wire is needed, plus a shared ground:

      ESP32 TX (GPIO17) -----------------> Arduino pin 3 (RX)

  We do NOT wire anything from the Arduino back to the ESP32,
  so there's no 5V-into-3.3V-pin risk to worry about.

  IMPORTANT: Arduino GND and ESP32 GND must still be connected
  together (shared ground rail on the breadboard), or the
  serial signal won't read correctly.
  ============================================================
*/

#include <SoftwareSerial.h>

const int ESP32_TX_TO_HERE = 3;   // Arduino pin 3 <- ESP32 TX (GPIO17)
const int UNUSED_TX_PIN    = 11;  // required by the library, not physically wired
SoftwareSerial espLink(ESP32_TX_TO_HERE, UNUSED_TX_PIN);

// ---- Verified LAFVIN V2.2 shield pins ----
const int LEFT_DIR  = 2;
const int LEFT_PWM  = 5;
const int RIGHT_DIR = 4;
const int RIGHT_PWM = 6;

String incoming = "";
unsigned long lastCommandTime = 0;
const unsigned long COMMAND_TIMEOUT_MS = 500;

void driveMotors(int leftSpeed, int rightSpeed) {
  leftSpeed  = constrain(leftSpeed, -255, 255);
  rightSpeed = constrain(rightSpeed, -255, 255);

  digitalWrite(LEFT_DIR, leftSpeed >= 0 ? HIGH : LOW);
  analogWrite(LEFT_PWM, abs(leftSpeed));

  digitalWrite(RIGHT_DIR, rightSpeed >= 0 ? LOW : HIGH);  // inverted per truth table
  analogWrite(RIGHT_PWM, abs(rightSpeed));
}

void setup() {
  pinMode(LEFT_DIR, OUTPUT);
  pinMode(LEFT_PWM, OUTPUT);
  pinMode(RIGHT_DIR, OUTPUT);
  pinMode(RIGHT_PWM, OUTPUT);
  driveMotors(0, 0);

  Serial.begin(9600);       // USB debug monitor (optional, for bench testing)
  espLink.begin(9600);      // link to ESP32

  Serial.println("Arduino motor executor ready (verified LAFVIN V2.2 pins).");
}

void loop() {
  while (espLink.available()) {
    char c = espLink.read();
    if (c == '\n') {
      int commaIndex = incoming.indexOf(',');
      if (commaIndex > 0) {
        int leftSpeed  = incoming.substring(0, commaIndex).toInt();
        int rightSpeed = incoming.substring(commaIndex + 1).toInt();
        driveMotors(leftSpeed, rightSpeed);
        lastCommandTime = millis();
      }
      incoming = "";
    } else if (c != '\r') {
      incoming += c;
    }
  }

  // Safety: if the ESP32 stops talking, stop the motors instead of
  // continuing to run on the last command.
  if (millis() - lastCommandTime > COMMAND_TIMEOUT_MS) {
    driveMotors(0, 0);
  }
}
