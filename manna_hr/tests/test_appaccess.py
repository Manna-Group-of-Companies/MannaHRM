"""Apps & access: what each switch reads, writes, and refuses — without a site."""

import pytest

from manna_hr import appaccess as aa

HR = "hr@mannarubber.com"


def _state(info, key):
	return next(r for r in aa.states(info) if r["key"] == key)


def test_a_disabled_login_shows_every_app_that_follows_it_as_off():
	info = {"enabled": 0, "user_type": "System User", "roles": ["HR User"]}
	assert _state(info, "login")["on"] is False
	assert _state(info, "hr_app")["on"] is False
	assert _state(info, "desk")["on"] is False


def test_hr_manager_counts_as_the_hr_dashboard_being_on():
	assert _state({"enabled": 1, "roles": ["HR Manager"]}, "hr_web")["on"] is True


def test_cmms_shows_the_most_senior_role_held():
	row = _state({"enabled": 1, "roles": ["Store Maintenance Member", "Store Manager"]}, "cmms")
	assert (row["on"], row["value"]) == (True, "Store Manager")


def test_the_sales_dashboard_reads_its_flags_not_roles():
	row = _state({"enabled": 1, "roles": [], "flags": {"custom_is_stock_manager": 1}}, "sales_web")
	assert (row["on"], row["value"]) == (True, "custom_is_stock_manager")


def test_only_hr_manager_or_system_manager_may_switch():
	assert aa.why_not(HR, ["HR User"], "a@x.com", []) != ""
	assert aa.why_not(HR, ["HR Manager"], "a@x.com", []) == ""


def test_nobody_switches_their_own_login():
	assert "signed in" in aa.why_not(HR, ["System Manager"], HR.upper(), [])


def test_an_hr_manager_cannot_touch_a_system_managers_access_but_a_system_manager_can():
	assert "System Manager" in aa.why_not(HR, ["HR Manager"], "it@x.com", ["System Manager"])
	assert aa.why_not(HR, ["HR Manager", "System Manager"], "it@x.com", ["System Manager"]) == ""


def test_switching_the_hr_dashboard_off_takes_hr_manager_too():
	assert aa.plan("hr_web", "", ["HR Manager", "HR User", "Employee"]) == {
		"add_roles": [], "remove_roles": ["HR User", "HR Manager"]}


def test_switching_the_hr_dashboard_on_gives_hr_user_never_hr_manager():
	assert aa.plan("hr_web", True, [])["add_roles"] == ["HR User"]


def test_a_cmms_level_replaces_the_one_held_rather_than_adding_a_second():
	changes = aa.plan("cmms", "Store Supervisor", ["Store Maintenance Member", "Employee"])
	assert changes == {"add_roles": ["Store Supervisor"], "remove_roles": ["Store Maintenance Member"]}


def test_cmms_off_removes_every_cmms_role_and_nothing_else():
	changes = aa.plan("cmms", "", ["Store Manager", "Plant Manager", "Employee"])
	assert changes == {"add_roles": [], "remove_roles": ["Store Manager", "Plant Manager"]}


def test_a_sales_dashboard_role_clears_the_other_five():
	flags = aa.plan("sales_web", "custom_is_accountant", [])["flags"]
	assert flags["custom_is_accountant"] == 1 and sum(flags.values()) == 1


@pytest.mark.parametrize("key,value", [("cmms", "System Manager"), ("sales_web", "roles"), ("nope", True), ("desk", True)])
def test_anything_the_screen_does_not_offer_is_refused(key, value):
	with pytest.raises(ValueError):
		aa.plan(key, value, [])


def test_no_switch_can_grant_an_untouchable_role():
	for a in aa.APPS:
		if a["kind"] == "role":
			assert a["role"] not in aa.UNTOUCHABLE
	assert not set(aa.CMMS_ROLES) & set(aa.UNTOUCHABLE)


# ------------------------------------------------------------ phone punch ---

MACHINE = {
	"name": "HR-EMP-00293", "employee_name": "Anand K", "employee_number": "MRP-293", "status": "Active",
	"date_of_birth": "2005-03-24", "company_email": "Anand@Manna.in", "user_id": "",
	"custom_punch_method": "Fingerprint Machine", "default_shift": "General",
}


def test_the_first_password_is_the_date_of_birth_ddmmyyyy():
	assert aa.first_password("2005-03-24") == "24032005"
	assert aa.first_password("") == ""
	assert aa.first_password(None) == ""


def test_a_machine_employee_with_no_login_gets_one_named_by_email_signed_in_with_the_emp_code():
	p = aa.phone_punch(MACHINE)
	assert p["problems"] == []
	assert (p["make_login"], p["login"], p["sign_in_as"]) == (True, "anand@manna.in", "MRP-293")
	assert p["on"] is False


def test_an_existing_login_keeps_its_own_user_name_and_password():
	# A driver's Fleet app signs in as pareeth_k_b; changing it would lock them out there.
	p = aa.phone_punch({**MACHINE, "user_id": "pareeth@manna.in"},
		{"name": "pareeth@manna.in", "enabled": 1, "username": "pareeth_k_b"})
	assert p["own_login"] == "pareeth@manna.in"
	assert p["login"] != "pareeth@manna.in"
	assert p["free_username"] == ""
	assert p["problems"] == []


def test_what_is_missing_is_said_in_words_hr_can_act_on():
	p = aa.phone_punch({**MACHINE, "date_of_birth": None, "employee_number": ""})
	assert any("date of birth" in s for s in p["problems"])
	assert any("Emp Code" in s for s in p["problems"])


def test_no_email_is_not_a_refusal_the_login_is_named_after_the_emp_code():
	# 26 Nov 2026: punching on the phone needs the Emp Code and the date of birth, not an email.
	p = aa.phone_punch({**MACHINE, "company_email": ""})
	assert p["problems"] == []
	assert (p["login"], p["sign_in_as"], p["stand_in"]) == ("mrp-293@phone.manna.invalid", "MRP-293", True)
	assert any("Forgot password" in w for w in p["warnings"])


def test_the_stand_in_address_is_made_from_the_emp_code_and_never_delivers():
	assert aa.stand_in_email("MRP-293") == "mrp-293@phone.manna.invalid"
	assert aa.stand_in_email(" MT 12/7 ") == "mt-12-7@phone.manna.invalid"
	assert aa.stand_in_email("") == ""
	assert aa.stand_in_email("MRP-293").endswith(".invalid")


def test_a_real_email_still_wins_over_the_stand_in():
	p = aa.phone_punch(MACHINE)
	assert (p["login"], p["stand_in"]) == ("anand@manna.in", False)


def test_an_emp_code_already_somebodys_user_name_is_refused():
	p = aa.phone_punch(MACHINE, None, "other@manna.in")
	assert p["problems"] == ["MRP-293 is already the user name of other@manna.in."]


def test_a_turned_off_app_login_or_a_left_employee_is_refused():
	stand_in = {"name": "mrp-293@phone.manna.invalid", "enabled": 0}
	assert aa.phone_punch({**MACHINE, "user_id": stand_in["name"]}, stand_in)["problems"]
	assert aa.phone_punch(MACHINE, app_user=stand_in)["problems"]
	assert aa.phone_punch({**MACHINE, "status": "Left"})["problems"]


def test_no_shift_and_no_user_name_sign_in_are_warnings_not_refusals():
	p = aa.phone_punch({**MACHINE, "default_shift": ""}, by_user_name=False)
	assert p["problems"] == []
	assert len(p["warnings"]) == 2


def test_the_machine_is_kept():
	assert aa.phone_method_after("Fingerprint Machine") == "Both"
	assert aa.phone_method_after("") == "Both"
	assert aa.phone_method_after("Mobile App") == "Mobile App"
	assert aa.phone_method_after("Both") == "Both"


# ------------------ the app signs in with Emp Code + date of birth, nothing else changes ---


OWN = {"name": "ebin@gmail.com", "enabled": 1, "username": "ebin"}


def test_somebody_with_their_own_login_gets_a_second_login_for_the_app():
	# 28 Nov 2026: the app is Emp Code + date of birth, every other app their own
	# Gmail and password. One Frappe login holds one password, so the app gets its own.
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com"}, OWN)
	assert (p["make_app_login"], p["make_login"]) == (True, False)
	assert (p["login"], p["sign_in_as"], p["password"]) == (
		"mrp-293@phone.manna.invalid", "MRP-293", "date of birth, DDMMYYYY")
	assert p["own_login"] == "ebin@gmail.com"
	assert p["problems"] == []


def test_no_role_or_flag_makes_an_existing_login_take_the_date_of_birth():
	# 27 Nov 2026: roles alone decided "app only", the sales app is a flag, and 22
	# people's own passwords became their birthdays. Nothing about the login matters now.
	for roles in ([], ["Employee"], ["Employee", "Desk User"], ["Employee", "HR Manager"], None):
		p = aa.phone_punch({**MACHINE, "user_id": "x@manna.in"}, {**OWN, "name": "x@manna.in", "roles": roles})
		assert p["login"] != "x@manna.in", roles
		assert p["make_app_login"] is True, roles


def test_the_emp_code_moves_off_their_own_login_and_its_password_stays():
	# What the 27 Nov rule left behind: their own login carries the Emp Code as its user name.
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com"}, {**OWN, "username": "MRP-293"}, "ebin@gmail.com")
	assert p["free_username"] == "ebin@gmail.com"
	assert p["problems"] == []
	assert any("keeps its password" in w for w in p["warnings"])


def test_an_emp_code_held_by_somebody_elses_login_is_refused_and_nothing_moves():
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com"}, OWN, "other@manna.in")
	assert p["problems"] == ["MRP-293 is already the user name of other@manna.in."]
	assert p["free_username"] == ""


APP = {"name": "mrp-293@phone.manna.invalid", "enabled": 1, "username": "MRP-293"}


def test_an_app_login_already_linked_is_on_and_nothing_is_made():
	p = aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": "ebin@gmail.com",
		"custom_app_login": APP["name"]}, OWN, APP["name"], app_user=APP)
	assert (p["on"], p["make_app_login"], p["make_login"], p["link"], p["free_username"]) == (True, False, False, False, "")
	assert (p["login"], p["sign_in_as"], p["link_field"]) == (APP["name"], "MRP-293", "custom_app_login")


def test_pressing_again_never_moves_the_app_login_onto_user_id():
	# Review, 28 Nov 2026: with Punch Method set back to the machine, a second press
	# wrote the app login over user_id and unlinked their own login from the record.
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com", "custom_app_login": APP["name"]}, OWN, APP["name"], app_user=APP)
	assert (p["link_field"], p["link"], p["on"]) == ("custom_app_login", False, False)


def test_an_unlinked_app_login_from_an_earlier_press_is_linked_beside_their_own_never_over_it():
	p = aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": "ebin@gmail.com"}, OWN, APP["name"], app_user=APP)
	assert (p["link_field"], p["link"], p["on"]) == ("custom_app_login", True, False)
	assert aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com"}, OWN, APP["name"], app_user=APP,
		app_field=False)["problems"] == ["The site has no App Login field on Employee yet."]


def test_with_no_login_on_the_record_the_app_login_goes_on_user_id():
	# Their own login found by their email or Fleet driver link was never on the record,
	# and ERPNext keeps the Employee role only on a login some Employee names in user_id.
	p = aa.phone_punch(MACHINE, OWN)
	assert (p["make_app_login"], p["link_field"], p["link"], p["own_login"]) == (True, "user_id", True, "ebin@gmail.com")


def test_already_punching_with_their_own_login_reads_as_on_and_the_app_login_is_offered_beside_it():
	# A login Create Employee made with the date of birth cannot be told from somebody's own.
	p = aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": "ebin@gmail.com"}, OWN)
	assert (p["on"], p["make_app_login"], p["own_sign_in_as"]) == (True, True, "ebin")


def test_a_turned_off_app_login_is_not_on_and_says_so():
	p = aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": "ebin@gmail.com",
		"custom_app_login": APP["name"]}, OWN, APP["name"], app_user={**APP, "enabled": 0})
	assert p["on"] is False
	assert p["problems"] == ["Their app login mrp-293@phone.manna.invalid is turned off."]


def test_a_login_this_button_made_for_somebody_with_none_is_the_apps_own():
	stand_in = {"name": "mrp-293@phone.manna.invalid", "enabled": 1, "username": "MRP-293"}
	p = aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": stand_in["name"]}, stand_in,
		stand_in["name"])
	assert (p["on"], p["make_app_login"], p["make_login"], p["own_login"]) == (True, False, False, "")


def test_a_site_without_the_app_login_field_is_refused_before_anything_is_written():
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com"}, OWN, app_field=False)
	assert p["problems"] == ["The site has no App Login field on Employee yet."]


def test_the_app_login_needs_an_emp_code_and_a_date_of_birth():
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@gmail.com", "employee_number": "", "date_of_birth": None}, OWN)
	assert any("Emp Code" in s for s in p["problems"])
	assert any("date of birth" in s for s in p["problems"])


def test_nothing_in_the_rule_can_reset_a_password_any_more():
	assert not hasattr(aa, "app_only")
	assert "reset_login" not in aa.phone_punch(MACHINE)


# ------------------------------------------------ nobody without a way to punch --


def test_somebody_active_with_no_machine_number_and_no_login_cannot_punch():
	people = [
		{"name": "E1", "status": "Active", "attendance_device_id": "", "user_id": None, "employee_name": "RAJU K M", "employee_number": "MTR-001"},
		{"name": "E2", "status": "Active", "attendance_device_id": "92", "user_id": None},
		{"name": "E3", "status": "Active", "attendance_device_id": None, "user_id": "mrp-103@phone.manna.invalid"},
		{"name": "E4", "status": "Inactive", "attendance_device_id": None, "user_id": None},
		{"name": "E5", "status": "Active", "attendance_device_id": "  ", "user_id": ""},
		{"name": "E6", "status": "Active", "attendance_device_id": "", "user_id": "", "custom_app_login": "mrp-6@phone.manna.invalid"},
	]
	assert [p["name"] for p in aa.cannot_punch(people)] == ["E1", "E5"]


def test_hr_reads_who_cannot_punch_and_what_to_do_in_one_line():
	one = aa.cannot_punch_subject([{"name": "E1", "employee_name": "RAJU K M", "employee_number": "MTR-001"}])
	assert one.startswith("1 person cannot punch: RAJU K M (MTR-001).")
	assert "Allow phone punch" in one
	many = aa.cannot_punch_subject([{"name": "E%d" % i, "employee_name": "N%d" % i, "employee_number": "C%d" % i} for i in range(10)], shown=3)
	assert many.startswith("10 people cannot punch: N0 (C0), N1 (C1), N2 (C2) and 7 more.")


# --- the login an employee already has (28 November 2026: HPT-114 was made beside a linked driver login)

def test_the_record_s_own_login_wins():
	assert aa.existing_login("a@x.com", ["driver@x.com"], "e@x.com") == ("a@x.com", "")


def test_a_linked_driver_login_is_reused_rather_than_a_second_made():
	assert aa.existing_login("", ["abhishek.dreiver@gmail.com"], "") == ("abhishek.dreiver@gmail.com", "")
	# even over a stand-in the email lookup found
	assert aa.existing_login("", ["d@x.com"], "hpt-114@phone.manna.invalid") == ("d@x.com", "")


def test_without_a_driver_login_the_email_or_stand_in_is_used():
	assert aa.existing_login("", [], "e@x.com") == ("e@x.com", "")
	assert aa.existing_login("", [None, ""], "") == ("", "")


def test_two_driver_logins_for_one_employee_are_for_hr_to_settle():
	login, problem = aa.existing_login("", ["b@x.com", "a@x.com"], "e@x.com")
	assert login == "" and "a@x.com, b@x.com" in problem


def test_the_fleet_driver_switch_refuses_a_second_driver_login():
	assert aa.second_driver_login("abhilash@x.com", ["abhilash.m.g.driver@x.com"]).startswith(
		"abhilash@x.com already uses the Fleet driver app as abhilash.m.g.driver@x.com")
	assert aa.second_driver_login("d@x.com", ["d@x.com"]) == ""
	assert aa.second_driver_login("d@x.com", []) == ""


def test_a_linked_driver_login_is_found_kept_as_it_is_and_the_app_gets_its_own():
	# HPT-114: the driver login is theirs, so no second email login is made beside it,
	# and the Fleet app's password is not changed: the app login (Employee role alone)
	# is not a driver, so the drivers list does not show them twice.
	login, problem = aa.existing_login("", ["abhishek.dreiver@gmail.com"], "")
	assert (login, problem) == ("abhishek.dreiver@gmail.com", "")
	p = aa.phone_punch({**MACHINE, "employee_number": "HPT-114", "company_email": ""},
		{"name": login, "enabled": 1, "username": "abhishek"})
	assert (p["own_login"], p["login"], p["make_app_login"], p["make_login"]) == (
		"abhishek.dreiver@gmail.com", "hpt-114@phone.manna.invalid", True, False)
