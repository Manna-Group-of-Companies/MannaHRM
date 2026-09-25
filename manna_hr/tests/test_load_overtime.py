"""tools/load_overtime.py: the parts that decide whose wages a number lands on.

The site half needs credentials; these are the parts that can be argued about
without one — reading the report, checking it against itself, and matching a
code to a person.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))

import load_overtime as lo  # noqa: E402

# Two employees, one row wrapping its duration and one its code, a page footer
# between them. The shape pypdf gives the real report.
SAMPLE = """S#
Emp
Code
Emp Name
1
HRI-033
FRANSIS
CHORATH
12-Sep-26
08:24 AM
06:45 AM
10 Hrs 20
Mins
Manna
Rubber
Products
Pvt.Ltd-
Production12
hrshift1
(08:30-20:30)
10.33
Approved
MRP-004 - SAJI
KUMAR K M
15-09-2026 16:07:53
10.33
Report Time:
25-09-2026 14:17
User:
Page:
/
1
45
admin
Over Time Report
Date From: 01-Sep-2026 - Date Till: 30-Sep-2026
HI-TECH RUBBER INDUSTRIES
2
MRP-251
(BMS)
VIMAL BENG
06-Sep-26
08:25 AM
05:02 PM
8 Hrs
Manna
Rubber
Products
8.00
Approved
MRP-004 - SAJI
KUMAR K M
07-09-2026 14:19:10
8.00
"""


def test_a_wrapped_duration_and_a_wrapped_code_both_survive_extraction():
	rows, subtotals = lo.parse_report_text(SAMPLE)
	assert [r["code"] for r in rows] == ["HRI-033", "MRP-251 (BMS)"]
	assert rows[0]["duration"] == "10 Hrs 20 Mins"
	assert rows[0]["name"] == "FRANSIS CHORATH"
	assert subtotals == [("HRI-033", 10.33), ("MRP-251 (BMS)", 8.0)]
	assert lo.check_rows(rows, subtotals) == []


def test_stored_hours_are_the_duration_not_the_rounded_column():
	assert lo.duration_hours("10 Hrs 20 Mins") == 10.333333
	assert lo.duration_hours("59 Mins") == 0.983333
	assert lo.duration_hours("1 Hr") == 1.0
	assert lo.duration_hours("1 Hrs 48 Mins") == 1.8


def test_a_day_the_site_rounded_to_two_places_counts_as_already_loaded():
	assert lo.same_hours(10.33, lo.duration_hours("10 Hrs 20 Mins"))
	assert not lo.same_hours(10.0, lo.duration_hours("10 Hrs 20 Mins"))


def test_a_subtotal_that_disagrees_with_its_rows_stops_the_load():
	rows, subtotals = lo.parse_report_text(SAMPLE)
	assert lo.check_rows(rows, [("HRI-033", 11.33), subtotals[1]])


def test_a_missing_serial_number_stops_the_load():
	rows, subtotals = lo.parse_report_text(SAMPLE)
	rows[1]["sno"] = 3
	assert any("serial" in p for p in lo.check_rows(rows, subtotals))


def test_an_unapproved_row_is_not_loaded():
	rows, subtotals = lo.parse_report_text(SAMPLE)
	rows[0]["status"] = "Pending"
	assert any("only approved" in p for p in lo.check_rows(rows, subtotals))


def test_an_unrecognised_line_is_an_error_rather_than_a_dropped_row():
	try:
		lo.parse_report_text(SAMPLE.replace("10.33\nReport Time", "garbage\nReport Time"))
	except ValueError:
		return
	raise AssertionError("parsed a report with a line it could not place")


def _rows(*pairs):
	return [{"code": c, "name": n} for c, n in pairs]


def test_a_code_is_matched_on_employee_number():
	found, refused = lo.match(_rows(("HRI-003", "SIJU N P")), [
		{"name": "HR-EMP-00001", "employee_name": "Siju N P", "employee_number": "HRI-003"}])
	assert found["HRI-003"]["name"] == "HR-EMP-00001" and not refused


def test_a_suffixed_code_falls_back_to_the_bare_code():
	found, _ = lo.match(_rows(("MRP-251 (BMS)", "VIMAL BENG")), [
		{"name": "HR-EMP-00251", "employee_name": "Vimal Beng", "employee_number": "MRP-251"}])
	assert found["MRP-251 (BMS)"]["name"] == "HR-EMP-00251"


def test_a_code_two_employees_hold_is_refused_not_guessed():
	found, refused = lo.match(_rows(("HRI-003", "SIJU N P")), [
		{"name": "HR-EMP-00001", "employee_name": "Siju N P", "employee_number": "HRI-003"},
		{"name": "HR-EMP-00002", "employee_name": "Siju N P", "employee_number": "HRI-003"}])
	assert not found and "2 employees" in refused["HRI-003"]


def test_a_code_on_somebody_else_entirely_is_refused():
	found, refused = lo.match(_rows(("HRI-003", "SIJU N P")), [
		{"name": "HR-EMP-00009", "employee_name": "Thampi M S", "employee_number": "HRI-003"}])
	assert not found and "HRI-003" in refused


def test_an_unknown_code_is_refused():
	found, refused = lo.match(_rows(("MRP-999", "NOBODY")), [])
	assert not found and "no employee" in refused["MRP-999"]


def test_names_agree_ignores_case_and_punctuation():
	assert lo.names_agree("SOUJATH P.I", "Soujath P I")
	assert not lo.names_agree("SIJU N P", "Thampi M S")
