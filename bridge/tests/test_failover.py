from datetime import datetime

from mannabridge import failover, main
from mannabridge.queue import PunchQueue

NOW = datetime(2026, 10, 29, 9, 0, 0)


def test_a_machine_seen_on_adms_in_the_last_quarter_hour_is_left_to_adms():
	assert failover.on_adms({"BIO-NYU7262002047": "2026-10-29 08:50:00.123456"}, NOW) == {"BIO-NYU7262002047"}


def test_a_machine_quiet_on_adms_for_longer_is_read_by_the_bridge_again():
	assert failover.on_adms({"BIO-MRP-GATE1": "2026-10-29 08:44:59"}, NOW) == set()


def test_a_machine_that_never_pushed_is_read_by_the_bridge():
	assert failover.on_adms({"BIO-MRP-GATE1": None}, NOW) == set()


def test_an_unreadable_stamp_is_read_by_the_bridge_rather_than_trusted():
	assert failover.on_adms({"BIO-MRP-GATE1": "yesterday-ish"}, NOW) == set()


def test_a_site_that_will_not_say_leaves_every_machine_to_the_bridge():
	assert failover.on_adms({}, NOW) == set()


class Machine:
	def __init__(self, name):
		self.name = name
		self.reads = 0

	def read(self, since=None):
		self.reads += 1
		return []


class Site:
	def __init__(self, seen):
		self.seen = seen

	def adms_seen(self, base_url):
		return self.seen


def test_the_bridge_skips_the_machine_adms_is_serving_and_reads_the_rest(tmp_path):
	live = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
	pushing, quiet = Machine("BIO-NYU7262002047"), Machine("BIO-MRP-GATE1")
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	main.run_once([pushing, quiet], queue, Site({"BIO-NYU7262002047": live, "BIO-MRP-GATE1": None}),
	              retain_days=90, erp_url="https://site", fix_clocks=False)
	assert (pushing.reads, quiet.reads) == (0, 1)
