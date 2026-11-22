import * as Blockly from "blockly";
import "blockly/blocks"; // Đăng ký các khối chuẩn (math_number, controls_if, logic...)
import { generateIfElseChain } from "./controlFlowGenerator.js";
import { javascriptGenerator } from "blockly/javascript";
import { ANY_VALUE, VI_IF_MESSAGES, applyShadowDefaults, inlineValueInputs } from "./valueSlots.js";
import { instrumentBlocklyGenerator, markBlockCode, unmarkedCode } from "./codeSourceMap.js";
import { buildProgramDeclarations } from "./programBlocks.js"; // đăng ký luôn các khối Logic/Điều khiển/Toán/Chữ/Biến/Danh sách

/*
=========================================================
 CT ROBOT EDU
 robotBlocks.js
 VERSION 10.0
=========================================================
*/

// Nhãn tiếng Việt cho khối NẾU ... THÌ (phải gán trước khi khối đầu tiên được tạo).
Object.assign(Blockly.Msg, VI_IF_MESSAGES);

const colour = {
  event: "#22a06b",
  motor: "#3182ce",
  sensor: "#d69e2e",
  control: "#dd6b20",
  time: "#805ad5",
  math: "#8b5e3c",
  robot: "#64748b",
  logic: "#6b7280",
};

/* =====================================================
   HELPER
===================================================== */

function numberValue(block, fieldName, defaultValue = 0) {
  if (!block) return defaultValue;

  const value = Number(block.getFieldValue(fieldName));

  return Number.isFinite(value)
    ? value
    : defaultValue;
}

function valueCode(block, inputName, fallback = "0") {
  return (
    javascriptGenerator.valueToCode(
      block,
      inputName,
      javascriptGenerator.ORDER_NONE
    ) || fallback
  );
}

/** jsonInit + gắn số mặc định cho các ô giá trị có khai báo `shadow`. */
function initWithShadows(block, json) {
  block.jsonInit(json);
  applyShadowDefaults(block, json, Blockly.utils.xml.textToDom);
}

/** Số cố định -> "1000"; biểu thức -> null (để sinh phép nhân trong mã). */
function literalNumber(code) {
  const text = unmarkedCode(code).trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/* =====================================================
   1. SỰ KIỆN
===================================================== */

Blockly.Blocks["ct_when_started"] = {
  init() {
    this.jsonInit({
      message0: "KHI BẮT ĐẦU",
      message1: "%1",
      args1: [
        {
          type: "input_statement",
          name: "DO",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.event,
      tooltip: "Điểm bắt đầu chương trình.",
    });
  },
};

javascriptGenerator.forBlock["ct_when_started"] = function (block) {
  return javascriptGenerator.statementToCode(block, "DO");
};

/* =====================================================
   2. SỰ KIỆN BÀN PHÍM
===================================================== */

function createKeyboardEventBlock(name, label) {
  Blockly.Blocks[name] = {
    init() {
      this.jsonInit({
        message0: `KHI NHẤN ${label}`,
        message1: "%1",
        args1: [
          {
            type: "input_statement",
            name: "DO",
          },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: colour.event,
      });
    },
  };

  javascriptGenerator.forBlock[name] = function (block) {
    // Phím bàn phím chỉ có trong trình mô phỏng; robot thật bỏ qua.
    return `// (Bỏ qua trên robot thật) Khi nhấn ${label}\n`;
  };
}

createKeyboardEventBlock("ct_key_up", "↑");
createKeyboardEventBlock("ct_key_down", "↓");
createKeyboardEventBlock("ct_key_left", "←");
createKeyboardEventBlock("ct_key_right", "→");

/* =====================================================
   3. LẶP MÃI
===================================================== */

Blockly.Blocks["ct_forever"] = {
  init() {
    this.jsonInit({
      message0: "LẶP MÃI",
      message1: "%1",
      args1: [
        {
          type: "input_statement",
          name: "DO",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.event,
    });
  },
};

javascriptGenerator.forBlock["ct_forever"] = function (block) {
  const body = javascriptGenerator.statementToCode(block, "DO");

  return `while (true) {\n${body}}\n`;
};

/* =====================================================
   4. BLOCK CHUYỂN ĐỘNG THEO THỜI GIAN
===================================================== */

function createTimedMovementBlock(name, label, robotFunction) {
  Blockly.Blocks[name] = {
    init() {
      this.jsonInit({
        message0: `${label} %1 %`,
        args0: [
          {
            type: "input_value",
            name: "SPEED",
            check: ANY_VALUE,
          },
        ],

        message1: "TRONG %1 GIÂY",
        args1: [
          {
            type: "input_value",
            name: "SECONDS",
            check: ANY_VALUE,
          },
        ],

        previousStatement: null,
        nextStatement: null,
        colour: colour.motor,
      });

      const speed = this.getInput("SPEED");

      if (speed?.connection) {
        speed.connection.setShadowDom(
          Blockly.utils.xml.textToDom(`
            <shadow type="math_number">
              <field name="NUM">80</field>
            </shadow>
          `)
        );
      }

      const seconds = this.getInput("SECONDS");

      if (seconds?.connection) {
        seconds.connection.setShadowDom(
          Blockly.utils.xml.textToDom(`
            <shadow type="math_number">
              <field name="NUM">1</field>
            </shadow>
          `)
        );
      }
    },
  };

  javascriptGenerator.forBlock[name] = function (block) {
    const speed = valueCode(block, "SPEED", "80");
    const seconds = valueCode(block, "SECONDS", "1");

    return `robot.${robotFunction}(${speed}, ${seconds});\n`;
  };
}

createTimedMovementBlock(
  "ct_forward",
  "ĐI THẲNG",
  "forward"
);

createTimedMovementBlock(
  "ct_backward",
  "ĐI LÙI",
  "backward"
);

createTimedMovementBlock(
  "ct_turn_left",
  "QUAY TRÁI",
  "turnLeft"
);

createTimedMovementBlock(
  "ct_turn_right",
  "QUAY PHẢI",
  "turnRight"
);

/* =====================================================
   5. BLOCK CHUYỂN ĐỘNG LIÊN TỤC
===================================================== */

function createContinuousMovementBlock(
  name,
  label,
  robotFunction
) {
  Blockly.Blocks[name] = {
    init() {
      this.jsonInit({
        message0: `${label} %1 %`,
        args0: [
          {
            type: "input_value",
            name: "SPEED",
            check: ANY_VALUE,
          },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: colour.motor,
        tooltip: `${label} liên tục.`,
      });

      const speed = this.getInput("SPEED");

      if (speed?.connection) {
        speed.connection.setShadowDom(
          Blockly.utils.xml.textToDom(`
            <shadow type="math_number">
              <field name="NUM">80</field>
            </shadow>
          `)
        );
      }
    },
  };

  javascriptGenerator.forBlock[name] = function (block) {
    const speed = valueCode(block, "SPEED", "80");

    return `robot.${robotFunction}(${speed});\n`;
  };
}

createContinuousMovementBlock(
  "ct_forward_continuous",
  "ĐI THẲNG",
  "forwardContinuous"
);

createContinuousMovementBlock(
  "ct_backward_continuous",
  "ĐI LÙI",
  "backwardContinuous"
);

createContinuousMovementBlock(
  "ct_turn_left_continuous",
  "QUAY TRÁI",
  "turnLeftContinuous"
);

createContinuousMovementBlock(
  "ct_turn_right_continuous",
  "QUAY PHẢI",
  "turnRightContinuous"
);

/* =====================================================
   6. BLOCK QUAY THEO GÓC
===================================================== */

function createAngleMovementBlock(
  name,
  label,
  robotFunction
) {
  Blockly.Blocks[name] = {
    init() {
      this.jsonInit({
        message0: `${label} %1 %`,
        args0: [
          {
            type: "input_value",
            name: "SPEED",
            check: ANY_VALUE,
          },
        ],

        message1: "GÓC %1 °",
        args1: [
          {
            type: "input_value",
            name: "DEGREES",
            check: ANY_VALUE,
          },
        ],

        previousStatement: null,
        nextStatement: null,
        colour: colour.motor,
        tooltip: `${label} với góc quay xác định.`,
      });

      const speed = this.getInput("SPEED");

      if (speed?.connection) {
        speed.connection.setShadowDom(
          Blockly.utils.xml.textToDom(`
            <shadow type="math_number">
              <field name="NUM">60</field>
            </shadow>
          `)
        );
      }

      const angle = this.getInput("DEGREES");

      if (angle?.connection) {
        angle.connection.setShadowDom(
          Blockly.utils.xml.textToDom(`
            <shadow type="math_number">
              <field name="NUM">90</field>
            </shadow>
          `)
        );
      }
    },
  };

  javascriptGenerator.forBlock[name] = function (block) {
    const speed = valueCode(block, "SPEED", "60");
    const degrees = valueCode(block, "DEGREES", "90");

    return `robot.${robotFunction}(${speed}, ${degrees});\n`;
  };
}

createAngleMovementBlock(
  "ct_turn_left_angle",
  "↶ QUAY TRÁI",
  "turnLeftAngle"
);

createAngleMovementBlock(
  "ct_turn_right_angle",
  "↷ QUAY PHẢI",
  "turnRightAngle"
);

/* =====================================================
   7. DỪNG
===================================================== */

Blockly.Blocks["ct_stop"] = {
  init() {
    this.jsonInit({
      message0: "DỪNG ROBOT",
      previousStatement: null,
      nextStatement: null,
      colour: colour.motor,
    });
  },
};

javascriptGenerator.forBlock["ct_stop"] = function () {
  return "robot.stop();\n";
};

/* =====================================================
   8. MOTOR TRÁI / PHẢI
===================================================== */

Blockly.Blocks["ct_motor_left"] = {
  init() {
    initWithShadows(this, {
      message0: "MOTOR TRÁI %1 %",
      args0: [
        { type: "input_value", name: "SPEED", check: ANY_VALUE, shadow: 80 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.motor,
    });
  },
};

javascriptGenerator.forBlock["ct_motor_left"] = function (block) {
  return `robot.motorLeft(${valueCode(block, "SPEED", "80")});\n`;
};

Blockly.Blocks["ct_motor_right"] = {
  init() {
    initWithShadows(this, {
      message0: "MOTOR PHẢI %1 %",
      args0: [
        { type: "input_value", name: "SPEED", check: ANY_VALUE, shadow: 80 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.motor,
    });
  },
};

javascriptGenerator.forBlock["ct_motor_right"] = function (block) {
  return `robot.motorRight(${valueCode(block, "SPEED", "80")});\n`;
};

/* =====================================================
   9. CHỜ
===================================================== */

Blockly.Blocks["ct_wait"] = {
  init() {
    initWithShadows(this, {
      message0: "CHỜ %1 GIÂY",
      args0: [
        { type: "input_value", name: "SECONDS", check: ANY_VALUE, shadow: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.time,
    });
  },
};

javascriptGenerator.forBlock["ct_wait"] = function (block) {
  const seconds = valueCode(block, "SECONDS", "1");
  const fixed = literalNumber(seconds);
  // Số cố định -> tính sẵn mili-giây; biểu thức (cảm biến, phép tính...) -> nhân trong mã.
  return fixed !== null
    ? `delay(${Math.round(fixed * 1000)});\n`
    : `delay((${seconds}) * 1000);\n`;
};

/* =====================================================
   10. LẶP LẠI
===================================================== */

Blockly.Blocks["ct_repeat"] = {
  init() {
    initWithShadows(this, {
      message0: "LẶP LẠI %1 LẦN",
      args0: [
        { type: "input_value", name: "TIMES", check: ANY_VALUE, shadow: 10 },
      ],
      message1: "%1",
      args1: [
        {
          type: "input_statement",
          name: "DO",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.control,
    });
  },
};

javascriptGenerator.forBlock["ct_repeat"] = function (block) {
  const times = valueCode(block, "TIMES", "10");
  const body = javascriptGenerator.statementToCode(block, "DO");

  return `for (int i = 0; i < ${times}; i++) {\n${body}}\n`;
};

/* =====================================================
   11. CẢM BIẾN
===================================================== */

function createSensorBlock(name, label, code) {
  Blockly.Blocks[name] = {
    init() {
      this.jsonInit({
        message0: label,
        output: "Number",
        colour: colour.sensor,
      });
    },
  };

  javascriptGenerator.forBlock[name] = function () {
    return [
      code,
      javascriptGenerator.ORDER_ATOMIC,
    ];
  };
}

createSensorBlock(
  "ct_distance",
  "KHOẢNG CÁCH (cm)",
  "robot.distance()"
);

createSensorBlock(
  "ct_line_left",
  "CẢM BIẾN LINE TRÁI",
  "robot.lineLeft()"
);

createSensorBlock(
  "ct_line_right",
  "CẢM BIẾN LINE PHẢI",
  "robot.lineRight()"
);

/* =====================================================
   13. PHÉP TÍNH
===================================================== */

Blockly.Blocks["ct_math_operation"] = {
  init() {
    initWithShadows(this, {
      message0: "%1 %2 %3",
      args0: [
        {
          type: "input_value",
          name: "A",
          check: ANY_VALUE,
          shadow: 0,
        },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["+", "ADD"],
            ["−", "SUB"],
            ["×", "MUL"],
            ["÷", "DIV"],
          ],
        },
        {
          type: "input_value",
          name: "B",
          check: ANY_VALUE,
          shadow: 0,
        },
      ],
      output: "Number",
      colour: colour.math,
    });
  },
};

javascriptGenerator.forBlock["ct_math_operation"] = function (block) {
  const a = valueCode(block, "A", "0");
  const b = valueCode(block, "B", "0");

  const operators = {
    ADD: "+",
    SUB: "-",
    MUL: "*",
    DIV: "/",
  };

  return [
    `(${a} ${operators[block.getFieldValue("OP")]} ${b})`,
    javascriptGenerator.ORDER_ATOMIC,
  ];
};

/* =====================================================
   14. SO SÁNH
===================================================== */

Blockly.Blocks["ct_compare"] = {
  init() {
    initWithShadows(this, {
      message0: "%1 %2 %3",
      args0: [
        {
          type: "input_value",
          name: "A",
          check: ANY_VALUE,
          shadow: 0,
        },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            [">", "GT"],
            ["<", "LT"],
            ["=", "EQ"],
            [">=", "GTE"],
            ["<=", "LTE"],
            ["≠", "NEQ"],
          ],
        },
        {
          type: "input_value",
          name: "B",
          check: ANY_VALUE,
          shadow: 0,
        },
      ],
      output: "Boolean",
      colour: colour.logic,
    });
  },
};

javascriptGenerator.forBlock["ct_compare"] = function (block) {
  const a = valueCode(block, "A", "0");
  const b = valueCode(block, "B", "0");

  const operators = {
    GT: ">",
    LT: "<",
    EQ: "==",
    GTE: ">=",
    LTE: "<=",
    NEQ: "!=",
  };

  return [
    `(${a} ${operators[block.getFieldValue("OP")]} ${b})`,
    javascriptGenerator.ORDER_RELATIONAL,
  ];
};

/* =====================================================
   15. BOOLEAN
===================================================== */

Blockly.Blocks["ct_boolean"] = {
  init() {
    this.jsonInit({
      message0: "%1",
      args0: [
        {
          type: "field_dropdown",
          name: "VALUE",
          options: [
            ["ĐÚNG", "true"],
            ["SAI", "false"],
          ],
        },
      ],
      output: "Boolean",
      colour: colour.logic,
    });
  },
};

javascriptGenerator.forBlock["ct_boolean"] = function (block) {
  return [
    block.getFieldValue("VALUE"),
    javascriptGenerator.ORDER_ATOMIC,
  ];
};

/* =====================================================
   16. VÀ / HOẶC
===================================================== */

Blockly.Blocks["ct_logic"] = {
  init() {
    this.jsonInit({
      message0: "%1 %2 %3",
      args0: [
        {
          type: "input_value",
          name: "A",
          check: "Boolean",
        },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["VÀ", "AND"],
            ["HOẶC", "OR"],
          ],
        },
        {
          type: "input_value",
          name: "B",
          check: "Boolean",
        },
      ],
      output: "Boolean",
      colour: colour.logic,
    });
  },
};

javascriptGenerator.forBlock["ct_logic"] = function (block) {
  const a =
    javascriptGenerator.valueToCode(
      block,
      "A",
      javascriptGenerator.ORDER_LOGICAL_AND
    ) || "false";

  const b =
    javascriptGenerator.valueToCode(
      block,
      "B",
      javascriptGenerator.ORDER_LOGICAL_AND
    ) || "false";

  const op =
    block.getFieldValue("OP") === "AND"
      ? "&&"
      : "||";

  return [
    `(${a} ${op} ${b})`,
    javascriptGenerator.ORDER_LOGICAL_AND,
  ];
};

/* =====================================================
   17. NOT
===================================================== */

Blockly.Blocks["ct_not"] = {
  init() {
    this.jsonInit({
      message0: "KHÔNG %1",
      args0: [
        {
          type: "input_value",
          name: "VALUE",
          check: "Boolean",
        },
      ],
      output: "Boolean",
      colour: colour.logic,
    });
  },
};

javascriptGenerator.forBlock["ct_not"] = function (block) {
  const value =
    javascriptGenerator.valueToCode(
      block,
      "VALUE",
      javascriptGenerator.ORDER_LOGICAL_NOT
    ) || "false";

  return [
    `(!${value})`,
    javascriptGenerator.ORDER_LOGICAL_NOT,
  ];
};

/* =====================================================
   18. NẾU ... THÌ  (CHỈ MỘT KHỐI)
   Dùng khối controls_if chuẩn của Blockly. Bấm biểu tượng ⚙ trên khối để thêm
   nhánh "NẾU KHÔNG THÌ NẾU" và/hoặc "NẾU KHÔNG THÌ".
   Hỗ trợ mọi nhánh IF0..IFn và ELSE.
   Khối NẾU ... NẾU KHÔNG THÌ riêng (controls_ifelse) đã bị gỡ; file dự án cũ được
   chuyển tự động sang khối này (xem legacyMigration.js).
===================================================== */

function generateIfBranches(block) {
  return generateIfElseChain(block, javascriptGenerator);
}

javascriptGenerator.forBlock["controls_if"] = generateIfBranches;

{
  // Đồng màu với nhóm "Điều khiển" thay vì màu "Logic" mặc định của Blockly.
  const coreIf = Blockly.Blocks["controls_if"];
  const coreInit = coreIf.init;
  coreIf.init = function () {
    coreInit.call(this);
    this.setColour(colour.control);
  };
}

// Gỡ khối trùng lặp (Blockly có sẵn một bản controls_ifelse riêng).
delete Blockly.Blocks["controls_ifelse"];
delete javascriptGenerator.forBlock["controls_ifelse"];

/* =====================================================
   19. DỰ PHÒNG: vị trí số thứ tự cho nhóm lệnh tiếp theo
===================================================== */

/* =====================================================
   20. LED
===================================================== */

Blockly.Blocks["ct_led"] = {
  init() {
    this.jsonInit({
      message0: "%1 LED",
      args0: [
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["BẬT", "ON"],
            ["TẮT", "OFF"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.robot,
    });
  },
};

javascriptGenerator.forBlock["ct_led"] = function (block) {
  return `robot.led("${block.getFieldValue("STATE")}");\n`;
};

/* =====================================================
   21. BUZZER
===================================================== */

Blockly.Blocks["ct_buzzer"] = {
  init() {
    initWithShadows(this, {
      message0: "CÒI %1 Hz",
      args0: [
        { type: "input_value", name: "FREQ", check: ANY_VALUE, shadow: 1000 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.robot,
    });
  },
};

javascriptGenerator.forBlock["ct_buzzer"] = function (block) {
  return (
    `robot.buzzer(` +
    `${valueCode(block, "FREQ", "1000")});\n`
  );
};

/* =====================================================
   22. SERVO
===================================================== */

Blockly.Blocks["ct_servo"] = {
  init() {
    initWithShadows(this, {
      message0: "SERVO %1 ĐỘ",
      args0: [
        { type: "input_value", name: "ANGLE", check: ANY_VALUE, shadow: 90 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.robot,
    });
  },
};

javascriptGenerator.forBlock["ct_servo"] = function (block) {
  return (
    `robot.servo(` +
    `${valueCode(block, "ANGLE", "90")});\n`
  );
};

/* =====================================================
   DONE
===================================================== */

console.log(
  "CT Robot EDU: robotBlocks.js v10.0 loaded successfully"
);
/* =====================================================
   TẦNG 2 - GPIO
===================================================== */

function gpioPinShadow(input) {
  if (input?.connection) {
    input.connection.setShadowDom(Blockly.utils.xml.textToDom(`
      <shadow type="math_number"><field name="NUM">2</field></shadow>
    `));
  }
}

Blockly.Blocks["ct_gpio_write"] = {
  init() {
    this.jsonInit({
      message0: "GPIO %1 → %2",
      args0: [
        { type: "input_value", name: "PIN", check: ANY_VALUE },
        { type: "field_dropdown", name: "STATE", options: [["BẬT", "HIGH"], ["TẮT", "LOW"]] },
      ], previousStatement: null, nextStatement: null, colour: "#0f766e",
    });
    gpioPinShadow(this.getInput("PIN"));
  },
};
javascriptGenerator.forBlock["ct_gpio_write"] = block => `gpioWrite(${valueCode(block, "PIN", "2")}, ${block.getFieldValue("STATE")});\n`;

Blockly.Blocks["ct_gpio_read"] = {
  init() {
    this.jsonInit({ message0: "ĐỌC GPIO %1", args0: [{ type: "input_value", name: "PIN", check: ANY_VALUE }], output: "Number", colour: "#0f766e" });
    gpioPinShadow(this.getInput("PIN"));
  },
};
javascriptGenerator.forBlock["ct_gpio_read"] = block => [ `gpioRead(${valueCode(block, "PIN", "2")})`, javascriptGenerator.ORDER_ATOMIC ];

Blockly.Blocks["ct_gpio_pwm"] = {
  init() {
    this.jsonInit({
      message0: "PWM GPIO %1 = %2 %",
      args0: [
        { type: "input_value", name: "PIN", check: ANY_VALUE },
        { type: "input_value", name: "VALUE", check: ANY_VALUE },
      ], previousStatement: null, nextStatement: null, colour: "#0f766e",
    });
    gpioPinShadow(this.getInput("PIN"));
    this.getInput("VALUE")?.connection?.setShadowDom(Blockly.utils.xml.textToDom(`<shadow type="math_number"><field name="NUM">50</field></shadow>`));
  },
};
javascriptGenerator.forBlock["ct_gpio_pwm"] = block => `gpioPwm(${valueCode(block, "PIN", "2")}, ${valueCode(block, "VALUE", "50")});\n`;

/* =====================================================
   TẦNG 2 - DIGITAL / ANALOG (pin menu theo board)
   Các FieldDropdown dùng menu generator để đồng bộ với
   phần cứng đã chọn trong ứng dụng.
===================================================== */

const IO_COLOUR = "#0e7490";
let activeHardwareProfile = {
  id: "arduino-nano",
  board: "Arduino Nano Classic",
  mcu: "ATmega328P",
  platform: "avr",
};

function getPinOptions(kind) {
  if (activeHardwareProfile.platform === "esp32") {
    const isS3 = activeHardwareProfile.mcu === "ESP32-S3";
    const outputPins = isS3
      ? [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21]
      : [4, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
    const analogPins = isS3
      ? [1, 2, 4, 5, 6, 7, 8, 9, 10]
      : [32, 33, 34, 35, 36, 39]; // ADC1: hoạt động ổn định hơn khi dùng Wi-Fi.

    if (kind === "analog") return analogPins.map(pin => [`GPIO${pin}`, String(pin)]);
    if (kind === "pwm") return outputPins.map(pin => [`~GPIO${pin}`, String(pin)]);
    if (kind === "digitalRead") {
      const inputPins = isS3 ? outputPins : [...outputPins, 34, 35, 36, 39];
      return inputPins.map(pin => [`GPIO${pin}`, String(pin)]);
    }
    return outputPins.map(pin => [`GPIO${pin}`, String(pin)]);
  }

  const isNano = /nano/i.test(activeHardwareProfile.id);
  const digitalPins = [
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(pin => [`D${pin}`, String(pin)]),
    ...["A0", "A1", "A2", "A3", "A4", "A5"].map(pin => [pin, pin]),
  ];
  const analogPins = ["A0", "A1", "A2", "A3", "A4", "A5", ...(isNano ? ["A6", "A7"] : [])]
    .map(pin => [pin, pin]);
  const pwmPins = [3, 5, 6, 9, 10, 11].map(pin => [`~D${pin}`, String(pin)]);

  if (kind === "analog") return analogPins;
  if (kind === "pwm") return pwmPins;
  return digitalPins;
}

const digitalPinOptions = () => getPinOptions("digital");
const digitalInputPinOptions = () => getPinOptions("digitalRead");
const pwmPinOptions = () => getPinOptions("pwm");
const analogPinOptions = () => getPinOptions("analog");

const PIN_FIELDS = {
  ct_pin_mode: { PIN: digitalPinOptions },
  ct_digital_write: { PIN: digitalPinOptions },
  ct_digital_read: { PIN: digitalInputPinOptions },
  ct_analog_read: { PIN: analogPinOptions },
  ct_analog_write: { PIN: pwmPinOptions },
};

export function setActiveHardwareProfile(workspace, profile) {
  activeHardwareProfile = {
    id: profile?.id || "arduino-nano",
    board: profile?.board || "Arduino Nano Classic",
    mcu: profile?.mcu || "ATmega328P",
    platform: profile?.platform || "avr",
  };

  if (!workspace) return;

  // Blockly 11's dropdown fields cache dynamic options internally. Clear that
  // cache so existing blocks immediately receive options for the new board.
  workspace.getAllBlocks(false).forEach(block => {
    const fieldGenerators = PIN_FIELDS[block.type];
    if (!fieldGenerators) return;

    Object.entries(fieldGenerators).forEach(([fieldName, generator]) => {
      const field = block.getField(fieldName);
      if (!field) return;
      field.menuGenerator_ = generator;
      field.generatedOptions = null;
      const options = field.getOptions(false);
      const currentValue = field.getValue();
      const nextValue = options.some(option => option[1] === currentValue)
        ? currentValue
        : options[0][1];
      // Force FieldDropdown to refresh its visible label when the same pin
      // number has a different board-specific label (for example D5 -> GPIO5).
      const temporaryValue = options.find(option => option[1] !== nextValue)?.[1];
      if (temporaryValue !== undefined) field.setValue(temporaryValue, false);
      field.setValue(nextValue, false);
      field.forceRerender();
    });
  });
}

/* ---- pinMode ---- */
Blockly.Blocks["ct_pin_mode"] = {
  init() {
    this.appendDummyInput()
      .appendField("ĐẶT CHÂN")
      .appendField(new Blockly.FieldDropdown(digitalPinOptions), "PIN")
      .appendField("LÀ")
      .appendField(new Blockly.FieldDropdown([
        ["NGÕ RA (OUTPUT)", "OUTPUT"],
        ["NGÕ VÀO (INPUT)", "INPUT"],
        ["NGÕ VÀO + PULL-UP", "INPUT_PULLUP"],
      ]), "MODE");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(IO_COLOUR);
    this.setTooltip("Chọn GPIO theo board hiện tại, sau đó đặt là ngõ vào hoặc ngõ ra.");
  },
};
javascriptGenerator.forBlock["ct_pin_mode"] = block =>
  `pinMode(${block.getFieldValue("PIN")}, ${block.getFieldValue("MODE")});\n`;

/* ---- digitalWrite ---- */
Blockly.Blocks["ct_digital_write"] = {
  init() {
    this.appendDummyInput()
      .appendField("DIGITAL GHI CHÂN")
      .appendField(new Blockly.FieldDropdown(digitalPinOptions), "PIN")
      .appendField("=")
      .appendField(new Blockly.FieldDropdown([
        ["CAO (HIGH)", "HIGH"],
        ["THẤP (LOW)", "LOW"],
      ]), "STATE");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(IO_COLOUR);
    this.setTooltip("digitalWrite(): xuất mức HIGH hoặc LOW trên chân của board đang chọn.");
  },
};
javascriptGenerator.forBlock["ct_digital_write"] = block =>
  `digitalWrite(${block.getFieldValue("PIN")}, ${block.getFieldValue("STATE")});\n`;

/* ---- digitalRead ---- */
Blockly.Blocks["ct_digital_read"] = {
  init() {
    this.appendDummyInput()
      .appendField("DIGITAL ĐỌC CHÂN")
      .appendField(new Blockly.FieldDropdown(digitalInputPinOptions), "PIN");
    this.setOutput(true, "Number");
    this.setColour(IO_COLOUR);
    this.setTooltip("digitalRead(): trả về 1 (HIGH) hoặc 0 (LOW). ESP32 classic hỗ trợ đọc thêm GPIO34–39 (chỉ input).");
  },
};
javascriptGenerator.forBlock["ct_digital_read"] = block => [
  `digitalRead(${block.getFieldValue("PIN")})`,
  javascriptGenerator.ORDER_ATOMIC,
];

/* ---- analogRead ---- */
Blockly.Blocks["ct_analog_read"] = {
  init() {
    this.appendDummyInput()
      .appendField("ANALOG ĐỌC CHÂN")
      .appendField(new Blockly.FieldDropdown(analogPinOptions), "PIN")
      .appendField("(ADC)");
    this.setOutput(true, "Number");
    this.setColour(IO_COLOUR);
    this.setTooltip("Đọc ADC. Arduino UNO/Nano trả về 0–1023; ESP32 thường trả về 0–4095.");
  },
};
javascriptGenerator.forBlock["ct_analog_read"] = block => [
  `analogRead(${block.getFieldValue("PIN")})`,
  javascriptGenerator.ORDER_ATOMIC,
];

/* ---- analogWrite (PWM) ---- */
Blockly.Blocks["ct_analog_write"] = {
  init() {
    this.appendDummyInput()
      .appendField("ANALOG GHI (PWM) CHÂN")
      .appendField(new Blockly.FieldDropdown(pwmPinOptions), "PIN")
      .appendField("=");
    this.appendValueInput("VALUE").setCheck(ANY_VALUE);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(IO_COLOUR);
    this.setTooltip("analogWrite(): PWM 0–255. Danh sách chỉ hiển thị chân PWM hợp lệ theo board.");
    this.getInput("VALUE")?.connection?.setShadowDom(
      Blockly.utils.xml.textToDom(`<shadow type="math_number"><field name="NUM">128</field></shadow>`)
    );
  },
};
javascriptGenerator.forBlock["ct_analog_write"] = block =>
  `analogWrite(${block.getFieldValue("PIN")}, constrain(${valueCode(block, "VALUE", "128")}, 0, 255));\n`;

/* ---- map(): đổi thang đo, hay dùng với analogRead -> analogWrite ---- */
Blockly.Blocks["ct_map_range"] = {
  init() {
    initWithShadows(this, {
      message0: "ĐỔI %1 TỪ %2 – %3 SANG %4 – %5",
      args0: [
        { type: "input_value", name: "VALUE", check: ANY_VALUE, shadow: 0 },
        { type: "input_value", name: "IN_MIN", check: ANY_VALUE, shadow: 0 },
        { type: "input_value", name: "IN_MAX", check: ANY_VALUE, shadow: 1023 },
        { type: "input_value", name: "OUT_MIN", check: ANY_VALUE, shadow: 0 },
        { type: "input_value", name: "OUT_MAX", check: ANY_VALUE, shadow: 255 },
      ],
      inputsInline: true,
      output: "Number",
      colour: IO_COLOUR,
      tooltip: "map(): chuyển giá trị từ thang này sang thang khác.",
    });
  },
};
javascriptGenerator.forBlock["ct_map_range"] = block => [
  `map(${valueCode(block, "VALUE", "0")}, ${valueCode(block, "IN_MIN", "0")}, ${valueCode(block, "IN_MAX", "1023")}, ${valueCode(block, "OUT_MIN", "0")}, ${valueCode(block, "OUT_MAX", "255")})`,
  javascriptGenerator.ORDER_ATOMIC,
];


/* =====================================================
   HIỆU CHỈNH ROBOT (khối trong chương trình)
   Đặt ở đầu chương trình để áp dụng giá trị cho cả chương trình.
===================================================== */

Blockly.Blocks["ct_calibrate"] = {
  init() {
    initWithShadows(this, {
      message0: "HIỆU CHỈNH | quay 1° = %1 ms",
      args0: [
        { type: "input_value", name: "TURN_MS", check: ANY_VALUE, shadow: 6 },
      ],
      message1: "bánh trái %1 % | bánh phải %2 %",
      args1: [
        { type: "input_value", name: "LEFT", check: ANY_VALUE, shadow: 100 },
        { type: "input_value", name: "RIGHT", check: ANY_VALUE, shadow: 100 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: colour.robot,
      tooltip: "Chỉnh thời gian quay 1 độ và tốc độ từng bánh. Đặt ở đầu chương trình.",
    });
  },
};

javascriptGenerator.forBlock["ct_calibrate"] = function (block) {
  return `robot.calibrate(${valueCode(block, "TURN_MS", "6")}, ${valueCode(block, "LEFT", "100")}, ${valueCode(block, "RIGHT", "100")});\n`;
};


/* =====================================================
   SỰ KIỆN: KHI NHẬN / PHÁT (giống "when I receive" / "broadcast")
   Mỗi tên sự kiện thành một hàm void ev_<tên>(). PHÁT gọi hàm đó ngay.
   Robot chạy một luồng nên không có chuyện chạy song song.
===================================================== */

let eventRegistry = null;

function eventName(raw) {
  let s = String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = "su_kien";
  if (/^[0-9]/.test(s)) s = "e_" + s;
  return s;
}

Blockly.Blocks["ct_on_receive"] = {
  init() {
    this.jsonInit({
      message0: "KHI NHẬN SỰ KIỆN %1",
      args0: [{ type: "field_input", name: "NAME", text: "bat_dau" }],
      message1: "%1",
      args1: [{ type: "input_statement", name: "DO" }],
      colour: colour.event,
      tooltip: "Chạy các khối bên trong khi có sự kiện này được PHÁT.",
    });
  },
};

javascriptGenerator.forBlock["ct_on_receive"] = function (block) {
  const name = eventName(block.getFieldValue("NAME"));
  const body = javascriptGenerator.statementToCode(block, "DO");
  if (eventRegistry) {
    // Khối KHI NHẬN không sinh lệnh trong setup(); map nó vào thân hàm sự kiện.
    eventRegistry.receivers[name] = (eventRegistry.receivers[name] || "") + markBlockCode(block.id, body);
  }
  return ""; // không chạy trong setup(), chỉ chạy khi được PHÁT
};

Blockly.Blocks["ct_broadcast"] = {
  init() {
    this.jsonInit({
      message0: "PHÁT SỰ KIỆN %1",
      args0: [{ type: "field_input", name: "NAME", text: "bat_dau" }],
      previousStatement: null,
      nextStatement: null,
      colour: colour.event,
      tooltip: "Gửi sự kiện: tất cả khối KHI NHẬN SỰ KIỆN cùng tên sẽ chạy.",
    });
  },
};

javascriptGenerator.forBlock["ct_broadcast"] = function (block) {
  const name = eventName(block.getFieldValue("NAME"));
  if (eventRegistry) eventRegistry.broadcasts.add(name);
  return `ev_${name}();\n`;
};

/**
 * Sinh toàn bộ chương trình.
 * main: code cho setup() (từ KHI BẮT ĐẦU)
 * functions: khai báo + định nghĩa các hàm sự kiện (đặt trước setup())
 */
/* Mọi khối ct_* có ô giá trị đều để ô nằm ngang: lồng nhiều biểu thức thì khối dài ra theo chiều ngang. */
for (const type of Object.keys(Blockly.Blocks)) {
  const def = Blockly.Blocks[type];
  if (!type.startsWith("ct_") || typeof def?.init !== "function") continue;
  const baseInit = def.init;
  def.init = function () {
    baseInit.call(this);
    inlineValueInputs(this);
  };
}

export function generateProgram(workspace) {
  // Instrument tại thời điểm sinh mã để bao gồm cả generator của extension đăng ký muộn.
  instrumentBlocklyGenerator(javascriptGenerator);
  eventRegistry = { receivers: {}, broadcasts: new Set() };

  try {
    const main = javascriptGenerator.workspaceToCode(workspace);

    const names = new Set([
      ...eventRegistry.broadcasts,
      ...Object.keys(eventRegistry.receivers),
    ]);

    const declarations = buildProgramDeclarations(workspace);
    if (names.size === 0) return { main, functions: declarations };

    const prototypes = [];
    const definitions = [];
    for (const name of names) {
      prototypes.push(`void ev_${name}();`);
      const body = eventRegistry.receivers[name] || ""; // PHÁT không có KHI NHẬN thì hàm rỗng
      definitions.push(`void ev_${name}() {\n${body}}\n`);
    }

    return {
      main,
      functions: (declarations ? declarations + "\n" : "") + prototypes.join("\n") + "\n\n" + definitions.join("\n"),
    };
  } finally {
    eventRegistry = null;
  }
}
