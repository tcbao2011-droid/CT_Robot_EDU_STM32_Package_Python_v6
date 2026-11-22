import { PROGRAM_HELPER_USED, PROGRAM_PY_HELPERS } from "./programRuntime.js";
/*
 * Runtime MicroPython cho CT ROBOT EDU (ESP32 / ESP32-S3).
 * Tương đương các runtime C++ trong hardwareProfiles.js và extensions/builtin/ctExpansionEsp32.js:
 * mã Python sinh ra gọi cùng "từ vựng" (robot.forward, gpioWrite, delay, ctExpMotorRun...).
 * Chỉ dùng String.raw để giữ nguyên ký tự \ trong mã Python.
 */

export const PY_CORE_RUNTIME = String.raw`import time
from machine import Pin, ADC, PWM, UART, time_pulse_us

HIGH = 1
LOW = 0
INPUT = Pin.IN
OUTPUT = Pin.OUT
INPUT_PULLUP = "pullup"

_pins = {}
_pin_cfg = {}
_pwms = {}
_adcs = {}


def delay(ms):
    time.sleep_ms(int(ms))


def delayMicroseconds(us):
    time.sleep_us(int(us))


def constrain(x, lo, hi):
    return lo if x < lo else (hi if x > hi else x)


def ct_map(x, in_min, in_max, out_min, out_max):
    if in_max == in_min:
        return out_min
    return int((x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min)


def _pin(pin, mode=Pin.IN, pull=None):
    cfg = (mode, pull)
    p = _pins.get(pin)
    if p is None or _pin_cfg.get(pin) != cfg:
        p = Pin(pin, mode, pull)
        _pins[pin] = p
        _pin_cfg[pin] = cfg
    return p


def pinMode(pin, mode):
    if mode == INPUT_PULLUP:
        _pin(pin, Pin.IN, Pin.PULL_UP)
    else:
        _pin(pin, mode)


def digitalWrite(pin, value):
    _pin(pin, Pin.OUT).value(1 if value else 0)


def digitalRead(pin):
    p = _pins.get(pin)
    if p is None:
        p = _pin(pin, Pin.IN)
    return p.value()


def _pwm(pin, freq=1000):
    p = _pwms.get(pin)
    if p is None:
        p = PWM(Pin(pin, Pin.OUT), freq=freq, duty_u16=0)
        _pwms[pin] = p
    return p


def analogWrite(pin, value):
    _pwm(pin).duty_u16(int(constrain(value, 0, 255)) * 257)


def analogRead(pin):
    a = _adcs.get(pin)
    if a is None:
        a = ADC(Pin(pin))
        a.atten(ADC.ATTN_11DB)
        _adcs[pin] = a
    return a.read_u16() >> 4  # 0..4095 như analogRead của Arduino-ESP32


def gpioWrite(pin, state):
    digitalWrite(pin, state)


def gpioRead(pin):
    return _pin(pin, Pin.IN).value()


def gpioPwm(pin, percent):
    analogWrite(pin, ct_map(constrain(percent, 0, 100), 0, 100, 0, 255))


class _Motor:
    def __init__(self, in1, in2, en):
        self.in1 = Pin(in1, Pin.OUT)
        self.in2 = Pin(in2, Pin.OUT)
        self.pwm = _pwm(en, MOTOR_PWM_FREQUENCY) if en is not None else None  # không có chân EN: chạy hết tốc độ

    def run(self, speed, invert, scale):
        speed = constrain(int(speed), -100, 100)
        speed = constrain(int(speed * scale / 100), -100, 100)
        if invert:
            speed = -speed
        self.in1.value(1 if speed > 0 else 0)
        self.in2.value(1 if speed < 0 else 0)
        if self.pwm is not None:
            self.pwm.duty_u16(abs(speed) * 65535 // 100)
        elif speed == 0:
            self.in1.value(0)
            self.in2.value(0)


class _Robot:
    def __init__(self):
        self.turnMsPerDegree = TURN_MS_PER_DEGREE
        self.leftScale = LEFT_SCALE
        self.rightScale = RIGHT_SCALE
        self._left = None
        self._right = None
        self._servo = None

    def _motors(self):
        # Chỉ khởi tạo chân động cơ khi chương trình thật sự điều khiển động cơ.
        if self._left is None:
            self._left = _Motor(LEFT_IN1, LEFT_IN2, LEFT_EN)
            self._right = _Motor(RIGHT_IN1, RIGHT_IN2, RIGHT_EN)

    def begin(self):
        if ECHO_PIN is not None:
            _pin(ECHO_PIN, Pin.IN)
        if LINE_LEFT_PIN is not None:
            _pin(LINE_LEFT_PIN, Pin.IN)
        if LINE_RIGHT_PIN is not None:
            _pin(LINE_RIGHT_PIN, Pin.IN)
        if TRIG_PIN is not None:
            _pin(TRIG_PIN, Pin.OUT).value(0)
        if LED_PIN is not None:
            _pin(LED_PIN, Pin.OUT)

    def calibrate(self, turnMsPerDegree, leftPct, rightPct):
        self.turnMsPerDegree = turnMsPerDegree
        self.leftScale = constrain(leftPct, 10, 200)
        self.rightScale = constrain(rightPct, 10, 200)

    def motorLeft(self, speed):
        self._motors()
        self._left.run(speed, INVERT_LEFT_MOTOR, self.leftScale)

    def motorRight(self, speed):
        self._motors()
        self._right.run(speed, INVERT_RIGHT_MOTOR, self.rightScale)

    def stop(self):
        self.motorLeft(0)
        self.motorRight(0)

    def forwardContinuous(self, s):
        self.motorLeft(s)
        self.motorRight(s)

    def backwardContinuous(self, s):
        self.motorLeft(-s)
        self.motorRight(-s)

    def turnLeftContinuous(self, s):
        self.motorLeft(-s)
        self.motorRight(s)

    def turnRightContinuous(self, s):
        self.motorLeft(s)
        self.motorRight(-s)

    def forward(self, s, sec):
        self.forwardContinuous(s)
        delay(max(0, sec) * 1000)
        self.stop()

    def backward(self, s, sec):
        self.backwardContinuous(s)
        delay(max(0, sec) * 1000)
        self.stop()

    def turnLeft(self, s, sec):
        self.turnLeftContinuous(s)
        delay(max(0, sec) * 1000)
        self.stop()

    def turnRight(self, s, sec):
        self.turnRightContinuous(s)
        delay(max(0, sec) * 1000)
        self.stop()

    def turnLeftAngle(self, s, deg):
        self.turnLeftContinuous(s)
        delay(max(0, deg) * self.turnMsPerDegree)
        self.stop()

    def turnRightAngle(self, s, deg):
        self.turnRightContinuous(s)
        delay(max(0, deg) * self.turnMsPerDegree)
        self.stop()

    def distance(self):
        if TRIG_PIN is None or ECHO_PIN is None:
            return 400
        trig = _pin(TRIG_PIN, Pin.OUT)
        trig.value(0)
        time.sleep_us(2)
        trig.value(1)
        time.sleep_us(10)
        trig.value(0)
        us = time_pulse_us(_pin(ECHO_PIN, Pin.IN), 1, 30000)
        if us <= 0:
            return 400
        return us // 58

    def lineLeft(self):
        return 0 if LINE_LEFT_PIN is None else _pin(LINE_LEFT_PIN, Pin.IN).value()

    def lineRight(self):
        return 0 if LINE_RIGHT_PIN is None else _pin(LINE_RIGHT_PIN, Pin.IN).value()

    def led(self, state):
        if LED_PIN is None:
            return
        _pin(LED_PIN, Pin.OUT).value(1 if state == "ON" else 0)

    def buzzer(self, freq):
        if BUZZER_PIN is None or freq <= 0:
            return
        p = PWM(Pin(BUZZER_PIN), freq=int(freq), duty_u16=32768)
        time.sleep_ms(200)
        p.deinit()

    def servo(self, angle):
        if SERVO_PIN is None:
            return
        angle = constrain(int(angle), 0, 180)
        if self._servo is None:
            self._servo = PWM(Pin(SERVO_PIN), freq=50)
        us = 500 + angle * (2400 - 500) // 180
        self._servo.duty_u16(us * 65535 // 20000)


robot = _Robot()
`;

export const PY_BLUETOOTH_RUNTIME = String.raw`
class _Serial:
    """Bluetooth HC-05/HC-06 qua UART2 - cùng giao diện available/peek/read/println như Arduino."""

    def __init__(self, uart):
        self.u = uart
        self._b = None

    def _fill(self):
        if self._b is None and self.u.any():
            d = self.u.read(1)
            if d:
                self._b = d[0]

    def available(self):
        self._fill()
        return (1 if self._b is not None else 0) + self.u.any()

    def peek(self):
        self._fill()
        return -1 if self._b is None else self._b

    def read(self):
        self._fill()
        b = self._b
        self._b = None
        return -1 if b is None else b

    def print(self, text):
        self.u.write(str(text))

    def println(self, text=""):
        self.u.write(str(text) + "\r\n")
`;

export const PY_BLUETOOTH_ON = `BT_SERIAL = _Serial(UART(2, baudrate=115200, tx=BT_TX_PIN, rx=BT_RX_PIN))
`;

export const PY_BLUETOOTH_OFF = String.raw`
class _NoSerial:
    """Bluetooth bị tắt bởi mạch mở rộng: các khối vẫn chạy nhưng không làm gì."""

    def available(self):
        return 0

    def peek(self):
        return -1

    def read(self):
        return -1

    def print(self, text):
        pass

    def println(self, text=""):
        pass


BT_SERIAL = _NoSerial()
`;

/* ---------- CT Expansion (ESP32 + 3xTB6612 + PCA9685 + PCF8574) ---------- */

export const PY_CTEXP_I2C = String.raw`
# ===== CT Expansion: I2C =====
from machine import I2C

_i2c = I2C(0, sda=Pin(CTEXP_SDA), scl=Pin(CTEXP_SCL), freq=400000)


def _i2c_ping(addr):
    try:
        _i2c.writeto(addr, b"")
        return True
    except OSError:
        return False
`;

export const PY_CTEXP_MOTOR = String.raw`
# ===== CT Expansion: 6 động cơ qua 3xTB6612 =====
# (in1, in2, pwm) - M6 không có PWM (PWMB nối 3V3)
CTEXP_MOTORS = MOTORS_TABLE


def ctExpMotorBegin():
    for in1, in2, pwm in CTEXP_MOTORS:
        Pin(in1, Pin.OUT).value(0)
        Pin(in2, Pin.OUT).value(0)
        if pwm is not None:
            _pwm(pwm, MOTOR_PWM_FREQUENCY)


def ctExpMotorRun(id, speed):
    if id < 1 or id > 6:
        return
    in1, in2, pwm = CTEXP_MOTORS[id - 1]
    speed = constrain(int(speed), -100, 100)
    _pin(in1, Pin.OUT).value(1 if speed > 0 else 0)
    _pin(in2, Pin.OUT).value(1 if speed < 0 else 0)
    if pwm is not None:
        _pwm(pwm, MOTOR_PWM_FREQUENCY).duty_u16(abs(speed) * 65535 // 100)


def ctExpMotorStopAll():
    for i in range(1, 7):
        ctExpMotorRun(i, 0)
`;

export const PY_CTEXP_SERVO = String.raw`
# ===== CT Expansion: servo qua PCA9685 =====
_pca_ok = False


def _pca_write(reg, value):
    _i2c.writeto(CTEXP_PCA9685_ADDR, bytes([reg, value]))


def ctExpServoBegin():
    global _pca_ok
    _pca_ok = _i2c_ping(CTEXP_PCA9685_ADDR)
    if not _pca_ok:
        print("WARN: Khong thay PCA9685 (0x40) tren I2C.")
        return
    _pca_write(0x00, 0x10)  # MODE1: sleep để đổi PRESCALE
    _pca_write(0xFE, 121)   # ~50 Hz
    _pca_write(0x00, 0x20)  # thức dậy, auto-increment
    time.sleep_ms(5)
    _pca_write(0x00, 0xA0)  # restart


def ctExpServoWrite(ch, angle):
    if not _pca_ok or ch < 0 or ch > 15:
        return
    angle = constrain(int(angle), 0, 180)
    us = 500 + angle * (2500 - 500) // 180
    ticks = us * 4096 // 20000
    _i2c.writeto(CTEXP_PCA9685_ADDR, bytes([0x06 + 4 * ch, 0, 0, ticks & 0xFF, ticks >> 8]))


# Khối SERVO của lõi điều khiển servo 1 (kênh 0) trên PCA9685
robot.servo = lambda angle: ctExpServoWrite(0, angle)
`;

export const PY_CTEXP_PCF = String.raw`
# ===== CT Expansion: PCF8574 (mở rộng GPIO) + siêu âm HC-SR04 =====
_pcf_addr = 0
_pcf_state = 0xFF & ~(1 << PCF_TRIG_BIT)  # bit = 1: đầu vào / mức cao


def _pcf_flush():
    if not _pcf_addr:
        return False
    try:
        _i2c.writeto(_pcf_addr, bytes([_pcf_state]))
        return True
    except OSError:
        return False


def ctExpPcfBegin():
    global _pcf_addr
    # PCF8574: 0x20-0x27, PCF8574A: 0x39-0x3F. Bỏ 0x38 vì là địa chỉ cảm biến AHT ở J6.
    for a in range(0x20, 0x40):
        if 0x27 < a < 0x39:
            continue
        if _i2c_ping(a):
            _pcf_addr = a
            break
    if not _pcf_addr:
        print("WARN: Khong thay PCF8574 tren I2C.")
        return
    _pcf_flush()


def _pcf_set(pin, level):
    global _pcf_state
    if not _pcf_addr or pin < 0 or pin > 7:
        return
    if level:
        _pcf_state |= 1 << pin
    else:
        _pcf_state &= ~(1 << pin) & 0xFF
    _pcf_flush()


def ctExpPcfWrite(pin, level):
    if pin >= 1:  # P0 dành cho TRIG
        _pcf_set(pin, level)


def ctExpPcfRead(pin):
    if not _pcf_addr or pin < 1 or pin > 7:
        return 0
    _pcf_set(pin, 1)  # PCF8574 quasi-bidirectional: thả chân lên cao trước khi đọc
    try:
        return (_i2c.readfrom(_pcf_addr, 1)[0] >> pin) & 1
    except OSError:
        return 0


def ctExpDistanceCm():
    if not _pcf_addr:
        return 400
    _pcf_set(PCF_TRIG_BIT, 1)
    time.sleep_us(10)
    _pcf_set(PCF_TRIG_BIT, 0)
    us = time_pulse_us(_pin(ECHO_PIN, Pin.IN), 1, 30000)
    if us <= 0:
        return 400
    return us // 58


robot.distance = ctExpDistanceCm
`;

export const PY_CTEXP_HUM = String.raw`
# ===== CT Expansion: cảm biến độ ẩm I2C (J6) - AHT10/20/21 (0x38) hoặc SHT3x (0x44/0x45) =====
_hum = {"addr": 0, "type": 0, "h": 0.0, "t": 0.0, "ms": 0}


def ctExpHumBegin():
    _i2c_ping(0)  # đảm bảo bus đã khởi tạo
    if _i2c_ping(0x38):
        _hum["addr"], _hum["type"] = 0x38, 1
        _i2c.writeto(0x38, bytes([0xBE, 0x08, 0x00]))
        time.sleep_ms(20)
    elif _i2c_ping(0x44):
        _hum["addr"], _hum["type"] = 0x44, 2
    elif _i2c_ping(0x45):
        _hum["addr"], _hum["type"] = 0x45, 2
    else:
        print("WARN: Khong thay cam bien do am (AHT 0x38 / SHT3x 0x44-0x45) tren I2C.")


def _hum_read():
    addr = _hum["addr"]
    if not addr:
        return False
    if _hum["ms"] and time.ticks_diff(time.ticks_ms(), _hum["ms"]) < 250:
        return True  # dùng lại kết quả vừa đọc
    try:
        if _hum["type"] == 1:
            _i2c.writeto(addr, bytes([0xAC, 0x33, 0x00]))
            time.sleep_ms(80)
            b = _i2c.readfrom(addr, 6)
            if b[0] & 0x80:
                return False  # đang bận
            rh = (b[1] << 12) | (b[2] << 4) | (b[3] >> 4)
            rt = ((b[3] & 0x0F) << 16) | (b[4] << 8) | b[5]
            _hum["h"] = rh * 100.0 / 1048576.0
            _hum["t"] = rt * 200.0 / 1048576.0 - 50.0
        else:
            _i2c.writeto(addr, bytes([0x24, 0x00]))
            time.sleep_ms(20)
            b = _i2c.readfrom(addr, 6)
            _hum["t"] = -45.0 + 175.0 * ((b[0] << 8) | b[1]) / 65535.0
            _hum["h"] = 100.0 * ((b[3] << 8) | b[4]) / 65535.0
    except OSError:
        return False
    _hum["ms"] = time.ticks_ms() or 1
    return True


def ctExpHumidity():
    return _hum["h"] if _hum_read() else -1.0


def ctExpTemperature():
    return _hum["t"] if _hum_read() else -100.0
`;

/* ---------- Hàm phụ trợ: chỉ chèn vào chương trình khi có dùng ---------- */

export const PY_HELPERS = [
  // Hàm của khối Toán / Chữ / Danh sách (ct_*): chỉ chèn khi chương trình dùng tới.
  { use: PROGRAM_HELPER_USED, code: PROGRAM_PY_HELPERS },
  {
    use: /\bct_div\(/,
    code: String.raw`
def ct_div(a, b):
    """Phép chia an toàn: chia cho 0 trả về 0 thay vì làm dừng chương trình."""
    return a / b if b else 0
`,
  },
  {
    use: /\b(?:millis|micros)\(/,
    code: String.raw`
def millis():
    return time.ticks_ms()


def micros():
    return time.ticks_us()
`,
  },
  {
    use: /\b(?:random|randomSeed)\(/,
    code: String.raw`
import random as _random


def randomSeed(seed):
    _random.seed(int(seed))


def random(a, b=None):
    """Giống Arduino: random(max) hoặc random(min, max); giá trị lớn nhất không bao gồm max."""
    if b is None:
        a, b = 0, a
    a, b = int(a), int(b)
    return _random.randint(a, b - 1) if b > a else a
`,
  },
  {
    use: /\b(?:sqrt|sq)\(/,
    code: String.raw`
import math


def sqrt(x):
    return math.sqrt(x)


def sq(x):
    return x * x
`,
  },
  {
    use: /\bSerial\b/,
    code: String.raw`
class _USBSerial:
    """Cổng USB (REPL): cùng giao diện begin/print/println như Serial của Arduino."""

    def begin(self, baud=115200):
        pass

    def print(self, text):
        print(text, end="")

    def println(self, text=""):
        print(text)

    def available(self):
        return 0


Serial = _USBSerial()
`,
  },
];
