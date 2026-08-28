# The dashboard, running locally

The page is a React app — JavaScript, Tailwind, axios — in [`web/`](web/). Build
it once, then serve it:

```bash
cd app/web && npm install && npm run build     # once, and after any change

# Git Bash
ERP_KEY=... ERP_SECRET=... node app/serve.js

# PowerShell
$env:ERP_KEY='...'; $env:ERP_SECRET='...'; node app/serve.js
```

Then open **http://localhost:8770**. The startup banner says which page it is
serving, because the two look alike enough at a glance that *"my change isn't
showing up"* is otherwise a long afternoon.

## While working on it

```bash
node app/serve.js            # terminal 1 — the proxy, holding the token
cd app/web && npm run dev    # terminal 2 — Vite on :5173, hot reload
```

Open **http://localhost:5173**. Vite proxies `/api` through to `serve.js`, so
the browser still sees one origin and the token still never reaches it.

## The original single-file page is still here

`app/index.html` is the page this was converted from — one file, no build step.
`serve.js` falls back to it when `web/dist` has not been built, so a fresh
checkout serves *something* rather than a 404. It is frozen — new work goes in
`web/`.

---

## Why it needs a server rather than just opening the HTML

A `file://` page — or a page on any other origin — cannot call
`mannarubber.m.frappe.cloud` from the browser. Frappe pins its CORS header to
its own origin, so the request is refused before ERPNext ever sees it. This is
the same wall the sales dashboard hits, and why that one needs a Cloudflare
function in front of it.

`serve.js` therefore serves the page **and** proxies `/api/...` through to
ERPNext, so the browser only ever talks to one origin. It has **no npm
dependencies** — Node's own `http` and `fetch` and nothing else. This process
holds a key that can write attendance for the whole group, and a dependency tree
is a supply chain.

## Two deliberate limits

**The token never reaches the browser.** It is read from the environment in
`serve.js` and attached server-side. Nothing the browser loads knows it, so the
page can be opened, shared or screenshotted without leaking a key that can write
attendance for the whole group.

**Only GET is proxied, and only to an allowlist of doctypes.** This process
holds a System Manager token; a general-purpose proxy on localhost would hand
the entire site to anything that can reach port 8770.

---

## Deciding approvals — off by default

The Approvals page can approve and reject for real, but the proxy refuses to
write unless it is started for it:

```bash
# Git Bash
ERP_WRITE=1 ERP_KEY=... ERP_SECRET=... node app/serve.js

# PowerShell
$env:ERP_WRITE='1'; node app/serve.js
```

Without it every decision is applied to the screen, said to be screen-only, and
undone by the next refresh. The startup banner says which mode it is in.

**What the flag opens is narrow on purpose:** one `PUT`, onto
`Attendance Regularization` / `Employee Attendance Regularization` /
`Leave Application`, setting `status` or `decision_note`. Any other doctype,
field or method still 403s, and every write is printed to the console.

**Why it is safe to open at all.** The rule is not in this process. Setting
`status = Approved` on a regularization fires `on_update` *inside the site*,
which runs the self-approval guard and then writes the missing `Employee
Checkin` rows — writing the field is how the rule is invoked, not a way around
it. See [../CLAUDE.md](../CLAUDE.md) §1.

**The one thing to know before switching it on:** this page has no login of its
own. Every decision lands as the API token's user, so the audit trail says
*dashboard token*, not the person at the keyboard — and the self-approval guard
cannot see who that is. Fine for testing against a scratch site; not the way
real approvals should be made.

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
  CTC / Earnings, Categories, Calendar, All
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
you check the rules were written right. View Category is the one live control;
everything else on the screen writes, so it is drawn dead with the reason on it.
The pager is drawn dead too, still reading *1 to 5 of 8* — the shortest way to
say three category types exist that nobody here has seen.

**The Calendar is factoHR's calendar screen.** Toolbar, calendar name and its
default flag, month strip, and a six-week grid with the week number down the
gutter and the day number in the corner — including their Sunday-start week
numbering, which reads 31 where ISO says 30. What is in the cells is ours: the
named holiday, the weekly off, and anybody whose first day it was. `Calendar
Name` is the Holiday List and `Default Calendar` is the company's
`default_holiday_list`. New, Edit, Delete and Data Import are drawn disabled
with the reason on them — a holiday list is a document on the site.

**Salary Master and CTC / Earnings are empty on purpose.** Payroll has not been
started, and the proxy's allowlist has no payroll doctype on it — salary is the
one table where a read-only window on a System Manager token is still a leak.
Both pages say so rather than showing zeroes.

**Daily Detail Attendance Report is their panel, and it generates.** Particular
Employee, Employee Status, Filter By, Report Period, the date range, the layout
chips and the Advance tab — and nothing listed until Generate is pressed, which
is their model. It runs one row per person per day in factoHR's fourteen
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
code — see `docs/OPEN_QUESTIONS.md`.
