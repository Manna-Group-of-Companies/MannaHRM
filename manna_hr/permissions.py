"""Who may see and decide a correction.

## The hole this closes

`docs/SCHEMA.md` §5 has said since it was written that
`Manna Attendance Approver` sees "their reports only". It did not. The role had
`read` and `write` on `Attendance Regularization` and nothing narrowing which
rows, so a supervisor at one company could list — and decide — every correction
in the group. Nothing announced it, which is the point CLAUDE.md §5 makes about
per-company scoping and which turns out to apply to this role as well: an
omission here is a leak rather than a lockout, and a leak looks exactly like
everything working.

The approval workflow closed half of it — a `Manna Attendance Approver` can only
*act* on requests routed to a reporting manager. This closes the other half:
which rows they can see at all.

## Two hooks, because Frappe asks the question twice

`permission_query_conditions` filters a **list**; `has_permission` decides a
**single document**. A system with only the first has a list that hides a row
and a URL that still opens it, which is worse than no restriction at all,
because it reads as private.

## Which way this rounds

The rest of this app rounds towards letting a doubtful punch through — refusing
somebody who did turn up costs them a day's pay, and a doubtful punch costs a
flag on a report (CLAUDE.md §4). **This file rounds the other way and it is
worth saying so out loud**, because the two look inconsistent until you say what
is being risked. A punch wrongly refused is money taken from somebody; a row
wrongly hidden is a person clicking Refresh and asking HR. So a reader this
module cannot place sees nothing rather than everything.

`Administrator` never reaches here — Frappe skips query conditions for that user
outright — and neither does a bench script, which is what keeps
`regularization.apply` able to write checkins for anybody.
"""

DOCTYPE = "Attendance Regularization"

#: Roles that read the whole group. `HR Manager` is hrms' own and is the seat
#: this system's escape hatch belongs to — somebody has to be able to unstick a
#: badly routed request. `System Manager` is on the list because a site
#: administrator who cannot read a doctype cannot support it.
UNRESTRICTED_ROLES = frozenset({"HR Manager", "System Manager", "Administrator"})

#: The normal HR seat. Not restricted *here*, and that is not an oversight —
#: `HR User` is narrowed by a User Permission on `Company`, which Frappe applies
#: on its own and which is the only per-company scoping this project has
#: (CLAUDE.md §5). Adding a second, different rule in this file would mean two
#: places to look when somebody cannot see a row.
COMPANY_SCOPED_ROLES = frozenset({"HR User"})

#: Returned instead of a list when the reader is not narrowed at all. A sentinel
#: rather than `None`, because `None` and "an empty list of people" are the two
#: answers here that must never be confused: one means everybody, the other
#: means nobody, and they differ by one falsy check.
UNRESTRICTED = object()


def visible_employees(roles, employee, reports):
	"""Whose corrections this reader may see.

	Pure — no `frappe`, so the rule can be argued about without a site, the way
	`rules.py` is (CLAUDE.md §3). Everything below this function is plumbing.

	`roles`     what the site says this user holds
	`employee`  their own `Employee` name, or "" if they have no employee record
	`reports`   the `Employee` names whose `reports_to` is them

	Returns `UNRESTRICTED`, or a sorted tuple of `Employee` names — possibly
	empty, which means this reader sees nothing.
	"""
	roles = set(roles or ())

	if roles & UNRESTRICTED_ROLES:
		return UNRESTRICTED
	if roles & COMPANY_SCOPED_ROLES:
		return UNRESTRICTED

	allowed = set()

	# An approver sees the people who report to them. Direct reports only —
	# `approver_type_for` decides "Reporting Manager" from whether `reports_to`
	# is set at all, so the two agree at one level and would stop agreeing at
	# two. Whether a manager's manager should see the same queue is a real
	# question and not one to answer by accident here.
	if "Manna Attendance Approver" in roles:
		allowed.update(reports or ())

	# Anybody with an employee record sees their own, whatever else they hold.
	# Including an approver: their own correction is routed to HR and they may
	# not decide it, but not being able to *read* the request you raised is a
	# system people work around by raising it again.
	if employee:
		allowed.add(employee)

	return tuple(sorted(allowed))


def sql_condition(visible, table="`tabAttendance Regularization`"):
	"""`visible_employees`' answer as an SQL fragment for Frappe to AND in.

	Pure, and separate from the rule above so the rule can be read without SQL
	in the way of it.
	"""
	if visible is UNRESTRICTED:
		return ""
	if not visible:
		# Nobody. Not an empty string — an empty string is Frappe's "no
		# restriction", so returning one here would turn "this reader sees
		# nothing" into "this reader sees everything" with no error anywhere.
		return "1 = 0"

	names = ", ".join(_quote(name) for name in visible)
	return f"{table}.`employee` in ({names})"


def _quote(value):
	"""One `Employee` name as a SQL literal.

	These are document names — `HR-EMP-00001` — and not user input, but they
	reach here through `reports_to`, which is a field somebody can edit. A
	quoting function is three lines and the alternative is a place where an
	apostrophe changes the meaning of a permission clause.
	"""
	return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


# ---------------------------------------------------------------- the hooks ---


def _context(user):
	"""What the site says about this reader. The only part that needs frappe."""
	import frappe

	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	employee = frappe.db.get_value("Employee", {"user_id": user}, "name") or ""
	reports = (
		frappe.get_all("Employee", filters={"reports_to": employee}, pluck="name")
		if employee
		else []
	)
	return roles, employee, reports


def regularization_query(user=None):
	"""`permission_query_conditions` — narrows every list read of the doctype.

	Reached by the desk list, the REST list endpoint, `frappe.get_all`, and so
	by the register report and by the dashboard's queue. One rule, every path.
	"""
	return sql_condition(visible_employees(*_context(user)))


def regularization_has_permission(doc, ptype=None, user=None):
	"""`has_permission` — the same rule for one document.

	Without this, a row hidden from the list is still readable by URL, and a
	list that hides what a link reveals is worse than one that hides nothing:
	it reads as private.
	"""
	visible = visible_employees(*_context(user))
	if visible is UNRESTRICTED:
		return True
	return bool(doc) and doc.get("employee") in visible


# ------------------------------------------------------------------ letters ---

LETTER_DOCTYPE = "Employee Letter"


def letter_query(user=None):
	"""`permission_query_conditions` for `Employee Letter`.

	The same rule with one deliberate difference: **an approver does not see
	their reports' letters.** They see their reports' *corrections*, because
	deciding one is their job. A letter is not — it can carry a salary, a
	warning or a reason for leaving, and the fact that somebody signs off your
	attendance does not make those theirs to read.

	So: HR sees all, everybody else sees their own.
	"""
	roles, employee, _reports = _context(user)
	return sql_condition(
		visible_employees(roles, employee, []),
		table=f"`tab{LETTER_DOCTYPE}`",
	)


def letter_has_permission(doc, ptype=None, user=None):
	"""The same rule for one letter, so a hidden row is not an open URL."""
	roles, employee, _reports = _context(user)
	visible = visible_employees(roles, employee, [])
	if visible is UNRESTRICTED:
		return True
	return bool(doc) and doc.get("employee") in visible


# ---------------------------------------------------------------- documents ---

DOCUMENT_DOCTYPE = "Employee Document"


def document_query(user=None):
	"""`permission_query_conditions` for `Employee Document`.

	**This is the one that would have leaked worst.** Before the register
	existed a passport number was a field on `Employee`, and Frappe's own
	Employee permissions decided who saw it. Moving documents into rows of their
	own moved them out from under that, and the doctype grants `read` to
	`Employee` so a person can see their own file — which without this reads as
	*everybody's* file. A hundred and thirty-nine passport numbers, every visa,
	every residence card, listed to anyone with a login.

	Same shape as letters, and for a sharper version of the same reason: an
	approver signs off attendance, and that does not make somebody's passport
	theirs to read. HR sees all; everybody else sees their own.
	"""
	roles, employee, _reports = _context(user)
	return sql_condition(
		visible_employees(roles, employee, []),
		table=f"`tab{DOCUMENT_DOCTYPE}`",
	)


def document_has_permission(doc, ptype=None, user=None):
	"""The same rule for one document, so a hidden row is not an open URL."""
	roles, employee, _reports = _context(user)
	visible = visible_employees(roles, employee, [])
	if visible is UNRESTRICTED:
		return True
	return bool(doc) and doc.get("employee") in visible


# -------------------------------------------------------------- assignments ---

ASSIGNMENT_DOCTYPE = "Asset Assignment"


def assignment_query(user=None):
	"""`permission_query_conditions` for `Asset Assignment`.

	Same shape as letters and documents, and the reason is narrower than either:
	a handover row carries a recovery amount, which is a sum of money somebody
	is being asked to pay. `Employee` holds `read` on the doctype so a person
	can see what is out in their own name; without this line that is what
	everybody owes, listed to anyone with a login.
	"""
	roles, employee, _reports = _context(user)
	return sql_condition(
		visible_employees(roles, employee, []),
		table=f"`tab{ASSIGNMENT_DOCTYPE}`",
	)


def assignment_has_permission(doc, ptype=None, user=None):
	"""The same rule for one handover, so a hidden row is not an open URL."""
	roles, employee, _reports = _context(user)
	visible = visible_employees(roles, employee, [])
	if visible is UNRESTRICTED:
		return True
	return bool(doc) and doc.get("employee") in visible
