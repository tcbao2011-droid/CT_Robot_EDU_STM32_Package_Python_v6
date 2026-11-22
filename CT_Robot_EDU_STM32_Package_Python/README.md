# CT Robot EDU – Block programming for Arduino / ESP32

Nền tảng lập trình robot kéo–thả bằng Blockly. Người dùng chọn bo mạch trước khi vào vùng lập trình; danh sách chân GPIO, mã runtime và cấu hình Arduino CLI được chuyển theo board đã chọn.

## Các board được hỗ trợ

| Board trong ứng dụng | FQBN | PWM động cơ |
|---|---|---|
| Arduino UNO R3 + L298N | `arduino:avr:uno` | `analogWrite()` – ENA/ENB phải dùng chân PWM 3, 5, 6, 9, 10 hoặc 11 |
| Arduino Nano Classic ATmega328P + L298N | `arduino:avr:nano:cpu=atmega328` | `analogWrite()` – mặc định D5 và D6 |
| Arduino Nano Classic bootloader cũ + L298N | `arduino:avr:nano:cpu=atmega328old` | `analogWrite()` – mặc định D5 và D6 |
| ESP32 DevKit V1 + L298N | `esp32:esp32:esp32` | LEDC theo GPIO, Arduino-ESP32 core 3.x |
| CT ROBOT EDU BOARD (ESP32) | `esp32:esp32:esp32` | LEDC theo GPIO, Arduino-ESP32 core 3.x |
| CT Expansion Board (ESP32 + 3×TB6612) | `esp32:esp32:esp32` | 6 kênh TB6612; PCA9685/PCF8574 qua I2C |
| ESP32-S3 Dev Module + L298N | `esp32:esp32:esp32s3` | LEDC theo GPIO, Arduino-ESP32 core 3.x |

Các profile "tự chọn GPIO" dùng cùng FQBN và runtime với board tương ứng, chỉ khác khả năng cấu hình chân. Các lựa chọn Nano trong bản này là **Nano Classic ATmega328P**, không phải Nano Every hoặc Nano 33.

## Tính năng chính

- Blockly giao diện tiếng Việt, kéo thả các khối lệnh robot.
- Chọn phần cứng trước khi bắt đầu lập trình; có thể đổi board trong quá trình làm việc.
- Menu GPIO, PWM và ADC tự thay đổi theo board đã chọn.
- Sinh sketch Arduino hoàn chỉnh có `setup()`, `loop()` và Robot API phù hợp với AVR hoặc ESP32.
- Rê chuột lên khối Blockly trong workspace để tô sáng đoạn mã Arduino tương ứng; hỗ trợ khối lồng nhau và tự cuộn tới đoạn mã. Marker ánh xạ được gỡ trước khi xuất `.ino` hoặc gửi biên dịch.
- Arduino UNO/Nano Classic dùng `analogWrite()` và thư viện `Servo`.
- ESP32/ESP32-S3 dùng LEDC API của Arduino-ESP32 core 3.x và `ESP32Servo` khi chương trình có khối servo.
- Lưu/mở Blockly XML, xuất file `.ino`, chạy mô phỏng robot.
- Biên dịch riêng (không nạp) hoặc biên dịch & nạp bằng `arduino-cli` theo FQBN của board đang chọn; có thể tự nhận diện cổng serial hoặc nhập cổng thủ công.

## Xuất mã Python (MicroPython)

Ở panel mã, công tắc **C++ / Python** chọn ngôn ngữ hiển thị và xuất. Chế độ Python sinh một file `main.py` MicroPython hoàn chỉnh (cấu hình chân, Robot API, chương trình từ Blockly) và vẫn tô sáng dòng mã khi rê chuột lên khối.

- Hỗ trợ: **ESP32 / ESP32-S3** (ESP32 DevKit, CT ROBOT EDU BOARD, CT Expansion Board: 6 động cơ TB6612, servo PCA9685, PCF8574, siêu âm, cảm biến độ ẩm I2C).
- Chưa hỗ trợ: Arduino UNO/Nano (AVR không chạy MicroPython) và các board STM32 (chọn board này thì tab Python hiện thông báo, nút Xuất .py bị khóa).
- Nạp mã: cài firmware MicroPython cho ESP32, mở `main.py` bằng Thonny hoặc dùng `mpremote cp main.py :main.py`, rồi reset board. Nút "Biên dịch & Nạp" chỉ dành cho C++ (Arduino CLI).
- Cách làm: các generator hiện có vẫn sinh chung một "từ vựng" lệnh; `src/pythonGenerator.js` chuyển phần thân chương trình sang Python và ghép với runtime trong `src/pythonRuntime.js`. Khối extension mới tự chạy được nếu chỉ dùng các hàm đã có trong runtime; nếu không, dòng đó thành chú thích `# CHƯA CHUYỂN ĐƯỢC SANG PYTHON`.
- Khác biệt so với C++: phép chia `/` là chia thực (không cắt phần nguyên như C++ với số nguyên); chương trình không tự dừng motor khi kết thúc, chỉ dừng khi nhấn Ctrl+C trong Thonny.

## Chạy ứng dụng

Yêu cầu Node.js 20.19+ hoặc 22.12+ và npm (theo yêu cầu của Vite 7).

```bash
npm install
npm test
npm run dev
```

Mở URL Vite hiển thị trong terminal (thường là `http://localhost:5173`).

## Chuẩn bị Arduino CLI

Cài Arduino CLI và bảo đảm lệnh `arduino-cli` chạy được từ terminal. Sau đó cài core cho các board cần dùng:

```bash
arduino-cli core update-index
arduino-cli core install arduino:avr
```

Để cài core ESP32, thêm URL Board Manager của Espressif rồi cài core:

```bash
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

Nếu dùng khối SERVO, cài thư viện tương ứng:

```bash
arduino-cli lib install Servo
arduino-cli lib install ESP32Servo
```

ESP32 cần Arduino-ESP32 core 3.x vì runtime dùng API `ledcAttach()` / `ledcWrite()` theo GPIO. Firmware `.bin` ESP32 được truyền dưới dạng Base64 trong endpoint biên dịch để không làm hỏng dữ liệu nhị phân. Ứng dụng không tự cài core hay thư viện; nếu thiếu, cài trong terminal rồi thử biên dịch lại.

## Kết nối và nạp chương trình

1. Cắm board bằng cáp USB có truyền dữ liệu.
2. Khi mở ứng dụng, chọn đúng model board và kiểu robot.
3. Nếu ứng dụng không tự dò được cổng, nhập cổng vào ô Port, ví dụ `COM5` trên Windows hoặc `/dev/ttyUSB0` trên Linux.
4. Nhấn **Chỉ biên dịch** để kiểm tra code trước, không ghi firmware vào board.
5. Khi biên dịch thành công, nhấn **Biên dịch & Nạp**. Server Vite sẽ gọi `arduino-cli compile --upload` với FQBN tương ứng.

Nano clone có bootloader cũ cần chọn profile **Arduino Nano Classic (bootloader cũ)**.

## Lưu ý về phần cứng

- Profile chân là cấu hình mặc định/gợi ý theo loại board và cách đấu L298N; nút **Khôi phục chân mặc định** đưa các giá trị trở lại profile đã chọn. Kiểm tra sơ đồ board thật trước khi cấp nguồn. Profile CT ROBOT EDU giữ sơ đồ GPIO từ dự án gốc.
- Trợ lý AI trên UNO/Nano/ESP32/ESP32-S3 không coi các chân motor/cảm biến trong profile mẫu là chân bị chiếm; chỉ kiểm tra giới hạn và chức năng đặc biệt của MCU (flash, boot-strapping, UART, USB, input-only, SPI/I2C). Riêng CT Expansion giữ nguyên danh sách GPIO cố định trên PCB và đồng thời kiểm tra các giới hạn ESP32.
- ESP32/ESP32-S3 dùng mức logic 3.3V, không chịu được tín hiệu 5V trực tiếp. Với module siêu âm có chân ECHO 5V, phải dùng mạch chia áp hoặc bộ chuyển mức phù hợp trước khi nối vào ESP32.
- Với UNO/Nano Classic, hai chân ENA/ENB của L298N phải là chân PWM hợp lệ. Ứng dụng sẽ cảnh báo nếu cấu hình khác danh sách PWM của AVR.
- Khối phím mũi tên chỉ phục vụ mô phỏng trên máy tính; mã robot thật bỏ qua các sự kiện bàn phím.
- Khối quay theo góc đang ước lượng bằng thời gian, cần hiệu chỉnh phù hợp với động cơ, bánh xe và nguồn điện thực tế.

## Cấu trúc dự án

- `src/App.jsx`: giao diện, lựa chọn phần cứng, Blockly workspace, mô phỏng và luồng nạp.
- `src/robotBlocks.js`: định nghĩa block và chuyển block sang lệnh C++.
- `src/codeSourceMap.js`: liên kết ID Blockly với khoảng ký tự trong sketch để tô sáng mã theo hover.
- `src/hardwareProfiles.js`: profile board, kiểm tra chân và runtime Arduino/ESP32.
- `src/assistant/pinRules.js`: quy tắc GPIO riêng cho kiểm tra AI; giữ map PCB CT Expansion.
- `src/controlFlowGenerator.js`: sinh nhánh IF / ELSE IF / ELSE cho mã C++.
- `src/boardTargets.js`: danh sách FQBN được endpoint biên dịch cho phép.
- `src/compiler.js`: đọc luồng log NDJSON và kết quả biên dịch.
- `src/uploadServer.js`: gửi sketch và FQBN tới server nạp.
- `vite.config.js`: endpoint máy chủ gọi Arduino CLI để biên dịch/nạp; các endpoint API này chạy trong `npm run dev`.
- `src/extensions/`: **Extension Registry** – thêm mạch mở rộng bằng cách thả một file vào `src/extensions/builtin/` (xem `src/extensions/README.md`).

Thư mục `node_modules` không được đóng gói trong bản phát hành; chạy `npm install` sau khi giải nén để tạo dependency phù hợp với hệ điều hành đang sử dụng.


## Kiểm tra trước khi nạp

- Nút **Chỉ biên dịch** gọi endpoint cục bộ `/api/compile`; quá trình này tạo file `.hex` cho AVR hoặc `.bin` cho ESP32 và không nạp vào board.
- Nút **Biên dịch & Nạp** gọi `/api/upload`; Arduino CLI sẽ biên dịch lại rồi nạp vào cổng serial đã chọn/tự nhận diện.
- Các API trên là middleware của Vite development server. Khi chạy `npm run preview` hoặc đóng gói bản production, cần triển khai một local backend tương đương nếu muốn dùng hai thao tác này.
- Lệnh kiểm thử mã nguồn: `npm test`. Lệnh build giao diện: `npm run build`.
