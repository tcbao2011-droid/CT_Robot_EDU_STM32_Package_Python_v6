/** Danh sách FQBN mà ứng dụng cho phép gửi tới Arduino CLI. */
export const SUPPORTED_FQBNS = new Set([
  "arduino:avr:uno",
  "arduino:avr:nano:cpu=atmega328",
  "arduino:avr:nano:cpu=atmega328old",
  "esp32:esp32:esp32",
  "esp32:esp32:esp32s3",
  // STM32duino (core STMicroelectronics:stm32)
  "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8",
  "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE",
  "STMicroelectronics:stm32:Nucleo_64:pnum=NUCLEO_F401RE",
]);

export const DEFAULT_FQBN = "arduino:avr:nano:cpu=atmega328";

export function resolveFqbn(value) {
  return SUPPORTED_FQBNS.has(value) ? value : null;
}
