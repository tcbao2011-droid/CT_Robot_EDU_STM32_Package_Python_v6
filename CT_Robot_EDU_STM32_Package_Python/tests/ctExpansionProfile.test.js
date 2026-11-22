import test from "node:test";
import assert from "node:assert/strict";
import extension from "../src/extensions/builtin/ctExpansionEsp32.js";
import {
  getActiveExtensions,
  getExtensions,
  registerExtension,
} from "../src/extensions/registry.js";
import {
  DEFAULT_HARDWARE_CONFIG,
  buildArduinoSketch,
  getHardwareProfile,
  validateHardwareConfig,
} from "../src/hardwareProfiles.js";

const profileDefinition = extension.profiles[0];
registerExtension(extension);
const profile = getHardwareProfile(profileDefinition.id);
const config = {
  ...DEFAULT_HARDWARE_CONFIG,
  profileId: profile.id,
  pins: { ...profile.pins },
  sensors: { ...profile.sensors },
};

test("CT expansion profile matches the documented motor and sensor GPIO map", () => {
  assert.deepEqual(profile.pins, {
    leftIn1: 19,
    leftIn2: 5,
    leftEn: 18,
    rightIn1: 4,
    rightIn2: 16,
    rightEn: 17,
  });
  assert.deepEqual(profile.sensors, {
    trig: -1,
    echo: 36,
    lineLeft: 34,
    lineRight: 35,
    led: -1,
    buzzer: -1,
    servo: -1,
  });
});

test("CT expansion extension is registered and active only on its profile", () => {
  assert.ok(getExtensions().some(item => item.id === "ct-expansion-esp32"));
  assert.deepEqual(getActiveExtensions(profile).map(item => item.id), ["ct-expansion-esp32"]);
  assert.deepEqual(getActiveExtensions(null), []);
  assert.equal(extension.blocks.length, 20);
});

test("default CT expansion pin configuration passes extension compatibility checks", () => {
  assert.deepEqual(validateHardwareConfig(config), []);
});

test("motor block selects TB6612 runtime without injecting it into other board profiles", () => {
  const sketch = buildArduinoSketch(config, "ctExpMotorRun(1, 80);\n");
  assert.match(sketch, /CTEXP_MOTORS\[6\]/);
  assert.match(sketch, /ctExpMotorBegin\(\);/);
  assert.match(sketch, /#define CT_NO_TRIG/);
  assert.doesNotMatch(sketch, /BT_SERIAL\.begin/);

  const baseSketch = buildArduinoSketch(DEFAULT_HARDWARE_CONFIG, "robot.forward(80, 1);\n");
  assert.doesNotMatch(baseSketch, /CTEXP_MOTORS/);
});


test("manual GPIO changes that collide with a fixed extension pin are rejected", () => {
  const conflicting = {
    ...config,
    pins: { ...config.pins, leftEn: 27 }, // GPIO27 là PWM của động cơ M3.
  };
  const errors = validateHardwareConfig(conflicting);
  assert.ok(errors.some(message => message.includes("GPIO27") && message.includes("M3 PWM")));
});
