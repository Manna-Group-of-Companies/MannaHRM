@echo off
REM Manna attendance bridge - reads the fingerprint machines, posts to ERPNext.
REM
REM Copy to run-bridge.bat and fill in. run-bridge.bat is gitignored; this file
REM is tracked, so a key typed in here would be committed. That is the whole
REM reason the two are separate: this file said "credentials live here" while
REM being tracked, which is how a key that writes attendance for the whole group
REM gets published by somebody following the instructions.
REM
REM Credentials live in the copy rather than in config.toml so the config can be
REM read, copied and diffed without handing anybody the site. Lock the copy down
REM with icacls instead.
REM This must run on a machine that stays on and can reach the device LAN.
REM Frappe Cloud cannot reach 192.168.1.40 - only something inside your network
REM can, which is the whole reason this program exists.

setlocal
set MANNA_API_KEY=REPLACE_ME
set MANNA_API_SECRET=REPLACE_ME

cd /d "%~dp0"
python -m mannabridge.main >> bridge.log 2>&1
