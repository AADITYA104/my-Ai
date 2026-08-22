' ============================================================================
'  ULTRON 2026 — Silent Windows Auto-Start Launcher
'  This VBScript runs Node.js ultron-server.js silently in the background
'  when placed in the Windows Startup folder (shell:startup).
' ============================================================================

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")

' Resolve the ULTRON project root (same folder as this script, or hardcoded)
Dim ultronDir
ultronDir = "C:\Users\devmu\Downloads\my Ai"

' Launch Node.js silently (0 = hidden window, False = don't wait for exit)
WshShell.CurrentDirectory = ultronDir
WshShell.Run "cmd /c node ultron-server.js", 0, False

Set WshShell = Nothing
