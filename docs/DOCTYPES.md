# Every screen, and the doctype behind it

**ERPNext is the server and ERPNext is the database.** There is no store of ours
anywhere else — no Express process, no Mongo, no table this app keeps on the
side. A screen in `client/` is a view of documents on
`mannarubber.m.frappe.cloud`, written as the signed-in person, and a screen with
no doctype under it is a screen that cannot save anything.

This file is the map. One row per page in the dashboard, naming what holds its
data and where that doctype comes from.

| Column | Meaning |
|---|---|
| **stock** | Frappe HR or ERPNext already has it. We create nothing and must not shadow it. |
| **ours** | Made for this project. It lives on the site — see §11. |
| **derived** | No document of its own — a report or a count over rows that already exist. |

> **The schema is on the site, not in this repo.** All twenty-one are on
> `mannarubber.m.frappe.cloud` as custom doctypes in the `Manna HR` module, and
> the site owns the definitions. There is no JSON here to read: what a field is
> called and what it means is answered in Desk, or by
> `python tools/export_from_site.py`, which pulls the definitions back down into
> the app's layout. §11 and §14 say what follows from that.

---

## 1. The rule about what gets built

**A doctype is created only where hrms has nothing.** Roughly 70% of Factor HR
is stock Frappe HR (`docs/FACTOHR.md`), and re-creating any of it would mean
hand-writing the leave ledger, the shift job and payroll that already work — and
then maintaining a second copy of each through every upgrade.

So `manna_hr` holds fifteen doctypes and every one of them fills a hole:
something Factor HR does that ERPNext genuinely does not.

**Everything of ours is prefixed where a collision is possible.** `Attendance
Regularization` on this site belongs to the sales system next door — module
Selling, keyed to `Sales Person`, nine live rows, open state `Initiated`. Ours
is `Employee Attendance Regularization` and the two must never be confused; see
`docs/SITE_SURVEY.md` §5. The loan doctypes are prefixed `Employee Loan …` for
the same reason, so that installing Frappe's `lending` app later collides with
nothing.

---

## 2. Dashboard

| Page | Doctype | |
|---|---|---|
| Start up | — | derived |
| Engagement | `Employee Survey`, `Employee Survey Response` | ours |
| Approvals — Leave | `Leave Application` | stock |
| Approvals — Attendance | `Employee Attendance Regularization` | ours |
| Approvals — Employee Profile | `Employee Profile Change Request` | ours |
| Approvals — Onboarding | `Employee Onboarding` | stock |
| Approvals — Transfer & Promotion | `Employee Promotion`, `Employee Transfer` | stock |
| Approvals — Letter Assignment | `Employee Letter` | ours |

## 3. On Board

| Page | Doctype | |
|---|---|---|
| Create Letter / Form | `Letter Type`, `Employee Letter` | ours |
| Document Entry | `Employee Document Type`, `Employee Document` | ours |
| Assets Details | `Asset`, `Asset Category` | stock |
| Assets Assignment | `Asset Assignment` | ours |
| Import From Onboarding | `Employee Onboarding` + custom fields | stock |

`Asset` is ERPNext's own, deliberately. A second asset master would mean a
laptop that exists twice and is depreciated once. What ERPNext has no answer for
is *a handover to a person, in units, that may come partly back* — that is
`Asset Assignment`.

## 4. Employees

| Page | Doctype | |
|---|---|---|
| Employee Master | `Employee` | stock |
| Employee Profile | `Employee` + custom fields | stock |
| Employee Detail | — (report over `Employee`) | derived |
| Salary Master, Salary Revision | `Salary Structure`, `Salary Structure Assignment` | stock |
| CTC / Earnings | `Salary Component`, `Salary Detail` | stock |
| Categories | `Employee Category Type`, `Employee Category Value` | ours |
| Calendar | `Holiday List` | stock |

**Categories is the one that needed a doctype and did not have one.** A category
type becomes a `Custom Field` on `Employee` — that half ERPNext can do. The
other half of Factor HR's form is a hierarchy of category types and a set of
report properties, and a `Custom Field` has nowhere to put either. So the master
holds them and creates the field: see
`manna_hr/manna_hr/doctype/employee_category_type/`.

## 5. Attendance

| Page | Doctype | |
|---|---|---|
| Attendance Regularization | `Employee Attendance Regularization` | ours |
| Submit Attendance | `Employee Checkin` → `Attendance` | stock |
| In / Out Activities | `Employee Checkin` | stock |
| Daily Detail, Monthly Basic | `Attendance` | stock |
| Statutory Reports | — | derived |
| Manage Shift | `Shift Type`, `Shift Assignment` | stock |
| Schedule Report | `Auto Email Report` | stock |
| (the machines themselves) | `Attendance Device` | ours |
| (the geofence anchor) | `Work Location` | ours |
| (every tunable number) | `Manna HR Settings` (Single) | ours |

**Never write `Attendance` directly.** It is generated from `Employee Checkin`
by the shift job; a correction writes the missing *punch*. The whole argument is
in `CLAUDE.md` §5 and `manna_hr/regularization.py`.

`Attendance Device` is new here. Until it existed, a `device_id` was a string
that appeared in punches and nowhere else — nothing said which machine it was,
where it stood, or how long its silence should be tolerated before somebody is
told. `manna_hr.tasks.alert_on_silent_devices` reads it.

## 6. Leave

| Page | Doctype | |
|---|---|---|
| Apply Leave | `Leave Application` | stock |
| Leave Balance Report | `Leave Allocation`, `Leave Ledger Entry` | stock |
| All | — | derived |

Nothing of ours. **Never compute a leave balance yourself** — the ledger is the
authority and a second calculation is a second answer.

## 7. Payroll

| Page | Doctype | |
|---|---|---|
| Adhoc Payments / Deductions | `Additional Salary` | stock |
| Salary Process | `Payroll Entry`, `Salary Slip` | stock |
| Final Settlement | `Full and Final Statement` | stock |
| IT Declarations | `Employee Tax Exemption Declaration` | stock |
| Bank Transfer | `Payroll Entry` → `Payment Entry` | stock |
| Bonus Working Report | `Additional Salary` | stock |
| Salary Payslip, Salary Register | `Salary Slip` | stock |
| Prof. Tax Statement | `Salary Component`, `Salary Slip` | stock |

**Payroll adds no doctype of ours and that is the finding, not a gap.** Every
one of these nine pages is a report or a form over hrms' payroll, which is the
part of Factor HR that ERPNext most completely already is. What is missing is
data — salary structures and three months of test payslips — not schema. See
`docs/OPEN_QUESTIONS.md`.

## 8. Loans

| Page | Doctype | |
|---|---|---|
| Loan Application | `Employee Loan Application` | ours |
| Loan Register | `Employee Loan Application` + `Employee Loan Repayment` | ours |
| Loan Projection | `Employee Loan Repayment Schedule` (child) | ours |
| Loan Type master | `Employee Loan Type` | ours |

**The application *is* the loan.** There is no second document once it is
sanctioned: `loan_status` carries one row from Applied through Sanctioned,
Disbursed and Running to Closed. A separate loan document would be a second
place for somebody to correct only one of them.

**Frappe's `lending` app is deliberately not used.** It brings a general ledger,
an accrual engine and a chart of accounts to a problem that is four figures and
a payroll deduction — and it is a separate app to install on a site whose apps
are managed for us.

The four figures, each recorded and none inferred: sanctioned, disbursed,
opening balance (what was owed the day this system took over), and recovered.
`manna_hr/rules.py` does the subtraction and `manna_hr/loans.py` reads the
repayments back.

## 9. Survey

| Page | Doctype | |
|---|---|---|
| Survey | `Employee Survey`, `Employee Survey Question` (child) | ours |
| (answers) | `Employee Survey Response`, `Employee Survey Answer` (child) | ours |

**Anonymity is decided before the first answer and cannot change after.** On an
anonymous survey the `employee` column is left empty — not hidden by a
permission, absent. A permission is a promise somebody can revoke; an empty
column is one nobody can. The controller refuses the change once responses
exist.

## 10. Settings

| Page | Doctype | |
|---|---|---|
| Setup readiness, Module coverage | `Manna HR Settings` + counts | ours + derived |

---

## 11. The fifteen doctypes `manna_hr` owns

All twenty-one are on the site. They were installed in the order below — every
doctype a `Link` or `Table` points at before the doctype that points at it,
because Frappe refuses a link to a doctype that is not there yet and the error
names the field rather than the missing table.

| # | Doctype | Kind | Links to |
|---|---|---|---|
| 1 | `Employee Category Value` | child | — |
| 2 | `Employee Document Type` | master | — |
| 3 | `Employee Loan Repayment Schedule` | child | — |
| 4 | `Employee Loan Type` | master | `Company`, `Salary Component` |
| 5 | `Employee Profile Change Item` | child | — |
| 6 | `Employee Survey Answer` | child | — |
| 7 | `Employee Survey Question` | child | — |
| 8 | `Letter Type` | master | — |
| 9 | `Manna HR Settings` | single | — |
| 10 | `Work Location` | master | `Company` |
| 11 | `Attendance Device` | master | `Company`, `Work Location` |
| 12 | `Employee Category Type` | master | itself, `Employee Category Value` |
| 13 | `Employee Document` | record | `Employee`, `Company`, `Employee Document Type` |
| 14 | `Employee Letter` | record | `Employee`, `Letter Type` |
| 15 | `Employee Loan Application` | record | `Employee`, `Company`, `Employee Loan Type`, `Salary Component`, `Employee Loan Repayment Schedule` |
| 16 | `Employee Profile Change Request` | record | `Employee`, `Company`, `User`, `Employee Profile Change Item` |
| 17 | `Employee Survey` | record | `Company`, `Employee Survey Question` |
| 18 | `Asset Assignment` | record | `Employee`, `Company`, `Asset`, `Asset Category` |
| 19 | `Employee Attendance Regularization` | record | `Employee`, `Company`, `User` |
| 20 | `Employee Loan Repayment` | record | `Employee Loan Application`, `Employee`, `Company`, `Salary Slip` |
| 21 | `Employee Survey Response` | record | `Employee Survey`, `Employee`, `Company`, `Employee Survey Answer` |

Twenty-one rows, fifteen of them things a person opens — the other six are child
tables, which have no list of their own and exist inside their parent.

---

## 12. Who sees what

Six doctypes carry a row that is nobody's business but the person's and HR's.
Every one of them has **both** hooks — `permission_query_conditions` for a list
and `has_permission` for one document — because Frappe asks the question twice
and a doctype with only the first has a list that hides a row and a URL that
still opens it.

| Doctype | Who else sees it |
|---|---|
| `Employee Attendance Regularization` | the reporting manager — they decide it |
| `Employee Letter` | nobody. A letter can carry a salary or a warning |
| `Employee Document` | nobody. It is a list of passport and visa numbers |
| `Asset Assignment` | nobody. It carries a recovery amount |
| `Employee Loan Application` / `Employee Loan Repayment` | nobody |
| `Employee Profile Change Request` | nobody |
| `Employee Survey Response` | HR only — and on an anonymous survey, HR sees no name either |

**An approver's window is narrow on purpose.** Signing off somebody's attendance
does not make their loan, their letters or their passport number yours to read.

---

## 13. Custom fields, not doctypes

Some of what Factor HR has is a field on a record ERPNext already owns, and
adding a doctype for it would mean a person existing twice. These ship as
`Custom Field` fixtures — see `fixtures` in `manna_hr/hooks.py` and
`CUSTOM_FIELDS` in `manna_hr/install.py`.

| On | Fields |
|---|---|
| `Employee` | work location, allow-remote-punch, Factor HR id, nationality, father / mother / spouse, religion, PAN, confirmation date |
| `Employee Onboarding` | the candidate's own details, so a candidate is not a doctype shadowing `Employee` |
| `Employee Checkin` | source, geofence result, distance in metres |
| `Asset` | the one detail box Assets Details draws |

---

## 14. Where the schema lives, and what that costs

**The site is the source of truth.** Every doctype above was created on
`mannarubber.m.frappe.cloud` as a *custom* doctype — `custom: 1` is what lets
one be created at all on a site with no developer mode — and the definitions are
not kept in this repo. Somebody can add a field in Desk this afternoon and
nothing here has to be told.

That is a deliberate choice, and it has three consequences worth stating plainly
rather than discovering.

**The controllers do not run.** A custom doctype is a table and a form; the
`.py` beside it in `manna_hr/manna_hr/doctype/` is not part of it. So today
nothing on the server derives a loan's outstanding balance, refuses an
over-recovery, strips the name off an anonymous survey response, or turns away a
device whose id would make every punch off it look like a phone. Those rules are
written, tested and inert. **`CLAUDE.md` §1 says attendance is payroll and a rule
enforced only in a client is a suggestion — that rule is currently suspended,
and it is the largest open item in this project.**

**Two checks that used to run on every commit now need credentials.** They read
the JSON and there is none: that the workflow's five states match the `status`
field exactly, and that every field the dashboard asks for is on the doctype.
Both failures are silent on a live site. `python tools/check_schema.py` makes
them against the site instead — run it after anybody edits a doctype in Desk.

**Getting back is one command.** `python tools/export_from_site.py --apply`
writes the definitions into `manna_hr/manna_hr/doctype/…` in the app's own
layout. Do that before a proper install, and read the diff while you are there —
it is the only way to see what somebody changed in Desk.

```bash
python tools/export_from_site.py --apply     # schema back into the repo
# then delete the custom doctypes on the site, and:
bench get-app manna_hr https://github.com/Manna-Group-of-Companies/MannaHRM
bench --site mannarubber.m.frappe.cloud install-app manna_hr
```

**Delete the custom doctypes before installing the app.** A standard doctype and
a custom one of the same name is a site that fails to migrate, and the error
names neither.

## 15. The tools

| | |
|---|---|
| `tools/export_from_site.py` | The site's definitions, back into the repo's JSON layout |
| `tools/check_schema.py` | What the code assumes, checked against the site |

`install_all.py`, `install_all.console.js` and `install_doctype.py` were how the
doctypes got onto the site and have been removed. They read the repo's JSON,
which no longer exists; keeping them would mean keeping a second, staler answer
to what the schema is.
