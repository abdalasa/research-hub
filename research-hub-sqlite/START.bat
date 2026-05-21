@echo off
chcp 65001 >nul
echo =============================================
echo   Research Hub - Starting...
echo =============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js غير مثبت!
    echo حمّله من: https://nodejs.org  ثم اختر LTS
    pause
    exit /b 1
)

echo [OK] Node.js:
node --version
echo.
echo الموقع بيشتغل على: http://localhost:3000
echo اضغط Ctrl+C لإيقاف الموقع
echo.
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
node server.js
pause
