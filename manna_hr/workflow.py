"""The approval workflow for `Attendance Regularization`, as data.

## Why this is a Workflow and not five `if` statements

Approving a correction writes `Employee Checkin` rows and changes what somebody
is paid (`regularization.py`). Until now the only thing standing between a
`PUT status=Approved` and that happening was `_guard_self_approval`, which
catches one person approving their own row and nothing else — an `HR User` at
another company, or an approver deciding a request that was routed to HR, both
went straight through.

A Workflow is where Frappe puts that rule, so it is enforced on every path into
the document at once: the desk form, the REST API, a bulk edit, and the
dashboard's Save Approval Changes. A rule enforced in one client is a suggestion
to anyone holding curl — CLAUDE.md §1 — and that applies to the approval as much
as to the geofence.

## The five states, and why `Completed` is not ceremony

    Draft → Pending Approval → Approved → Completed
                    ↓
                 Rejected

**`Draft` is new and it fixes a real leak.** `status` used to default to
`Pending Approval`, so a half-typed correction landed in somebody's queue the
moment it was saved. Now it sits with the person who is writing it until they
submit it.

**`Completed` is the state this system most needed a name for.** Approving does
not fix the day. It writes the missing punches; `Attendance` is rebuilt later,
by the shift job, and only then is the person no longer marked absent. Between
those two moments the record says Approved and the report still says Absent,
which is exactly the gap that produces "I approved that on Tuesday, why is he
still down as absent?". So `Completed` means the punches landed *and* the day
was rebuilt from them, and it is set by
`regularization.complete_applied` — a scheduled job that checks — rather than by
a person clicking something.

## Routing is enforced here, not only recorded

`approver_type` already says who a correction belongs to: a person's goes to
their reporting manager, a manager's own goes to HR, because an approver signing
off their own attendance is not an approval. That was a field somebody could
read. The conditions below make it a rule — a `Manna Attendance Approver` can
only decide the ones routed to a reporting manager, and an `HR User` can only
decide the ones routed to HR.

`HR Manager` carries no condition, deliberately. Somebody has to be able to
unstick a request whose routing is wrong, and a workflow with no way out of a
bad state is a workflow people work around by editing the database.

## Idempotent, and re-run on every migrate

Written from `after_install` and again from a patch, because a site that already
has this app installed will never run `after_install` again. Both call
`ensure_workflow`, which upserts — so editing the table below and running
`bench migrate` is how this changes, not clicking through Desk.
"""

# `import frappe` is inside the two functions that touch a site rather than at
# the top, so that the tables below can be read — and tested — without a bench.
# CLAUDE.md §3: anything that can be a pure value should be one, because a rule
# nobody can argue about without a site is a rule nobody argues about.

DOCTYPE = "Attendance Regularization"
WORKFLOW_NAME = "Attendance Regularization Approval"

#: The field the workflow drives. Deliberately the existing `status` rather than
#: Frappe's default `workflow_state`: every screen, filter and report in this
#: repo already reads `status`, and the dashboard filters its queue on
#: `status = "Pending Approval"` (client/src/api/load.js). A second field
#: holding the same fact is a second field to disagree with the first.
STATE_FIELD = "status"

STATUS_DRAFT = "Draft"
STATUS_PENDING = "Pending Approval"
STATUS_APPROVED = "Approved"
STATUS_REJECTED = "Rejected"
STATUS_COMPLETED = "Completed"

#: `(state, style, which role may edit a document sitting in it)`.
#:
#: Nothing here is submittable, so every state is `doc_status` 0. That is worth
#: saying out loud rather than leaving implied: a correction is a request, not a
#: ledger entry, and the thing it produces — an `Employee Checkin` — is what
#: carries the consequence.
#:
#: `allow_edit` narrows as it goes. A person may change their own request while
#: it is theirs; once it is in a queue only HR may touch the times, because the
#: times are what is being decided; once it is decided only an `HR Manager` may,
#: because changing a decided request means reopening a decision.
STATES = [
	(STATUS_DRAFT, "", "Employee"),
	(STATUS_PENDING, "Warning", "HR User"),
	(STATUS_APPROVED, "Primary", "HR Manager"),
	(STATUS_REJECTED, "Danger", "HR Manager"),
	(STATUS_COMPLETED, "Success", "HR Manager"),
]

#: The routing rule, as a condition each approving role is held to. Read by
#: Frappe as Python against `doc`.
ROUTED_TO_MANAGER = 'doc.approver_type == "Reporting Manager"'
ROUTED_TO_HR = 'doc.approver_type == "HR"'

#: `(from, action, to, role, condition, allow_self_approval)`.
#:
#: `allow_self_approval` is 0 on every transition that decides something, and it
#: is Frappe's own guard rather than ours: it refuses when the document's
#: `owner` is the person acting. `_guard_self_approval` in regularization.py
#: stays as well, and the two catch different things — Frappe's covers a person
#: deciding a request they raised, ours covers a request raised *about* them by
#: somebody else. Neither is redundant.
TRANSITIONS = [
	# Out of the drafter's hands.
	(STATUS_DRAFT, "Submit", STATUS_PENDING, "Employee", "", 1),
	(STATUS_DRAFT, "Submit", STATUS_PENDING, "HR User", "", 1),
	(STATUS_DRAFT, "Submit", STATUS_PENDING, "HR Manager", "", 1),

	# The decision, routed. A reporting manager decides their own reports'
	# corrections; HR decides the ones that would otherwise be self-approved.
	(STATUS_PENDING, "Approve", STATUS_APPROVED, "Manna Attendance Approver", ROUTED_TO_MANAGER, 0),
	(STATUS_PENDING, "Reject", STATUS_REJECTED, "Manna Attendance Approver", ROUTED_TO_MANAGER, 0),
	(STATUS_PENDING, "Approve", STATUS_APPROVED, "HR User", ROUTED_TO_HR, 0),
	(STATUS_PENDING, "Reject", STATUS_REJECTED, "HR User", ROUTED_TO_HR, 0),
	(STATUS_PENDING, "Approve", STATUS_APPROVED, "HR Manager", "", 0),
	(STATUS_PENDING, "Reject", STATUS_REJECTED, "HR Manager", "", 0),

	# Second thoughts, in both directions. Withdrawing is how somebody takes
	# back a request they got wrong without an approver having to reject it,
	# which is the difference between a correction and a black mark.
	(STATUS_PENDING, "Withdraw", STATUS_DRAFT, "Employee", "", 1),
	(STATUS_PENDING, "Withdraw", STATUS_DRAFT, "HR Manager", "", 1),
	(STATUS_REJECTED, "Reopen", STATUS_PENDING, "HR Manager", "", 1),

	# Normally the scheduler's, not a person's — see `complete_applied`. Offered
	# to an HR Manager anyway, because a job that has not run is not a reason
	# for a record to be stuck, and the alternative is somebody editing the
	# table by hand.
	(STATUS_APPROVED, "Mark Completed", STATUS_COMPLETED, "HR Manager", "", 1),
]

#: Every role the table above names. Checked against the site before the
#: workflow is written, because a Workflow Transition holds a Link to `Role`
#: and a missing one fails at insert with a message about a link, not about a
#: role nobody created.
def roles_used():
	return sorted({role for _s, _a, _n, role, _c, _x in TRANSITIONS}
		| {edit for _n, _s, edit in STATES if edit})


def ensure_workflow():
	"""Write the workflow above onto this site. Safe to run repeatedly."""
	import frappe

	_ensure_masters()

	missing = [r for r in roles_used() if not frappe.db.exists("Role", r)]
	if missing:
		# Loudly, and before anything is written. A workflow half-installed is
		# worse than none: the states exist, the transitions do not, and the
		# document is stuck in whatever state it is in with no action offered.
		frappe.throw(
			"Cannot install the {0} workflow: these roles do not exist on this site — {1}. "
			"`Manna Attendance Approver` is created by manna_hr.install.after_install; "
			"the rest come with Frappe HR.".format(DOCTYPE, ", ".join(missing))
		)

	doc = (
		frappe.get_doc("Workflow", WORKFLOW_NAME)
		if frappe.db.exists("Workflow", WORKFLOW_NAME)
		else frappe.new_doc("Workflow")
	)

	doc.workflow_name = WORKFLOW_NAME
	doc.document_type = DOCTYPE
	doc.workflow_state_field = STATE_FIELD
	doc.is_active = 1
	# Frappe's own mail on every transition. Off: the people deciding these are
	# looking at a queue on the dashboard, and a mail per correction on a site
	# with 161 employees is how a mailbox rule gets written that hides all of
	# them. Notifications that are worth sending are defined deliberately.
	doc.send_email_alert = 0
	# `override_status` writes the state field even when a document is saved
	# some other way, which is what keeps `status` honest for the reports that
	# read it directly.
	doc.override_status = 1

	doc.states = []
	for state, style, allow_edit in STATES:
		doc.append("states", {
			"state": state,
			"doc_status": "0",
			"allow_edit": allow_edit,
			"style": style,
		})

	doc.transitions = []
	for state, action, next_state, role, condition, self_ok in TRANSITIONS:
		doc.append("transitions", {
			"state": state,
			"action": action,
			"next_state": next_state,
			"allowed": role,
			"condition": condition or None,
			"allow_self_approval": self_ok,
		})

	doc.flags.ignore_permissions = True
	doc.save()
	return doc


def _ensure_masters():
	"""The `Workflow State` and `Workflow Action Master` rows the table names.

	Frappe ships some of these and not others — `Pending Approval`, `Completed`,
	`Withdraw`, `Reopen` and `Mark Completed` are ours. Created here rather than
	shipped as fixtures because fixture files are imported in whatever order the
	filesystem lists them, and a workflow that installs before its states is a
	workflow that fails on a link.
	"""
	for state, style, _edit in STATES:
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({
				"doctype": "Workflow State",
				"workflow_state_name": state,
				"style": style,
			}).insert(ignore_permissions=True)

	for _s, action, _n, _r, _c, _x in TRANSITIONS:
		if not frappe.db.exists("Workflow Action Master", action):
			frappe.get_doc({
				"doctype": "Workflow Action Master",
				"workflow_action_name": action,
			}).insert(ignore_permissions=True)
