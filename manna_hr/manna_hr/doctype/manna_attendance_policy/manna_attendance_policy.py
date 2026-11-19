import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr import attpolicy


class MannaAttendancePolicy(Document):
	"""The rules are `manna_hr/attpolicy.py`; this keeps the numbers honest
	and puts them onto the Shift Types the policy names."""

	def validate(self):
		problems = attpolicy.policy_problems(self.as_dict())
		if problems:
			frappe.throw("<br>".join(_(p) for p in problems), title=_("These numbers disagree"))
		self._check_scopes()
		self._one_default()
		self._one_policy_per_shift()
		sources = (self.penalty_deduct_from, self.early_deduct_from, self.hours_deduct_from)
		if any(x and x != attpolicy.DEDUCT_LWP for x in sources) and not self.casual_leave_type:
			frappe.throw(_("Name the Casual Leave type penalties come from first."), title=_("Which leave?"))

	def on_update(self):
		from manna_hr import attpolicy_site

		attpolicy_site.push_to_shifts(self)

	def _check_scopes(self):
		seen = set()
		for row in self.scopes or []:
			value = (row.value or "").strip()
			row.value = value
			if not frappe.db.exists(row.applies_on, value):
				frappe.throw(
					_("Row {0}: there is no {1} called {2}.").format(row.idx, row.applies_on, value),
					title=_("Not on the site"),
				)
			# Frappe fills an empty Company from the signer's own default, so a
			# policy meant for everybody can arrive scoped to one company — and
			# then applies to nobody it names. Said here rather than found in pay.
			if self.company and row.applies_on in ("Employee", "Department"):
				theirs = frappe.db.get_value(row.applies_on, value, "company")
				if theirs and theirs != self.company:
					frappe.throw(
						_("Row {0}: {1} is in {2}, but this policy is for {3} only. Clear Company, or change the row.")
						.format(row.idx, value, theirs, self.company),
						title=_("Another company"),
					)
			if (row.applies_on, value) in seen:
				frappe.throw(_("Row {0} repeats {1} {2}.").format(row.idx, row.applies_on, value))
			seen.add((row.applies_on, value))

	def _one_default(self):
		if not (self.is_active and self.is_default):
			return
		if self.scopes:
			frappe.throw(_("A default policy applies to everybody else, so it names nobody under Applies To."))
		other = frappe.db.get_value(self.doctype, {"is_default": 1, "is_active": 1, "name": ("!=", self.name)}, "name")
		if other:
			frappe.throw(_("{0} is already the default. Untick it there first.").format(other), title=_("Two defaults"))

	def _one_policy_per_shift(self):
		if not self.is_active:
			return
		mine = [r.shift_type for r in self.shift_types or []]
		if len(mine) != len(set(mine)):
			frappe.throw(_("A Shift Type is listed twice."))
		for shift in mine:
			other = frappe.db.sql(
				"""SELECT p.name FROM `tabManna Attendance Policy Shift` s
				JOIN `tabManna Attendance Policy` p ON p.name = s.parent
				WHERE s.shift_type = %s AND p.is_active = 1 AND p.name != %s LIMIT 1""",
				(shift, self.name or ""),
			)
			if other:
				frappe.throw(
					_("{0} is already set by {1}. One policy sets a Shift Type.").format(shift, other[0][0]),
					title=_("Shift already set"),
				)
