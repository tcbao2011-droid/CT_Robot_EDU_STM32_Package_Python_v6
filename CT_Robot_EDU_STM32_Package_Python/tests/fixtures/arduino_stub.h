#include <string>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#define PI 3.14159265358979
static unsigned long millis() { return 1500; }
static unsigned long micros() { return 1500000; }
static void delay(unsigned long) {}
static void randomSeed(unsigned long s) { srand(s); }
static long random(long a, long b) { return a + rand() % (b - a); }
class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c) {}
  String(char c) : s(1, c) {}
  String(long v) : s(std::to_string(v)) {}
  String(int v) : s(std::to_string(v)) {}
  String(double v, int d = 2) { char b[64]; snprintf(b, 64, "%.*f", d, v); s = b; }
  unsigned int length() const { return s.size(); }
  char charAt(unsigned i) const { return s[i]; }
  int indexOf(const String& o) const { auto p = s.find(o.s); return p == std::string::npos ? -1 : (int)p; }
  bool endsWith(const String& o) const { return s.size() >= o.s.size() && s.compare(s.size() - o.s.size(), o.s.size(), o.s) == 0; }
  void remove(unsigned i) { s.erase(i); }
  float toFloat() const { return atof(s.c_str()); }
  void toUpperCase() { for (auto& c : s) c = toupper(c); }
  void toLowerCase() { for (auto& c : s) c = tolower(c); }
  String operator+(const String& o) const { String r; r.s = s + o.s; return r; }
  bool operator==(const String& o) const { return s == o.s; }
};
struct SerialStub { void println(const String& v) { printf("%s\n", v.s.c_str()); } } Serial;
