"""Every doctype JSON in this app, checked without a site.

These are the mistakes a bench finds at `migrate` and a Frappe Cloud site finds
at the first save — by which time somebody is looking at an error that names a
field rather than the thing that is actually wrong. They are all cheap to check
here, so they are checked here.

The one that matters most is `test_every_link_names_a_doctype_that_will_exist`.
A `Link` whose `options` names nothing is a control that draws, opens an empty
search, and saves a value the site cannot resolve — and nothing anywhere says so.
"""

import json
import pathlib

import pytest

APP = pathlib.Path(__file__).resolve().parents[1]
DOCTYPE_DIR = APP / "manna_hr" / "doctype"

#: Fieldtypes whose `options` names another doctype.
LINKING = {"Link", "Table", "Table MultiSelect"}

#: Fieldtypes that hold no value, so a fieldname of theirs names no column.
LAYOUT = {"Section Break", "Column Break", "Tab Break", "HTML", "Heading"}

#: What this app is allowed to point at outside itself: Frappe core, ERPNext and
#: Frappe HR. Listed rather than discovered, because the point of the test is to
#: catch a typo — and a lookup that asked the site would pass on a site where
#: somebody had already made the typo by hand.
STOCK = {
	# frappe
	"User", "Role", "Company", "File", "Print Format", "Workflow",
	# erpnext
	"Employee", "Department", "Designation", "Branch", "Employee Grade",
	"Employment Type", "Holiday List", "Asset", "Asset Category", "Cost Center",
	"Project", "Address", "Contact",
	# hrms
	"Employee Checkin", "Attendance", "Shift Type", "Shift Assignment",
	"Leave Application", "Leave Type", "Leave Allocation", "Leave Ledger Entry",
	"Salary Component", "Salary Slip", "Salary Structure", "Payroll Entry",
	"Additional Salary", "Employee Onboarding", "Employee Promotion",
	"Employee Transfer", "Full and Final Statement",
	"Employee Tax Exemption Declaration",
}

ROLES = {"HR Manager", "HR User", "Employee", "Manna Attendance Approver", "System Manager"}


def _specs():
	out = {}
	for path in sorted(DOCTYPE_DIR.glob("*/*.json")):
		if path.stem != path.parent.name:
			continue
		out[path] = json.loads(path.read_text(encoding="utf-8"))
	return out


SPECS = _specs()
OURS = {s["name"] for s in SPECS.values()}
CASES = [pytest.param(spec, id=spec["name"]) for spec in SPECS.values()]


def test_there_are_doctypes_to_check():
	# A glob that silently matches nothing turns every test below into a pass.
	assert len(SPECS) >= 15


@pytest.mark.parametrize("spec", CASES)
def test_the_folder_and_the_name_agree(spec):
	"""Frappe finds a controller by the folder name. A folder that does not match
	the doctype is a doctype whose `validate` never runs, and nothing says so."""
	folder = next(p.parent.name for p, s in SPECS.items() if s is spec)
	assert folder == spec["name"].lower().replace(" ", "_").replace("-", "_")


@pytest.mark.parametrize("spec", CASES)
def test_every_link_names_a_doctype_that_will_exist(spec):
	for field in spec["fields"]:
		if field["fieldtype"] not in LINKING:
			continue
		target = (field.get("options") or "").strip()
		assert target, f"{field['fieldname']} is a {field['fieldtype']} pointing at nothing"
		assert target in OURS or target in STOCK, (
			f"{field['fieldname']} points at {target!r}, which is neither ours nor stock"
		)


@pytest.mark.parametrize("spec", CASES)
def test_every_table_field_points_at_a_child_table(spec):
	"""A `Table` naming a doctype that is not `istable` saves nothing and reports
	nothing — the grid draws, takes rows, and they are gone on reload."""
	for field in spec["fields"]:
		if field["fieldtype"] != "Table":
			continue
		child = next(s for s in SPECS.values() if s["name"] == field["options"])
		assert child.get("istable") == 1, f"{field['options']} is not a child table"


@pytest.mark.parametrize("spec", CASES)
def test_no_fieldname_is_used_twice(spec):
	names = [f["fieldname"] for f in spec["fields"] if f["fieldtype"] not in LAYOUT]
	assert len(names) == len(set(names)), sorted(n for n in names if names.count(n) > 1)


@pytest.mark.parametrize("spec", CASES)
def test_the_field_order_is_the_fields(spec):
	"""Frappe rebuilds `field_order` from `fields`, so a stale one is a form laid
	out in an order nobody chose — or a field missing from it entirely."""
	assert spec["field_order"] == [f["fieldname"] for f in spec["fields"]]


@pytest.mark.parametrize("spec", CASES)
def test_a_child_table_has_no_permissions_of_its_own(spec):
	"""They are read through the parent. A permission row on a child table is
	ignored, and reading one as though it were enforced is how a table nobody
	should see ends up believed to be protected."""
	if spec.get("istable"):
		assert spec["permissions"] == []


@pytest.mark.parametrize("spec", CASES)
def test_anything_a_person_opens_can_be_created_by_somebody(spec):
	if spec.get("istable") or spec.get("issingle"):
		return
	assert any(p.get("create") for p in spec["permissions"]), (
		f"{spec['name']} has no role that can make a row — which reads to HR as "
		"the save button being broken"
	)


@pytest.mark.parametrize("spec", CASES)
def test_every_permission_names_a_role_this_project_uses(spec):
	for perm in spec["permissions"]:
		assert perm["role"] in ROLES, perm["role"]


@pytest.mark.parametrize("spec", CASES)
def test_a_fetch_from_names_a_link_on_this_doctype(spec):
	"""`fetch_from` is `<link fieldname>.<field>`. A first half that is not a Link
	on this doctype fetches nothing, silently, and the field just stays empty."""
	links = {f["fieldname"] for f in spec["fields"] if f["fieldtype"] == "Link"}
	for field in spec["fields"]:
		source = field.get("fetch_from")
		if not source:
			continue
		assert source.split(".")[0] in links, f"{field['fieldname']} fetches from {source!r}"


@pytest.mark.parametrize("spec", CASES)
def test_a_naming_series_doctype_has_the_field_it_names_by(spec):
	if spec.get("autoname") != "naming_series:":
		return
	series = next((f for f in spec["fields"] if f["fieldname"] == "naming_series"), None)
	assert series, f"{spec['name']} autonames by a series it has no field for"
	assert series.get("options"), "the series has no pattern"


@pytest.mark.parametrize("spec", CASES)
def test_a_field_autoname_names_a_field_that_is_required(spec):
	"""`autoname: field:x` with `x` optional is a document that cannot be saved,
	and the error names the naming rule rather than the empty box."""
	autoname = spec.get("autoname") or ""
	if not autoname.startswith("field:"):
		return
	target = autoname.split(":", 1)[1]
	field = next((f for f in spec["fields"] if f["fieldname"] == target), None)
	assert field, f"autoname names {target!r}, which is not a field"
	assert field.get("reqd"), f"{target} names the document and is not required"


@pytest.mark.parametrize("spec", CASES)
def test_a_select_lists_something_to_select(spec):
	for field in spec["fields"]:
		if field["fieldtype"] == "Select":
			assert (field.get("options") or "").strip(), field["fieldname"]


@pytest.mark.parametrize("spec", CASES)
def test_a_default_on_a_select_is_one_of_its_options(spec):
	for field in spec["fields"]:
		if field["fieldtype"] != "Select" or not field.get("default"):
			continue
		assert field["default"] in field["options"].split("\n"), (
			f"{field['fieldname']} defaults to {field['default']!r}"
		)


@pytest.mark.parametrize("spec", CASES)
def test_the_title_field_exists(spec):
	if not spec.get("title_field"):
		return
	assert any(f["fieldname"] == spec["title_field"] for f in spec["fields"])


@pytest.mark.parametrize("spec", CASES)
def test_the_search_fields_exist(spec):
	names = {f["fieldname"] for f in spec["fields"]}
	for field in (spec.get("search_fields") or "").split(","):
		field = field.strip()
		if field:
			assert field in names, f"{spec['name']} searches on {field!r}, which it has not got"


@pytest.mark.parametrize("spec", CASES)
def test_every_doctype_belongs_to_this_app(spec):
	assert spec["module"] == "Manna HR"


def test_nothing_shadows_the_sales_systems_regularization():
	"""`Attendance Regularization` on this site is the sales system's — module
	Selling, keyed to `Sales Person`, with live rows in it. A doctype of ours
	under that name would be an HR correction written into a sales queue nobody
	reads. See docs/SITE_SURVEY.md §5."""
	assert "Attendance Regularization" not in OURS
	assert "Employee Attendance Regularization" in OURS
