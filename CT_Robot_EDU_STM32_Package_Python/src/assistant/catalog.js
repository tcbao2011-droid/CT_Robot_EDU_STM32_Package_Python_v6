/* Lập danh mục khối từ toolbox đang hiển thị (đúng theo phần cứng đã chọn). */
import { getInfo, registerInfo } from "./knowledge.js";

const stripEmoji = s => String(s || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

export function typesOfToolbox(toolbox) {
  const types = new Set();
  const walk = items => {
    for (const item of Array.isArray(items) ? items : []) {
      if (item.kind === "category") walk(item.contents);
      else if (item.kind === "block" && item.type) types.add(item.type);
    }
  };
  walk(toolbox?.contents);
  return types;
}

/** Cho extension khai báo tri thức của khối trong manifest: blocks[].assistant. */
export function loadExtensionInfo(extensions) {
  for (const def of extensions || []) {
    for (const block of def.blocks || []) {
      if (block.assistant) registerInfo(block.type, block.assistant);
    }
  }
}

export function buildCatalog(Blockly, toolbox) {
  const entries = [];
  const seen = new Set();
  let scratch = null;
  try { scratch = new Blockly.Workspace(); } catch { /* dùng nhãn dự phòng */ }

  const autoLabel = type => {
    if (!scratch) return type;
    try {
      const block = scratch.newBlock(type);
      const text = block.toString(48);
      const tooltip = typeof block.tooltip === "string" ? block.tooltip : "";
      block.dispose();
      return { text, tooltip };
    } catch { return type; }
  };

  const walk = (items, category) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (item.kind === "category") { walk(item.contents, stripEmoji(item.name)); continue; }
      if (item.kind !== "block" || !item.type || seen.has(item.type)) continue;
      seen.add(item.type);
      const info = getInfo(item.type);
      const auto = autoLabel(item.type);
      entries.push({
        type: item.type,
        category: category || "",
        label: info?.label || auto.text || item.type,
        kw: info?.kw || "",
        desc: info?.desc || auto.tooltip || "",
      });
    }
  };
  walk(toolbox?.contents, "");
  try { scratch?.dispose(); } catch { /* bỏ qua */ }
  return entries;
}
