@echo off
echo ====================================================
echo  Exam Scheduler Pro - Starting Development Servers
echo ====================================================
echo.
echo Starting Backend on http://localhost:8000
echo Starting Frontend on http://localhost:5173
echo.
echo Close this window to stop both servers.
echo.

start "Backend - Exam Scheduler" cmd /k "cd /d "%~dp0backend-php" && php artisan serve"
timeout /t 2 /nobreak > nul
start "Frontend - Exam Scheduler" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak > nul
start "" "http://localhost:5173"

echo.
echo Both servers are running!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
pause
