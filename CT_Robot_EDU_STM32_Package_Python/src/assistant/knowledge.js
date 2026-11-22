/* =====================================================
   TRI THỨC VỀ KHỐI LỆNH (offline, không cần AI)
   -----------------------------------------------------
   Mỗi khối: [nhãn, từ khoá/đồng nghĩa, công dụng, say]
   - say(a, node): câu mô tả khi khối nằm trong chương trình.
     a("SPEED") trả về giá trị đã dịch ra chữ của ô/ngõ vào.
   Khối mới (extension) có thể khai báo `assistant` ngay trong
   manifest, xem README.md; không cần sửa file này.
===================================================== */
import { lc } from "./text.js";

const I = (label, kw, desc, say, tip) => ({ label, kw, desc, say, tip });
const pct = v => `${v}%`;

const move = (verb, timed) =>
  I(
    `${verb}${timed ? " (theo thời gian)" : " (liên tục)"}`,
    `${verb} di chuyen robot chay banh dong co`,
    timed
      ? `Robot ${lc(verb)} với tốc độ chọn trước trong một khoảng thời gian rồi dừng.`
      : `Robot ${lc(verb)} liên tục cho tới khi gặp khối dừng hoặc khối chuyển động khác.`,
    timed
      ? a => `${verb} với tốc độ ${pct(a("SPEED"))} trong ${a("SECONDS")} giây`
      : a => `${verb} liên tục với tốc độ ${pct(a("SPEED"))}`,
    "Tốc độ từ 0 đến 100%."
  );

const angle = verb =>
  I(
    `${verb} theo góc`,
    `${verb} goc xoay quay độ`,
    `Robot ${lc(verb)} một góc xác định (cần hiệu chỉnh thời gian quay 1° cho đúng).`,
    a => `${verb} ${a("DEGREES")}° với tốc độ ${pct(a("SPEED"))}`
  );

const key = arrow =>
  I(
    `Khi nhấn ${arrow}`,
    "phim ban phim mui ten nhan dieu khien",
    "Chạy các khối bên trong khi nhấn phím mũi tên. Chỉ dùng trong mô phỏng; robot thật bỏ qua.",
    () => `Khi nhấn phím ${arrow}`
  );

export const INFO = {
  ct_when_started: I("Khi bắt đầu", "bat dau khoi dong start chay chuong trinh mo dau", "Điểm xuất phát của chương trình: các khối bên trong chạy một lần khi robot khởi động.", () => "Khi bắt đầu chương trình"),
  ct_key_up: key("↑"),
  ct_key_down: key("↓"),
  ct_key_left: key("←"),
  ct_key_right: key("→"),
  ct_forever: I("Lặp mãi", "lap mai vo han loop forever mai mai lien tuc", "Chạy đi chạy lại các khối bên trong không bao giờ dừng. Dùng cho việc robot cần làm liên tục như dò line, tránh vật cản.", () => "Lặp lại mãi mãi", "Các khối đặt dưới khối này sẽ không bao giờ chạy tới."),
  ct_on_receive: I("Khi nhận sự kiện", "nhan su kien thong bao event receive", "Chạy các khối bên trong mỗi khi có khối PHÁT SỰ KIỆN cùng tên.", a => `Khi nhận sự kiện ${a("NAME")}`),
  ct_broadcast: I("Phát sự kiện", "phat gui su kien thong bao event broadcast", "Gửi một sự kiện để kích hoạt các khối KHI NHẬN SỰ KIỆN cùng tên. Giúp chia chương trình thành nhiều phần.", a => `Phát sự kiện ${a("NAME")}`),
  // ----- Điều khiển / vòng lặp -----
  ct_while: I("Lặp trong khi", "lap trong khi while vong lap dieu kien", "Lặp lại các khối bên trong chừng nào điều kiện còn đúng.", a => `Lặp trong khi ${a("COND")}`, "Nhớ có khối nào đó làm điều kiện sai, nếu không chương trình lặp mãi."),
  ct_repeat_until: I("Lặp cho đến khi", "lap cho den khi until vong lap dieu kien", "Lặp lại các khối bên trong cho đến khi điều kiện đúng.", a => `Lặp cho đến khi ${a("COND")}`),
  ct_for: I("Đếm từ … đến …", "dem for vong lap bien chay tu den buoc dem nguoc", "Cho một biến chạy từ số đầu đến số cuối, mỗi vòng cộng thêm một bước (bước âm để đếm ngược).", a => `Đếm ${a("VAR")} từ ${a("FROM")} đến ${a("TO")} bước ${a("BY")}`),
  ct_wait_until: I("Chờ đến khi", "cho den khi wait until doi dieu kien", "Dừng tại đây cho đến khi điều kiện đúng (ví dụ chờ nút nhấn hoặc cảm biến).", a => `Chờ đến khi ${a("COND")}`),
  ct_break: I("Thoát vòng lặp", "thoat break dung vong lap", "Dừng ngay vòng lặp đang chạy và đi tiếp phía sau vòng lặp.", () => "Thoát khỏi vòng lặp", "Chỉ dùng được bên trong vòng lặp."),
  ct_continue: I("Bỏ qua lần lặp này", "bo qua continue lan lap", "Bỏ phần còn lại của lần lặp này và sang lần lặp kế tiếp.", () => "Bỏ qua lần lặp này", "Chỉ dùng được bên trong vòng lặp."),
  // ----- Thời gian -----
  ct_wait_ms: I("Chờ (mili-giây)", "cho mili giay ms delay thoi gian", "Dừng chương trình một khoảng thời gian tính bằng mili-giây.", a => `Chờ ${a("MS")} mili-giây`),
  ct_millis: I("Thời gian chạy", "thoi gian chay millis dong ho bo dem giay", "Thời gian đã trôi qua kể từ lúc mạch khởi động, tính bằng giây hoặc mili-giây.", () => "thời gian chạy"),
  // ----- Logic -----
  ct_ternary: I("Nếu … thì … nếu không", "neu thi nguoc lai dieu kien chon gia tri ternary", "Cho ra một trong hai giá trị tùy điều kiện đúng hay sai.", a => `(nếu ${a("COND")} thì ${a("A")} nếu không thì ${a("B")})`),
  ct_between: I("Nằm trong khoảng", "nam trong khoang giua between pham vi", "Đúng khi giá trị nằm giữa hai số (tính cả hai đầu).", a => `${a("X")} nằm trong khoảng ${a("A")} – ${a("B")}`),
  // ----- Toán -----
  ct_mod: I("Chia lấy dư", "chia lay du mod phan du", "Phần dư của phép chia; hay dùng để kiểm tra chẵn/lẻ.", a => `${a("A")} chia lấy dư ${a("B")}`),
  ct_pow: I("Lũy thừa", "luy thua mu pow binh phuong", "Số thứ nhất lũy thừa số thứ hai.", a => `${a("A")} lũy thừa ${a("B")}`),
  ct_math_func: I("Hàm toán", "can bac hai sqrt abs tuyet doi lam tron sin cos tan ln log ham toan", "Căn bậc hai, trị tuyệt đối, làm tròn, sin, cos, tan, ln, log...", a => `${a("FUNC")} của ${a("X")}`, "sin/cos/tan tính theo độ."),
  ct_minmax: I("Nhỏ nhất / lớn nhất", "nho nhat lon nhat min max so sanh hai so", "Số nhỏ nhất hoặc lớn nhất trong hai số.", a => `${a("OP")} của ${a("A")} và ${a("B")}`),
  ct_constrain: I("Giới hạn", "gioi han constrain kep trong khoang", "Giữ giá trị trong một khoảng cho trước.", a => `giới hạn ${a("X")} từ ${a("LO")} đến ${a("HI")}`),
  ct_random: I("Số ngẫu nhiên", "ngau nhien random xuc xac", "Số nguyên ngẫu nhiên từ số đầu đến số cuối (gồm cả hai đầu).", a => `số ngẫu nhiên từ ${a("A")} đến ${a("B")}`),
  ct_round_places: I("Làm tròn … số lẻ", "lam tron so le thap phan round", "Làm tròn số thập phân đến số chữ số sau dấu phẩy.", a => `làm tròn ${a("X")} đến ${a("N")} số lẻ`),
  ct_math_constant: I("Hằng số", "hang so pi e ti le vang", "Các hằng số toán học: π, e, tỉ lệ vàng.", a => `hằng số ${a("NAME")}`),
  // ----- Chữ -----
  ct_text: I("Đoạn chữ", "chu van ban text chuoi xin chao", "Một đoạn chữ gõ trực tiếp vào khối.", a => `“${a("TEXT")}”`),
  ct_join: I("Nối", "noi chuoi chu join ghep", "Nối hai giá trị thành một đoạn chữ (số được đổi thành chữ).", a => `nối ${a("A")} với ${a("B")}`),
  ct_text_length: I("Độ dài chữ", "do dai chu length so ky tu", "Số ký tự của đoạn chữ.", a => `độ dài của ${a("TEXT")}`),
  ct_text_char_at: I("Ký tự thứ", "ky tu thu chu cai char", "Lấy một ký tự của đoạn chữ (đếm từ 1).", a => `ký tự thứ ${a("N")} của ${a("TEXT")}`),
  ct_text_contains: I("Chữ có chứa", "chua contains tim chu", "Đúng khi đoạn chữ đầu có chứa đoạn chữ sau.", a => `${a("A")} có chứa ${a("B")}`),
  ct_text_case: I("Đổi chữ hoa/thường", "chu hoa chu thuong upper lower", "Chuyển chữ thành chữ hoa hoặc chữ thường.", a => `chuyển ${a("TEXT")} thành ${a("CASE")}`, "Chỉ chính xác với chữ không dấu."),
  ct_text_to_number: I("Chữ thành số", "chu thanh so parse doi kieu", "Đổi đoạn chữ thành số; không đọc được thì cho 0.", a => `chuyển ${a("TEXT")} thành số`),
  ct_serial_print: I("In ra Serial", "in ra serial print debug xem gia tri", "Gửi giá trị ra cổng Serial để xem trong Serial Monitor khi gỡ lỗi.", a => `In ra Serial: ${a("TEXT")}`),
  // ----- Biến -----
  variables_set: I("Đặt biến", "dat bien gan variable set luu gia tri", "Gán một giá trị cho biến (số, chữ hoặc đúng/sai).", a => `Đặt ${a("VAR")} = ${a("VALUE")}`, "Một biến nên chỉ chứa một loại dữ liệu (số hoặc chữ)."),
  variables_get: I("Biến", "bien variable gia tri", "Giá trị hiện tại của biến.", a => `${a("VAR")}`),
  math_change: I("Tăng biến thêm", "tang bien cong them dem change", "Cộng thêm một số vào biến (số âm để giảm).", a => `Tăng ${a("VAR")} thêm ${a("DELTA")}`),
  // ----- Danh sách -----
  ct_list_add: I("Thêm vào danh sách", "them danh sach list add append", "Thêm một giá trị vào cuối danh sách.", a => `Thêm ${a("ITEM")} vào ${a("LIST")}`, "Danh sách chứa số, tối đa 32 phần tử."),
  ct_list_insert: I("Chèn vào danh sách", "chen danh sach list insert", "Chèn giá trị vào một vị trí (đếm từ 1).", a => `Chèn ${a("ITEM")} vào vị trí ${a("INDEX")} của ${a("LIST")}`),
  ct_list_remove: I("Xóa mục", "xoa muc danh sach list remove", "Xóa một mục khỏi danh sách.", a => `Xóa mục thứ ${a("INDEX")} của ${a("LIST")}`),
  ct_list_set: I("Đặt mục", "dat muc thay doi danh sach list set", "Thay giá trị của một mục trong danh sách.", a => `Đặt mục thứ ${a("INDEX")} của ${a("LIST")} = ${a("ITEM")}`),
  ct_list_clear: I("Xóa hết danh sách", "xoa het lam trong danh sach list clear", "Làm trống danh sách.", a => `Xóa hết mục của ${a("LIST")}`),
  ct_list_get: I("Mục thứ", "muc thu danh sach list get lay phan tu", "Lấy giá trị của một mục (đếm từ 1; ngoài phạm vi cho 0).", a => `mục thứ ${a("INDEX")} của ${a("LIST")}`),
  ct_list_length: I("Độ dài danh sách", "do dai danh sach list length so muc", "Số mục đang có trong danh sách.", a => `độ dài của ${a("LIST")}`),
  ct_list_index: I("Vị trí trong danh sách", "vi tri danh sach list index tim", "Vị trí đầu tiên của giá trị trong danh sách (0 nếu không có).", a => `vị trí của ${a("ITEM")} trong ${a("LIST")}`),
  ct_list_contains: I("Danh sách có chứa", "danh sach co chua list contains", "Đúng khi danh sách có giá trị này.", a => `${a("LIST")} có chứa ${a("ITEM")}`),
  controls_if: I("Nếu … thì", "neu if else khong thi dieu kien kiem tra re nhanh", "Chạy các khối bên trong khi điều kiện đúng. Bấm biểu tượng ⚙ trên khối để thêm nhánh \"nếu không thì nếu\" hoặc \"nếu không thì\".", a => `Nếu ${a("IF0")} thì`),
  ct_repeat: I("Lặp lại N lần", "lap lai lan repeat for so lan", "Chạy các khối bên trong đúng số lần đã chọn.", a => `Lặp lại ${a("TIMES")} lần`),
  ct_wait: I("Chờ (giây)", "cho doi delay sleep thoi gian tre dung lai", "Tạm dừng chương trình một khoảng thời gian; robot vẫn giữ trạng thái hiện tại (ví dụ động cơ đang chạy vẫn chạy).", a => `Chờ ${a("SECONDS")} giây`),
  ct_stop: I("Dừng robot", "dung stop tat dong co phanh", "Dừng toàn bộ động cơ của robot.", () => "Dừng robot"),
  ct_forward: move("Đi thẳng", true),
  ct_backward: move("Đi lùi", true),
  ct_turn_left: move("Quay trái", true),
  ct_turn_right: move("Quay phải", true),
  ct_forward_continuous: move("Đi thẳng", false),
  ct_backward_continuous: move("Đi lùi", false),
  ct_turn_left_continuous: move("Quay trái", false),
  ct_turn_right_continuous: move("Quay phải", false),
  ct_turn_left_angle: angle("Quay trái"),
  ct_turn_right_angle: angle("Quay phải"),
  ct_motor_left: I("Motor trái", "dong co banh trai toc do motor left", "Chỉ điều khiển bánh trái. Số âm là quay ngược.", a => `Motor trái chạy ${pct(a("SPEED"))}`, "Từ -100 đến 100."),
  ct_motor_right: I("Motor phải", "dong co banh phai toc do motor right", "Chỉ điều khiển bánh phải. Số âm là quay ngược.", a => `Motor phải chạy ${pct(a("SPEED"))}`, "Từ -100 đến 100."),
  ct_led: I("Bật/tắt LED", "den led sang tat bat", "Bật hoặc tắt đèn LED trên board.", a => `${a("STATE")} đèn LED`),
  ct_buzzer: I("Còi (Hz)", "coi buzzer am thanh beep tan so keu", "Phát âm thanh ở tần số chọn; tần số càng cao âm càng the thé.", a => `Phát còi ${a("FREQ")} Hz`, "Từ 50 đến 10000 Hz."),
  ct_servo: I("Servo (độ)", "servo goc quay tay may canh tay", "Quay servo tới một góc cố định.", a => `Quay servo tới ${a("ANGLE")}°`, "Góc từ 0 đến 180°."),
  ct_distance: I("Khoảng cách (cm)", "khoang cach sieu am hc-sr04 do vat can xa gan", "Đo khoảng cách tới vật phía trước bằng cảm biến siêu âm.", () => "khoảng cách tới vật phía trước (cm)"),
  ct_line_left: I("Cảm biến line trái", "do line vach cam bien trai", "Đọc cảm biến dò line bên trái (thấy vạch hay không).", () => "cảm biến line trái"),
  ct_line_right: I("Cảm biến line phải", "do line vach cam bien phai", "Đọc cảm biến dò line bên phải (thấy vạch hay không).", () => "cảm biến line phải"),
  math_number: I("Số", "so number gia tri", "Một con số.", a => a("NUM")),
  ct_math_operation: I("Phép tính", "cong tru nhan chia tinh toan math", "Cộng, trừ, nhân hoặc chia hai giá trị.", a => `(${a("A")} ${a("OP")} ${a("B")})`),
  ct_compare: I("So sánh", "so sanh lon hon nho hon bang compare", "So sánh hai giá trị, kết quả là đúng hoặc sai. Thường đặt trong khối NẾU.", a => `${a("A")} ${a("OP")} ${a("B")}`),
  ct_boolean: I("Đúng / Sai", "dung sai true false", "Giá trị đúng hoặc sai cố định.", a => lc(a("VALUE"))),
  ct_logic: I("VÀ / HOẶC", "va hoac and or ket hop dieu kien", "Kết hợp hai điều kiện: VÀ (cả hai đúng) hoặc HOẶC (một trong hai đúng).", a => `(${a("A")} ${a("OP")} ${a("B")})`),
  ct_not: I("KHÔNG", "khong not phu dinh dao nguoc", "Đảo ngược điều kiện: đúng thành sai và ngược lại.", a => `không (${a("BOOL", "A", "VALUE")})`),
  ct_map_range: I("Đổi thang đo", "doi thang map chuyen doi khoang gia tri", "Chuyển một giá trị từ thang đo này sang thang đo khác (ví dụ 0–1023 sang 0–100).", a => `đổi ${a("VALUE")} từ [${a("IN_MIN")}–${a("IN_MAX")}] sang [${a("OUT_MIN")}–${a("OUT_MAX")}]`),
  ct_calibrate: I("Hiệu chỉnh", "hieu chinh calibrate can chinh quay thang lech", "Chỉnh thời gian quay 1° và độ mạnh bánh trái/phải để robot đi thẳng và quay đúng góc.", a => `Hiệu chỉnh: quay 1° = ${a("TURN_MS")} ms, bánh trái ${a("LEFT")}%, bánh phải ${a("RIGHT")}%`),
  ct_gpio_write: I("Ghi GPIO", "ghi chan gpio bat tat output", "Đặt một chân GPIO lên mức cao hoặc thấp.", a => `Ghi chân GPIO ${a("PIN")} ở mức ${a("STATE")}`),
  ct_gpio_read: I("Đọc GPIO", "doc chan gpio input", "Đọc mức của một chân GPIO.", a => `giá trị chân GPIO ${a("PIN")}`),
  ct_gpio_pwm: I("PWM GPIO", "pwm xung do sang toc do chan gpio", "Xuất xung PWM (0–100%) ra chân GPIO, dùng điều chỉnh độ sáng hoặc tốc độ.", a => `Xuất PWM ${a("VALUE")}% ra GPIO ${a("PIN")}`),
  ct_pin_mode: I("Đặt chế độ chân", "che do chan pinmode input output", "Chọn chân là ngõ vào (đọc) hay ngõ ra (ghi).", a => `Đặt chân ${a("PIN")} chế độ ${a("MODE")}`),
  ct_digital_write: I("Digital ghi", "digital write ghi so chan cao thap", "Ghi mức số (cao/thấp) ra một chân.", a => `Ghi digital chân ${a("PIN")} = ${a("VALUE", "STATE", "LEVEL")}`),
  ct_digital_read: I("Digital đọc", "digital read doc so chan nut bam", "Đọc mức số (cao/thấp) của một chân, ví dụ nút bấm.", a => `giá trị digital chân ${a("PIN")}`),
  ct_analog_read: I("Analog đọc", "analog read doc tuong tu adc cam bien", "Đọc giá trị tương tự từ chân (ví dụ cảm biến ánh sáng).", a => `giá trị analog chân ${a("PIN")}`),
  ct_analog_write: I("Analog ghi (PWM)", "analog write pwm ghi tuong tu", "Ghi giá trị analog (PWM) ra chân.", a => `Ghi analog chân ${a("PIN")} = ${a("VALUE")}`),
  ct_bt_has_key: I("Bluetooth nhận lệnh", "bluetooth nhan lenh ky tu phim dieu khien dien thoai", "Đúng khi ký tự đang chờ từ điện thoại là ký tự đã chọn (chưa xoá khỏi bộ đệm).", a => `Bluetooth đang nhận lệnh ${a("KEY")}`),
  ct_bt_read: I("Đọc ký tự Bluetooth", "bluetooth doc ky tu nhan du lieu", "Đọc và lấy một ký tự từ Bluetooth; -1 nếu chưa có.", () => "ký tự nhận từ Bluetooth"),
  ct_bt_available: I("Có dữ liệu Bluetooth", "bluetooth co du lieu san sang", "Đúng khi có ít nhất một ký tự đang chờ.", () => "có dữ liệu Bluetooth đang chờ"),
  ct_bt_send: I("Gửi Bluetooth", "bluetooth gui chu thong bao dien thoai", "Gửi một dòng chữ về điện thoại.", a => `Gửi Bluetooth: "${a("TEXT")}"`),

  /* ---- Mạch mở rộng ESP32 ---- */
  ctexp_motor_run: I("Động cơ M1–M6", "dong co motor chay toc do m1 m2 m3 m4 m5 m6 mach mo rong", "Chạy một trong 6 động cơ của mạch mở rộng. Số âm là quay ngược.", a => `Động cơ ${a("MOTOR")} chạy ${pct(a("SPEED"))}`, "M6 không có PWM: chỉ chạy hết tốc độ hoặc dừng."),
  ctexp_motor_stop: I("Dừng động cơ", "dung dong co motor tat ca stop mach mo rong", "Dừng một động cơ hoặc tất cả.", a => `Dừng động cơ ${a("MOTOR")}`),
  ctexp_servo: I("Servo (PCA9685)", "servo goc quay pca9685 kenh mach mo rong", "Quay servo ở kênh 1–6 tới một góc.", a => `Servo ${a("CHANNEL")} quay tới ${a("ANGLE")}°`, "Góc từ 0 đến 180°."),
  ctexp_line_analog: I("Dò line (analog)", "do line analog vach cam bien mach mo rong", "Đọc giá trị analog (0–4095) của cảm biến dò line; số lớn nhỏ tuỳ độ phản xạ của mặt đường.", a => `giá trị analog cảm biến line ${a("SENSOR", "SIDE", "CHANNEL")}`),
  ctexp_pcf_write: I("PCF8574 ghi chân", "pcf8574 ghi chan mo rong io i2c", "Ghi mức cao/thấp ra chân P1–P7 của chip mở rộng PCF8574.", a => `Ghi PCF8574 chân P${a("PIN")} = ${a("LEVEL")}`, "P0 dùng cho TRIG của HC-SR04."),
  ctexp_pcf_read: I("PCF8574 đọc chân", "pcf8574 doc chan mo rong io i2c", "Đọc mức cao/thấp của chân P1–P7 trên PCF8574.", a => `giá trị PCF8574 chân P${a("PIN")}`),
  ctexp_distance: I("Khoảng cách siêu âm", "khoang cach sieu am hc-sr04 vat can xa gan mach mo rong", "Đo khoảng cách (cm) bằng HC-SR04 ở J3; trả về 400 nếu không có vật cản.", () => "khoảng cách siêu âm (cm)"),
  ctexp_humidity: I("Độ ẩm (%)", "do am humidity cam bien i2c j6 mach mo rong", "Đọc độ ẩm (%) từ cảm biến I2C ở J6; trả về -1 nếu không đọc được.", () => "độ ẩm (%)"),
  ctexp_temperature: I("Nhiệt độ (°C)", "nhiet do temperature cam bien i2c j6 nong lanh", "Đọc nhiệt độ (°C) từ cảm biến I2C ở J6; trả về -100 nếu không đọc được.", () => "nhiệt độ (°C)"),
};

export function getInfo(type) {
  return INFO[type] || null;
}

/** Cho phép extension khai báo tri thức cho khối của nó (manifest: blocks[].assistant). */
export function registerInfo(type, meta = {}) {
  const prev = INFO[type] || {};
  INFO[type] = {
    label: meta.label ?? prev.label,
    kw: [prev.kw, meta.keywords].filter(Boolean).join(" "),
    desc: meta.description ?? prev.desc,
    say: meta.explain ?? prev.say,
    tip: meta.tip ?? prev.tip,
  };
}
