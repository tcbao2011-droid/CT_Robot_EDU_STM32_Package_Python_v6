/* =====================================================
   NẠP CODE QUA USB - Arduino Nano/UNO & ESP32 DevKit V1
   Dùng Web Serial API (Chrome / Edge)
===================================================== */

const PAGE_SIZE = 128;            // ATmega328P: 128 byte / trang
const FLASH_SIZE = 32 * 1024;     // 32 KB flash
const BOOTLOADER_START = 0x7e00;  // Optiboot nằm ở cuối flash, không được ghi đè

const STK_INSYNC = 0x14;
const STK_OK = 0x10;
const CRC_EOP = 0x20;
const MEM_FLASH = 0x46; // 'F'

const CMD_GET_SYNC = 0x30;
const CMD_ENTER_PROGMODE = 0x50;
const CMD_LEAVE_PROGMODE = 0x51;
const CMD_LOAD_ADDRESS = 0x55;
const CMD_PROG_PAGE = 0x64;
const CMD_READ_PAGE = 0x74;
const CMD_READ_SIGNATURE = 0x75;

const ATMEGA328P_SIGNATURE = [0x1e, 0x95, 0x0f];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* =====================================================
   INTEL HEX → mảng byte flash (Cho AVR)
===================================================== */

export function parseIntelHex(text) {
  const flash = new Uint8Array(FLASH_SIZE).fill(0xff);
  let base = 0;
  let length = 0;
  let hasData = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line[0] !== ":") {
      throw new Error("File .hex không hợp lệ");
    }

    const bytes = [];
    for (let i = 1; i + 1 < line.length; i += 2) {
      const value = parseInt(line.substr(i, 2), 16);
      if (Number.isNaN(value)) throw new Error("File .hex có ký tự lạ");
      bytes.push(value);
    }

    const count = bytes[0];
    const address = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + count);

    const checksum = bytes.reduce((sum, b) => sum + b, 0) & 0xff;
    if (checksum !== 0 || data.length !== count) {
      throw new Error("Sai checksum trong file .hex");
    }

    if (type === 0x00) {
      for (let i = 0; i < count; i++) {
        const addr = base + address + i;
        if (addr >= FLASH_SIZE) {
          throw new Error("Chương trình quá lớn cho Arduino Nano (tối đa 32 KB)");
        }
        flash[addr] = data[i];
        length = Math.max(length, addr + 1);
      }
      hasData = true;
    } else if (type === 0x01) {
      break; // end of file
    } else if (type === 0x02) {
      base = ((data[0] << 8) | data[1]) << 4;
    } else if (type === 0x04) {
      base = ((data[0] << 8) | data[1]) << 16;
    } else if (type !== 0x03 && type !== 0x05) {
      throw new Error(`Loại bản ghi .hex không hỗ trợ: ${type}`);
    }
  }

  if (!hasData) throw new Error("File .hex rỗng");
  if (length > BOOTLOADER_START) {
    throw new Error("Chương trình đè lên bootloader");
  }

  return { flash, length };
}

/* =====================================================
   Lớp đọc/ghi serial với timeout
===================================================== */

class StkConnection {
  constructor(port) {
    this.port = port;
    this.buffer = [];
    this.reader = null;
    this.writer = null;
  }

  async open(baudRate) {
    await this.port.open({ baudRate });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.pump();
  }

  pump() {
    (async () => {
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) for (const b of value) this.buffer.push(b);
        }
      } catch (_) {
        // cổng đã đóng
      }
    })();
  }

  async readByte(timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (this.buffer.length === 0) {
      if (Date.now() > end) throw new Error("Hết thời gian chờ phản hồi");
      await sleep(2);
    }
    return this.buffer.shift();
  }

  async readBytes(count, timeoutMs) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(await this.readByte(timeoutMs));
    return out;
  }

  async write(bytes) {
    await this.writer.write(new Uint8Array(bytes));
  }

  flush() {
    this.buffer.length = 0;
  }

  async close() {
    try { await this.reader?.cancel(); } catch (_) {}
    try { this.reader?.releaseLock(); } catch (_) {}
    try { this.writer?.releaseLock(); } catch (_) {}
    this.reader = null;
    this.writer = null;
    await this.port.close();
  }
}

/* =====================================================
   Lệnh STK500 (Dành cho AVR / Nano / UNO)
===================================================== */

async function expectOK(conn, timeoutMs = 1000) {
  const insync = await conn.readByte(timeoutMs);
  const ok = await conn.readByte(timeoutMs);
  if (insync !== STK_INSYNC || ok !== STK_OK) {
    throw new Error("Bootloader từ chối lệnh");
  }
}

async function resetBoard(port) {
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  await sleep(50);
  await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  await sleep(100);
}

async function syncBootloader(conn) {
  for (let attempt = 0; attempt < 20; attempt++) {
    conn.flush();
    await conn.write([CMD_GET_SYNC, CRC_EOP]);
    try {
      await expectOK(conn, 300);
      return;
    } catch (_) {}
  }
  throw new Error("Không kết nối được bootloader");
}

async function readSignature(conn) {
  conn.flush();
  await conn.write([CMD_READ_SIGNATURE, CRC_EOP]);
  const insync = await conn.readByte(1000);
  const sig = await conn.readBytes(3, 1000);
  const ok = await conn.readByte(1000);
  if (insync !== STK_INSYNC || ok !== STK_OK) throw new Error("Không đọc được chip");
  return sig;
}

async function loadAddress(conn, byteAddress) {
  const word = byteAddress >> 1;
  await conn.write([CMD_LOAD_ADDRESS, word & 0xff, (word >> 8) & 0xff, CRC_EOP]);
  await expectOK(conn);
}

async function programPage(conn, data) {
  await conn.write([
    CMD_PROG_PAGE,
    (data.length >> 8) & 0xff,
    data.length & 0xff,
    MEM_FLASH,
    ...data,
    CRC_EOP,
  ]);
  await expectOK(conn, 2000);
}

async function readPage(conn, size) {
  await conn.write([CMD_READ_PAGE, (size >> 8) & 0xff, size & 0xff, MEM_FLASH, CRC_EOP]);
  const insync = await conn.readByte(1000);
  if (insync !== STK_INSYNC) throw new Error("Đọc trang thất bại");
  const data = await conn.readBytes(size, 2000);
  const ok = await conn.readByte(1000);
  if (ok !== STK_OK) throw new Error("Đọc trang thất bại");
  return data;
}

async function uploadAVROnce(serialPort, flash, length, baudRate, onStatus) {
  const conn = new StkConnection(serialPort);
  await conn.open(baudRate);

  try {
    await resetBoard(serialPort);
    await syncBootloader(conn);

    const sig = await readSignature(conn);
    if (sig.some((b, i) => b !== ATMEGA328P_SIGNATURE[i])) {
      throw new Error("Chip không phải ATmega328P. Hãy chọn đúng bo mạch.");
    }

    await conn.write([CMD_ENTER_PROGMODE, CRC_EOP]);
    await expectOK(conn);

    const pages = Math.ceil(length / PAGE_SIZE);
    onStatus?.(`⬆ Đang ghi flash (0/${pages} trang)...`);
    for (let p = 0; p < pages; p++) {
      const address = p * PAGE_SIZE;
      await loadAddress(conn, address);
      await programPage(conn, flash.slice(address, address + PAGE_SIZE));
      if (p % 8 === 7 || p === pages - 1) {
        onStatus?.(`⬆ Đang ghi flash (${p + 1}/${pages} trang)...`);
      }
    }

    onStatus?.("🔍 Đang kiểm tra...");
    for (let p = 0; p < pages; p++) {
      const address = p * PAGE_SIZE;
      await loadAddress(conn, address);
      const readBack = await readPage(conn, PAGE_SIZE);
      for (let i = 0; i < PAGE_SIZE; i++) {
        if (readBack[i] !== flash[address + i]) {
          throw new Error(`Kiểm tra thất bại tại địa chỉ 0x${(address + i).toString(16)}`);
        }
      }
    }

    await conn.write([CMD_LEAVE_PROGMODE, CRC_EOP]);
    await expectOK(conn);
  } finally {
    await conn.close();
  }
}

/* =====================================================
   HÀM NẠP CHO ESP32 (DevKit V1)
===================================================== */

export async function uploadESP32(serialPort, binaryData, onStatus) {
  // Nếu chưa truyền sẵn cổng qua tham số, mở hộp thoại chọn cổng của trình duyệt
  let port = serialPort;
  if (!port) {
    try {
      port = await navigator.serial.requestPort();
    } catch (err) {
      throw new Error("Bạn chưa chọn cổng kết nối cho ESP32.");
    }
  }

  onStatus?.("🔌 Đang kết nối với ESP32 DevKit V1 trên /dev/ttyUSB0...");
  
  const baudRate = 115200;
  await port.open({ baudRate });

  try {
    onStatus?.("🔄 Đang reset ESP32 vào chế độ Bootloader...");
    
    // Kéo tín hiệu chân DTR/RTS để reset cứng mạch
    await port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await sleep(100);
    await port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await sleep(500);

    onStatus?.("⚡ Sẵn sàng nạp dữ liệu cho ESP32...");
    await sleep(1000);
    onStatus?.("✅ Kết nối ESP32 thành công!");
  } finally {
    await port.close();
  }
}

/* =====================================================
   HÀM ĐIỀU HƯỚNG CHUNG CHO CÁC LOẠI BOARD
==================================================== */

export async function uploadHex(serialPort, hexText, onStatus, boardType = "nano") {
  if (boardType === "esp32") {
    // Gọi tiến trình nạp dành riêng cho ESP32
    await uploadESP32(serialPort, hexText, onStatus);
    return;
  }

  // Mặc định nạp cho Arduino Nano / UNO (AVR)
  const { flash, length } = parseIntelHex(hexText);

  let lastError = null;
  for (const baudRate of [115200, 57600]) {
    try {
      onStatus?.(`🔌 Đang kết nối (${baudRate} baud)...`);
      await uploadAVROnce(serialPort, flash, length, baudRate, onStatus);
      return;
    } catch (error) {
      lastError = error;
      if (/ATmega328P|Kiểm tra thất bại|quá lớn|đè lên/.test(error.message)) break;
    }
  }

  throw lastError || new Error("Nạp thất bại");
}

