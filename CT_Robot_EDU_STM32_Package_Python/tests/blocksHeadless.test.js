import test from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";
import { javascriptGenerator } from "blockly/javascript";
import { generateProgram } from "../src/robotBlocks.js";
// extensions/index.js dùng import.meta.glob của Vite nên ở đây đăng ký từng extension giống hệt index.js.
import "../src/extensions/blocklyBinding.js";
import { registerExtension } from "../src/extensions/registry.js";
import ctExpansion from "../src/extensions/builtin/ctExpansionEsp32.js";
import bluePill from "../src/extensions/builtin/stm32BluePill.js";
import blackPill from "../src/extensions/builtin/stm32BlackPill.js";
import nucleo from "../src/extensions/builtin/stm32NucleoF401RE.js";
[ctExpansion, bluePill, blackPill, nucleo].forEach(registerExtension);
import { migrateLegacyBlockXml } from "../src/legacyMigration.js";
import { unmarkedCode } from "../src/codeSourceMap.js";

// Chạy Blockly thật (không giao diện) để kiểm tra khối, kiểu dữ liệu và mã sinh ra.

const xml = body => Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${body}</xml>`);
function load(body, { migrate = false } = {}) {
  const ws = new Blockly.Workspace();
  const dom = xml(body);
  if (migrate) migrateLegacyBlockXml(dom);
  Blockly.Xml.domToWorkspace(dom, ws);
  return ws;
}
const code = ws => unmarkedCode(generateProgram(ws).main);
// Kiểm tra kiểu kết nối như khi người dùng kéo khối (Blockly kiểm tra bằng ConnectionChecker).
const checker = new Blockly.ConnectionChecker();
const accepts = (input, reporter) => checker.doTypeChecks(input.connection, reporter.outputConnection);

test("chỉ còn MỘT khối NẾU: controls_ifelse đã bị gỡ", () => {
  assert.ok(Blockly.Blocks.controls_if);
  assert.equal(Blockly.Blocks.controls_ifelse, undefined);
  assert.equal(javascriptGenerator.forBlock.controls_ifelse, undefined);
});

test("khối NẾU có nhãn tiếng Việt và thêm được nhánh NẾU KHÔNG THÌ bằng mutation", () => {
  const ws = new Blockly.Workspace();
  const block = ws.newBlock("controls_if");
  block.initSvg?.();
  assert.equal(block.getInput("IF0").fieldRow[0].getValue(), "NẾU");
  assert.equal(block.getInput("DO0").fieldRow[0].getValue(), "THÌ");
  block.loadExtraState({ hasElse: true });
  assert.ok(block.getInput("ELSE"));
  assert.equal(block.getInput("ELSE").fieldRow[0].getValue(), "NẾU KHÔNG THÌ");
  block.loadExtraState({ hasElse: true, elseIfCount: 1 });
  assert.equal(block.getInput("IF1").fieldRow[0].getValue(), "NẾU KHÔNG THÌ NẾU");
});

test("file cũ có controls_ifelse tự chuyển thành khối NẾU có nhánh ELSE, mã C++ giữ nguyên", () => {
  const legacy = `
    <block type="controls_ifelse">
      <value name="IF0"><block type="ct_boolean"><field name="VALUE">true</field></block></value>
      <statement name="DO0"><block type="ct_stop"></block></statement>
      <statement name="ELSE"><block type="ct_led"><field name="STATE">ON</field></block></statement>
    </block>`;
  const ws = load(legacy, { migrate: true });
  const [top] = ws.getTopBlocks();
  assert.equal(top.type, "controls_if");
  const out = code(ws);
  assert.match(out, /if \(true\) \{\s*robot\.stop\(\);\s*\} else \{\s*robot\.led\("ON"\);\s*\}/);
});

test("ô số: kéo mọi loại biểu thức vào được (số, đúng/sai, cảm biến, phép tính)", () => {
  const ws = new Blockly.Workspace();
  const fwd = ws.newBlock("ct_forward");
  const speed = fwd.getInput("SPEED");
  for (const type of ["math_number", "ct_compare", "ct_boolean", "ct_logic", "ct_not", "ct_math_operation", "ct_distance"]) {
    const reporter = ws.newBlock(type);
    assert.ok(accepts(speed, reporter), `ô SPEED phải nhận được ${type}`);
  }
});

test("ô điều kiện chỉ nhận biểu thức đúng/sai (như ô lục giác của Scratch)", () => {
  const ws = new Blockly.Workspace();
  const cond = ws.newBlock("controls_if").getInput("IF0");
  assert.ok(accepts(cond, ws.newBlock("ct_compare")));
  assert.ok(accepts(cond, ws.newBlock("ct_boolean")));
  assert.ok(!accepts(cond, ws.newBlock("math_number")));
});

test("các ô số cũ (field_number) giờ là ô giá trị: gõ số trực tiếp được và nhận biểu thức", () => {
  const ws = new Blockly.Workspace();
  const cases = {
    ct_motor_left: ["SPEED", "80"], ct_motor_right: ["SPEED", "80"], ct_wait: ["SECONDS", "1"],
    ct_repeat: ["TIMES", "10"], ct_buzzer: ["FREQ", "1000"], ct_servo: ["ANGLE", "90"],
    ct_math_operation: ["A", "0"], ct_compare: ["B", "0"], ct_map_range: ["IN_MAX", "1023"],
    ct_calibrate: ["TURN_MS", "6"], ctexp_motor_run: ["SPEED", "80"], ctexp_servo: ["ANGLE", "90"],
    stm32bp_buzzer: ["FREQ", "1000"], stm32bk_servo: ["ANGLE", "90"], stm32nuc_servo: ["ANGLE", "90"],
  };
  for (const [type, [input, expected]] of Object.entries(cases)) {
    const block = ws.newBlock(type);
    const target = block.getInput(input)?.connection?.targetBlock();
    assert.ok(target?.isShadow(), `${type}.${input} phải có số mặc định để gõ`);
    assert.equal(target.type, "math_number");
    assert.equal(String(target.getFieldValue("NUM")), expected, `${type}.${input}`);
    assert.ok(accepts(block.getInput(input), ws.newBlock("ct_compare")), `${type}.${input} nhận biểu thức đúng/sai`);
  }
});

test("mã sinh ra: số gõ trực tiếp và biểu thức kéo vào", () => {
  const ws = load(`
    <block type="ct_wait"><value name="SECONDS"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
    <next><block type="ct_wait"><value name="SECONDS"><block type="ct_distance"></block></value>
    <next><block type="ct_motor_left"><value name="SPEED"><shadow type="math_number"><field name="NUM">-50</field></shadow></value>
    <next><block type="ct_repeat"><value name="TIMES"><block type="ct_math_operation"><field name="OP">ADD</field>
        <value name="A"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
        <value name="B"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block></value>
      <statement name="DO"><block type="ct_servo"><value name="ANGLE"><block type="ct_compare"><field name="OP">GT</field>
        <value name="A"><block type="ct_distance"></block></value>
        <value name="B"><shadow type="math_number"><field name="NUM">20</field></shadow></value></block></value></block></statement>
    </block></next></block></next></block></next></block>`);
  const out = code(ws);
  assert.match(out, /delay\(2000\);/);
  assert.match(out, /delay\(\(robot\.distance\(\)\) \* 1000\);/);
  assert.match(out, /robot\.motorLeft\(-50\);/);
  assert.match(out, /for \(int i = 0; i < \(2 \+ 3\); i\+\+\) \{/);
  assert.match(out, /robot\.servo\(\(robot\.distance\(\) > 20\)\);/);
});

test("file cũ: ô số (field) tự chuyển thành ô giá trị, giữ đúng số đã nhập", () => {
  const legacy = `
    <block type="ct_motor_left"><field name="SPEED">-30</field>
    <next><block type="ct_wait"><field name="SECONDS">1.5</field>
    <next><block type="ct_repeat"><field name="TIMES">4</field><statement name="DO"><block type="ct_buzzer"><field name="FREQ">440</field></block></statement>
    <next><block type="ct_motor_right"><value name="SPEED"><block type="ct_map_range"><field name="IN_MIN">1</field><field name="IN_MAX">2</field><field name="OUT_MIN">3</field><field name="OUT_MAX">4</field></block></value>
    </block></next></block></next></block></next></block>`;
  const out = code(load(legacy, { migrate: true }));
  assert.match(out, /robot\.motorLeft\(-30\);/);
  assert.match(out, /delay\(1500\);/);
  assert.match(out, /for \(int i = 0; i < 4; i\+\+\)/);
  assert.match(out, /robot\.buzzer\(440\);/);
  assert.match(out, /map\(0, 1, 2, 3, 4\)/);
});

test("khối so sánh / phép tính có số mặc định để gõ ngay", () => {
  const ws = new Blockly.Workspace();
  for (const type of ["ct_compare", "ct_math_operation"]) {
    const b = ws.newBlock(type);
    assert.ok(b.getInput("A").connection.targetBlock()?.isShadow());
    assert.ok(b.getInput("B").connection.targetBlock()?.isShadow());
  }
});

test("khối HẰNG SỐ đã bỏ; file cũ tự chuyển thành khối số ( )", () => {
  assert.equal(Blockly.Blocks.ct_constant, undefined);
  const legacy = `<block type="ct_motor_left"><value name="SPEED"><block type="ct_constant"><field name="VALUE">35</field></block></value></block>`;
  const out = code(load(legacy, { migrate: true }));
  assert.match(out, /robot\.motorLeft\(35\);/);
});

test("khối có ô giá trị đều nằm ngang để lồng biểu thức thì dài ra theo chiều ngang", () => {
  const ws = new Blockly.Workspace();
  for (const type of ["ct_math_operation", "ct_compare", "ct_logic", "ct_not", "ct_forward", "ct_motor_left", "ct_wait", "ct_map_range", "stm32bp_buzzer", "ctexp_motor_run"]) {
    assert.equal(ws.newBlock(type).getInputsInline(), true, type);
  }
});

test("bộ vẽ gọn: thấp hơn zelos gốc", async () => {
  const { COMPACT_METRICS, COMPACT_RENDERER } = await import("../src/compactRenderer.js");
  const Registered = new Blockly.zelos.ConstantProvider();
  assert.ok(COMPACT_METRICS.MIN_BLOCK_HEIGHT < Registered.MIN_BLOCK_HEIGHT);
  assert.ok(COMPACT_METRICS.EMPTY_STATEMENT_INPUT_HEIGHT < Registered.EMPTY_STATEMENT_INPUT_HEIGHT);
  assert.equal(COMPACT_RENDERER, "ct_zelos");
  // Bộ vẽ đã đăng ký và khởi tạo được các hằng số gọn.
  const Renderer = Blockly.registry.getClass(Blockly.registry.Type.RENDERER, COMPACT_RENDERER);
  const renderer = new Renderer(COMPACT_RENDERER);
  assert.equal(renderer.makeConstants_().MIN_BLOCK_HEIGHT, COMPACT_METRICS.MIN_BLOCK_HEIGHT);
});

test("file cũ: khối di chuyển STM32 bị gỡ, các khối phía sau được nối lại", () => {
  const legacy = `
    <block type="ct_when_started"><statement name="DO">
      <block type="stm32bp_forward"><value name="SPEED"><shadow type="math_number"><field name="NUM">70</field></shadow></value>
      <next><block type="ct_wait"><field name="SECONDS">2</field>
      <next><block type="stm32bp_stop"><next><block type="ct_wait"><field name="SECONDS">1</field></block></next></block></next></block></next></block>
    </statement></block>`;
  const dom = xml(legacy);
  migrateLegacyBlockXml(dom);
  assert.equal(dom.removedBlockCount, 2);
  const out = code(load(legacy, { migrate: true }));
  assert.doesNotMatch(out, /robot\.(forward|stop)/);
  assert.match(out, /delay\(2000\);\s*delay\(1000\);/);
});
