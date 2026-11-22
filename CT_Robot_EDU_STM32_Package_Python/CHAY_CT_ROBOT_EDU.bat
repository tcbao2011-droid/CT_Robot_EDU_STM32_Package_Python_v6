@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo          CT ROBOT EDU - STM32 EDITION
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua tim thay Node.js.
  echo Cai Node.js 22 LTS ^(tu 22.12 tro len^) hoac Node.js 20.19 tro len,
  echo sau do chay lai file nay.
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay npm. Hay cai lai Node.js kem npm.
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number); if (!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) { console.error('Can Node.js 20.19+ hoac 22.12+. Phien ban hien tai: '+process.versions.node); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)

echo [OK] Node.js:
node --version

echo.
if not exist "node_modules\vite\bin\vite.js" (
  echo Dang cai cac thu vien cua ung dung. Can ket noi Internet trong lan dau...
  call npm ci
  if errorlevel 1 goto install_error
) else (
  echo [OK] Da co cac thu vien can thiet.
)

echo.
where arduino-cli >nul 2>nul
if errorlevel 1 (
  echo [CANH BAO] Chua tim thay arduino-cli.
  echo Ban van mo duoc giao dien, lap trinh va xuat ma .ino.
  echo Muon bien dich/nap truc tiep, can cai Arduino CLI va core cua board.
) else (
  echo [OK] Arduino CLI:
  arduino-cli version
)

echo.
echo Dang khoi dong CT Robot EDU tai http://127.0.0.1:5173
 echo Dong cua so nay hoac nhan Ctrl+C de tat ung dung.
echo.
call npm run dev -- --host 127.0.0.1 --open
goto end

:install_error
echo.
echo [LOI] Khong cai duoc cac goi Node.js.
echo Kiem tra ket noi Internet, sau do chay lai file CHAY_CT_ROBOT_EDU.bat.
echo Neu may bi gioi han mang, hay cai dependencies bang npm ci tren mang cho phep.
pause
exit /b 1

:end
endlocal
