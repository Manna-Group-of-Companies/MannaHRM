"""What payroll needs on the site, as values — see manna_hr/payrollsetup.py."""

from manna_hr import payrollsetup as ps


def test_the_three_components_the_salary_sheet_tells_apart_are_the_three_made():
	assert [c["name"] for c in ps.REQUIRED_COMPONENTS] == ["Leave Encashment", "Salary Advance", "Loan EMI"]


def test_encashment_is_an_earning_and_an_advance_and_a_loan_instalment_are_deductions():
	kinds = {c["name"]: c["type"] for c in ps.REQUIRED_COMPONENTS}
	assert kinds == {"Leave Encashment": "Earning", "Salary Advance": "Deduction", "Loan EMI": "Deduction"}


def test_every_abbreviation_is_different_because_hrms_wants_one_each():
	abbrs = [c["abbr"] for c in ps.REQUIRED_COMPONENTS]
	assert all(abbrs) and len(set(abbrs)) == len(abbrs)


def test_a_component_is_posted_with_its_name_type_and_no_dependence_on_payment_days():
	doc = ps.component_doc(ps.REQUIRED_COMPONENTS[1])
	assert doc["doctype"] == "Salary Component"
	assert doc["salary_component"] == "Salary Advance"
	assert doc["type"] == "Deduction"
	# An advance is an agreed amount, not a share of the month.
	assert doc["depends_on_payment_days"] == 0


def test_only_the_components_the_site_lacks_are_missing():
	rows = [{"name": "Loan EMI", "disabled": 0}]
	assert [c["name"] for c in ps.missing_components(rows)] == ["Leave Encashment", "Salary Advance"]
	assert ps.missing_components([{"name": c["name"]} for c in ps.REQUIRED_COMPONENTS]) == []


def test_a_switched_off_component_is_reported_not_remade():
	rows = [{"name": "Loan EMI", "disabled": 1}]
	assert [c["name"] for c in ps.disabled_components(rows)] == ["Loan EMI"]
	assert "Loan EMI" not in [c["name"] for c in ps.missing_components(rows)]


def test_a_company_with_nothing_set_lacks_all_three_payroll_fields():
	assert ps.company_gaps({"name": "X"}) == [
		"Default Payroll Payable Account", "Default Cost Center", "Default Currency"]
	full = {"default_payroll_payable_account": "a", "cost_center": "b", "default_currency": "INR"}
	assert ps.company_gaps(full) == []


def test_a_person_with_no_structure_is_listed_because_hrms_skips_them_without_a_word():
	people = [{"name": "E1"}, {"name": "E2"}]
	assert ps.without_structure(people, [{"employee": "E1"}]) == [{"name": "E2"}]


def test_the_roles_are_stock_and_the_loan_doctypes_are_ours():
	assert ps.PAYROLL_ROLES == ("HR Manager", "HR User")
	assert all(dt.startswith("Employee Loan") for dt in ps.LOAN_DOCTYPES)


def test_payroll_is_based_on_attendance_because_on_leave_an_absent_day_is_paid():
	assert dict(ps.PAYROLL_SETTINGS)["payroll_based_on"] == "Attendance"


def test_a_day_no_attendance_covers_is_paid_because_a_gap_in_our_data_is_not_an_absence():
	assert dict(ps.PAYROLL_SETTINGS)["consider_unmarked_attendance_as"] == "Present"


def test_a_site_left_on_hrms_default_is_reported_with_what_it_has_and_what_it_wants():
	row = {"payroll_based_on": "Leave", "consider_unmarked_attendance_as": "Present"}
	assert ps.settings_gaps(row) == [("payroll_based_on", "Leave", "Attendance")]
	assert ps.settings_gaps(dict(ps.PAYROLL_SETTINGS)) == []
