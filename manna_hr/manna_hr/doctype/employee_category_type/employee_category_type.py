"""Factor HR's Category Type, as far as ERPNext has somewhere to put it.

Half of what their form asks is a property of *their report engine* — display
priorities, which reports a category prints on — and has no answer here. Those
fields are held anyway, because the alternative is losing what was asked for;
they decide nothing, and each one says so on the field.

The half that does land becomes a `Custom Field` on `Employee`: the code is the
fieldname, the values are the Select options, and the mandatory tick is `reqd`.
"""

import re

import frappe
from frappe import _
from frappe.model.document import Document

#: Frappe reserves the unprefixed namespace for its own fields, and a custom
#: field that collides with a standard one is the kind of mistake nobody finds
#: until an upgrade renames something under it.
PREFIX = "custom_cat_"


class EmployeeCategoryType(Document):
	def validate(self):
		self.category_code = normalise_code(self.category_code or self.category_type_name)
		self._check_not_its_own_parent()

	def on_update(self):
		"""Create or refresh the `Custom Field` this category is.

		Never deletes one. A field dropped here takes its column — and every
		value already recorded in it — with it, and that is a decision for a
		person at a console rather than a side effect of unticking Active.
		"""
		fieldname = PREFIX + self.category_code
		options = "\n".join(
			[""] + [v.value_name for v in (self.values or []) if v.is_active and v.value_name]
		)

		existing = frappe.db.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname})
		payload = {
			"label": self.category_type_name,
			"fieldtype": "Select" if len(options) > 1 else "Data",
			"options": options if len(options) > 1 else None,
			"reqd": 1 if self.is_mandatory else 0,
			"hidden": 0 if self.is_active else 1,
			"in_standard_filter": 1 if self.show_in_filter else 0,
			"description": self.prompt_message,
		}

		if existing:
			field = frappe.get_doc("Custom Field", existing)
			field.update(payload)
			field.save(ignore_permissions=True)
		else:
			field = frappe.get_doc(
				dict(doctype="Custom Field", dt="Employee", fieldname=fieldname, **payload)
			)
			field.insert(ignore_permissions=True)

		if self.custom_field != field.name:
			self.db_set("custom_field", field.name, update_modified=False)

	def _check_not_its_own_parent(self):
		seen = {self.name}
		parent = self.parent_category_type
		while parent:
			if parent in seen:
				frappe.throw(_("{0} would be its own parent.").format(self.category_type_name))
			seen.add(parent)
			parent = frappe.db.get_value("Employee Category Type", parent, "parent_category_type")


def normalise_code(text):
	"""A fieldname Frappe will accept, out of whatever somebody typed."""
	code = re.sub(r"[^a-z0-9]+", "_", str(text or "").lower()).strip("_")
	if not code:
		frappe.throw(_("A category type needs a code."))
	return code
