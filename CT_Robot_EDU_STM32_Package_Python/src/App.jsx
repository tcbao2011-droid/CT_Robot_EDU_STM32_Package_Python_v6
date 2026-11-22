import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import * as Blockly from "blockly";

import { generateProgram, setActiveHardwareProfile } from "./robotBlocks";
import { getHighlightedLineIndexes, stripBlockCodeMarkers } from "./codeSourceMap.js";
import { buildPythonOutput, isPythonSupported, PYTHON_PLACEHOLDER } from "./pythonGenerator.js";
import { BLUETOOTH_TOOLBOX_CATEGORY } from "./bluetoothBlocks";
import { migrateLegacyBlockXml } from "./legacyMigration.js";
import { COMPACT_RENDERER } from "./compactRenderer.js";
import { registerProgramToolbox } from "./programBlocks.js";
import { evaluateProgramValue, runProgramStatement, isProgramValueType, isProgramBooleanType, toNumber } from "./simulatorPrograms.js";
import { filterToolbox, getExtensionToolboxCategories, setActiveExtensionProfile } from "./extensions";
import "./App.css";
import RobotSimulator from "./RobotSimulator";
import { uploadViaServer } from "./uploadServer.js";
import { compileSketch } from "./compiler.js";
import CompileLog from "./CompileLog";
import AssistantPanel from "./assistant/AssistantPanel.jsx";
import {
  DEFAULT_HARDWARE_CONFIG,
  HARDWARE_PROFILES,
  BOARD_GROUPS,
  ROBOT_TYPES,
  buildArduinoSketch,
  profileToConfig,
  resetHardwareConfig,
  validateHardwareConfig,
} from "./hardwareProfiles";

/* =====================================================
   CT ROBOT EDU - APP v10.0
===================================================== */

const initialXml = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="ct_when_started" x="30" y="30"></block>
</xml>
`;

/* =====================================================
   TOOLBOX
===================================================== */

function createToolbox(profile, { raw = false } = {}) {
  const toolbox = {
    kind: "categoryToolbox",
    contents: [
      {
        kind: "category",
        name: "🟢 Sự kiện",
        colour: "#22a06b",
        contents: [
          { kind: "block", type: "ct_when_started" },
          { kind: "block", type: "ct_forever" },
          { kind: "block", type: "ct_on_receive" },
          { kind: "block", type: "ct_broadcast" },
        ],
      },

      {
        kind: "category",
        name: "🟠 Điều khiển",
        colour: "#dd6b20",
        contents: [
          { kind: "block", type: "controls_if" }, // một khối duy nhất; bấm ⚙ để thêm "nếu không"
          { kind: "block", type: "ct_repeat" },
          { kind: "block", type: "ct_for" },
          { kind: "block", type: "ct_while" },
          { kind: "block", type: "ct_repeat_until" },
          { kind: "block", type: "ct_wait_until" },
          { kind: "block", type: "ct_break" },
          { kind: "block", type: "ct_continue" },
        ],
      },

      {
        kind: "category",
        name: "⚫ Logic",
        colour: "#6b7280",
        contents: [
          { kind: "block", type: "ct_compare" },
          { kind: "block", type: "ct_boolean" },
          { kind: "block", type: "ct_logic" },
          { kind: "block", type: "ct_not" },
          { kind: "block", type: "ct_between" },
          { kind: "block", type: "ct_ternary" },
        ],
      },

      {
        kind: "category",
        name: "🟤 Toán",
        colour: "#8b5e3c",
        contents: [
          { kind: "block", type: "math_number" },
          { kind: "block", type: "ct_math_operation" },
          { kind: "block", type: "ct_mod" },
          { kind: "block", type: "ct_pow" },
          { kind: "block", type: "ct_math_func" },
          { kind: "block", type: "ct_minmax" },
          { kind: "block", type: "ct_constrain" },
          { kind: "block", type: "ct_random" },
          { kind: "block", type: "ct_round_places" },
          { kind: "block", type: "ct_math_constant" },
        ],
      },

      {
        kind: "category",
        name: "🔵 Chữ",
        colour: "#3b82f6",
        contents: [
          { kind: "block", type: "ct_text" },
          { kind: "block", type: "ct_join" },
          { kind: "block", type: "ct_text_length" },
          { kind: "block", type: "ct_text_char_at" },
          { kind: "block", type: "ct_text_contains" },
          { kind: "block", type: "ct_text_case" },
          { kind: "block", type: "ct_text_to_number" },
          { kind: "block", type: "ct_serial_print" },
        ],
      },

      { kind: "category", name: "🌸 Biến", colour: "#d6336c", custom: "VARIABLE" },

      { kind: "category", name: "🟩 Danh sách", colour: "#0d9488", custom: "CT_LISTS" },

      BLUETOOTH_TOOLBOX_CATEGORY,

      {
        kind: "category",
        name: "🟠 Thời gian",
        colour: "#805ad5",
        contents: [
          { kind: "block", type: "ct_wait" },
          { kind: "block", type: "ct_wait_ms" },
          { kind: "block", type: "ct_millis" },
        ],
      },

      {
        kind: "category",
        name: "🔵 Analog / Digital",
        colour: "#0e7490",
        requires: "gpio", // ẩn trên board có chân cố định (mạch mở rộng)
        contents: [
          { kind: "block", type: "ct_pin_mode" },
          { kind: "block", type: "ct_digital_write" },
          { kind: "block", type: "ct_digital_read" },
          { kind: "block", type: "ct_analog_read" },
          { kind: "block", type: "ct_analog_write" },
          { kind: "block", type: "ct_map_range" },
        ],
      },

      // Danh mục của các mạch mở rộng đang bật theo board (src/extensions).
      ...getExtensionToolboxCategories(profile),

    ],
  };

  // `raw`: toolbox chưa lọc theo phần cứng (trợ lý AI dùng để biết khối nào bị ẩn).
  if (raw) return toolbox;

  // Chỉ giữ các mục mà phần cứng đang chọn dùng được (src/extensions/capabilities.js).
  return filterToolbox(toolbox, profile);
}

/* =====================================================
   VARIABLE
===================================================== */

function getVariable(workspace, id) {
  if (!workspace || !id) {
    return null;
  }

  return workspace.getVariableById(id);
}

/* =====================================================
   NUMBER EVALUATION
===================================================== */

/** Đối tượng `ev` mà simulatorPrograms.js dùng để đọc biểu thức, biến và danh sách. */
function makeProgramEvaluator(workspace, commands, variables) {
  const ev = {
    num: block => evaluateNumber(block, workspace, variables),
    cond: block => evaluateCondition(block, workspace, variables),
    any: block => evaluateAny(block, workspace, variables),
    getVar: id => {
      if (Object.prototype.hasOwnProperty.call(variables, id)) return variables[id];
      const variable = getVariable(workspace, id);
      return variable && Object.prototype.hasOwnProperty.call(variables, variable.name) ? variables[variable.name] : 0;
    },
    setVar: (id, value) => {
      variables[id] = value;
      const variable = getVariable(workspace, id);
      if (variable) variables[variable.name] = value;
    },
    list: id => (variables[`list:${id}`] ||= []),
    push: command => commands?.push(command),
    run: first => executeBlockChain(first, workspace, commands || [], variables),
  };
  return ev;
}

const BOOLEAN_BLOCK_TYPES = new Set(["ct_compare", "logic_compare", "ct_boolean", "logic_boolean", "ct_logic", "ct_not"]);

/** Giá trị bất kỳ (số, chữ, đúng/sai) của một khối: dùng cho ô nhận mọi kiểu dữ liệu. */
function evaluateAny(block, workspace, variables) {
  if (!block) return 0;
  if (isProgramValueType(block.type)) return evaluateProgramValue(block, makeProgramEvaluator(workspace, null, variables));
  if (block.type === "variables_get") return makeProgramEvaluator(workspace, null, variables).getVar(block.getFieldValue("VAR"));
  if (BOOLEAN_BLOCK_TYPES.has(block.type)) return evaluateCondition(block, workspace, variables);
  return evaluateNumber(block, workspace, variables);
}

function evaluateNumber(
  block,
  workspace,
  variables
) {
  if (!block) {
    return 0;
  }

  if (isProgramValueType(block.type)) {
    return toNumber(evaluateProgramValue(block, makeProgramEvaluator(workspace, null, variables)));
  }

  switch (block.type) {
    case "math_number":
      return Number(block.getFieldValue("NUM")) || 0;

    case "variables_get": {
      const id =
        block.getFieldValue("VAR");

      const variable =
        getVariable(workspace, id);

      if (
        Object.prototype.hasOwnProperty.call(
          variables,
          id
        )
      ) {
        return toNumber(variables[id]);
      }

      if (
        variable &&
        Object.prototype.hasOwnProperty.call(
          variables,
          variable.name
        )
      ) {
        return toNumber(variables[variable.name]);
      }

      return 0;
    }

    // Biểu thức đúng/sai kéo vào ô số: ĐÚNG = 1, SAI = 0
    case "ct_compare":
    case "logic_compare":
    case "ct_boolean":
    case "logic_boolean":
    case "ct_logic":
    case "ct_not":
      return evaluateCondition(block, workspace, variables) ? 1 : 0;

    // Simulator không có phần cứng thật: cảm biến đọc ra 0
    case "ct_digital_read":
    case "ct_analog_read":
      return 0;

    case "ct_map_range": {
      const v = evaluateNumber(block.getInputTargetBlock("VALUE"), workspace, variables);
      const inMin = evaluateNumber(block.getInputTargetBlock("IN_MIN"), workspace, variables);
      const inMax = evaluateNumber(block.getInputTargetBlock("IN_MAX"), workspace, variables);
      const outMin = evaluateNumber(block.getInputTargetBlock("OUT_MIN"), workspace, variables);
      const outMax = evaluateNumber(block.getInputTargetBlock("OUT_MAX"), workspace, variables);
      return inMax === inMin ? outMin : ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }

    case "ct_math_operation": {
      const a =
        evaluateNumber(
          block.getInputTargetBlock("A"),
          workspace,
          variables
        );

      const b =
        evaluateNumber(
          block.getInputTargetBlock("B"),
          workspace,
          variables
        );

      switch (
        block.getFieldValue("OP")
      ) {
        case "ADD":
          return a + b;
        case "SUB":
          return a - b;
        case "MUL":
          return a * b;
        case "DIV":
          return b === 0 ? 0 : a / b;
        default:
          return 0;
      }
    }

    default:
      return 0;
  }
}

/* =====================================================
   CONDITION
===================================================== */

function evaluateCondition(
  block,
  workspace,
  variables
) {
  if (!block) {
    return false;
  }

  if (
    block.type === "ct_compare" ||
    block.type === "logic_compare"
  ) {
    const a =
      evaluateNumber(
        block.getInputTargetBlock("A"),
        workspace,
        variables
      );

    const b =
      evaluateNumber(
        block.getInputTargetBlock("B"),
        workspace,
        variables
      );

    switch (
      block.getFieldValue("OP")
    ) {
      case "GT":
        return a > b;
      case "LT":
        return a < b;
      case "EQ":
        return a === b;
      case "GTE":
        return a >= b;
      case "LTE":
        return a <= b;
      case "NEQ":
        return a !== b;
      default:
        return false;
    }
  }

  if (block.type === "ct_boolean") {
    return (
      block.getFieldValue("VALUE") === "true"
    );
  }

  if (block.type === "logic_boolean") {
    return (
      block.getFieldValue("BOOL") === "TRUE"
    );
  }

  if (block.type === "ct_logic") {
    const a =
      evaluateCondition(
        block.getInputTargetBlock("A"),
        workspace,
        variables
      );

    const b =
      evaluateCondition(
        block.getInputTargetBlock("B"),
        workspace,
        variables
      );

    return block.getFieldValue("OP") === "AND"
      ? a && b
      : a || b;
  }

  if (block.type === "ct_not") {
    return !evaluateCondition(
      block.getInputTargetBlock("VALUE"),
      workspace,
      variables
    );
  }

  if (isProgramBooleanType(block.type) || block.type === "variables_get") {
    return Boolean(evaluateAny(block, workspace, variables));
  }

  return false;
}

/* =====================================================
   COMMAND INTERPRETER
===================================================== */

/* Khối di chuyển của mạch mở rộng CT chạy trong mô phỏng như khối di chuyển của core. */
const SIM_BLOCK_ALIASES = {
  ctexp_forward: "ct_forward",
  ctexp_backward: "ct_backward",
  ctexp_turn_left: "ct_turn_left",
  ctexp_turn_right: "ct_turn_right",
  ctexp_forward_continuous: "ct_forward_continuous",
  ctexp_backward_continuous: "ct_backward_continuous",
  ctexp_turn_left_continuous: "ct_turn_left_continuous",
  ctexp_turn_right_continuous: "ct_turn_right_continuous",
  ctexp_turn_left_angle: "ct_turn_left_angle",
  ctexp_turn_right_angle: "ct_turn_right_angle",
  ctexp_stop: "ct_stop",
};

// Khối di chuyển / LED / còi / servo của các mạch STM32 chạy trong mô phỏng như khối core tương ứng.
for (const prefix of ["stm32bp", "stm32bk", "stm32nuc"]) {
  for (const [suffix, coreType] of [
    ["forward", "ct_forward"], ["backward", "ct_backward"], ["turn_left", "ct_turn_left"], ["turn_right", "ct_turn_right"],
    ["forward_continuous", "ct_forward_continuous"], ["backward_continuous", "ct_backward_continuous"],
    ["turn_left_continuous", "ct_turn_left_continuous"], ["turn_right_continuous", "ct_turn_right_continuous"],
    ["turn_left_angle", "ct_turn_left_angle"], ["turn_right_angle", "ct_turn_right_angle"],
    ["stop", "ct_stop"], ["led", "ct_led"], ["buzzer", "ct_buzzer"], ["servo", "ct_servo"],
  ]) SIM_BLOCK_ALIASES[`${prefix}_${suffix}`] = coreType;
}

function executeBlockChain(
  firstBlock,
  workspace,
  commands,
  variables
) {
  let block = firstBlock;

  while (block) {
    const handled = runProgramStatement(block, makeProgramEvaluator(workspace, commands, variables));
    if (handled) {
      if (handled.signal) return handled.signal; // THOÁT / BỎ QUA: để vòng lặp bên ngoài xử lý
      block = block.getNextBlock();
      continue;
    }

    switch (SIM_BLOCK_ALIASES[block.type] || block.type) {

      case "ct_forward": {
        commands.push({
          type: "forward",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          seconds:
            Math.max(
              0.01,
              evaluateNumber(
                block.getInputTargetBlock("SECONDS"),
                workspace,
                variables
              )
            ),
        });
        break;
      }

      case "ct_backward": {
        commands.push({
          type: "backward",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          seconds:
            Math.max(
              0.01,
              evaluateNumber(
                block.getInputTargetBlock("SECONDS"),
                workspace,
                variables
              )
            ),
        });
        break;
      }

      case "ct_turn_left": {
        commands.push({
          type: "left",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          seconds:
            Math.max(
              0.01,
              evaluateNumber(
                block.getInputTargetBlock("SECONDS"),
                workspace,
                variables
              )
            ),
        });
        break;
      }

      case "ct_turn_right": {
        commands.push({
          type: "right",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          seconds:
            Math.max(
              0.01,
              evaluateNumber(
                block.getInputTargetBlock("SECONDS"),
                workspace,
                variables
              )
            ),
        });
        break;
      }

      case "ct_forward_continuous":
        commands.push({
          type: "forward_continuous",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
        });
        break;

      case "ct_backward_continuous":
        commands.push({
          type: "backward_continuous",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
        });
        break;

      case "ct_turn_left_continuous":
        commands.push({
          type: "left_continuous",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
        });
        break;

      case "ct_turn_right_continuous":
        commands.push({
          type: "right_continuous",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
        });
        break;

      /* ==============================================
         QUAY THEO GÓC
      ============================================== */

      case "ct_turn_left_angle":
        commands.push({
          type: "turn_left_angle",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          degrees:
            Math.max(
              0,
              evaluateNumber(
                block.getInputTargetBlock("DEGREES"),
                workspace,
                variables
              )
            ),
        });
        break;

      case "ct_turn_right_angle":
        commands.push({
          type: "turn_right_angle",
          speed:
            evaluateNumber(
              block.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
          degrees:
            Math.max(
              0,
              evaluateNumber(
                block.getInputTargetBlock("DEGREES"),
                workspace,
                variables
              )
            ),
        });
        break;

      case "ct_stop":
        commands.push({
          type: "stop",
        });
        break;

      case "ct_wait":
        commands.push({
          type: "wait",
          seconds: Math.max(
            0.01,
            evaluateNumber(block.getInputTargetBlock("SECONDS"), workspace, variables)
          ),
        });
        break;

      case "ct_motor_left":
        commands.push({
          type: "motorLeft",
          speed: evaluateNumber(block.getInputTargetBlock("SPEED"), workspace, variables),
          seconds: 0.1,
        });
        break;

      case "ct_motor_right":
        commands.push({
          type: "motorRight",
          speed: evaluateNumber(block.getInputTargetBlock("SPEED"), workspace, variables),
          seconds: 0.1,
        });
        break;

      case "controls_if": {
        let selectedBody = null;
        let branch = 0;
        while (block.getInput(`IF${branch}`)) {
          const condition = evaluateCondition(
            block.getInputTargetBlock(`IF${branch}`),
            workspace,
            variables
          );
          if (condition) {
            selectedBody = block.getInputTargetBlock(`DO${branch}`);
            break;
          }
          branch += 1;
        }
        if (!selectedBody && block.getInput("ELSE")) {
          selectedBody = block.getInputTargetBlock("ELSE");
        }
        if (selectedBody) {
          const signal = executeBlockChain(selectedBody, workspace, commands, variables);
          if (signal) return signal;
        }
        break;
      }

      case "ct_repeat": {
        const times = Math.max(
          1,
          Math.min(
            100,
            Math.floor(
              evaluateNumber(block.getInputTargetBlock("TIMES"), workspace, variables) || 1
            )
          )
        );

        const child =
          block.getInputTargetBlock("DO");

        if (child) {
          for (let i = 0; i < times; i++) {
            const signal = executeBlockChain(child, workspace, commands, variables);
            if (signal === "break") break;
          }
        }
        break;
      }

      case "ct_forever": {
        const child =
          block.getInputTargetBlock("DO");

        if (child) {
          for (let i = 0; i < 20; i++) {
            const signal = executeBlockChain(child, workspace, commands, variables);
            if (signal === "break") break;
          }
        }
        break;
      }

      case "ct_gpio_write":
        commands.push({ type: "gpioWrite", pin: evaluateNumber(block.getInputTargetBlock("PIN"), workspace, variables), state: block.getFieldValue("STATE") });
        break;

      case "ct_gpio_pwm":
        commands.push({ type: "gpioPwm", pin: evaluateNumber(block.getInputTargetBlock("PIN"), workspace, variables), value: evaluateNumber(block.getInputTargetBlock("VALUE"), workspace, variables) });
        break;

      case "ct_pin_mode":
        commands.push({ type: "pinMode", pin: block.getFieldValue("PIN"), mode: block.getFieldValue("MODE"), seconds: 0.01 });
        break;

      case "ct_digital_write":
        commands.push({ type: "digitalWrite", pin: block.getFieldValue("PIN"), state: block.getFieldValue("STATE"), seconds: 0.05 });
        break;

      case "ct_analog_write":
        commands.push({ type: "analogWrite", pin: block.getFieldValue("PIN"), value: Math.max(0, Math.min(255, evaluateNumber(block.getInputTargetBlock("VALUE"), workspace, variables))), seconds: 0.05 });
        break;

      case "ct_led":
        commands.push({
          type: "led",
          state:
            block.getFieldValue("STATE"),
          seconds: 0.2,
        });
        break;

      case "ct_buzzer":
        commands.push({
          type: "buzzer",
          frequency:
            evaluateNumber(block.getInputTargetBlock("FREQ"), workspace, variables) || 1000,
          seconds: 0.2,
        });
        break;

      case "ct_servo":
        commands.push({
          type: "servo",
          angle: evaluateNumber(block.getInputTargetBlock("ANGLE"), workspace, variables),
          seconds: 0.2,
        });
        break;

      default:
        break;
    }

    block = block.getNextBlock();
  }
}

/* =====================================================
   PROGRAM → COMMANDS
===================================================== */

function workspaceToCommands(workspace) {
  if (!workspace) {
    return [];
  }

  const commands = [];
  const variables = {};

  const topBlocks =
    workspace.getTopBlocks(true);

  const start =
    topBlocks.find(
      block =>
        block.type === "ct_when_started"
    );

  if (!start) {
    return [];
  }

  const first =
    start.getInputTargetBlock("DO");

  if (!first) {
    return [];
  }

  executeBlockChain(
    first,
    workspace,
    commands,
    variables
  );

  console.log(
    "CT Robot EDU variables:",
    variables
  );

  console.log(
    "CT Robot EDU commands:",
    commands
  );

  return commands;
}

/* =====================================================
   KEYBOARD EVENTS
===================================================== */

function getKeyboardEvents(workspace) {
  const result = {
    ArrowUp: null,
    ArrowDown: null,
    ArrowLeft: null,
    ArrowRight: null,
  };

  if (!workspace) {
    return result;
  }

  const mapping = {
    ct_key_up: "ArrowUp",
    ct_key_down: "ArrowDown",
    ct_key_left: "ArrowLeft",
    ct_key_right: "ArrowRight",
  };

  const topBlocks =
    workspace.getTopBlocks(true);

  const variables = {};

  for (const eventBlock of topBlocks) {
    const key =
      mapping[eventBlock.type];

    if (!key) {
      continue;
    }

    const child =
      eventBlock.getInputTargetBlock("DO");

    if (!child) {
      continue;
    }

    let current = child;
    let command = null;

    while (current) {
      const continuousMap = {
        ct_forward_continuous: "forward",
        ct_backward_continuous: "backward",
        ct_turn_left_continuous: "left",
        ct_turn_right_continuous: "right",
      };

      if (
        continuousMap[current.type]
      ) {
        command = {
          type:
            continuousMap[current.type],
          speed:
            evaluateNumber(
              current.getInputTargetBlock("SPEED"),
              workspace,
              variables
            ),
        };

        break;
      }

      current =
        current.getNextBlock();
    }

    result[key] = command;
  }

  console.log(
    "CT Robot EDU keyboard:",
    JSON.stringify(result, null, 2)
  );

  return result;
}

function buildArduinoCodeOutput(workspace, hardwareConfig) {
  const { main, functions } = generateProgram(workspace);
  if (!main && !functions) {
    return { code: "// Kéo các block vào vùng lập trình...", blockRanges: {} };
  }

  const markedSketch = buildArduinoSketch(hardwareConfig, main, functions);
  return stripBlockCodeMarkers(markedSketch);
}

/** Sinh mã theo ngôn ngữ đang chọn: "cpp" (sketch Arduino) hoặc "python" (MicroPython). */
function buildCodeOutput(workspace, hardwareConfig, language) {
  if (language !== "python") return buildArduinoCodeOutput(workspace, hardwareConfig);
  const { main, functions } = generateProgram(workspace);
  return buildPythonOutput(hardwareConfig, main, functions);
}

/* =====================================================
   BLOCKLY WORKSPACE
===================================================== */

const PANEL_STORAGE_KEY = "ctrobot.hiddenPanels";

const PANEL_LIST = [
  { key: "hardware", label: "Phần cứng" },
  { key: "workspace", label: "Vùng lập trình" },
  { key: "code", label: "Mã" },
  { key: "simulator", label: "Mô phỏng 2D" },
];

function BlocklyWorkspace({
  toolbox,
  onWorkspaceChange,
  onBlockHover,
}) {
  const hostRef =
    useRef(null);

  const callbackRef = useRef(onWorkspaceChange);
  const hoverCallbackRef = useRef(onBlockHover);

  React.useEffect(() => {
    callbackRef.current = onWorkspaceChange;
  }, [onWorkspaceChange]);

  React.useEffect(() => {
    hoverCallbackRef.current = onBlockHover;
  }, [onBlockHover]);

  React.useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const workspace =
      Blockly.inject(
        hostRef.current,
        {
          toolbox,
          trashcan: true,
          scrollbars: true,
          sounds: false,
          renderer: COMPACT_RENDERER,

          grid: {
            spacing: 20,
            length: 3,
            colour: "#dfe5ec",
            snap: true,
          },

          zoom: {
            controls: true,
            wheel: true,
            startScale: 0.9,
            maxScale: 1.5,
            minScale: 0.5,
          },

          move: {
            scrollbars: true,
            drag: true,
            wheel: true,
          },
        }
      );

    registerProgramToolbox(workspace); // nút "Tạo danh sách" + khối danh sách

    // Dùng event delegation để nhận diện block đang hover, kể cả khi rê
    // từ block con ra block cha hoặc ngược lại.
    const blockRoots = new WeakMap();
    let bindFrame = null;

    const findBlockId = target => {
      let node = target;
      while (node && node !== hostRef.current) {
        const id = blockRoots.get(node);
        if (id) return id;
        node = node.parentNode;
      }
      return null;
    };

    const handlePointerOver = event => {
      const id = findBlockId(event.target);
      if (id) hoverCallbackRef.current?.(id);
    };

    const handlePointerOut = event => {
      hoverCallbackRef.current?.(findBlockId(event.relatedTarget));
    };

    const bindBlockRoots = () => {
      bindFrame = null;
      workspace.getAllBlocks(false).forEach(block => {
        const root = block.getSvgRoot?.();
        if (root) blockRoots.set(root, block.id);
      });
    };

    const scheduleBlockBinding = () => {
      if (bindFrame != null) window.cancelAnimationFrame(bindFrame);
      bindFrame = window.requestAnimationFrame(bindBlockRoots);
    };

    hostRef.current.addEventListener("pointerover", handlePointerOver);
    hostRef.current.addEventListener("pointerout", handlePointerOut);

    try {
      const dom =
        Blockly.utils.xml.textToDom(
          initialXml
        );

      Blockly.Xml.domToWorkspace(
        dom,
        workspace
      );
    } catch (error) {
      console.error(
        "Blockly XML:",
        error
      );
    }

    const update = () => {
      scheduleBlockBinding();
      callbackRef.current(workspace);
    };

    workspace.addChangeListener(update);
    bindBlockRoots();
    update();

    // Khi khu vực được ẩn/hiện hoặc đổi kích thước, Blockly cần tính lại kích thước.
    let resizeFrame = null;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (resizeFrame != null) window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            const el = hostRef.current;
            if (el && el.offsetWidth > 0 && el.offsetHeight > 0) Blockly.svgResize(workspace);
          });
        })
      : null;
    resizeObserver?.observe(hostRef.current);

    return () => {
      resizeObserver?.disconnect();
      if (resizeFrame != null) window.cancelAnimationFrame(resizeFrame);
      workspace.removeChangeListener(update);
      if (bindFrame != null) window.cancelAnimationFrame(bindFrame);
      hostRef.current?.removeEventListener("pointerover", handlePointerOver);
      hostRef.current?.removeEventListener("pointerout", handlePointerOut);
      workspace.dispose();
    };
  }, [toolbox]);

  return (
    <div
      ref={hostRef}
      className="blockly-host"
    />
  );
}

/* =====================================================
   APP
===================================================== */

export default function App() {
  const [workspace, setWorkspace] =
    useState(null);

  const [code, setCode] =
    useState(
      "// Kéo các block vào vùng lập trình..."
    );

  const [blockCodeRanges, setBlockCodeRanges] = useState({});
  const [codeLanguage, setCodeLanguage] = useState("cpp");
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const codeScrollRef = useRef(null);

  const [commands, setCommands] =
    useState([]);

  const [keyboardEvents, setKeyboardEvents] =
    useState({
      ArrowUp: null,
      ArrowDown: null,
      ArrowLeft: null,
      ArrowRight: null,
    });

  const [running, setRunning] =
    useState(false);

  const [runId, setRunId] =
    useState(0);

  const [status, setStatus] =
    useState("Sẵn sàng");

  const [port, setPort] =
    useState("Chưa kết nối");

  const [hardwareConfig, setHardwareConfig] =
    useState(DEFAULT_HARDWARE_CONFIG);

  // Bắt buộc xác nhận phần cứng trước khi mở vùng lập trình.
  const [hardwareSetupComplete, setHardwareSetupComplete] = useState(false);
  const [hasConfiguredHardware, setHasConfiguredHardware] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState(DEFAULT_HARDWARE_CONFIG.profileId);
  const [pendingRobotType, setPendingRobotType] = useState(DEFAULT_HARDWARE_CONFIG.robotType);

  const selectedProfile =
    Object.values(HARDWARE_PROFILES).find(p => p.id === hardwareConfig.profileId) || HARDWARE_PROFILES.ARDUINO_NANO_L298N;

  const pythonSupported = isPythonSupported(selectedProfile);

  // STM32 dùng tên chân của chip (PA0, PB12...), các board khác dùng số GPIO.
  const pinsAreNamed = selectedProfile.platform === "stm32";
  const pinInputType = pinsAreNamed ? "text" : "number";
  const updatePin = (group, key, value) => {
    setHardwareConfig(current => ({
      ...current,
      [group]: { ...current[group], [key]: pinsAreNamed ? String(value).trim().toUpperCase() : Number(value) },
    }));
  };

  const openHardwareSetup = () => {
    setPendingProfileId(hardwareConfig.profileId);
    setPendingRobotType(hardwareConfig.robotType);
    setHardwareSetupComplete(false);
  };

  const confirmHardwareSetup = () => {
    // Giữ nguyên cấu hình GPIO/động cơ tùy chỉnh nếu người dùng chỉ xác nhận lại board hiện tại.
    const nextConfig = pendingProfileId === hardwareConfig.profileId
      ? { ...hardwareConfig, robotType: pendingRobotType }
      : profileToConfig(pendingProfileId, pendingRobotType);
    setHardwareConfig(nextConfig);
    setHardwareSetupComplete(true);
    setHasConfiguredHardware(true);
    setStatus(`Đã chọn phần cứng: ${selectedSetupProfile.name}`);
  };

  const selectedSetupProfile =
    Object.values(HARDWARE_PROFILES).find(p => p.id === pendingProfileId)
    || HARDWARE_PROFILES.ARDUINO_NANO_L298N;

  const [simulatorHeight, setSimulatorHeight] =
    useState(360);

  // Ẩn/hiện các khu vực giao diện; nhớ lựa chọn cho lần mở sau.
  const [hiddenPanels, setHiddenPanels] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (_) {
      return {};
    }
  });

  const setPanelHidden = (key, hidden) => {
    setHiddenPanels(current => {
      const next = { ...current, [key]: hidden };
      try { window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };
  const hidePanel = key => () => setPanelHidden(key, true);
  const topAreaHidden = !!hiddenPanels.workspace && !!hiddenPanels.code;

  const resizeRef =
    useRef(null);

  const toolbox =
    useMemo(
      () => createToolbox(null),
      []
    );

  // Toolbox theo board đang chọn: nguồn dữ liệu cho trợ lý (tìm khối, kiểm tra lỗi).
  const assistantToolbox = useMemo(
    () => { setActiveExtensionProfile(selectedProfile); return createToolbox(selectedProfile); },
    [selectedProfile.id]
  );
  const assistantRawToolbox = useMemo(
    () => { setActiveExtensionProfile(selectedProfile); return createToolbox(selectedProfile, { raw: true }); },
    [selectedProfile.id]
  );

  /* =====================================================
     WORKSPACE CHANGE
  ===================================================== */

  const handleWorkspaceChange =
    useCallback(
      ws => {
        setWorkspace(ws);

        try {
          const output = buildCodeOutput(ws, hardwareConfig, codeLanguage);
          setCode(output.code);
          setBlockCodeRanges(output.blockRanges);
        } catch (error) {
          console.error("Arduino generator:", error);
          setCode(codeLanguage === "python" ? "# Không thể sinh mã Python." : "// Không thể sinh mã Arduino.");
          setBlockCodeRanges({});
        }

        setCommands(
          workspaceToCommands(ws)
        );

        setKeyboardEvents(
          getKeyboardEvents(ws)
        );
      },
      [hardwareConfig, codeLanguage]
    );

  // Đổi board => cập nhật toolbox (khối của mạch mở rộng) mà không dựng lại workspace.
  React.useEffect(() => {
    setActiveExtensionProfile(selectedProfile);
    if (workspace) workspace.updateToolbox(createToolbox(selectedProfile));
  }, [workspace, selectedProfile.id]);

  React.useEffect(() => {
    setActiveExtensionProfile(selectedProfile);
    setActiveHardwareProfile(workspace, selectedProfile);
    if (!workspace) return;
    try {
      const output = buildCodeOutput(workspace, hardwareConfig, codeLanguage);
      setCode(output.code);
      setBlockCodeRanges(output.blockRanges);
    } catch (error) {
      console.error("Arduino generator:", error);
      setCode(codeLanguage === "python" ? "# Không thể sinh mã Python." : "// Không thể sinh mã Arduino.");
      setBlockCodeRanges({});
    }
  }, [hardwareConfig, workspace, codeLanguage]);

  React.useEffect(() => {
    if (!hoveredBlockId) return;
    const ranges = blockCodeRanges[hoveredBlockId];
    if (!ranges?.length || !codeScrollRef.current) return;

    const firstLine = getHighlightedLineIndexes(code, [ranges[0]])[0];
    if (firstLine == null) return;

    const lineElement = codeScrollRef.current.querySelector(`[data-code-line="${firstLine}"]`);
    lineElement?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }, [hoveredBlockId, blockCodeRanges, code]);

  const highlightedCodeLines = useMemo(() => {
    const ranges = hoveredBlockId ? blockCodeRanges[hoveredBlockId] || [] : [];
    return new Set(getHighlightedLineIndexes(code, ranges));
  }, [code, blockCodeRanges, hoveredBlockId]);

  /* =====================================================
     BIÊN DỊCH & NẠP THEO BOARD ĐANG CHỌN
  ===================================================== */

  const [logLines, setLogLines] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [compiling, setCompiling] = useState(false);

  const handleCompileOnly = async () => {
    if (codeLanguage === "python") {
      setStatus("ℹ Mã Python không biên dịch bằng Arduino CLI: hãy xuất .py và nạp bằng Thonny hoặc mpremote.");
      return;
    }
    const validationErrors = validateHardwareConfig(hardwareConfig);
    if (validationErrors.length) {
      setLogLines(validationErrors.map(message => `❌ ${message}`));
      setStatus(`❌ ${validationErrors[0]}`);
      return;
    }
    if (!code || code.startsWith("// Kéo các block")) {
      setStatus("⚠ Hãy tạo chương trình bằng Blockly trước khi biên dịch.");
      return;
    }

    setCompiling(true);
    setLogLines([]);
    const addLog = line => setLogLines(prev => [...prev, line]);
    setStatus(`🧩 Đang kiểm tra biên dịch cho ${selectedProfile.name}...`);
    addLog(`▶ Board: ${selectedProfile.name}`);
    addLog(`▶ FQBN: ${selectedProfile.fqbn}`);
    addLog("▶ Bắt đầu biên dịch (chưa nạp vào board)");
    try {
      const result = await compileSketch(code, addLog, selectedProfile.fqbn);
      addLog(`✅ Biên dịch thành công: ${result.fileName || `firmware.${result.format || "bin"}`}`);
      setStatus(`✅ Biên dịch thành công cho ${selectedProfile.name}. Chưa nạp vào robot.`);
    } catch (error) {
      const msg = error?.message || String(error);
      addLog(`❌ ${msg}`);
      setStatus(`❌ ${msg}`);
    } finally {
      setCompiling(false);
    }
  };

  const handleCompileAndUpload = () => {
    if (codeLanguage === "python") {
      setStatus("ℹ Mã Python không biên dịch bằng Arduino CLI: hãy xuất .py và nạp bằng Thonny hoặc mpremote.");
      return;
    }
    const validationErrors = validateHardwareConfig(hardwareConfig);
    if (validationErrors.length) {
      setLogLines(validationErrors.map(message => `❌ ${message}`));
      setStatus(`❌ ${validationErrors[0]}`);
      return;
    }

    if (!code || code.startsWith("// Kéo các block")) {
      setStatus("⚠ Hãy tạo chương trình bằng Blockly trước khi nạp.");
      return;
    }

    setUploading(true);
    setLogLines([]);
    const addLog = line => setLogLines(prev => [...prev, line]);
    setStatus(`🔧 Đang biên dịch & nạp cho ${selectedProfile.name}...`);
    addLog(`▶ Board: ${selectedProfile.name}`);
    addLog(`▶ FQBN: ${selectedProfile.fqbn}`);
    addLog("▶ Bắt đầu biên dịch & nạp");

    uploadViaServer(
      code,
      addLog,
      port === "Chưa kết nối" ? null : port,
      selectedProfile
    )
      .then(() => {
        addLog("✅ Nạp thành công");
        setStatus(`✅ Đã nạp chương trình vào ${selectedProfile.name}`);
      })
      .catch(error => {
        const msg = error?.message || String(error);
        setStatus(`❌ ${msg}`);
        addLog(`❌ ${msg}`);
      })
      .finally(() => setUploading(false));
  };

  /* =====================================================
     RUN
  ===================================================== */

  const runSimulation =
    () => {
      if (!workspace) {
        setStatus(
          "⚠ Workspace chưa sẵn sàng"
        );
        return;
      }

      const freshCommands =
        workspaceToCommands(
          workspace
        );

      const freshKeyboard =
        getKeyboardEvents(
          workspace
        );

      setCommands(
        freshCommands
      );

      setKeyboardEvents(
        freshKeyboard
      );

      if (
        freshCommands.length === 0
      ) {
        if (
          Object.values(
            freshKeyboard
          ).some(Boolean)
        ) {
          setStatus(
            "🎮 Chương trình bàn phím đã sẵn sàng"
          );
        } else {
          setStatus(
            "⚠ Chương trình chưa có lệnh"
          );
        }

        return;
      }

      /*
      Tạo một runId mới cho mỗi lần chạy.
      */

      setRunId(
        value => value + 1
      );

      setRunning(true);

      setStatus(
        "🤖 Simulator đang chạy"
      );
    };

  /* =====================================================
     STOP
  ===================================================== */

  const stopSimulation =
    () => {
      setRunning(false);

      setStatus(
        "⏹ Đã dừng mô phỏng"
      );
    };

  /* =====================================================
     FINISH
  ===================================================== */

  const finishSimulation =
    () => {
      setRunning(false);

      setStatus(
        "✅ Hoàn thành chương trình"
      );
    };

  /* =====================================================
     NEW
  ===================================================== */

  const newProject =
    () => {
      if (!workspace) {
        return;
      }

      setRunning(false);

      workspace.clear();

      try {
        const dom =
          Blockly.utils.xml.textToDom(
            initialXml
          );

        Blockly.Xml.domToWorkspace(
          dom,
          workspace
        );
      } catch (error) {
        console.error(error);
      }

      setCommands([]);

      setKeyboardEvents({
        ArrowUp: null,
        ArrowDown: null,
        ArrowLeft: null,
        ArrowRight: null,
      });

      setCode(
        codeLanguage === "python" ? PYTHON_PLACEHOLDER : "// Kéo các block vào vùng lập trình..."
      );

      setStatus(
        "✨ Đã tạo chương trình mới"
      );
    };

  /* =====================================================
     SAVE
  ===================================================== */

  const saveProject =
    () => {
      if (!workspace) {
        return;
      }

      const dom =
        Blockly.Xml.workspaceToDom(
          workspace
        );

      const xml =
        Blockly.Xml.domToPrettyText(
          dom
        );

      const blob =
        new Blob(
          [xml],
          {
            type:
              "application/xml",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const a =
        document.createElement("a");

      a.href = url;
      a.download =
        "ct-robot-project.xml";

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      setStatus(
        "💾 Đã lưu chương trình"
      );
    };

  /* =====================================================
     OPEN (IMPORT XML)
  ===================================================== */

  const openInputRef = useRef(null);

  const loadProject = event => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !workspace) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const dom = Blockly.utils.xml.textToDom(
          String(reader.result)
        );

        // File dự án cũ: gộp khối NẾU...NẾU KHÔNG THÌ, đổi ô số cũ thành ô nhận biểu thức.
        migrateLegacyBlockXml(dom);

        workspace.clear();
        Blockly.Xml.domToWorkspace(dom, workspace);

        setRunning(false);
        setStatus(
          dom.removedBlockCount
            ? `📂 Đã mở ${file.name} (đã bỏ ${dom.removedBlockCount} khối di chuyển STM32 không còn hỗ trợ)`
            : `📂 Đã mở ${file.name}`
        );
      } catch (error) {
        console.error(error);
        setStatus(
          `❌ Không mở được file: ${error.message}`
        );
      }
    };

    reader.readAsText(file);
  };

  /* =====================================================
     DOWNLOAD CODE
  ===================================================== */

  const downloadCode =
    () => {
      const blob =
        new Blob(
          [code],
          {
            type:
              "text/plain;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement("a");

      a.href = url;
      a.download =
        codeLanguage === "python" ? "main.py" : "ct-robot-code.ino";

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      setStatus(
        codeLanguage === "python" ? "⬇ Đã xuất main.py (MicroPython)" : "⬇ Đã xuất mã Arduino"
      );
    };

  /* =====================================================
     RESIZE
  ===================================================== */

  const startResize =
    event => {
      event.preventDefault();

      resizeRef.current = {
        startY: event.clientY,
        startHeight:
          simulatorHeight,
      };

      const move =
        moveEvent => {
          const resize =
            resizeRef.current;

          if (!resize) {
            return;
          }

          const delta =
            resize.startY -
            moveEvent.clientY;

          setSimulatorHeight(
            Math.max(
              220,
              Math.min(
                650,
                resize.startHeight +
                  delta
              )
            )
          );
        };

      const up = () => {
        resizeRef.current = null;

        document.removeEventListener(
          "mousemove",
          move
        );

        document.removeEventListener(
          "mouseup",
          up
        );

        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener(
        "mousemove",
        move
      );

      document.addEventListener(
        "mouseup",
        up
      );

      document.body.style.cursor =
        "row-resize";

      document.body.style.userSelect =
        "none";
    };

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="app">

      {!hardwareSetupComplete && (
        <div className="hardware-setup-overlay" role="dialog" aria-modal="true" aria-labelledby="hardware-setup-title">
          <section className="hardware-setup-dialog">
            <div className="hardware-setup-heading">
              <div className="hardware-setup-icon">🤖</div>
              <div>
                <h1 id="hardware-setup-title">Chọn phần cứng của bạn</h1>
                <p>Hãy chọn đúng bo mạch đang kết nối trước khi bắt đầu lập trình.</p>
              </div>
            </div>

            <div className="hardware-choice-groups">
              {BOARD_GROUPS.map(group => (
                <div className="hardware-choice-group" key={group.label}>
                  <h2>{group.label}</h2>
                  <div className="hardware-choice-grid">
                    {group.ids.map(id => {
                      const profile = Object.values(HARDWARE_PROFILES).find(item => item.id === id);
                      if (!profile) return null;
                      const selected = pendingProfileId === profile.id;
                      return (
                        <button
                          type="button"
                          key={profile.id}
                          className={`hardware-choice-card${selected ? " selected" : ""}`}
                          aria-pressed={selected}
                          onClick={() => setPendingProfileId(profile.id)}
                        >
                          <span className="hardware-choice-check">{selected ? "✓" : "○"}</span>
                          <strong>{profile.name}</strong>
                          <small>{profile.mcu}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="hardware-setup-details">
              <div>
                <strong>{selectedSetupProfile.name}</strong>
                <p>{selectedSetupProfile.description}</p>
                <small>Arduino CLI: {selectedSetupProfile.fqbn} · Core: {selectedSetupProfile.core}</small>
              </div>
              <label>
                Kiểu robot
                <select value={pendingRobotType} onChange={e => setPendingRobotType(e.target.value)}>
                  <option value={ROBOT_TYPES.TWO_WHEEL}>Robot 2 bánh</option>
                  <option value={ROBOT_TYPES.FOUR_WHEEL}>Robot 4 bánh</option>
                </select>
              </label>
            </div>

            <div className="hardware-setup-note">
              Lưu ý: Nano ở đây là Nano Classic ATmega328P (không phải Nano Every / Nano 33). Với ESP32-S3 và các board tùy biến, hãy kiểm tra sơ đồ chân thực tế trước khi đấu dây. Chân ECHO của cảm biến siêu âm 5V cần hạ mức tín hiệu về 3.3V khi dùng ESP32.
            </div>

            <div className="hardware-setup-actions">
              {hasConfiguredHardware && (
                <button type="button" className="hardware-cancel-button" onClick={() => setHardwareSetupComplete(true)}>
                  Hủy
                </button>
              )}
              <button type="button" className="hardware-confirm-button" onClick={confirmHardwareSetup}>
                Bắt đầu lập trình với board này
              </button>
            </div>
          </section>
        </div>
      )}

      <header className="topbar">

        <div className="brand">

          <div className="logo">
            🤖
          </div>

          <div>
            <b>
              CT Robot EDU
            </b>

            <span>
              Lập trình robot kéo – thả
            </span>
          </div>

        </div>

        <div className="device">
          <div className="active-board-label">
            <small>PHẦN CỨNG</small>
            <strong>{selectedProfile.name}</strong>
          </div>

          <button className="board-change-button" onClick={openHardwareSetup}>
            Đổi board
          </button>

          <label>Port</label>
          <input
            className="port-input"
            value={port === "Chưa kết nối" ? "" : port}
            onChange={e => setPort(e.target.value.trim() || "Chưa kết nối")}
            placeholder="Tự động dò"
            aria-label="Cổng COM hoặc serial; để trống để tự động nhận diện"
            title="Nhập COM3 trên Windows hoặc /dev/ttyUSB0 trên Linux; để trống để tự động nhận diện"
          />

          <label>Robot</label>
          <select
            value={hardwareConfig.robotType}
            onChange={e => setHardwareConfig(current => ({ ...current, robotType: e.target.value }))}
          >
            <option value={ROBOT_TYPES.TWO_WHEEL}>2 bánh</option>
            <option value={ROBOT_TYPES.FOUR_WHEEL}>4 bánh</option>
          </select>
        </div>

      </header>

      <nav className="view-bar" aria-label="Ẩn hoặc hiện các khu vực">
        <span className="view-bar-label">Hiển thị:</span>
        {PANEL_LIST.map(item => {
          const visible = !hiddenPanels[item.key];
          return (
            <button
              key={item.key}
              type="button"
              className={`view-chip${visible ? " on" : ""}`}
              aria-pressed={visible}
              onClick={() => setPanelHidden(item.key, visible)}
              title={visible ? `Ẩn ${item.label}` : `Hiện ${item.label}`}
            >
              <span className="view-chip-icon">{visible ? "👁" : "🚫"}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {!hiddenPanels.hardware && (<>
      <section className="hardware-bar">
        <div className="hardware-title">
          <b>🔧 HARDWARE PROFILE</b>
          <span>{selectedProfile.description}</span>
        </div>
        <select
          value={hardwareConfig.profileId}
          onChange={e => setHardwareConfig(profileToConfig(e.target.value, hardwareConfig.robotType))}
        >
          {BOARD_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.ids.map(id => {
                const profile = Object.values(HARDWARE_PROFILES).find(p => p.id === id);
                return profile ? (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ) : null;
              })}
            </optgroup>
          ))}
        </select>
        {selectedProfile.hasMotors && <div className="pin-summary">
          Chân động cơ: IN1 {hardwareConfig.pins.leftIn1} · IN2 {hardwareConfig.pins.leftIn2} · ENA {hardwareConfig.pins.leftEn} · IN3 {hardwareConfig.pins.rightIn1} · IN4 {hardwareConfig.pins.rightIn2} · ENB {hardwareConfig.pins.rightEn}
        </div>}
        <button type="button" className="panel-hide-btn" onClick={hidePanel("hardware")} title="Ẩn khu vực phần cứng" aria-label="Ẩn khu vực phần cứng">
          ▴ Ẩn
        </button>
      </section>

      <details className="hardware-config">
        <summary>⚙️ Cấu hình GPIO</summary>
        <div className="hardware-config-actions">
          <small>Giá trị hiển thị là sơ đồ đấu nối mặc định/gợi ý của profile; trên board phổ thông, trợ lý chỉ cảnh báo chân đặc biệt của MCU, không khóa các chân theo vai trò motor/cảm biến mẫu. CT Expansion giữ sơ đồ PCB cố định.</small>
          <button type="button" className="secondary" onClick={() => {
            setHardwareConfig(resetHardwareConfig(selectedProfile.id, hardwareConfig.robotType));
            setStatus(`Đã khôi phục cấu hình GPIO mặc định của ${selectedProfile.name}`);
          }}>↺ Khôi phục chân mặc định</button>
        </div>
        <div className="hardware-grid">
          {selectedProfile.hasMotors && (<>
          <div><b>Motor trái</b><label>IN1 <input type={pinInputType} value={hardwareConfig.pins.leftIn1} onChange={e => updatePin("pins", "leftIn1", e.target.value)} /></label><label>IN2 <input type={pinInputType} value={hardwareConfig.pins.leftIn2} onChange={e => updatePin("pins", "leftIn2", e.target.value)} /></label><label>ENA/PWM <input type={pinInputType} value={hardwareConfig.pins.leftEn} onChange={e => updatePin("pins", "leftEn", e.target.value)} /></label></div>
          <div><b>Motor phải</b><label>IN3 <input type={pinInputType} value={hardwareConfig.pins.rightIn1} onChange={e => updatePin("pins", "rightIn1", e.target.value)} /></label><label>IN4 <input type={pinInputType} value={hardwareConfig.pins.rightIn2} onChange={e => updatePin("pins", "rightIn2", e.target.value)} /></label><label>ENB/PWM <input type={pinInputType} value={hardwareConfig.pins.rightEn} onChange={e => updatePin("pins", "rightEn", e.target.value)} /></label></div>
          <div><b>PWM động cơ</b><label>Tần số <input type="number" value={hardwareConfig.motor.pwmFrequency} onChange={e => setHardwareConfig(c => ({ ...c, motor: { ...c.motor, pwmFrequency: Number(e.target.value) } }))} /></label><label>Độ phân giải <input type="number" value={hardwareConfig.motor.pwmResolution} onChange={e => setHardwareConfig(c => ({ ...c, motor: { ...c.motor, pwmResolution: Number(e.target.value) } }))} /></label></div>
          <div><b>Hiệu chỉnh</b>
            <label>Quay 1° (ms) <input type="number" min="1" max="50" step="0.1" value={hardwareConfig.motor.turnMsPerDegree} onChange={e => setHardwareConfig(c => ({ ...c, motor: { ...c.motor, turnMsPerDegree: Math.max(1, Number(e.target.value) || 0) } }))} /></label>
            <label>Bánh trái % <input type="number" min="10" max="200" value={hardwareConfig.motor.leftScale} onChange={e => setHardwareConfig(c => ({ ...c, motor: { ...c.motor, leftScale: Math.max(10, Math.min(200, Number(e.target.value) || 100)) } }))} /></label>
            <label>Bánh phải % <input type="number" min="10" max="200" value={hardwareConfig.motor.rightScale} onChange={e => setHardwareConfig(c => ({ ...c, motor: { ...c.motor, rightScale: Math.max(10, Math.min(200, Number(e.target.value) || 100)) } }))} /></label>
          </div>
          </>)}
          <div><b>Cảm biến</b><label>TRIG <input type={pinInputType} value={hardwareConfig.sensors.trig} onChange={e => updatePin("sensors", "trig", e.target.value)} /></label><label>ECHO <input type={pinInputType} value={hardwareConfig.sensors.echo} onChange={e => updatePin("sensors", "echo", e.target.value)} /></label><label>LINE L/R <input type={pinInputType} value={hardwareConfig.sensors.lineLeft} onChange={e => updatePin("sensors", "lineLeft", e.target.value)} /></label></div>
        </div>
      </details>
      </>)}

      <main className="main">

        <div className={`top-workspace${topAreaHidden ? " panel-hidden" : ""}`}>

          <section className={`workspace-panel${hiddenPanels.workspace ? " panel-hidden" : ""}`}>

            <div className="panel-title">

              <div>
                <b>
                  VÙNG LẬP TRÌNH
                </b>

                <span>
                  Kéo block từ bên trái vào đây
                </span>
              </div>

              <div className="actions">

                <button
                  onClick={newProject}
                >
                  ＋ Mới
                </button>

                <button
                  onClick={() => openInputRef.current?.click()}
                >
                  📂 Mở
                </button>

                <input
                  ref={openInputRef}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  onChange={loadProject}
                  style={{ display: "none" }}
                />

                <button
                  onClick={saveProject}
                >
                  💾 Lưu
                </button>

                <button
                  type="button"
                  className="panel-hide-btn"
                  onClick={hidePanel("workspace")}
                  title="Ẩn vùng lập trình"
                  aria-label="Ẩn vùng lập trình"
                >
                  ◂ Ẩn
                </button>

              </div>

            </div>

            <AssistantPanel
              workspace={workspace}
              toolbox={assistantToolbox}
              rawToolbox={assistantRawToolbox}
              profile={selectedProfile}
              hardwareConfig={hardwareConfig}
            />

            <BlocklyWorkspace
              toolbox={toolbox}
              onWorkspaceChange={handleWorkspaceChange}
              onBlockHover={setHoveredBlockId}
            />

          </section>

          <section className={`code-panel${hiddenPanels.code ? " panel-hidden" : ""}${hiddenPanels.workspace ? " code-panel-wide" : ""}`}>

            <div className="panel-title">

              <div>
                <b>
                  {codeLanguage === "python" ? "MÃ PYTHON (MicroPython)" : "MÃ ARDUINO"}
                </b>

                <span>
                  {hoveredBlockId
                    ? (blockCodeRanges[hoveredBlockId]?.length
                      ? "Đang tô sáng mã của khối đang chọn"
                      : "Khối này không sinh mã riêng")
                    : `${selectedProfile.name} · Rê chuột vào khối để xem mã`}
                </span>
              </div>

              <div className="code-actions">
                <div className="code-lang-switch" role="group" aria-label="Ngôn ngữ mã">
                  <button
                    type="button"
                    className={codeLanguage === "cpp" ? "active" : ""}
                    onClick={() => setCodeLanguage("cpp")}
                  >
                    C++
                  </button>
                  <button
                    type="button"
                    className={codeLanguage === "python" ? "active" : ""}
                    onClick={() => setCodeLanguage("python")}
                    title={pythonSupported ? "MicroPython cho ESP32" : "Board này chưa hỗ trợ Python"}
                  >
                    Python
                  </button>
                </div>

                <button
                  onClick={downloadCode}
                  disabled={codeLanguage === "python" && !pythonSupported}
                >
                  {codeLanguage === "python" ? "⬇ Xuất .py" : "⬇ Xuất .ino"}
                </button>

                <button
                  type="button"
                  className="panel-hide-btn"
                  onClick={hidePanel("code")}
                  title="Ẩn khu vực mã"
                  aria-label="Ẩn khu vực mã"
                >
                  ▸ Ẩn
                </button>
              </div>

            </div>

            <pre className="code" ref={codeScrollRef}>
              <code>
                {code.split("\n").map((line, index) => (
                  <span
                    key={index}
                    data-code-line={index}
                    className={`code-line${highlightedCodeLines.has(index) ? " code-line-highlighted" : ""}`}
                  >
                    {line || " "}
                  </span>
                ))}
              </code>
            </pre>

          </section>

        </div>

        <div
          className={`simulator-resizer${hiddenPanels.simulator || topAreaHidden ? " panel-hidden" : ""}`}
          onMouseDown={startResize}
          title="Kéo để thay đổi kích thước Simulator"
        />

        <section
          className={`simulator-panel${hiddenPanels.simulator ? " panel-hidden" : ""}${topAreaHidden ? " simulator-panel-fill" : ""}`}
          style={topAreaHidden ? undefined : {
            height:
              `${simulatorHeight}px`,
          }}
        >

          <RobotSimulator
            commands={commands}
            hardwareConfig={hardwareConfig}
            keyboardEvents={
              keyboardEvents
            }
            running={running}
            runId={runId}
            onFinish={
              finishSimulation
            }
            onHide={hidePanel("simulator")}
          />

        </section>

      </main>

      <footer className="footer">

        <div>

          <span className="dot"></span>

          {status}

        </div>

        <div className="footer-actions">

          <button
            className="secondary"
            onClick={runSimulation}
          >
            ▶ Chạy mô phỏng
          </button>

          <button
            className="secondary"
            onClick={stopSimulation}
          >
            ⏹ Dừng
          </button>

          <button
            className="secondary"
            onClick={handleCompileOnly}
            disabled={uploading || compiling || codeLanguage === "python"}
            title={codeLanguage === "python" ? "Mã Python: xuất .py rồi nạp bằng Thonny / mpremote" : undefined}
          >
            {compiling ? "⏳ Đang biên dịch..." : "🧩 Chỉ biên dịch"}
          </button>

          <button
            className="primary"
            onClick={handleCompileAndUpload}
            disabled={uploading || compiling || codeLanguage === "python"}
            title={codeLanguage === "python" ? "Mã Python: xuất .py rồi nạp bằng Thonny / mpremote" : undefined}
          >
            {uploading ? "⏳ Đang biên dịch & nạp..." : "⬆ Biên dịch & Nạp"}
          </button>

        </div>

      </footer>

      <CompileLog
        lines={logLines}
        running={uploading || compiling}
        onClear={() => setLogLines([])}
      />


    </div>
  );
}