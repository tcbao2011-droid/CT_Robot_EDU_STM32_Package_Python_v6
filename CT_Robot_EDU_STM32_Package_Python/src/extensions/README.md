# Extension Registry

Thêm mạch mở rộng mới **không cần sửa code core**: chỉ thêm một file vào `src/extensions/builtin/`
và `export default defineExtension({...})`. `index.js` tự quét thư mục (`import.meta.glob`).

## Một extension cung cấp những gì

| Trường | Tác dụng |
|---|---|
| `id`, `name`, `version`, `blockPrefix` | Định danh. Mọi block type phải bắt đầu bằng `<blockPrefix>_` để không đụng core. |
| `requires.platform` | Chỉ bật trên board cùng nền tảng (`esp32` / `avr`). |
| `profiles[]` | Profile board mới (hiện trong danh sách chọn board, thuộc `group`). Profile có `extensions: [id]` thì extension được bật khi chọn board đó. |
| `blocks[]` | `{ type, kind: "statement" \| "value", json, generator(block, gen) }`. Khi board không có extension, generator tự sinh comment (statement) hoặc `0` (value) thay vì mã hỏng. |
| `toolbox` | Category (hoặc `(profile) => category`) chỉ hiện khi extension đang bật. |
| `pins[]` | `{ gpio, role }` chân cố định trên PCB. Dùng để cảnh báo khi người dùng sửa tay GPIO đè lên chân của mạch. Một GPIO khai báo hai lần trong manifest bị từ chối ngay lúc đăng ký. |
| `i2c[]` | `{ name, address \| addresses }` để phát hiện trùng địa chỉ giữa các extension. |
| `capabilities.remove[]` | Gỡ khả năng của board khỏi toolbox, ví dụ `["gpio"]` ẩn nhóm Analog / Digital. `sketch.disables` cũng tự gỡ `bluetooth`, `led`, `buzzer`. |
| `validate({config, profile})` | Trả về mảng lỗi tùy ý, hiện cùng lỗi của core trước khi nạp. |
| `sketch.sections[]` | Đoạn C++ chèn vào sketch. `usedWhen` (RegExp) chỉ chèn khi chương trình dùng tới; `requires` kéo section phụ thuộc; `provides` thay thế tính năng của core (`"servo"`, `"distance"`). |
| `sketch.disables[]` | Tính năng core không dùng được trên mạch: `"bluetooth-uart"`, `"led"`, `"buzzer"`, `"trig"`. |

## Luồng hoạt động

1. `registerExtension` kiểm tra manifest, đăng ký profile vào `HARDWARE_PROFILES` / `BOARD_GROUPS`, cài block + generator vào Blockly.
2. `App.jsx` gọi `setActiveExtensionProfile` và `workspace.updateToolbox` khi đổi board.
3. `buildArduinoSketch` hỏi registry (`collectSketchParts`) và ghép `includes`, `prelude`, `setup` vào sketch.
4. `validateHardwareConfig` hỏi registry (`validateExtensions`) trước khi biên dịch/nạp.

## Điểm nối trong core (đã làm sẵn, chỉ một lần)

- `hardwareProfiles.js`: `setExtensionProvider`, `registerHardwareProfile`, macro `CT_NO_*` / `CT_OVERRIDE_*` trong runtime ESP32.
- `App.jsx`: `createToolbox(profile)` nối category của extension; effect cập nhật toolbox khi đổi board.

## Extension hiện có

- `ctExpansionEsp32.js` – ESP32 DevKit V1 + 3×TB6612 (6 động cơ) + PCA9685 (6 servo) + PCF8574 + HC-SR04 + dò line. Model cảm biến độ ẩm tại J6 chưa được xác định từ sơ đồ, nên firmware hiện chỉ thử nhận diện AHT10/20/21 hoặc SHT3x; cần xác nhận đúng mã cảm biến trước khi coi phần nhiệt độ/độ ẩm là đã kiểm chứng.

## Khối di chuyển của CT Expansion

`ctExpansionEsp32.js` khai báo 11 khối `ctexp_forward…ctexp_stop` (xem `HUONG_DAN_KHOI_DI_CHUYEN.md`). Chúng sinh lệnh Robot API của core (`robot.forward`, `robot.turnLeftAngle`…) nên dùng chung hiệu chỉnh; manifest `toolbox` có thể là mảng nhiều category, và `blocks[].assistant` giúp trợ lý AI hiểu khối. Mô phỏng nhận khối qua `SIM_BLOCK_ALIASES` trong `App.jsx`.

## Lọc toolbox theo phần cứng

Category hoặc block trong `createToolbox()` (App.jsx) có thể gắn `requires: "<khả năng>"` (chuỗi hoặc mảng).
`filterToolbox` (capabilities.js) chỉ giữ mục mà board đang chọn còn khả năng đó, bỏ category rỗng và gỡ khóa `requires` trước khi đưa cho Blockly.
Khả năng đang dùng: `gpio` (Analog / Digital), `bluetooth`, `led`, `buzzer`. Thêm khả năng mới chỉ cần gắn `requires` và khai báo `capabilities.remove` ở extension tương ứng.
Khối đã nằm sẵn trong workspace không bị xoá khi đổi board.

## Mạch STM32

`builtin/stm32BluePill.js`, `stm32BlackPill.js`, `stm32NucleoF401RE.js` dùng chung `stm32/factory.js` (`createStm32Board`).
Mỗi mạch có kiểu khối, tên khối và danh sách chân riêng; xem `HUONG_DAN_MACH_STM32.md`.
