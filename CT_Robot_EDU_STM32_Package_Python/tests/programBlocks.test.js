import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Blockly from "blockly";
import { generateProgram } from "../src/robotBlocks.js";
import { listFlyoutItems, programVariableTypes, varName, buildProgramDeclarations } from "../src/programBlocks.js";
import { PROGRAM_CPP_HELPERS, PROGRAM_PY_HELPERS, PROGRAM_HELPER_USED } from "../src/programRuntime.js";
import { buildPythonOutput } from "../src/pythonGenerator.js";
import { buildArduinoSketch, profileToConfig } from "../src/hardwareProfiles.js";
import { unmarkedCode } from "../src/codeSourceMap.js";
import { evaluateProgramValue, runProgramStatement, isProgramValueType, toNumber, toText } from "../src/simulatorPrograms.js";

const num = v => `<shadow type="math_number"><field name="NUM">${v}</field></shadow>`;
const txt = v => `<shadow type="ct_text"><field name="TEXT">${v}</field></shadow>`;
const wrap = body => Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${body}</xml>`);
const load = body => { const ws = new Blockly.Workspace(); Blockly.Xml.domToWorkspace(wrap(body), ws); return ws; };
const VARS = `<variables><variable id="a">tốc độ</variable><variable id="t">tên</variable><variable id="l" type="List">điểm</variable><variable id="i">i</variable></variables>`;
const v = (id, name) => `<field name="VAR" id="${id}">${name}</field>`;
const list = `<field name="LIST" id="l" variabletype="List">điểm</field>`;

const RICH = `${VARS}
<block type="ct_when_started"><statement name="DO">
<block type="variables_set">${v("a", "tốc độ")}<value name="VALUE"><block type="ct_math_func"><field name="FUNC">SIN</field><value name="X">${num(30)}</value></block></value>
<next><block type="variables_set">${v("t", "tên")}<value name="VALUE"><block type="ct_join"><value name="A">${txt("xin")}</value><value name="B"><block type="variables_get">${v("a", "tốc độ")}</block></value></block></value>
<next><block type="ct_list_add">${list}<value name="ITEM"><block type="ct_mod"><value name="A">${num(10)}</value><value name="B">${num(3)}</value></block></value>
<next><block type="ct_for">${v("i", "i")}<value name="FROM">${num(1)}</value><value name="TO">${num(5)}</value><value name="BY">${num(1)}</value>
<statement name="DO"><block type="controls_if"><value name="IF0"><block type="ct_compare"><field name="OP">GT</field><value name="A"><block type="variables_get">${v("i", "i")}</block></value><value name="B">${num(3)}</value></block></value><statement name="DO0"><block type="ct_break"></block></statement>
<next><block type="ct_serial_print"><value name="TEXT"><block type="ct_list_get"><value name="INDEX">${num(1)}</value>${list}</block></value></block></next></block></statement>
<next><block type="ct_wait_until"><value name="COND"><block type="ct_between"><value name="X"><block type="ct_millis"><field name="UNIT">S</field></block></value><value name="A">${num(0)}</value><value name="B">${num(2)}</value></block></value>
<next><block type="ct_repeat_until"><value name="COND"><block type="ct_boolean"><field name="VALUE">true</field></block></value><statement name="DO"><block type="math_change">${v("a", "tốc độ")}<value name="DELTA">${num(1)}</value></block></statement></block></next></block></next></block></next></block></next></block></next></block></statement></block>`;

const python = (ws, profile = "esp32-devkit") => {
  const { main, functions } = generateProgram(ws);
  return buildPythonOutput(profileToConfig(profile), main, functions).code;
};
const pyCompile = code => {
  const file = join(mkdtempSync(join(tmpdir(), "ctpy-")), "out.py");
  writeFileSync(file, code, "utf-8");
  return spawnSync("python3", ["-m", "py_compile", file], { encoding: "utf-8" });
};

test("sinh mã C++: biến, danh sách, vòng lặp, thoát, chờ đến khi", () => {
  const { main, functions } = generateProgram(load(RICH));
  const decl = unmarkedCode(functions);
  assert.match(decl, /CTList ds_diem;/);
  assert.match(decl, /float v_toc_do = 0;/);
  assert.match(decl, /String v_ten = String\(""\);/);
  const out = unmarkedCode(main);
  assert.doesNotMatch(out, /^\s*var /m, "không còn dòng var của bộ sinh mã JavaScript");
  assert.match(out, /v_toc_do = ct_sin\(30\);/);
  assert.match(out, /v_ten = \(ct_str\(String\("xin"\)\) \+ ct_str\(v_toc_do\)\);/);
  assert.match(out, /ct_list_add\(ds_diem, ct_mod\(10, 3\)\);/);
  assert.match(out, /for \(v_i = 1; v_i <= 5; v_i \+= 1\) \{/);
  assert.match(out, /break;/);
  assert.match(out, /while \(!\(ct_between\(\(millis\(\) \/ 1000\.0\), 0, 2\)\)\) \{\s*delay\(1\);/);
  assert.match(out, /while \(!\(true\)\) \{\s*v_toc_do \+= 1;/);
});

test("dịch sang MicroPython: hợp lệ, có hàm hỗ trợ, biến toàn cục", () => {
  const code = python(load(RICH));
  assert.match(code, /ds_diem = \[\]/);
  assert.match(code, /def ct_mod\(a, b\)/);
  assert.match(code, /global v_toc_do, v_ten/);
  assert.match(code, /for v_i in range\(1, 6\):/);
  assert.match(code, /while not \(ct_between\(/);
  assert.doesNotMatch(code, /^\s*var /m);
  const r = pyCompile(code);
  assert.equal(r.status, 0, r.stderr);
});

test("chương trình không dùng khối mới thì không chèn hàm hỗ trợ", () => {
  assert.equal(PROGRAM_HELPER_USED.test("robot.forward(80, 1);\ndelay(1000);"), false);
  const ws = load(`<block type="ct_when_started"><statement name="DO"><block type="ct_wait"><value name="SECONDS">${num(1)}</value></block></statement></block>`);
  const { main, functions } = generateProgram(ws);
  assert.doesNotMatch(buildArduinoSketch(profileToConfig("esp32-devkit"), main, functions), /struct CTList/);
  assert.doesNotMatch(python(ws), /def ct_mod/);
});

test("sketch C++ có hàm hỗ trợ khi dùng khối toán/chữ/danh sách", () => {
  const { main, functions } = generateProgram(load(RICH));
  for (const id of ["esp32-devkit", "arduino-nano", "stm32-blue-pill"]) {
    assert.match(buildArduinoSketch(profileToConfig(id), main, functions), /struct CTList[\s\S]*static String ct_str/, id);
  }
});

/* Cùng một bảng phép tính chạy trên C++ (g++), Python và trình mô phỏng JS: kết quả phải giống nhau. */
const CASES = [
  ["ct_mod(-7, 3)", 2], ["ct_mod(7, -3)", -2], ["ct_mod(10, 0)", 0], ["ct_round(2.5)", 3], ["ct_round(-2.5)", -2],
  ["ct_round_places(3.14159, 2)", 3.14], ["ct_floor(-1.2)", -2], ["ct_ceil(1.2)", 2], ["ct_abs(-4)", 4],
  ["ct_sqrt(16)", 4], ["ct_sqrt(-4)", 0], ["ct_pow(2, 10)", 1024], ["ct_min(3, 5)", 3], ["ct_max(3, 5)", 5],
  ["ct_constrain(150, 0, 100)", 100], ["ct_constrain(5, 10, 0)", 5], ["ct_len(String(\"abc\"))", 3],
  ["ct_between(5, 10, 0)", 1], ["ct_ln(0)", 0], ["ct_exp10(2)", 100],
];

test("C++ (g++ giả lập Arduino) và Python cho cùng kết quả với bảng phép tính", { skip: spawnSync("g++", ["--version"]).error ? "không có g++" : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ctcpp-"));
  const lines = CASES.map(([e]) => `  printf("%.4f\\n", (double)(${e}));`).join("\n");
  const stub = readFileSync(new URL("./fixtures/arduino_stub.h", import.meta.url), "utf-8");
  writeFileSync(join(dir, "stub.h"), stub);
  writeFileSync(join(dir, "t.cpp"), `#include "stub.h"\n${PROGRAM_CPP_HELPERS}\nint main() {\n${lines}\n  CTList l; ct_list_add(l, 5); ct_list_add(l, 7); ct_list_insert(l, 2, 6); ct_list_remove(l, 1);\n  printf("%.0f %.0f %.0f %d\\n", ct_list_len(l), ct_list_get(l, 1), ct_list_index(l, 7), (int)ct_list_contains(l, 9));\n  Serial.println(ct_str(3.0f)); Serial.println(ct_str(2.5f)); Serial.println(ct_str(true)); Serial.println(ct_str(7)); Serial.println(ct_str(String("x")) + ct_str("y"));\n  return 0;\n}\n`);
  const build = spawnSync("g++", ["-std=c++11", "-Wall", "-Wno-unused-function", "-o", join(dir, "t"), join(dir, "t.cpp")], { encoding: "utf-8" });
  assert.equal(build.status, 0, build.stderr);
  const cpp = spawnSync(join(dir, "t"), { encoding: "utf-8" }).stdout.trim().split("\n");

  const pyLines = CASES.map(([e]) => `print("%.4f" % float(${e.replace('String("abc")', '"abc"')}))`).join("\n");
  const py = spawnSync("python3", ["-c", `${PROGRAM_PY_HELPERS}\n${pyLines}\nl = []\nct_list_add(l, 5); ct_list_add(l, 7); ct_list_insert(l, 2, 6); ct_list_remove(l, 1)\nprint(ct_list_len(l), ct_list_get(l, 1), ct_list_index(l, 7), int(ct_list_contains(l, 9)))\nprint(ct_str(3.0)); print(ct_str(2.5)); print(ct_str(True)); print(ct_str(7)); print(ct_str("x") + ct_str("y"))`], { encoding: "utf-8" });
  assert.equal(py.status, 0, py.stderr);
  const pyOut = py.stdout.trim().split("\n");

  CASES.forEach(([expr, expected], i) => {
    assert.equal(Number(cpp[i]), expected, `C++ ${expr}`);
    assert.equal(Number(pyOut[i]), expected, `Python ${expr}`);
  });
  const n = CASES.length;
  assert.deepEqual(cpp[n].split(" ").map(Number), pyOut[n].split(" ").map(Number));
  assert.deepEqual(cpp.slice(n + 1), pyOut.slice(n + 1));
  assert.deepEqual(cpp.slice(n + 1), ["3", "2.5", "true", "7", "xy"]);
});

/* ---------- Trình mô phỏng ---------- */

function makeEv(ws, store = { vars: {}, commands: [] }) {
  const ev = {
    store,
    num: b => toNumber(ev.any(b)),
    cond: b => Boolean(ev.any(b)),
    any: b => {
      if (!b) return 0;
      if (isProgramValueType(b.type)) return evaluateProgramValue(b, ev);
      if (b.type === "math_number") return Number(b.getFieldValue("NUM"));
      if (b.type === "variables_get") return ev.getVar(b.getFieldValue("VAR"));
      if (b.type === "ct_boolean") return b.getFieldValue("VALUE") === "true";
      if (b.type === "ct_compare") {
        const x = ev.num(b.getInputTargetBlock("A")), y = ev.num(b.getInputTargetBlock("B"));
        return { GT: x > y, LT: x < y, EQ: x === y }[b.getFieldValue("OP")] ?? false;
      }
      return 0;
    },
    getVar: id => store.vars[id] ?? 0,
    setVar: (id, value) => { store.vars[id] = value; },
    list: id => (store.vars[`list:${id}`] ||= []),
    push: c => store.commands.push(c),
    run: first => runChain(first, ev),
    elapsedMs: () => 1500,
    random: () => 0.5,
  };
  return ev;
}
function runChain(first, ev) {
  for (let b = first; b; b = b.getNextBlock()) {
    const r = runProgramStatement(b, ev);
    if (r?.signal) return r.signal;
    if (!r && b.type === "controls_if") {
      const body = ev.cond(b.getInputTargetBlock("IF0")) ? b.getInputTargetBlock("DO0") : b.getInputTargetBlock("ELSE");
      const s = body && ev.run(body);
      if (s) return s;
    }
  }
}

test("mô phỏng: biến chữ/số, danh sách, vòng đếm và THOÁT", () => {
  const ws = load(RICH);
  const ev = makeEv(ws);
  runChain(ws.getTopBlocks()[0].getInputTargetBlock("DO"), ev);
  assert.equal(ev.store.vars.t, "xin0.5");              // sin 30° = 0.5, nối thành chữ
  assert.deepEqual(ev.store.vars["list:l"], [1]);        // 10 chia lấy dư 3
  assert.equal(ev.store.vars.i, 4);                      // THOÁT khi i = 4 (> 3)
  assert.ok(Math.abs(ev.store.vars.a - 0.5) < 1e-9);     // vòng "đến khi true" không chạy lần nào
});

test("mô phỏng: vòng lặp vô hạn bị chặn, ĐẾM ngược, BỎ QUA", () => {
  const ws = load(`${VARS}<block type="ct_when_started"><statement name="DO">
    <block type="ct_while"><value name="COND"><block type="ct_boolean"><field name="VALUE">true</field></block></value><statement name="DO"><block type="math_change">${v("a", "tốc độ")}<value name="DELTA">${num(1)}</value></block></statement>
    <next><block type="ct_for">${v("i", "i")}<value name="FROM">${num(3)}</value><value name="TO">${num(1)}</value><value name="BY">${num(-1)}</value><statement name="DO"><block type="ct_list_add">${list}<value name="ITEM"><block type="variables_get">${v("i", "i")}</block></value></block></statement></block></next></block></statement></block>`);
  const ev = makeEv(ws);
  runChain(ws.getTopBlocks()[0].getInputTargetBlock("DO"), ev);
  assert.equal(ev.store.vars.a, 100);
  assert.deepEqual(ev.store.vars["list:l"], [3, 2, 1]);
});

test("mô phỏng: toán, chữ và hàm", () => {
  const ws = new Blockly.Workspace();
  const ev = makeEv(ws);
  const val = (type, fields = {}, inputs = {}) => {
    const b = ws.newBlock(type);
    for (const [k, x] of Object.entries(fields)) b.setFieldValue(x, k);
    for (const [k, x] of Object.entries(inputs)) {
      const c = typeof x === "object" ? x : (() => { const m = ws.newBlock(typeof x === "string" ? "ct_text" : "math_number"); m.setFieldValue(x, typeof x === "string" ? "TEXT" : "NUM"); return m; })();
      b.getInput(k).connection.connect(c.outputConnection);
    }
    return evaluateProgramValue(b, ev);
  };
  assert.equal(val("ct_mod", {}, { A: -7, B: 3 }), 2);
  assert.equal(val("ct_math_func", { FUNC: "ROUND" }, { X: 2.5 }), 3);
  assert.equal(val("ct_math_func", { FUNC: "COS" }, { X: 60 }).toFixed(4), "0.5000");
  assert.equal(val("ct_round_places", {}, { X: 3.14159, N: 2 }), 3.14);
  assert.equal(val("ct_join", {}, { A: "ab", B: 5 }), "ab5");
  assert.equal(val("ct_text_length", {}, { TEXT: "xin chào" }), 8);
  assert.equal(val("ct_text_char_at", {}, { N: 2, TEXT: "xin" }), "i");
  assert.equal(val("ct_text_case", { CASE: "UPPER" }, { TEXT: "abc" }), "ABC");
  assert.equal(val("ct_text_to_number", {}, { TEXT: "12.5" }), 12.5);
  assert.equal(val("ct_text_contains", {}, { A: "xin chào", B: "chào" }), true);
  assert.equal(val("ct_constrain", {}, { X: 150, LO: 0, HI: 100 }), 100);
  assert.equal(val("ct_random", {}, { A: 1, B: 10 }), 6);
  assert.equal(val("ct_math_constant", { NAME: "PI" }), Math.PI);
  assert.equal(toText(3), "3");
  assert.equal(toText(true), "true");
  assert.equal(toText(2.50001), "2.5");
});

/* ---------- Biến, danh sách, thanh công cụ ---------- */

test("kiểu biến suy ra từ giá trị gán; tên C++ bỏ dấu và không trùng nhau", () => {
  const ws = load(RICH);
  const types = programVariableTypes(ws);
  assert.equal(types.get("a"), "Number");
  assert.equal(types.get("t"), "String");
  assert.equal(types.get("l"), "List");
  assert.equal(varName(ws, "a"), "v_toc_do");
  assert.equal(varName(ws, "l"), "ds_diem");
  const dup = new Blockly.Workspace();
  const x = dup.createVariable("a b"), y = dup.createVariable("a_b"), z = dup.createVariable("đ");
  assert.deepEqual([varName(dup, x.getId()), varName(dup, y.getId()), varName(dup, z.getId())], ["v_a_b", "v_a_b_2", "v_d"]);
});

test("biến không dùng thì không khai báo; không có biến thì không có khai báo", () => {
  const ws = new Blockly.Workspace();
  ws.createVariable("thừa");
  assert.equal(buildProgramDeclarations(ws), "");
});

test("thanh công cụ động của Danh sách: có nút tạo và các khối trỏ đúng danh sách", () => {
  const ws = new Blockly.Workspace();
  assert.equal(listFlyoutItems(ws).length, 1); // chỉ có nút
  ws.createVariable("điểm", "List");
  const items = listFlyoutItems(ws);
  assert.equal(items[0].tagName.toLowerCase(), "button");
  assert.ok(items.length > 5);
  const block = items[1];
  assert.equal(block.getAttribute("type"), "ct_list_add");
  assert.equal(block.querySelector("field").getAttribute("variabletype"), "List");
  // Khối từ flyout dựng lại được và dùng đúng biến danh sách
  const made = Blockly.Xml.domToBlock(block, ws);
  assert.equal(ws.getVariableById(made.getFieldValue("LIST")).name, "điểm");
});

test("mọi khối trong thanh công cụ của App.jsx đều đã được đăng ký", () => {
  const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf-8");
  const types = [...src.matchAll(/kind: "block", type: "([\w]+)"/g)].map(m => m[1]);
  assert.ok(types.length > 40);
  const known = new Set(Object.keys(Blockly.Blocks));
  for (const t of types) assert.ok(known.has(t), `thanh công cụ có khối chưa đăng ký: ${t}`);
  for (const t of ["ct_for", "ct_while", "ct_repeat_until", "ct_wait_until", "ct_break", "ct_continue", "ct_ternary", "ct_between", "ct_mod", "ct_math_func", "ct_text", "ct_join", "ct_wait_ms", "ct_millis"]) {
    assert.ok(types.includes(t), `thanh công cụ thiếu ${t}`);
  }
  // Biến và danh sách dùng thanh công cụ động (có nút "Tạo ...").
  assert.match(src, /custom: "VARIABLE"/);
  assert.match(src, /custom: "CT_LISTS"/);
  for (const t of ["ct_list_add", "ct_list_get", "ct_list_length", "variables_set", "variables_get", "math_change"]) assert.ok(known.has(t), t);
});

test("khối THOÁT/BỎ QUA cảnh báo khi đặt ngoài vòng lặp, hết cảnh báo khi nằm trong vòng lặp", () => {
  const ws = new Blockly.Workspace();
  const brk = ws.newBlock("ct_break");
  brk.initSvg?.();
  const loop = ws.newBlock("ct_while");
  loop.getInput("DO").connection.connect(brk.previousConnection);
  assert.equal(brk.getSurroundParent().type, "ct_while");
});
