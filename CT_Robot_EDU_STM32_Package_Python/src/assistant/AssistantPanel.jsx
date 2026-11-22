import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Blockly from "blockly";
import { getExtensions, isExtensionActive } from "../extensions";
import {
  buildCatalog, buildIndex, explainBlock, explainProgram, lint, loadExtensionInfo,
  search, serialize, typesOfToolbox,
} from "./index.js";
import { buildAssistantPinRules } from "./pinRules.js";
import "./assistant.css";

const ICON = { error: "⛔", warn: "⚠️", info: "💬" };

function getSelectedBlock() {
  return Blockly.common?.getSelected?.() || Blockly.getSelected?.() || null;
}

function addBlockToWorkspace(workspace, type, slot) {
  const metrics = workspace.getMetricsManager().getViewMetrics(true);
  const block = workspace.newBlock(type);
  block.initSvg();
  block.render();
  block.moveBy(metrics.left + 50 + (slot % 6) * 24, metrics.top + 50 + (slot % 6) * 24);
  block.select();
  return block;
}

export default function AssistantPanel({ workspace, toolbox, rawToolbox, profile, hardwareConfig }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState(null);          // "explain" | "check" | null
  const [problems, setProblems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [withNext, setWithNext] = useState(false);
  const [tick, setTick] = useState(0);
  const slot = useRef(0);

  /* ---------- Danh mục & tìm kiếm ---------- */
  const index = useMemo(() => {
    loadExtensionInfo(getExtensions());
    return buildIndex(buildCatalog(Blockly, toolbox));
  }, [toolbox]);

  const results = useMemo(() => search(index, query), [index, query]);
  useEffect(() => setActive(0), [query]);

  const pick = useCallback(entry => {
    if (!workspace || !entry) return;
    addBlockToWorkspace(workspace, entry.type, slot.current++);
    setQuery("");
  }, [workspace]);

  const onKeyDown = event => {
    if (!results.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(i => (i + 1) % results.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
    else if (event.key === "Enter") { event.preventDefault(); pick(results[active]); }
    else if (event.key === "Escape") setQuery("");
  };

  /* ---------- Ngữ cảnh kiểm tra lỗi ---------- */
  const lintContext = useMemo(() => {
    const allowed = typesOfToolbox(toolbox);
    const gated = new Set([...typesOfToolbox(rawToolbox)].filter(t => !allowed.has(t)));
    const inactive = new Set();
    const activeExtensions = [];
    for (const def of getExtensions()) {
      if (isExtensionActive(def, profile)) activeExtensions.push(def);
      else (def.blocks || []).forEach(b => inactive.add(b.type));
    }
    const pinRules = buildAssistantPinRules(profile, activeExtensions, hardwareConfig || {});
    return {
      platform: profile?.platform,
      boardName: profile?.name,
      ...pinRules,
      isUnavailable: type => gated.has(type) || inactive.has(type),
    };
  }, [toolbox, rawToolbox, profile, hardwareConfig]);

  /* ---------- Theo dõi workspace (debounce, bỏ qua sự kiện giao diện) ---------- */
  useEffect(() => {
    if (!workspace) return undefined;
    let timer = null;
    const run = () => {
      try { setProblems(lint(serialize(workspace), lintContext)); } catch (error) { console.error("Assistant lint:", error); }
      setTick(t => t + 1);
    };
    const onChange = event => {
      if (event.type === Blockly.Events.SELECTED) { setSelectedId(event.newElementId || null); return; }
      if (event.isUiEvent) return;
      clearTimeout(timer);
      timer = setTimeout(run, 350);
    };
    workspace.addChangeListener(onChange);
    run();
    return () => { clearTimeout(timer); workspace.removeChangeListener(onChange); };
  }, [workspace, lintContext]);

  /* ---------- Giải thích ---------- */
  const explanation = useMemo(() => {
    if (panel !== "explain" || !workspace) return null;
    const tree = serialize(workspace);
    const node = selectedId && tree.byId.get(selectedId);
    return node
      ? { scope: "block", ...explainBlock(node, { withNext }) }
      : { scope: "all", ...explainProgram(tree) };
    // tick: tính lại khi chương trình đổi
  }, [panel, workspace, selectedId, withNext, tick]);

  /* ---------- Lỗi: đến khối / sửa nhanh ---------- */
  const gotoBlock = id => {
    const block = id && workspace?.getBlockById(id);
    if (!block) return;
    block.select();
    workspace.centerOnBlock?.(id);
  };

  const applyFix = fix => {
    const block = workspace?.getBlockById(fix.blockId);
    if (!block) return;
    block.setFieldValue(String(fix.value), fix.field);
  };

  const errors = problems.filter(p => p.level === "error").length;
  const warns = problems.filter(p => p.level === "warn").length;
  const badge = errors ? `${errors} lỗi` : warns ? `${warns} lưu ý` : "";

  return (
    <div className="ai-bar">
      <div className="ai-row">
        <div className="ai-search">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="🔍 Tìm khối lệnh… (ví dụ: quay trái, khoảng cách, servo)"
            aria-label="Tìm khối lệnh"
          />
          {query && (
            <ul className="ai-results" role="listbox">
              {results.length === 0 && <li className="ai-empty">Không tìm thấy khối nào cho “{query.trim()}”. Thử từ khác ngắn hơn, ví dụ “quay”, “servo”, “chờ”.</li>}
              {results.map((entry, i) => (
                <li
                  key={entry.type}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "active" : ""}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={e => { e.preventDefault(); pick(entry); }}
                >
                  <b>{entry.label}</b>
                  {entry.category && <em>{entry.category}</em>}
                  {entry.desc && <span>{entry.desc}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className={panel === "explain" ? "on" : ""} onClick={() => setPanel(panel === "explain" ? null : "explain")}>💡 Giải thích</button>
        <button className={panel === "check" ? "on" : ""} onClick={() => setPanel(panel === "check" ? null : "check")}>
          🩺 Kiểm tra {badge && <span className={`ai-badge ${errors ? "err" : "warn"}`}>{badge}</span>}
        </button>
      </div>

      {panel === "explain" && explanation && (
        <div className="ai-pop">
          <div className="ai-pop-head">
            <b>{explanation.scope === "block" ? "Khối đang chọn" : "Toàn bộ chương trình"}</b>
            {explanation.scope === "block" && (
              <label><input type="checkbox" checked={withNext} onChange={e => setWithNext(e.target.checked)} /> kèm các khối phía dưới</label>
            )}
            <button className="ai-x" onClick={() => setPanel(null)} aria-label="Đóng">✕</button>
          </div>
          <p className="ai-summary">{explanation.summary}</p>
          {explanation.tip && <p className="ai-tip">💡 {explanation.tip}</p>}
          {explanation.lines.length > 0 && (
            <ol className="ai-lines">
              {explanation.lines.map((line, i) => line.spacer
                ? <li key={i} className="spacer" />
                : (
                  <li key={i} className={line.muted ? "muted" : ""} style={{ paddingLeft: line.depth * 18 }}>
                    <a onClick={() => gotoBlock(line.id)}>{line.text}</a>
                  </li>
                ))}
            </ol>
          )}
          {explanation.scope === "all" && explanation.lines.length > 0 && (
            <p className="ai-hint">Mẹo: bấm chọn một khối trong vùng lập trình để xem giải thích riêng khối đó.</p>
          )}
        </div>
      )}

      {panel === "check" && (
        <div className="ai-pop">
          <div className="ai-pop-head">
            <b>{problems.length ? `Phát hiện ${problems.length} điểm cần xem` : "Không thấy vấn đề nào ✔"}</b>
            <button className="ai-x" onClick={() => setPanel(null)} aria-label="Đóng">✕</button>
          </div>
          <ul className="ai-problems">
            {problems.map((p, i) => (
              <li key={`${p.rule}-${p.blockId}-${i}`} className={p.level}>
                <span className="ai-ico">{ICON[p.level]}</span>
                <div>
                  <div>{p.msg}</div>
                  <small>{p.hint}</small>
                  <div className="ai-actions">
                    {p.blockId && <button onClick={() => gotoBlock(p.blockId)}>Đến khối</button>}
                    {p.fix && <button className="fix" onClick={() => applyFix(p.fix)}>{p.fix.label}</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
