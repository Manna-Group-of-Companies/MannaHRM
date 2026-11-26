"""Apps & access on the site: read one person's switches, and change one.

The rules are `appaccess.py`. Everything here is asking the site and writing
to it, as the signed-in HR login — whose roles `why_not` judges first.
"""

import frappe
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
	code = str(emp.get("employee_number") or "").strip()
	holder = ""
	if code and not login_user:
		holder = frappe.db.get_value("User", {"username": code}, "name") or ""
	by_name = frappe.db.get_single_value("System Settings", "allow_login_using_user_name")
	return aa.phone_punch(emp, login_user, holder, None if by_name is None else bool(by_name))


@frappe.whitelist(methods=["POST"])
def allow_phone_punch(employee):
	"""Let one employee punch on the phone as well as on the machine.

	Punch Method becomes Both (Mobile App stays), and `user_id` names a login
	the Manna HR app signs in with: the one already linked, or the one already
	named by their email, or — when there is none — a new one with the Emp
	Code as its user name, the date of birth as its first password and the
	Employee role. An existing login's user name and password are left alone
	(`aa.phone_punch` says why). Returns `get_access` as it now is.
	"""
	frappe.only_for(aa.MANAGERS)
	plan = _phone(employee)
	if plan["problems"]:
		frappe.throw("<br>".join(plan["problems"]))

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
			"new_password": aa.first_password(emp.date_of_birth),
			"roles": [{"role": "Employee"}],
		})
		# An HR Manager holds no write on User (see set_access). Who may do this
		# was `only_for`'s question; the login made carries the Employee role
		# alone. The date of birth is a first password the app makes them
		# replace, so the site's strength rule is not asked of it.
		user.flags.ignore_permissions = True
		user.flags.ignore_password_policy = True
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		said.append(_("made login {0} (user name {1}, first password the date of birth)").format(login, plan["sign_in_as"]))
	else:
		roles = frappe.get_roles(login)
		why = aa.why_not(frappe.session.user, frappe.get_roles(), login, roles)
		if why:
			frappe.throw(why, frappe.PermissionError)
		if "Employee" not in roles:
			user = frappe.get_doc("User", login)
			user.flags.ignore_permissions = True
			user.add_roles("Employee")
			said.append(_("added the Employee role to {0}").format(login))

	method = aa.phone_method_after(emp.get("custom_punch_method"))
	if emp.user_id != login:
		emp.user_id = login
		said.append(_("linked login {0}").format(login))
	if emp.get("custom_punch_method") != method:
		said.append(_("Punch Method {0} → {1}").format(emp.get("custom_punch_method") or _("blank"), method))
		emp.custom_punch_method = method
	emp.save()
	emp.add_comment("Info", _("Phone punch allowed: {0}").format("; ".join(said) or _("no change")))
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
