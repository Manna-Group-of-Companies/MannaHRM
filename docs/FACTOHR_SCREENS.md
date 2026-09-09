# Factor HR, screen by screen

A running log of what the live tenant actually shows, added to as screenshots
arrive. This supersedes [FACTOHR.md](FACTOHR.md), which was written from public
documentation and describes what the product *can* do rather than what Manna
uses.

Tenant: **HI-TECH PRETREADS**, `app3.factohr.com/HITECH`.

---

## 1 · Dashboard — seen 23 Aug 2026

### The numbers reconcile exactly

| Factor HR | Says | Our load |
|---|---|---|
| Active Employees | **160** | 160 ✓ |
| Left Employees | **344** | 344, skipped by default ✓ |
| New Employees | 9 | recent joiners |
| Licensed Employees | **160** | — |

The employee master export was complete and current. Nothing was missed.

**"Licensed Employees: 160"** is worth noting separately — Factor HR is billed
per licensed head. That number is the like-for-like figure for any cost
comparison, and ERPNext does not charge per employee at all.

### Enabled modules — narrower than the login page advertises

The left-hand navigation is the authority, and it reads:

> Dashboard · On Board · Employees · Attendance · Leave · Payroll · Loans ·
> Survey · Settings

**No Travel. No Performance Management.** The login page's slider advertises
both, along with a chatbot — that is factoHR's generic marketing, not this
tenant's configuration.

This answers open question **F6** and removes two modules from scope.

### What is switched on but unused

| Panel | State |
|---|---|
| Mood Analysis | empty |
| CEO Speak | 0 |
| Announcements | 0 |
| Wish Celebration — birthdays, work anniversaries, marriages | 0 |
| Important Files | 0 |
| Help Desk | **3 tickets, all Open**; 0 re-opened, 0 resolved |

The engagement features are present and untouched. Help Desk has been tried and
abandoned — three tickets, none resolved. Nothing here needs rebuilding unless
Manna says otherwise.

### The daily roster tiles

Factor HR's own attendance summary uses these buckets:

> **Total In · Not Yet In · Late-In · On Leave · Future Leave**

Read on Sunday 23 August: Total In 0, Not Yet In 160, Late-In 0, On Leave 0,
Future Leave 1.

**Note what it does not say.** All 160 are shown as *Not Yet In* on a day that
is the weekly off for every one of them. Factor HR's tile does not net off the
weekly off, so on a Sunday the dashboard reports the entire workforce as
outstanding.

Our `rules.py` treats weekly-off as its own state precisely so that this cannot
happen — a person who is not expected in is not somebody to chase. Worth keeping,
and worth showing Manna the difference.

### Reports available for export

From Quick Reports — these are the exports that exist without asking support:

| Report | Wanted for |
|---|---|
| **Leave Balance Report** | opening balances — **D3**, still outstanding |
| **Salary Register Report** | salary structures — **E1** |
| **Salary Pay-slip Report** | the three months of test payslips — **E3** |
| **ECR File** | EPFO return — confirms PF is live |
| IncomeTax Computation Register | TDS |
| Employee Earnings Report | |
| Daily Detail Attendance / In-Out Activity / Employee Detail | already supplied |

**Leave Balance Report and Salary Register Report are both one click away.**
Those two cover most of section D and the start of section E.

### Payroll — and a question

Payroll Summary and F&F Summary both default to **Mar-25**:

- Salary Proceed **134**
- Salary Not Proceed **6**
- Stop Salary 0 · Hold Salary 0 · Pending Arrears 0 · Stop TDS 0
- F&F: all zero, 0 on notice, 0 exit clearance pending

Two things do not add up and need asking:

1. **Mar-25 against an active headcount of 160.** If that is March 2025, the
   dashboard is showing a period seventeen months old.
2. **134 + 6 = 140, not 160.** Twenty people are in neither bucket.

### Almost nobody uses the web

Login Summary for August 2026 shows **0 to 4 web logins per day**, all month,
across the whole company.

That is a significant finding for how the ERPNext side should be shaped. The web
UI is effectively an admin tool for a handful of people; the workforce reaches
the system through fingerprint machines and phones, or not at all. Building rich
web self-service for 160 people would be building for an audience that has never
turned up.

---

## Open questions from this screen

1. **Is payroll actually being run in Factor HR today?** The summary shows
   Mar-25. If payroll moved elsewhere, section E of the request list can be
   dropped entirely.
2. **What are the 20 people** who are neither Salary Proceed nor Salary Not
   Proceed in that period?
3. **Who are the 2–4 daily web users?** If it is only HR and IT, the ERPNext
   dashboard should be built for them and everyone else served by the phone.
4. **Is Help Desk wanted?** Three tickets, none resolved, suggests not.


---

## 2 · Decisions taken 23 Aug 2026

| Decision | Effect |
|---|---|
| **Payroll is not processed in Factor HR** — it is calculated by hand | Section E drops out of the initial release entirely. The Salary Register is background, not a target. |
| **Help Desk not wanted** | Nothing to build. Frappe Helpdesk stays uninstalled. |
| **The 20 people missing from the payroll buckets** | Left alone — there is no payroll to reconcile them against. |
| **Web dashboard audience: HR only** | Plus plant managers, for one specific job — see below. |
| **Everyone else uses the phone** | Which matches the login data: 0–4 web logins a day, all month. |

---

## 3 · New requirement — planned overtime

**Not in the original scope, and it has no Frappe HR equivalent.**

Plant managers decide *tomorrow's* overtime *today*: they pick the employees and
the hours intended for each, and submit it. One plant manager per plant, each
seeing only their own people.

This is a **forward-looking plan**, which is what makes it new. Frappe HR
measures overtime backwards — hours worked beyond a shift, derived from punches
after the fact. It has nothing that records an intention before the day starts,
and therefore nothing to compare the intention against afterwards.

### What it implies

- A new doctype, roughly `Overtime Plan`: date, plant, and a child table of
  employee + planned hours + reason.
- A **plant manager dashboard**, deliberately narrow — their own staff, and this
  one task. Not the HR dashboard with fields removed.
- Scoping is Manna's, and will be defined later.

### Worth deciding when the scope is written

- Does the plan **authorise** the overtime, so hours worked without one are not
  paid? Or is it a forecast, with actuals settled separately?
- Who approves it — the plant manager alone, or HR as well?
- What happens when somebody works more or less than planned? That gap is the
  whole reason to record a plan, so it needs a home on a report.
- How far ahead can it be entered? "Tomorrow" suggests one day; a weekend shift
  planned on Friday needs three.

---

## 4 · Leave — from the Leave Balance Report, as on 23 Aug 2026

160 employees, six leave types defined. **Only two are used.**

| Leave type | People with a balance | Total accrued | Total availed | Total balance |
|---|---|---|---|---|
| **Casual Leave** | 73 | 551.0 | 325.5 | **179.0** |
| **Leave Without Pay** | 0 | 0 | **1300.5** | 0 |
| Company Purpose | 0 | 0 | 0 | 0 |
| Maternity Leave | 0 | 0 | 0 | 0 |
| Privilege Leave | 0 | 0 | 0 | 0 |
| Sick Leave | 0 | 0 | 0 | 0 |

**Four of the six are defined and never used.** They can be left out of ERPNext
rather than carried across as empty scaffolding.

### 1,300 days of unpaid leave

Leave Without Pay is by far the largest number on the report — **1,300.5 days**
availed against 160 people. Whatever the leave year covers, that is roughly
eight days each, and it dwarfs the 325.5 days of Casual Leave taken.

So LWP is not an exception here; it is the main mechanism by which absence is
recorded. Any attendance rule that converts an unexplained absence into LWP will
be exercised hard, and needs to be right.

### Casual Leave accrual splits the workforce

| | People | Median joining date |
|---|---|---|
| Accrues Casual Leave | 72 | **Aug 2019** |
| Accrues nothing | 88 | **Jan 2026** |

Not by company and not by designation — Plant Helper appears in both groups. It
tracks **tenure**.

Of those who accrue, 66 have exactly **8.0 days**. Eight is suspiciously close to
one day per month for the eight months January to August, which would mean a
**calendar leave year with 12 days a year accruing monthly** — but that is a
hypothesis from one number, not a rule anybody has stated.

**Needed:** the actual rule. When does someone become eligible, how much do they
get, does it accrue monthly or arrive as an annual grant, and does the leave year
run January or April? ERPNext's fiscal year is April–March, and if the leave year
is not, that has to be said explicitly.

---

## 5 · On Board — letters, 25 Aug 2026

Factor HR's On Board menu holds four groups: **Candidate Master**, **Letter /
Form / Memo**, **Document Management**, and **Assets Management**. Only the
letter side has been built so far.

### What was there

- **Candidate Master** — empty. Nothing has ever been entered.
- **Create Letter / Form** — **one letter, ever**: an Experience Certificate for
  MT-003 PRADEEP A K, dated 4 August 2023.
- **Letter Types** — 17 `.docx` formats.

One letter in three years against seventeen maintained formats. The formats are
the asset here; the issuing screen has barely been used.

### The 17 formats, and what they actually are

| | Count | Note |
|---|---|---|
| HR letters | 6 | Experience, Service Certificate, To Whom It May Concern, Gratuity, Salary Advance, Liquor Permit |
| Statutory PF/ESI forms | 7 | Form 5, 10, 10C, 11, 13R, 19, 25 |
| Offer letter | 1 | |
| Warning notice | 1 | Traffic Warning |
| **Unconvertible** | **2** | Form 2 Revised, Form 3A — content is in form controls or images, not text |

**Nine of the seventeen are government forms**, not letters. Their layout is
legally fixed, so they should be reproduced exactly or not at all — which makes
them a different job from the six real HR letters.

### Templating

Factor HR uses `{MergeField}` tokens. **118 distinct tokens across the set**, and
the naming is inconsistent — `EmployeeName`, `employeename` and `EMPLOYEENAME`
are the same field in three spellings, as are `doj`, `DOJ` and `DateOfJoining`.
Any renderer has to match case-insensitively, while preserving case on output so
`{EMPLOYEENAME}` still comes out in capitals.

### Loaded

Two doctypes, both custom, both working on the current plan:

- **`Letter Type`** — the template itself, as HTML, editable by HR in the browser
  rather than in Word. 15 loaded, categorised.
- **`Employee Letter`** — one issued letter. Content is **rendered once and
  frozen**: re-rendering later against changed employee data would quietly
  rewrite a document somebody has already been handed.

### The data the letters need, and what exists

Seven fields were added to `Employee` and backfilled from the Factor HR export:

| Field | Filled |
|---|---|
| `custom_nationality` | **126** |
| `custom_confirmation_date` | **72** |
| `custom_pan_no` | **2** |
| `custom_father_name` | **0** |
| `custom_mother_name` | **0** |
| `custom_spouse_name` | **0** |
| `custom_religion` | **0** |

**Four came back empty because they are empty in Factor HR** — checked directly:
Father Name, Mother Name, Spouse Name, Religion and Blood Group are populated for
**0 of 504 rows**. The columns exist and have never been filled.

`Pan No` is populated for all 504, but 502 of them read `PANNOTAVBL` — Factor
HR's placeholder for "none on record". Importing that would have printed a fake
PAN on three hundred people's letters, so it is filtered out.

**This matters for nine templates.** `{FatherName}` appears in nine of the
seventeen — including the Experience Certificate, which is the one letter Manna
has actually issued. That data does not exist in Factor HR either, so whoever
produced that certificate typed it in by hand.

So the honest position is: the templates are loaded and will merge, but several
will render with visible gaps until somebody decides whether those fields are
worth collecting. **Unresolved tokens will be shown, not silently blanked** — a
letter with `[[FatherName]]` on it is obviously unfinished; one with a blank
space looks finished and is not.

---

## 6 · Welcome / Start Up — 8 Sep 2026, 3pm

Read off the live tenant with the browser signed in, by pulling the same-origin
frame the page loads its content into (`/LandingPage/LandingPage/StartUp`). What
follows is the whole page; `client/src/data/startup.js` carries the lists in
their order and `client/src/features/dashboard/Dashboard.jsx` draws them.

### There are three tabs, and Engagement is not one of them

**Start Up · Approvals · Product Updates.** This repo had a separate Engagement
page on the assumption there was a fourth. There is not: Mood Analysis, Wish
Celebration, CEO Speak, Announcements and Important Files are all panels on
Start Up itself. The stub page was deleted on 8 Sep 2026 and its subject matter
moved to the front page, where somebody comparing the two screens will look for
it. **Approvals has fourteen sub-tabs**, and `client/src/data/approvals.js`
documents seven — that gap is real and is not closed yet.

### Employees Summary

| | |
|---|---|
| Active | 160 |
| New | 0 |
| Left | 347 |
| Licensed | 160 |

507 people have existed on this tenant and 347 of them have gone. "Licensed" is
what factoHR bills for; ERPNext does not licence per head at all, so that figure
has no successor and the panel says so rather than printing a number.

### Employee Attendance Summary

| Team Size | Total In | Not Yet In | Late-In | On Leave | Fut. Leave |
|---|---|---|---|---|---|
| 160 | 111 | 47 | 24 | 3 | 4 |

111 entries over 23 pages, so the list under the tiles is per punch and not per
person. **Late-In is the one bucket this app will not fill in.** It reads Shift
Type for its names and not its timings, so it has no shift window to compare a
punch against — and a `0` printed beside Factor HR's `24` is a claim that
nobody was late, which is worse than a dash. See `lib/summary.startupBuckets`.

### Payroll Summary

Salary Proceed 134, Salary Not Proceed 6, and Stop Salary / Hold Salary /
Pending ARREARS / Stop TDS all 0. Every one is a `Salary Slip` state. Nothing on
this site has run a payroll, so all six read "—" here.

**Stop Salary and Hold Salary have no field in hrms at all.** Factor HR carries
them as per-person holds; one of the two would become a Custom Field on Employee
if anybody asks for it. Nobody has.

### F&F Summary

F&F Proceed, F&F Unfinalized, F&F Pending, Exit Clearance Pending, On Notice —
**all five read 0**, on a tenant with 347 leavers. Factor HR's exit module is
switched on there and has never been used. `Full and Final Statement` and
`Employee Separation` are both stock Frappe HR and have no row on this site
either, so this is not a gap between the two systems.

### Wish Celebration

Birthdays (1) — EBIN JOY, 08-09 — with Work and Marriage tabs beside it, both
empty. Birthdays and work anniversaries are both off the Employee record here.
**Marriage has no successor**: ERPNext's Employee has no wedding date under any
name. `lib/summary.celebrations` matches on `MM-DD` and throws the year away,
which is also why its window is a list of days rather than a range — a window
crossing 31 December is two ranges, and that is where the off-by-one lives.

### Empty on their side too

Mood Analysis, Important Files (0), CEO Speak (0) and Announcements (0). Four
features switched on at that tenant that no employee has ever used. They are
drawn here as empty panels rather than left off, each with one sentence saying
what it would take — a panel missing from this side reads as work outstanding,
and it is not.

### factoHR's own, and going with the product

- **Help Desk** — Open 3, Re-opened 0, Resolved 0, Total 3. Tickets raised
  *with factoHR*, about factoHR.
- **Support Escalation Matrix** — four named people at factoHR, Level 1 to
  Level 4. Drawn here with the levels and no names, because **Manna has no
  escalation ladder written down**: "attendance is wrong and payroll runs on
  Friday" has no named owner. That is a finding, not a rendering problem.
- **Product Updates** — factoHR's release notes about factoHR. The tab is kept
  and carries this system's own notes instead; see `client/src/data/updates.js`.
- **Login Summary** — web logins a day, as a bar chart. Frappe keeps
  `Activity Log`, so it could be built. Nobody has said who the question is for.

### Quick Links and Quick Reports

Ten and nine, and **fifteen of the nineteen land on a real page here**. The four
that do not are `Create Trouble Ticket` (factoHR's own desk), `ECR File` (the
EPFO return — a fixed-width file with a schema of its own, and the first
question is whether PF is even filed through this system), and
`IncomeTax Computation Register Report` (nobody has built the register on either
side). They are drawn struck through with the reason on hover rather than being
dropped: a row quietly missing from a list somebody is holding against theirs is
the one kind of gap this project exists to make visible.
`client/tests/startup.test.js` checks every one of the fifteen against the real
page table, so a page renamed anywhere fails there rather than under somebody's
finger.

---

## 7 · The whole menu — 8 Sep 2026

Read off the tenant by calling the Welcome page's own menu functions —
`GetTransactionMenuData`, `GetReportMenuData` and `GetSetupMenuData` — for each
of the eight modules on their rail. Not a screenshot: their menu data itself,
with the titles, groups and descriptions their product ships.
`client/src/data/factohr.js` carries all of it; every module's **All** tab draws
its own share, and Settings → Module coverage counts them.

### 160 items

| Module | Their menu | Answered here |
|---|---:|---:|
| On Board | 13 | 6 |
| Employees | 28 | 13 |
| Attendance | 32 | 15 |
| Leave | 14 | 7 |
| Payroll | 66 | 10 |
| Loans | 6 | 4 |
| Survey | 1 | 1 |
| **Total** | **160** | **54** |

**Dashboard and Settings have no menu of this kind** — their front page is tabs,
not a flyout — so they are not in the total.

### What this changes

Every estimate in this repo before today was made against the four or five
menus somebody had remembered to screenshot, and two of them were wrong in the
code: `LeaveAll.jsx` said Leave's menu was three items where it is fourteen, and
`AttendanceAll.jsx` said Attendance's was seven where it is twenty-six. Both
files stated it as fact, in a comment, in this repo's own voice. They have been
replaced by one page that reads the captured menu instead of recalling it.

**Payroll is 66 of the 160**, and forty-nine of those are reports. That is the
shape of the remaining work and it is not what the module list suggests: Payroll
looks like one module beside Attendance's one, and it is twice the size.

### The items worth naming

- **Manage Attendance Policy** is the attendance policy engine — roughly the
  30% of Factor HR that is not stock Frappe HR, and the part that decides what
  people are paid. See [FACTOHR.md](FACTOHR.md).
- **Online Attendance** — a punch typed into a browser — is the one item here
  that would be *refused* rather than built. A web punch with no device and no
  coordinate is exactly what the geofence exists to catch; it has to arrive as a
  correction with a reason on it, which is Attendance Regularization.
- **Manual Process Attendance** would let somebody hand-write an `Attendance`
  row, which CLAUDE.md §5 forbids from the inside: the row is generated from
  `Employee Checkin` by the shift job, and a hand-written one is invisible to
  the thing that would have created it.
- **MSP Report** (missed punches) is the attendance report worth building
  first: a missing punch is somebody's pay, and it is the input to every
  correction.
- **Organization Chart** is the cheapest item on the list — `reports_to` on
  Employee already holds the tree.
- **Form 16, Form 24Q, ECR File** are statutory and cannot exist before a
  payroll has been run. The first question about ECR is not how to generate it
  but whether PF is filed through this system at all.

### How the mapping is kept honest

An item is given a page here only when it is genuinely the same screen. Pointing
"Absent Report" at Daily Detail because both concern attendance would improve
the count and send somebody to the wrong page — and the count is the only reason
the page is worth having. `client/tests/startup.test.js` asserts the totals, that
every mapped page exists, and that no row has been dropped to make the list
shorter.


### Fifteen of them were built the same day

Everything the site could already answer, without a new doctype, a payroll run
or the policy engine. `client/src/lib/reports.js` is the arithmetic,
`client/src/data/reports.js` the fifteen specifications, and one page draws them
all — fifteen hand-built report screens drift until the same column heading
means two things on two of them.

| Module | Built |
|---|---|
| Employees | New Joining · Employee Birthday · Employees Directory · Weekoff Holiday Report · Organization Chart |
| Attendance | Present · Absent · MSP · In/Out Count · Employee Shift · Head Count And Attendance |
| Leave | Application History · Pending Applications · Availed Detail · Monthly Availed |

**Every one carries a note saying what it cannot see**, drawn under the table
rather than behind a help icon. Each of these is read to decide what somebody is
paid and each has an edge it is blind to — a punch that has not arrived, a shift
with no timings, a month boundary — and saying so on the page is cheaper than
the argument afterwards. The two worth naming:

- **Absent Report** takes out approved leave and anybody with any punch, and
  what is left is still not proof: a machine that has not delivered its log
  looks exactly the same. Nothing downstream reads it — a day is decided by the
  shift job.
- **MSP Report** finds an odd number of punches, which means one is missing. It
  is the list HR can act on the same morning, and the fix is a correction that
  writes the missing punch, never a hand-written `Attendance` row.

### One bug came out of building them

`date_of_birth` **was never asked for in the employee read.** Both the Start Up
page's Wish Celebration and the Employee Birthday report read it, so both drew
"nobody" against a site with five hundred people on it. Added to `EMP_FIELDS` in
`client/src/api/load.js`.


### Every one of the 160 has an address

Built 8 September 2026. 54 open a page that does the work; the other **106 open
a page that says what the item is, what it would take, and what the site holds
towards it today** — `client/src/features/reports/Blueprint.jsx`, with the text
in `client/src/data/needs.js`.

A page rather than a row on a list, because this app is read beside Factor HR to
decide what to build next, and a menu item that exists there and is only a table
row here is indistinguishable from one nobody has looked at. Every one of these
has been looked at: the description is theirs, the plan is ours, the doctype it
would read from is named, and the live counts say whether the inputs exist
before anybody starts.

**The addresses are derived from their own titles**, not kept in a list —
`In/Out Count Report` is `/attendance/in-out-count-report`. Two hand-kept lists
of 106 drift, and the drift would show up as a link that 404s on the page whose
whole job is to prove nothing was left out. `client/tests/blueprints.test.js`
asserts every one of the 160 resolves, that no slug collides, and that no
blueprint slug lands on a page that already exists.

**Two of the 106 say the item should not be built**, and say why on the page
rather than being left off the menu:

- **Online Attendance** — a punch typed into a browser, with no device and no
  coordinate, which is exactly what the geofence exists to catch.
- **Manual Process Attendance** — it would let somebody hand-write an
  `Attendance` row, which CLAUDE.md §5 forbids from the inside.

**Most of the remaining 106 are not blocked on code**, and each page says which
kind of blocked it is. Forty-nine of Payroll's are reports over a `Salary Slip`
and one payroll run unblocks nearly all of them at once. Leave's are waiting on
a ledger that is stock hrms and empty here. `Manage Attendance Policy` is
waiting on somebody writing the policy down.
