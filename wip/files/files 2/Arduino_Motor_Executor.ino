/*
  ============================================================
  Vel Project — Arduino Uno R3 Motor Executor
  ============================================================
  Flash this SAME sketch onto BOTH Arduino Uno R3 boards (one
  per rover). It does not run any algorithm — it just listens
  for "leftSpeed,rightSpeed\n" commands over a serial link from
  the ESP32 "brain" board and drives the TB6612FNG motor shield
  accordingly. All Vel-v6.0 / PSO logic lives on the ESP32.

  ------------------------------------------------------------
  WIRING: TB6612FNG shield -> Arduino Uno
  ------------------------------------------------------------
  Your LAFVIN V2 kit uses a TB6612FNG driver, NOT an L298N.
  The pin numbers below are the shield's typical default
  mapping. CHECK the silkscreen labels on your shield before
  trusting this — if it's wired differently, just edit the
  six numbers below to match. If you aren't sure, use the
  separate "Pin_Test" sketch included in this folder first.

      TB6612FNG pin        Arduino Uno pin
      -------------------  ---------------
      PWMA (left speed)    5   (PWM ~)
      AIN1 (left dir)      7
      AIN2 (left dir)      8
      PWMB (right speed)   6   (PWM ~)
      BIN1 (right dir)     9
      BIN2 (right dir)     10
      STBY (enable)        4

  ------------------------------------------------------------
  WIRING: Arduino <-> ESP32 serial link (ONE-WAY, no resistors)
  ------------------------------------------------------------
  This build uses a ONE-WAY link: the ESP32 sends motor commands
  to the Arduino, and the Arduino never talks back. That means
  only a single wire is needed, and no voltage divider is
  required at all.

      ESP32 TX (GPIO17) -----------------> Arduino pin 2 (RX)

  That's it — one wire, plus a shared ground between the two
  boards (see below). We do NOT wire anything from the Arduino
  back to the ESP32, so there's no 5V-into-3.3V-pin risk to
  worry about.

  IMPORTANT: Arduino GND and ESP32 GND must still be connected
  together (through the breadboard's ground rail), or the
  serial signal won't read correctly even with the one wire
  connected.
  ============================================================
*/

#include <SoftwareSerial.h>

const int ESP32_TX_TO_HERE = 2;   // Arduino pin 2 <- ESP32 TX (GPIO17)
const int UNUSED_TX_PIN    = 11;  // required by the library, not physically wired
SoftwareSerial espLink(ESP32_TX_TO_HERE, UNUSED_TX_PIN);

// ---- TB6612FNG pin map (edit if yours differs) ----
const int PWMA = 5;   // left motor speed
const int AIN1 = 7;   // left motor direction
const int AIN2 = 8;
const int PWMB = 6;   // right motor speed
const int BIN1 = 9;   // right motor direction
const int BIN2 = 10;
const int STBY = 4;   // must be HIGH or NOTHING will spin

String incoming = "";
unsigned long lastCommandTime = 0;
const unsigned long COMMAND_TIMEOUT_MS = 500;  // stop if ESP32 goes silent

void setMotor(int pwmPin, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed >= 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
  } else {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    speed = -speed;
  }
  analogWrite(pwmPin, speed);
}

void stopMotors() {
  setMotor(PWMA, AIN1, AIN2, 0);
  setMotor(PWMB, BIN1, BIN2, 0);
}

void setup() {
  pinMode(PWMA, OUTPUT);
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT);
  pinMode(BIN1, OUTPUT);
  pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  digitalWrite(STBY, HIGH);  // enable the driver chip
  stopMotors();

  Serial.begin(9600);       // USB debug monitor (optional, for bench testing)
  espLink.begin(9600);      // link to ESP32

  Serial.println("Arduino motor executor ready.");
}

void loop() {
  while (espLink.available()) {
    char c = espLink.read();
    if (c == '\n') {
      int commaIndex = incoming.indexOf(',');
      if (commaIndex > 0) {
        int leftSpeed  = incoming.substring(0, commaIndex).toInt();
        int rightSpeed = incoming.substring(commaIndex + 1).toInt();
        setMotor(PWMA, AIN1, AIN2, leftSpeed);
        setMotor(PWMB, BIN1, BIN2, rightSpeed);
        lastCommandTime = millis();
      }
      incoming = "";
    } else if (c != '\r') {
      incoming += c;
    }
  }

  // Safety: if the ESP32 stops talking (crash, disconnect, still booting),
  // stop the motors instead of continuing to run on the last command.
  if (millis() - lastCommandTime > COMMAND_TIMEOUT_MS) {
    stopMotors();
  }
}
