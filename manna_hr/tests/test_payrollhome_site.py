"""The Payroll Home workspace, as documents — see manna_hr/payrollhome_site.py."""

import json

import pytest

from manna_hr import payrollhome_site as ph

SCRIPT = 'var STYLE = "__STYLE__";'


def test_the_stylesheet_is_folded_into_the_script_because_the_block_redraws_its_own_contents():
	out = ph.script_with_style(SCRIPT, "a{color:red}")
	assert "__STYLE__" not in out and "a{color:red}" in out


def test_a_script_with_nowhere_for_its_stylesheet_is_refused_not_deployed_unstyled():
	with pytest.raises(ValueError):
		ph.script_with_style("var x = 1;", "a{}")


def test_the_block_is_named_by_prompt_so_it_carries_the_new_name_as_well():
	d = ph.block_doc(SCRIPT, "")
	assert d["__newname"] == d["name"] == "Payroll Home"


def test_only_hr_sees_the_block_and_the_workspace():
	assert [r["role"] for r in ph.block_doc(SCRIPT, "")["roles"]] == ["HR Manager", "HR User"]
	assert [r["role"] for r in ph.workspace_doc()["roles"]] == ["HR Manager", "HR User"]


def test_the_workspace_page_holds_the_block_and_every_shortcut_it_lists():
	ws = ph.workspace_doc()
	content = json.loads(ws["content"])
	assert [b for b in content if b["type"] == "custom_block"][0]["data"]["custom_block_name"] == "Payroll Home"
	assert ws["custom_blocks"] == [{"custom_block_name": "Payroll Home", "label": "Payroll Home"}]
	on_page = {b["data"]["shortcut_name"] for b in content if b["type"] == "shortcut"}
	assert on_page == {s["label"] for s in ws["shortcuts"]}


def test_every_block_id_is_stable_and_unique_so_a_second_deploy_does_not_reshuffle_the_page():
	a = [b["id"] for b in json.loads(ph.workspace_doc()["content"])]
	b = [b["id"] for b in json.loads(ph.workspace_doc()["content"])]
	assert a == b and len(set(a)) == len(a)


def test_a_report_shortcut_names_the_doctype_it_reads():
	reports = [s for s in ph.workspace_doc()["shortcuts"] if s["type"] == "Report"]
	assert reports and all(s["report_ref_doctype"] for s in reports)


def test_it_is_a_public_workspace_in_the_payroll_module_not_a_page():
	ws = ph.workspace_doc()
	assert (ws["type"], ws["module"], ws["public"]) == ("Workspace", "Payroll", 1)
