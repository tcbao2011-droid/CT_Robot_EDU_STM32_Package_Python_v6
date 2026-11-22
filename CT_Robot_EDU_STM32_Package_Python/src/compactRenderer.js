/*
 * Bộ vẽ khối "ct_zelos": giống hệt zelos (kiểu Scratch) nhưng các hàng thấp hơn
 * để khối nhìn thon gọn, đặc biệt là khối NẾU ... THÌ ... NẾU KHÔNG THÌ.
 * Muốn mỏng/dày hơn chỉ cần chỉnh các số bên dưới (đơn vị: pixel ở mức zoom 100%).
 */
import * as Blockly from "blockly";

export const COMPACT_METRICS = {
  MIN_BLOCK_HEIGHT: 34,            // chiều cao tối thiểu của một hàng (zelos gốc: 48)
  EMPTY_STATEMENT_INPUT_HEIGHT: 16, // chiều cao ô chứa lệnh còn trống (zelos gốc: 24)
  DUMMY_INPUT_MIN_HEIGHT: 26,       // hàng chỉ có chữ, ví dụ "THÌ" (zelos gốc: 32)
};

class CompactConstants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();
    Object.assign(this, COMPACT_METRICS);
  }
}

class CompactRenderer extends Blockly.zelos.Renderer {
  makeConstants_() {
    return new CompactConstants();
  }
}

export const COMPACT_RENDERER = "ct_zelos";
Blockly.blockRendering.register(COMPACT_RENDERER, CompactRenderer);
