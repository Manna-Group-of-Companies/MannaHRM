# Attendance: audit against factoHR, and the plan

Written 19 November 2026 on `feature/attendance-engine`, cut from `origin/main`
at `5d8e3e3`. Read with [FACTOHR.md](FACTOHR.md), [FACTOHR_SCREENS.md](FACTOHR_SCREENS.md)
and the live-data comparison of factoHR's Daily Attendance Detail Report for
November (171 staff), made the same day.

The short version: **capture is mostly there; the policy is not.** Punches
arrive from the fingerprint machines and the phone, but nothing on the server
decides late, early, half day, missed punch, overtime or loss of pay. The
dashboard works them out in the browser on each read. hrms's shift job, the one
thing that writes `Attendance`, is running on shifts whose thresholds are all
zero. So the payroll input is "a punch means a full day". Three server bugs
then turn correct punches into wrong Absents, double the punches, or let a
phone choose its own rules.

---

## 1. Live-data problems, traced to code

| # | Seen on the live site, 19 Nov | Cause in the code | Fix (phase) |
|---|---|---|---|
| L1 | ~650 wrong Absents after `default_shift` was set for 87 people on 17 Nov | hrms gives a checkin its shift **only when the checkin is saved** (`EmployeeCheckin.fetch_shift`). A punch saved before the person had a shift is `offshift=1, shift=None` for good. The shift job skips `offshift` punches and marks the day Absent. Nothing in `manna_hr` re-fetches anything when a shift changes. | Re-process path (P0.1) |
| L2 | Night and rotating workers (HPT-012, -019, -068, -095) have one night split across two days | Two bugs. (a) `manna_hr/rota.py` `NIGHT_OF` on the **site** still names shifts retired on 8 Oct. The bridge's copy (`bridge/mannabridge/rota.py:61`) was updated; the site's was not, and since 27 Oct the site is what runs it. So no night is given to anyone on today's shift names. (b) The rule only fires on a punch keyed IN, and only a machine with `report_direction` sends a key. Hi-Tech's machines send none. | Direction-free night detection, map in one place (P0.3) |
| L3b | Hi-Tech days are Present with 0 hours, no in/out times, so no late, early, hours or OT (found by the live comparison session, 19 Nov) | Every Hi-Tech Shift Type is "Strictly based on Log Type in Employee Checkin", and the HPT machine sends no log type. hrms 16.53's `fetch_shift` would refuse a blank-keyed punch on a Strict shift, but on the live site it does not: 254 blank-keyed punches went in after 17 Nov and none of the 592 Waiting punches is held for it (checked read-only, 19 Nov). Of those 592, 536 are pins no Employee carries and 56 are HR-EMP-00440, who is Inactive. | Shift setting to "Alternating entries" (live config, needs a yes), then reprocess scope `days` (P0, added) |
| L3 | Single punch or 4 h worked counts as Present | Every Hi-Tech Shift Type has `working_hours_threshold_for_half_day = 0` and `_for_absent = 0`. hrms reads 0 as "off". No policy sets them. | Policy engine pushes thresholds (P1) |
| L4 | 1,383 of 4,345 November checkins are exact duplicates | `adms_site.handle` delivers pending punches **before** answering the machine (`adms_site.py:100`). A slow backlog makes the machine re-post, and a second `deliver_pending` runs over the same Pending rows. Both find no checkin (neither has committed) and both insert. hrms's own duplicate check is check-then-insert **and includes `log_type`** (hrms 16.53, `validate_duplicate_log`), so it does not stop them either. The bridge's urllib3 `Retry(allowed_methods=POST)` (`sink.py:74`) is a second route to the same race. | Lock + idempotent insert + clean-up tool (P0.2) |
| L5 | 24 active staff have no `attendance_device_id`; 21 factoHR people missing | Data, not code. Their punches wait in `Attendance Device Punch` as Waiting and are delivered by `on_employee_update` the moment HR fills the field. | Exceptions page lists them (P2); HR fills them |
| L6 | Only 2 Leave Applications | Leave is not synced from factoHR; the auto leave rules are off (`AUTO_LEAVE_RULES = False`). | Out of scope here; listed as open |
| L7 | No November Attendance Submission | Nobody has closed a month yet. The close also freezes only counts, not factoHR's breakdown. | Full breakdown (P2) |

## 2. Bugs found in the audit

Confirmed by reading the code; file:line on each.

| # | Bug | Where | Severity |
|---|---|---|---|
| B1 | A phone user can post `device_id` = `BIO-…`, `REG-…` or empty and be classified biometric, regularization or manual. That skips the server clock, the punch window and the geofence: any back-dated punch is accepted. | `checkin.py:74-91` `_classify_source` trusts the prefix | **High**: pay |
| B2 | The site's night map is stale (L2a); the two copies have drifted | `manna_hr/rota.py:54` vs `bridge/mannabridge/rota.py:61` | **High** |
| B3 | Duplicate punches (L4) | `adms_site.py:99-101`, `_deliver` 245-281 | **High** |
| ~~B4~~ | *Withdrawn on checking:* `Completed` **is** an option of `status` in the repo's JSON (the first read truncated the list). Whether the site's custom copy has it is for `tools/check_schema.py`. | | — |
| B5 | Missed punch-out alert is a new `Notification Log` **every ten minutes** for every open day of the last 21, per person. It also only sees punches with a `log_type`, so machine days never qualify, and a night shift reads as an open day. | `tasks.py:19-52`, cron `*/10` | Medium: spam, and blind where it matters |
| ~~B6~~ | *Withdrawn on checking:* a machine that has never pushed holding its shifts is deliberate (`adms.sync_point` docstring), and the bridge moves `last_sync_of_checkin` itself for the machines it reads. | | — |
| B7 | The phone hard-codes the 05:00-21:30 window and refuses before queuing, whatever the site says. Night punches after 21:30 cannot be made from the phone. | `app/lib/core/constants.dart:75`, `punch_screen.dart:129` | Medium |
| B8 | The phone's month reads `Still in` for every machine day (no OUT key) and splits nights by calendar date; it never reads `Attendance`, so the employee never sees Late, Half Day or Absent as payroll will | `app/lib/core/punch_rules.dart:82-95`, `roster.dart:178` | Medium |
| B9 | A phone punch that times out after the site saved it is queued with the app's estimated time, and `punchExists` (exact time) misses the saved one, so a second punch is sent | `punch_screen.dart:173`, `api.dart:446` | Low |
| B10 | The geofence writes no distance when it is off, so "a month of distances tells you the radius" never gets its month | `checkin.py:226-231` | Low |
| B11 | Sandwich leave writes `Attendance` itself rather than through the leave's own path | `leave.py:167-198` | Low (switched off) |

## 3. Scored against factoHR

0 = nothing, 1 = partial or client-only, 2 = works with gaps, 3 = equal or better.
"Rule on" says where the deciding code runs; CLAUDE.md §1 wants `server`.

| Area | factoHR | Here today | Score | Rule on |
|---|---|---|---|---|
| **Capture** | | | | |
| Biometric | ZK machines, sync | ADMS push to the site + bridge pull, de-duplicated store, waiting queue for unknown pins, device silence alerts | 2 (B3) | server |
| Mobile punch | App, geo + selfie | Flutter app, selfie, GPS, offline queue | 2 (B1, B7) | server |
| Web punch ("Online Attendance") | Yes | Refused by design | 0 | — |
| Selfie | Yes | Yes, private file, owner-checked | 3 | server |
| Face verification | Not documented on the tenant | None | 0 | — |
| GPS geofence | Yes | Work Location radius, off since 29 Sep | 2 | server |
| GPS tracking during the day | Marketing only | None in HRMS (fleet tracker has it for vehicles) | 0 | — |
| Kiosk | Yes | None | 0 | — |
| Multiple punches a day | Yes | Stored; hrms "first-last" only | 2 | hrms |
| **Daily calculation** | | | | |
| Working hours | Yes | hrms, from first-last | 2 | hrms |
| Breaks | Session mode | None | 0 | — |
| Late arrival | Grace, hard limit, forgiveness | Grace flag on some shifts; consequences none | 1 | client |
| Early departure | Mirror | Same | 1 | client |
| Missed punch (MSP) | Status + report | MSP report in the browser; no status, no alert that works (B5) | 1 | client |
| Half day / absent by hours | Yes | Thresholds 0 (L3) | 1 | hrms, unset |
| **Shifts** | | | | |
| Fixed shifts, assignment | Yes | Shift Type, Shift Assignment, Manage Shift, Assign Shift | 3 | hrms |
| Night across midnight | Yes | hrms windows + rota rule, broken (L2) | 1 | server |
| Rotational | Work schedule | rota (day/night pair only); hrms 16 `Shift Schedule` unused | 1 | server |
| Flexible | Yes | None | 0 | — |
| Change shift for a date | Yes | Shift Assignment, but nothing re-processes (L1) | 1 | — |
| **Policy** | | | | |
| Policy master + assignment | Manage / Assign Attendance Policy | None (blueprint page) | 0 | — |
| Weekly off, holidays | Calendar | Holiday List per company, rolled over yearly | 3 | hrms |
| Overtime | Rules, approval | Worked out in the browser (`client/src/lib/overtime.js`), approved per day in `Employee Overtime` | 1 | client |
| Comp off | Yes | Sunday leave (office only, switched off); `Compensatory Leave Request` unused | 1 | server, off |
| Late/early penalty to leave or LOP | Yes | None | 0 | — |
| **Workflow** | | | | |
| Regularization | Multi-level | Manager **or** HR, one level | 2 | server |
| Exception detection | Daily | MSP report only | 1 | client |
| Month close | Submit Attendance, full breakdown | Attendance Submission, counts by status only | 2 | server |
| LOP into payroll | Yes | hrms Payroll on Attendance: Absent and LWP leave only; no late or MSP penalties | 1 | hrms |
| **Reports** | | | | |
| Daily / monthly / MSP / present / absent / in-out | Yes | Built in the dashboard | 2 | client |
| Late Coming, Early Going, Half Day, Yearly, In-Out summary, Employee report | Yes | Blueprint pages | 0 | — |
| Department / shift-wise dashboards | Yes | Company dashboard tiles | 1 | client |
| Excel / PDF | Yes | Excel and PDF on most (`lib/export.js`); Submit's preview is CSV only | 3 | client |

**Overall: 40 of 99 available points (40%).** Capture and masters are close;
everything that turns punches into pay is the gap, which is what FACTOHR.md
said in August.

## 4. The dashboard's attendance pages

Under `client/src/`. Visible on the Attendance menu:
- Regularization (`/attendance`, the month register);
- Settings;
- App Punches;
- Overtime;
- Corrections.

The reports are tiles on `/reports`: Daily Detail, Monthly Basic, Monthly
Summary, OT, Weekly, Absent, In/Out, Present, MSP, In/Out Count, Shift and
Headcount. Most other attendance tabs are hidden in `data/sections.js:73-80`;
they are kept, not deleted.

**The pattern: every page decides the day for itself, from the punches, in the
browser.** The Regularization register does not read `Attendance` at all. Daily
Detail prefers a submitted `Attendance` row and falls back to its own reading.
So the same person and day can read differently on different pages, and none
of them is what payroll will pay.

| # | Finding | Where |
|---|---|---|
| C1 | Edits are saved as Approved in one step. *Checked:* the site still judges it. A new correction is walked from Draft by the workflow as the signed-in login (`EmployeeAttendanceRegularization.after_insert`), so a login that may not approve is refused there. The page is HR's only. What remains is that the browser also writes the punches itself (`decide.writeCorrection`), beside `regularization.apply`. That moves to the server with P2. | `api/punchedit.js:40-75` |
| C2 | Two approvers disagree. The dashboard lets only `hr@mannarubber.com` decide (`data/approver.js:12`); the site's workflow routes to the reporting manager or HR (`workflow.py:121`). | |
| C3 | Late minutes ignore the grace HR sets on Settings, and the company dashboard uses hrms's flag. Late counts differ by page. | `lib/roster.js:247`, `lib/dailydetail.js:184` vs `CompanyDash.jsx:169` |
| C4 | A single punch counts as a different number of days on different pages: 1 day on the pay register, 0 on Monthly Basic, "Partial" on the register. The pay register reads draft `Attendance` too. | `lib/register.js:98`, `data/attendance.js:193`, `api/register.js:50` |
| C5 | Shift Assignment is read only in the one-person view; everywhere else uses `default_shift`. So a rota or a date's shift change is wrong on every list. | `api/attendance.js:188`, `register.js:82`, `monthlysummary.js:127` |
| C6 | OT is worked out in the browser: shift + 30 min, rounded down to 30. Any login can approve it, and two code paths write `Employee Overtime`. | `lib/overtime.js:53`, `DailyDetail.jsx:311`, `punchedit.js:182`, `api/overtime.js` |
| C7 | Three punch-pairing rules, and a device direction hard-coded by serial | `roster.workDateOf`, `inout.firstLast`, `apppunches.apDaily`; `lib/direction.js:32` |
| C8 | Present, MSP, In/Out Count and Headcount read today's punches only but offer other dates, which come back empty without saying so | `api/load.js:179`, `features/reports/Report.jsx:44` |
| C9 | Pending leave is counted as leave. Start Up's "On Leave" counts any Open application on any date. | `lib/reports.js:50`, `lib/summary.js:46` |
| C10 | No department or shift filter on Daily Detail, Monthly Basic or Monthly Summary: the Advance-tab state is read but nothing sets it | `DailyDetail.jsx:109-122`, `MonthlyBasic.jsx:69-75` |
| C11 | Daily Detail's paper export references two names it never imports, so Preview, Word and Print would throw | `DailyDetail.jsx:181,185` |
| C12 | Hard-coded figures: `left: 344`, "of 23", `counts.shift` undefined, Sunday as the weekly off in a legend | `api/load.js:258-260`, `SubmitAttendance.jsx:202`, `MonthlyBasic.jsx:475` |

**What this means for the plan.** The pages keep their kit layout, menus and
exports. What changes underneath:
- they read the day from `Attendance`, plus the policy fields from §5;
- they stop deciding;
- C1 goes through the workflow;
- C6 moves to the server.

The client copies of server rules (`lib/rules.js`, `lib/absencerule.js`,
`lib/overtime.js`, `submit.js` blockers) stay only to word a fast message, as
CLAUDE.md §1 allows.

## 5. Design of the policy engine

### What it must not do

- **Write `Attendance`.** hrms's shift job still makes every row (CLAUDE.md §5).
- **Raise anything but `DuplicateAttendanceError`** from an Attendance hook.
  Anything else stops the shift job for the whole group.
- **Decide in the browser.** The dashboard and the phone read what the server
  decided and show it.

### Where it acts

1. **Shift Type settings from the policy.** `Manna Attendance Policy` holds the
   thresholds: half day and absent by hours, late and early grace, check-in
   and check-out margins, pairing mode, and whether holidays are marked.
   Saving the policy writes them onto every Shift Type it covers. hrms then
   decides Present / Half Day / Absent by hours natively. One source, and a
   reprocess gives the same answer.
2. **`Attendance` validate hook, during generation.** It enriches the row hrms
   is making and does not write one. Fields: late minutes, early minutes, net
   hours (break taken off), OT minutes, missed punch, exception list, and the
   policy applied. It also makes the two status changes hrms cannot:
   - a single punch becomes MSP: Half Day or Absent, as the policy says;
   - a late arrival past the hard limit becomes Half Day.

   Deterministic from the punches, so reprocessing reproduces it.
3. **Month settlement job** (nightly until the month is submitted). It counts
   lates and earlies per person. Each penalty past the policy's forgiveness
   becomes a **half-day Leave Application**: Casual Leave while the balance
   lasts, if the policy says so, else Leave Without Pay. Each carries an
   `AUTO_MARK`, as the absence rule's do. hrms then turns the day into Half
   Day with that leave type, and payroll counts it, with no Attendance
   hand-written. It is idempotent, and withdraws its own leave when a
   correction removes a late.
4. **Overtime from the server.** The hook's OT minutes, after minimum,
   rounding, daily maximum and day type, make or update a **pending**
   `Employee Overtime` row. Approval stays as built on 18 Nov. Approved hours
   go to payroll as `Additional Salary`. hrms 16's own `Overtime Slip` was
   considered: it pays from `Attendance.actual_overtime_duration` with no
   per-day approval, which is the control HR asked for, so it is not used.
5. **Re-process.** One server function (`manna_hr/reprocess.py`). For an
   employee and date range:
   1. re-save the punches that have no live Attendance, so hrms re-fetches the shift;
   2. cancel the auto-made rows on days whose punches changed shift. Never a leave's row, never a frozen month.
   3. run the shift job for the shifts touched.

   Dry run first, always. Triggers:
   - `Employee.default_shift` changes: from the first unfrozen day, at most 62 days back;
   - a `Shift Assignment` is submitted or cancelled: its dates;
   - a policy is saved: its people, the open month;
   - HR's "Reprocess" button on Daily Detail.

   This is factoHR's Manual Process Attendance, done by re-running rather than
   by hand.

### Pure rules

`manna_hr/attpolicy.py`, no `frappe` import, holds:

- the day calculation
- MSP
- late and early minutes against a shift that may cross midnight
- break deduction
- OT rounding
- forgiveness counting
- penalty planning

It is tested as a table of scenarios: day worker on time, 3 minutes late
inside grace, 20 minutes late, fourth late in the month, single punch, 4 h
worked, night 20:30-08:30, night with the morning punch missing, Sunday
worked, OT 1 h 40 m rounded to 1 h 30 m, duplicate punches, and a shift
changed mid-month.

## 6. Phases

Each phase is a branch and a PR off `main`, with tests, ready to merge. None
writes to the live site. Installing on the site, and any repair of live data,
is a separate step that needs a yes for that exact change.

**P0. Stop the bleeding** (about 2 days). Bugs that are wrong today, whatever the policy turns out to be.
- P0.1 `reprocess.py` and its triggers (L1), with dry run and a Daily Detail button.
- P0.2 Duplicates (L4, B3):
  - reply to the machine first, then deliver from a queued job;
  - a row lock and re-check of state in `_deliver`;
  - an exact-duplicate check on `(employee, time)` that ignores `log_type`; the copy is answered as delivered, not stored twice;
  - the bridge's POST retries stop;
  - `tools/dedupe_checkins.py` lists the 1,383 and, on `--apply`, keeps the earliest and sets `skip_auto_attendance` on the rest. They are not deleted (a punch is evidence).
- P0.3 Night shifts (L2, B2):
  - one night map, shared by site and bridge, pinned by a test;
  - direction-free detection: an evening punch followed 9-15 h later by a morning one, nothing between, is a night;
  - decided when the morning punch lands, with the night's punches re-processed.
- P0.4 Source spoofing (B1). Biometric only when the device id is a registered `Attendance Device` **and** the writer is not the employee. `REG-` only from `regularization.apply`. Empty only from HR.
- P0.5 B4, B5 (one notice per day, shift-aware, machine days included), B6, B10.
- P0.6 C11. (C1 needs no change in P0; see §4.)

**P1. Policy engine** (about 5 days). §5 parts 1-4:
- `Manna Attendance Policy` and its assignment, by company, department, designation, shift or person, most specific wins;
- Manage / Assign Attendance Policy pages in the kit;
- Attendance custom fields;
- settlement job and OT rows;
- the dashboard reads the server's figures instead of computing them: Daily Detail, Monthly, the register, the pay register, company tiles and the Late-In tile. That fixes C3-C9 at the root.

**P2. Workflow and month close** (about 3 days).
- Exceptions page: MSP, late, early, short hours, punches with no employee, people with no device id, duplicates. Daily notice to the person and their manager.
- Regularization:
  - levels per company: manager then HR, HR only, or manager only;
  - reason list;
  - AR In / AR Out beside the original punch;
  - bulk approve;
  - status `Completed` fixed.
- Comp off: work on a weekly off or holiday makes a `Compensatory Leave Request` when the policy says comp off rather than OT.
- Submit Attendance: per-person breakdown in a child table:
  - present, half, absent, weekly off, holiday
  - leave by type
  - late and early counts, penalties
  - OT hours, LOP days, payable days

  Refused unless each row adds up to the calendar days. Payroll checks its slips' payment days against it.
- Phone: month from `Attendance` (Late, Half Day, Absent, MSP as payroll sees them); the punch window from the site (B7, B8, B9).

**P3. Reports and dashboards** (about 3 days).
- Reports: Late Coming, Early Going, Half Day, Overtime (planned against worked), In-Out Summary, Detail In-Out, Employee Attendance, Yearly Summary.
- Department-, shift- and employee-wise daily and monthly dashboards.
- Excel on every report; PDF via a print stylesheet on the same tables.

**P4. Capture upgrades: each needs a decision first** (§7).
- Kiosk punch;
- web punch for named office staff;
- face check against the profile photo;
- tracking during the day.

## 7. Decisions needed before P1 and P4

1. **The policy numbers, per company.** factoHR's Setup → Manage Attendance Policy is the source. Needed:
   - full / half / absent hours;
   - late and early grace, and the hard limit;
   - how many lates are forgiven a month;
   - what the next one costs, and whether it comes from CL or LWP.

   Without them P1 ships with every rule off, so nothing changes until HR fills the master.
2. **A single punch (MSP)**: Absent, Half Day, or Present-and-flagged until corrected?
3. **Correction approval**: manager then HR for everyone, or by company?
4. **Holiday or Sunday worked**: OT, comp off, or by designation?
5. **P4**: which of kiosk, web punch, face check and live tracking are wanted? Face matching on the phone means a model on the handset and a stored face template per person, which is biometric personal data.

## 8. How it is tested

- Pure rules: pytest scenario tables, no site.
- Real hrms: a second bench in WSL. The existing `~/frappe-bench` is shared and its `manna_hr` is the `localdev` checkout, so it is not touched. The new bench has frappe 16, erpnext 16 and hrms 16.53, as on the site. Each phase gets a bench test that:
  - makes the employees of the scenarios;
  - posts their punches;
  - runs hrms's shift job, the settlement and payroll for a month;
  - checks Attendance, leave, OT and the salary slip's payment days.
- Client: `npm test` and `npm run shots`.
- Live: read-only dry runs of `reprocess` and `dedupe_checkins` against November, and their output, before anybody says yes to applying them.

## 9. Phase 0: what was built (19 Nov 2026)

Bench: `~/bench-att` in WSL, site `att.localhost` (frappe 16.55.2, erpnext 16.53.0, hrms 16.53.1).
`bench --site att.localhost run-tests --module manna_hr.tests.bench_phase0`: 7 tests, OK.

| Item | Where | Tested |
|---|---|---|
| Re-process: rule, site half, triggers on `default_shift` and Shift Assignment, preview/apply API, **Rebuild days** on Daily Detail | `reprocess.py`, `reprocess_site.py`, `hooks.py`, `client/src/api/reprocess.js`, `DailyDetail.jsx` | 18 pure tests; bench: Absent → Present after a shift is given, leave untouched, Strict → 0 h fixed by setting + `days` rebuild |
| Duplicates: per-employee lock + `(employee, time)` check on every insert; ADMS answers first and delivers from a job; each stored punch locked while delivered; a duplicate from another road counts as delivered | `checkin._refuse_duplicate`, `adms_site.handle`, `adms_site._deliver` | bench: same second twice refused whatever the key |
| Clean-up of the duplicates already there: preview/apply, set aside (never deleted), days they were counted into rebuilt | `dedupe.py`, `dedupe_site.py` | 8 pure tests; bench: copy set aside, not deleted |
| Night shifts: one map pinned to the bridge's; `Shift Type.custom_night_shift` read first; arrival worked out from the order of punches when there is no key; decided as any machine punch is saved (bridge's too) | `rota.py`, `rota_site.py`, `checkin._day_or_night`, `install.py` | 11 pure tests; bench: evening after a rest gets the night with no key, and the morning after belongs to it |
| Source spoofing: an employee login is a phone whatever its `device_id`, and punches only for itself; a correction's punch is marked by a flag | `checkin._classify_source`, `regularization._write_checkin` | bench: `BIO-` from an employee login is a phone punch on the server clock; another's punch refused |
| Missed punch alert: once per person per day, by shift day, by count | `tasks.flag_open_shifts`, `rules.shift_is_over` | 3 pure tests |
| Distance recorded with the fence off (B10); Daily Detail paper export imports (C11) | `checkin._check_geofence`, `DailyDetail.jsx` | — |

**Before any of it does anything on the live site**, each of these needs a yes:
1. Deploy the app (bench migrate on Frappe Cloud).
2. `python tools/create_custom_fields.py "Shift Type" --apply`, for `custom_night_shift`. Until then the map in the code is used alone.
3. HR sets the night partner on Hi-Tech's day shifts, once a night Shift Type exists for them. `Production shift1` has none today, so HPT-012 and the others get no night until one is named.
4. Duplicates: `dedupe_site.preview` for November, read, then `apply`.
5. The ~650 Absents: `reprocess_site.preview` for the affected people and November, read, then `apply`. This overlaps the 384 being repaired by hand; run the preview after that repair.

## 10. Phase 1: the attendance policy engine (19 Nov 2026)

Branch `feature/attendance-policy`, stacked on Phase 0.

| Piece | Where |
|---|---|
| The policy master: thresholds, break, missed-punch status, late and early grace, half-day limits, monthly forgiveness and penalties, Casual Leave before LWP, overtime rules. Every rule off until set. | `Manna Attendance Policy` (+ `… Scope`, `… Shift`) |
| Which policy a person is on: Employee, then Shift Type, Designation, Department, Company, then the default; priority, then name, breaks a tie | `attpolicy.resolve` |
| Saving a policy writes its thresholds and grace onto the Shift Types it names, so hrms's own first reading agrees | `attpolicy_site.push_to_shifts` |
| The day: as hrms's shift job makes each row, the hook writes late and early minutes, net hours, overtime, punch count, missed punch, exceptions and the policy's status (penalty or hard-limit half day, single punch, hours) onto it. A Half Day it makes has `half_day_status` Absent, which is what hrms payroll counts as half unpaid. Never raises. | `attpolicy.evaluate_day`, `attpolicy_site.on_attendance_validate` |
| Overtime: the policy's figure becomes a pending `Employee Overtime` row; approval on Daily Detail as before | `attpolicy_site.on_attendance_submit` |
| The month, nightly: a penalty that moved (a corrected late) has its days rebuilt; a penalty the policy takes from Casual Leave first becomes a half-day Casual Leave, paid, while the balance lasts | `attpolicy.month_plan`, `attpolicy_site.settle` |
| Attendance → **Attendance Policy** page (Manage and Assign Attendance Policy) | `client/src/features/attendance/AttendancePolicy.jsx` |
| Daily Detail shows the site's figures for any day the policy read | `client/src/lib/dailydetail.js` |

**Tested.**
- 33 scenario tests on the rules.
- 9 bench scenarios through hrms's own shift job, all passing:
  - the policy sets its shifts;
  - on time;
  - the 4th late is a Half Day with `half_day_status` Absent;
  - a single punch;
  - 4 h is a Half Day and 3 h Absent;
  - overtime becomes a pending row at 1.5 h;
  - a night crossing midnight;
  - a corrected late moves the penalty to the right day;
  - a penalty is taken from Casual Leave and paid.
- Phase 0's 7 still pass.
- 1,109 Python, 5,038 client.

**Not in this phase.** Comp off is a policy choice with no effect yet (P2). Session mode (pre/post break judged apart) is not built. The pay register and Monthly reports still read days their own way (P2/P3).

**What changes on the live site once installed: nothing, until HR makes a policy.** Then:
1. HR makes the policy from factoHR's numbers.
2. Rebuild the open month with scope `days`.
