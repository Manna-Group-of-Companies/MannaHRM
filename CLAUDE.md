# Working in this repo

Manna HRM — group-wide attendance and HR for the Manna companies, on the
ERPNext site at `mannarubber.m.frappe.cloud`. Replaces Factor HR.

Read [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) before starting anything.
Three things are blocking as of 22 August 2026 and none of them is code.

[docs/SITE_SURVEY.md](docs/SITE_SURVEY.md) is what the live site actually holds,
read on 22 August 2026. Trust it over anything inferred from the sales repo.

[docs/FACTOHR.md](docs/FACTOHR.md) is what we are replacing and what it costs to
match. Read it before estimating anything — about 70% of Factor HR is stock
Frappe HR, and essentially all of the remaining 30% is one attendance policy
engine that decides what people are paid.

---

## 1. The rule that everything else follows from

**Attendance is payroll.** A rule enforced only in a client is a suggestion to
anyone holding `curl`, and the consequence here is somebody's wages rather than
a wrong number on a dashboard.

So every rule lives in `manna_hr/`, on the server, on the server's clock. A
client may check the same rule to give a fast and kind error message. It is
never the thing that decides.

This is the one place this project deliberately departs from the sales system
next door, which enforces everything client-side because its plan has no Server
Scripts. That constraint is real and it is why [SETUP.md](docs/SETUP.md) §1
exists — a private bench is not a preference here.

---

## 2. Layout

| Path | What |
|---|---|
| `manna_hr/` | The Frappe app. Installed onto the site. |
| `manna_hr/rules.py` | Pure rules — no `frappe` import. Testable without a bench. |
| `manna_hr/geo.py` | Distance arithmetic, ported from the sales app's `proximity.dart` |
| `manna_hr/checkin.py` | The punch validation. The backstop. |
| `bridge/` | The on-premise agent that reads the fingerprint machines. Node. |
| `app/` | The dashboard — React + Tailwind + axios in `app/web/`, served by `app/serve.js` |
| `tools/` | One-off scripts that read the Factor HR exports. Node. |
| `docs/` | Runbook, schema, migration, open questions |

**`manna_hr/` is Python because it has to be** — it is a Frappe app, installed
into ERPNext's own runtime by `bench get-app`, and its hooks and doctype
controllers are called by Python. Everything outside it is JavaScript. That
split is not a preference; it is the one place §1's rule can actually live.

The repo root **is** the Frappe app root, so `bench get-app` works against it
directly. `bridge/` and `docs/` ride along; the bench ignores them.

```bash
bench get-app manna_hr https://github.com/Manna-Group-of-Companies/MannaHRM
```

The explicit `manna_hr` argument matters — without it bench clones into
`apps/MannaHRM` and then cannot find a package by that name.

---

## 3. Tests

```bash
python -m pytest manna_hr/tests -q        # 17 tests, no bench needed
```

They cover `rules.py` and `geo.py` only, and that is the point: anything that
can be a pure function should be one, so the rule can be argued about without a
site. Anything needing `frappe` gets a bench test later.

**Tests state the rule in their name.** `test_a_punch_beats_an_approved_leave_record`,
not `test_status_1`. When one fails at midnight, the name is what tells the
reader what was supposed to be true.

---

## 4. Conventions

Carried over from the sales repo, where they were earned.

**Comments say why, never what.** The code says what it does. A comment earns
its place by recording a decision, a constraint, or a trap — usually one a
future reader would otherwise undo.

**Errors round in the safe direction, and the comment says which way.** The
bias throughout this project is that *refusing somebody who did turn up is the
expensive mistake*: it costs a person their day's pay and an argument with HR,
while letting a doubtful punch through costs a flag on a report a human reads.
So a punch that cannot be judged is recorded and marked, never refused.

**Tabs, not spaces**, in Python — Frappe's house style, so a file moved between
this app and hrms does not reformat wholesale in the diff.

---

## 5. Traps

Every one of these is either already paid for next door, or is a known sharp
edge in hrms.

**Never write `Attendance` directly.** It is generated from `Employee Checkin`
by the shift job. A hand-written row is invisible to the thing that would have
created it, and the two disagree the moment anything is reprocessed. Corrections
write the missing *punch* — see `regularization.py`.

**`hrms.mark_attendance` returns quietly when a row already exists.** So a day
already marked Absent silently swallows a correction: the checkins land, the job
runs, the day stays Absent. `_clear_generated_attendance` cancels the old row
first. Do not remove it.

**The bridge must never clear a device's log.** `node-zklib` offers
`clearAttendanceLog()` and every tutorial calls it. The device's memory is the
last copy of a punch that failed to deliver.

**A `device_id` that does not start with the trusted prefix is treated as a
mobile punch** — geofenced, and refused, because no fingerprint machine sends a
coordinate. Renaming a device in `bridge/config.toml` breaks its punches.

**Frappe replaces rather than merges permissions.** The moment one
`Custom DocPerm` row exists for a doctype, the standard rows stop applying. If
you add one, copy all the standard rows across in the same transaction.

**Per-company scoping is a User Permission on `Company`, not a role.** An
`HR User` with no Company permission sees every company. The default is open,
so an omission is a leak rather than a lockout, and it will not announce itself.

**Night shifts crossing midnight belong to the day they started.** Get the Shift
Type window wrong and a night worker is marked absent two days running. Test it
with real punches before anyone is paid from it.

---

## 6. The sales repo next door

`C:\SALES_DASHBOARD` — Flutter app plus React dashboard against the same site,
with an attendance system built on custom `Attendance Log` / `Attendance
Regularization` doctypes keyed to `Sales Person`. Frappe HR is not installed
there and `Employee` holds one disabled test row.

Worth reading before changing a rule here, because most of these rules came from
there and the reasoning is in its comments:

| File | What it holds |
|---|---|
| `client/src/domain/attendance.ts` | `rosterFor` — the status priority order, ported into `rules.py` |
| `app/lib/core/proximity.dart` | haversine and bounding boxes, ported into `geo.py` |
| `app/server/attendance_log_time_rules.py` | the server-clock argument |
| `app/CLAUDE.md` §4 | ERPNext landmines, all still true |

**Its data model was deliberately not carried over.** It is right for 40 reps
and wrong for a group with factory workers — it would mean hand-writing shifts,
holiday lists, leave ledgers and payroll that hrms already has. Whether the
existing `Attendance Log` history should be migrated is still open.

---

## 7. Known-incomplete

- **Nothing has been applied to the live site.** Everything here is a scaffold.
- **No bench tests.** Only the pure rules are covered.
- **No phone app and no dashboard yet.** The dashboard is mostly a repoint of
  `SALES_DASHBOARD/client/src/features/hr/`.
- **Device clock drift is not handled.** These machines drift by minutes a
  month, and a gate running eight minutes fast makes everybody there late.
- **Leave, payroll and shift rosters are untouched** — attendance first.
