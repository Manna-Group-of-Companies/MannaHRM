# What we need from Manna

Everything still outstanding, in the order it unblocks work. As of 22 August
2026.

Each item says **what**, **what shape it should arrive in**, **who is likely to
have it**, and **why it matters** — because several of these look like
paperwork and are not.

Drop files into `data/factohr/` or `data/out/`. Screenshots are fine wherever
an export is awkward.

---

# A. Blocking everything

Nothing downstream works until these two land.

## A1 · The 23 shift definitions

**File:** `data/out/04-shifts-TO-FILL.xlsx`, filled in and returned.
**Who:** plant managers, one per company.

Two rows are pre-filled from your attendance reports; 21 are blank because the
timings appear in no export you have sent.

Per shift we need:

| Column | Why |
|---|---|
| Start / End | Decides which punches belong to this shift at all. Without it, no punch can be attributed. |
| Crosses midnight? | Decides which **day** the hours land on. Get it wrong and a night worker reads as absent two days running — no punch-out on the first, no punch-in on the second. |
| Break start / end | Comes off worked hours, and worked hours decide half-day and absent. Factor HR tracks two kinds separately (`Break Duration` and `Personal Break Duration`), so say if both apply. |
| Rotating? | The real question behind `Production24hr shift` (7 people) and `Production22hr shift` (5). A 24-hour shift is not somebody working 24 hours. It is either a rota or a window inside which any 8 count — and those configure completely differently. |
| Half day below / Absent below | Hours worked under these thresholds change the day's status, and therefore pay. If they are the same everywhere, fill row 1 and say so. |

**Why it blocks:** Frappe HR generates `Attendance` from punches **through the
shift**. No shift, no attendance, no matter how many punches arrive.

## A2 · The attendance policy, as configured

**Shape:** screenshots are fine — all steps of the wizard, per company.
**Where:** Factor HR → **Setup → Manage Attendance Policy**, and **Manage
Shift**.
**Who:** whoever administers Factor HR.

This is the single highest-value thing on the list. Factor HR's policy engine
supports things Frappe HR has no equivalent for, and **we do not know which of
them you use**:

- **Late/early frequency forgiveness** — the documented example is *"3 times in
  a month no leave deducted, but on the 4th his half day will be deducted."*
  That is a stateful monthly counter that changes pay. Nothing in Frappe HR does
  it.
- **Deduction target** — Loss of Pay, or taken from a paid leave balance.
- **Overtime rules** — minimum, maximum, rounding, working vs non-working day,
  whether approval is required.
- **Session mode** — whether pre-break and post-break periods are evaluated
  separately, each with its own grace.
- **Grace periods** and the exact half-day / absent thresholds.

**Why it matters more than it looks:** this decides whether the custom build is
a week or two months. If you do not actually use frequency forgiveness, a large
piece of work disappears. We cannot tell from the outside, and guessing wrong in
either direction is expensive.

---

# B. Blocking the fingerprint machines

## B1 · Device inventory

**Shape:** a simple table, one row per machine.
**Who:** IT / maintenance.

| Column | Note |
|---|---|
| Location | Which gate, which company |
| Make and model | It must speak the **ZK protocol** — ZKTeco, eSSL, Realtime and most Indian clones do. A cloud-only or proprietary-SDK device needs a different reader entirely. |
| IP address and port | Port is usually 4370 |
| Comm key / password | Usually 0 if never set |
| Sends IN/OUT direction? | Many are configured not to. If not, the shift has to alternate punches — and one extra punch (somebody stepping out for tea) silently reverses the pairing for the rest of that day. |

## B2 · A machine to run the bridge on

**What:** one always-on PC or Raspberry Pi **per site**, or VPN details if one
box can reach every site.

**Why:** `mannarubber.m.frappe.cloud` cannot reach a factory LAN. The bridge has
to sit inside your network. It must survive reboots and run whether or not
anybody is logged in — a bridge that only runs while somebody is logged in gets
found switched off in March, with a month of attendance behind it.

## B3 · The 21 people with no machine code

**Confirmed 22 Aug: these are the mobile punchers.** Nothing needed unless that
turns out to be wrong for some of them — in which case those people's punches
have nowhere to land and they will look absent every day.

---

# C. Blocking the geofence

## C1 · Coordinates per gate

**Shape:** latitude and longitude to 6 decimal places, one row per punching
point, with a name and which company it belongs to.

**How:** stand at the gate, open Google Maps on a phone, long-press your own
position, copy the coordinates. **Not from a map pin** — a pin lands on the roof
of the building and people punch at the door.

**Also tell us:** how far from each gate a punch should still be accepted. The
default is 300 m, which is generous on purpose — a phone against a metal shed
reads badly, and refusing somebody who did turn up is the expensive mistake. A
large yard may need more.

---

# D. Blocking leave

## D1 · Which leave types are actually used

Frappe HR installed five: **Casual Leave**, **Sick Leave**, **Privilege Leave**,
**Leave Without Pay**, **Compensatory Off**. Your Factor HR reports show Casual
Leave and Leave Without Pay in use. Tell us which of the others are real, and
whether any are missing.

## D2 · Entitlement per type

Annual days, whether it carries forward, whether it can go negative, whether it
is paid. **Nothing has an entitlement set today, so nobody has any balance.**

## D3 · Opening balances

**Shape:** per person, per leave type, **as at a stated date**.
**Where:** Factor HR leave balance report.

The date matters more than the number — a balance with no date cannot be
reconciled against anything.

---

# E. Blocking payroll — only if payroll moves

Nothing has been started here. If payroll stays in Factor HR for now, skip this
section entirely and say so.

## E1 · Salary structure and components

Every earning and deduction, with its formula or fixed amount, and which
employees each applies to.

## E2 · Statutory setup

PF, ESI, Professional Tax and TDS settings, per company. Which employees are
enrolled in each. India Compliance is already installed on the site.

## E3 · Three months of payslips

**Not to import — to test against.** If we cannot reproduce last month's payslip
to the rupee before cutover, payroll is not ready to move. This is the only
honest way to know.

---

# F. Decisions, not data

These need an answer rather than a file. Each changes what gets built.

## F1 · The private bench

Still open. It costs nothing extra — Frappe Cloud bills per site, and the $25
you already pay is the requirement. It turns on Server Scripts and allows the
custom rules app.

**It was free of risk when Frappe HR was empty. It is not any more** — there are
161 employees on the site now. Still worth doing before punches start arriving
daily.

## F2 · Selfie on punch — keep, drop, or narrow?

Factor HR photographs every mobile punch. The design here records coordinates
only.

A coordinate proves a phone was near the gate; a photograph proves a **person**
was — which matters exactly where phones get handed to a colleague. It is also
roughly 5 MB a day at your headcount, held forever unless somebody sets a
retention period, and that needs a stated policy: how long, who may look, what
happens at the end.

## F3 · The five optional holidays — closed, or chosen?

Currently all nine are in one Holiday List, meaning the factory closes on each.

If instead an employee **chooses** which optional days to take, that is a
different structure: a second Holiday List named on
`Leave Period.optional_holiday_list`, plus a Leave Type with `is_optional_leave`
ticked. Say which and it can be rebuilt in minutes.

## F4 · Manna Tyre UAE

The site runs on `Asia/Kolkata`, and Frappe has one timezone per site. Measured
on your live data: all three UAE reps' punches are out by exactly 90 minutes,
every Indian rep is out by zero.

Three options:

1. **A separate site for the UAE.** Correct on every count — timezone, weekend,
   payroll, holidays. Costs a second site for what looks like six people.
2. **Fix the app to always send site time, and treat UAE as display-only.**
   Cheapest. Records become correct and consistent, but their shift windows and
   day boundary still run on Indian time.
3. **UAE stays on Factor HR.** Defer it.

The app bug should be fixed either way — it is wrong today regardless.

## F5 · How much attendance history to carry

Our recommendation: **carry the last complete financial year as read-only
history, and start live recording at go-live.** Importing years of daily
attendance produces a large table nobody queries and a reconciliation nobody
finishes. But it is your call, and gratuity calculations may argue otherwise.

## F6 · Which Factor HR modules are actually used

Your login page advertises ticketing, surveys, performance management and a
chatbot. Paying for them is not the same as using them, and building
replacements for unused modules is the easiest way to double this project's
scope for nothing.

---

# Suggested order

If you want to unblock the most work with the least effort, in this order:

1. **A1** — the shift sheet. One spreadsheet, and it unblocks all of attendance.
2. **A2** — attendance policy screenshots. Decides the size of the custom build.
3. **B1** — the device list. Unblocks the bridge.
4. **F1–F4** — the four decisions. No data gathering, just answers.
5. **C1** — gate coordinates. A walk round the sites with a phone.
6. **D1–D3** — leave.
7. **E** — payroll, if it is moving.
