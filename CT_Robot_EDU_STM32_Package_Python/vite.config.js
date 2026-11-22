import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { DEFAULT_FQBN, resolveFqbn } from "./src/boardTargets.js";

/* =====================================================
   TÌM ARDUINO CLI
   Thứ tự ưu tiên:
   1) Biến môi trường ARDUINO_CLI_PATH (đường dẫn đầy đủ tới file chạy)
   2) Bản đi kèm trong thư mục tools/arduino-cli/ của phần mềm
   3) Lệnh `arduino-cli` có sẵn trong PATH của máy
   Nếu có thư mục tools/arduino-data (và tools/arduino-user) thì dùng làm
   nơi chứa core/thư viện đã cài sẵn, để chạy offline.
===================================================== */

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_FILE_NAME = process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli";

function resolveArduinoCli() {
  const fromEnv = process.env.ARDUINO_CLI_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const bundled = path.join(PROJECT_DIR, "tools", "arduino-cli", CLI_FILE_NAME);
  if (fs.existsSync(bundled)) return bundled;
  return "arduino-cli";
}

function arduinoCliEnv() {
  const env = { ...process.env };
  const dataDir = path.join(PROJECT_DIR, "tools", "arduino-data");
  const userDir = path.join(PROJECT_DIR, "tools", "arduino-user");
  if (fs.existsSync(dataDir) && !env.ARDUINO_DIRECTORIES_DATA) env.ARDUINO_DIRECTORIES_DATA = dataDir;
  if (fs.existsSync(userDir) && !env.ARDUINO_DIRECTORIES_USER) env.ARDUINO_DIRECTORIES_USER = userDir;
  return env;
}

const CLI_NOT_FOUND_MESSAGE =
  "Không tìm thấy arduino-cli. Cách xử lý: (1) cài Arduino CLI rồi mở lại ứng dụng từ cửa sổ terminal mới, "
  + "(2) đặt file arduino-cli vào thư mục tools/arduino-cli/ của phần mềm, hoặc "
  + "(3) đặt biến môi trường ARDUINO_CLI_PATH trỏ tới file arduino-cli. "
  + "Sau đó cài core cho board (arduino:avr, esp32:esp32 hoặc STMicroelectronics:stm32).";

/* =====================================================
   BIÊN DỊCH NGAY TRÊN MÁY (chỉ chạy với `npm run dev`)
   Web gửi code Arduino tới /api/compile, server chạy
   arduino-cli và trả log theo từng dòng (NDJSON), cuối
   cùng trả về .hex (AVR) hoặc .bin (ESP32) để xác nhận.
===================================================== */


function compileServer() {
  return {
    name: "ct-robot-compile",
    configureServer(server) {
      server.middlewares.use("/api/compile", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end("Method Not Allowed");
          return;
        }

        const MAX_BODY_BYTES = 8 * 1024 * 1024;
        let body = "";
        let bodyBytes = 0;
        let rejected = false;
        const contentLength = Number(req.headers["content-length"] || 0);
        if (contentLength > MAX_BODY_BYTES) {
          res.statusCode = 413;
          res.end("Sketch vượt quá dung lượng cho phép (8 MB).");
          return;
        }
        req.on("data", chunk => {
          if (rejected) return;
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_BODY_BYTES) {
            rejected = true;
            res.statusCode = 413;
            res.end("Sketch vượt quá dung lượng cho phép (8 MB).");
            return;
          }
          body += chunk.toString("utf8");
        });
        req.on("end", () => {
          if (rejected || res.writableEnded) return;

          let code;
          let fqbn;
          try {
            const parsed = JSON.parse(body);
            if (typeof parsed.code !== "string" || !parsed.code.trim()) {
              throw new Error("Không có mã Arduino để biên dịch.");
            }
            code = parsed.code;
            fqbn = resolveFqbn(parsed.fqbn || DEFAULT_FQBN);
            if (!fqbn) throw new Error("FQBN không được hỗ trợ.");
          } catch (error) {
            res.statusCode = 400;
            res.end(error.message || "Dữ liệu biên dịch không hợp lệ.");
            return;
          }

          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          });

          let finished = false;
          let child = null;
          let workDir = null;
          const stdoutState = { buffer: "", decoder: new StringDecoder("utf8") };
          const stderrState = { buffer: "", decoder: new StringDecoder("utf8") };
          const send = obj => {
            if (!finished && !res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(obj)}\n`);
          };
          const cleanup = () => {
            if (workDir) {
              try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
              workDir = null;
            }
          };
          const finish = obj => {
            if (finished) return;
            finished = true;
            if (obj && !res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(obj)}\n`);
            if (!res.destroyed && !res.writableEnded) res.end();
            cleanup();
          };
          const forwardLines = state => chunk => {
            state.buffer += state.decoder.write(chunk);
            let newline;
            while ((newline = state.buffer.indexOf("\n")) >= 0) {
              const line = state.buffer.slice(0, newline).trim();
              state.buffer = state.buffer.slice(newline + 1);
              if (line) send({ log: line });
            }
          };
          const flushLine = state => {
            state.buffer += state.decoder.end();
            const line = state.buffer.trim();
            state.buffer = "";
            if (line) send({ log: line });
          };

          res.once("close", () => {
            if (!finished) {
              finished = true;
              try { child?.kill(); } catch (_) {}
              cleanup();
            }
          });

          try {
            workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctrobot-compile-"));
            const sketchDir = path.join(workDir, "ct_robot");
            const outDir = path.join(workDir, "out");
            fs.mkdirSync(sketchDir, { recursive: true });
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(sketchDir, "ct_robot.ino"), code, "utf8");

            send({ log: `▶ Biên dịch cho ${fqbn}...` });
            child = spawn(
              resolveArduinoCli(),
              ["compile", "--warnings", "all", "--fqbn", fqbn, "--output-dir", outDir, sketchDir],
              { shell: false, windowsHide: true, env: arduinoCliEnv() }
            );
            child.stdout.on("data", forwardLines(stdoutState));
            child.stderr.on("data", forwardLines(stderrState));
            child.once("error", error => {
              flushLine(stdoutState);
              flushLine(stderrState);
              finish({ error: error.code === "ENOENT"
                ? CLI_NOT_FOUND_MESSAGE
                : `Không thể chạy arduino-cli: ${error.message}` });
            });
            child.once("close", exitCode => {
              flushLine(stdoutState);
              flushLine(stderrState);
              if (finished) return;
              if (exitCode !== 0) {
                finish({ error: `Biên dịch thất bại (mã lỗi ${exitCode}). Xem log phía trên để biết dòng lỗi cụ thể.` });
                return;
              }
              try {
                const outputFiles = fs.readdirSync(outDir);
                const isEsp32 = fqbn.startsWith("esp32:");
                const hexFile = outputFiles.find(file => file.endsWith(".ino.hex"))
                  || outputFiles.find(file => file.endsWith(".hex"));
                const binFile = outputFiles.find(file => file.endsWith(".ino.bin") && !/bootloader|partitions/i.test(file))
                  || outputFiles.find(file => file.endsWith(".bin") && !/bootloader|partitions/i.test(file));
                const artifactFile = isEsp32 ? binFile : hexFile;
                if (!artifactFile) {
                  throw new Error(isEsp32
                    ? "Biên dịch thành công nhưng không tìm thấy firmware .bin của sketch."
                    : "Biên dịch thành công nhưng không tìm thấy file .hex của sketch.");
                }
                const format = isEsp32 ? "bin" : "hex";
                const artifact = fs.readFileSync(path.join(outDir, artifactFile), format === "hex" ? "utf8" : "base64");
                finish({ done: true, artifact, format, encoding: format === "hex" ? "utf8" : "base64", fileName: artifactFile });
              } catch (error) {
                finish({ error: error.message || "Biên dịch xong nhưng không đọc được file đầu ra." });
              }
            });
          } catch (error) {
            finish({ error: error.code === "ENOENT"
              ? CLI_NOT_FOUND_MESSAGE
              : `Không thể chuẩn bị sketch biên dịch: ${error.message}` });
          }
        });
      });
    },
  };
}

/* =====================================================
   NẠP QUA SERVER (arduino-cli compile --upload)
   Cùng cách với lệnh arduino-cli đã chạy thành công.
   Cổng được tự tìm bằng `arduino-cli board list`.
===================================================== */

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveArduinoCli(), args, { shell: false, windowsHide: true, env: arduinoCliEnv() });
    let out = "";
    child.stdout.on("data", d => (out += d));
    child.stderr.on("data", d => (out += d));
    child.on("error", reject);
    child.on("close", code => resolve({ code, out }));
  });
}

// USB-serial chip VID: CH340 (1a86), CP210x (10c4), FTDI (0403), ESP32-S2/S3/C3 native USB (303a)
const USB_SERIAL_VIDS = new Set(["0x1a86", "0x10c4", "0x0403", "0x303a"]);

// Tìm cổng serial có board khớp với FQBN đã chọn.
// 1) Khớp chính xác từ arduino-cli; 2) nếu không khớp và chỉ có đúng một
// adapter USB-serial được cắm, dùng cổng đó.
async function findBoardPort(targetFqbn) {
  const { code, out } = await runCli(["board", "list", "--format", "json"]);
  if (code !== 0) return null;

  let data;
  try {
    data = JSON.parse(out);
  } catch (_) {
    return null;
  }

  const detectedPorts = data.detected_ports || data.ports || [];
  const targetBase = targetFqbn.split(":").slice(0, 3).join(":");

  const matched = detectedPorts.find(item =>
    (item.matching_boards || []).some(board => {
      const detectedFqbn = board.fqbn || "";
      const detectedBase = detectedFqbn.split(":").slice(0, 3).join(":");
      return detectedFqbn === targetFqbn || detectedBase === targetBase;
    })
  );
  if (matched) return matched.port?.address || matched.address || null;

  const usbSerial = detectedPorts.filter(item => {
    const vid = String(item.port?.properties?.vid || "").toLowerCase();
    return USB_SERIAL_VIDS.has(vid);
  });
  if (usbSerial.length === 1) {
    return usbSerial[0].port?.address || null;
  }

  return null;
}

function uploadServer() {
  return {
    name: "ct-robot-upload",
    configureServer(server) {
      server.middlewares.use("/api/upload", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end("Method Not Allowed");
          return;
        }

        const MAX_BODY_BYTES = 8 * 1024 * 1024;
        let body = "";
        let bodyBytes = 0;
        let rejected = false;
        const contentLength = Number(req.headers["content-length"] || 0);
        if (contentLength > MAX_BODY_BYTES) {
          res.statusCode = 413;
          res.end("Sketch vượt quá dung lượng cho phép (8 MB).");
          return;
        }

        req.on("data", chunk => {
          if (rejected) return;
          bodyBytes += chunk.length;
          if (bodyBytes > MAX_BODY_BYTES) {
            rejected = true;
            res.statusCode = 413;
            res.end("Sketch vượt quá dung lượng cho phép (8 MB).");
            return;
          }
          body += chunk.toString("utf8");
        });

        req.on("end", async () => {
          if (rejected || res.writableEnded || res.destroyed) return;

          let code;
          let requestedPort;
          let fqbn;
          let boardName;
          try {
            const parsed = JSON.parse(body);
            code = parsed.code;
            requestedPort = parsed.port;
            fqbn = resolveFqbn(parsed.fqbn || DEFAULT_FQBN);
            boardName = parsed.boardName || fqbn;
            if (typeof code !== "string" || !code.trim()) throw new Error("Không có mã Arduino để nạp.");
            if (!fqbn) throw new Error("FQBN không được hỗ trợ.");
          } catch (error) {
            res.statusCode = 400;
            res.end(error.message || "Dữ liệu không hợp lệ");
            return;
          }

          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          });

          let finished = false;
          let child = null;
          let workDir = null;
          const states = [
            { buffer: "", decoder: new StringDecoder("utf8") },
            { buffer: "", decoder: new StringDecoder("utf8") },
          ];
          const send = obj => {
            if (!finished && !res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(obj)}\n`);
          };
          const cleanup = () => {
            if (workDir) {
              try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
              workDir = null;
            }
          };
          const finish = obj => {
            if (finished) return;
            finished = true;
            if (obj && !res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(obj)}\n`);
            if (!res.destroyed && !res.writableEnded) res.end();
            cleanup();
          };
          const forwardLines = state => chunk => {
            state.buffer += state.decoder.write(chunk);
            let newline;
            while ((newline = state.buffer.indexOf("\n")) >= 0) {
              const line = state.buffer.slice(0, newline).replace(/\r$/, "").trim();
              state.buffer = state.buffer.slice(newline + 1);
              if (line) send({ log: line });
            }
          };
          const flushLine = state => {
            state.buffer += state.decoder.end();
            const line = state.buffer.trim();
            state.buffer = "";
            if (line) send({ log: line });
          };

          res.once("close", () => {
            if (!finished) {
              finished = true;
              try { child?.kill(); } catch (_) {}
              cleanup();
            }
          });

          try {
            let port = requestedPort;
            const isStm32 = fqbn.startsWith("STMicroelectronics:");
            if (!port) {
              send({ log: `🔌 Đang tìm cổng của ${boardName}...` });
              port = await findBoardPort(fqbn);
            }
            if (finished || res.destroyed) return;
            if (!port && isStm32) {
              // STM32 thường nạp qua ST-LINK/DFU nên không nhất thiết có cổng serial.
              send({ log: "ℹ️ Không thấy cổng serial: thử nạp qua ST-LINK/DFU của STM32duino (cần STM32CubeProgrammer)." });
            } else if (!port) {
              finish({ error: `Không tự nhận diện được ${boardName}. Hãy kiểm tra cáp USB dữ liệu và chọn đúng cổng COM/serial.` });
              return;
            }

            if (port) send({ log: `🔌 Cổng: ${port}` });
            send({ log: `🧩 Board/FQBN: ${boardName} (${fqbn})` });
            workDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctrobot-upload-"));
            const sketchDir = path.join(workDir, "ct_robot");
            fs.mkdirSync(sketchDir, { recursive: true });
            fs.writeFileSync(path.join(sketchDir, "ct_robot.ino"), code, "utf8");

            child = spawn(
              resolveArduinoCli(),
              ["compile", "--upload", ...(port ? ["-p", String(port)] : []), "--fqbn", fqbn, sketchDir],
              { shell: false, windowsHide: true, env: arduinoCliEnv() }
            );
            child.stdout.on("data", forwardLines(states[0]));
            child.stderr.on("data", forwardLines(states[1]));
            child.once("error", error => {
              flushLine(states[0]);
              flushLine(states[1]);
              finish({ error: error.code === "ENOENT"
                ? CLI_NOT_FOUND_MESSAGE
                : `Lỗi chạy arduino-cli: ${error.message}` });
            });
            child.once("close", exitCode => {
              flushLine(states[0]);
              flushLine(states[1]);
              if (finished) return;
              if (exitCode === 0) finish({ done: true });
              else finish({ error: `Nạp thất bại (mã lỗi ${exitCode}). Xem log phía trên để biết dòng lỗi cụ thể.` });
            });
          } catch (error) {
            finish({ error: error.code === "ENOENT"
              ? CLI_NOT_FOUND_MESSAGE
              : `Không thể chuẩn bị tiến trình nạp: ${error.message}` });
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), compileServer(), uploadServer()],
});