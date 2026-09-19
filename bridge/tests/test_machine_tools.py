"""The rules the hand-run machine tools apply before they write to a machine.

No machine and no site: a fake connection records what would have been written,
so "nothing without --apply" and "never the log" can be argued about here.
"""

import json
import os
import re
from argparse import Namespace
from datetime import datetime
from types import SimpleNamespace

import pytest

import machine
import machine_menu
import push_users

DEVICE = {"name": "BIO-TEST-GATE", "host": "10.0.0.9", "port": 4370, "password": 0, "timeout": 5, "force_udp": False}
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def user(uid, user_id, name="Someone", privilege=0, card=0):
	return SimpleNamespace(uid=uid, user_id=str(user_id), name=name, privilege=privilege, password="", group_id="", card=card)


def finger(uid, fid=0):
	return SimpleNamespace(uid=uid, fid=fid, valid=1, template=b"\x01\x02\x03")


class FakeConn:
	"""Every call that would change the machine lands in `writes`."""

	def __init__(self, users=(), templates=(), fp_version="10"):
		self.users = list(users)
		self.templates = list(templates)
		self.fp_version = fp_version
		self.writes = []

	def get_users(self):
		return list(self.users)

	def get_templates(self):
		return list(self.templates)

	def get_serialnumber(self):
		return "SN1"

	def get_fp_version(self):
		return self.fp_version

	def set_user(self, **kw):
		self.writes.append(("set_user", kw))
		self.users = [u for u in self.users if u.uid != kw["uid"]]
		self.users.append(user(kw["uid"], kw["user_id"], kw["name"], kw["privilege"], kw["card"]))

	def delete_user(self, uid):
		self.writes.append(("delete_user", uid))
		self.users = [u for u in self.users if u.uid != uid]

	def save_user_template(self, u, fingers):
		self.writes.append(("save_user_template", u.uid, len(fingers)))
		self.users.append(user(u.uid, u.user_id, u.name, u.privilege, u.card))

	def unlock(self, time):
		self.writes.append(("unlock", time))

	def restart(self):
		self.writes.append(("restart",))


@pytest.fixture(autouse=True)
def backups_in_tmp(tmp_path, monkeypatch):
	monkeypatch.setattr(machine, "BACKUP_DIR", str(tmp_path / "machine-backups"))
	return tmp_path / "machine-backups"


def args(**kw):
	base = {"apply": False, "name": None, "card": None, "admin": False, "not_admin": False}
	base.update(kw)
	return Namespace(**base)


# --- never ------------------------------------------------------------------


@pytest.mark.parametrize("script", ["machine.py", "push_users.py", "machine_menu.py", "employee_tools.py"])
def test_no_tool_can_clear_the_log_wipe_the_machine_power_it_off_or_disable_it(script):
	with open(os.path.join(HERE, script), encoding="utf-8") as handle:
		code = handle.read()
	calls = re.findall(r"\.(clear_attendance|clear_data|poweroff|disable_device)\(", code)
	assert calls == []


# --- nothing without --apply ------------------------------------------------


def test_add_user_without_apply_writes_nothing():
	conn = FakeConn([user(1, 7)])
	machine.cmd_add_user(conn, args(user_id="105", name="Anil K"), None, DEVICE)
	assert conn.writes == []


def test_delete_user_without_apply_writes_nothing_and_takes_no_backup(backups_in_tmp):
	conn = FakeConn([user(1, 105)], [finger(1)])
	machine.cmd_delete_user(conn, args(user_id="105"), None, DEVICE)
	assert conn.writes == []
	assert not backups_in_tmp.exists()


def test_unlock_and_restart_without_apply_do_nothing():
	conn = FakeConn()
	machine.cmd_unlock(conn, args(seconds=3), None, DEVICE)
	machine.cmd_restart(conn, args(), None, DEVICE)
	assert conn.writes == []


def test_the_dry_run_prints_the_words_the_menu_waits_for(capsys):
	machine.cmd_add_user(FakeConn(), args(user_id="105", name="Anil K"), None, DEVICE)
	out = capsys.readouterr().out
	assert machine_menu.worth_confirming(0, out)


# --- writes -----------------------------------------------------------------


def test_a_new_user_takes_the_slot_after_the_highest():
	conn = FakeConn([user(3, 7), user(9, 8)])
	machine.cmd_add_user(conn, args(user_id="105", name="Anil K", apply=True), None, DEVICE)
	assert conn.writes[0][1]["uid"] == 10


def test_a_user_id_already_on_the_machine_is_refused_not_overwritten():
	conn = FakeConn([user(1, 105)])
	with pytest.raises(SystemExit):
		machine.cmd_add_user(conn, args(user_id="105", name="Anil K", apply=True), None, DEVICE)
	assert conn.writes == []


def test_a_user_id_that_is_not_a_plain_number_is_refused():
	with pytest.raises(SystemExit):
		machine.cmd_add_user(FakeConn(), args(user_id="EMP-105", name="x", apply=True), None, DEVICE)


def test_a_long_name_is_cut_to_what_the_machine_holds():
	conn = FakeConn()
	machine.cmd_add_user(conn, args(user_id="105", name="A" * 40, apply=True), None, DEVICE)
	assert len(conn.writes[0][1]["name"]) == machine.NAME_LIMIT


def test_an_edit_keeps_the_slot_so_the_finger_keeps_working():
	conn = FakeConn([user(4, 105, "Anil")], [finger(4)])
	machine.cmd_edit_user(conn, args(user_id="105", name="Anil Kumar", apply=True), None, DEVICE)
	written = [w for w in conn.writes if w[0] == "set_user"]
	assert written[0][1]["uid"] == 4


def test_an_edit_and_a_delete_each_take_a_backup_first(backups_in_tmp):
	conn = FakeConn([user(4, 105, "Anil")], [finger(4)])
	machine.cmd_edit_user(conn, args(user_id="105", card=77, apply=True), None, DEVICE)
	machine.cmd_delete_user(conn, args(user_id="105", apply=True), None, DEVICE)
	assert len(list(backups_in_tmp.glob("*.json"))) == 2


# --- backup and restore -----------------------------------------------------


def test_a_backup_carries_the_fingerprint_template_as_hex():
	data = machine.backup_data(DEVICE, "SN1", "10", [user(4, 105)], [finger(4)], datetime(2026, 9, 17), "test")
	assert data["fingers"][0]["template"] == "010203"
	assert json.loads(json.dumps(data)) == data


def test_restore_adds_only_the_users_this_machine_lacks():
	backup = machine.backup_data(DEVICE, "SN1", "10", [user(1, 105), user(2, 106)], [finger(1), finger(2)], datetime(2026, 9, 17), "t")
	todo, fingers = machine.restore_plan(backup, [user(1, 105)], "10")
	assert [u["user_id"] for u in todo] == ["106"]
	assert len(fingers[2]) == 1


def test_restore_refuses_fingerprints_from_another_algorithm():
	backup = machine.backup_data(DEVICE, "SN1", "9", [user(1, 105)], [finger(1)], datetime(2026, 9, 17), "t")
	with pytest.raises(SystemExit):
		machine.restore_plan(backup, [], "10")


def test_restore_writes_the_user_and_fingers_into_this_machines_next_slot(tmp_path):
	backup = machine.backup_data(DEVICE, "SN1", "10", [user(40, 106)], [finger(40), finger(40, 1)], datetime(2026, 9, 17), "t")
	path = tmp_path / "b.json"
	path.write_text(json.dumps(backup), encoding="utf-8")
	conn = FakeConn([user(2, 105)])
	machine.cmd_restore(conn, args(file=str(path), apply=True), None, DEVICE)
	assert ("save_user_template", 3, 2) in conn.writes


# --- push_users -------------------------------------------------------------


def person(name, number, employee_name="Someone"):
	return {"name": name, "attendance_device_id": number, "employee_name": employee_name}


def test_a_number_two_employees_share_is_written_for_neither():
	people = [person("HR-EMP-1", "105"), person("HR-EMP-2", "105")]
	to_add, _, bad = push_users.plan(people, {}, push_users.number_holders(people))
	assert to_add == []
	assert len(bad) == 2


def test_a_clash_with_somebody_outside_the_filter_is_still_caught():
	people = [person("HR-EMP-1", "105")]
	everybody = people + [{"name": "HR-EMP-9", "attendance_device_id": "105"}]
	to_add, _, bad = push_users.plan(people, {}, push_users.number_holders(everybody))
	assert to_add == []
	assert "HR-EMP-9" in bad[0][2]


def test_a_number_already_on_the_machine_is_left_alone():
	people = [person("HR-EMP-1", "105")]
	to_add, already, _ = push_users.plan(people, {"105": "Anil"}, push_users.number_holders(people))
	assert to_add == [] and len(already) == 1


# --- menu -------------------------------------------------------------------


def test_the_menu_never_adds_apply_on_its_own():
	for action in machine_menu.ACTIONS:
		answers = {flag: "1" for flag, _, _ in action[3]}
		assert "--apply" not in machine_menu.command_for(action, "BIO-TEST-GATE", answers)


def test_a_failed_or_empty_dry_run_is_not_offered_for_yes():
	assert not machine_menu.worth_confirming(1, "pass --apply")
	assert not machine_menu.worth_confirming(0, "nothing to change.")


def test_the_menu_lists_only_machines_it_can_connect_to(tmp_path):
	config = tmp_path / "config.toml"
	config.write_text(
		'[[device]]\nname = "BIO-A"\nhost = "10.0.0.1"\n\n[[device]]\nname = "BIO-PUSH"\nserial = "CGK1"\n',
		encoding="utf-8",
	)
	assert machine_menu.devices(str(config)) == ["BIO-A"]
