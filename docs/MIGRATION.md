# Coming off Factor HR

Written before the Factor HR export has been seen, so the mapping below is the
shape we expect and the questions we need answered — not a finished plan. It
will be rewritten against the real export.

---

## What we need out of Factor HR

Ask for **CSV or Excel, not PDF**, and ask for it once per item. A payslip PDF
is a picture of the answer; we need the numbers that produced it.

### 1. Employee master — the big one

One row per person, every company, including people who have left.

| We need | Becomes | Notes |
|---|---|---|
| Employee code | `custom_factor_hr_id` | The join key for the whole reconciliation. Never reused, never edited. |
| Full name | `employee_name` | |
| Company | `company` | Must match an existing ERPNext Company **exactly** |
| Date of joining | `date_of_joining` | |
| Date of leaving | `relieving_date` | Blank for current staff |
| Status | `status` | Active / Left |
| Department, Designation, Grade | same | Free text now, links later |
| Reports to (employee code) | `reports_to` | Drives who approves whose corrections |
| Date of birth, gender | same | |
| Mobile, personal email | `cell_number`, `personal_email` | |
| **Biometric / device user id** | `attendance_device_id` | **The critical one — see below** |
| Bank account, IFSC | payroll | Only if payroll moves too |
| PF number, UAN, ESI number | payroll | Same |
| PAN, Aadhaar | payroll | Same |

**`attendance_device_id` is the field that decides whether the whole project
works.** The fingerprint machine knows a person as user `104`; ERPNext knows
them as `HR-EMP-00042`; nothing else joins the two. Factor HR must already hold
this mapping, because its own attendance runs on it. Get it in the same export
as everything else — reconstructing it later means walking to every machine.

If Factor HR will not export it, it can be read off each device directly (the
bridge's `Device.read` returns the user ids it sees), but then somebody has to
match every number to a face.

### 2. Leave

- Leave types, with their rules: annual entitlement, whether they carry
  forward, whether they can go negative, whether they are paid.
- **Current balance per person per leave type**, as at a stated date. The date
  matters more than the number.
- Leave taken in the current year, per person, so the balance can be checked
  rather than trusted.

### 3. Attendance history

How far back to carry is a decision, not a technical question. Our
recommendation: **carry the last complete financial year as read-only history,
and start live recording at go-live.** Importing years of daily attendance into
`Attendance` produces a large table nobody queries and a reconciliation nobody
finishes.

### 4. Payroll — only if payroll is moving too

Salary structures, components (earnings and deductions), and the last three
months of payslips per person. The payslips are not imported; they are the test
data. If we cannot reproduce last month's payslip to the rupee before cutover,
payroll is not ready to move.

### 5. Shifts

Shift patterns per company, with start and end times. **Flag every shift that
crosses midnight** — see [SCHEMA.md](SCHEMA.md) §4 for why that one is
dangerous.

**Do not ask for "which people are on which shift".** It does not exist over
there in that form: their Manage Shift screen shows `EMPLOYEE COUNT` as 0 on
every row and the assignment carried by the *category* instead
([FACTOHR_SCREENS.md](FACTOHR_SCREENS.md) §20). What to ask for is **which
category type carries the shift, and the membership of those categories** —
ERPNext's per-person `Shift Assignment` rows are then derived from it, and the
derivation is only as right as that membership is.

---

## Order of loading

Each depends on the one above it, and loading out of order produces rows that
link to nothing.

1. Company (exists), Holiday List, Department, Designation, Branch, Grade
2. Employee, **without** `reports_to`
3. Employee again, setting `reports_to` — a second pass, because a manager must
   exist before somebody can report to them
4. Work Location, then `Employee.custom_work_location`
5. Shift Type, Shift Assignment
6. Leave Type, Leave Allocation
7. Payroll masters, if moving

---

## Reconciling

`custom_factor_hr_id` exists for exactly this and is read-only for exactly this
reason. Three checks, before anybody trusts the new system:

- **Headcount per company** matches Factor HR, per company, on the same date.
  If it does not, the usual cause is people who left being exported as active.
- **Every active employee has an `attendance_device_id`**, or is explicitly
  marked as somebody who punches on their phone. A blank here is silent: their
  punches are simply dropped, and they look absent every day.
- **Leave balances match** on the stated date, per person per type.

---

## Run both for one cycle

Do not cut over on a payroll boundary with no comparison. Record one full month
in both systems, then reconcile person by person before Factor HR is switched
off.

This is not caution for its own sake. Attendance disputes are found by people —
somebody says "I was there on the 14th" — and no test suite generates that. One
month of overlap is what turns the first payroll run from an event into a
non-event.
