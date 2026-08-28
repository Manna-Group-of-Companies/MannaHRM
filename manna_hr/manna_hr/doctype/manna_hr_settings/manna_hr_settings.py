import frappe
from frappe import _
from frappe.model.document import Document


class MannaHRSettings(Document):
	def validate(self):
		if self.default_radius_metres is not None and self.default_radius_metres <= 0:
			# A zero radius refuses every phone punch in the group, and the
			# error each person sees blames their own location.
			frappe.throw(_("Default radius must be greater than zero."))

	def on_update(self):
		# `settings.hr_settings` caches per request; the doctype is also
		# `get_cached_doc`. Both have to be dropped or the old numbers stay live
		# until the workers restart.
		frappe.clear_cache(doctype="Manna HR Settings")
