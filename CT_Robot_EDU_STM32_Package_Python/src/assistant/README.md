# Trợ lý lập trình (offline)

Không dùng mạng, không dùng LLM, không thêm thư viện. Toàn bộ chạy bằng luật + mẫu câu, nhẹ và trả lời tức thì.

| Chức năng | File | Cách hoạt động |
|---|---|---|
| Tìm khối | `search.js`, `catalog.js` | Lập danh mục từ **toolbox đang hiển thị** (đúng board). Tìm không dấu, đồng nghĩa, chịu gõ sai 1 ký tự. Chọn kết quả = thêm khối vào vùng lập trình. |
| Giải thích | `explain.js`, `knowledge.js` | Chọn một khối → giải thích khối đó (tuỳ chọn kèm các khối phía dưới). Không chọn → giải thích cả chương trình, có tóm tắt. Bấm một dòng để nhảy tới khối. |
| Kiểm tra lỗi | `lint.js` | Tự chạy sau mỗi thay đổi (trễ 0,35 s). Mỗi lỗi có gợi ý sửa, nút "Đến khối", và "Sửa nhanh" khi tự sửa được. |

## Thêm khối mới cho trợ lý

- Khối core: thêm một dòng vào `INFO` trong `knowledge.js`.
- Khối của extension: khai báo `assistant` ngay trong manifest, không cần sửa core:

```js
{ type: "ctexp_servo", kind: "statement", json: {...}, generator: ...,
  assistant: {
    label: "Servo (PCA9685)",
    keywords: "servo goc quay pca9685",          // đồng nghĩa, không cần dấu
    description: "Quay servo ở kênh 1–6 tới một góc.",
    explain: a => `Servo ${a("CHANNEL")} quay tới ${a("ANGLE")}°`,
    tip: "Góc từ 0 đến 180°.",
  } }
```

Khối không khai báo vẫn tìm và giải thích được (dùng nhãn + tooltip của Blockly).

## Thêm luật kiểm tra

- Giới hạn giá trị: thêm vào bảng `RANGES` trong `lint.js`.
- Luật khác: thêm một đoạn trong vòng lặp của `lint()`; mỗi luật gọi `add(level, node, rule, msg, hint, fix?)`.

Kiểm thử: `npm test` (`tests/assistant.test.js`).
