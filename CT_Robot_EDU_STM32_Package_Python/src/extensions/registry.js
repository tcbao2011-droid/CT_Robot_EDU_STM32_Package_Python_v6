/* =====================================================
   EXTENSION REGISTRY
   -----------------------------------------------------
   Mỗi mạch mở rộng là một "manifest" (xem README.md):
   profile phần cứng, khối Blockly, danh mục toolbox,
   đoạn mã C++ và danh sách chân GPIO / địa chỉ I2C.
   Core không biết mạch nào tồn tại; chỉ hỏi registry.

   File này KHÔNG import Blockly (để test được bằng Node).
   Blockly được gắn vào qua attachBlockly() trong
   blocklyBinding.js.
===================================================== */

import { applyShadowDefaults, inlineValueInputs } from "../valueSlots.js";
import {
  registerHardwareProfile,
  unregisterHardwareProfile,
  setExtensionProvider,
} from "../hardwareProfiles.js";

const extensions = new Map();      // id -> definition
const installedBlocks = new Map(); // block type -> extension id
let binding = null;                // { Blockly, generator }
let activeProfile = null;

/* ---------- Kiểm tra manifest ---------- */

function fail(def, message) {
  throw new Error(`[Extension "${def?.id ?? "?"}"] ${message}`);
}

function assertValidDefinition(def) {
  if (!def || typeof def !== "object") throw new Error("[Extension] manifest phải là object");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id || "")) fail(def, "id chỉ gồm a-z, 0-9, dấu gạch ngang");
  if (!def.name) fail(def, "thiếu name");
  if (!def.version) fail(def, "thiếu version");
  if (!/^[a-z][a-z0-9]*$/.test(def.blockPrefix || "")) {
    fail(def, "thiếu blockPrefix (a-z, 0-9), ví dụ \"ctexp\"; mọi block type phải bắt đầu bằng `<blockPrefix>_`");
  }

  const types = new Set();
  for (const block of def.blocks || []) {
    if (!block.type?.startsWith(`${def.blockPrefix}_`)) {
      fail(def, `block "${block.type}" phải bắt đầu bằng "${def.blockPrefix}_"`);
    }
    if (types.has(block.type)) fail(def, `block "${block.type}" bị khai báo hai lần`);
    types.add(block.type);
    if (!["statement", "value"].includes(block.kind)) fail(def, `block "${block.type}": kind phải là "statement" hoặc "value"`);
    if (!block.json && typeof block.init !== "function") fail(def, `block "${block.type}": cần json hoặc init`);
    if (typeof block.generator !== "function") fail(def, `block "${block.type}": thiếu generator`);
  }

  if (def.capabilities?.remove && !Array.isArray(def.capabilities.remove)) {
    fail(def, "capabilities.remove phải là mảng tên khả năng, ví dụ [\"gpio\"]");
  }

  const gpioRoles = new Map();
  for (const pin of def.pins || []) {
    if (!Number.isInteger(pin.gpio) || pin.gpio < 0 || pin.gpio > 48) fail(def, `GPIO không hợp lệ: ${pin.gpio}`);
    if (gpioRoles.has(pin.gpio)) {
      fail(def, `GPIO${pin.gpio} bị khai báo hai lần ("${gpioRoles.get(pin.gpio)}" và "${pin.role}")`);
    }
    gpioRoles.set(pin.gpio, pin.role);
  }

  const sectionIds = new Set();
  for (const section of def.sketch?.sections || []) {
    if (!section.id) fail(def, "sketch.sections: mỗi section cần id");
    if (sectionIds.has(section.id)) fail(def, `section "${section.id}" bị trùng`);
    sectionIds.add(section.id);
  }
  for (const section of def.sketch?.sections || []) {
    for (const dep of section.requires || []) {
      if (!sectionIds.has(dep)) fail(def, `section "${section.id}" cần "${dep}" nhưng không tồn tại`);
    }
  }
}

/* ---------- Trạng thái kích hoạt theo profile ---------- */

export function isExtensionActive(def, profile = activeProfile) {
  if (!profile) return false;
  if (def.requires?.platform && def.requires.platform !== profile.platform) return false;
  return Array.isArray(profile.extensions) && profile.extensions.includes(def.id);
}

export function getExtensions() {
  return [...extensions.values()];
}

export function getActiveExtensions(profile = activeProfile) {
  return getExtensions().filter(def => isExtensionActive(def, profile));
}

export function setActiveProfile(profile) {
  activeProfile = profile || null;
}

/* ---------- Blockly ---------- */

function inactiveStub(def, block) {
  const { generator } = binding;
  if (block.kind === "value") return ["0", generator.ORDER_ATOMIC];
  return `// [${def.name}] khối ${block.type} cần board có mạch mở rộng này.\n`;
}

function installBlocks(def) {
  if (!binding) return;
  const { Blockly, generator } = binding;

  for (const block of def.blocks || []) {
    const owner = installedBlocks.get(block.type);
    if (owner && owner !== def.id) fail(def, `block "${block.type}" đã thuộc extension "${owner}"`);
    if (!owner && Blockly.Blocks[block.type]) fail(def, `block "${block.type}" trùng với block của core`);

    Blockly.Blocks[block.type] = {
      init() {
        if (block.json) {
          this.jsonInit(block.json);
          // Ô giá trị có khai báo `shadow` được gắn sẵn số mặc định để gõ trực tiếp.
          applyShadowDefaults(this, block.json, Blockly.utils.xml.textToDom);
        }
        else block.init.call(this, Blockly);
        inlineValueInputs(this);
      },
    };

    generator.forBlock[block.type] = (b, gen) =>
      isExtensionActive(def)
        ? block.generator(b, gen || generator)
        : inactiveStub(def, block);

    installedBlocks.set(block.type, def.id);
  }
}

export function attachBlockly(nextBinding) {
  binding = nextBinding;
  getExtensions().forEach(installBlocks);
}

/* ---------- Toolbox ---------- */

export function getToolboxCategories(profile = activeProfile) {
  return getActiveExtensions(profile).flatMap(def => {
    const toolbox = typeof def.toolbox === "function" ? def.toolbox(profile) : def.toolbox;
    if (!toolbox) return [];
    return Array.isArray(toolbox) ? toolbox : [toolbox];
  });
}

/* ---------- Sinh sketch ---------- */

const callOrValue = (value, ctx) => (typeof value === "function" ? value(ctx) : value || "");

function sectionWanted(section, code) {
  if (section.always) return true;
  if (!section.usedWhen) return false;
  return section.usedWhen instanceof RegExp ? section.usedWhen.test(code) : Boolean(section.usedWhen(code));
}

/**
 * Gom đóng góp của các extension đang bật vào sketch.
 * Trả về null nếu không có extension nào (core chạy như cũ).
 */
export function collectSketchParts(ctx) {
  const active = getActiveExtensions(ctx.profile);
  if (!active.length) return null;

  const code = `${ctx.generated || ""}\n${ctx.functions || ""}`;
  const parts = { includes: [], prelude: [], setup: [], provides: new Set(), disables: new Set() };

  for (const def of active) {
    const sketch = def.sketch;
    if (!sketch) continue;
    (sketch.disables || []).forEach(item => parts.disables.add(item));
    (sketch.includes || []).forEach(item => parts.includes.push(item));

    const byId = new Map((sketch.sections || []).map(section => [section.id, section]));
    const ordered = [];
    const seen = new Set();
    const want = section => {
      if (seen.has(section.id)) return;
      seen.add(section.id);
      (section.requires || []).forEach(dep => want(byId.get(dep)));
      ordered.push(section);
    };
    (sketch.sections || []).forEach(section => {
      if (sectionWanted(section, code)) want(section);
    });

    for (const section of ordered) {
      (section.includes || []).forEach(item => parts.includes.push(item));
      const prelude = callOrValue(section.prelude, ctx);
      const setup = callOrValue(section.setup, ctx);
      if (prelude) parts.prelude.push(prelude);
      if (setup) parts.setup.push(setup);
      (section.provides || []).forEach(item => parts.provides.add(item));
    }
  }

  parts.includes = [...new Set(parts.includes)];
  return parts;
}

/* ---------- Kiểm tra cấu hình ---------- */

export function validateExtensions(config, profile) {
  const errors = [];
  const active = getActiveExtensions(profile);

  // 1) Chân người dùng sửa tay không được đè lên chân cố định của mạch mở rộng.
  const defaults = new Map();
  Object.entries(profile.pins || {}).forEach(([key, value]) => defaults.set(`pins.${key}`, Number(value)));
  Object.entries(profile.sensors || {}).forEach(([key, value]) => defaults.set(`sensors.${key}`, Number(value)));

  for (const def of active) {
    const claims = new Map((def.pins || []).map(pin => [pin.gpio, pin.role]));
    for (const group of ["pins", "sensors"]) {
      for (const [key, raw] of Object.entries(config[group] || {})) {
        const gpio = Number(raw);
        if (!Number.isInteger(gpio) || gpio < 0 || !claims.has(gpio)) continue;
        if (defaults.get(`${group}.${key}`) === gpio) continue; // khớp với profile gốc
        errors.push(`Chân GPIO${gpio} (${group}.${key}) trùng với "${claims.get(gpio)}" của ${def.name}.`);
      }
    }
  }

  // 2) Hai extension cùng bật không được chiếm cùng GPIO hoặc cùng địa chỉ I2C.
  const gpioOwner = new Map();
  const i2cOwner = new Map();
  for (const def of active) {
    for (const pin of def.pins || []) {
      const other = gpioOwner.get(pin.gpio);
      if (other && other.id !== def.id) {
        errors.push(`GPIO${pin.gpio}: "${pin.role}" (${def.name}) trùng "${other.role}" (${other.name}).`);
      } else gpioOwner.set(pin.gpio, { id: def.id, name: def.name, role: pin.role });
    }
    for (const device of def.i2c || []) {
      for (const addr of device.addresses || [device.address]) {
        const other = i2cOwner.get(addr);
        if (other && other.id !== def.id) {
          errors.push(`Địa chỉ I2C 0x${addr.toString(16)}: ${device.name} (${def.name}) trùng ${other.name} (${other.owner}).`);
        } else i2cOwner.set(addr, { id: def.id, owner: def.name, name: device.name });
      }
    }
    const custom = def.validate?.({ config, profile });
    if (Array.isArray(custom)) errors.push(...custom);
  }

  return errors;
}

/* ---------- Đăng ký ---------- */

export function defineExtension(def) {
  assertValidDefinition(def);
  return def;
}

export function unregisterExtension(id) {
  const def = extensions.get(id);
  if (!def) return;
  (def.profiles || []).forEach(profile => unregisterHardwareProfile(profile.id));
  extensions.delete(id);
}

export function registerExtension(def) {
  assertValidDefinition(def);
  if (extensions.has(def.id)) unregisterExtension(def.id); // HMR / đăng ký lại

  extensions.set(def.id, def);
  for (const profile of def.profiles || []) {
    const { group, ...rest } = profile;
    registerHardwareProfile(
      { ...rest, extensions: [...new Set([...(rest.extensions || []), def.id])] },
      group
    );
  }
  installBlocks(def);
  return def;
}

// Nối registry vào core (hardwareProfiles.js) một lần duy nhất.
setExtensionProvider({
  sketchParts: collectSketchParts,
  validate: ({ config, profile }) => validateExtensions(config, profile),
});
