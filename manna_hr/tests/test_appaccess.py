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
