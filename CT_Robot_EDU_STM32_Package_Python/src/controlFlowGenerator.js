/** Sinh một chuỗi if / else-if / else từ các input Blockly. */
export function generateIfElseChain(block, generator) {
  if (!block || !generator) return "";
  let code = "";
  let branch = 0;

  while (block.getInput(`IF${branch}`)) {
    const condition = generator.valueToCode(
      block,
      `IF${branch}`,
      generator.ORDER_NONE
    ) || "false";
    const body = generator.statementToCode(block, `DO${branch}`);
    code += branch === 0
      ? `if (${condition}) {\n${body}}`
      : ` else if (${condition}) {\n${body}}`;
    branch += 1;
  }

  if (block.getInput("ELSE")) {
    const elseBody = generator.statementToCode(block, "ELSE");
    code += ` else {\n${elseBody}}`;
  }

  return code ? `${code}\n` : "if (false) {\n}\n";
}
