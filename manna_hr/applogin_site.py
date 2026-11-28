"""Which logins are an employee's: `user_id`, and the app's own login.

Since 28 November 2026 somebody whose `user_id` is their own login — their
email and password, used by every other app — signs in to the Manna HR app
with a second login, named on `Employee.custom_app_login` (appaccess.phone_punch
says why). Everything that asked "is this login that employee?" by `user_id`
alone asks here, so a punch from the app login is the person's own and not
refused as somebody else's.

`custom_app_login` is a custom field, on a site only once the patch has run;
until then this answers by `user_id` alone, as before.
"""

import frappe

FIELD = "custom_app_login"


def has_field():
	return bool(frappe.get_meta("Employee").has_field(FIELD))


def app_login_of(employee):
	"""The employee's App Login, or "" (also on a site without the field)."""
	if not employee or not has_field():
		return ""
	return frappe.db.get_value("Employee", employee, FIELD) or ""


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


# ---------------------------------------------------------------- the hooks ---


def keep_app_login_role(doc, method=None):
	"""User `validate`: an App Login keeps the Employee role.

	ERPNext's own User `validate` (employee.validate_employee_role) removes
	Employee from any login no Employee names in `user_id`, which is every App
	Login. Without the role it can read nothing and punch nothing. This hook is
	manna_hr's, so it runs after ERPNext's (apps run in install order, and
	manna_hr requires hrms) and puts back only Employee, only on a login an
	Employee names as its App Login.
	"""
	if not has_field() or not frappe.db.exists("Employee", {FIELD: doc.name}):
		return
	if "Employee" not in {r.role for r in doc.get("roles") or []}:
		doc.append_roles("Employee")


def on_employee_update(doc, method=None):
	"""Employee `on_update`: somebody who is no longer Active has their App
	Login turned off, as ERPNext turns off the `user_id` one
	(Employee.update_user_status). It is not turned back on by itself: HR
	does that, on Settings → App users or with Login (every app)."""
	if doc.status == "Active" or not has_field():
		return
	login = doc.get(FIELD)
	if not login or login == doc.user_id or not frappe.db.get_value("User", login, "enabled"):
		return
	user = frappe.get_doc("User", login)
	user.flags.ignore_permissions = True
	user.enabled = 0
	user.save(ignore_permissions=True)
