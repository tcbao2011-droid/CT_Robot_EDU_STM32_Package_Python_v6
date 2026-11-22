#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Can cai Node.js 20.19+ hoac 22.12+ kem npm truoc khi chay." >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) { console.error(`Can Node.js 20.19+ hoac 22.12+. Hien tai: ${process.versions.node}`); process.exit(1); }'

if [[ ! -f node_modules/vite/bin/vite.js ]]; then
  echo "Dang cai cac thu vien cua ung dung (can Internet trong lan dau)..."
  npm ci
fi

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "CANH BAO: chua co arduino-cli; chuc nang bien dich/nap truc tiep chua kha dung."
fi

echo "Mo CT Robot EDU tai http://127.0.0.1:5173"
exec npm run dev -- --host 127.0.0.1 --open
