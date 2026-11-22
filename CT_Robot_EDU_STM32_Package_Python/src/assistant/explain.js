/* Giải thích khối / đoạn chương trình bằng ngôn ngữ tự nhiên (mẫu câu, không cần AI). */
import { getInfo } from "./knowledge.js";
import { walk } from "./tree.js";

function makeArg(node) {
  return (...names) => {
    for (const name of names) {
      if (name === "*" && node.valueNames.length === 1) {
        const target = node.values[node.valueNames[0]];
        return target ? describe(target) : "(chưa gắn)";
      }
      const target = node.values[name];
      if (target) return describe(target);
      if (node.valueNames.includes(name)) return "(chưa gắn)";
      if (name in node.texts) return node.texts[name];
    }
    return "…";
  };
}

/** Mô tả ngắn một khối (dùng cho cả khối giá trị lẫn lệnh). */
export function describe(node) {
  const info = getInfo(node.type);
  if (info?.say) {
    try { return info.say(makeArg(node), node); } catch { /* dùng mô tả dự phòng */ }
  }
  const args = Object.values(node.texts).filter(Boolean).join(", ");
  return `${info?.label || node.type}${args ? ` (${args})` : ""}`;
}

function bodiesOf(node) {
  if (node.type === "controls_if") {
    const arg = makeArg(node);
    const bodies = [];
    for (let i = 0; node.stmtNames.includes(`DO${i}`); i++) {
      bodies.push([i === 0 ? null : `Nếu không, nếu ${arg(`IF${i}`)} thì:`, node.stmts[`DO${i}`]]);
    }
    if (node.stmtNames.includes("ELSE")) bodies.push(["Nếu không thì:", node.stmts.ELSE]);
    return bodies;
  }
  return node.stmtNames.map(name => [null, node.stmts[name]]);
}

function stackLines(first, depth, out) {
  for (let node = first; node; node = node.next) {
    const bodies = bodiesOf(node);
    out.push({ depth, id: node.id, text: describe(node) + (bodies.length ? ":" : "") });
    for (const [label, body] of bodies) {
      if (label) out.push({ depth, id: node.id, text: label });
      if (body) stackLines(body, depth + 1, out);
      else out.push({ depth: depth + 1, id: node.id, text: "(chưa có khối nào bên trong)", muted: true });
    }
  }
}

const THEMES = [
  [/^ct_(forward|backward|turn_|motor_|stop)|^ctexp_(motor|forward|backward|turn_|stop)/, "điều khiển động cơ"],
  [/^ct_servo|^(ctexp|stm32[a-z]+)_servo/, "điều khiển servo"],
  [/^ct_line|^(ctexp|stm32[a-z]+)_line/, "đọc cảm biến dò line"],
  [/distance/, "đo khoảng cách"],
  [/^ct_bt_|^stm32[a-z]+_bt_/, "giao tiếp Bluetooth"],
  [/^ct_led|^ct_buzzer|^stm32[a-z]+_(led|buzzer)/, "bật LED / còi"],
  [/humidity|temperature/, "đọc nhiệt độ / độ ẩm"],
  [/^ct_(on_receive|broadcast)/, "chia việc bằng sự kiện"],
];

function summarize(roots) {
  const types = [];
  walk(roots, n => types.push(n.type));
  const themes = THEMES.filter(([re]) => types.some(t => re.test(t))).map(([, label]) => label);
  const total = types.filter(t => t !== "math_number").length;
  return `Chương trình có ${total} khối${themes.length ? `, dùng để: ${themes.join(", ")}` : ""}.`;
}

/** Giải thích cả chương trình. */
export function explainProgram(tree) {
  if (!tree.roots.length) return { summary: "Chưa có khối nào trong vùng lập trình.", lines: [] };
  const lines = [];
  tree.roots.forEach((root, i) => {
    if (i) lines.push({ depth: 0, text: "", spacer: true });
    stackLines(root, 0, lines);
  });
  return { summary: summarize(tree.roots), lines };
}

/** Giải thích một khối đang chọn (kèm khối bên trong, tuỳ chọn cả các khối phía dưới). */
export function explainBlock(node, { withNext = false } = {}) {
  const info = getInfo(node.type);
  const lines = [];
  if (node.isValue) {
    lines.push({ depth: 0, id: node.id, text: `Cho giá trị: ${describe(node)}` });
  } else if (withNext) {
    stackLines(node, 0, lines);
  } else {
    const solo = { ...node, next: null };
    stackLines(solo, 0, lines);
  }
  return {
    summary: info?.desc || "Chưa có mô tả cho khối này.",
    tip: info?.tip || null,
    lines,
  };
}
