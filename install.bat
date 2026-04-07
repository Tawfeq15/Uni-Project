@echo off
echo ====================================================
echo  Exam Scheduler Pro - Installation Script
echo ====================================================
echo.
echo [1/3] Installing backend dependencies...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 (
    echo ERROR: Backend install failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo ERROR: Frontend install failed!
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo ====================================================
echo  Installation Complete!
echo  Now run: start-dev.bat
echo ====================================================
pause
