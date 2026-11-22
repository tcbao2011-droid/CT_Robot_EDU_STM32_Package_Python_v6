/*
 * Liên kết khối Blockly với đoạn mã mà khối đó sinh ra.
 * Marker chỉ tồn tại trong bộ nhớ ở bước sinh mã và được gỡ bỏ
 * trước khi hiển thị / tải xuống / biên dịch sketch Arduino.
 */

const MARKER_PATTERN = /\/\*__CT_BLOCK_(START|END):(.+?)__\*\//g;

/** Gỡ marker khỏi một đoạn mã (để nhận ra số cố định bên trong mã giá trị đã được đánh dấu). */
export function unmarkedCode(code) {
  return String(code ?? "").replace(MARKER_PATTERN, "");
}

export function blockMarker(blockId, edge) {
  return `/*__CT_BLOCK_${edge}:${String(blockId)}__*/`;
}

export function markBlockCode(blockId, code) {
  if (blockId == null || !code) return code || "";
  const trailingNewlines = String(code).match(/(?:\r?\n)+$/)?.[0] || "";
  const body = trailingNewlines
    ? String(code).slice(0, -trailingNewlines.length)
    : String(code);
  return `${blockMarker(blockId, "START")}${body}${blockMarker(blockId, "END")}${trailingNewlines}`;
}

/**
 * Bọc mọi generator hiện có. Việc gọi lại an toàn và tự nhận các generator
 * được Extension Registry đăng ký muộn.
 */
export function instrumentBlocklyGenerator(generator) {
  const handlers = generator?.forBlock;
  if (!handlers) return;

  for (const [type, handler] of Object.entries(handlers)) {
    if (typeof handler !== "function" || handler.__ctBlockSourceMapWrapped) continue;

    const wrapped = function (block, activeGenerator) {
      const result = handler.call(this, block, activeGenerator || generator);
      if (block?.id == null) return result;

      if (Array.isArray(result)) {
        if (typeof result[0] !== "string" || result[0].length === 0) return result;
        return [markBlockCode(block.id, result[0]), ...result.slice(1)];
      }

      if (typeof result === "string" && result.length > 0) {
        return markBlockCode(block.id, result);
      }

      return result;
    };

    Object.defineProperty(wrapped, "__ctBlockSourceMapWrapped", { value: true });
    Object.defineProperty(wrapped, "__ctOriginalGenerator", { value: handler });
    handlers[type] = wrapped;
  }
}

/** Gỡ marker và trả về map blockId -> các đoạn [start, end) trong sketch sạch. */
export function stripBlockCodeMarkers(markedCode) {
  const source = String(markedCode ?? "");
  const openRanges = new Map();
  const blockRanges = {};
  const output = [];
  let outputLength = 0;
  let sourceCursor = 0;
  let match;

  MARKER_PATTERN.lastIndex = 0;
  while ((match = MARKER_PATTERN.exec(source)) !== null) {
    const textBefore = source.slice(sourceCursor, match.index);
    output.push(textBefore);
    outputLength += textBefore.length;

    const [, edge, blockId] = match;
    if (edge === "START") {
      const starts = openRanges.get(blockId) || [];
      starts.push(outputLength);
      openRanges.set(blockId, starts);
    } else {
      const starts = openRanges.get(blockId);
      const start = starts?.pop();
      if (start != null && outputLength > start) {
        (blockRanges[blockId] ||= []).push({ start, end: outputLength });
      }
      if (starts && starts.length === 0) openRanges.delete(blockId);
    }

    sourceCursor = MARKER_PATTERN.lastIndex;
  }

  const tail = source.slice(sourceCursor);
  output.push(tail);
  const code = output.join("");

  for (const ranges of Object.values(blockRanges)) {
    ranges.sort((a, b) => a.start - b.start);
  }

  return { code, blockRanges };
}

/** Trả về chỉ số các dòng có giao với ít nhất một range của block đang hover. */
export function getHighlightedLineIndexes(code, ranges = []) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];

  const lines = String(code ?? "").split("\n");
  const highlighted = [];
  let offset = 0;

  lines.forEach((line, index) => {
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    const intersects = ranges.some(range =>
      Number.isFinite(range?.start) &&
      Number.isFinite(range?.end) &&
      range.end > range.start &&
      range.start < lineEnd &&
      range.end > lineStart
    );

    if (intersects) highlighted.push(index);
    offset = lineEnd + 1;
  });

  return highlighted;
}
