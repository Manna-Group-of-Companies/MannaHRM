"""The approval workflow, argued about without a site.

`manna_hr/workflow.py` keeps its `import frappe` inside the two functions that
touch a site, so the tables are plain data here and every rule below is a
question somebody can answer by reading. That is the same bargain `rules.py`
makes and for the same reason: a workflow you can only inspect by installing it
is a workflow nobody inspects.

**Five tests used to live here and no longer can.** They read the doctype JSON
and checked it against these tables — that the five states match the `status`
field's `options` exactly, that a new correction defaults to Draft, and that
every role a transition names can actually reach the doctype. The schema is now
owned by the site rather than by this repo, so there is nothing here to read
them from.

That check has not been dropped, it has moved to where the truth is:
`python tools/check_schema.py` asks the site. **It needs credentials and it is
not part of this suite**, which is the honest cost of the schema living on the
site — the drift it catches is exactly the kind nothing notices at install time.
The workflow saves, the field saves, and the failure is one approver seeing a
blank status a week later.
"""

from manna_hr.workflow import (
	DOCTYPE,
	STATE_FIELD,
	STATES,
	STATUS_APPROVED,
	STATUS_COMPLETED,
	STATUS_DRAFT,
	STATUS_PENDING,
	STATUS_REJECTED,
	TRANSITIONS,
	roles_used,
)

STATE_NAMES = [state for state, _style, _edit in STATES]


# --------------------------------------------------------- the state machine ---


def test_every_transition_names_states_that_exist():
	for state, action, next_state, *_rest in TRANSITIONS:
		assert state in STATE_NAMES, f"{action}: from {state!r}"
		assert next_state in STATE_NAMES, f"{action}: to {next_state!r}"


def test_every_state_can_be_reached_from_a_draft():
	"""A state nothing leads to is a state no document can ever be in."""
	reached = {STATUS_DRAFT}
	moved = True
	while moved:
		moved = False
		for state, _action, next_state, *_rest in TRANSITIONS:
			if state in reached and next_state not in reached:
				reached.add(next_state)
				moved = True
	assert reached == set(STATE_NAMES), sorted(set(STATE_NAMES) - reached)


def test_completed_is_the_only_state_with_no_way_out():
	"""Anything else with no exit is a document stuck where only the database
	can free it, which is how a queue quietly grows a row nobody can clear."""
	dead_ends = {s for s in STATE_NAMES if not any(t[0] == s for t in TRANSITIONS)}
	assert dead_ends == {STATUS_COMPLETED}


def test_a_rejected_correction_can_be_reopened():
	# A rejection is somebody's pay. It must not be final because an approver
	# misread the date.
	assert any(t[0] == STATUS_REJECTED and t[2] == STATUS_PENDING for t in TRANSITIONS)


def test_a_pending_correction_can_be_withdrawn_by_the_person_who_raised_it():
	assert any(
		t[0] == STATUS_PENDING and t[2] == STATUS_DRAFT and t[3] == "Employee"
		for t in TRANSITIONS
	)


# ----------------------------------------------------------------- the guards ---


def test_no_decision_may_be_self_approved():
	"""Every transition that decides something has Frappe's own self-approval
	guard on. `_guard_self_approval` in regularization.py is the other half —
	that one catches a request raised *about* the approver by somebody else,
	this one catches one they raised themselves."""
	for state, action, next_state, role, _cond, self_ok in TRANSITIONS:
		decides = next_state in (STATUS_APPROVED, STATUS_REJECTED)
		assert not (decides and self_ok), f"{role} may self-approve via {action}"


def test_a_reporting_manager_may_only_decide_what_was_routed_to_them():
	for state, action, next_state, role, cond, _x in TRANSITIONS:
		if role == "Manna Attendance Approver" and next_state in (STATUS_APPROVED, STATUS_REJECTED):
			assert "Reporting Manager" in cond, f"{action} is unconditioned for {role}"


def test_hr_users_may_only_decide_what_was_routed_to_hr():
	# A manager's own correction is routed to HR precisely so that nobody signs
	# off their own attendance. An HR User deciding a manager-routed one would
	# undo that.
	for state, action, next_state, role, cond, _x in TRANSITIONS:
		if role == "HR User" and next_state in (STATUS_APPROVED, STATUS_REJECTED):
			assert cond == 'doc.approver_type == "HR"', f"{action}: {cond!r}"


def test_an_hr_manager_can_always_decide():
	"""Deliberately unconditioned. Routing is data and data gets edited; a
	workflow with no way out of a badly routed request is one people work
	around by editing the table."""
	unconditioned = {
		t[2] for t in TRANSITIONS
		if t[3] == "HR Manager" and t[2] in (STATUS_APPROVED, STATUS_REJECTED) and not t[4]
	}
	assert unconditioned == {STATUS_APPROVED, STATUS_REJECTED}


def test_only_hr_can_move_a_correction_to_completed_by_hand():
	"""The scheduler does this. The manual move exists for when it has not run,
	and it is not something an approver or the employee should be able to
	claim — Completed means the day was actually rebuilt."""
	by_hand = {t[3] for t in TRANSITIONS if t[2] == STATUS_COMPLETED}
	assert by_hand == {"HR Manager"}


def test_nobody_may_edit_a_decided_correction_except_hr():
	for state, _style, allow_edit in STATES:
		if state in (STATUS_APPROVED, STATUS_REJECTED, STATUS_COMPLETED):
			assert allow_edit == "HR Manager", f"{state} editable by {allow_edit!r}"
