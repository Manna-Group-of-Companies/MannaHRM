"""Add the fields a doctype's JSON has and the site's custom copy does not.

    python tools/add_missing_fields.py "Manna HR Settings"            # what it would do
    python tools/add_missing_fields.py "Manna HR Settings" --apply    # do it

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    The key's user needs System Manager: a field is a schema change.

`create_doctype.py` puts a doctype on the site once and refuses the second time,
so a field added to the JSON afterwards never reaches the site — and Frappe
drops a field its doctype does not have from every save without a word, so the
screen that writes it looks as if it worked. This is the second half: it adds
what is missing, in the repo's order, and touches nothing already there. A
field somebody has since changed in Desk is the site's to keep.

Only for a doctype the site holds as custom. A standard one gets its fields from
`bench migrate`, and a field added to it here is one the next migrate fights.
"""

import argparse
import os
import sys
import urllib.parse

from create_doctype import BASE, DROP, call, definition


def missing_fields(spec, site_fields):
	"""The repo's field rows the site does not have, in the repo's order, ready
	to send. Matched on fieldname alone: a field that exists with a different
	type or label is the site's, and reported by tools/check_schema.py."""
	have = {f.get("fieldname") for f in site_fields}
	return [{k: v for k, v in f.items() if k not in DROP}
		for f in spec.get("fields", []) if f.get("fieldname") not in have]


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("doctype")
	ap.add_argument("--apply", action="store_true", help="actually change the site")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	spec = definition(args.doctype)
	path = "/api/resource/DocType/" + urllib.parse.quote(args.doctype)
	current = call("GET", path)["data"]
	if not current.get("custom"):
		sys.exit("{0} is not a custom doctype on the site; its fields come from bench migrate.".format(args.doctype))

	rows = current.get("fields") or []
	new = missing_fields(spec, rows)
	print("site      {0}".format(BASE))
	print("doctype   {0} ({1} fields on the site)".format(args.doctype, len(rows)))
	for f in new:
		print("missing   {0} ({1})".format(f["fieldname"], f.get("fieldtype", "")))
	if not new:
		print("\nNothing missing.")
	elif not args.apply:
		print("\nWould add {0}. Run again with --apply.".format(len(new)))
	else:
		# The existing rows are sent back as the site gave them, names and all:
		# a child table in a PUT is the whole table, and a row left out is deleted.
		call("PUT", path, {"fields": rows + new})
		print("\nadded     {0}".format(", ".join(f["fieldname"] for f in new)))


if __name__ == "__main__":
	main()
