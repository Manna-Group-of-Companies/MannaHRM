@echo off
REM Double-click: the Manna HR Console - the machines and ERPNext on one screen.
REM INSTALL.bat puts a shortcut to this on the desktop.
REM
REM As administrator, because it reads bridge.env, which the installer locks to
REM administrators on purpose. The console listens on 127.0.0.1 only: the key it
REM holds writes attendance for the whole group, and the machines answer to it.
REM
REM "elevated" marks the second start, so a PC that refuses elevation says so
REM once instead of asking for ever.

whoami /groups | find "S-1-16-12288" > nul
if errorlevel 1 (
	if "%~1"=="elevated" (
		echo This needs an administrator. Right-click CONSOLE.bat and Run as administrator.
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
echo Opening the Manna HR Console. Leave this window open - closing it closes the app.
".venv\Scripts\python.exe" console.py
pause
