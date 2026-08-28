# The migration tools

One-off scripts that read the Factor HR exports and build the files ERPNext
imports. Node, no build step.

```bash
cd tools && npm install     # exceljs and jszip
```

Everything reads from `data/factohr/` and writes into `data/out/`, both of which
are gitignored — they hold salary, PAN and bank details for the whole group.

---

## In the order they are run

```bash
node tools/inspect_export.js data/factohr/     # what is in these files at all
node tools/analyse_factohr.js                  # the migration questions, answered
node tools/build_employee_import.js            # 03-employee.xlsx + masters-needed.csv
node tools/build_master_imports.js             # 01-holiday-list, 02-designation
node tools/build_shift_template.js             # 04-shifts-TO-FILL.xlsx, for Manna
node tools/load_letter_types.js                # the .docx letter formats
node tools/backfill_employee_links.js          # after the employee import lands
node tools/infer_shifts.js                     # what the punches say about each shift
```

`build_master_imports` reads `masters-needed.csv`, so `build_employee_import`
has to run first. `backfill_employee_links` runs **after** the employees are on
the site, and in two passes, because `reports_to` needs the manager's record to
exist before anyone can point at it.

## The two that touch the site

`load_letter_types` and `backfill_employee_links` write, and both default to a
dry run. They need the key in the environment:

```bash
# Git Bash
export ERP_KEY=... ERP_SECRET=...
node tools/backfill_employee_links.js           # says what it would do
node tools/backfill_employee_links.js --apply   # does it
```

`infer_shifts` reads the site but never writes.

## What they refuse to do

**No script here guesses.** `build_employee_import` rejects a row whose company
is not in its mapping rather than defaulting one — a guessed company is a person
in the wrong payroll, found at month end. `backfill_employee_links` matches on
name *and* company *and* joining date, and skips anybody matching zero or more
than one row rather than taking the first: a wrong match writes one person's
code onto another and everything downstream inherits it silently.

`inspect_export` masks every sample value it prints. Knowing a file has an
`Aadhaar` column is what tells us how to map it; the numbers are nobody's
business until the load runs.

## A known gap between two of them

`build_employee_import` reads both `1966-12-04 00:00:00` and `04-Dec-1966`;
`backfill_employee_links` reads only the first. Both behaved this way in the
Python these replaced, and it is preserved rather than quietly changed — but if
your export writes dates the second way, backfill will report people as
unmatched who are not. Widen `asDate` in `backfill_employee_links.js` if that
happens, and re-run the dry run before applying.
