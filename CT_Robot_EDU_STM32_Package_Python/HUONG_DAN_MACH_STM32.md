# Mạch STM32 trong CT Robot EDU

Có 3 mạch, mỗi mạch là một extension riêng (`src/extensions/builtin/stm32*.js`) với **bộ khối riêng**:
kiểu khối có tiền tố của mạch, tên khối ghi `[TÊN MẠCH]` và tên chân thật của chip.
Chọn mạch trong nhóm **STM32** ở màn hình chọn phần cứng; toolbox tự đổi sang 3 nhóm của đúng mạch
(🚗 Di chuyển · 🧩 Mạch · 🔵 Bluetooth). Khối GPIO/Bluetooth chung của lõi được ẩn trên các mạch này.

| Mạch | Chip | Tiền tố khối | FQBN (arduino-cli) |
|---|---|---|---|
| BLUE PILL | STM32F103C8T6 | `stm32bp_` | `STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8` |
| BLACK PILL | STM32F411CEU6 | `stm32bk_` | `STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE` |
| NUCLEO-F401RE | STM32F401RET6 | `stm32nuc_` | `STMicroelectronics:stm32:Nucleo_64:pnum=NUCLEO_F401RE` |

## Sơ đồ chân mặc định (đổi được trong "Cấu hình GPIO & L298N", nhập tên chân như `PB12`)

| Chức năng | Blue Pill | Black Pill | Nucleo-F401RE |
|---|---|---|---|
| IN1 / IN2 / ENA (PWM) | PB12 / PB13 / PB6 | PB12 / PB13 / PA6 | PA9 / PC7 / PB4 |
| IN3 / IN4 / ENB (PWM) | PB14 / PB15 / PB7 | PB14 / PB15 / PA7 | PB10 / PA8 / PB6 |
| HC-SR04 TRIG / ECHO | PB0 / PB1 | PB0 / PB1 | PA7 / PB6 |
| Dò line trái / phải | PB8 / PB9 | PB8 / PB9 | PA0 / PA1 |
| LED | PC13 (sáng mức thấp) | PC13 (sáng mức thấp) | PA5 · LD2 (sáng mức cao) |
| Còi / Servo | PB5 / PB10 | PB5 / PB10 | PB5 / PB3 |
| Nút | — | KEY · PA0 | USER B1 · PC13 |
| Bluetooth HC-05 | USART2: RX PA3, TX PA2 | USART2: RX PA3, TX PA2 | USART6: RX PA12, TX PA11 |

Nucleo ghi cả tên chân Arduino và tên chip trong danh sách chân (ví dụ `D5 (PB4)`).

## Các khối của mỗi mạch (24 khối Blue Pill, 25 khối Black Pill và Nucleo)

- **Di chuyển:** đi thẳng, đi lùi, rẽ trái, rẽ phải (theo giây), cùng 4 khối chạy liên tục, 2 khối rẽ theo góc, dừng robot.
- **Mạch:** LED của mạch, còi, servo, khoảng cách HC-SR04, dò line trái/phải, nút (Black Pill, Nucleo), ghi chân, đọc chân,
  đọc ADC, PWM (danh sách chân chỉ gồm chân dùng được / có ADC / có PWM trên mạch đó).
- **Bluetooth:** nhận lệnh, đọc ký tự, gửi chuỗi (ghi rõ UART của mạch).

## Kiểm tra cấu hình trước khi biên dịch

Báo lỗi khi: tên chân sai dạng (`12`), chân không có trên chip (PB11 trên Black Pill), ENA/ENB không có kênh PWM,
hai chức năng dùng chung một chân (kể cả chân UART Bluetooth).

## Đã kiểm tra / chưa kiểm tra

Đã chạy: `node --test` (toàn bộ test, gồm `tests/stm32Boards.test.js`); biên dịch **cú pháp** sketch của cả 3 mạch bằng g++ với
header STM32duino giả; gói giao diện bằng esbuild.
**Chưa chạy:** `arduino-cli` + core `STMicroelectronics:stm32` thật, nạp lên mạch thật, `vite build`.
Cần xác nhận trên phần cứng: chuỗi FQBN, bảng chân/timer PWM, xung đột timer giữa PWM, `Servo` và `tone()` trong STM32duino,
`HardwareSerial(rx, tx)` trên USART2/USART6, và phương thức nạp (ST-LINK/DFU/serial; cần STM32CubeProgrammer cho ST-LINK).
Mọi chân STM32 là 3,3 V: ECHO của HC-SR04 và HC-05 TX phải qua chia áp/mức logic phù hợp.
Mô phỏng: khối di chuyển/LED/còi/servo của STM32 chạy như khối core; khối đọc cảm biến trả 0.

## Thêm mạch STM32 khác

Tạo `src/extensions/builtin/stm32<Tên>.js` gọi `createStm32Board({...})` (xem 3 file mẫu), thêm tiền tố vào
`SIM_BLOCK_ALIASES` (App.jsx) và `lint.js`, và thêm FQBN vào `src/boardTargets.js`.


## Ghi chú sau khi rà soát STM32

- Blue Pill dùng PB6/PB7 làm ENA/ENB của L298N. Hai chân này thuộc TIM4, tránh timer TIM3 dành cho `tone()` và TIM2 dành cho thư viện Servo trong variant Blue Pill của STM32duino.
- Trên Blue Pill, PA2/PA3 dành cho Bluetooth USART2, không xuất hiện trong danh sách GPIO/ADC tổng quát. Các chân PWM được lọc theo timer để tránh TIM2/TIM3.
- Trên Black Pill, PA0 là nút KEY, PA2/PA3 dành cho Bluetooth USART2; các chân này không được chọn làm GPIO/ADC/PWM thông thường. TIM10/TIM11 được dành cho `tone()`/Servo theo variant Black Pill F411CE.
- Trợ lý AI nhận diện tên chân STM32 dạng PAx/PBx/PCx, kiểm tra đúng danh sách Digital/ADC/PWM và cảnh báo khi block GPIO dùng trùng chân đã cấu hình cho thiết bị trên mạch.
- Tốc độ của các block di chuyển STM32 là biên độ 0–100%; hướng tiến/lùi/rẽ do tên block quyết định.
