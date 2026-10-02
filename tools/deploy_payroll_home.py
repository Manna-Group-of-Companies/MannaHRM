"""Put the Payroll Home screen on the ERPNext site.

    python tools/deploy_payroll_home.py           # says what it would do, writes nothing
    python tools/deploy_payroll_home.py --apply   # makes or updates it

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

The screen is a Workspace with a Custom HTML Block (manna_hr/payrollhome_site.py
says why not a Page). Its code is `erpnext/payroll_home/payroll_home.js`; edit
that, run this again, and the site has the new version. Safe to run twice.

It writes two documents, `Custom HTML Block "Payroll Home"` and `Workspace
"Payroll Home"`, and nothing else. It makes no Salary Component and touches no
payroll record — the screen's own buttons do that, as the person pressing them.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from manna_hr import payrollhome_site as ph  # noqa: E402

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))


def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def exists(doctype, name):
	try:
		call("GET", "/api/resource/{0}/{1}".format(urllib.parse.quote(doctype), urllib.parse.quote(name)))
		return True
	except urllib.error.HTTPError as exc:
		if exc.code == 404:
			return False
		raise


def refused(exc):
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


def upsert(doc):
	"""Make it, or bring the one that is there into line. Returns the verb."""
	dt, name = doc["doctype"], doc.get("name") or doc["label"]
	path = "/api/resource/" + urllib.parse.quote(dt)
	if not exists(dt, name):
		call("POST", path, doc)
		return "made"
	# A child table is replaced whole by a PUT, which is what makes a second run
	# land on the same screen rather than adding a second copy of each row.
	body = {k: v for k, v in doc.items() if k not in ("doctype", "name", "__newname")}
	call("PUT", path + "/" + urllib.parse.quote(name), body)
	return "updated"


def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="write; without it nothing is")
	args = p.parse_args()

	script = (HERE / "erpnext/payroll_home/payroll_home.js").read_text(encoding="utf-8")
	css = (HERE / "erpnext/payroll_home/payroll_home.css").read_text(encoding="utf-8")
	docs = [ph.block_doc(script, css), ph.workspace_doc()]

	if not args.apply:
		print("site: {0}".format(BASE))
		for d in docs:
			print("would write {0} '{1}'".format(d["doctype"], d.get("name") or d["label"]))
		print("\nDry run. Nothing was written. Add --apply.")
		return 0

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2
	for d in docs:
		try:
			print("{0} {1} '{2}'".format(upsert(d), d["doctype"], d.get("name") or d["label"]))
		except urllib.error.HTTPError as exc:
			print("REFUSED {0}: {1}".format(d["doctype"], refused(exc)))
			return 1
	print("\nOpen {0}/app/payroll-home".format(BASE))
	return 0


if __name__ == "__main__":
	sys.exit(main())
