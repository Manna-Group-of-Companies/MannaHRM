# Working in this repo

Manna HRM — group-wide attendance and HR for the Manna companies, on the
ERPNext site at `mannarubber.m.frappe.cloud`. Replaces Factor HR.

Read [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) before starting anything.
Three things are blocking as of 22 August 2026 and none of them is code — but
one of them has since been answered: **Frappe HR is installed on the site.** The
`HR` and `Payroll` modules are there, and so are the `HR Manager`, `HR User`,
`Employee` and `Manna Attendance Approver` roles. Anything in the docs that
plans around hrms being absent is stale.

[docs/DOCTYPES.md](docs/DOCTYPES.md) is the map: every page in `client/`, the
doctype behind it, and whether that doctype is stock or ours. Read it before
adding a screen or a table — most of what looks missing is already in hrms.

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
| `client/` | The React HR dashboard. **ERPNext is its server** — see `client/README.md` |
| `manna_hr/rules.py` | Pure rules — no `frappe` import. Testable without a bench. |
| `manna_hr/manna_hr/doctype/` | Controllers only. **The schema lives on the site** — see docs/DOCTYPES.md §14 |
| `manna_hr/loans.py` | Staff loans — the parts that need a site. The arithmetic is in `rules.py` |
| `tools/export_from_site.py` | The site's doctype definitions, back into the repo's JSON layout |
| `tools/check_schema.py` | What the code assumes, checked against the live site |
| `manna_hr/permissions.py` | Who sees whose corrections and letters. The row-level half of the security model |
| `manna_hr/workflow.py` | The approval workflow, as data. Installed from code, not a fixture |
| `manna_hr/letters.py` | The letter merge, ported from `client/src/lib/letter.js` |
| `manna_hr/geo.py` | Distance arithmetic, ported from the sales app's `proximity.dart` |
| `manna_hr/checkin.py` | The punch validation. The backstop. |
| `bridge/` | The on-premise agent that reads the fingerprint machines |
| `docs/` | Runbook, schema, migration, open questions |

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
python -m pytest manna_hr/tests -q        # 134 tests, no bench needed
python tools/check_schema.py              # the site, against what the code assumes
cd client && npm test                     # 569 tests, jsdom
cd client && npm run contrast             # the palette, every pairing, AA
cd client && npm run shots                # the app in a real browser, photographed
```

The Python ones cover `rules.py`, `geo.py`, the approval workflow's tables, the
permission rule and the letter merge,
and that is the point: anything that can be a pure function or a pure value
should be one, so the rule can be argued about without a site. `workflow.py`
keeps its `import frappe` inside the two functions that touch a site for exactly
this reason. Anything needing a live `frappe` gets a bench test later.

The client's cover every page rendering twice — empty and against a small site
with gaps in it — the URL grammar round-tripping for every address, the chrome
(the rail, the header, and the two preferences that outlive a tab), the
dashboard's arithmetic, and that every input box on every screen actually
accepts typing. That last one exists
because a controlled React input with no working `onChange` looks live, takes
the caret, and silently discards every keystroke; nobody reports it as a bug,
they report that the form did not save.

`npm run shots` is the one that needs a browser: it renders every module signed
in, against a stubbed site, at three widths, and fails if a page throws, the
document scrolls sideways, or the palette resolves to something other than
itself. jsdom has no layout engine, so a rail overlapping the page and a token
overridden by a stray rule both pass `npm test` and are obvious the moment
somebody looks.

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

**`Attendance Regularization` on this site is not ours.** It belongs to the
sales system next door — module Selling, keyed to `Sales Person`, nine live rows,
and using `Initiated` where this one uses `Pending Approval`. Ours is
`Employee Attendance Regularization`, under that name in the repo as well as on
the site. Writing to the short name puts an HR correction into a sales queue
nobody reads. `tools/check_schema.py` refuses a site where the short name has
drifted into our module or grown an `employee` field.

**Never write `Attendance` directly.** It is generated from `Employee Checkin`
by the shift job. A hand-written row is invisible to the thing that would have
created it, and the two disagree the moment anything is reprocessed. Corrections
write the missing *punch* — see `regularization.py`.

**`hrms.mark_attendance` returns quietly when a row already exists.** So a day
already marked Absent silently swallows a correction: the checkins land, the job
runs, the day stays Absent. `_clear_generated_attendance` cancels the old row
first. Do not remove it.

**The bridge must never clear a device's log.** `pyzk` offers
`clear_attendance()` and every tutorial calls it. The device's memory is the
last copy of a punch that failed to deliver.

**A `device_id` that does not start with the trusted prefix is treated as a
mobile punch** — geofenced, and refused, because no fingerprint machine sends a
coordinate. Renaming a device in `bridge/config.toml` breaks its punches.

**A permission that only filters lists is not a permission.** Frappe asks twice
— `permission_query_conditions` for a list and `has_permission` for one document
— and a doctype with only the first has a list that hides a row and a URL that
still opens it, which reads as private and is not. Both are in
`manna_hr/permissions.py`; add both or neither.

**An empty permission condition means *everybody*, not nobody.** Frappe reads
`""` as "no restriction". So the difference between a reader who sees nothing
and one who sees the whole group is one falsy check — which is why
`sql_condition` returns `"1 = 0"` and why there is a test named after it.

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

- **The schema is on the site as *custom* doctypes, and the repo has no copy.**
  `custom: 1` is what lets them exist without developer mode, and the price is
  that the site owns the definitions and **the controllers do not run**. Nothing
  on the server yet derives a loan's outstanding balance, refuses an
  over-recovery, strips the name off an anonymous survey response, or turns away
  a device whose id would make every punch off it look like a phone. §1 of this
  file says a rule enforced only in a client is a suggestion; that rule is
  currently suspended and it is the largest open item here.
  `python tools/export_from_site.py --apply` brings the schema back, which is
  the first step of a real install — then delete the custom doctypes, because a
  standard doctype and a custom one of the same name is a site that fails to
  migrate and the error names neither. See [docs/DOCTYPES.md](docs/DOCTYPES.md) §14.
- **Two checks left the test suite with the JSON.** The workflow's states
  against the `status` field, and the dashboard's field list against
  `Asset Assignment`. Both failures are silent on a live site.
  `tools/check_schema.py` makes them, and needs credentials.
- **No bench tests.** Only the pure rules are covered.
- **No phone app.** The dashboard is in `client/` and runs against the live
  site; it reads almost everything and writes a little — corrections, letters,
  documents, asset handovers, the category master, and an Employee's own record
  from Employee Profile. See its README.
- **Where the dashboard is served in production is undecided.** It routes on the
  path, so whatever serves it must answer every unmatched path with
  `index.html`. `npm run dev` proxies to the site; nothing else is set up.
- **Device clock drift is not handled.** These machines drift by minutes a
  month, and a gate running eight minutes fast makes everybody there late.
- **Leave, payroll and shift rosters are untouched** — attendance first.
