"""The master behind Document Entry's type list.

The list used to be an array in `client/src/data/onboard.js`, which is why six
of its eight entries were drawn dead: a type nobody can add without a deploy is
a type nobody adds. Here it is data, so HR adds the next one.
"""

import frappe
from frappe import _
from frappe.model.document import Document


class EmployeeDocumentType(Document):
	def validate(self):
		if self.has_expiry and (self.warn_days or 0) < 0:
			frappe.throw(_("Warn days cannot be negative."))

		# A type with no expiry has nothing to warn about, and a stale number
		# left in the box reads as a rule that is being applied.
		if not self.has_expiry:
			self.warn_days = 0

	def on_trash(self):
		"""Refuse to delete a type that documents have been filed under.

		Same rule as Letter Type, for the same reason: a document whose type has
		vanished is a document nobody can explain. `is_active` retires one.
		"""
		filed = frappe.db.count("Employee Document", {"document_type": self.name})
		if filed:
			frappe.throw(
				_("{0} document(s) are filed under this type. Untick Is Active to retire it instead.").format(filed)
			)
