import { HARDWARE_PROFILES } from "../hardwareProfiles.js";

/* Quy tắc kiểm tra GPIO dành riêng cho trợ lý AI.
 * Board thông dụng: chỉ cảnh báo/cấm chân đặc biệt theo MCU.
 * STM32: bổ sung các chân ngoại vi đã gán trong cấu hình board để cảnh báo trùng chức năng.
 * CT Expansion: giữ nguyên map cố định trên PCB và đồng thời kiểm tra chân đặc biệt ESP32.
 */
export function buildAssistantPinRules(profile, activeExtensions = [], hardwareConfig = {}) {
  const reserved = new Map();
  const specialWarnings = new Map();
  const blockedPins = new Map();
  const isCtExpansion = profile?.id === "ct-expansion-esp32";

  // Một extension profile có thể không khai báo pinRules riêng. Khi đó lấy quy tắc
  // cấp MCU từ profile chuẩn gần nhất, thay vì bỏ sót chân flash/strap/input-only.
  const fallbackRules = profile?.platform === "esp32"
    ? (profile?.mcu === "ESP32-S3"
      ? HARDWARE_PROFILES.ESP32_S3_L298N?.pinRules
      : HARDWARE_PROFILES.ESP32_L298N?.pinRules)
    : HARDWARE_PROFILES.ARDUINO_NANO_L298N?.pinRules;
  const rules = profile?.pinRules || fallbackRules || {};
  const inputOnlyPins = new Set(rules.inputOnlyPins || []);
  const pinKey = raw => {
    if (typeof raw === "string" && /^P[A-H]\d{1,2}$/i.test(raw.trim())) return raw.trim().toUpperCase();
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  };

  for (const item of rules.blockedPins || []) {
    const key = pinKey(item.gpio);
    if (key !== null) blockedPins.set(key, item.role);
  }
  for (const item of rules.specialWarnings || []) {
    const key = pinKey(item.gpio);
    if (key !== null) specialWarnings.set(key, item.role);
  }

  if (isCtExpansion) {
    for (const extension of activeExtensions) {
      (extension.pins || []).forEach(pin => reserved.set(Number(pin.gpio), pin.role));
    }
    const names = {
      leftIn1: "motor trái IN1", leftIn2: "motor trái IN2", leftEn: "motor trái PWM",
      rightIn1: "motor phải IN3", rightIn2: "motor phải IN4", rightEn: "motor phải PWM",
      trig: "cảm biến siêu âm TRIG", echo: "cảm biến siêu âm ECHO",
      lineLeft: "cảm biến line trái", lineRight: "cảm biến line phải",
    };
    for (const group of ["pins", "sensors"]) {
      for (const [key, value] of Object.entries(hardwareConfig[group] || {})) {
        const pin = Number(value);
        if (Number.isInteger(pin) && pin >= 0 && !reserved.has(pin)) reserved.set(pin, names[key] || key);
      }
    }
  } else if (profile?.platform === "stm32") {
    // Chân đã được cấu hình cho motor/cảm biến/LED/servo là tài nguyên của mạch.
    // Khối GPIO tổng quát vẫn có thể đọc/chọn chúng, nhưng AI phải cảnh báo xung đột.
    const names = {
      leftIn1: "motor trái IN1", leftIn2: "motor trái IN2", leftEn: "motor trái ENA/PWM",
      rightIn1: "motor phải IN3", rightIn2: "motor phải IN4", rightEn: "motor phải ENB/PWM",
      trig: "HC-SR04 TRIG", echo: "HC-SR04 ECHO", lineLeft: "cảm biến dò line trái",
      lineRight: "cảm biến dò line phải", buzzer: "còi", servo: "servo", led: "LED trên mạch",
    };
    for (const group of ["pins", "sensors"]) {
      for (const [name, raw] of Object.entries(hardwareConfig[group] || {})) {
        const key = pinKey(raw);
        if (key !== null && !reserved.has(key)) reserved.set(key, names[name] || name);
      }
    }
    const rx = pinKey(profile.bluetoothPins?.rx);
    const tx = pinKey(profile.bluetoothPins?.tx);
    if (rx !== null) specialWarnings.set(rx, `${profile.bluetoothUart || "UART"} Bluetooth RX`);
    if (tx !== null) specialWarnings.set(tx, `${profile.bluetoothUart || "UART"} Bluetooth TX`);
  } else if (profile?.platform === "esp32") {
    // UART2 được firmware sử dụng cho Bluetooth trên các profile ESP32 thông thường.
    if (Number.isInteger(profile.bluetoothPins?.rx)) specialWarnings.set(profile.bluetoothPins.rx, "UART2 Bluetooth RX");
    if (Number.isInteger(profile.bluetoothPins?.tx)) specialWarnings.set(profile.bluetoothPins.tx, "UART2 Bluetooth TX");
  } else if (profile?.platform === "avr") {
    // Bluetooth dùng Serial0 trên UNO/Nano nên D0/D1 đã nằm trong specialWarnings.
  }

  return {
    reserved,
    blockedPins,
    specialWarnings,
    inputOnlyPins,
    gpioMin: rules.gpioMin ?? 0,
    gpioMax: rules.gpioMax ?? (profile?.platform === "esp32" ? (profile?.mcu === "ESP32-S3" ? 48 : 39) : 19),
    invalidGpioRanges: rules.invalidRanges || [],
    validPinNames: new Set((rules.validPins || []).map(pin => String(pin).trim().toUpperCase())),
    digitalPinNames: new Set((rules.digitalPins || []).map(pin => String(pin).trim().toUpperCase())),
    adcPinNames: new Set((rules.adcPins || []).map(pin => String(pin).trim().toUpperCase())),
    pwmPinNames: new Set((rules.pwmPins || []).map(pin => String(pin).trim().toUpperCase())),
    isCtExpansion,
  };
}
