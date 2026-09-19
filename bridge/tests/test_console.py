"""The gate PC's console: what each screen answers, without a machine or a site.

The console is a thin thing on purpose — every rule it applies belongs to
`employee_tools` or `machine`, and these tests are here to prove it calls them
rather than reimplementing them. The two that matter: **it never writes over a
number somebody already has**, and **the site is written before the machine**,
so a record the site refuses leaves the gate untouched.
"""

import json
from datetime import datetime
from types import SimpleNamespace

import pytest

import console
import employee_tools as ET
import machine as M
from tests.test_machine_tools import DEVICE, FakeConn, finger, user

CONFIG = SimpleNamespace(
	erp_url="https://site.example", api_key="k", api_secret="s",
	devices=[dict(DEVICE), {"name": "BIO-PUSH", "host": "", "port": 4370, "password": 0, "timeout": 5,
	                        "force_udp": False, "serial": "CGK1"}],
)

PEOPLE = [
	{"name": "HR-EMP-00489", "employee_name": "FARISAMOL VS", "attendance_device_id": "860",
	 "status": "Active", "company": "MRPPL", "branch": ""},
]


@pytest.fixture
def machine_and_site(monkeypatch):
	# Both have a finger: without one every row would be flagged "cannot punch",
	# which is true of a real machine and would hide what these tests are about.
	state = {
		"conn": FakeConn(
			[user(1, 860, "Farisamol V S"), user(2, 912, "Chandan Kumar")],
			[finger(1), finger(2)],
		),
		"inserted": [],
	}
	monkeypatch.setattr(console.M, "connect", lambda device: state["conn"])
	monkeypatch.setattr(state["conn"], "disconnect", lambda: None, raising=False)
	monkeypatch.setattr(ET, "everybody_with_a_number", lambda config: PEOPLE)
	monkeypatch.setattr(ET, "site_insert", lambda config, doctype, doc: state["inserted"].append(doc) or {"name": "HR-EMP-00600"})
	monkeypatch.setattr(ET, "site_list", lambda config, doctype, fields, filters: [] if doctype != "Company" else [{"name": "MRPPL"}])
	return state


def new_person(**kw):
	base = {
		"device": "BIO-TEST-GATE", "user_id": "9001", "first_name": "Anil", "last_name": "K",
		"gender": "Male", "date_of_birth": "12-04-1994", "date_of_joining": "01-10-2026",
		"company": "MRPPL", "shift": "General", "employee_number": "",
	}
	base.update(kw)
	return base


# --- what the screens show --------------------------------------------------


def test_the_machine_list_says_a_push_only_machine_cannot_be_read(machine_and_site):
	answer = console.machines(CONFIG, {})
	push = [m for m in answer["machines"] if m["name"] == "BIO-PUSH"][0]
	assert push["reads"] is False
	assert "no address" in push["why"]


def test_the_people_screen_flags_a_number_no_employee_holds(machine_and_site):
	answer = console.people(CONFIG, {"device": ["BIO-TEST-GATE"]})
	rows = {r["user_id"]: r for r in answer["rows"]}
	assert rows["860"]["problem"] == ""
	assert rows["912"]["problem"].startswith("NOT IN ERPNEXT")
	assert answer["counts"]["problems"] == 1


def test_the_free_number_is_above_everything_the_gate_has_issued(machine_and_site):
	assert console.free_number(CONFIG, {"device": ["BIO-TEST-GATE"]})["number"] == "9001"


# --- writing ----------------------------------------------------------------


def test_adding_a_number_the_machine_already_has_writes_nothing(machine_and_site):
	answer = console.add_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "912", "name": "Somebody"})
	assert answer["ok"] is False
	assert machine_and_site["conn"].writes == []


def test_adding_a_free_number_writes_it_and_reads_it_back(machine_and_site):
	answer = console.add_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "9001", "name": "Anil K"})
	assert answer["ok"] is True
	assert machine_and_site["conn"].writes[0][1]["user_id"] == "9001"


def test_creating_somebody_writes_the_site_first_then_the_machine(machine_and_site):
	answer = console.create_employee(CONFIG, new_person())
	assert answer["ok"] is True
	assert machine_and_site["inserted"][0]["attendance_device_id"] == "9001"
	assert machine_and_site["conn"].writes[0][1]["user_id"] == "9001"


def test_a_number_another_employee_holds_is_refused_and_nothing_is_created(machine_and_site):
	# employee_tools says why by raising; the HTTP layer turns that sentence into
	# the answer on screen (see `Console._answer`), so the words reach the person
	# who typed the number either way.
	with pytest.raises(SystemExit, match="already belongs to"):
		console.create_employee(CONFIG, new_person(user_id="860"))
	assert machine_and_site["inserted"] == [] and machine_and_site["conn"].writes == []


def test_a_number_the_machine_calls_somebody_else_is_refused_before_the_site_is_written(machine_and_site):
	# 912 is Chandan Kumar on the machine and nobody on the site — exactly the
	# trap that cost three tries on 18 September 2026.
	answer = console.create_employee(CONFIG, new_person(user_id="912"))
	assert answer["ok"] is False
	assert "Chandan Kumar" in answer["why"]
	assert machine_and_site["inserted"] == []


def test_a_date_that_is_not_a_date_stops_it_before_anything_is_written(machine_and_site):
	with pytest.raises(SystemExit):
		console.create_employee(CONFIG, new_person(date_of_joining="next monday"))
	assert machine_and_site["inserted"] == [] and machine_and_site["conn"].writes == []


def test_the_contact_details_reach_the_fields_this_site_actually_has(machine_and_site):
	# Checked against the live doctype on 19 September 2026: cell_number,
	# personal_email and current_address exist; Aadhaar does not, and a key the
	# doctype has not got is accepted and dropped without a word.
	console.create_employee(CONFIG, new_person(mobile="9876543210", email="a@b.c", address="Gate 2 quarters"))
	doc = machine_and_site["inserted"][0]
	assert doc["cell_number"] == "9876543210"
	assert doc["personal_email"] == "a@b.c"
	assert doc["current_address"] == "Gate 2 quarters"


def test_contact_details_nobody_typed_are_left_out_rather_than_sent_blank(machine_and_site):
	# A blank sent as a value is this form asserting an answer it was never given.
	console.create_employee(CONFIG, new_person())
	doc = machine_and_site["inserted"][0]
	assert "cell_number" not in doc and "current_address" not in doc


def test_creating_without_a_shift_says_no_attendance_will_be_generated(machine_and_site):
	answer = console.create_employee(CONFIG, new_person(shift=""))
	assert answer["ok"] is True
	assert "no Attendance will be generated" in answer["warn"]


# --- linking a number to somebody already on the site -----------------------


@pytest.fixture
def linking(machine_and_site, monkeypatch):
	"""The site, with one employee who has a number and one who has none."""
	people = {
		"HR-EMP-00489": {"name": "HR-EMP-00489", "employee_name": "FARISAMOL VS", "attendance_device_id": "860", "status": "Active"},
		"HR-EMP-00387": {"name": "HR-EMP-00387", "employee_name": "PABAN GOGOI", "attendance_device_id": "", "status": "Active"},
	}
	written = []
	monkeypatch.setattr(ET, "site_list", lambda config, doctype, fields, filters=None: (
		[people[filters[0][2]]] if doctype == "Employee" and filters and filters[0][0] == "name" and filters[0][2] in people else []
	))
	monkeypatch.setattr(ET, "site_update", lambda config, doctype, name, patch: written.append((name, patch)) or {})
	machine_and_site["written"] = written
	return machine_and_site


def test_linking_writes_the_number_onto_the_employee(linking):
	answer = console.link(CONFIG, {"employee": "HR-EMP-00387", "user_id": "912", "name_on_device": "PABAN GOGOI"})
	assert answer["ok"] is True
	assert linking["written"] == [("HR-EMP-00387", {"attendance_device_id": "912"})]


def test_a_number_another_employee_already_holds_is_refused(linking):
	with pytest.raises(SystemExit, match="already belongs to"):
		console.link(CONFIG, {"employee": "HR-EMP-00387", "user_id": "860"})
	assert linking["written"] == []


def test_a_machine_name_that_is_plainly_somebody_else_is_refused_until_a_person_says_so(linking):
	# 912 is Chandan Kumar on the machine; PABAN GOGOI is the record. A wrong
	# link pays one person for another's attendance and nothing says so.
	with pytest.raises(SystemExit, match="Chandan Kumar"):
		console.link(CONFIG, {"employee": "HR-EMP-00387", "user_id": "912", "name_on_device": "Chandan Kumar"})
	assert linking["written"] == []


def test_a_person_can_say_they_are_the_same_and_it_is_written(linking):
	answer = console.link(CONFIG, {
		"employee": "HR-EMP-00387", "user_id": "912", "name_on_device": "Chandan Kumar", "force": True,
	})
	assert answer["ok"] is True and linking["written"][0][0] == "HR-EMP-00387"


def test_moving_somebody_already_punching_to_a_new_number_needs_saying_so(linking):
	# Their old punches would be left pointing at nobody.
	with pytest.raises(SystemExit, match="already punches as 860"):
		console.link(CONFIG, {"employee": "HR-EMP-00489", "user_id": "9001"})
	assert linking["written"] == []


# --- taking somebody off a machine, and putting them back -------------------


@pytest.fixture
def backups_in_tmp(tmp_path, monkeypatch):
	monkeypatch.setattr(console.M, "BACKUP_DIR", str(tmp_path / "machine-backups"))
	return tmp_path / "machine-backups"


def test_asking_to_delete_says_who_it_is_and_writes_nothing(machine_and_site, backups_in_tmp):
	answer = console.delete_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "912"})
	assert answer["ok"] is False and answer["confirm"] == "912"
	assert "Chandan Kumar" in answer["why"]
	assert machine_and_site["conn"].writes == []
	assert not backups_in_tmp.exists()


def test_a_wrong_confirmation_deletes_nothing(machine_and_site, backups_in_tmp):
	# The number has to be typed back, because a button that deletes on one
	# click is a button somebody deletes with by accident.
	answer = console.delete_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "912", "confirm": "910"})
	assert answer["ok"] is False
	assert machine_and_site["conn"].writes == []


def test_deleting_takes_a_backup_before_it_removes_anybody(machine_and_site, backups_in_tmp):
	answer = console.delete_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "912", "confirm": "912"})
	assert answer["ok"] is True
	assert [w[0] for w in machine_and_site["conn"].writes] == ["delete_user"]
	assert len(list(backups_in_tmp.glob("*.json"))) == 1


def test_a_number_the_machine_has_not_got_is_not_a_delete(machine_and_site, backups_in_tmp):
	answer = console.delete_user(CONFIG, {"device": "BIO-TEST-GATE", "user_id": "9001", "confirm": "9001"})
	assert answer["ok"] is False and "not on" in answer["why"]
	assert machine_and_site["conn"].writes == []


def test_a_restore_preview_writes_nothing(machine_and_site, backups_in_tmp, tmp_path):
	backups_in_tmp.mkdir(parents=True)
	saved = console.M.backup_data(
		DEVICE, "SN1", "10", [user(7, 860, "Farisamol V S"), user(8, 5150, "Somebody Else")],
		[finger(8)], datetime(2026, 9, 19), "test",
	)
	(backups_in_tmp / "b.json").write_text(json.dumps(saved), encoding="utf-8")

	answer = console.restore(CONFIG, {"device": "BIO-TEST-GATE", "file": "b.json"})
	assert answer["dry"] is True
	# 860 is already on the machine and is left out; only the missing one is planned.
	assert [p["user_id"] for p in answer["plan"]] == ["5150"]
	assert machine_and_site["conn"].writes == []


def test_a_restore_writes_the_missing_user_with_their_fingers(machine_and_site, backups_in_tmp):
	backups_in_tmp.mkdir(parents=True)
	saved = console.M.backup_data(
		DEVICE, "SN1", "10", [user(8, 5150, "Somebody Else")], [finger(8)], datetime(2026, 9, 19), "test",
	)
	(backups_in_tmp / "b.json").write_text(json.dumps(saved), encoding="utf-8")

	answer = console.restore(CONFIG, {"device": "BIO-TEST-GATE", "file": "b.json", "apply": True})
	assert answer["ok"] is True
	assert any(w[0] == "save_user_template" for w in machine_and_site["conn"].writes)


def test_a_backup_file_that_is_not_there_is_said_plainly(machine_and_site, backups_in_tmp):
	answer = console.restore(CONFIG, {"device": "BIO-TEST-GATE", "file": "nothing.json"})
	assert answer["ok"] is False and "No backup called" in answer["why"]


# --- a machine at a new gate ------------------------------------------------


@pytest.fixture
def new_gate(tmp_path, monkeypatch):
	"""A config.toml to append to, a queue to seed, and a machine that answers."""
	config_path = tmp_path / "config.toml"
	config_path.write_text(
		'[erp]\nurl = "https://site.example"\napi_key = "k"\napi_secret = "s"\n\n'
		"[bridge]\nqueue_path = \"punches.sqlite3\"\n# hand-written, must survive\nfix_clocks = false\n\n"
		'[[device]]\nname = "BIO-TEST-GATE"\nhost = "10.0.0.9"\n',
		encoding="utf-8",
	)
	monkeypatch.setattr(console, "HERE", str(tmp_path))
	monkeypatch.setattr(console, "load_config", lambda path: CONFIG)
	from mannabridge import wizard

	monkeypatch.setattr(wizard, "look_at", lambda host, password=0, port=4370: (
		{"serial": "CGKK999", "model": "K90", "users": 12, "drift_seconds": 3}
		if host == "10.0.0.50" else (_ for _ in ()).throw(OSError("no route"))
	))
	return SimpleNamespace(path=config_path, config=SimpleNamespace(
		devices=CONFIG.devices, queue_path=str(tmp_path / "punches.sqlite3"),
		erp_url=CONFIG.erp_url, api_key="k", api_secret="s"))


def test_a_name_without_the_trusted_prefix_is_refused(new_gate):
	# ERPNext judges a device_id without BIO- to be a phone punch and refuses it
	# on the geofence, so the wrong name is a gate where nobody can clock in.
	answer = console.add_machine(new_gate.config, {"host": "10.0.0.50", "name": "TREADS-GATE1"})
	assert answer["ok"] is False and "BIO-" in answer["why"]
	assert "TREADS-GATE1" not in new_gate.path.read_text(encoding="utf-8")


def test_a_machine_that_does_not_answer_is_not_written_into_the_config(new_gate):
	# A line for a machine that never answers is a bridge logging a failure
	# every five minutes for ever.
	answer = console.add_machine(new_gate.config, {"host": "10.0.0.77", "name": "BIO-NEW-GATE"})
	assert answer["ok"] is False and "did not answer" in answer["why"]
	assert "BIO-NEW-GATE" not in new_gate.path.read_text(encoding="utf-8")


def test_an_address_this_bridge_already_reads_is_refused(new_gate):
	answer = console.add_machine(new_gate.config, {"host": "10.0.0.9", "name": "BIO-AGAIN"})
	assert answer["ok"] is False and "already in this bridge" in answer["why"]


def test_adding_a_machine_appends_to_the_config_and_keeps_what_was_there(new_gate):
	answer = console.add_machine(new_gate.config, {"host": "10.0.0.50", "name": "BIO-NEW-GATE"})
	assert answer["ok"] is True
	written = new_gate.path.read_text(encoding="utf-8")
	assert 'name     = "BIO-NEW-GATE"' in written
	assert 'serial   = "CGKK999"' in written
	# The hand-written setting and the machine that was already there survive.
	assert "fix_clocks = false" in written and "BIO-TEST-GATE" in written
	# Off unless somebody has checked the machine: a guessed direction is worse
	# than none.
	assert "report_direction = false" in written


def test_a_new_machine_starts_from_the_first_of_this_month(new_gate):
	"""Without a cursor the first pass sends the machine's whole memory — three
	years and 79,000 records on the one at Manna Rubber. The cursor is the last
	second of the day before, so the 1st itself is the first day sent."""
	from datetime import date, timedelta

	from mannabridge.queue import PunchQueue

	console.add_machine(new_gate.config, {"host": "10.0.0.50", "name": "BIO-NEW-GATE"})

	last_month_end = date.today().replace(day=1) - timedelta(days=1)
	cursor = PunchQueue(new_gate.config.queue_path).last_seen("BIO-NEW-GATE")
	assert cursor == last_month_end.strftime("%Y-%m-%d") + " 23:59:59"


def test_the_old_config_is_kept_beside_the_new_one(new_gate):
	console.add_machine(new_gate.config, {"host": "10.0.0.50", "name": "BIO-NEW-GATE"})
	assert (new_gate.path.parent / "config.toml.bak").exists()


# --- the door ---------------------------------------------------------------


def test_the_console_serves_nothing_the_tools_cannot_do():
	# Every route is a read screen or one of the six writes. A route that cleared
	# a log or wiped a machine would have to be added here first, and the test
	# below says why there is none.
	assert set(console.POST) == {
		"/api/add-user", "/api/create-employee", "/api/link",
		"/api/backup", "/api/delete-user", "/api/restore", "/api/add-machine",
	}
	assert set(console.GET) == {
		"/api/machines", "/api/people", "/api/punches", "/api/attendance",
		"/api/free-number", "/api/choices", "/api/unlinked", "/api/backups", "/api/find",
	}


def test_the_switch_can_beat_what_windows_is_set_to():
	"""`:root` and an attribute selector have the same specificity, so the later
	block wins. The dark media block is guarded by :not([data-theme="light"]) so
	the switch can ask for light on a dark PC, and the attribute block comes
	after it so it can ask for dark on a light one. This app once shipped
	painted by the palette underneath the one the picker was ticking — see
	CLAUDE.md §3."""
	import os

	with open(os.path.join(console.HERE, "console.html"), encoding="utf-8") as handle:
		page = handle.read()
	assert ':root:not([data-theme="light"])' in page
	assert page.index('@media (prefers-color-scheme: dark)') < page.index(':root[data-theme="dark"]')


def test_no_comment_in_the_page_holds_a_backtick():
	"""One backtick in a comment ends the template literal it sits inside, and the
	page dies with "Unexpected identifier" before a single tab is drawn — which is
	how it failed on 19 September 2026. Nothing on screen says which comment did it."""
	import os
	import re

	with open(os.path.join(console.HERE, "console.html"), encoding="utf-8") as handle:
		page = handle.read()
	for comment in re.findall(r"<!--.*?-->", page, re.S):
		assert "`" not in comment, comment[:90]


def test_the_console_opens_as_its_own_window_when_a_browser_can():
	# A window with no address bar is what stops somebody at a gate PC from
	# typing over the URL, or losing the page among nine tabs.
	# This file exists and "/no/such/edge" does not, so the second candidate wins.
	assert console.app_browser(["/no/such/edge", __file__]) == __file__


def test_a_pc_with_neither_edge_nor_chrome_still_gets_the_page():
	# Falls back to whatever opens a link. The page is the same either way.
	assert console.app_browser(["/no/such/edge", "/no/such/chrome"]) is None


def test_a_second_click_on_the_icon_finds_the_console_already_there():
	"""Double-clicking twice is what people do when the first window takes a
	second. Without this the second start dies on "address already in use"."""
	import socket

	with socket.socket() as held:
		held.bind(("127.0.0.1", 0))
		held.listen(1)
		port = held.getsockname()[1]
		assert console.already_serving(port=port) is True
	# The same port, once nothing is listening on it, is not a running console.
	assert console.already_serving(port=port) is False


# --- the key that guards a console left running --------------------------------


def test_the_key_is_made_once_and_then_read_back(tmp_path):
	path = str(tmp_path / "console-token.txt")
	first = console.read_or_make_token(path)
	assert len(first) > 20
	# Read back, not made again: a new key every start would lock out the
	# window somebody already has open.
	assert console.read_or_make_token(path) == first


def test_the_key_is_taken_from_the_address_a_header_or_the_cookie():
	assert console.token_in({}, {"k": ["abc"]}) == "abc"
	assert console.token_in({"X-Console-Token": "abc"}, {}) == "abc"
	assert console.token_in({}, {}, "mannahr=abc; other=1") == "abc"
	assert console.token_in({}, {}, "") == ""


def test_a_console_started_by_hand_asks_for_no_key():
	# Whoever opened a console window had the rights already; the key is for the
	# one that runs in the background, where nobody had to prove anything.
	assert console.Console.token == ""


def test_it_is_bound_to_this_pc_only():
	assert console.HOST == "127.0.0.1"


def test_no_route_can_clear_the_log_wipe_the_machine_or_switch_it_off():
	# A user can be removed from here — that is a person's enrolment, and it is
	# backed up first and typed twice. The punch log cannot: it is the last copy
	# of punches the bridge has not delivered, and nothing undoes clearing it.
	import os
	import re

	with open(os.path.join(console.HERE, "console.py"), encoding="utf-8") as handle:
		code = handle.read()
	assert re.findall(r"\.(clear_attendance|clear_data|poweroff|restart)\(", code) == []
