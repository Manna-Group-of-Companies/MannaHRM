"""Who sees whose corrections.

Pure, so the rule can be argued about without a site — which matters more here
than anywhere else in this app, because a permission rule that is only checked
by trying it is a permission rule nobody checks until somebody sees something
they should not have.

**`test_a_reader_this_module_cannot_place_sees_nothing` is the one to keep.**
Frappe reads an empty condition string as "no restriction", so the difference
between "this person sees nobody" and "this person sees everybody" is one falsy
check in `sql_condition`. That is the whole bug class this file exists for.
"""

from manna_hr.permissions import (
	UNRESTRICTED,
	sql_condition,
	visible_employees,
)

BOSS = "HR-EMP-00001"
CLERK = "HR-EMP-00002"
FITTER = "HR-EMP-00003"


# ------------------------------------------------------------- who sees what ---


def test_an_hr_manager_sees_the_whole_group():
	assert visible_employees(["HR Manager"], BOSS, []) is UNRESTRICTED


def test_a_system_manager_sees_the_whole_group():
	# Somebody who cannot read a doctype cannot support it.
	assert visible_employees(["System Manager"], "", []) is UNRESTRICTED


def test_an_hr_user_is_left_to_the_company_permission_rather_than_narrowed_twice():
	# `HR User` is scoped by a User Permission on Company, which Frappe applies
	# itself. A second rule here would be a second place to look when somebody
	# cannot see a row.
	assert visible_employees(["HR User"], CLERK, []) is UNRESTRICTED


def test_an_approver_sees_the_people_who_report_to_them():
	assert visible_employees(
		["Manna Attendance Approver", "Employee"], BOSS, [CLERK, FITTER]
	) == (BOSS, CLERK, FITTER)


def test_an_approver_sees_their_own_request_even_though_they_may_not_decide_it():
	# It is routed to HR precisely so they cannot decide it. Not being able to
	# *read* the request you raised is a system people work around by raising
	# it again.
	assert BOSS in visible_employees(["Manna Attendance Approver"], BOSS, [])


def test_an_approver_with_no_reports_sees_only_themselves():
	assert visible_employees(["Manna Attendance Approver"], BOSS, []) == (BOSS,)


def test_an_employee_sees_only_their_own():
	assert visible_employees(["Employee"], CLERK, []) == (CLERK,)


def test_an_employee_does_not_see_a_colleague():
	assert FITTER not in visible_employees(["Employee"], CLERK, [])


def test_a_reader_this_module_cannot_place_sees_nothing():
	# No employee record and no role we know. Refusing is the safe direction
	# for a permission, which is the opposite of how punches round — see the
	# module docstring.
	assert visible_employees(["Newsletter Manager"], "", []) == ()


def test_the_highest_role_wins_when_somebody_holds_several():
	assert visible_employees(
		["Employee", "Manna Attendance Approver", "HR Manager"], CLERK, [FITTER]
	) is UNRESTRICTED


def test_no_roles_at_all_still_lets_somebody_read_their_own():
	assert visible_employees([], CLERK, []) == (CLERK,)


# ------------------------------------------------------------- the SQL of it ---


def test_unrestricted_is_an_empty_condition():
	# Frappe reads "" as no restriction, which is what we mean here.
	assert sql_condition(UNRESTRICTED) == ""


def test_nobody_is_a_condition_that_matches_nothing_not_an_empty_string():
	# The bug this whole file is about: "" would mean *everybody*.
	assert sql_condition(()) == "1 = 0"


def test_a_list_becomes_an_in_clause_on_the_employee_column():
	assert sql_condition((CLERK, FITTER)) == (
		"`tabAttendance Regularization`.`employee` in "
		f"('{CLERK}', '{FITTER}')"
	)


def test_an_apostrophe_in_a_name_cannot_end_the_clause():
	# `reports_to` is a field somebody can edit, so these names are not beyond
	# reach. An unescaped apostrophe here changes what a permission means.
	assert sql_condition(("O'Brien",)) == (
		"`tabAttendance Regularization`.`employee` in ('O''Brien')"
	)


def test_a_backslash_in_a_name_cannot_escape_the_quoting():
	assert sql_condition(("back\\slash",)) == (
		"`tabAttendance Regularization`.`employee` in ('back\\\\slash')"
	)


def test_the_table_the_clause_names_is_the_one_the_query_is_against():
	# A condition naming the wrong table is a SQL error at read time, on every
	# list, for everybody — which is at least loud.
	assert sql_condition((CLERK,)).startswith("`tabAttendance Regularization`.")


# ------------------------------------------------------------------ letters ---
#
# `letter_query` calls the same pure rule with `reports` emptied, which is the
# whole of the difference and is worth pinning: an approver sees their reports'
# *corrections*, because deciding one is their job, and not their reports'
# *letters*, which can carry a salary, a warning or a reason for leaving.


def test_an_approver_sees_their_reports_corrections():
	assert CLERK in visible_employees(["Manna Attendance Approver"], BOSS, [CLERK])


def test_an_approver_does_not_see_their_reports_letters():
	# The same call `letter_query` makes — reports emptied.
	assert visible_employees(["Manna Attendance Approver"], BOSS, []) == (BOSS,)


def test_hr_still_sees_every_letter():
	assert visible_employees(["HR User"], "", []) is UNRESTRICTED


def test_the_letter_clause_names_the_letter_table():
	# A condition naming the corrections table would be a SQL error on every
	# letter list — loud, but only once somebody opens the register.
	assert sql_condition((CLERK,), table="`tabEmployee Letter`") == (
		f"`tabEmployee Letter`.`employee` in ('{CLERK}')"
	)
