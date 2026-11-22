import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, search } from "../src/assistant/search.js";
import { lint } from "../src/assistant/lint.js";
import { explainProgram, explainBlock, describe } from "../src/assistant/explain.js";
import { INFO } from "../src/assistant/knowledge.js";
import { fold } from "../src/assistant/text.js";

/* ---- dựng cây giả: n(type, {f: trường, v: ngõ vào giá trị, s: thân, valueNames}, ...tiếp theo) ---- */
let uid = 0;
function n(type, { f = {}, v = {}, s = {}, names = [], value = false } = {}, next = null) {
  const node = {
    id: `b${++uid}`, type, parent: null, prev: null, next, isShadow: false, isValue: value,
    fields: { ...f }, texts: Object.fromEntries(Object.entries(f).map(([k, x]) => [k, String(x)])),
    values: v, valueNames: [...new Set([...names, ...Object.keys(v)])], stmts: s, stmtNames: Object.keys(s),
  };
  Object.values(v).forEach(c => { c.parent = node; });
  for (const head of Object.values(s)) for (let c = head; c; c = c.next) c.parent = node;
  if (next) next.prev = node;
  return node;
}
const num = x => n("math_number", { f: { NUM: x }, value: true });
const tree = (...roots) => ({ roots });
const rules = (t, ctx) => lint(t, ctx).map(p => p.rule);

const entries = [
  { type: "ct_turn_left", category: "Chuyển động", label: "Quay trái", kw: INFO.ct_turn_left.kw, desc: INFO.ct_turn_left.desc },
  { type: "ct_distance", category: "Cảm biến", label: "Khoảng cách (cm)", kw: INFO.ct_distance.kw, desc: INFO.ct_distance.desc },
  { type: "ct_servo", category: "Cơ cấu", label: "Servo (độ)", kw: INFO.ct_servo.kw, desc: INFO.ct_servo.desc },
  { type: "ct_wait", category: "Thời gian", label: "Chờ (giây)", kw: INFO.ct_wait.kw, desc: INFO.ct_wait.desc },
];
const index = buildIndex(entries);

test("fold bỏ dấu tiếng Việt", () => {
  assert.equal(fold("Đi thẳng, QUAY Trái!"), "di thang quay trai");
});

test("tìm không dấu, đồng nghĩa và gõ sai 1 ký tự", () => {
  assert.equal(search(index, "quay trai")[0].type, "ct_turn_left");
  assert.equal(search(index, "sieu am")[0].type, "ct_distance");
  assert.equal(search(index, "delay")[0].type, "ct_wait");
  assert.equal(search(index, "servoo")[0].type, "ct_servo");
  assert.deepEqual(search(index, "zzzz"), []);
  assert.deepEqual(search(index, "led"), []);              // không có khối LED trong danh mục giả
  assert.deepEqual(search(index, "robot di chuyen xa"), []); // mọi từ đều phải khớp
  assert.deepEqual(search(index, "cong"), []);             // "cong" không được khớp lạc vào mô tả
  assert.equal(search(index, "khoi lenh servo")[0].type, "ct_servo"); // bỏ từ thừa
  assert.equal(search(index, "ch")[0].type, "ct_wait");
  assert.deepEqual(search(index, "   "), []);
});

test("lint: chưa có khối sự kiện", () => {
  assert.deepEqual(rules(tree(n("ct_stop"))), ["no-hat"]);
});

test("lint: nhóm khối rời và LẶP MÃI chặn khối phía sau", () => {
  const hat = n("ct_when_started", { s: { DO: n("ct_forever", { s: { DO: n("ct_stop") } }, n("ct_stop")) } });
  const orphan = n("ct_stop");
  const r = rules(tree(hat, orphan));
  assert.ok(r.includes("orphan"));
  assert.ok(r.includes("after-forever"));
});

test("lint: giá trị ngoài khoảng có sửa nhanh", () => {
  const motor = n("ct_motor_left", { v: { SPEED: num(250) } });
  const problems = lint(tree(n("ct_when_started", { s: { DO: motor } })));
  const range = problems.find(p => p.rule === "range");
  assert.ok(range);
  assert.deepEqual(range.fix, { kind: "setNumber", blockId: motor.values.SPEED.id, field: "NUM", value: 100, label: "Đổi thành 100" });
});

test("lint: servo, chia cho 0, NẾU thiếu điều kiện", () => {
  const body = n("ct_servo", { f: { ANGLE: 200 } }, n("ct_math_operation", { f: { OP: "DIV" }, v: { A: num(1), B: num(0) } }));
  const cond = n("controls_if", { names: ["IF0"], s: { DO0: n("ct_stop") } });
  const r = rules(tree(n("ct_when_started", { s: { DO: body } }), n("ct_when_started", { s: { DO: cond } })));
  for (const rule of ["range", "div-zero", "empty-input"]) assert.ok(r.includes(rule), rule);
});

test("lint: sự kiện không khớp", () => {
  const t = tree(n("ct_when_started", { s: { DO: n("ct_broadcast", { f: { NAME: "Xin_chao" } }) } }),
    n("ct_on_receive", { f: { NAME: "khac" }, s: { DO: n("ct_stop") } }));
  const r = rules(t);
  assert.ok(r.includes("no-receiver"));
  assert.ok(r.includes("no-sender"));
});

test("lint: khớp tên sự kiện không phân biệt hoa thường", () => {
  const t = tree(n("ct_when_started", { s: { DO: n("ct_broadcast", { f: { NAME: "Go" } }) } }),
    n("ct_on_receive", { f: { NAME: "go" }, s: { DO: n("ct_stop") } }));
  assert.deepEqual(rules(t), []);
});

test("lint: khối không dùng được với phần cứng và chân ESP32 chỉ đọc", () => {
  const ctx = { platform: "esp32", boardName: "ESP32", isUnavailable: t => t === "ct_led", reserved: new Map([[12, "motor"]]) };
  const body = n("ct_led", { f: { STATE: "ON" } },
    n("ct_digital_write", { v: { PIN: num(34) } },
      n("ct_digital_write", { v: { PIN: num(12) } })));
  const r = rules(tree(n("ct_when_started", { s: { DO: body } })), ctx);
  for (const rule of ["unavailable", "pin-input-only", "pin-reserved"]) assert.ok(r.includes(rule), rule);
});

test("lint: chương trình đúng không có cảnh báo", () => {
  const loop = n("ct_forever", { s: { DO: n("ct_motor_left", { v: { SPEED: num(80) } }, n("ct_wait", { f: { SECONDS: 1 } })) } });
  assert.deepEqual(rules(tree(n("ct_when_started", { s: { DO: loop } }))), []);
});

test("giải thích: mô tả khối và đoạn lồng nhau bằng tiếng Việt", () => {
  const cond = n("ct_compare", { f: { OP: "<" }, v: { A: n("ct_distance", { value: true }), B: num(20) }, value: true });
  const iff = n("controls_if", { v: { IF0: cond }, s: { DO0: n("ct_turn_left", { v: { SPEED: num(60), SECONDS: num(1) } }), ELSE: n("ct_forward_continuous", { v: { SPEED: num(80) } }) } });
  const start = n("ct_when_started", { s: { DO: n("ct_forever", { s: { DO: iff } }) } });
  const out = explainProgram(tree(start));
  const text = out.lines.map(l => `${"  ".repeat(l.depth)}${l.text}`).join("\n");
  assert.match(text, /Lặp lại mãi mãi:/);
  assert.match(text, /Nếu khoảng cách tới vật phía trước \(cm\) < 20 thì:/);
  assert.match(text, /Quay trái với tốc độ 60% trong 1 giây/);
  assert.match(text, /Nếu không thì:/);
  assert.match(out.summary, /đo khoảng cách/);
  assert.equal(explainBlock(iff).summary, INFO.controls_if.desc);
});

test("giải thích: khối chưa biết vẫn có mô tả dự phòng", () => {
  assert.equal(describe(n("unknown_block", { f: { X: 5 } })), "unknown_block (5)");
});

test("giải thích: ô còn trống được nói rõ", () => {
  assert.match(describe(n("ct_motor_left", { names: ["SPEED"] })), /chưa gắn/);
});

// GPIO thông thường của board phổ thông không bị khóa theo sơ đồ đấu dây mẫu;
// chân đặc biệt của MCU và chân PCB cố định CT Expansion vẫn được cảnh báo.
test("AI pin lint only warns special pins on ordinary boards", async () => {
  const { HARDWARE_PROFILES, profileToConfig } = await import("../src/hardwareProfiles.js");
  const { buildAssistantPinRules } = await import("../src/assistant/pinRules.js");
  const profile = HARDWARE_PROFILES.ESP32_L298N;
  const context = { platform: profile.platform, boardName: profile.name, ...buildAssistantPinRules(profile, [], profileToConfig(profile.id)) };
  const ordinaryPin = n("ct_gpio_write", { v: { PIN: num(25) } });
  const specialPin = n("ct_gpio_write", { v: { PIN: num(0) } });
  const result = lint(tree(n("ct_when_started", { s: { DO: ordinaryPin } }), n("ct_when_started", { s: { DO: specialPin } })), context);
  assert.ok(!result.some(item => item.blockId === ordinaryPin.id && item.rule.startsWith("pin-")));
  assert.ok(result.some(item => item.blockId === specialPin.id && item.rule === "pin-special-warning"));
});

test("AI keeps CT Expansion fixed PCB GPIO reservations", async () => {
  const { registerExtension } = await import("../src/extensions/registry.js");
  const extension = (await import("../src/extensions/builtin/ctExpansionEsp32.js")).default;
  const { getHardwareProfile, profileToConfig } = await import("../src/hardwareProfiles.js");
  const { buildAssistantPinRules } = await import("../src/assistant/pinRules.js");
  try { registerExtension(extension); } catch (_) {}
  const profile = getHardwareProfile("ct-expansion-esp32");
  const context = { platform: profile.platform, boardName: profile.name, ...buildAssistantPinRules(profile, [extension], profileToConfig(profile.id)) };
  const fixedPin = n("ct_gpio_write", { v: { PIN: num(19) } });
  const result = lint(tree(n("ct_when_started", { s: { DO: fixedPin } })), context);
  assert.ok(result.some(item => item.blockId === fixedPin.id && item.rule === "pin-reserved"));
});


test("AI nhận diện chân STM32 dạng PAx/PBx, chân đã dùng và giới hạn mode", async () => {
  const { registerExtension } = await import("../src/extensions/registry.js");
  const { getHardwareProfile, profileToConfig } = await import("../src/hardwareProfiles.js");
  const { buildAssistantPinRules } = await import("../src/assistant/pinRules.js");
  const blue = (await import("../src/extensions/builtin/stm32BluePill.js")).default;
  const black = (await import("../src/extensions/builtin/stm32BlackPill.js")).default;
  try { registerExtension(blue); } catch (_) {}
  try { registerExtension(black); } catch (_) {}

  const bp = getHardwareProfile("stm32-blue-pill");
  const bpContext = { platform: "stm32", boardName: bp.name, ...buildAssistantPinRules(bp, [], profileToConfig(bp.id)) };
  const swd = n("stm32bp_digital_write", { f: { PIN: "PB3", LEVEL: "HIGH" } });
  const motor = n("stm32bp_digital_write", { f: { PIN: "PB12", LEVEL: "HIGH" } });
  const bt = n("stm32bp_digital_write", { f: { PIN: "PA2", LEVEL: "HIGH" } });
  const bpTree = tree(n("ct_when_started", { s: { DO: swd } }), n("ct_when_started", { s: { DO: motor } }), n("ct_when_started", { s: { DO: bt } }));
  const bpResult = lint(bpTree, bpContext);
  assert.ok(bpResult.some(item => item.blockId === swd.id && item.rule === "pin-special-warning"));
  assert.ok(bpResult.some(item => item.blockId === motor.id && item.rule === "pin-reserved"));
  assert.ok(bpResult.some(item => item.blockId === bt.id && item.rule === "pin-mode-unsupported"));

  const bk = getHardwareProfile("stm32-black-pill");
  const bkContext = { platform: "stm32", boardName: bk.name, ...buildAssistantPinRules(bk, [], profileToConfig(bk.id)) };
  const keyAsAdc = n("stm32bk_analog_read", { f: { PIN: "PA0" } });
  const bkResult = lint(tree(n("ct_when_started", { s: { DO: keyAsAdc } })), bkContext);
  assert.ok(bkResult.some(item => item.blockId === keyAsAdc.id && item.rule === "pin-mode-unsupported"));
});
