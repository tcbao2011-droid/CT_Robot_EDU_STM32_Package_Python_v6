import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ctExpansion from "../src/extensions/builtin/ctExpansionEsp32.js";
import { registerExtension } from "../src/extensions/registry.js";
import { buildArduinoSketch, profileToConfig } from "../src/hardwareProfiles.js";
import { buildPythonOutput } from "../src/pythonGenerator.js";

registerExtension(ctExpansion);

const BOARDS = ["arduino-nano-l298n", "arduino-uno-free", "esp32-l298n", "esp32-s3-l298n", "esp32-free"];

test("mạch không có khối di chuyển: sketch không khởi tạo chân/PWM động cơ", () => {
  for (const id of BOARDS) {
    const sketch = buildArduinoSketch(profileToConfig(id), "digitalWrite(4, HIGH);\n");
    assert.match(sketch, /#define CT_NO_MOTORS/, id);
  }
});

test("file cũ có lệnh di chuyển vẫn chạy được động cơ", () => {
  for (const id of BOARDS) {
    for (const call of ["robot.forward(80, 1);", "robot.motorLeft(50);", "robot.stop();"]) {
      const sketch = buildArduinoSketch(profileToConfig(id), `${call}\n`);
      assert.doesNotMatch(sketch, /#define CT_NO_MOTORS/, `${id}: ${call}`);
    }
  }
});

test("CT Expansion Board luôn giữ động cơ", () => {
  const sketch = buildArduinoSketch(profileToConfig("ct-expansion-esp32"), "delay(10);\n");
  assert.doesNotMatch(sketch, /#define CT_NO_MOTORS/);
});

test("MicroPython: chỉ khởi tạo động cơ khi cần và vẫn là Python hợp lệ", () => {
  for (const body of ["digitalWrite(4, HIGH);\n", "robot.forward(80, 1);\n"]) {
    const { code } = buildPythonOutput(profileToConfig("esp32-l298n"), body, "");
    assert.match(code, /def _motors\(self\)/);
    assert.doesNotMatch(code, /def begin\(self\):\n\s+self\._left = /);
    const file = join(mkdtempSync(join(tmpdir(), "ctpy-")), "out.py");
    writeFileSync(file, code, "utf-8");
    const r = spawnSync("python3", ["-m", "py_compile", file], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
  }
});
