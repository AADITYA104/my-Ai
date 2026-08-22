@echo off
title STOP ULTRON
color 0c
cls
echo ========================================================
echo   🛑 STOPPING ULTRON AI SYSTEM...
echo ========================================================
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo [OK] Ultron processes stopped successfully.
timeout /t 2 >nul
