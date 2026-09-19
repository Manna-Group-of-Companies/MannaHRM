# The attendance bridge

Pulls punches off the fingerprint machines and posts them to ERPNext as
`Employee Checkin`.

It runs **on your network, not on Frappe Cloud.** `mannarubber.m.frappe.cloud`
cannot reach a factory LAN, so this needs a small always-on machine at each
location — a mini PC or a Raspberry Pi — or one machine that reaches every site
over VPN.

---

## What it does, in order

1. Read every configured device over the ZK protocol.
2. Write what is new into a local SQLite queue.
3. Post everything undelivered to ERPNext.
4. Mark delivered, prune old delivered rows.

**The order is the design.** Persist before posting, and never clear the
device's own log. The tutorial version of this program reads the device, posts,
and clears — and when the post fails, the punches are gone from both ends and
nobody finds out until payroll. Duplicates are cheap here: the queue has a
UNIQUE constraint, and hrms de-duplicates again on its side. A lost punch is
somebody's day's pay.

---

## Installing it on a PC

One bridge per network. A machine on another LAN, behind another router, needs a
PC on *that* LAN, because Frappe Cloud cannot reach `192.168.x.x` and neither
can a bridge somewhere else.

**Carry it over.** On a PC that has the repo:

```powershell
powershell -ExecutionPolicy Bypass -File bridge\package.ps1   # -> bridge\dist\MannaBridge.zip
```

Take the zip and never the folder: the folder on a PC that already runs a bridge
holds its key and its punch queue, and `package.ps1` refuses to include either.

**Windows.** Extract, open `MannaBridge`, double-click `INSTALL.bat`, and answer
the questions. It finds or installs Python, copies itself to `C:\MannaBridge`,
asks for the ERPNext key, searches the network for machines, runs one pass so
punches are seen arriving, and registers the Scheduled Task *Manna Attendance
Bridge*: at boot, as SYSTEM, no time limit.

```
INSTALL.bat -Status        running? and the end of the log
INSTALL.bat -Reconfigure   add a machine, or replace the key
INSTALL.bat -Uninstall     stop it; every file is kept
```

**Linux** (a Raspberry Pi, a mini PC — anything with systemd and Python 3.11):
`sudo sh install.sh`. Same questions; it installs to `/opt/mannabridge` as the
`mannabridge` service under its own user. `journalctl -u mannabridge -f` is the log.

**What setup decides for you, and why.**

- **The key goes in `bridge.env`**, locked to SYSTEM and Administrators (or
  `chmod 600`), never in `config.toml`. `config.py` reads it; the environment
  still wins when both are set.
- **Each new machine starts from a date you give**, the first of the current
  month by default, because the month is what gets paid. Without
  that the first pass posts the machine's whole history. A machine this PC
  already reads keeps its cursor whatever date is typed — moving it would skip
  punches not yet sent.
- **It lists the machine names already sending punches.** A punch carries no
  serial number, so the site cannot say which name belongs to the box in front
  of you; the person at the keyboard can. Re-using the name is right when a
  machine moves to a new PC; a new machine needs a new one.
- **It offers to add each machine to `Attendance Device`**, which is what the
  silence alarm reads. That needs an `HR Manager` key. Without one it says so
  and carries on; the bridge does not need the register to deliver.

`python -m mannabridge.wizard` is the same questions without the installer, for
a bridge run by hand.

### With nobody answering questions

```powershell
powershell -ExecutionPolicy Bypass -File bridge\package.ps1 -Auto   # -> bridge\dist\MannaBridge-auto.zip
```

The auto zip carries `autoinstall.toml` — the site and the API key, checked
against the site before the zip is built. On the other PC, double-click
`INSTALL.bat`: after Windows' administrator prompt nothing else is asked. It
installs Python (winget, or python.org's signed installer where there is no
winget), searches the network, names every machine it finds, starts from the 1st of the month,
runs a test pass, registers the task, turns sleep off, deletes the key file,
and closes itself a minute later. `sudo sh install.sh` does the same on Linux.

- **The auto zip is a key.** Send it the way a password is sent and delete it
  after. It is never committed: `dist/` and `autoinstall.toml` are ignored.
- **It replaces whatever bridge is on the PC.** The code goes; `config.toml`,
  `bridge.env`, `punches.sqlite3` and `machine-backups` stay, because they are
  this PC's setup, its key, the punches that have not reached ERPNext yet and
  fingerprint backups that cannot be made again. By hand that is
  `INSTALL.bat -Replace`.
- **Names, with nobody to choose them:** a serial listed in
  `known_machines.toml` keeps the name its punches already carry
  (`CGKK211561350` is `BIO-MRP-GATE1`); then a name from the Attendance Device
  register; otherwise `BIO-<serial>`, which every reinstall arrives at again.
- **What the search cannot see** — a machine on another subnet of the same
  plant, or one with a comm key — goes in `autoinstall.toml` as `hosts` and
  `comm_keys` before the zip is sent.
- **No machine found stops the install** with the reason on screen. A bridge
  with nothing to read would run for months doing nothing, and look installed.

## Who is enrolled on each machine

Every pass also lists each machine's users and sends ERPNext what changed, as
`Attendance Device User` — shown on the dashboard under Attendance → Machine
Users, and on each Attendance Device's own form.

- **Enrolled At is when somebody appeared on the machine**, to within one poll.
  The machine keeps no enrolment date, so the people already on it at the
  bridge's first read have none, and are shown blank rather than dated to the
  install.
- **Removed people keep their row**, unticked, because their punches still name
  that user id. An empty user list from a machine that had people is treated as
  a failed read, not as everybody leaving.
- **A blank Employee is the row to act on**: the machine lets them punch and
  every punch is refused until `Employee.attendance_device_id` is filled.
- Separate from punches. The doctype missing from the site, or a key that may
  not write it, is logged and the punches deliver exactly as before. What was
  read waits in the queue file and goes once it can.

## What the dashboard asks for

A browser cannot reach a fingerprint machine: they sit on the plant's LAN and
the dashboard talks to ERPNext and nothing else. This box can reach both, so the
dashboard leaves a **`Machine Command`** on the site and the bridge does it.

```
dashboard  ──►  ERPNext: Machine Command (Pending)
                      ▲            │
                      │            ▼  every ~20s
              answer written   bridge picks it up  ──►  the machine
```

- **Three actions and no more:** Check User, Add User, List Users. The list is
  closed on the server (`manna_hr/machinecmd.py`) and again in
  `mannabridge/commands.py` — there is nothing here that clears a punch log,
  wipes a machine or switches it off, and adding one would take an edit in both
  places. `manna_hr/tests/test_machine_command.py` fails if the two lists drift.
- **A number the machine already holds is never written over.** It may carry
  somebody's fingerprints. That answers "already there", which is not a failure:
  the gate usually enrols the finger first.
- **`command_seconds`** in `[bridge]` is how often the site is asked, 20 by
  default and never under 5 — somebody is watching the answer, and the site has
  a daily compute limit.
- **A command still Pending minutes later means no bridge is running** for that
  machine, not that the machine refused. It runs when the bridge comes back.
- Nothing here can cost a pass of the punches: it has its own try, like the
  enrolment list, and a site without the doctype is noted once and left alone.

## The console on the gate PC

`CONSOLE.bat`, or **Manna HR Console** on the desktop. A web page served by
`console.py` on `127.0.0.1` and nowhere else — this PC is the only place that
can reach both the machines and ERPNext, which is the whole reason it exists.

| Screen | What |
|---|---|
| Machines | every machine, its address, how many users, its clock and how far off the site it is |
| People on a machine | each user beside the Employee their number belongs to, and what is wrong where something is |
| Punch log | the machine's own memory, read only |
| Attendance | first in and last out per person per day, from what reached ERPNext, with the Attendance status beside it |
| New employee | a free number, the record on the site, and the user on the machine — in that order |

- **It listens on `127.0.0.1` only** and refuses anything else. It reads
  `bridge.env`, whose key writes attendance for the whole group, and it drives
  the machines; on the network it would hand both to whoever is on the LAN.
- **It decides nothing.** Every rule is `employee_tools.py`'s and `machine.py`'s
  — a number nobody else holds, the mandatory fields, the closed list of what a
  machine may be asked. The page shows what they answered.
- **The site is written before the machine**, so a record ERPNext refuses leaves
  the gate untouched.
- A fingerprint still cannot be created from here. The template is made by the
  sensor; the console gets the number and the name onto the machine so that
  somebody at the gate only has to add the finger.

## Changing a machine by hand

The bridge only reads. Everything that changes a machine is a separate tool, run
by a person, installed beside the bridge by `INSTALL.bat` with a **Manna Machine
Tools** shortcut on the desktop. The shortcut opens `MACHINE.bat`: pick a
machine, pick a job, answer the questions.

| Tool | What |
|---|---|
| `machine.py` | info, clock, users, punch log, backup, add / edit / delete a user, enroll a finger, restore, open the door, restart |
| `push_users.py` | every active Employee with an Attendance Device ID, as a user on the machine |
| `employee_tools.py` | `list`: every user on the machine beside the Employee their number belongs to, flagging whose punches are refused. `create`: a new Employee on the site and the same number on the machine |
| `machine_menu.py` | the numbered menu over both |

- **Nothing is written without `--apply`.** The menu runs every change once
  without it, shows the result, and runs it for real only when somebody types
  `YES`.
- **Edit, delete and restore take a backup first**, fingerprints included, into
  `machine-backups`. The installer locks that folder to administrators, and
  `package.ps1` refuses to zip it: a backup holds every template and keypad
  password on the machine.
- **Restore adds only who the machine lacks**, and refuses templates from a
  different fingerprint algorithm. It is how a replacement machine gets
  everybody's finger without anybody walking to it.
- **There is no command to clear the log, wipe the machine, power it off or
  disable it**, and `tests/test_machine_tools.py` fails if one appears.
- It runs as administrator because `bridge.env` is locked. Connecting while
  the bridge is mid-pass can fail on firmware that takes one connection at a
  time; wait a minute and try again.

## Machines that push (ADMS, "Cloud Server")

For a machine with no PC beside it. The machine opens an HTTP connection out to
a bridge and posts each punch as it happens; nothing has to reach the machine.
`adms.py` is the server. It was built on the `incoming` branch and carried back
into this code on 15 September 2026 — before that, `main.py` here never started
it, and `test_adms.py` failed for exactly that reason.

**On the bridge that receives:**

```toml
[adms]
enabled = true
port = 8081

[[device]]
name   = "BIO-CGKK211162173"
serial = "CGKK211162173"     # Menu > System Info on the machine; no host
```

A `[[device]]` with a serial and no host turns the server on by itself. The
Windows installer opens the port in the firewall when the config listens.
`python -m mannabridge.main --status` says what has arrived and from which serial.

**On the machine:** Comm > Cloud Server Setting — server address and port of
that bridge, proxy off. The log line to look for is `said hello`.

**Three things decide whether it works, and none is code:**

- **The machine has to reach the bridge.** On the same LAN that is an address.
  From another site it is a public address: a port forwarded on the office router
  to a PC with a fixed LAN address, a tunnel, or a small server with its own
  public IP. The bridge PC must stay on — a laptop on Wi-Fi is not a server.
- **The endpoint has no password.** The protocol has none. Only serials in the
  config are delivered (an unknown one is parked under `SN:<serial>`, never
  sent), but a serial is printed on the machine's label. Where the plant's
  public IP is fixed, allow only that address on the port.
- **A first push is the machine's whole memory.** Setup seeds the same start
  cursor it seeds for a machine that is read, and the server takes and does not
  queue anything older. A push-only device added by hand has no cursor and will
  send everything; seed one with `--from`.

`report_direction` means the same thing on both routes: off unless somebody
has checked the machine. Every Manna Rubber Products shift pairs strictly on
log type, so that gate has it on — in its config and in `known_machines.toml`.

## Running it by hand

```bash
cd bridge
python -m venv .venv && . .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp config.example.toml config.toml              # then fill it in
python -m mannabridge.main --once               # one pass, to see it work
python -m mannabridge.main                      # the real thing
```

`--once` is the command to run when somebody says attendance is missing. It
does a full pass and prints exactly what it read, sent and failed.

### As a service

Do not leave it in a terminal. On Windows, a Scheduled Task set to **run
whether the user is logged on or not**; on Linux, a systemd unit with
`Restart=always`. A bridge that only runs while somebody is logged in will be
found switched off in March, with a month of attendance behind it.

---

## Configuration that matters

**`name` becomes `Employee Checkin.device_id`.** Two consequences:

- It must be unique across every site. Two machines sharing a name make the
  site's silence alarm useless, because one live device masks the other's death.
- It must start with the trusted prefix in `Manna HR Settings` — `BIO-` by
  default. A punch whose device id does not is treated as a *mobile* punch, and
  will be geofenced and refused, because no fingerprint machine sends a
  coordinate.

**`password`** is the device's comm key, not anyone's password. Usually 0.

---

## The failure everybody hits first

`no employee found` on every punch means `Employee.attendance_device_id` is not
set. That field is the only link between a fingerprint template and a person —
the machine knows user `104`, ERPNext knows `HR-EMP-00042`, and nothing else
joins them.

The bridge treats this as permanent rather than transient: it does not retry,
because retrying cannot fix master data, and burning attempts on it hides real
network failures behind the noise. The punches stay in the queue, undelivered
and visible. Fix the field and they go on the next pass.

---

## Before any of this can be built for real

Three things are needed per location, and none of them can be guessed:

- **Make and model of each machine.** It has to speak ZK. ZKTeco, eSSL,
  Realtime and most Indian clones do; a cloud-only or proprietary-SDK device
  needs a different reader entirely, and that is a decision to take before
  buying rather than after.
- **IP address, port, and comm key** for each.
- **The always-on machine**, or the VPN details if one box is to serve several
  sites.

## Not yet decided

- **Pairing mode.** If the machines are configured not to send a direction —
  which is common — the shift has to alternate IN/OUT, and one extra punch
  (somebody stepping out for tea and back) silently reverses the pairing for
  the rest of that day. See [../docs/SCHEMA.md](../docs/SCHEMA.md) §4.
- **Clock drift.** These machines keep their own time and drift by minutes a
  month. Nothing here corrects it yet, and a device running eight minutes fast
  makes everybody at that gate late.
