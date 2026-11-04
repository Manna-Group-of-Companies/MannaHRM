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
| `client/src/lib/write.js` | What the dashboard may create, change and delete — and the six doctypes it never writes |
| `client/src/features/records/` | One form and one list, for every doctype this app installs |
| `client/worker/` | The Cloudflare Worker: the bundle, and the site behind the same hostname. A pipe, never a rule |
| `manna_hr/rules.py` | Pure rules — no `frappe` import. Testable without a bench. |
| `manna_hr/manna_hr/doctype/` | The schema **and** its controllers. 24 doctypes; `client/scripts/schema.mjs` generates the client's copy from these |
| `manna_hr/loans.py` | Staff loans — the parts that need a site. The arithmetic is in `rules.py` |
| `tools/export_from_site.py` | The site's doctype definitions, back into the repo's JSON layout |
| `tools/check_schema.py` | What the code assumes, checked against the live site |
| `manna_hr/permissions.py` | Who sees whose corrections and letters. The row-level half of the security model |
| `manna_hr/workflow.py` | The approval workflow, as data. Installed from code, not a fixture |
| `manna_hr/letters.py` | The letter merge, ported from `client/src/lib/letter.js` |
| `manna_hr/geo.py` | Distance arithmetic, ported from the sales app's `proximity.dart` |
| `manna_hr/checkin.py` | The punch validation. The backstop. |
| `manna_hr/machinecmd.py` | What a web page may ask a fingerprint machine to do. A closed list, checked here and again in `bridge/mannabridge/commands.py` — the two copies are pinned together by a test |
| `manna_hr/freeze.py` | Submit Attendance's month freeze — what a submitted `Attendance Submission` refuses |
| `bridge/` | The on-premise agent. Reads the fingerprint machines, and listens for the ones that push (`--adms`) |
| `bridge/mannabridge/roster.py` | Who is enrolled on each machine, sent as `Attendance Device User`. Kept apart from punches: nothing in it may cost a pass of them |
| `bridge/mannabridge/rota.py` | Day or night from the punch-in: an evening IN gives a 12-hour worker the night shift before the punch is sent. Belongs in `manna_hr/` once installed; pure halves so it moves unchanged |
| `bridge/mannabridge/autoenrol.py` | An Employee for a device user no record carries, on a machine with a `company` in `config.toml`: placeholder gender and birth date, `custom_needs_details` ticked. Belongs in `manna_hr/` once installed — see `docs/NEW_EMPLOYEE.md` |
| `bridge/mannabridge/commands.py` | `Machine Command`: what the dashboard asked a machine to do, done at the machine and answered. Kept apart from punches, like the roster |
| `bridge/console.py`, `console.html` | The gate PC's console, on `127.0.0.1` only: machines, who is on them, the punch log, attendance, and a new employee on the site and the machine at once. Calls the tools below rather than repeating their rules |
| `bridge/machine.py`, `push_users.py`, `employee_tools.py` | The only code that writes to a machine: run by hand from the Machine Tools menu, dry run first, never the log. `employee_tools.py create` also writes the Employee, site first |
| `bridge/INSTALL.bat`, `install.sh` | Put a bridge on a new PC: Python, the key, the machines, a service. `package.ps1` builds the zip that carries it — never zip the folder, it holds a key |
| `app/` | Manna HR, the one phone app (21 October 2026: the admin app merged into it). An employee gets punch, month, leave, payslip; an HR login also gets everybody's day, employees, leave requests and reports, which only read — see `app/README.md` |
| `desktop/` | Manna Attendance, the gate PC's Windows program (Flutter): eSSL's screens, each one a question to `bridge/console.py`, which holds the rules. Ships in the bridge's zip as `app\` — see `desktop/README.md` |
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
python -m pytest manna_hr/tests -q        # 579 tests, no bench needed
python tools/check_schema.py              # the site, against what the code assumes
cd client && npm test                     # 2,675 tests, jsdom
cd client && npm run contrast             # both palettes, every pairing, AA
cd client && npm run shots                # the app in a real browser, light and dark
cd app && flutter test                    # 118 tests, no site and no handset
cd desktop && flutter test                # 21 tests, no console, no machine, no site
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
Brand-coloured *text* is `accent`; `brand-dark` is a button fill and fails
contrast as text on a dark card.

**Motion is arrival, never a gate** (6 October 2026). Pages, menus, dialogs,
cards and chart marks animate *from* something into where they already are,
so the reduced-motion block at the foot of `index.css` leaves every element
in place. A page change is animated with `element.animate` in `PageOutlet`,
never a React `key`, which would remount the page and throw its state away.

**The rail is the navigation on a desktop.** The open module's pages are listed
under its link (`pagesOf` in `layout/Sidebar.jsx`) and the strip over the page
is hidden while the rail is open; Ctrl+K (`layout/GoTo.jsx`) goes to any page
by name. All three read `tabsFor` and `isHidden`, so they cannot disagree —
`tests/goto.test.jsx` holds them to it. Custom form fields are one block of
rules in `index.css` ("fields"), not a component: every screen's own inputs
get them without being touched.

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

**Refuse an `Attendance` write with a `DuplicateAttendanceError`, or not at all.**
hrms's shift job marks absentees through `mark_attendance`, which catches that
and `OverlappingShiftAttendanceError` and nothing else; any other exception ends
the run for every shift after it, group-wide. The month freeze raises
`FrozenMonthError`, a subclass, for exactly this reason — see
`manna_hr/freeze.py`, and the test that pins its base class.

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
- **Submit Attendance is built and waits on the install.** `Attendance
  Submission` (11 September 2026) is the monthly close: Add submits a company's
  month, Preview Data reads it first, Reopen cancels it. The freeze behind it is
  `manna_hr/freeze.py`, and it exists only once the app is installed — the
  doctype is not on the site, and must never be made there by hand as a custom
  one, which would submit and freeze nothing. Until then the page says so and
  the site refuses Add. What it freezes beside the rows is counts by status, not
  yet Factor HR's LOP and late/early breakdown, which needs the policy engine.
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
- **Device clock drift is measured and reported, and nothing sets a clock.**
  BIO-MRP-GATE1 was found 7m43s slow on 19 September 2026, three years in, so
  every arrival there is written earlier than it happened and no late is late.
  The drift is on the console's Machines screen and in `machine.py time`.
  **`[bridge] fix_clocks` is off by default, asked for by IT the same day**: a
  gate's clock is somebody's decision — eSSL syncs some of them, one gate is
  deliberately kept behind — and a bridge correcting that would move everybody's
  arrival on a morning nobody chose. Turning it on is `bridge/mannabridge/clock.py`,
  and note what it does beyond setting the clock: **a backward correction moves
  that machine's cursor back with it**, because the bridge reads what is newer
  than the cursor and the machine is about to reuse those timestamps —
  re-sending a punch is free, losing one is somebody's day. A drift beyond six
  hours is refused and logged either way.
- **Salary increments** (asked for 5 October 2026): Payroll → Increments takes
  HR's January Excel sheet — downloaded pre-filled with everybody's current
  base, one of New Base / Increment Amount / Increment % filled per person —
  previews every row, and on Apply makes each increment a new submitted
  **Salary Structure Assignment** on the same structure from the effective
  date (default 1 January). The old assignment is not touched; it is what pays
  the months before. Every row says up or down; **a decrease is applied only
  when HR ticks for it**. An unknown code, two columns that disagree and a row
  already applied are each said and never written; re-uploading the same sheet
  applies only what is left. After Apply each row is read back from the site
  (`verifyLine`), and panel 3 lists every salary starting on the effective date
  against the one before it (`changesOn`) — the check that works any day. The
  employee import reads each saved person back by Emp Code the same way
  (`verifyRow`) and names any field the site holds differently. `client/src/lib/increments.js`. On 5 October
  2026 the site held **no** Salary Structure Assignment at all, so the sheet is
  empty until Salary Setup has given people a salary.
- **Salary upload** (9 October 2026): Payroll → Salary Setup → Upload salaries
  takes one sheet — Emp Code, Actual Salary, Bank ₹ / Cash ₹ (or Bank %),
  PF %, ESI % — and the **PF and ESI rates choose the structure**: one per
  company per pair, named `Salary PF 12 ESI 0.75 - <Company>`, Basic 100% of
  base, PF and ESI a % of base, made and submitted on Save (with any missing
  Basic / Provident Fund / Employee State Insurance component). Each new person
  gets a Salary Structure Assignment at their actual salary. The bank and cash
  split goes on the Employee (`salary_mode`, `custom_bank_percent`,
  `custom_bank_amount` — the last two in `install.py`, **not on the site until
  `tools/create_custom_fields.py --apply`**). The split is how the net is
  handed over and nothing else: **PF and ESI are on the whole salary, and there
  is deliberately no way to work them out on the bank part.** The split is of
  the *salary* (HR, 13 October 2026): ₹29,000 = ₹21,000 bank + ₹8,000 cash
  pays ₹8,000 cash on a full month, cut for days not worked, and PF, ESI and
  every other deduction come out of the bank part (`writePaymentSplit` in
  `lib/registerxlsx.js`). **EPF is one of
  two calculations, chosen once per company** (HR, 10 October 2026):
  Calculation 1, Basic + DA = 100% of the salary; Calculation 2, Basic + DA =
  50% (the other half a Special Allowance) — EPF 12% of that, on ₹25,000 when
  it is more. The choice is in the structure names (`Salary Basic 50 PF 12 …`
  for Calculation 2), so a company with structures shows its own and cannot be
  given the other (`companyMethod`); the 5-tab preview's EPF wages follow the
  person's structure. **It is asked only when the 5-tab Excel is downloaded**
  (HR, 13 October 2026) — the upload no longer asks, and a company with no
  structures yet gets Calculation 1. ESI stops above ₹21,000. **The actual
  salary is its own doctype** (14 October 2026), `Employee Actual Salary` —
  one row per person per From Date, on Payroll → Actual Salary, which also
  takes HR's Excel sheet (`lib/actualsalary.js`: matched by code, previewed,
  confirmed, read back) — and nothing in payroll reads it. Payroll is the Salary Structure Assignment: Base is
  what the slip pays and PF and ESI are on, and `custom_cash_amount` beside it
  is the cash part, shown and not paid on. The 5-tab's Cash-1 and Diff Cash
  show it as the cash beside a net that all goes by bank, cut for days not
  worked like the salary (`cashPay` in `lib/registerxlsx.js`). Each row carries
  the person's latest `Employee Actual Salary` by the month's end
  (`withActualSalary`); where there is one, **Net Payable After Round up on
  Diff Cash (only) is that actual salary** — no separate column — (cut for days not worked), the payroll net is Paid by Bank, and
  cash is the rest — bank and cash add up to the actual salary. **The 5-tab carries only
  people with a salary structure assigned** by the month's end
  (`assignedOnly`), and says how many it left out. Somebody who already has a salary keeps it —
  Increments changes pay. Matching is by code only; every saved row is read
  back. `client/src/lib/salaryupload.js`.
- **Employee import** (same day): Employee Master → Add New Employee ▾ → File
  Import now opens `/employees/upload` here instead of ERPNext's Data Import.
  The sheet's columns are Create Employee's own (`NEW_EMP_STEPS`, pinned by a
  test); rows match on Emp Code — a code on file is patched with only what
  differs, a new code is created with the wizard's required fields, and a
  blank cell never clears a value. Lists (Company, Department, Designation,
  Shift, Holiday List, Work Location, Status, Punch Method, Reporting Manager
  by Emp Code) must name something on the site; Settings → Security's locked
  fields are left out and said. Leave and salary are not set from it.
  `client/src/lib/employeeimport.js`.
- **Recruitment** (12 October 2026) is on the hierarchy chart, not a page of
  its own (asked for): Employees → Hierarchy Chart → a company puts a
  **Resumes** button on every open seat — a head-office seat nobody is on, a
  seat somebody Left in the last 180 days, and under anybody serving notice
  (resignation or relieving date on their record). Which seats are open, and
  the `Job Opening` each is recruited under (found by a title that names the
  seat, made on first use), is `client/src/lib/vacancy.js`; a seat drops off
  the chart when HR closes its opening. The panel takes resumes
  downloaded from LinkedIn and Indeed (PDF, .docx, .txt), files each as a
  `Job Applicant` on the seat's opening with the resume private in
  `resume_attachment`, and scores it **out of ten** against the position's
  criteria — must have, good to have, minimum years, qualification, location,
  worth 5 / 1 / 2 / 1.5 / 0.5 and rescaled over the ones a position sets
  (`WEIGHTS` in `client/src/lib/resumescore.js`). The score goes in hrms's own
  `applicant_rating` (score ÷ 10, so the desk shows stars), and its reasons in
  `custom_score_detail`. Name, email and phone are read off the resume and
  corrected by HR before anything is written. **It rejects nobody**: every
  applicant is created Open, and a file with no text (a scan, an old `.doc`) is
  *not scored* rather than scored zero. Where it guesses — years of experience
  above all — it guesses in the applicant's favour. The score runs in the
  browser because it is advisory and decides no pay; the site still enforces
  hrms's required fields, valid email and duplicate rule. Resumes are untrusted
  files: pdf.js runs with `isEvalSupported: false` and reads eight pages at
  most. **The criteria fields are not on the site until `python
  tools/create_custom_fields.py "Job Opening" --apply` and `"Job Applicant"
  --apply`**; until then (13 October 2026) the criteria are kept as a comment
  on the Job Opening, headed "Resume scoring criteria", the latest one read
  back (`readCriteriaNote`), so scoring works without them — only the
  breakdown is not stored, and is shown for the visit after Rescore.
- **HR draws the company chart** (14 October 2026): Employees → Hierarchy
  Chart → a company → **Edit chart** starts from the chart as drawn and lets
  HR drag cards anywhere (snapped to an 8 px grid, arrow keys too), add an
  employee, a vacant seat (with its Resumes button) or a title, remove a card,
  and set whom each card reports to — the lines follow. Saved, it *is* that
  company's chart; **Remove drawn chart** brings the automatic one back. A
  person card names an Employee record, so somebody who leaves is drawn as the
  seat they vacated. Rules in `client/src/lib/orgchart.js`, canvas in
  `features/employees/DrawnChart.jsx`. Kept in `Company.custom_org_chart`
  (`install.py`, **not on the site until `tools/create_custom_fields.py
  Company --apply`**); until then, and for a login that may not write a
  Company, as a comment on the Company headed "Org chart", latest wins
  (`api/orgchart.js`). Each save adds a comment there.
- **Payroll and shift rosters are untouched** — attendance first. Leave is one
  write: Apply Leave raises a Leave Application as an **Open draft**
  (`client/src/features/leave/raise.js`), and approving and submitting stay
  with the approver. **Casual Leave is one a month, carried forward** (HR, 24
  September 2026), **and only for office staff, supervisors and drivers** (HR,
  2 October 2026) — judged by designation in `leavepolicy.casual_leave_group`,
  refused at submit by `manna_hr/casualleave.py`. A new office designation gets
  nothing until it is added to `OFFICE_DESIGNATIONS`; the tool lists who it
  passed over. It is hrms Earned Leave, defined in `manna_hr/leavepolicy.py` and
  put on the site by `tools/setup_monthly_leave.py` — or by **Give monthly
  leave** on Apply Leave, the same steps as the signed-in HR user
  (`client/src/api/monthlyleave.js`; its values are pinned to the Python by
  `client/tests/leave.test.js`). Either one assigns from the current month,
  never retroactively. That button is why `Leave Policy` and `Leave Policy
  Assignment` are on `apiCreateSubmitted`'s short list: a draft of either gives
  nobody any leave. Factor HR's opening balances are not
  loaded yet. The site refuses an application with no Leave Allocation behind
  it, so until the tool has run, that is every Casual Leave application.
  **Both automatic leave rules below are switched off** (HR, 14 October
  2026): `AUTO_LEAVE_RULES = False` in `manna_hr/absencerule.py`, its copy in
  `client/src/lib/absencerule.js` pinned to it by a test. Off, the dashboard's
  half-hourly run, Apply Leave's run on opening somebody, a correction's
  hand-on to the next absence and the site's hourly job all do nothing; a
  corrected day still gives back the automatic leave made for it earlier.
  Leave the rules already wrote stands on the site. Setting both to true
  brings everything described here back.
  **The absence rule** (HR, 3 October 2026) runs by itself: the first
  Absent day in a month becomes an approved, submitted Casual
  Leave Application whose description starts `absencerule.AUTO_MARK`; later
  absences stay Absent, which is the salary cut **only because Payroll
  Settings are based on Attendance** — hrms's default, `Leave`, pays every
  Absent day, and the site was on it until 6 October 2026. The value is
  `payrollsetup.PAYROLL_SETTINGS`; `tools/setup_payroll.py` reports drift and
  `--apply` resets it. A slip puts the cut in `absent_days`, not
  `leave_without_pay`, so every LWP figure on the dashboard reads
  `lossOfPay` (`lib/payroll.js`), which adds both; a regularized day (one
  holding a `REG-` punch) gives its leave back and the next absence takes it.
  Everybody who earns Casual Leave — office staff, supervisors and drivers
  (widened from office only on 6 October 2026; the mark still says "Office",
  because it is how the rule knows applications it already made) — and nothing
  before **1 September 2026** (HR moved it back from 1 October on 6 October).
  September's leave comes from one-month allocations
  `tools/backfill_casual_leave.py` makes, since most people's Casual Leave
  starts in October; they carry no `leave_policy_assignment`, which is how
  Sunday leave (`sundayleave.counts`) knows not to take one for a first. The factory floor earns none, so every absence there
  is a cut. Apply Leave's calendar draws the rule's leave as **CL** and an
  Absent day as **A** — only what the site holds, never a prediction. Opening
  somebody whose month still has a first absence the rule has not reached runs
  the rule for that person there and then (`firstAbsence`, the rule's own
  `plan`; `settleFirstAbsence`), so it reads **CL** without waiting half an hour. Pure rule in `manna_hr/absencerule.py`; on the site,
  `absencerule_site.run` hourly and `regularization.apply`, once installed.
  Until then the dashboard is what runs it: `client/src/api/absencerule.js`
  starts on any HR sign-in, repeats every half hour, and runs again after a
  correction is written (`writeCorrection`). So today it runs only while
  somebody from HR has the dashboard open. It cancels only applications
  carrying its mark — never leave somebody asked for. No Casual Leave balance
  means the site refuses it and the day stays Absent — and on 3 October 2026
  only 4 of the 26 office staff held any Casual Leave allocation, so until
  Give monthly leave has been run that is nearly everybody. The application
  names a leave approver (own, else manager's login, else whoever runs the
  rule) because this site's HR Settings make one mandatory.
  **Sunday leave** (HR, 3 October 2026) runs with it and before it: each
  Sunday an office employee works adds a day of Casual Leave. Worked means
  the Sunday's Attendance when there is one (Present 1, Half Day ½), else an
  in and an out punch — there is none, because no Shift Type here marks
  attendance on holidays. It is **one hrms Leave Adjustment per Casual Leave
  allocation** holding the total, cancelled and amended as Sundays add up,
  reason starting `sundayleave.AUTO_MARK`. Not a Compensatory Leave Request
  (needs holiday Attendance and a Leave Period, neither of which this site
  has) and not `allocate_leaves_manually` (the earned-leave cap of twelve
  would take it back out of December). Pure rule in `manna_hr/sundayleave.py`,
  hourly `sundayleave_site.run` once installed, `client/src/api/sundayleave.js`
  until then, both started by `client/src/api/leaverules.js`. No allocation, no
  Sunday leave: it waits for Give monthly leave like the absence rule does.
  Sundays count from **1 September 2026**, as the absence rule now does, and
  a person's *first* Casual Leave allocation also takes the Sundays before it,
  because most allocations start 1 October. Apply Leave's calendar marks a
  Sunday "+1 CL" from the adjustment's own reason (`credited`), never from a
  prediction. First written on the live site 3 October 2026: HR-LAD-2026-00001,
  Saji Kumar, 20 and 27 September.
  **After the adversarial review the same day**: a Sunday's weekly off is
  read off the Holiday List Assignment in force *on that Sunday*
  (`sundayleave.list_on`), never `Employee.holiday_list` or
  `Company.default_holiday_list`, which hrms 16 does not read — lists run April
  to March and allocations January to December, and reading today's list
  would take January's Sundays back in April. The reach-back is only for a
  first allocation starting by 1 October 2026 (`BACKFILL_UNTIL`). On the site
  the two rules are **one hourly job**, `leaverules_site.run`, because Frappe
  shuffles separate hourly jobs and runs them at once. The absence rule asks
  hrms's `get_leave_balance_on` before writing, passes a day hrms refuses for
  its own reason to the next absence, and gives a corrected day's leave back
  *before* the correction's punches are written (`giveBack`, as
  `regularization.apply` does). `freeze.guard_leave` judges a cancel by the
  stored status — hrms sets `Cancelled` before the hook runs. The dashboard
  runs the rules one tab at a time (Web Locks), shows what they could not do
  on Apply Leave, and **does not run them from `npm run dev`** unless
  `VITE_LEAVE_RULES=on`. Two known limits: a January carry-forward allocation
  makes hrms refuse December leave written after it, so December's rules must
  settle before Give monthly leave runs in January; and any Leave Adjustment
  HR makes on a Casual Leave allocation (Factor HR opening balances, say)
  blocks Sunday leave on it, because hrms allows one — load opening balances
  through the allocation instead.
