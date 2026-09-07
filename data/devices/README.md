# Device dumps

What `bridge/dump.py` writes: everything read off one fingerprint machine, as
files, for a person to read.

```bash
python bridge/dump.py 192.168.1.40                 # everything it holds
python bridge/dump.py 192.168.1.40 --since 2026-08-01
python bridge/dump.py 192.168.1.40 --templates     # also the fingerprints
```

**The contents of this folder are gitignored and must stay that way.** A punch
file is 438 people's arrival and departure times for three years; a template
file is their fingerprints. Only this README is tracked.

Files are named `<serial>-<date>-{info.json,users.csv,punches.csv}`, so two
reads of the same machine on different days sit side by side rather than one
overwriting the other. `--since` adds `-from-<date>` to the name, so a narrowed
read cannot quietly replace the whole dump taken the same day.

**A failed read writes nothing at all.** The machine answers one bulk read at a
time and will refuse a second while it is busy; if that happens the run says so
and exits non-zero, leaving the last good dump as the last dump. An empty punch
file would read as a machine somebody had wiped, which is the one thing this
folder must never say by accident.

The dump is **read-only**. It does not clear the device's log, write a user,
set the clock, or disable the device while it reads — see the note at the top
of `bridge/dump.py`, and CLAUDE.md §5.

---

## What is on the network, as read 7 September 2026

The first machine the group has given us, and the one that unblocks the bridge.

| | |
|---|---|
| Client | Manna Rubber Products Pvt. Ltd. |
| Brand / model | Identix K90+ID |
| Address | `192.168.1.40:4370` |
| Reports itself as | `x 2008`, platform `ZLM60_TFT`, firmware `Ver 6.60 Sep 19 2019` |
| Serial | `CGKK211561350` |
| MAC | `00:17:61:12:4d:08` |
| Enrolled users | 438 — 436 users, 2 admins, every one of them named |
| Punches held | 79,250, from **13 Jul 2023** to the morning of the read |

### The four things that decide how this is configured

**It speaks the ZK protocol, and `pyzk` reads it whole.** Identix is a brand on
the case; the firmware underneath is ZK-family, which is what the bridge was
built against. Nothing in `bridge/` needs a second protocol.

**It reports direction.** Punch values in the log are `0` and `1` — check-in and
check-out — with 51 overtime punches (`4`/`5`) across three years. So the Shift
Type does **not** need alternating pairing, and somebody stepping out for tea
does not silently reverse the rest of their day. This was the open question at
the top of `bridge/probe.py`, and the answer is the good one.

| Punch | Count |
|---|---|
| check-in | 39,554 |
| check-out | 39,645 |
| overtime-in / out | 8 / 43 |

**Every one of the 79,250 is a fingerprint.** No cards, no PINs, no faces — no
user on the machine has a card number or a device password set. So a punch on
this machine is a person who was standing at it.

**The clock is 7.5 minutes behind.** Every timestamp in the punch file is the
machine's own, so all of them are 7.5 minutes early — a 09:00 arrival is
recorded 08:52. It flatters latecomers here rather than punishing them, which
is the harmless direction, but nothing downstream can tell drift from lateness
and the drift grows. CLAUDE.md §7 lists this as unhandled; this is the first
measurement of it.

### Checking the dump against the site

```bash
python tools/check_device_links.py --offline     # device side only
ERP_KEY=... ERP_SECRET=... python tools/check_device_links.py
```

Answers the question that decides whether the bridge will work at all: is
`Employee.attendance_device_id` the same number the machine calls that person?
It reports device users nobody on the site claims, employees with no machine id,
employees pointing at a user id no machine has, and one machine id held by two
people — four different problems that all look like "attendance is missing".

It writes nothing to the site or the device. Name matching across 438 rows of
`SIJU NP` and `Sunny MJ` will produce wrong links, and a wrong link pays one
person for another's attendance, so its suggestions go into a review CSV for a
person to read.

### The user list against the punch log

| | |
|---|---|
| Enrolled now | 438 |
| Enrolled and never punched | 147 |
| Enrolled and has punched | 291 |
| **In the log but no longer enrolled** | **17** |

So 308 distinct people appear in the log, 291 of whom are still on the machine.
The largest ghost has 1,075 punches across two years (Jul 2023 – Jul 2025).

Those 17 are people deleted from the machine whose punches stayed behind, which
is the device behaving correctly — but it means the enrolled list is not the
list of everybody the log can name, and a reconciliation keyed on the current
users would silently drop them.

The 147 who have never punched are the number to be curious about: some are
leavers still enrolled, some are people who were enrolled on this machine and
work at another gate. Nothing on the device says which.

---

## The link check against the site, 7 September 2026

`python tools/check_device_links.py`, against 161 employees on
`mannarubber.m.frappe.cloud`. Read-only.

| | |
|---|---|
| Employees on the site | 161 — 139 with a machine id, 22 without |
| Device users reaching a person | **84 of 438** |
| People punching at this gate | 308 · **only 71 of them reach an employee record** |

### 220 people punch at this gate and ERPNext has never heard of them

This is the finding. Not a matching problem — a missing population. The name
matcher offered a candidate for only 13 of the 354 unclaimed users, and several
of those are visibly wrong (`Raj Kumar Mishra`, `Ramesh Kumar` and `Suraj Kumar`
all matched to the same `RAJESH KUMAR S`). Exactly one looks real:
`Sunny MJ` → `SUNNY M J`.

The unclaimed are punching now, and heavily:

| Device id | Name | Punches | Last seen |
|---|---|---|---|
| 563 | Midul Handique | 1,050 | 7 Sep 2026 |
| 636 | PABAN GOGOI | 677 | 7 Sep 2026 |
| 1039 | Jageshar Oraon | 296 | 7 Jul 2026 |
| 1037 | Chaitu Barla | 285 | 16 Jun 2026 |
| 1021 | Pankaj kumar | 321 | 6 Jun 2026 |

Factor HR's employee master had 160 active people group-wide. This one machine
has 291 enrolled people who have punched. **Whoever these 220 are, they were
never in Factor HR either** — contract labour on a separate register, or a
workforce nobody has been tracking in an HR system at all. It changes the
headcount, the Frappe Cloud plan, and what payroll is being asked to cover, so
it is a question for Manna rather than a gap to fill in quietly. Until it is
answered their punches will queue undelivered forever, which is at least the
safe direction: nothing is lost, and nothing is invented.

### This machine serves two companies, and there are at least two more machines

Of the 84 employees it reaches: 69 Manna Rubber Products, 13 Hi-Tech Rubber
Industries, and one each from Treads and Tyre Retreads. The 55 employees whose
id this machine does not have are 34 Manna Treads, 16 Manna Tyre Retreads and
5 Hi-Tech — those are the gates still to be read.

### Machine ids are a per-gate number in one global field

`Employee.attendance_device_id` is a single field with no column saying *which*
machine. The other gates number their users from 1, and this one has users `1`
and `2` already, so the two id spaces overlap. Two problems follow, and both
are on the site rather than on any device:

- **`8` and `08` are two different people.** `MTR-016 Kanagabeer Peer Mohammed`
  holds `8`; `MRP-005 Manoj C Thampan` holds `08`. Same for `01` (`HPT-052
  Jineesh K M`) against this machine's user `1`, and `07` (`HPT-001 Charleys
  Joseph`). Whether these collide depends on whether the comparison is made on
  the string or the number, which is not a thing anybody should be relying on
  when the answer decides whose attendance it is.
- **The same low number will mean two people once a second gate is bridged.**
  Nothing currently distinguishes them. This has to be settled *before* the
  second machine goes live, not after punches have landed under both readings.

### Two smaller ones

- **`MRP-094 Dilip Oraon` points at user `603`, which this machine has
  deleted.** It holds 39 of his punches, the last on 3 July 2024, and he has
  been invisible to it ever since. A deleted enrolment does not announce
  itself; it looks exactly like somebody who stopped coming to work.
- **22 employees have no machine id at all** — among them `HPT-003 Shantu
  Poulose`, `HPT-050 Lijo K A`, `HPT-077 Eldho Kuriakose`. They cannot be
  matched by any machine and will read as absent every day.

Only 68 of the 161 have a `default_shift`, which is the other half of the same
problem: a punch with no shift behind it still produces no attendance.

---

### What still has to be decided

- **What this device is called.** `name` in `config.toml` becomes
  `Employee Checkin.device_id`, must be unique across every site, and must
  start with `BIO-`. `BIO-CGKK211561350` works and reads as nothing; something
  like `BIO-MRP-GATE1` says where a missing punch is missing from. Somebody who
  knows which door this machine is on has to name it.
- **Whether the three years of history come across.** 79,250 punches are on the
  machine and none of them are in ERPNext. The bridge posts what it reads, so
  pointing it at this device once would post all of them — see
  `docs/MIGRATION.md` §3, which is a decision rather than a technical question.
- **The other machines.** This is one device. The group's other locations each
  need the same three lines of the client-details table.
