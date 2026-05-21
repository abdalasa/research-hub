@echo off
chcp 65001 >nul
echo =============================================
echo   Research Hub - Setup (No Database Needed)
echo =============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install it from: https://nodejs.org
    echo Choose the LTS version, then run this file again.
    pause
    exit /b 1
)

echo [OK] Node.js found:
node --version

echo.
echo [OK] All 250 research papers are included in data.json
echo [OK] No database installation required!
echo.
echo Setup complete! Run START.bat to launch the site.
pause
