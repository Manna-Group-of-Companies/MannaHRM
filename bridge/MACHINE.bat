@echo off
REM Double-click: the fingerprint machine tools, as a numbered menu.
REM INSTALL.bat puts a shortcut to this on the desktop.
REM
REM As administrator, because the key in bridge.env and the backups in
REM machine-backups are both locked to administrators. The installer did that on
REM purpose, and this asks for the right rather than loosening either.
REM
REM "elevated" marks the second start, so a PC that refuses elevation shows the
REM message below instead of asking again forever.

whoami /groups | find "S-1-16-12288" > nul
if errorlevel 1 (
	if "%~1"=="elevated" (
		echo This needs an administrator. Right-click MACHINE.bat and Run as administrator.
		pause
		exit /b 1
	)
	powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevated' -Verb RunAs"
	exit /b
)

setlocal
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
	echo The bridge is not installed in this folder. Run INSTALL.bat first.
	pause
	exit /b 1
)
".venv\Scripts\python.exe" machine_menu.py
pause
