"""Pull the doctype definitions back off the site, into the repo's JSON layout.

    python tools/export_from_site.py                 # what it would write
    python tools/export_from_site.py --apply         # write it
    python tools/export_from_site.py --apply --only "Employee Loan Application"

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## Why this exists

**The site is the source of truth for the schema, and this is the way back.**
Every doctype in the `Manna HR` module was created on
`mannarubber.m.frappe.cloud` as a *custom* doctype, which means the site owns the
definition — it can be edited in Desk by somebody who never touches this repo,
and the repo's copy would be a second answer to the same question.

So the JSON is not kept here. This is what regenerates it when it is needed, and
there are two moments when it is:

1. **Before `bench install-app`.** A proper install needs the JSON, because that
   is what a Frappe app *is*. Export first, delete the custom doctypes on the
   site, then install — a standard doctype and a custom one of the same name is
   a site that fails to migrate, and the error names neither.
2. **To read a diff.** Exporting into a clean tree and running `git diff` is how
   you see what somebody changed in Desk.

## What it writes

`manna_hr/manna_hr/doctype/<snake_case>/<snake_case>.json`, in the same shape
the app uses: sorted keys, one field per entry, the site's own bookkeeping
(`creation`, `modified`, `owner`, `idx`) stripped so the file does not churn on
every export. Existing controllers beside it are left alone.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DOCTYPES = HERE / "manna_hr" / "manna_hr" / "doctype"

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

MODULE = "Manna HR"

#: The site's own bookkeeping. Keeping it would mean every export is a diff.
DROP_DOC = {"creation", "modified", "modified_by", "owner", "idx", "docstatus",
            "migration_hash", "_user_tags", "_comments", "_assign", "_liked_by"}
DROP_FIELD = DROP_DOC | {"parent", "parentfield", "parenttype", "name",
                         "oldfieldname", "oldfieldtype"}

#: Written even when the site says 0/empty, because their absence changes
#: meaning: an `istable` that is missing reads as a doctype with a list view.
KEEP_FALSY = {"istable", "issingle", "allow_rename", "track_changes",
              "index_web_pages_for_search"}


def req(path):
	r = urllib.request.Request(
		BASE + path, headers={"Authorization": AUTH, "Accept": "application/json"}
	)
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def tidy(row, drop):
	out = {}
	for key, value in row.items():
		if key in drop:
			continue
		if value in (None, "", 0, []) and key not in KEEP_FALSY:
			continue
		out[key] = value
	return out


def snake(name):
	return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def export(name):
	doc = req("/api/resource/DocType/" + urllib.parse.quote(name))["data"]
	out = tidy(doc, DROP_DOC | {"fields", "permissions", "links", "actions", "states"})
	out["name"] = name
	out["doctype"] = "DocType"
	out["module"] = MODULE
	out["fields"] = [tidy(f, DROP_FIELD | {"doctype"}) for f in doc.get("fields", [])]
	out["field_order"] = [f["fieldname"] for f in out["fields"]]
	out["permissions"] = [tidy(p, DROP_FIELD | {"doctype"}) for p in doc.get("permissions", [])]
	out["links"] = []
	out["actions"] = []
	out["states"] = []
	# `custom` is a fact about how it was installed, not about the schema. A
	# repo JSON carrying it would install a custom doctype from a bench, which
	# is the one thing a bench install exists to stop doing.
	out.pop("custom", None)
	return dict(sorted(out.items()))


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--apply", action="store_true", help="actually write the files")
	ap.add_argument("--only", default="", help="comma-separated doctype names")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	names = [n.strip() for n in args.only.split(",") if n.strip()]
	if not names:
		names = sorted(
			d["name"] for d in req(
				"/api/resource/DocType?" + urllib.parse.urlencode({
					"fields": json.dumps(["name"]),
					"filters": json.dumps([["module", "=", MODULE]]),
					"limit_page_length": 0,
				})
			)["data"]
		)

	print("site      {0}".format(BASE))
	print("module    {0}".format(MODULE))
	print("doctypes  {0}".format(len(names)))
	print()

	for name in names:
		try:
			spec = export(name)
		except urllib.error.HTTPError as e:
			print("  FAILED  {0}  HTTP {1}".format(name, e.code))
			continue

		path = DOCTYPES / snake(name) / (snake(name) + ".json")
		text = json.dumps(spec, indent=1, ensure_ascii=False) + "\n"
		same = path.exists() and path.read_text(encoding="utf-8") == text

		if not args.apply:
			print("  would   {0:42} {1}".format(
				name, "unchanged" if same else ("update" if path.exists() else "write")))
			continue
		if same:
			print("  same    {0}".format(name))
			continue

		path.parent.mkdir(parents=True, exist_ok=True)
		init = path.parent / "__init__.py"
		if not init.exists():
			init.touch()
		path.write_text(text, encoding="utf-8")
		print("  wrote   {0}  ({1} fields)".format(name, len(spec["fields"])))

	print()
	if not args.apply:
		print("Dry run. Add --apply to write the files.")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
