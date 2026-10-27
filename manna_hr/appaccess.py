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
