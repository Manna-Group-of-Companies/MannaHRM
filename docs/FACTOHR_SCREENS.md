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
