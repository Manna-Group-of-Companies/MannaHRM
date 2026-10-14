"""What payroll needs on the site before the first run — the rules, as values.

`tools/setup_payroll.py` carries these to the live site, because the app is not
installed there and `install.py` does not run (CLAUDE.md §7). Pure on purpose,
like `leavepolicy.py`: what is missing can be argued about without a site.

The dashboard keeps a copy for its Payroll page (`client/src/lib/payrollsetup.js`),
and `client/tests/payrollsetup.test.js` reads this file and fails if the two
drift.

## What is made, and what is only checked

**Made:** Payroll Settings' `payroll_based_on`, and three Salary Components — Leave Encashment, Salary Advance and Loan EMI.
They are the three the Salary Sheet has to tell apart: encashment reaches a slip
as an earning, an advance and a loan instalment leave it as deductions.

**Only checked, never made:** the stock hrms doctypes, the two HR roles, each
Company's payroll accounts, and who has a salary structure. A Company's payable
account is the accountant's, and a salary structure is somebody's wages — a
tool that invented either would be the one that put a wrong number on a payslip.
"""

#: Payroll Settings fields and the value each must hold.
#:
#: **`payroll_based_on` is what makes an absence cost a day's pay.** hrms's
#: default is `Leave`, which pays every day except those under a Leave Without
#: Pay application and reads Attendance not at all — so an Absent day is paid.
#: `Attendance` takes Absent days off the slip as `absent_days` and LWP days as
#: `leave_without_pay`. HR's rule (3 October 2026, `absencerule.py`) is that the
#: month's first absence is Casual Leave and the second is a salary deduction;
#: the second half of that is this one value. Found set to `Leave` on 6 October
#: 2026, before any slip had been made, and changed with HR's word that day.
#:
#: `consider_unmarked_attendance_as` stays `Present`: a day nobody's Attendance
#: covers is a gap in our data, not a person absent, and cutting pay for it would
#: round the wrong way (CLAUDE.md §4).
PAYROLL_SETTINGS = (
	("payroll_based_on", "Attendance"),
	("consider_unmarked_attendance_as", "Present"),
)


def settings_gaps(row):
	"""`(field, has, wants)` for each PAYROLL_SETTINGS value `row` — the
	site's Payroll Settings as a dict — holds differently."""
	return [(f, row.get(f), want) for f, want in PAYROLL_SETTINGS if row.get(f) != want]


#: Stock hrms doctypes a payroll run touches. A site without one has no
#: Payroll module, and no tool here can fix that.
PAYROLL_DOCTYPES = (
	"Salary Component",
	"Salary Structure",
	"Salary Structure Assignment",
	"Payroll Entry",
	"Salary Slip",
	"Additional Salary",
)

#: Stock roles. Checked, never created — a role made by hand is one more that
#: nobody remembers granting.
PAYROLL_ROLES = ("HR Manager", "HR User")

#: The Company fields a Payroll Entry cannot be made without
#: (`client/src/lib/payroll.js` `payrollEntryDoc`): field → what it is called.
COMPANY_FIELDS = (
	("default_payroll_payable_account", "Default Payroll Payable Account"),
	("cost_center", "Default Cost Center"),
	("default_currency", "Default Currency"),
)

#: Our loan doctypes. Not on the site until the app is installed (CLAUDE.md §7),
#: so the tool says so and does nothing about it — they must never be made by
#: hand as custom doctypes.
LOAN_DOCTYPES = (
	"Employee Loan Type",
	"Employee Loan Application",
	"Employee Loan Repayment",
)

#: Salary Components to make. `abbr` is given because hrms requires one and the
#: site's own guess from the name can collide.
REQUIRED_COMPONENTS = (
	{
		"name": "Leave Encashment",
		"abbr": "LENC",
		"type": "Earning",
		"is_tax_applicable": 1,
		"description": "Leave encashment, paid through an Additional Salary.",
	},
	{
		"name": "Salary Advance",
		"abbr": "SADV",
		"type": "Deduction",
		"is_tax_applicable": 0,
		"description": "An advance taken, recovered from pay.",
	},
	{
		"name": "Loan EMI",
		"abbr": "LEMI",
		"type": "Deduction",
		"is_tax_applicable": 0,
		"description": "A loan instalment, recovered from pay.",
	},
)


def component_doc(spec):
	"""The Salary Component to POST for one of REQUIRED_COMPONENTS.

	`depends_on_payment_days` is off: these are amounts agreed, not a share of a
	month, so a person on part-month pay does not repay part of an advance."""
	return {
		"doctype": "Salary Component",
		"salary_component": spec["name"],
		"salary_component_abbr": spec["abbr"],
		"type": spec["type"],
		"is_tax_applicable": spec["is_tax_applicable"],
		"depends_on_payment_days": 0,
		"description": spec["description"],
	}


def missing_components(rows):
	"""Which REQUIRED_COMPONENTS are not among `rows`, the site's Salary
	Components (each a dict with `name` and `disabled`). A disabled one counts as
	missing for the Salary Sheet but is reported by `disabled_components`, not
	re-made — enabling it is HR's call."""
	have = {r["name"] for r in rows}
	return [c for c in REQUIRED_COMPONENTS if c["name"] not in have]


def disabled_components(rows):
	"""REQUIRED_COMPONENTS that exist and are switched off."""
	off = {r["name"] for r in rows if int(r.get("disabled") or 0)}
	return [c for c in REQUIRED_COMPONENTS if c["name"] in off]


def company_gaps(company):
	"""The names of the payroll fields `company` (a dict) has empty."""
	return [label for field, label in COMPANY_FIELDS if not company.get(field)]


def without_structure(employees, assignments):
	"""Employees (dicts with `name`) who have no Salary Structure Assignment
	among `assignments` (dicts with `employee`). hrms skips them without a word,
	so a person with none is simply not paid."""
	have = {a["employee"] for a in assignments}
	return [e for e in employees if e["name"] not in have]
