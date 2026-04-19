@echo off
setlocal
chcp 65001 >nul

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"

if exist "node_modules\.bin\electron.cmd" (
    exit /b 0
)

echo [VCPChat] Local Electron dependencies were not found.
echo [VCPChat] Running npm install. First launch may take a few minutes.
call npm install
if errorlevel 1 (
    echo [VCPChat] Dependency installation failed.
    echo [VCPChat] Please check your network, Node.js, and npm config, then try again.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\electron.cmd" (
    echo [VCPChat] npm install finished, but Electron is still missing.
    echo [VCPChat] Try deleting node_modules and running npm install again.
    pause
    exit /b 1
)

exit /b 0
