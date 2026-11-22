import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/extensions/builtin/ctExpansionEsp32.js";
import { getExtensions, registerExtension } from "../src/extensions/registry.js";
import { HARDWARE_PROFILES, profileToConfig } from "../src/hardwareProfiles.js";
import {
  PYTHON_PLACEHOLDER,
  buildPythonOutput,
  cppToPython,
  isPythonSupported,
  transpileExpression,
} from "../src/pythonGenerator.js";

if (!getExtensions().some(def => def.id === extension.id)) registerExtension(extension);

const mark = (id, code) => `/*__CT_BLOCK_START:${id}__*/${code}/*__CT_BLOCK_END:${id}__*/`;
const texts = lines => lines.map(l => l.text);

function assertValidPython(code) {
  const probe = spawnSync("python3", ["--version"]);
  if (probe.error) return; // máy không có python3: bỏ qua kiểm tra cú pháp
  const file = join(mkdtempSync(join(tmpdir(), "ctpy-")), "out.py");
  writeFileSync(file, code, "utf-8");
  const result = spawnSync("python3", ["-m", "py_compile", file], { encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
}

test("biểu thức: toán tử, hằng, map, ký tự và chuỗi", () => {
  assert.equal(transpileExpression("(a > 1) && !b || true"), "(a > 1) and not b or True");
  assert.equal(transpileExpression("(x != 3)"), "(x != 3)");
  assert.equal(transpileExpression("map(v, 0, 1023, 0, 100)"), "ct_map(v, 0, 1023, 0, 100)");
  assert.equal(transpileExpression("BT_SERIAL.peek() == 'F'"), 'BT_SERIAL.peek() == ord("F")');
  // toCString: "à" = byte UTF-8 \303\240, và ký tự đặc biệt \" \\ \?
  assert.equal(transpileExpression('BT_SERIAL.println("x \\303\\240 \\"q\\" \\\\ \\?")'), 'BT_SERIAL.println("x à \\"q\\" \\\\ ?")');
  // chuỗi chứa && không bị đổi
  assert.equal(transpileExpression('robot.led("a && b")'), 'robot.led("a && b")');
});

test("luồng điều khiển: while, if/else if/else, for, thân rỗng có pass", () => {
  const cpp = [
    "while (true) {",
    "  for (int i = 0; i < 3; i++) {",
    "    robot.forward(80, 1);",
    "  }",
    "  if ((robot.distance() < 20)) {",
    "  } else if (!robot.lineLeft()) {",
    "    delay(500);",
    "  } else {",
    "    // trống",
    "  }",
    "}",
  ].join("\n");
  assert.deepEqual(texts(cppToPython(cpp)), [
    "while True:",
    "    for _ in range(3):",
    "        robot.forward(80, 1)",
    "    if (robot.distance() < 20):",
    "        pass",
    "    elif not robot.lineLeft():",
    "        delay(500)",
    "    else:",
    "        # trống",
    "        pass",
  ]);
});

test("hàm sự kiện: bỏ prototype, def + pass khi rỗng", () => {
  const out = texts(cppToPython("void ev_a();\nvoid ev_b();\n\nvoid ev_a() {\n  robot.stop();\n}\n\nvoid ev_b() {\n}\n"));
  assert.deepEqual(out.filter(Boolean), ["def ev_a():", "    robot.stop()", "def ev_b():", "    pass"]);
});

test("cú pháp C++ lạ không làm hỏng file: thành chú thích", () => {
  const out = texts(cppToPython("int table[3] = {1, 2, 3};\nrobot.stop();\n"));
  assert.match(out[0], /^# CHƯA CHUYỂN ĐƯỢC SANG PYTHON: int table\[3\] = \{1, 2, 3\};/);
  assert.equal(out[1], "robot.stop()");
});

test("ESP32: chương trình hoàn chỉnh, hợp lệ cú pháp, có cấu hình chân của board", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const main = [
    mark("a", 'robot.led("ON");'),
    `${mark("w", "while (true) {")}`,
    `  ${mark("f", "robot.forward(80, 1);")}`,
    `}`,
    "ev_go();",
  ].join("\n");
  const { code } = buildPythonOutput(cfg, main, "void ev_go();\n\nvoid ev_go() {\n  robot.stop();\n}\n");
  assert.match(code, /LEFT_IN1 = 25/);
  assert.match(code, /def chuong_trinh\(\):/);
  assert.match(code, /    while True:\n        robot\.forward\(80, 1\)/);
  assert.match(code, /def ev_go\(\):\n    robot\.stop\(\)/);
  assert.match(code, /robot\.begin\(\)\ntry:\n    chuong_trinh\(\)\nexcept KeyboardInterrupt:\n    robot\.stop\(\)/);
  assert.doesNotMatch(code, /__CT_BLOCK/);
  assert.doesNotMatch(code, /BT_SERIAL = /, "không dùng Bluetooth thì không khởi tạo UART");
  assertValidPython(code);
});

test("tô sáng: khoảng ký tự trỏ đúng dòng mã của từng khối", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const main = `${mark("blk", "robot.forward(80, 1);")}\n${mark("w", "robot.stop();")}\n`;
  const { code, blockRanges } = buildPythonOutput(cfg, main, "");
  const slice = id => blockRanges[id].map(r => code.slice(r.start, r.end));
  assert.deepEqual(slice("blk"), ["    robot.forward(80, 1)"]);
  assert.deepEqual(slice("w"), ["    robot.stop()"]);
});

test("khối lồng nhau: id khối cha phủ cả các dòng thân", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const main = [
    "/*__CT_BLOCK_START:loop__*/while (true) {",
    `  ${mark("inner", "delay(10);")}`,
    "}/*__CT_BLOCK_END:loop__*/",
  ].join("\n");
  const { code, blockRanges } = buildPythonOutput(cfg, main, "");
  const lines = blockRanges.loop.map(r => code.slice(r.start, r.end).trim());
  assert.ok(lines.includes("while True:") && lines.includes("delay(10)"), lines.join("|"));
});

test("Bluetooth: bật UART2 trên ESP32 thường, dùng bản rỗng trên CT Expansion", () => {
  const body = "if ((BT_SERIAL.available() > 0 && BT_SERIAL.peek() == 'F')) {\n  robot.stop();\n}\n";
  const normal = buildPythonOutput(profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id), body).code;
  assert.match(normal, /BT_SERIAL = _Serial\(UART\(2, baudrate=115200, tx=BT_TX_PIN, rx=BT_RX_PIN\)\)/);
  assert.match(normal, /BT_SERIAL\.peek\(\) == ord\("F"\)/);
  assertValidPython(normal);

  const expansion = buildPythonOutput(profileToConfig("ct-expansion-esp32"), body).code;
  assert.match(expansion, /BT_SERIAL = _NoSerial\(\)/);
  assertValidPython(expansion);
});

test("CT Expansion: chỉ chèn phần mạch mở rộng mà chương trình dùng", () => {
  const cfg = profileToConfig("ct-expansion-esp32");
  const motorOnly = buildPythonOutput(cfg, "ctExpMotorRun(3, 70);\n").code;
  assert.match(motorOnly, /CTEXP_MOTORS = \(\n    \(19, 5, 18\),  # M1/);
  assert.match(motorOnly, /\(12, 23, None\),  # M6/);
  assert.match(motorOnly, /ctExpMotorBegin\(\)\ntry:/);
  assert.doesNotMatch(motorOnly, /def ctExpServoWrite|def ctExpPcfRead|def ctExpHumidity/);
  assertValidPython(motorOnly);

  const all = buildPythonOutput(
    cfg,
    [
      "ctExpMotorRun(1, 50);",
      "ctExpServoWrite(2, 45);",
      "robot.servo(90);",
      "if ((ctExpPcfRead(3) == 1) && (robot.distance() < 30)) {",
      "  gpioPwm(2, ctExpTemperature());",
      "}",
      "",
    ].join("\n")
  ).code;
  for (const name of ["ctExpMotorBegin()", "ctExpServoBegin()", "ctExpPcfBegin()", "ctExpHumBegin()"]) {
    assert.ok(all.includes(`\n${name}\n`), name);
  }
  assert.match(all, /robot\.servo = lambda angle: ctExpServoWrite\(0, angle\)/);
  assert.match(all, /robot\.distance = ctExpDistanceCm/);
  assert.match(all, /TRIG_PIN = None/);
  assertValidPython(all);
});

test("board chưa hỗ trợ (AVR/STM32): trả thông báo, không sinh mã giả", () => {
  const nano = HARDWARE_PROFILES.ARDUINO_NANO_L298N;
  assert.equal(isPythonSupported(nano), false);
  const { code, blockRanges } = buildPythonOutput(profileToConfig(nano.id), "robot.stop();\n");
  assert.match(code, /chưa có runtime Python/);
  assert.doesNotMatch(code, /def chuong_trinh/);
  assert.deepEqual(blockRanges, {});
});

test("chưa có khối nào: trả placeholder", () => {
  const out = buildPythonOutput(profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id), "", "");
  assert.equal(out.code, PYTHON_PLACEHOLDER);
});

/* ===================== Bộ dịch mở rộng: biểu thức, biến, vòng lặp, hàm phụ trợ ===================== */

const PY_STUB_RUNNER = `
import sys, types, runpy
class Stop(BaseException): pass
count = [0]
def tick(*a):
    count[0] += 1
    if count[0] > 500: raise Stop()
t = types.ModuleType("time"); t.sleep_ms = tick; t.sleep_us = tick; t.sleep = tick
t.ticks_ms = lambda: 1000; t.ticks_us = lambda: 1000000; t.ticks_diff = lambda a, b: a - b
m = types.ModuleType("machine")
class Pin:
    IN, OUT, PULL_UP = 0, 1, 2
    def __init__(self, i, mode=0, pull=None):
        if not isinstance(i, int): raise TypeError("Pin id %r" % (i,))
        self.v = 0
    def value(self, x=None):
        if x is None: return self.v
        self.v = x
class PWM:
    def __init__(self, pin, freq=0, duty_u16=0): pass
    def duty_u16(self, v=None): pass
    def deinit(self): pass
class ADC:
    ATTN_11DB = 3
    def __init__(self, p): pass
    def atten(self, a): pass
    def read_u16(self): return 1000
class UART:
    def __init__(self, *a, **k): pass
    def any(self): return 0
m.Pin, m.PWM, m.ADC, m.UART = Pin, PWM, ADC, UART
m.time_pulse_us = lambda p, l, t: -1
sys.modules["time"], sys.modules["machine"] = t, m
try:
    runpy.run_path(sys.argv[1], run_name="__main__")
except Stop:
    pass
print("RUN-OK")
`;

function runPython(code) {
  const probe = spawnSync("python3", ["--version"]);
  if (probe.error) return null; // máy không có python3
  const dir = mkdtempSync(join(tmpdir(), "ctpy-run-"));
  writeFileSync(join(dir, "out.py"), code, "utf-8");
  writeFileSync(join(dir, "runner.py"), PY_STUB_RUNNER, "utf-8");
  return spawnSync("python3", [join(dir, "runner.py"), join(dir, "out.py")], { encoding: "utf-8", timeout: 20000 });
}

test("biểu thức: chia an toàn, toán tử 3 ngôi, ép kiểu", () => {
  assert.equal(transpileExpression("(a / b)"), "(ct_div(a, b))");
  assert.equal(transpileExpression("((a + b) / 2)"), "(ct_div((a + b), 2))");
  assert.equal(transpileExpression("a + b / c"), "a + ct_div(b, c)");
  assert.equal(transpileExpression("a / b / c"), "ct_div(ct_div(a, b), c)");
  assert.equal(transpileExpression("robot.distance() / 58"), "ct_div(robot.distance(), 58)");
  assert.equal(transpileExpression("x /= 4"), "x = ct_div(x, 4)");
  assert.equal(transpileExpression('robot.led("a / b")'), 'robot.led("a / b")', "dấu / trong chuỗi không đổi");
  assert.equal(transpileExpression("(c ? 1 : 0)"), "(1 if c else 0)");
  assert.equal(transpileExpression("(int)x / 2"), "ct_div(int(x), 2)");
  assert.equal(transpileExpression("(float)(a + b) * 2"), "float((a + b)) * 2");
});

test("chuỗi: \\uXXXX, \\x và các escape của JSON", () => {
  assert.equal(transpileExpression('BT_SERIAL.println("\\u00e0\\b")'), 'BT_SERIAL.println("à\\b")');
  assert.equal(transpileExpression('BT_SERIAL.println("\\x41")'), 'BT_SERIAL.println("A")');
});

test("câu lệnh: khai báo biến, ++/--, +=, break/continue/return", () => {
  const out = texts(cppToPython([
    "int count = 0;",
    "float a = 1.5, b;",
    "bool ok;",
    "String name;",
    "count++;",
    "--count;",
    "count += 2;",
    "while (true) {",
    "  if (count > 5) {",
    "    break;",
    "  }",
    "  continue;",
    "}",
  ].join("\n")));
  assert.deepEqual(out, [
    "count = 0", "a = 1.5", "b = 0.0", "ok = False", 'name = ""',
    "count += 1", "count -= 1", "count += 2",
    "while True:", "    if count > 5:", "        break", "    continue",
  ]);
});

test("vòng lặp: for tổng quát, do-while và hàm có tham số", () => {
  const out = texts(cppToPython([
    "for (int n = 10; n > 0; n--) {",
    "  delay(1);",
    "}",
    "for (int j = 2; j <= 8; j += 2) {",
    "  delay(1);",
    "}",
    "for (int i = 0; i < 3; i++) {",
    "  delay(1);",
    "}",
    "do {",
    "  x = x + 1;",
    "} while (x < 5);",
    "int add(int a, float b) {",
    "  return a + b;",
    "}",
  ].join("\n")));
  assert.deepEqual(out, [
    "for n in range(10, 0, -1):", "    delay(1)",
    "for j in range(2, 9, 2):", "    delay(1)",
    "for _ in range(3):", "    delay(1)",
    "while True:", "    x = x + 1", "    if not (x < 5):", "        break",
    "def add(a, b):", "    return a + b",
  ]);
});

test("biến toàn cục: gán trong hàm tự thêm `global`", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const functions = "void ev_go();\n\nint counter = 0;\nvoid ev_go() {\n  counter++;\n  int local = 1;\n  local++;\n}\n";
  const main = "counter = 5;\nev_go();\n";
  const { code } = buildPythonOutput(cfg, main, functions);
  assert.match(code, /def ev_go\(\):\n    global counter\n    counter \+= 1\n    local = 1\n    local \+= 1/);
  assert.match(code, /def chuong_trinh\(\):\n    global counter\n    counter = 5\n    ev_go\(\)/);
  assertValidPython(code);
  const run = runPython(code);
  if (run) assert.equal(run.status, 0, run.stderr), assert.match(run.stdout, /RUN-OK/);
});

test("hàm phụ trợ chỉ được chèn khi chương trình có dùng", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const plain = buildPythonOutput(cfg, "robot.stop();\n").code;
  for (const name of ["def ct_div", "def millis", "def random", "def sqrt", "class _USBSerial"]) {
    assert.ok(!plain.includes(name), `${name} không được xuất hiện khi không dùng`);
  }
  const main = [
    "int v = (10 / 0);",
    "long t = millis();",
    "int r = random(5);",
    "float s = sqrt(16);",
    'Serial.println("hi");',
  ].join("\n");
  const { code } = buildPythonOutput(cfg, main);
  for (const name of ["def ct_div", "def millis", "def random", "def sqrt", "class _USBSerial"]) {
    assert.ok(code.includes(name), `${name} phải được chèn khi có dùng`);
  }
  assertValidPython(code);
  const run = runPython(code);
  if (run) assert.equal(run.status, 0, run.stderr), assert.match(run.stdout, /RUN-OK/);
});

test("chia cho 0 từ khối ÷ không làm sập chương trình khi chạy", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const { code } = buildPythonOutput(cfg, "robot.forward((100 / 0), 1);\n");
  assert.match(code, /robot\.forward\(\(ct_div\(100, 0\)\), 1\)/);
  const run = runPython(code);
  if (run) assert.equal(run.status, 0, run.stderr), assert.match(run.stdout, /RUN-OK/);
});

test("ID khối chứa ký tự * (Blockly sinh ngẫu nhiên) vẫn được gỡ marker và tô sáng", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const id = "*t:-(Mi=6|#Xcl.V7z1G";
  const { code, blockRanges } = buildPythonOutput(cfg, mark(id, "robot.stop();"));
  assert.doesNotMatch(code, /__CT_BLOCK/);
  assert.ok(blockRanges[id]?.length, "phải có vùng tô sáng cho ID chứa *");
  assertValidPython(code);
});

test("thân chương trình chỉ có chú thích vẫn là Python hợp lệ", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  const { code } = buildPythonOutput(cfg, "// (Bỏ qua trên robot thật) Khi nhấn ↑\n");
  assert.match(code, /def chuong_trinh\(\):\n    # \(Bỏ qua[^\n]*\n+    pass/);
  assertValidPython(code);
});

test("chân bị tắt (None) không làm runtime sập khi robot.begin()", () => {
  const cfg = profileToConfig(HARDWARE_PROFILES.ESP32_L298N.id);
  cfg.sensors = { ...cfg.sensors, echo: -1, lineLeft: -1, lineRight: -1, trig: -1 };
  const { code } = buildPythonOutput(cfg, "robot.forward(50, 1);\nint d = robot.distance();\n");
  assert.match(code, /ECHO_PIN = None/);
  assertValidPython(code);
  const run = runPython(code);
  if (run) assert.equal(run.status, 0, run.stderr), assert.match(run.stdout, /RUN-OK/);
});
