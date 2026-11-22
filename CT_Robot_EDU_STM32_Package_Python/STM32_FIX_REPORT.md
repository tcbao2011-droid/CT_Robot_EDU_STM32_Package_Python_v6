# Báo cáo sửa lỗi phần STM32 – CT Robot EDU

## Những nội dung đã chỉnh sửa

1. **Blue Pill – phân bổ PWM động cơ**
   - Đổi chân ENA/ENB mặc định của L298N từ PA6/PA7 sang PB6/PB7.
   - PB6/PB7 thuộc TIM4 trên cấu hình Blue Pill đang dùng; tránh timer TIM3 dành cho `tone()` và TIM2 dành cho thư viện Servo.
   - Bổ sung bảng ánh xạ timer PWM để bộ kiểm tra cấu hình có thể báo khi người dùng chuyển ENA/ENB sang timer bị dành riêng.

2. **Danh sách chân STM32**
   - Blue Pill: loại PA2/PA3 khỏi danh sách GPIO/ADC vì đây là RX/TX của USART2 Bluetooth.
   - Black Pill: loại PA0 khỏi GPIO/ADC/PWM vì đây là nút KEY; loại PA2/PA3 khỏi GPIO/ADC vì dành cho USART2 Bluetooth.
   - Duy trì danh sách PWM riêng theo từng board; không đưa các chân gắn timer TIM10/TIM11 của Black Pill vào danh sách PWM tổng quát.

3. **Trợ lý AI kiểm tra chân STM32**
   - Hỗ trợ tên chân dạng chuỗi PA0, PB12, PC13 thay vì chỉ chuyển GPIO sang số.
   - Kiểm tra chân có tồn tại trên board và có hỗ trợ đúng chế độ Digital, ADC hoặc PWM.
   - Đánh dấu các chân đã được cấu hình cho động cơ, cảm biến, LED, còi, servo là chân đang được sử dụng; cảnh báo nếu một block GPIO khác dùng trùng.
   - Giữ nguyên cơ chế kiểm tra cũ của ESP32, AVR và CT Expansion.

4. **Giới hạn tốc độ block STM32**
   - Bộ lint giới hạn tốc độ block di chuyển STM32 trong khoảng 0–100% cho khớp nội dung block.
   - Runtime STM32 cũng chặn giá trị tốc độ âm hoặc vượt 100; chiều tiến/lùi/rẽ do loại block quyết định.
   - Không thay đổi giới hạn tốc độ của các nền tảng AVR/ESP32.

5. **Tài liệu và kiểm thử**
   - Cập nhật bảng chân Blue Pill/Black Pill trong `HUONG_DAN_MACH_STM32.md`.
   - Bổ sung kiểm thử cho timer, chân Bluetooth/KEY, lint tên chân STM32 và giới hạn tốc độ.

## Kết quả kiểm tra

- `npm test`: **65/65 bài kiểm thử đạt**.
- Kiểm tra cú pháp JavaScript bằng `node --check` cho các tệp đã sửa: đạt.
- `npm run build`: chưa chạy được vì bản làm việc không có thư mục `node_modules` và lệnh `vite` chưa được cài trong môi trường.
- Biên dịch firmware STM32duino: chưa thực hiện được vì môi trường không có `arduino-cli` và bộ core STM32duino.
- Chưa nạp thử trên phần cứng thật. Vì vậy cần xác nhận lại hoạt động động cơ/còi/servo/Bluetooth trên từng bo mạch trước khi phát hành chính thức.

## Lưu ý riêng cho Nucleo-F401RE

Không thêm khẳng định về timer tone/servo nếu chưa kiểm tra đúng variant mà người dùng cài. Danh sách chân PWM đang sử dụng được giữ theo cấu hình dự án; cần đối chiếu bản core STM32duino cụ thể khi thiết lập build firmware thực tế.
