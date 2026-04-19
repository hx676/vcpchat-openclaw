@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%tools\vcp-control.ps1" restart
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo [VCPControl] Restart failed with code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
