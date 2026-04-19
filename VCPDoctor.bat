@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"

node "%PROJECT_DIR%tools\vcp-doctor.js"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo [VCPDoctor] No blocking issues were found.
) else (
    echo [VCPDoctor] Issues were detected. Please review the report above.
)

pause
exit /b %EXIT_CODE%
