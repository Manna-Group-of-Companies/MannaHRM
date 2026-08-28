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

## Running it

```bash
cd bridge
npm install                                     # node-zklib and smol-toml

cp config.example.toml config.toml              # then fill it in
node mannabridge/main.js --once                 # one pass, to see it work
node mannabridge/main.js                        # the real thing
```

Needs **Node 22.5 or newer** — the queue uses `node:sqlite`, which ships with
Node from that version. Two dependencies, both pinned: an unpinned dependency on
a box that runs unattended for years is a change nobody chose to make, applied
on whichever day it was rebuilt.

Two diagnostics sit beside it, and both are read-only:

```bash
node probe.js                    # find machines on this subnet and describe them
node probe.js 192.168.1.201      # one you already know
node check-push.js 192.168.1.201 # can it push by itself, and to where?
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

**`password`** is the device's comm key, not anyone's password. Usually 0 —
and it has to be, on this reader: `node-zklib` has no way to send one, so a
machine with a comm key set will refuse the socket. The field is still read and
carried so the config does not silently mean nothing, but if a device has a key
it must be cleared on the device or this reader replaced. The Python bridge this
replaced could send one; that is the single capability lost in the move.

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
