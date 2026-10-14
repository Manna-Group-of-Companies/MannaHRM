import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LEVELS, LEVEL_WORDS, activeOf, branchesOf, headOfficeSeats, peopleOf, flowOf, headOfficeOf, isOfficeStaff, levelOf, placeAll, suggestedWrites } from "@/lib/hierarchy";
import { casualLeaveGroup } from "@/lib/monthlyleave";

/* The rule is manna_hr/hierarchy.py; this copy draws the chart. If the two
   drift, the chart places somebody the site would not. */
const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/hierarchy.py"), "utf8");

describe("the seven levels are hierarchy.py's, in its order", () => {
	it("every_level_in_order_matches_hierarchy_py", () => {
		const body = py.slice(py.indexOf("LEVELS = ("), py.indexOf(")", py.indexOf("LEVELS = (")));
		const names = [...body.matchAll(/^\s*"([^"]+)",\s*$/gm)].map((m) => m[1]);
		expect(names).toEqual(LEVELS);
		expect(LEVELS).toEqual(["Executive Director", "Vice President", "Head", "Manager", "Assistant Manager", "In-charge", "Trainee"]);
	});

	it("every_word_rule_in_order_matches_hierarchy_py", () => {
		const body = py.slice(py.indexOf("LEVEL_WORDS = ("), py.indexOf("\n)\n", py.indexOf("LEVEL_WORDS = (")));
		const pairs = [...body.matchAll(/\("([^"]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
		expect(pairs).toEqual(LEVEL_WORDS);
	});
});

describe("which level a job is", () => {
	it("the_designations_on_the_site_land_on_their_rung", () => {
		expect(levelOf("Vice President-operations")).toBe("Vice President");
		expect(levelOf("Head, Maintenance")).toBe("Head");
		expect(levelOf("H.R Manager")).toBe("Manager");
		expect(levelOf("ASST.MANAGER-ACCOUNTS")).toBe("Assistant Manager");
		expect(levelOf("Operations Incharge")).toBe("In-charge");
		expect(levelOf("Audit In-charge")).toBe("In-charge");
	});

	it("the_floor_has_no_rung", () => {
		for (const job of ["Plant Helper", "Driver", "Quality/production Supervisor", "Header Operator", "", undefined]) {
			expect(levelOf(job)).toBe("");
		}
	});
});

describe("placing everybody", () => {
	const E = (name, designation, extra = {}) => ({ name, employee_name: name, designation, status: "Active", ...extra });
	const rows = [
		E("VP", "Vice President-operations", { grade: "Vice President" }),
		E("GM", "General Manager"),
		E("ACC", "ASST.MANAGER-ACCOUNTS"),
		E("HELP", "Plant Helper"),
		E("ODD", "Plant Helper", { grade: "Senior" }),
		E("GONE", "General Manager", { status: "Left" }),
	];

	it("a_grade_is_the_fact_and_a_designation_only_a_suggestion", () => {
		const p = placeAll(rows);
		expect(p.tiers[1].held.map((e) => e.name)).toEqual(["VP"]);
		expect(p.tiers[2].suggested.map((e) => e.name)).toEqual(["GM"]);
		expect(p.tiers[4].suggested.map((e) => e.name)).toEqual(["ACC"]);
		expect(p.unplaced.map((e) => e.name)).toEqual(["HELP"]);
	});

	it("a_grade_that_is_not_a_level_is_shown_not_hidden", () => {
		expect(placeAll(rows).stray.map((e) => e.name)).toEqual(["ODD"]);
	});

	it("somebody_who_has_left_is_not_on_the_chart", () => {
		const p = placeAll(rows);
		const all = [...p.tiers.flatMap((t) => [...t.held, ...t.suggested]), ...p.unplaced, ...p.stray];
		expect(all.map((e) => e.name)).not.toContain("GONE");
		expect(all).toHaveLength(5);
	});

	it("saving_writes_only_the_suggestions_and_the_level_they_sit_on", () => {
		expect(suggestedWrites(placeAll(rows))).toEqual([["GM", { grade: "Head" }], ["ACC", { grade: "Assistant Manager" }]]);
	});
});

describe("the group chart: head office on top, companies under it", () => {
	const cos = [{ name: "Hi-Tech Rubber Industries" }, { name: "Manna Group Headquarters" }, { name: "Manna Treads" }];

	it("the_head_office_is_the_headquarters_company_wherever_the_site_lists_it", () => {
		expect(headOfficeOf(cos)).toBe("Manna Group Headquarters");
		expect(branchesOf(cos)).toEqual(["Hi-Tech Rubber Industries", "Manna Treads"]);
	});

	it("a_site_naming_it_otherwise_still_finds_a_head_office_and_never_two", () => {
		expect(headOfficeOf([{ name: "Manna Head Office" }, { name: "Manna Treads" }])).toBe("Manna Head Office");
		expect(headOfficeOf([])).toBe("");
	});

	it("office_staff_is_what_casual_leave_calls_office_plus_anybody_on_the_ladder", () => {
		expect(isOfficeStaff({ designation: "Branch Accountant" }, casualLeaveGroup)).toBe(true);
		expect(isOfficeStaff({ designation: "Head, Maintenance" }, casualLeaveGroup)).toBe(true);
		expect(isOfficeStaff({ designation: "Plant Helper" }, casualLeaveGroup)).toBe(false);
		expect(isOfficeStaff({ designation: "Driver" }, casualLeaveGroup)).toBe(false);
	});

	it("a_company_s_people_are_its_active_ones_only", () => {
		const rows = [
			{ name: "A", employee_name: "Zed", company: "Manna Treads", status: "Active" },
			{ name: "B", employee_name: "Amy", company: "Manna Treads", status: "Active" },
			{ name: "C", employee_name: "Bob", company: "Manna Treads", status: "Left" },
			{ name: "D", employee_name: "Cal", company: "Hi-Tech Rubber Industries", status: "Active" },
		];
		expect(activeOf(rows, "Manna Treads").map((e) => e.name)).toEqual(["B", "A"]);
	});
});

describe("the flow chart for one company", () => {
	const E = (name, designation, company, extra = {}) => ({ name, employee_name: name, designation, company, status: "Active", ...extra });
	const rows = [
		E("VP", "Vice President-operations", "HQ", { grade: "Vice President" }),
		E("GM", "General Manager", "HQ"),
		E("ACC", "Branch Accountant", "HQ"),
		E("HELP", "Plant Helper", "HQ"),
	];

	it("only_the_levels_somebody_is_on_are_boxes_and_the_rest_go_in_one_last_box", () => {
		const f = flowOf(rows);
		expect(f.boxes.map((b) => b.level)).toEqual(["Vice President", "Head"]);
		expect(f.rest.map((e) => e.name)).toEqual(["ACC", "HELP"]);
	});

	it("another_company_draws_its_office_staff_only", () => {
		const f = flowOf(rows, { officeOnly: true, officeGroup: casualLeaveGroup });
		expect(f.boxes.map((b) => b.level)).toEqual(["Vice President", "Head"]);
		expect(f.rest.map((e) => e.name)).toEqual(["ACC"]);
	});
});

describe("the GM and the HR Manager are drawn under the head office, chart only", () => {
	const HQ = "Manna Group Headquarters";
	const rows = [
		{ name: "VP", employee_number: "MHQ-001", employee_name: "Eapen", company: HQ, status: "Active" },
		{ name: "GM", employee_number: "MT-001", employee_name: "Rajiv", company: "Manna Treads", status: "Active" },
		{ name: "HR", employee_number: "MT-003", employee_name: "Pradeep", company: "Manna Tyre Retreads", status: "Active" },
		{ name: "ACC", employee_number: "HPT-052", employee_name: "Jineesh", company: "Manna Treads", status: "Active" },
	];
	it("the_head_office_gets_them_and_their_own_company_does_not_draw_them_twice", () => {
		// MHQ-001 is on the site's head office and is left off the chart on purpose;
		// HPT-052 is seated as Accounts, so Manna Treads no longer draws him.
		expect(peopleOf(rows, HQ, HQ).map((e) => e.name)).toEqual(["ACC", "HR", "GM"]);
		expect(peopleOf(rows, "Manna Treads", HQ)).toEqual([]);
		expect(peopleOf(rows, "Manna Tyre Retreads", HQ)).toEqual([]);
	});

	it("the_gm_is_row_one_and_hr_sits_level_with_the_department_heads_on_row_two", () => {
		const chart = headOfficeSeats(rows);
		expect(chart.map((r) => r.label)).toEqual(["General Manager", "Department heads"]);
		const row = (l) => chart.find((r) => r.label === l).seats;
		expect(row("General Manager").map((x) => [x.role, x.e && x.e.name])).toEqual([["General Manager", "GM"]]);
		const heads = row("Department heads");
		expect(heads.map((x) => x.role)).toEqual(["HR", "Logistics", "Sales", "Purchase", "Operations", "R&D",
			"Plant Head", "Maintenance Head", "Accounts"]);
		expect(heads[0].e.name).toBe("HR");
		// A seat with no code, or a code nobody Active holds, is drawn empty — never dropped.
		expect(heads.find((x) => x.role === "Logistics").e).toBeNull();
		expect(heads.find((x) => x.role === "Sales").e).toBeNull();
	});
});
