import test from "node:test";
import assert from "node:assert/strict";
import { generateIfElseChain } from "../src/controlFlowGenerator.js";

function fakeBlock(inputs) {
  return { getInput: name => inputs.has(name) ? { name } : null };
}

function fakeGenerator() {
  return {
    ORDER_NONE: 99,
    valueToCode: (_block, name) => ({ IF0: "distance < 10", IF1: "distance < 20", IF2: "lineLeft == 0" }[name] || ""),
    statementToCode: (_block, name) => ({
      DO0: "  robot.stop();\n",
      DO1: "  robot.turnLeft(50, 0.2);\n",
      DO2: "  robot.turnRight(50, 0.2);\n",
      ELSE: "  robot.forward(50, 1);\n",
    }[name] || ""),
  };
}

test("if generator includes every else-if branch and final else", () => {
  const inputs = new Set(["IF0", "DO0", "IF1", "DO1", "IF2", "DO2", "ELSE"]);
  const code = generateIfElseChain(fakeBlock(inputs), fakeGenerator());
  assert.match(code, /if \(distance < 10\)/);
  assert.match(code, /else if \(distance < 20\)/);
  assert.match(code, /else if \(lineLeft == 0\)/);
  assert.match(code, /else \{/);
  assert.equal((code.match(/else if/g) || []).length, 2);
  assert.match(code, /robot\.forward\(50, 1\)/);
});

test("if generator emits a single if when no else branch exists", () => {
  const code = generateIfElseChain(fakeBlock(new Set(["IF0", "DO0"])), fakeGenerator());
  assert.match(code, /^if \(distance < 10\)/);
  assert.doesNotMatch(code, /else/);
});

test("if generator keeps an empty condition safe and defaults to false", () => {
  const generator = { ORDER_NONE: 0, valueToCode: () => "", statementToCode: () => "" };
  const code = generateIfElseChain(fakeBlock(new Set(["IF0", "DO0"])), generator);
  assert.match(code, /if \(false\)/);
});
