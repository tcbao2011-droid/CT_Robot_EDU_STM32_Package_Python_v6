import { PROGRAM_HELPER_USED, PROGRAM_CPP_HELPERS } from "./programRuntime.js";
// Chân UART cho module Bluetooth HC-05/HC-06 trên ESP32 (Serial2).
// HC-05 TX -> BT_RX_PIN, HC-05 RX -> BT_TX_PIN (qua mạch chia áp 5V->3.3V).
// Cặp chân dự phòng khi profile không khai báo riêng; profile ESP32 chính thức có cặp UART2 riêng.
export const BT_RX_PIN = 16;
export const BT_TX_PIN = 17;

export const ROBOT_TYPES = {
  TWO_WHEEL: "2WD",
  FOUR_WHEEL: "4WD",
};

const AVR_NANO_PINS = {
  leftIn1: 7,
  leftIn2: 8,
  leftEn: 5,
  rightIn1: 9,
  rightIn2: 10,
  rightEn: 6,
};

const AVR_SENSORS = {
  trig: 2,
  echo: 4,
  lineLeft: 11,
  lineRight: 12,
  led: 13,
  buzzer: 3,
  servo: "A0",
};

// Chỉ các chân có vai trò đặc biệt theo MCU/bo mạch được cảnh báo bởi AI.
// Đây KHÔNG phải danh sách chân được profile mẫu sử dụng cho motor/cảm biến.
const AVR_PIN_RULES = {
  gpioMin: 0,
  gpioMax: 19, // D0..D13 và A0..A5 theo ánh xạ số 14..19
  blockedPins: [],
  inputOnlyPins: [],
  invalidRanges: [],
  specialWarnings: [
    { gpio: 0, role: "UART RX / cổng nạp USB" },
    { gpio: 1, role: "UART TX / cổng nạp USB" },
    { gpio: 10, role: "SPI SS" },
    { gpio: 11, role: "SPI MOSI" },
    { gpio: 12, role: "SPI MISO" },
    { gpio: 13, role: "LED tích hợp / SPI SCK" },
    { gpio: 18, role: "A4 / I2C SDA" },
    { gpio: 19, role: "A5 / I2C SCL" },
  ],
};

const ESP32_CLASSIC_PIN_RULES = {
  gpioMin: 0,
  gpioMax: 39,
  blockedPins: Array.from({ length: 6 }, (_, i) => ({ gpio: i + 6, role: "SPI Flash nội bộ ESP32" })),
  inputOnlyPins: [34, 35, 36, 37, 38, 39],
  invalidRanges: [],
  specialWarnings: [
    { gpio: 0, role: "chân boot-strapping (BOOT)" },
    { gpio: 2, role: "chân boot-strapping" },
    { gpio: 5, role: "chân boot-strapping / VSPI" },
    { gpio: 12, role: "chân boot-strapping (MTDI)" },
    { gpio: 15, role: "chân boot-strapping (MTDO)" },
    { gpio: 1, role: "UART0 TX / cổng nạp và Serial Monitor" },
    { gpio: 3, role: "UART0 RX / cổng nạp và Serial Monitor" },
  ],
};

const ESP32_S3_PIN_RULES = {
  gpioMin: 0,
  gpioMax: 48,
  blockedPins: Array.from({ length: 7 }, (_, i) => ({ gpio: i + 26, role: "Flash/PSRAM trên module ESP32-S3 phổ biến" })),
  inputOnlyPins: [46],
  invalidRanges: [[22, 25]],
  specialWarnings: [
    { gpio: 0, role: "chân boot-strapping" },
    { gpio: 3, role: "chân boot-strapping" },
    { gpio: 45, role: "chân boot-strapping" },
    { gpio: 46, role: "chân boot-strapping / input-only" },
    { gpio: 19, role: "USB D- trên ESP32-S3 native USB" },
    { gpio: 20, role: "USB D+ trên ESP32-S3 native USB" },
    { gpio: 43, role: "UART0 TX / Serial Monitor trên nhiều board S3" },
    { gpio: 44, role: "UART0 RX / Serial Monitor trên nhiều board S3" },
  ],
};

// Hardware registry. Pin numbers are defaults for the named board; users can still customize the GPIOs in the hardware panel.
export const HARDWARE_PROFILES = {
  CT_BOARD: {
    id: "ct-robot-edu-board",
    name: "CT ROBOT EDU BOARD (ESP32)",
    description: "Bo mạch CT ROBOT EDU, giữ nguyên sơ đồ chân mặc định của dự án.",
    board: "CT ROBOT EDU (ESP32)",
    mcu: "ESP32",
    platform: "esp32",
    fqbn: "esp32:esp32:esp32",
    core: "esp32:esp32 (Arduino-ESP32 3.x)",
    pwmMode: "ledc",
    pins: { leftIn1: 25, leftIn2: 26, leftEn: 27, rightIn1: 32, rightIn2: 33, rightEn: 14 },
    sensors: { trig: 5, echo: 18, lineLeft: 19, lineRight: 21, led: 2, buzzer: 4, servo: 13 },
    pinRules: ESP32_CLASSIC_PIN_RULES,
    bluetoothPins: { rx: 16, tx: 17 },
  },
  ESP32_L298N: {
    id: "esp32-devkit",
    name: "ESP32 DevKit V1",
    description: "Cấu hình mẫu cho ESP32 DevKit V1 / ESP32 Dev Module.",
    board: "ESP32 DevKit V1",
    mcu: "ESP32",
    platform: "esp32",
    fqbn: "esp32:esp32:esp32",
    core: "esp32:esp32 (Arduino-ESP32 3.x)",
    pwmMode: "ledc",
    pins: { leftIn1: 25, leftIn2: 26, leftEn: 27, rightIn1: 32, rightIn2: 33, rightEn: 14 },
    sensors: { trig: 23, echo: 22, lineLeft: 19, lineRight: 21, led: 4, buzzer: 16, servo: 17 },
    pinRules: ESP32_CLASSIC_PIN_RULES,
    bluetoothPins: { rx: 18, tx: 13 },
  },
  ESP32_FREE: {
    id: "esp32-free",
    name: "ESP32 DevKit V1 (tự chọn GPIO)",
    description: "ESP32 DevKit V1 với GPIO do người dùng tự cấu hình.",
    board: "ESP32 DevKit V1",
    mcu: "ESP32",
    platform: "esp32",
    fqbn: "esp32:esp32:esp32",
    core: "esp32:esp32 (Arduino-ESP32 3.x)",
    pwmMode: "ledc",
    pins: { leftIn1: 25, leftIn2: 26, leftEn: 27, rightIn1: 32, rightIn2: 33, rightEn: 14 },
    sensors: { trig: 23, echo: 22, lineLeft: 19, lineRight: 21, led: 4, buzzer: 16, servo: 17 },
    pinRules: ESP32_CLASSIC_PIN_RULES,
    bluetoothPins: { rx: 18, tx: 13 },
  },
  ESP32_S3_L298N: {
    id: "esp32-s3-devkit",
    name: "ESP32-S3 Dev Module",
    description: "Cấu hình tham khảo cho ESP32-S3 Dev Module; kiểm tra sơ đồ chân đúng với phiên bản board đang dùng.",
    board: "ESP32-S3 Dev Module",
    mcu: "ESP32-S3",
    platform: "esp32",
    fqbn: "esp32:esp32:esp32s3",
    core: "esp32:esp32 (Arduino-ESP32 3.x)",
    pwmMode: "ledc",
    // Dùng GPIO ngoại vi thông dụng; tránh các chân USB 19/20, strap 0/3/45/46
    // và nhóm flash/PSRAM 26-32 trên cấu hình S3 phổ biến.
    pins: { leftIn1: 4, leftIn2: 5, leftEn: 6, rightIn1: 7, rightIn2: 8, rightEn: 9 },
    sensors: { trig: 10, echo: 11, lineLeft: 12, lineRight: 13, led: 15, buzzer: 16, servo: 17 },
    pinRules: ESP32_S3_PIN_RULES,
    bluetoothPins: { rx: 18, tx: 21 },
  },
  ARDUINO_UNO_L298N: {
    id: "arduino-uno",
    name: "Arduino UNO R3",
    description: "Arduino UNO R3 (ATmega328P), chân ENA/ENB mặc định nằm trên chân PWM 5 và 6.",
    board: "Arduino UNO R3",
    mcu: "ATmega328P",
    platform: "avr",
    fqbn: "arduino:avr:uno",
    core: "arduino:avr",
    pwmMode: "analogWrite",
    pins: { ...AVR_NANO_PINS },
    sensors: { ...AVR_SENSORS },
    pinRules: AVR_PIN_RULES,
  },
  ARDUINO_NANO_L298N: {
    id: "arduino-nano",
    name: "Arduino Nano Classic (ATmega328P)",
    description: "Arduino Nano Classic ATmega328P; tương thích sơ đồ chân UNO, ENA/ENB dùng PWM 5 và 6.",
    board: "Arduino Nano Classic",
    mcu: "ATmega328P",
    platform: "avr",
    fqbn: "arduino:avr:nano:cpu=atmega328",
    core: "arduino:avr",
    pwmMode: "analogWrite",
    pins: { ...AVR_NANO_PINS },
    sensors: { ...AVR_SENSORS },
    pinRules: AVR_PIN_RULES,
  },
  ARDUINO_NANO_OLD_BOOTLOADER: {
    id: "arduino-nano-old-bootloader",
    name: "Arduino Nano Classic (bootloader cũ)",
    description: "Dành cho Nano clone dùng bootloader cũ; cùng sơ đồ GPIO với Nano ATmega328P.",
    board: "Arduino Nano Classic (old bootloader)",
    mcu: "ATmega328P",
    platform: "avr",
    fqbn: "arduino:avr:nano:cpu=atmega328old",
    core: "arduino:avr",
    pwmMode: "analogWrite",
    pins: { ...AVR_NANO_PINS },
    sensors: { ...AVR_SENSORS },
    pinRules: AVR_PIN_RULES,
  },
  ARDUINO_UNO_FREE: {
    id: "arduino-uno-free",
    name: "Arduino UNO R3 (tự chọn GPIO)",
    description: "Arduino UNO R3 với GPIO do người dùng tự cấu hình.",
    board: "Arduino UNO R3",
    mcu: "ATmega328P",
    platform: "avr",
    fqbn: "arduino:avr:uno",
    core: "arduino:avr",
    pwmMode: "analogWrite",
    pins: { ...AVR_NANO_PINS },
    sensors: { ...AVR_SENSORS },
    pinRules: AVR_PIN_RULES,
  },
  ARDUINO_NANO_FREE: {
    id: "arduino-nano-free",
    name: "Arduino Nano Classic (tự chọn GPIO)",
    description: "Arduino Nano Classic ATmega328P với GPIO do người dùng tự cấu hình.",
    board: "Arduino Nano Classic",
    mcu: "ATmega328P",
    platform: "avr",
    fqbn: "arduino:avr:nano:cpu=atmega328",
    core: "arduino:avr",
    pwmMode: "analogWrite",
    pins: { ...AVR_NANO_PINS },
    sensors: { ...AVR_SENSORS },
    pinRules: AVR_PIN_RULES,
  },
};

export const BOARD_GROUPS = [
  { label: "Arduino Nano Classic", ids: ["arduino-nano", "arduino-nano-old-bootloader", "arduino-nano-free"] },
  { label: "Arduino UNO R3", ids: ["arduino-uno", "arduino-uno-free"] },
  { label: "ESP32", ids: ["ct-robot-edu-board", "esp32-devkit", "esp32-free"] },
  { label: "ESP32-S3", ids: ["esp32-s3-devkit"] },
];

/* =====================================================
   EXTENSION HOOKS
   Registry (src/extensions) đăng ký profile và đóng góp
   vào sketch qua các hàm bên dưới; core không import
   registry để tránh vòng phụ thuộc.
===================================================== */

let extensionProvider = null;

export function setExtensionProvider(provider) {
  extensionProvider = provider;
}

const extensionProfileKey = id => `EXT_${String(id).toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

export function registerHardwareProfile(profile, groupLabel = "Mạch mở rộng") {
  const key = extensionProfileKey(profile.id);
  const clash = Object.entries(HARDWARE_PROFILES).find(([k, p]) => p.id === profile.id && k !== key);
  if (clash) throw new Error(`Profile id "${profile.id}" đã tồn tại (${clash[0]})`);

  HARDWARE_PROFILES[key] = profile;
  let group = BOARD_GROUPS.find(item => item.label === groupLabel);
  if (!group) {
    group = { label: groupLabel, ids: [] };
    BOARD_GROUPS.push(group);
  }
  if (!group.ids.includes(profile.id)) group.ids.push(profile.id);
}

export function unregisterHardwareProfile(id) {
  delete HARDWARE_PROFILES[extensionProfileKey(id)];
  BOARD_GROUPS.forEach(group => {
    group.ids = group.ids.filter(item => item !== id);
  });
}

export const DEFAULT_HARDWARE_CONFIG = {
  robotType: ROBOT_TYPES.TWO_WHEEL,
  profileId: HARDWARE_PROFILES.ARDUINO_NANO_L298N.id,
  pins: { ...HARDWARE_PROFILES.ARDUINO_NANO_L298N.pins },
  sensors: { ...HARDWARE_PROFILES.ARDUINO_NANO_L298N.sensors },
  motor: {
    pwmFrequency: 1000,
    pwmResolution: 8,
    invertLeft: false,
    invertRight: false,
    turnMsPerDegree: 6,
    leftScale: 100,
    rightScale: 100,
  },
};

/** Mã định danh cũ (có chữ L298N) -> mã mới, để file/cấu hình cũ vẫn nhận ra đúng mạch. */
export const LEGACY_PROFILE_IDS = {
  "arduino-nano-l298n": "arduino-nano",
  "arduino-uno-l298n": "arduino-uno",
  "esp32-l298n": "esp32-devkit",
  "esp32-s3-l298n": "esp32-s3-devkit",
};

export function getHardwareProfile(profileId) {
  const resolvedId = LEGACY_PROFILE_IDS[profileId] || profileId;
  return Object.values(HARDWARE_PROFILES).find(profile => profile.id === resolvedId)
    || HARDWARE_PROFILES.ARDUINO_NANO_L298N;
}

export function profileToConfig(profileId, robotType = ROBOT_TYPES.TWO_WHEEL) {
  const profile = getHardwareProfile(profileId);
  return {
    robotType,
    profileId: profile.id,
    pins: { ...profile.pins },
    sensors: { ...profile.sensors },
    motor: { ...DEFAULT_HARDWARE_CONFIG.motor },
  };
}


/** Trả về cấu hình GPIO mặc định của profile, không giữ các chỉnh sửa trước đó. */
export function resetHardwareConfig(profileId, robotType = ROBOT_TYPES.TWO_WHEEL) {
  return profileToConfig(profileId, robotType);
}

/** Chỉ mạch có khối di chuyển (CT Expansion Board) mới cần chân động cơ; các mạch khác bỏ qua. */
export const profileHasMotors = profile => Boolean(profile?.hasMotors);

export function validateHardwareConfig(config) {
  const profile = getHardwareProfile(config.profileId);
  const errors = [];
  const hasMotors = profileHasMotors(profile);

  if (profile.platform === "avr" && hasMotors) {
    const pwmPins = new Set([3, 5, 6, 9, 10, 11]);
    const leftEn = Number(config.pins.leftEn);
    const rightEn = Number(config.pins.rightEn);

    if (!pwmPins.has(leftEn)) {
      errors.push(`Chân ENA/PWM (${config.pins.leftEn}) không phải chân PWM hợp lệ của ${profile.board}. Chọn 3, 5, 6, 9, 10 hoặc 11.`);
    }
    if (!pwmPins.has(rightEn)) {
      errors.push(`Chân ENB/PWM (${config.pins.rightEn}) không phải chân PWM hợp lệ của ${profile.board}. Chọn 3, 5, 6, 9, 10 hoặc 11.`);
    }
  }

  if (profile.platform === "stm32") {
    const rules = profile.pinRules || {};
    const valid = new Set(rules.validPins || []);
    const pwm = new Set(rules.pwmPins || []);
    const label = { leftIn1: "IN1", leftIn2: "IN2", leftEn: "ENA/PWM", rightIn1: "IN3", rightIn2: "IN4", rightEn: "ENB/PWM",
      trig: "TRIG", echo: "ECHO", lineLeft: "LINE trái", lineRight: "LINE phải", led: "LED", buzzer: "Buzzer", servo: "Servo" };
    for (const group of hasMotors ? ["pins", "sensors"] : ["sensors"]) {
      for (const [key, raw] of Object.entries(config[group] || {})) {
        const name = String(raw).trim().toUpperCase();
        if (!/^P[A-H]\d{1,2}$/.test(name)) {
          errors.push(`Chân ${label[key] || key} "${raw}" không đúng dạng tên chân STM32 (ví dụ PA0, PB12).`);
        } else if (valid.size && !valid.has(name)) {
          errors.push(`Chân ${label[key] || key} (${name}) không có trên ${profile.board}.`);
        }
      }
    }
    const timerReservations = rules.timerReservations || {};
    const pwmTimerMap = rules.pwmTimerMap || {};
    for (const key of hasMotors ? ["leftEn", "rightEn"] : []) {
      const name = String(config.pins?.[key]).trim().toUpperCase();
      if (pwm.size && !pwm.has(name)) {
        errors.push(`Chân ${key === "leftEn" ? "ENA" : "ENB"}/PWM (${name}) không có kênh PWM trên ${profile.board}. Chọn: ${[...pwm].join(", ")}.`);
      }
      const timer = pwmTimerMap[name];
      if (timer) {
        for (const [purpose, reservedTimer] of Object.entries(timerReservations)) {
          if (timer === reservedTimer) {
            const purposeLabel = purpose === "tone" ? "còi/tone()" : purpose === "servo" ? "thư viện Servo" : purpose;
            errors.push(`Chân ${key === "leftEn" ? "ENA" : "ENB"}/PWM (${name}) dùng ${timer}, đang được dành cho ${purposeLabel} trên ${profile.board}; PWM có thể xung đột.`);
          }
        }
      }
    }
  }

  if (profile.platform === "esp32" && hasMotors) {
    const resolution = Number(config.motor.pwmResolution);
    if (!Number.isInteger(resolution) || resolution < 1 || resolution > 14) {
      errors.push("Độ phân giải PWM của ESP32 phải nằm trong khoảng 1–14 bit.");
    }
    const frequency = Number(config.motor.pwmFrequency);
    if (!Number.isFinite(frequency) || frequency < 1 || frequency > 40000) {
      errors.push("Tần số PWM của ESP32 phải nằm trong khoảng 1–40000 Hz.");
    }
  }

  const extensionErrors = extensionProvider?.validate?.({ config, profile });
  if (Array.isArray(extensionErrors)) errors.push(...extensionErrors);

  return errors;
}

const NO_BLUETOOTH_STUB = `struct CtNoBluetooth {
  template <typename... Args> void begin(Args...) {}
  int available() { return 0; }
  int peek() { return -1; }
  int read() { return -1; }
  template <typename T> size_t println(T) { return 0; }
} CT_NO_BT;
#define BT_SERIAL CT_NO_BT
`;

export function buildArduinoHardwareHeader(config, parts = null) {
  const profile = getHardwareProfile(config.profileId);
  const p = config.pins;
  const s = config.sensors;
  const m = config.motor;
  const isEsp32 = profile.platform === "esp32";
  const isStm32 = profile.platform === "stm32";
  const pin = value => String(value);

  const pwmSection = isStm32
    ? `// STM32 (STM32duino): analogWrite() 8 bit; ENA/ENB phải ở chân có kênh PWM của timer (xem khối của mạch).\n#define LED_ACTIVE_LOW ${profile.ledActiveLow ? 1 : 0}\n`
    : isEsp32
    ? `// ESP32 / ESP32-S3: LEDC API (Arduino-ESP32 core 3.x).\nconst uint32_t MOTOR_PWM_FREQUENCY = ${m.pwmFrequency};\nconst uint8_t MOTOR_PWM_RESOLUTION = ${m.pwmResolution};\n`
    : `// Arduino UNO R3 / Nano Classic: analogWrite(); ENA/ENB phải ở chân PWM 3, 5, 6, 9, 10 hoặc 11.\n`;

  const btDisabled = Boolean(parts?.disables?.has("bluetooth-uart"));
  const disableDefines = ["led", "buzzer", "trig"]
    .filter(item => parts?.disables?.has(item))
    .map(item => `#define CT_NO_${item.toUpperCase()}`)
    .join("\n");
  const btRxPin = profile.bluetoothPins?.rx ?? BT_RX_PIN;
  const btTxPin = profile.bluetoothPins?.tx ?? BT_TX_PIN;
  const btHeader = btDisabled
    ? `// Bluetooth HC-05 bị tắt bởi mạch mở rộng.\n// Các khối Bluetooth vẫn biên dịch được nhưng không làm gì.\n${NO_BLUETOOTH_STUB}\n`
    : isStm32
    ? `// Bluetooth (HC-05/HC-06) qua ${profile.bluetoothUart || "UART"}; chân RX/TX theo từng mạch STM32.\n#define BT_RX_PIN ${btRxPin}\n#define BT_TX_PIN ${btTxPin}\nHardwareSerial BTSerial(BT_RX_PIN, BT_TX_PIN);\n#define BT_SERIAL BTSerial\n\n`
    : isEsp32
    ? `// Bluetooth (HC-05/HC-06) qua UART2; chân được chọn riêng cho board này.\n#define BT_SERIAL Serial2\n#define BT_RX_PIN ${btRxPin}\n#define BT_TX_PIN ${btTxPin}\n\n`
    : `// Bluetooth (HC-05/HC-06) qua cổng Serial (D0/D1)\n#define BT_SERIAL Serial\n\n`;

  return `// CT ROBOT EDU - HARDWARE CONFIGURATION\n// Robot: ${config.robotType === ROBOT_TYPES.FOUR_WHEEL ? "4 bánh" : "2 bánh"}\n// Board: ${profile.board}\n// MCU: ${profile.mcu}\n// FQBN: ${profile.fqbn}\n// Hardware Profile: ${config.profileId}\n\n${btHeader}// Motor GPIO\n#define LEFT_IN1 ${pin(p.leftIn1)}\n#define LEFT_IN2 ${pin(p.leftIn2)}\n#define LEFT_EN ${pin(p.leftEn)}\n#define RIGHT_IN1 ${pin(p.rightIn1)}\n#define RIGHT_IN2 ${pin(p.rightIn2)}\n#define RIGHT_EN ${pin(p.rightEn)}\n\n// Sensor / accessory GPIO\n#define TRIG_PIN ${pin(s.trig)}\n#define ECHO_PIN ${pin(s.echo)}\n#define LINE_LEFT_PIN ${pin(s.lineLeft)}\n#define LINE_RIGHT_PIN ${pin(s.lineRight)}\n#define LED_PIN ${pin(s.led)}\n#define BUZZER_PIN ${pin(s.buzzer)}\n#define SERVO_PIN ${pin(s.servo)}\n${disableDefines ? `\n// Tính năng không có trên board này\n${disableDefines}\n` : ""}\n${pwmSection}\nconst bool INVERT_LEFT_MOTOR = ${m.invertLeft ? "true" : "false"};\nconst bool INVERT_RIGHT_MOTOR = ${m.invertRight ? "true" : "false"};\nfloat TURN_MS_PER_DEGREE = ${m.turnMsPerDegree};\nint LEFT_SCALE = ${m.leftScale};\nint RIGHT_SCALE = ${m.rightScale};\n\n`;
}

const AVR_ROBOT_RUNTIME = `// ===== Robot API cho Arduino UNO R3 / Nano Classic =====
// Tốc độ: -100..100 (%). Thời gian: giây.
struct RobotAPI {
  void calibrate(float turnMsPerDegree, int leftPct, int rightPct) {
    TURN_MS_PER_DEGREE = turnMsPerDegree;
    LEFT_SCALE = constrain(leftPct, 10, 200);
    RIGHT_SCALE = constrain(rightPct, 10, 200);
  }

  void driveMotor(int in1, int in2, int en, int speed, bool invert, int scale) {
    speed = constrain(speed, -100, 100);
    speed = constrain(speed * scale / 100, -100, 100);
    if (invert) speed = -speed;
    const int pwm = map(abs(speed), 0, 100, 0, 255);
    if (speed > 0) { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }
    else if (speed < 0) { digitalWrite(in1, LOW); digitalWrite(in2, HIGH); }
    else { digitalWrite(in1, LOW); digitalWrite(in2, LOW); }
    analogWrite(en, pwm);
  }

  void begin() {
#ifndef CT_NO_MOTORS
    pinMode(LEFT_IN1, OUTPUT); pinMode(LEFT_IN2, OUTPUT); pinMode(LEFT_EN, OUTPUT);
    pinMode(RIGHT_IN1, OUTPUT); pinMode(RIGHT_IN2, OUTPUT); pinMode(RIGHT_EN, OUTPUT);
#endif
    pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
    pinMode(LINE_LEFT_PIN, INPUT); pinMode(LINE_RIGHT_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(TRIG_PIN, LOW);
#ifndef CT_NO_MOTORS
    stop();
#endif
  }

  void motorLeft(int speed) { driveMotor(LEFT_IN1, LEFT_IN2, LEFT_EN, speed, INVERT_LEFT_MOTOR, LEFT_SCALE); }
  void motorRight(int speed) { driveMotor(RIGHT_IN1, RIGHT_IN2, RIGHT_EN, speed, INVERT_RIGHT_MOTOR, RIGHT_SCALE); }
  void stop() { motorLeft(0); motorRight(0); }

  void forwardContinuous(int s) { motorLeft(s); motorRight(s); }
  void backwardContinuous(int s) { motorLeft(-s); motorRight(-s); }
  void turnLeftContinuous(int s) { motorLeft(-s); motorRight(s); }
  void turnRightContinuous(int s) { motorLeft(s); motorRight(-s); }

  void forward(int s, float sec) { forwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void backward(int s, float sec) { backwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnLeft(int s, float sec) { turnLeftContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnRight(int s, float sec) { turnRightContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }

  void turnLeftAngle(int s, int deg) { turnLeftContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }
  void turnRightAngle(int s, int deg) { turnRightContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }

  int distance() {
    digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    const unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);
    if (us == 0) return 400;
    return (int)(us / 58UL);
  }
  int lineLeft() { return digitalRead(LINE_LEFT_PIN); }
  int lineRight() { return digitalRead(LINE_RIGHT_PIN); }

  void led(const char* state) { digitalWrite(LED_PIN, strcmp(state, "ON") == 0 ? HIGH : LOW); }
  void buzzer(int freq) { if (freq > 0) tone(BUZZER_PIN, freq, 200); else noTone(BUZZER_PIN); }
  void servo(int angle) { SERVO_WRITE(constrain(angle, 0, 180)); }
} robot;

void gpioWrite(int pin, int state) { pinMode(pin, OUTPUT); digitalWrite(pin, state); }
int gpioRead(int pin) { pinMode(pin, INPUT); return digitalRead(pin); }
void gpioPwm(int pin, int percent) { pinMode(pin, OUTPUT); analogWrite(pin, map(constrain(percent, 0, 100), 0, 100, 0, 255)); }
`;

const ESP32_ROBOT_RUNTIME = `// ===== Robot API cho ESP32 / ESP32-S3 =====
// Yêu cầu Arduino-ESP32 core 3.x: LEDC được gắn trực tiếp với GPIO.
struct RobotAPI {
  void calibrate(float turnMsPerDegree, int leftPct, int rightPct) {
    TURN_MS_PER_DEGREE = turnMsPerDegree;
    LEFT_SCALE = constrain(leftPct, 10, 200);
    RIGHT_SCALE = constrain(rightPct, 10, 200);
  }

  void driveMotor(int in1, int in2, int en, int speed, bool invert, int scale) {
    speed = constrain(speed, -100, 100);
    speed = constrain(speed * scale / 100, -100, 100);
    if (invert) speed = -speed;
    const uint32_t maxDuty = (1UL << MOTOR_PWM_RESOLUTION) - 1UL;
    const uint32_t duty = (uint32_t)abs(speed) * maxDuty / 100UL;
    if (speed > 0) { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }
    else if (speed < 0) { digitalWrite(in1, LOW); digitalWrite(in2, HIGH); }
    else { digitalWrite(in1, LOW); digitalWrite(in2, LOW); }
    ledcWrite(en, duty);
  }

  void begin() {
#ifndef CT_NO_MOTORS
    pinMode(LEFT_IN1, OUTPUT); pinMode(LEFT_IN2, OUTPUT);
    pinMode(RIGHT_IN1, OUTPUT); pinMode(RIGHT_IN2, OUTPUT);
#endif
    pinMode(ECHO_PIN, INPUT);
    pinMode(LINE_LEFT_PIN, INPUT); pinMode(LINE_RIGHT_PIN, INPUT);
#ifndef CT_NO_TRIG
    pinMode(TRIG_PIN, OUTPUT); digitalWrite(TRIG_PIN, LOW);
#endif
#ifndef CT_NO_LED
    pinMode(LED_PIN, OUTPUT);
#endif
#ifndef CT_NO_BUZZER
    pinMode(BUZZER_PIN, OUTPUT);
#endif
#ifndef CT_NO_MOTORS
    const bool leftPwmReady = ledcAttach(LEFT_EN, MOTOR_PWM_FREQUENCY, MOTOR_PWM_RESOLUTION);
    const bool rightPwmReady = ledcAttach(RIGHT_EN, MOTOR_PWM_FREQUENCY, MOTOR_PWM_RESOLUTION);
#else
    const bool leftPwmReady = true;
    const bool rightPwmReady = true;
#endif
#ifndef CT_NO_BUZZER
    const bool buzzerPwmReady = ledcAttach(BUZZER_PIN, 2000, 10);
#else
    const bool buzzerPwmReady = true;
#endif
    if (!leftPwmReady || !rightPwmReady || !buzzerPwmReady) {
      Serial.println("ERROR: Khong the khoi tao LEDC. Kiem tra GPIO va cau hinh PWM.");
    }
#ifndef CT_NO_MOTORS
    stop();
#endif
  }

  void motorLeft(int speed) { driveMotor(LEFT_IN1, LEFT_IN2, LEFT_EN, speed, INVERT_LEFT_MOTOR, LEFT_SCALE); }
  void motorRight(int speed) { driveMotor(RIGHT_IN1, RIGHT_IN2, RIGHT_EN, speed, INVERT_RIGHT_MOTOR, RIGHT_SCALE); }
  void stop() { motorLeft(0); motorRight(0); }

  void forwardContinuous(int s) { motorLeft(s); motorRight(s); }
  void backwardContinuous(int s) { motorLeft(-s); motorRight(-s); }
  void turnLeftContinuous(int s) { motorLeft(-s); motorRight(s); }
  void turnRightContinuous(int s) { motorLeft(s); motorRight(-s); }

  void forward(int s, float sec) { forwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void backward(int s, float sec) { backwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnLeft(int s, float sec) { turnLeftContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnRight(int s, float sec) { turnRightContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }

  void turnLeftAngle(int s, int deg) { turnLeftContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }
  void turnRightAngle(int s, int deg) { turnRightContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }

  int distance() {
#if defined(CT_OVERRIDE_DISTANCE)
    return CT_OVERRIDE_DISTANCE();
#elif defined(CT_NO_TRIG)
    return 400;
#else
    digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    const unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);
    if (us == 0) return 400;
    return (int)(us / 58UL);
#endif
  }
  int lineLeft() { return digitalRead(LINE_LEFT_PIN); }
  int lineRight() { return digitalRead(LINE_RIGHT_PIN); }

  void led(const char* state) {
#ifndef CT_NO_LED
    digitalWrite(LED_PIN, strcmp(state, "ON") == 0 ? HIGH : LOW);
#else
    (void)state;
#endif
  }
  void buzzer(int freq) {
#ifndef CT_NO_BUZZER
    if (freq > 0) {
      ledcWriteTone(BUZZER_PIN, (double)freq);
      delay(200);
      ledcWriteTone(BUZZER_PIN, 0);
    } else {
      ledcWriteTone(BUZZER_PIN, 0);
    }
#else
    (void)freq;
#endif
  }
  void servo(int angle) { SERVO_WRITE(constrain(angle, 0, 180)); }
} robot;

void gpioWrite(int pin, int state) { pinMode(pin, OUTPUT); digitalWrite(pin, state); }
int gpioRead(int pin) { pinMode(pin, INPUT); return digitalRead(pin); }
void gpioPwm(int pin, int percent) { pinMode(pin, OUTPUT); analogWrite(pin, map(constrain(percent, 0, 100), 0, 100, 0, 255)); }
`;

const STM32_ROBOT_RUNTIME = `// ===== Robot API cho STM32 (STM32duino) =====
// Block di chuyển nhận tốc độ 0..100%; chiều quay do từng block quyết định.
// driveMotor nội bộ vẫn nhận dấu +/- để đổi chiều từng bánh.
struct RobotAPI {
  void calibrate(float turnMsPerDegree, int leftPct, int rightPct) {
    TURN_MS_PER_DEGREE = turnMsPerDegree;
    LEFT_SCALE = constrain(leftPct, 10, 200);
    RIGHT_SCALE = constrain(rightPct, 10, 200);
  }

  void driveMotor(int in1, int in2, int en, int speed, bool invert, int scale) {
    speed = constrain(speed, -100, 100);
    speed = constrain(speed * scale / 100, -100, 100);
    if (invert) speed = -speed;
    const int pwm = map(abs(speed), 0, 100, 0, 255);
    if (speed > 0) { digitalWrite(in1, HIGH); digitalWrite(in2, LOW); }
    else if (speed < 0) { digitalWrite(in1, LOW); digitalWrite(in2, HIGH); }
    else { digitalWrite(in1, LOW); digitalWrite(in2, LOW); }
    analogWrite(en, pwm);
  }

  void begin() {
#ifndef CT_NO_MOTORS
    pinMode(LEFT_IN1, OUTPUT); pinMode(LEFT_IN2, OUTPUT); pinMode(LEFT_EN, OUTPUT);
    pinMode(RIGHT_IN1, OUTPUT); pinMode(RIGHT_IN2, OUTPUT); pinMode(RIGHT_EN, OUTPUT);
#endif
    pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
    pinMode(LINE_LEFT_PIN, INPUT); pinMode(LINE_RIGHT_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(TRIG_PIN, LOW);
    led("OFF");
#ifndef CT_NO_MOTORS
    stop();
#endif
  }

  void motorLeft(int speed) { driveMotor(LEFT_IN1, LEFT_IN2, LEFT_EN, speed, INVERT_LEFT_MOTOR, LEFT_SCALE); }
  void motorRight(int speed) { driveMotor(RIGHT_IN1, RIGHT_IN2, RIGHT_EN, speed, INVERT_RIGHT_MOTOR, RIGHT_SCALE); }
  void stop() { motorLeft(0); motorRight(0); }

  int directionSpeed(int s) { return constrain(s, 0, 100); }
  void forwardContinuous(int s) { s = directionSpeed(s); motorLeft(s); motorRight(s); }
  void backwardContinuous(int s) { s = directionSpeed(s); motorLeft(-s); motorRight(-s); }
  void turnLeftContinuous(int s) { s = directionSpeed(s); motorLeft(-s); motorRight(s); }
  void turnRightContinuous(int s) { s = directionSpeed(s); motorLeft(s); motorRight(-s); }

  void forward(int s, float sec) { forwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void backward(int s, float sec) { backwardContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnLeft(int s, float sec) { turnLeftContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }
  void turnRight(int s, float sec) { turnRightContinuous(s); delay((unsigned long)(max(0.0f, sec) * 1000)); stop(); }

  void turnLeftAngle(int s, int deg) { turnLeftContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }
  void turnRightAngle(int s, int deg) { turnRightContinuous(s); delay((unsigned long)(max(0, deg) * TURN_MS_PER_DEGREE)); stop(); }

  int distance() {
    digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    const unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);
    if (us == 0) return 400;
    return (int)(us / 58UL);
  }
  int lineLeft() { return digitalRead(LINE_LEFT_PIN); }
  int lineRight() { return digitalRead(LINE_RIGHT_PIN); }

  // LED_ACTIVE_LOW = 1: LED sáng khi chân ở mức THẤP (LED PC13 trên Blue Pill / Black Pill).
  void led(const char* state) {
    const bool on = strcmp(state, "ON") == 0;
    digitalWrite(LED_PIN, (on != (LED_ACTIVE_LOW != 0)) ? HIGH : LOW);
  }
  void buzzer(int freq) { if (freq > 0) tone(BUZZER_PIN, freq, 200); else noTone(BUZZER_PIN); }
  void servo(int angle) { SERVO_WRITE(constrain(angle, 0, 180)); }
} robot;

void gpioWrite(int pin, int state) { pinMode(pin, OUTPUT); digitalWrite(pin, state); }
int gpioRead(int pin) { pinMode(pin, INPUT); return digitalRead(pin); }
void gpioPwm(int pin, int percent) { pinMode(pin, OUTPUT); analogWrite(pin, map(constrain(percent, 0, 100), 0, 100, 0, 255)); }
`;

export function buildArduinoSketch(config, generated, functions = "") {
  const usesProgramHelpers = PROGRAM_HELPER_USED.test(`${generated}\n${functions}`);
  const profile = getHardwareProfile(config.profileId);
  const isEsp32 = profile.platform === "esp32";
  const isStm32 = profile.platform === "stm32";
  const parts = extensionProvider?.sketchParts?.({ config, profile, generated, functions }) || null;
  const provides = parts?.provides || new Set();
  const btDisabled = Boolean(parts?.disables?.has("bluetooth-uart"));
  const btBegin = btDisabled ? ""
    : isEsp32 ? "  BT_SERIAL.begin(115200, SERIAL_8N1, BT_RX_PIN, BT_TX_PIN);\n"
    : isStm32 ? "  BT_SERIAL.begin(115200);\n"
    : "";
  // Extension cung cấp servo (vd. PCA9685) thì không dùng thư viện Servo của core.
  const usesServo = !provides.has("servo") && /robot\.servo\s*\(/.test(`${generated}\n${functions}`);

  const includes = ["#include <Arduino.h>", "#include <string.h>", ...(parts?.includes || [])];
  if (usesServo) includes.push(isEsp32 ? "#include <ESP32Servo.h>" : "#include <Servo.h>");

  const servoSetup = provides.has("servo")
    ? `#define SERVO_WRITE(a) CT_OVERRIDE_SERVO(a)\n`
    : usesServo
    ? isEsp32
      ? `Servo robotServo;\n#define SERVO_WRITE(a) robotServo.write(a)\n`
      : `Servo robotServo;\n#define SERVO_WRITE(a) robotServo.write(a)\n`
    : `#define SERVO_WRITE(a) ((void)(a)) // servo block not used\n`;

  const servoAttach = usesServo
    ? isEsp32
      ? `  robotServo.attach(SERVO_PIN, 500, 2400);\n`
      : `  robotServo.attach(SERVO_PIN);\n`
    : "";

  // Mạch không có khối di chuyển: không chiếm chân/kênh PWM cho động cơ trừ khi chương trình gọi lệnh di chuyển (file cũ).
  const usesMotors = profileHasMotors(profile)
    || /robot\.(motorLeft|motorRight|forward|backward|turnLeft|turnRight|stop|calibrate)\w*\s*\(/.test(`${generated}\n${functions}`);
  const noMotorsDefine = usesMotors ? "" : "#define CT_NO_MOTORS // chương trình không điều khiển động cơ\n";

  const runtime = isEsp32 ? ESP32_ROBOT_RUNTIME : isStm32 ? STM32_ROBOT_RUNTIME : AVR_ROBOT_RUNTIME;
  const eventSection = functions
    ? `\n// ===== Biến, danh sách và sự kiện (KHI NHẬN / PHÁT) =====\n${functions}\n`
    : "";
  const body = (generated || "")
    .trimEnd()
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");

  return `${includes.join("\n")}\n\n${buildArduinoHardwareHeader(config, parts)}${noMotorsDefine}${servoSetup}\n${parts?.prelude?.length ? parts.prelude.join("\n") + "\n" : ""}${usesProgramHelpers ? PROGRAM_CPP_HELPERS + "\n" : ""}${runtime}${eventSection}\nvoid setup() {\n  Serial.begin(115200);\n${btBegin}  robot.begin();\n${servoAttach}${parts?.setup?.length ? parts.setup.join("") : ""}\n  // ===== Chương trình từ Blockly =====\n${body}\n}\n\nvoid loop() {\n  // Chương trình Blockly chạy trong setup(). Dùng khối LẶP MÃI để chạy liên tục.\n}\n`;
}