import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr.letters import tokens_in


class LetterType(Document):
	def validate(self):
		# A fact about the text, worked out from the text. Writing it by hand
		# would make it a second place to state the same thing, and the second
		# place is always the one that goes stale.
		self.fields_used = ", ".join(tokens_in(self.body))

	def on_trash(self):
		"""A type with letters against it does not get deleted.

		Frappe's own link validation catches this, and it is worth catching here
		as well for the sentence: an `Employee Letter` names its type by string
		and *keeps the text as it went out*, so deleting the type does not
		change any letter already issued — it only removes the ability to
		explain what one was. Retire it with `is_active` instead, which is what
		that field is for.
		"""
		issued = frappe.db.count("Employee Letter", {"letter_type": self.name})
		if issued:
			frappe.throw(
				_("{0} letters have been issued from {1}. Untick Is Active to retire it instead — "
				  "deleting it would leave those letters naming a type nobody can look up.")
				.format(issued, self.name),
				title=_("Still in use"),
			)
