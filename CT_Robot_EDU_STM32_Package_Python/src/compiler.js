/* =====================================================
   BIÊN DỊCH SKETCH QUA SERVER CỤC BỘ (Vite dev middleware)
   Giao thức NDJSON có thể chia một bản tin thành nhiều chunk;
   bộ đọc dưới đây xử lý cả chunk cuối không có ký tự xuống dòng.
===================================================== */

async function responseError(response) {
  let detail = "";
  try { detail = (await response.text()).trim(); } catch (_) {}
  return new Error(detail || `Máy chủ biên dịch lỗi (HTTP ${response.status})`);
}

/** Đọc các bản tin NDJSON từ một Response. */
export async function readBuildResponse(response, onLog, { requireArtifact = true } = {}) {
  if (!response?.ok || !response.body) throw await responseError(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let result = null;

  const consumeLine = raw => {
    const line = raw.trim();
    if (!line) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (_) {
      throw new Error(`Phản hồi biên dịch không hợp lệ: ${line.slice(0, 300)}`);
    }
    if (message.log) onLog?.(String(message.log));
    if (message.error) throw new Error(String(message.error));
    if (message.done) {
      done = true;
      result = {
        artifact: message.artifact ?? message.hex ?? message.bin ?? null,
        format: message.format || (message.bin ? "bin" : message.hex ? "hex" : null),
        encoding: message.encoding || (message.bin ? "base64" : "utf8"),
        fileName: message.fileName || null,
      };
    }
  };

  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        consumeLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  if (!done) throw new Error("Máy chủ kết thúc nhưng không xác nhận biên dịch hoàn tất.");
  if (requireArtifact && !result?.artifact) {
    throw new Error("Biên dịch không trả về file đầu ra (.hex hoặc .bin).");
  }
  return result || { artifact: null, format: null, encoding: null, fileName: null };
}

export async function compileSketch(code, onLog, fqbn) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("Chưa có mã Arduino để biên dịch.");
  }
  if (!fqbn) throw new Error("Chưa chọn cấu hình board/FQBN để biên dịch.");

  let response;
  try {
    response = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, fqbn }),
    });
  } catch (_) {
    throw new Error("Không kết nối được máy chủ biên dịch. Hãy chạy `npm run dev`.");
  }

  return readBuildResponse(response, onLog, { requireArtifact: true });
}
