# The site, running locally

A React site — JavaScript, Tailwind, axios — in [`client/`](../client/), built by
Vite and served by the small proxy in [`server/`](../server/).

```bash
npm install                 # once
cp .env.example .env        # once, then put the key in it
npm run dev                 # the proxy and Vite, together
```

Vite prints the address to open. For a built copy instead:

```bash
npm run build && npm start  # then http://localhost:8770
```

## Layout

| Path | What |
|---|---|
| `client/` | Vite's root. `index.html` and the three build configs live here. |
| `client/index.html` | The one page. Vite's entry. |
| `client/src/routes/` | Which URL is which page — `paths.js` is the grammar, `registry.jsx` the table of pages |
| `client/src/layout/` | The chrome: rail, top bar, page strip |
| `client/src/features/` | One directory per module, one file per page |
| `client/src/components/` | Shared UI |
| `client/src/api/` | The client and the loaders |
| `client/src/data/` | Static tables — Factor HR's menus, columns and screen notes |
| `client/src/lib/` | Pure helpers: formatting, CSV, and the attendance rules |
| `client/src/store/` | The one store the whole site reads |
| `dist/` | What `npm run build` leaves at the repo root, and what the proxy serves |
| `server/` | `index.js` is the proxy, `dev.js` runs it beside Vite, `env.js` reads `.env` |
| `tests/` | `npm test` — the rules and the URL grammar, no browser needed |

## Addresses

Every page has one: `/employees/salary`, `/attendance/shifts`. A module's first
page drops the second segment — `/employees`, not `/employees/overview` — and an
unrecognised path lands on the Dashboard rather than a 404.

That is what `client/src/routes/` is for, and it is why the rail and the page strip are
real `<a href>` links: middle-click opens a tab, the status bar shows where a
link goes, and back does what back does. `server/index.js` answers any unmatched
path with `index.html`, which is the one thing deep links need from a server.

## The key

`.env` at the repo root, gitignored, read by both `server/index.js` and
`server/dev.js`. Anything already in the environment beats it, so a one-off
still works:

```bash
# Git Bash
ERP_KEY=... ERP_SECRET=... npm start

# PowerShell
$env:ERP_KEY='...'; $env:ERP_SECRET='...'; npm start
```

**Without a key the site does not look unconfigured — it looks broken.** Every
read answers 503, so every panel is empty, every list has no rows, and every
control that opens a document is dead because there is no document to open. The
one thing that says which of the two it is sits in the top bar, right of
*Hi admin*: a red dot reading **no API key**. Check there first.

The bridge reads the same site under `MANNA_API_KEY` / `MANNA_API_SECRET`. The
proxy accepts either spelling, so one `.env` serves both rather than one
credential being written down twice and rotated once.

## Why it needs a server rather than just opening the HTML

A `file://` page — or a page on any other origin — cannot call
`mannarubber.m.frappe.cloud` from the browser. Frappe pins its CORS header to
its own origin, so the request is refused before ERPNext ever sees it.

`server/index.js` therefore serves the site **and** proxies `/api/...` through to
ERPNext, so the browser only ever talks to one origin. It has **no npm
dependencies** — Node's own `http` and `fetch` and nothing else. This process
holds a key that can write attendance for the whole group, and a dependency tree
is a supply chain.

## Two deliberate limits

**The token never reaches the browser.** It is read from the environment in
`server/index.js` and attached server-side. Nothing the browser loads knows it,
so the page can be opened, shared or screenshotted without leaking a key that
can write attendance for the whole group.

**Only GET is proxied, and only to an allowlist of doctypes.** This process
holds a System Manager token; a general-purpose proxy on localhost would hand
the entire site to anything that can reach port 8770.

## Writing to the site — off by default

Three screens can write: Approvals decides requests, Salary Master saves a pay
revision as drafts, and Employee Master's **Create Employee** wizard adds a new
joiner. The proxy refuses all three unless it is started for them:

```bash
ERP_WRITE=1 npm start                    # Git Bash
$env:ERP_WRITE='1'; npm start            # PowerShell
```

Without it every decision is applied to the screen, said to be screen-only, and
undone by the next refresh. The startup banner says which mode it is in.

**What the flag opens is narrow on purpose.** Two shapes and no more:

| | Doctypes | Limit |
|---|---|---|
| `PUT` | `Attendance Regularization`, `Employee Attendance Regularization`, `Leave Application` | only `status` and `decision_note` |
| `POST` | `Salary Component`, `Salary Structure`, `Salary Structure Assignment` | drafts only — any `docstatus` but 0 is refused |
| `POST` | `Employee` | the Create Employee wizard's nine fields |

Any other doctype, field or method still 403s, and every write is printed to the
console. `Salary Slip` and `Payroll Entry` are not reachable through the proxy
at all: **submitting is what decides what somebody is paid, and it stays on the
site.** `Employee` is the one non-payroll entry, and it is there because an
employee record is a person on file rather than a transaction — it is not
submittable and on its own it pays nobody.

**The one thing to know before switching it on:** this site has no login of its
own. Every decision lands as the API token's user, so the audit trail says
*dashboard token*, not the person at the keyboard. Fine for testing against a
scratch site; not the way real approvals should be made.

## The original single-file page

[`legacy/dashboard-v1.html`](legacy/dashboard-v1.html) is the page this was
converted from — one file, no build step, kept for reference. Nothing serves it
any more.

---

## What it shows today

Live, from the real site:

- Active headcount, biometric enrolment, reporting lines, shift assignment
- Headcount by company and by department
- Today's punches
- Setup readiness — what the attendance engine still needs
- Employee Master as Factor HR draws it — a card per person, with the list view
  behind a toggle — searchable and filterable by status, department, designation
  and biometric enrolment
- On Board, page for page against Factor HR's own menu: Candidate Master,
  Create Letter / Form, Document Entry, Assets Details, Assets Assignment, All
- Employees, the same way: Employee Master, Salary Master, Employee Detail,
  CTC / Earnings, Categories, Calendar, All — plus **Create Employee**
  (`/employees/new`), their three-step wizard, which Add New Employee opens.
  Basic Details is a copy, measured off the screenshot down to the narrow Title
  box. Job Details (twelve fields: the appointment, probation, how it ends, and
  contact) and Job Organization (nine: where in the group, role and reporting,
  how attendance is judged, and phone punching) are what this site holds under
  those two headings rather than copies, and each says so on the page. Every
  fieldname on all three was probed against the live doctype before it was wired
- Attendance, the same way: Attendance Regularization, Submit Attendance,
  In Out Activities Report, Daily Detail Attendance Report, Monthly Basic
  Attendance, Statutory Reports, Manage Shift, All
- One person's whole record, and the holiday lists — including who has none

**On Board's four unbuilt pages are pages rather than absences.** Only Create
Letter / Form has ever been screenshotted in Factor HR, so the rest are built
from what our site can answer — passport fields off `Employee`, the ERPNext
`Asset` register and its custodians — and each says plainly which it is. A
screen that is empty on both sides is a decision not to build, and it only
reads as one if it is where Factor HR puts it.

**Employee Detail reads one whole record.** Click a row in the master list and
the page fetches that person's `Employee` document and shows every field it has
a name for, blanks included, and counts them. **The blanks are the finding**
rather than a rendering fault: the migration loaded the master and not the
paperwork behind it.

**Categories is their `Category Type` master, page 1 of 2.** The menu item does
not open a list of categories — it opens a list of *kinds* of category, eight of
them, each with its own values behind a **View Category** button. Two of the
five visible are not groupings at all: **Gratuity Applicable and LWF Applicable
are statutory pay treatment**, filed in the same table as Department, and
neither has an ERPNext field to import onto — gratuity is a `Gratuity Rule`, LWF
a salary component. Both have to be rebuilt as rules, and their lists are how
you check the rules were written right. **View Category opens a second screen**
— theirs, photographed 29 August 2026: Code, Description, Status, the three row
actions, its own search and its own pager. Ours fills it from the doctype the
type reads onto, with search and pager working for real, Status filled only
where our side has such a field, and their photographed list reconciled against
ours by name. Search and Refresh on the list screen work here too; Add, Import
and the row Edit act on a master, so they open it on the site. The pager stays dead, still reading *1 to 5 of 8* — the
shortest way to say three category types exist that nobody here has seen — and
so does row Delete, because there is no Category Type on our side to delete.

**The Calendar is factoHR's calendar screen.** Toolbar, calendar name and its
default flag, month strip, and a six-week grid with the week number down the
gutter and the day number in the corner — including their Sunday-start week
numbering, which reads 31 where ISO says 30. What is in the cells is ours: the
named holiday, the weekly off, and anybody whose first day it was. `Calendar
Name` is the Holiday List and `Default Calendar` is the company's
`default_holiday_list`. Its toolbar behaves the way every toolbar here now does
— see **Controls that write** below.

**Monthly Basic groups.** Its *Filter By* control has never been screenshotted
open on their side, so the five groupings offered are ours — the same ones the
CTC and In / Out reports use. It sections the muster and sorts the CSV the same
way, because a report that groups on screen and not in the export is two
reports.

**Employee Detail reaches the child tables for one person.** Past History,
Qualification and Transfer / Promotion live in child tables, which a list call
cannot reach — 161 document reads for a report over everybody. For a report of
one person the record has already been read whole, so those three tick boxes
come alive the moment Particular Employee is set, and the tables are drawn under
the record. Skill Set and Nominee stay dead and say why: ERPNext's `Employee`
has no child table for either, so no number of reads would find them.

**Every report screen names its people.** Employee Detail, Daily Detail, CTC /
Earnings and Statutory Reports all copy Factor HR in generating nothing until
Generate is pressed — right for the report, whose filters nobody has chosen yet,
and wrong for the screen, because a page with one sentence on it cannot be told
from a page whose read failed. So each of them now lists **who the report would
cover**, at the criteria on its own form, from the employee list the dashboard
read once at load. No request is made to draw it; a row opens that person's
profile. Employee Profile's own "nobody picked" state is the same list, and
there the click is how somebody is picked. `client/src/components/People.jsx`.

**Controls that write open the site.** Add, Edit, Delete, Import and the rest
are not drawn dead any more: each one opens the same job on the ERPNext site in
a new tab — a new `Employee`, this `Holiday List`, ERPNext's Data Import wizard.
Nothing about the proxy changed to allow it, and nothing needed to: a link needs
no allowlist, no method and no token. The write still happens in the one place
the rules guarding it run (CLAUDE.md §1), under whoever is logged in over there
rather than under this process's System Manager key.

The site they open is whatever `ERP_URL` the proxy was started with, which the
page asks for once on `/api/site` — the base URL and nothing else. Until that
answers, and wherever there is genuinely no document to open, the control falls
back to disabled with the reason on it. Three kinds of control stay disabled for
good: the ones whose data does not exist here yet (Submit Attendance, the salary
lock), the ones whose Factor HR screen has never been photographed (Work
Pattern, Monthly Basic's Filter By, page 2 of Category Type), and background
scheduling, which needs something running when nobody is watching. `client/src/lib/desk.js`
holds the routes and `Desk` in `client/src/components/ui.jsx` draws them.

**Manage Shift has both its halves.** The Shift half is Factor HR's own table,
read off a photograph, with Show and Search working over it. The **Work Pattern**
half is ours — theirs has never been opened — and it is the roster: who has a
dated `Shift Assignment`, who is on `default_shift` alone, and who has neither
and so cannot have a punch measured at all. It reads `Shift Assignment` once,
the first time somebody selects it, not on every page load.

**Salary Master and CTC / Earnings are empty on purpose.** Payroll has not been
started, and the proxy's allowlist has no payroll doctype on it — salary is the
one table where a read-only window on a System Manager token is still a leak.
Both pages say so rather than showing zeroes.

**Final Settlement is the one payroll page with a list on it, and the list is
not payroll.** Factor HR's screen is headed *FNF & Separation* and carries three
numbered stages; theirs had sixteen people waiting in the third. What this one
draws is who *this site* says is leaving or has left — a relieving date, a
resignation letter date, or a status that is no longer Active. That last test is
the one that matters: somebody serving notice is still Active, and is exactly
who the queue is for. The exit fields come off `Employee` in a read of this
page's own, made the first time somebody opens it. Nothing here can process a
settlement — `Full and Final Statement` ships with Frappe HR, which is not
installed — so the FNF column is a dash on every row and the table under the
list says why. See [FACTOHR_SCREENS.md](FACTOHR_SCREENS.md) §28.

**Daily Detail Attendance Report is their panel, and it generates.** Particular
Employee, Employee Status, Filter By, Report Period, the date range, the layout
chips and the Advance tab — and nothing *generated* until Generate is pressed,
which is their model. What stands where their blank screen does is the list of
people the report would cover, off records already read: see **Every report
screen names its people** below. It runs one row per person per day in factoHR's fourteen
columns; five of them are dashes for everybody, which is the deliverable rather
than a fault. Both chips work — Show Employee Grouping sections the output,
With Logo heads it — Filter By groups a level above, and the Excel button
exports the generated rows as CSV.

**Attendance Regularization is factoHR's screen, and it opens empty.** Their
title, cycle picker, status dot, search box, category box and four icons — and
their own "No Employee Selected · Please select employee for show
Regularization", because that empty state *is* the screen: their queue is one
person at a time. Pick somebody and it lists their open corrections for the
cycle in factoHR's twelve columns, four of which cannot be filled — `Original
In` / `Original Out` are the punch, which the request does not carry, and
`Day Status` / `AR Hours` are outputs of the policy engine. The same requests
are worked as a backlog on Dashboard → Approvals.

**Manage Shift is their SHIFT & WORK PATTERN screen**, and the column that
matters is `EMPLOYEE COUNT`: it is **0 on every row**, while `CATEGORY COUNT` is
not. Their own export names a shift against people, so both are only true if a
person gets their shift **through their category** rather than by being assigned
one. ERPNext's `Shift Assignment` is per person with dates and has no category
in it, so there is nothing per-person to export — it has to be derived from the
category master, which is the screen behind Employees → Categories. The two
pages are one mechanism. Shift names carry their company (`Hi-Tech
Pretreads-Office shift`) and have to go on carrying it, because ERPNext's `Shift
Type` has no company field and two companies' office shifts do not share a
window. The clipped last row is drawn clipped, counts and all.

**Attendance is eight pages of which one has a queue behind it.** The menu is
Factor HR's, item for item, and none of the pages under it has ever been
screenshotted — so each one says whether it is showing their export, our site,
or a shape of our own. Monthly Basic Attendance draws the real grid for the
current month against the live employee list, with every cell empty but the
Sundays: week-off is Sunday for 100% of the workforce, and it is the only cell
anybody can fill before shifts exist. Submit Attendance is a readiness check
rather than a button, because a month closed today would freeze a page of zeros
and hand it to payroll as fact.

**Today's panel will be empty, and that is correct.** `Employee Checkin` has no
rows until the fingerprint bridge is running and the phone app is live. The
panel says *nothing recorded* rather than showing 0%, because an empty
attendance table and an empty factory produce identical numbers and the
difference matters.

## What it does not show yet, and why

| Missing | Waiting on |
|---|---|
| Attendance, present/absent, late/early | shifts defined, then punches arriving |
| Leave balances and the leave queue | entitlements and opening balances from Factor HR |
| Payroll | salary structures, which have not been started |
| Geofence map | GPS coordinates per gate |

None of these are hard to add. All of them are waiting on data rather than on
code — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
