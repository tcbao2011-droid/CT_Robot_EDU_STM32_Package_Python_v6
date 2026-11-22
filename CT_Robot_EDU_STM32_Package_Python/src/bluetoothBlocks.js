import * as Blockly from "blockly";
import { javascriptGenerator } from "blockly/javascript";

/* =====================================================
   BLUETOOTH (HC-05 / HC-06) qua cổng Serial
   Dùng chung Serial.begin(115200) có sẵn trong setup().
   Module HC-05 phải đặt baud 115200: AT+UART=115200,0,0
   UNO/Nano: BT_SERIAL = Serial (D0/D1). ESP32: BT_SERIAL = Serial2 (chân BT_RX_PIN/BT_TX_PIN trong hardwareProfiles.js).
===================================================== */

const BT_COLOUR = "#0284c7";

const BT_KEYS = [
  ["TIẾN (F)", "F"],
  ["LÙI (B)", "B"],
  ["TRÁI (L)", "L"],
  ["PHẢI (R)", "R"],
  ["DỪNG (S)", "S"],
];

/* ---- Kiểm tra lệnh: đúng ký tự đang chờ trong bộ đệm (không lấy ra) ---- */
Blockly.Blocks["ct_bt_has_key"] = {
  init() {
    this.appendDummyInput()
      .appendField("BLUETOOTH NHẬN LỆNH")
      .appendField(new Blockly.FieldDropdown(BT_KEYS), "KEY");
    this.setOutput(true, "Boolean");
    this.setColour(BT_COLOUR);
    this.setTooltip("Đúng khi lệnh Bluetooth đang chờ là ký tự đã chọn (không xóa khỏi bộ đệm).");
  },
};

javascriptGenerator.forBlock["ct_bt_has_key"] = block => {
  const key = block.getFieldValue("KEY");
  return [
    `(BT_SERIAL.available() > 0 && BT_SERIAL.peek() == '${key}')`,
    javascriptGenerator.ORDER_LOGICAL_AND,
  ];
};

/* ---- Đọc một ký tự và xóa khỏi bộ đệm ---- */
Blockly.Blocks["ct_bt_read"] = {
  init() {
    this.appendDummyInput().appendField("ĐỌC KÝ TỰ BLUETOOTH");
    this.setOutput(true, "Number");
    this.setColour(BT_COLOUR);
    this.setTooltip("Trả về mã ký tự nhận được, hoặc -1 nếu chưa có dữ liệu.");
  },
};

javascriptGenerator.forBlock["ct_bt_read"] = () => [
  "BT_SERIAL.read()",
  javascriptGenerator.ORDER_FUNCTION_CALL,
];

/* ---- Có dữ liệu đang chờ? ---- */
Blockly.Blocks["ct_bt_available"] = {
  init() {
    this.appendDummyInput().appendField("CÓ DỮ LIỆU BLUETOOTH");
    this.setOutput(true, "Boolean");
    this.setColour(BT_COLOUR);
    this.setTooltip("Đúng khi có ít nhất một byte đang chờ trong bộ đệm.");
  },
};

javascriptGenerator.forBlock["ct_bt_available"] = () => [
  "(BT_SERIAL.available() > 0)",
  javascriptGenerator.ORDER_RELATIONAL,
];

/* ---- Gửi chuỗi về điện thoại ---- */
Blockly.Blocks["ct_bt_send"] = {
  init() {
    this.appendDummyInput()
      .appendField("GỬI BLUETOOTH")
      .appendField(new Blockly.FieldTextInput("OK"), "TEXT");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BT_COLOUR);
    this.setTooltip("Gửi một dòng chữ tới thiết bị Bluetooth đã kết nối.");
  },
};

javascriptGenerator.forBlock["ct_bt_send"] = block => {
  const text = JSON.stringify(block.getFieldValue("TEXT") || "");
  return `BT_SERIAL.println(${text});\n`;
};

export const BLUETOOTH_TOOLBOX_CATEGORY = {
  kind: "category",
  name: "🔵 Bluetooth",
  colour: BT_COLOUR,
  requires: "bluetooth",
  contents: [
    { kind: "block", type: "ct_bt_has_key" },
    { kind: "block", type: "ct_bt_available" },
    { kind: "block", type: "ct_bt_read" },
    { kind: "block", type: "ct_bt_send" },
  ],
};