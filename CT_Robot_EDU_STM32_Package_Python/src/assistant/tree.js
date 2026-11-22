/* Chuyển workspace Blockly thành cây nhẹ (không giữ tham chiếu Blockly) để phân tích. */

const VALUE_INPUT = 1;      // Blockly.ConnectionType.INPUT_VALUE
const STATEMENT_INPUT = 3;  // Blockly.ConnectionType.NEXT_STATEMENT

function build(block, parent, byId) {
  const node = {
    id: block.id,
    type: block.type,
    parent,
    prev: null,
    next: null,
    isShadow: Boolean(block.isShadow?.()),
    isValue: Boolean(block.outputConnection),
    fields: {},
    texts: {},
    values: {},
    valueNames: [],
    stmts: {},
    stmtNames: [],
  };
  byId.set(node.id, node);

  for (const input of block.inputList || []) {
    for (const field of input.fieldRow || []) {
      if (!field.name) continue;
      node.fields[field.name] = field.getValue();
      node.texts[field.name] = field.getText ? field.getText() : String(field.getValue());
    }
    const connection = input.connection;
    if (!connection) continue;
    const target = connection.targetBlock();
    if (connection.type === VALUE_INPUT) {
      node.valueNames.push(input.name);
      if (target) node.values[input.name] = build(target, node, byId);
    } else if (connection.type === STATEMENT_INPUT) {
      node.stmtNames.push(input.name);
      node.stmts[input.name] = target ? chain(target, node, byId) : null;
    }
  }
  return node;
}

function chain(first, parent, byId) {
  let head = null;
  let prev = null;
  for (let block = first; block; block = block.getNextBlock()) {
    const node = build(block, parent, byId);
    if (prev) { prev.next = node; node.prev = prev; } else head = node;
    prev = node;
  }
  return head;
}

export function serialize(workspace) {
  const byId = new Map();
  const roots = workspace
    .getTopBlocks(true)
    .filter(block => !block.isInsertionMarker?.())
    .map(block => chain(block, null, byId));
  return { roots, byId };
}

/** Duyệt mọi nút (khối giá trị, thân khối, khối kế tiếp). */
export function walk(roots, visit) {
  const go = head => {
    for (let n = head; n; n = n.next) {
      visit(n);
      Object.values(n.values).forEach(go);
      Object.values(n.stmts).forEach(go);
    }
  };
  roots.forEach(go);
}
