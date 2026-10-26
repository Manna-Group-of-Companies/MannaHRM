"""ADMS on the site: what a machine's post is read as, and what it is told."""

from manna_hr import adms



def test_a_push_punch_line_has_no_attlog_word_in_front():
	punches = adms.parse_attlog("104\t2026-10-19 09:30:00\t0\t1\t0\n")
	assert punches == [{"device_user": "104", "punched_at": "2026-10-19 09:30:00", "status": "0"}]


def test_one_bad_line_does_not_cost_the_rest_of_the_post():
	body = "104\t2026-10-19 09:30:00\t0\nrubbish\n\n105\tnot a time\t0\n106\t2026-10-19 09:31:00\t1\r\n"
	assert [p["device_user"] for p in adms.parse_attlog(body)] == ["104", "106"]


def test_a_minute_without_seconds_is_the_same_punch_as_with():
	short = adms.parse_attlog("104\t2026-10-19 09:30\t0")[0]["punched_at"]
	assert short == "2026-10-19 09:30:00"
	assert adms.punch_key("SN1", "104", short) == adms.punch_key("SN1", "104", "2026-10-19 09:30:00")


def test_a_repeated_punch_has_the_same_name_so_it_collides():
	assert adms.punch_key("CQZ7", "104", "2026-10-19 09:30:00") == "CQZ7-104-20261019093000"


def test_the_same_pin_at_the_same_second_on_two_machines_is_two_punches():
	assert adms.punch_key("A", "104", "2026-10-19 09:30:00") != adms.punch_key("B", "104", "2026-10-19 09:30:00")


def test_an_unregistered_machine_can_never_pass_as_a_trusted_one():
	assert not adms.unknown_device_id("CQZ7").startswith("BIO-")


def test_a_user_line_keeps_pin_name_and_admin_and_drops_the_password_and_card():
	body = "USER PIN=104\tName=Rahul Kumar\tPri=14\tPasswd=1234\tCard=998877\tGrp=1\n"
	assert adms.parse_users(body) == [{"device_user": "104", "name": "Rahul Kumar", "admin": True}]


def test_operations_and_fingerprint_lines_are_not_users():
	body = "OPLOG 4\t0\t2026-10-19 09:30:00\t0\nFP PIN=104\tFID=0\tTMP=abc\nUSER PIN=105\tName=A\tPri=0\n"
	assert [u["device_user"] for u in adms.parse_users(body)] == ["105"]


def test_years_of_history_on_a_first_push_are_not_stored():
	assert not adms.worth_storing("2023-01-01 08:00:00", "2026-09-09 00:00:00")
	assert adms.worth_storing("2026-09-09 00:00:00", "2026-09-09 00:00:00")


def test_the_handshake_never_asks_for_biometrics_or_photos():
	block = adms.option_block("CQZ7", "0")
	assert "TransFlag=1101100000" in block
	assert block.startswith("GET OPTION FROM: CQZ7\n")
	assert "Realtime=1" in block


def test_a_bodys_bad_bytes_do_not_lose_the_punches_around_them():
	raw = "104\t2026-10-19 09:30:00\t0\n".encode() + b"USER PIN=1\tName=\xb2\xe2\n"
	assert adms.parse_attlog(adms.decode(raw))[0]["device_user"] == "104"


def test_a_placeholder_employee_says_it_needs_details():
	doc = adms.employee_doc("563", "RAHUL KUMAR", "Manna Rubber", "2026-10-19 09:30:00", "Other")
	assert doc["custom_needs_details"] == 1
	assert doc["date_of_birth"] == adms.PLACEHOLDER_BIRTH
	assert doc["date_of_joining"] == "2026-10-19"
	assert (doc["first_name"], doc["last_name"]) == ("RAHUL", "KUMAR")
	assert doc["attendance_device_id"] == "563"


def test_a_pin_with_no_name_on_the_machine_is_still_named_by_its_number():
	assert adms.split_name("", "563") == ("Device user", "563")


def test_nobody_carrying_the_pin_allows_a_placeholder():
	assert adms.choose_employee([], "Manna Rubber") == (None, None)


def test_the_one_active_holder_of_a_pin_is_paid():
	rows = [{"name": "HR-EMP-1", "status": "Left", "company": "A"}, {"name": "HR-EMP-2", "status": "Active", "company": "B"}]
	assert adms.choose_employee(rows, "A") == ("HR-EMP-2", None)


def test_the_same_pin_at_two_companies_goes_to_the_machines_own():
	rows = [{"name": "HR-EMP-1", "status": "Active", "company": "A"}, {"name": "HR-EMP-2", "status": "Active", "company": "B"}]
	assert adms.choose_employee(rows, "B") == ("HR-EMP-2", None)


def test_two_active_holders_that_cannot_be_told_apart_wait_rather_than_pay_either():
	rows = [{"name": "HR-EMP-1", "status": "Active", "company": "A"}, {"name": "HR-EMP-2", "status": "Active", "company": "A"}]
	employee, reason = adms.choose_employee(rows, "A")
	assert employee is None and "HR-EMP-1" in reason


def test_a_pin_held_only_by_somebody_who_left_waits_and_makes_no_placeholder():
	employee, reason = adms.choose_employee([{"name": "HR-EMP-9", "status": "Left", "company": "A"}], "A")
	assert employee is None and "Left" in reason
