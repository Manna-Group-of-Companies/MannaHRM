"""One thing a person asked a fingerprint machine to do, through the bridge.

A browser cannot reach a machine: the machines sit on a plant's LAN and the
dashboard talks to this site and nothing else. The bridge can reach both, so a
command is left here, the bridge picks it up within seconds, does it at the
machine and writes the answer back.

**The site decides what may be asked, not the page that asked it.** The action
list is closed (`manna_hr/machinecmd.py`), a number that belongs to somebody
else is refused, and a finished command can never go back to Pending. A rule
enforced only in the dashboard is a suggestion to anyone holding `curl` —
CLAUDE.md §1 — and what is on the other end of this one is a machine that
decides whether somebody is paid.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from manna_hr.machinecmd import ACTIONS, WRITING, machine_name, may_move, problem_with


class MachineCommand(Document):
	def validate(self):
		self.device_id = (self.device_id or "").strip()
		self.device_user_id = (self.device_user_id or "").strip()
		self.name_on_device = machine_name(self.name_on_device)
		self.status = self.status or "Pending"

		problem = problem_with(self.action, self.device_id, self.device_user_id, self.name_on_device)
		if problem:
			frappe.throw(_(problem))

		self._check_status_move()
		if self.action in WRITING:
			self._check_the_number_is_free()

		if not self.requested_by:
			self.requested_by = frappe.session.user
		if not self.requested_at:
			self.requested_at = now_datetime()

	def _check_status_move(self):
		before = self.get_doc_before_save()
		old = before.status if before else "Pending"
		if not may_move(old, self.status):
			# Named both ways round, because the tempting fix when a command fails
			# is to set it back to Pending, and that is the one move that would
			# run it a second time.
			frappe.throw(
				_("A command that is {0} cannot be set back to {1}. Raise a new one instead.").format(old, self.status)
			)

	def _check_the_number_is_free(self):
		"""Refuse a number another Employee already holds — whatever their status.

		The machine sends only the number, so two holders is one person's
		attendance landing on the other. A Left employee still holding it is the
		usual way that happens, which is why status is not filtered here.
		"""
		if not self.device_user_id:
			return
		holders = frappe.get_all(
			"Employee",
			filters={"attendance_device_id": self.device_user_id},
			fields=["name", "employee_name", "status"],
		)
		others = [h for h in holders if h.name != self.employee]
		if others:
			frappe.throw(
				_("Machine number {0} already belongs to {1}. Give this person a number nobody holds.").format(
					self.device_user_id,
					", ".join("{0} ({1}, {2})".format(h.name, h.employee_name or "", h.status) for h in others),
				)
			)


def actions():
	"""What the dashboard may offer. Read from the same table the rules use."""
	return ACTIONS
