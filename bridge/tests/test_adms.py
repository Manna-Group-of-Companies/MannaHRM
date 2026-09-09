"""The ADMS server, argued about without a fingerprint machine.

Half of these are the parser, which is pure. The other half stand a real server
on a real socket and talk to it the way a K90+ID does — because the rules that
matter here are about *what the device is told*, and the device only ever sees
a status line and a body.

**The one that earns its place most is
`test_a_post_that_could_not_be_stored_is_refused_so_the_device_keeps_it`.** In
this protocol an answer other than OK means "send those again". A server that
says OK and then fails to write has destroyed the last copy of those punches,
which is exactly what `clear_attendance()` does on the pull side and what this
whole design exists to avoid.
"""

import sqlite3
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from mannabridge import adms
from mannabridge.queue import PunchQueue

# ---------------------------------------------------------------- the parser ---


def test_a_punch_is_a_pin_a_time_and_nothing_else_that_matters():
	rows = adms.parse_attlog("1001\t2026-09-08 09:01:23\t0\t1\t0\t0\t0\n")
	assert rows == [
		{"device_user": "1001", "punched_at": "2026-09-08 09:01:23", "log_type": None, "status": "0"}
	]


def test_several_punches_come_back_in_the_order_they_were_sent():
	body = "1001\t2026-09-08 09:01:23\t0\n1002\t2026-09-08 09:02:00\t0\n"
	assert [r["device_user"] for r in adms.parse_attlog(body)] == ["1001", "1002"]


def test_a_time_with_no_seconds_gets_some():
	# The queue's UNIQUE constraint is on the exact string, so two shapes of the
	# same minute would both insert and the person would be punched in twice.
	rows = adms.parse_attlog("1001\t2026-09-08 09:01\t0\n")
	assert rows[0]["punched_at"] == "2026-09-08 09:01:00"


def test_one_bad_line_does_not_cost_the_good_ones():
	# The answer to the whole post would be an error, the device would send them
	# all again, and the same line would break it again — forever, with the
	# backlog growing behind it.
	body = "1001\t2026-09-08 09:01:23\t0\nrubbish\n1002\t2026-09-08 09:05:00\t0\n"
	assert len(adms.parse_attlog(body)) == 2


def test_windows_line_endings_are_not_a_different_protocol():
	assert len(adms.parse_attlog("1001\t2026-09-08 09:01:23\t0\r\n")) == 1


def test_an_empty_body_is_no_punches_rather_than_an_error():
	assert adms.parse_attlog("") == []
	assert adms.parse_attlog(None) == []


# --------------------------------------------------------------- direction ---


def test_no_direction_is_sent_unless_somebody_has_checked_the_machine():
	"""A ZK device that was never set up for in/out reports 0 on every punch,
	which is the same value as a genuine check-in and reads as a day nobody
	ever left. There is no way to tell the two apart from the data."""
	rows = adms.parse_attlog("1001\t2026-09-08 09:01:23\t0\n")
	assert rows[0]["log_type"] is None


def test_a_machine_that_really_does_report_direction_is_believed():
	assert adms.log_type_for("0", True) == "IN"
	assert adms.log_type_for("1", True) == "OUT"


def test_break_and_overtime_keys_are_not_a_direction():
	# 2 and 3 are break-out and break-in, 4 and 5 overtime. None of them is
	# arriving or leaving.
	for status in ("2", "3", "4", "5"):
		assert adms.log_type_for(status, True) is None


# ----------------------------------------------------------- the handshake ---


def test_the_handshake_names_the_device_back_to_itself():
	# The firmware matches on this line before reading the rest of the block.
	block = adms.option_block("ZK0042", "0")
	assert block.startswith("GET OPTION FROM: ZK0042")


def test_only_attendance_and_the_operations_log_may_be_pushed():
	"""`TransFlag`'s ten positions are attendance, operations, attendance photo,
	new user, changed user, fingerprint, changed fingerprint, user photo, face,
	workcode. A device pushing face templates is sending biometric data to a
	server with nowhere to put it and no business holding it."""
	block = adms.option_block("ZK0042", "0")
	assert "TransFlag=1100000000" in block


def test_the_device_is_told_to_push_all_day():
	assert "TransTimes=00:00;23:59" in adms.option_block("ZK0042", "0")
	assert "Realtime=1" in adms.option_block("ZK0042", "0")


# -------------------------------------------------------- unknown machines ---


def test_an_unknown_serial_parks_under_a_name_that_cannot_pass_any_check():
	# Inventing a device id would be worse than losing the punch: one that
	# happened to start with the trusted prefix would let an unregistered
	# machine skip the geofence, which is the one thing the prefix is for.
	parked = adms.unknown_device_id("ZK0042")
	assert not parked.startswith("BIO-")
	assert adms.serial_of_unknown(parked) == "ZK0042"


def test_a_configured_device_id_is_not_mistaken_for_a_parked_one():
	assert adms.serial_of_unknown("BIO-TREADS-GATE1") is None


# ------------------------------------------------------------- the server ---


@pytest.fixture
def site():
	"""A server on a real port, with one machine configured and one not."""
	tmp = tempfile.TemporaryDirectory()
	queue = PunchQueue(str(Path(tmp.name) / "q.sqlite3"))

	server = adms.AdmsServer(
		("127.0.0.1", 0), adms.AdmsHandler,
		queue=queue,
		devices={"KNOWN01": {"name": "BIO-TREADS-GATE1", "report_direction": False}},
		options={"first_stamp": "0", "block": {"delay": 10, "timezone": "5.5"}},
		wake=threading.Event(),
	)
	thread = threading.Thread(target=server.serve_forever, daemon=True)
	thread.start()
	yield server, queue, "http://127.0.0.1:{0}".format(server.server_port)
	server.shutdown()
	server.server_close()
	tmp.cleanup()


def get(base, path):
	with urllib.request.urlopen(base + path, timeout=5) as r:
		return r.status, r.read().decode()


def post(base, path, body):
	req = urllib.request.Request(
		base + path, data=body.encode(), method="POST",
		headers={"Content-Type": "text/plain"},
	)
	with urllib.request.urlopen(req, timeout=5) as r:
		return r.status, r.read().decode()


def test_a_device_saying_hello_is_told_how_to_behave(site):
	_server, _queue, base = site
	status, body = get(base, "/iclock/cdata?SN=KNOWN01&options=all&pushver=2.4.1")
	assert status == 200
	assert "GET OPTION FROM: KNOWN01" in body
	assert "Delay=10" in body


def test_a_punch_is_stored_and_then_acknowledged(site):
	_server, queue, base = site
	status, body = post(
		base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG&Stamp=99",
		"1001\t2026-09-08 09:01:23\t0\t1\t0\n",
	)
	assert status == 200
	assert body.startswith("OK")

	rows = queue.pending()
	assert len(rows) == 1
	assert rows[0]["device_id"] == "BIO-TREADS-GATE1"
	assert rows[0]["device_user"] == "1001"
	assert rows[0]["punched_at"] == "2026-09-08 09:01:23"


def test_the_same_punch_twice_is_stored_once(site):
	# A device that did not get its OK sends the whole batch again. Duplicates
	# are cheap; a lost punch is somebody's day's pay.
	_server, queue, base = site
	line = "1001\t2026-09-08 09:01:23\t0\n"
	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", line)
	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", line)
	assert len(queue.pending()) == 1


def test_a_punch_from_an_unknown_machine_is_kept_rather_than_dropped(site):
	# Refusing somebody who did turn up is the expensive mistake. The row is
	# parked, undelivered and visible, and `main.drain` lets it out the moment
	# the serial is named in config.toml.
	_server, queue, base = site
	status, _ = post(
		base, "/iclock/cdata?SN=NOBODY9&table=ATTLOG", "1001\t2026-09-08 09:01:23\t0\n"
	)
	assert status == 200
	rows = queue.pending()
	assert len(rows) == 1
	assert rows[0]["device_id"] == "SN:NOBODY9"


def test_a_post_that_could_not_be_stored_is_refused_so_the_device_keeps_it(site):
	"""Not OK means "send those again", and the device does. A server that says
	OK and then fails to write has destroyed the last copy."""
	server, _queue, base = site

	class Broken:
		def offer(self, *a, **k):
			raise sqlite3.OperationalError("disk I/O error")

		def last_seen(self, _key):
			return None

		def set_last_seen(self, *a):
			pass

	server.queue = Broken()
	with pytest.raises(urllib.error.HTTPError) as refused:
		post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", "1001\t2026-09-08 09:01:23\t0\n")
	assert refused.value.code == 500


def test_the_server_never_asks_a_device_to_clear_anything(site):
	"""`CLEAR LOG` is reachable through this endpoint and every worked example
	on the internet reaches for it. The device's memory is the last copy of a
	punch that failed to deliver."""
	_server, _queue, base = site
	status, body = get(base, "/iclock/getrequest?SN=KNOWN01")
	assert status == 200
	assert body.strip() == "OK"


def test_a_table_that_is_not_attendance_is_acknowledged_and_dropped(site):
	# Acknowledged so the device does not treat the server as broken; dropped
	# because none of it is attendance and a photograph is biometric data this
	# box has no business storing.
	_server, queue, base = site
	status, _ = post(base, "/iclock/cdata?SN=KNOWN01&table=OPERLOG", "OPLOG 1\tsomething\n")
	assert status == 200
	assert queue.pending() == []


def test_a_path_the_firmware_does_not_use_is_a_404(site):
	_server, _queue, base = site
	with pytest.raises(urllib.error.HTTPError) as missing:
		get(base, "/not/adms")
	assert missing.value.code == 404


def test_the_push_cursor_survives_a_restart(site):
	# Losing it costs a re-push, which the queue de-duplicates — it is an
	# optimisation, not a correctness mechanism. But it is worth keeping.
	_server, _queue, base = site
	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG&Stamp=12345",
	     "1001\t2026-09-08 09:01:23\t0\n")
	_status, body = get(base, "/iclock/cdata?SN=KNOWN01&options=all")
	assert "Stamp=12345" in body


# ------------------------------------------- letting a parked punch out again ---


def test_a_parked_punch_delivers_once_its_serial_is_named(tmp_path):
	"""The repair path, and the reason nothing had to be re-pushed.

	A punch from a machine nobody had configured is parked under `SN:<serial>`.
	Adding the serial to `config.toml` is the whole fix: the next pass resolves
	the backlog behind it and delivers it under the real device id. Nobody has
	to find the rows, and the device is never asked for them again.
	"""
	from mannabridge.main import drain

	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("SN:NOBODY9", "1001", "2026-09-08 09:01:23", None)

	class Sink:
		def __init__(self):
			self.sent = []

		def send(self, **kw):
			self.sent.append(kw)

	sink = Sink()

	# Before: nothing is attempted at all. Sending it under a name that fails
	# the trusted-prefix test would have the site refuse it on the geofence,
	# which spends an attempt and buries the real reason.
	assert drain(queue, sink, by_serial={}) == (0, 0)
	assert sink.sent == []
	assert len(queue.pending()) == 1

	# After: one line in config.toml.
	assert drain(queue, sink, by_serial={"NOBODY9": "BIO-TREADS-GATE1"}) == (1, 0)
	assert sink.sent[0]["device_id"] == "BIO-TREADS-GATE1"
	assert queue.pending() == []


def test_a_punch_read_off_a_device_is_untouched_by_the_serial_map(tmp_path):
	from mannabridge.main import drain

	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-TREADS-OFFICE", "1002", "2026-09-08 09:02:00", "IN")

	class Sink:
		def __init__(self):
			self.sent = []

		def send(self, **kw):
			self.sent.append(kw)

	sink = Sink()
	assert drain(queue, sink, by_serial={"NOBODY9": "BIO-TREADS-GATE1"}) == (1, 0)
	assert sink.sent[0]["device_id"] == "BIO-TREADS-OFFICE"


# ------------------------------------------------ push that actually is push ---


def test_a_new_punch_wakes_the_delivery_loop(site):
	"""Otherwise a punch arrives in milliseconds and then waits five minutes.

	The loop in `main` waits on this event rather than sleeping, so a pushed
	punch reaches the site in seconds. Without it, push has no advantage over
	reading the machine at all — which is the whole reason to run it.
	"""
	server, _queue, base = site
	assert not server.wake.is_set()

	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", "1001\t2026-09-08 09:01:23\t0\n")
	assert server.wake.is_set()


def test_a_batch_the_device_is_re_sending_does_not_wake_it(site):
	"""A machine that did not get its OK sends the whole batch again. Waking on
	that would be a delivery pass for work already done."""
	server, _queue, base = site
	line = "1001\t2026-09-08 09:01:23\t0\n"

	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", line)
	server.wake.clear()

	post(base, "/iclock/cdata?SN=KNOWN01&table=ATTLOG", line)
	assert not server.wake.is_set()


def test_a_punch_from_an_unknown_machine_still_wakes_it(site):
	# It is new, and the pass is what logs the backlog. The delivery attempt
	# itself is skipped by `drain` until the serial is configured.
	server, _queue, base = site
	post(base, "/iclock/cdata?SN=NOBODY9&table=ATTLOG", "1001\t2026-09-08 09:01:23\t0\n")
	assert server.wake.is_set()


# --------------------------------------------- "is anything actually arriving" ---


def test_the_queue_says_what_arrived_and_what_got_through(tmp_path):
	"""`--status` reads this, and the split is the whole point of it.

	When attendance is missing, the first thing worth knowing is whether the
	punches reached this box at all — because a device that is not talking is a
	different job from a site that is not accepting, and they are called in by
	different people.
	"""
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-GATE1", "1001", "2026-09-08 09:01:23", None)
	queue.offer("BIO-GATE1", "1002", "2026-09-08 09:04:10", None)
	queue.offer("SN:MYSTERY42", "5001", "2026-09-08 09:06:00", None)
	queue.mark_sent(1, "2026-09-08 09:02:00")

	by_device = {r["device_id"]: r for r in queue.stats()}

	assert by_device["BIO-GATE1"]["total"] == 2
	assert by_device["BIO-GATE1"]["unsent"] == 1
	assert by_device["BIO-GATE1"]["newest"] == "2026-09-08 09:04:10"
	# The newest that actually got through, which is not the newest that arrived.
	assert by_device["BIO-GATE1"]["newest_sent"] == "2026-09-08 09:01:23"

	assert by_device["SN:MYSTERY42"]["unsent"] == 1
	assert by_device["SN:MYSTERY42"]["newest_sent"] is None


def test_a_stuck_queue_says_why_and_not_only_how_big(tmp_path):
	# A backlog with no reason on it sends somebody to read the log of a process
	# that may have been restarted since.
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-GATE1", "1001", "2026-09-08 09:01:23", None)
	queue.mark_failed(1, "no employee found for 1001")

	assert "no employee found" in queue.stats()[0]["last_error"]


def test_a_device_nothing_has_come_from_is_simply_absent(tmp_path):
	# Not a row of zeroes. `--status` prints "nothing has ever reached this box"
	# for an empty queue, which is a different sentence and a different fix.
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	assert queue.stats() == []
