"""Merging a letter, and keeping the server's copy honest against the browser's.

`client/src/lib/letter.js` renders the preview and this renders what is stored.
The two have to agree or a letter previewed with a value is issued with
`[[Token]]` in its place — which nobody notices until the person holding the
letter rings up about it. Every rule here is one of the three the module
docstring names as carrying that agreement.
"""

from manna_hr.letters import merge, normalise, tokens_in, value_for

ANAND = {
	"employee_name": "Anand Raghavan",
	"employee_number": "MR001",
	"department": "Production - MR",
	"designation": "Operator",
	"company": "Manna Rubber",
	"gender": "Male",
	"date_of_joining": "2019-04-01",
	"company_email": "",
	"personal_email": "anand@example.invalid",
}


# ------------------------------------------------------------------- the key ---


def test_the_same_field_written_three_ways_is_one_token():
	# 118 distinct tokens across seventeen of their templates, and the same
	# field appears as EmployeeName, employee_name and EMPLOYEE NAME.
	assert normalise("EmployeeName") == normalise("employee_name") == normalise("EMPLOYEE NAME")


def test_dots_slashes_and_dashes_are_stripped_from_the_key_too():
	assert normalise("Employee.Name") == normalise("Employee/Name") == "employeename"


# --------------------------------------------------------------- what it finds ---


def test_a_token_reads_a_field_off_the_employee():
	assert value_for("Employee Name", ANAND) == "Anand Raghavan"


def test_a_department_loses_the_company_abbreviation_frappe_adds():
	# "Production - MR" is Frappe's naming, not something to print on a letter.
	assert value_for("Department", ANAND) == "Production"


def test_an_email_falls_back_to_the_personal_one():
	assert value_for("Email", ANAND) == "anand@example.invalid"


def test_a_title_is_not_guessed_when_the_record_does_not_say():
	# `[[Title]]` on a draft is a question somebody answers. "Mr." on a letter
	# is a mistake nobody catches.
	assert value_for("Title", {"gender": ""}) == ""
	assert value_for("Title", {"gender": "Female"}) == "Ms."


def test_the_callers_own_values_beat_the_employee_record():
	# A letter carries facts the person's record has no field for.
	assert value_for("Reference Number", ANAND, {"referencenumber": "MR/2026/9"}) == "MR/2026/9"


# ------------------------------------------------------------------ the merge ---


def test_a_filled_token_is_replaced_by_its_value():
	html, missing = merge("<p>Dear {Employee Name},</p>", ANAND)
	assert html == "<p>Dear Anand Raghavan,</p>"
	assert missing == []


def test_a_token_nothing_answers_is_shown_rather_than_blanked():
	# A letter with a visible gap is obviously unfinished; one with a blank
	# space looks finished and is not.
	html, missing = merge("<p>PAN {Employee PAN No}</p>", ANAND)
	assert '[[Employee PAN No]]' in html
	assert missing == ["Employee PAN No"]


def test_a_token_screamed_in_capitals_puts_its_value_in_capitals():
	html, _missing = merge("{DESIGNATION}", ANAND)
	assert html == "OPERATOR"


def test_a_token_in_ordinary_case_leaves_the_value_alone():
	html, _missing = merge("{Designation}", ANAND)
	assert html == "Operator"


def test_a_missing_token_is_named_once_however_often_it_appears():
	_html, missing = merge("{Nationality} {Nationality} {Nationality}", ANAND)
	assert missing == ["Nationality"]


def test_the_template_around_the_values_is_left_as_it_was_written():
	# The template is the site's own stored markup. Escaping it would print the
	# tags instead of applying them.
	html, _missing = merge("<b>{Employee Name}</b>", ANAND)
	assert html == "<b>Anand Raghavan</b>"


def test_a_value_that_looks_like_markup_cannot_become_markup():
	# The one that matters: a name is somebody's input and reaches a letter that
	# gets printed, mailed and stored.
	html, _missing = merge("{Employee Name}", {"employee_name": '<script>x</script>'})
	assert html == "&lt;script&gt;x&lt;/script&gt;"


def test_an_ampersand_in_a_company_name_survives_as_one_character():
	html, _missing = merge("{CompanyName}", {"company": "Manna Rubber & Tyre"})
	assert html == "Manna Rubber &amp; Tyre"


def test_an_apostrophe_is_left_alone_so_the_preview_and_the_issue_agree():
	# `html.escape` would write `&#x27;` here and lib/letter.js does not, and a
	# letter that differs between preview and issue by an apostrophe is a letter
	# somebody reports.
	html, _missing = merge("{Employee Name}", {"employee_name": "O'Brien"})
	assert html == "O'Brien"


def test_an_empty_template_merges_to_nothing_rather_than_failing():
	# A Letter Type with no body is a real state — several of their seventeen
	# have not been transcribed.
	assert merge("", ANAND) == ("", [])
	assert merge(None, ANAND) == ("", [])


# ------------------------------------------------------------- what it matches ---


def test_tokens_are_listed_in_the_order_they_first_appear():
	assert tokens_in("{Bee} {Ay} {Bee} {Cee}") == ["Bee", "Ay", "Cee"]


def test_a_single_character_between_braces_is_not_a_token():
	# The lower bound of the 2..40 grammar, matched to lib/letter.js. `{x}` in a
	# pasted stylesheet is not somebody asking for a value.
	assert tokens_in("{x} {Ay}") == ["Ay"]


def test_an_empty_brace_pair_is_not_a_token():
	# Otherwise stray CSS in a pasted template becomes a token nobody can fill.
	assert tokens_in("{} {xy}") == ["xy"]


def test_a_brace_left_open_does_not_swallow_the_rest_of_the_letter():
	# The 40-character bound. Without it one typo turns a paragraph into a
	# token name and deletes the paragraph.
	long = "{" + "x" * 60 + "}"
	assert tokens_in(long) == []


def test_a_css_rule_in_the_template_is_not_mistaken_for_a_token():
	assert tokens_in("<style>p{margin:0}</style>{Employee Name}") == ["Employee Name"]
