# Enrolling somebody new

Putting a finger on the machine is **half the job**. The other half is a record
on the site, and until both exist that person's punches arrive nowhere.

This page is the whole of what has to happen, in order, and what goes wrong at
each step if it is skipped.

---

## Why the machine alone is not enough

The machine stores a *number*, not a person. It enrols somebody as user `851`
and from then on every punch it reports says `851`, never a name that ERPNext
could match.

```
machine   "851 punched at 08:30"
site      "851 — who is that?"      →  the punch has nowhere to go
```

**`Employee.attendance_device_id` is the only link between a fingerprint and a
person.** Nothing else on either side connects them.

The bridge does not throw those punches away. It reports `no employee found`,
leaves them in its queue undelivered, and — deliberately — never retries them:
retrying cannot fix master data, and a punch that silently retried forever would
hide the problem instead of showing it. They deliver themselves the moment the
Employee record exists.

**Nobody notices this at the time.** They notice at the end of the month, when
that person is absent every day and their pay is wrong. That is the whole reason
this page exists.

---

## The three steps

### 1 · Enrol them on the machine, and write the number down

**Menu → User Mgt → User** — enrol the finger, then note the **User ID** the
machine assigned. That number is the thing the next step needs.

If it was not written down at the time, it can be read back:

```bash
python bridge/probe.py 192.168.1.40
```

### 2 · Create the Employee record on the site

Desk → **Employee → + New**. Six fields are mandatory on this site:

| Field | Note |
|---|---|
| First Name | |
| Gender | |
| Date of Birth | |
| Date of Joining | |
| Status | `Active` |
| Company | which of the six |

And two more that are not mandatory and decide whether attendance works at all:

| Field | What happens without it |
|---|---|
| **Attendance Device ID** | the number from step 1. **Blank means every punch that person makes is dropped.** |
| **Default Shift** | punches land and **never become `Attendance`** — the shift job has no window to measure them against, so the day is never generated |

The site names the record itself (`HR-EMP-00nnn`). `Employee Number` is for the
company's own code (`MRP-307`) and is worth filling in — every import matches on
it later.

### 3 · Check the punch actually arrives

Have them punch once, then look at
`https://mannarubber.m.frappe.cloud/app/employee-checkin` — or Attendance →
In Out Activities on the dashboard — within five minutes.

If it does not appear, run this on the bridge box; it says what came in and what
was refused:

```bash
python -m mannabridge.main --status
python -m mannabridge.main --once
```

---

## Somebody who does not use the machine

Some people punch on the phone app instead — seventeen of them as of
10 September 2026, listed in [APP_USERS.md](APP_USERS.md). For them step 1 does
not happen and **Attendance Device ID stays blank on purpose**. They need three
different things instead: a `User`, `Employee.user_id` pointing at it, and a
shift. See that page.

Somebody who uses **both** gets both: a device id *and* a user link. Neither
interferes with the other — the punches are told apart by `device_id`, and a
`BIO-` prefix is what marks one as coming off a machine.

---

## Several at once

For a batch, fill the Employee columns in a CSV and use **Data Import →
Employee → Insert New Records** rather than typing each one. The columns that
matter are the eight above; `data/app-users/` has a filled example of the same
shape.

Before trusting a batch, run:

```bash
python tools/check_device_links.py
```

It reads the machine's own roster against the site and reports four different
problems, of which the first is this page's subject:

- **unlinked device users** — the machine knows them, ERPNext does not. Their
  punches are refused. This is the expensive one.
- **unlinked employees** — no `attendance_device_id` at all. Invisible to every
  machine; they read as absent every day.
- **dangling links** — an employee points at a user id no machine has. Either
  the wrong number was typed, or they punch at a gate nobody has read yet.
- **ghosts in the log** — punches from a user id the machine no longer holds.

It writes a review CSV of *suggestions* and never touches the site or the
device. Name-matching across four hundred rows of `SIJU NP` and `Sunny MJ` will
produce wrong links, and a wrong link pays one person for another's attendance —
so the suggestions are for somebody to read and correct, never applied.

**As of 10 September 2026 the gap is large**: 437 users enrolled on the
Identix, 139 employees with a device id, **84 in both**. Closing it is a day's
work and it is worth doing before the first payroll runs off this data.

---

## What is still missing after all three steps

A punch is not attendance. `Attendance` rows are generated from
`Employee Checkin` by the shift job, and that needs, once, per Shift Type:

- **Enable Auto Attendance** ticked
- **Process Attendance After** set to go-live, so the first run does not walk
  three years of history

Without those the checkins pile up and no day is ever generated from them —
which looks exactly like the punches not arriving, from the far end.
