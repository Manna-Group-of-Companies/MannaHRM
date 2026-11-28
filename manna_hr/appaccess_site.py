"""Apps & access on the site: read one person's switches, and change one.

The rules are `appaccess.py`. Everything here is asking the site and writing
to it, as the signed-in HR login — whose roles `why_not` judges first.
"""

import frappe
import frappe.permissions
from frappe import _

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


#: The Employee fields phone punch reads. `custom_punch_method` is manna_hr's
#: own (install.py).
_PHONE_FIELDS = (
	"name", "employee_name", "first_name", "last_name", "employee_number", "status",
	"date_of_birth", "company_email", "personal_email", "prefered_email",
	"user_id", "custom_punch_method", "default_shift",
)


def _phone(employee):
	"""`aa.phone_punch` for one employee, with what it needs read off the site."""
	emp = frappe.db.get_value("Employee", employee, list(_PHONE_FIELDS), as_dict=True) or {}
	login = emp.get("user_id") or ""
	if not login:
		# A login already named by their email, or by the stand-in a first press
		# of the button made, is the one to link rather than a second.
		email = aa.email_of(emp) or aa.stand_in_email(emp.get("employee_number"))
		if email and frappe.db.exists("User", email):
			login = email
	login_user = None
	if login:
		login_user = frappe.db.get_value("User", login, ["name", "enabled", "username"], as_dict=True)
		if login_user:
			# What decides whether this login may be set to the Emp Code and
			# date of birth (aa.app_only).
			login_user["roles"] = frappe.get_roles(login)
	code = str(emp.get("employee_number") or "").strip()
	holder = ""
	if code:
		holder = frappe.db.get_value("User", {"username": code, "name": ["!=", login or ""]}, "name") or ""
	by_name = frappe.db.get_single_value("System Settings", "allow_login_using_user_name")
	return aa.phone_punch(emp, login_user, holder, None if by_name is None else bool(by_name))


@frappe.whitelist(methods=["POST"])
def allow_phone_punch(employee, username=None, email=None, password=None):
	"""Let one employee punch on the phone as well as on the machine.

	Punch Method becomes Both (Mobile App stays), and `user_id` names a login
	the Manna HR app signs in with: the one already linked, or the one already
	named by their email, or — when there is none — a new one with the Emp
	Code as its user name, the date of birth as its first password and the
	Employee role. An existing login's user name and password are left alone
	(`aa.phone_punch` says why). Returns `get_access` as it now is.
	"""
	# Everything this login is judged on is judged here, as this login: the
	# role, the record, and — for a login already there — `why_not`.
	frappe.only_for(aa.MANAGERS)
	caller = frappe.session.user
	plan = _phone(employee)
	# HR may name the new login itself on Create Employee (28 Nov 2026): a user
	# name, an email and a password. Only for a login being made here; one
	# already there keeps its own, as above.
	if plan["make_login"]:
		chosen = aa.chosen_login(username, email, password)
		if chosen["problems"]:
			frappe.throw("<br>".join(chosen["problems"]))
		if chosen["username"] and chosen["username"] != plan["sign_in_as"]:
			if frappe.db.exists("User", {"username": chosen["username"]}):
				frappe.throw(_("User name {0} is already somebody's login.").format(chosen["username"]))
			plan["sign_in_as"] = chosen["username"]
			plan["problems"] = [p for p in plan["problems"] if "user name" not in p.lower()]
		if chosen["email"]:
			if frappe.db.exists("User", chosen["email"]):
				frappe.throw(_("{0} is already somebody's login.").format(chosen["email"]))
			plan["login"] = chosen["email"]
		plan["password"] = chosen["password"]
		if chosen["password"]:
			plan["problems"] = [p for p in plan["problems"] if "date of birth" not in p.lower()]
	if plan["problems"]:
		frappe.throw("<br>".join(plan["problems"]))
	login = plan["login"]
	if not plan["make_login"]:
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


def _allow_phone_punch_writes(employee, plan):
	"""The writes behind Allow phone punch too. Returns what was done, in words."""
	emp = frappe.get_doc("Employee", employee)
	login = plan["login"]
	said = []
	if plan["make_login"]:
		first, _sp, rest = str(emp.employee_name or emp.first_name or login).strip().partition(" ")
		user = frappe.get_doc({
			"doctype": "User",
			"email": login,
			"username": plan["sign_in_as"],
			"first_name": first,
			"last_name": rest.strip() or None,
			"enabled": 1,
			"user_type": "System User",
			"send_welcome_email": 0,
			"new_password": plan.get("password") or aa.first_password(emp.date_of_birth),
			"roles": [{"role": "Employee"}],
		})
		# The date of birth is a first password the app makes them replace, so
		# the site's strength rule is not asked of it.
		user.flags.ignore_permissions = True
		user.flags.ignore_password_policy = True
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		said.append(_("made login {0} (user name {1}, password {2})").format(
			login, plan["sign_in_as"], _("set by HR") if plan.get("password") else _("the date of birth")))
	else:
		if plan.get("reset_login"):
			said.append(_set_emp_code_login(login, plan["sign_in_as"], emp.date_of_birth))
		if "Employee" not in frappe.get_roles(login):
			user = frappe.get_doc("User", login)
			user.flags.ignore_permissions = True
			user.add_roles("Employee")
			said.append(_("added the Employee role to {0}").format(login))

	# The two User Permissions that keep the login to this one Employee and its
	# Company, made before the save so on_update finds them and adds nothing.
	# The Employee's own Create User Permission tick decides, as for ERPNext.
	if emp.get("create_user_permission"):
		frappe.permissions.add_user_permission("Employee", emp.name, login, ignore_permissions=True)
		if emp.company:
			frappe.permissions.add_user_permission("Company", emp.company, login, ignore_permissions=True)

	method = aa.phone_method_after(emp.get("custom_punch_method"))
	if emp.user_id != login:
		emp.user_id = login
		said.append(_("linked login {0}").format(login))
	if emp.get("custom_punch_method") != method:
		said.append(_("Punch Method {0} → {1}").format(emp.get("custom_punch_method") or _("blank"), method))
		emp.custom_punch_method = method
	emp.save()
	return said


def _set_emp_code_login(login, code, dob):
	"""User name the Emp Code, password the date of birth, switched on — for a
	login that holds nothing but the employee's own roles (aa.app_only, checked
	by the caller's plan). The site's strength rule refuses a date as a
	password over REST, so it is set here with that rule waived, as for a
	login made by this button (27 November 2026)."""
	user = frappe.get_doc("User", login)
	user.username = code
	user.new_password = aa.first_password(dob)
	user.enabled = 1
	user.flags.ignore_permissions = True
	user.flags.ignore_password_policy = True
	user.save(ignore_permissions=True)
	return _("login {0} set to user name {1} and the date of birth").format(login, code)


@frappe.whitelist(methods=["POST"])
def reset_app_login(employee):
	"""Set one employee's phone-app login back to the group's rule: user name
	the Emp Code, password the date of birth (HR, 27 November 2026). For a
	forgotten password, and for logins made before the rule. Only a login that
	holds nothing but the employee's own roles; any other is somebody's way
	into another system and is refused with the reason. Returns `get_access`."""
	frappe.only_for(aa.MANAGERS)
	caller = frappe.session.user
	plan = _phone(employee)
	login = plan["login"]
	if not login or plan["make_login"]:
		frappe.throw(_("This employee has no login yet. Use Allow phone punch too."))
	if not plan.get("reset_login"):
		frappe.throw("<br>".join(plan["warnings"]) or _("This login is not the phone app's alone, so it is left as it is."))
	if plan["problems"]:
		frappe.throw("<br>".join(plan["problems"]))
	why = aa.why_not(caller, frappe.get_roles(), login, frappe.get_roles(login))
	if why:
		frappe.throw(why, frappe.PermissionError)
	dob = frappe.db.get_value("Employee", employee, "date_of_birth")
	try:
		frappe.set_user("Administrator")
		said = _set_emp_code_login(login, plan["sign_in_as"], dob)
		frappe.get_doc("Employee", employee).add_comment(
			"Info", _("Phone app login reset by {0}: {1}").format(caller, said))
	finally:
		frappe.set_user(caller)
	return get_access(employee)


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
