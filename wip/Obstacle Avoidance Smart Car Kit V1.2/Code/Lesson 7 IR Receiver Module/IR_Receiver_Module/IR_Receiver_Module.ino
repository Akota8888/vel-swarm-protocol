#include <IRremote.h>
int RECV_PIN = 12;

void setup()
{
  Serial.begin(9600);
  IrReceiver.begin(RECV_PIN, ENABLE_LED_FEEDBACK); // Start the receiver
}

void loop() {
  if (IrReceiver.decode()) {
    // Print the 32-bit Raw Data
    Serial.print("Raw Data: 0x");
    Serial.print(IrReceiver.decodedIRData.decodedRawData, HEX);
    
    // Print the received 8-bit Command
    Serial.print("  |  Command (8-bit): 0x");
    Serial.println(IrReceiver.decodedIRData.command, HEX);
    
    IrReceiver.resume(); // Receive the next value
  }
}
