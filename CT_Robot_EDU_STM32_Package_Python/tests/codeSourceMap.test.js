import test from "node:test";
import assert from "node:assert/strict";
import {
  getHighlightedLineIndexes,
  instrumentBlocklyGenerator,
  markBlockCode,
  stripBlockCodeMarkers,
} from "../src/codeSourceMap.js";

test("instrument generator marks statement and value outputs without changing generator results", () => {
  const generator = {
    ORDER_ATOMIC: 0,
    forBlock: {
      sample_statement(block) {
        return `robot.move(${block.value});\n`;
      },
      sample_value(block) {
        return [String(block.value), 0];
      },
    },
  };

  instrumentBlocklyGenerator(generator);
  const statement = generator.forBlock.sample_statement({ id: "statement-1", value: 80 });
  const value = generator.forBlock.sample_value({ id: "value-1", value: 42 });

  assert.match(statement, /__CT_BLOCK_START:statement-1__/);
  assert.match(statement, /robot\.move\(80\);/);
  assert.match(statement, /__CT_BLOCK_END:statement-1__/);
  assert.equal(value[1], 0);
  assert.match(value[0], /__CT_BLOCK_START:value-1__/);
  assert.match(value[0], /42/);
  assert.match(value[0], /__CT_BLOCK_END:value-1__/);
});

test("instrumentation is idempotent and wraps generators registered later", () => {
  const generator = { forBlock: { first: block => `first(${block.id});` } };
  instrumentBlocklyGenerator(generator);
  const firstWrapped = generator.forBlock.first;
  instrumentBlocklyGenerator(generator);
  assert.equal(generator.forBlock.first, firstWrapped);

  generator.forBlock.late = block => `late(${block.id});`;
  instrumentBlocklyGenerator(generator);
  assert.match(generator.forBlock.late({ id: "late-1" }), /__CT_BLOCK_START:late-1__/);
});

test("strip markers preserves sketch bytes and calculates nested source ranges", () => {
  const childCode = "robot.forward(80);\n";
  const child = markBlockCode("child", childCode);
  const markedParentBody = `if (true) {\n${child}}\n`;
  const parentBody = `if (true) {\n${childCode}}\n`;
  const marked = `setup() {\n${markBlockCode("parent", markedParentBody)} }`;
  const result = stripBlockCodeMarkers(marked);
  const expected = `setup() {\n${parentBody} }`;

  assert.equal(result.code, expected);
  assert.deepEqual(result.blockRanges.parent, [{ start: 10, end: 10 + parentBody.length - 1 }]);
  const childStart = expected.indexOf("robot.forward");
  assert.deepEqual(result.blockRanges.child, [{ start: childStart, end: childStart + "robot.forward(80);".length }]);
});

test("line mapping highlights every line touched by a block range", () => {
  const code = "void setup() {\n  robot.forward(80);\n  delay(100);\n}";
  const start = code.indexOf("robot.forward");
  const end = code.indexOf("delay(100)") + "delay(100);".length;
  assert.deepEqual(getHighlightedLineIndexes(code, [{ start, end }]), [1, 2]);
  assert.deepEqual(getHighlightedLineIndexes(code, []), []);
});

test("empty generated blocks do not create phantom highlighted ranges", () => {
  const result = stripBlockCodeMarkers(`before${markBlockCode("empty", "")}after`);
  assert.equal(result.code, "beforeafter");
  assert.deepEqual(result.blockRanges, {});
});

test("line mapping does not spill into the following line at an exclusive range end", () => {
  const code = "first();\nsecond();";
  const endOfFirstLine = "first();".length;
  assert.deepEqual(getHighlightedLineIndexes(code, [{ start: 0, end: endOfFirstLine }]), [0]);
});

test("source markers survive Arduino sketch assembly and are removed before output", async () => {
  const { DEFAULT_HARDWARE_CONFIG, buildArduinoSketch } = await import("../src/hardwareProfiles.js");
  const generated = markBlockCode("move-block", "robot.forward(80, 1);\n");
  const assembled = buildArduinoSketch(DEFAULT_HARDWARE_CONFIG, generated);
  const result = stripBlockCodeMarkers(assembled);

  assert.match(result.code, /robot\.forward\(80, 1\);/);
  assert.doesNotMatch(result.code, /__CT_BLOCK_/);
  assert.equal(result.blockRanges["move-block"].length, 1);
  assert.ok(result.code.slice(result.blockRanges["move-block"][0].start, result.blockRanges["move-block"][0].end).includes("robot.forward"));
});


test("source markers do not add blank lines or change the generated Arduino sketch", async () => {
  const { DEFAULT_HARDWARE_CONFIG, buildArduinoSketch } = await import("../src/hardwareProfiles.js");
  const plain = buildArduinoSketch(DEFAULT_HARDWARE_CONFIG, "robot.forward(80, 1);\n");
  const marked = buildArduinoSketch(DEFAULT_HARDWARE_CONFIG, markBlockCode("move", "robot.forward(80, 1);\n"));
  assert.equal(stripBlockCodeMarkers(marked).code, plain);
});
