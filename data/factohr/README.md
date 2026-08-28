# Drop Factor HR exports here

Save the files into this folder and say so in chat — "the employee master is in
`data/factohr/`" is enough. I read them from disk; nothing needs uploading.

Windows path:

```
C:\Users\eldho\StudioProjects\MannaHRM\data\factohr\
```

**This folder's contents are gitignored** and must stay that way. These exports
carry salary, PAN, Aadhaar, bank accounts and dates of birth for the whole
group. Nothing in here goes to GitHub, and nothing in here should be pasted
into a chat message — dropping the file on disk is both easier and safer.

---

## Format

`.xlsx` or `.csv`, either is fine. Two things matter more than the format:

- **Not PDF.** A payslip PDF is a picture of the answer; the numbers that
  produced it are what we need.
- **One header row, at the top.** Factor HR reports often carry a title, a logo
  row and a date range above the real headers. That is fine — I will find the
  header row — but if the export offers a "raw data" or "detail" option, take
  it over the formatted one.

Merged cells and multi-row headers are workable but slow. Prefer the plainest
export the report offers.

---

## What to pull, in priority order

### 1. Employee master — start here

Everything else keys off it. One row per person, **every company, including
people who have left**.

The single most important column: **the biometric / device user id**. Factor HR
must hold it, because its own attendance runs on it. Without it the fingerprint
machine knows user `104`, ERPNext knows `HR-EMP-00042`, and nothing joins them.

Full column list in [../../docs/MIGRATION.md](../../docs/MIGRATION.md) §1.

### 2. Attendance policy and shift configuration

If these can only be screenshots rather than exports, screenshots are fine —
**Setup → Manage Attendance Policy** and **Setup → Manage Shift**, per company.
This is where nearly all of the custom build effort lives, so it is worth
getting complete.

### 3. Leave

- Leave types with their rules — entitlement, carry-forward, paid or unpaid.
- Balance per person per type, **as at a stated date**. The date matters more
  than the number.
- Leave taken this year, per person, so the balance can be checked rather than
  trusted.

### 4. Attendance history

A month or two of the **Daily Detail Attendance Report** is enough to start —
it shows the columns Factor HR actually produces and lets us reproduce a day
before reproducing a year.

How much history to carry across is a decision, not a technical question. See
[../../docs/MIGRATION.md](../../docs/MIGRATION.md) §3.

### 5. Payroll, only if payroll is moving

Salary structures and components, and the last three months of payslips per
person. The payslips are not imported — they are the **test data**. If last
month's payslip cannot be reproduced to the rupee, payroll is not ready to move.

---

## Naming

Anything readable works. If you want a convention:

```
employee-master-2026-08.xlsx
attendance-detail-MT-2026-07.xlsx
leave-balance-2026-08-22.xlsx
salary-components-2026-08.xlsx
```

Company abbreviation in the name helps when the same report comes four times,
once per company.

---

## Checking a file landed correctly

```bash
node tools/inspect_export.js data/factohr/
```

Prints each file's sheets, header row, column names and row count, with sample
values masked. It reads structure, not content — safe to run and paste the
output of. Use it if you want to confirm an export has the columns before
sending it on.
