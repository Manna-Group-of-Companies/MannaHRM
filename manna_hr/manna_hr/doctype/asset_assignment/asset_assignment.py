"""One handover of one asset to one person.

The rules are in `manna_hr/assets.py` so they can be read without the plumbing
in the way. This file is the order they run in, and the order is the design:
fill from the asset, check the arithmetic, work out the status *from* the
arithmetic, then check the rules that depend on the status.
"""

import frappe
from frappe.model.document import Document

from manna_hr import assets, rules


class AssetAssignment(Document):
	def validate(self):
		self._asset = assets.fill_from_asset(self)

		assets.check_counts(self)
		assets.check_dates(self)
		assets.check_status(self)

		# Worked out here and nowhere else, from the counts and at most one word
		# of judgment. The dropdown may impose Scrapped or Damaged Or Not
		# Working — the two states no count can produce — and nothing else: a
		# status that could be typed freely is a register disagreeing with the
		# arithmetic printed beside it. `check_status` has already refused any
		# other disagreement, so by here the choice and the counts are one story.
		self.asset_status = rules.assignment_status(
			self.assign_units, self.return_unit, self.lost_units, chosen=self.asset_status
		)

		# These two ask what the status is, so they run after it is known.
		assets.check_employee(self)
		assets.check_not_already_out(self)

	def on_update(self):
		"""Move the asset so `Asset.custodian` agrees with this row.

		After the save rather than during it: a movement that succeeded against
		an assignment that then failed to save would leave the asset naming
		somebody no record explains.
		"""
		asset = getattr(self, "_asset", None) or assets.fill_from_asset(self)
		assets.move_asset(self, asset)

	def on_trash(self):
		"""Deleting an open handover leaves the asset out with nobody.

		Refused rather than quietly repaired: the asset is with a person or it
		is not, and a delete that silently pulls a laptop back onto the shelf is
		a correction nobody was told about. Close it, then delete it.
		"""
		if rules.assignment_is_open(self.asset_status):
			frappe.throw(
				frappe._("{0} is still out with {1}. Record it as returned or lost before deleting this.").format(
					self.asset, self.employee_name or self.employee
				)
			)
