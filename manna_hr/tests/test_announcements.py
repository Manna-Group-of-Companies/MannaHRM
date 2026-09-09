"""The notice on everybody's front page.

**This is the only thing in this app that is read by people who did not go
looking for it.** Everything else — a report, a correction, a loan — is opened
by somebody who wanted it. A published announcement appears in front of every
employee who signs in, and cannot be taken back from the ones who have already
read it.

So the errors round the opposite way from the rest of this project. CLAUDE.md §4
says a punch that cannot be judged is recorded and marked, never refused,
because refusing somebody who did turn up costs them a day's pay. Here the
expensive mistake is the notice that goes out, and the cheap one is stopping
somebody mid-typing — so a save is refused where a punch would be kept.
"""

import pytest

from manna_hr.rules import announcement_is_live, announcement_problems, live_announcements

LIVE = {
	"kind": "Announcement",
	"title": "Factory closed on the 14th",
	"body": "<p>Maintenance shutdown.</p>",
	"published": 1,
	"from_date": "2026-09-01",
	"to_date": "2026-09-30",
}


def test_a_draft_is_never_on_the_front_page():
	assert announcement_is_live({**LIVE, "published": 0}, "2026-09-08") is False


def test_a_checkbox_that_arrived_as_the_string_zero_is_still_off():
	# `bool("0")` is True in Python, and a Check read back off a form or out of
	# JSON is a string. Without this the whole draft folder publishes itself.
	assert announcement_is_live({**LIVE, "published": "0"}, "2026-09-08") is False


def test_the_last_day_of_the_window_still_shows_it():
	# Both ends inclusive. Off by one here takes a notice down on the morning of
	# the day it was for, which is the one day it mattered.
	assert announcement_is_live(LIVE, "2026-09-30") is True
	assert announcement_is_live(LIVE, "2026-10-01") is False


def test_the_first_day_of_the_window_shows_it():
	assert announcement_is_live(LIVE, "2026-09-01") is True
	assert announcement_is_live(LIVE, "2026-08-31") is False


def test_a_notice_with_no_window_runs_until_somebody_stops_it():
	# Which is how a front page fills up with a notice about a fire drill in
	# March. The field description says so; nothing here refuses it.
	open_ended = {**LIVE, "from_date": "", "to_date": ""}
	assert announcement_is_live(open_ended, "2030-01-01") is True


def test_a_window_that_ends_before_it_begins_is_refused():
	problems = announcement_problems({**LIVE, "from_date": "2026-09-30", "to_date": "2026-09-01"})
	assert any("never show" in p for p in problems)


def test_publishing_an_empty_body_is_refused():
	# A title on everybody's front page with nothing behind it reads as a system
	# fault rather than as a notice.
	problems = announcement_problems({**LIVE, "body": ""})
	assert any("empty body" in p for p in problems)


def test_a_draft_with_an_empty_body_is_allowed():
	# Saving a half-written notice is the normal way to write one. The refusal
	# is about publishing, not about typing.
	assert announcement_problems({**LIVE, "body": "", "published": 0}) == []


def test_a_notice_needs_a_title():
	problems = announcement_problems({**LIVE, "title": "   "})
	assert any("title" in p for p in problems)


def test_an_unknown_kind_is_refused():
	problems = announcement_problems({**LIVE, "kind": "Newsletter"})
	assert any("not a kind" in p for p in problems)


def test_a_good_notice_has_nothing_wrong_with_it():
	assert announcement_problems(LIVE) == []


def test_ceo_speak_and_announcements_are_one_doctype_told_apart_by_kind():
	rows = [LIVE, {**LIVE, "kind": "CEO Speak", "title": "A word from the top"}]
	assert [r["title"] for r in live_announcements(rows, "2026-09-08", "CEO Speak")] \
		== ["A word from the top"]


def test_the_list_is_ordered_by_when_it_shows_not_when_it_was_written():
	# A notice written in March for a window in September belongs in September's
	# order; creation order would bury it under everything written since.
	rows = [
		{**LIVE, "title": "March", "from_date": "2026-03-01", "to_date": "2026-12-31"},
		{**LIVE, "title": "September", "from_date": "2026-09-01", "to_date": "2026-12-31"},
	]
	assert [r["title"] for r in live_announcements(rows, "2026-09-08")] == ["September", "March"]


def test_a_closed_window_is_left_out_of_the_list_rather_than_greyed():
	rows = [LIVE, {**LIVE, "title": "Old", "from_date": "2026-01-01", "to_date": "2026-01-31"}]
	assert [r["title"] for r in live_announcements(rows, "2026-09-08")] == [LIVE["title"]]


@pytest.mark.parametrize("published", [0, "0", "", None, False])
def test_nothing_unpublished_ever_reaches_the_list(published):
	assert live_announcements([{**LIVE, "published": published}], "2026-09-08") == []
