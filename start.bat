@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

call "%PROJECT_DIR%ensure-node-deps.bat"
if errorlevel 1 (
    exit /b 1
)

echo [VCPChat] Starting VCP Chat Desktop...
start "" "%PROJECT_DIR%NativeSplash.exe"
if exist "%PROJECT_DIR%node_modules\electron\dist\electron.exe" (
    "%PROJECT_DIR%node_modules\electron\dist\electron.exe" .
) else (
    node "%PROJECT_DIR%node_modules\electron\cli.js" .
)
exit /b %errorlevel%
