import test from "node:test";
import assert from "node:assert/strict";
import bluePill from "../src/extensions/builtin/stm32BluePill.js";
import blackPill from "../src/extensions/builtin/stm32BlackPill.js";
import nucleo from "../src/extensions/builtin/stm32NucleoF401RE.js";
import ctExpansion from "../src/extensions/builtin/ctExpansionEsp32.js";
import { registerExtension, getToolboxCategories, getActiveExtensions } from "../src/extensions/registry.js";
import { filterToolbox } from "../src/extensions/capabilities.js";
import {
  BOARD_GROUPS, buildArduinoSketch, getHardwareProfile, profileToConfig, validateHardwareConfig,
} from "../src/hardwareProfiles.js";
import { SUPPORTED_FQBNS } from "../src/boardTargets.js";
import { toCString } from "../src/extensions/stm32/factory.js";

const BOARDS = [
  { ext: bluePill, name: "BLUE PILL", prefix: "stm32bp" },
  { ext: blackPill, name: "BLACK PILL", prefix: "stm32bk" },
  { ext: nucleo, name: "NUCLEO-F401RE", prefix: "stm32nuc" },
];
BOARDS.forEach(b => registerExtension(b.ext));

// Bộ sinh mã giả: đủ để gọi generator của khối.
const gen = {
  ORDER_NONE: 99, ORDER_ATOMIC: 0, ORDER_FUNCTION_CALL: 2, ORDER_LOGICAL_AND: 13,
  valueToCode: (block, name) => block.inputs?.[name] ?? "",
};
const fake = (fields = {}, inputs = {}) => ({ getFieldValue: n => fields[n], inputs });
const blockOf = (board, suffix) => board.ext.blocks.find(b => b.type === `${board.prefix}_${suffix}`);

test("3 mạch STM32 đăng ký vào nhóm STM32 với FQBN được phép biên dịch", () => {
  const group = BOARD_GROUPS.find(g => g.label === "STM32");
  assert.ok(group);
  for (const b of BOARDS) {
    const profile = getHardwareProfile(b.ext.id);
    assert.equal(profile.id, b.ext.id);
    assert.equal(profile.platform, "stm32");
    assert.ok(group.ids.includes(b.ext.id));
    assert.ok(SUPPORTED_FQBNS.has(profile.fqbn), profile.fqbn);
    assert.ok(profile.fqbn.startsWith("STMicroelectronics:stm32:"));
  }
});

test("mỗi mạch có bộ khối riêng: kiểu khối theo tiền tố mạch, tên khối ghi tên mạch", () => {
  const seen = new Set();
  for (const b of BOARDS) {
    assert.ok(b.ext.blocks.length >= 10);
    for (const block of b.ext.blocks) {
      assert.ok(block.type.startsWith(`${b.prefix}_`), block.type);
      assert.ok(!seen.has(block.type), `trùng kiểu khối ${block.type}`);
      seen.add(block.type);
      assert.ok(block.json.message0.includes(`[${b.name}]`), `${block.type}: "${block.json.message0}" thiếu tên mạch`);
    }
  }
});

test("khối ghi đúng tên chân thật của từng mạch", () => {
  assert.match(blockOf(BOARDS[0], "led").json.message0, /\(PC13\)/);
  assert.match(blockOf(BOARDS[1], "led").json.message0, /\(PC13\)/);
  assert.match(blockOf(BOARDS[2], "led").json.message0, /LED LD2 \(PA5\)/);
  assert.match(blockOf(BOARDS[1], "button").json.message0, /NÚT KEY \(PA0\)/);
  assert.match(blockOf(BOARDS[2], "button").json.message0, /NÚT USER B1 \(PC13\)/);
  assert.equal(blockOf(BOARDS[0], "button"), undefined, "Blue Pill không có nút người dùng");
  assert.match(blockOf(BOARDS[0], "distance").json.message0, /TRIG PB0 · ECHO PB1/);
  assert.match(blockOf(BOARDS[2], "distance").json.message0, /TRIG PA7 · ECHO PA6/);
  assert.match(blockOf(BOARDS[0], "bt_send").json.message0, /USART2/);
  assert.match(blockOf(BOARDS[2], "bt_send").json.message0, /USART6/);
  // Nucleo ghi cả tên chân Arduino lẫn tên chip trong danh sách chân.
  const nucPins = blockOf(BOARDS[2], "digital_write").json.args0[0].options;
  assert.ok(nucPins.some(([label, value]) => label === "D5 (PB4)" && value === "PB4"));
  // Blue Pill không cho chọn Bluetooth, USB / SWD / UART1 ở GPIO tổng quát.
  const bpPins = blockOf(BOARDS[0], "digital_write").json.args0[0].options.map(o => o[1]);
  const bpAdc = blockOf(BOARDS[0], "analog_read").json.args0[0].options.map(o => o[1]);
  for (const bad of ["PA2", "PA3", "PA9", "PA10", "PA11", "PA12", "PA13", "PA14"]) assert.ok(!bpPins.includes(bad), bad);
  for (const bad of ["PA2", "PA3"]) assert.ok(!bpAdc.includes(bad), `Blue Pill ADC: ${bad}`);
  // Black Pill không cho ghi/đọc GPIO vào nút KEY và UART Bluetooth.
  const bkDigital = blockOf(BOARDS[1], "digital_write").json.args0[0].options.map(o => o[1]);
  const bkAdc = blockOf(BOARDS[1], "analog_read").json.args0[0].options.map(o => o[1]);
  for (const bad of ["PA0", "PA2", "PA3"]) {
    assert.ok(!bkDigital.includes(bad), `Black Pill Digital: ${bad}`);
    assert.ok(!bkAdc.includes(bad), `Black Pill ADC: ${bad}`);
  }
  // PWM Blue Pill không dùng timer xung đột tone/Servo; PB6/PB7 là ENA/ENB mặc định.
  const bpPwm = blockOf(BOARDS[0], "pwm_write").json.args0[0].options.map(o => o[1]);
  assert.ok(bpPwm.includes("PB6") && bpPwm.includes("PB7"));
  assert.ok(!bpPwm.includes("PA6") && !bpPwm.includes("PA0") && !bpPwm.includes("PA1"));
});

test("sinh mã: LED, chân, PWM, Bluetooth", () => {
  for (const b of BOARDS) {
    assert.equal(blockOf(b, "led").generator(fake({ STATE: "ON" }), gen), 'robot.led("ON");\n');
    assert.equal(blockOf(b, "digital_write").generator(fake({ PIN: "PB4", LEVEL: "HIGH" }), gen), "gpioWrite(PB4, HIGH);\n");
    assert.deepEqual(blockOf(b, "analog_read").generator(fake({ PIN: "PA0" }), gen), ["analogRead(PA0)", 2]);
    assert.equal(blockOf(b, "pwm_write").generator(fake({ PIN: "PA6" }, { VALUE: "30" }), gen), "gpioPwm(PA6, 30);\n");
    assert.equal(blockOf(b, "servo").generator(fake({}, { ANGLE: "400" }), gen), "robot.servo(180);\n");
    assert.equal(blockOf(b, "buzzer").generator(fake({}, { FREQ: "-5" }), gen), "robot.buzzer(0);\n");
    // Ô nhận biểu thức kéo vào: giữ nguyên biểu thức (robot.servo()/buzzer() tự giới hạn khi chạy).
    assert.equal(blockOf(b, "servo").generator(fake({}, { ANGLE: "(robot.distance() * 2)" }), gen), "robot.servo((robot.distance() * 2));\n");
    assert.deepEqual(blockOf(b, "bt_has_key").generator(fake({ KEY: "F" }), gen), ["(BT_SERIAL.available() > 0 && BT_SERIAL.peek() == 'F')", 13]);
  }
});

test("Bluetooth gửi chuỗi: thoát đúng chuẩn C++", () => {
  assert.equal(toCString('a"b\\c'), '"a\\"b\\\\c"');
  assert.equal(toCString("x\n"), '"x\\012"');
  assert.equal(toCString("??="), '"\\?\\?="');
  assert.equal(toCString("à"), '"\\303\\240"');
});

test("cấu hình mặc định của 3 mạch hợp lệ và không trùng chân", () => {
  for (const b of BOARDS) {
    assert.deepEqual(validateHardwareConfig(profileToConfig(b.ext.id)), [], b.name);
  }
});

test("kiểm tra cấu hình: sai tên chân, trùng chân, chân không có trên mạch (chỉ chân cảm biến/phụ kiện)", () => {
  const cfg = id => profileToConfig(id);
  let c = cfg("stm32-blue-pill"); c.sensors.trig = "12";
  assert.match(validateHardwareConfig(c).join("\n"), /không đúng dạng tên chân STM32/);
  c = cfg("stm32-blue-pill"); c.sensors.trig = c.sensors.echo.toLowerCase(); // trùng ECHO, chữ thường vẫn nhận ra
  assert.match(validateHardwareConfig(c).join("\n"), /TRIG.*ECHO|ECHO.*TRIG/);
  c = cfg("stm32-black-pill"); c.sensors.echo = "PB11"; // F411CE 48 chân không có PB11
  assert.match(validateHardwareConfig(c).join("\n"), /không có trên/);
  c = cfg("stm32-nucleo-f401re"); c.sensors.trig = "PA12"; // PA12 đang là USART6 RX của Bluetooth
  assert.match(validateHardwareConfig(c).join("\n"), /PA12/);
});

test("STM32 không còn khối di chuyển nên không kiểm tra chân động cơ", () => {
  for (const id of ["stm32-blue-pill", "stm32-black-pill", "stm32-nucleo-f401re"]) {
    const c = profileToConfig(id);
    c.pins.leftEn = "12"; c.pins.leftIn1 = c.pins.leftIn2; // sai kiểu gì cũng không báo
    assert.deepEqual(validateHardwareConfig(c), [], id);
    assert.equal(getHardwareProfile(id).hasMotors, undefined);
  }
});

test("chỉ CT Expansion Board có cấu hình chân động cơ; Arduino/ESP32 thường không bị kiểm tra ENA/ENB", () => {
  registerExtension(ctExpansion);
  assert.equal(getHardwareProfile("ct-expansion-esp32").hasMotors, true);
  const nano = profileToConfig("arduino-nano-l298n"); nano.pins.leftEn = 2; // không phải chân PWM
  assert.deepEqual(validateHardwareConfig(nano), []);
  const esp = profileToConfig("esp32-l298n"); esp.motor.pwmResolution = 99;
  assert.deepEqual(validateHardwareConfig(esp), []);
});

function sketchFor(board, program = "robot.forward(80, 1);\n", fns = "") {
  const profile = getHardwareProfile(board.ext.id);
  return buildArduinoSketch(profileToConfig(profile.id), program, fns);
}

test("sketch STM32: chân, UART Bluetooth, polarity LED theo từng mạch", () => {
  const bp = sketchFor(BOARDS[0]);
  assert.match(bp, /#define LEFT_IN1 PB12/);
  assert.match(bp, /#define LEFT_EN PB6/);
  assert.match(bp, /#define RIGHT_EN PB7/);
  assert.match(bp, /HardwareSerial BTSerial\(BT_RX_PIN, BT_TX_PIN\)/);
  assert.match(bp, /#define BT_RX_PIN PA3/);
  assert.match(bp, /#define LED_ACTIVE_LOW 1/);
  assert.match(bp, /BT_SERIAL\.begin\(115200\);/);
  assert.match(bp, /FQBN: STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8/);
  assert.doesNotMatch(bp, /ledc|ESP32Servo|SERIAL_8N1/);

  const nuc = sketchFor(BOARDS[2]);
  assert.match(nuc, /#define LED_PIN PA5/);
  assert.match(nuc, /#define LED_ACTIVE_LOW 0/);
  assert.match(nuc, /#define BT_RX_PIN PA12/);
  assert.match(nuc, /#define BT_TX_PIN PA11/);
});

test("hàm nút nhấn chỉ có trong sketch khi khối được dùng", () => {
  assert.doesNotMatch(sketchFor(BOARDS[1]), /stm32ButtonPressed/);
  const used = sketchFor(BOARDS[1], "if (stm32ButtonPressed(PA0, true)) { robot.stop(); }\n");
  assert.match(used, /bool stm32ButtonPressed\(int pin, bool activeLow\)/);
});

test("khối Servo kéo thư viện Servo của STM32duino", () => {
  assert.match(sketchFor(BOARDS[0], "robot.servo(90);\n"), /#include <Servo\.h>/);
});

test("toolbox: khối GPIO/Bluetooth chung bị ẩn, khối riêng của đúng mạch hiện đủ", () => {
  for (const b of BOARDS) {
    const profile = getHardwareProfile(b.ext.id);
    assert.deepEqual(getActiveExtensions(profile).map(e => e.id), [b.ext.id]);
    const cats = getToolboxCategories(profile);
    assert.equal(cats.length, 2); // Phần cứng của mạch + Bluetooth (không còn nhóm Di chuyển)
    for (const cat of cats) assert.ok(cat.name.includes(b.name), cat.name);
    const inToolbox = new Set(cats.flatMap(c => c.contents).filter(x => x.kind === "block").map(x => x.type));
    for (const block of b.ext.blocks) assert.ok(inToolbox.has(block.type), `${block.type} không có trong toolbox`);

    const core = { kind: "categoryToolbox", contents: [
      { kind: "category", name: "Analog / Digital", requires: "gpio", contents: [{ kind: "block", type: "ct_digital_write" }] },
      { kind: "category", name: "Bluetooth", requires: "bluetooth", contents: [{ kind: "block", type: "ct_bt_send" }] },
      { kind: "category", name: "Logic", contents: [{ kind: "block", type: "ct_compare" }] },
    ] };
    const names = filterToolbox(core, profile).contents.map(c => c.name);
    assert.deepEqual(names, ["Logic"]);
  }
});

test("extension STM32 không bật trên board khác", () => {
  for (const id of ["arduino-nano-l298n", "esp32-l298n", "ct-robot-edu-board"]) {
    assert.equal(getActiveExtensions(getHardwareProfile(id)).filter(e => e.id.startsWith("stm32-")).length, 0, id);
  }
});

test("STM32 không còn khối di chuyển (chỉ CT Expansion Board có)", () => {
  for (const b of BOARDS) {
    const types = b.ext.blocks.map(x => x.type);
    assert.ok(!types.some(t => /_(forward|backward|turn_left|turn_right|stop)(_|$)/.test(t)), types.join());
    assert.ok(!b.ext.toolbox.some(c => /Di chuyển/.test(c.name)));
  }
});

test("mã mạch mới không còn chữ L298N; mã cũ vẫn nhận ra đúng mạch", () => {
  const pairs = { "arduino-nano-l298n": "arduino-nano", "arduino-uno-l298n": "arduino-uno", "esp32-l298n": "esp32-devkit", "esp32-s3-l298n": "esp32-s3-devkit" };
  for (const [legacy, id] of Object.entries(pairs)) {
    assert.equal(getHardwareProfile(id).id, id);
    assert.equal(getHardwareProfile(legacy).id, id, legacy);
    assert.equal(profileToConfig(legacy).profileId, id);
    assert.ok(!/l298n/i.test(getHardwareProfile(id).id + getHardwareProfile(id).name));
  }
  assert.ok(!BOARD_GROUPS.flatMap(g => g.ids).some(id => /l298n/i.test(id)));
});
