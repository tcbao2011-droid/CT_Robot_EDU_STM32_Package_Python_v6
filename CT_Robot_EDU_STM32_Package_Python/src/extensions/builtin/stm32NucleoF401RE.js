import { createStm32Board } from "../stm32/factory.js";

/* ST NUCLEO-F401RE (STM32F401RET6, 3,3 V). Nhãn khối ghi cả tên chân Arduino (D5, A0...)
   lẫn tên chân chip (PB4, PA0...). Chưa kiểm chứng trên mạch thật. */
const ARDUINO = {
  PA3: "D0", PA2: "D1", PA10: "D2", PB3: "D3", PB5: "D4", PB4: "D5", PB10: "D6", PA8: "D7",
  PA9: "D8", PC7: "D9", PB6: "D10", PA7: "D11", PA6: "D12", PA5: "D13", PB9: "D14", PB8: "D15",
  PA0: "A0", PA1: "A1", PA4: "A2", PB0: "A3", PC1: "A4", PC0: "A5",
};
const label = pin => [ARDUINO[pin] ? `${ARDUINO[pin]} (${pin})` : pin, pin];

const digital = ["PA0", "PA1", "PA4", "PA5", "PA6", "PA7", "PA8", "PA9", "PA10", "PB0", "PB3", "PB4", "PB5", "PB6", "PB8", "PB9", "PB10", "PC0", "PC1", "PC7"];
const adc = ["PA0", "PA1", "PA4", "PA5", "PA6", "PA7", "PB0", "PC0", "PC1"];
// Danh sách PWM hiện có của profile Nucleo-F401RE; không suy diễn timer dự trữ khi chưa xác minh variant cụ thể.
const pwm = ["PA0", "PA1", "PA6", "PA7", "PA8", "PA9", "PA10", "PB0", "PB3", "PB4", "PB5", "PB6", "PB8", "PB9", "PB10", "PC7"];

const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);

export default createStm32Board({
  id: "stm32-nucleo-f401re",
  prefix: "stm32nuc",
  boardName: "NUCLEO-F401RE",
  chip: "STM32F401RET6",
  group: "STM32",
  colour: "#0891b2",
  profileName: "ST NUCLEO-F401RE",
  boardFull: "ST NUCLEO-F401RE",
  description: "Mạch ST NUCLEO-F401RE (STM32F401RET6, 84 MHz, 3,3 V, ST-LINK tích hợp). LED LD2 (PA5/D13) sáng ở mức cao, nút USER B1 (PC13). Bluetooth dùng USART6 vì USART2 là cổng ảo ST-LINK.",
  fqbn: "STMicroelectronics:stm32:Nucleo_64:pnum=NUCLEO_F401RE",
  pins: { leftIn1: "PA9", leftIn2: "PC7", leftEn: "PB4", rightIn1: "PB10", rightIn2: "PA8", rightEn: "PB6" },
  sensors: { trig: "PA7", echo: "PA6", lineLeft: "PA0", lineRight: "PA1", buzzer: "PB5", servo: "PB3" },
  ledPin: "PA5",
  ledName: "LED LD2",
  ledActiveLow: false,
  button: { pin: "PC13", name: "NÚT USER B1", activeLow: true },
  bluetooth: { uart: "USART6", rx: "PA12", tx: "PA11" },
  digitalPins: digital.map(label),
  adcPins: adc.map(label),
  pwmPins: pwm.map(label),
  validPins: [...range("PA", 0, 15), ...range("PB", 0, 15), ...range("PC", 0, 15), "PD2"],
  specialPins: [
    { gpio: "PA11", role: "USART6 TX (Bluetooth) / USB D-" },
    { gpio: "PA12", role: "USART6 RX (Bluetooth) / USB D+" },
    { gpio: "PA2", role: "USART2 TX — cổng ảo ST-LINK (Serial)" },
    { gpio: "PA3", role: "USART2 RX — cổng ảo ST-LINK (Serial)" },
    { gpio: "PA13", role: "SWDIO (ST-LINK)" },
    { gpio: "PA14", role: "SWCLK (ST-LINK)" },
    { gpio: "PC13", role: "nút USER B1" },
  ],
});
