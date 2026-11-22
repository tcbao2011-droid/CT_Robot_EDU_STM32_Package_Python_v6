/* Chuẩn hoá tiếng Việt để tìm kiếm không phụ thuộc dấu / hoa thường. */
export const fold = s =>
  String(s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const lc = s => String(s ?? "").toLocaleLowerCase("vi");
