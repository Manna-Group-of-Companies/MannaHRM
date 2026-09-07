"""One document, belonging to one person.

## Why this doctype exists

Before it, a document on this site was a *field on Employee* —
`passport_number`, `valid_upto`, `custom_pan_no`. That is why Document Entry
drew six of its eight types dead: there was nowhere to put a visa number, and
nowhere at all to put a second one. `client/src/data/onboard.js` says it in the
reason string on the dependant register: *"the record has to exist before the
document can."*

A field per document also cannot answer the question the screen is really for —
*whose paperwork expires next* — because a field has no row to sort.

## What is deliberately not here

**No approval.** A document is a fact somebody typed in, not a request. If a
number is wrong it is corrected, and `track_changes` says who corrected it.

**No link to Attendance.** An expired visa does not refuse a punch. It could,
and it must not: the gate is not where an immigration problem should first be
discovered, and refusing the punch would leave no record that the person was
there. It is reported, and a person decides.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from manna_hr import rules


class EmployeeDocument(Document):
	def validate(self):
		self._refuse_exact_duplicate()
		self._check_dates()
		self.set_status()

	def _refuse_exact_duplicate(self):
		"""The same number, of the same type, against the same person, twice.

		Two documents of one type are allowed on purpose — a renewed passport
		and the old one carrying a live visa is an ordinary situation, and a
		register that cannot hold both is a register people keep outside it.
		What is refused is the same *number* twice, which is somebody filing
		the same paper again rather than a second document.
		"""
		if not self.document_number:
			return

		twin = frappe.db.exists(
			"Employee Document",
			{
				"employee": self.employee,
				"document_type": self.document_type,
				"document_number": self.document_number,
				"name": ("!=", self.name or ""),
			},
		)
		if twin:
			frappe.throw(
				_("{0} {1} is already filed for this employee as {2}.").format(
					self.document_type, self.document_number, twin
				)
			)

	def _check_dates(self):
		if self.date_of_issue and self.valid_upto:
			if getdate(self.valid_upto) < getdate(self.date_of_issue):
				frappe.throw(_("Valid Upto is before Date Of Issue."))

	def set_status(self, on=None):
		"""Fill `status` and `days_to_expiry` from the dates.

		Stored rather than worked out on read, so the expiry watch is a list
		filter and a report rather than arithmetic that only runs when somebody
		opens a screen. The cost is that it goes stale overnight, which is what
		`manna_hr.onboard.refresh_document_status` is for.
		"""
		spec = frappe.db.get_value(
			"Employee Document Type",
			self.document_type,
			["has_expiry", "warn_days"],
			as_dict=True,
		) or {}

		status, days = rules.document_status(
			getdate(self.valid_upto) if self.valid_upto else None,
			getdate(on or today()),
			has_expiry=bool(spec.get("has_expiry", 1)),
			warn_days=spec.get("warn_days") or rules.DEFAULT_WARN_DAYS,
		)

		self.status = status
		self.days_to_expiry = days

	def on_update(self):
		self._keep_attachment_private()

	def _keep_attachment_private(self):
		"""A scan of somebody's passport is not a public URL.

		Frappe decides public or private at upload, and an upload that came in
		through a route which did not say gets a `/files/` URL anybody with the
		address can fetch. This moves it. It is done here rather than trusted to
		the uploader because there are three upload paths into this app and only
		one of them is ours.
		"""
		if not self.attachment or self.attachment.startswith("/private/"):
			return

		file_name = frappe.db.get_value(
			"File",
			{"file_url": self.attachment, "attached_to_name": self.name},
			"name",
		)
		if not file_name:
			return

		doc = frappe.get_doc("File", file_name)
		if not doc.is_private:
			doc.is_private = 1
			doc.save(ignore_permissions=True)
			self.db_set("attachment", doc.file_url, update_modified=False)
