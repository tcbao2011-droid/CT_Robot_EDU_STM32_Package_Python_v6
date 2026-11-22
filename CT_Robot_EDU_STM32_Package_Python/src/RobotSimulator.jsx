import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/*
=========================================================
 CT ROBOT EDU
 RobotSimulator.jsx
 VERSION 10.0
=========================================================
*/

const WIDTH = 700;
const HEIGHT = 420;

const START_X = 120;
const START_Y = 210;

const LINEAR_SPEED = 120;

/*
Tốc độ góc cơ bản của simulator.

Đây là thông số mô phỏng,
không phải thông số vật lý của driver động cơ.
*/

const TURN_SPEED = 2.5;


/* =====================================================
   COMPONENT
===================================================== */

export default function RobotSimulator({
  commands = [],
  hardwareConfig = { robotType: "2WD" },
  keyboardEvents = {},
  running = false,
  runId = 0,
  onFinish,
  onHide,
}) {

  const canvasRef =
    useRef(null);

  /* ===================================================
     PROPS REF
  =================================================== */

  const commandsRef =
    useRef(commands);

  const keyboardEventsRef =
    useRef(keyboardEvents);

  const runningRef =
    useRef(running);

  const onFinishRef =
    useRef(onFinish);

  useEffect(() => {
    commandsRef.current =
      commands;
  }, [commands]);

  useEffect(() => {
    keyboardEventsRef.current =
      keyboardEvents;
  }, [keyboardEvents]);

  useEffect(() => {
    runningRef.current =
      running;
  }, [running]);

  useEffect(() => {
    onFinishRef.current =
      onFinish;
  }, [onFinish]);

  /* ===================================================
     ROBOT STATE
  =================================================== */

  const robotRef =
    useRef({
      x: START_X,
      y: START_Y,
      angle: 0,
      leftMotor: 0,
      rightMotor: 0,
    });

  const [robot, setRobot] =
    useState({
      x: START_X,
      y: START_Y,
      angle: 0,
    });

  /* ===================================================
     KEYBOARD
  =================================================== */

  const keysRef =
    useRef({
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      Space: false,
    });

  /* ===================================================
     PROGRAM RUNTIME
  =================================================== */

  const runtimeRef =
    useRef({
      commandIndex: 0,
      elapsed: 0,

      /*
      Tiến độ góc đã quay của
      lệnh quay theo góc.
      */

      angleProgress: 0,

      finishedForRun: false,
    });

  /* ===================================================
     ANIMATION
  =================================================== */

  const animationRef =
    useRef(null);

  const lastTimeRef =
    useRef(null);

  /* ===================================================
     TRAIL
  =================================================== */

  const trailRef =
    useRef([
      {
        x: START_X,
        y: START_Y,
      },
    ]);

  /* ===================================================
     UI
  =================================================== */

  const [
    currentCommand,
    setCurrentCommand,
  ] =
    useState("Chưa chạy");

  const [
    mode,
    setMode,
  ] =
    useState("READY");

  const [
    keyboardActive,
    setKeyboardActive,
  ] =
    useState(false);

  const [
    showTrail,
    setShowTrail,
  ] =
    useState(true);

  /* ===================================================
     RESET RUNTIME
  =================================================== */

  const resetRuntime =
    useCallback(
      (resetPosition = true) => {

        runtimeRef.current = {
          commandIndex: 0,
          elapsed: 0,
          angleProgress: 0,
          finishedForRun: false,
        };

        if (resetPosition) {

          robotRef.current = {
            x: START_X,
            y: START_Y,
            angle: 0,
            leftMotor: 0,
            rightMotor: 0,
          };

          trailRef.current = [
            {
              x: START_X,
              y: START_Y,
            },
          ];

          setRobot({
            x: START_X,
            y: START_Y,
            angle: 0,
          });
        } else {

          robotRef.current.leftMotor = 0;
          robotRef.current.rightMotor = 0;
        }

        setCurrentCommand(
          "Chưa chạy"
        );

        setMode(
          "READY"
        );
      },
      []
    );

  /* ===================================================
     MỖI LẦN RUN MỚI
  =================================================== */

  useEffect(() => {

    if (runId <= 0) {
      return;
    }

    resetRuntime(true);

    runningRef.current =
      true;

    setMode(
      "PROGRAM"
    );

    setCurrentCommand(
      "Đang bắt đầu..."
    );

  }, [
    runId,
    resetRuntime,
  ]);

  /* ===================================================
     DRAW ROBOT
  =================================================== */

  const drawRobot =
    useCallback(
      (
        ctx,
        x,
        y,
        angle
      ) => {

        ctx.save();

        ctx.translate(
          x,
          y
        );

        ctx.rotate(
          angle
        );

        /* shadow */

        ctx.fillStyle =
          "rgba(15,23,42,0.15)";

        ctx.beginPath();

        ctx.ellipse(
          0,
          8,
          31,
          18,
          0,
          0,
          Math.PI * 2
        );

        ctx.fill();

        /* wheels - 2WD hoặc 4WD */

        ctx.fillStyle =
          "#111827";

        const wheelX = hardwareConfig.robotType === "4WD" ? 27 : 30;
        const wheelWidth = 8;
        const wheelY = 19;

        ctx.fillRect(-wheelX, -wheelY, wheelWidth, 38);
        ctx.fillRect(wheelX - wheelWidth, -wheelY, wheelWidth, 38);

        if (hardwareConfig.robotType === "4WD") {
          ctx.fillRect(-wheelX - 2, -wheelY + 1, wheelWidth, 38);
          ctx.fillRect(wheelX - wheelWidth + 2, -wheelY + 1, wheelWidth, 38);
        }

        /* body */

        ctx.fillStyle =
          "#2563eb";

        ctx.beginPath();

        ctx.roundRect(
          -25,
          -20,
          50,
          40,
          9
        );

        ctx.fill();

        ctx.strokeStyle =
          "#1d4ed8";

        ctx.lineWidth =
          2;

        ctx.stroke();

        /* head */

        ctx.fillStyle =
          "#ffffff";

        ctx.beginPath();

        ctx.arc(
          0,
          -5,
          13,
          0,
          Math.PI * 2
        );

        ctx.fill();

        /* eyes */

        ctx.fillStyle =
          "#0f172a";

        ctx.beginPath();

        ctx.arc(
          -5,
          -7,
          2.5,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.beginPath();

        ctx.arc(
          5,
          -7,
          2.5,
          0,
          Math.PI * 2
        );

        ctx.fill();

        /* direction */

        ctx.fillStyle =
          "#ef4444";

        ctx.beginPath();

        ctx.moveTo(
          0,
          -36
        );

        ctx.lineTo(
          -7,
          -23
        );

        ctx.lineTo(
          7,
          -23
        );

        ctx.closePath();

        ctx.fill();

        ctx.restore();
      },
      [hardwareConfig.robotType]
    );

  /* ===================================================
     DRAW SCENE
  =================================================== */

  const drawScene =
    useCallback(
      () => {

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return;
        }

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          return;
        }

        ctx.clearRect(
          0,
          0,
          WIDTH,
          HEIGHT
        );

        ctx.fillStyle =
          "#f8fafc";

        ctx.fillRect(
          0,
          0,
          WIDTH,
          HEIGHT
        );

        /* grid */

        ctx.strokeStyle =
          "#e2e8f0";

        ctx.lineWidth =
          1;

        for (
          let x = 0;
          x <= WIDTH;
          x += 25
        ) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, HEIGHT);
          ctx.stroke();
        }

        for (
          let y = 0;
          y <= HEIGHT;
          y += 25
        ) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(WIDTH, y);
          ctx.stroke();
        }

        /* border */

        ctx.strokeStyle =
          "#64748b";

        ctx.lineWidth =
          3;

        ctx.strokeRect(
          5,
          5,
          WIDTH - 10,
          HEIGHT - 10
        );

        /* start */

        ctx.strokeStyle =
          "#22c55e";

        ctx.lineWidth =
          4;

        ctx.beginPath();

        ctx.moveTo(
          45,
          80
        );

        ctx.lineTo(
          45,
          340
        );

        ctx.stroke();

        ctx.fillStyle =
          "#16a34a";

        ctx.font =
          "bold 13px Arial";

        ctx.fillText(
          "START",
          10,
          70
        );

        /* trail */

        if (
          showTrail &&
          trailRef.current.length > 1
        ) {

          ctx.strokeStyle =
            "#60a5fa";

          ctx.lineWidth =
            2;

          ctx.setLineDash([
            5,
            5,
          ]);

          const trail =
            trailRef.current;

          ctx.beginPath();

          ctx.moveTo(
            trail[0].x,
            trail[0].y
          );

          for (
            let i = 1;
            i < trail.length;
            i++
          ) {
            ctx.lineTo(
              trail[i].x,
              trail[i].y
            );
          }

          ctx.stroke();

          ctx.setLineDash([]);
        }

        /* robot */

        const state =
          robotRef.current;

        drawRobot(
          ctx,
          state.x,
          state.y,
          state.angle
        );
      },
      [
        drawRobot,
        showTrail,
        hardwareConfig.robotType,
      ]
    );

  useEffect(() => {
    drawScene();
  }, [
    robot,
    drawScene,
  ]);

  /* ===================================================
     KEYBOARD
  =================================================== */

  useEffect(() => {

    const isInput =
      target => {

        const tag =
          target?.tagName;

        return (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT"
        );
      };

    const onKeyDown =
      event => {

        if (
          isInput(event.target)
        ) {
          return;
        }

        switch (event.key) {

          case "ArrowUp":
            event.preventDefault();
            keysRef.current.ArrowUp = true;
            setKeyboardActive(true);
            break;

          case "ArrowDown":
            event.preventDefault();
            keysRef.current.ArrowDown = true;
            setKeyboardActive(true);
            break;

          case "ArrowLeft":
            event.preventDefault();
            keysRef.current.ArrowLeft = true;
            setKeyboardActive(true);
            break;

          case "ArrowRight":
            event.preventDefault();
            keysRef.current.ArrowRight = true;
            setKeyboardActive(true);
            break;

          case " ":
          case "Spacebar":
          case "Space":
            event.preventDefault();
            keysRef.current.Space = true;
            setKeyboardActive(true);
            break;

          default:
            break;
        }
      };

    const onKeyUp =
      event => {

        switch (event.key) {

          case "ArrowUp":
            keysRef.current.ArrowUp = false;
            break;

          case "ArrowDown":
            keysRef.current.ArrowDown = false;
            break;

          case "ArrowLeft":
            keysRef.current.ArrowLeft = false;
            break;

          case "ArrowRight":
            keysRef.current.ArrowRight = false;
            break;

          case " ":
          case "Spacebar":
          case "Space":
            keysRef.current.Space = false;
            break;

          default:
            break;
        }

        const active =
          keysRef.current.ArrowUp ||
          keysRef.current.ArrowDown ||
          keysRef.current.ArrowLeft ||
          keysRef.current.ArrowRight ||
          keysRef.current.Space;

        if (!active) {
          setKeyboardActive(false);

          robotRef.current.leftMotor = 0;
          robotRef.current.rightMotor = 0;
        }
      };

    window.addEventListener(
      "keydown",
      onKeyDown,
      true
    );

    window.addEventListener(
      "keyup",
      onKeyUp,
      true
    );

    return () => {

      window.removeEventListener(
        "keydown",
        onKeyDown,
        true
      );

      window.removeEventListener(
        "keyup",
        onKeyUp,
        true
      );
    };
  }, []);

  /* ===================================================
     LIMIT ROBOT
  =================================================== */

  const constrain =
    () => {

      const state =
        robotRef.current;

      const margin =
        35;

      state.x =
        Math.max(
          margin,
          Math.min(
            WIDTH - margin,
            state.x
          )
        );

      state.y =
        Math.max(
          margin,
          Math.min(
            HEIGHT - margin,
            state.y
          )
        );
    };

  /* ===================================================
     TRAIL
  =================================================== */

  const updateTrail =
    () => {

      const state =
        robotRef.current;

      const trail =
        trailRef.current;

      const last =
        trail[
          trail.length - 1
        ];

      if (
        !last ||
        Math.abs(
          state.x - last.x
        ) > 2 ||
        Math.abs(
          state.y - last.y
        ) > 2
      ) {

        trail.push({
          x: state.x,
          y: state.y,
        });

        if (
          trail.length > 2000
        ) {
          trail.shift();
        }
      }
    };

  /* ===================================================
     KEYBOARD PROCESS
  =================================================== */

  const processKeyboard =
    delta => {

      const keys =
        keysRef.current;

      if (
        !keys.ArrowUp &&
        !keys.ArrowDown &&
        !keys.ArrowLeft &&
        !keys.ArrowRight &&
        !keys.Space
      ) {
        return false;
      }

      const events =
        keyboardEventsRef.current;

      const state =
        robotRef.current;

      setMode(
        "KEYBOARD"
      );

      /* SPACE */

      if (keys.Space) {

        state.leftMotor = 0;
        state.rightMotor = 0;

        setCurrentCommand(
          "🛑 SPACE - DỪNG"
        );

        return true;
      }

      let command = null;
      let text = "";

      if (keys.ArrowUp) {
        command =
          events.ArrowUp;
        text =
          "↑ ĐI THẲNG";
      } else if (keys.ArrowDown) {
        command =
          events.ArrowDown;
        text =
          "↓ ĐI LÙI";
      } else if (keys.ArrowLeft) {
        command =
          events.ArrowLeft;
        text =
          "← QUAY TRÁI";
      } else if (keys.ArrowRight) {
        command =
          events.ArrowRight;
        text =
          "→ QUAY PHẢI";
      }

      if (!command) {

        state.leftMotor = 0;
        state.rightMotor = 0;

        setCurrentCommand(
          `${text} - chưa có block`
        );

        return true;
      }

      const speed =
        Math.max(
          0,
          Math.min(
            100,
            Number(command.speed) || 80
          )
        );

      const power =
        speed / 100;

      const linear =
        LINEAR_SPEED * power;

      const turn =
        TURN_SPEED * power;

      if (
        command.type ===
        "forward"
      ) {

        state.leftMotor = speed;
        state.rightMotor = speed;

        state.x +=
          Math.sin(state.angle) *
          linear *
          delta;

        state.y -=
          Math.cos(state.angle) *
          linear *
          delta;
      }

      else if (
        command.type ===
        "backward"
      ) {

        state.leftMotor = -speed;
        state.rightMotor = -speed;

        state.x -=
          Math.sin(state.angle) *
          linear *
          delta;

        state.y +=
          Math.cos(state.angle) *
          linear *
          delta;
      }

      else if (
        command.type ===
        "left"
      ) {

        state.leftMotor = -speed;
        state.rightMotor = speed;

        state.angle -=
          turn * delta;
      }

      else if (
        command.type ===
        "right"
      ) {

        state.leftMotor = speed;
        state.rightMotor = -speed;

        state.angle +=
          turn * delta;
      }

      setCurrentCommand(
        `${text} ${Math.round(speed)}%`
      );

      return true;
    };

  /* ===================================================
     AUTOMATIC PROCESS
  =================================================== */

  const processAutomatic =
    delta => {

      if (
        !runningRef.current
      ) {
        return false;
      }

      const runtime =
        runtimeRef.current;

      const list =
        commandsRef.current;

      if (
        runtime.commandIndex >=
        list.length
      ) {

        if (
          !runtime.finishedForRun
        ) {

          runtime.finishedForRun =
            true;

          robotRef.current.leftMotor = 0;
          robotRef.current.rightMotor = 0;

          setMode(
            "FINISHED"
          );

          setCurrentCommand(
            "✅ Hoàn thành chương trình"
          );

          if (
            onFinishRef.current
          ) {
            onFinishRef.current();
          }
        }

        return false;
      }

      const command =
        list[
          runtime.commandIndex
        ];

      const state =
        robotRef.current;

      /* ===============================================
         QUAY THEO GÓC
      =============================================== */

      if (
        command.type ===
          "turn_left_angle" ||
        command.type ===
          "turn_right_angle"
      ) {

        const speed =
          Math.max(
            0,
            Math.min(
              100,
              Number(command.speed) || 0
            )
          );

        const degrees =
          Math.max(
            0,
            Number(command.degrees) || 0
          );

        const targetRadians =
          degrees *
          Math.PI /
          180;

        const power =
          speed / 100;

        const angularSpeed =
          TURN_SPEED * power;

        if (
          targetRadians <= 0 ||
          angularSpeed <= 0
        ) {

          runtime.commandIndex++;
          runtime.angleProgress = 0;

          return true;
        }

        const remaining =
          targetRadians -
          runtime.angleProgress;

        const frameAngle =
          Math.min(
            remaining,
            angularSpeed * delta
          );

        if (
          command.type ===
          "turn_left_angle"
        ) {

          state.leftMotor =
            -speed;

          state.rightMotor =
            speed;

          state.angle -=
            frameAngle;

          setCurrentCommand(
            `↶ QUAY TRÁI ${Math.round(speed)}% - ${degrees}°`
          );

        } else {

          state.leftMotor =
            speed;

          state.rightMotor =
            -speed;

          state.angle +=
            frameAngle;

          setCurrentCommand(
            `↷ QUAY PHẢI ${Math.round(speed)}% - ${degrees}°`
          );
        }

        runtime.angleProgress +=
          frameAngle;

        if (
          runtime.angleProgress >=
          targetRadians - 0.000001
        ) {

          runtime.commandIndex++;
          runtime.elapsed = 0;
          runtime.angleProgress = 0;

          state.leftMotor = 0;
          state.rightMotor = 0;

          setCurrentCommand(
            `✅ Đã quay ${degrees}°`
          );
        }

        return true;
      }

      /* ===============================================
         LIÊN TỤC
      =============================================== */

      if (
        command.type ===
          "forward_continuous" ||
        command.type ===
          "backward_continuous" ||
        command.type ===
          "left_continuous" ||
        command.type ===
          "right_continuous"
      ) {

        const speed =
          Math.max(
            0,
            Math.min(
              100,
              Number(command.speed) || 0
            )
          );

        const power =
          speed / 100;

        const linear =
          LINEAR_SPEED * power;

        const turn =
          TURN_SPEED * power;

        if (
          command.type ===
          "forward_continuous"
        ) {

          state.leftMotor = speed;
          state.rightMotor = speed;

          state.x +=
            Math.sin(state.angle) *
            linear *
            delta;

          state.y -=
            Math.cos(state.angle) *
            linear *
            delta;

          setCurrentCommand(
            `⬆ ĐI THẲNG ${Math.round(speed)}%`
          );
        }

        else if (
          command.type ===
          "backward_continuous"
        ) {

          state.leftMotor = -speed;
          state.rightMotor = -speed;

          state.x -=
            Math.sin(state.angle) *
            linear *
            delta;

          state.y +=
            Math.cos(state.angle) *
            linear *
            delta;

          setCurrentCommand(
            `⬇ ĐI LÙI ${Math.round(speed)}%`
          );
        }

        else if (
          command.type ===
          "left_continuous"
        ) {

          state.leftMotor = -speed;
          state.rightMotor = speed;

          state.angle -=
            turn * delta;

          setCurrentCommand(
            `↶ QUAY TRÁI ${Math.round(speed)}%`
          );
        }

        else {

          state.leftMotor = speed;
          state.rightMotor = -speed;

          state.angle +=
            turn * delta;

          setCurrentCommand(
            `↷ QUAY PHẢI ${Math.round(speed)}%`
          );
        }

        runtime.commandIndex++;
        runtime.elapsed = 0;
        runtime.angleProgress = 0;

        return true;
      }

      /* ===============================================
         WAIT
      =============================================== */

      if (
        command.type ===
        "wait"
      ) {

        state.leftMotor = 0;
        state.rightMotor = 0;

        runtime.elapsed +=
          delta;

        setCurrentCommand(
          `⏱ CHỜ ${command.seconds}s`
        );

        if (
          runtime.elapsed >=
          Number(command.seconds)
        ) {

          runtime.commandIndex++;
          runtime.elapsed = 0;
          runtime.angleProgress = 0;
        }

        return true;
      }

      /* ===============================================
         STOP
      =============================================== */

      if (
        command.type ===
        "stop"
      ) {

        state.leftMotor = 0;
        state.rightMotor = 0;

        runtime.commandIndex++;
        runtime.elapsed = 0;
        runtime.angleProgress = 0;

        setCurrentCommand(
          "🛑 DỪNG ROBOT"
        );

        return true;
      }

      /* ===============================================
         TIMED MOVEMENT
      =============================================== */

      const speed =
        Math.max(
          0,
          Math.min(
            100,
            Number(command.speed) || 0
          )
        );

      const power =
        speed / 100;

      const linear =
        LINEAR_SPEED * power;

      const turn =
        TURN_SPEED * power;

      runtime.elapsed +=
        delta;

      if (
        command.type ===
        "forward"
      ) {

        state.leftMotor = speed;
        state.rightMotor = speed;

        state.x +=
          Math.sin(state.angle) *
          linear *
          delta;

        state.y -=
          Math.cos(state.angle) *
          linear *
          delta;

        setCurrentCommand(
          `⬆ ĐI THẲNG ${Math.round(speed)}% - ${command.seconds}s`
        );
      }

      else if (
        command.type ===
        "backward"
      ) {

        state.leftMotor = -speed;
        state.rightMotor = -speed;

        state.x -=
          Math.sin(state.angle) *
          linear *
          delta;

        state.y +=
          Math.cos(state.angle) *
          linear *
          delta;

        setCurrentCommand(
          `⬇ ĐI LÙI ${Math.round(speed)}% - ${command.seconds}s`
        );
      }

      else if (
        command.type ===
        "left"
      ) {

        state.leftMotor = -speed;
        state.rightMotor = speed;

        state.angle -=
          turn * delta;

        setCurrentCommand(
          `↶ QUAY TRÁI ${Math.round(speed)}% - ${command.seconds}s`
        );
      }

      else if (
        command.type ===
        "right"
      ) {

        state.leftMotor = speed;
        state.rightMotor = -speed;

        state.angle +=
          turn * delta;

        setCurrentCommand(
          `↷ QUAY PHẢI ${Math.round(speed)}% - ${command.seconds}s`
        );
      }

      else if (
        command.type ===
        "motorLeft"
      ) {

        state.leftMotor =
          Number(command.speed) || 0;
      }

      else if (
        command.type ===
        "motorRight"
      ) {

        state.rightMotor =
          Number(command.speed) || 0;
      }

      else {

        if (
          runtime.elapsed >=
          Number(
            command.seconds || 0.2
          )
        ) {

          runtime.commandIndex++;
          runtime.elapsed = 0;
          runtime.angleProgress = 0;
        }

        return true;
      }

      if (
        runtime.elapsed >=
        Number(
          command.seconds || 0.01
        )
      ) {

        runtime.commandIndex++;
        runtime.elapsed = 0;
        runtime.angleProgress = 0;
      }

      return true;
    };

  /* ===================================================
     SINGLE ANIMATION LOOP
  =================================================== */

  useEffect(() => {

    const loop =
      timestamp => {

        if (
          lastTimeRef.current ===
          null
        ) {
          lastTimeRef.current =
            timestamp;
        }

        let delta =
          (
            timestamp -
            lastTimeRef.current
          ) / 1000;

        lastTimeRef.current =
          timestamp;

        delta =
          Math.min(
            delta,
            0.05
          );

        /* Keyboard ưu tiên */

        const keyboard =
          processKeyboard(delta);

        if (keyboard) {

          constrain();
          updateTrail();

          const state =
            robotRef.current;

          setRobot({
            x: state.x,
            y: state.y,
            angle: state.angle,
          });

          animationRef.current =
            requestAnimationFrame(loop);

          return;
        }

        /* Program */

        const automatic =
          processAutomatic(delta);

        if (automatic) {

          constrain();
          updateTrail();

          const state =
            robotRef.current;

          setRobot({
            x: state.x,
            y: state.y,
            angle: state.angle,
          });
        }
        else if (
          !runningRef.current
        ) {

          robotRef.current.leftMotor =
            0;

          robotRef.current.rightMotor =
            0;
        }

        animationRef.current =
          requestAnimationFrame(loop);
      };

    animationRef.current =
      requestAnimationFrame(loop);

    return () => {

      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      animationRef.current =
        null;

      lastTimeRef.current =
        null;
    };

  }, []);

  /* ===================================================
     RESET BUTTON
  =================================================== */

  const resetRobot =
    () => {

      resetRuntime(true);

      runningRef.current =
        false;

      setKeyboardActive(false);

      keysRef.current = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        Space: false,
      };
    };

  /* ===================================================
     INFO
  =================================================== */

  const angle =
    Math.round(
      robot.angle *
      180 /
      Math.PI
    );

  /* ===================================================
     UI
  =================================================== */

  return (
    <div className="simulator">

      <div className="simulator-header">

        <div>

          <b>
            🤖 MÔ PHỎNG ROBOT 2D · {hardwareConfig.robotType === "4WD" ? "4 BÁNH" : "2 BÁNH"}
          </b>

          <span>
            Profile: {hardwareConfig.profileId || "esp32-devkit"}
          </span>

        </div>

        <div className="sim-status">

          {keyboardActive
            ? "🎮 BÀN PHÍM"
            : mode === "PROGRAM"
            ? "🟢 CHƯƠNG TRÌNH"
            : mode === "FINISHED"
            ? "✅ HOÀN THÀNH"
            : "⚪ SẴN SÀNG"}

        </div>

        {onHide && (
          <button
            type="button"
            className="panel-hide-btn"
            onClick={onHide}
            title="Ẩn khu vực mô phỏng"
            aria-label="Ẩn khu vực mô phỏng"
          >
            ▾ Ẩn
          </button>
        )}

      </div>

      <div className="simulator-canvas">

        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
        />

      </div>

      <div className="simulator-info">

        <span>
          Lệnh:
          <b>
            {" "}
            {currentCommand}
          </b>
        </span>

        <span>
          X:
          <b>
            {" "}
            {Math.round(robot.x)}
          </b>
        </span>

        <span>
          Y:
          <b>
            {" "}
            {Math.round(robot.y)}
          </b>
        </span>

        <span>
          Góc:
          <b>
            {" "}
            {angle}°
          </b>
        </span>

        <span>
          Motor:
          <b>
            {" "}
            L{" "}
            {Math.round(
              robotRef.current.leftMotor
            )}%
            {" / "}
            R{" "}
            {Math.round(
              robotRef.current.rightMotor
            )}%
          </b>
        </span>

        <button
          onClick={() =>
            setShowTrail(
              value => !value
            )
          }
        >
          {showTrail
            ? "Ẩn đường đi"
            : "Hiện đường đi"}
        </button>

        <button
          onClick={resetRobot}
        >
          ↻ Reset
        </button>

      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          padding: "6px 10px",
          fontSize: "12px",
          color: "#64748b",
          background: "#fff",
          borderTop:
            "1px solid #e2e8f0",
        }}
      >
        <span>
          🎮 Điều khiển:
        </span>

        <b>↑ Tiến</b>
        <b>↓ Lùi</b>
        <b>← Trái</b>
        <b>→ Phải</b>
        <b>SPACE Dừng</b>
      </div>

    </div>
  );
}