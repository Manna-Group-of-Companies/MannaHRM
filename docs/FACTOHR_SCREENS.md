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
- F&F: all zero, 0 on notice, 0 exit clearance pending — **but see §28**: the
  screen behind that tile holds sixteen people. Nothing has been *processed*;
  sixteen are *waiting*, and only the first of those is what the zero counts.

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
- **A card opens the person's record** — Employee Profile, §23. It opened
  Employee Detail until 29 Aug, which turned out to be a report screen rather
  than a record page.

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

**Nothing is generated until Generate is pressed**, which is Factor HR's
behaviour and worth copying: a report that runs on open is a report nobody chose
the filters for. What is drawn in the meantime is not their blank screen but the
**people the report would cover** — the criteria on the form applied to records
already in hand, with the raw `ctc` beside each name, since a figure missing on
somebody reads better against a name than as a count. Nothing is read from the
site to show it.

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

All four of New, Edit, Delete and Data Import write, and this page reads — so
all four **open the job on the ERPNext site**: New an empty `Holiday List`, Edit
and Delete the one the month is drawn from, Data Import ERPNext's own wizard,
which previews a spreadsheet before it writes. They fall back to disabled, with
the reason on them, when the site is not known yet or when there is no holiday
list to act on. Search filters the cells. Close returns to Employee Master.

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

- **Search, refresh and View Category act on this page**, so they work here:
  search filters the five rows, refresh re-reads the site, and View Category
  opens the screen below.
- **View Category opens a second screen, not an expansion** — settled by the
  capture of 29 August 2026, the first time anybody had clicked one. Back arrow,
  its own toolbar (**+ Add**, refresh, print, import), its own search, and a
  four-column table: **Code · Description · Status · Action**, with the same
  view/edit/delete icons and a pager of its own. So a category type is a plain
  value list maintained like any other master — which is what makes Gratuity
  Applicable and LWF Applicable the finding they are: two pay rules filed in a
  screen shaped for lists.
- **Ours is rebuilt on that shape**, with the values coming from the doctype the
  type reads onto — `Company`, `Department`, `Designation`. Search and the pager
  are real there, because the rows are ours. Status is filled only where our
  side has such a field (`Department.disabled`) and drawn as a dash with the
  reason on it everywhere else: *we did not read a status* and *the status is
  Active* are different claims. `Code` carries the company `abbr`, the one thing
  our side has for a column blank on every row of theirs.
- **Their list is reconciled against ours by name**, where a photograph exists.
  Their footer says six companies; page 1 held five; a name of theirs missing
  here is an employee import that will refuse, found now instead of then.
- **Add, Import and the row Edit act on a master, so they open the site.** Add
  makes a new document of whatever doctype the open row reads onto, Edit opens
  that doctype's list, Import opens ERPNext's Data Import. Which doctype Add
  means depends on which row is open, so until one is, it says so.
- **Row Delete stays dead, and the reason is the finding.** There is no Category
  Type on our side to delete: those eight rows are Factor HR's own master, and
  deleting the doctype behind one is a different act entirely.
- **The two pay rows open the gap instead**, and say what has to be built.
- **The pager is drawn dead rather than dropped.** *Showing 1 to 5 of 8* is the
  shortest way on the page to say that three category types exist and nobody
  here knows what they are.
- **The five ERPNext fields below are each tagged** *has a Category Type* or
  *ours only*, so the half of the comparison that has no counterpart stays
  legible.

### Still open

- **Page 2 — the three unseen category types.** One click on *Next*.
- **The sixth company.** Their Company Name list pages *1 to 5 of 6* and page 2
  has not been opened. Five are known; the sixth is not, and it is the one most
  likely to be missing from our site.
- **The values behind Gratuity Applicable and LWF Applicable.** Two clicks on
  *View Category* — and now that the screen behind that button is known to be
  an ordinary value list, both are one click each and would settle the two
  hardest items on this page. Needed before payroll is scoped rather than
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

*(The record page does exist, separately, and is not on this menu at all —
see §23.)*

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

Two of the four icons are drawn disabled with the reason on them: their filter
panel has never been opened, and **Import writes attendance from a spreadsheet
with no shift check, no geofence and no approver** — refused here on purpose,
and the one control on this dashboard that is deliberately not linked out
either. Refresh works. **History opens the correction list on the site**, which
holds the decided ones this page cannot see. `Select Categories` offers
Department, the one category type both systems hold.

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
> **Employee Status** · **Filter By** · **Report Period** (Date Wise) ·
> **Excel** split (PDF · Excel · Word · Print · Preview) · refresh · **Generate**
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

### The ADVANCE tab, 29 August 2026

Opened, and it holds **two** controls — not the four on Daily Detail's:

| Control | Reads |
|---|---|
| **Group By** | `Select Category` |
| **Show Categories** | `0` |

Same two controls, same meaning as on Daily Detail (§18), so they are one list
in the code. Neither filters: both change the shape of what came back, which is
why neither needs a second Generate.

**Group By sections the punch list by category**, above the grouping Report
Period and Filter By already do — a company heading, dates inside it. The two
categories that are pay treatment rather than groupings, Gratuity and LWF, have
no field on our side to section on, and picking one says so.

**Show Categories appends category columns**, capped at **two** on this report
rather than three: Company is already a column here, and a column repeated under
a second heading is worse than a column missing. So Department and Designation
are what it can add. They go into the CSV as well — unlike the selfie column,
these hold real values, and the only column kept out of the data file is the one
that is empty by construction.

**That the two reports' Advance tabs differ is itself worth having.** Daily
Detail's carries a Day Of Week and a Punch Type; this one does not. Both are
properties of a *day*, and this report's rows are punches — so their absence
here is consistent rather than an omission.

### Still open

- **The trusted device-id prefixes**, per company. Without them a punch can be
  sorted into "has a terminal" and "has none", but not into biometric and
  mobile — and that distinction is what decides whether a punch is geofenced.
- **What Show Categories does when it is not 0**, which would confirm the
  reading above.
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

**`Report Period: Date Wise` implies the report has other shapes** — and on 29
August 2026 the menu was opened. It holds **two** entries, not a family of them:
*Date Wise* and *Month Wise*. Both are offered here now.

### Rebuilt here

Attendance → Daily Detail Attendance Report now carries that panel, control for
control, and **nothing is generated until Generate is pressed** — their model,
and the same one CTC / Earnings copies. Until it is, the screen lists **who the
report would cover** at the criteria set, off records already read, rather than
sitting blank. Generate then runs one row per person per day over the chosen
range, in factoHR's own fourteen columns.

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

### The ADVANCE tab, 29 August 2026

Opened at last, and it holds four controls:

| Control | Reads |
|---|---|
| **Group By** | `Select Category` — a category picker, not a field picker |
| **Day Of Week** | `Select day of week` |
| **Show Categories** | `0` — a number field |
| **Punch Type** | `All` · `Attendance Punch Required` · `Attendance Punch Not Required` · `Attendance Single Punch Required` |

**Group By offers categories, which settles what §9's Categories screen is for.**
It is Factor HR's `Category Type` master — Company Name, Department,
Designation, Gratuity Applicable, LWF Applicable — the same rows behind that
screen. Three of the five read onto an `Employee` field here and can section the
report. The other two are pay treatment rather than groupings and have no field
on our side at all; picking one says so rather than grouping everybody into one
section. **Group By and Filter By stack**, which is what two grouping controls on
two tabs has to mean if neither is to be ignored.

**Day Of Week comes off the date, so it is exact.** Seven toggles here rather
than a multi-select, because which days are on has to be readable without
opening anything: it silently removes rows from an attendance report.

**Show Categories is a count, and the reading here is ours.** Their field held
`0` and the label is plural, so it is read as *how many category columns to
append to each row* — capped at three, which is all this site can fill (Company,
Department, Designation). One screenshot of it set above zero would settle it.

**Punch Type is read as a property of the day, not of the person**, because that
is the only reading this site can answer: the holiday list is what says a punch
was expected. A weekly off or a holiday is *not required*; every other day is
*required*. **Attendance Single Punch Required cannot be answered at all** — it
needs a flag saying one punch is enough for a person or a shift, and neither
`Employee` nor `Shift Type` holds one. So it leaves the report unfiltered and
says why, rather than filtering to nothing: an empty report reads as nobody
qualifying, which is a different claim from not knowing.

### The two split buttons, 29 August 2026

Both menus were opened, and both are now real here.

**Export** — `PDF · Excel · Word · Print · Preview`. The same menu as the In /
Out report's, so it is one component. There is no PDF writer and no Word writer
in a browser and there is not going to be one for a table: PDF and Print are the
print dialog (*Save as PDF* is a destination in it), Word is an HTML document
with a Word content type — what Word's own *Save as Web Page* writes — Preview
is that same document in an iframe, and Excel is the CSV. One document behind
four of the five, so what somebody signs is what they previewed.

**Generate** — `Generate in Background · Create Schedule Report · View Scheduled
Reports`. All three are about a queue. This page has none: it holds what was
already read and does the arithmetic in the browser, which is why it answers at
once. But scheduling has a real home on the site — ERPNext's `Auto Email Report`
is one doctype with a frequency and a recipient list, running on the site's
scheduler, which is the only clock that keeps time when this browser is closed.
So the two scheduling items open it rather than explaining that they cannot.

### Still open

- **Whether their Punch Type means the day or the person.** One screenshot of a
  person's record with such a flag on it would settle it.
- **What Show Categories does when it is not 0.**
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
and the two row actions. **Show and Search act on this table**, so they work
here. **+ opens a new `Shift Type` on the site** — which is the whole ask of the
page, since nothing generates attendance until these exist. **The two row
actions open that shift on the site**, but only for a row we actually hold: the
names here are Factor HR's, and one with no `Shift Type` of that name on our
side says so rather than looking broken. **The Work Pattern selector works, and
what it opens is ours**: their half has never been screenshotted, so rather than
invent it the second view answers the same question our way — `Shift Assignment`
rows, who is measured against which shift and between which dates, read once the
first time somebody selects it. Three counts sit above it and they are the
readiness check this whole page is for: **rostered**, **default shift only** (a
fallback on the record, with no dates, so a shift that changes in March cannot
be said in it), and **neither** — people whose punch has nothing to be measured
against at all. That last number has to reach zero before anybody is paid from
this system. The + button follows the selector: a `Shift Type` on one half, a
`Shift Assignment` on the other.

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
- **Work Pattern as *they* draw it.** Ours answers the same question from
  `Shift Assignment`, but what their screen carries — a named rotation, most
  likely — is still unseen, and a rotation is a thing ERPNext has no object for.
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
  is probably a grouping.
- **The Advance tab now carries Group By and Show Categories.** *This* report's
  tab has still never been opened; those are the two controls the In / Out and
  Daily Detail tabs were photographed holding (§17, §18), carried across and
  labelled as carried across rather than as seen. Group By sections the muster
  by category, above Filter By, which sections it above the person; Show
  Categories puts up to three category columns beside the name, where a reader
  will find them rather than past thirty-one day columns. If Factor HR's own tab
  turns out to hold these two, nothing changes.
- **The Payable column stays blank until there is something behind it.** Five
  Sundays in a month is not five payable days; it is a month nobody has
  measured, and this is the column payroll reads. It fills in only for a person
  with at least one real `Attendance` row, and it adds up what the grid holds
  rather than applying a policy — **because the policy has not been stated**.
- **The Excel button is now the five-format split** the other two attendance
  reports carry — PDF · Excel · Word · Print · Preview — over the grid exactly as
  it is on screen, filters, categories and layout options included. A muster is
  the one attendance report somebody genuinely prints, and With Logo has been a
  letterhead waiting for a page since §22 was written.
- **Generate has its split back**, with the same three items and the same answer:
  no queue here, and the two scheduling items open ERPNext's `Auto Email Report`
  on the site.

### Still open

- **What the upload icon beside Search Employee does.** A list of employee codes
  to filter by is the guess; nobody has pressed it.
- **What else Report Period offers** besides *Date Wise*. Daily Detail's menu
  turned out to hold exactly two entries (§18); this one has not been opened, so
  it still offers the one that has been seen.
- **What this report's Advance tab actually holds** — one screenshot. Two
  controls are on it here, borrowed from the tabs that have been opened.
- **What the grid looks like with data in it**, which is the half of this screen
  that would tell us what the columns actually are.

---

## 23 · Employees — Employee Profile, 29 Aug 2026

**§15 was right that Employee Detail is a report builder, and wrong to conclude
from that that Factor HR has no record page.** It has one, and this is it. It is
not on the Employees sub-menu in §9; it is reached by clicking a person, which
is what the **→** on a card on Employee Master always looked like it did.

### The screen

A header card across the top, a thirteen-item list down the left, and one pane
at a time on the right.

| Part | What is on it |
|---|---|
| **Avatar** | Two initials in a circle — `CJ` — with a pencil badge. No photograph on this record |
| **Name line** | `HPT-001 - CHARLEYS JOSEPH`, and five icons top right: reload, print, org chart, history, ⋮ |
| **Chips** | ● Active · **Machine Code** 07 · **Old Code** 07 · PRODUCTION FOREMAN · PRODUCTION · 📍 - |
| **Header fields** | Date Of Birth · Date Of Joining · Leaving Date · Confirmation Date · Company Email · Mobile Number · Reporting Manager · Approving Manager |
| **Sidebar** | About · Joining Details · Past Company Detail · Organization Info. · Attendance Info. · Employee Identity · PF & ESIC Details · **Personal Details ⌄** · Other Details ⌄ · Separation · Document · Assets **0** · Bank |
| **Personal Details, opened** | Personal Info. · Address Info. · Family Details · Miscellaneous Info. · Emergency Address · Qualification Details |
| **Pane** | The heading, a pencil and a reload icon, then the fields in three columns |

Only one pane has been seen open: **Joining Details**. One caret has been seen
opened: **Personal Details**, and its six sub-items are below.

### Machine Code and Old Code are the two chips that matter

**Machine Code 07** is the fingerprint machine's enrolment number, on the header
card, beside the name — which tells us Factor HR treats it as identifying rather
than as a setting. It maps to `attendance_device_id`, and CLAUDE.md §5 already
says what happens when one of those is wrong.

**Old Code 07** is a field for the system *before* Factor HR. Whoever migrated
into Factor HR kept the previous identifier on the record, and it is still being
displayed years later. `custom_factor_hr_id` in [SCHEMA.md](SCHEMA.md) §3 is the
same idea one migration further on, which is a small confirmation that keeping
it was right.

### Personal Details, opened — the menu is deeper than ours, not wider

Six sub-items, and the useful half of the finding is that **five of them land on
fields ERPNext already has**. This is a menu one level deeper than the ERPNext
record, not a system holding more than it.

| Sub-item | What is behind it here |
|---|---|
| **Personal Info.** | `gender`, `date_of_birth`, `blood_group`, `marital_status`, `salutation`, plus `custom_nationality` and `custom_religion` off the 25 Aug backfill |
| **Address Info.** | `current_address` and `permanent_address`, with their accommodation types. **Free text, one blob each** |
| **Family Details** | The three backfilled names — father, mother, spouse — and `family_background` |
| **Miscellaneous Info.** | `bio`, `health_details`, `prefered_contact_email` |
| **Emergency Address** | `person_to_be_contacted`, `relation`, `emergency_phone_number` — **and no address** |
| **Qualification Details** | The `employee_education` child table |

Three of the six are worth arguing about:

**Emergency Address is named after the one part ERPNext does not have.** Frappe
holds a name, a relation and a phone number; Factor HR names the whole pane
after the address. It is also **empty for everybody on this site** — and this is
the pane somebody reads at two in the morning when a night shift goes wrong.
Closing that is a data load, not code, and it belongs before go-live.

**Address Info. having a pane to itself usually means the parts are separate
fields there** — district, PIN, state. Here it is one free-text blob per
address, so nothing can be reported on by area. A group that buses people into
factories may well want that.

**Family Details has nowhere to grow.** The three names came across in the
backfill and are empty for everybody. But **ERPNext's `Employee` has no family
member table at all**, so dependants, their dates of birth, and the **nominee**
have nowhere to go — and the nominee is the one that matters when somebody dies
in service. §15 flagged Nominee as a section of Factor HR's report screen with
no equivalent here; this is the second place the same hole shows up.

### Joining Details, transcribed — and the rows with nothing behind them

The pane holds sixteen labels. Ten map onto ERPNext's `Employee`. **The rest do
not, and those are the finding:**

| Factor HR | Where the answer actually is |
|---|---|
| **Group Joining Date** | Nowhere. ERPNext has one joining date; Manna is a group, and this dates service to the group. **It decides gratuity**, so it is a field to add |
| **Gratuity Start Date** | Nowhere. hrms computes gratuity from `date_of_joining`, which differs from the above exactly for anybody who has moved between Manna companies |
| **Transfer Date** | On the `Employee Transfer` document, not on `Employee` |
| **Expected Confirmation Date** | Nowhere. ERPNext holds the confirmation, not the date it was due |
| **Probation Period In Days** | Nowhere — and without it nothing can compute the row above |
| **Last Working Date** | Nowhere. Factor HR keeps the date a resignation takes effect apart from the last day somebody was at the gate; ERPNext has one `relieving_date` |
| **Pay Structure Applied From Date** | On the Salary Structure Assignment, one per revision |
| **Notice Period For Employer** | ERPNext has one `notice_number_of_days` and does not say whose |

The first two are the same question asked twice, and it is a **payroll** question
rather than a display one: somebody who joined Manna Rubber in 2013 and moved to
another Manna company in 2020 has one gratuity entitlement and two joining
dates, and only one of them is on the ERPNext record. **Worth putting to Manna
before anybody is paid a gratuity out of this system.**

`Confirmation Date` is the one row that came out better than expected: the
25 Aug backfill landed Factor HR's own value in `custom_confirmation_date` for
72 people, where ERPNext's `final_confirmation_date` is empty on every record
read so far. The screen prefers the backfilled one.

### Rebuilt here

`app/web/src/sections/employees/EmployeeProfile.jsx`, with the field map in
`src/data/profile.js` — header card, sidebar and pane, in that shape.

- **A card on Employee Master now opens this**, not Employee Detail. That is
  what §11 recorded the **→** as doing, and it was pointing at a report screen.
- **Joining Details is transcribed label for label, in its order**, dead rows
  included. Each says *not on this site* with the reason on hover. A row dropped
  because we cannot answer it reads as an oversight when the two screens are put
  side by side, and every one of them is a decision waiting to be taken.
- **Empty and absent are drawn differently, and that is the point.** *Not set*
  means the field is on this site with nothing in it — the migration's finding,
  since it loaded the master and not the paperwork. *No such field here* means
  ERPNext has no such field, and that is work. Frappe's document endpoint
  returns every column including the nulls, which is what makes the two
  separable; the page checks that nulls really are coming back rather than
  assuming it, and says so in the legend when they are not.
- **Personal Details is a caret group with its six sub-items under it**, drawn
  and behaving as a disclosure: opening it lands on Personal Info., closing it
  leaves the pane where it was and marks the group itself as current, so the
  list never shows nothing selected. At 900px the whole list becomes one
  scrolling strip and the children carry the page's wash instead of an indent.
- **Other Details keeps its caret in Factor HR and is a leaf here.** Nobody has
  opened theirs, so it holds the three leftover ERPNext fields rather than six
  invented children.
- **The panes nobody has screenshotted open say so on the screen.** They carry
  the fields this site holds under that heading, labelled as ours to argue with
  rather than as a copy of theirs.
- **Past Company Detail, Qualification and the transfer history come off the
  child tables** — the only place in this app they can. §15 had to disable six
  of its fourteen tick boxes because a list call cannot reach a child table; a
  document read carries them whole, and this page already makes one.
- **Assets reads the live register**, filtered to this person's `custodian`, and
  carries the count on the sidebar item the way Factor HR does. It is 0 on both
  sides.
- **Document draws nothing, deliberately.** Attachments are the `File` doctype,
  which is not on the proxy's allowlist — a token that can read every attachment
  on the site is not something to hand to a page on localhost.
- **PF & ESIC is the statutory blocker in one screen**: no UAN, no ESIC number,
  and no IFSC on Bank. None of the three is on ERPNext's `Employee`, and no
  Indian return or bank transfer file can be written without them.
- **Every pencil is disabled** and says why on hover. The dashboard reads.
- **The report on Employee Detail moved into the store**, so clicking a row
  there to open somebody's profile no longer throws the report away. Rebuilding
  one costs the site's daily compute limit.

### Still open

- **The panes themselves, opened.** Personal Details' six sub-items are now
  known by name; what is *inside* each of the six is not, and neither is any
  pane but Joining Details.
- **Other Details, expanded.** It is the one caret still shut. The report
  screen's Skill Set and Nominee are the likeliest contents, and Nominee is the
  one with no ERPNext field behind it.
- **What the ⋮ and the history icon hold.** History is presumably an audit of
  who changed what, which ERPNext keeps on `Version` and this page cannot reach.
- **Whether Group Joining Date is per company or per person**, and who sets it
  when somebody transfers. This is the gratuity question above.
- **Whether the pencil edits in place or raises a request.** §6 lists an
  `Employee Profile` approval queue, empty at every look — which suggests the
  answer is "it raises a request and nobody has ever used it".

---

## 24 · Employees — Salary Master, 29 Aug 2026

The screen §9 could only guess at from its menu entry. It opens **empty**, and
what it opens with is the whole finding.

### What it draws

> **SALARY MASTER**  ·  three icons hard right: a padlock, an upload, an exit
>
> a bar: the status dot · `Search Employee` (magnifier on the right) · `+` ·
> a small list icon · **List of Employees**, blue-outlined, far right
>
> No Employee Selected
> Please select employee for show salary revisions

### What it settles

- **It is one person at a time**, exactly like Attendance Regularization in
  §16 — same empty state, same grammar, the noun swapped. Two screens built to
  the same pattern is a pattern, and it is the one their whole app navigates
  by: pick a person, then look at their history of a thing.
- **The unit is a *revision*, not a structure.** Their own word, in their own
  empty state. A salary structure is what somebody is on; a revision is a dated
  change to it, and it is the dated part that §12's CTC report cannot do —
  `ctc` on `Employee` is one undated number.
- **`List of Employees` is a second way into the same choice**, which is why it
  is the only coloured control on the bar. Typing is the fast path and the
  panel is the browsing one; neither is a different screen.
- **The three title icons are a lock, an import and an export.** An import on a
  salary master is the most dangerous button in either system, and it sits two
  clicks from the login.

### What was built

`app/web/src/sections/employees/SalaryMaster.jsx` draws it — the title bar, the
three icons, the dot, both pickers and the empty state, word for word. Picking
somebody works and lands on the honest answer: **no revisions for anybody**,
because a revision needs a `Salary Structure Assignment` and none exist. The
one figure it can show is `ctc`, and it is labelled as what it is.

Everything that would write is drawn disabled with its reason on hover. The
proxy's allowlist carries no payroll doctype and that is deliberate rather than
pending — this process holds a System Manager token, and salary is the one
table where a read-only window is still a leak.

### Still open

- **The screen with somebody selected.** This is now the screenshot worth
  having, and the only one that answers what a revision row carries: effective
  date, gross, the earning heads, who approved it. Everything above is the
  frame around a list nobody has seen.
- **What `+` asks for.** It is the form that creates a revision, so it is also
  the closest thing to a specification of their salary structure.
- **What the small list icon shows** — never opened, and not guessed at here.
- **Who can open this page.** Unchanged from §9 and still the one that decides
  a permission build: if Salary Master is visible to every HR login, the
  like-for-like in ERPNext is not the default, and per CLAUDE.md §5 an omission
  there is a leak rather than a lockout.
- **Open question E1 is still the unlock.** The Salary Register export is this
  screen for all 504 people at once, and nothing here can be filled without it.

---

## 25 · Leave — the sub-menu, 29 Aug 2026

The Leave module's second-level menu, read off the tenant:

> Apply Leave · Leave Balance Report · All

**Three items, against Attendance's eight.** That is the finding, not a gap in
the screenshot: leave in this tenant is one form and one report. Neither page
underneath has been opened, so what follows is what the menu itself settles.

### The one report on it is the one we already hold

`Leave Balance Report` is a Quick Report as well as a menu item — §1 lists it
under the exports available without asking support, and its numbers are
transcribed in §4. So of the two real pages on this menu, **one is already
covered by data in hand**, which is why Leave has never needed a screenshot
round of its own.

What we hold is the report's *summary* — six types, people with a balance,
accrued, availed, balance. What is still missing is the per-person opening
balance behind it, which is open question **D3** and unchanged by this screen.

### Apply Leave is the whole of the write side

One form. There is no separate leave approval page on this menu, because
approvals live under Dashboard → Approvals (§6, the Leave tab, 3 pending on
28 Aug). So Factor HR's leave model is: apply here, decide there, report from
the balance screen — and stock Frappe HR covers all three with `Leave
Application` plus `Leave Ledger Entry`.

**Nothing on this menu is the accrual rule.** Same shape as the attendance
policy engine in §10: the configuration that decides the numbers has no menu
item of its own, so it cannot be recovered from screenshots of this module. It
has to be asked for. The difference is that this one is a much smaller ask —
who accrues, how much, monthly or annual, and whether the leave year runs
January or April.

### What was built

All three now exist in the dashboard, in this order and under these names —
`app/web/src/sections/leave/`, reached from Leave in the nav.

| Menu item | Page | What is behind it |
|---|---|---|
| **Apply Leave** | `ApplyLeave.jsx` | Their screen, control for control — the form, the month calendar and its seven-colour legend, Other Team Member On Leave, and Leave History. It does not submit |
| **Leave Balance Report** | `LeaveBalances.jsx` | Their export of 23 Aug, unchanged — already built, now under their own name for it |
| **All** | `LeaveAll.jsx` | The module index, the same shape as Attendance → All |

Two pages we carry that they have no menu item for — **Leave types** and
**Reports** — are appended after `All` rather than interleaved, so the three
above still compare item for item. Both existed before this menu was captured;
`Leave types` is the page that was previously the module's landing page.

**Apply Leave does not write, and says so on the button rather than being
greyed out.** Two reasons, and only the first is about the page: creating a
Leave Application is a POST, and the proxy answers GET plus one allowlisted PUT
(`app/serve.js`); and no leave type has an entitlement, so there is no balance
for an application to be checked against. The second is the real blocker and it
is the same one §4 ends on.

### Apply Leave itself, 29 August 2026

Screenshotted at last, and it answers the half-day question §24 was holding
open. Two columns — the application on the left, a month calendar on the right —
with Leave History across the bottom.

| Part | What it holds |
|---|---|
| Above the panel | the coloured status dot · `Search Employee` |
| Panel head | **APPLY LEAVE** · search · refresh · import |
| Row 1 | **Document No** `-` · **Date Of Application** `29-Aug-2026` |
| Row 2 | **Leave Type** *(Select Leave Type)* · **Available Balance** `0` |
| Row 3 | **From Date** · **Leave Value** |
| Row 4 | **Till Date** · **Leave Value** |
| Then | **Remarks** · **Attachment** *(Choose file / Browse)* · **Email Notification To** (dot + `Search Employee`) · **Submit** / **Cancel** |
| Right | **August 2026** · Today · ‹ › · the month · the legend · **Other Team Member On Leave** — *No team member on leave* |
| Below | **Leave History** — Leave Type · From Date · Till Date · Day(s)/Hour(s) · Applied · Status · Last Action By · Last Action On |

**Leave Value is asked per date, and that is the finding.** Full Day / First
Half / Second Half against *each* end of the range. Frappe HR's `Leave
Application` carries one `half_day` flag and one `half_day_date` — so a range
that is half a day at both ends is a shape their form can hold and the doctype
cannot. It would have to be two applications, or a field added. Our form counts
it correctly and says where the writing stops rather than rounding somebody's
leave.

**Available Balance reads `0` on their screen too.** The same zero for a
different reason on each side, and worth pinning down: on ours it is because no
leave type has an entitlement, so nothing has been allocated. On theirs it is
either the same gap or a person with none of that type left — and the screenshot
was taken with no leave type selected, so it is probably the placeholder. Either
way it is the number an application is measured against, and it is question
**D3** again.

**The legend is seven colours**, unspaced as they write them: Absent, WeekOff,
UnApprovedLeave, Partial, Holiday, ApprovedLeave, OptionalHoliday. Five can be
answered here — weekly offs and named holidays off the employee's holiday list,
Open and Approved applications off `Leave Application`, and Partial off
`half_day_date`. **Absent** needs generated `Attendance` and the site holds
none. **OptionalHoliday** cannot be filled at all: a stock ERPNext `Holiday` row
has a date, a description and a weekly-off flag, and no optional flag — Factor
HR treats optional holidays as a category somebody picks from, and rebuilding
that is a decision rather than a query.

**Email Notification To is a second employee picker**, which ERPNext has no
field for: it notifies the `leave_approver`, which nobody has set. The reporting
manager is offered in its place and labelled as the inference it is.

**Other Team Member On Leave needs a definition of "team".** Theirs has not been
seen. Ours reads it as everybody reporting to the same manager, falling back to
the same department where nobody has one — 88 people have no `reports_to` — and
the page says so rather than leaving it to be assumed.

**Last Action By / On are `modified_by` and `modified`.** Who touched the row
last, which on an application edited after approval is not who approved it.
Their column reads as an approval trail; ours is labelled as what it holds.

### Still open

- **The accrual rule.** Unchanged from §4, and now visibly the thing every page
  on this menu waits for. It is question **D3** and it is one conversation.
- **What Available Balance shows for somebody who has a balance.** The
  screenshot was taken with no leave type chosen.
- **Whether OptionalHoliday is a second holiday list or a flag on the rows.**
  Decides whether it is a migration or a model change.
- **Factor HR's definition of a team**, for the panel that uses it.
- **Whether "All" is a page or the menu spilling over.** Same question as §10,
  read the same way — as the module index, which is useful either way.

---

## 26 · Loans — the sub-menu, 29 Aug 2026

The last uncaptured menu but one. Four items:

> **Loan Application · Loan Register · Loan Projection · All**

This closes the gap the module coverage table has carried since it was written.
**Survey is now the only Factor HR menu nobody has looked at.**

### What the menu itself says

Three real pages, and the third is the informative one.

- **Application and Register would be on this menu whatever Manna does.** Every
  HR product has them and their presence tells us nothing.
- **Projection only earns a menu item if the schedules are long.** Nobody builds
  a forward recovery view for an advance recovered out of next month's pay. That
  points at multi-month loans, which is a materially bigger build than an
  advance — and it is the first question to ask.

Note also what is **not** there: no approval queue and no disbursement screen.
§6 lists seven approval tabs and none of them is a loan, so either sanctioning
happens inside the application itself or it happens off the system entirely.

### Nothing on our site can receive any of it

`hrms` is not installed — the standing blocker for half this nav. Loans carries
a second one on top of it:

**On Frappe v15 and later the Loan Management doctypes are not part of `hrms`.**
They were moved out into a separate `lending` app; `Employee Advance` stayed
behind. [FACTOHR.md](FACTOHR.md) §3 marks Loans **Free** against the older
layout, and on a v16 site that verdict may cost a third app rather than nothing.

*This has not been checked on a bench.* It is one `bench get-app` either way, but
it is not the answer the parity table currently gives, and it should be confirmed
before it is quoted to anybody.

### The blocker is an export, not a build

**None of the nine Factor HR exports carries a loan report.** So we hold no
outstanding balance for any running loan.

This is the same shape as the leave opening balances (**D3**) and it is worse.
A wrong leave balance is an argument; a wrong loan balance is money — recovering
from somebody who has finished paying, or stopping short and writing off the
rest without meaning to. Outstanding is `disbursed − recovered` and we hold
neither side of that subtraction, so it cannot be derived, only loaded.

**Ask for the loan register as an export**, the way the Leave Balance Report was
asked for. Until it arrives the module cannot be migrated, only started fresh —
which is a legitimate answer if the running count is small, and nobody knows
whether it is.

### The Loan Application screen, 29 Aug 2026

Photographed at last, and it is a bigger screen than the menu implied: five
tabs, seventeen fields, an attachment box and an amortization grid.

> **Loan Application · Pre Recovery · Recovery From Payroll ·
> Stop Loan Deduction · Manual EMI Deduction**

**The form carries a whole lending product.** Interest Type, a schedule, a Loan
Balance split into principal and interest, and four Perquisites columns —
Perquisite Rate, Perquisite On, Perk Value, Perk Amount. Held against the
Projection capture, where the two types in use are *Salary Advance* and *Tour
Advance* and Include Interest is unticked, the reading is that **the machinery
is the vendor's and Manna uses some subset of it**. So the lend-or-advance
question is narrowed rather than closed — but it is now worth asking precisely,
because the answer is a *setting* over there and an *app* over here.

**Sanctioning happens on this form.** Amount Requested and Sanctioned Amount are
two fields on one screen with Loan Status beside them, and none of §6's seven
approval queues is a loan. That confirms what the menu only suggested: whoever
can open this screen can sanction, and there is no workflow in front of it. Same
shape as `Additional Salary` under §27, and the same policy question.

**Closure is automatic unless somebody stops it** — Loan Completed, drawn
read-only, with *Do not auto complete* beside it and Loan Completed On under
both. A loan can finish its schedule and still be owed, and their form has a
control for exactly that.

**Four of the five tabs are the recovery lifecycle**, and each is a way for the
schedule and the payslip to stop agreeing: a repayment outside payroll, a
deduction inside it, a hold, and an instalment typed by hand. All four exist
over there because over there they happen — and any of them can leave a balance
that is neither what the schedule says nor what has been recovered, which is the
number this section already says has to be loaded rather than derived.

**The rate and the term are not on the form.** They belong to the loan *type*,
which is also where ERPNext keeps them (`Loan Product`). A rare case where the
two systems already agree about where a number lives, so that part of the
migration is a master rather than a mapping.

#### And one thing nobody has costed

**An interest-free advance over ₹20,000 is a taxable perquisite.** Sec 17(2)(viii)
with Rule 3(7)(i): valued at the State Bank rate on the first day of the year,
applied to the maximum outstanding monthly balance, less any interest actually
charged. Exempt in two cases only — an aggregate at or under ₹20,000, and
treatment of a specified disease, which is what *Loan Required For* on their form
decides. Their four Perquisites columns are that calculation. **Nothing in
`hrms` computes it, and neither does the `lending` app** — it is an Indian
payroll rule, so it lands in the same place as the PT slabs and the bonus
working: a build, and one that feeds TDS rather than a report.

#### Rebuilt here

`app/web/src/sections/loans/LoanApplication.jsx`, control for control — their
bar, their five tabs, both columns with the four mandatory fields shaded the
yellow their form shades them, the attachment box and the grid with its two
spanned column groups. Nothing on it writes; there is no doctype to write to.

The schedule is the exception and it runs, because it is arithmetic rather than
storage: reducing balance, flat or interest-free, rounding absorbed by the last
instalment so the principal column sums to the sanctioned amount exactly, and
the perquisite computed per month beside it. Rate, term and the State Bank rate
are asked for in a box of their own labelled **Not on their form**, because they
are not.

### Still open

- ~~**Does Manna lend, or only advance?**~~ **Answered: they advance.** The Loan
  Type box on *both* Loans forms — the projection and the register's criteria
  panel — reads `Salary Advance, Tour Advance`. The Projection item suggested
  lend and was wrong about it; what it actually implies is a multi-month
  recovery schedule, which an advance can have.
- **How many loans are running, and what is outstanding?** Neither is knowable
  from anything we hold.
- **Is there interest?** An interest-free advance needs no accrual and no rest
  calculation, and is a much smaller build.
- **Up to what, and on whose signature?** *Where* is answered: sanctioning
  happens on the application itself, with no approval in front of it — see the
  Loan Application capture above. The limit, and whether it is per company or
  group-wide, is still a policy question and impossible to guess.
- **What happens to a balance when somebody leaves?** 344 people have left over
  the years. Deducted from the final settlement, written off, or chased — and
  the register cannot have a Status field until this is answered.


---

## 27 · Payroll — the sub-menu, 29 Aug 2026

Nine items, read off the tenant's left-hand nav:

> **Adhoc Payments/Deductions · Salary Process · Final Settlement ·
> IT Declarations · Bank Transfer · Bonus Working Report · Salary Payslip ·
> Salary Register · Prof. Tax Statement**

**The capture is cropped at the top.** Whatever sits above Adhoc Payments is
unread, so it is left blank rather than guessed at — §1 already has their
Payroll Summary from the dashboard, and Final Settlement is the screen §1 read
as "F&F Summary". Their menu's spelling is the one used on the tab here.

**This changes nothing about the decision.** Payroll is calculated by hand and
section E is out of the initial release — 23 Aug 2026, still true. What the menu
gives is the *price* of the decision, which is the thing anybody will be asked
for the moment it is revisited.

### Seven of the nine are stock Frappe HR

| Factor HR page | What would stand behind it | |
|---|---|---|
| Adhoc Payments/Deductions | `Additional Salary` | stock |
| Salary Process | `Payroll Entry` → `Salary Slip` | stock |
| Final Settlement | `Full and Final Statement` + `Gratuity` | stock |
| IT Declarations | `Employee Tax Exemption Declaration` / `Proof Submission` | stock |
| Bank Transfer | `Make Bank Entry` + the `Bank Remittance` report | **part** |
| Bonus Working Report | nothing | **build** |
| Salary Payslip | `Salary Slip` + a print format | stock |
| Salary Register | the `Salary Register` query report, same name both sides | stock |
| Prof. Tax Statement | a salary component with a condition | **build** |

That is the useful finding about the module everybody assumes is the expensive
one: **the expense is not the payroll engine, it is the data and the two India
statutory reports.**

### The two that are not free are both statutory reporting

- **Bonus Working Report.** The Payment of Bonus Act working — who is eligible
  (wage up to ₹21,000, thirty working days), what it is computed on (₹7,000 or
  the minimum wage, whichever is higher), and the rate between 8.33% and 20%.
  `Additional Salary` *pays* a bonus; nothing computes one, and nothing prints
  Form C.
- **Prof. Tax Statement.** PT is a state levy and Frappe HR models it as a
  salary component with a condition — the mechanism ships, the slab table and
  the statement do not. Same shape as the LWF finding in §14.

### Three blockers that are not payroll at all

1. **E1.** The Salary Register export is one click away in their Quick Reports
   and nothing under this menu can be built without it.
2. **PAN is on 2 of 504 people.** No PAN, no TDS computation, and a flat 20%
   under §206AA. IT Declarations is a collection exercise before it is a build.
3. **There is no IFSC field on ERPNext's `Employee`.** §23 found the same hole
   from the profile side. No Indian bank transfer file can be written without
   it, and the bank's own upload format is a per-bank build on top.

### And one trap worth writing down before the first run

`Payroll Settings` has **Consider Unmarked Attendance As**. Set to *Absent*, a
day the shift job has not yet processed is a day's pay gone — which is the same
class of mistake as the one §5 of [../CLAUDE.md](../CLAUDE.md) is about, arriving
from the payroll side instead. Read it before anybody is paid from this site.

### Adhoc Payments/Deductions, the screen itself — 29 Aug 2026

Photographed. A title bar with six icons pinned right — **+Add, edit, delete,
search, import, export** — then one bar of five filters:

> **Employee** (a status dot and Search Employee) · **Year** · **Payment
> Process** (*Salary*) · **Payroll Type** · **Day**

Only Payment Process carried a value, and none of the four lists has been
opened. Under the bar, four columns — DESCRIPTION, EARNING, DEDUCTION,
REFERENCE / REMARKS — over one heading and four rows:

> **CTC Wise Input** → GRATUITY AMOUNT MANUAL · HEALTH INSURANCE CTC ·
> **1 REGULAR EARNING** · FOOD ALLOWANCE · LEAVE TRAVEL ALLOWANCE

The capture is cropped below the last of them, so the list has no end here and
nothing on our side states a total. REGULAR EARNING sits at the same indent as
the component rows but carries a 1 and is drawn in their link blue: heading or
row is not resolvable from the capture, and is left unresolved.

**The two amount cells are blank because they are inputs.** So this screen is
not a list of payments already made — it is the component list, and somebody
types an amount against a person into it. Three findings follow:

1. **Their one screenful is our N documents.** `Additional Salary` is one
   document per person, per component, per date. Forty people taking a food
   allowance is one grid there and forty rows here, and any import written
   against **E1** has to unfold it that way round.
2. **Two of the rows are not adhoc payments at all.** Gratuity is computed from
   service length by a `Gratuity Rule`; Health Insurance CTC is employer cost
   carried in the CTC. Both are salary-structure components here, not
   `Additional Salary`. One screen there is three doctypes here, and the labels
   do not show the split.
3. **Nothing approves any of it** — the open question above, arriving from the
   screen instead of from the menu.

Drawn at `app/web/src/sections/payroll/Adhoc.jsx`, rows in
`src/data/payroll.js`. The employee picker is live because `Employee` is; the
four lists are dead and each says which kind of dead; +Add and Import open the
job on the site.

### Salary Process, the screen itself — 29 Aug 2026

Photographed on **MAR 2026**. Three lists — **Year** (*2025-26*), **Payroll
Type** (*Monthly*), **Process For** (*All Employees*) — over a strip of twelve
month chips, April first, with a **+** on the end. Then one summary line:

> MAR 2026 · PAYROLL DATE: 01 Mar – 31 Mar 2026 | CALENDAR DAYS 31 ·
> ATTENDANCE DATE: 01 Mar – 31 Mar 2026 | CALENDAR DAYS 31 ·
> STATUS: **NOT GENERATED**

six tiles, Generated By / Generated On with a **Payslip Remarks** box, and
**Start Salary Process** (split), **Finalize Process** and a gear.

| Tile | Read | What stands behind it here |
|---|---|---|
| Total employees *(incl. left)* | **160** `+9` `-13` | `Employee` — joiners off `date_of_joining`, leavers off `relieving_date` |
| Pending count | **147** | `Employee`; nothing is processed, so pending is everybody |
| Process count | **0 / 160** | `Salary Slip` — none, and no `Payroll Entry` has ever run |
| Stop salary | 0 | **nothing** |
| Stop payment | 0 | **nothing** |
| Total arrears | 0 / 0 | `Additional Salary` with a back-dated `payroll_date` |

**147 is exactly 160 − 13.** Which reads as leavers dropping out of the
ordinary run and going through Final Settlement instead. It is a reading of two
numbers rather than something their screen says, and it decides whether a
part-month leaver is paid here or on the F&F screen — worth confirming before
anybody relies on it.

**Stop Salary and Stop Payment have no equivalent at all.** Frappe HR ships no
flag on `Employee` or `Salary Slip` that holds one person out of a run, and the
two are not the same hold — one stops the salary, the other stops only the
payment of a slip that still generates. Both are a custom field plus a rule
inside the run. Both read zero in the capture, so how often they are used is
unknown.

**Their two date ranges are separate controls**, and identical here. That is how
an attendance cut-off other than the month end would be said — 26th to 25th,
say. A `Payroll Entry` has one period for both, so a cut-off would be a custom
field and a change to how attendance is counted, not a setting.

Drawn at `app/web/src/sections/payroll/SalaryProcess.jsx`. The year, the month
strip and everything on the summary line are live — it is date arithmetic off
the same `fyMonths()` the payslip form walks. Everything below it is payroll
state, so the tiles come off `Employee` where `Employee` can answer and are
drawn as a dash where nothing here means what the tile means. `relieving_date`
is a probe made when the screen is first opened, not a field on the dashboard's
own load. All three buttons write, so all three open on the site — and the gear
goes to `Payroll Settings`, which is where the trap below lives.

### Rebuilt here

One page per item on their menu, and nothing else:
`app/web/src/sections/payroll/`, with the mapping tables in
`src/data/payroll.js`. Every one carries the **Deferred** badge, and the ones
that show a number say where it came from — no payroll doctype is on the proxy's
allowlist, so every figure on them is read off `Employee`, off `Company`, or off
the Factor HR export, and is labelled as such.

**Payroll Summary and Quick Reports · Payroll were dropped, 29 Aug 2026.**
Neither was on their menu. The first was §1's reading of their dashboard tile
and drew nothing but its own title; the second was a panel of five report names
already recorded above and in `FH_REPORTS`. Clicking Payroll in the rail now
lands on **Adhoc Payments/Deductions**, the first item of their own menu — the
same rule On Board, Attendance and Leave already follow.

Three of them do say something this site can answer today:

- **Salary Process** counts holiday lists and `Attendance` rows, because those
  two decide payment days and both are the real blocker.
- **Bonus Working Report** is the one page under this menu that computes rather
  than describes, and it is built to their form: From and Till as *months*,
  Employee Status as a chip box, Particular Employee, Filter By, Output
  Currency, Report Output and With Logo, then their five buttons. Their range
  read Apr-23 to Mar-27, which is four accounting years — so the working is one
  row per person **per accounting year**, April to March, sectioned and never
  added across. Every figure on it is a floor, and for three separate reasons
  rather than one: eligibility is tested on CTC ÷ 12 because no basic-plus-DA
  figure exists (so **Yes** and **No** are certain and the third value is
  **Unknown**); sec 12's basis is ₹7,000 because no minimum wage notification is
  held anywhere; and sec 8's thirty *working* days is tested on days in service
  because there are no `Attendance` rows. The output is the same one HTML
  document the other reports print, so Excel, PDF, Word, Print and Preview
  cannot disagree with the screen.
- **Prof. Tax Statement** lists the four companies and marks Manna Tyre UAE as
  the one none of it applies to. One salary structure cannot serve both
  regulators, which is F4 arriving a third time.

### Still open

- **What sits above Adhoc Payments on their menu.** One screenshot.
- **Which state each Indian company is registered in for PT**, and in Kerala,
  which local body. One answer settles the slabs, the periodicity and how many
  components exist. Ask it with **E2**, not separately.
- **Whether adhoc pay needs approving.** There is no workflow on
  `Additional Salary`, so today anybody who can create the doctype can pay
  somebody. A Workflow plus a queue row is about a day — but it is a policy
  question first.
- **How a payslip reaches somebody with no email and no login.** 0–4 web logins
  a day across the company says the portal is not the answer, which leaves paper
  or the phone app.
- **Which bank each company pays from**, and whether the group pays through one
  account or four.


---

## 28 · Payroll — FNF & Separation, 29 Aug 2026

Their Final Settlement menu item opens a screen headed **FNF & Separation**,
and it is three screens rather than one — three numbered stages across the top:

> **① Separation · ② Exit Employees Clearance · ③ Final Settlement (16)**

The third was the one open in the capture. Two bars of filters sit under the
stages, and under those a card per person.

| Bar | Controls, left to right |
|---|---|
| First | `Last 50 Activities` · radio **Date of Leaving Range** / Settlement Date Range · `YEAR 2026- 2027` · the status dot · `Search employee…` |
| Second | a tick-all box · `DATE FROM` · `DATE TILL` · `STATUS: FNF Not Done` · `SEARCH` · refresh, download, upload |

Each card carries a photo circle, `MRP-032 MR ARUN BENG`, the designation under
it, a green **FNF Not Done** chip, and three underlined marks on the right —
**SEPARATION** and **CLEARANCE** green, **FNF** amber. Below that: `DOJ`, `DOL`,
`EXP DOL`, `FNF PROCESSED DATETIME`, and four action icons.

### The zero on their summary tile is a backlog

§1 read their F&F Summary as three zeroes — *0 processed, 0 on notice, 0 exit
clearance pending* — and this repo has been repeating "all zero in Factor HR"
ever since. **Sixteen people are in the settlement stage.** Both readings are
true and they are not the same sentence: nothing has been *processed*, and
sixteen are *waiting*. The distinction matters because it is the number the
migration gets sized from, and a summary tile that reads zero when there is a
queue behind it is exactly how a backlog gets carried across unnoticed.

### DOL and EXP DOL are empty on every visible row

These are people their system has already put in a leaving queue, and it holds
neither the day they left nor the day they are expected to. So whatever puts
somebody into this list, **it is not a date of leaving** — which is worth
stating twice, because the filter directly above the rows is a *Date of Leaving
Range*, and a range over a column that is empty for everybody returns nobody.

The reading is that these sixteen are on notice rather than gone: somebody
serving notice is still an active employee, and their DOL is not written until
they actually go.

### What would stand behind it

| Their stage | Ours | |
|---|---|---|
| Separation | `Employee Separation` | stock |
| Exit Employees Clearance | the activity table *inside* `Employee Separation` | stock |
| Final Settlement | `Full and Final Statement` + `Gratuity` | stock |

All three ship with Frappe HR, which is not installed here — and no payroll
doctype is on the proxy's allowlist even once it is.

### Rebuilt here

`app/web/src/sections/payroll/FnF.jsx`, with the capture in `FH_FNF_*` in
`src/data/payroll.js`. The three stages are drawn as tabs; the Final Settlement
one carries a real list, and the other two say only that they were never opened.

The list is **ours, not theirs**. It is everybody this site says is leaving or
has left — a relieving date, a resignation letter date, *or a status that is no
longer Active*. The third test is what their capture teaches: a filter on
`status != "Active"` would return the people who have already gone and miss the
entire queue the screen exists to chase. The exit fields come off `Employee` in
a read of this page's own (`loadSeparations`), guarded and never fatal.

Three of their four columns can be answered honestly and one cannot:

- **DOJ** and **DOL** are `date_of_joining` and `relieving_date`, read.
- **EXP DOL** is **computed, not stored** — `resignation_letter_date` plus
  `notice_number_of_days`. ERPNext has no expected-last-day field, and the page
  says so where it draws the column.
- **FNF PROCESSED DATETIME** is always a dash, and the table under the list says
  it can never be anything else here.

### Still open

- **What their ① and ② screens look like.** Two screenshots. Neither has been
  opened, and nothing about them is guessed at on our side.
- **Whether the sixteen are on notice or already gone.** The reading above is a
  reading. One column of their export settles it.
- **Which departments sign off an exit clearance, and in what order.** That list
  is the `Employee Separation` activity table, and it is a policy answer rather
  than a build.
- **What happens to a running loan balance at settlement** — §26 asks the same
  question from the other side, and it is the same answer.


---

## 29 · Payroll — Salary Payslip, 29 Aug 2026

Their **SALARY PAYSLIP** screen, captured whole: one bar of filters, two tabs,
and three checkboxes.

| Bar, left to right | Value in the capture |
|---|---|
| `PARTICULAR EMPLOYEE` — status dot + `Search Employee` | empty, dot on All |
| `EMPLOYEE STATUS` | `All` |
| `Filter By` | empty |
| `PERIOD TYPE` | `Single Period` |
| import arrow, refresh, `Generate` split button | — |

The tabs are **BASIC** and **ADVANCE**, where every other report of theirs says
*Report Criteria* and *Advance*. Only BASIC was open.

| BASIC | Value |
|---|---|
| `PAYROLL TYPE` | `Monthly` |
| `YEAR` | `2025-26` |
| `REPORT OUTPUT` | `PDF` |
| `MONTH` | empty |
| `PAYSLIP FORMAT` | `Format 7` |
| ☐ Generate report for employees without email | off |
| ☑ Include Zero Value Employees | **on** |
| ☐ Include IT Statement | off |

### The three checkboxes are the finding, not the six dropdowns

Every one of them is about **delivery** rather than arithmetic: who gets a
document, whether somebody with nothing to pay still gets one, and whether the
tax sheet rides along. Factor HR is not only computing payroll on this screen,
it is mailing a hundred and sixty people a PDF every month — and that is the
part of E1 nobody has costed. A payroll engine that produces correct numbers
and cannot post them is not a replacement.

### Format 7 means there are at least seven

A payslip layout is a numbered library on their side and somebody chose the
seventh. Here it is a Print Format against `Salary Slip`, and stock ERPNext
ships one. **How many of their seven are actually in use is unknown**, and it is
a real number of days either way — worth asking before payroll is scheduled.

### PAYROLL TYPE now has one known value

The same control sits on their Adhoc Payments screen (§27), where it was empty
and was recorded as unknown. This capture is the first time it has held
anything: `Monthly`. The rest of its list is still unopened.

### Rebuilt here

`app/web/src/sections/payroll/Payslip.jsx`, with the capture in `PSL_*` in
`src/data/payroll.js`. The form is copied control for control, including the
controls nothing here can honour.

**The page produces the envelope, not the amounts.** Who a payslip would go to,
for which month, at which address, is answerable off the `Employee` master.
What would be *printed* on it is not answerable at all — no payroll doctype is
on the proxy allowlist and the site holds no salary structure — so the earnings
and deductions tables are drawn and left **empty** rather than filled with a
number derived from CTC. A payslip that is nearly right is worse than a blank
one, because somebody will be paid from it.

Four of the eleven columns are blank on every row, and they are the four payroll
would have filled: Payment days, Gross, Deductions, Net. CTC is real and is
labelled as what it is — an annual cost, not a month’s pay.

What the page *can* answer is the delivery question their own form keeps asking.
Pressing Generate probes `company_email`, `personal_email` and `prefered_email`
off `Employee` — a probe rather than three more fields on the page load, because
a field this site does not carry would fail the read that draws the whole
dashboard. The count of people with nowhere to send a payslip is then a real
number rather than an estimate.

Their *without email* box is only applied when those addresses actually came
back. With nothing to filter on it would silently drop all 160 people and read
as an empty payroll, and refusing somebody who is there is the expensive
mistake — CLAUDE.md §4.

### Still open

- **Their ADVANCE tab.** One screenshot. Nothing is drawn under it here.
- **What else PERIOD TYPE offers.** The name implies a multi-period sibling; the
  list was never opened, and what a payslip covers is not a thing to guess at.
- **Which of the seven payslip formats are in use**, and whether any of them is
  contractual.
- **How the slips are delivered, and to whom.** The line this page carried
  before today — *"getting it to 160 people is the part nobody has decided"* —
  now has half an answer: it can say how many of them have an address. Who
  sends, from which mailbox, and what happens to the ones with no address, it
  cannot.

## 30 · Payroll — Salary Register, 29 Aug 2026

Their **SALARY REGISTER** form, captured whole. It is the payslip screen's
near-twin — same chrome, same Payroll Type / Year / Month — with the three
checkboxes replaced by one chip box and two controls of its own.

| Row | Controls, left to right | Value in the capture |
|---|---|---|
| tabs | `BASIC OPTION` · `ADD ADDITIONAL COLUMN`, then refresh and a `Generate` split button | BASIC OPTION open |
| 1 | `SELECT EMPLOYEE` — status dot + `Search Employee` + import arrow | empty, dot on All |
| 1 | `EMPLOYEE STATUS` | `All` |
| 1 | `FILTER BY` | empty |
| 2 | `PAYROLL TYPE` | `Monthly` |
| 2 | `YEAR` | `2025-26` |
| 2 | `MONTH` | empty |
| 3 | `OUTPUT CURRENCY` | `Default` |
| 3 | `GROUP BY` | `-- Select --` |
| 4 | `OTHER OPTIONS` | five chips, all present |

The five chips, in their order: *Include Employee Master*, *Hide Old Code*,
*Hide Zero Value Columns*, *Include Zero Value Employees*, *Auto Correct Bank
Account Number*.

Note where the two buttons sit. **Refresh and Generate are on the tab row here**,
where every other report of theirs carries them on the filter bar. Same controls,
different furniture.

### Two of the five chips are not options, they are questions

- **Hide Old Code** says their system remembers a code somebody was known by
  before. `Employee` carries one, `employee_number`, and nothing that remembers
  a former one — so whether the Factor HR codes survive the migration at all is
  a decision, not a checkbox.
- **Auto Correct Bank Account Number** *writes*. A register run repairs the
  employee master as it goes. Whatever the intent, it means the act of printing
  a report edits records, and that is worth knowing before it is switched on
  anywhere near a live site.

### ADD ADDITIONAL COLUMN was not opened

Only the tab's name has been seen, and the name alone carries a finding: **their
register's columns are chosen per run.** On our side that is a Query Report with
its own column set, or a Script Report — so how configurable the register has to
be is a decision to take before E1 is unpacked, not after.

### Rebuilt here

`app/web/src/sections/payroll/SalaryRegister.jsx`, with the capture in `SREG_*`
in `src/data/payroll.js`. The form is copied control for control, and Generate
runs — over the `Employee` master, which is the only thing it is allowed to read.

Six of the ten columns are blank on every row, and they are the six the register
exists for: Payment Days, LWP, Gross, Total Deduction, Net Pay — and each is
blank for *two* independent reasons, no readable payroll doctype and no
generated `Attendance`, so fixing either alone would change nothing. **They are
blank rather than zero**, and the page draws the difference rather than
footnoting it: a zero is a figure somebody can be paid.

`CTC ÷ 12` is the one money column with anything in it, off the master, and it
is labelled as what it is — what somebody is contracted for, not what a month
paid them.

Of the five chips, two do something (Include Employee Master appends the master
columns; Include Zero Value Employees filters on the master's CTC, which is the
nearest question this side can ask). The other three are drawn, dashed, and each
says what it is short of when it is picked up or put down.

`OUTPUT CURRENCY` offers only `Default`, and that is the finding rather than a
gap in the copy: `Company` is read here without `default_currency`, and one of
the group's companies is in another country. A register that adds a dirham
column to a rupee column is wrong in a way no total shows.

### Still open

- **ADD ADDITIONAL COLUMN.** One screenshot, and with it whether their register's
  column set is per-run configuration we have to match.
- **What else PAYROLL TYPE offers.** Still `Monthly` and nothing else, on this
  screen as on the payslip and the adhoc one. Whether the factories run a weekly
  or fortnightly payroll is a policy answer nobody has given.
- **The currency per company**, without which a group-wide register cannot total.
- **E1 itself.** `REGISTER_COLS` at the foot of the page is the acceptance test:
  compare it column for column when the export lands, before anybody agrees a
  go-live date.


---

## 31 · Loans — Loan Register, the criteria panel, 29 Aug 2026

Their **Loan Register** opens on a report criteria panel: nine controls down one
column, three buttons under them.

| Control | Value in the capture |
|---|---|
| `Employee Status` | `Active, Inactive, Suspended, Tempo…` — clipped at the edge of the box |
| `Particular Employee` | empty, with a `…` picker beside it |
| `From Date` | `01-Apr-2025` |
| `Till Date` | `31-Aug-2026` |
| `Loan Type` | `Salary Advance, Tour Advance`, with a green tick and a red cross beside it |
| `Filter By` | empty |
| `Group By` | empty |
| `Report Type` | `Month Wise Recovery` |
| ☐ Exclude Zero Balance Loans | off |

Buttons: **Generate · Reset Fields · Close**. No Schedule Report and no Generate
In Background, both of which their attendance reports carry.

### It is the Loan Projection form with two controls swapped

Same status box clipped at the same word, same two loan types, same 01-Apr-2025
to 31-Aug-2026 window. Include Principal and Include Interest are gone; Report
Type, Group By and Exclude Zero Balance Loans stand in their place.

**So the two Loans reports are one query with a Report Type on it.** Worth
knowing before either is quoted as a separate build, and worth knowing when the
export is finally asked for — one request can cover both.

It is also a second, independent sighting of everything the projection capture
established: the advance-not-loan finding does not rest on one screenshot.

### Month Wise Recovery names the schedule

A month-wise recovery report only exists if recovery runs over months. The
seventeen-month default window said the same thing from the other side; this
says it in a field name.

`Employee Advance` — which is where advances live, and which stayed in hrms when
Loan Management moved out to the separate `lending` app — **carries no
schedule**. It is one document, one amount, claimed and settled. An advance
recovered over months needs the instalment plan and the deduction rows built on
top of it, and that is the whole of the Loans build. It is much smaller than a
lending ledger and it is not nothing.

### Exclude Zero Balance Loans says the closed ones are kept

A register that can *hide* a settled loan is a register that still holds it. So
when the export is asked for, **ask for it with that box unticked** — the
history is what makes an opening balance checkable, and it is the one thing
nobody can reconstruct later.

### Rebuilt here

`app/web/src/sections/loans/LoanRegister.jsx`, with the capture in the LOAN
REGISTER block of `src/data/loans.js`. The form is drawn control for control,
and shares `LOAN_TYPES`, the clipped status list and `monthsBetween` with the
projection page — two reports over one range must not each round a part-month
their own way.

Generate produces the recovery grid **at full size and empty**: a row per month
in the range, a column per ticked loan type, and every cell a dash. Drawn at
size rather than replaced by a sentence, because a report that quietly shrinks
to fit what it can answer hides how much of it is missing.

Two things on the output are real and are labelled as such:

- **The months**, off the date range.
- **The population**, off `Employee` — how many people the status and employee
  filters leave in scope.

Filter By and Group By are meant to section the recovery grid. With no recovery
to section they section the population it would have been recovered *from*,
which is the one thing under the form that is read off the site, and the page
says that is what happened. Exclude Zero Balance Loans is drawn and left
working: it empties the report completely, which is the honest consequence of
every balance being zero.

### Still open

- **What else Report Type offers.** One value, and the list was never opened. If
  there is an outstanding-balance report behind it, that is the export to ask
  for rather than this one.
- **How many advances are running, and what is outstanding.** §26's question,
  unchanged and still the blocker. Neither side of `disbursed − recovered` is
  held here.
- **Over how many months an advance is recovered, and who decides.** The form
  proves it is more than one; nothing says whether it is three or thirty.
- **Whether the clipped fourth status is a fifth status or their spelling of
  one of ours.** Two captures, both clipped at `Tempo`. One click on that box
  settles it.

## 31 · Loans — Loan Projection, 29 Aug 2026

Their **LOAN PROJECTION** criteria panel: six controls down one column, two
checkboxes, three buttons. It shares its first six boxes with the Loan Register
panel — same chrome, as everywhere in this product.

| Control | Value in the capture |
|---|---|
| `Employee Status` | `Active, Inactive, Suspended, Tempo…` — **clipped at the box edge** |
| `Particular Employee` | empty, with their `…` picker beside it |
| `From Date` | `01-Apr-2025` |
| `Till Date` | `31-Aug-2026` |
| `Loan Type` | **`Salary Advance, Tour Advance`**, with a green tick and a red cross |
| `Filter By` | empty |
| ☑ `Include Principal` | **on** |
| ☐ `Include Interest` | **off** |
| buttons | `Generate` · `Reset Fields` · `Close` |

No Schedule Report and no Generate In Background, both of which their attendance
reports carry.

### Two of §26's five open questions now have an answer

- **"Does Manna lend, or only advance?"** The Loan Type box reads *Salary
  Advance, Tour Advance*. **Both are advances** — money paid early and recovered
  out of payroll, not money charged for. And it is better evidence than a
  dropdown would have been: it is what somebody actually selected, not what the
  product offers.
- **"Is there interest?"** It is a checkbox, and it is **unticked**. So interest
  exists over there — the box would not be drawn otherwise — but the projection
  somebody ran did not ask for it.

Together those move the likely shape of this module off the `lending` app —
which on Frappe v15 and later is a third `bench get-app` with an accounting
build behind it — and onto `Employee Advance`, which stayed in hrms. **That is
the whole spread of the Loans estimate**, and it is not yet closed: one
screenshot of their Loan Application would close it.

### "Projection" is their word for a schedule

The window runs **01-Apr-2025 to 31-Aug-2026** on a form captured on 29 August
2026. Seventeen months, and most of them already paid. So this is not a
forecast: it prints every instalment in a window, behind and ahead alike.

That matters for what has to be built. A forward view of the next few months
could be computed on demand; a schedule that reaches back two fiscal years has
to reconcile against what was actually deducted — which means the recovery rows
have to exist and be queryable, not just the plan.

### The status box disagrees with ours again

`Active, Inactive, Suspended` and a fourth value cut off at `Tempo`.
`Employee.status` offers Active, Inactive, Suspended and **Left**, and has
nothing temporary on it. Whether their fourth is a fifth status or their
spelling of one of ours cannot be told from the capture and is not guessed at —
the form draws the three that are legible, offers `Left` because 344 people have
one, and says the fourth was clipped.

### Rebuilt here

`app/web/src/sections/loans/LoanProjection.jsx`, with the capture in `LP_*` and
`PROJ_COLS` in `src/data/loans.js`. The four constants the Register panel shares
with it — the statuses, the truncated fourth, and the two loan types — are
defined once and read by both, because the same box recorded twice in two
spellings is how two forms end up disagreeing about who is in scope.

Generate runs and produces the **shape**: the window unfolded month by month
against the selected loan types, which is the report somebody has to fill. The
months, the rows and the columns are all real arithmetic on the controls —
change a date and the rows change; clear a loan type and half of them go;
untick a checkbox and its column goes. Every **figure** is blank, and blank
rather than zero: a zero here reads as an instalment somebody has already paid.

An empty status box is treated as *no filter*, not as *nobody*, and the control
says so where it happens. Leaving somebody out of a recovery schedule is how a
balance quietly stops being recovered — CLAUDE.md §4.

Their `Close` has nothing to close: theirs is a dialog over a list, and this
page *is* the form. It puts the report away instead and says why. `Reset Fields`
restores the capture by construction — its defaults are read off the same
constants the form is drawn from, so a value corrected in `data/loans.js` cannot
leave the button behind.

### Still open

- **What the clipped status says.** One screenshot of the open box.
- **Whether interest is ever charged.** The box exists; nobody has said Manna
  ticks it. This is the difference between a deduction component and the
  `lending` app.
- **How many loans are running and what is outstanding.** Unchanged from §26:
  none of the nine Factor HR exports carries a loan report, so `disbursed −
  recovered` has neither side. It cannot be derived, only loaded — **ask for the
  loan register as an export.**


---

## 32 · Payroll — Bank Transfer, 29 Aug 2026

Both tabs photographed. It is the first screen of theirs seen here that is not a
form above a report: a **rail of filters down the left** and a **preview panel**
beside it.

| Part | What the capture holds |
|---|---|
| tabs | **`Regular`** · `Release Held Salary` |
| rail | a `Search all filters` box, then three shut groups — **`Payroll Details`** · **`Employee Selection`** · **`Bank Details`** — then `Reset` |
| panel title | `Report Preview` on Regular, **`With Held Salary`** on the second tab |
| panel buttons | `Show Amounts` · `Generate Payment File` · `Hold Salary Register` / **`Release Salary Register`** · **`Preview`** |
| panel body | `No Data Available` — *Apply filters and click Preview to view data* |

**Both captures are of an empty screen and all three groups are shut**, so what
is under them has not been seen. Nine fields are drawn here in their place and
every one of them is ours, said on the page — the same call §20 makes about
Work Pattern, and a safer one here, because what a bank line needs is not a
matter of opinion.

### The second tab is the finding, and it is not a screen

`Release Held Salary`, with a register and a payment file of its own, means
Factor HR **holds somebody's pay as a state on the payroll** and releases it
later. §27's Salary Process capture shows the same thing from the other side:
two separate tiles, **Stop Salary** and **Stop Payment**, which are two
different holds — one stops the slip, the other stops only the money.

Frappe HR ships neither. No flag on `Employee`, none on `Salary Slip`, and no
document that means *this person's money is withheld and will be released*. So
it is a custom field plus a rule inside the run — and possibly a document with
an approval on it, if a hold is ever disputed.

**It is a cutover question before it is a build question.** Anybody held on the
day the group moves is money that has to land somewhere here. Two answers
settle the shape: *is anybody held today*, and *what is a hold for* — a
disciplinary matter, an unreturned asset, a disputed final settlement.

### Why no payment file can be written, in four parts

1. **The amount.** Net pay is a `Salary Slip` figure. No payroll doctype is on
   the proxy's allowlist (`app/serve.js`), and no slip has ever been generated
   on this site. Two independent reasons — fixing either alone changes nothing.
2. **The IFSC.** **There is no such field on ERPNext's `Employee`.** §23 found
   the same hole from the profile side and §27 listed it as one of three
   blockers. It is a custom field, then 160 values only Factor HR holds, then a
   check — a wrong branch code is a payment that bounces a week after everybody
   was told they were paid.
3. **The layout.** A payment file is written in one bank's own format; HDFC,
   ICICI, SBI and Federal differ in column order, header and encoding. **Which
   bank each company pays from is still open** — §27 already asks it.
4. **The debit side.** `Bank Account` is not on this proxy's allowlist, so the
   account the money would leave cannot even be read. It is per company, so
   four companies is four files in the same month.

### Rebuilt here

`app/web/src/sections/payroll/BankTransfer.jsx`, with the capture in `BT_*` in
`src/data/payroll.js` and the rail's own CSS under *the Bank Transfer screen* in
`index.css`.

The panel is empty until `Preview` is pressed, exactly as theirs is — that is
what makes Preview the first thing anybody touches, and a page that listed 160
people on open would be answering a question nobody asked.

What Preview produces is **not a payment file and is never described as one.**
It is the readiness check underneath it: everybody in scope, with salary mode,
bank, account number and IBAN read off `Employee` — one probe, made when the
screen is first opened, on the same terms as Final Settlement's — and IFSC and
Amount drawn **absent rather than empty**, because they are different kinds of
missing and only one of them arrives with payroll.

Four tiles say the useful thing: in scope, **account on file**, paid by bank,
and *lines a bank would take*, which is nought and stays nought.

Three of the four panel buttons refuse, and each refuses **for its own reason**
rather than for the module's — a button that says "payroll is deferred" four
times over teaches nobody which of these four things is the hard one.

If the probe is refused, no count is offered at all and the two bank filters
stop filtering: *nobody has an account number* and *nobody was asked* are
opposite findings, and dropping somebody who is there is the expensive mistake
(CLAUDE.md §4).

### Worth doing before payroll is anywhere near ready

**Count the missing account numbers, then chase them.** It needs no payroll
code, it is weeks of somebody's time in HR, and it is exactly the kind of work
that gets discovered late and then holds a go-live. This screen counts them
today.

### Still open

- **Which bank each company pays from**, and whether the group pays through one
  account or four. Unchanged from §27, and it is now blocking a file rather
  than a question.
- **What is actually under their three filter groups.** One screenshot with them
  open. The nine fields here are ours until then.
- **Is anybody's salary held today, and what for.** Ask HR, not Factor HR.
- **What their `Generate Payment File` actually writes** — one sample file would
  settle the format argument in an afternoon.
