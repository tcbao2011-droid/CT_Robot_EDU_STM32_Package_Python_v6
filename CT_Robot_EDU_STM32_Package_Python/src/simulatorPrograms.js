/*
 * Trình mô phỏng: giá trị và câu lệnh của các khối Logic / Điều khiển / Toán / Chữ / Biến / Danh sách.
 * Không import Blockly (chỉ dùng API của đối tượng khối) nên test được bằng Node.
 *
 * `ev` do App.jsx cung cấp:
 *   ev.any(block) -> số | chữ | đúng/sai     ev.num(block) -> số      ev.cond(block) -> đúng/sai
 *   ev.getVar(id) / ev.setVar(id, value)      ev.list(id) -> mảng      ev.push(command)
 *   ev.run(firstBlock) -> "break" | "continue" | undefined (chạy một chuỗi khối)
 */

export const MAX_LOOP_ITERATIONS = 100; // mô phỏng không có cảm biến thật nên chặn vòng lặp vô hạn

export const toNumber = value => {
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const toText = value => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(4)));
  return String(value ?? "");
};

const VALUE_TYPES = new Set([
  "ct_ternary", "ct_between", "ct_millis", "ct_mod", "ct_pow", "ct_math_func", "ct_minmax", "ct_constrain",
  "ct_random", "ct_round_places", "ct_math_constant", "ct_text", "ct_join", "ct_text_length", "ct_text_char_at",
  "ct_text_contains", "ct_text_case", "ct_text_to_number", "ct_list_get", "ct_list_length", "ct_list_index",
  "ct_list_contains",
]);
export const isProgramValueType = type => VALUE_TYPES.has(type);

const BOOLEAN_VALUE_TYPES = new Set(["ct_between", "ct_text_contains", "ct_list_contains"]);
export const isProgramBooleanType = type => BOOLEAN_VALUE_TYPES.has(type);

const roundHalfUp = v => Math.floor(v + 0.5);
const FUNCS = {
  SQRT: v => (v > 0 ? Math.sqrt(v) : 0), ABS: Math.abs, ROUND: roundHalfUp, FLOOR: Math.floor, CEIL: Math.ceil,
  SIN: v => Math.sin((v * Math.PI) / 180), COS: v => Math.cos((v * Math.PI) / 180), TAN: v => Math.tan((v * Math.PI) / 180),
  ASIN: v => (Math.asin(Math.max(-1, Math.min(1, v))) * 180) / Math.PI,
  ACOS: v => (Math.acos(Math.max(-1, Math.min(1, v))) * 180) / Math.PI,
  ATAN: v => (Math.atan(v) * 180) / Math.PI,
  LN: v => (v > 0 ? Math.log(v) : 0), LOG10: v => (v > 0 ? Math.log10(v) : 0), EXP: Math.exp, EXP10: v => 10 ** v,
};
const CONSTANTS = { PI: Math.PI, E: Math.E, GOLDEN: 1.61803399 };

const listOf = (block, ev) => ev.list(block.getFieldValue("LIST"));

export function evaluateProgramValue(block, ev) {
  const num = name => ev.num(block.getInputTargetBlock(name));
  const any = name => ev.any(block.getInputTargetBlock(name));
  const text = name => toText(any(name));

  switch (block.type) {
    case "ct_text": return block.getFieldValue("TEXT") ?? "";
    case "ct_join": return text("A") + text("B");
    case "ct_text_length": return text("TEXT").length;
    case "ct_text_char_at": {
      const i = Math.trunc(num("N"));
      const s = text("TEXT");
      return i >= 1 && i <= s.length ? s[i - 1] : "";
    }
    case "ct_text_contains": return text("A").includes(text("B"));
    case "ct_text_case": return block.getFieldValue("CASE") === "LOWER" ? text("TEXT").toLowerCase() : text("TEXT").toUpperCase();
    case "ct_text_to_number": return toNumber(text("TEXT"));

    case "ct_ternary": return ev.cond(block.getInputTargetBlock("COND")) ? any("A") : any("B");
    case "ct_between": {
      const x = num("X");
      const a = num("A");
      const b = num("B");
      return x >= Math.min(a, b) && x <= Math.max(a, b);
    }
    case "ct_millis": return block.getFieldValue("UNIT") === "MS" ? ev.elapsedMs?.() ?? 0 : (ev.elapsedMs?.() ?? 0) / 1000;
    case "ct_mod": { const a = num("A"); const b = num("B"); return b === 0 ? 0 : a - b * Math.floor(a / b); }
    case "ct_pow": { const r = num("A") ** num("B"); return Number.isFinite(r) ? r : 0; }
    case "ct_math_func": return (FUNCS[block.getFieldValue("FUNC")] || Math.abs)(num("X"));
    case "ct_minmax": return block.getFieldValue("OP") === "MAX" ? Math.max(num("A"), num("B")) : Math.min(num("A"), num("B"));
    case "ct_constrain": {
      const lo = Math.min(num("LO"), num("HI"));
      const hi = Math.max(num("LO"), num("HI"));
      return Math.min(hi, Math.max(lo, num("X")));
    }
    case "ct_random": {
      const a = Math.trunc(num("A"));
      const b = Math.trunc(num("B"));
      const lo = Math.min(a, b);
      return lo + Math.floor((ev.random?.() ?? Math.random()) * (Math.max(a, b) - lo + 1));
    }
    case "ct_round_places": { const p = 10 ** num("N"); return roundHalfUp(num("X") * p) / p; }
    case "ct_math_constant": return CONSTANTS[block.getFieldValue("NAME")] ?? 0;

    case "ct_list_get": { const i = Math.trunc(num("INDEX")); const l = listOf(block, ev); return i >= 1 && i <= l.length ? l[i - 1] : 0; }
    case "ct_list_length": return listOf(block, ev).length;
    case "ct_list_index": return listOf(block, ev).findIndex(v => v === num("ITEM")) + 1;
    case "ct_list_contains": return listOf(block, ev).includes(num("ITEM"));
    default: return 0;
  }
}

/**
 * Chạy một câu lệnh thuộc nhóm khối này.
 * @returns {undefined | { signal?: "break" | "continue" }} undefined = không phải khối của nhóm này.
 */
export function runProgramStatement(block, ev) {
  const any = name => ev.any(block.getInputTargetBlock(name));
  const num = name => ev.num(block.getInputTargetBlock(name));
  const body = block.getInputTargetBlock?.("DO");

  /** Chạy thân vòng lặp; trả về "break" khi cần thoát. */
  const runBody = () => (body ? ev.run(body) : undefined);

  switch (block.type) {
    case "variables_set":
      ev.setVar(block.getFieldValue("VAR"), any("VALUE"));
      return {};
    case "math_change":
      ev.setVar(block.getFieldValue("VAR"), toNumber(ev.getVar(block.getFieldValue("VAR"))) + num("DELTA"));
      return {};

    case "ct_break": return { signal: "break" };
    case "ct_continue": return { signal: "continue" };

    case "ct_while":
    case "ct_repeat_until": {
      const until = block.type === "ct_repeat_until";
      for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
        const ok = ev.cond(block.getInputTargetBlock("COND"));
        if (until ? ok : !ok) break;
        if (runBody() === "break") break;
      }
      return {};
    }
    case "ct_for": {
      const id = block.getFieldValue("VAR");
      const from = num("FROM");
      const to = num("TO");
      const by = num("BY") || 1;
      let v = from;
      let broke = false;
      for (let i = 0; i < MAX_LOOP_ITERATIONS && (by > 0 ? v <= to : v >= to); i++, v += by) {
        ev.setVar(id, v);
        if (runBody() === "break") { broke = true; break; } // THOÁT: biến giữ nguyên giá trị hiện tại
      }
      if (!broke) ev.setVar(id, v); // hết vòng: biến mang giá trị đầu tiên vượt giới hạn (giống mã C++)
      return {};
    }
    case "ct_wait_until":
      // Mô phỏng không có cảm biến thật: điều kiện chưa đúng thì chỉ chờ một chút rồi đi tiếp.
      if (!ev.cond(block.getInputTargetBlock("COND"))) ev.push({ type: "wait", seconds: 0.5 });
      return {};
    case "ct_wait_ms":
      ev.push({ type: "wait", seconds: Math.max(0.01, num("MS") / 1000) });
      return {};
    case "ct_serial_print":
      return {};

    case "ct_list_add": listOf(block, ev).push(num("ITEM")); return {};
    case "ct_list_insert": {
      const l = listOf(block, ev);
      const i = Math.max(1, Math.min(Math.trunc(num("INDEX")), l.length + 1));
      l.splice(i - 1, 0, num("ITEM"));
      return {};
    }
    case "ct_list_remove": {
      const l = listOf(block, ev);
      const i = Math.trunc(num("INDEX"));
      if (i >= 1 && i <= l.length) l.splice(i - 1, 1);
      return {};
    }
    case "ct_list_set": {
      const l = listOf(block, ev);
      const i = Math.trunc(num("INDEX"));
      if (i >= 1 && i <= l.length) l[i - 1] = num("ITEM");
      return {};
    }
    case "ct_list_clear": listOf(block, ev).length = 0; return {};
    default: return undefined;
  }
}
