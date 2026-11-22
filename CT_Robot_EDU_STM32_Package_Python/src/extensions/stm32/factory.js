/* =====================================================
   NHÀ MÁY MẠCH STM32
   -----------------------------------------------------
   Mỗi mạch STM32 là một extension riêng (xem ../builtin/stm32*.js)
   có bộ khối lệnh RIÊNG: kiểu khối `<blockPrefix>_*`, tên khối ghi rõ
   tên mạch và tên chân thật của chip (PA0, PB12...). File này chỉ là
   phần dùng chung để các mạch không phải chép lại mã; nó không nằm
   trong ./builtin nên không tự đăng ký thành mạch.

   Khối di chuyển sinh lệnh Robot API của lõi (robot.forward...), nên
   hưởng chung hiệu chỉnh trong bảng "Cấu hình GPIO".
===================================================== */

import { defineExtension } from "../registry.js";
import { ANY_VALUE } from "../../valueSlots.js";
import { unmarkedCode } from "../../codeSourceMap.js";

const numberShadow = value => ({ shadow: { type: "math_number", fields: { NUM: value } } });
const valueOf = (block, gen, name, fallback) =>
  gen.valueToCode(block, name, gen.ORDER_NONE) || String(fallback);
const say = (verb, parts) => a => `${verb}${parts(a)}`;
/** Số cố định thì giới hạn sẵn trong mã; biểu thức thì để robot.servo()/buzzer() tự giới hạn khi chạy. */
const clampedLiteral = (code, min, max) => {
  const text = unmarkedCode(code).trim(); // mã giá trị có thể bọc marker của khối
  const n = Number(text);
  return text !== "" && Number.isFinite(n) ? String(Math.min(max, Math.max(min, Math.round(n)))) : code;
};
const options = pins => pins.map(pin => (Array.isArray(pin) ? pin : [pin, pin]));

/** Chuỗi C/C++ hợp lệ (thoát \ " ? và mọi byte điều khiển / ngoài ASCII). */
export function toCString(value) {
  let out = "";
  for (const byte of new TextEncoder().encode(String(value ?? ""))) {
    const ch = String.fromCharCode(byte);
    if (ch === "\\" || ch === '"') out += "\\" + ch;
    else if (ch === "?") out += "\\?";
    else if (byte >= 32 && byte < 127) out += ch;
    else out += "\\" + byte.toString(8).padStart(3, "0");
  }
  return `"${out}"`;
}

/**
 * spec:
 *   id, prefix, boardName ("BLUE PILL"), chip ("STM32F103C8T6"), group, fqbn, colour
 *   pins, sensors        chân mặc định (tên chip, ví dụ "PB12")
 *   ledPin, ledName, ledActiveLow
 *   button               { pin, name, activeLow } | null
 *   digitalPins, adcPins, pwmPins   danh sách chân cho khối GPIO (chuỗi hoặc [nhãn, giá trị])
 *   validPins            mọi chân có trên mạch (kiểm tra cấu hình)
 *   bluetooth            { uart, rx, tx }
 *   notes                ghi chú phần cứng hiện trong mô tả
 */
export function createStm32Board(spec) {
  const { prefix, boardName, chip, colour } = spec;
  const type = name => `${prefix}_${name}`;
  const tag = `[${boardName}]`;
  const s = spec.sensors;
  const blocks = [];

  const add = (entry, toolboxTarget, toolboxEntry) => {
    blocks.push(entry);
    toolboxTarget?.push(toolboxEntry || { kind: "block", type: entry.type });
  };

  /* ---------- Chân & thiết bị riêng của mạch ---------- */
  const hardware = [];
  hardware.push({ kind: "label", text: `${boardName} · ${chip}` });

  add({
    type: type("led"), kind: "statement",
    json: {
      message0: `${tag} ${spec.ledName} (${spec.ledPin}) %1`,
      args0: [{ type: "field_dropdown", name: "STATE", options: [["BẬT", "ON"], ["TẮT", "OFF"]] }],
      previousStatement: null, nextStatement: null, colour,
      tooltip: `${spec.ledName} trên chân ${spec.ledPin} của ${boardName}${spec.ledActiveLow ? " (sáng khi chân ở mức thấp — firmware đã tự đảo cho bạn)" : ""}.`,
    },
    generator: b => `robot.led("${b.getFieldValue("STATE") === "ON" ? "ON" : "OFF"}");\n`,
    assistant: { label: `${boardName}: ${spec.ledName} ${spec.ledPin}`, kw: `den led ${spec.ledPin} ${boardName} ${chip} stm32 bat tat`, desc: `Bật hoặc tắt ${spec.ledName} (${spec.ledPin}).`, say: a => `${spec.ledName} ${a("STATE")}` },
  }, hardware);

  if (spec.button) {
    add({
      type: type("button"), kind: "value",
      json: {
        message0: `${tag} ${spec.button.name} (${spec.button.pin}) ĐANG NHẤN?`,
        output: "Boolean", colour,
        tooltip: `Đúng khi nút ${spec.button.name} trên chân ${spec.button.pin} đang được nhấn.`,
      },
      generator: (b, gen) => [`stm32ButtonPressed(${spec.button.pin}, ${spec.button.activeLow ? "true" : "false"})`, gen.ORDER_FUNCTION_CALL],
      assistant: { label: `${boardName}: nút ${spec.button.name}`, kw: `nut bam button ${spec.button.pin} ${spec.button.name} ${boardName} ${chip} stm32`, desc: `Đúng khi nút ${spec.button.name} (${spec.button.pin}) đang nhấn.`, say: () => `nút ${spec.button.name} đang nhấn` },
    }, hardware);
  }

  add({
    type: type("buzzer"), kind: "statement",
    json: {
      message0: `${tag} CÒI (${s.buzzer}) kêu tần số %1 Hz`,
      args0: [{ type: "input_value", name: "FREQ", check: ANY_VALUE, shadow: 1000 }],
      previousStatement: null, nextStatement: null, colour,
      tooltip: `Còi/buzzer nối chân ${s.buzzer} của ${boardName}. Tần số 0 = tắt còi.`,
    },
    generator: (b, gen) => `robot.buzzer(${clampedLiteral(valueOf(b, gen, "FREQ", 1000), 0, 10000)});\n`,
    assistant: { label: `${boardName}: còi ${s.buzzer}`, kw: `coi buzzer keu ${s.buzzer} ${boardName} ${chip} stm32 am thanh`, desc: `Phát âm ở chân ${s.buzzer}.`, say: a => `Còi kêu ${a("FREQ")} Hz` },
  }, hardware);

  add({
    type: type("servo"), kind: "statement",
    json: {
      message0: `${tag} SERVO (${s.servo}) quay tới %1 °`,
      args0: [{ type: "input_value", name: "ANGLE", check: ANY_VALUE, shadow: 90 }],
      previousStatement: null, nextStatement: null, colour,
      tooltip: `Servo nối chân ${s.servo} của ${boardName}, góc 0–180°.`,
    },
    generator: (b, gen) => `robot.servo(${clampedLiteral(valueOf(b, gen, "ANGLE", 90), 0, 180)});\n`,
    assistant: { label: `${boardName}: servo ${s.servo}`, kw: `servo goc quay ${s.servo} ${boardName} ${chip} stm32`, desc: `Quay servo (${s.servo}) tới một góc 0–180°.`, say: a => `Servo quay tới ${a("ANGLE")}°` },
  }, hardware);

  add({
    type: type("distance"), kind: "value",
    json: {
      message0: `${tag} KHOẢNG CÁCH HC-SR04 (TRIG ${s.trig} · ECHO ${s.echo}) cm`,
      output: "Number", colour,
      tooltip: `Đo khoảng cách bằng HC-SR04. Trả về 400 khi không có vật cản. ECHO của HC-SR04 ra 5 V: phải qua cầu chia áp xuống 3,3 V trước khi vào ${s.echo}.`,
    },
    generator: (b, gen) => ["robot.distance()", gen.ORDER_FUNCTION_CALL],
    assistant: { label: `${boardName}: khoảng cách ${s.trig}/${s.echo}`, kw: `khoang cach sieu am hc-sr04 vat can ${boardName} ${chip} stm32`, desc: "Đo khoảng cách (cm) bằng HC-SR04; 400 nếu không có vật cản.", say: () => "khoảng cách phía trước (cm)" },
  }, hardware);

  for (const [side, label, pin, fn] of [["left", "TRÁI", s.lineLeft, "lineLeft"], ["right", "PHẢI", s.lineRight, "lineRight"]]) {
    add({
      type: type(`line_${side}`), kind: "value",
      json: { message0: `${tag} DÒ LINE ${label} (${pin})`, output: "Number", colour, tooltip: `Đọc cảm biến dò line ${label.toLowerCase()} ở chân ${pin} (0 hoặc 1).` },
      generator: (b, gen) => [`robot.${fn}()`, gen.ORDER_FUNCTION_CALL],
      assistant: { label: `${boardName}: dò line ${label.toLowerCase()} ${pin}`, kw: `do line vach cam bien ${label.toLowerCase()} ${pin} ${boardName} ${chip} stm32`, desc: `Đọc cảm biến dò line ${label.toLowerCase()} (${pin}): 0 hoặc 1.`, say: () => `dò line ${label.toLowerCase()}` },
    }, hardware);
  }

  hardware.push({ kind: "label", text: `Chân của ${boardName}` });
  const pinField = (name, list) => ({ type: "field_dropdown", name, options: options(list) });
  add({
    type: type("digital_write"), kind: "statement",
    json: {
      message0: `${tag} GHI CHÂN %1 mức %2`,
      args0: [pinField("PIN", spec.digitalPins), { type: "field_dropdown", name: "LEVEL", options: [["CAO (HIGH)", "HIGH"], ["THẤP (LOW)", "LOW"]] }],
      previousStatement: null, nextStatement: null, colour,
      tooltip: `Đặt chân số của ${boardName} lên mức cao/thấp (3,3 V). Danh sách chỉ gồm chân dùng được trên mạch này.`,
    },
    generator: b => `gpioWrite(${b.getFieldValue("PIN")}, ${b.getFieldValue("LEVEL") === "HIGH" ? "HIGH" : "LOW"});\n`,
    assistant: { label: `${boardName}: ghi chân số`, kw: `ghi chan digital write high low ${boardName} ${chip} stm32 gpio`, desc: "Đặt một chân số lên mức cao hoặc thấp.", say: a => `Ghi chân ${a("PIN")} = ${a("LEVEL")}` },
  }, hardware);
  add({
    type: type("digital_read"), kind: "value",
    json: { message0: `${tag} ĐỌC CHÂN %1`, args0: [pinField("PIN", spec.digitalPins)], output: "Number", colour, tooltip: `Đọc mức số (0/1) của một chân ${boardName}.` },
    generator: (b, gen) => [`gpioRead(${b.getFieldValue("PIN")})`, gen.ORDER_FUNCTION_CALL],
    assistant: { label: `${boardName}: đọc chân số`, kw: `doc chan digital read ${boardName} ${chip} stm32 gpio`, desc: "Đọc mức số (0 hoặc 1) của một chân.", say: a => `giá trị chân ${a("PIN")}` },
  }, hardware);
  add({
    type: type("analog_read"), kind: "value",
    json: { message0: `${tag} ĐỌC ADC chân %1 (0–1023)`, args0: [pinField("PIN", spec.adcPins)], output: "Number", colour, tooltip: `Đọc điện áp 0–3,3 V trên chân có ADC của ${boardName}; mặc định STM32duino trả về 0–1023.` },
    generator: (b, gen) => [`analogRead(${b.getFieldValue("PIN")})`, gen.ORDER_FUNCTION_CALL],
    assistant: { label: `${boardName}: đọc ADC`, kw: `doc adc analog analogread ${boardName} ${chip} stm32`, desc: "Đọc giá trị analog 0–1023 (0–3,3 V).", say: a => `giá trị analog chân ${a("PIN")}` },
  }, hardware);
  add({
    type: type("pwm_write"), kind: "statement",
    json: {
      message0: `${tag} PWM chân %1 độ rộng %2 %`,
      args0: [pinField("PIN", spec.pwmPins), { type: "input_value", name: "VALUE", check: ANY_VALUE, shadow: 50 }],
      previousStatement: null, nextStatement: null, colour,
      tooltip: `Xuất PWM 0–100 % trên chân có timer của ${boardName}. Danh sách chỉ gồm chân có kênh PWM.`,
    },
    generator: (b, gen) => `gpioPwm(${b.getFieldValue("PIN")}, ${valueOf(b, gen, "VALUE", 50)});\n`,
    assistant: { label: `${boardName}: PWM`, kw: `pwm xung do sang analogwrite ${boardName} ${chip} stm32`, desc: "Xuất PWM 0–100% trên chân có timer.", say: a => `PWM chân ${a("PIN")} = ${a("VALUE")}%` },
  }, hardware, { kind: "block", type: type("pwm_write"), inputs: { VALUE: numberShadow(50) } });

  /* ---------- Bluetooth HC-05/06 ---------- */
  const bt = spec.bluetooth;
  const btBlocks = [];
  btBlocks.push({ kind: "label", text: `HC-05/06 qua ${bt.uart} (RX ${bt.rx} · TX ${bt.tx})` });
  const keys = [["TIẾN (F)", "F"], ["LÙI (B)", "B"], ["TRÁI (L)", "L"], ["PHẢI (R)", "R"], ["DỪNG (S)", "S"]];
  add({
    type: type("bt_has_key"), kind: "value",
    json: { message0: `${tag} BLUETOOTH ${bt.uart} NHẬN LỆNH %1`, args0: [{ type: "field_dropdown", name: "KEY", options: keys }], output: "Boolean", colour, tooltip: `Đúng khi ký tự đang chờ ở ${bt.uart} là lệnh đã chọn (không xóa khỏi bộ đệm).` },
    generator: (b, gen) => [`(BT_SERIAL.available() > 0 && BT_SERIAL.peek() == '${b.getFieldValue("KEY")}')`, gen.ORDER_LOGICAL_AND],
    assistant: { label: `${boardName}: Bluetooth nhận lệnh`, kw: `bluetooth nhan lenh hc-05 ${bt.uart} ${boardName} ${chip} stm32`, desc: "Kiểm tra lệnh Bluetooth đang chờ.", say: a => `Bluetooth nhận lệnh ${a("KEY")}` },
  }, btBlocks);
  add({
    type: type("bt_read"), kind: "value",
    json: { message0: `${tag} ĐỌC KÝ TỰ BLUETOOTH ${bt.uart}`, output: "Number", colour, tooltip: "Trả về mã ký tự nhận được, hoặc -1 nếu chưa có dữ liệu." },
    generator: (b, gen) => ["BT_SERIAL.read()", gen.ORDER_FUNCTION_CALL],
    assistant: { label: `${boardName}: đọc ký tự Bluetooth`, kw: `bluetooth doc ky tu ${bt.uart} ${boardName} ${chip} stm32`, desc: "Đọc một ký tự nhận qua Bluetooth (-1 nếu chưa có).", say: () => "ký tự Bluetooth nhận được" },
  }, btBlocks);
  add({
    type: type("bt_send"), kind: "statement",
    json: { message0: `${tag} GỬI BLUETOOTH ${bt.uart} %1`, args0: [{ type: "field_input", name: "TEXT", text: "OK" }], previousStatement: null, nextStatement: null, colour, tooltip: "Gửi một dòng chữ tới thiết bị Bluetooth đã kết nối." },
    generator: b => `BT_SERIAL.println(${toCString(b.getFieldValue("TEXT") || "")});\n`,
    assistant: { label: `${boardName}: gửi Bluetooth`, kw: `bluetooth gui chuoi println ${bt.uart} ${boardName} ${chip} stm32`, desc: "Gửi một dòng chữ qua Bluetooth.", say: a => `Gửi Bluetooth "${a("TEXT")}"` },
  }, btBlocks);

  /* ---------- Hồ sơ phần cứng ---------- */
  const profile = {
    group: spec.group,
    id: spec.id,
    name: spec.profileName,
    description: spec.description,
    board: spec.boardFull,
    mcu: chip,
    platform: "stm32",
    fqbn: spec.fqbn,
    core: "STMicroelectronics:stm32 (STM32duino)",
    pwmMode: "analogWrite",
    pins: { ...spec.pins },
    sensors: { ...spec.sensors, led: spec.ledPin },
    ledActiveLow: Boolean(spec.ledActiveLow),
    bluetoothUart: bt.uart,
    bluetoothPins: { rx: bt.rx, tx: bt.tx },
    pinRules: {
      gpioMin: 0, gpioMax: 0, blockedPins: [], inputOnlyPins: [], invalidRanges: [],
      specialWarnings: spec.specialPins || [],
      validPins: spec.validPins,
      digitalPins: options(spec.digitalPins).map(p => p[1]),
      adcPins: options(spec.adcPins).map(p => p[1]),
      pwmPins: options(spec.pwmPins).map(p => p[1]),
      timerReservations: spec.timerReservations || {},
      pwmTimerMap: spec.pwmTimerMap || {},
    },
  };

  const sections = [];
  if (spec.button) {
    sections.push({
      id: "button",
      usedWhen: /stm32ButtonPressed/,
      prelude: `bool stm32ButtonPressed(int pin, bool activeLow) {\n  pinMode(pin, activeLow ? INPUT_PULLUP : INPUT);\n  return digitalRead(pin) == (activeLow ? LOW : HIGH);\n}\n`,
    });
  }

  return defineExtension({
    id: spec.id,
    name: `${spec.boardName} (${chip})`,
    version: "1.0.0",
    description: spec.description,
    blockPrefix: prefix,
    requires: { platform: "stm32" },
    // Khối GPIO/Bluetooth chung của lõi bị ẩn: mạch này có khối riêng.
    capabilities: { remove: ["gpio", "bluetooth"] },
    profiles: [profile],
    blocks,
    toolbox: [
      { kind: "category", name: `🧩 ${boardName}`, colour, contents: hardware },
      { kind: "category", name: `🔵 Bluetooth · ${boardName}`, colour, contents: btBlocks },
    ],
    sketch: { sections },
    // Chân trùng nhau là lỗi nối dây điển hình: báo trước khi biên dịch.
    validate: ({ config }) => {
      const errors = [];
      const used = new Map();
      const names = {
        leftIn1: "IN1", leftIn2: "IN2", leftEn: "ENA", rightIn1: "IN3", rightIn2: "IN4", rightEn: "ENB",
        trig: "TRIG", echo: "ECHO", lineLeft: "LINE trái", lineRight: "LINE phải", led: "LED", buzzer: "còi", servo: "servo",
      };
      const claim = (pin, role) => {
        const key = String(pin).trim().toUpperCase();
        if (used.has(key)) errors.push(`Chân ${key} đang dùng cho cả "${used.get(key)}" và "${role}" trên ${spec.boardName}.`);
        else used.set(key, role);
      };
      claim(bt.rx, `Bluetooth ${bt.uart} RX`);
      claim(bt.tx, `Bluetooth ${bt.uart} TX`);
      // STM32 không còn khối di chuyển nên chỉ kiểm tra chân cảm biến/phụ kiện.
      for (const group of ["sensors"]) {
        for (const [key, value] of Object.entries(config[group] || {})) claim(value, names[key] || key);
      }
      return errors;
    },
  });
}
