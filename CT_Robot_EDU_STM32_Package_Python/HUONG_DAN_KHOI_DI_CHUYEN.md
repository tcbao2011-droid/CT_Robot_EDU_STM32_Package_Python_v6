# Khối di chuyển cho CT EXPANSION BOARD

Chọn board **CT EXPANSION BOARD (ESP32 + TB6612)** → trong Toolbox có nhóm **🚗 Di chuyển**.
Robot 2 bánh: **M1 = bánh trái, M2 = bánh phải** (theo profile board). Ô tốc độ/thời gian/góc đã điền sẵn giá trị mặc định, có thể thay bằng biến.

| Nhóm | Khối | Mặc định |
|---|---|---|
| Theo thời gian | ĐI THẲNG · ĐI LÙI · RẼ TRÁI · RẼ PHẢI (tốc độ %, trong N giây, tự dừng) | 80 % · 1 s (rẽ: 60 % · 0,5 s) |
| Liên tục | ĐI THẲNG / LÙI / RẼ TRÁI / RẼ PHẢI liên tục (chạy tới khi gặp khối DỪNG) | 80 % (rẽ: 60 %) |
| Theo góc | RẼ TRÁI / RẼ PHẢI góc N ° | 60 % · 90° |
| Dừng | DỪNG ROBOT | |

Ví dụ tránh vật cản: `LẶP MÃI` → `nếu KHOẢNG CÁCH SIÊU ÂM < 20` → `RẼ TRÁI 60% trong 0,5 giây` / `nếu không` → `ĐI THẲNG liên tục 70%`.

Lưu ý
- "Rẽ" là quay tại chỗ (một bánh tiến, một bánh lùi).
- Rẽ theo góc được ước lượng bằng thời gian: chỉnh **Quay 1° (ms)**, % bánh trái/phải và đảo chiều trong *Cấu hình GPIO & L298N*.
- Các khối này chỉ điều khiển M1/M2. M3–M6 vẫn dùng khối **ĐỘNG CƠ Mx chạy …** trong nhóm 🧩 Mạch mở rộng CT.
- Chạy được trong **Mô phỏng**; chưa thử trên robot thật.
