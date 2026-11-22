/* =====================================================
   ĐIỂM VÀO CỦA EXTENSION REGISTRY
   Thêm mạch mới = thêm 1 file vào ./builtin/ (export default
   một manifest). Không cần sửa file này hay code core.
===================================================== */

import "./blocklyBinding.js";
import { registerExtension, getToolboxCategories, setActiveProfile } from "./registry.js";

const modules = import.meta.glob("./builtin/*.js", { eager: true });

Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .forEach(([path, mod]) => {
    if (!mod.default) {
      console.warn(`[Extension] ${path} không có export default, bỏ qua.`);
      return;
    }
    try {
      registerExtension(mod.default);
    } catch (error) {
      // Một extension lỗi không được làm hỏng cả ứng dụng.
      console.error(`[Extension] Không đăng ký được ${path}:`, error);
    }
  });

export { filterToolbox, getCapabilities } from "./capabilities.js";
export const getExtensionToolboxCategories = profile => (profile ? getToolboxCategories(profile) : []);
export const setActiveExtensionProfile = setActiveProfile;
export {
  registerExtension,
  unregisterExtension,
  getExtensions,
  getActiveExtensions,
  isExtensionActive,
  defineExtension,
} from "./registry.js";
