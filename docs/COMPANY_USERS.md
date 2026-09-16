# Company dashboards and their logins

Asked for on 16 September 2026: three dashboards — **HR, Attendance, Payroll** —
for each of four companies, and a login per company that sees only its own.

## The dashboards

Dashboard module → three new tabs after Approvals:

| Tab | Address | What it reads |
|---|---|---|
| HR Dashboard | `/dashboard/hr` | `Employee` (already loaded) and open `Leave Application` |
| Attendance Dashboard | `/dashboard/attendance` | today's `Employee Checkin`, approved leave today, the month's `Attendance`, pending corrections |
| Payroll Dashboard | `/dashboard/payroll` | the month's `Salary Slip`, `Salary Structure Assignment`, `Payroll Entry` |

Each page has a company strip and (Attendance, Payroll) a month picker. The
arithmetic is `client/src/lib/companydash.js`, tested in
`client/tests/companydash.test.js`.

## The logins

| Company | Login | Roles | Lock |
|---|---|---|---|
| Hi-Tech Rubber Industries | `hitechrubber@mannarubber.com` | HR Manager, HR User | User Permission → Company |
| Manna Rubber Products Private Limited | `mannarubber.products@mannarubber.com` | HR Manager, HR User | User Permission → Company |
| Manna Treads | `mannatreads@mannarubber.com` | HR Manager, HR User | User Permission → Company |
| Manna Tyre Retreads | `mannatyreretreads@mannarubber.com` | HR Manager, HR User | User Permission → Company |

Passwords follow Manna's `Stem@2026` convention and are **not** written here.
Change them after first sign-in.

**The lock is the User Permission, not the dashboard.** It applies to all
doctypes, so the site itself filters employees, punches, attendance and slips.
A company login reads exactly one `Company`, and the dashboard sets its picker
to that one — a courtesy, never the permission (CLAUDE.md §5).

Earlier logins — `hri.hr@`, `mrppl.hr@`, `mt.hr@`, `mtr.hr@`, `hitech.hr@`,
`treads.hr@`, `retreads.hr@` — were disabled on 16 September 2026, their roles
and Company locks removed. Delete them on the desk if they are not wanted.

`python tools/create_company_users.py` reports the state; `--apply` creates
anything missing.
