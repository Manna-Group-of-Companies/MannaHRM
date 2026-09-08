"""When a survey accepts an answer, and which answers it insists on."""

from manna_hr import rules


def test_a_closed_survey_is_closed_whatever_its_dates_say():
	assert not rules.survey_is_open("Closed", "2026-09-08", "2026-09-01", "2026-09-30")


def test_a_draft_survey_takes_no_answers():
	assert not rules.survey_is_open("Draft", "2026-09-08")


def test_an_open_survey_with_no_dates_is_open():
	assert rules.survey_is_open("Open", "2026-09-08")


def test_the_dates_narrow_open_and_never_widen_closed():
	assert not rules.survey_is_open("Open", "2026-08-31", "2026-09-01", "2026-09-30")
	assert not rules.survey_is_open("Open", "2026-10-01", "2026-09-01", "2026-09-30")
	assert rules.survey_is_open("Open", "2026-09-15", "2026-09-01", "2026-09-30")


def test_a_required_question_with_no_answer_is_named():
	questions = [{"question_no": 1, "is_required": 1}, {"question_no": 2, "is_required": 1}]
	answers = [{"question_no": 1, "answer": "yes"}]
	assert rules.survey_answer_problems(questions, answers) == [2]


def test_a_rating_of_zero_counts_as_answered():
	# It is the lowest score, not a blank, and treating falsiness as absence
	# would refuse every honest worst answer on the form.
	questions = [{"question_no": 1, "is_required": 1}]
	answers = [{"question_no": 1, "rating": 0}]
	assert rules.survey_answer_problems(questions, answers) == []


def test_an_optional_question_left_blank_is_fine():
	questions = [{"question_no": 1, "is_required": 0}]
	assert rules.survey_answer_problems(questions, []) == []


def test_whitespace_is_not_an_answer():
	questions = [{"question_no": 1, "is_required": 1}]
	assert rules.survey_answer_problems(questions, [{"question_no": 1, "answer": "   "}]) == [1]
