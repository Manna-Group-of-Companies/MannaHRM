"""Apps & access: which of the group's apps one person's login opens, switched.

Every app and website here signs people in with the same ERPNext login, and
each decides who may come in from that login's roles or fields — read off each
project on 27 October 2026:

- Field Sales (SALES_DASHBOARD/app): a `Sales Person` whose `custom_user` is
  the login.
- Sales & Production dashboard (SALES_DASHBOARD/client): one of the
  `User.custom_is_*` checks.
- CMMS (Manna_CMMS server/integrations/erpnext/auth.js): one of its roles.
- Fleet (vehicle_tracking): `Fleet Manager` for the dashboard, `Driver` for
  the driver app.
- Manna HR's own website and app: HR roles, and an enabled login.

So a switch here is that app's own role or field, and nothing else. Who may
switch is decided on the server (CLAUDE.md §1): an HR Manager or a System
Manager, never on their own login, and an HR Manager never on a System
Manager's. No switch grants System Manager or HR Manager.

Pure — no `frappe` — so the rules can be argued about without a site, the way
`rules.py` is. The site half is `appaccess_site.py`.
"""

#: Who may see and change this. Nobody else is shown the tab.
MANAGERS = ("HR Manager", "System Manager")

#: Never granted by a switch. Holding one also puts a login out of an HR
#: Manager's reach: removing an administrator's access is an administrator's call.
UNTOUCHABLE = ("System Manager", "Administrator")

#: CMMS's roles, most senior first — the order its own server maps them in.
CMMS_ROLES = (
	"Store Manager",
	"Store Maintenance Manager",
	"Higher Management",
	"VP Operations",
	"Store Purchase Manager",
	"Store Supervisor",
	"Stock Manager",
	"Stock User",
	"Plant Manager",
	"Store Maintenance Member",
)

#: The Sales & Production dashboard's flags on User, in its order of precedence.
SALES_FLAGS = (
	("custom_is_managing_director", "Managing Director"),
	("custom_is_accountant", "Accountant"),
	("custom_is_general_manager", "General Manager"),
	("custom_is_hr_manager", "HR"),
	("custom_is_stock_manager", "Stock Manager"),
	("custom_is_production_manager", "Production Manager"),
)

#: One row per switch. `kind` decides what on, off and a choice mean.
APPS = (
	{"key": "login", "label": "Login (every app)", "kind": "enabled"},
	{"key": "hr_web", "label": "HR dashboard", "kind": "role", "role": "HR User",
	 "on_if": ("HR User", "HR Manager"), "off_also": ("HR Manager",)},
	{"key": "hr_app", "label": "Manna HR app", "kind": "follows_login"},
	{"key": "desk", "label": "ERPNext desk", "kind": "desk"},
	{"key": "field_sales", "label": "Field Sales app", "kind": "sales_person"},
	{"key": "sales_web", "label": "Sales & Production dashboard", "kind": "flag"},
	{"key": "cmms", "label": "CMMS", "kind": "level"},
	{"key": "fleet_web", "label": "Fleet dashboard", "kind": "role", "role": "Fleet Manager"},
	{"key": "fleet_driver", "label": "Fleet driver app", "kind": "role", "role": "Driver"},
)

_BY_KEY = {a["key"]: a for a in APPS}


def states(info):
	"""Every switch, as `{key, label, kind, on, value, options}`.

	`info` is what the site holds for the login: `enabled`, `user_type`,
	`roles`, `flags` (fieldname → 0/1), `sales_person` (the one carrying the
	login, or ""), `sales_people` (the choice offered).
	"""
	roles = set(info.get("roles") or ())
	flags = info.get("flags") or {}
	enabled = bool(info.get("enabled"))
	out = []
	for a in APPS:
		row = {"key": a["key"], "label": a["label"], "kind": a["kind"], "value": "", "options": []}
		k = a["kind"]
		if k == "enabled" or k == "follows_login":
			row["on"] = enabled
		elif k == "desk":
			row["on"] = enabled and info.get("user_type") == "System User"
		elif k == "role":
			row["on"] = bool(roles & set(a.get("on_if") or (a["role"],)))
		elif k == "level":
			held = [r for r in CMMS_ROLES if r in roles]
			row["on"] = bool(held)
			row["value"] = held[0] if held else ""
			row["options"] = list(CMMS_ROLES)
		elif k == "flag":
			held = [f for f, _l in SALES_FLAGS if int(flags.get(f) or 0)]
			row["on"] = bool(held)
			row["value"] = held[0] if held else ""
			row["options"] = [{"value": f, "label": l} for f, l in SALES_FLAGS]
		elif k == "sales_person":
			row["on"] = bool(info.get("sales_person"))
			row["value"] = info.get("sales_person") or ""
			row["options"] = list(info.get("sales_people") or ())
		out.append(row)
	return out


def why_not(caller, caller_roles, login, login_roles):
	"""Why `caller` may not change `login`'s access, or "" if they may."""
	if not set(caller_roles or ()) & set(MANAGERS):
		return "Only an HR Manager or a System Manager can change access."
	if not login:
		return "This employee has no login."
	if str(login).lower() == str(caller).lower():
		return "This is the login you are signed in with."
	if login == "Administrator":
		return "Administrator's access is not changed from here."
	if set(login_roles or ()) & set(UNTOUCHABLE) and "System Manager" not in set(caller_roles or ()):
		return "This login is a System Manager. Only a System Manager can change its access."
	return ""


def plan(key, value, roles):
	"""What switching `key` to `value` writes, as a dict of changes.

	`value` is True/False for a plain switch, the chosen option for a level, a
	flag or a Sales Person, and "" (or False) for off. Raises ValueError for a
	switch or a choice that does not exist — the client offers only these, so
	anything else is somebody holding `curl`.
	"""
	a = _BY_KEY.get(key)
	if not a:
		raise ValueError(f"No such app: {key}")
	k = a["kind"]
	on = bool(value)
	roles = set(roles or ())
	if k in ("enabled", "follows_login"):
		return {"enabled": 1 if on else 0}
	if k == "desk":
		raise ValueError("The ERPNext desk follows the login's user type and is not switched here.")
	if k == "role":
		if on:
			return {"add_roles": [a["role"]], "remove_roles": []}
		gone = [r for r in (a["role"], *a.get("off_also", ())) if r in roles]
		return {"add_roles": [], "remove_roles": gone}
	if k == "level":
		if on and value not in CMMS_ROLES:
			raise ValueError(f"Not a CMMS role: {value}")
		held = [r for r in CMMS_ROLES if r in roles]
		return {"add_roles": [value] if on else [], "remove_roles": [r for r in held if r != value]}
	if k == "flag":
		fields = [f for f, _l in SALES_FLAGS]
		if on and value not in fields:
			raise ValueError(f"Not a Sales dashboard role: {value}")
		return {"flags": {f: 1 if (on and f == value) else 0 for f in fields}}
	if k == "sales_person":
		return {"sales_person": value if on else ""}
	raise ValueError(f"Unknown kind: {k}")


def granted(changes):
	"""The roles a change would add. Checked against UNTOUCHABLE before writing."""
	return list(changes.get("add_roles") or ())


# ------------------------------------------------------------ phone punch ---
#
# Asked for 25 November 2026: an employee who punches on the machine should be
# able to punch on the phone as well, switched on from their profile. Create
# Employee already makes a phone login for a new person (client/src/lib/
# newemp.js appUserDoc); this does the same for somebody already on the site.

#: The punch methods the phone app is for.
PHONE_METHODS = ("Mobile App", "Both")


def cannot_punch(employees):
	"""Active people with no way to punch at all: no machine number and no login.

	A punch reaches the site from a fingerprint machine, by the Employee's
	`attendance_device_id`, or from the phone app, by the login on `user_id`
	or `custom_app_login`.
	With neither, every day of theirs reads Absent and nothing says why. On
	27 November 2026 that was five people, whose November punches had come from
	factoHR's own phone app, which stops on 1 December.
	"""
	return [
		e for e in employees or ()
		if e.get("status") == "Active"
		and not str(e.get("attendance_device_id") or "").strip()
		and not str(e.get("user_id") or "").strip()
		and not str(e.get("custom_app_login") or "").strip()
	]


def cannot_punch_subject(people, shown=8):
	"""HR's daily notification for `cannot_punch`: who, and what to do about it."""
	names = ["{0} ({1})".format(p.get("employee_name") or p.get("name"), p.get("employee_number") or p.get("name"))
	         for p in people]
	listed = ", ".join(names[:shown])
	if len(names) > shown:
		listed += " and {0} more".format(len(names) - shown)
	who = "1 person" if len(names) == 1 else "{0} people".format(len(names))
	return "{0} cannot punch: {1}. Give each a machine number, or Allow phone punch on their record.".format(who, listed)

def first_password(dob):
	"""The date of birth as DDMMYYYY — 2005-03-24 is "24032005" — or "".

	The same rule as `dobPassword` in client/src/lib/newemp.js and
	`dobPassword` in app/lib/core/first_password.dart.
	"""
	s = str(dob or "")[:10]
	if len(s) != 10 or s[4] != "-" or s[7] != "-":
		return ""
	return s[8:10] + s[5:7] + s[0:4]


#: The domain of the stand-in address a phone login gets when the record has no
#: email. `.invalid` is reserved (RFC 2606): mail to it is never delivered, so
#: no outside address is used and nothing is ever sent anywhere.
STAND_IN_DOMAIN = "phone.manna.invalid"


def stand_in_email(code):
	"""The login name for somebody with no email: their Emp Code at
	STAND_IN_DOMAIN — MRP-293 is "mrp-293@phone.manna.invalid". "" with no code.

	Asked for 26 November 2026: punching on the phone needs the Emp Code and
	the date of birth, not an email. Frappe names every User by an email, so
	one is made up; nobody types it — they sign in with the Emp Code.
	"""
	local = "".join(ch if ch.isalnum() or ch in ".-_" else "-" for ch in str(code or "").strip().lower()).strip(".-_")
	return f"{local}@{STAND_IN_DOMAIN}" if local else ""


def is_stand_in(email):
	return str(email or "").lower().endswith("@" + STAND_IN_DOMAIN)


def existing_login(user_id="", driver_logins=(), email_login=""):
	"""The login an employee already has; "" when there is none.
	`(login, problem)`. `phone_punch` never changes it: unless it is the app's
	own stand-in, the Manna HR app gets a login of its own beside it.

	In order: the one their record names (`user_id`); else the Fleet driver
	app login linked to them on the fleet dashboard (Fleet Driver Employee) -
	found so that it is recognised as theirs and left alone, rather than a
	second login with an email being made beside it and listed among the
	drivers twice (HPT-114, 28 November 2026); else the one named by their
	email or Emp Code stand-in. Two driver logins linked to one employee is
	for HR to settle first, so neither is picked.
	"""
	if user_id:
		return user_id, ""
	drivers = sorted({d for d in driver_logins or () if d})
	if len(drivers) == 1:
		return drivers[0], ""
	if len(drivers) > 1:
		return "", ("Linked to more than one Fleet driver app login ({0}). Keep the one they use and unlink the "
			"other on the fleet dashboard (Drivers → HRMS employee) first.".format(", ".join(drivers)))
	return email_login or "", ""


def second_driver_login(login, driver_logins=()):
	"""Why the Fleet driver app switch may not be turned on for `login`: the
	employee already drives with another login. "" when it may."""
	others = sorted({d for d in driver_logins or () if d and d != login})
	if not others:
		return ""
	return ("{0} already uses the Fleet driver app as {1}. A second driver login would put them on the drivers "
		"list twice.".format(login or "This employee", ", ".join(others)))


def email_of(emp):
	"""The address a new login is named by: the work email, else the personal."""
	for key in ("company_email", "personal_email", "prefered_email"):
		v = str(emp.get(key) or "").strip().lower()
		if "@" in v:
			return v
	return ""


def phone_punch(emp, login_user=None, username_holder="", by_user_name=None, app_user=None, app_field=True):
	"""What "Allow phone punch too" would do for one employee, or why it cannot.

	`emp` is the Employee's fields. `login_user` is their own login — the one
	`user_id` names, or else the one its email names — as `{name, enabled,
	username}`, or None when there is none. `app_user` is the login
	`custom_app_login` names, the same shape. `username_holder` is whichever
	login carries the Emp Code as its user name now, "" for none.
	`by_user_name` is System Settings → Allow Login using User Name (None:
	could not tell). `app_field` is whether the site has `custom_app_login`.

	**A login that already exists is never changed** (HR, 28 November 2026).
	The Manna HR app signs in with the Emp Code and the date of birth; every
	other app — the sales dashboard, CMMS, Fleet, the desk — with the person's
	own email and password. One Frappe login holds one password, so for
	somebody who already has a login the app gets a second one of its own,
	named after the Emp Code at STAND_IN_DOMAIN, with the Employee role alone,
	on `custom_app_login`. Their own login keeps its password; a birthday
	opens their punches and nothing else.

	The rule this replaces (27 November) set an employee-only login's user
	name and password to the Emp Code and the date of birth. Roles were what
	it judged "employee-only" by, and the sales app is opened by flags on the
	User, not a role, so 22 people's own passwords became their birthdays.

	The one thing taken off an existing login is the Emp Code as its user
	name, when it is this person's own login that holds it (that rule put it
	there): the app login needs it, and the login it leaves still signs in
	with its email. Its password is not touched (`free_username`).
	"""
	method = str(emp.get("custom_punch_method") or "")
	code = str(emp.get("employee_number") or "").strip()
	dob = first_password(emp.get("date_of_birth"))
	out = {
		"method": method,
		"on": False,
		"login": "",
		"own_login": "",
		"make_login": False,
		"make_app_login": False,
		"free_username": "",
		"sign_in_as": "",
		"password": "",
		"problems": [],
		"warnings": [],
		"stand_in": False,
	}
	if str(emp.get("status") or "Active") != "Active":
		out["problems"].append("This employee is not Active.")

	def needs_code_and_birth(what):
		if not code:
			out["problems"].append("No Emp Code on the record. It is the user name they sign in with.")
		if not dob:
			out["problems"].append("No date of birth on the record. It is {0}.".format(what))

	def code_is_free():
		holder = str(username_holder or "")
		if not code or not holder or holder == out["login"]:
			return
		if login_user and holder == login_user["name"]:
			out["free_username"] = holder
			out["warnings"].append(
				"{0} is the user name of their own login {1} now. It moves to the app login; {1} signs in "
				"with its email and keeps its password.".format(code, holder))
		else:
			out["problems"].append("{0} is already the user name of {1}.".format(code, holder))

	if login_user and not is_stand_in(login_user["name"]):
		out["own_login"] = login_user["name"]

	if app_user:
		# The app's own login, made by this button before.
		out["login"] = app_user["name"]
		out["stand_in"] = is_stand_in(app_user["name"])
		out["sign_in_as"] = app_user.get("username") or app_user["name"]
		out["password"] = "date of birth, DDMMYYYY"
		out["on"] = method in PHONE_METHODS
		if not app_user.get("enabled"):
			out["problems"].append("Their app login {0} is turned off.".format(app_user["name"]))
	elif login_user and is_stand_in(login_user["name"]):
		# A login this button made for somebody with none: the app's own, on
		# `user_id` because it is the only login they have.
		out["login"] = login_user["name"]
		out["stand_in"] = True
		out["sign_in_as"] = login_user.get("username") or login_user["name"]
		out["password"] = "date of birth, DDMMYYYY"
		out["on"] = method in PHONE_METHODS and bool(emp.get("user_id"))
		if not login_user.get("enabled"):
			out["problems"].append(
				"Their login {0} is turned off. Turn on the login above first.".format(login_user["name"]))
	elif login_user:
		# Their own login: left exactly as it is. The app gets one of its own.
		out["login"] = stand_in_email(code)
		out["stand_in"] = True
		out["make_app_login"] = True
		out["sign_in_as"] = code
		out["password"] = "date of birth, DDMMYYYY"
		needs_code_and_birth("the app login's password")
		code_is_free()
		if not app_field:
			out["problems"].append("The site has no App Login field on Employee yet.")
	else:
		email = email_of(emp) or stand_in_email(code)
		out["stand_in"] = is_stand_in(email)
		if out["stand_in"]:
			out["warnings"].append(
				"No email on the record, so the login is named {0}. They sign in with their Emp Code; "
				"Forgot password cannot email them.".format(email))
		out["login"] = email
		out["make_login"] = True
		out["sign_in_as"] = code
		out["password"] = "date of birth, DDMMYYYY"
		needs_code_and_birth("their first password")
		code_is_free()

	if not emp.get("default_shift"):
		out["warnings"].append("No default shift: the punches will land, but will not become attendance until a shift is set.")
	if by_user_name is False and out["sign_in_as"] and "@" not in out["sign_in_as"]:
		out["warnings"].append(
			"The site does not allow signing in with a user name (System Settings → Allow Login using "
			"User Name), so until that is ticked they sign in with {0}.".format(out["login"] or "their email"))
	return out


def phone_method_after(method):
	"""The punch method once phone punch is allowed: a machine person keeps the
	machine, so it is Both; Mobile App stays as it is."""
	return method if method in PHONE_METHODS else "Both"
