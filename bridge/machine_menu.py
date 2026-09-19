"""A numbered menu over machine.py and push_users.py, for whoever is at the bridge PC.

Nothing here talks to a machine. It asks, builds the command somebody would
otherwise type, and runs it - so every rule stays in those two files, and this
one could be deleted without losing anything but the typing.

A change always runs twice: once without --apply, which prints what it would do,
and again only if the person types YES.
"""

import os
import subprocess
import sys
import tomllib

HERE = os.path.dirname(os.path.abspath(__file__))
BACKUPS = os.path.join(HERE, "machine-backups")
# The dry run's own words. machine.dry_run and push_users both print them, and
# only output carrying them is worth a YES prompt.
APPLY_HINT = "pass --apply"

# label, script, fixed arguments, questions (flag, prompt, required), changes the machine
ACTIONS = [
	("Machine info", "machine.py", ["info"], [], False),
	("Clock: how far off is it", "machine.py", ["time", "--from-site"], [], False),
	("Clock: set it from the site", "machine.py", ["time", "--set", "--from-site"], [], True),
	("Users on the machine", "machine.py", ["users"], [], False),
	("Employees on this machine", "employee_tools.py", ["list", "--not-here"], [], False),
	("Employees on this machine: problems only", "employee_tools.py", ["list", "--problems"], [], False),
	(
		"Punch log",
		"machine.py",
		["logs"],
		[
			("--since", "From date YYYY-MM-DD (blank for all)", False),
			("--user-id", "Only this user id (blank for everybody)", False),
			("--csv", "Save to a CSV file name (blank to show here)", False),
		],
		False,
	),
	("Backup users and fingerprints", "machine.py", ["backup"], [], False),
	(
		"Create an employee (site and machine)",
		"employee_tools.py",
		["create"],
		[
			("--user-id", "Machine number (becomes Attendance Device ID)", True),
			("--first-name", "First name", True),
			("--last-name", "Last name (blank if none)", False),
			("--gender", "Gender (Male / Female)", True),
			("--date-of-birth", "Date of birth DD-MM-YYYY", True),
			("--date-of-joining", "Date of joining DD-MM-YYYY", True),
			("--company", "Company, exactly as in ERPNext", True),
			("--shift", "Default shift (blank: set it later, no attendance until then)", False),
			("--employee-number", "Employee number, e.g. MRP-307 (blank if none)", False),
		],
		True,
	),
	("Add ERPNext people to this machine", "push_users.py", [], [], True),
	("Add one user", "machine.py", ["add-user"], [("--user-id", "User id (the number in ERPNext)", True), ("--name", "Name", True)], True),
	("Change a user's name", "machine.py", ["edit-user"], [("--user-id", "User id", True), ("--name", "New name", True)], True),
	("Give a user a card", "machine.py", ["edit-user"], [("--user-id", "User id", True), ("--card", "Card number", True)], True),
	("Enroll a finger", "machine.py", ["enroll"], [("--user-id", "User id", True), ("--finger", "Finger 0-9 (blank for 0)", False)], True),
	("Delete a user", "machine.py", ["delete-user"], [("--user-id", "User id", True)], True),
	("Restore a backup onto this machine", "machine.py", ["restore"], [("--file", "Backup", True)], True),
	("Open the door", "machine.py", ["unlock"], [], True),
	("Restart the machine", "machine.py", ["restart"], [], True),
]


def devices(path):
	"""Machines the tools can connect to. One that only pushes has no address."""
	if not os.path.exists(path):
		raise SystemExit("No config.toml beside this file. Run INSTALL.bat first.")
	with open(path, "rb") as handle:
		return [d["name"] for d in tomllib.load(handle).get("device", []) if d.get("name") and d.get("host")]


def command_for(action, device, answers):
	"""The argv for one action. `answers` maps a flag to what was typed; blank is left out."""
	_, script, fixed, questions, _ = action
	command = [sys.executable, os.path.join(HERE, script)] + fixed + ["--device", device]
	for flag, _, _ in questions:
		value = answers.get(flag, "")
		if value:
			command += [flag, value]
	return command


def worth_confirming(returncode, output):
	# An error, or "nothing to change", never reaches the YES prompt.
	return returncode == 0 and APPLY_HINT in output


def pick(title, options):
	print("\n" + title)
	for i, option in enumerate(options, 1):
		print("  {0:>2}. {1}".format(i, option))
	print("   0. Back")
	while True:
		answer = input("> ").strip()
		if answer.isdigit() and int(answer) <= len(options):
			return int(answer) - 1


def ask(prompt, required):
	while True:
		answer = input("  {0}: ".format(prompt)).strip()
		if answer or not required:
			return answer


def backup_file():
	files = sorted((f for f in os.listdir(BACKUPS) if f.endswith(".json")), reverse=True) if os.path.isdir(BACKUPS) else []
	if not files:
		print("  There are no backups in machine-backups yet.")
		return None
	i = pick("Which backup? Newest first.", files[:20])
	return None if i < 0 else os.path.join(BACKUPS, files[i])


def run(command, capture):
	if not capture:
		return subprocess.call(command, cwd=HERE), ""
	done = subprocess.run(command, cwd=HERE, capture_output=True, text=True, encoding="utf-8", errors="replace")
	print(done.stdout, end="")
	print(done.stderr, end="")
	return done.returncode, done.stdout


def main():
	names = devices(os.path.join(HERE, "config.toml"))
	if not names:
		raise SystemExit("config.toml has no machine with an address.")
	available = [a for a in ACTIONS if os.path.exists(os.path.join(HERE, a[1]))]

	while True:
		d = pick("Which machine?", names)
		if d < 0:
			return
		device = names[d]

		while True:
			a = pick("{0} - what to do?".format(device), [x[0] for x in available])
			if a < 0:
				break
			action = available[a]

			answers = {}
			for flag, prompt, required in action[3]:
				value = backup_file() if flag == "--file" else ask(prompt, required)
				if value is None:
					break
				answers[flag] = value
			else:
				print()
				command = command_for(action, device, answers)
				if not action[4]:
					run(command, capture=False)
					continue
				code, output = run(command, capture=True)
				if not worth_confirming(code, output):
					continue
				if input("\nType YES to do this on {0}: ".format(device)).strip() != "YES":
					print("Not done. Nothing was written.")
					continue
				run(command + ["--apply"], capture=False)


if __name__ == "__main__":
	try:
		main()
	except (KeyboardInterrupt, EOFError):
		print()
