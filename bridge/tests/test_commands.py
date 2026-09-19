"""What the bridge does with a command somebody left on the dashboard.

No site and no machine: a fake site hands out rows and records what was written
back, and a fake machine records what would have been written to it. So the two
rules that matter can be argued about here — **an action nobody wrote down is
never attempted**, and **a number the machine already holds is never written
over**, because that number may carry somebody's fingerprints.
"""

from types import SimpleNamespace

import pytest

from mannabridge import commands


class FakeSite:
	def __init__(self, rows):
		self.rows = rows
		self.writes = []

	def pending(self, device_ids, limit=10):
		return [r for r in self.rows if r["device_id"] in device_ids][:limit]

	def write(self, name, body):
		self.writes.append((name, body))
		return body

	def last(self, name):
		return [b for n, b in self.writes if n == name][-1]


class FakeMachine:
	def __init__(self, users=(), fails=False):
		self.users = [SimpleNamespace(uid=i + 1, user_id=str(u), name=n) for i, (u, n) in enumerate(users)]
		self.writes = []
		self.closed = False
		self._fails = fails

	# --- what a Device gives commands.work ---
	@property
	def name(self):
		return "BIO-TEST-GATE"

	def open(self):
		if self._fails:
			raise OSError("no route to the machine")
		return self

	# --- what an open connection gives run() ---
	def get_users(self):
		return list(self.users)

	def set_user(self, **kw):
		self.writes.append(kw)
		self.users.append(SimpleNamespace(uid=kw["uid"], user_id=kw["user_id"], name=kw["name"]))

	def disconnect(self):
		self.closed = True


def command(action, number="851", name_on_device="ANIL K", attempts=0):
	return {
		"name": "cmd1", "device_id": "BIO-TEST-GATE", "action": action,
		"device_user_id": number, "name_on_device": name_on_device,
		"status": "Pending", "attempts": attempts,
	}


# --- the closed list --------------------------------------------------------


def test_an_action_this_bridge_does_not_know_never_reaches_the_machine():
	machine = FakeMachine()
	site = FakeSite([command("Clear Log")])
	commands.work([machine], site)
	assert machine.writes == []
	assert site.last("cmd1")["status"] == "Failed"


def test_the_bridges_list_of_actions_holds_nothing_destructive():
	forbidden = ("clear", "wipe", "delete", "erase", "power", "reset")
	for action in commands.ACTIONS:
		assert not any(word in action.lower() for word in forbidden)


# --- check ------------------------------------------------------------------


def test_check_user_says_yes_and_writes_nothing_to_the_machine():
	machine = FakeMachine([("851", "ANIL K")])
	site = FakeSite([command("Check User")])
	commands.work([machine], site)
	answer = site.last("cmd1")
	assert answer["status"] == "Done" and answer["found"] == 1
	assert "ANIL K" in answer["result"]
	assert machine.writes == []


def test_check_user_says_no_for_a_number_the_machine_has_not_got():
	machine = FakeMachine([("12", "SOMEBODY")])
	site = FakeSite([command("Check User")])
	commands.work([machine], site)
	assert site.last("cmd1")["found"] == 0


# --- add --------------------------------------------------------------------


def test_add_user_writes_the_number_into_the_next_free_slot():
	machine = FakeMachine([("12", "SOMEBODY")])
	site = FakeSite([command("Add User")])
	commands.work([machine], site)
	assert machine.writes[0]["user_id"] == "851"
	assert machine.writes[0]["uid"] == 2
	assert site.last("cmd1")["status"] == "Done"


def test_add_user_leaves_a_number_the_machine_already_has_alone():
	# It may carry somebody's fingerprints, and a rewrite is how a finger stops
	# working. Not a failure either: the gate enrolled them first, which is the
	# order docs/NEW_EMPLOYEE.md expects.
	machine = FakeMachine([("851", "ANIL K")])
	site = FakeSite([command("Add User")])
	commands.work([machine], site)
	assert machine.writes == []
	answer = site.last("cmd1")
	assert answer["status"] == "Done" and "Nothing was written" in answer["result"]


def test_a_long_name_is_cut_to_what_the_machine_holds():
	machine = FakeMachine()
	site = FakeSite([command("Add User", name_on_device="A" * 40)])
	commands.work([machine], site)
	assert len(machine.writes[0]["name"]) == commands.NAME_LIMIT


def test_a_command_is_claimed_before_the_machine_is_touched():
	machine = FakeMachine()
	site = FakeSite([command("Add User")])
	commands.work([machine], site)
	assert site.writes[0][1]["status"] == "Running"
	assert site.writes[0][1]["attempts"] == 1


# --- machines that will not answer ------------------------------------------


def test_a_machine_that_will_not_answer_leaves_the_command_for_the_next_pass():
	site = FakeSite([command("Check User")])
	commands.work([FakeMachine(fails=True)], site)
	assert site.last("cmd1")["status"] == "Pending"


def test_a_machine_that_never_answers_fails_the_command_rather_than_asking_for_ever():
	site = FakeSite([command("Check User", attempts=commands.MAX_ATTEMPTS - 1)])
	commands.work([FakeMachine(fails=True)], site)
	answer = site.last("cmd1")
	assert answer["status"] == "Failed" and "could not be reached" in answer["result"]


def test_the_connection_is_closed_even_when_the_command_is_done():
	machine = FakeMachine([("851", "ANIL K")])
	commands.work([machine], FakeSite([command("Check User")]))
	assert machine.closed


def test_a_command_for_a_machine_this_bridge_does_not_have_is_left_alone():
	site = FakeSite([dict(command("Check User"), device_id="BIO-OTHER-GATE")])
	assert commands.work([FakeMachine()], site) == 0
	assert site.writes == []
