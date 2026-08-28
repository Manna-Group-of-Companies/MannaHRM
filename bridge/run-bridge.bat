@echo off
REM Manna attendance bridge - reads the fingerprint machines, posts to ERPNext.
REM
REM Credentials live here rather than in config.toml so the config can be read,
REM copied and diffed without handing over a key that writes attendance for the
REM whole group. Lock this file down instead.
REM
REM This must run on a machine that stays on and can reach the device LAN.
REM Frappe Cloud cannot reach 192.168.1.40 - only something inside your network
REM can, which is the whole reason this program exists.
REM
REM Needs Node 22.5 or newer: the punch queue uses node:sqlite.

setlocal
set MANNA_API_KEY=REPLACE_ME
set MANNA_API_SECRET=REPLACE_ME

cd /d "%~dp0"
node mannabridge\main.js >> bridge.log 2>&1
