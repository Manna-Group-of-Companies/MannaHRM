# How Factor HR works, and what it costs us to match

Assembled 22 August 2026 from factoHR's public help documentation and the login
page of the Manna tenant. **The tenant itself was not opened** — it needs a
login, and none was given or asked for. So this is the product's documented
behaviour, not a reading of your configuration. Every number in your actual
policies still has to come from an export or a screen share.

Login page: `app3.factohr.com/HITECH/Welcome`, branded **HI-TECH PRETREADS**.

---

## 1. What the login page tells us you are licensed for

The slider on your own login screen advertises the modules on the tenant:

- Attendance, shift and leave management
- Travel claim and reimbursement
- Performance management
- Acknowledgements and surveys
- Ticketing
- **Selfie-based punch with geo-fencing**
- Chatbot

That sixth one matters more than it looks. **Your mobile punching already takes
a photograph**, and the design in this repository does not. See §4.

---

## 2. The model

factoHR is three layers, and the middle one is where all the behaviour lives.

```
  punches                attendance policy              monthly summary
  (biometric,     ──►    + shift + calendar     ──►     "Submit Attendance"   ──►  payroll
   mobile, web)          decides the day status         frozen, then paid from
```

### Layer 1 — capture

In/Out times from biometric machines, the mobile app, or web login. The same
funnel idea as `Employee Checkin`, so this maps across cleanly.

### Layer 2 — the attendance policy

This is the part that is not a table of times but a rules engine, and it is
where the real work is. A policy carries:

| Rule | What it does |
|---|---|
| Full / half / absent thresholds | By minutes worked against shift duration. *"in an 8 hour shift if an employee works less than 120 minutes it counts as Absent"* |
| Session mode | Pre-break and post-break periods evaluated **separately**, each with its own grace and minimum |
| Late coming | Grace time, rounding, **frequency forgiveness**, and a hard limit |
| Early going | The mirror of late coming |
| Deduction target | Loss of Pay **or** deducted from a paid leave balance |
| Overtime | Working vs non-working days, gross or net, min and max, rounding, approval required |
| Approval workflow | Predefined manager chain, custom multi-level, or auto-approve |

**Frequency forgiveness is the one to notice.** The documented example: *"3
times in a month then no leave deducted but on the 4th time his half day will
be deducted."* That is a stateful, month-scoped, per-employee counter that
changes pay. Nothing in Frappe HR does it.

### Layer 3 — Submit Attendance

An explicit monthly close. HR generates the summary — full days, half days,
week-offs, leaves, holidays, late and early counts, LOP — checks that the
components add to the calendar days, and saves it. Payroll is then run from
that frozen summary, and the record cannot be deleted once salary is processed.

**Frappe HR has no equivalent gate.** Payroll reads `Attendance` directly, live.
That is a real control your HR team currently has and would lose.

> **Read [FACTOHR_SCREENS.md](FACTOHR_SCREENS.md) §21 before costing this.** The
> Submit Attendance List in the live tenant is empty: the gate exists and has
> never been used. "Would lose" may be "has never had".

### Regularization

Employee raises it from ESS with a date, an In or Out time, a reason from a
dropdown, and remarks. It routes through the company's approval process. On
approval the corrected time appears in **separate `AR In` / `AR Out` columns**
beside the original punch, and the day status becomes Full Day.

Note the design: the original punch is never overwritten. Ours writes a new
`Employee Checkin` and cancels the derived `Attendance`, which achieves the same
audit property by a different route — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

### Payroll

Conventional Indian payroll: financial year and months, calendar, salary master
with effective-dated revisions, statutory enrolment (PF, ESIC, EPS, NPS),
monthly inputs (attendance, manual payments and deductions, arrears, loans, tax
declarations), then process, verify against registers, generate bank and JV
files, and release payslips to ESS. Plus loans, final settlement, and ECR/ESIC
upload files.

---

## 3. Parity assessment

What Frappe HR gives free, and what has to be built.

| factoHR | Frappe HR | Verdict |
|---|---|---|
| Punch capture, multi-source | `Employee Checkin` | **Free** |
| Shift patterns, rotation | `Shift Type`, `Shift Assignment` | **Free** |
| Full/half/absent by hours worked | `working_hours_threshold_for_half_day` / `_for_absent` | **Free** |
| Late / early grace flags | `late_entry_grace_period`, `early_exit_grace_period` | **Free**, but flags only — no consequence |
| Holiday calendar per company | `Holiday List` | **Free** |
| Leave types, balances, ledger | `Leave Type`, `Leave Allocation`, `Leave Ledger Entry` | **Free**, and better than most |
| Travel claim, reimbursement | `Travel Request`, `Expense Claim` | **Free** |
| Performance | `Appraisal`, `Appraisal Cycle` | **Free** |
| Loans | `Employee Loan`, `Employee Advance` | **Free** |
| Final settlement | `Full and Final Statement` | **Free** |
| PF / ESI / PT / TDS, payslips | Indian payroll in `hrms` | **Free**, formats need checking |
| Multi-level approvals | Frappe Workflow engine | **Free**, configured not coded |
| Comp-off | `Compensatory Leave Request` | **Free** |
| — | — | — |
| **Late/early frequency forgiveness** | nothing | **Build.** Stateful, monthly, affects pay |
| **Deduct from paid leave instead of LOP** | nothing | **Build.** Pairs with the above |
| **Session-based (pre/post break) evaluation** | nothing | **Build**, if you actually use it |
| **Overtime engine** (min/max, rounding, day type, approval) | little | **Build** |
| **Monthly attendance freeze before payroll** | nothing | **Build.** A control HR would otherwise lose |
| **Selfie on punch** | nothing | **Build.** See §4 |
| Ticketing / helpdesk | separate Frappe Helpdesk app | Decide |
| Surveys, acknowledgements | nothing | Decide |
| Chatbot | nothing | Drop unless somebody uses it |

**The honest summary:** roughly 70% of factoHR is stock Frappe HR. The remaining
30% is concentrated almost entirely in the attendance policy engine — and that
30% is the part that changes what people are paid, which makes it the part that
has to be exactly right.

---

## 4. Selfie punch — the gap we did not know about

Your mobile punching captures a photograph, and the design in this repository
records only coordinates.

This is not a small addition, and it is worth deciding deliberately rather than
copying:

- **It changes what the punch proves.** A coordinate says a phone was near the
  gate. A photograph says a person was. Where phones get handed to a colleague,
  that difference is the entire control.
- **It is personal data at scale.** A selfie per person per punch is roughly
  500 photographs a day for 250 people, held indefinitely unless somebody sets a
  retention period. That needs a stated policy — how long, who can look, and
  what happens to them at the end.
- **Frappe stores it as a private `File` against the checkin**, which works, but
  the storage and backup size of the site changes character. Worth pricing
  before committing.

**Decision needed** — see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): keep selfie
punch, drop it in favour of geofence alone, or keep it only for the people who
punch away from a gate.

---

## 5. What still cannot be known without access

The documentation describes what the product *can* do. None of it says what
**your** tenant is configured to do, and the configuration is the thing we have
to reproduce. Specifically:

- Your actual attendance policies, per company — the real thresholds, grace
  periods, and forgiveness counts.
- Your shift definitions, and which cross midnight.
- Your leave types and their rules.
- Your salary components and formulae.
- Which of the licensed modules anybody actually uses. Paying for a chatbot is
  not the same as using one.

The fastest way to get these is a screen share through Setup → Manage
Attendance Policy, Manage Shift, and the leave and salary masters — or an
export, if factoHR will give one. Screenshots of those screens would be enough
to start.

---

## Sources

- [factoHR Help — Attendance](https://help.factohr.com/knowledgebase/attendance/)
- [factoHR Help — Manage Attendance Policy](https://help.factohr.com/knowledgebase/manageattendancepolicies/)
- [factoHR Help — Attendance Regularization](https://help.factohr.com/knowledgebase/attendanceregularization/)
- [factoHR Help — Submit Attendance](https://help.factohr.com/knowledgebase/submitattendance/)
- [factoHR Help — Payroll](https://help.factohr.com/knowledgebase/payroll/)
- [factoHR — Attendance Management System](https://factohr.com/attendance-management-system/)
