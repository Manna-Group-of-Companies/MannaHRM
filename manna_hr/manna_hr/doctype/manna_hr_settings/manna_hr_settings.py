import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr import rules


class MannaHRSettings(Document):
	def validate(self):
		if self.default_radius_metres is not None and self.default_radius_metres <= 0:
			# A zero radius refuses every phone punch in the group, and the
			# error each person sees blames their own location.
			frappe.throw(_("Default radius must be greater than zero."))
		self._check_page_visibility()
		self._check_field_access()

	def _check_page_visibility(self):
		# Every company login is an HR Manager, so the DocPerm alone would let
		# any of them take a page off the whole group's menu. See rules.py.
		if not self.has_value_changed("page_visibility"):
			return
		if not rules.may_set_page_visibility(frappe.session.user):
			frappe.throw(
				_("Only {0} may change which pages are shown.").format(", ".join(rules.PAGE_ADMINS)),
				frappe.PermissionError,
			)
		problem = rules.page_visibility_problem(self.page_visibility)
		if problem:
			frappe.throw(_(problem))

	def _check_field_access(self):
		# The same gate as page visibility: a company login locking a field
		# against the other companies' HR would be the rule turned round.
		if not self.has_value_changed("employee_field_access"):
			return
		if not rules.may_set_page_visibility(frappe.session.user):
			frappe.throw(
				_("Only {0} may change which Employee fields are locked.").format(", ".join(rules.PAGE_ADMINS)),
				frappe.PermissionError,
			)
		problem = rules.field_access_problem(self.employee_field_access)
		if problem:
			frappe.throw(_(problem))

	def on_update(self):
		# `settings.hr_settings` caches per request; the doctype is also
		# `get_cached_doc`. Both have to be dropped or the old numbers stay live
		# until the workers restart.
		frappe.clear_cache(doctype="Manna HR Settings")
