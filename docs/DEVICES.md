# Fingerprint machines

Read live with `node bridge/probe.js <ip>`. Everything here came off the
devices themselves, not from a datasheet.

---

## Machine 1 — Manna Rubber Products

| | |
|---|---|
| Brand / model | **Identix K90+ID** |
| IP | `192.168.1.40`, port `4370` |
| Comm key | none (0) |
| Serial | `CGKK211561350` |
| Firmware | Ver 6.60, Sep 2019 |
| Platform | **`ZLM60_TFT`** |
| MAC | `00:17:61:12:4d:08` |
| Enrolled users | **437** |
| Records held | **79,067**, spanning **28 Jun 2023 → today** |
| Reports IN/OUT | **Yes** |
| Device clock | **7.5 minutes behind** the office PC |

`ZLM60_TFT` is a ZKTeco platform. Identix rebadges ZK hardware, so `node-zklib` talks
to it directly and the bridge needs no special handling. **The riskiest unknown
in the whole project is closed.**

### The ID mapping is correct

Checked device enrolment against `Employee.attendance_device_id`:

| | |
|---|---|
| Enrolled on the device | 437 |
| Active in ERPNext with a device id | 139 |
| **Present in both** | **84** |
| On the device only | 353 |
| In ERPNext only | 55 |

Names agree on inspection — device `PRASEETHA IK` against ERPNext
`PRASEETHA I K`, device `Ebin Joy` against `EBIN JOY`. The codes carried over
from Factor HR are right.

**Every one of the 69 Manna Rubber Products employees with a device id is
enrolled on this machine.** Nobody at that site is missing.

The other numbers are both explainable and both worth acting on:

- **353 on the device only** — the 344 leavers were never unenrolled. Harmless
  for reading (their punches would simply be rejected), but it means the device
  cannot be used as a headcount and never could.
- **55 in ERPNext only** — enrolled on *other* machines. That is the evidence
  there are more gates to probe, and roughly how many people they cover.

The matched 84 span Manna Rubber Products, Hi-Tech Rubber Industries and Manna
Treads, so **one machine serves more than one company**. Company comes from the
Employee record, not the gate, so this needs no special handling — but it does
mean a device cannot be assumed to belong to a single company.

---

## What the punch history shows

79,067 records over three years. Two things in it change the plan.

### Punch types are recorded, and IN/OUT are balanced

| Code | Meaning | Count |
|---|---|---|
| 1 | OUT | 39,563 |
| 0 | IN | 39,453 |
| 5 | OT Out | 43 |
| 4 | OT In | 8 |

IN and OUT differ by 110 across three years — under 0.15%. **The device reports
direction reliably**, so the shift can be set to *Strictly based on Log Type*
rather than alternating. That removes the trap where one extra punch reverses
the pairing for the rest of the day.

**The OT punch types are effectively unused** — 51 records out of 79,067. So
overtime is not captured at the gate. That is consistent with the planned-
overtime workflow being a separate, manager-driven thing.

### Sunday is a working day for some people

| Date | Day | Punches |
|---|---|---|
| 22 Aug 2026 | Saturday | 110 |
| **23 Aug 2026** | **Sunday** | **48** |
| 24 Aug 2026 | Monday | 37 by 08:30 |

**48 people punched on Sunday**, on a day the Factor HR master gives all 160 as
weekly off.

This does not make the Holiday List wrong — Sunday is still the weekly off, and
that is what makes Sunday work *overtime* rather than ordinary time. But it does
mean attendance on a weekly off is a live case that has to be handled, not an
edge case. Frappe HR marks such a day with the holiday flag set; what it should
pay is a rule nobody has stated yet.

### Night shifts cross midnight — confirmed in real data

A punch-**out** at **03:08:15** on Saturday morning, and starts from **05:53**
on Monday.

So the midnight-crossing shift is not hypothetical, and the 05:00 punch window
carried over from the sales app has only seven minutes of headroom against a
05:53 start. Both need checking against the real shift definitions.

---

## Still to probe

The 55 employees with a device id not enrolled here are on other machines. Run
the same command at each site:

```bash
node bridge/probe.js               # scans the local subnet
node bridge/probe.js 192.168.1.x   # or a known address
```

The client list supplied showed three empty rows above this one, which suggests
three more machines are expected at Manna Rubber Products alone.

---

## The device is nearly full — 29 Aug 2026

Read off the machine's own counters, not from the log download:

```
userCounts: 437   logCounts: 79356   logCapacity: 80000
```

**644 punches of headroom, and this gate takes 37–110 a day.** That is about a
week. When a ZK device fills it either refuses new punches or overwrites its
oldest, and both of those are somebody's wages.

This collides head-on with the rule in CLAUDE.md §5 that the bridge must never
clear the log, because the device is the last copy of a punch that failed to
deliver. Both cannot hold once the machine is full. The way out is to get all
79,356 records into ERPNext and *verify the count on the site* before anything
is cleared — which is blocked on the ERPNext API credentials being dead.

**This is a date in the diary, not a backlog item.**

---

## Two things to fix on the device itself

1. **The clock is 7.5 minutes slow.** Nothing downstream can tell drift from
   lateness, so a slow gate quietly makes everybody there look early and a fast
   one makes them late. Set it from the device menu, and check it again monthly
   — these drift by minutes a month.
2. **437 enrolments for 76 active staff.** Unenrolling leavers is optional for
   us and good hygiene for you; a fingerprint that still opens a gate three
   years after somebody left is its own question.

---

## Reading this machine: two faults found on 29 Aug 2026

Both were in our code, not the device, and both were introduced by the
Python → JavaScript conversion (`6e6e428`, 28 Aug). The Python reader used
`pyzk`'s own decoder and was right; the JavaScript port hand-rolled one from the
`pyzk` docs and its header said plainly that it had never been run against a
real machine. It hadn't.

### The record layout, read off the machine

`pyzk`'s documented layout puts the timestamp at byte 28 and the direction at
27. **On this device both are wrong.** Verified against 4,910 records whose
timestamps are monotonic and fall inside the span the device reports:

| Offset | Field | Evidence |
|---|---|---|
| 0 | uid, 2 bytes | |
| 2 | user id, 24 bytes | matches `Employee.attendance_device_id` |
| 26 | status, 1 byte | `1` on 100% of real records — verify mode, not direction |
| **27** | **time, 4 bytes** | at 27 the log starts `2023-06-28 14:53:25`; at 28 every record decodes to the year 2000 |
| **31** | **punch, 1 byte** | splits 50.1 / 49.9 across the log; read at 27 it was the timestamp's low byte |
| 32 | padding, 8 bytes | |

The direction byte is the one that matters most: it decides whether a shift
pairs punches by log type or alternates them, and that decides a day's pay. One
night-shift worker's punches alternate cleanly at offset 31 — in 14:54, out
03:03 the next morning — which is the same rotation §"The night shift" records.

`bridge/mannabridge/device.test.js` pins all three offsets. `npm test` in
`bridge/`.

### The log download truncates, and used to do so silently

`readWithBuffer` returns short on this LAN, and it does not say so. Five reads
minutes apart returned 1,637 / 4,911 / 8,184 / 8,184 / 44,194 records against a
declared 79,356 — and the old decoder returned each of them as though it were
the whole log, because it simply took records off the front until it ran out.

A punch that never arrives is a person marked absent. `decodeRecords` now
compares the payload against the length the device declares in the first four
bytes and **refuses the read** rather than decoding part of it: `main.js`
already logs the failure, skips the device and leaves `lastSeen` untouched, so
the same records are retried on the next poll. Erring towards a retry rather
than a silent gap is CLAUDE.md §4's rule about which way to round.

**Why the download truncates is still open** — it is a full read of ~3 MB over
this network — but it can no longer corrupt attendance while it is open.

---

## The night shift, found by running the pipeline — 25 Aug 2026

Loading August's 2,214 punches and letting Frappe HR generate attendance
produced **190 records with negative working hours**, some as low as -15.8.
That is not a rounding problem. It is a shift the plan did not know about.

### The evidence

Punch-ins across August, by hour:

```
08:00   650   ############################################################
20:00   269   #########################
05:00    42
```

Punch-outs:

```
20:00   429   ############################################################
08:00   276   #######################
17:00   183   ##########################
06:00    31
```

**Two changeovers, at 08:00 and at 20:00.** At 20:00 the day shift punches out
(429) while the night shift punches in (269) — the same moment, on the same
machine.

### Everybody rotates

| | People |
|---|---|
| Evening starts only | **0** |
| Both evening and daytime | **42** |
| Daytime only | 21 |

Nobody works nights permanently. **42 of 63 rotate between the two.**

### What it means

The real structure at Manna Rubber Products is a **12-hour slot, day or night**:

- **Day** 08:30 → 20:30
- **Night** 20:30 → 08:30

and the Factor HR shift name describes the **contract**, not the slot:

- `Production8hrshift1` — 8 contracted hours, so 4 hours of the slot are overtime
- `Production12hrshift1` — 12 contracted hours, no routine overtime

That is why three years of punches could not tell the two apart: both work the
same 12-hour slot. And it is why the 05:00–07:00 "early starts" looked odd —
those are **night workers going home**, not day workers arriving.

### Two consequences

1. **A night Shift Type is needed**, crossing midnight. Without it every night
   worker's day pairs an evening punch-in against the previous morning's
   punch-out and yields negative hours — which is exactly what happened.
2. **`default_shift` is the wrong mechanism.** A rotating workforce needs
   `Shift Assignment` records, dated per person per rotation. A single default
   cannot express somebody who is on nights this fortnight and days the next.

The rota itself is the missing piece. It can be reconstructed from the punch
history — each person's actual day-or-night pattern is in the data — but the
*forward* rota is Manna's to state.
