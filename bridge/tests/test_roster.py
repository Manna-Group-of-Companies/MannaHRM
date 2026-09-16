"""Who is enrolled on a machine, and when they appeared.

No machine and no site: both are stood in for, because the rules here are about
what a user list read at one moment means next to the one read before it.
"""

from mannabridge.roster import (
	EnrolmentStore,
	NotOnSite,
	Unavailable,
	docname,
	employee_by_device_user,
	looks_like_a_failed_read,
	reconcile,
	sync_enrolments,
)

T1 = "2026-09-15 08:00:00"
T2 = "2026-09-15 08:05:00"
T3 = "2026-09-15 08:10:00"


def user(uid, name="", admin=False):
	return {"device_user": uid, "name": name, "admin": admin}


def test_people_already_on_a_machine_at_its_first_read_have_no_enrolment_time():
	# The machine keeps no enrolment date. Stamping the install day on 443
	# people would be a date that is simply wrong for every one of them.
	rows = reconcile({}, [user("101", "PRASEETHA IK"), user("102")], T1)
	assert rows["101"]["enrolled_at"] is None and rows["101"]["first_seen"] == T1


def test_somebody_who_appears_between_two_reads_was_enrolled_at_the_second():
	rows = reconcile(reconcile({}, [user("101")], T1), [user("101"), user("845", "Ebin Joy")], T2)
	assert rows["845"]["enrolled_at"] == T2
	assert rows["101"]["enrolled_at"] is None


def test_somebody_removed_from_the_machine_keeps_their_row_marked_removed():
	# Their past punches still name that user id.
	rows = reconcile(reconcile({}, [user("101"), user("102")], T1), [user("101")], T2)
	assert rows["102"]["on_device"] == 0 and rows["102"]["removed_at"] == T2
	assert rows["101"]["on_device"] == 1


def test_somebody_enrolled_again_after_removal_gets_the_new_enrolment_time():
	rows = reconcile({}, [user("101"), user("102")], T1)
	rows = reconcile(rows, [user("101")], T2)
	rows = reconcile(rows, [user("101"), user("102")], T3)
	assert rows["102"]["on_device"] == 1 and rows["102"]["enrolled_at"] == T3 and rows["102"]["removed_at"] is None


def test_an_empty_user_list_from_a_machine_that_had_people_is_a_failed_read():
	known = reconcile({}, [user("101")], T1)
	assert looks_like_a_failed_read(known, [])
	assert not looks_like_a_failed_read({}, [])


def test_one_active_employee_owns_a_machine_number_and_two_own_nobody():
	employees = [
		{"name": "HR-EMP-1", "attendance_device_id": "101", "status": "Active"},
		{"name": "HR-EMP-2", "attendance_device_id": "101", "status": "Left"},
		{"name": "HR-EMP-3", "attendance_device_id": "102", "status": "Left"},
		{"name": "HR-EMP-4", "attendance_device_id": "103", "status": "Active"},
		{"name": "HR-EMP-5", "attendance_device_id": " 103 ", "status": "Active"},
	]
	assert employee_by_device_user(employees) == {"101": "HR-EMP-1", "102": "HR-EMP-3"}


def test_the_row_name_is_the_doctypes_own_autoname():
	assert docname("BIO-MRP-GATE1", "845") == "BIO-MRP-GATE1-845"


class Machine:
	def __init__(self, name, users):
		self.name = name
		self.list = users

	def users(self):
		if isinstance(self.list, Exception):
			raise self.list
		return self.list


class Site:
	def __init__(self, employees=(), registered=None, missing=False, refuse=()):
		self._employees = list(employees)
		self._registered = registered or {}
		self.missing = missing
		self.refuse = set(refuse)
		self.writes = []

	def employees(self):
		return self._employees

	def registered(self):
		return self._registered

	def write(self, name, body, exists):
		if self.missing:
			raise NotOnSite()
		if name in self.refuse:
			raise Unavailable("HTTP 417")
		self.writes.append((name, body, exists))


def test_only_what_changed_is_sent_again(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	machine = Machine("BIO-MRP-GATE1", [user("101", "A"), user("102", "B")])
	site = Site()

	assert sync_enrolments([machine], store, site, now=T1) == (2, 0)
	assert sync_enrolments([machine], store, site, now=T2) == (0, 0)

	machine.list = [user("101", "A"), user("102", "B"), user("845", "C")]
	sync_enrolments([machine], store, site, now=T3)
	assert [w[0] for w in site.writes] == ["BIO-MRP-GATE1-101", "BIO-MRP-GATE1-102", "BIO-MRP-GATE1-845"]
	assert site.writes[-1][1]["enrolled_at"] == T3 and site.writes[-1][2] is False


def test_linking_the_employee_on_the_site_updates_the_row_on_the_next_pass(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	machine = Machine("BIO-MRP-GATE1", [user("845")])
	site = Site()
	sync_enrolments([machine], store, site, now=T1)
	assert site.writes[0][1]["employee"] is None

	site._employees = [{"name": "HR-EMP-42", "attendance_device_id": "845", "status": "Active"}]
	sync_enrolments([machine], store, site, now=T2)
	assert site.writes[-1] == ("BIO-MRP-GATE1-845", site.writes[-1][1], True)
	assert site.writes[-1][1]["employee"] == "HR-EMP-42"


def test_a_new_enrolment_is_sent_before_the_backlog_of_a_first_read(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	machine = Machine("BIO-MRP-GATE1", [user(str(n)) for n in range(1, 6)])
	site = Site()
	sync_enrolments([machine], store, site, now=T1, limit=0)

	machine.list = machine.list + [user("999")]
	assert sync_enrolments([machine], store, site, now=T2, limit=1) == (1, 5)
	assert site.writes[0][0] == "BIO-MRP-GATE1-999"


def test_a_site_without_the_doctype_keeps_everything_waiting_on_this_pc(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	machine = Machine("BIO-MRP-GATE1", [user("101")])
	assert sync_enrolments([machine], store, Site(missing=True), now=T1) == (0, None)

	site = Site()
	assert sync_enrolments([machine], store, site, now=T2) == (1, 0)
	assert site.writes[0][1]["first_seen"] == T1


def test_a_machine_that_will_not_list_its_users_does_not_stop_the_others(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	site = Site()
	machines = [Machine("BIO-DEAD", OSError("timed out")), Machine("BIO-LIVE", [user("7")])]
	assert sync_enrolments(machines, store, site, now=T1) == (1, 0)


def test_one_refused_row_does_not_hold_back_the_rest(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	machine = Machine("BIO-MRP-GATE1", [user("1"), user("2"), user("3")])
	site = Site(refuse={"BIO-MRP-GATE1-1"})
	assert sync_enrolments([machine], store, site, now=T1) == (2, 1)


def test_the_machine_is_filed_under_its_attendance_device_when_registered(tmp_path):
	store = EnrolmentStore(str(tmp_path / "q.sqlite3"))
	site = Site(registered={"BIO-MRP-GATE1": "MRP Gate 1"})
	sync_enrolments([Machine("BIO-MRP-GATE1", [user("1")])], store, site, now=T1)
	assert site.writes[0][1]["attendance_device"] == "MRP Gate 1"


def test_a_site_that_answers_500_for_a_doctype_it_has_not_got_counts_as_not_on_site():
	# What mannarubber.m.frappe.cloud actually answered on 15 Sep 2026.
	import pytest
	from mannabridge.roster import EnrolmentSite

	class Answer:
		def __init__(self, status, text):
			self.status_code = status
			self.text = text

	site = EnrolmentSite("https://site.example", "k", "s")
	site._session.post = lambda *a, **k: Answer(
		500, '{"exception":"Error: No module named \'frappe.core.doctype.attendance_device_user\'"}'
	)
	with pytest.raises(NotOnSite):
		site.write("BIO-MRP-GATE1-1", {}, exists=False)
