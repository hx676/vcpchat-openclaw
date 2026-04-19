Option Explicit

Dim WshShell, fso, projectPath, electronCmdPath, commandToRun, bootstrapCommand, launchLogPath

Set fso = CreateObject("Scripting.FileSystemObject")
projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
electronCmdPath = projectPath & "\node_modules\.bin\electron.cmd"
launchLogPath = projectPath & "\AppData\launch-desktop.log"

Set WshShell = CreateObject("WScript.Shell")

If Not fso.FileExists(electronCmdPath) Then
    MsgBox "Local Electron dependencies were not found." & vbCrLf & _
        "A visible install window will open now." & vbCrLf & _
        "Desktop mode will relaunch automatically after npm install completes.", vbInformation, "VCPChat"
    bootstrapCommand = "cmd /c cd /d """ & projectPath & """ && call ensure-node-deps.bat && wscript.exe """ & WScript.ScriptFullName & """"
    WshShell.Run bootstrapCommand, 1, False
    Set fso = Nothing
    Set WshShell = Nothing
    WScript.Quit 1
End If

commandToRun = "cmd /c chcp 65001 >nul && cd /d """ & projectPath & """ && """ & electronCmdPath & """ . --desktop-only 1>>""" & launchLogPath & """ 2>&1"
WshShell.Run commandToRun, 0, False

Set fso = Nothing
Set WshShell = Nothing
WScript.Quit
