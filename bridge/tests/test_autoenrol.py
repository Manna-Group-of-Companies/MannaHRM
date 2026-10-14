"""An Employee made for somebody who punches and is on no record (3 Oct 2026)."""

from mannabridge.autoenrol import (
	NEEDS_DETAILS, NO_NAME, PLACEHOLDER_BIRTH, AutoEnrol, SiteError, employee_doc, pick_gender, split_name,
)
from mannabridge.config import Config
from mannabridge.main import drain
from mannabridge.queue import PunchQueue
from mannabridge.sink import UnmappedEmployee


# ---------------------------------------------------------------- pure ---


def test_a_machine_name_is_split_into_first_and_last():
	assert split_name("SANTHOSH M K", "12") == ("SANTHOSH", "M K")
	assert split_name("Bipul", "20") == ("Bipul", "")


def test_somebody_the_machine_has_no_name_for_is_named_by_their_number():
	assert split_name("", "563") == (NO_NAME, "563")
	assert split_name("   ", "563") == (NO_NAME, "563")


def test_the_placeholder_gender_is_whichever_the_site_has_first_choice_first():
	assert pick_gender(["Male", "Female", "Other", "Prefer not to say"]) == "Prefer not to say"
	assert pick_gender(["Male", "Female", "Other"]) == "Other"
	assert pick_gender(["Male", "Female"]) is None


def test_the_record_joins_on_the_first_punch_and_is_marked_needs_details():
	doc = employee_doc("860", "AJIT BORAH", "Manna Rubber Products", "2026-10-02 08:26:18", "Prefer not to say")
	assert doc == {
		"first_name": "AJIT",
		"last_name": "BORAH",
		"gender": "Prefer not to say",
		"date_of_birth": PLACEHOLDER_BIRTH,
		"date_of_joining": "2026-10-02",
		"company": "Manna Rubber Products",
		"status": "Active",
		"attendance_device_id": "860",
		NEEDS_DETAILS: 1,
	}


# ---------------------------------------------------------------- site ---


class FakeSite:
	"""Employees by number, and what was created."""

	def __init__(self, held=None, genders=("Male", "Female", "Prefer not to say"), refuse=None):
		self.held = dict(held or {})
		self._genders = list(genders)
		self.refuse = refuse
		self.created = []

	def employees_with_number(self, device_user):
		return self.held.get(device_user, [])

	def genders(self):
		return self._genders

	def create_employee(self, doc):
		if self.refuse:
			raise SiteError(self.refuse)
		self.created.append(doc)
		self.held[doc["attendance_device_id"]] = [{"name": "HR-EMP-09001", "status": "Active"}]
		return {"name": "HR-EMP-09001", "employee_name": doc["first_name"]}


GATE = "BIO-MRP-GATE1"


def test_a_machine_with_a_company_makes_the_record():
	site = FakeSite()
	enrol = AutoEnrol(site, {GATE: "Manna Rubber Products"}, name_of=lambda d, u: "LIJO K A")
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is True
	assert site.created[0]["first_name"] == "LIJO"
	assert site.created[0]["company"] == "Manna Rubber Products"


def test_a_machine_with_no_company_makes_nothing():
	site = FakeSite()
	enrol = AutoEnrol(site, {GATE: ""})
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is False
	assert site.created == []


def test_somebody_with_a_record_who_is_not_active_is_left_to_hr():
	site = FakeSite(held={"50": [{"name": "HR-EMP-00050", "status": "Left"}]})
	enrol = AutoEnrol(site, {GATE: "Manna Rubber Products"})
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is False
	assert site.created == []


def test_somebody_linked_meanwhile_is_sent_without_a_second_record():
	site = FakeSite(held={"50": [{"name": "HR-EMP-00050", "status": "Active"}]})
	enrol = AutoEnrol(site, {GATE: "Manna Rubber Products"})
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is True
	assert site.created == []


def test_a_site_without_a_placeholder_gender_makes_nothing_rather_than_guessing():
	site = FakeSite(genders=("Male", "Female"))
	enrol = AutoEnrol(site, {GATE: "Manna Rubber Products"})
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is False
	assert site.created == []


def test_a_refusal_is_asked_once_a_pass_not_once_a_punch():
	site = FakeSite(refuse="Could not find Company: Manna Rubber Product")
	enrol = AutoEnrol(site, {GATE: "Manna Rubber Product"})
	calls = []
	site.employees_with_number = lambda u: calls.append(u) or []
	assert enrol.ensure("50", GATE, "2026-10-02 08:00:00") is False
	assert enrol.ensure("50", GATE, "2026-10-02 17:00:00") is False
	assert len(calls) == 1
	enrol.start_pass()
	enrol.ensure("50", GATE, "2026-10-03 08:00:00")
	assert len(calls) == 2


# ------------------------------------------------------- the delivery loop ---


class Site:
	"""hrms's endpoint: refuses a number until an Employee carries it."""

	def __init__(self, held):
		self.held = held
		self.got = []

	def send(self, device_user, punched_at, device_id, log_type=None):
		people = self.held.get(device_user, [])
		if not people:
			raise UnmappedEmployee(f"device user {device_user} on {device_id} matches no Employee.attendance_device_id", missing=True)
		if not any(p["status"] == "Active" for p in people):
			raise UnmappedEmployee(f"device user {device_user} on {device_id} is linked to an Employee who is not Active", missing=False)
		self.got.append((device_user, punched_at))
		return {}


def test_an_unknown_persons_punches_are_sent_on_the_pass_that_makes_their_record(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer(GATE, "50", "2026-10-02 08:00:00", None)
	queue.offer(GATE, "50", "2026-10-02 08:00:45", None)
	employees = FakeSite()
	hrms = Site(employees.held)
	enrol = AutoEnrol(employees, {GATE: "Manna Rubber Products"})
	assert drain(queue, hrms, enrol=enrol) == (2, 0)
	assert hrms.got == [("50", "2026-10-02 08:00:00"), ("50", "2026-10-02 08:00:45")]
	assert len(employees.created) == 1
	assert employees.created[0]["date_of_joining"] == "2026-10-02"


def test_a_punch_from_somebody_not_active_still_waits_and_makes_no_record(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer(GATE, "51", "2026-10-02 08:00:00", None)
	employees = FakeSite(held={"51": [{"name": "HR-EMP-00051", "status": "Inactive"}]})
	enrol = AutoEnrol(employees, {GATE: "Manna Rubber Products"})
	assert drain(queue, Site(employees.held), enrol=enrol) == (0, 1)
	assert employees.created == []


def test_a_record_that_cannot_be_made_costs_its_punch_a_wait_not_the_pass(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer(GATE, "52", "2026-10-02 08:00:00", None)
	queue.offer(GATE, "53", "2026-10-02 08:01:00", None)
	employees = FakeSite(held={"53": [{"name": "HR-EMP-00053", "status": "Active"}]}, refuse="Insufficient Permission for Employee")
	enrol = AutoEnrol(employees, {GATE: "Manna Rubber Products"})
	hrms = Site(employees.held)
	assert drain(queue, hrms, enrol=enrol) == (1, 1)
	assert hrms.got == [("53", "2026-10-02 08:01:00")]
	assert queue.pending()[0]["attempts"] == 0


def test_without_auto_enrol_nothing_changes(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer(GATE, "54", "2026-10-02 08:00:00", None)
	assert drain(queue, Site({})) == (0, 1)


def test_a_company_in_config_never_reaches_the_machine_reader():
	# `Device(**d)` refuses a key it has not got; a company on a machine block
	# must not stop that machine being read.
	cfg = Config.__new__(Config)
	cfg.devices = [{"name": GATE, "host": "10.0.0.5", "serial": "", "port": 4370, "company": "Manna Rubber Products"}]
	assert "company" not in Config.pollable.fget(cfg)[0]


def test_a_timezone_in_config_never_reaches_the_machine_reader():
	# It is what a pushing machine is told at its hello; `Device(**d)` would
	# refuse it and stop the same machine being read.
	cfg = Config.__new__(Config)
	cfg.devices = [{"name": GATE, "host": "10.0.0.5", "serial": "", "port": 4370, "timezone": "330"}]
	assert "timezone" not in Config.pollable.fget(cfg)[0]
