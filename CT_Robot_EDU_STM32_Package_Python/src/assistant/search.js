/* Tìm khối lệnh: cục bộ, không dấu, chính xác trước rồi mới gần đúng.
   - Chỉ khớp theo TÊN và TỪ KHOÁ của khối (không dò trong phần mô tả, tránh kết quả lạc đề).
   - Mọi từ người dùng gõ đều phải khớp (AND).
   - Gõ sai 1 ký tự chỉ được chấp nhận với từ dài ≥ 5 ký tự và chỉ so với tên khối. */
import { fold } from "./text.js";

const STOP = new Set(["khoi", "lenh", "cua", "la", "cho", "de", "va", "mot", "cai", "block"]);
const words = s => fold(s).split(" ").filter(Boolean);
const queryWords = s => {
  const all = words(s).filter(w => w.length >= 2); // bỏ ký tự đơn lẻ
  const kept = all.filter(w => !STOP.has(w));
  return kept.length ? kept : all;
};

export function buildIndex(entries) {
  return entries.map(entry => ({
    entry,
    label: words(entry.label),
    kw: words(entry.kw),
    cat: words(entry.category),
    labelFold: fold(entry.label),
  }));
}

function nearEqual(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

// 3 = trùng cả từ, 2 = đầu từ, 1 = gần đúng; 0 = không khớp.
function match(token, list, allowFuzzy) {
  let best = 0;
  for (const word of list) {
    if (word === token) return 3;
    if (token.length >= 2 && word.startsWith(token)) best = Math.max(best, 2);
    else if (allowFuzzy && token.length >= 5 && nearEqual(token, word)) best = Math.max(best, 1);
  }
  return best;
}

export function search(index, query, limit = 8) {
  const tokens = queryWords(query);
  if (!tokens.length) return [];
  const whole = tokens.join(" ");
  const scored = [];

  for (const row of index) {
    let total = 0;
    for (const token of tokens) {
      const s = Math.max(
        match(token, row.label, true) * 3,
        match(token, row.kw, false) * 2,
        match(token, row.cat, false)
      );
      if (!s) { total = 0; break; }
      total += s;
    }
    if (!total) continue;
    if (row.labelFold === whole) total += 6;
    else if (row.labelFold.startsWith(whole)) total += 4;
    else if (row.labelFold.includes(whole)) total += 2;
    scored.push({ row, total });
  }

  return scored
    .sort((a, b) => b.total - a.total || a.row.labelFold.length - b.row.labelFold.length)
    .slice(0, limit)
    .map(item => item.row.entry);
}
