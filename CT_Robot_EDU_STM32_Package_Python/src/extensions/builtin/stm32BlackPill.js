import { createStm32Board } from "../stm32/factory.js";

/* STM32 Black Pill (STM32F411CEU6, 3,3 V). Tên chân là tên thật của chip.
   Chưa kiểm chứng trên mạch thật: xem tài liệu của dự án. */
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);

export default createStm32Board({
  id: "stm32-black-pill",
  prefix: "stm32bk",
  boardName: "BLACK PILL",
  chip: "STM32F411CEU6",
  group: "STM32",
  colour: "#7c3aed",
  profileName: "STM32 BLACK PILL (F411CEU6)",
  boardFull: "STM32 Black Pill (F411CEU6)",
  description: "Mạch STM32 Black Pill (STM32F411CEU6, 100 MHz, 3,3 V). Có nút KEY (PA0); LED PC13 sáng ở mức thấp.",
  fqbn: "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE",
  pins: { leftIn1: "PB12", leftIn2: "PB13", leftEn: "PA6", rightIn1: "PB14", rightIn2: "PB15", rightEn: "PA7" },
  sensors: { trig: "PB0", echo: "PB1", lineLeft: "PB8", lineRight: "PB9", buzzer: "PB5", servo: "PB10" },
  ledPin: "PC13",
  ledName: "LED trên mạch",
  ledActiveLow: true,
  button: { pin: "PA0", name: "NÚT KEY", activeLow: true },
  bluetooth: { uart: "USART2", rx: "PA3", tx: "PA2" },
  // PA0 là nút KEY; PA2/PA3 là USART2 Bluetooth.
  digitalPins: ["PA1", "PA4", "PA5", "PA6", "PA7", "PA8", "PA15", "PB0", "PB1", ...range("PB", 3, 9), ...range("PB", 12, 15), "PC13"],
  adcPins: ["PA1", "PA4", "PA5", "PA6", "PA7", "PB0", "PB1"],
  // Core Black Pill F411CE dùng TIMER_TONE=TIM10 và TIMER_SERVO=TIM11.
  // Không đưa các chân gắn các timer này, nút KEY, Bluetooth hoặc servo vào danh sách PWM.
  pwmPins: ["PA1", "PA6", "PA7", "PA8", "PB0", "PB1", "PB4", "PB5", "PB6", "PB7"],
  timerReservations: { tone: "TIM10", servo: "TIM11" },
  pwmTimerMap: { PB8: "TIM10", PB9: "TIM11" },
  validPins: [...range("PA", 0, 15), ...range("PB", 0, 10), ...range("PB", 12, 15), "PC13", "PC14", "PC15"],
  specialPins: [
    { gpio: "PA0", role: "nút KEY của Black Pill" },
    { gpio: "PA2", role: "USART2 TX (Bluetooth)" },
    { gpio: "PA3", role: "USART2 RX (Bluetooth)" },
    { gpio: "PA9", role: "USART1 TX (Serial)" },
    { gpio: "PA10", role: "USART1 RX (Serial)" },
    { gpio: "PA11", role: "USB D-" },
    { gpio: "PA12", role: "USB D+" },
    { gpio: "PA13", role: "SWDIO (ST-Link)" },
    { gpio: "PA14", role: "SWCLK (ST-Link)" },
    { gpio: "PB2", role: "BOOT1" },
  ],
});
