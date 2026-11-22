/* =====================================================
   KIỂM TRA LỖI CHƯƠNG TRÌNH (luật tĩnh, chạy cục bộ)
   lint(tree, ctx) -> [{ level, rule, blockId, msg, hint, fix? }]
   ctx (tuỳ chọn):
     platform       "esp32" | "avr" | "stm32"
     isUnavailable  (type) => boolean   khối không dùng được với phần cứng
     reserved       Map<gpio, vai trò>  chân cố định của PCB CT Expansion
     blockedPins    Map<gpio, vai trò>  chân không được dùng (flash/PSRAM)
     specialWarnings Map<gpio, vai trò> chân có chức năng đặc biệt
     inputOnlyPins  Set<gpio>           chân chỉ đọc
     boardName      tên board để đưa vào thông báo
===================================================== */
import { getInfo } from "./knowledge.js";
import { walk } from "./tree.js";

const HATS = new Set(["ct_when_started", "ct_key_up", "ct_key_down", "ct_key_left", "ct_key_right", "ct_on_receive"]);
const label = type => getInfo(type)?.label || type;

const SPEED = [-100, 100, "tốc độ", "%"];
const ANGLE = [0, 180, "góc servo", "°"];
export const RANGES = {
  ct_motor_left: { SPEED },
  ct_motor_right: { SPEED },
  ct_servo: { ANGLE },
  ctexp_servo: { ANGLE },
  ct_wait: { SECONDS: [0, 60, "thời gian chờ", " giây"] },
  ct_buzzer: { FREQ: [50, 10000, "tần số còi", " Hz"] },
  ct_repeat: { TIMES: [1, 1000, "số lần lặp", ""] },
  ct_gpio_pwm: { VALUE: [0, 100, "độ rộng xung PWM", "%"] },
  ctexp_motor_run: { SPEED },
  ctexp_pcf_write: { PIN: [1, 7, "chân PCF8574 (P0 dành cho TRIG của HC-SR04)", ""] },
  ctexp_pcf_read: { PIN: [1, 7, "chân PCF8574 (P0 dành cho TRIG của HC-SR04)", ""] },
};
for (const t of ["ct_forward", "ct_backward", "ct_turn_left", "ct_turn_right"]) {
  RANGES[t] = { SPEED, SECONDS: [0, 600, "thời gian", " giây"] };
}
for (const t of ["ct_forward_continuous", "ct_backward_continuous", "ct_turn_left_continuous", "ct_turn_right_continuous"]) {
  RANGES[t] = { SPEED };
}
for (const t of ["ct_turn_left_angle", "ct_turn_right_angle"]) {
  RANGES[t] = { SPEED, DEGREES: [0, 360, "góc quay", "°"] };
}
// Khối di chuyển của mạch mở rộng CT dùng cùng giới hạn với khối core.
for (const t of ["forward", "backward", "turn_left", "turn_right"]) {
  RANGES[`ctexp_${t}`] = { SPEED, SECONDS: [0, 600, "thời gian", " giây"] };
  RANGES[`ctexp_${t}_continuous`] = { SPEED };
}
for (const t of ["ctexp_turn_left_angle", "ctexp_turn_right_angle"]) {
  RANGES[t] = { SPEED, DEGREES: [0, 360, "góc quay", "°"] };
}

// Khối của các mạch STM32 (BLUE PILL / BLACK PILL / NUCLEO) dùng cùng giới hạn với khối core.

const GPIO_WRITE = new Set(["ct_gpio_write", "ct_gpio_pwm", "ct_digital_write", "ct_analog_write"]);
const GPIO_ANY = new Set([...GPIO_WRITE, "ct_gpio_read", "ct_digital_read", "ct_analog_read", "ct_pin_mode"]);

// Số cố định của khối (từ ô nhập hoặc khối số gắn vào) + vị trí để sửa nhanh.
function numRef(node, name) {
  if (name in node.fields) {
    const n = Number(node.fields[name]);
    return Number.isFinite(n) ? { n, id: node.id, field: name } : null;
  }
  const target = node.values[name];
  if (!target) return null;
  if (target.type !== "math_number") return null;
  const field = "NUM";
  const n = Number(target.fields[field]);
  return Number.isFinite(n) ? { n, id: target.id, field } : null;
}

const COMPARE = {
  GT: (a, b) => a > b, LT: (a, b) => a < b, EQ: (a, b) => a === b,
  GTE: (a, b) => a >= b, LTE: (a, b) => a <= b, NEQ: (a, b) => a !== b,
};
const eventKey = node => String(node.fields.NAME ?? "").trim().toLowerCase();

export function lint(tree, ctx = {}) {
  const out = [];
  const add = (level, node, rule, msg, hint, fix) =>
    out.push({ level, rule, blockId: node?.id ?? null, msg, hint, fix });

  const { roots } = tree;
  if (!roots.length) return out;

  const all = [];
  walk(roots, n => all.push(n));
  const hats = all.filter(n => HATS.has(n.type));

  /* --- Cấu trúc --- */
  if (!hats.length) {
    add("error", roots[0], "no-hat",
      "Chương trình chưa có khối sự kiện nên sẽ không chạy.",
      "Thêm khối KHI BẮT ĐẦU và kéo các khối của bạn vào bên dưới nó.");
  } else {
    for (const head of roots) {
      if (HATS.has(head.type)) continue;
      add("warn", head, "orphan",
        head.isValue
          ? "Khối này đứng riêng, không gắn vào đâu nên không có tác dụng."
          : "Nhóm khối này không nằm dưới khối sự kiện nên sẽ không chạy.",
        head.isValue
          ? "Kéo nó vào một ô trống của khối khác (ví dụ ô điều kiện của khối NẾU)."
          : "Kéo cả nhóm vào bên dưới KHI BẮT ĐẦU (hoặc một khối sự kiện khác).");
    }
  }

  const starts = all.filter(n => n.type === "ct_when_started");
  if (starts.length > 1) {
    add("info", starts[1], "dup-start",
      `Có ${starts.length} khối KHI BẮT ĐẦU. Thứ tự chạy giữa chúng có thể gây khó hiểu.`,
      "Gộp các khối vào một KHI BẮT ĐẦU, hoặc dùng PHÁT SỰ KIỆN để chia việc rõ ràng.");
  }

  /* --- Từng khối --- */
  const hasAncestorForever = node => {
    for (let p = node.parent; p; p = p.parent) if (p.type === "ct_forever") return true;
    return false;
  };

  for (const node of all) {
    const name = label(node.type);

    if (ctx.isUnavailable?.(node.type) && !node.isShadow) {
      add("error", node, "unavailable",
        `Khối "${name}" không dùng được với phần cứng đang chọn${ctx.boardName ? ` (${ctx.boardName})` : ""}.`,
        "Xoá khối này, hoặc đổi sang board có hỗ trợ.");
    }

    if (node.type === "ct_forever") {
      if (!node.stmts.DO) add("warn", node, "empty-forever", "Khối LẶP MÃI đang trống, chưa làm gì cả.", "Kéo các lệnh cần lặp lại vào trong khối.");
      if (node.next) add("warn", node, "after-forever", "Các khối đặt dưới LẶP MÃI sẽ không bao giờ chạy tới.", "Chuyển chúng lên trên LẶP MÃI, hoặc vào bên trong nó.");
      if (hasAncestorForever(node)) add("warn", node, "nested-forever", "LẶP MÃI nằm trong một LẶP MÃI khác: vòng lặp bên trong sẽ chặn vòng bên ngoài.", "Chỉ giữ một LẶP MÃI, đặt các lệnh vào cùng vòng đó.");
    } else if (node.stmtNames.length && node.stmtNames.every(s => !node.stmts[s]) && !HATS.has(node.type)) {
      add("info", node, "empty-body", `Khối "${name}" chưa có khối nào bên trong.`, "Kéo lệnh vào trong khối hoặc xoá khối nếu không cần.");
    } else if (HATS.has(node.type) && !node.stmts.DO) {
      add("info", node, "empty-hat", `Khối "${name}" chưa có lệnh nào bên dưới.`, "Kéo các lệnh vào trong khối.");
    }

    // Ô giá trị còn trống (khối rỗng thì mã sinh ra dùng giá trị 0).
    if (!node.isShadow) {
      const empty = node.valueNames.filter(n => !node.values[n]);
      if (empty.length) {
        const isCondition = node.type.startsWith("controls_if") && empty.includes("IF0");
        add(isCondition ? "error" : "warn", node, "empty-input",
          isCondition ? "Khối NẾU chưa có điều kiện." : `Khối "${name}" còn ô chưa gắn giá trị.`,
          isCondition ? "Gắn một khối điều kiện (ví dụ khối SO SÁNH) vào ô sau chữ NẾU." : "Gắn một số hoặc một khối cho giá trị vào ô trống, nếu không robot sẽ dùng 0.");
      }
    }

    // Giá trị ngoài khoảng cho phép.
    for (const [input, [min, max, what, unit]] of Object.entries(RANGES[node.type] || {})) {
      const ref = numRef(node, input);
      if (!ref || (ref.n >= min && ref.n <= max)) continue;
      const fixed = Math.min(max, Math.max(min, ref.n));
      add("error", node, "range",
        `${name}: ${what} ${ref.n}${unit} nằm ngoài khoảng ${min}–${max}${unit}.`,
        `Đổi lại thành ${fixed}${unit}.`,
        { kind: "setNumber", blockId: ref.id, field: ref.field, value: fixed, label: `Đổi thành ${fixed}` });
    }

    if (node.type === "ct_math_operation" && node.fields.OP === "DIV") {
      const b = numRef(node, "B");
      if (b && b.n === 0) add("error", node, "div-zero", "Phép chia cho 0 sẽ cho kết quả sai.", "Đổi số chia khác 0.");
    }

    if (node.type === "controls_if") {
      const cond = node.values.IF0;
      if (cond?.type === "ct_boolean") {
        const yes = String(cond.fields.VALUE).toLowerCase() === "true";
        add("info", node, "const-cond", yes ? "Điều kiện luôn ĐÚNG nên khối NẾU luôn chạy." : "Điều kiện luôn SAI nên khối bên trong không bao giờ chạy.", "Dùng khối SO SÁNH với một cảm biến để điều kiện thay đổi theo thực tế.");
      } else if (cond?.type === "ct_compare") {
        const a = numRef(cond, "A"), b = numRef(cond, "B");
        const fn = COMPARE[cond.fields.OP];
        if (a && b && fn) add("info", node, "const-cond", fn(a.n, b.n) ? "So sánh hai số cố định nên điều kiện luôn ĐÚNG." : "So sánh hai số cố định nên điều kiện luôn SAI.", "So sánh giá trị đọc từ cảm biến thay vì hai số cố định.");
      }
    }

    // Các block STM32 dùng tên chân dạng PA0/PB12 thay vì số GPIO.
    // Kiểm tra đúng danh sách chân hỗ trợ của từng mode và cảnh báo chân đã gán phần cứng.
    const stm32GpioMatch = /^stm32(?:bp|bk|nuc)_(digital_write|digital_read|analog_read|pwm_write)$/.exec(node.type);
    if (ctx.platform === "stm32" && stm32GpioMatch && !node.isShadow) {
      const pin = String(node.fields.PIN ?? "").trim().toUpperCase();
      const mode = stm32GpioMatch[1];
      const supported = mode === "analog_read" ? ctx.adcPinNames
        : mode === "pwm_write" ? ctx.pwmPinNames
        : ctx.digitalPinNames;
      if (pin && ctx.validPinNames?.size && !ctx.validPinNames.has(pin)) {
        add("error", node, "pin-range", `Chân ${pin} không có trên ${ctx.boardName || "board STM32 hiện tại"}.`, "Chọn tên chân có trong danh sách chân của đúng mạch.");
      } else if (pin && supported?.size && !supported.has(pin)) {
        add("error", node, "pin-mode-unsupported", `Chân ${pin} không được hỗ trợ ở chế độ ${mode === "analog_read" ? "ADC" : mode === "pwm_write" ? "PWM" : "Digital"} trên ${ctx.boardName || "mạch STM32 hiện tại"}.`, "Chọn chân nằm trong danh sách của đúng block (Digital, ADC hoặc PWM).");
      } else if (pin && ctx.blockedPins?.has(pin)) {
        add("error", node, "pin-special-reserved", `Chân ${pin} được dành cho ${ctx.blockedPins.get(pin)} nên không thể dùng làm GPIO thông thường.`, "Chọn chân GPIO khác.");
      } else if (pin && ctx.reserved?.has(pin)) {
        add("warn", node, "pin-reserved", `Chân ${pin} đang được cấu hình cho ${ctx.reserved.get(pin)} trên ${ctx.boardName || "mạch STM32"}.`, "Không dùng cùng chân cho block GPIO khác trong khi thiết bị này đang được cấu hình.");
      } else if (pin && ctx.specialWarnings?.has(pin)) {
        add("warn", node, "pin-special-warning", `Chân ${pin} có chức năng đặc biệt: ${ctx.specialWarnings.get(pin)}.`, "Chỉ sử dụng khi bạn chắc chắn không ảnh hưởng chức năng đặc biệt của board.");
      }
    }

    // Chân GPIO dạng số của các board AVR/ESP32 và CT Expansion.
    if (GPIO_ANY.has(node.type)) {
      const ref = numRef(node, "PIN");
      if (ref) {
        const pin = ref.n;
        const invalidRange = (ctx.invalidGpioRanges || []).some(([min, max]) => pin >= min && pin <= max);
        const outsideEsp32 = ctx.platform === "esp32" && (pin < (ctx.gpioMin ?? 0) || pin > (ctx.gpioMax ?? 39) || invalidRange);
        const outsideAvr = ctx.platform === "avr" && (pin < (ctx.gpioMin ?? 0) || pin > (ctx.gpioMax ?? 19));
        if (outsideEsp32 || outsideAvr) {
          add("error", node, "pin-range", `Chân ${pin} không hợp lệ hoặc không được đưa ra trên ${ctx.boardName || "board hiện tại"}.`, "Chọn chân có trên đúng model board đang sử dụng.");
        } else if (ctx.blockedPins?.has(pin)) {
          add("error", node, "pin-special-reserved", `GPIO${pin} được dành cho ${ctx.blockedPins.get(pin)} nên không thể dùng làm GPIO thông thường.`, "Chọn một GPIO khả dụng khác.");
        } else {
          const mode = node.type === "ct_pin_mode" ? String(node.fields.MODE || "") : "";
          const wantsOutput = GPIO_WRITE.has(node.type) || (node.type === "ct_pin_mode" && mode !== "INPUT" && mode !== "INPUT_PULLUP");
          const fallbackInputOnly = ctx.platform === "esp32"
            ? (String(ctx.boardName || "").includes("S3") ? pin === 46 : pin >= 34 && pin <= 39)
            : false;
          const isInputOnly = ctx.inputOnlyPins?.has?.(pin) ?? fallbackInputOnly;
          if (isInputOnly && wantsOutput) {
            add("error", node, "pin-input-only", `GPIO${pin} trên ${ctx.boardName || "board hiện tại"} chỉ hỗ trợ đầu vào.`, "Chỉ dùng chân này để đọc cảm biến; chọn GPIO khác để xuất tín hiệu.");
          } else if (ctx.reserved?.has(pin)) {
            add("warn", node, "pin-reserved", `Chân ${pin} đang được mạch mở rộng dành cho ${ctx.reserved.get(pin)}.`, "Không gán chức năng khác lên chân cố định của CT Expansion Board.");
          } else if (ctx.specialWarnings?.has(pin)) {
            add("warn", node, "pin-special-warning", `GPIO${pin} có chức năng đặc biệt: ${ctx.specialWarnings.get(pin)}.`, "Chỉ sử dụng khi bạn chắc chắn không ảnh hưởng chức năng đặc biệt của board.");
          }
        }
      }
    }
  }

  /* --- Sự kiện --- */
  const receivers = new Map();
  for (const n of all) if (n.type === "ct_on_receive") receivers.set(eventKey(n), n);
  const broadcasts = new Set(all.filter(n => n.type === "ct_broadcast").map(eventKey));
  for (const n of all) {
    if (n.type === "ct_broadcast" && !receivers.has(eventKey(n))) {
      add("warn", n, "no-receiver", `Chưa có khối KHI NHẬN SỰ KIỆN tên "${n.fields.NAME}" nên sự kiện này không kích hoạt gì.`, "Thêm khối KHI NHẬN SỰ KIỆN cùng tên, kiểm tra chính tả.");
    }
    if (n.type === "ct_on_receive" && !broadcasts.has(eventKey(n))) {
      add("info", n, "no-sender", `Chưa có khối PHÁT SỰ KIỆN tên "${n.fields.NAME}" nên các khối này sẽ không chạy.`, "Thêm khối PHÁT SỰ KIỆN cùng tên ở nơi cần kích hoạt.");
    }
  }
  const keys = new Map();
  for (const n of all) {
    if (!/^ct_key_/.test(n.type)) continue;
    if (keys.has(n.type)) add("warn", n, "dup-key", `Có hai khối "${label(n.type)}"; chỉ một khối được dùng.`, "Gộp lại thành một khối.");
    keys.set(n.type, n);
  }

  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
