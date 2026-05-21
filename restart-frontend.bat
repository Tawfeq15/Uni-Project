@echo off
echo Stopping Vite frontend...
taskkill /fi "WINDOWTITLE eq Frontend - Exam Scheduler" /f >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting Frontend on http://localhost:5173
start "Frontend - Exam Scheduler" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 2 /nobreak >nul
echo Frontend restarted!
