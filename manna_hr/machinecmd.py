"""What a `Machine Command` may ask a fingerprint machine to do.

Pure: no `frappe` import, so every rule here can be argued about without a site
— and the bridge imports the same words for its own check, because the two must
agree about what an action is called.

**The list is closed, and the dangerous things are not on it.** A machine's
protocol offers `clear_attendance()`, `clear_data()` and `poweroff()`; the
first destroys the last copy of punches nobody has delivered yet (CLAUDE.md §5).
An action arriving from anywhere — a form, `curl`, a row somebody edited in the
desk — that is not in ACTIONS is refused here, and refused again by the bridge
before it opens a socket. Two refusals, because this rule is the one thing
standing between a web page and a month of everybody's attendance.
"""

#: What a command may ask for, and what each one means to whoever reads the list.
ACTIONS = {
	"Check User": "Is this number on the machine?",
	"Add User": "Put this number and name on the machine.",
	"List Users": "Read the machine's whole user list.",
}

#: Actions that change the machine. The rest only read it.
WRITING = {"Add User"}

STATUSES = ("Pending", "Running", "Done", "Failed", "Cancelled")

#: A machine cuts a longer name off itself, so it is cut here and said.
NAME_LIMIT = 24


def is_number(text):
	"""A device user id: digits only, and short. The machines truncate silently."""
	text = str(text or "").strip()
	return text.isdigit() and 1 <= len(text) <= 9


def machine_name(text):
	return str(text or "").strip()[:NAME_LIMIT]


def problem_with(action, device_id, device_user_id, name_on_device):
	"""Why this command cannot be run, or None.

	Said as the consequence rather than the field name: whoever sees it is
	usually standing in front of a form and not a schema.
	"""
	if action not in ACTIONS:
		return "{0!r} is not something a machine can be asked to do here. Allowed: {1}.".format(
			action, ", ".join(sorted(ACTIONS))
		)
	if not str(device_id or "").strip():
		return "A command has to name the machine it is for."
	if action == "List Users":
		return None
	if not is_number(device_user_id):
		return "The machine number has to be plain digits, 1 to 9 of them, not {0!r}.".format(device_user_id)
	if action == "Add User" and not machine_name(name_on_device):
		return "A name is needed: it is what somebody at the gate reads to know whose finger this is."
	return None


def may_move(old, new):
	"""Whether a command may go from one status to another.

	The bridge claims a command by moving it to Running and finishes it at Done
	or Failed. **Nothing goes back to Pending**: a finished command sent round
	again would add a second user, or answer a question whose answer somebody
	has already acted on. Asking again is a new command, which is one click and
	leaves both in the record.
	"""
	if old == new:
		return True
	moves = {
		"Pending": {"Running", "Cancelled", "Failed", "Done"},
		"Running": {"Done", "Failed", "Cancelled"},
		"Done": set(),
		"Failed": set(),
		"Cancelled": set(),
	}
	return new in moves.get(old, set())


def check_answer(users, device_user_id):
	"""`(found, sentence)` for Check User, from the machine's own user list.

	`users` is `[(user_id, name)]` as read off the machine.
	"""
	number = str(device_user_id).strip()
	for user_id, name in users:
		if str(user_id).strip() == number:
			return True, "Yes. {0} is on the machine as {1}.".format(number, name or "(no name)")
	return False, "No. {0} is not on the machine.".format(number)


def add_answer(users, device_user_id, name_on_device):
	"""`(step, sentence)` for Add User: "add", or "already" when the gate got there first.

	Never "overwrite". That number may carry somebody's fingerprints, and
	rewriting the user is how a finger stops working.
	"""
	number = str(device_user_id).strip()
	for user_id, name in users:
		if str(user_id).strip() == number:
			return "already", "{0} was already on the machine as {1}. Nothing was written.".format(
				number, name or "(no name)"
			)
	return "add", "{0} added as {1}. The finger still has to be enrolled at the machine.".format(
		number, machine_name(name_on_device)
	)
