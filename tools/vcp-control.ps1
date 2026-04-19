param(
    [ValidateSet('stop', 'restart')]
    [string]$Action = 'stop'
)

$ErrorActionPreference = 'Stop'

$chatRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolboxCandidates = @(
    (Join-Path $chatRoot '..\VCPToolBox'),
    (Join-Path $chatRoot 'VCPToolBox')
)
$toolboxRoot = $toolboxCandidates | Where-Object { Test-Path (Join-Path $_ 'server.js') } | Select-Object -First 1

function Test-PortClosed {
    param(
        [string]$Address = '127.0.0.1',
        [int]$Port = 6005,
        [int]$TimeoutMs = 500
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($Address, $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            return $true
        }
        $client.EndConnect($iar) | Out-Null
        return $false
    } catch {
        return $true
    } finally {
        $client.Close()
    }
}

function Stop-VcpProcesses {
    param(
        [string]$ChatRoot,
        [string]$ToolboxRoot
    )

    $chatPattern = [Regex]::Escape($ChatRoot)
    $toolboxServerPath = if ($ToolboxRoot) { [Regex]::Escape((Join-Path $ToolboxRoot 'server.js')) } else { $null }
    $toolboxServerRelative = '(^|["\s])server\.js(["\s]|$)'

    $targets = Get-CimInstance Win32_Process | Where-Object {
        $commandLine = $_.CommandLine
        $executablePath = $_.ExecutablePath

        (
            $_.Name -eq 'electron.exe' -and (
                ($commandLine -and $commandLine -match $chatPattern) -or
                ($executablePath -and $executablePath -match $chatPattern)
            )
        ) -or (
            $_.Name -eq 'NativeSplash.exe' -and $executablePath -and $executablePath -match $chatPattern
        ) -or (
            $_.Name -eq 'node.exe' -and $commandLine -and (
                ($toolboxServerPath -and $commandLine -match $toolboxServerPath) -or
                ($ToolboxRoot -and $commandLine -match $toolboxServerRelative)
            )
        )
    }

    if (-not $targets) {
        Write-Host '[VCPControl] No running VCPChat/VCPToolBox processes were found.'
        return
    }

    foreach ($process in $targets) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Write-Host ("[VCPControl] Stopped {0} ({1})" -f $process.Name, $process.ProcessId)
        } catch {
            if ($_.Exception.Message -notmatch 'Cannot find a process') {
                Write-Warning ("[VCPControl] Failed to stop {0} ({1}): {2}" -f $process.Name, $process.ProcessId, $_.Exception.Message)
            }
        }
    }

    for ($i = 0; $i -lt 20; $i++) {
        if (Test-PortClosed) {
            break
        }
        Start-Sleep -Milliseconds 250
    }
}

Stop-VcpProcesses -ChatRoot $chatRoot -ToolboxRoot $toolboxRoot

if ($Action -eq 'restart') {
    Start-Sleep -Seconds 1
    $launcher = Join-Path $chatRoot 'start-vcp.bat'
    $launcher = Join-Path $chatRoot '一键启动VCPChat.bat'
    $launcher = Join-Path $chatRoot 'start-vcp.bat'
    if (-not (Test-Path $launcher)) {
        throw "Launcher not found: $launcher"
    }
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$launcher`"" | Out-Null
    Write-Host "[VCPControl] Restart requested via $launcher"
}
