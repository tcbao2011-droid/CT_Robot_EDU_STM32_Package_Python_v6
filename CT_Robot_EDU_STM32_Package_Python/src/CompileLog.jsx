import React, { useEffect, useRef, useState } from "react";

/* =====================================================
   PHÂN LOẠI DÒNG LOG
   Trả về: "error" | "warning" | "success" | "step" | "info"
===================================================== */

export function classifyLogLine(line) {
  const text = String(line);

  if (/^\s*❌|\berror:|\bLỗi\b|thất bại|không hợp lệ|Không kết nối|Không tìm thấy/i.test(text)) {
    return "error";
  }
  if (/\bwarning:|cảnh báo/i.test(text)) {
    return "warning";
  }
  if (/^\s*✅|thành công|Biên dịch xong|Done compiling|Đã nạp/i.test(text)) {
    return "success";
  }
  if (/^\s*(▶|⬆|🔧|🔌|🔍)/.test(text)) {
    return "step";
  }
  return "info";
}

const LEVEL_LABEL = {
  error: "Lỗi",
  warning: "Cảnh báo",
  success: "Thành công",
  step: "Bước",
  info: "Thông tin",
};

/* =====================================================
   TRẠNG THÁI TỔNG
   running: đang chạy | success | error | idle
===================================================== */

function overallStatus(lines, running) {
  if (running) return "running";
  if (lines.some(l => classifyLogLine(l) === "error")) return "error";
  if (lines.some(l => classifyLogLine(l) === "success")) return "success";
  return "idle";
}

const STATUS_TEXT = {
  running: "Đang chạy",
  success: "Hoàn tất",
  error: "Thất bại",
  idle: "Sẵn sàng",
};

export default function CompileLog({ lines, running, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);

  // Tự cuộn xuống dòng mới nhất
  useEffect(() => {
    if (bodyRef.current && !collapsed) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, collapsed]);

  if (lines.length === 0 && !running) return null;

  const status = overallStatus(lines, running);
  const errorCount = lines.filter(l => classifyLogLine(l) === "error").length;
  const warningCount = lines.filter(l => classifyLogLine(l) === "warning").length;

  const copyLog = () => {
    navigator.clipboard
      ?.writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <section className={`log-panel log-${status}`}>
      <header className="log-header" onClick={() => setCollapsed(c => !c)}>
        <div className="log-title">
          <span className={`log-dot log-dot-${status}`} />
          <b>Nhật ký</b>
          <span className="log-status">{STATUS_TEXT[status]}</span>
          {errorCount > 0 && <span className="log-badge log-badge-error">{errorCount} lỗi</span>}
          {warningCount > 0 && <span className="log-badge log-badge-warning">{warningCount} cảnh báo</span>}
        </div>

        <div className="log-actions" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={copyLog} disabled={lines.length === 0}>
            {copied ? "Đã chép" : "Sao chép"}
          </button>
          <button type="button" onClick={onClear} disabled={running || lines.length === 0}>
            Xóa
          </button>
          <button type="button" onClick={() => setCollapsed(c => !c)} aria-label="Thu gọn">
            {collapsed ? "▴" : "▾"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="log-body" ref={bodyRef}>
          {lines.map((line, index) => {
            const level = classifyLogLine(line);
            return (
              <div key={index} className={`log-line log-line-${level}`}>
                <span className="log-no">{index + 1}</span>
                <span className={`log-tag log-tag-${level}`}>{LEVEL_LABEL[level]}</span>
                <span className="log-text">{line}</span>
              </div>
            );
          })}
          {running && (
            <div className="log-line log-line-step">
              <span className="log-no" />
              <span className="log-tag log-tag-step">Đang xử lý</span>
              <span className="log-text log-cursor">…</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
