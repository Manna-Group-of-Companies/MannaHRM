"""Reading a machine must never leave it unable to take a punch."""

from datetime import datetime

from mannabridge import device as device_module


class Record:
	def __init__(self, user_id, stamp, punch):
		self.user_id = user_id
		self.timestamp = datetime.fromisoformat(stamp)
		self.punch = punch


class Connection:
	def __init__(self, calls, records):
		self.calls = calls
		self.records = records

	def disable_device(self):
		self.calls.append("disable")

	def enable_device(self):
		self.calls.append("enable")

	def get_attendance(self):
		self.calls.append("read")
		return self.records

	def disconnect(self):
		self.calls.append("disconnect")

	def clear_attendance(self):
		self.calls.append("CLEAR")


def machine(monkeypatch, records):
	calls = []

	class FakeZK:
		def __init__(self, *a, **k):
			pass

		def connect(self):
			return Connection(calls, records)

	monkeypatch.setattr(device_module, "ZK", FakeZK)
	# As this gate is configured: it reports direction, and its shifts pair
	# strictly on log type, so IN and OUT must survive the read.
	return device_module.Device("BIO-MRP-GATE1", "192.168.1.40", report_direction=True), calls


def test_reading_the_machine_never_disables_it(monkeypatch):
	# 11 Sep 2026: a bridge killed between disable and enable left the gate
	# refusing every finger for two hours, across a shift change.
	dev, calls = machine(monkeypatch, [Record(516, "2026-09-11 15:00:37", 1)])
	dev.read()
	assert "disable" not in calls
	assert calls == ["read", "disconnect"]


def test_reading_the_machine_never_clears_it(monkeypatch):
	dev, calls = machine(monkeypatch, [])
	dev.read()
	assert "CLEAR" not in calls


def test_only_punches_after_the_cursor_come_back_in_order(monkeypatch):
	dev, _ = machine(monkeypatch, [
		Record(2, "2026-09-14 08:29:39", 0),
		Record(1, "2026-09-14 05:45:46", 0),
		Record(3, "2026-09-14 08:30:10", 1),
	])
	got = dev.read(since="2026-09-14 05:45:46")
	assert [p["punched_at"] for p in got] == ["2026-09-14 08:29:39", "2026-09-14 08:30:10"]
	assert [p["log_type"] for p in got] == ["IN", "OUT"]


def test_a_machine_that_drops_mid_read_is_still_disconnected(monkeypatch):
	calls = []

	class Dropping(Connection):
		def get_attendance(self):
			raise ConnectionError("machine went away")

	class FakeZK:
		def __init__(self, *a, **k):
			pass

		def connect(self):
			return Dropping(calls, [])

	monkeypatch.setattr(device_module, "ZK", FakeZK)
	dev = device_module.Device("BIO-MRP-GATE1", "192.168.1.40")
	try:
		dev.read()
	except ConnectionError:
		pass
	assert calls == ["disconnect"]
