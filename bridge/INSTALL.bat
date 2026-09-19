@echo off
REM Double-click to install the Manna attendance bridge on this PC.
REM
REM   INSTALL.bat               install, or upgrade and keep the setup
REM   INSTALL.bat -Reconfigure  add a machine, or change the key
REM   INSTALL.bat -Status       is it running, and the end of its log
REM   INSTALL.bat -Replace      remove the old bridge first, then install
REM   INSTALL.bat -Uninstall    stop it; every file is kept
REM
REM -Replace keeps the config, the key and punches.sqlite3 - the punches in it
REM have not reached ERPNext yet. The auto-install zip always replaces.
REM
REM Only a way past the execution policy a fresh Windows ships with, which
REM refuses to run a downloaded .ps1 at all. The work is in install.ps1.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
