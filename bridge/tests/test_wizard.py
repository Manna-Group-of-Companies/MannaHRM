"""The rules setup applies before it writes anything a bridge will run on.

No network and no machine: these are the answers that decide whether a new PC's
punches are accepted, and they can be argued about without either.
"""

import tomllib
from datetime import date

from mannabridge.config import ENV_FILE, load_config, read_env_file
from mannabridge.queue import PunchQueue
from mannabridge.wizard import (
	cursor_for,
	name_problem,
	normalise_site,
	parse_start,
	private_subnets,
	render_config,
	render_env,
	seed_cursors,
	split_token,
	suggest_name,
)

TODAY = date(2026, 9, 14)


def test_a_name_without_the_trusted_prefix_is_refused():
	# The site would judge every punch from it a phone punch and refuse it.
	assert name_problem("TREADS-GATE1", "BIO-")
	assert name_problem("BIO-TREADS-GATE1", "BIO-") is None


def test_two_machines_on_one_pc_cannot_share_a_name():
	assert name_problem("BIO-GATE1", "BIO-", taken={"BIO-GATE1"})


def test_a_name_with_a_space_in_it_is_refused():
	assert name_problem("BIO-MAIN GATE", "BIO-")


def test_the_suggested_name_passes_the_check_it_is_offered_under():
	for serial, host in (("CGKK211561350", None), (None, "192.168.1.40"), ("", ""), ("a/b c", None)):
		assert name_problem(suggest_name("BIO-", serial, host), "BIO-") is None


def test_a_date_is_read_day_first_as_it_is_written_here():
	assert parse_start("01-09-2026", TODAY) == date(2026, 9, 1)
	assert parse_start("01/09/2026", TODAY) == date(2026, 9, 1)
	assert parse_start("2026-09-01", TODAY) == date(2026, 9, 1)


def test_a_blank_start_is_the_first_of_this_month_and_nonsense_is_nobody():
	# The month is what gets paid; installing on the 14th must not lose the 1st to the 13th.
	assert parse_start("", TODAY) == date(2026, 9, 1)
	assert parse_start("month", TODAY) == date(2026, 9, 1)
	assert parse_start("next monday", TODAY) is None


def test_today_still_means_today_for_a_zip_that_asks_for_it():
	assert parse_start("today", TODAY) == TODAY


def test_the_cursor_is_the_last_second_before_the_first_day_sent():
	# The bridge reads strictly after its cursor, so a cursor on the 14th itself
	# would skip that whole morning.
	assert cursor_for(date(2026, 9, 14)) == "2026-09-13 23:59:59"
	assert cursor_for(date(2026, 3, 1)) == "2026-02-28 23:59:59"


def test_setup_never_moves_the_cursor_of_a_machine_this_pc_already_reads(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.set_last_seen("BIO-MRP-GATE1", "2026-09-12 08:26:18")

	seeded = seed_cursors(queue, [{"name": "BIO-MRP-GATE1"}, {"name": "BIO-TREADS-GATE1"}], TODAY)

	assert seeded == ["BIO-TREADS-GATE1"]
	assert queue.last_seen("BIO-MRP-GATE1") == "2026-09-12 08:26:18"
	assert queue.last_seen("BIO-TREADS-GATE1") == "2026-09-13 23:59:59"


def test_only_this_pcs_private_networks_are_searched():
	nets = private_subnets(["127.0.0.1", "169.254.10.2", "8.8.4.4", "192.168.1.23", "192.168.1.77", "10.0.5.9", "fe80::1"])
	assert nets == ["192.168.1", "10.0.5"]


def test_a_key_pasted_as_a_token_is_split_into_its_two_halves():
	assert split_token("token abc123:def456") == ("abc123", "def456")
	assert split_token("abc123") == ("abc123", "")


def test_a_site_typed_without_https_gets_it():
	assert normalise_site("mannarubber.m.frappe.cloud/") == "https://mannarubber.m.frappe.cloud"


def test_the_config_setup_writes_is_the_config_the_bridge_loads(tmp_path, monkeypatch):
	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)
	devices = [
		{"name": "BIO-TREADS-GATE1", "host": "192.168.0.50", "port": 4370, "password": 1234, "force_udp": True},
		{"name": "BIO-TREADS-OFFICE", "host": "192.168.0.51"},
	]
	(tmp_path / "config.toml").write_text(render_config("https://site.example", devices), encoding="utf-8")
	(tmp_path / ENV_FILE).write_text(render_env("k3y", "s3cret"), encoding="utf-8")

	config = load_config(str(tmp_path / "config.toml"))

	assert (config.api_key, config.api_secret) == ("k3y", "s3cret")
	assert [d["name"] for d in config.devices] == ["BIO-TREADS-GATE1", "BIO-TREADS-OFFICE"]
	assert config.devices[0]["password"] == 1234 and config.devices[0]["force_udp"] is True
	assert config.devices[1]["port"] == 4370 and config.devices[1]["force_udp"] is False


def test_the_key_is_never_written_into_the_config(tmp_path):
	text = render_config("https://site.example", [{"name": "BIO-GATE1", "host": "10.0.0.2"}])
	erp = tomllib.loads(text)["erp"]
	assert "api_key" not in erp and "api_secret" not in erp


def test_a_key_file_saved_by_notepad_with_a_bom_still_yields_the_key(tmp_path):
	path = tmp_path / ENV_FILE
	path.write_bytes(b"\xef\xbb\xbfMANNA_API_KEY=k3y\r\nMANNA_API_SECRET=s3cret\r\n")
	assert read_env_file(str(path)) == {"MANNA_API_KEY": "k3y", "MANNA_API_SECRET": "s3cret"}


def test_the_environment_beats_the_key_file(tmp_path, monkeypatch):
	(tmp_path / "config.toml").write_text(render_config("https://site.example", [{"name": "BIO-GATE1", "host": "10.0.0.2"}]), encoding="utf-8")
	(tmp_path / ENV_FILE).write_text(render_env("from-file", "from-file"), encoding="utf-8")
	monkeypatch.setenv("MANNA_API_KEY", "from-env")
	monkeypatch.setenv("MANNA_API_SECRET", "from-env")
	assert load_config(str(tmp_path / "config.toml")).api_key == "from-env"


class QuietSite:
	"""A site with no machine registered on it."""

	def __init__(self, sending_rows=(), last=None):
		self.sending_rows = list(sending_rows)
		self.last = last

	def registered(self, **match):
		return []

	def last_punch_from(self, device_id):
		return self.last

	def _list(self, *args, **kwargs):
		return self.sending_rows


def answering(monkeypatch, *answers):
	queue = list(answers)
	monkeypatch.setattr("builtins.input", lambda prompt="": queue.pop(0))
	return queue


def test_only_machines_are_offered_as_names_already_sending(monkeypatch):
	# Read off the live site on 14 Sep 2026: a phone punch and a correction
	# share Employee Checkin with the gate, and neither is a machine to reuse.
	from mannabridge.wizard import Site

	site = Site("https://site.example", "k", "s")
	rows = [{"device_id": "BIO-MRP-GATE1"}, {"device_id": "PHONE-HR-EMP-00065"}, {"device_id": "REG-hr@mannarubber.com"}]
	monkeypatch.setattr(site, "_list", lambda *a, **k: rows)
	monkeypatch.setattr(site, "last_punch_from", lambda name: "2026-09-14 14:34:10")

	assert site.machines_sending("BIO-", TODAY) == [("BIO-MRP-GATE1", "2026-09-14 14:34:10")]


def test_a_machine_that_never_answers_is_skipped_and_nothing_is_added(monkeypatch):
	from mannabridge import wizard

	def refuses(*args, **kwargs):
		raise OSError("timed out")

	monkeypatch.setattr(wizard, "look_at", refuses)
	answering(monkeypatch, "")  # Enter at "comm key to try"
	devices = []
	wizard.add_device(QuietSite(), "BIO-", devices, "192.168.0.99")
	assert devices == []


def test_the_comm_key_that_opened_the_machine_is_the_one_saved(monkeypatch):
	from mannabridge import wizard

	def needs_key(host, port, password, force_udp=False):
		if password != 1234:
			raise OSError("Unauthenticated")
		return {"serial": "SER1", "model": "K90", "users": 3, "drift_seconds": 0}

	monkeypatch.setattr(wizard, "look_at", needs_key)
	answering(monkeypatch, "1234", "y", "BIO-TREADS-GATE1")
	devices = []
	wizard.add_device(QuietSite(), "BIO-", devices, "192.168.0.50")
	assert devices[0]["password"] == 1234 and devices[0]["name"] == "BIO-TREADS-GATE1"


def test_a_name_already_on_the_site_is_refused_unless_it_is_the_same_machine(monkeypatch):
	from mannabridge import wizard

	monkeypatch.setattr(wizard, "look_at", lambda *a, **k: {"serial": "SER2", "model": None, "users": None})
	# "n" to "is this that same machine?", then a fresh name for a new one.
	answering(monkeypatch, "y", "BIO-MRP-GATE1", "n", "BIO-TREADS-GATE2")
	site = QuietSite(last="2026-09-14 14:34:10")
	site.last_punch_from = lambda name: "2026-09-14 14:34:10" if name == "BIO-MRP-GATE1" else None
	devices = []
	wizard.add_device(site, "BIO-", devices, "192.168.0.51")
	assert [d["name"] for d in devices] == ["BIO-TREADS-GATE2"]


# ------------------------------------------------------ automatic install ---


def test_a_machine_named_before_the_auto_install_keeps_its_name():
	from mannabridge.wizard import auto_name

	known = {"CGKK211561350": "BIO-MRP-GATE1"}
	assert auto_name("BIO-", "CGKK211561350", "192.168.1.40", known, None, set()) == "BIO-MRP-GATE1"


def test_a_new_machine_is_named_by_its_serial_so_every_reinstall_agrees():
	from mannabridge.wizard import auto_name

	assert auto_name("BIO-", "ABC123", "10.0.0.9", {}, None, set()) == "BIO-ABC123"
	assert auto_name("BIO-", "ABC123", "10.0.0.77", {}, None, set()) == "BIO-ABC123"


def test_the_register_names_a_machine_when_the_file_does_not():
	from mannabridge.wizard import auto_name

	assert auto_name("BIO-", "ABC123", "10.0.0.9", {}, "BIO-TREADS-GATE1", set()) == "BIO-TREADS-GATE1"


def test_two_machines_answering_with_no_serial_still_get_two_names():
	from mannabridge.wizard import auto_name

	assert auto_name("BIO-", None, None, {}, None, {"BIO-GATE1"}) == "BIO-GATE1-2"


class AutoSite:
	def __init__(self, url, key, secret):
		self.url, self.api_key, self.api_secret = url, key, secret

	def signed_in_as(self):
		return "it@mannarubber.com"

	def trusted_prefix(self):
		return "BIO-"

	def registered(self, **match):
		return []


def test_the_automatic_install_asks_nothing_and_writes_a_bridge_that_loads(tmp_path, monkeypatch):
	from mannabridge import wizard

	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)

	def nobody_is_there(*args, **kwargs):
		raise AssertionError("the automatic install read the keyboard")

	monkeypatch.setattr("builtins.input", nobody_is_there)
	monkeypatch.setattr(wizard, "hidden", nobody_is_there)
	monkeypatch.setattr(wizard, "Site", AutoSite)
	monkeypatch.setattr(wizard, "this_pcs_addresses", lambda: ["192.168.1.23"])
	monkeypatch.setattr(wizard, "scan", lambda hosts: ["192.168.1.40", "192.168.1.41"])

	def machines(host, port, password, force_udp=False):
		if host == "192.168.1.41" and password != 1234:
			raise OSError("Unauthenticated")
		serial = {"192.168.1.40": "CGKK211561350", "192.168.1.41": "NEW999"}[host]
		return {"serial": serial, "model": "K90", "users": 3, "drift_seconds": 0}

	monkeypatch.setattr(wizard, "look_at", machines)
	(tmp_path / "known_machines.toml").write_text('[machines]\nCGKK211561350 = "BIO-MRP-GATE1"\n', encoding="utf-8")
	auto = tmp_path / "autoinstall.toml"
	auto.write_text(
		'[erp]\nurl = "https://site.example"\napi_key = "k3y"\napi_secret = "s3cret"\n'
		"[machines]\ncomm_keys = [0, 1234]\n",
		encoding="utf-8",
	)

	wizard.run_auto(str(tmp_path / "config.toml"), str(auto), today=TODAY)

	config = load_config(str(tmp_path / "config.toml"))
	assert (config.api_key, config.api_secret) == ("k3y", "s3cret")
	assert [(d["name"], d["password"]) for d in config.devices] == [("BIO-MRP-GATE1", 0), ("BIO-NEW999", 1234)]
	# No start in the file: the first of the month, so the cursor is the last second of August.
	assert PunchQueue(str(tmp_path / "punches.sqlite3")).last_seen("BIO-NEW999") == "2026-08-31 23:59:59"


def test_the_automatic_install_stops_when_no_machine_answers(tmp_path, monkeypatch):
	import pytest
	from mannabridge import wizard

	monkeypatch.setattr(wizard, "Site", AutoSite)
	monkeypatch.setattr(wizard, "this_pcs_addresses", lambda: ["192.168.1.23"])
	monkeypatch.setattr(wizard, "scan", lambda hosts: [])
	auto = tmp_path / "autoinstall.toml"
	auto.write_text('[erp]\napi_key = "k"\napi_secret = "s"\n', encoding="utf-8")

	with pytest.raises(SystemExit, match="No fingerprint machine answered"):
		wizard.run_auto(str(tmp_path / "config.toml"), str(auto), today=TODAY)
	assert not (tmp_path / "config.toml").exists()


def test_a_key_the_site_refuses_stops_the_automatic_install(tmp_path, monkeypatch):
	import pytest
	from mannabridge import wizard

	class Refusing(AutoSite):
		def signed_in_as(self):
			raise wizard.SetupError("ERPNext did not accept that key.")

	monkeypatch.setattr(wizard, "Site", Refusing)
	auto = tmp_path / "autoinstall.toml"
	auto.write_text('[erp]\napi_key = "k"\napi_secret = "s"\n', encoding="utf-8")
	with pytest.raises(SystemExit, match="refused the key"):
		wizard.run_auto(str(tmp_path / "config.toml"), str(auto), today=TODAY)


def _auto_env(tmp_path, monkeypatch, wizard, look):
	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)
	monkeypatch.setattr(wizard, "Site", AutoSite)
	monkeypatch.setattr(wizard, "this_pcs_addresses", lambda: ["192.168.1.23"])
	monkeypatch.setattr(wizard, "scan", lambda hosts: ["192.168.1.205"])
	monkeypatch.setattr(wizard, "look_at", look)
	auto = tmp_path / "autoinstall.toml"
	auto.write_text('[erp]\napi_key = "k"\napi_secret = "s"\n', encoding="utf-8")
	return auto


def _essl(host, port, password, force_udp=False):
	# The eSSL machine at the Hi-Tech site, 15 Sep 2026: port open, key refused.
	if password != 4321:
		raise OSError("Unauthenticated")
	return {"serial": "ESSL1", "model": "eSSL", "users": 18, "drift_seconds": 0}


def test_a_machine_that_refuses_the_keys_in_the_file_is_asked_about_at_the_console(tmp_path, monkeypatch):
	from mannabridge import wizard

	auto = _auto_env(tmp_path, monkeypatch, wizard, _essl)
	answers = answering(monkeypatch, "4321")
	wizard.run_auto(str(tmp_path / "config.toml"), str(auto), today=TODAY, interactive=True)
	assert answers == []
	assert [(d["name"], d["password"]) for d in load_config(str(tmp_path / "config.toml")).devices] == [("BIO-ESSL1", 4321)]


def test_with_no_console_a_refusing_machine_stops_the_install_without_asking(tmp_path, monkeypatch):
	import pytest
	from mannabridge import wizard

	auto = _auto_env(tmp_path, monkeypatch, wizard, _essl)
	monkeypatch.setattr("builtins.input", lambda prompt="": (_ for _ in ()).throw(AssertionError("asked")))
	with pytest.raises(SystemExit, match="No fingerprint machine answered"):
		wizard.run_auto(str(tmp_path / "config.toml"), str(auto), today=TODAY, interactive=False)


def test_a_refused_comm_key_is_explained_as_a_comm_key():
	from mannabridge.wizard import refusal_hint

	assert "comm key set" in refusal_hint(["TCP, comm key 0: Unauthenticated"])
	assert "another program" in refusal_hint(["TCP, comm key 0: timed out"])


# ------------------------------------------------- the push route, kept ---


def test_a_rerun_of_setup_keeps_the_direction_the_mrp_shifts_pair_on(tmp_path, monkeypatch):
	# All three Manna Rubber Products shifts pair strictly on log type. A config
	# rewritten without this line would send no IN or OUT from that gate.
	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)
	devices = [{"name": "BIO-MRP-GATE1", "host": "192.168.1.40", "serial": "CGKK211561350", "report_direction": True}]
	(tmp_path / "config.toml").write_text(render_config("https://site.example", devices), encoding="utf-8")
	(tmp_path / ENV_FILE).write_text(render_env("k", "s"), encoding="utf-8")
	device = load_config(str(tmp_path / "config.toml")).devices[0]
	assert device["report_direction"] is True and device["serial"] == "CGKK211561350"


def test_a_rerun_of_setup_keeps_the_adms_server_and_the_machines_that_push(tmp_path, monkeypatch):
	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)
	devices = [{"name": "BIO-CGKK211162173", "serial": "CGKK211162173"}]
	adms = {"enabled": True, "port": 8081, "timezone": "5.5"}
	(tmp_path / "config.toml").write_text(render_config("https://site.example", devices, adms=adms), encoding="utf-8")
	(tmp_path / ENV_FILE).write_text(render_env("k", "s"), encoding="utf-8")
	config = load_config(str(tmp_path / "config.toml"))
	assert config.listens and config.adms_port == 8081
	assert config.pollable == [] and config.devices[0]["serial"] == "CGKK211162173"


def test_a_machine_that_only_pushes_turns_the_server_on_by_itself(tmp_path, monkeypatch):
	# A serial with no host can reach this box no other way.
	monkeypatch.delenv("MANNA_API_KEY", raising=False)
	monkeypatch.delenv("MANNA_API_SECRET", raising=False)
	(tmp_path / "config.toml").write_text(render_config("https://site.example", [{"name": "BIO-X", "serial": "X1"}]), encoding="utf-8")
	(tmp_path / ENV_FILE).write_text(render_env("k", "s"), encoding="utf-8")
	assert load_config(str(tmp_path / "config.toml")).listens


def test_the_known_machines_file_says_which_machine_reports_direction():
	from mannabridge.wizard import known_machines

	names, directions = known_machines({"machines": {
		"CGKK211561350": {"name": "BIO-MRP-GATE1", "report_direction": True},
		"OLD1": "BIO-OLD-GATE",
	}})
	assert names == {"CGKK211561350": "BIO-MRP-GATE1", "OLD1": "BIO-OLD-GATE"}
	assert directions == {"CGKK211561350": True}


def test_the_shipped_known_machines_file_keeps_the_mrp_gate_reporting_direction():
	import pathlib
	from mannabridge.wizard import known_machines

	raw = tomllib.loads((pathlib.Path(__file__).resolve().parents[1] / "known_machines.toml").read_text(encoding="utf-8"))
	names, directions = known_machines(raw)
	assert names["CGKK211561350"] == "BIO-MRP-GATE1" and directions["CGKK211561350"] is True
