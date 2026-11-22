/*
 * Khối lập trình dùng chung cho mọi mạch (không phụ thuộc phần cứng):
 *   Logic · Điều khiển (vòng lặp, chờ đến khi) · Thời gian · Toán · Chữ · Biến · Danh sách
 *
 * Mã C++ sinh ra chỉ dùng một tập con đơn giản (while / for / break / ?: / gọi hàm ct_*) để
 * pythonGenerator.js dịch tiếp sang MicroPython. Hàm ct_* có bản C++ (PROGRAM_CPP_HELPERS)
 * và bản Python (PROGRAM_PY_HELPERS) cùng tên, cùng ý nghĩa.
 */
import * as Blockly from "blockly";
import "blockly/blocks";
import { javascriptGenerator } from "blockly/javascript";
import { ANY_VALUE, applyShadowDefaults, inlineValueInputs, numberShadowXml } from "./valueSlots.js";
import { unmarkedCode } from "./codeSourceMap.js";
import { LIST_TYPE } from "./programRuntime.js";

export { LIST_TYPE };

const COLOUR = {
  logic: "#6b7280",
  control: "#dd6b20",
  time: "#805ad5",
  math: "#8b5e3c",
  text: "#3b82f6",
  variable: "#d6336c",
  list: "#0d9488",
};


/* =====================================================
   Nhãn tiếng Việt cho khối biến chuẩn của Blockly
===================================================== */
Object.assign(Blockly.Msg, {
  VARIABLES_SET: "ĐẶT %1 = %2",
  MATH_CHANGE_TITLE: "TĂNG %1 THÊM %2",
  VARIABLES_DEFAULT_NAME: "biến",
  NEW_VARIABLE: "Tạo biến...",
  NEW_VARIABLE_TITLE: "Tên biến mới:",
  NEW_VARIABLE_TYPE_TITLE: "Kiểu biến mới:",
  RENAME_VARIABLE: "Đổi tên biến...",
  RENAME_VARIABLE_TITLE: "Đổi tên tất cả biến \"%1\" thành:",
  DELETE_VARIABLE: "Xóa biến \"%1\"",
  DELETE_VARIABLE_CONFIRMATION: "Xóa %1 chỗ đang dùng biến \"%2\"?",
  VARIABLE_ALREADY_EXISTS: "Đã có biến tên \"%1\".",
  VARIABLE_ALREADY_EXISTS_FOR_ANOTHER_TYPE: "Tên \"%1\" đã được dùng cho một loại khác.",
  VARIABLES_SET_TOOLTIP: "Gán giá trị cho biến.",
  VARIABLES_GET_TOOLTIP: "Giá trị hiện tại của biến.",
  MATH_CHANGE_TOOLTIP: "Cộng thêm một số vào biến (số âm để giảm).",
  PROCEDURE_ALREADY_EXISTS: "Đã có tên \"%1\".",
});

/* =====================================================
   Helper
===================================================== */

const code = (block, name, fallback = "0") =>
  javascriptGenerator.valueToCode(block, name, javascriptGenerator.ORDER_NONE) || fallback;

const textCode = (block, name) => `ct_str(${code(block, name, 'String("")')})`;

function literalNumber(text) {
  const t = unmarkedCode(text).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

function define(type, json, generator) {
  Blockly.Blocks[type] = {
    init() {
      this.jsonInit(json);
      applyShadowDefaults(this, json, Blockly.utils.xml.textToDom);
      inlineValueInputs(this);
    },
  };
  javascriptGenerator.forBlock[type] = generator;
}

const num = (name, shadow) => ({ type: "input_value", name, check: ANY_VALUE, shadow });
const txt = (name, shadowText) => ({ type: "input_value", name, check: ANY_VALUE, shadowText });
const cond = name => ({ type: "input_value", name, check: "Boolean" });

const reporter = (type, message0, args0, output, colour, tooltip, generator) =>
  define(type, { message0, args0, output, colour, tooltip, inputsInline: true }, (block) => [generator(block), javascriptGenerator.ORDER_ATOMIC]);

const statement = (type, message0, args0, colour, tooltip, generator) =>
  define(type, { message0, args0, previousStatement: null, nextStatement: null, colour, tooltip, inputsInline: true }, generator);

/* =====================================================
   LOGIC (thêm): ?: và "nằm trong khoảng"
===================================================== */

reporter("ct_ternary", "NẾU %1 THÌ %2 NẾU KHÔNG %3",
  [cond("COND"), num("A", 1), num("B", 0)], null, COLOUR.logic,
  "Giá trị thay đổi theo điều kiện: đúng thì lấy ô THÌ, sai thì lấy ô NẾU KHÔNG.",
  b => `(${code(b, "COND", "false")} ? ${code(b, "A", "1")} : ${code(b, "B", "0")})`);

reporter("ct_between", "%1 NẰM TRONG KHOẢNG %2 – %3",
  [num("X", 0), num("A", 0), num("B", 10)], "Boolean", COLOUR.logic,
  "Đúng khi giá trị nằm từ ô đầu đến ô sau (tính cả hai đầu).",
  b => `ct_between(${code(b, "X")}, ${code(b, "A")}, ${code(b, "B", "10")})`);

/* =====================================================
   ĐIỀU KHIỂN: vòng lặp, chờ đến khi, thoát/bỏ qua
===================================================== */

function loopBlock(type, header, tooltip, build) {
  define(type, {
    message0: header.message, args0: header.args,
    message1: "%1", args1: [{ type: "input_statement", name: "DO" }],
    previousStatement: null, nextStatement: null, colour: COLOUR.control, tooltip, inputsInline: true,
  }, block => build(block, javascriptGenerator.statementToCode(block, "DO")));
}

loopBlock("ct_while", { message: "LẶP TRONG KHI %1", args: [cond("COND")] },
  "Lặp lại các khối bên trong chừng nào điều kiện còn đúng.",
  (b, body) => `while (${code(b, "COND", "false")}) {\n${body}}\n`);

loopBlock("ct_repeat_until", { message: "LẶP CHO ĐẾN KHI %1", args: [cond("COND")] },
  "Lặp lại các khối bên trong cho đến khi điều kiện đúng.",
  (b, body) => `while (!(${code(b, "COND", "true")})) {\n${body}}\n`);

loopBlock("ct_for", {
  message: "ĐẾM %1 TỪ %2 ĐẾN %3 BƯỚC %4",
  args: [{ type: "field_variable", name: "VAR", variable: "i" }, num("FROM", 1), num("TO", 10), num("BY", 1)],
}, "Cho biến chạy từ số đầu đến số cuối, mỗi vòng thêm một bước (bước âm để đếm ngược).",
(b, body) => {
  const v = varName(b.workspace, b.getFieldValue("VAR"));
  const from = code(b, "FROM", "1");
  const to = code(b, "TO", "10");
  const by = code(b, "BY", "1");
  const step = literalNumber(by);
  const down = step !== null && step < 0;
  const update = down ? `${v} -= ${Math.abs(step)}` : `${v} += ${by}`;
  return `for (${v} = ${from}; ${v} ${down ? ">=" : "<="} ${to}; ${update}) {\n${body}}\n`;
});

statement("ct_wait_until", "CHỜ ĐẾN KHI %1", [cond("COND")], COLOUR.control,
  "Dừng tại đây cho đến khi điều kiện đúng.",
  b => `while (!(${code(b, "COND", "true")})) {\n  delay(1);\n}\n`);

const LOOP_TYPES = new Set(["ct_repeat", "ct_while", "ct_repeat_until", "ct_for", "ct_forever"]);

function loopOnlyBlock(type, message, tooltip, word) {
  Blockly.Blocks[type] = {
    init() {
      this.jsonInit({ message0: message, previousStatement: null, colour: COLOUR.control, tooltip });
      this.setOnChange(() => {
        if (!this.workspace || this.isInFlyout) return;
        let parent = this.getSurroundParent();
        while (parent && !LOOP_TYPES.has(parent.type)) parent = parent.getSurroundParent();
        this.setWarningText(parent ? null : "Khối này chỉ dùng được bên trong một vòng lặp.");
      });
    },
  };
  javascriptGenerator.forBlock[type] = () => `${word};\n`;
}
loopOnlyBlock("ct_break", "THOÁT VÒNG LẶP", "Dừng vòng lặp hiện tại và chạy tiếp khối phía sau vòng lặp.", "break");
loopOnlyBlock("ct_continue", "BỎ QUA LẦN LẶP NÀY", "Bỏ phần còn lại của lần lặp này và sang lần lặp kế tiếp.", "continue");

/* =====================================================
   THỜI GIAN (thêm)
===================================================== */

statement("ct_wait_ms", "CHỜ %1 MILI-GIÂY", [num("MS", 500)], COLOUR.time,
  "Dừng chương trình một khoảng thời gian tính bằng mili-giây.",
  b => `delay(${code(b, "MS", "500")});\n`);

reporter("ct_millis", "THỜI GIAN CHẠY (%1)",
  [{ type: "field_dropdown", name: "UNIT", options: [["giây", "S"], ["mili-giây", "MS"]] }],
  "Number", COLOUR.time, "Thời gian đã trôi qua kể từ lúc mạch khởi động.",
  b => (b.getFieldValue("UNIT") === "MS" ? "((float)millis())" : "(millis() / 1000.0)"));

/* =====================================================
   TOÁN (thêm)
===================================================== */

reporter("ct_mod", "%1 CHIA LẤY DƯ %2", [num("A", 10), num("B", 3)], "Number", COLOUR.math,
  "Phần dư của phép chia (chia cho 0 cho kết quả 0).", b => `ct_mod(${code(b, "A")}, ${code(b, "B", "1")})`);

reporter("ct_pow", "%1 LŨY THỪA %2", [num("A", 2), num("B", 3)], "Number", COLOUR.math,
  "Số thứ nhất lũy thừa số thứ hai.", b => `ct_pow(${code(b, "A")}, ${code(b, "B", "1")})`);

const MATH_FUNCS = {
  SQRT: ["căn bậc hai", "ct_sqrt"], ABS: ["trị tuyệt đối", "ct_abs"], ROUND: ["làm tròn", "ct_round"],
  FLOOR: ["làm tròn xuống", "ct_floor"], CEIL: ["làm tròn lên", "ct_ceil"],
  SIN: ["sin (độ)", "ct_sin"], COS: ["cos (độ)", "ct_cos"], TAN: ["tan (độ)", "ct_tan"],
  ASIN: ["asin (ra độ)", "ct_asin"], ACOS: ["acos (ra độ)", "ct_acos"], ATAN: ["atan (ra độ)", "ct_atan"],
  LN: ["ln", "ct_ln"], LOG10: ["log", "ct_log10"], EXP: ["e ^", "ct_exp"], EXP10: ["10 ^", "ct_exp10"],
};
export const MATH_FUNC_NAMES = Object.fromEntries(Object.entries(MATH_FUNCS).map(([k, v]) => [k, v[1]]));

reporter("ct_math_func", "%1 của %2",
  [{ type: "field_dropdown", name: "FUNC", options: Object.entries(MATH_FUNCS).map(([k, v]) => [v[0], k]) }, num("X", 0)],
  "Number", COLOUR.math, "Các hàm toán: căn bậc hai, làm tròn, sin, cos, ln, log...",
  b => `${MATH_FUNCS[b.getFieldValue("FUNC")]?.[1] || "ct_abs"}(${code(b, "X")})`);

reporter("ct_minmax", "%1 của %2 và %3",
  [{ type: "field_dropdown", name: "OP", options: [["nhỏ nhất", "MIN"], ["lớn nhất", "MAX"]] }, num("A", 0), num("B", 0)],
  "Number", COLOUR.math, "Số nhỏ nhất hoặc lớn nhất trong hai số.",
  b => `${b.getFieldValue("OP") === "MAX" ? "ct_max" : "ct_min"}(${code(b, "A")}, ${code(b, "B")})`);

reporter("ct_constrain", "GIỚI HẠN %1 TỪ %2 ĐẾN %3", [num("X", 0), num("LO", 0), num("HI", 100)],
  "Number", COLOUR.math, "Giữ giá trị trong khoảng cho trước.",
  b => `ct_constrain(${code(b, "X")}, ${code(b, "LO")}, ${code(b, "HI", "100")})`);

reporter("ct_random", "SỐ NGẪU NHIÊN TỪ %1 ĐẾN %2", [num("A", 1), num("B", 10)],
  "Number", COLOUR.math, "Số nguyên ngẫu nhiên, gồm cả hai đầu.",
  b => `ct_random(${code(b, "A", "1")}, ${code(b, "B", "10")})`);

reporter("ct_round_places", "LÀM TRÒN %1 ĐẾN %2 SỐ LẺ", [num("X", 3.14159), num("N", 2)],
  "Number", COLOUR.math, "Làm tròn số thập phân đến số chữ số sau dấu phẩy.",
  b => `ct_round_places(${code(b, "X")}, ${code(b, "N", "0")})`);

const CONSTANTS = { PI: ["π", "3.14159265"], E: ["e", "2.71828183"], GOLDEN: ["φ (tỉ lệ vàng)", "1.61803399"] };
reporter("ct_math_constant", "HẰNG SỐ %1",
  [{ type: "field_dropdown", name: "NAME", options: Object.entries(CONSTANTS).map(([k, v]) => [v[0], k]) }],
  "Number", COLOUR.math, "Các hằng số toán học thường dùng.", b => CONSTANTS[b.getFieldValue("NAME")]?.[1] || "0");

/* =====================================================
   CHỮ
===================================================== */

Blockly.Blocks["ct_text"] = {
  init() {
    this.jsonInit({
      message0: "\u201C %1 \u201D",
      args0: [{ type: "field_input", name: "TEXT", text: "xin chào" }],
      output: "String", colour: COLOUR.text, tooltip: "Một đoạn chữ.",
    });
  },
};
javascriptGenerator.forBlock["ct_text"] = block => [`String(${JSON.stringify(block.getFieldValue("TEXT") ?? "")})`, javascriptGenerator.ORDER_ATOMIC];

reporter("ct_join", "NỐI %1 VỚI %2", [txt("A", "xin"), txt("B", "chào")], "String", COLOUR.text,
  "Nối hai giá trị thành một đoạn chữ (số được đổi thành chữ).", b => `(${textCode(b, "A")} + ${textCode(b, "B")})`);

reporter("ct_text_length", "ĐỘ DÀI CỦA %1", [txt("TEXT", "xin chào")], "Number", COLOUR.text,
  "Số ký tự của đoạn chữ.", b => `ct_len(${textCode(b, "TEXT")})`);

reporter("ct_text_char_at", "KÝ TỰ THỨ %1 CỦA %2", [num("N", 1), txt("TEXT", "xin chào")], "String", COLOUR.text,
  "Lấy một ký tự (đếm từ 1).", b => `ct_char_at(${textCode(b, "TEXT")}, ${code(b, "N", "1")})`);

reporter("ct_text_contains", "%1 CÓ CHỨA %2", [txt("A", "xin chào"), txt("B", "xin")], "Boolean", COLOUR.text,
  "Đúng khi đoạn chữ đầu có chứa đoạn chữ sau.", b => `ct_contains(${textCode(b, "A")}, ${textCode(b, "B")})`);

reporter("ct_text_case", "CHUYỂN %1 THÀNH %2",
  [txt("TEXT", "xin chào"), { type: "field_dropdown", name: "CASE", options: [["CHỮ HOA", "UPPER"], ["chữ thường", "LOWER"]] }],
  "String", COLOUR.text, "Đổi chữ hoa/chữ thường (chỉ chính xác với chữ không dấu).",
  b => `${b.getFieldValue("CASE") === "LOWER" ? "ct_lower" : "ct_upper"}(${textCode(b, "TEXT")})`);

reporter("ct_text_to_number", "CHUYỂN %1 THÀNH SỐ", [txt("TEXT", "123")], "Number", COLOUR.text,
  "Đổi đoạn chữ thành số (không đọc được thì cho 0).", b => `ct_to_num(${textCode(b, "TEXT")})`);

statement("ct_serial_print", "IN RA SERIAL %1", [txt("TEXT", "xin chào")], COLOUR.text,
  "Gửi giá trị ra cổng Serial (xem trong Serial Monitor).", b => `Serial.println(${textCode(b, "TEXT")});\n`);

/* =====================================================
   BIẾN (khối chuẩn của Blockly, Việt hóa + sinh mã C++)
===================================================== */

function tweak(type, fn) {
  const def = Blockly.Blocks[type];
  if (!def?.init) return;
  const base = def.init;
  def.init = function () {
    base.call(this);
    fn.call(this);
  };
}
const shadowNumber = (block, input, value) =>
  block.getInput(input)?.connection?.setShadowDom(Blockly.utils.xml.textToDom(numberShadowXml(value)));

tweak("variables_get", function () { this.setColour(COLOUR.variable); });
tweak("variables_set", function () {
  this.setColour(COLOUR.variable);
  this.getInput("VALUE")?.setCheck(null);
  shadowNumber(this, "VALUE", 0);
  this.setInputsInline(true);
});
tweak("math_change", function () {
  this.setColour(COLOUR.variable);
  this.getInput("DELTA")?.setCheck(ANY_VALUE);
  shadowNumber(this, "DELTA", 1);
  this.setInputsInline(true);
});

/** Tên biến thân thiện -> định danh C++ (bỏ dấu tiếng Việt), không trùng nhau trong cùng chương trình. */
function ascii(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

export function varName(workspace, id) {
  const model = workspace.getVariableById(id);
  if (!model) return "v_bien";
  const isList = model.type === LIST_TYPE;
  const base = (isList ? "ds_" : "v_") + (ascii(model.name) || "x");
  const same = workspace.getAllVariables().filter(
    other => (other.type === LIST_TYPE) === isList && (isList ? "ds_" : "v_") + (ascii(other.name) || "x") === base
  );
  const index = same.findIndex(other => other.getId() === model.getId());
  return index <= 0 ? base : `${base}_${index + 1}`;
}

javascriptGenerator.forBlock["variables_get"] = block =>
  [varName(block.workspace, block.getFieldValue("VAR")), javascriptGenerator.ORDER_ATOMIC];

javascriptGenerator.forBlock["variables_set"] = block => {
  const id = block.getFieldValue("VAR");
  const type = programVariableTypes(block.workspace).get(id) || "Number";
  return `${varName(block.workspace, id)} = ${code(block, "VALUE", type === "String" ? 'String("")' : "0")};\n`;
};

javascriptGenerator.forBlock["math_change"] = block =>
  `${varName(block.workspace, block.getFieldValue("VAR"))} += ${code(block, "DELTA", "1")};\n`;

// Bộ sinh mã JavaScript của Blockly tự chèn dòng `var a, b;` vào đầu chương trình; ta khai báo biến
// bằng C++ riêng (buildProgramDeclarations) nên bỏ dòng đó.
{
  const baseInit = javascriptGenerator.init.bind(javascriptGenerator);
  javascriptGenerator.init = function (workspace) {
    baseInit(workspace);
    delete this.definitions_?.variables;
  };
}

/* ---------- Suy ra kiểu biến (C++ cần khai báo kiểu) ---------- */

const STRING_BLOCKS = new Set(["ct_text", "ct_join", "ct_text_char_at", "ct_text_case"]);
const BOOLEAN_BLOCKS = new Set(["ct_compare", "ct_boolean", "ct_logic", "ct_not", "ct_between", "ct_text_contains", "ct_list_contains"]);

function inferType(block, known) {
  if (!block) return "Number";
  if (STRING_BLOCKS.has(block.type)) return "String";
  if (BOOLEAN_BLOCKS.has(block.type)) return "Boolean";
  if (block.type === "variables_get") return known.get(block.getFieldValue("VAR")) || null;
  if (block.type === "ct_ternary") return inferType(block.getInputTargetBlock("A"), known);
  return "Number";
}

/** Map id biến -> "Number" | "String" | "Boolean" | "List" theo giá trị được gán trong chương trình. */
export function programVariableTypes(workspace) {
  const types = new Map();
  for (const model of workspace.getAllVariables()) if (model.type === LIST_TYPE) types.set(model.getId(), LIST_TYPE);
  const sets = workspace.getAllBlocks(false).filter(b => b.type === "variables_set");
  for (let pass = 0; pass < 3; pass++) {
    for (const block of sets) {
      const id = block.getFieldValue("VAR");
      if (types.has(id)) continue;
      const found = inferType(block.getInputTargetBlock("VALUE"), types);
      if (found) types.set(id, found);
    }
  }
  return types;
}

/** Khai báo biến/danh sách ở mức toàn cục (C++ và Python dùng chung một đoạn mã). */
export function buildProgramDeclarations(workspace) {
  const used = new Set();
  for (const block of workspace.getAllBlocks(false)) {
    for (const field of ["VAR", "LIST"]) {
      if (block.getField?.(field)) used.add(block.getFieldValue(field));
    }
  }
  if (!used.size) return "";
  const types = programVariableTypes(workspace);
  const lines = [];
  for (const model of workspace.getAllVariables()) {
    if (!used.has(model.getId())) continue;
    const name = varName(workspace, model.getId());
    const type = types.get(model.getId()) || "Number";
    if (type === LIST_TYPE) lines.push(`CTList ${name};`);
    else if (type === "String") lines.push(`String ${name} = String("");`);
    else if (type === "Boolean") lines.push(`bool ${name} = false;`);
    else lines.push(`float ${name} = 0;`);
  }
  return lines.length ? `// ===== Biến và danh sách =====\n${lines.join("\n")}\n` : "";
}

/* =====================================================
   DANH SÁCH (số thực, tối đa CT_LIST_MAX phần tử)
===================================================== */

const listField = { type: "field_variable", name: "LIST", variable: "danh sách", variableTypes: [LIST_TYPE], defaultType: LIST_TYPE };
const list = b => varName(b.workspace, b.getFieldValue("LIST"));

statement("ct_list_add", "THÊM %1 VÀO %2", [num("ITEM", 1), listField], COLOUR.list,
  "Thêm một giá trị vào cuối danh sách.", b => `ct_list_add(${list(b)}, ${code(b, "ITEM", "1")});\n`);
statement("ct_list_insert", "CHÈN %1 VÀO VỊ TRÍ %2 CỦA %3", [num("ITEM", 1), num("INDEX", 1), listField], COLOUR.list,
  "Chèn giá trị vào vị trí cho trước (đếm từ 1).", b => `ct_list_insert(${list(b)}, ${code(b, "INDEX", "1")}, ${code(b, "ITEM", "1")});\n`);
statement("ct_list_remove", "XÓA MỤC THỨ %1 CỦA %2", [num("INDEX", 1), listField], COLOUR.list,
  "Xóa một mục khỏi danh sách.", b => `ct_list_remove(${list(b)}, ${code(b, "INDEX", "1")});\n`);
statement("ct_list_set", "ĐẶT MỤC THỨ %1 CỦA %2 = %3", [num("INDEX", 1), listField, num("ITEM", 0)], COLOUR.list,
  "Thay giá trị của một mục.", b => `ct_list_set(${list(b)}, ${code(b, "INDEX", "1")}, ${code(b, "ITEM", "0")});\n`);
statement("ct_list_clear", "XÓA HẾT MỤC CỦA %1", [listField], COLOUR.list,
  "Làm trống danh sách.", b => `ct_list_clear(${list(b)});\n`);

reporter("ct_list_get", "MỤC THỨ %1 CỦA %2", [num("INDEX", 1), listField], "Number", COLOUR.list,
  "Giá trị của một mục (đếm từ 1; ngoài phạm vi cho 0).", b => `ct_list_get(${list(b)}, ${code(b, "INDEX", "1")})`);
reporter("ct_list_length", "ĐỘ DÀI DANH SÁCH %1", [listField], "Number", COLOUR.list,
  "Số mục đang có trong danh sách.", b => `ct_list_len(${list(b)})`);
reporter("ct_list_index", "VỊ TRÍ CỦA %1 TRONG %2", [num("ITEM", 1), listField], "Number", COLOUR.list,
  "Vị trí đầu tiên của giá trị (0 nếu không có).", b => `ct_list_index(${list(b)}, ${code(b, "ITEM", "1")})`);
reporter("ct_list_contains", "%1 CÓ CHỨA %2", [listField, num("ITEM", 1)], "Boolean", COLOUR.list,
  "Đúng khi danh sách có giá trị này.", b => `ct_list_contains(${list(b)}, ${code(b, "ITEM", "1")})`);

/* ---------- Thanh công cụ động: nút "Tạo danh sách" + các khối ---------- */

const LIST_FLYOUT_BLOCKS = [
  ["ct_list_add", { ITEM: 1 }], ["ct_list_insert", { ITEM: 1, INDEX: 1 }], ["ct_list_remove", { INDEX: 1 }],
  ["ct_list_set", { INDEX: 1, ITEM: 0 }], ["ct_list_clear", {}],
  ["ct_list_get", { INDEX: 1 }], ["ct_list_length", {}], ["ct_list_index", { ITEM: 1 }], ["ct_list_contains", { ITEM: 1 }],
];

export function listFlyoutItems(workspace) {
  const xml = Blockly.utils.xml;
  const items = [xml.textToDom('<button text="Tạo danh sách..." callbackKey="CT_CREATE_LIST"></button>')];
  const lists = workspace.getVariablesOfType(LIST_TYPE);
  if (!lists.length) return items;
  const model = lists[lists.length - 1];
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  for (const [type, inputs] of LIST_FLYOUT_BLOCKS) {
    const values = Object.entries(inputs).map(([name, v]) => `<value name="${name}">${numberShadowXml(v)}</value>`).join("");
    items.push(xml.textToDom(
      `<block type="${type}"><field name="LIST" id="${esc(model.getId())}" variabletype="${LIST_TYPE}">${esc(model.name)}</field>${values}</block>`
    ));
  }
  return items;
}

/** Hỏi tên rồi tạo danh sách mới (không dùng hộp thoại "Tạo biến" vì nó ghi "Tên biến mới"). */
export function createListWithPrompt(workspace) {
  Blockly.dialog.prompt("Tên danh sách mới:", "", name => {
    const clean = String(name ?? "").trim();
    if (!clean) return;
    const existing = workspace.getAllVariables().find(v => v.name.toLowerCase() === clean.toLowerCase());
    if (existing && existing.type !== LIST_TYPE) {
      Blockly.dialog.alert(`Tên "${clean}" đã được dùng cho một biến. Hãy chọn tên khác.`);
      return;
    }
    if (!existing) workspace.createVariable(clean, LIST_TYPE);
    workspace.refreshToolboxSelection?.();
  });
}

export function registerProgramToolbox(workspace) {
  workspace.registerButtonCallback("CT_CREATE_LIST", button => createListWithPrompt(button.getTargetWorkspace()));
  workspace.registerToolboxCategoryCallback("CT_LISTS", listFlyoutItems);
}
