# Schema

What `manna_hr` creates, what it expects from `hrms`, and the configuration
values that decide behaviour. Field names here match the code exactly.

---

## 1. What comes from Frappe HR

Nothing to create. Listed because the design rests on knowing which layer is
which.

| Doctype | Layer | What it holds |
|---|---|---|
| `Employee` | master | One row per person, in one `Company` |
| `Employee Checkin` | **raw event** | One punch. `employee`, `time`, `log_type`, `device_id`, `latitude`, `longitude` |
| `Attendance` | **derived** | One row per person per day. Present/Absent/Half Day, hours, late entry, early exit |
| `Shift Type` | config | The pattern, and the auto-attendance thresholds |
| `Shift Assignment` | config | Which person is on which shift, when |
| `Leave Application` | request | Leave, with its own approval flow |
| `Leave Type`, `Leave Allocation`, `Leave Ledger Entry` | balance | The authoritative balance. Never compute leave balance yourself. |
| `Holiday List` | config | Per company |

**Never write `Attendance` directly.** It is generated from checkins by the
shift job. A hand-written row is invisible to the thing that would have created
it, and the two will disagree the moment anything is reprocessed. Corrections go
through `Attendance Regularization` (below), which writes a checkin.

### Standard fields we depend on

| Doctype | Field | Why |
|---|---|---|
| `Employee` | `attendance_device_id` | The only link from a fingerprint template to a person. Blank means punches are dropped. |
| `Employee` | `default_shift`, `holiday_list`, `company` | Drive auto-attendance |
| `Employee Checkin` | `device_id` | How we tell a machine punch from a phone punch |
| `Employee Checkin` | `skip_auto_attendance` | Set on a punch that must not affect Attendance |

---

## 2. New doctypes — `manna_hr`

### `Work Location`

The anchor a geofenced punch is measured against. One per gate, office or yard —
not one per company, because a company has several places and a person punches
at one of them.

| Fieldname | Type | Notes |
|---|---|---|
| `location_name` | Data | Naming is by this |
| `company` | Link to Company | |
| `latitude` | Float, 8 decimals | |
| `longitude` | Float, 8 decimals | |
| `radius_metres` | Int | Blank falls back to `Manna HR Settings.default_radius_metres` |
| `is_active` | Check | Default 1 |
| `address` | Small Text | For humans, never matched on |

**Capture the coordinate by standing at the gate**, not from a map pin. A map
pin lands on the roof of the building; people punch at the door.

### `Manna HR Settings` (Single)

Every tunable number, in one place, editable without a deploy.

| Fieldname | Type | Default | Notes |
|---|---|---|---|
| `enforce_geofence` | Check | 1 | Off means coordinates are recorded but never refuse a punch |
| `default_radius_metres` | Int | 300 | Used when a Work Location leaves it blank |
| `punch_in_from` | Time | 05:00:00 | Earlier is refused; regularize instead |
| `punch_out_until` | Time | 21:30:00 | Later is refused; regularize instead |
| `enforce_punch_window` | Check | 1 | |
| `require_location_for_mobile` | Check | 1 | A phone punch with no coordinate is refused |
| `trusted_device_prefix` | Data | `BIO-` | A `device_id` starting with this is a machine, and skips the geofence |

**`radius_metres` is generous on purpose.** The sales app uses 2 km for visits,
because that is a check the rep is *at the place they say*, not that they are in
the doorway. A factory gate is a fixed, known point, so 300 m is right — but it
is 300 and not 50 because a phone against a metal shed reads badly, and the
failure that matters is refusing someone who did turn up.

### `Attendance Regularization`

A correction request. Carried over from the sales system, where it works, and
widened to any employee.

| Fieldname | Type | Notes |
|---|---|---|
| `employee` | Link to Employee | |
| `attendance_date` | Date | |
| `requested_in` | Datetime | Either may be blank — a missed punch-out is the common case |
| `requested_out` | Datetime | |
| `reason` | Small Text | Required |
| `status` | Select | `Draft` / `Pending Approval` / `Approved` / `Rejected` / `Completed` — driven by a Workflow, see below |
| `approver_type` | Select | `Reporting Manager` / `HR` |
| `decided_by` | Link to User | |
| `decided_on` | Datetime | |
| `decision_note` | Small Text | Shown back to the employee on a rejection |

**Approving one writes `Employee Checkin` rows**, with `device_id` set to
`REG-<user>`, and lets the shift job rebuild `Attendance` from them. It does not
edit `Attendance`. That is the whole reason the correction is auditable: the
punch that was missing now exists, and says who put it there.

`approver_type` routes it. In the sales system a rep's correction is their
manager's to decide and a manager's own correction goes to HR — an approver must
not sign off their own attendance. Same rule here, resolved from
`Employee.reports_to`.

#### The approval workflow

`manna_hr/workflow.py` — installed from `after_install` and re-applied by
`manna_hr.patches.install_regularization_workflow` on every `bench migrate`.
Not a fixture: fixture files import in filesystem order, and a Workflow whose
transitions link to a Role that does not exist yet fails on a broken link rather
than on the missing role.

```
  Draft ──Submit──► Pending Approval ──Approve──► Approved ──► Completed
    ▲                    │      │                              (scheduled)
    └────Withdraw────────┘      └──Reject──► Rejected ──Reopen──┐
                                                    └───────────┘
```

| | |
|---|---|
| **Draft** | With the person writing it. New — `status` used to default to `Pending Approval`, so a half-typed correction landed in an approver's queue the moment it was saved |
| **Pending Approval** | In the queue the dashboard reads (`status = "Pending Approval"`) |
| **Approved** | Decided. `on_update` has written the missing `Employee Checkin` rows |
| **Rejected** | Decided no, with a note shown back. Reopenable by `HR Manager` — a rejection is somebody's pay and must not be final because an approver misread the date |
| **Completed** | The shift job has rebuilt `Attendance` from those punches. Set by `regularization.complete_applied`, hourly |

**`Approved` is not `Completed`, and the gap is why both exist.** Approving
writes punches; the day is not corrected until the shift job next runs. Between
the two the request says Approved and the report still says Absent, which is
exactly the argument the two states exist to end.

**Routing is enforced by the workflow, not merely recorded.** A
`Manna Attendance Approver` may only decide requests where
`approver_type == "Reporting Manager"`; an `HR User` only where it is `"HR"`.
`HR Manager` carries no condition — routing is data and data gets edited, and a
workflow with no way out of a badly routed request is one people work around by
editing the table. Every deciding transition has `allow_self_approval` off,
which is Frappe's guard against approving a request you raised;
`_guard_self_approval` stays as well and catches the other case — a request
raised *about* the approver by somebody else.

### `Letter Type`

Factor HR's letter formats. ERPNext has no letter master at all — its
`Letter Head` is stationery, not a document type.

| Fieldname | Type | Notes |
|---|---|---|
| `letter_type_name` | Data | The name, and the id. Renames are off — every letter issued names it by this string |
| `category` | Data | Onboarding / Exit / Statutory. Free text: the list is theirs and is still being read off their screens |
| `is_active` | Check | Retire rather than delete. A letter whose type has vanished is a letter nobody can explain |
| `body` | Text Editor | The template, with `{Tokens}` where a value goes |
| `fields_used` | Small Text | Read-only, worked out from `body` on save. A fact about the text, not a second place to state one |

### `Employee Letter`

One issued letter.

| Fieldname | Type | Notes |
|---|---|---|
| `employee` | Link to Employee | |
| `letter_type` | Link to Letter Type | |
| `letter_date` | Date | |
| `letter_number` | Int | Their running number — what is on the paper and what somebody quotes back |
| `reference_number` | Data | |
| `body` | Text Editor | **The merged text, as it went out** |
| `remarks` | Small Text | Ours, not theirs |

**`body` is a snapshot, not a view.** It is merged and stored by
`before_insert` (`manna_hr/letters.py`), and never re-merged when the letter is
opened. Bulk generation used to store nothing and re-render from the template
every time, which meant a letter issued in March said something different in
June if the person's designation had changed. An issued letter is a statement
somebody was given on a date.

`manna_hr/letters.py` is a port of `client/src/lib/letter.js` and the two have
to agree — the browser renders the preview, the server stores what was issued,
and a token that resolves in one and not the other is a letter somebody rings up
about. The grammar, the key and the `[[Token]]` miss are covered in
`tests/test_letters.py`.

---

## 3. Custom fields — `manna_hr`

| Doctype | Fieldname | Type | Notes |
|---|---|---|---|
| `Employee` | `custom_work_location` | Link to Work Location | Where this person is expected to punch |
| `Employee` | `custom_allow_remote_punch` | Check | Field staff and reps — punch from anywhere, coordinates still recorded |
| `Employee` | `custom_factor_hr_id` | Data | The old system's id. Kept for reconciliation; see [MIGRATION.md](MIGRATION.md) |
| `Employee Checkin` | `custom_distance_metres` | Float | How far from the Work Location this punch was. Recorded even when it passes. |
| `Employee Checkin` | `custom_geofence_result` | Select | `inside` / `outside` / `not_checked` / `no_location` |
| `Employee Checkin` | `custom_source` | Select | `biometric` / `mobile` / `regularization` / `manual` |

`custom_distance_metres` is written on every punch, not only failures. A month
of distances is what tells you whether 300 m is the right radius; refusals alone
only tell you where it was too small.

---

## 4. Shift Type — the settings that decide everything

Auto-attendance is where raw punches become the payroll record. These are the
fields that matter:

| Field | What it does |
|---|---|
| `enable_auto_attendance` | Off, and no Attendance is ever generated |
| `process_attendance_after` | Never process before this date. **Set it to go-live.** Otherwise the first run walks the entire history. |
| `last_sync_of_checkin` | Do not process past this. The job maintains it. |
| `begin_check_in_before_shift_start_time` | Minutes early a punch still counts for this shift |
| `allow_check_out_after_shift_end_time` | Minutes late a punch still counts |
| `working_hours_threshold_for_half_day` | Below this, Half Day |
| `working_hours_threshold_for_absent` | Below this, Absent |
| `late_entry_grace_period` / `early_exit_grace_period` | Flag without changing status |

### The night-shift trap

A shift crossing midnight belongs to the day it **started**. Frappe handles this
through the shift's own window, but only if the Shift Type's `start_time` is
later than its `end_time` and the punch falls inside the real window. Get it
wrong and a night worker is marked absent two days running: no punch-out on the
first, no punch-in on the second.

Test it with real punches before anyone is paid from it.

### Pairing mode — `determine_check_in_and_check_out`

*Alternating entries as IN and OUT* versus *Strictly based on Log Type*.
Fingerprint machines are often configured to send no log type at all, in which
case alternating is the only mode that works — but it also means one extra punch
(somebody stepping out for tea and back) silently reverses the pairing for the
rest of that day.

Decide this per device, once, and write down which it is.

---

## 5. Roles

| Role | Sees | Notes |
|---|---|---|
| `HR Manager` | Every company | hrms standard |
| `HR User` | Scoped by User Permission on `Company` | The normal HR seat |
| `Manna Attendance Approver` | Their reports only | Ours. Regularizations and leave for `reports_to` |
| `Employee` | Themselves | hrms standard |

**Per-company scoping is a User Permission on `Company`**, not a role. Add the
permission and every HR list narrows automatically. An `HR User` with no Company
permission sees everything — the default is open, so an omission is a leak
rather than a lockout, and it will not announce itself.

### Row-level scoping — `manna_hr/permissions.py`

The table above described `Manna Attendance Approver` as seeing "their reports
only" for some time before anything enforced it. The role had `read` and `write`
on `Attendance Regularization` and nothing narrowing which rows, so a supervisor
at one company could list and decide every correction in the group. Closed by
`permission_query_conditions` and `has_permission` — **both**, because Frappe
asks the question twice and a system with only the first has a list that hides a
row and a URL that still opens it.

| Doctype | Who sees what |
|---|---|
| `Attendance Regularization` | HR sees all. An approver sees their direct reports and themselves. Everybody else sees their own |
| `Employee Letter` | HR sees all. Everybody else sees their own — **an approver does not see their reports' letters**, because a letter can carry a salary or a reason for leaving and signing off somebody's attendance does not make those yours to read |

**This is the one place in the app that rounds towards refusing.** Everywhere
else a doubtful case is let through, because refusing somebody who did turn up
costs them a day's pay (CLAUDE.md §4). Here a reader the module cannot place
sees nothing, because a row wrongly hidden costs somebody a phone call and a row
wrongly shown cannot be taken back.
