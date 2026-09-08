"""One person's answers, or nobody's on an anonymous survey."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, today

from manna_hr import rules


class EmployeeSurveyResponse(Document):
	def validate(self):
		survey = frappe.db.get_value(
			"Employee Survey",
			self.survey,
			["status", "start_date", "end_date", "is_anonymous"],
			as_dict=True,
		)
		if not survey:
			return

		self._strip_identity(survey)
		self._check_open(survey)
		self._check_one_each(survey)
		self._check_required()

		if self.status == "Submitted" and not self.submitted_on:
			self.submitted_on = now_datetime()

	def _strip_identity(self, survey):
		"""On an anonymous survey the employee is removed, not hidden.

		A permission is a promise somebody can change later; an empty column is
		one nobody can. This runs before every other check so nothing downstream
		can reintroduce the name.
		"""
		if survey.is_anonymous:
			self.employee = None
			self.employee_name = None
			self.company = None

	def _check_open(self, survey):
		if self.status != "Submitted":
			return
		if not rules.survey_is_open(survey.status, today(), survey.start_date, survey.end_date):
			frappe.throw(_("{0} is not open for answers.").format(self.survey))

	def _check_one_each(self, survey):
		"""One response per person, on a survey that knows who people are.

		Not enforced on an anonymous one, because there is nothing to enforce it
		against — and a hidden per-person key that made it enforceable would be
		the anonymity gone.
		"""
		if survey.is_anonymous or not self.employee:
			return
		twin = frappe.db.exists(
			"Employee Survey Response",
			{"survey": self.survey, "employee": self.employee, "name": ["!=", self.name or ""]},
		)
		if twin:
			frappe.throw(_("{0} has already answered this survey.").format(self.employee_name or self.employee))

	def _check_required(self):
		if self.status != "Submitted":
			return
		questions = frappe.get_all(
			"Employee Survey Question",
			filters={"parent": self.survey, "parenttype": "Employee Survey"},
			fields=["question_no", "is_required"],
		)
		missing = rules.survey_answer_problems(questions, self.answers)
		if missing:
			frappe.throw(
				_("Question {0} has to be answered.").format(", ".join(str(n) for n in missing))
			)
