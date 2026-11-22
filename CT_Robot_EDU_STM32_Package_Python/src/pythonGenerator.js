/*
 * Sinh mã Python (MicroPython) từ chương trình Blockly.
 *
 * Mọi khối (lõi, Bluetooth, khối của mạch mở rộng) đều sinh cùng một "từ vựng" lệnh
 * (robot.forward, gpioWrite, delay, ctExpMotorRun...). Vì vậy thay vì viết lại từng khối,
 * file này chuyển phần thân chương trình đã sinh (tập con C++ rất đều) sang Python và ghép
 * với runtime MicroPython tương ứng (pythonRuntime.js). Khối mới của extension tự chạy được
 * chừng nào nó dùng các hàm đã có trong runtime.
 *
 * File này KHÔNG import Blockly để test được bằng Node.
 */

import { getHardwareProfile, ROBOT_TYPES, BT_RX_PIN, BT_TX_PIN } from "./hardwareProfiles.js";
import { CTEXP_HARDWARE } from "./extensions/builtin/ctExpansionEsp32.js";
import {
  PY_CORE_RUNTIME,
  PY_BLUETOOTH_RUNTIME,
  PY_BLUETOOTH_ON,
  PY_BLUETOOTH_OFF,
  PY_CTEXP_I2C,
  PY_CTEXP_MOTOR,
  PY_CTEXP_SERVO,
  PY_CTEXP_PCF,
  PY_CTEXP_HUM,
  PY_HELPERS,
} from "./pythonRuntime.js";

export const PYTHON_PLACEHOLDER = "# Kéo các block vào vùng lập trình...";
const CT_EXPANSION_PROFILE_ID = "ct-expansion-esp32";
const MARK = /\/\*__CT_BLOCK_(START|END):(.+?)__\*\//g;
const INDENT = "    ";

/** Python (MicroPython) hiện chỉ có runtime cho họ ESP32. */
export function isPythonSupported(profile) {
  return profile?.platform === "esp32";
}

export function pythonUnsupportedMessage(profile) {
  return [
    "# Python (MicroPython) hiện hỗ trợ các board ESP32 / ESP32-S3.",
    `# Board "${profile?.board || profile?.name || "?"}" chưa có runtime Python.`,
    '# Hãy chuyển sang "Arduino C++" để xuất và nạp mã cho board này.',
  ].join("\n");
}

/* ---------- Chuỗi / biểu thức ---------- */

/** Chuỗi C (toCString: \\ \" \? và \ooo là byte UTF-8) -> literal Python. */
function cStringToPython(literal) {
  const body = literal.slice(1, -1);
  const enc = new TextEncoder();
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") {
      bytes.push(...enc.encode(ch));
      continue;
    }
    const next = body[++i];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] || "")) oct += body[++i];
      bytes.push(parseInt(oct, 8) & 255);
    } else if (next === "n") bytes.push(10);
    else if (next === "r") bytes.push(13);
    else if (next === "t") bytes.push(9);
    else if (next === "b") bytes.push(8);
    else if (next === "f") bytes.push(12);
    else if (next === "v") bytes.push(11);
    else if (next === "a") bytes.push(7);
    else if (next === "x" && /^[0-9a-fA-F]{1,2}/.test(body.slice(i + 1))) {
      const hex = body.slice(i + 1).match(/^[0-9a-fA-F]{1,2}/)[0];
      bytes.push(parseInt(hex, 16));
      i += hex.length;
    } else if (next === "u" && /^[0-9a-fA-F]{4}/.test(body.slice(i + 1))) {
      const hex = body.slice(i + 1, i + 5); // \uXXXX do JSON.stringify sinh ra
      bytes.push(...enc.encode(String.fromCharCode(parseInt(hex, 16))));
      i += 4;
    } else bytes.push(...enc.encode(next)); // \\  \"  \?  \'
  }
  return JSON.stringify(new TextDecoder("utf-8").decode(Uint8Array.from(bytes)));
}

/** Biểu thức / câu lệnh C++ do các generator sinh -> Python. */
export function transpileExpression(source) {
  const strings = [];
  let s = String(source).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, literal => {
    const py = cStringToPython(literal);
    strings.push(literal.startsWith("'") ? `ord(${py})` : py); // 'F' (ký tự) -> ord("F")
    return `\u0000${strings.length - 1}\u0000`;
  });

  s = s
    .replace(/&&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/!(?!=)/g, " not ")
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bString\(/g, "str(") // String("..") của Arduino -> str(..)
    .replace(/\bmap\(/g, "ct_map(") // tránh đè hàm map() có sẵn của Python
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .trim();

  s = rewriteGroups(rewriteCasts(s));

  return s.replace(/\u0000(\d+)\u0000/g, (_, index) => strings[Number(index)]);
}

/* ---------- Ép kiểu, toán tử 3 ngôi, phép chia ---------- */

const CAST_PATTERN =
  /\((?:unsigned\s+)?(int|long|short|byte|char|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t|float|double|bool|boolean)\)\s*/;

function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** (int)x, (float)(a + b) -> int(x), float(a + b) */
function rewriteCasts(text) {
  let s = text;
  for (let guard = 0; guard < 50; guard++) {
    const m = CAST_PATTERN.exec(s);
    if (!m) break;
    const start = m.index + m[0].length;
    let end = start;
    if (s[start] === "(") {
      end = matchParen(s, start) + 1;
      if (end <= start) break;
    } else {
      const word = /[-+]?[A-Za-z_0-9.]+/y;
      word.lastIndex = start;
      const w = word.exec(s);
      if (!w) break;
      end = start + w[0].length;
      while (s[end] === "(") {
        const close = matchParen(s, end);
        if (close < 0) break;
        end = close + 1;
      }
    }
    const type = /^(float|double)$/.test(m[1]) ? "float" : /^bool/.test(m[1]) ? "bool" : "int";
    s = `${s.slice(0, m.index)}${type}(${s.slice(start, end)})${s.slice(end)}`;
  }
  return s;
}

const ASSIGNMENT = /^(\s*[\w.\[\]]+\s*)(<<=|>>=|\+=|-=|\*=|\/=|%=|\|=|&=|\^=|=)(?!=)([\s\S]*)$/;
const PLACEHOLDER = /\u0002(\d+)\u0002/g;
// "Nguyên tử" của phép chia: tên/số, có thể kèm lời gọi hàm (đã thay bằng \u0002k\u0002) hoặc là một cặp ngoặc.
const ATOM = String.raw`(?:[A-Za-z_][\w.]*|\d[\w.]*)?(?:\u0002\d+\u0002)+|[A-Za-z_][\w.]*|\d[\w.]*`;
const LEFT_ATOM = new RegExp(`(${ATOM})$`);
const RIGHT_ATOM = new RegExp(`^(-?\\s*(?:${ATOM}))`);

/** `a / b` -> `ct_div(a, b)`: chia cho 0 trả về 0 thay vì làm sập chương trình trên robot. */
function guardDivisions(expression, parts) {
  let s = expression;
  for (let guard = 0; guard < 100; guard++) {
    const at = s.search(/\/(?!\/)/);
    if (at < 0) break;
    const before = s.slice(0, at).replace(/\s+$/, "");
    const after = s.slice(at + 1).replace(/^\s+/, "");
    const left = LEFT_ATOM.exec(before);
    const right = RIGHT_ATOM.exec(after);
    if (!left || !right) break; // dạng lạ: giữ nguyên phép chia của Python
    parts.push(`ct_div(${left[1]}, ${right[1].replace(/\s+/g, "")})`);
    s = `${before.slice(0, before.length - left[1].length)}\u0002${parts.length - 1}\u0002${after.slice(right[1].length)}`;
  }
  return s;
}

/** `a ? b : c` -> `(b if a else c)`, rồi bảo vệ phép chia. */
function rewriteExpression(expression, parts) {
  const expr = expression.trim();
  const q = expr.indexOf("?");
  const colon = q >= 0 ? expr.indexOf(":", q) : -1;
  if (q > 0 && colon > q) {
    const cond = rewriteExpression(expr.slice(0, q), parts);
    const yes = rewriteExpression(expr.slice(q + 1, colon), parts);
    const no = rewriteExpression(expr.slice(colon + 1), parts);
    return `(${yes} if ${cond} else ${no})`;
  }
  return guardDivisions(expr, parts);
}

function rewriteSegment(segment, parts) {
  const assign = ASSIGNMENT.exec(segment);
  if (assign) {
    const lhs = assign[1].trim();
    const op = assign[2];
    const rhs = rewriteExpression(assign[3], parts);
    return op === "/=" ? `${lhs} = ${guardDivisions(`${lhs} / ${rhs}`, parts)}` : `${lhs} ${op} ${rhs}`;
  }
  return rewriteExpression(segment, parts);
}

/** Xử lý từng cặp ngoặc từ trong ra ngoài; mỗi đối số (cách nhau bằng dấu phẩy) xử lý riêng. */
function rewriteGroups(text) {
  if (!/[/?]/.test(text)) return text;
  const parts = [];
  let flat = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") {
      const close = matchParen(text, i);
      if (close < 0) return text; // ngoặc không cân: giữ nguyên
      const inner = rewriteGroups(text.slice(i + 1, close));
      const isTernary = /^\(.* if .* else .*\)$/.test(inner) && matchParen(inner, 0) === inner.length - 1;
      parts.push(isTernary ? inner : `(${inner})`);
      flat += `\u0002${parts.length - 1}\u0002`;
      i = close;
    } else {
      flat += text[i];
    }
  }
  let result = flat
    .split(",")
    .map(segment => rewriteSegment(segment, parts))
    .join(", ");
  for (let guard = 0; guard < 20 && PLACEHOLDER.test(result); guard++) {
    PLACEHOLDER.lastIndex = 0;
    result = result.replace(PLACEHOLDER, (_, index) => parts[Number(index)]);
  }
  PLACEHOLDER.lastIndex = 0;
  return result;
}

/** Còn sót cú pháp C++ thì không thể là Python hợp lệ. (`int(x)`, `float(x)` là phép ép kiểu đã chuyển, hợp lệ.) */
const LEFTOVER_CPP =
  /[{};]|\b(?:int|float|double|void|const|unsigned|long|bool|char)\b(?!\s*\()|\+\+|--/;

const TYPE_NAMES =
  "(?:CTList|unsigned\\s+(?:long|int|char)|long\\s+long|long|int|float|double|bool|boolean|byte|char|short|String|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t)";
const DECLARATION = new RegExp(`^(?:(?:static|const|volatile|extern)\\s+)*(${TYPE_NAMES})\\s+([\\s\\S]+)$`);
const FUNCTION_HEADER = new RegExp(
  `^(?:void|${TYPE_NAMES})\\s+(\\w+)\\s*\\(([^()]*)\\)\\s*\\{$`
);
const FOR_HEADER = new RegExp(
  `^for\\s*\\((?:${TYPE_NAMES}\\s+)?(\\w+)\\s*=\\s*(.+?);\\s*\\1\\s*(<=|<|>=|>)\\s*(.+?);\\s*` +
    `(?:\\1(\\+\\+|--)|(\\+\\+|--)\\1|\\1\\s*(\\+=|-=)\\s*(.+?))\\)\\s*\\{$`
);

function defaultValueFor(type) {
  if (type === "CTList") return "[]";
  if (/^String$/.test(type)) return '""';
  if (/^bool/.test(type)) return "False";
  if (/^(float|double)$/.test(type)) return "0.0";
  return "0";
}

/** Tách `a = 1, b = f(2, 3)` theo dấu phẩy ở cấp ngoài cùng (bỏ qua trong ngoặc và chuỗi). */
function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === "\\") current += text[++i] ?? "";
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else {
      if ("([{".includes(ch)) depth += 1;
      else if (")]}".includes(ch)) depth -= 1;
      if (ch === "," && depth === 0) {
        out.push(current);
        current = "";
      } else current += ch;
    }
  }
  out.push(current);
  return out;
}

const rangeBound = value => (/^-?\d+$/.test(value) ? value : `int(${value})`);

/* ---------- C++ -> các dòng Python (kèm id khối để tô sáng) ---------- */

/**
 * @param {string} markedSource  C++ còn marker khối (xem codeSourceMap.js)
 * @param {number} baseIndent    mức thụt lề ban đầu (số cấp). 0 = mức module, >0 = bên trong một hàm.
 * @param {object} [context]     trạng thái dùng chung giữa các lần gọi:
 *                               `globals` (Set tên biến toàn cục đã khai báo ở mức module) và
 *                               `globalsUsed` (Set biến toàn cục bị gán trong thân hàm gốc, để thêm `global`).
 * @returns {{ text: string, ids: string[] }[]}
 */
export function cppToPython(markedSource, baseIndent = 0, context = {}) {
  const lines = [];
  const open = []; // id các khối đang mở (đi qua nhiều dòng)
  const bodyHasStatement = []; // mỗi khối { đã có lệnh nào chưa -> cần "pass" nếu rỗng
  const kinds = []; // loại từng khối đang mở: "def" | "if" | "else" | "loop" | "do"
  const globals = (context.globals ||= new Set());
  const globalsUsed = (context.globalsUsed ||= new Set());
  // Phạm vi biến: khung ngoài cùng là thân hàm gốc khi baseIndent > 0, ngược lại là mức module.
  const frames = [{ module: baseIndent === 0, locals: new Set(), used: globalsUsed, header: -1 }];
  let depth = baseIndent;

  const frame = () => frames[frames.length - 1];
  const emit = (text, ids) =>
    lines.push({ text: text ? INDENT.repeat(depth) + text : "", ids: [...ids] });
  const markParent = () => {
    if (bodyHasStatement.length) bodyHasStatement[bodyHasStatement.length - 1] = true;
  };
  const openBlock = (header, ids, kind = "if") => {
    markParent();
    emit(header, ids);
    bodyHasStatement.push(false);
    kinds.push(kind);
    depth += 1;
  };
  const closeBlock = ids => {
    if (!bodyHasStatement.length) return;
    if (!bodyHasStatement.pop()) emit("pass", ids);
    depth -= 1;
    if (kinds.pop() === "def") {
      const done = frames.pop();
      if (done.used.size) {
        lines.splice(done.header + 1, 0, {
          text: `${INDENT.repeat(depth + 1)}global ${[...done.used].join(", ")}`,
          ids: [],
        });
      }
    }
  };
  const unsupported = (line, ids) => {
    markParent();
    emit(`# CHƯA CHUYỂN ĐƯỢC SANG PYTHON: ${line}`, ids);
  };
  const expr = raw => {
    const out = transpileExpression(raw);
    return LEFTOVER_CPP.test(out.replace(/"(?:[^"\\]|\\.)*"/g, '""')) ? null : out;
  };
  /** Gán vào biến toàn cục từ trong hàm thì Python cần khai báo `global`. */
  const noteAssignment = name => {
    const f = frame();
    if (!f.module && globals.has(name) && !f.locals.has(name)) f.used.add(name);
  };
  const emitStatement = (statement, ids) => {
    const target = statement.match(/^([A-Za-z_]\w*)\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)/);
    if (target) noteAssignment(target[1]);
    markParent();
    emit(statement, ids);
  };

  /** Một câu lệnh kết thúc bằng `;` (đã bỏ dấu `;`). Trả về false nếu không chuyển được. */
  const simpleStatement = (text, ids) => {
    let m;
    if (/^(?:break|continue)$/.test(text)) {
      markParent();
      emit(text, ids);
      return true;
    }
    if ((m = text.match(/^return(?:\s+(.+))?$/))) {
      const value = m[1] == null ? "" : expr(m[1]);
      if (value == null) return false;
      markParent();
      emit(value ? `return ${value}` : "return", ids);
      return true;
    }
    if ((m = text.match(/^(?:(\w+)(\+\+|--)|(\+\+|--)(\w+))$/))) {
      const name = m[1] || m[4];
      noteAssignment(name);
      markParent();
      emit(`${name} ${(m[2] || m[3]) === "++" ? "+=" : "-="} 1`, ids);
      return true;
    }
    if ((m = text.match(DECLARATION))) {
      const type = m[1];
      const parts = splitTopLevel(m[2]);
      const assignments = [];
      for (const part of parts) {
        const d = part.trim().match(/^(\w+)\s*(?:=\s*([\s\S]+))?$/);
        if (!d) return false; // mảng, con trỏ...
        const value = d[2] == null ? defaultValueFor(type) : expr(d[2]);
        if (value == null) return false;
        assignments.push([d[1], value]);
      }
      for (const [name, value] of assignments) {
        if (frame().module) globals.add(name);
        else frame().locals.add(name);
        markParent();
        emit(`${name} = ${value}`, ids);
      }
      return true;
    }
    const statement = expr(text);
    if (statement == null) return false;
    emitStatement(statement, ids);
    return true;
  };

  for (const rawLine of String(markedSource ?? "").split("\n")) {
    const ids = new Set(open);
    const line = rawLine
      .replace(MARK, (_, edge, id) => {
        if (edge === "START") open.push(id);
        else {
          const at = open.lastIndexOf(id);
          if (at >= 0) open.splice(at, 1);
        }
        ids.add(id);
        return "";
      })
      .trim();

    if (!line) {
      lines.push({ text: "", ids: [] });
      continue;
    }
    if (line.startsWith("//")) {
      emit(`#${line.slice(2)}`, ids);
      continue;
    }

    let m;
    if (/^(?:void|int|long|float|double|bool|boolean|byte|char|String)\s+\w+\s*\([^()]*\)\s*;$/.test(line)) continue; // prototype hàm
    if (line === "}") {
      closeBlock(ids);
    } else if ((m = line.match(/^\}\s*else\s+if\s*\((.*)\)\s*\{$/))) {
      const cond = expr(m[1]);
      closeBlock(ids);
      if (cond == null) unsupported(line, ids);
      else openBlock(`elif ${cond}:`, ids);
    } else if (/^\}\s*else\s*\{$/.test(line)) {
      closeBlock(ids);
      openBlock("else:", ids, "else");
    } else if ((m = line.match(/^\}\s*while\s*\((.*)\)\s*;$/))) {
      // kết thúc do { ... } while (cond);  ->  if not (cond): break  (cuối thân vòng lặp)
      const cond = expr(m[1]);
      if (cond == null || kinds[kinds.length - 1] !== "do") {
        unsupported(line, ids);
      } else {
        markParent();
        emit(`if not (${cond}):`, ids);
        depth += 1;
        emit("break", ids);
        depth -= 1;
        closeBlock(ids);
      }
    } else if ((m = line.match(/^if\s*\((.*)\)\s*\{$/))) {
      const cond = expr(m[1]);
      cond == null ? unsupported(line, ids) : openBlock(`if ${cond}:`, ids);
    } else if ((m = line.match(/^while\s*\((.*)\)\s*\{$/))) {
      const cond = expr(m[1]);
      cond == null ? unsupported(line, ids) : openBlock(`while ${cond}:`, ids, "loop");
    } else if (/^do\s*\{$/.test(line)) {
      openBlock("while True:", ids, "do");
    } else if ((m = line.match(FOR_HEADER))) {
      const [, variable, startRaw, op, limitRaw, postfix, prefix, compound, stepRaw] = m;
      const start = expr(startRaw);
      const limit = expr(limitRaw);
      const step = compound ? expr(stepRaw) : "1";
      const direction = (postfix || prefix || compound)[0] === "-" ? -1 : 1;
      const countsUp = op === "<" || op === "<=";
      if (start == null || limit == null || step == null || countsUp !== (direction === 1) || !/^\d+$/.test(step)) {
        unsupported(line, ids);
      } else if (variable === "i" && start === "0" && op === "<" && step === "1" && direction === 1) {
        // Dạng khối LẶP (for (int i = 0; i < N; i++)): chỉ cần đếm số lần.
        openBlock(`for _ in range(${/^\d+$/.test(limit) ? limit : `int(${limit})`}):`, ids, "loop");
      } else {
        let stop = rangeBound(limit);
        if (op === "<=") stop = /^-?\d+$/.test(stop) ? String(Number(stop) + 1) : `${stop} + 1`;
        else if (op === ">=") stop = /^-?\d+$/.test(stop) ? String(Number(stop) - 1) : `${stop} - 1`;
        const stepPart = step === "1" && direction === 1 ? "" : `, ${direction * Number(step)}`;
        frame().locals.add(variable);
        openBlock(`for ${variable} in range(${rangeBound(start)}, ${stop}${stepPart}):`, ids, "loop");
      }
    } else if ((m = line.match(FUNCTION_HEADER))) {
      const params = m[2]
        .split(",")
        .map(p => p.trim())
        .filter(p => p && p !== "void")
        .map(p => p.replace(/\s*=.*$/, "").match(/(\w+)$/)?.[1]);
      if (params.includes(undefined)) {
        unsupported(line, ids);
      } else {
        const header = lines.length;
        openBlock(`def ${m[1]}(${params.join(", ")}):`, ids, "def");
        frames.push({ module: false, locals: new Set(params), used: new Set(), header });
      }
    } else if ((m = line.match(/^(.*);$/))) {
      if (!simpleStatement(m[1].trim(), ids)) unsupported(line, ids);
    } else {
      unsupported(line, ids);
    }
  }

  while (bodyHasStatement.length) closeBlock([]); // mã dở dang: đóng nốt cho Python hợp lệ
  return lines;
}

/* ---------- Ghép chương trình ---------- */

const pyPin = value =>
  value === undefined || value === null || (typeof value === "number" && value < 0) ? "None" : String(value);
const pyBool = value => (value ? "True" : "False");
const stripMarkers = text => String(text ?? "").replace(MARK, "");

function hardwareConfigSection(config, profile, isExpansion) {
  const p = config.pins;
  const s = config.sensors;
  const m = config.motor;
  const bt = profile.bluetoothPins || {};
  const lines = [
    "# ===== Cấu hình phần cứng =====",
    "# Chân GPIO (đánh số theo GPIO của ESP32). None = board không có chân này.",
    `LEFT_IN1 = ${pyPin(p.leftIn1)}`,
    `LEFT_IN2 = ${pyPin(p.leftIn2)}`,
    `LEFT_EN = ${pyPin(p.leftEn)}`,
    `RIGHT_IN1 = ${pyPin(p.rightIn1)}`,
    `RIGHT_IN2 = ${pyPin(p.rightIn2)}`,
    `RIGHT_EN = ${pyPin(p.rightEn)}`,
    `TRIG_PIN = ${pyPin(s.trig)}`,
    `ECHO_PIN = ${pyPin(s.echo)}`,
    `LINE_LEFT_PIN = ${pyPin(s.lineLeft)}`,
    `LINE_RIGHT_PIN = ${pyPin(s.lineRight)}`,
    `LED_PIN = ${pyPin(s.led)}`,
    `BUZZER_PIN = ${pyPin(s.buzzer)}`,
    `SERVO_PIN = ${pyPin(s.servo)}`,
    `BT_RX_PIN = ${pyPin(bt.rx ?? BT_RX_PIN)}`,
    `BT_TX_PIN = ${pyPin(bt.tx ?? BT_TX_PIN)}`,
    "",
    `MOTOR_PWM_FREQUENCY = ${m.pwmFrequency}`,
    `INVERT_LEFT_MOTOR = ${pyBool(m.invertLeft)}`,
    `INVERT_RIGHT_MOTOR = ${pyBool(m.invertRight)}`,
    `TURN_MS_PER_DEGREE = ${m.turnMsPerDegree}`,
    `LEFT_SCALE = ${m.leftScale}`,
    `RIGHT_SCALE = ${m.rightScale}`,
  ];

  if (isExpansion) {
    const { I2C, PCF_TRIG_BIT } = CTEXP_HARDWARE;
    lines.push(
      "",
      `CTEXP_SDA = ${I2C.sda}`,
      `CTEXP_SCL = ${I2C.scl}`,
      `CTEXP_PCA9685_ADDR = 0x${I2C.pca9685.toString(16)}`,
      `PCF_TRIG_BIT = ${PCF_TRIG_BIT}`
    );
  }
  return lines.join("\n") + "\n";
}

function motorsTable() {
  const rows = CTEXP_HARDWARE.MOTORS.map(
    mt => `    (${mt.in1}, ${mt.in2}, ${mt.pwm ?? "None"}),  # M${mt.id}`
  );
  return `(\n${rows.join("\n")}\n)`;
}

/**
 * Xây chương trình MicroPython hoàn chỉnh.
 * @param config          hardwareConfig của ứng dụng
 * @param markedMain      `main` từ generateProgram (còn marker)
 * @param markedFunctions `functions` từ generateProgram (còn marker)
 * @returns {{ code: string, blockRanges: Record<string, {start:number,end:number}[]> }}
 */
export function buildPythonOutput(config, markedMain, markedFunctions = "") {
  const profile = getHardwareProfile(config.profileId);
  if (!markedMain && !markedFunctions) return { code: PYTHON_PLACEHOLDER, blockRanges: {} };
  if (!isPythonSupported(profile)) {
    return { code: pythonUnsupportedMessage(profile), blockRanges: {} };
  }

  const isExpansion = profile.id === CT_EXPANSION_PROFILE_ID;
  const clean = stripMarkers(`${markedMain}\n${markedFunctions}`);
  const out = []; // { text, ids }
  const add = (text, ids = []) => String(text).split("\n").forEach(t => out.push({ text: t, ids }));

  add(
    [
      "# CT ROBOT EDU - MicroPython",
      `# Robot: ${config.robotType === ROBOT_TYPES.FOUR_WHEEL ? "4 bánh" : "2 bánh"}`,
      `# Board: ${profile.board}`,
      `# MCU: ${profile.mcu}`,
      `# Hardware Profile: ${config.profileId}`,
      "# Cách dùng: nạp firmware MicroPython cho board, lưu file này thành main.py (Thonny / mpremote), rồi reset.",
      "",
    ].join("\n")
  );
  add(hardwareConfigSection(config, profile, isExpansion));
  add(PY_CORE_RUNTIME);

  // Dịch thân chương trình trước để biết cần chèn hàm phụ trợ nào (ct_div, millis, random, Serial...).
  // `context` giữ biến toàn cục: khai báo ở mức module, gán trong hàm thì tự thêm `global`.
  const context = { globals: new Set(), globalsUsed: new Set() };
  const eventLines = cppToPython(markedFunctions, 0, context);
  const mainLines = cppToPython(markedMain, 1, context);
  const bodyText = [...eventLines, ...mainLines].map(l => l.text).join("\n");
  for (const helper of PY_HELPERS) {
    if (helper.use.test(bodyText)) add(helper.code);
  }

  // Bluetooth: chỉ khởi tạo UART khi chương trình có dùng, để không chiếm chân vô ích.
  if (/\bBT_SERIAL\b/.test(clean)) {
    add(PY_BLUETOOTH_RUNTIME);
    add(isExpansion ? PY_BLUETOOTH_OFF : PY_BLUETOOTH_ON);
  }

  // Mạch mở rộng CT: chỉ chèn phần mà chương trình dùng tới (giống `usedWhen` của bản C++).
  const startup = [];
  if (isExpansion) {
    const usesMotor = /\bctExpMotor/.test(clean);
    const usesServo = /\bctExpServo|\brobot\.servo\s*\(/.test(clean);
    const usesPcf = /\bctExpPcf|\bctExpDistanceCm|\brobot\.distance\s*\(/.test(clean);
    const usesHum = /\bctExpHumidity|\bctExpTemperature/.test(clean);
    if (usesMotor || usesServo || usesPcf || usesHum) add(PY_CTEXP_I2C);
    if (usesMotor) {
      add(PY_CTEXP_MOTOR.replace("MOTORS_TABLE", motorsTable()));
      startup.push("ctExpMotorBegin()");
    }
    if (usesServo) {
      add(PY_CTEXP_SERVO);
      startup.push("ctExpServoBegin()");
    }
    if (usesPcf) {
      add(PY_CTEXP_PCF);
      startup.push("ctExpPcfBegin()");
    }
    if (usesHum) {
      add(PY_CTEXP_HUM);
      startup.push("ctExpHumBegin()");
    }
  }

  if (eventLines.some(l => l.text)) {
    add("\n# ===== Biến, danh sách và sự kiện (KHI NHẬN / PHÁT) =====");
    out.push(...eventLines);
    add("");
  }

  add("\n# ===== Chương trình từ Blockly =====");
  add("def chuong_trinh():");
  if (context.globalsUsed.size) add(`${INDENT}global ${[...context.globalsUsed].join(", ")}`);
  out.push(...mainLines);
  // Thân hàm chỉ có dòng ghi chú (hoặc rỗng) vẫn cần ít nhất một câu lệnh để là Python hợp lệ.
  if (!mainLines.some(l => l.text && !l.text.trim().startsWith("#"))) add(`${INDENT}pass`);

  add(
    [
      "",
      "",
      "robot.begin()",
      ...startup,
      "try:",
      `${INDENT}chuong_trinh()`,
      "except KeyboardInterrupt:",
      `${INDENT}robot.stop()`,
      "",
    ].join("\n")
  );

  // Gộp lại thành code + ánh xạ khối -> khoảng ký tự (cùng định dạng với stripBlockCodeMarkers).
  const blockRanges = {};
  let offset = 0;
  const code = out
    .map(({ text, ids }) => {
      if (text.trim()) {
        for (const id of ids) (blockRanges[id] ||= []).push({ start: offset, end: offset + text.length });
      }
      offset += text.length + 1;
      return text;
    })
    .join("\n");

  return { code, blockRanges };
}
