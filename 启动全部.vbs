Option Explicit

Dim WshShell, fso, projectPath, splashPath, electronCmdPath, vchatCommand, desktopCommand
Dim vchatLogPath, desktopLogPath
Dim readyFilePath, waitCount, bootstrapCommand

Set fso = CreateObject("Scripting.FileSystemObject")
projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
splashPath = """" & projectPath & "\NativeSplash.exe"""
readyFilePath = projectPath & "\.vcp_ready"
electronCmdPath = projectPath & "\node_modules\.bin\electron.cmd"
vchatLogPath = projectPath & "\AppData\launch-vchat.log"
desktopLogPath = projectPath & "\AppData\launch-desktop.log"

Set WshShell = CreateObject("WScript.Shell")

If Not fso.FileExists(electronCmdPath) Then
    MsgBox "Local Electron dependencies were not found." & vbCrLf & _
        "A visible install window will open now." & vbCrLf & _
        "VChat and the desktop module will relaunch automatically after npm install completes.", vbInformation, "VCPChat"
    bootstrapCommand = "cmd /c cd /d """ & projectPath & """ && call ensure-node-deps.bat && wscript.exe """ & WScript.ScriptFullName & """"
    WshShell.Run bootstrapCommand, 1, False
    Set fso = Nothing
    Set WshShell = Nothing
    WScript.Quit 1
End If

vchatCommand = "cmd /c chcp 65001 >nul && cd /d """ & projectPath & """ && """ & electronCmdPath & """ . 1>>""" & vchatLogPath & """ 2>&1"
desktopCommand = "cmd /c chcp 65001 >nul && cd /d """ & projectPath & """ && """ & electronCmdPath & """ . --desktop-only 1>>""" & desktopLogPath & """ 2>&1"

WshShell.Run splashPath, 0, False
WshShell.Run vchatCommand, 0, False

waitCount = 0
Do While waitCount < 120
    WScript.Sleep 500
    waitCount = waitCount + 1
    If fso.FileExists(readyFilePath) Then
        Exit Do
    End If
Loop

WScript.Sleep 2000
WshShell.Run desktopCommand, 0, False

Set fso = Nothing
Set WshShell = Nothing
WScript.Quit
