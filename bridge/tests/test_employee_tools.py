"""Employees against the machine, and creating one on both.

No site and no machine: the site calls are replaced, and the fake connection
records every write, so "the site first, then the machine" is checked here.
"""

from argparse import Namespace
from types import SimpleNamespace

import pytest

import employee_tools
from tests.test_machine_tools import DEVICE, FakeConn, finger, user

CONFIG = SimpleNamespace(erp_url="https://site.example", api_key="k", api_secret="s")


def emp(name, number, status="Active", employee_name="Someone", company="Manna Rubber Products"):
	return {"name": name, "attendance_device_id": number, "status": status, "employee_name": employee_name, "company": company, "branch": ""}


# --- list -------------------------------------------------------------------


def rows_for(users, templates, people):
	fingers = {}
	for f in templates:
		fingers[f.uid] = fingers.get(f.uid, 0) + 1
	return {r["user_id"]: r for r in employee_tools.link_rows(users, fingers, people)}


def test_a_machine_user_with_no_employee_is_flagged_as_punches_refused():
	rows = rows_for([user(1, 851)], [finger(1)], [])
	assert rows["851"]["problem"].startswith("NOT IN ERPNEXT")


def test_a_machine_user_linked_to_an_active_employee_with_a_finger_has_no_problem():
	rows = rows_for([user(1, 851)], [finger(1)], [emp("HR-EMP-1", "851", employee_name="Anil K")])
	assert rows["851"]["problem"] == ""
	assert rows["851"]["employee_name"] == "Anil K"


def test_a_number_two_employees_hold_is_flagged_as_shared():
	rows = rows_for([user(1, 851)], [finger(1)], [emp("HR-EMP-1", "851"), emp("HR-EMP-2", "851", status="Left")])
	assert rows["851"]["problem"].startswith("SHARED")


def test_somebody_who_has_left_but_is_still_on_the_machine_is_flagged():
	rows = rows_for([user(1, 851)], [finger(1)], [emp("HR-EMP-1", "851", status="Left")])
	assert rows["851"]["problem"].startswith("Left")


def test_a_linked_user_with_no_finger_and_no_card_is_flagged_as_unable_to_punch():
	rows = rows_for([user(1, 851)], [], [emp("HR-EMP-1", "851")])
	assert "cannot punch" in rows["851"]["problem"]


def test_only_active_employees_missing_from_the_machine_are_listed_as_not_here():
	people = [emp("HR-EMP-1", "851"), emp("HR-EMP-2", "900"), emp("HR-EMP-3", "901", status="Left")]
	assert [p["name"] for p in employee_tools.not_on_machine([user(1, 851)], people)] == ["HR-EMP-2"]


# --- the record -------------------------------------------------------------


def create_args(**kw):
	base = dict(
		user_id="851", first_name="Anil", last_name="K", gender="Male", date_of_birth="12-04-1994",
		date_of_joining="01-10-2026", company="Manna Rubber Products", shift="General",
		employee_number=None, branch=None, apply=False,
	)
	base.update(kw)
	return Namespace(**base)


def test_dates_are_taken_day_first_and_sent_to_the_site_as_iso():
	doc = employee_tools.employee_doc(create_args())
	assert doc["date_of_birth"] == "1994-04-12"
	assert doc["date_of_joining"] == "2026-10-01"
	assert doc["attendance_device_id"] == "851"
	assert doc["status"] == "Active"


def test_a_birth_date_that_makes_them_a_child_at_joining_is_refused_as_a_typo():
	with pytest.raises(SystemExit):
		employee_tools.employee_doc(create_args(date_of_birth="01-10-2026"))


def test_a_date_that_is_not_a_date_is_refused():
	with pytest.raises(SystemExit):
		employee_tools.employee_doc(create_args(date_of_joining="next monday"))


def test_a_number_any_employee_holds_even_one_who_left_is_refused():
	holders = employee_tools.by_number([emp("HR-EMP-9", "851", status="Left")])
	with pytest.raises(SystemExit):
		employee_tools.machine_step("851", holders, None)


def test_a_number_the_machine_calls_somebody_else_is_called_out():
	# The real one: 999 was free on the site and belonged to Plansing A Sangma on
	# the machine, so linking it would have paid his attendance to somebody else.
	assert employee_tools.looks_like_somebody_else("Plansing A Sangma", "IT Department")
	assert employee_tools.looks_like_somebody_else("SUNIT THITHIYO", "Anil K")


def test_the_same_person_spelt_differently_is_not_called_out():
	# A keypad spells badly, and a middle initial or a swapped order is not a
	# different person. Refusing those would train people to ignore the warning.
	assert not employee_tools.looks_like_somebody_else("ANIL K", "Anil Kumar")
	assert not employee_tools.looks_like_somebody_else("SANGMA PLANSING", "Plansing A Sangma")
	assert not employee_tools.looks_like_somebody_else("", "Anil K")


def test_somebody_enrolled_at_the_gate_first_is_linked_not_added_again():
	assert employee_tools.machine_step("851", {}, user(1, 851)) == "link"
	assert employee_tools.machine_step("851", {}, None) == "add"


# --- create, end to end -----------------------------------------------------


@pytest.fixture
def site(monkeypatch):
	state = {"inserted": [], "refuse": False, "people": []}
	lists = {
		"Company": [{"name": "Manna Rubber Products"}],
		"Gender": [{"name": "Male"}, {"name": "Female"}],
		"Shift Type": [{"name": "General"}],
	}

	def site_list(config, doctype, fields, filters):
		if doctype == "Employee":
			return [] if filters and filters[0][0] == "employee_name" else state["people"]
		return lists.get(doctype, [])

	def site_insert(config, doctype, doc):
		if state["refuse"]:
			raise SystemExit("refused")
		state["inserted"].append(doc)
		return {"name": "HR-EMP-00500"}

	monkeypatch.setattr(employee_tools, "site_list", site_list)
	monkeypatch.setattr(employee_tools, "site_insert", site_insert)
	return state


def test_create_without_apply_writes_nothing_to_the_site_or_the_machine(site):
	conn = FakeConn([user(1, 7)])
	employee_tools.cmd_create(conn, create_args(), CONFIG, DEVICE)
	assert site["inserted"] == [] and conn.writes == []


def test_create_writes_the_employee_then_the_machine_user(site):
	conn = FakeConn([user(1, 7)])
	employee_tools.cmd_create(conn, create_args(apply=True), CONFIG, DEVICE)
	assert site["inserted"][0]["attendance_device_id"] == "851"
	assert conn.writes[0][1]["user_id"] == "851"
	assert conn.writes[0][1]["uid"] == 2


def test_a_site_that_refuses_the_employee_leaves_the_machine_untouched(site):
	site["refuse"] = True
	conn = FakeConn()
	with pytest.raises(SystemExit):
		employee_tools.cmd_create(conn, create_args(apply=True), CONFIG, DEVICE)
	assert conn.writes == []


def test_a_company_the_site_does_not_have_is_refused_before_anything_is_written(site):
	conn = FakeConn()
	with pytest.raises(SystemExit):
		employee_tools.cmd_create(conn, create_args(company="Manna Rubber", apply=True), CONFIG, DEVICE)
	assert site["inserted"] == [] and conn.writes == []


def test_somebody_already_on_the_machine_gets_the_record_and_no_machine_write(site):
	conn = FakeConn([user(3, 851, "ANIL K")])
	employee_tools.cmd_create(conn, create_args(apply=True), CONFIG, DEVICE)
	assert len(site["inserted"]) == 1 and conn.writes == []
