@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "CHAT_DIR=%~dp0"
for %%I in ("%CHAT_DIR%.") do set "CHAT_DIR=%%~fI\"

set "TOOLBOX_DIR="
if exist "%CHAT_DIR%..\VCPToolBox\server.js" set "TOOLBOX_DIR=%CHAT_DIR%..\VCPToolBox"
if not defined TOOLBOX_DIR if exist "%CHAT_DIR%VCPToolBox\server.js" set "TOOLBOX_DIR=%CHAT_DIR%VCPToolBox"

if not defined TOOLBOX_DIR (
    echo [Launcher] VCPToolBox was not found next to VCPChat.
    echo [Launcher] Expected one of these paths:
    echo [Launcher]   %CHAT_DIR%..\VCPToolBox
    echo [Launcher]   %CHAT_DIR%VCPToolBox
    pause
    exit /b 1
)

call "%CHAT_DIR%ensure-node-deps.bat"
if errorlevel 1 exit /b 1

call "%TOOLBOX_DIR%\ensure-node-deps.bat"
if errorlevel 1 exit /b 1

call :check_port
if "%PORT_READY%"=="0" (
    if exist "%TOOLBOX_DIR%\vcp.stdout.prev.log" del /q "%TOOLBOX_DIR%\vcp.stdout.prev.log" >nul 2>nul
    if exist "%TOOLBOX_DIR%\vcp.stderr.prev.log" del /q "%TOOLBOX_DIR%\vcp.stderr.prev.log" >nul 2>nul
    if exist "%TOOLBOX_DIR%\vcp.stdout.log" move /y "%TOOLBOX_DIR%\vcp.stdout.log" "%TOOLBOX_DIR%\vcp.stdout.prev.log" >nul
    if exist "%TOOLBOX_DIR%\vcp.stderr.log" move /y "%TOOLBOX_DIR%\vcp.stderr.log" "%TOOLBOX_DIR%\vcp.stderr.prev.log" >nul
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$arg = '/c chcp 65001 >nul && node server.js 1>>vcp.stdout.log 2>>vcp.stderr.log'; Start-Process -WindowStyle Minimized -WorkingDirectory '%TOOLBOX_DIR%' -FilePath 'cmd.exe' -ArgumentList $arg" >nul
    call :wait_for_port 60
)

start "" wscript.exe "%CHAT_DIR%launch-vchat.vbs"
exit /b 0

:check_port
set "PORT_READY=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$client = New-Object System.Net.Sockets.TcpClient; try { $iar = $client.BeginConnect('127.0.0.1', 6005, $null, $null); if (-not $iar.AsyncWaitHandle.WaitOne(500)) { exit 1 }; $client.EndConnect($iar); exit 0 } catch { exit 1 } finally { $client.Close() }" >nul 2>nul
if not errorlevel 1 set "PORT_READY=1"
exit /b 0

:wait_for_port
set "PORT_READY=0"
set "WAIT_LIMIT=%~1"
if not defined WAIT_LIMIT set "WAIT_LIMIT=60"
set /a WAIT_COUNT=0

:wait_loop
call :check_port
if "%PORT_READY%"=="1" exit /b 0
if %WAIT_COUNT% GEQ %WAIT_LIMIT% exit /b 0
set /a WAIT_COUNT+=1
timeout /t 1 /nobreak >nul
goto :wait_loop
