/*
 * Hàm hỗ trợ cho khối Toán / Chữ / Danh sách: bản C++ (chèn vào sketch) và bản MicroPython,
 * cùng tên hàm `ct_*`, cùng ý nghĩa. File này KHÔNG import Blockly để dùng trong Node/test.
 */

export const LIST_TYPE = "List";

/** Có dùng hàm/kiểu nào ở trên không (để chỉ chèn khi cần). */
export const PROGRAM_HELPER_USED = /\b(?:ct_(?!div\b|map\b)[a-z0-9_]+\s*\(|CTList\b)/;

export const PROGRAM_CPP_HELPERS = String.raw`
// ===== Hàm toán / chữ / danh sách (khối Toán, Chữ, Danh sách) =====
#ifndef CT_LIST_MAX
#define CT_LIST_MAX 32
#endif
struct CTList { float items[CT_LIST_MAX]; int count; CTList() : count(0) {} };
static float ct_list_get(CTList& l, float i) { int n = (int)i; return (n >= 1 && n <= l.count) ? l.items[n - 1] : 0; }
static float ct_list_len(CTList& l) { return l.count; }
static void ct_list_clear(CTList& l) { l.count = 0; }
static void ct_list_add(CTList& l, float v) { if (l.count < CT_LIST_MAX) l.items[l.count++] = v; }
static void ct_list_insert(CTList& l, float i, float v) {
  int n = (int)i; if (n < 1) n = 1; if (n > l.count + 1) n = l.count + 1;
  if (l.count >= CT_LIST_MAX) return;
  for (int k = l.count; k >= n; k--) l.items[k] = l.items[k - 1];
  l.items[n - 1] = v; l.count++;
}
static void ct_list_remove(CTList& l, float i) {
  int n = (int)i; if (n < 1 || n > l.count) return;
  for (int k = n; k < l.count; k++) l.items[k - 1] = l.items[k];
  l.count--;
}
static void ct_list_set(CTList& l, float i, float v) { int n = (int)i; if (n >= 1 && n <= l.count) l.items[n - 1] = v; }
static float ct_list_index(CTList& l, float v) { for (int k = 0; k < l.count; k++) if (l.items[k] == v) return k + 1; return 0; }
static bool ct_list_contains(CTList& l, float v) { return ct_list_index(l, v) > 0; }

static float ct_mod(float a, float b) { if (b == 0) return 0; float r = fmod(a, b); if (r != 0 && ((r < 0) != (b < 0))) r += b; return r; }
static float ct_pow(float a, float b) { return pow(a, b); }
static float ct_sqrt(float v) { return v < 0 ? 0 : sqrt(v); }
static float ct_abs(float v) { return v < 0 ? -v : v; }
static float ct_round(float v) { return floor(v + 0.5); }
static float ct_round_places(float v, float n) { float p = pow(10, n); return floor(v * p + 0.5) / p; }
static float ct_floor(float v) { return floor(v); }
static float ct_ceil(float v) { return ceil(v); }
static float ct_sin(float d) { return sin(d * PI / 180.0); }
static float ct_cos(float d) { return cos(d * PI / 180.0); }
static float ct_tan(float d) { return tan(d * PI / 180.0); }
static float ct_asin(float v) { return asin(v) * 180.0 / PI; }
static float ct_acos(float v) { return acos(v) * 180.0 / PI; }
static float ct_atan(float v) { return atan(v) * 180.0 / PI; }
static float ct_ln(float v) { return v <= 0 ? 0 : log(v); }
static float ct_log10(float v) { return v <= 0 ? 0 : log10(v); }
static float ct_exp(float v) { return exp(v); }
static float ct_exp10(float v) { return pow(10, v); }
static float ct_min(float a, float b) { return a < b ? a : b; }
static float ct_max(float a, float b) { return a > b ? a : b; }
static float ct_constrain(float v, float lo, float hi) { if (lo > hi) { float t = lo; lo = hi; hi = t; } return v < lo ? lo : (v > hi ? hi : v); }
static bool ct_between(float v, float a, float b) { if (a > b) { float t = a; a = b; b = t; } return v >= a && v <= b; }
static float ct_random(float a, float b) {
  long lo = (long)a, hi = (long)b; if (hi < lo) { long t = lo; lo = hi; hi = t; }
  static bool seeded = false; if (!seeded) { randomSeed(micros()); seeded = true; }
  return random(lo, hi + 1);
}

static String ct_num_str(double v) {
  if (v == (long)v && v > -2000000000.0 && v < 2000000000.0) return String((long)v);
  String s(v, 4);
  while (s.endsWith("0")) s.remove(s.length() - 1);
  if (s.endsWith(".")) s.remove(s.length() - 1);
  return s;
}
static String ct_str(const String& s) { return s; }
static String ct_str(const char* s) { return String(s); }
static String ct_str(bool b) { return b ? String("true") : String("false"); }
template <typename T> static String ct_str(T v) { return ct_num_str((double)v); }
static float ct_len(const String& s) { return s.length(); }
static String ct_char_at(const String& s, float i) { int n = (int)i; return (n >= 1 && n <= (int)s.length()) ? String(s.charAt(n - 1)) : String(""); }
static bool ct_contains(const String& s, const String& sub) { return s.indexOf(sub) >= 0; }
static float ct_to_num(const String& s) { return s.toFloat(); }
static String ct_upper(String s) { s.toUpperCase(); return s; }
static String ct_lower(String s) { s.toLowerCase(); return s; }
`;

export const PROGRAM_PY_HELPERS = String.raw`
import math as _m
import random as _r


def ct_mod(a, b):
    return 0 if b == 0 else a % b


def ct_pow(a, b):
    try:
        return a ** b
    except (OverflowError, ZeroDivisionError):
        return 0


def ct_sqrt(v):
    return _m.sqrt(v) if v > 0 else 0


def ct_abs(v):
    return -v if v < 0 else v


def ct_round(v):
    return float(_m.floor(v + 0.5))


def ct_round_places(v, n):
    p = 10 ** n
    return _m.floor(v * p + 0.5) / p


def ct_floor(v):
    return float(_m.floor(v))


def ct_ceil(v):
    return float(_m.ceil(v))


def ct_sin(d):
    return _m.sin(_m.radians(d))


def ct_cos(d):
    return _m.cos(_m.radians(d))


def ct_tan(d):
    return _m.tan(_m.radians(d))


def ct_asin(v):
    return _m.degrees(_m.asin(max(-1, min(1, v))))


def ct_acos(v):
    return _m.degrees(_m.acos(max(-1, min(1, v))))


def ct_atan(v):
    return _m.degrees(_m.atan(v))


def ct_ln(v):
    return _m.log(v) if v > 0 else 0


def ct_log10(v):
    return _m.log10(v) if v > 0 else 0


def ct_exp(v):
    return _m.exp(v)


def ct_exp10(v):
    return 10 ** v


def ct_min(a, b):
    return a if a < b else b


def ct_max(a, b):
    return a if a > b else b


def ct_constrain(v, lo, hi):
    if lo > hi:
        lo, hi = hi, lo
    return lo if v < lo else (hi if v > hi else v)


def ct_between(v, a, b):
    if a > b:
        a, b = b, a
    return a <= v <= b


def ct_random(a, b):
    a, b = int(a), int(b)
    if b < a:
        a, b = b, a
    return _r.randint(a, b)


def ct_str(x):
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, float):
        if x != x or x in (float("inf"), float("-inf")):
            return str(x)
        if x == int(x) and abs(x) < 2000000000:
            return str(int(x))
        s = "%.4f" % x
        return s.rstrip("0").rstrip(".")
    return str(x)


def ct_len(s):
    return len(s)


def ct_char_at(s, i):
    i = int(i)
    return s[i - 1] if 1 <= i <= len(s) else ""


def ct_contains(s, sub):
    return sub in s


def ct_to_num(s):
    try:
        return float(s)
    except ValueError:
        return 0.0


def ct_upper(s):
    return s.upper()


def ct_lower(s):
    return s.lower()


def ct_list_get(lst, i):
    i = int(i)
    return lst[i - 1] if 1 <= i <= len(lst) else 0


def ct_list_len(lst):
    return len(lst)


def ct_list_clear(lst):
    del lst[:]


def ct_list_add(lst, v):
    lst.append(v)


def ct_list_insert(lst, i, v):
    i = max(1, min(int(i), len(lst) + 1))
    lst.insert(i - 1, v)


def ct_list_remove(lst, i):
    i = int(i)
    if 1 <= i <= len(lst):
        del lst[i - 1]


def ct_list_set(lst, i, v):
    i = int(i)
    if 1 <= i <= len(lst):
        lst[i - 1] = v


def ct_list_index(lst, v):
    for k, item in enumerate(lst):
        if item == v:
            return k + 1
    return 0


def ct_list_contains(lst, v):
    return ct_list_index(lst, v) > 0
`;
