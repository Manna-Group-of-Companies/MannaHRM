' The Manna HR Console as a program: no black window, just the app.
'
' The desktop and Start menu shortcuts point here. The console itself runs in
' the background - INSTALL.bat registers a Scheduled Task that starts it at
' boot - so this does not start a server. It asks Windows for administrator
' once, reads the console's key (a file locked to administrators, which is what
' stops anybody signed in at a gate PC from opening the app), and opens the
' window on that key.
'
' If the background task is not running, pythonw is started here instead, and
' the app comes up the same way. Either path ends with one window and nothing
' else on screen.
'
' Output goes to console.log beside this file: a program with no window has
' nowhere to print a traceback, and a crash that leaves nothing behind is a
' crash nobody can fix. CONSOLE.bat shows the same thing with the window
' visible, which is what to run when this does nothing.

Option Explicit

Dim shell, fso, here, pythonw, script, tokenFile, logFile, elevated
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = here & "\.venv\Scripts\pythonw.exe"
script = here & "\console.py"
tokenFile = here & "\console-token.txt"
logFile = here & "\console.log"

If Not fso.FileExists(pythonw) Then
	MsgBox "The bridge is not installed in this folder." & vbCrLf & vbCrLf & _
		"Run INSTALL.bat first, then open this again.", vbExclamation, "Manna HR Console"
	WScript.Quit 1
End If

' "elevated" marks the second start: without it a PC that refuses the
' administrator prompt would ask again for ever.
elevated = False
If WScript.Arguments.Count > 0 Then
	If WScript.Arguments(0) = "elevated" Then elevated = True
End If

If elevated Then
	Set shell = CreateObject("WScript.Shell")
	' Hidden, and it exits by itself once the window is open: with the
	' background task already serving, console.py only opens the window.
	shell.Run """" & pythonw & """ """ & script & """ --token-file """ & tokenFile & _
		""" --log """ & logFile & """", 0, False
Else
	CreateObject("Shell.Application").ShellExecute "wscript.exe", _
		"""" & WScript.ScriptFullName & """ elevated", "", "runas", 1
End If
