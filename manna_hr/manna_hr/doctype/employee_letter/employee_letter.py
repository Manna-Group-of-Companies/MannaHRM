import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr.letters import merge

#: The employee fields the merge reads. Fetched in one go rather than by loading
#: the whole document per letter — bulk generation does this four hundred times
#: from one spreadsheet, and the site has a daily compute limit
#: (docs/OPEN_QUESTIONS.md §0).
EMPLOYEE_FIELDS = [
	"name", "employee_name", "employee_number", "company", "department", "designation",
	"branch", "date_of_joining", "relieving_date", "date_of_birth", "gender",
	"marital_status", "cell_number", "company_email", "personal_email",
	"current_address", "permanent_address", "bank_name", "bank_ac_no",
	"passport_number", "ctc",
]

#: The custom fields the merge reads, which a site that has not run
#: `after_install` will not have. Asked for separately so their absence costs
#: `[[Token]]` in a letter rather than an error on every letter.
EMPLOYEE_CUSTOM_FIELDS = [
	"custom_nationality", "custom_father_name", "custom_spouse_name",
	"custom_religion", "custom_pan_no",
]


class EmployeeLetter(Document):
	def validate(self):
		if not self.letter_date:
			frappe.throw(_("A letter needs the date it was issued on."))

	def before_insert(self):
		"""Merge the letter and keep the text.

		**This is the point of the doctype.** Before it existed, bulk generation
		wrote a row naming an employee and a type and no text at all, and the
		letter was re-rendered from the template whenever somebody opened it —
		so a letter issued in March said something different in June if the
		person's designation had changed in between. An issued letter is a
		statement somebody was given on a date, not a view of their current
		record.

		Only when the body is empty. A caller that sends its own text has
		merged it already, in front of a person who read it before pressing
		Issue, and re-merging it here would silently replace what they approved.
		"""
		if (self.body or "").strip():
			return

		template = frappe.db.get_value("Letter Type", self.letter_type, "body")
		if not template:
			# A type with no template is a real state — several of Factor HR's
			# seventeen have not been transcribed yet. The letter is still a
			# record that one was issued, so this is not a refusal.
			return

		body, missing = merge(template, self._employee(), self._extra())
		self.body = body
		if missing:
			# Not a throw. A letter with a gap in it is somebody's job to fill,
			# and refusing to record that it was issued does not fill it — it
			# just means the register no longer knows. The gaps are visible in
			# the text as [[Token]], and this is the line that says so where
			# somebody generating four hundred of them will see it.
			frappe.msgprint(
				_("{0} has nothing behind {1} for this person: {2}")
				.format(self.letter_type, "these tokens" if len(missing) > 1 else "this token",
					", ".join(missing)),
				title=_("Issued with gaps"),
				indicator="orange",
			)

	def _employee(self):
		record = frappe.db.get_value("Employee", self.employee, EMPLOYEE_FIELDS, as_dict=True) or {}
		for field in EMPLOYEE_CUSTOM_FIELDS:
			# One at a time and forgiving: a site without `after_install`'s
			# custom fields should print `[[PAN No]]`, not fail the letter.
			try:
				record[field] = frappe.db.get_value("Employee", self.employee, field)
			except Exception:
				record[field] = ""
		return record

	def _extra(self):
		"""What the letter knows that the employee record does not."""
		return {
			"letternumber": self.letter_number,
			"referencenumber": self.reference_number,
			"letterdate": frappe.utils.formatdate(self.letter_date),
			"currentdate": frappe.utils.formatdate(frappe.utils.today()),
			"remarks": self.remarks,
		}
