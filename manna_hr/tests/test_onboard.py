"""Tests for the onboard rules that need no site.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import ast
import io
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import rules  # noqa: E402

APP = os.path.join(os.path.dirname(__file__), "..")


def _literal(path, name):
	"""Read one module-level constant without importing the module.

	`install.py` and `hooks.py` both import `frappe`, which is not installed
	where this suite runs. Parsing them is the difference between a test that
	catches the drift and a test that is skipped on every machine anybody would
	run it on.
	"""
	tree = ast.parse(io.open(os.path.join(APP, path), encoding="utf-8").read())
	for node in tree.body:
		if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == name:
			return ast.literal_eval(node.value)
	raise AssertionError("%s not found in %s" % (name, path))


# ------------------------------------------------------- document statuses ---


def test_the_expiry_day_itself_is_still_valid():
	# A visa valid upto the 30th is valid on the 30th. Counting it as expired
	# sends somebody home a day early.
	status, days = rules.document_status(date(2026, 9, 30), date(2026, 9, 30), warn_days=7)
	assert status == rules.DOC_EXPIRING
	assert days == 0


def test_a_document_with_no_expiry_is_not_reported_as_valid():
	# `Valid` claims somebody checked a date. A PAN card has no date to check,
	# and putting the two in one bucket makes the report useless.
	status, days = rules.document_status(None, date(2026, 9, 7), has_expiry=False)
	assert status == rules.DOC_NO_EXPIRY
	assert days is None


def test_a_missing_date_rounds_against_the_file_not_the_person():
	# An unfinished record is not evidence of a valid document.
	status, days = rules.document_status(None, date(2026, 9, 7), has_expiry=True)
	assert status == rules.DOC_EXPIRING
	assert days is None


def test_the_warn_window_comes_from_the_type():
	# A visa wants months and a passport wants weeks; one number for both makes
	# the visa warning arrive after the appointment that could have used it.
	on = date(2026, 9, 7)
	soon = date(2026, 12, 1)  # 85 days out
	assert rules.document_status(soon, on, warn_days=30)[0] == rules.DOC_VALID
	assert rules.document_status(soon, on, warn_days=120)[0] == rules.DOC_EXPIRING


def test_an_expired_document_counts_negative_so_a_report_can_sort_by_urgency():
	status, days = rules.document_status(date(2026, 9, 1), date(2026, 9, 7))
	assert status == rules.DOC_EXPIRED
	assert days == -6


def test_a_type_with_a_nonsense_warn_window_falls_back_rather_than_never_warning():
	status, _ = rules.document_status(date(2026, 9, 20), date(2026, 9, 7), warn_days=0)
	assert status == rules.DOC_EXPIRING


# ------------------------------------------------- the two hand-kept lists ---


def test_every_custom_field_is_exported_as_a_fixture():
	"""The drift this catches has already happened once.

	`Employee-custom_hr_section` was created by `install.py` and missing from
	the fixture list, so a second site got the three Employee fields without the
	section break they are inserted after — and they landed at the bottom of the
	form. Nothing said so.
	"""
	declared = set(
		"%s-%s" % (dt, f["fieldname"])
		for dt, fields in _literal("install.py", "CUSTOM_FIELDS").items()
		for f in fields
	)

	exported = set()
	for entry in _literal("hooks.py", "fixtures"):
		if entry.get("dt") != "Custom Field":
			continue
		for clause in entry["filters"]:
			if clause[0] == "name" and clause[1] == "in":
				exported.update(clause[2])

	assert declared == exported, {
		"declared but not exported": sorted(declared - exported),
		"exported but not declared": sorted(exported - declared),
	}


def test_every_custom_field_is_inserted_after_a_field_that_will_exist():
	"""`insert_after` naming a `custom_` field defined later in the same list.

	Frappe applies these in order, so a field inserted after one that has not
	been created yet is silently appended to the end of the form.
	"""
	for dt, fields in _literal("install.py", "CUSTOM_FIELDS").items():
		seen = set()
		for f in fields:
			after = f.get("insert_after", "")
			if after.startswith("custom_"):
				assert after in seen, "%s: %s inserts after %s, which is not defined above it" % (
					dt,
					f["fieldname"],
					after,
				)
			seen.add(f["fieldname"])


# --------------------------------------------------- asset handover status ---


def test_a_fresh_handover_is_assigned():
	assert rules.assignment_status(1) == rules.ASN_ASSIGNED
	assert rules.assignment_is_open(rules.ASN_ASSIGNED)


def test_some_back_and_some_still_out_is_partly_returned():
	assert rules.assignment_status(12, return_unit=3) == rules.ASN_PART_RETURNED
	assert rules.assignment_is_open(rules.ASN_PART_RETURNED)


def test_everything_back_closes_the_handover():
	assert rules.assignment_status(3, return_unit=3) == rules.ASN_RETURNED
	assert not rules.assignment_is_open(rules.ASN_RETURNED)


def test_loss_outranks_return_when_a_handover_is_both():
	# Two came back and one did not. A status that led with the good news would
	# bury the laptop that is gone.
	assert rules.assignment_status(3, return_unit=2, lost_units=1) == rules.ASN_PART_LOST


def test_something_lost_and_something_still_out_is_not_reported_as_returned():
	assert rules.assignment_status(3, lost_units=1) == rules.ASN_PART_LOST
	assert rules.assignment_is_open(rules.ASN_PART_LOST)


def test_a_handover_with_nothing_left_to_come_back_is_closed():
	assert rules.assignment_status(2, lost_units=2) == rules.ASN_LOST
	assert not rules.assignment_is_open(rules.ASN_LOST)


def test_a_handover_of_nothing_has_no_status_to_report():
	# Caught by `assets.check_counts` before this is reached; the empty string
	# is what stops a bad row rendering as a confident word.
	assert rules.assignment_status(0) == ""


# ------------------------------------------ the doctype the client reads ---


# **A test used to sit here and no longer can.** It read
# `manna_hr/doctype/asset_assignment/asset_assignment.json` and checked every
# field `ASSIGN_FIELDS` in `client/src/api/load.js` asks the site for. That is
# the drift which produced "DocType Asset Assignment not found" once already:
# a screen written against a doctype nobody had built, failing at the read.
#
# The schema now lives on the site, so there is nothing here to compare the
# client against. `python tools/check_schema.py` makes the same comparison
# against the site itself; it needs credentials and is not part of this suite.


def test_a_status_nobody_chose_is_computed_from_the_counts():
	assert rules.assignment_status(10, chosen="") == rules.ASN_ASSIGNED


def test_a_chosen_status_the_counts_contradict_is_refused_not_rewritten():
	# Returned, on a row where nothing came back. Both words are named: the
	# person either mis-picked or forgot to fill Return Unit, and quietly
	# rewriting the box answers neither question.
	said = rules.assignment_status_problem(rules.ASN_RETURNED, 10)
	assert "says Returned" in said and "make it Assigned" in said


def test_a_chosen_status_that_matches_the_counts_is_no_problem():
	assert rules.assignment_status_problem(rules.ASN_ASSIGNED, 10) == ""


def test_scrapped_survives_being_recomputed_because_no_count_can_produce_it():
	assert rules.assignment_status(10, chosen=rules.ASN_SCRAPPED) == rules.ASN_SCRAPPED
	assert rules.assignment_status_problem(rules.ASN_SCRAPPED, 10) == ""


def test_damaged_survives_too_and_is_the_reason_the_dropdown_exists():
	got = rules.assignment_status(10, return_unit=10, chosen=rules.ASN_DAMAGED)
	assert got == rules.ASN_DAMAGED


def test_damaged_kit_is_still_out_so_it_cannot_go_to_somebody_else():
	# Broken is not the same as back: it is still in that person's drawer.
	assert rules.assignment_is_open(rules.ASN_DAMAGED)


def test_scrapped_kit_is_finished_with():
	assert not rules.assignment_is_open(rules.ASN_SCRAPPED)


def test_a_word_that_is_not_a_state_at_all_is_refused():
	assert "not one of the states" in rules.assignment_status_problem("In Use", 10)


def test_the_counts_are_still_read_straight_when_a_judgment_is_on_the_row():
	# The judgment replaces the *status*, never the arithmetic under it.
	assert rules.assignment_status(10, return_unit=4) == rules.ASN_PART_RETURNED


def test_factohr_asset_types_are_spelled_the_same_on_both_sides():
	"""The install seeds them and the dashboard offers them; one list, two files.

	A type spelled differently here is a category created on install that the
	dialog then offers to create again, and a second insert on a prompt-named
	doctype is a duplicate-name failure rather than a no-op.
	"""
	import re

	seeded = _literal("install.py", "ASSET_CATEGORIES")

	here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
	client = io.open(os.path.join(here, "client", "src", "data", "onboard.js"),
	                 encoding="utf-8").read()

	found = re.search(r"export const FH_ASSET_TYPES = \[(.*?)\];", client, re.S)
	assert found, "client/src/data/onboard.js no longer declares FH_ASSET_TYPES"

	assert re.findall(r'"([^"]+)"', found.group(1)) == list(seeded)
