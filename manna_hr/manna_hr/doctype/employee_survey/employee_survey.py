"""One survey, its questions, and who may answer it."""

import frappe
from frappe import _
from frappe.model.document import Document


class EmployeeSurvey(Document):
	def validate(self):
		self._number_questions()
		self._freeze_anonymity()
		self._check_choices()

	def _number_questions(self):
		"""Number them from their order on the form, every save.

		The number is what an answer is keyed to, so it cannot be typed: a
		question renumbered by hand orphans every answer already given to it.
		"""
		for i, q in enumerate(self.questions or [], start=1):
			q.question_no = i

	def _freeze_anonymity(self):
		"""Anonymity is decided before the first answer and never after.

		A survey that was anonymous and is then not exposes people who answered
		on the promise that it was. There is no way to undo that once the
		responses carry names, so the change is refused while any exist — which
		is a sentence somebody reads, rather than a decision they make without
		noticing.
		"""
		if self.is_new():
			return
		was = frappe.db.get_value("Employee Survey", self.name, "is_anonymous")
		if int(was or 0) == int(self.is_anonymous or 0):
			return
		if frappe.db.exists("Employee Survey Response", {"survey": self.name}):
			frappe.throw(
				_(
					"This survey already has responses, so whether it is anonymous cannot change. "
					"Close it and open a new one."
				)
			)

	def _check_choices(self):
		for q in self.questions or []:
			if q.answer_type in ("Single Choice", "Multiple Choice") and not (q.options or "").strip():
				frappe.throw(
					_("Question {0} offers a choice and lists nothing to choose from.").format(
						q.question_no
					)
				)
