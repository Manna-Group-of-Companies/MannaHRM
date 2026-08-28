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

### 5.1 · The menu itself, 28 Aug 2026

The On Board flyout was captured for the first time. Under the four groups it
reads, in this order:

> Candidate Master · **Create Letter / Form** · **Document Entry** ·
> **Assets Details** · **Assets Assignment** · **All**

**Only Create Letter / Form has ever been opened.** The other four are known
from this menu and nothing else — what Document Entry holds, whether the asset
register has a single row in it, and what `All` even lists are all unanswered.

The dashboard now carries all six as pages under On Board, on the same principle
as the approvals tabs: a screen that is empty over there is a decision not to
build, and that only reads as a decision when it has the same standing in the
nav that it has in factoHR. Each page says which side of the line it stands on —
read off our site, read off factoHR on a named date, or not seen.

What they stand on here:

| Page | Behind it | State |
|---|---|---|
| Candidate Master | `Job Applicant` → `Employee Onboarding` | empty both sides |
| Create Letter / Form | `Letter Type` + `Employee Letter` | live, 15 formats |
| Document Entry | Employee's own passport fields, nothing more | not built |
| Assets Details | ERPNext `Asset` + `Asset Category` | stock, empty |
| Assets Assignment | `Asset.custodian` + `Asset Movement` | stock, empty |
| All | the module index and its open questions | — |

**Documents is the only one of the five with nothing behind it at all.** ERPNext
has no employee document register with issue and expiry dates; everything else
on the menu is configuration and a data load. That is roughly a day of work
plus a decision — and the decision comes first, because nobody has said whether
document expiry is chased today.

### Still needed from On Board

- **Is Document Entry used over there?** If it is empty in factoHR too, it is a
  decision not to build rather than a gap.
- **Is there an asset register anywhere** — factoHR, a spreadsheet, or nothing?
  It decides whether Assets is a load or a fresh start.
- **Are issued assets signed for**, and is an unreturned one deducted on
  separation? Nothing stock records that the employee agreed to hold it.

---

## 6 · Approvals — the queue tabs, 28 Aug 2026

The approvals bar reads, left to right, with its counts:

| Tab | Waiting |
|---|---|
| Leave | **3** |
| Attendance | **50** |
| Employee Profile | 0 |
| Onboarding | 0 |
| Transfer & Promotion | 0 |
| Letter Assignment | 0 |
| Other | — (no count shown) |

**Attendance has moved: 50, against the 35 the dashboard's own note recorded on
23 Aug** — that earlier figure appears nowhere else in these docs, so treat it
as one reading rather than a series. Fifteen more in five days, about three a
day, is the load any replacement queue carries from go-live.

**Five of the seven queues are empty in Factor HR itself**, and have been at
every look. That is the argument for not building them: what is wanted from
Employee Profile, Onboarding, Transfer & Promotion, Letter Assignment and Other
is a decision, not a backlog.

Two of those five are free anyway — **Onboarding** and **Transfer & Promotion**
are stock Frappe HR doctypes (`Employee Onboarding`, `Employee Transfer`,
`Employee Promotion`) and need a template and a Workflow rather than code.
**Employee Profile** is the one with no stock equivalent: Frappe has no
request-and-approve step in front of an employee record edit.

The dashboard's Approvals page now carries all seven tabs with the field list
each queue would hold, per field marked *Live*, *Stock* or *To build*. The field
list is the thing to argue with — see `app/index.html`, `APPROVALS`.

### Still needed

- **What Factor HR's `Other` tab can hold.** Never screenshotted, empty at every
  look. Our guess list is planned overtime, shift change, separation, asset
  issue, advances and the monthly attendance freeze.
- **Whether the `Reason` on an attendance correction is a fixed list.** The
  export shows `Forgot to Punch`, which reads like a picked value. If it is, the
  list itself is needed.

---

## 7 · Approvals — inside a Time Correction card, 28 Aug 2026

Three cards for one employee, **ARBIN EKKA (HRI-017)**, 19–21 Aug. The card is
the most detailed screen captured so far and it settles most of §6's open
questions.

### What one card holds

| On the card | Reading | Where it comes from |
|---|---|---|
| Header | `DocNo : 47299 · Status : Initiated · Last Action On : 24-Aug-2026 17:15 · Last Action By : HRI-040 - SURESH KUMAR P S` | the document, its workflow state, and its audit trail |
| Kind | **TIME CORRECTION** | the card is labelled, which is how one queue holds several kinds |
| Day | `19-Aug-2026 · Wednesday`, `Applied On : 24-Aug-2026` | |
| Shift | `Hi-Tech Rubber Industries-Production shift4` | company and shift, named in full |
| Times | **Planned** `08:30 / 16:30` beside **Attended** `06:42 / 18:00` | the shift window against the real punches |
| Hours | `Working: 11 hrs 18 minutes`, `Overtime: 3 hrs 18 minutes`, and a **Time Log** link | computed from the two pairs |
| The ask | `Correction for: Overtime marking`, `Hours: 3 hrs 0 minutes`, `Reason: System Error`, `Remarks:` blank | |
| Decide | green tick, red cross, **View Details** | |

### The toolbar, with every dropdown opened

Above the list: a select-all box, then three dropdowns whose contents were
captured on 28 Aug.

| Dropdown | Options |
|---|---|
| **Select Bulk Action** | Bulk Approve / Reject · Import / Export Data *(opens a dialog — see below)* |
| **Grouping** | Employee Wise *(default)* · Request Type Wise · Reporting Manager Wise |
| **Window** | All · Last 10 / 20 / 50 Activities *(50 default)* · Last 7 Days · Last 31 Days · Past Two Months · Past Three Months |

Plus a search box and a refresh button.

**Import / Export Data opens a dialog**, not an action: three buttons —
**Export**, **Download Template**, **Import Data** — and Close.

That third button is the one to think about. **Factor HR can write attendance
from a spreadsheet**, and whoever has the menu can do it: no shift check, no
geofence, no approver. If that is in use today, it is both a habit to replace
and the strongest argument in the file for [CLAUDE.md](../CLAUDE.md) §1 — a
rule enforced anywhere but the server is a suggestion.

**Worth asking:** is Import Data used, and by whom? If HR loads a month of
corrected attendance from Excel each cycle, that workflow has to be replaced by
something, not simply dropped.

Two things follow from these lists. **The window mixes counts and dates** — four
options count activities and four count days, so "how much am I looking at" has
two different meanings behind one control. And **Reporting Manager Wise is the
grouping that matters**: it is the queue an approver actually owns, and it is
the one that makes an employee with no reporting line visible instead of
letting the request sit unowned.

### What this settles

- **The original punch is shown, never replaced.** `Planned | Attended` side by
  side, confirming FACTOHR_DATA §6 from the screen rather than the export.
- **`Reason` is a picked value.** `System Error` on all three — a list, not free
  text. The list itself is still needed.
- **`Remarks` is a separate field** and is empty on all three samples.
- **The claimed hours are their own number.** `Hours: 3 hrs 0 minutes` is a
  round 3, while the computed overtime is `3 hrs 18 minutes`. **The claim is not
  the calculation** — somebody rounds, and that rounding is what gets paid.
  Which of the two is the payroll figure is now an open question.
- **The correction has a type.** `Correction for: Overtime marking` — the
  employee is not asking for a missed punch to be added, but for hours already
  attended to be marked as overtime. Our doctype has no field for this.
- **Factor HR's open state is `Initiated`.** Ours is `Pending Approval`; the
  dashboard reads either.

### Two things worth raising with HR

**Somebody else is raising these.** All three requests for HRI-017 carry
`Last Action By: HRI-040 - SURESH KUMAR P S`. If a supervisor raises corrections
on a worker's behalf — likely, where factory staff have no login — then
"employee raises, manager approves" is the wrong shape, and the request needs to
record both the person it is about and the person who typed it.

**Three consecutive 11-hour days, claimed as 3 hours' overtime each, corrected
five days later.** Whatever the attendance policy says about overtime, this is
the pattern it has to handle, and it is money.

### Still open

- The `Reason` list, in full.
- The `Correction for` list — `Overtime marking` is one value; what are the rest?
- Whether `Hours` (claimed) or the computed overtime is what payroll uses.

---

## 8 · Approvals — the activity grid, 28 Aug 2026

A second, quite different approval screen: a **grid**, not a stack of cards,
reached with **Filter Activity Type: Nominee**. Empty at the time of the
screenshot, and its empty text is the interesting part.

### The screen

| Toolbar | Save Approval Changes · Refresh Approval Activities · Approval Activities Log · Bulk Approval · Export |
|---|---|
| **Filters** | Filter Activity Type (**Nominee**) · Filter By Period (Last 50 Activities) |
| **Columns** | ☐ · Reference No. · Date · Employee · Description · Remarks · Current Status · **Your Action** · Last Action By |
| **Per column** | a filter box under every heading |
| **Empty** | *No pending at your end* |

### Three things this settles

**Decisions are staged, not applied.** `Your Action` is set per row and nothing
happens until **Save Approval Changes**. That is a better model than a tick that
fires on click, and it is worth copying rather than improving on: an approver
working down thirty corrections should be able to change their mind on row four
before anything is written.

**"No pending at your end" — the queue is per approver.** Not "no records": no
records *of yours*. Factor HR scopes the queue to whoever is logged in. **Our
dashboard does not** — it shows every open request to anybody who opens the
page. That is fine for a read-only comparison tool and would be a leak in the
real thing, and it is the same trap as the Company user-permission note in
[CLAUDE.md](../CLAUDE.md) §5: the default is open, so the omission is a leak
rather than a lockout.

**Nominee declarations route through approvals.** `Nominee` is an activity type,
which means PF and gratuity nominations are approved rather than self-served.
Nobody has said whether Manna wants that — it was not on any request list — but
Factor HR holds it today.

### Still open

- **The full activity type list.** One value seen; the dropdown was not opened.
- **What Approval Activities Log holds** — decisions already taken, presumably,
  and how far back.
- **Whether Bulk Approval skips anything** a per-row approval would check. If it
  does, it is the button that lets fifty corrections through unread.

---

## 9 · Employees — the sub-menu, 28 Aug 2026

The left-hand menu under **Employees**, in its order:

> Employee Master · Salary Master · Employee Detail · CTC / Earnings ·
> Categories · Calendar · All

Seven items. This is the fourth module whose sub-menu has been captured, and it
is the first one where **more than half of it is payroll wearing an HR label**:
Salary Master and CTC / Earnings are both salary structure, filed under
Employees because that is where the person is.

### What each one appears to be

| Item | What it holds | Ours |
|---|---|---|
| **Employee Master** | the searchable list — code, name, company, department | live, the Directory page |
| **Salary Master** | a salary structure per person, with effective dates | nothing — payroll not started |
| **Employee Detail** | ~~one whole record~~ — **a report screen**, see §15 | the criteria form, plus one record in full |
| **CTC / Earnings** | cost to company and the earning heads under it | `ctc` exists on `Employee`; the page counts who carries one |
| **Categories** | a grouping master — **page not seen** | five link fields do this in ERPNext |
| **Calendar** | holidays and weekly offs, and probably a per-person month grid | holiday lists are live; the grid needs shifts and punches |
| **All** | the whole master, leavers included — 504 rows | 161 loaded, the 344 leavers skipped |

All seven now exist as pages on the dashboard, including the three that are
empty. **An empty page that says why it is empty is worth more than a missing
one**, because the missing one reads as an oversight and gets re-asked.

### Categories is the one to screenshot next — taken, see §14

It is the only item here whose contents cannot be guessed from the name. ERPNext
spreads the same idea over five separate fields — `department`, `designation`,
`grade`, `branch`, `employment_type` — and which of them Factor HR's Categories
corresponds to decides how the whole workforce is filed. If it is
Worker / Staff / Contract then it maps to `employment_type` and it carries pay
treatment with it, which makes it a payroll decision rather than a tidying one.

**One screenshot settles it.** Guessing does not — and when it was taken
(§14) the guess above turned out to be wrong in both halves: it is not one
list, and two of its rows are not groupings at all.

### What the sub-menu confirms about scope

Nothing in these seven is an attendance rule. The Employees module is a master
and a set of reports over it, and Frappe HR already has the doctypes for all of
it. That holds the estimate where [FACTOHR.md](FACTOHR.md) put it: about 70% of
Factor HR is stock Frappe HR, and the 30% that is not is the attendance policy
engine — which lives two menus down.

### Still open

- ~~**The Categories page itself**, as above.~~ Answered in §14, which opens
  three new questions of its own.
- ~~**Whether Employee Detail is editable by the employee**~~ — moot: §15 shows
  it is a report screen, so nothing on it is editable by anybody. The question
  survives about the *record* behind it, which Factor HR must have somewhere. It
  decides whether a change of address is a self-service form or a request that
  routes through the approval queue in §6 — where `Profile Update` is already
  one of the seven tabs.
- **What Salary Master shows to a non-payroll HR user.** If it is visible to
  everybody with an HR login, the like-for-like ERPNext permission is not the
  default and has to be built deliberately.

---

## 10 · Attendance — the sub-menu, 28 Aug 2026

The Attendance module's second-level menu, read off the tenant:

> Attendance Regularization · Submit Attendance · In Out Activities Report ·
> Daily Detail Attendance Report · Monthly Basic Attendance · Statutory
> Reports · Manage Shift · All

Eight items. **None of the pages underneath them has been opened**, so what
follows is what the menu itself settles, and nothing more.

### Three of the eight are reports, and we hold two of them

| Menu item | Export in hand? |
|---|---|
| In Out Activities Report | **yes** — `rptInOutActivitiesSelfiePunch`, both punch streams |
| Daily Detail Attendance Report | **yes** — the one confirmed shift timing came out of it |
| **Monthly Basic Attendance** | **no** |

**That is a concrete ask.** The monthly grid is the sheet payroll is calculated
from by hand today, so it is the closest thing to a specification of what the
policy engine has to produce. It is one export, and nobody has requested it yet.

### Submit Attendance is a screen, not a background job

It has its own menu item, which means somebody sits down and closes the month.
Frappe HR has no equivalent gate at all — attendance rows stay editable for as
long as the permission lasts. This is a control Manna has today and would lose
by default, and it is now the second page on our own Attendance menu.

**Except that the list behind it is empty — see §21.** They have the gate and
have never closed a month with it.

### The policy engine has no menu item

Nothing on this menu is the late and early forgiveness counts, the deduction
target, the overtime rules or the grace periods. So the engine is
*configuration* reached from somewhere else — which means **its rules cannot be
recovered from screenshots of this module**. They have to be asked for, field by
field, or read out of Manage Shift once that page is opened.

Worth saying plainly: the 30 per cent of Factor HR that Frappe HR has no answer
for is the one part of it we still cannot see.

### Statutory Reports sits under Attendance, not Payroll

A question rather than a conclusion. The nine government forms we already hold
are PF and ESI forms attached to *people*, and the ECR file is a payroll output
— neither obviously belongs on an attendance menu. Either this page is
something else, or some statutory return here is driven by the muster rather
than by the salary. **One screenshot settles it**, and until then nothing is
claimed on our side.

### What was built

All eight now exist in the dashboard, in this order and under these names —
`app/index.html`, Attendance. Regularization, In Out Activities and Manage Shift
carry what was already known; Submit Attendance is a readiness check against
live counts rather than a button; Monthly Basic Attendance draws the real grid
for the current month, with every cell empty except the Sundays, because Sunday
is the only cell anybody can fill today.

### Still open

- **The Monthly Basic Attendance export.** One report, and the nearest thing to
  a written specification of the policy engine.
- **A screenshot of any of the eight pages.** All eight are currently a menu.
- **What Statutory Reports actually holds**, as above.
- **Whether “All” is a page or the menu spilling over.** Ours reads it as the
  module index, which is useful either way.

---

## 11 · Employees — Employee Master, 28 Aug 2026

The first page under Employees, and the one HR opens most. **A card per person**,
three across, with a list toggle at the right of the toolbar (the tooltip on the
grid icon reads *Grid View*, so cards are the default and the list is the
alternative).

### The screen

| Part | What it holds |
|---|---|
| **Header** | *Employee Master* · **Add New Employee** with a split-button caret · a ⋮ overflow menu |
| **Toolbar** | a coloured-dot **status** dropdown · *Search employee…* · **Filter** · **All** · refresh · grid / list |
| **Card** | initials avatar · *Mr* + NAME · status dot and word · code · designation · department · location |
| **Card actions** | a small pop-out icon and a **→** at the top right of each card |

### Three things it settles

**Employee codes are per-company sequences.** `HPT-001` through `HPT-006`,
running in order down the page — HPT being Hi-Tech Pretreads. So the code is
unique *within a company* and there is no reason to assume it is unique across
the group. Anything keyed on `employee_number` alone — an import, a device
enrolment, a payroll join — has to carry the company with it, or two people in
two companies will collide silently.

**Inactive is a third state, and it is in the default list.** Three of the first
six people shown are **Inactive**, sitting alongside Active ones with the
dropdown reading *All*. But the dashboard in §1 counts only **Active 160** and
**Left 344**. Inactive is therefore neither of those, or it is folded into one
of them without saying which.

> **This is a real question for the migration, not a curiosity**, and the
> arithmetic answers most of it. 160 plus 344 is exactly 504, so every person is
> in one bucket or the other. This screen has no *Left* in its status filter
> (below), so the people on it come from the 160 — which puts **the InActive
> ones inside the 160 we loaded**. If the import mapped that column straight
> onto `status = Active`, they are on our site right now as people the
> attendance engine will expect at a gate every morning, and they will be marked
> absent daily until somebody notices.
>
> **Check it against the export before shifts go live.** The All page carries a
> live status tally, so what the site actually holds is one click away.

### The dot, opened — and a fourth thing it settles

The coloured dot is the **status filter**, and it holds exactly three rows:

| Row | Dot |
|---|---|
| Active | green |
| InActive | red |
| All | blue |

**There is no *Left* in it.** Factor HR's own vocabulary on this screen is
Active and InActive only, which says the 344 leavers are not on this screen at
all — Employee Master is the live master, and *All* means all of the living
list rather than all 504. So **InActive is a state of its own**: somebody who
has not left but is not at work. Suspended, on long leave, seasonal — the screen
does not say which, and that is the thing to ask.

It also means the ERPNext mapping is not the obvious one. `Employee.status`
there offers Active, Inactive, Suspended and Left in a single field, so Factor
HR's InActive has to be resolved to one of the middle two **before** the import,
not after — the two systems agree on the word and not on what it covers.

**Location is empty for everybody.** Every card reads `-`. The field exists in
Factor HR and has never been filled, which settles where the geofence
coordinates in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) have to come from: **Manna,
not the migration**. There is nothing to export.

### Rebuilt here

The dashboard's Employee Master is now this screen — the same cards, the same
toolbar, the same grid/list toggle — with three deliberate differences:

- **Add New Employee is disabled**, and says why on hover. The dashboard reads;
  people are created on the site.
- **The dot is the status filter, matched exactly** — the same three rows in
  the same order, All last, each with its colour, and the button carrying the
  dot of whatever is selected. **Active and InActive are always drawn**, count
  or no count — a row that appears only once somebody is in it is a filter
  nobody knows exists, and *nobody is Inactive* is worth being able to ask for.
  A row with (0) is greyed rather than hidden. Any further status the records
  hold — Left, Suspended — is appended after them, so the control still follows
  the data rather than a fixed list.
- **The *All* dropdown filters by department.** It has not been screenshotted
  open in Factor HR, so rather than draw a dead control it was given a filter
  this site can answer. The Filter button opens designation and biometric
  enrolment, and the panel says the same thing about itself.
- **A card opens Employee Detail**, which is what the **→** appears to do there.

### Still open

- **What the *All* dropdown and the Filter panel hold.** One screenshot of
  each, opened. The dot is now known.
- **What is behind the split-button caret and the ⋮ menu.** Bulk import is the
  likely candidate, and if it is there, it is how 161 records got in.
- **Whether Inactive is a status of its own or a label over `Left`**, as above.

---

## 12 · CTC / Earnings — the report panel, 28 Aug 2026

The filter panel above Factor HR's CTC report, read off the tenant. Fifteen
controls, and they are worth listing because **six of them describe data we do
not have**:

> Filter By · Employee Status · Active Date From / Date Till · Particular
> Employee · WEF (Categories / Salary Rates WEF) · With Increment History ·
> Output Unit · Based on Attendance Days · Hide Wage Type Group · More options
> · Generate · Reset Fields · Generate In Background · Close · plus two
> imports: **CTC Rating Data Import** and **Import Employees from Excel**

### Their CTC is dated. Ours is a single number.

`WEF (Categories / Salary Rates WEF)` and `With Increment History` only make
sense against **salary rates that have effective dates and a revision history**.
On our side `ctc` is one undated field on `Employee` — so no effective date
could change the answer, and there is no history to show.

ERPNext keeps the dated version in Salary Structure Assignment, which is part of
payroll and has not been started. **So a CTC loaded onto `Employee` today
answers "what does this person cost now" and nothing else**: it cannot answer
what they cost in March, which is the question a WEF box exists to ask.

### `Output Unit` and `Based on Attendance Days` are the same missing rule

Yearly and Monthly are arithmetic. **Daily is not**: it needs a divisor — 26
days, calendar days, or working days — and that divisor is an attendance policy
nobody has stated. It is the same unstated rule that `Based on Attendance Days`
switches on, and the difference between two of its plausible values is the
difference between two payslips.

Recorded here rather than in the attendance docs because this is where it was
found: **the payroll screen depends on the attendance policy engine**, which is
the item already blocking section E.

### `Hide Wage Type Group` names the E1 ask again

There is nothing to hide on our side, because no earning heads have been loaded
at all. Factor HR's *Employee Earnings Report* is exactly that data and exports
without asking support — the same ask as **E1**.

### Two import buttons, one of which writes salary

`CTC Rating Data Import` writes CTC from a spreadsheet. It is the single most
expensive button on the screen: an import onto salary can pay somebody the wrong
amount with nothing on any report to show it happened. Our page reproduces the
button and refuses it — the proxy is GET-only, and this is one of the places
where that default earns its keep.

### What was built

The panel is reproduced control for control on the dashboard's CTC / Earnings
page — `app/index.html`, Employees → CTC / Earnings — including the six
controls that cannot answer, each saying why when it is used. Generate produces
a real report from loaded records: filters on status, joining-date window and
employee, groups and subtotals by company, department, designation, grade or
branch, converts Yearly to Monthly, and exports CSV from the browser.

**Nothing is listed until Generate is pressed**, which is Factor HR's behaviour
and worth copying: a report that runs on open is a report nobody chose the
filters for.

### Still open

- **The salary export (E1)**, which five of the six dead controls are waiting
  for.
- **The attendance-day divisor**, without which no daily rate can be computed.
- **Whether `Active Date From / Date Till` means employment or joining.** Ours
  filters joining dates, because no relieving date came across in the master.

---

## 13 · Employees — Calendar, 28 Aug 2026

The calendar screen, captured whole for the first time.

### The screen

| Part | What it reads |
|---|---|
| Toolbar | **New · Edit · Delete · Search · Close**, and **Data Import** on the right |
| Header | `Calendar Name: General`, **Default Calendar** ticked, **Go To Month** on the right |
| Month strip | `‹` and `›` only — the arrows are captioned *navigate between months* |
| Grid | Six weeks, Sunday first, week number in the left gutter, day number in the corner |
| Cells | Adjacent-month days greyed; **28 Aug highlighted as today**; every cell reads **`+ 1 more…`** |

Three details are worth copying exactly and were.

**The week numbers are counted from Sunday, not ISO.** Their gutter reads 31 for
the week of 26 July 2026 where ISO says 30. A rebuild that renumbered the weeks
would read as a bug in ours.

**The month is named nowhere but the first cell.** The grid opens `Jul 26, 2026`
and carries `Aug 1` and `Sep 1` at the boundaries; nothing else on the screen
says which month is on it.

**`+ 1 more…` is on all 42 cells, including the greyed ones.** So the calendar
carries at least one entry every day of the year — almost certainly the shift,
or the weekly off. **Nobody has clicked one**, so what is behind that link is
unknown, and this is the single screenshot that would settle it.

### Rebuilt here

Employees → Calendar now draws that screen: the toolbar, the calendar name with
its default flag, the month strip, and the six-week grid with the Sunday week
numbers and the corner day numbers. Their layout, our palette — the trade the
rest of the chrome already makes.

What is *in* the cells is ours, and it is thin on purpose: the named holiday,
the weekly off, and anybody whose first day it was. **`Calendar Name` is the
Holiday List** — picked rather than typed, because a calendar named for a list
that does not exist would show an empty month and blame the month — and
**`Default Calendar` is the company's `default_holiday_list`**, which reads as
unknown rather than false if the Company query comes back without the field.

Four of the six controls are drawn disabled with the reason on them: New, Edit,
Delete and Data Import all write, and a holiday list is a document on the site.
Search filters the cells. Close returns to Employee Master.

### Still open

- **What `+ 1 more…` holds.** One click, one screenshot. If it is the shift, the
  calendar is the roster screen and not a holiday list at all — which would
  change what this page is for.
- **Whether `General` is the only calendar over there**, or one of several. Ours
  lists every Holiday List on the site and defaults to the first.
- **Why nothing in the grid is a person.** factoHR's calendar may be per
  employee, per company, or global; the header gives no clue and the cells are
  identical all month.

---

## 14 · Employees — Categories, 28 Aug 2026

The item §9 said was the one to screenshot next, because it was the only one on
the menu whose contents could not be guessed from the name. It could not, and
the guess there was wrong.

**The page behind *Categories* is called `Category Type`, and it is a master of
masters.** Not a list of categories — a list of *kinds* of category, eight of
them, each with its own value list behind a **View Category** button on the row.

### The screen

| Part | What it holds |
|---|---|
| **Header** | *Category Type* · **+ Add** · refresh · an upload / import icon |
| **Toolbar** | a single *Search* box |
| **Columns** | Code · Category Type · Category (a **View Category** button) · Action |
| **Row actions** | view (eye) · edit (pencil) · delete (bin) |
| **Footer** | *Showing 1 to 5 of 8 entries* · First / Previous / **Page 1 of 2** / Next / Last |

The five rows on page 1, in the order shown:

| Code | Category Type |
|---|---|
| | Company Name |
| **P001** | Department |
| | Designation |
| | **Gratuity Applicable** |
| | **LWF Applicable** |

### Two of the eight are pay, not grouping

This is the finding on the screen, and it is the one worth carrying into the
migration.

**Gratuity Applicable and LWF Applicable are statutory pay treatment filed in
the same table as Department**, and maintained from the same screen by the same
person. In Factor HR, whether somebody is owed gratuity is a *category*.

ERPNext has neither as a category, and there is no field on `Employee` to
import them onto:

| Factor HR | ERPNext |
|---|---|
| Gratuity Applicable — a category on the person | a **`Gratuity Rule`** (service threshold, per-year entitlement) plus a payroll component |
| LWF Applicable — a category on the person | a **salary component with a condition**; the rate and periodicity are set by the state the employer is registered in |

So **neither of these moves across as data**. Both have to be read as rules and
rebuilt as rules — and the two lists are then how you check the rules were
written right: the people Factor HR marks applicable are the expected output of
whatever `Gratuity Rule` gets written.

It also puts a date on the work. LWF is a state levy, so this cannot be one
deduction row applied group-wide the moment two Manna companies sit in two
states. **It belongs in the payroll scoping, not in the tidy-up.**

### Three of ERPNext's five grouping fields are not on this screen at all

The five rows on page 1 are in alphabetical order — Company Name, Department,
Designation, Gratuity Applicable, LWF Applicable. Taking that at face value,
because five in a row is not a coincidence:

- **Branch, Grade and Employment Type would all have sorted onto page 1**, and
  none of them is there. `Branch` before Company Name, `Employment Type`
  between Designation and Gratuity, `Grade` immediately before Gratuity
  (`Grad` < `Grat`). They are ours rather than theirs, and **nothing is coming
  across to fill them**.
- The three rows on **page 2 sort after *LWF***, and there is nothing to guess
  them from.

**And it is not only a filing decision.** §20 shows shifts are assigned to
*categories* rather than to people, so this master is also what decides which
window each person's punches are measured against — which is to say, what they
are paid. The two screens are one mechanism.

That kills the mapping §9 proposed. There is no single ERPNext field this menu
item corresponds to: it holds three of our five, two things that are not fields
at all, and three unknowns.

### Small things the screen settles

**Only Department carries a code** — `P001`. The other four are blank, so the
code is optional and is not a key. Anything joining category types on it would
join on nothing four times out of five.

**The import icon is on this screen too.** Same as Employee Master's still-open
question about the ⋮ menu: bulk load exists somewhere in this product, and it
is probably how 161 employee records got in.

### Rebuilt here

The dashboard's **Employees → Categories** page is now that screen — the same
title bar, search, four columns, row actions and pager — with the differences
this build always makes:

- **Add, search, import, refresh and the row actions are drawn dead**, and each
  says why on hover. This dashboard reads.
- **View Category is live**, and it is the one control a read-only window can
  honestly answer. It opens what our site holds for that type, counted off the
  records rather than off a master, because we have no category master.
- **The two pay rows open the gap instead**, and say what has to be built.
- **The pager is drawn dead rather than dropped.** *Showing 1 to 5 of 8* is the
  shortest way on the page to say that three category types exist and nobody
  here knows what they are.
- **The five ERPNext fields below are each tagged** *has a Category Type* or
  *ours only*, so the half of the comparison that has no counterpart stays
  legible.

### Still open

- **Page 2 — the three unseen category types.** One click on *Next*.
- **The values behind Gratuity Applicable and LWF Applicable.** Two clicks on
  *View Category*, and both are needed before payroll is scoped rather than
  before it is built.
- **Whether the three unseen types are groupings or more pay flags.** Two of
  the five seen were pay, so the base rate on this screen is not low.
- ~~**What the footer vendor line says.**~~ Legible in §20's capture:
  **`Copyright © 2026 Version Systems pvt. ltd.`** — not factoHR. So the tenant
  is either white-labelled or resold, and *Factor HR* is the name Manna calls it
  by rather than the name on the product. It changes nothing about the screens
  or the migration, but it is worth knowing before anybody rings a vendor: the
  support contract may be with Version Systems rather than with factoHR.

---

## 15 · Employees — Employee Detail, 28 Aug 2026

**§9 read this menu item wrong.** Employee Detail is not a record page — it is a
**report builder**: a criteria form, a grid of fourteen tick boxes naming what
the export should carry, and six buttons. Worth stating plainly, because the
wrong guess had already been built.

### The form

| Group | Controls |
|---|---|
| **Who** | Employee Status (multi-select, showing *Active, Inactive, Suspended, T…*) · Particular Employee · Payroll Type (*Monthly*) · Filter By |
| **When** | Joining · Active · Separated · Birthday · Retirement — each From and Till |
| **Whose** | Reporting Manager · Approving Manager |
| **Age** | its own boxed group: Age From, Age Till, **Age As On Date** |
| **What** | Employee Data Option + As On Date, then the fourteen tick boxes |
| **Buttons** | Generate Report · Download Employee Picture / Documents · Reset Fields · Close · Schedule Report · Generate In Background |
| **Top right** | **Import Employees from Excel** |

The fourteen sections: Category, PF / ESIC, Salary Master, Personal, Skill Set,
Identity, Bank, Family, Past History, Show Categories As Per Joining Date,
Qualification, Nominee, Transfer / Promotion History, Separation.

### What it tells us that the menu did not

**The employee record is far wider than the master screen shows.** Fourteen
sections, of which only one — Category — is ticked by default. Every one of them
is data Factor HR holds about a person: nominees, qualifications, family, past
employment, skill sets. **All of it exists in the tenant and none of it came
across in the migration**, which loaded the master and not the paperwork.

**Import Employees from Excel answers §11's open question.** That is how 161
records got in, and it is how the rest would. It is also on the *report* screen
rather than on Employee Master, which is worth knowing before anybody goes
looking for it.

**Age is a filter, not a field.** Factor HR computes it from date of birth
against an *Age As On Date*, defaulted to today. So does ours. Anybody with no
date of birth simply cannot be aged, and that is a gap in the master rather than
in the filter — the page says so and says how many.

**Schedule Report and Generate In Background are the two that cannot be copied
into a browser tab.** Both need something running when nobody is watching. In
ERPNext that is Auto Email Report and the scheduler, which exist and are
untouched — a like-for-like there is configuration, not code.

### Rebuilt here

The criteria form, control for control, in the same order and the same shape —
including the boxed *Specify Employee Age Range Filter*. What differs, and why:

- **Five controls are drawn disabled** with the short reason beside them and the
  long one on hover: Payroll Type, Filter By, Active Date, Retirement Date,
  Approving Manager, Employee Data Option. Two of those are unknowns (never seen
  open) and the rest have no field behind them on ERPNext's `Employee`. Drawing
  them where Factor HR draws them is the point — a row left out reads as an
  oversight when the two screens are compared side by side.
- **Six of the fourteen tick boxes are disabled**, and each says why: Skill Set,
  Past History, Qualification, Nominee and Transfer / Promotion History all live
  in **child tables**, which a list call cannot reach. Fetching them means one
  document read per person — 161 requests to build one report. *Show Categories
  As Per Joining Date* is a modifier rather than a section, and only means
  anything once categories are dated.
- **The eight that work, work.** Generate Report reads the site live, asking for
  exactly the fields the ticked sections need, and writes the result to a table
  and a CSV.
- **Each ticked section is probed for one row first.** Asking ERPNext for a field
  it does not have fails the *whole* call and takes every other field with it —
  so a section this site cannot answer is dropped by name and reported, rather
  than turning the report into an error message.
- **Schedule Report and Generate In Background are disabled**, for the reason
  above. **Download Employee Picture / Documents** is disabled because it needs
  the `File` doctype, which is deliberately not on the proxy's allowlist.
- **Download CSV is ours**, not Factor HR's. It is what Generate In Background
  would have been for.

### Still open

- **What Employee Data Option and Filter By hold.** Two screenshots, opened.
- **What Factor HR means by Active Date.** Reinstatement, confirmation,
  something else — it is a date nobody here can name.
- **Whether the fourteen sections are worth migrating at all**, and in what
  order. Nominee and PF matter for statutory reasons; skill sets probably do not.
  That is a question for Manna, and this screen is the list to ask it against.

---

## 21 · Attendance — Submit Attendance List, 28 Aug 2026

The screen behind the menu item, and it is **empty**.

| Part | What it holds |
|---|---|
| **Header** | *SUBMIT ATTENDANCE LIST* · a filter icon · **+ Add** · **Preview Data** |
| **Controls** | Show `10` entries · Search |
| **Body** | *No Data Found* — **No Submit Attendance Data Available, please create new submit attendance** |
| **Footer** | Showing 0 to 0 of 0 entries · Previous / Next |

### The empty list is the finding

Two documents in this repo say the monthly freeze is *a control Manna has today
and would lose*: [FACTOHR.md](FACTOHR.md) Layer 3, and §10 above. **On this
screen they have never used it.** Not one submitted month, in a tenant that has
been running payroll long enough to have 344 leavers and a March-25 payroll
summary.

**The honest caveat**: there is a filter icon on that toolbar and nobody has
seen it opened, so a filter could in principle be hiding rows. Against that, the
empty text is the *no records at all* wording — "please create new submit
attendance" — rather than a no-matches message. Take it as strong evidence, not
proof.

### Why it matters to the estimate

The monthly freeze was carried as a genuine gap: a control Frappe HR has no
answer for, on the list of things the replacement has to grow. If nobody has
ever pressed **+ Add**, then:

- it is **not a regression** to ship without it, and
- building it first would be building the thing least used.

That does not settle it either way. Payroll is calculated by hand — decided 23
August — so the discipline the freeze represents may live in a spreadsheet, and
an empty list is exactly what you would see if it does. **The question is for
HR, and it is a short one:** *how do you decide a month is finished?* If the
answer is "we print the report and stop editing", the freeze is worth building
and worth building properly. If the answer is a shrug, it comes off the list.

### Rebuilt here

The list is drawn on our Submit Attendance page above the readiness check, in
Factor HR's shape — toolbar, entries selector, search, pager, empty state — and
every control is disabled with the reason on hover:

- **+ Add** is the button the whole page is about, and it is a write against a
  doctype that does not exist yet.
- **Preview Data** shows the month as it stands before freezing. There is
  nothing to preview until attendance is being generated at all.
- **Filter, Search and the pager** have nothing to act on: zero rows here, zero
  rows there.

The empty state says both halves — *No submitted month here, and none there
either* — because on this screen the two systems agree, and that agreement is
the whole content of the page.

### Still open

- **What the filter icon holds**, which is also what would settle the caveat
  above. One screenshot, opened.
- **What a submitted month actually records** — the columns of that list have
  never been seen with a row in them. Period, company, who submitted, totals,
  and a status, presumably; nobody knows.
- **Whether Preview Data is the monthly summary** that would otherwise have to
  be rebuilt, and whether it can be exported without submitting anything.

---

## 16 · Attendance — Attendance Regularization, 28 Aug 2026

The screen HR actually uses to answer *"what happened to my 19th of August"*,
captured for the first time. It opens empty.

### The screen

| Part | What it reads |
|---|---|
| Title | **ATTENDANCE REGULARIZATION**, with a rule under it |
| Cycle | `Attendance Cycle : Aug-2026 ▾`, with a calendar icon |
| Dot | the same coloured status dropdown as Employee Master — see §11 |
| Search | `Search Employee`, magnifier on the **right** |
| Categories | `Select Categories` — the master of masters from §14 |
| Icons | filter · import · refresh · history |
| Body | **No Employee Selected** / *Please select employee for show Regularization* |

**That empty state is the finding.** Their regularization screen is *one person
at a time* — you cannot see the queue without naming somebody first. Ours on
Dashboard → Approvals is the opposite: every open correction in one list, worked
as a backlog. Both are wanted and they answer different questions, so this page
is now theirs and the approvals page stays ours.

**The import icon is the second sighting of the dangerous button.** §7 found
Import Data inside the approvals dialog; it is on this bar too. Attendance can
be written from a spreadsheet from at least two places in factoHR, with no shift
check, no geofence and no approver. Still the strongest argument in the file for
[CLAUDE.md](../CLAUDE.md) §1.

### Rebuilt here

Attendance → Attendance Regularization now draws that screen: the title, the
cycle picker, the status dot, the search box with the magnifier where they put
it, the category box, the four icons, and their empty state word for word. Pick
somebody and it lists their open corrections for the chosen cycle in **factoHR's
own twelve columns**.

**Four of the twelve cannot be filled, and that is the point of showing them.**
`Original In` and `Original Out` are the punch beside the correction — ours
holds the request only, and nothing joins it to `Employee Checkin` yet.
`Day Status` and `AR Hours` are outputs of the attendance policy engine, the one
part of factoHR that Frappe HR has no equivalent for.

Three of the four icons are drawn disabled with the reason on them. Refresh
works. `Select Categories` offers Department, which is the one category type
both systems hold.

### Still open

- **What their filter panel holds.** Never opened; the two controls it would
  carry are already on the bar.
- **Whether History shows decided corrections.** Ours reads open requests only,
  so a decided one disappears from this screen entirely — which is a gap, not a
  design.
- **Whether the cycle is the calendar month.** Ours assumes it is. If payroll
  runs 26th to 25th, every cycle on this screen is off by five days.

---

## 17 · In / Out Activity Report — the report panel, 28 Aug 2026

The filter panel above their punch report:

> **Particular Employee** (status dot + Search Employee + an import arrow) ·
> **Employee Status** · **Filter By** · **Report Period** (Date Wise) · Excel ·
> refresh · **Generate**
> — tabs: **REPORT CRITERIA** / **ADVANCE** —
> **Date Range** · **From Time** / **Till Time** · ☑ **Show Selfie Images in
> Report** · **Layout Options** [With Logo] · **Additional Filters**

### The selfie is a report option, not an export artefact

`Show Selfie Images in Report` is **ticked by default** on their screen. Until
now the selfie was known only from the export — 35 embedded images for 34
punches — and could have been an artefact of how that file was produced. It is
not: it is a first-class option on the report people actually run.

That firms up a gap nobody had costed. Nothing in Frappe HR captures a photo on
punch, and at 160 people the storage is on the order of **5 MB a day**. It is a
storage and retention decision as much as a feature, and it is now clear
somebody looks at these images.

### They query punches by time of day

`From Time` / `Till Time` default to `00:00` – `23:59` and sit beside the date
range as equals. So "who punched between 22:00 and 06:00" is a question this
report is built to answer — which matters for the night shifts nobody has
explained yet, and is one more reason to get the shift windows right before
anybody is paid from them.

### `Layout Options: With Logo` means this report gets printed

A logo option only makes sense on a document somebody hands over or files. Our
dashboard renders HTML and exports CSV; **if these reports are printed and kept,
that is a requirement nobody has stated**, and it is cheap to ask about now and
expensive to discover later.

### Their UI is mid-redesign

This panel and the CTC one (§12) are visibly different generations of Factor
HR's own interface — uppercase labels, tabs and a blue primary button here,
against the older grey form there. Worth nothing on its own, except as a
reminder that **a screenshot dates from the day it was taken**, and two screens
in this log may not look alike even where they do the same thing.

### What was built

The panel is reproduced control for control on the dashboard — `app/index.html`,
Attendance → In Out Activities Report — tabs, funnel, chip and all.

**Generate is the one control on that page that reaches the site.** The
dashboard loads today's punches on open; any other range is a read of
`Employee Checkin`, capped at 92 days because the site has a daily compute limit
and a punch table grows by roughly 320 rows a day once the bridge is running.
Everything else — status, employee, time window, in/out, stream, grouping — is
arithmetic on what came back, and exports to CSV from the browser.

`Show Selfie Images` renders the column **present and empty** rather than
dropping it, and `Stream` can only say whether a punch carries a terminal at
all, which is the weaker half of the real rule.

### Still open

- **The trusted device-id prefixes**, per company. Without them a punch can be
  sorted into "has a terminal" and "has none", but not into biometric and
  mobile — and that distinction is what decides whether a punch is geofenced.
- **Whether these reports are printed**, per Layout Options above.
- **What the ADVANCE tab holds.** It has never been opened.
- **How long selfies have to be kept**, now that they are known to be a feature
  rather than a by-product.

---

## 18 · Attendance — Daily Detail Attendance Report, the panel, 28 Aug 2026

The report we already hold the *output* of, now with its *input* photographed.
This is a newer form than the CTC panel in §12 — labelled controls in one row,
then tabs.

### The screen

| Part | What it reads |
|---|---|
| Title | **DAILY DETAIL ATTENDANCE REPORT** |
| Particular Employee | the coloured status dot · `Search Employee` · an import arrow |
| Employee Status | `Active` |
| Filter By | a wide select, **empty** |
| Report Period | `Date Wise` |
| Buttons | Excel export with a split · refresh · blue **Generate** with a split |
| Tabs | **REPORT CRITERIA** (open) · **ADVANCE** |
| Date Range | `Aug 1, 2026 - Aug 31, 2026` |
| Layout Options | chips: `Show Employee Grouping ×` `With Logo ×` |
| Additional Filters | a funnel, closed |

**The status filter is on this bar twice** — the dot and the Employee Status
select. Ours binds both to one value, because two controls for one filter that
can disagree is a bug waiting to be reported. Whether their dot means something
else here is unknown; nobody has opened it.

**`Report Period: Date Wise` implies the report has other shapes** — month wise,
summary wise, something. Only Date Wise has been seen, so only Date Wise is
offered here rather than a guessed list.

### Rebuilt here

Attendance → Daily Detail Attendance Report now carries that panel, control for
control, and **nothing is listed until Generate is pressed** — their model, and
the same one CTC / Earnings copies. Generate runs one row per person per day
over the chosen range, in factoHR's own fourteen columns.

Both layout chips do what they say: **Show Employee Grouping** sections the
output per person, **With Logo** puts the Manna wordmark and the period on the
report head. **Filter By** groups it a level above — department sections, people
inside them. The Excel button exports what was generated as CSV.

**Five of the fourteen columns come out as dashes for everybody, and that is the
deliverable.** Late Coming By, Early Going By and Overtime are outputs of the
attendance policy engine; Break and Personal Break are outputs of a break model
nobody has specified. **In and Out can only ever be filled for today**, because
the dashboard loads one day of punches. Day Status is the holiday list — weekly
off and named holidays are the only part of a day this site can state on its
own.

### Still open

- **What the Advance tab holds.** Never opened, and everything this report
  cannot answer would plausibly be configured behind it.
- **What Report Period offers besides Date Wise.**
- **Whether Additional Filters is more than shift and department.**

---

## 19 · Statutory Reports — the report panel, 28 Aug 2026

The panel behind the Statutory Reports menu item:

> ○ Date wise / ◉ **Month wise** · **Month** August **Year** 2026 ·
> **Report Type** *(Select report type)* · Employee Status · Particular Employee
> · Filter By · **Report Output** Excel · ☐ Display Employee Code · ☐ Hide
> Header · Generate · Reset Fields · Close · **Schedule Report** · Generate In
> Background

### The one control that matters was left unselected

**`Report Type` still reads *Select report type***. It is the only control on
the form that says *what* is filed from this menu; everything else is a filter
over whatever it names. So after two screenshots of this area we know the menu
item exists and we know its filter panel — and we still do not know what it
produces.

**One screenshot with that dropdown open closes the page.** It is the smallest
outstanding ask in this log.

### `Schedule Report` is new, and it is the interesting button

It does not appear on the CTC panel (§12). A schedule means **somebody receives
these on a cadence without asking for them** — which is what a statutory return
is: due monthly, to the same people, whether or not anybody remembers.

ERPNext has the equivalent already: Frappe's **Auto Email Report** sends a saved
report on a cron to a recipient list. It needs an outgoing mail account on the
site and a write to create the schedule, so it is bench configuration rather
than code. Worth settling early: **who currently receives the PF return each
month, and on what date.**

### Month wise is the default, which is what a return is

The period radio defaults to Month wise with the current month, against the
date-range default everywhere else. Statutory returns are monthly filings, and
the form is shaped for that.

### `Hide Header` says where the output ends up

An option to drop the column headings only makes sense if the rows are pasted
into something that carries its own — a form, a template, a portal upload. So
these reports are **an input to another document**, not the document itself.
That fits the ECR file, which is a fixed-format upload to the EPFO portal.

### A small tell: `Filter By` displayed `[]`

The field rendered an empty array as its literal value. Cosmetic, and worth one
line only because it suggests this panel is **generic and shared** across their
reports rather than built for this one — the same form as §12 with a different
Report Type behind it. Which is also why the panel alone tells us so little
about what this page files.

### Every statutory return needs days paid

Whatever `Report Type` turns out to hold, a monthly PF or ESI return carries
**days paid per person** — and that is an attendance number. If that is why this
menu sits under Attendance rather than Payroll, then this page is downstream of
the attendance policy engine like everything else on the menu, and it cannot be
built before the engine is.

### What was built

The panel is reproduced control for control — `app/index.html`, Attendance →
Statutory Reports — including the period radio, the year spinner and all five
buttons. `Report Type` is filled with **our own statutory Letter Types**, plainly
labelled as a stand-in until theirs is seen.

Generate produces the readiness check underneath any monthly return rather than
pretending to be a report nobody has seen: everybody in scope for the period,
against the twelve columns such a return needs, with the unfillable ones
**shaded and named** — PF account / UAN, PAN, days paid, gross, employee PF,
employer PF. It reads `provident_fund_account` and `custom_pan_no` off the site
once, on demand, so "the field is not there" is an answer rather than an error.

`Report Output: PDF` refuses rather than approximates, for the reason in §5:
**a statutory layout is legally fixed — reproduce it exactly or not at all**, and
a PDF that is nearly right is worse than none, because somebody will file it.

### Still open

- **The Report Type list**, expanded. One screenshot.
- **Who receives the scheduled statutory reports, and when.**
- **Whether a UAN or PF account number exists anywhere in Manna's records.**
  It is not in the Factor HR employee export, and the readiness check will say
  whether the ERPNext field is populated the first time somebody presses
  Generate against the live site.

---

## 20 · Attendance — Manage Shift, 28 Aug 2026

The screen is titled **SHIFT & WORK PATTERN**, and the shifts on it are one
company's: every row reads `Hi-Tech Pretreads-…`.

### The screen

| Part | What it holds |
|---|---|
| **Header** | *SHIFT & WORK PATTERN* · a bare **+** at the right |
| **Toolbar** | *Show [20] entries* · a **Shift** dropdown in the middle · *Search:* |
| **Columns** | NAME · CATEGORY COUNT · EMPLOYEE COUNT · IS DEFAULT · ACTION, every one sortable |
| **Row actions** | edit (pencil) and delete (bin) only — the name is the link |

The rows, as read:

| Name | Category count | Employee count | Is default |
|---|---|---|---|
| Hi-Tech Pretreads-Accountant | 0 | 0 | |
| Hi-Tech Pretreads-Cook shift | 1 | 0 | |
| Hi-Tech Pretreads-House Keeping | 0 | 0 | |
| Hi-Tech Pretreads-Office shift | 9 | 0 | |
| Hi-Tech Pretreads-Other location | 8 | 0 | |
| Hi-Tech Pretreads-Production shift-12Hrs-1 | 12 | 0 | |
| Hi-Tech Pretreads-Production shift-12Hrs-2 | *clipped* | *clipped* | |

The capture cuts off mid-row, so the list is at least seven long and their own
total is not on it.

### Shifts are assigned to categories, not to people

**This is the finding, and it changes what has to be migrated.**

`EMPLOYEE COUNT` is **0 on every row**. `CATEGORY COUNT` is not — 30 category
links across the six rows that can be read.

That would say nobody has a shift, except the attendance export already
contradicts it: §4's shift tally names a shift against people, 36 on one and 25
on another, and the Daily Attendance Detail report prints a shift on every
person's row. The shifts are in use.

Both facts hold together only one way: **a person gets their shift through
their category**. The direct-assignment column is empty because nobody is
assigned directly.

Which lands squarely on §14. Categories was already the master that decides how
the workforce is filed; it now also decides **what everybody is paid against**,
because the shift is what a punch is measured by. The two screens are one
mechanism.

### What that costs on our side

ERPNext works the other way round. A `Shift Assignment` is **per person, with
dates**, and there is no category in it anywhere. So:

- **There is no per-person shift column to export.** It has to be derived —
  category, then who is in that category, then one Shift Assignment each.
- **The derivation is only as good as the category master**, which is the one
  we have seen exactly one page of.
- **Which category type carries the shift is not on this screen.** Department,
  designation, something else — 30 links and not one of them says what kind.
  One click on a shift name settles it, and it is the next screenshot to take.

### Names carry the company, and must go on carrying it

Every row is prefixed `Hi-Tech Pretreads-`. So this is one company's page, and
the group's 23 shifts are these seven-or-more repeated across six companies
with the prefix changed — the same per-company shape as employee codes in §11.

**ERPNext's `Shift Type` has no company field.** The name is the only thing
keeping two companies' office shifts apart, and they will not have the same
timings. Dropping the prefix to tidy the list would silently merge them.

### The two lists spell shifts differently

Worth flagging before anybody maps on the name:

| Source | Name |
|---|---|
| Attendance export (§4 tally) | `Hi-Tech Pretreads — Production shift1` |
| This master | `Hi-Tech Pretreads-Production shift-12Hrs-1` |

Same shift renamed, or two different shifts — unknown. Any mapping keyed on the
shift name has to be checked against both spellings.

### A lead on the 22- and 24-hour shifts

The open question from the export was what `Production24hr shift` and
`Production22hr shift` mean, since nobody works 24 hours.

This screen shows `Production shift-12Hrs-1` and `-12Hrs-2` — **a numbered pair
of twelve-hour shifts**, which is how a plant covers a whole day. That makes it
likely the hours in a shift name are the shift itself rather than a window, and
that a 24-hour name is a *pattern* covering the day rather than one person's
span. Likely, not settled. It still has to be walked through, because the answer
configures auto-attendance either way.

It also stops the night-shift trap being hypothetical: `12Hrs-2` is almost
certainly the night half of that pair.

### Work Pattern is the other half of this screen and has never been opened

The title says *Shift **& Work Pattern***, and the middle dropdown reads
**Shift**. So there is a second master behind the same screen.

A shift is a window; **a work pattern is which shift applies on which day** —
the rotation. With a numbered pair of twelve-hour shifts on the list, a rotation
almost certainly exists, and it is what decides whether somebody on nights this
week is expected at 08:00 or at 20:00 next week.

ERPNext has no work-pattern object at all. It is Shift Assignment rows, dated,
one per person per stretch — and **nothing generates them**.

### `IS DEFAULT` is blank on every row seen

No shift here is the default one. So a person in no category has no shift, and
nothing catches them.

### Rebuilt here

Attendance → Manage Shift now opens with that screen: the title bar and its
bare **+**, the three-part toolbar, the five sortable columns, the rows as read,
and the two row actions. Every control is drawn dead with the reason on hover.

**The clipped row is drawn clipped** — its name is legible and its two counts
are not, so they render as `—` with the reason on hover rather than as numbers.
The table is the evidence for the paragraph above it; a guessed count in it
would be indistinguishable from one that was read.

The panels under it carry the findings, and the page keeps what was already
known: the export's four largest shifts, the one confirmed timing
(09:30–18:30, late to the minute, no grace), and the midnight trap.

### Still open

- **Which category type carries the shift.** One click on a shift name. This is
  the most valuable single screenshot outstanding on the whole tenant — it is
  the join between §14 and everything attendance.
- **Work Pattern**, the second half of this screen.
- **The rest of the list**, and their total.
- **The timings.** Not one shift on this screen shows a start or an end. Every
  window is still unknown except Manna Treads Office.
- **Whether `IS DEFAULT` is ever set** on another company's page.

---

## 22 · Attendance — Monthly Basic Attendance Report, 28 Aug 2026

The criteria panel above the muster grid. The grid itself is still unseen.

| Part | What it holds |
|---|---|
| **Toolbar** | Particular Employee (a status dot, *Search Employee*, an upload icon) · Employee Status (**Active**) · Filter By · Report Period (**Date Wise**) · an Excel split button · refresh · **Generate** split button |
| **Tabs** | **Report Criteria** · Advance |
| **Report Criteria** | Date Range — *Aug 1, 2026 – Aug 31, 2026* · Layout Options · one checkbox |
| **Layout Options** | removable chips: **With Logo**, **Show Shift Code** |
| **Checkbox** | Show Day Status on Week Off/Holiday — *unticked* |

### Four things worth having

**It is a date range, not a month.** "Monthly Basic" is a convention rather than
a constraint — the control underneath it takes any two dates. Ours does the
same, capped at 62 columns, because a year-wide range is a mistake rather than a
request.

**Layout Options are print options.** A logo and a shift code are things you
want on **paper**, not on a screen. Somebody prints this report. That is worth
knowing before deciding what the replacement's version of this screen has to be
— a web grid that cannot be printed onto one landscape page would not replace
it.

**"Show Day Status on Week Off/Holiday" implies Sundays are worked.** The option
would not exist if a week off never carried a status. It does not say how often
— but combined with the planned-overtime requirement (§3), it points the same
way: **Sunday work happens, is recorded, and is paid for**. The weekly-off rule
in `rules.py` has to leave room for a punch on a day nobody was expected.

**Three report screens, one skeleton.** Employee Detail (§15), CTC / Earnings
(§12) and this one are the same frame: a toolbar of filters, a criteria area,
tick boxes or chips, and a row of buttons ending in Generate. **Factor HR has
one report framework and configures it per report.** For estimating, that means
the second and third report screens cost a fraction of the first — and it is an
argument for building ours the same way rather than as three bespoke pages.

### Rebuilt here

Toolbar, tabs, date range, chips and checkbox, in that shape — and **Generate is
not a mock**. It asks the site for every `Attendance` row in the range and fills
the grid from what comes back. Today that is zero rows, because the shift job
has never run; the day it runs, the page fills itself.

- **Show Shift Code** adds the shift column. **With Logo** puts the printed
  report's header above the grid. Both are removable chips, both on by default,
  as they are there.
- **Show Day Status on Week Off/Holiday** does what it says: off, Sunday reads
  `WO`; on, Sunday is drawn like any other day and shows whatever it holds.
- **Filter By** is disabled — never screenshotted open, and in that position it
  is probably a grouping. **Advance** is drawn and empty for the same reason.
- **The Payable column stays blank until there is something behind it.** Five
  Sundays in a month is not five payable days; it is a month nobody has
  measured, and this is the column payroll reads. It fills in only for a person
  with at least one real `Attendance` row, and it adds up what the grid holds
  rather than applying a policy — **because the policy has not been stated**.
- **Excel** exports exactly what is on screen as a CSV, filters and layout
  options included.

### Still open

- **What the upload icon beside Search Employee does.** A list of employee codes
  to filter by is the guess; nobody has pressed it.
- **What else Report Period offers** besides *Date Wise*.
- **What the Advance tab holds** — one screenshot.
- **What the grid looks like with data in it**, which is the half of this screen
  that would tell us what the columns actually are.
