# Manna Attendance — the Windows program

For the gate PC, and for the people who used eSSL there for years: a menu down
the left, a grid on the right, Export to Excel over every grid.

| Screen | What it answers |
|---|---|
| Bridge | Is the bridge running, how many punches are waiting on this PC, its log. Restart it |
| Devices | Every machine: online, users, its clock against the site's. **Search for devices** from here |
| Employees on machine | Who is enrolled, beside the ERPNext Employee their number belongs to |
| Download logs | The machine's own log. Reading it never clears it |
| Attendance report | First in, last out, per person per day, off what reached ERPNext |
| Not linked | Numbers on a machine that no Employee carries, and giving them one |
| New employee | ERPNext first, then the same number on the machine |
| Backup and restore | Users and fingerprints to a file; restore; remove one user |
| Search devices | **Search the network** (every address on this PC's networks) or **Connect** to one address; both only read. Then **Add this machine** |

## How it works

**It holds no rule.** Everything it does is a question to the bridge's
console (`bridge/console.py`), which already runs from boot as SYSTEM on
`127.0.0.1:8765` and calls `employee_tools` and `machine` for every check. This
program reads the console's key from `console-token.txt` in the bridge folder,
which is locked to administrators — so it runs as administrator
(`windows/runner/runner.exe.manifest`). It never talks to a fingerprint machine
or to ERPNext itself. If the console is not answering, it starts the
`Manna HR Console` task rather than a second console.

It looks for the bridge in the folder above itself (the installer puts it in
`C:\MannaBridge\app\`), then `MANNA_BRIDGE_DIR`, then `C:\MannaBridge`.

## Build and ship

Needs Visual Studio with **Desktop development with C++**.

```powershell
cd desktop
flutter test                      # no console, no machine, no site
flutter build windows --release
cd ..\bridge
powershell -ExecutionPolicy Bypass -File package.ps1   # the zip now carries app\
```

`INSTALL.bat` on the gate PC copies `app\` and puts **Manna Attendance** on the
desktop and under Start > Manna HR. A zip built without the program still
installs the bridge and the console, and `package.ps1` says so.
