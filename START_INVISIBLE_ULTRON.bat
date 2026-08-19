@echo off
title ULTRON // INVISIBLE NATIVE DESKTOP ENGINE
color 0b
cls
echo ========================================================
echo   ULTRON // INVISIBLE NATIVE DESKTOP CORE
echo   Dual-Engine Smart Router + Porcupine + AgentDB Active
echo ========================================================
echo.

:: Launch Node server in background
start /B node ultron-server.js

echo [OK] Ultron Core running on http://localhost:3000
echo [OK] Press any key or speak 'Ultron' to wake up!
echo.
timeout /t 3 >nul
start http://localhost:3000
