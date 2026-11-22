# CT ROBOT EDU – Blockly hover to Arduino code highlight

## Đã bổ sung

- Khi rê chuột lên một block đã đặt trong workspace, ứng dụng tra ID của block và tô sáng các dòng Arduino do block đó sinh ra.
- Tự cuộn khung mã tới dòng tương ứng nếu dòng đó đang nằm ngoài vùng nhìn.
- Hỗ trợ generator dạng statement và value, bao gồm generator của extension được đăng ký muộn.
- Với khối điều khiển/lặp, vùng tô sáng bao gồm phần mã con nằm bên trong; khi rê lên block con, chỉ đoạn mã của block con được đánh dấu.
- Với `KHI NHẬN SỰ KIỆN`, vùng mã được liên kết tới phần thân hàm sự kiện thay vì phần `setup()`.
- Marker ánh xạ chỉ tồn tại trong bước nội bộ; được gỡ trước khi hiển thị, xuất `.ino` hoặc gửi mã sang máy chủ biên dịch.
- Không đổi cấu trúc sketch, không thêm thư viện runtime và không thay đổi mã C++ cuối cùng ngoài nội dung block vốn đã được sinh.

## Kiểm tra

Chạy:

```bash
npm test
```

Bộ test hiện tại: **13/13 đạt**. Bao gồm kiểm tra instrumentation generator, ánh xạ block lồng nhau, xử lý range theo dòng, bảo toàn sketch sau khi gỡ marker, profile CT Expansion, và kiểm tra xung đột GPIO.

Đã kiểm tra cú pháp JSX/JavaScript bằng TypeScript transpile parser: các tệp App, generator, Registry, Hardware Profile và test đều qua.

`npm run build` chưa xác nhận được trong môi trường đóng gói này vì `vite` chưa được cài; `npm ci` không tải được gói từ npm registry do lỗi DNS `EAI_AGAIN`. Cần chạy `npm install` trên máy có kết nối mạng rồi kiểm tra lại production build.

## Sử dụng

1. Cài dependency bằng `npm install`.
2. Chạy `npm test`.
3. Chạy `npm run dev`.
4. Chọn board và mở vùng lập trình.
5. Kéo block vào workspace, sau đó rê chuột lên block để xem các dòng mã tương ứng sáng lên ở panel **MÃ ARDUINO**.

## Giới hạn đã biết

- Block trong flyout/toolbox chưa được tô sáng vì block chưa được đặt vào workspace nên chưa có đoạn mã trong chương trình.
- Block không sinh mã trực tiếp (ví dụ block sự kiện rỗng) sẽ hiện thông báo không có mã riêng.
- Chưa kiểm thử thao tác hover trực tiếp trên trình duyệt thật trong môi trường này; kiểm tra hiện tại là unit test, kiểm tra tích hợp tạo sketch và kiểm tra cú pháp.
