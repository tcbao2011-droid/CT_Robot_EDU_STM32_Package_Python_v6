import test from "node:test";
import assert from "node:assert/strict";
import extension from "../src/extensions/builtin/ctExpansionEsp32.js";
import { registerExtension, getToolboxCategories } from "../src/extensions/registry.js";
import { filterToolbox } from "../src/extensions/capabilities.js";
import { DEFAULT_HARDWARE_CONFIG, buildArduinoSketch, getHardwareProfile, validateHardwareConfig } from "../src/hardwareProfiles.js";
import { RANGES } from "../src/assistant/lint.js";

registerExtension(extension);
const profile = getHardwareProfile("ct-expansion-esp32");
const config = { ...DEFAULT_HARDWARE_CONFIG, profileId: profile.id, pins: { ...profile.pins }, sensors: { ...profile.sensors } };
const byType = Object.fromEntries(extension.blocks.map(b => [b.type, b]));

// Bộ sinh mã giả: ô nhập nào có giá trị trong `inputs` thì trả về, ngược lại chuỗi rỗng (dùng giá trị mặc định).
const gen = inputs => ({ ORDER_NONE: 99, valueToCode: (_b, name) => inputs[name] ?? "" });

test("11 khối di chuyển được khai báo, tên và ô nhập khớp khối core", () => {
  const moves = extension.blocks.filter(b => /^ctexp_(forward|backward|turn_|stop)/.test(b.type));
  assert.equal(moves.length, 11);
  for (const b of moves) {
    assert.equal(b.kind, "statement");
    assert.ok(b.assistant?.label && b.assistant.say, `${b.type} thiếu mô tả cho trợ lý`);
    assert.ok(b.json.tooltip, `${b.type} thiếu tooltip`);
  }
});

test("sinh mã đúng lệnh Robot API với giá trị mặc định và giá trị người dùng", () => {
  const code = (type, inputs = {}) => byType[type].generator({}, gen(inputs));
  assert.equal(code("ctexp_forward"), "robot.forward(80, 1);\n");
  assert.equal(code("ctexp_forward", { SPEED: "50", SECONDS: "2" }), "robot.forward(50, 2);\n");
  assert.equal(code("ctexp_backward"), "robot.backward(80, 1);\n");
  assert.equal(code("ctexp_turn_left"), "robot.turnLeft(60, 0.5);\n");
  assert.equal(code("ctexp_turn_right", { SPEED: "v" }), "robot.turnRight(v, 0.5);\n");
  assert.equal(code("ctexp_forward_continuous"), "robot.forwardContinuous(80);\n");
  assert.equal(code("ctexp_backward_continuous"), "robot.backwardContinuous(80);\n");
  assert.equal(code("ctexp_turn_left_continuous"), "robot.turnLeftContinuous(60);\n");
  assert.equal(code("ctexp_turn_right_continuous"), "robot.turnRightContinuous(60);\n");
  assert.equal(code("ctexp_turn_left_angle"), "robot.turnLeftAngle(60, 90);\n");
  assert.equal(code("ctexp_turn_right_angle", { DEGREES: "45" }), "robot.turnRightAngle(60, 45);\n");
  assert.equal(code("ctexp_stop"), "robot.stop();\n");
});

test("toolbox của CT Expansion có nhóm 🚗 Di chuyển, đủ khối, có giá trị mặc định điền sẵn", () => {
  const cats = filterToolbox({ kind: "categoryToolbox", contents: getToolboxCategories(profile) }, profile).contents;
  assert.deepEqual(cats.map(c => c.name), ["🚗 Di chuyển", "🧩 Mạch mở rộng CT"]);
  const blocks = cats[0].contents.filter(c => c.kind === "block");
  assert.equal(blocks.length, 11);
  const forward = blocks.find(b => b.type === "ctexp_forward");
  assert.equal(forward.inputs.SPEED.shadow.fields.NUM, 80);
  assert.equal(forward.inputs.SECONDS.shadow.fields.NUM, 1);
  // mọi khối đã khai báo đều xuất hiện đúng một lần trong toolbox
  const listed = cats.flatMap(c => c.contents).filter(c => c.kind === "block").map(c => c.type);
  assert.deepEqual([...listed].sort(), extension.blocks.map(b => b.type).sort());
});

test("sketch CT Expansion dùng khối di chuyển: có Robot API, không kéo thêm mã động cơ 6 kênh", () => {
  const main = [
    byType.ctexp_forward.generator({}, gen({})),
    byType.ctexp_turn_left_angle.generator({}, gen({})),
    byType.ctexp_stop.generator({}, gen({})),
  ].join("");
  const sketch = buildArduinoSketch(config, main);
  assert.match(sketch, /robot\.forward\(80, 1\);/);
  assert.match(sketch, /robot\.turnLeftAngle\(60, 90\);/);
  assert.match(sketch, /robot\.stop\(\);/);
  assert.match(sketch, /#define LEFT_IN1 19/);
  assert.match(sketch, /#define RIGHT_EN 17/);
  assert.doesNotMatch(sketch, /CTEXP_MOTORS/);
  assert.deepEqual(validateHardwareConfig(config), []);
});

test("trợ lý kiểm tra giới hạn tốc độ/thời gian/góc cho khối di chuyển mới", () => {
  assert.deepEqual(RANGES.ctexp_forward.SPEED.slice(0, 2), [-100, 100]);
  assert.equal(RANGES.ctexp_turn_left_angle.DEGREES[1], 360);
  assert.ok(RANGES.ctexp_backward_continuous.SPEED);
});
