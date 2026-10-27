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
	if not login:
		return {"login": "", "why": _("This employee has no login."), "apps": []}
	info = _info(login)
	return {
		"login": login,
		"why": aa.why_not(frappe.session.user, frappe.get_roles(), login, info["roles"]),
		"apps": aa.states(info),
	}


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
