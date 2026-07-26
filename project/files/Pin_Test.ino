/*
  ============================================================
  Pin Test — figure out your TB6612FNG wiring
  ============================================================
  Only use this if you're not sure the pin numbers in
  Arduino_Motor_Executor.ino match your shield.

  Flash this sketch by itself (not at the same time as the
  motor executor sketch). It spins "Motor A" forward for 1
  second, pauses, then spins "Motor B" forward for 1 second,
  on repeat. Watch which physical wheel actually moves and
  when, then match that to the correct AIN/BIN/PWM/STBY pins
  printed in the Serial Monitor (9600 baud).

  If NEITHER wheel moves, the most common cause is STBY not
  being wired/set HIGH — double check that pin first.
  ============================================================
*/

const int PWMA = 5, AIN1 = 7, AIN2 = 8;
const int PWMB = 6, BIN1 = 9, BIN2 = 10;
const int STBY = 4;

void setup() {
  Serial.begin(9600);
  pinMode(PWMA, OUTPUT); pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(PWMB, OUTPUT); pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT);
  digitalWrite(STBY, HIGH);
  Serial.println("Pin test starting. Watch the wheels.");
}

void loop() {
  Serial.println("Motor A forward (pins: PWMA=5, AIN1=7, AIN2=8)");
  digitalWrite(AIN1, HIGH);
  digitalWrite(AIN2, LOW);
  analogWrite(PWMA, 150);
  delay(1000);
  analogWrite(PWMA, 0);
  delay(500);

  Serial.println("Motor B forward (pins: PWMB=6, BIN1=9, BIN2=10)");
  digitalWrite(BIN1, HIGH);
  digitalWrite(BIN2, LOW);
  analogWrite(PWMB, 150);
  delay(1000);
  analogWrite(PWMB, 0);
  delay(500);
}
