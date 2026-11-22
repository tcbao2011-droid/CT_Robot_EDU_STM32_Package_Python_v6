# Ghi chú sửa chữa - biên dịch và quy tắc GPIO

## Luồng biên dịch
- Bổ sung thao tác **Chỉ biên dịch**, tách khỏi thao tác nạp firmware.
- Chuẩn hóa việc đọc NDJSON theo từng chunk; xử lý cả dòng cuối không có newline, phản hồi HTTP lỗi và phản hồi thiếu tín hiệu hoàn tất.
- Endpoint `/api/compile` tạo thư mục output riêng, chọn artifact `.hex` cho AVR và `.bin` cho ESP32, báo lỗi cụ thể khi thiếu `arduino-cli`/board core, dọn thư mục tạm và dừng tiến trình khi client ngắt.
- Endpoint `/api/upload` kiểm tra kích thước/nội dung request, xử lý log theo dòng và dừng tiến trình nếu client ngắt.
- Tách danh sách FQBN được phép vào `src/boardTargets.js`, có kiểm thử để bảo đảm các profile có mục tiêu biên dịch hợp lệ.
- Đăng ký các khối chuẩn Blockly qua `import "blockly/blocks"`, bảo đảm `math_number` và `controls_if` có định nghĩa trong workspace.

## Sinh mã điều khiển
- Đưa bộ sinh `if / else-if / else` thành helper riêng và duyệt toàn bộ nhánh `IF0..IFn` cùng `ELSE`.
- Đồng bộ mô phỏng với các nhánh điều kiện, để mô phỏng không bỏ qua nhánh phụ mà firmware sẽ thực thi.
- Runtime còi ESP32 tắt tone sau xung 200 ms, tương đương hành vi pulse của AVR.

## Cấu hình chân và AI
- Các board thông dụng: không lấy các chân motor/cảm biến/LED/buzzer của profile mẫu làm GPIO bị chiếm đối với AI. Chỉ kiểm tra chân đặc biệt/khả năng phần cứng của MCU.
- ESP32 và ESP32-S3 có quy tắc riêng cho flash/PSRAM, boot-strapping, UART/USB và chân input-only.
- CT Expansion giữ các chân cố định PCB từ extension, đồng thời được kiểm tra các giới hạn/chân đặc biệt cấp ESP32.
- Bổ sung nút khôi phục cấu hình GPIO về mặc định của profile đang chọn. Không thay đổi sơ đồ chân PCB CT Expansion.
- Bluetooth UART có cặp chân riêng theo ESP32 profile, tránh trùng GPIO với buzzer/servo mặc định.

## Kiểm thử đã chạy trong phiên
- `node --test`: 46/46 bài test đạt.
- `node --check`: các tệp JavaScript và `vite.config.js` đạt.
- Phân tích cú pháp JSX bằng TypeScript transpile: `App.jsx`, `RobotSimulator.jsx`, `AssistantPanel.jsx` không có diagnostics.
- Sinh các sketch đại diện UNO, Nano, ESP32, ESP32-S3, CT Robot EDU và CT Expansion; kiểm tra cú pháp C++ bằng `g++ -fsyntax-only` với header stub mô phỏng Arduino APIs: 6/6 sketch đạt. Đây là kiểm tra cú pháp C++ độc lập, không thay thế biên dịch bằng Arduino core/thư viện và không xác nhận phần cứng thật.

## Chưa thể xác nhận trong môi trường này
- `npm ci` bị timeout do registry npm trả về lỗi mạng `EAI_AGAIN`, nên chưa chạy được `vite build` trong môi trường này.
- `arduino-cli` không có trong PATH nên chưa thể biên dịch bằng Arduino AVR/ESP32 core chính thức hoặc thử nạp board thật.
- Để kiểm tra cuối trên máy Windows: cài dependency bằng `npm ci`, cài Arduino CLI + core cần dùng, chạy `npm test`, `npm run build`, `npm run dev`; thử **Chỉ biên dịch** cho từng FQBN trước khi nạp.
