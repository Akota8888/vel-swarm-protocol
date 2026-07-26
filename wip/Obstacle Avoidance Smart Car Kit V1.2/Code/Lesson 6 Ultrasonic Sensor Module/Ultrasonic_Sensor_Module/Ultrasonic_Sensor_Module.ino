
#define TRIG_PIN A1
#define ECHO_PIN A0
int Ult_distance=0;

float checkdistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  float distance = pulseIn(ECHO_PIN, HIGH) / 58.00;
  delay(10);
  return distance;
}

void setup(){
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}
void loop(){
  Ult_distance = checkdistance();
  Serial.print("Distance:");
  Serial.print(Ult_distance);
  Serial.println("CM");
  delay(100);
}
