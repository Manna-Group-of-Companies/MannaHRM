"""Apps & access on the site: read one person's switches, and change one.

The rules are `appaccess.py`. Everything here is asking the site and writing
to it, as the signed-in HR login — whose roles `why_not` judges first.
"""

import frappe
import frappe.permissions
from frappe import _

from manna_hr import applogin_site
from manna_hr import appaccess as aa


@frappe.whitelist()
def can_manage():
	"""Whether this login is shown Apps & access at all."""
	return bool(set(frappe.get_roles()) & set(aa.MANAGERS))


@frappe.whitelist()
def get_access(employee):
	"""The switches for one employee's login, and whether this login may flip them."""
	frappe.only_for(aa.MANAGERS)
	login = _login_of(employee)
	phone = _phone(employee)
	if not login:
		return {"login": "", "why": _("This employee has no login."), "apps": [], "phone": phone}
	info = _info(login)
	return {
		"login": login,
		"why": aa.why_not(frappe.session.user, frappe.get_roles(), login, info["roles"]),
		"apps": aa.states(info),
		"phone": phone,
	}


#: The Employee fields phone punch reads. `custom_punch_method` and
#: `custom_app_login` are manna_hr's own (install.py); the second is read only
#: once the site has it.
_PHONE_FIELDS = (
	"name", "employee_name", "first_name", "last_name", "employee_number", "status",
	"date_of_birth", "company_email", "personal_email", "prefered_email",
	"user_id", "custom_punch_method", "default_shift",
)

_USER_FIELDS = ["name", "enabled", "username"]


def _phone(employee):
	"""`aa.phone_punch` for one employee, with what it needs read off the site."""
	app_field = applogin_site.has_field()
	fields = list(_PHONE_FIELDS) + ([applogin_site.FIELD] if app_field else [])
	emp = frappe.db.get_value("Employee", employee, fields, as_dict=True) or {}
	code = str(emp.get("employee_number") or "").strip()
	# The login they already have - their record's, else their Fleet driver app
	# login, else one named by their email or by the stand-in a first press of
	# the button made. It is never changed: phone_punch gives the app its own
	# login beside it, unless it is the app's own already.
	email = aa.email_of(emp) or aa.stand_in_email(code)
	login, linked_problem = aa.existing_login(
		emp.get("user_id") or "",
		[] if emp.get("user_id") else _driver_logins(employee),
		email if email and frappe.db.exists("User", email) else "",
	)
	login_user = frappe.db.get_value("User", login, _USER_FIELDS, as_dict=True) if login else None

	app_login = emp.get(applogin_site.FIELD) or ""
	if not app_login and login_user and not aa.is_stand_in(login_user.name):
		# An app login a first press made, whose link to the record did not
		# land: link it rather than make a second.
		stand_in = aa.stand_in_email(code)
		if stand_in and frappe.db.exists("User", stand_in):
			app_login = stand_in
	app_user = frappe.db.get_value("User", app_login, _USER_FIELDS, as_dict=True) if app_login else None

	holder = frappe.db.get_value("User", {"username": code}, "name") if code else ""
	by_name = frappe.db.get_single_value("System Settings", "allow_login_using_user_name")
	out = aa.phone_punch(
		emp, login_user, holder or "", None if by_name is None else bool(by_name),
		app_user=app_user, app_field=app_field,
	)
	if linked_problem:
		out["problems"].append(linked_problem)
	return out


def _driver_logins(employee):
	"""The enabled Fleet driver app logins linked to this employee on the fleet
	dashboard (Fleet Driver Employee: driver -> employee). [] on a site without
	the fleet DocTypes."""
	if not frappe.db.exists("DocType", "Fleet Driver Employee"):
		return []
	drivers = frappe.get_all("Fleet Driver Employee", filters={"employee": employee}, pluck="driver")
	return [d for d in drivers if d and frappe.db.get_value("User", d, "enabled")]


@frappe.whitelist(methods=["POST"])
def allow_phone_punch(employee):
	"""Let one employee punch on the phone as well as on the machine.

	Punch Method becomes Both (Mobile App stays), and the Manna HR app gets a
	login that signs in with the Emp Code and the date of birth: a new one on
	`user_id` for somebody with no login, or — for somebody with a login of
	their own — a second one on `custom_app_login`. **No existing login's
	password is changed** (HR, 28 November 2026; `aa.phone_punch` says why).
	Returns `get_access` as it now is.
	"""
	# Everything this login is judged on is judged here, as this login: the
	# role, the record, and — for a login already there — `why_not`.
	frappe.only_for(aa.MANAGERS)
	caller = frappe.session.user
	plan = _phone(employee)
	if plan["problems"]:
		frappe.throw("<br>".join(plan["problems"]))
	login = plan["login"]
	if not plan["make_login"] and not plan["make_app_login"]:
		why = aa.why_not(caller, frappe.get_roles(), login, frappe.get_roles(login))
		if why:
			frappe.throw(why, frappe.PermissionError)

	# The writes are made as Administrator (26 November 2026). The live site's
	# ERPNext (16.32.3) adds the new login's Employee and Company User
	# Permissions in Employee.on_update with the signed-in login's rights, and
	# an HR Manager holds none on User Permission: MRP-293 was refused twice
	# ("does not have doctype access via role permission for document User
	# Permission"), the second time after those two were made here first. What
	# is written is fixed by the plan above, not by the caller: a login with
	# the Employee role alone, the two User Permissions that keep it to this
	# one record, the link and the punch method. The note says who asked.
	try:
		frappe.set_user("Administrator")
		said = _allow_phone_punch_writes(employee, plan)
		frappe.get_doc("Employee", employee).add_comment(
			"Info", _("Phone punch allowed by {0}: {1}").format(caller, "; ".join(said) or _("no change"))
		)
	finally:
		frappe.set_user(caller)
	return get_access(employee)


def _make_app_user(emp, login, code):
	"""A login with the Employee role alone, user name the Emp Code and password
	the date of birth. Only ever a new User: nothing in this file sets a
	password on a login that already exists."""
	first, _sp, rest = str(emp.employee_name or emp.first_name or login).strip().partition(" ")
	user = frappe.get_doc({
		"doctype": "User",
		"email": login,
		"username": code,
		"first_name": first,
		"last_name": rest.strip() or None,
		"enabled": 1,
		"user_type": "System User",
		"send_welcome_email": 0,
		"new_password": aa.first_password(emp.date_of_birth),
		"roles": [{"role": "Employee"}],
	})
	# The site's strength rule refuses a date over REST. It is the group's rule
	# for this login, which opens one person's punches and nothing else.
	user.flags.ignore_permissions = True
	user.flags.ignore_password_policy = True
	user.flags.no_welcome_mail = True
	user.insert(ignore_permissions=True)


def _allow_phone_punch_writes(employee, plan):
	"""The writes behind Allow phone punch too. Returns what was done, in words."""
	emp = frappe.get_doc("Employee", employee)
	login = plan["login"]
	code = plan["sign_in_as"]
	said = []
	if plan["free_username"]:
		# The user name alone, by a column write that cannot reach the
		# password: that login keeps signing in with its email and its own
		# password everywhere it did.
		frappe.db.set_value("User", plan["free_username"], "username", None, update_modified=False)
		said.append(_("user name {0} moved off {1}, whose password is unchanged").format(code, plan["free_username"]))

	if plan["make_login"] or (plan["make_app_login"] and not frappe.db.exists("User", login)):
		_make_app_user(emp, login, code)
		said.append(_("made login {0} (user name {1}, password the date of birth)").format(login, code))
	elif "Employee" not in frappe.get_roles(login):
		user = frappe.get_doc("User", login)
		user.flags.ignore_permissions = True
		user.add_roles("Employee")
		said.append(_("added the Employee role to {0}").format(login))

	# The two User Permissions that keep the login to this one Employee and its
	# Company. For `user_id` they are made before the save so on_update finds
	# them and adds nothing, and the Employee's Create User Permission tick
	# decides, as for ERPNext. The app login gets them always: its password is
	# a birthday, and they are what keep it to one person's record.
	if plan["make_app_login"] or emp.get("create_user_permission"):
		frappe.permissions.add_user_permission("Employee", emp.name, login, ignore_permissions=True)
		if emp.company:
			frappe.permissions.add_user_permission("Company", emp.company, login, ignore_permissions=True)

	method = aa.phone_method_after(emp.get("custom_punch_method"))
	if plan["make_app_login"]:
		if emp.get(applogin_site.FIELD) != login:
			emp.set(applogin_site.FIELD, login)
			said.append(_("app login {0} linked; {1} is not changed").format(login, plan["own_login"]))
	elif emp.user_id != login:
		emp.user_id = login
		said.append(_("linked login {0}").format(login))
	if emp.get("custom_punch_method") != method:
		said.append(_("Punch Method {0} → {1}").format(emp.get("custom_punch_method") or _("blank"), method))
		emp.custom_punch_method = method
	emp.save()
	return said


@frappe.whitelist(methods=["POST"])
def set_access(employee, key, value=None):
	"""Switch one app for one employee's login. Returns the switches as they now are."""
	frappe.only_for(aa.MANAGERS)
	login = _login_of(employee)
	roles = frappe.get_roles(login) if login else []
	why = aa.why_not(frappe.session.user, frappe.get_roles(), login, roles)
	if why:
		frappe.throw(why, frappe.PermissionError)

	if value in ("0", "false", "False", 0, False, None):
		value = ""
	elif value in ("1", "true", "True", 1, True):
		value = True
	try:
		changes = aa.plan(key, value, roles)
	except ValueError as e:
		frappe.throw(str(e))
	if key == "fleet_driver" and "Driver" in (changes.get("add_roles") or []):
		twice = aa.second_driver_login(login, _driver_logins(employee))
		if twice:
			frappe.throw(twice)
	if set(aa.granted(changes)) & set(aa.UNTOUCHABLE):
		frappe.throw(_("That would grant {0}.").format(", ".join(aa.granted(changes))), frappe.PermissionError)

	user = frappe.get_doc("User", login)
	# An HR Manager holds no write on User, and `add_roles`/`remove_roles` save
	# by themselves. Whether this login may make this change was `why_not`'s
	# question, answered above; the switch writes only its own app's part.
	user.flags.ignore_permissions = True
	said = []
	if "enabled" in changes:
		user.enabled = changes["enabled"]
		said.append(_("login enabled") if changes["enabled"] else _("login disabled"))
	if changes.get("flags"):
		for field, v in changes["flags"].items():
			user.set(field, v)
		said.append(_("Sales dashboard: {0}").format(
			next((l for f, l in aa.SALES_FLAGS if changes["flags"].get(f)), _("off"))))
	if changes.get("remove_roles"):
		user.remove_roles(*changes["remove_roles"])
		said.append(_("removed {0}").format(", ".join(changes["remove_roles"])))
	if changes.get("add_roles"):
		user.add_roles(*changes["add_roles"])
		said.append(_("added {0}").format(", ".join(changes["add_roles"])))
	if "enabled" in changes or changes.get("flags"):
		user.save(ignore_permissions=True)

	if "sales_person" in changes:
		_set_sales_person(login, changes["sales_person"])
		said.append(_("Field Sales: {0}").format(changes["sales_person"] or _("off")))

	frappe.get_doc("Employee", employee).add_comment(
		"Info", _("Apps & access, {0}: {1}").format(login, "; ".join(said) or _("no change"))
	)
	return get_access(employee)


def _set_sales_person(login, sales_person):
	"""One Sales Person per login: the old link is cleared before the new is made."""
	for name in frappe.get_all("Sales Person", filters={"custom_user": login}, pluck="name"):
		if name != sales_person:
			frappe.db.set_value("Sales Person", name, "custom_user", None)
	if not sales_person:
		return
	holder = frappe.db.get_value("Sales Person", sales_person, "custom_user")
	if holder and holder != login:
		frappe.throw(_("{0} is already the Sales Person for {1}.").format(sales_person, holder))
	frappe.db.set_value("Sales Person", sales_person, "custom_user", login)


def _login_of(employee):
	return frappe.db.get_value("Employee", employee, "user_id") or ""


def _info(login):
	user = frappe.db.get_value(
		"User", login, ["enabled", "user_type", *[f for f, _l in aa.SALES_FLAGS]], as_dict=True
	) or {}
	return {
		"enabled": user.get("enabled"),
		"user_type": user.get("user_type"),
		"roles": frappe.get_roles(login),
		"flags": {f: user.get(f) for f, _l in aa.SALES_FLAGS},
		"sales_person": frappe.db.get_value("Sales Person", {"custom_user": login, "is_group": 0}, "name") or "",
		"sales_people": frappe.get_all(
			"Sales Person",
			filters={"is_group": 0, "enabled": 1},
			or_filters=[["custom_user", "is", "not set"], ["custom_user", "=", login]],
			pluck="name",
			order_by="name asc",
		),
	}
