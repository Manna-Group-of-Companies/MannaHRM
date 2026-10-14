"""HR's two automatic leave rules, on the site: one hourly job, in order.

One entry in hooks.py rather than two, because Frappe enqueues each hourly
Scheduled Job Type on its own, in shuffled order, and may run them at once on
two workers. Sunday leave has to land first: a day earned on Sunday is what
Monday's absence is paid from. The dashboard keeps the same order
(client/src/api/leaverules.js).
"""

import frappe

from manna_hr import absencerule as ar
from manna_hr import absencerule_site, sundayleave_site


def run():
	# Switched off by HR on 14 October 2026 — see absencerule.AUTO_LEAVE_RULES.
	# The scheduler entry stays so turning it back on is one constant.
	if not ar.AUTO_LEAVE_RULES:
		return
	sundayleave_site.run()
	# Committed between, so the absence rule's balance check reads the
	# adjustment Sunday leave has just written.
	frappe.db.commit()
	absencerule_site.run()
