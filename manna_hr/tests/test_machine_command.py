"""What a fingerprint machine may be asked to do from a web page, and what not.

No site: these are the rules the controller applies and the bridge applies
again, and both import them from `manna_hr/machinecmd.py` so the two cannot
drift into disagreeing about what an action is called.
"""

import ast
import pathlib

import pytest

from manna_hr.machinecmd import (
	ACTIONS,
	WRITING,
	add_answer,
	check_answer,
	is_number,
	machine_name,
	may_move,
	problem_with,
)


def test_no_action_clears_the_log_wipes_the_machine_or_switches_it_off():
	# The machine's memory is the last copy of a punch the bridge has not
	# delivered. Nothing reachable from a web page may destroy it. CLAUDE.md §5.
	forbidden = ("clear", "wipe", "delete", "erase", "format", "power", "off", "reset", "restart")
	for action in ACTIONS:
		assert not any(word in action.lower() for word in forbidden)


def test_the_bridge_knows_exactly_the_actions_this_app_allows():
	"""The bridge carries its own copy of the list, because it is installed on a
	gate PC with this app nowhere near it. Read here rather than imported for the
	same reason — importing `mannabridge` would need `requests` and the bridge's
	layout, and the thing worth checking is only that the two agree."""
	source = pathlib.Path(__file__).resolve().parents[2] / "bridge" / "mannabridge" / "commands.py"
	tree = ast.parse(source.read_text(encoding="utf-8"))
	theirs = next(
		ast.literal_eval(node.value)
		for node in tree.body
		if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "ACTIONS"
	)
	assert set(theirs) == set(ACTIONS)


def test_an_action_nobody_wrote_down_is_refused():
	assert problem_with("Clear Log", "BIO-MRP-GATE1", "105", "Anil") is not None
	assert problem_with("Check User", "BIO-MRP-GATE1", "105", "") is None


def test_only_add_user_changes_the_machine():
	assert WRITING == {"Add User"}


def test_a_machine_number_is_plain_digits_and_short():
	assert is_number("105")
	assert not is_number("HR-EMP-105")
	assert not is_number("")
	# The machines truncate a longer one silently, so the punches arrive under a
	# number nobody has.
	assert not is_number("1234567890")


def test_a_command_has_to_name_its_machine():
	assert problem_with("Check User", "", "105", "") is not None


def test_adding_somebody_needs_a_name_for_whoever_is_at_the_gate():
	assert problem_with("Add User", "BIO-MRP-GATE1", "105", "") is not None
	assert problem_with("Add User", "BIO-MRP-GATE1", "105", "Anil K") is None


def test_listing_users_needs_no_number():
	assert problem_with("List Users", "BIO-MRP-GATE1", "", "") is None


def test_a_long_name_is_cut_to_what_the_machine_holds():
	assert machine_name("A" * 40) == "A" * 24


def test_a_finished_command_never_goes_back_to_pending():
	# Sent round again it would add a second user, or re-answer a question
	# somebody has already acted on.
	assert not may_move("Done", "Pending")
	assert not may_move("Failed", "Pending")
	assert not may_move("Cancelled", "Pending")
	assert may_move("Pending", "Running")
	assert may_move("Running", "Done")


@pytest.mark.parametrize("status", ["Done", "Failed", "Cancelled"])
def test_a_finished_command_stays_finished(status):
	assert may_move(status, status)
	assert not may_move(status, "Running")


def test_check_user_answers_yes_with_the_name_the_machine_holds():
	found, said = check_answer([("105", "ANIL K")], "105")
	assert found
	assert "ANIL K" in said


def test_check_user_answers_no_for_a_number_no_machine_holds():
	found, said = check_answer([("106", "SOMEBODY")], "105")
	assert not found
	assert said.startswith("No.")


def test_adding_a_number_the_machine_already_has_writes_nothing():
	# That number may carry somebody's fingerprints, and rewriting the user is
	# how a finger stops working.
	step, said = add_answer([("105", "ANIL K")], "105", "Anil Kumar")
	assert step == "already"
	assert "Nothing was written" in said


def test_adding_a_new_number_says_the_finger_is_still_missing():
	step, said = add_answer([("106", "X")], "105", "Anil K")
	assert step == "add"
	assert "finger" in said
