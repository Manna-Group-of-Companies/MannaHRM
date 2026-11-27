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
	assert (p["make_login"], p["sign_in_as"], p["password"]) == (False, "pareeth_k_b", "their own password")
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


def test_a_turned_off_login_or_a_left_employee_is_refused():
	assert aa.phone_punch({**MACHINE, "user_id": "a@b.in"}, {"name": "a@b.in", "enabled": 0})["problems"]
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


def test_on_means_a_phone_method_and_a_linked_login():
	assert aa.phone_punch({**MACHINE, "custom_punch_method": "Both", "user_id": "a@b.in"},
		{"name": "a@b.in", "enabled": 1, "username": "MRP-293"})["on"] is True
	assert aa.phone_punch({**MACHINE, "custom_punch_method": "Both"})["on"] is False


# ---------------------------------- every app user: Emp Code + date of birth ---


def test_an_employee_only_login_is_set_to_the_emp_code_and_date_of_birth():
	# 27 Nov 2026: EBIN JOY's login was "ebin" with a password nobody knew.
	p = aa.phone_punch({**MACHINE, "user_id": "ebin@manna.in"},
		{"name": "ebin@manna.in", "enabled": 1, "username": "ebin", "roles": ["Employee", "Desk User"]})
	assert (p["reset_login"], p["sign_in_as"], p["password"]) == (True, "MRP-293", "date of birth, DDMMYYYY")
	assert p["problems"] == []


def test_a_login_with_any_other_role_keeps_its_name_and_password():
	# An HR Manager's, a CMMS or a Fleet login is somebody's way into another system.
	for extra in ("HR Manager", "Store Purchase Manager", "Fleet Manager", "Driver"):
		p = aa.phone_punch({**MACHINE, "user_id": "x@manna.in"},
			{"name": "x@manna.in", "enabled": 1, "username": "x", "roles": ["Employee", extra]})
		assert (p["reset_login"], p["sign_in_as"], p["password"]) == (False, "x", "their own password"), extra
		assert any(extra in w for w in p["warnings"])


def test_resetting_refuses_an_emp_code_another_login_already_uses():
	p = aa.phone_punch({**MACHINE, "user_id": "a@manna.in"},
		{"name": "a@manna.in", "enabled": 1, "username": "a", "roles": ["Employee"]}, "other@manna.in")
	assert p["problems"] == ["MRP-293 is already the user name of other@manna.in."]


def test_unknown_roles_are_never_reset():
	assert aa.app_only(None) is False
	assert aa.app_only([]) is True
	assert aa.app_only(["Employee", "Desk User", "All"]) is True
	assert aa.app_only(["Employee", "HR User"]) is False


# ------------------------------------------------ nobody without a way to punch --


def test_somebody_active_with_no_machine_number_and_no_login_cannot_punch():
	people = [
		{"name": "E1", "status": "Active", "attendance_device_id": "", "user_id": None, "employee_name": "RAJU K M", "employee_number": "MTR-001"},
		{"name": "E2", "status": "Active", "attendance_device_id": "92", "user_id": None},
		{"name": "E3", "status": "Active", "attendance_device_id": None, "user_id": "mrp-103@phone.manna.invalid"},
		{"name": "E4", "status": "Inactive", "attendance_device_id": None, "user_id": None},
		{"name": "E5", "status": "Active", "attendance_device_id": "  ", "user_id": ""},
	]
	assert [p["name"] for p in aa.cannot_punch(people)] == ["E1", "E5"]


def test_hr_reads_who_cannot_punch_and_what_to_do_in_one_line():
	one = aa.cannot_punch_subject([{"name": "E1", "employee_name": "RAJU K M", "employee_number": "MTR-001"}])
	assert one.startswith("1 person cannot punch: RAJU K M (MTR-001).")
	assert "Allow phone punch" in one
	many = aa.cannot_punch_subject([{"name": "E%d" % i, "employee_name": "N%d" % i, "employee_number": "C%d" % i} for i in range(10)], shown=3)
	assert many.startswith("10 people cannot punch: N0 (C0), N1 (C1), N2 (C2) and 7 more.")
