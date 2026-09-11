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

[docs/NEW_EMPLOYEE.md](docs/NEW_EMPLOYEE.md) is what has to happen when somebody
is enrolled on a fingerprint machine. Putting a finger on it is half the job;
without `Employee.attendance_device_id` every punch that person makes is
dropped, and nobody notices until the month's pay is wrong.

[docs/SITE_SURVEY.md](docs/SITE_SURVEY.md) is what the live site actually holds,
read on 22 August 2026. Trust it over anything inferred from the sales repo.

[docs/FACTOHR.md](docs/FACTOHR.md) is what we are replacing and what it costs to
match. **Their whole menu was read off the tenant on 8 September 2026 — 160
items, of which 41 open a page here.** It is in `client/src/data/factohr.js`,
drawn on every module's All tab, and counted on Settings → Module coverage;
[docs/FACTOHR_SCREENS.md](docs/FACTOHR_SCREENS.md) §7 says what it turned up.
Read that before estimating anything, because every estimate made before it
was measured against the handful of menus somebody had screenshotted. About 70%
of Factor HR is stock Frappe HR, and essentially all of the remaining 30% is one
attendance policy engine that decides what people are paid — it is one line on
their Attendance menu, `Manage Attendance Policy`, and it is the largest single
item on this project.

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
| `client/src/lib/write.js` | What the dashboard may create, change and delete — and the five doctypes it never writes |
| `client/src/features/records/` | One form and one list, for every doctype this app installs |
| `client/worker/` | The Cloudflare Worker: the bundle, and the site behind the same hostname. A pipe, never a rule |
| `manna_hr/rules.py` | Pure rules — no `frappe` import. Testable without a bench. |
| `manna_hr/manna_hr/doctype/` | The schema **and** its controllers. 21 doctypes; `client/scripts/schema.mjs` generates the client's copy from these |
| `manna_hr/loans.py` | Staff loans — the parts that need a site. The arithmetic is in `rules.py` |
| `tools/export_from_site.py` | The site's doctype definitions, back into the repo's JSON layout |
| `tools/check_schema.py` | What the code assumes, checked against the live site |
| `manna_hr/permissions.py` | Who sees whose corrections and letters. The row-level half of the security model |
| `manna_hr/workflow.py` | The approval workflow, as data. Installed from code, not a fixture |
| `manna_hr/letters.py` | The letter merge, ported from `client/src/lib/letter.js` |
| `manna_hr/geo.py` | Distance arithmetic, ported from the sales app's `proximity.dart` |
| `manna_hr/checkin.py` | The punch validation. The backstop. |
| `bridge/` | The on-premise agent. Reads the fingerprint machines, and listens for the ones that push (`--adms`) |
| `app/` | The phone app. Punch in, punch out, the month, and the correction — see `app/README.md` |
| `docs/` | Runbook, schema, migration, open questions |

The repo root **is** the Frappe app root, so `bench get-app` works against it
directly. `app/`, `bridge/` and `docs/` ride along; the bench ignores them.

```bash
bench get-app manna_hr https://github.com/Manna-Group-of-Companies/MannaHRM
```

The explicit `manna_hr` argument matters — without it bench clones into
`apps/MannaHRM` and then cannot find a package by that name.

---

## 3. Tests

```bash
python -m pytest manna_hr/tests -q        # 536 tests, no bench needed
python tools/check_schema.py              # the site, against what the code assumes
cd client && npm test                     # 2,635 tests, jsdom
cd client && npm run contrast             # both palettes, every pairing, AA
cd client && npm run shots                # the app in a real browser, light and dark
cd app && flutter test                    # 50 tests, no site and no handset
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
in, against a stubbed site, at three widths **and in both palettes**, and fails
if a page throws, the document scrolls sideways, or the palette resolves to
something other than itself. That last check is not theoretical — `:root` and an
attribute selector have the same specificity, so a block declared in the wrong
order silently wins, and this app once ran for a week painted by the palette
underneath the one the picker was ticking. jsdom has no layout engine, so a rail overlapping the page and a token
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

**Light and dark are one file of numbers.** Every rule in `client/src/styles/`
names a role — `bg-card`, `text-ink-3` — and never a colour, which is what makes
a second palette forty lines in `themes.css` instead of a rewrite. Adding one is
a block after `:root`, and source order is the whole cascade there. `lib/mode.js`
owns the preference; nothing else touches `localStorage` or the attribute.

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
last copy of a punch that failed to deliver. The ADMS server has its own version
of the same trap — `CLEAR LOG` down `/iclock/getrequest` — and answers `OK` and
nothing else, forever.

**On ADMS, an answer other than `OK` means "send those again".** So the queue
write decides the reply and not the other way round. A server that acknowledges
a post and then fails to store it has destroyed the last copy of those punches,
which is `clear_attendance()` again wearing a different hat. See
`bridge/mannabridge/adms.py`.

**A ZK machine that was never set up for in/out reports `0` on every punch**,
which is the same value as a genuine check-in and reads as a day on which
nobody ever left. There is no way to tell the two apart from the data, so
`report_direction` in `config.toml` is off by default and both routes honour it.
A guessed direction is worse than none: a shift's pairing mode is right from
nothing and cannot recover from a confident lie.

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

- **The schema is in the repo again, and the site still holds it as *custom*
  doctypes.** `manna_hr/manna_hr/doctype/*/*.json` came back on 8 September 2026
  — all 21, with their controllers beside them — so a real `bench install-app`
  now installs the definitions and runs the code. `client/scripts/schema.mjs`
  reads the same files and generates `client/src/data/schema.js`, which is what
  every create-and-edit form draws from: one schema, two consumers, and
  `client/tests/schema.test.js` fails if they drift.

  **What is still open is the site.** Its 21 are `custom: 1`, and a custom
  doctype is a table and a form — the `.py` beside it is not part of it. Nothing
  on the server yet derives a loan's outstanding balance, refuses an
  over-recovery, strips the name off an anonymous survey response, or turns away
  a device whose id would make every punch off it look like a phone. §1 says a
  rule enforced only in a client is a suggestion; that rule is still suspended
  there. The fix is an install, not a commit: install the app, then delete the
  custom doctypes — a standard doctype and a custom one of the same name is a
  site that fails to migrate and the error names neither. See
  [docs/DOCTYPES.md](docs/DOCTYPES.md) §14.
- **The checks that left the test suite with the JSON are back.**
  `manna_hr/tests/test_doctypes.py` reads all 21 again, and the workflow and
  onboarding tests read the fields they name. 536 Python tests.
  `tools/check_schema.py` is still what compares the repo against the live site,
  and still needs credentials.
- **No bench tests.** Only the pure rules are covered.
- **The phone app is four screens, and the server rules behind it are not
  running yet.** `app/` was built on 9 September 2026 — Flutter, Android, the
  same dio-and-cookie shape as the field-sales app next door. It punches in and
  out (`Employee Checkin`, with a coordinate and the site's own clock), draws
  the month off `core/roster.dart`, and raises a correction on any day of it.
  What it does *not* have behind it is `manna_hr/checkin.py`: those controllers
  belong to doctypes the site still holds as `custom: 1`, so the punch window,
  the geofence and the server clock are at present only what the app does —
  which is the state §1 says a rule must never be left in. The fix is the
  install above, not a commit. `flutter test` covers the rules that can be
  argued about without a site: 50 tests, no bench and no handset. Who gets it
  is [docs/APP_USERS.md](docs/APP_USERS.md) — seventeen people, not the group.
- **No leave or payroll on the phone.** The app reads leave to colour a day and
  writes none of it.
- **The dashboard is in `client/`** and runs against the live
  site. It reads almost everything and, since 8 September 2026, **writes every
  doctype this app installs**: all fifteen record doctypes have a page with
  Factor HR's own control set on it — Add New, Search, Generate Report, and a
  per-row edit and delete — drawn from the doctype JSON by
  `client/src/features/records/`. What it will not write is in
  `client/src/lib/write.js`, and `Attendance` is the entry that list exists for.
  See its README.
- **The dashboard has two homes, and two builds.** `npm run build` is the
  site's, at `/hr`, committed into `manna_hr/public/hr/`, live with the app
  install. `npm run build:cloudflare` is Cloudflare Workers' (chosen 11
  September 2026, because the site cannot serve `/hr` until then), where
  `client/worker/index.js` forwards `/api`, `/app`, `/desk`, `/files` and
  `/private` to the site. That Worker sees every password and session cookie,
  and must stay a pipe — no rule goes in it. Mixing the builds up publishes a
  page that 404s every script. See `client/README.md`.
- **Device clock drift is not handled.** These machines drift by minutes a
  month, and a gate running eight minutes fast makes everybody there late.
- **Payroll and shift rosters are untouched** — attendance first. Leave is one
  write: Apply Leave raises a Leave Application as an **Open draft**
  (`client/src/features/leave/raise.js`), and approving and submitting stay
  with the approver. Nothing allocates leave. The site refuses an application
  with no Leave Allocation behind it, and until HR decides the entitlements
  that is every application on a counted leave type.
