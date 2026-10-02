@echo off
REM Read every machine again from a date, and send what the site has not got.
REM
REM   RESEND.bat 2026-09-01
REM
REM For days the bridge was not running: switched off, not yet installed, or a
REM machine that would not answer. Re-sending is free - the queue never sends a
REM punch twice and the site recognises one it already holds - so only the
REM missing days actually go. Nothing on the machine is changed or cleared.
REM
REM The bridge's own task is stopped first and started again after: two bridges
REM reading one machine fight for its single connection and share one queue.
REM As administrator, because the key in bridge.env is locked to administrators.

setlocal
if "%~1"=="" (
	echo Give the first day to read, like this:  RESEND.bat 2026-09-01
	pause
	exit /b 1
)

whoami /groups | find "S-1-16-12288" > nul
if errorlevel 1 (
	if "%~2"=="elevated" (
		echo This needs an administrator. Right-click RESEND.bat and Run as administrator.
		pause
		exit /b 1
	)
	powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1','elevated' -Verb RunAs"
	exit /b
)

cd /d "%~dp0"
echo Stopping the bridge while the machines are read again...
powershell -NoProfile -Command "Stop-ScheduledTask -TaskName 'Manna Attendance Bridge' -ErrorAction SilentlyContinue; $root = (Get-Location).Path + '\'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'mannabridge\.main' -and $_.CommandLine -notmatch 'resend-from' -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, 'OrdinalIgnoreCase')) -or $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo Reading every machine from %~1. This can take a few minutes on a machine with a long memory.
".venv\Scripts\python.exe" -m mannabridge.main --once --resend-from %~1
set RESULT=%errorlevel%

echo Starting the bridge again...
powershell -NoProfile -Command "Start-ScheduledTask -TaskName 'Manna Attendance Bridge' -ErrorAction SilentlyContinue"

if not "%RESULT%"=="0" (
	echo The re-read stopped with an error. The bridge is running again; the lines above say why.
) else (
	echo Done. The line "pass complete" above says how many were new and sent.
)
pause
