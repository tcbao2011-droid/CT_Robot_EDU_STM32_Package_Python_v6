import * as Blockly from "blockly";
import { javascriptGenerator } from "blockly/javascript";
import { attachBlockly } from "./registry.js";

// Phải chạy trước khi đăng ký bất kỳ extension nào.
attachBlockly({ Blockly, generator: javascriptGenerator });
