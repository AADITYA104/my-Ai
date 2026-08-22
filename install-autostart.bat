@echo off
REM ============================================================================
REM  ULTRON 2026 — Auto-Start Installer
REM  Copies ultron-autostart.vbs to Windows Startup folder so ULTRON
REM  starts automatically every time the laptop boots.
REM  Run this ONCE as Administrator.
REM ============================================================================

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"

echo.
echo  ========================================
echo   ULTRON AUTO-START INSTALLER
echo  ========================================
echo.

copy "%SCRIPT_DIR%ultron-autostart.vbs" "%STARTUP%\ultron-autostart.vbs" /Y

if %ERRORLEVEL% EQU 0 (
    echo  [OK] ultron-autostart.vbs installed to:
    echo       %STARTUP%
    echo.
    echo  ULTRON will now start automatically on every boot!
) else (
    echo  [ERROR] Failed to copy. Try running as Administrator.
)

echo.
pause
