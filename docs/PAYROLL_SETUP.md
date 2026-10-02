# Payroll setup — what the site needs before the first run

Payroll adds no doctype of ours (DOCTYPES.md §7): a run is Frappe HR's own
Payroll Entry, Salary Slip and Additional Salary. What the site needs before a
run is a short list of *records*, and one script puts the ones that can be put
there by a tool.

## Run it

```bash
export ERP_URL=https://mannarubber.m.frappe.cloud
export ERP_KEY=...  ERP_SECRET=...      # an HR Manager's API key
python tools/setup_payroll.py           # report only — writes nothing
python tools/setup_payroll.py --apply   # makes the missing Salary Components
```

Safe to run twice: a component that exists is left exactly as it is.

## What it makes

Three Salary Components, because they are the three the Salary Sheet tells apart
(`client/src/lib/salarysheet.js`):

| Component | Type | Used for |
|---|---|---|
| Leave Encashment | Earning | Leave encashment, paid through an Additional Salary |
| Salary Advance | Deduction | An advance, recovered from pay |
| Loan EMI | Deduction | A loan instalment, recovered from pay |

The values are in `manna_hr/payrollsetup.py`. `client/tests/payrollhome.test.js`
reads that file and fails if the dashboard's copy of them drifts.

## What it only checks — and what to do about each

| It reports | Who fixes it | Where |
|---|---|---|
| A stock payroll doctype missing | Frappe HR is not installed properly | Frappe Cloud → Apps |
| `HR Manager` / `HR User` missing | Same | Frappe Cloud → Apps |
| A Company with no Default Payroll Payable Account, Cost Center or Currency | The accountant | Company → Accounts and HR defaults |
| Active people with no Salary Structure Assignment | HR | Salary Structure Assignment — hrms skips them without a word, so they are simply not paid |
| Loan doctypes "not on the site" | Whoever installs the app | CLAUDE.md §7 — never make them by hand as custom doctypes |

None of those is made by the tool on purpose: the payable account is a finance
decision and a salary structure is somebody's wages.

## After it has run

Open **Payroll → Payroll**. The first step, *Check the set-up*, goes green when
the three components exist and everybody has a structure.

## Running a month — on the website

Payroll is run on the HRMS website, on **Payroll → Payroll**, and nowhere else.
ERPNext only holds the documents: Salary Component, Salary Structure Assignment,
Additional Salary, Payroll Entry and Salary Slip. The page is one guided screen —
pick the month, then go down four steps:

1. **Check the set-up.** Makes the three Salary Components above if they are
   missing, and names the people who have no salary structure (they are not paid
   until they have one — *Assign salary structures* opens ERPNext's bulk form).
2. **Advances, loans and bonuses.** Choose the person, what it is (advance, loan
   instalment, leave encashment, or a bonus/other component) and the amount. It
   makes an Additional Salary dated the month's last day and submits it, which is
   what a salary slip reads. Where the site has loans, the instalments falling
   due are added the same way.
3. **Run the salary.** *Start the salary run* makes the month's Payroll Entry and
   hrms picks the people; *Create salary slips* submits it and hrms makes a draft
   slip each. Submitting the slips — the step that books the pay — is done in
   ERPNext, one button, because that is where HR signs off.
4. **Check it and pay.** Every earning and deduction in one table, leave
   encashment, advance and loan instalment each in a column of their own, with
   *Download Excel* putting it under the company's heading.

Nothing on the page works out a salary: every figure is hrms's, off the Salary Slip.

### The four pages beside it

| Tab | What it is for |
|---|---|
| **Salary Setup** | Make a salary structure (HR types each rate — none is chosen for you), then tick people, type their base pay and give it to them. hrms leaves anybody without one off the run, so this comes first on a new site. |
| **Advances & Loans** | "₹24,000 to Anand, twelve months from October" makes the twelve monthly deductions and submits them. Reads back what each person has taken, what has fallen due and what is still to come. |
| **Payslips** | The month's slips; open one to read it, print it, or print them all, one to a page. A draft prints marked DRAFT. |
| **Bank Transfer** | Each person's whole net pay with their bank details, flagged where the bank details are missing, and an Excel file for the bank. It splits nothing. |

Salary Structure and Salary Structure Assignment are made *and submitted* from the
website (api/client.js `SUBMITTED_FROM_HERE`); hrms checks both on the site.

### The ERPNext workspace (optional, a backup)

Before payroll moved to the website a workspace **Payroll Home** was also put on
the ERPNext site (`erpnext/payroll_home/`, `tools/deploy_payroll_home.py`). The
website page does not need it. To remove it, delete the Workspace and the Custom
HTML Block, both named *Payroll Home*, in the desk.
