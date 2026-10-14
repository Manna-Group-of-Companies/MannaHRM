"""The seven-level hierarchy, and which level a job on the site is.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import hierarchy as h  # noqa: E402


def test_the_seven_levels_run_from_executive_director_down_to_trainee():
	assert h.LEVELS == ("Executive Director", "Vice President", "Head", "Manager", "Assistant Manager", "In-charge", "Trainee")
	assert [h.rank(x) for x in h.LEVELS] == list(range(7))


def test_every_word_rule_names_a_level_that_exists():
	assert {level for _, level in h.LEVEL_WORDS} <= set(h.LEVELS)


def test_the_designations_on_the_site_land_on_their_rung():
	# As spelled on the live site, 10 October 2026.
	assert h.level_of("Vice President-operations") == "Vice President"
	assert h.level_of("Head, Maintenance") == "Head"
	assert h.level_of("General Manager") == "Head"  # above the managers, HR 10 Oct 2026
	assert h.level_of("Manager-international Sales&mktg") == "Manager"
	assert h.level_of("H.R Manager") == "Manager"
	assert h.level_of("ASST.MANAGER-ACCOUNTS") == "Assistant Manager"
	assert h.level_of("Audit In-charge") == "In-charge"
	assert h.level_of("Operations Incharge") == "In-charge"
	assert h.level_of("Stores In-charge") == "In-charge"


def test_an_assistant_manager_is_not_a_manager():
	assert h.level_of("Assistant Manager - Sales") == "Assistant Manager"
	assert h.level_of("Asst Manager") == "Assistant Manager"


def test_the_floor_has_no_rung_and_is_not_forced_onto_one():
	for job in ("Plant Helper", "Machine Operator", "Driver", "Cook", "Quality/production Supervisor", "", None):
		assert h.level_of(job) is None


def test_a_word_inside_another_word_does_not_count():
	# "HEADER" is not a Head; "MANAGERIAL TRAINEE" is a Trainee by the one whole word it holds.
	assert h.level_of("Header Operator") is None
	assert h.level_of("Managerial Trainee") == "Trainee"


def test_a_name_that_is_not_a_level_sorts_below_every_level():
	assert h.rank("Plant Helper") == len(h.LEVELS)
	assert h.rank("Trainee") < h.rank("Plant Helper")
