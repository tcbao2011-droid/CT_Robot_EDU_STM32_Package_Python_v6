import { defineExtension } from "../registry.js";
import { ANY_VALUE } from "../../valueSlots.js";

/* =====================================================
   MẠCH MỞ RỘNG CT: ESP32 DevKit V1 + 3×TB6612 + PCA9685
   + PCF8574 + cảm biến (theo sơ đồ nguyên lý & bảng chân)

   Nguồn dữ liệu duy nhất cho mọi thứ bên dưới là các bảng
   MOTORS / I2C / SENSORS: sửa ở đây là profile, khối,
   mã C++ và kiểm tra chân tự cập nhật theo.
===================================================== */

const COLOUR = "#0d9488";

// 6 động cơ trên 3 module TB6612 (STBY nối 3V3, luôn bật).
// Module 3 kênh B có PWMB nối thẳng 3V3 => không có PWM, chỉ đảo chiều.
const MOTORS = [
  { id: 1, module: 1, channel: "A", in1: 19, in2: 5,  pwm: 18 },
  { id: 2, module: 1, channel: "B", in1: 4,  in2: 16, pwm: 17 },
  { id: 3, module: 2, channel: "A", in1: 26, in2: 25, pwm: 27 },
  { id: 4, module: 2, channel: "B", in1: 32, in2: 33, pwm: 14 },
  { id: 5, module: 3, channel: "A", in1: 13, in2: 15, pwm: 2 },
  { id: 6, module: 3, channel: "B", in1: 12, in2: 23, pwm: null },
];

const I2C = { sda: 21, scl: 22, pca9685: 0x40 };
const SENSORS = { lineLeft: 34, lineRight: 35, echo: 36 }; // chỉ-đọc / ADC1
const PCF_TRIG_BIT = 0;           // HC-SR04 TRIG nằm ở P0 của PCF8574

// Dùng chung cho bộ sinh mã Python (src/pythonGenerator.js) để bảng chân chỉ có một nguồn.
export const CTEXP_HARDWARE = { MOTORS, I2C, SENSORS, PCF_TRIG_BIT };
const PCF_USER_PINS = [1, 2, 3, 4, 5, 6, 7];
const SERVO_CHANNELS = 6;         // PCA9685 có 16 kênh, dùng 6

const motorLabel = m => `M${m.id} (mô-đun ${m.module} · ${m.channel})`;
const motorOptions = MOTORS.map(m => [motorLabel(m), String(m.id)]);

/* ---------- Khối DI CHUYỂN (robot 2 bánh: M1 = trái, M2 = phải) ----------
   Dùng Robot API của core (robot.forward, robot.turnLeft...), nên tự hưởng
   hiệu chỉnh tốc độ từng bánh, đảo chiều và thời gian quay 1° trong bảng
   "Cấu hình GPIO". Tên ô nhập (SPEED / SECONDS / DEGREES) giống khối
   core để mô phỏng và trợ lý AI dùng chung. */

const speedInput = d => ({ type: "input_value", name: "SPEED", check: ANY_VALUE, shadow: d.speed });
const numberShadow = value => ({ shadow: { type: "math_number", fields: { NUM: value } } });

const valueOf = (block, gen, name, fallback) =>
  gen.valueToCode(block, name, gen.ORDER_NONE) || String(fallback);

const DIRECTIONS = [
  { key: "forward", label: "ĐI THẲNG", verb: "Đi thẳng", speed: 80, seconds: 1, timed: "forward", continuous: "forwardContinuous", hint: "Cả hai bánh quay tiến." },
  { key: "backward", label: "ĐI LÙI", verb: "Đi lùi", speed: 80, seconds: 1, timed: "backward", continuous: "backwardContinuous", hint: "Cả hai bánh quay lùi." },
  { key: "turn_left", label: "RẼ TRÁI", verb: "Rẽ trái", speed: 60, seconds: 0.5, timed: "turnLeft", continuous: "turnLeftContinuous", angle: "turnLeftAngle", hint: "Quay tại chỗ sang trái: bánh trái lùi, bánh phải tiến." },
  { key: "turn_right", label: "RẼ PHẢI", verb: "Rẽ phải", speed: 60, seconds: 0.5, timed: "turnRight", continuous: "turnRightContinuous", angle: "turnRightAngle", hint: "Quay tại chỗ sang phải: bánh trái tiến, bánh phải lùi." },
];

const say = (verb, parts) => a => `${verb}${parts(a)}`;

const movementBlocks = [];
const movementToolbox = [];

for (const d of DIRECTIONS) {
  // 1) theo thời gian
  movementBlocks.push({
    type: `ctexp_${d.key}`,
    kind: "statement",
    json: {
      message0: `${d.label} tốc độ %1 %`,
      args0: [speedInput(d)],
      message1: "trong %1 giây",
      args1: [{ type: "input_value", name: "SECONDS", check: ANY_VALUE, shadow: d.seconds }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: `${d.hint} Chạy trong số giây đã chọn rồi tự dừng. Tốc độ 0–100 %.`,
    },
    generator: (b, gen) => `robot.${d.timed}(${valueOf(b, gen, "SPEED", d.speed)}, ${valueOf(b, gen, "SECONDS", d.seconds)});\n`,
    assistant: {
      label: `${d.verb} (theo thời gian)`,
      kw: `${d.verb} di chuyen robot banh dong co mach mo rong`,
      desc: `${d.hint} Chạy trong số giây đã chọn rồi tự dừng.`,
      say: say(d.verb, a => ` tốc độ ${a("SPEED")}% trong ${a("SECONDS")} giây`),
      tip: "Tốc độ từ 0 đến 100%.",
    },
  });
  movementToolbox.push({
    kind: "block",
    type: `ctexp_${d.key}`,
    inputs: { SPEED: numberShadow(d.speed), SECONDS: numberShadow(d.seconds) },
  });
}

movementToolbox.push({ kind: "label", text: "Chạy liên tục (cho tới khi gặp khối DỪNG)" });
for (const d of DIRECTIONS) {
  movementBlocks.push({
    type: `ctexp_${d.key}_continuous`,
    kind: "statement",
    json: {
      message0: `${d.label} liên tục tốc độ %1 %`,
      args0: [speedInput(d)],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: `${d.hint} Chạy mãi cho tới khi gặp khối DỪNG hoặc khối di chuyển khác. Hay dùng trong LẶP MÃI với cảm biến.`,
    },
    generator: (b, gen) => `robot.${d.continuous}(${valueOf(b, gen, "SPEED", d.speed)});\n`,
    assistant: {
      label: `${d.verb} (liên tục)`,
      kw: `${d.verb} di chuyen lien tuc robot banh dong co mach mo rong`,
      desc: `${d.hint} Chạy liên tục cho tới khi gặp khối dừng hoặc khối di chuyển khác.`,
      say: say(d.verb, a => ` liên tục với tốc độ ${a("SPEED")}%`),
      tip: "Nhớ có khối DỪNG ROBOT hoặc khối di chuyển khác, nếu không robot chạy mãi.",
    },
  });
  movementToolbox.push({ kind: "block", type: `ctexp_${d.key}_continuous`, inputs: { SPEED: numberShadow(d.speed) } });
}

movementToolbox.push({ kind: "label", text: "Rẽ theo góc" });
for (const d of DIRECTIONS.filter(item => item.angle)) {
  movementBlocks.push({
    type: `ctexp_${d.key}_angle`,
    kind: "statement",
    json: {
      message0: `${d.label} tốc độ %1 %`,
      args0: [speedInput(d)],
      message1: "góc %1 °",
      args1: [{ type: "input_value", name: "DEGREES", check: ANY_VALUE, shadow: 90 }],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: `${d.hint} Góc được ước lượng bằng thời gian nên cần hiệu chỉnh "Quay 1° (ms)" cho đúng với bánh xe và nguồn pin của bạn.`,
    },
    generator: (b, gen) => `robot.${d.angle}(${valueOf(b, gen, "SPEED", d.speed)}, ${valueOf(b, gen, "DEGREES", 90)});\n`,
    assistant: {
      label: `${d.verb} theo góc`,
      kw: `${d.verb} goc xoay quay do robot mach mo rong`,
      desc: `${d.verb} một góc xác định (cần hiệu chỉnh thời gian quay 1° cho đúng).`,
      say: say(d.verb, a => ` ${a("DEGREES")}° với tốc độ ${a("SPEED")}%`),
    },
  });
  movementToolbox.push({
    kind: "block",
    type: `ctexp_${d.key}_angle`,
    inputs: { SPEED: numberShadow(d.speed), DEGREES: numberShadow(90) },
  });
}

movementBlocks.push({
  type: "ctexp_stop",
  kind: "statement",
  json: {
    message0: "DỪNG ROBOT",
    previousStatement: null,
    nextStatement: null,
    colour: COLOUR,
    tooltip: "Dừng hai bánh (M1 và M2).",
  },
  generator: () => "robot.stop();\n",
  assistant: {
    label: "Dừng robot",
    kw: "dung stop tat dong co phanh robot mach mo rong",
    desc: "Dừng hai bánh của robot (M1 và M2).",
    say: () => "Dừng robot",
  },
});

/* ---------- Khối Blockly ---------- */

const blocks = [
  ...movementBlocks,
  {
    type: "ctexp_motor_run",
    kind: "statement",
    json: {
      message0: "ĐỘNG CƠ %1 chạy %2 %",
      args0: [
        { type: "field_dropdown", name: "MOTOR", options: motorOptions },
        { type: "input_value", name: "SPEED", check: ANY_VALUE, shadow: 80 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: "Tốc độ -100..100 (%). Âm = quay ngược. M6 không có PWM: chỉ chạy hết tốc độ hoặc dừng, chỉ hướng được dùng.",
    },
    generator: (block, gen) =>
      `ctExpMotorRun(${Number(block.getFieldValue("MOTOR"))}, ${valueOf(block, gen, "SPEED", 0)});\n`,
  },
  {
    type: "ctexp_motor_stop",
    kind: "statement",
    json: {
      message0: "DỪNG ĐỘNG CƠ %1",
      args0: [
        { type: "field_dropdown", name: "MOTOR", options: [["TẤT CẢ", "ALL"], ...motorOptions] },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
    },
    generator: block => {
      const motor = block.getFieldValue("MOTOR");
      return motor === "ALL" ? "ctExpMotorStopAll();\n" : `ctExpMotorRun(${Number(motor)}, 0);\n`;
    },
  },
  {
    type: "ctexp_servo",
    kind: "statement",
    json: {
      message0: "SERVO %1 quay tới %2 độ",
      args0: [
        {
          type: "field_dropdown",
          name: "CHANNEL",
          options: Array.from({ length: SERVO_CHANNELS }, (_, i) => [`${i + 1}`, String(i + 1)]),
        },
        { type: "input_value", name: "ANGLE", check: ANY_VALUE, shadow: 90 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: "Điều khiển servo qua PCA9685 (I2C). Khối SERVO của core dùng servo 1.",
    },
    generator: (block, gen) =>
      `ctExpServoWrite(${Number(block.getFieldValue("CHANNEL")) - 1}, ${valueOf(block, gen, "ANGLE", 0)});\n`,
  },
  {
    type: "ctexp_line_analog",
    kind: "value",
    json: {
      message0: "DÒ LINE %1 (analog 0–4095)",
      args0: [
        { type: "field_dropdown", name: "SIDE", options: [["TRÁI", "LEFT"], ["PHẢI", "RIGHT"]] },
      ],
      output: "Number",
      colour: COLOUR,
    },
    generator: (block, gen) => [
      `analogRead(${block.getFieldValue("SIDE") === "LEFT" ? "LINE_LEFT_PIN" : "LINE_RIGHT_PIN"})`,
      gen.ORDER_FUNCTION_CALL,
    ],
  },
  {
    type: "ctexp_pcf_write",
    kind: "statement",
    json: {
      message0: "PCF8574 chân P%1 ghi %2",
      args0: [
        { type: "field_dropdown", name: "PIN", options: PCF_USER_PINS.map(p => [String(p), String(p)]) },
        { type: "field_dropdown", name: "LEVEL", options: [["CAO", "1"], ["THẤP", "0"]] },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: COLOUR,
      tooltip: `P${PCF_TRIG_BIT} dành riêng cho TRIG của siêu âm HC-SR04.`,
    },
    generator: block =>
      `ctExpPcfWrite(${Number(block.getFieldValue("PIN"))}, ${Number(block.getFieldValue("LEVEL"))});\n`,
  },
  {
    type: "ctexp_pcf_read",
    kind: "value",
    json: {
      message0: "PCF8574 đọc chân P%1",
      args0: [
        { type: "field_dropdown", name: "PIN", options: PCF_USER_PINS.map(p => [String(p), String(p)]) },
      ],
      output: "Number",
      colour: COLOUR,
      tooltip: "Trả về 0 hoặc 1.",
    },
    generator: (block, gen) => [`ctExpPcfRead(${Number(block.getFieldValue("PIN"))})`, gen.ORDER_FUNCTION_CALL],
  },
  {
    type: "ctexp_distance",
    kind: "value",
    json: {
      message0: "KHOẢNG CÁCH SIÊU ÂM (cm)",
      output: "Number",
      colour: COLOUR,
      tooltip: "HC-SR04 ở J3. TRIG qua P0 của PCF8574, ECHO vào GPIO36. Trả về 400 nếu không có vật cản.",
    },
    generator: (block, gen) => ["ctExpDistanceCm()", gen.ORDER_FUNCTION_CALL],
  },
  {
    type: "ctexp_humidity",
    kind: "value",
    json: {
      message0: "ĐỘ ẨM (%) từ cảm biến I2C",
      output: "Number",
      colour: COLOUR,
      tooltip: "Đọc cảm biến ở J6 (tự nhận AHT10/20/21 hoặc SHT3x). Trả về -1 nếu không đọc được.",
    },
    generator: (block, gen) => ["ctExpHumidity()", gen.ORDER_FUNCTION_CALL],
  },
  {
    type: "ctexp_temperature",
    kind: "value",
    json: {
      message0: "NHIỆT ĐỘ (°C) từ cảm biến I2C",
      output: "Number",
      colour: COLOUR,
      tooltip: "Nhiệt độ từ cảm biến ở J6 (nếu cảm biến có). Trả về -100 nếu không đọc được.",
    },
    generator: (block, gen) => ["ctExpTemperature()", gen.ORDER_FUNCTION_CALL],
  },
];

/* ---------- Mã C++ (không phụ thuộc thư viện ngoài) ---------- */

const motorTableCpp = MOTORS
  .map(m => `  { ${m.in1}, ${m.in2}, ${m.pwm ?? -1} },   // M${m.id}: mô-đun ${m.module} kênh ${m.channel}${m.pwm == null ? " (PWMB = 3V3, không PWM)" : ""}`)
  .join("\n");

const I2C_PRELUDE = `// ===== CT Expansion: I2C (SDA ${I2C.sda}, SCL ${I2C.scl}) =====
#define CTEXP_SDA ${I2C.sda}
#define CTEXP_SCL ${I2C.scl}
#define CTEXP_PCA9685_ADDR 0x${I2C.pca9685.toString(16)}
static bool ctExpI2cReady = false;
void ctExpI2cBegin() {
  if (ctExpI2cReady) return;
  Wire.begin(CTEXP_SDA, CTEXP_SCL);
  Wire.setClock(400000);
  ctExpI2cReady = true;
}
static bool ctExpI2cPing(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}
`;

const MOTOR_PRELUDE = `// ===== CT Expansion: 6 động cơ qua 3×TB6612 =====
struct CtExpMotor { int8_t in1; int8_t in2; int8_t pwm; };
static const CtExpMotor CTEXP_MOTORS[6] = {
${motorTableCpp}
};
void ctExpMotorBegin() {
  for (int i = 0; i < 6; i++) {
    const CtExpMotor &m = CTEXP_MOTORS[i];
    pinMode(m.in1, OUTPUT); pinMode(m.in2, OUTPUT);
    digitalWrite(m.in1, LOW); digitalWrite(m.in2, LOW);
    // M1/M2 là bánh trái/phải của core: robot.begin() đã gắn LEDC cho chúng.
    if (m.pwm >= 0 && m.pwm != LEFT_EN && m.pwm != RIGHT_EN) {
      if (!ledcAttach(m.pwm, MOTOR_PWM_FREQUENCY, MOTOR_PWM_RESOLUTION)) {
        Serial.println("ERROR: Khong gan duoc PWM cho dong co mo rong.");
      }
    }
  }
}
// id: 1..6, speed: -100..100 (%)
void ctExpMotorRun(int id, int speed) {
  if (id < 1 || id > 6) return;
  const CtExpMotor &m = CTEXP_MOTORS[id - 1];
  speed = constrain(speed, -100, 100);
  digitalWrite(m.in1, speed > 0 ? HIGH : LOW);
  digitalWrite(m.in2, speed < 0 ? HIGH : LOW);
  if (m.pwm >= 0) {
    const uint32_t maxDuty = (1UL << MOTOR_PWM_RESOLUTION) - 1UL;
    ledcWrite(m.pwm, (uint32_t)abs(speed) * maxDuty / 100UL);
  }
}
void ctExpMotorStopAll() { for (int i = 1; i <= 6; i++) ctExpMotorRun(i, 0); }
`;

const SERVO_PRELUDE = `// ===== CT Expansion: servo qua PCA9685 =====
#define CTEXP_SERVO_MIN_US 500
#define CTEXP_SERVO_MAX_US 2500
static bool ctExpPcaOk = false;
static void ctExpPcaWrite8(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(CTEXP_PCA9685_ADDR);
  Wire.write(reg); Wire.write(value);
  Wire.endTransmission();
}
void ctExpServoBegin() {
  ctExpI2cBegin();
  ctExpPcaOk = ctExpI2cPing(CTEXP_PCA9685_ADDR);
  if (!ctExpPcaOk) { Serial.println("WARN: Khong thay PCA9685 (0x40) tren I2C."); return; }
  ctExpPcaWrite8(0x00, 0x10);  // MODE1: sleep để đổi PRESCALE
  ctExpPcaWrite8(0xFE, 121);   // ~50 Hz (25 MHz / (4096 * 50) - 1)
  ctExpPcaWrite8(0x00, 0x20);  // thức dậy, auto-increment
  delay(5);
  ctExpPcaWrite8(0x00, 0xA0);  // restart
}
// ch: 0..15 (kênh PCA9685), angle: 0..180
void ctExpServoWrite(int ch, int angle) {
  if (!ctExpPcaOk || ch < 0 || ch > 15) return;
  angle = constrain(angle, 0, 180);
  const uint32_t us = CTEXP_SERVO_MIN_US + (uint32_t)angle * (CTEXP_SERVO_MAX_US - CTEXP_SERVO_MIN_US) / 180UL;
  const uint16_t ticks = (uint16_t)(us * 4096UL / 20000UL);
  Wire.beginTransmission(CTEXP_PCA9685_ADDR);
  Wire.write((uint8_t)(0x06 + 4 * ch));
  Wire.write((uint8_t)0); Wire.write((uint8_t)0);
  Wire.write((uint8_t)(ticks & 0xFF)); Wire.write((uint8_t)(ticks >> 8));
  Wire.endTransmission();
}
#define CT_OVERRIDE_SERVO(a) ctExpServoWrite(0, (a))
`;

const PCF_PRELUDE = `// ===== CT Expansion: PCF8574 (mở rộng GPIO) + siêu âm HC-SR04 =====
// P${PCF_TRIG_BIT} = TRIG của HC-SR04, ECHO vào GPIO${SENSORS.echo} qua cầu chia áp 1k/2k.
static uint8_t ctExpPcfAddr = 0;
static uint8_t ctExpPcfState = 0xFF & ~(1 << ${PCF_TRIG_BIT});  // bit = 1: đầu vào / mức cao
static bool ctExpPcfFlush() {
  if (!ctExpPcfAddr) return false;
  Wire.beginTransmission(ctExpPcfAddr);
  Wire.write(ctExpPcfState);
  return Wire.endTransmission() == 0;
}
void ctExpPcfBegin() {
  ctExpI2cBegin();
  // PCF8574: 0x20–0x27, PCF8574A: 0x39–0x3F. Bỏ qua 0x38 vì là địa chỉ của cảm biến AHT ở J6.
  for (uint8_t a = 0x20; a <= 0x3F && !ctExpPcfAddr; a++) {
    if (a > 0x27 && a < 0x39) continue;
    if (ctExpI2cPing(a)) ctExpPcfAddr = a;
  }
  if (!ctExpPcfAddr) { Serial.println("WARN: Khong thay PCF8574 tren I2C."); return; }
  ctExpPcfFlush();
}
static void ctExpPcfSet(int pin, int level) {
  if (!ctExpPcfAddr || pin < 0 || pin > 7) return;
  if (level) ctExpPcfState |= (uint8_t)(1 << pin); else ctExpPcfState &= (uint8_t)~(1 << pin);
  ctExpPcfFlush();
}
// P${PCF_TRIG_BIT} dành cho TRIG, người dùng chỉ ghi P1..P7.
void ctExpPcfWrite(int pin, int level) { if (pin >= 1) ctExpPcfSet(pin, level); }
int ctExpPcfRead(int pin) {
  if (!ctExpPcfAddr || pin < 1 || pin > 7) return 0;
  ctExpPcfSet(pin, 1);  // PCF8574 quasi-bidirectional: phải thả chân lên cao trước khi đọc
  if (Wire.requestFrom((int)ctExpPcfAddr, 1) != 1) return 0;
  return (Wire.read() >> pin) & 1;
}
int ctExpDistanceCm() {
  if (!ctExpPcfAddr) return 400;
  ctExpPcfSet(${PCF_TRIG_BIT}, 1);
  delayMicroseconds(10);
  ctExpPcfSet(${PCF_TRIG_BIT}, 0);
  const unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (us == 0) return 400;
  return (int)(us / 58UL);
}
#define CT_OVERRIDE_DISTANCE() ctExpDistanceCm()
`;

const HUM_PRELUDE = `// ===== CT Expansion: cảm biến độ ẩm I2C (J6) =====
// Tự nhận: AHT10/AHT20/AHT21 (0x38) hoặc SHT3x (0x44/0x45).
static uint8_t ctExpHumAddr = 0;
static uint8_t ctExpHumType = 0;  // 1 = AHT, 2 = SHT3x
static float ctExpHumValue = 0, ctExpTempValue = 0;
static unsigned long ctExpHumLastMs = 0;
void ctExpHumBegin() {
  ctExpI2cBegin();
  if (ctExpI2cPing(0x38)) {
    ctExpHumAddr = 0x38; ctExpHumType = 1;
    Wire.beginTransmission(0x38); Wire.write((uint8_t)0xBE); Wire.write((uint8_t)0x08); Wire.write((uint8_t)0x00);
    Wire.endTransmission();
    delay(20);
  } else if (ctExpI2cPing(0x44)) { ctExpHumAddr = 0x44; ctExpHumType = 2; }
  else if (ctExpI2cPing(0x45)) { ctExpHumAddr = 0x45; ctExpHumType = 2; }
  else Serial.println("WARN: Khong thay cam bien do am (AHT 0x38 / SHT3x 0x44-0x45) tren I2C.");
}
static bool ctExpHumRead() {
  if (!ctExpHumAddr) return false;
  if (ctExpHumLastMs != 0 && millis() - ctExpHumLastMs < 250) return true;  // dùng lại kết quả vừa đọc
  uint8_t b[6] = {0};
  if (ctExpHumType == 1) {
    Wire.beginTransmission(ctExpHumAddr);
    Wire.write((uint8_t)0xAC); Wire.write((uint8_t)0x33); Wire.write((uint8_t)0x00);
    if (Wire.endTransmission() != 0) return false;
    delay(80);
    if (Wire.requestFrom((int)ctExpHumAddr, 6) != 6) return false;
    for (int i = 0; i < 6; i++) b[i] = (uint8_t)Wire.read();
    if (b[0] & 0x80) return false;  // đang bận
    const uint32_t rh = ((uint32_t)b[1] << 12) | ((uint32_t)b[2] << 4) | (b[3] >> 4);
    const uint32_t rt = (((uint32_t)b[3] & 0x0F) << 16) | ((uint32_t)b[4] << 8) | b[5];
    ctExpHumValue = rh * 100.0f / 1048576.0f;
    ctExpTempValue = rt * 200.0f / 1048576.0f - 50.0f;
  } else {
    Wire.beginTransmission(ctExpHumAddr);
    Wire.write((uint8_t)0x24); Wire.write((uint8_t)0x00);  // đo 1 lần, không clock stretching
    if (Wire.endTransmission() != 0) return false;
    delay(20);
    if (Wire.requestFrom((int)ctExpHumAddr, 6) != 6) return false;
    for (int i = 0; i < 6; i++) b[i] = (uint8_t)Wire.read();
    const uint16_t rt = ((uint16_t)b[0] << 8) | b[1];
    const uint16_t rh = ((uint16_t)b[3] << 8) | b[4];
    ctExpTempValue = -45.0f + 175.0f * rt / 65535.0f;
    ctExpHumValue = 100.0f * rh / 65535.0f;
  }
  ctExpHumLastMs = millis();
  return true;
}
float ctExpHumidity() { return ctExpHumRead() ? ctExpHumValue : -1.0f; }
float ctExpTemperature() { return ctExpHumRead() ? ctExpTempValue : -100.0f; }
`;

/* ---------- Manifest ---------- */

export default defineExtension({
  id: "ct-expansion-esp32",
  name: "Mạch mở rộng CT (ESP32 + 3×TB6612 + PCA9685)",
  version: "1.0.0",
  description: "6 động cơ DC, 6 servo, PCF8574, siêu âm HC-SR04, dò line, cảm biến độ ẩm I2C. Nguồn pin qua cầu chì 5A và module hạ áp XL4005.",
  blockPrefix: "ctexp",
  requires: { platform: "esp32" },

  // Chân đã cố định trên PCB nên ẩn nhóm GPIO tự do (Analog / Digital) khỏi toolbox.
  // Bluetooth/LED/buzzer tự bị gỡ theo sketch.disables bên dưới.
  capabilities: { remove: ["gpio"] },

  profiles: [
    {
      group: "ESP32",
      id: "ct-expansion-esp32",
      name: "CT EXPANSION BOARD (ESP32 + TB6612)",
      description:
        "ESP32 DevKit V1 trên mạch mở rộng: 3×TB6612 (6 động cơ), PCA9685 (6 servo), PCF8574, HC-SR04, dò line. M1 = bánh trái, M2 = bánh phải.",
      board: "CT Expansion (ESP32 DevKit V1)",
      mcu: "ESP32",
      platform: "esp32",
      fqbn: "esp32:esp32:esp32",
      core: "esp32:esp32 (Arduino-ESP32 3.x)",
      driver: "TB6612",
      hasMotors: true, // duy nhất mạch có khối di chuyển => hiện cấu hình chân động cơ
      pwmMode: "ledc",
      // TB6612 dùng cùng quy ước IN1/IN2/PWM với L298N nên runtime core chạy được.
      pins: {
        leftIn1: MOTORS[0].in1, leftIn2: MOTORS[0].in2, leftEn: MOTORS[0].pwm,
        rightIn1: MOTORS[1].in1, rightIn2: MOTORS[1].in2, rightEn: MOTORS[1].pwm,
      },
      // -1 = không có chân trực tiếp (TRIG qua PCF8574; không có LED/buzzer/servo trên GPIO).
      sensors: {
        trig: -1, echo: SENSORS.echo,
        lineLeft: SENSORS.lineLeft, lineRight: SENSORS.lineRight,
        led: -1, buzzer: -1, servo: -1,
      },
    },
  ],

  // Chân cố định trên PCB. Registry dùng để cảnh báo khi người dùng sửa tay GPIO bị đè.
  pins: [
    ...MOTORS.flatMap(m => [
      { gpio: m.in1, role: `M${m.id} IN1` },
      { gpio: m.in2, role: `M${m.id} IN2` },
      ...(m.pwm == null ? [] : [{ gpio: m.pwm, role: `M${m.id} PWM` }]),
    ]),
    { gpio: I2C.sda, role: "I2C SDA" },
    { gpio: I2C.scl, role: "I2C SCL" },
    { gpio: SENSORS.lineLeft, role: "Dò line trái (J2)" },
    { gpio: SENSORS.lineRight, role: "Dò line phải (J2)" },
    { gpio: SENSORS.echo, role: "HC-SR04 ECHO" },
  ],

  i2c: [
    { name: "PCA9685", address: I2C.pca9685 },
    { name: "PCF8574/PCF8574A", addresses: [...Array(8).keys()].flatMap(i => [0x20 + i, ...(i > 0 ? [0x38 + i] : [])]) },
    { name: "Cảm biến độ ẩm J6 (AHT/SHT3x)", addresses: [0x38, 0x44, 0x45] },
  ],

  blocks,

  toolbox: [
    {
      kind: "category",
      name: "🚗 Di chuyển",
      colour: COLOUR,
      contents: [
        { kind: "label", text: "Robot 2 bánh: M1 = trái, M2 = phải" },
        ...movementToolbox,
        { kind: "sep" },
        { kind: "block", type: "ctexp_stop" },
      ],
    },
    {
      kind: "category",
      name: "🧩 Mạch mở rộng CT",
      colour: COLOUR,
      contents: blocks
        .filter(block => !movementBlocks.includes(block))
        .map(block => ({ kind: "block", type: block.type })),
    },
  ],

  sketch: {
    // GPIO16/17 (UART2 của HC-05 trong core) bị M2 chiếm => tắt Bluetooth UART.
    // Mạch không còn GPIO trống cho LED/buzzer; TRIG đi qua PCF8574.
    disables: ["bluetooth-uart", "led", "buzzer", "trig"],
    sections: [
      { id: "i2c", includes: ["#include <Wire.h>"], prelude: I2C_PRELUDE },
      {
        id: "motor",
        usedWhen: /ctExpMotor/,
        prelude: MOTOR_PRELUDE,
        setup: "  ctExpMotorBegin();\n",
      },
      {
        id: "servo",
        requires: ["i2c"],
        usedWhen: /ctExpServo|robot\.servo\s*\(/,
        prelude: SERVO_PRELUDE,
        setup: "  ctExpServoBegin();\n",
        provides: ["servo"],
      },
      {
        id: "hum",
        requires: ["i2c"],
        usedWhen: /ctExpHumidity|ctExpTemperature/,
        prelude: HUM_PRELUDE,
        setup: "  ctExpHumBegin();\n",
      },
      {
        id: "pcf",
        requires: ["i2c"],
        usedWhen: /ctExpPcf|ctExpDistance|robot\.distance\s*\(/,
        prelude: PCF_PRELUDE,
        setup: "  ctExpPcfBegin();\n",
        provides: ["distance"],
      },
    ],
  },
});
