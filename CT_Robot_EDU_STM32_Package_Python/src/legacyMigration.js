/*
 * Chuyển file dự án (XML Blockly) cũ sang cấu trúc khối mới.
 * Chạy trên DOM trước khi nạp vào workspace; KHÔNG import Blockly để test được bằng Node.
 *
 * 1) controls_ifelse (khối NẾU...NẾU KHÔNG THÌ riêng) -> controls_if có nhánh ELSE.
 *    Hai khối dùng chung tên ô IF0 / DO0 / ELSE nên chỉ cần đổi kiểu và thêm <mutation else="1">.
 * 2) Ô nhập số cũ (<field>) -> ô giá trị có khối số mặc định (<value><shadow type="math_number">),
 *    để ô đó nhận được cả biểu thức kéo vào lẫn số gõ trực tiếp.
 * 4) Khối di chuyển của STM32 (đã bỏ) bị gỡ khỏi file; các khối phía sau được nối lại.
 * 3) ct_constant (HẰNG SỐ, trùng với ô số) -> math_number, đổi tên ô VALUE thành NUM.
 */

const BOARD_PREFIXES = ["stm32bp", "stm32bk", "stm32nuc"];

/** Khối -> các ô số cũ đã chuyển thành ô giá trị. */
export const FIELD_TO_INPUT = {
  ct_motor_left: ["SPEED"],
  ct_motor_right: ["SPEED"],
  ct_wait: ["SECONDS"],
  ct_repeat: ["TIMES"],
  ct_buzzer: ["FREQ"],
  ct_servo: ["ANGLE"],
  ct_map_range: ["IN_MIN", "IN_MAX", "OUT_MIN", "OUT_MAX"],
  ct_calibrate: ["TURN_MS", "LEFT", "RIGHT"],
  ctexp_motor_run: ["SPEED"],
  ctexp_servo: ["ANGLE"],
  ...Object.fromEntries(BOARD_PREFIXES.flatMap(prefix => [
    [`${prefix}_buzzer`, ["FREQ"]],
    [`${prefix}_servo`, ["ANGLE"]],
  ])),
};

/** Khối di chuyển STM32 đã bỏ (chỉ CT Expansion Board còn khối di chuyển). */
export const REMOVED_STM32_MOVEMENT = /^stm32(bp|bk|nuc)_(forward|backward|turn_left|turn_right)(_continuous|_angle)?$|^stm32(bp|bk|nuc)_stop$/;

const childElements = (el, name) =>
  Array.from(el.childNodes).filter(node => node.nodeType === 1 && node.localName === name);

/** Sửa tại chỗ rồi trả về chính `root` (phần tử <xml> hoặc <block>). */
export function migrateLegacyBlockXml(root) {
  if (!root?.getElementsByTagName) return root;
  const doc = root.ownerDocument || root;
  const blocks = [...root.getElementsByTagName("block")];
  if (root.localName === "block") blocks.unshift(root);

  let removed = 0;
  for (const block of blocks) {
    const type = block.getAttribute("type");

    if (REMOVED_STM32_MOVEMENT.test(type)) {
      const parent = block.parentNode;
      const nextEl = childElements(block, "next")[0];
      const following = nextEl && childElements(nextEl, "block")[0];
      if (following) parent.replaceChild(following, block);
      else if (parent.localName === "next" || parent.localName === "statement") parent.parentNode.removeChild(parent);
      else parent.removeChild(block);
      removed++;
      continue;
    }

    if (type === "ct_constant") {
      block.setAttribute("type", "math_number");
      for (const field of childElements(block, "field")) {
        if (field.getAttribute("name") === "VALUE") field.setAttribute("name", "NUM");
      }
      continue;
    }

    if (type === "controls_ifelse") {
      block.setAttribute("type", "controls_if");
      if (!childElements(block, "mutation").length) {
        const mutation = doc.createElementNS(block.namespaceURI, "mutation");
        mutation.setAttribute("else", "1");
        block.insertBefore(mutation, block.firstChild);
      }
      continue;
    }

    for (const name of FIELD_TO_INPUT[type] || []) {
      const field = childElements(block, "field").find(f => f.getAttribute("name") === name);
      if (!field) continue;
      const text = (field.textContent || "").trim();
      const number = Number(text);
      block.removeChild(field);

      const value = doc.createElementNS(block.namespaceURI, "value");
      value.setAttribute("name", name);
      const shadow = doc.createElementNS(block.namespaceURI, "shadow");
      shadow.setAttribute("type", "math_number");
      const num = doc.createElementNS(block.namespaceURI, "field");
      num.setAttribute("name", "NUM");
      num.textContent = text !== "" && Number.isFinite(number) ? String(number) : "0";
      shadow.appendChild(num);
      value.appendChild(shadow);

      // <next> luôn đứng cuối để giữ nguyên thứ tự quen thuộc của Blockly.
      const next = childElements(block, "next")[0];
      block.insertBefore(value, next || null);
    }
  }
  root.removedBlockCount = removed; // để giao diện báo cho người dùng
  return root;
}
