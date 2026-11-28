"""Which logins are an employee's: `user_id`, and the app's own login.

Since 28 November 2026 somebody with a login of their own — their email and
password, used by every other app — signs in to the Manna HR app with a second
login, named on `Employee.custom_app_login` (appaccess.phone_punch says why).
Everything that asked "is this login that employee?" by `user_id` alone asks
here, so a punch from the app login is the person's own and not refused as
somebody else's.

`custom_app_login` is a custom field, on a site only once the patch has run;
until then this answers by `user_id` alone, as before.
"""

import frappe

FIELD = "custom_app_login"


def has_field():
	return bool(frappe.get_meta("Employee").has_field(FIELD))


def logins_of(employee):
	"""The logins that are this employee's — `user_id`, the app login — as a set."""
	if not employee:
		return set()
	fields = ["user_id", FIELD] if has_field() else ["user_id"]
	row = frappe.db.get_value("Employee", employee, fields, as_dict=True) or {}
	return {v for v in row.values() if v}


def employee_of(user, **filters):
	"""The Employee this login is, by `user_id` first and then the app login, or ""."""
	if not user:
		return ""
	name = frappe.db.get_value("Employee", {"user_id": user, **filters}, "name")
	if not name and has_field():
		name = frappe.db.get_value("Employee", {FIELD: user, **filters}, "name")
	return name or ""
