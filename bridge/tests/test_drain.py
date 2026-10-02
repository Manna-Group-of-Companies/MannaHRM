"""What the delivery loop does with a punch nobody is linked to yet."""

from mannabridge.main import MAX_ATTEMPTS, drain, run_once
from mannabridge.queue import PunchQueue
from mannabridge.sink import UnmappedEmployee


class Site:
	def __init__(self):
		self.linked = set()
		self.got = []

	def send(self, device_user, punched_at, device_id, log_type=None):
		if device_user not in self.linked:
			raise UnmappedEmployee(f"device user {device_user} on {device_id} matches no Employee.attendance_device_id")
		self.got.append((device_user, punched_at))
		return {}


def test_linking_the_employee_releases_punches_however_long_they_waited(tmp_path):
	# 14 Sep 2026: 19 punches from five people had been counted out after
	# twenty passes, and linking them would have released nothing.
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "860", "2026-09-12 08:26:18", "IN")
	site = Site()
	for _ in range(MAX_ATTEMPTS + 5):
		assert drain(queue, site) == (0, 1)
	site.linked.add("860")
	assert drain(queue, site) == (1, 0)
	assert site.got == [("860", "2026-09-12 08:26:18")]


def test_a_punch_an_older_bridge_had_already_retired_is_released_too(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "563", "2026-09-12 08:25:06", "IN")
	row = queue.pending()[0]
	for _ in range(MAX_ATTEMPTS):
		queue.mark_failed(row["id"], "device user 563 on BIO-MRP-GATE1 matches no Employee.attendance_device_id")
	site = Site()
	site.linked.add("563")
	assert drain(queue, site) == (1, 0)


def test_waiting_on_an_employee_costs_no_attempt(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "857", "2026-09-12 20:31:09", "OUT")
	drain(queue, Site())
	assert queue.pending()[0]["attempts"] == 0


class Shifted:
	"""A site that hands back the checkin it made, with the shift hrms matched."""

	def __init__(self, shifts, already=()):
		self.shifts = shifts
		self.already = set(already)
		self.marked = []

	def send(self, device_user, punched_at, device_id, log_type=None):
		if (device_user, punched_at) in self.already:
			return {}
		return {"name": "EMP-CKIN-" + punched_at, "shift": self.shifts.get(device_user)}

	def mark_synced(self, base_url, reached):
		self.marked.append(dict(reached))
		return len(reached)


def test_the_loop_keeps_the_newest_punch_delivered_on_each_shift(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "845", "2026-09-16 08:24:27", "IN")
	queue.offer("BIO-MRP-GATE1", "845", "2026-09-16 17:30:50", "OUT")
	queue.offer("BIO-MRP-GATE1", "901", "2026-09-16 20:02:11", "OUT")
	queue.offer("BIO-MRP-GATE1", "777", "2026-09-16 21:00:00", "IN")   # no shift on the site
	reached = {}
	site = Shifted({"845": "Office", "901": "Production12", "777": None})
	assert drain(queue, site, reached=reached) == (4, 0)
	assert reached == {"Office": "2026-09-16 17:30:50", "Production12": "2026-09-16 20:02:11"}


def test_a_punch_the_site_already_held_says_nothing_about_its_shift(tmp_path):
	# A duplicate proves the punch is there, not when this bridge's view of the
	# shift ends — somebody else delivered it, and may have been ahead.
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "845", "2026-09-16 17:30:50", "OUT")
	reached = {}
	assert drain(queue, Shifted({"845": "Office"}, already={("845", "2026-09-16 17:30:50")}), reached=reached) == (1, 0)
	assert reached == {}


class Machine:
	def __init__(self, name, punches=(), dead=False):
		self.name = name
		self.punches = list(punches)
		self.dead = dead

	def read(self, since=None):
		if self.dead:
			raise TimeoutError("timed out")
		return [p for p in self.punches if not since or p["punched_at"] > since]


def punch(user, at, kind):
	return {"device_user": user, "punched_at": at, "log_type": kind}


def test_a_pass_moves_the_marker_only_for_what_it_delivered(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	site = Shifted({"845": "Office"})
	gate = Machine("BIO-MRP-GATE1", [punch("845", "2026-09-16 08:24:27", "IN")])
	run_once([gate], queue, site, retain_days=90, erp_url="https://site.example", fix_clocks=False)
	assert site.marked == [{"Office": "2026-09-16 08:24:27"}]


def test_a_machine_that_could_not_be_read_holds_every_shift_back(tmp_path):
	# Its unread punches belong to shifts nobody can name yet. Closing one now
	# is the 16 September failure again, from inside a single bridge.
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	site = Shifted({"845": "Office"})
	pushed = Machine("BIO-MRP-GATE2", [punch("845", "2026-09-16 19:00:00", "OUT")])
	dead = Machine("BIO-MRP-GATE1", dead=True)
	run_once([pushed, dead], queue, site, retain_days=90, erp_url="https://site.example", fix_clocks=False)
	assert site.marked == []
	assert queue.pending() == []   # the punch itself was still delivered


def test_resend_moves_every_readable_cursor_back_to_the_day_before(tmp_path):
	# Manna Tyre Retreads' bridge started on 16 Sep 2026; the 1st to the 15th
	# were still only on the machines. Moving back is this flag's whole job.
	from mannabridge.main import rewind_cursors
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.set_last_seen("BIO-6426150300692", "2026-09-30 19:17:04")
	gates = [Machine("BIO-6426150300692"), Machine("BIO-6426150300688")]
	assert rewind_cursors(gates, queue, "2026-09-01") == ["BIO-6426150300692", "BIO-6426150300688"]
	assert queue.last_seen("BIO-6426150300692") == "2026-08-31 23:59:59"
	assert queue.last_seen("BIO-6426150300688") == "2026-08-31 23:59:59"


def test_a_re_read_sends_only_the_days_the_site_has_not_got(tmp_path):
	from mannabridge.main import rewind_cursors
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	gate = Machine("BIO-6426150300692", [
		punch("845", "2026-09-05 08:30:00", "IN"),
		punch("845", "2026-09-20 08:31:00", "IN"),
	])
	site = Shifted({})
	queue.set_last_seen(gate.name, "2026-09-15 23:59:59")
	run_once([gate], queue, site, retain_days=3650, erp_url="https://site.example", fix_clocks=False)
	sent = []
	site.send = lambda device_user, punched_at, device_id, log_type=None: sent.append(punched_at) or {}
	rewind_cursors([gate], queue, "2026-09-01")
	run_once([gate], queue, site, retain_days=3650, erp_url="https://site.example", fix_clocks=False)
	assert sent == ["2026-09-05 08:30:00"]   # the 20th was already sent, and is not sent twice
