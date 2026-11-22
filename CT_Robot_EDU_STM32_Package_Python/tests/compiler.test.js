import test from "node:test";
import assert from "node:assert/strict";
import { readBuildResponse, compileSketch } from "../src/compiler.js";
import { buildAssistantPinRules } from "../src/assistant/pinRules.js";
import { HARDWARE_PROFILES, DEFAULT_HARDWARE_CONFIG, profileToConfig, resetHardwareConfig, buildArduinoSketch } from "../src/hardwareProfiles.js";
import extension from "../src/extensions/builtin/ctExpansionEsp32.js";
import { DEFAULT_FQBN, resolveFqbn } from "../src/boardTargets.js";
import { registerExtension } from "../src/extensions/registry.js";
import { getHardwareProfile } from "../src/hardwareProfiles.js";

function streamResponse(chunks, status = 200) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "application/x-ndjson" } });
}

test("compile protocol reads JSON messages split across chunks and final line without newline", async () => {
  const logs = [];
  const response = streamResponse([
    '{"log":"▶ Compiling",',
    '"unused":"ok"}\n{"done":true,"artifact":"BASE64DATA",',
    '"format":"bin","encoding":"base64","fileName":"robot.ino.bin"}',
  ]);
  const result = await readBuildResponse(response, line => logs.push(line));
  assert.deepEqual(logs, ["▶ Compiling"]);
  assert.equal(result.artifact, "BASE64DATA");
  assert.equal(result.format, "bin");
  assert.equal(result.encoding, "base64");
  assert.equal(result.fileName, "robot.ino.bin");
});

test("compile protocol preserves detailed HTTP error body", async () => {
  await assert.rejects(
    readBuildResponse(new Response("arduino-cli is missing", { status: 500 })),
    /arduino-cli is missing/
  );
});

test("compile protocol reports malformed NDJSON and missing completion", async () => {
  await assert.rejects(readBuildResponse(streamResponse(["{not-json}\n"])), /không hợp lệ/);
  await assert.rejects(readBuildResponse(streamResponse(['{"log":"still compiling"}\n'])), /không xác nhận/);
});

test("compileSketch validates that code and FQBN are provided", async () => {
  await assert.rejects(compileSketch("", () => {}, "arduino:avr:uno"), /Chưa có mã/);
  await assert.rejects(compileSketch("void setup(){}", () => {}, ""), /Chưa chọn/);
});

test("standard profiles do not mark their configured motor/sensor pins as occupied", () => {
  const profile = HARDWARE_PROFILES.ESP32_L298N;
  const config = profileToConfig(profile.id);
  const rules = buildAssistantPinRules(profile, [], config);
  assert.equal(rules.reserved.size, 0);
  assert.ok(rules.specialWarnings.has(profile.bluetoothPins.rx));
  assert.ok(rules.specialWarnings.has(profile.bluetoothPins.tx));
  assert.ok(rules.blockedPins.has(6));
  assert.ok(rules.inputOnlyPins.has(34));
});

test("AVR assistant checks only real special pins, not default L298N assignments", () => {
  const profile = HARDWARE_PROFILES.ARDUINO_NANO_L298N;
  const rules = buildAssistantPinRules(profile, [], profileToConfig(profile.id));
  assert.equal(rules.reserved.size, 0);
  assert.ok(rules.specialWarnings.has(0));
  assert.ok(rules.specialWarnings.has(1));
  assert.ok(!rules.specialWarnings.has(profileToConfig(profile.id).pins.leftIn1));
});

test("ESP32-S3 uses its own pin constraints rather than classic ESP32 input-only range", () => {
  const profile = HARDWARE_PROFILES.ESP32_S3_L298N;
  const rules = buildAssistantPinRules(profile, [], profileToConfig(profile.id));
  assert.equal(rules.gpioMax, 48);
  assert.ok(rules.invalidGpioRanges.some(([min, max]) => min === 22 && max === 25));
  assert.ok(rules.inputOnlyPins.has(46));
  assert.ok(!rules.inputOnlyPins.has(34));
});

test("CT Expansion retains all fixed extension pin reservations", () => {
  try { registerExtension(extension); } catch (_) {}
  const profile = getHardwareProfile("ct-expansion-esp32");
  const config = { ...DEFAULT_HARDWARE_CONFIG, ...profileToConfig(profile.id) };
  const rules = buildAssistantPinRules(profile, [extension], config);
  assert.ok(rules.isCtExpansion);
  assert.ok(rules.reserved.has(19));
  assert.ok(rules.reserved.has(21));
  assert.ok(rules.reserved.has(36));
  // CT Expansion retains PCB reservations and still observes ESP32 silicon restrictions.
  assert.ok(rules.blockedPins.has(6));
  assert.ok(rules.specialWarnings.has(0));
  assert.ok(rules.inputOnlyPins.has(34));
});

test("resetHardwareConfig restores selected board defaults and leaves extension defaults intact", () => {
  const custom = { ...profileToConfig("esp32-l298n"), pins: { leftEn: 1 } };
  const restored = resetHardwareConfig("esp32-l298n", custom.robotType);
  assert.equal(restored.pins.leftEn, HARDWARE_PROFILES.ESP32_L298N.pins.leftEn);

  try { registerExtension(extension); } catch (_) {}
  const expansion = getHardwareProfile("ct-expansion-esp32");
  const extRestored = resetHardwareConfig(expansion.id);
  assert.equal(extRestored.pins.leftEn, expansion.pins.leftEn);
  assert.equal(extRestored.sensors.echo, expansion.sensors.echo);
});


test("ordinary boards do not treat their sample wiring roles as reserved GPIO", () => {
  for (const id of ["ct-robot-edu-board", "esp32-l298n", "esp32-free", "esp32-s3-l298n", "arduino-uno-l298n", "arduino-nano-l298n"]) {
    const profile = Object.values(HARDWARE_PROFILES).find(item => item.id === id);
    const rules = buildAssistantPinRules(profile, [], profileToConfig(id));
    assert.equal(rules.reserved.size, 0, `${id} must not reserve every default motor/sensor pin`);
  }
});

test("firmware header uses each ESP32 profile Bluetooth pins, not one global pair", () => {
  for (const id of ["esp32-devkit", "esp32-free", "esp32-s3-devkit", "ct-robot-edu-board"]) {
    const profile = Object.values(HARDWARE_PROFILES).find(item => item.id === id);
    const sketch = buildArduinoSketch(profileToConfig(id), "");
    assert.match(sketch, new RegExp(`#define BT_RX_PIN ${profile.bluetoothPins.rx}\\b`));
    assert.match(sketch, new RegExp(`#define BT_TX_PIN ${profile.bluetoothPins.tx}\\b`));
  }
});

test("ESP32 buzzer command switches tone off after its configured pulse", () => {
  const sketch = buildArduinoSketch(profileToConfig("esp32-l298n"), "robot.buzzer(1500);\n");
  assert.match(sketch, /ledcWriteTone\(BUZZER_PIN, \(double\)freq\);[\s\S]*delay\(200\);[\s\S]*ledcWriteTone\(BUZZER_PIN, 0\);/);
});

test("CT Expansion remains on its fixed extension firmware path and disables Bluetooth UART", () => {
  try { registerExtension(extension); } catch (_) {}
  const profile = getHardwareProfile("ct-expansion-esp32");
  const sketch = buildArduinoSketch(profileToConfig(profile.id), "ctExpMotorRun(1, 40);\n");
  assert.doesNotMatch(sketch, /BT_SERIAL\.begin/);
  assert.match(sketch, /CTEXP_MOTORS/);
});


test("every built-in profile and CT Expansion FQBN is accepted by the local compiler", () => {
  const builtInFqbns = Object.values(HARDWARE_PROFILES).map(profile => profile.fqbn);
  const expansionFqbn = extension.profiles[0].fqbn;
  for (const fqbn of [...builtInFqbns, expansionFqbn]) {
    assert.equal(resolveFqbn(fqbn), fqbn, `missing compile target ${fqbn}`);
  }
  assert.equal(resolveFqbn("invalid:target:board"), null);
  assert.equal(resolveFqbn(DEFAULT_FQBN), DEFAULT_FQBN);
});

test("reset button values match the profile defaults for every available board", () => {
  try { registerExtension(extension); } catch (_) {}
  for (const profile of Object.values(HARDWARE_PROFILES)) {
    const restored = resetHardwareConfig(profile.id);
    assert.deepEqual(restored.pins, profile.pins, `${profile.id} motor pins`);
    assert.deepEqual(restored.sensors, profile.sensors, `${profile.id} sensor pins`);
  }
});
