import { createStm32Board } from "../stm32/factory.js";

/* STM32 Blue Pill (STM32F103C8T6, 3,3 V). Tên chân là tên thật của chip.
   Chưa kiểm chứng trên mạch thật: xem tài liệu của dự án. */
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);

export default createStm32Board({
  id: "stm32-blue-pill",
  prefix: "stm32bp",
  boardName: "BLUE PILL",
  chip: "STM32F103C8T6",
  group: "STM32",
  colour: "#2563eb",
  profileName: "STM32 BLUE PILL (F103C8T6)",
  boardFull: "STM32 Blue Pill (F103C8T6)",
  description: "Mạch STM32 Blue Pill (STM32F103C8T6, 72 MHz, 3,3 V). Khối lệnh riêng của mạch; LED PC13 sáng ở mức thấp.",
  fqbn: "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8",
  // ENA/ENB dùng TIM4 (PB6/PB7), tránh TIMER_TONE=TIM3 và TIMER_SERVO=TIM2
  // trong variant Blue Pill của STM32duino.
  pins: { leftIn1: "PB12", leftIn2: "PB13", leftEn: "PB6", rightIn1: "PB14", rightIn2: "PB15", rightEn: "PB7" },
  sensors: { trig: "PB0", echo: "PB1", lineLeft: "PB8", lineRight: "PB9", buzzer: "PB5", servo: "PB10" },
  ledPin: "PC13",
  ledName: "LED trên mạch",
  ledActiveLow: true,
  button: null,
  bluetooth: { uart: "USART2", rx: "PA3", tx: "PA2" },
  digitalPins: ["PA0", "PA1", ...range("PA", 4, 8), "PA15", "PB0", "PB1", ...range("PB", 3, 15), "PC13"],
  // PA2/PA3 được dành cho USART2 Bluetooth.
  adcPins: ["PA0", "PA1", ...range("PA", 4, 7), "PB0", "PB1"],
  // TIMER_TONE=TIM3, TIMER_SERVO=TIM2 theo variant_PILL_F103Cx.h.
  // Chỉ công bố các chân PWM không dùng hai timer trên; PB6/PB7 là ENA/ENB mặc định.
  pwmPins: ["PA8", "PB6", "PB7", "PB8", "PB9"],
  timerReservations: { tone: "TIM3", servo: "TIM2" },
  pwmTimerMap: {
    PA0: "TIM2", PA1: "TIM2", PA6: "TIM3", PA7: "TIM3", PB0: "TIM3", PB1: "TIM3",
    PB3: "TIM2", PB4: "TIM3", PB5: "TIM3", PB10: "TIM2",
  },
  validPins: [...range("PA", 0, 15), ...range("PB", 0, 15), "PC13", "PC14", "PC15"],
  specialPins: [
    { gpio: "PA2", role: "USART2 TX (Bluetooth)" },
    { gpio: "PA3", role: "USART2 RX (Bluetooth)" },
    { gpio: "PA9", role: "USART1 TX (Serial / nạp)" },
    { gpio: "PA10", role: "USART1 RX (Serial / nạp)" },
    { gpio: "PA11", role: "USB D-" },
    { gpio: "PA12", role: "USB D+" },
    { gpio: "PA13", role: "SWDIO (ST-Link)" },
    { gpio: "PA14", role: "SWCLK (ST-Link)" },
    { gpio: "PA15", role: "JTDI (JTAG)" },
    { gpio: "PB3", role: "JTDO (JTAG)" },
    { gpio: "PB4", role: "NJTRST (JTAG)" },
    { gpio: "PB2", role: "BOOT1" },
  ],
});
