"""The approval workflow, argued about without a site.

`manna_hr/workflow.py` keeps its `import frappe` inside the two functions that
touch a site, so the tables are plain data here and every rule below is a
question somebody can answer by reading. That is the same bargain `rules.py`
makes and for the same reason: a workflow you can only inspect by installing it
is a workflow nobody inspects.

**The one that earns its place most is `test_the_doctype_and_the_workflow_agree_on_the_states`.**
The five states are written down twice — once in `workflow.py` and once as the
`status` field's `options` in the doctype JSON — and they have to match exactly
or a document lands in a state its own field cannot hold. Nothing at install
time notices; the workflow saves, the field saves, and the failure is one
approver seeing a blank status a week later.
"""

import json
import pathlib

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

APP = pathlib.Path(__file__).resolve().parents[1]
DOCTYPE_JSON = APP / "manna_hr" / "doctype" / "employee_attendance_regularization" / "employee_attendance_regularization.json"

STATE_NAMES = [state for state, _style, _edit in STATES]


def _doctype():
	return json.loads(DOCTYPE_JSON.read_text(encoding="utf-8"))


def _field(fieldname):
	return next(f for f in _doctype()["fields"] if f["fieldname"] == fieldname)


# ------------------------------------------------------- the two definitions ---


def test_the_doctype_and_the_workflow_agree_on_the_states():
	assert _field(STATE_FIELD)["options"].split("\n") == STATE_NAMES


def test_a_new_correction_starts_as_a_draft_rather_than_in_somebodys_queue():
	# It used to default to Pending Approval, which put a half-typed request in
	# front of an approver the moment it was saved.
	assert _field(STATE_FIELD)["default"] == STATUS_DRAFT


def test_the_workflow_drives_a_field_the_doctype_actually_has():
	assert any(f["fieldname"] == STATE_FIELD for f in _doctype()["fields"])


def test_the_doctype_is_the_one_the_workflow_names():
	assert _doctype()["name"] == DOCTYPE


def test_every_role_the_workflow_names_can_reach_the_doctype():
	"""A transition allowed to a role with no permission on the doctype is an
	action Frappe draws and then refuses — the worst shape of dead button,
	because it looks like the person's fault."""
	permitted = {p["role"] for p in _doctype()["permissions"]}
	assert set(roles_used()) <= permitted, sorted(set(roles_used()) - permitted)


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
