# MannaHRM — Payroll: master prompt for VS Code (Claude Code / Copilot Chat)

Paste everything below the line into the assistant. Put the reference workbook
`MRPPL Soorya Salary Sep 2026-Payroll designing 1.xlsx` in `docs/reference/` first, so the
assistant can read it.

---

## 0. Your role

You are a senior full-stack engineer on **MannaHRM** (Manna Rubber / Mannarubber, Kerala, India).
Work in small verified steps. Before changing anything, read the files named in section 3. After every
change, run the tests. Never guess a rule that section 4 states — follow it exactly. Where section 5
says "ask", stop and ask me instead of choosing.

## 1. What the payroll must do (the goal)

Everyone's salary is **calculated by hrms (Salary Slips)** and handed to HR as an **Excel sheet**
(the company's Form 25 wages register). HR verifies it and credits employees' bank accounts **outside
the system**. The system does not pay anyone and does not move money.

The Excel must keep the layout and colours of the uploaded MRPPL register, one workbook per company;
only the data changes month to month.

## 2. Hard rules (never break these)

1. **One set of books.** The register shows the real slip figures only. Do **not** build a "For Filing"
   pay, a "Diff to be paid by Cash" column, a Cash sheet, or any split of one person's pay into a
   filed amount and an off-books amount. PF/ESI are computed on the real wage. If a task seems to
   need this, refuse and tell me.
2. **Payroll is calculated by hrms, not by our code.** Our app reads Salary Slips and presents them.
   Do not re-implement salary arithmetic in `client/` except in tests that check hrms's result.
3. ERPNext only stores DocTypes and documents. The payroll *pages* live in the React app (`client/`).
   Do not create a custom ERPNext page or edit stock hrms/erpnext code.
4. Never write a Salary Slip directly. Slips come from a Payroll Entry (submitted by HR in Frappe).
5. Nothing destructive on the live site (mannarubber.m.frappe.cloud): no deletes, no mass edits,
   no changing HR Settings or permissions without asking me. Master data (Salary Component, Salary
   Structure) may be created only after I confirm the exact list.
6. No secrets in code, tests or chat. API keys stay in the environment.

## 3. Repository map (read these first)

Project root `C:\MANNA DEVELOPES\MannaHRM`

- `manna_hr/` — Frappe app (DocTypes, fixtures). `data/schema.js` in the client lists the 26 DocTypes we own.
- `client/` — React + Vite + Tailwind + Vitest dashboard (dev: http://localhost:5300, proxied to the site).
  - `src/routes/registry.jsx`, `src/data/sections.js` (`HIDDEN_PAGES` decides which Payroll tabs show;
    visible: Payroll, Salary Setup, Increments, Advances & Loans, Payslips, Bank Transfer).
  - `src/features/payroll/PayrollRun.jsx` — the guided Payroll page (steps 1–4; step 4 has
    "Download Excel" and "Wages register (Excel)").
  - `src/features/payroll/SalarySetup.jsx` — base-pay upload from Excel → Salary Structure Assignment.
  - `src/lib/register.js` (rows + checks), `src/lib/registerxlsx.js` (workbook from template styles),
    `src/data/registerlayout.js` (generated layout), `src/api/register.js` (reads Attendance/Employee/Holidays),
    `src/lib/basepayimport.js`, `src/lib/basepayfile.js`, `src/lib/payroll.js`, `src/api/payroll.js`.
  - `tests/` — Vitest (~2600 tests, must stay green).
- `docs/PAYROLL_SETUP.md`, `docs/DOCTYPES.md`.

Conventions: keep each file's existing line endings (CRLF vs LF — check before editing); no
localStorage in artifacts; plain-sentence user messages (HR is not technical); one fix per commit.

## 4. The salary rules, taken from the MRPPL sheet (sheet "MRPPL Salary-1")

Let `D` = days in the month, `BE` = monthly pay (base), `LOP` = loss-of-pay days.

**Pay**
- Two kinds of people: **Salary** (fixed monthly `BE`) and **Wages** (daily wage × 26 = `BE`).
  After this point they are treated the same.
- Pay due = `BE − (BE / D) × LOP`. Sundays and holidays are paid.
- OT payable = OT hours × OT rate; OT rate in the sheet = `(BE / D) / 12`. Bata payable = bata days × bata rate (drivers).
- Food allowance is a fixed per-person monthly amount for some people (e.g. 1000).
- Gross (`BP`) = pay due + OT & bata + food allowance.

**Leave and loss of pay (this is the user's rule)**
- Only **Casual Leave** is paid, up to what the person has available that month
  (brought-forward + current month's eligibility; the sheet gives 1 or 2).
- **Every other leave and every absence is loss of pay**, whatever the leave type is called.
- Sheet logic: leave availed = D − worked − Sundays − holidays; eligible days =
  `IF(leave >= available CL, D − leave + available CL, D)`; `LOP = D − eligible days`.

**Deductions**
- **PF** (only EPF members): wages for PF = 50 % of pay due for Wages-type staff;
  employee PF = 12 % of that, with the wage capped at **25,000** (so max 3,000). Rounded **up** to a whole rupee.
- **ESI** (only ESI members): employee ESI = **0.75 % of gross**, rounded **up**.
- **Professional Tax**: half-year wage = `BE × 3`; slab by that figure
  (<17,999 → 320; <29,999 → 450; <44,999 → 600; <99,999 → 750; <124,999 → 1000; else 1250),
  and the monthly deduction = slab ÷ 6.
- **Labour Welfare Fund**: 7.5 for those marked.
- **Salary advance**: the month's advance availed is deducted in the same month.
- **Loan**: the month's instalment is deducted; outstanding/balance carried.
- Other recoveries the sheet has: Mess contribution, Covid-19 advance deduction, Insurance.
- Total deductions = advance + loan + covid + PF + mess + ESI + PT + LWF.
- Payable after deductions = gross − total deductions; then food deduction; **Net payable = that**,
  and **Net after round-up = ROUNDUP(net, 0)**, with a round-off column.

## 5. Gaps and decisions — ask me, do not assume

1. **PF wage ceiling**: the sheet caps at 25,000; the statutory EPF ceiling is 15,000. Which is correct for us?
2. **ESI eligibility**: sheet decides by a Yes/No flag per person with no 21,000 ceiling. Keep the flag only?
3. **Professional Tax**: the sheet uses `slab ÷ 6` monthly. Confirm this is what the accountant wants.
4. **OT rate** `(BE / D) / 12` looks unusual (an 8-hour-day rate would be `/8`). Confirm before encoding.
5. **Rounding**: PF/ESI round up to the rupee; net rounds up. Confirm.
6. Which companies (Manna Rubber Products Pvt Ltd, Soorya Rubbers, Labour supply …) get their own structure?
7. Where PF/ESI membership is stored per employee (the site has no custom field yet; creating custom
   fields returned 403 for the API login — I may need to do it in Frappe myself).

## 6. Facts already checked on the live site

- Leave Types present: Casual Leave (paid), Compensatory Off, Leave Without Pay (LWP), Privilege Leave,
  Sick Leave. **Only Leave Without Pay is flagged loss-of-pay**; Compensatory Off, Privilege and Sick
  Leave are currently paid, which contradicts rule 4 — they must be flagged "Is Leave Without Pay"
  (needs my OK), or the register's leave logic will not match the sheet.
- Salary Components present: Basic, House Rent Allowance, Arrear, Leave Encashment, Income Tax,
  Professional Tax, Provident Fund, Loan EMI, Salary Advance. **Missing for this sheet**: ESI,
  Dearness Allowance, Conveyance, Food Allowance, Overtime, Bata, Labour Welfare Fund, Mess, Covid-19
  Advance, Project Incentive & House Rent.
- 0 Salary Structures, 176 employees without a structure/assignment, no Salary Slips yet.
- HR Settings → "Include holidays in Total no. of Working Days" must be **ticked**, otherwise
  `payment_days / total_working_days` will not equal `(D − LOP) / D`. Read it; do not change it without asking.
- The API login can read most HR doctypes but is forbidden to read DocField and to create Custom Fields.

## 7. Work plan (do in order; stop after each for my review)

**A. Design (no live writes).** Write `docs/SALARY_STRUCTURE.md` mapping every sheet column in section 4
to an hrms Salary Component and formula (`base`, `payment_days`, `total_working_days`, component
abbreviations). Use separate Salary Structures per kind (Salary / Wages × PF yes/no × ESI yes/no) if
PF/ESI membership cannot be a condition. Show the formula for each deduction and an example for one
real row. List open questions from section 5.

**B. Golden tests.** Read the reference workbook with ExcelJS/openpyxl using **cached values**, and
create `tests/payrollgolden.test.js` that re-computes each person's pay due, PF, ESI, PT, net and
round-up from section 4 and asserts they equal the sheet. This proves the rules are understood
correctly. Do not use these functions to pay anyone; they are test oracles only.

**C. Site set-up script** (`manna_hr/setup/payroll_masters.py` or a JSON fixture): create the missing
Salary Components and the Salary Structures from A. Idempotent (re-running changes nothing),
dry-run by default, prints what it would create. Run for real only after I say yes.

**D. Leave policy.** A checked, dry-run-first change that flags non-Casual leave types as LWP, and a
test that proves a Sick/Privilege day lowers `payment_days`.

**E. Base pay and assignments.** Finish the Salary Setup upload: employee code, base pay, kind
(Salary/Wages), PF member, ESI member, advance. Matching by employee code, never by name alone;
duplicates and unknown codes are shown and skipped.

**F. Advances and loans.** Advance → Additional Salary (component "Salary Advance", month's last date);
loan instalment → Loan EMI path; show outstanding balance on the register. Submitted documents only.

**G. Register.** Fill the register's still-empty columns from real data: CL brought-forward / eligible /
balance, OT hours, bata, EPF wages, Covid, Mess, father/mother name. Add the Soorya Rubbers and
Labour supply sheets from the template.

**H. End-to-end check on a copy of September 2026.** Run: structures → assignments → Payroll Entry →
slips → "Wages register (Excel)". Compare every person's net with the sheet; list differences.
The register's checks must flag drafts, slips whose lines do not add up, unmapped deductions, missing
attendance, and zero net.

## 8. Definition of done (for every step)

- `npm test` in `client/` is green; new behaviour has tests, including a failing-case test.
- No file loses its line endings; no unrelated reformatting.
- Pages say what to do in plain sentences ("Choose one company in the top bar"), no jargon or stack traces.
- Nothing is written to the live site without my explicit yes and a dry-run output I have seen.
- A short summary lists: files changed, tests added, anything that needs me to do in Frappe.

## 9. Output format I want from you each time

1. What you read and what you found (3–6 lines).
2. The change, as small diffs.
3. Test result.
4. Questions for me (numbered, only real decisions).
