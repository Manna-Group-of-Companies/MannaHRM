"""What the delivery loop does with a punch nobody is linked to yet."""

from mannabridge.main import MAX_ATTEMPTS, drain
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
