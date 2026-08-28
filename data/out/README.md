# Import files

**01, 02 and 03 are done.** What remains is `04`, which is a fill-in sheet
rather than an import file.

Generated 22 August 2026. Regenerate any time with:

```bash
node tools/build_master_imports.js      # 02  (01 is already on the site)
node tools/build_employee_import.js     # 03
```

Each file depends on the ones above it. Importing out of order fails a row at a
time, which is a slow way to find out.

In ERPNext: **Data Import → New → pick the doctype → Import Type "Insert new
records" → upload the file → Start Import.**

---

## 01 — Holiday List — **already done, nothing to import**

`Manna Holidays 2026-27` exists on the site with **61 entries**: 52 Sundays and
the 9 named holidays, covering 1 Apr 2026 – 31 Mar 2027. It is set as
`default_holiday_list` on all five Indian companies. Manna Tyre UAE is
deliberately left without one — its holidays are not Kerala's.

The xlsx has been **deleted rather than fixed**, because a file that must not be
imported does not belong in a folder called "import these".

| Date | Day | Holiday | |
|---|---|---|---|
| 2026-04-03 | Fri | Good Friday | optional |
| 2026-04-15 | Wed | Vishu | optional |
| 2026-05-01 | Fri | May Day | statutory |
| 2026-08-15 | Sat | Independence Day | statutory |
| 2026-08-25 | Tue | Onam — Uthradam | optional |
| 2026-08-26 | Wed | Onam — Thiruvonam | optional |
| 2026-10-02 | Fri | Gandhi Jayanti | statutory |
| 2026-12-25 | Fri | Christmas | optional |
| 2027-01-26 | Tue | Republic Day | statutory |

It holds all nine as ordinary holidays — the factory closes on each. If
"optional" instead means an employee *chooses* which of the five to take, that
is a different structure: a second Holiday List named on
`Leave Period.optional_holiday_list`, plus a Leave Type with `is_optional_leave`
ticked. Say so and it can be restructured.

### Why it was not imported, and the rule for next time

Two attempts failed on the child table, and both were the file's fault:

1. Repeating `ID` on continuation rows made the importer read each as a new
   Holiday List with no From Date.
2. Guessing the child column header as `Holidays (Holiday Date)` matched no
   field.

**For any doctype with a child table, do not hand-build the header row.** Open
**Data Import → New**, pick the doctype, tick the child fields, and use
**Download Template** — ERPNext then states its own column names and the file
round-trips by definition. Guessing them is what produced both errors above.

Flat doctypes — Designation, Employee — have no child table and no such problem.

## 02 — `02-designation.xlsx` → **Designation** — done, 64 on the site

34 rows, straight from Factor HR's capitals with a tidy-up applied.

> **Read this one before importing.** These become permanent labels on people's
> records. Several came through awkwardly and are easier to fix in the
> spreadsheet than in ERPNext afterwards:
>
> `ASST.MANAGER-ACCOUNTS` · `ASST.MACHINE Operator` ·
> `Manager-international Sales&mktg` · `Quality/production Supervisor` ·
> `Vice President-operations` · `Head, Maintenance` · `LAB Assistant` ·
> `Stack Developer`
>
> That last one is probably meant to be *Full Stack Developer*.

Edit both columns together — `ID` and `Designation` must match, and `ID` is what
the employee file links to. If you change a name here, change it in
`03-employee.xlsx` too.

One row, `Accountant`, already exists on the site. Re-importing it is harmless.

---

## 03 — `03-employee.xlsx` → **Employee** — done, 161 on the site

**160 active employees.** Nothing was rejected; every row mapped cleanly.

| Company | People |
|---|---|
| Manna Rubber Products Private Limited | 76 |
| Manna Treads | 45 |
| Manna Tyre Retreads | 20 |
| Hi-Tech Rubber Industries | 18 |
| Manna Group Headquarters | 1 |

Leavers are excluded. `node tools/build_employee_import.js --include-left`
adds all 344 as `Status: Left`, if you want the history for gratuity.

**21 of the 160 have no biometric machine code.** They import fine, but until
that field is filled those people have no way for a fingerprint punch to reach
them — they will simply look absent every day. The blanks are in the
`Attendance Device ID` column.

### The second pass, done 22 Aug 2026

The `Factor HR ID` column matched no field on import, so those codes never
landed. They were backfilled afterwards into **`employee_number`** — the
standard field for an employer's own code, already indexed and already on the
form, which beats inventing a custom field for the same fact.

Matching was on **name + company + joining date together**, and any employee
matching zero or several source rows was reported and skipped rather than
resolved by picking the first. 160 of 161 matched; the one that did not is
Test Rep, which never came from Factor HR.

`reports_to` was then set from `employee_number`, since Factor HR expresses it
as a code (`HPT-072 - AJITH S`).

| | |
|---|---|
| employee_number set | 160 |
| reports_to set | 154 |
| duplicate codes | 0 |
| no manager named | 6 — the head of each company, correctly |

Reproduce or re-check with `node tools/backfill_employee_links.js`
(dry run; add `--apply` to write).

---

## 04 — `04-shifts-TO-FILL.xlsx` — **not an import; fill it in and send it back**

The 23 shifts your 160 active staff are on, with live headcounts. Two rows are
pre-filled in green, recovered from the attendance reports where Factor HR
appends the window to the shift name. The other 21 exist nowhere in any export.

Every column is something auto-attendance cannot work without:

- **Start / End** — which punches belong to this shift at all.
- **Crosses midnight** — which *day* the hours land on. Wrong, and a night
  worker reads as absent two days running: no punch-out on the first, no
  punch-in on the second.
- **Break** — comes off worked hours, and worked hours decide half-day and
  absent. Factor HR tracks two kinds separately.
- **Rotating** — the real question behind `Production24hr shift` and
  `Production22hr shift`. A 24-hour shift is not somebody working 24 hours; it
  is either a rota or a window inside which any 8 count, and those configure
  completely differently.

If the half-day and absent thresholds are the same across every shift, fill the
first row and say so.

Regenerate with `node tools/build_shift_template.js`.

---

## Still blocked, and on what

| | Waiting on |
|---|---|
| **Shift Type** | `04-shifts-TO-FILL.xlsx` coming back |
| **`default_shift` per employee** | the shifts existing first |
| **Leave Allocation** | balances from Factor HR, as at a stated date. No leave type has an annual entitlement yet, so nobody has a balance |
| **Work Location** | GPS coordinates per gate, captured standing at the gate rather than from a map pin |
| **The bridge** | make, model and IP of each fingerprint machine |
