"""The office absence rule: the month's first absence is Casual Leave.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import absencerule as ar  # noqa: E402

OCT = lambda d: date(2026, 10, d)  # noqa: E731


def test_the_first_absence_of_the_month_becomes_casual_leave():
	assert ar.plan([OCT(5), OCT(12)], []) == ([], OCT(5))


def test_a_second_absence_stays_absent_once_the_month_has_its_leave():
	assert ar.plan([OCT(12)], [("LA-1", OCT(5))]) == ([], None)


def test_a_month_with_no_absence_gives_no_leave():
	assert ar.plan([], []) == ([], None)


def test_a_regularized_day_gives_its_leave_back_and_the_next_absence_takes_it():
	assert ar.plan([OCT(12), OCT(20)], [("LA-1", OCT(5))], regularized=[OCT(5)]) == (["LA-1"], OCT(12))


def test_a_regularized_day_with_no_later_absence_just_gives_the_leave_back():
	assert ar.plan([], [("LA-1", OCT(5))], regularized=[OCT(5)]) == (["LA-1"], None)


def test_a_day_already_regularized_never_takes_the_leave():
	assert ar.plan([OCT(5), OCT(12)], [], regularized=[OCT(5)]) == ([], OCT(12))


def test_a_day_under_leave_somebody_asked_for_is_not_the_first_absence():
	assert ar.plan([OCT(5), OCT(12)], [], covered=[OCT(5)]) == ([], OCT(12))


def test_the_month_keeps_the_day_it_gave_even_if_an_earlier_one_turns_absent():
	# Moving it would be two writes and the same pay: one day leave, one cut.
	assert ar.plan([OCT(3)], [("LA-1", OCT(12))]) == ([], None)


def test_a_second_automatic_leave_in_one_month_is_undone():
	assert ar.plan([], [("LA-2", OCT(12)), ("LA-1", OCT(5))]) == (["LA-2"], None)


def test_days_given_as_text_are_read_the_same_as_dates():
	assert ar.plan(["2026-10-05"], [], regularized=["2026-10-05 09:00:00"]) == ([], None)


def test_everybody_who_earns_casual_leave_is_covered_and_the_factory_floor_is_not():
	assert ar.applies_to("ACCOUNTANT")
	assert ar.applies_to("  purchase   manager ")
	assert ar.applies_to("SHIFT SUPERVISOR")
	assert ar.applies_to("Quality/production Supervisor")
	assert ar.applies_to("DRIVER")
	assert not ar.applies_to("WELDER")
	assert not ar.applies_to("")


def test_only_applications_carrying_the_mark_are_the_rules_to_cancel():
	assert ar.is_auto(ar.DESCRIPTION)
	assert not ar.is_auto("Sick, " + ar.AUTO_MARK)
	assert not ar.is_auto("Going home for Onam")
	assert not ar.is_auto(None)


def test_the_application_is_one_approved_day_of_casual_leave_carrying_the_mark():
	doc = ar.application("HR-EMP-1", OCT(5), "Manna Rubber", today=OCT(6))
	assert doc["leave_type"] == "Casual Leave"
	assert doc["from_date"] == doc["to_date"] == "2026-10-05"
	assert doc["status"] == "Approved"
	assert doc["half_day"] == 0
	assert doc["posting_date"] == "2026-10-06"
	assert doc["company"] == "Manna Rubber"
	assert ar.is_auto(doc["description"])


def test_a_run_looks_at_this_month_and_last_but_never_before_the_rule_began():
	assert ar.months_to_check(date(2026, 10, 3)) == [(date(2026, 9, 1), date(2026, 9, 30)), (OCT(1), OCT(3))]
	assert ar.months_to_check(date(2026, 11, 2)) == [(OCT(1), date(2026, 10, 31)), (date(2026, 11, 1), date(2026, 11, 2))]
	assert ar.months_to_check(date(2026, 9, 15)) == [(date(2026, 9, 1), date(2026, 9, 15))]
	assert ar.months_to_check(date(2026, 8, 31)) == []


def test_september_is_covered_because_hr_asked_on_6_october_and_august_is_not():
	assert ar.EFFECTIVE_FROM == date(2026, 9, 1)


def test_a_run_in_january_reaches_back_into_december():
	assert ar.months_to_check(date(2027, 1, 1))[0] == (date(2026, 12, 1), date(2026, 12, 31))


def test_the_correction_prefix_is_the_one_regularization_writes():
	src = open(os.path.join(os.path.dirname(__file__), "..", "regularization.py"), encoding="utf-8").read()
	assert 'device = "{0}{{0}}".format(frappe.session.user)'.format(ar.REG_PREFIX) in src


def test_the_application_names_an_approver_because_the_site_requires_one():
	doc = ar.application("HR-EMP-1", OCT(5), approver="hr@mannarubber.com")
	assert doc["leave_approver"] == "hr@mannarubber.com"


def test_the_approver_is_the_persons_own_then_their_managers_then_whoever_runs_the_rule():
	assert ar.approver_for("own@m", "mgr@m", "hr@m") == "own@m"
	assert ar.approver_for(None, "mgr@m", "hr@m") == "mgr@m"
	assert ar.approver_for("", None, "hr@m") == "hr@m"
	assert ar.approver_for(None, None, None) is None


def test_a_day_hrms_refuses_for_its_own_reason_passes_the_leave_to_the_next_absence():
	assert ar.plan([OCT(20), OCT(27)], [], excluded=[OCT(20)]) == ([], OCT(27))


def test_the_site_runs_sunday_leave_then_the_absence_rule_in_one_job():
	src = open(os.path.join(os.path.dirname(__file__), "..", "hooks.py"), encoding="utf-8").read()
	assert '"manna_hr.leaverules_site.run"' in src
	assert '"manna_hr.absencerule_site.run"' not in src
	assert '"manna_hr.sundayleave_site.run"' not in src
	body = open(os.path.join(os.path.dirname(__file__), "..", "leaverules_site.py"), encoding="utf-8").read()
	assert body.index("sundayleave_site.run()") < body.index("absencerule_site.run()")


def test_the_automatic_leave_rules_are_switched_off_as_hr_asked():
	assert ar.AUTO_LEAVE_RULES is False


def _body(module, func):
	"""One function's source, without importing a module that needs frappe."""
	src = open(os.path.join(os.path.dirname(__file__), "..", module), encoding="utf-8").read()
	start = src.index("def {0}(".format(func))
	end = src.find("\ndef ", start + 1)
	return src[start:end if end > 0 else len(src)]


def test_every_way_the_leave_rules_start_stops_first_while_they_are_switched_off():
	# The guard has to come before the first thing the function does, so a
	# switched-off rule reads nothing and writes nothing.
	for module, func, first in [
		("leaverules_site.py", "run", "sundayleave_site.run()"),
		("absencerule_site.py", "run", "today = getdate"),
		("absencerule_site.py", "next_absence", "day = getdate"),
		("sundayleave_site.py", "run", "today = getdate"),
	]:
		body = _body(module, func)
		assert "AUTO_LEAVE_RULES" in body, (module, func)
		assert body.index("AUTO_LEAVE_RULES") < body.index(first), (module, func)


def test_a_corrected_day_still_gives_back_the_leave_the_rule_made_for_it_before():
	# Switching the rules off must not leave an old automatic leave standing
	# over a corrected day — hrms would build that day On Leave regardless.
	assert "AUTO_LEAVE_RULES" not in _body("absencerule_site.py", "after_regularization")


def test_the_freeze_judges_a_cancel_by_the_status_as_stored():
	src = open(os.path.join(os.path.dirname(__file__), "..", "freeze.py"), encoding="utf-8").read()
	assert 'if method == "before_cancel":' in src
	assert 'frappe.db.get_value(doc.doctype, doc.name, "status")' in src
