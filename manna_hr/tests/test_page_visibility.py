"""Settings → Security: who may change which pages everybody is shown.

A menu, not a permission — but every company login is an HR Manager and can
write Manna HR Settings, so who may change the menu is the server's to decide.
"""

import json
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))

from manna_hr import rules  # noqa: E402
import add_missing_fields as amf  # noqa: E402

SETTINGS = os.path.join(HERE, "..", "manna_hr", "doctype", "manna_hr_settings", "manna_hr_settings.json")


def test_only_the_page_admin_may_change_page_visibility():
	assert rules.may_set_page_visibility("hr@mannarubber.com")
	assert not rules.may_set_page_visibility("mannarubber@gmail.com")
	assert not rules.may_set_page_visibility("")


def test_the_page_admin_is_matched_whatever_the_case_it_was_typed_in():
	assert rules.may_set_page_visibility(" HR@MannaRubber.com ")


def test_administrator_may_change_page_visibility_from_desk():
	assert rules.may_set_page_visibility("Administrator")


def test_page_visibility_may_only_say_show_or_hide():
	assert rules.page_visibility_problem(json.dumps({"employees/all": "show", "leave": "hide"})) == ""
	assert "not for: leave" in rules.page_visibility_problem(json.dumps({"leave": "off"}))


def test_empty_page_visibility_is_the_defaults_and_not_a_problem():
	assert rules.page_visibility_problem("") == ""
	assert rules.page_visibility_problem(None) == ""


def test_page_visibility_that_is_not_a_json_object_is_refused():
	assert rules.page_visibility_problem("{nope") != ""
	assert rules.page_visibility_problem('["leave"]') != ""


def test_manna_hr_settings_has_somewhere_to_keep_page_visibility():
	spec = json.load(open(SETTINGS, encoding="utf-8"))
	assert "page_visibility" in spec["field_order"]
	assert any(f["fieldname"] == "page_visibility" and f["fieldtype"] == "Long Text" for f in spec["fields"])


def test_a_field_the_site_already_has_is_not_sent_again():
	spec = {"fields": [{"fieldname": "a", "fieldtype": "Data"}, {"fieldname": "b", "fieldtype": "Long Text", "idx": 2}]}
	assert amf.missing_fields(spec, [{"fieldname": "a", "fieldtype": "Int"}]) == [{"fieldname": "b", "fieldtype": "Long Text"}]


# --- Employee fields ---------------------------------------------------------

ACCESS = {"new": {"custom_pan_no": "read"}, "edit": {"employee_number": "read", "ctc": "hidden"}}
CLERK = "mannarubber@gmail.com"


def test_a_locked_field_cannot_be_changed_on_an_existing_employee():
	refused = rules.employee_access_refusals(ACCESS, CLERK, False,
		{"employee_number": "MR001", "ctc": 5000.0}, {"employee_number": "MR002", "ctc": "5000"})
	assert refused == ["employee_number"]


def test_a_hidden_field_cannot_be_written_either():
	assert rules.employee_access_refusals(ACCESS, CLERK, False, {"ctc": 5000.0}, {"ctc": 9000}) == ["ctc"]


def test_saving_a_locked_field_unchanged_is_not_a_change():
	# The request sends "5000", the record holds 5000.0; blank and None are one blank.
	assert rules.employee_access_refusals(ACCESS, CLERK, False,
		{"employee_number": "MR001", "ctc": 5000.0}, {"employee_number": "MR001", "ctc": "5000"}) == []
	assert rules.employee_access_refusals(ACCESS, CLERK, False, {"ctc": None}, {"ctc": ""}) == []


def test_a_new_employee_may_not_carry_a_value_in_a_field_locked_on_create():
	assert rules.employee_access_refusals(ACCESS, CLERK, True, {}, {"custom_pan_no": "ABCDE1234F"}) == ["custom_pan_no"]


def test_a_new_employee_may_carry_a_locked_fields_own_default():
	assert rules.employee_access_refusals(ACCESS, CLERK, True, {}, {"custom_pan_no": "NA"}, {"custom_pan_no": "NA"}) == []
	assert rules.employee_access_refusals(ACCESS, CLERK, True, {}, {"custom_pan_no": 0}) == []


def test_the_rules_that_lock_fields_do_not_bind_the_page_admin():
	assert rules.employee_access_refusals(ACCESS, "hr@mannarubber.com", False,
		{"employee_number": "MR001"}, {"employee_number": "MR002"}) == []


def test_field_access_may_only_say_read_or_hidden_under_new_or_edit():
	assert rules.field_access_problem(json.dumps(ACCESS)) == ""
	assert rules.field_access_problem(json.dumps({"new": {"x": "write"}})) != ""
	assert rules.field_access_problem(json.dumps({"other": {}})) != ""
	assert rules.field_access_problem("") == ""


def test_manna_hr_settings_has_somewhere_to_keep_employee_field_access():
	spec = json.load(open(SETTINGS, encoding="utf-8"))
	assert "employee_field_access" in spec["field_order"]


def test_employee_saves_are_checked_against_the_field_rules():
	hooks = open(os.path.join(HERE, "..", "hooks.py"), encoding="utf-8").read()
	assert '"validate": "manna_hr.fieldaccess.validate_employee"' in hooks
