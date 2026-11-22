/*
 * Quy ước ô nhập giống Scratch
 * -----------------------------------------------------------
 * - Mọi ô giá trị (tốc độ, thời gian, góc, số lần lặp, tần số...) đều:
 *     + nhận được MỌI loại biểu thức kéo vào (số, đúng/sai, chữ, cảm biến, phép tính...);
 *     + có sẵn một số mặc định (khối "bóng") để gõ trực tiếp từ bàn phím.
 * - Ô ĐIỀU KIỆN (sau chữ NẾU, VÀ/HOẶC, KHÔNG) chỉ nhận biểu thức đúng/sai, như ô lục giác của Scratch.
 *
 * File này KHÔNG import Blockly để dùng chung cho cả khối lõi, khối extension và test Node.
 */

/** Kiểu dữ liệu mà một ô giá trị chấp nhận (khối không khai báo kiểu vẫn luôn gắn được). */
export const ANY_VALUE = ["Number", "Boolean", "String"];

/** XML của khối số mặc định (khối bóng) để người dùng gõ số trực tiếp vào ô. */
export const numberShadowXml = value =>
  `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;

/** Khối bóng cho một ô: số (`shadow: 5`) hoặc chữ (`shadowText: "xin chào"`). */
export function shadowXml(arg) {
  if (arg.shadowText !== undefined) {
    const text = String(arg.shadowText).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<shadow type="ct_text"><field name="TEXT">${text}</field></shadow>`;
  }
  return numberShadowXml(arg.shadow);
}

/**
 * Gắn số mặc định cho các ô giá trị có khai báo `shadow` trong JSON của khối:
 *   { type: "input_value", name: "SPEED", check: ANY_VALUE, shadow: 80 }
 * `textToDom` là Blockly.utils.xml.textToDom (truyền vào để file này không phụ thuộc Blockly).
 */
export function applyShadowDefaults(block, json, textToDom) {
  for (const [key, list] of Object.entries(json || {})) {
    if (!/^args\d+$/.test(key) || !Array.isArray(list)) continue;
    for (const arg of list) {
      if (arg?.type !== "input_value" || (arg.shadow === undefined && arg.shadowText === undefined)) continue;
      block.getInput(arg.name)?.connection?.setShadowDom(textToDom(shadowXml(arg)));
    }
  }
}

/** Nhãn tiếng Việt cho khối NẾU ... THÌ chuẩn của Blockly (kể cả hộp ⚙ thêm "nếu không"). */
export const VI_IF_MESSAGES = {
  CONTROLS_IF_MSG_IF: "NẾU",
  CONTROLS_IF_MSG_THEN: "THÌ",
  CONTROLS_IF_MSG_ELSEIF: "NẾU KHÔNG THÌ NẾU",
  CONTROLS_IF_MSG_ELSE: "NẾU KHÔNG THÌ",
  CONTROLS_IF_IF_TITLE_IF: "NẾU",
  CONTROLS_IF_ELSEIF_TITLE_ELSEIF: "NẾU KHÔNG THÌ NẾU",
  CONTROLS_IF_ELSE_TITLE_ELSE: "NẾU KHÔNG THÌ",
  CONTROLS_IF_IF_TOOLTIP: "Kéo các mục vào/ra để thêm, bớt hoặc đổi thứ tự các nhánh của khối NẾU.",
  CONTROLS_IF_ELSEIF_TOOLTIP: "Thêm một nhánh \"nếu không thì nếu\" có điều kiện riêng.",
  CONTROLS_IF_ELSE_TOOLTIP: "Thêm nhánh \"nếu không thì\": chạy khi mọi điều kiện phía trên đều sai.",
  CONTROLS_IF_TOOLTIP_1: "Nếu điều kiện đúng thì chạy các khối bên trong.",
  CONTROLS_IF_TOOLTIP_2: "Nếu điều kiện đúng thì chạy nhánh THÌ; nếu sai thì chạy nhánh NẾU KHÔNG THÌ.",
  CONTROLS_IF_TOOLTIP_3: "Nếu điều kiện đầu đúng thì chạy nhánh đầu; nếu không, nếu điều kiện sau đúng thì chạy nhánh sau.",
  CONTROLS_IF_TOOLTIP_4: "Chạy nhánh của điều kiện đúng đầu tiên; nếu không điều kiện nào đúng thì chạy nhánh NẾU KHÔNG THÌ.",
};

/**
 * Đặt các ô giá trị nằm NGANG hàng với khối (inline): khi lồng nhiều phép toán/so sánh/điều kiện
 * vào nhau, khối tự dài ra theo chiều ngang thay vì cao dần lên.
 */
export function inlineValueInputs(block) {
  const INPUT_VALUE = 1; // Blockly.ConnectionType.INPUT_VALUE
  if (block.inputList?.some(input => input.connection?.type === INPUT_VALUE)) {
    block.setInputsInline(true);
  }
}
