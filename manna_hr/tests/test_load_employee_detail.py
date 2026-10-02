"""tools/load_employee_detail.py: the parts that decide what lands on whose record.

The site half needs credentials; these are the parts that can be argued about
without one — which column a heading means, which values are real, which
employee a code is, and that nothing already on the site is overwritten.

Every identifier here is made up. The Aadhaar numbers are built to pass the
check digit and belong to nobody.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))

import load_employee_detail as ld  # noqa: E402

GOOD_AADHAAR = "234567890124"


# ------------------------------------------------------------ the checks ---

def test_an_aadhaar_is_kept_only_when_its_check_digit_holds():
	assert ld.aadhaar(GOOD_AADHAAR) == GOOD_AADHAAR
	assert ld.aadhaar("2345 6789 0124") == GOOD_AADHAAR
	assert ld.aadhaar("234567890125") is None


def test_a_phone_number_in_the_aadhaar_column_is_refused():
	assert ld.aadhaar("9876543210") is None
	assert ld.aadhaar("019876543210") is None


def test_factor_hrs_pan_placeholder_is_skipped_not_loaded():
	values, refused = ld.person(*_row(**{"Pan No": "PANNOTAVBL"}))
	assert "custom_pan_no" not in values
	assert refused == []


def test_a_pan_ifsc_uan_and_esic_must_have_their_shape():
	assert ld.pan("abcde1234f") == "ABCDE1234F"
	assert ld.pan("NEPAL") is None
	assert ld.ifsc("UBIN0533793") == "UBIN0533793"
	assert ld.ifsc("SBIN0070") is None
	assert ld.uan("1012 3456 7890") == "101234567890"
	assert ld.esic("47012345678") is None


def test_the_ten_ones_placeholder_is_not_a_mobile_number():
	assert ld.mobile("1111111111") is None
	assert ld.mobile("+91 98470 12345") == "9847012345"


def test_a_1900_date_is_factor_hrs_blank_and_is_skipped():
	assert ld.iso(datetime(1900, 1, 2)) is ld.EMPTY
	assert ld.iso("02-Jan-1900") is ld.EMPTY
	assert ld.iso(datetime(1966, 12, 4)) == "1966-12-04"
	assert ld.iso("30-Sep-2013") == "2013-09-30"


def test_unmarried_is_single_and_unknown_is_nothing():
	assert ld.marital("Unmarried") == "Single"
	assert ld.marital("Married") == "Married"
	assert ld.marital("Unknown") is ld.EMPTY


def test_a_zero_probation_is_not_set_rather_than_refused():
	values, refused = ld.person(*_row(**{"Probation Period In Days": 0}))
	assert "custom_probation_period_days" not in values
	assert refused == []


# ---------------------------------------------------------- the columns ---

HEADERS = ["S#", "Emp Code", "Full Name", "Joining Date", "Pan No", "Probation Period In Days",
           "Permanent Same As Local Address",
           "Address", "City",                       # Local Address
           "Address", "State", "Pincode",           # Permanent Address, merge covers only the first
           "Bank Name", "Account No", "IFSC Code",  # Bank Detail
           "PF Eligibility", "Joining Date", "UA No",  # PF Detail
           "Aadhaar No"]
SPANS = [(7, 8, "Local Address"), (9, 9, "Permanent Address"), (12, 14, "Bank Detail"),
         (15, 17, "PF Detail"), (18, 18, "Aadhaar Card Number Details")]


def _row(**by_heading):
	cols = ld.column_map(HEADERS, SPANS)
	row = [None] * len(HEADERS)
	row[0], row[1], row[2] = 1, "HPT-001", "CHARLEYS JOSEPH"
	for (section, heading), i in cols.items():
		key = heading if section == "" else section + ":" + heading
		if key in by_heading:
			row[i] = by_heading[key]
	return row, cols


def test_a_heading_repeated_in_another_section_is_read_from_its_own():
	cols = ld.column_map(HEADERS, SPANS)
	assert cols[("", "Joining Date")] == 3
	assert cols[("PF Detail", "Joining Date")] == 16


def test_the_permanent_address_runs_past_its_short_merge():
	cols = ld.column_map(HEADERS, SPANS)
	assert cols[("Permanent Address", "Pincode")] == 11
	assert ("", "Pincode") not in cols


def test_a_row_reads_bank_uan_and_aadhaar_from_their_sections():
	values, refused = ld.person(*_row(**{
		"Bank Detail:Account No": "337902010041542", "Bank Detail:IFSC Code": "UBIN0533793",
		"PF Detail:UA No": "101234567890", "Aadhaar Card Number Details:Aadhaar No": GOOD_AADHAAR}))
	assert values["bank_ac_no"] == "337902010041542"
	assert values["custom_ifsc"] == "UBIN0533793"
	assert values["custom_uan"] == "101234567890"
	assert values["custom_aadhaar_number"] == GOOD_AADHAAR
	assert refused == []


def test_permanent_same_as_local_copies_the_local_address():
	values, _ = ld.person(*_row(**{"Local Address:Address": "Kakkassery House", "Local Address:City": "Ernakulam",
	                               "Permanent Same As Local Address": "YES"}))
	assert values["current_address"] == "Kakkassery House, Ernakulam"
	assert values["permanent_address"] == values["current_address"]


# ---------------------------------------------------------- the matching ---

def test_a_code_with_a_bracketed_suffix_matches_however_the_site_spells_it():
	assert "HPT-099 (BMS)" in ld.code_candidates("HPT-099(BMS)")
	assert "HPT-099" in ld.code_candidates("HPT-099(BMS)")


def test_a_code_nobody_holds_or_two_people_hold_is_refused_not_guessed():
	people = [{"code": "HPT-001", "name": "CHARLEYS JOSEPH"}, {"code": "HPT-002", "name": "SIJU KRISHNAN"},
	          {"code": "HPT-003", "name": "SHANTU POULOSE"}]
	site = [{"name": "HR-EMP-1", "employee_number": "HPT-001", "employee_name": "Charleys Joseph"},
	        {"name": "HR-EMP-2", "employee_number": "HPT-002", "employee_name": "Siju Krishnan"},
	        {"name": "HR-EMP-3", "employee_number": "HPT-002", "employee_name": "Siju Krishnan"}]
	found, refused = ld.match(people, site)
	assert found["HPT-001"]["name"] == "HR-EMP-1"
	assert refused["HPT-002"] == "2 employees hold this code"
	assert refused["HPT-003"] == "not on the site"


def test_a_code_on_somebody_else_by_name_is_refused():
	found, refused = ld.match([{"code": "HPT-001", "name": "CHARLEYS JOSEPH"}],
	                          [{"name": "HR-EMP-9", "employee_number": "HPT-001", "employee_name": "Mary Thomas"}])
	assert found == {}
	assert "shares no word" in refused["HPT-001"]


def test_the_reporting_manager_is_read_off_the_code_before_the_dash():
	by_code = {"HPT-072": {"name": "HR-EMP-72"}}
	assert ld.manager_of("HPT-072 - AJITH S", by_code) == "HR-EMP-72"
	assert ld.manager_of("MT-001 - RAJIV C S", by_code) is None


# ------------------------------------------------------------- the plan ---

def test_a_field_is_written_only_where_the_site_has_nothing():
	fills, conflicts, same = ld.plan(
		{"custom_uan": "101234567890", "bank_name": "FEDERAL BANK", "custom_nationality": "Indian"},
		{"custom_uan": "", "bank_name": "Union Bank of India", "custom_nationality": "indian"},
		{"custom_uan", "bank_name", "custom_nationality"})
	assert fills == {"custom_uan": "101234567890"}
	assert conflicts == [("bank_name", "FEDERAL BANK", "Union Bank of India")]
	assert same == ["custom_nationality"]


def test_a_field_the_site_has_not_got_is_never_sent():
	fills, conflicts, _ = ld.plan({"custom_ifsc": "UBIN0533793"}, {}, {"bank_ac_no"})
	assert fills == {} and conflicts == []


def test_the_device_id_is_compared_and_never_in_the_written_list():
	assert "attendance_device_id" not in [f for f, *_ in ld.FIELDS]
	assert "attendance_device_id" in [f for f, *_ in ld.COMPARE]


# ------------------------------------------------------- the holding back ---

def test_a_leaving_date_is_held_back_from_somebody_the_site_calls_active():
	keep, held = ld.hold_back({"relieving_date": "2024-11-23", "custom_uan": "101234567890"},
	                          {"name": "HR-EMP-2", "status": "Active"}, {}, {"Mr"})
	assert keep == {"custom_uan": "101234567890"}
	assert held == [("relieving_date", "left in Factor HR, Active on the site")]


def test_a_leaving_date_goes_to_somebody_the_site_calls_left_or_inactive():
	for status in ("Left", "Inactive"):
		keep, held = ld.hold_back({"relieving_date": "2024-11-23"}, {"name": "HR-EMP-2", "status": status}, {}, set())
		assert keep == {"relieving_date": "2024-11-23"} and held == []


def test_nobody_still_working_is_pointed_at_a_manager_who_has_left():
	by_name = {"HR-EMP-6": {"name": "HR-EMP-6", "status": "Left"}}
	keep, held = ld.hold_back({"reports_to": "HR-EMP-6"}, {"name": "HR-EMP-7", "status": "Active"}, by_name, set())
	assert keep == {} and held == [("reports_to", "the manager has left")]
	keep, _ = ld.hold_back({"reports_to": "HR-EMP-6"}, {"name": "HR-EMP-8", "status": "Left"}, by_name, set())
	assert keep == {"reports_to": "HR-EMP-6"}


def test_a_salutation_the_site_has_not_got_is_held_back_so_it_cannot_sink_the_save():
	keep, held = ld.hold_back({"salutation": "Miss", "bank_name": "FEDERAL BANK"},
	                          {"name": "HR-EMP-1", "status": "Active"}, {}, {"Mr", "Mrs"})
	assert keep == {"bank_name": "FEDERAL BANK"}
	assert held == [("salutation", "not a Salutation on the site")]
