/* =====================================================
   CAPABILITIES – lọc toolbox theo phần cứng
   -----------------------------------------------------
   Mỗi category / block trong toolbox có thể khai báo
   `requires: "gpio"` (hoặc mảng). Khối chỉ hiện khi board
   đang chọn còn khả năng đó. Mặc định board nào cũng có
   đủ; mạch mở rộng gỡ bớt qua manifest:

     capabilities: { remove: ["gpio"] }

   Các mục trong sketch.disables cũng tự gỡ khả năng tương
   ứng (bluetooth-uart -> bluetooth, led, buzzer).
===================================================== */

import { getActiveExtensions } from "./registry.js";

const IMPLIED_BY_DISABLE = { "bluetooth-uart": "bluetooth", led: "led", buzzer: "buzzer" };

export function getCapabilities(profile) {
  const removed = new Set(profile?.capabilities?.remove || []);
  if (profile) {
    for (const def of getActiveExtensions(profile)) {
      (def.capabilities?.remove || []).forEach(item => removed.add(item));
      (def.sketch?.disables || []).forEach(item => {
        if (IMPLIED_BY_DISABLE[item]) removed.add(IMPLIED_BY_DISABLE[item]);
      });
    }
  }
  return { removed, has: capability => !removed.has(capability) };
}

/** Trả về bản sao toolbox đã bỏ mục không dùng được và đã gỡ khóa `requires`. */
export function filterToolbox(toolbox, profile) {
  const { has } = getCapabilities(profile);
  const allowed = entry => !entry.requires || [].concat(entry.requires).every(has);

  const walk = entries =>
    entries
      .filter(allowed)
      .map(entry => {
        const { requires, ...rest } = entry; // eslint-disable-line no-unused-vars
        if (Array.isArray(rest.contents)) {
          rest.contents = walk(rest.contents);
          if (rest.kind === "category" && rest.contents.length === 0) return null;
        }
        return rest;
      })
      .filter(Boolean);

  return { ...toolbox, contents: walk(toolbox.contents) };
}
