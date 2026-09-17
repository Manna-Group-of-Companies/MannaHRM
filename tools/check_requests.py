"""Why a time correction raised on Attendance Regularization is not reaching
the approver. Read-only: nothing on the site is changed.

    python tools/check_requests.py

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    The key should be a System Manager's, or the User, Has Role and User
    Permission reads below are refused and say so.

Written 17 September 2026, when requests from the company logins were saved
and hr@mannarubber.com still saw nothing. The dashboard cannot tell these
causes apart from inside one login — each looks like an empty queue — so this
reads the site as an administrator and names which one it is.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

DOCTYPE = "Employee Attendance Regularization"
APPROVER = "hr@mannarubber.com"
OPEN = "Pending Approval"

#: What client/src/api/load.js asks the queue for. One missing field is a
#: refusal of the whole read, for every login.
QUEUE_FIELDS = [
	"name", "employee", "employee_name", "company", "attendance_date", "requested_in", "requested_out",
	"reason", "status", "approver_type", "decided_by", "decided_on", "decision_note",
	"creation", "owner", "modified", "modified_by",
]


def req(path, params=None):
	url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
	r = urllib.request.Request(url, headers={"Authorization": AUTH, "Accept": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def listing(doctype, fields, filters=None, order="creation desc", limit=50):
	params = {"fields": json.dumps(fields), "limit_page_length": limit, "order_by": order}
	if filters:
		params["filters"] = json.dumps(filters)
	return req("/api/resource/" + urllib.parse.quote(doctype), params)["data"]


def attempt(title, fn):
	print("\n== " + title)
	try:
		return fn()
	except urllib.error.HTTPError as e:
		print("   refused by the site ({0}) — this key cannot read it".format(e.code))
	except Exception as e:  # a diagnostic keeps going past one broken read
		print("   failed: {0}".format(e))
	return None


def main():
	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	findings = []

	meta = attempt("The doctype", lambda: req("/api/resource/DocType/" + urllib.parse.quote(DOCTYPE))["data"])
	if meta:
		have = {f["fieldname"] for f in meta.get("fields", [])} | {"name", "creation", "owner", "modified", "modified_by"}
		missing = [f for f in QUEUE_FIELDS if f not in have]
		status = next((f for f in meta["fields"] if f["fieldname"] == "status"), {})
		options = (status.get("options") or "").split("\n")
		print("   custom: {0}".format(meta.get("custom")))
		print("   status options: {0}".format(options))
		print("   fields the queue asks for and the site lacks: {0}".format(missing or "none"))
		for p in meta.get("permissions", []):
			print("   perm: {0:<28} read={1} write={2} create={3} if_owner={4}".format(
				p.get("role"), p.get("read"), p.get("write"), p.get("create"), p.get("if_owner")))
			if p.get("if_owner") and p.get("role") in ("HR Manager", "HR User"):
				findings.append("{0} has 'Only if Creator' on {1}: hr@ sees only requests hr@ raised.".format(p["role"], DOCTYPE))
		if OPEN not in options:
			findings.append("status cannot hold '{0}' on this site, so no request is ever in the queue.".format(OPEN))

	custom = attempt("Custom DocPerm (these replace the rows above entirely)", lambda: listing(
		"Custom DocPerm", ["role", "read", "write", "create", "if_owner", "permlevel"], [["parent", "=", DOCTYPE]]))
	for p in custom or []:
		print("   {0:<28} read={1} write={2} create={3} if_owner={4}".format(
			p["role"], p["read"], p["write"], p["create"], p["if_owner"]))

	flows = attempt("Workflows on the doctype", lambda: listing(
		"Workflow", ["name", "is_active", "workflow_state_field"], [["document_type", "=", DOCTYPE]]))
	for w in flows or []:
		print("   {0} active={1} state field={2}".format(w["name"], w["is_active"], w["workflow_state_field"]))

	rows = attempt("The last 20 requests, every status", lambda: listing(
		DOCTYPE, ["name", "employee", "employee_name", "company", "attendance_date", "status", "owner", "creation"], limit=20))
	if rows is not None:
		if not rows:
			findings.append("The site holds no requests at all: Request is not saving, whatever the page said.")
		for r in rows:
			print("   {name} {creation:.16} {status:<17} {attendance_date} {company} · {employee_name} · raised by {owner}".format(
				**{k: (v if v is not None else "") for k, v in r.items()}))
		counts = Counter(r["status"] for r in rows)
		print("   by status: {0}".format(dict(counts)))
		if rows and not counts.get(OPEN):
			findings.append("None of the recent requests is '{0}' — the queue only lists that status.".format(OPEN))

	todos = attempt("Assignments (ToDo) for those requests", lambda: listing(
		"ToDo", ["name", "allocated_to", "reference_name", "status", "creation"], [["reference_type", "=", DOCTYPE]], limit=20))
	for t in todos or []:
		print("   {reference_name} → {allocated_to} ({status})".format(**t))
	if rows and todos is not None and not [t for t in todos if t["allocated_to"] == APPROVER]:
		findings.append("No request is assigned to {0}: nothing shows in their ERPNext To Do or bell.".format(APPROVER))

	user = attempt("The approver's login", lambda: req("/api/resource/User/" + urllib.parse.quote(APPROVER))["data"])
	if user:
		roles = sorted(r["role"] for r in user.get("roles", []))
		print("   enabled={0} type={1}".format(user.get("enabled"), user.get("user_type")))
		print("   roles: {0}".format(roles))
		if not user.get("enabled"):
			findings.append("{0} is disabled.".format(APPROVER))
		if not {"HR Manager", "HR User", "System Manager"} & set(roles):
			findings.append("{0} has none of HR Manager / HR User / System Manager, so cannot read the requests.".format(APPROVER))

	perms = attempt("The approver's User Permissions", lambda: listing(
		"User Permission", ["allow", "for_value", "apply_to_all_doctypes", "applicable_for"], [["user", "=", APPROVER]]))
	for p in perms or []:
		print("   {allow} = {for_value} (all doctypes: {apply_to_all_doctypes}, only: {applicable_for})".format(**p))
	companies = [p["for_value"] for p in perms or [] if p["allow"] == "Company"]
	if companies:
		findings.append("{0} is locked to Company {1}: requests for any other company are hidden from them.".format(
			APPROVER, ", ".join(companies)))

	print("\n== What is wrong")
	for f in findings or ["Nothing above explains it. Send this whole output back."]:
		print("   * " + f)


if __name__ == "__main__":
	main()
