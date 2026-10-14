# The practice site

A pretend ERPNext that runs only on this computer, with made-up people and
salaries, so the dashboard can be tried — the payroll Excel files especially —
without touching the real site.

**It is never the real site.** It makes no request to `mannarubber.m.frappe.cloud`
or anywhere else, and `npm run demo` refuses to start if the dashboard would
have been pointed anywhere but here.

## Start it

```bash
cd client
npm run demo
```

Open **http://127.0.0.1:5310** and sign in with any name and any password.
Ctrl+C stops it. Restarting it puts the dummy data back as it was — anything
added while practising is forgotten.

It runs beside the normal dev server (`npm run dev`, localhost:5300) without
either one signing the other out.

## What is in it

Last month (by this computer's clock) and the month before, for 14 made-up
people with codes `DEMO-001` onwards:

| Company | Last month | Try |
|---|---|---|
| Manna Rubber Products Pvt Ltd (Demo) | payroll run, slips submitted | Download Excel, Wages register (from the slips), Bank Transfer |
| Soorya Rubbers (Demo) | pay set, no slips | Wages register — the preview, with the sheet's formulas |

Monthly-salary and daily-wage people; 12-hour Day/Night and 9-hour General
shifts; PF and ESI members and not; a PF wage over the 25,000 cap; a manager in
the top Professional Tax slab; food allowance, bata, overtime, two advances
(one still a draft), two staff loans; Casual Leave carried in, earned and
taken, including leave past what was available; a joiner and a leaver.

The demo slips stand in for hrms: they follow the MRPPL Salary-1 sheet's
formulas (`practiceSlip` in `data.mjs`), the same ones the preview writes into
its cells.

## What does not work here

- **Running payroll.** Making salary slips is hrms's work on the real site; the
  practice site says so rather than pretending.
- **Files.** Uploads are refused.

## Options

| Variable | What it does |
|---|---|
| `DEMO_MONTH=2026-09` | builds the data for that month instead of last month |
| `DEMO_SLIPS=off` | no payroll run anywhere — every company's register is the preview |
| `DEMO_PORT`, `DEMO_SITE_PORT` | the dashboard's port (5310) and the pretend site's (5301) |
