import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

import { IMPORT_COLUMNS, IMPORT_FIELDS, mapHeaders, planImport, sheetProblem, sheetRow, tally, verifyRow } from "@/lib/employeeimport";
import { NEW_EMP_FIELDS } from "@/lib/newemp";

/* ---------------------------------------------------------------------------
   Employees → Import from Excel (5 October 2026): new people and corrections
   from one sheet, matched on Emp Code, with Create Employee's own columns.
   --------------------------------------------------------------------------- */

const SITE = {
	companies: [{ name: "Manna Rubber Products Private Limited", abbr: "MRPPL" }, { name: "Manna Treads", abbr: "MT" }],
	departments: [{ name: "Production - MRPPL" }, { name: "Production - MT" }, { name: "Closed - MRPPL", disabled: 1 }],
	designations: [{ name: "Production Manager" }, { name: "Welder" }],
	shiftTypes: [{ name: "Manna Rubber Products Pvt.Ltd-Office Shift" }],
	holidayLists: [{ name: "Manna Holidays 2026-27" }],
	workLocations: [{ name: "WL-1", location_name: "Gate 1" }],
	employees: [
		{ name: "HR-EMP-00067", employee_number: "MRP-004", employee_name: "SAJI KUMAR K M", first_name: "SAJI KUMAR K M",
			company: "Manna Rubber Products Private Limited", status: "Active", attendance_device_id: "4",
			date_of_birth: "1975-05-01", date_of_joining: "2010-01-01", cell_number: "9000000000", designation: "Production Manager" },
		{ name: "HR-EMP-00125", employee_number: "MRP-293", employee_name: "PAUL SUNNY", status: "Active", attendance_device_id: "293",
			company: "Manna Rubber Products Private Limited" },
	],
};
const { map } = mapHeaders(IMPORT_COLUMNS);
const plan = (rows, access) => planImport(rows, map, SITE, access);
const NEW = {
	Company: "MRPPL", "Emp Code": "MRP-600", "First Name": "ANU", "Last Name": "MATHEW", Gender: "Female",
	"Date Of Birth": "12-03-1998", "Date Of Joining": "01-11-2026", Department: "production", Designation: "welder",
};

describe("the sheet's columns", () => {
	it("are_create_employees_own_fields_so_the_two_cannot_ask_for_different_things", () => {
		expect(IMPORT_FIELDS.map((f) => f.field)).toEqual(NEW_EMP_FIELDS);
	});

	it("read_by_label_by_fieldname_or_by_how_hr_heads_them", () => {
		const { map: m, unknown } = mapHeaders(["Employee Code", "first_name", "DOB", "Mobile", "Aadhar No", "Blood Group"]);
		expect(Object.values(m)).toEqual(["employee_number", "first_name", "date_of_birth", "cell_number", "custom_aadhaar_number"]);
		expect(unknown).toEqual(["Blood Group"]);
	});

	it("a_sheet_with_no_emp_code_is_refused_with_why", () => {
		expect(sheetProblem(mapHeaders(["First Name"]).map)).toMatch(/Emp Code/);
	});
});

describe("a new person", () => {
	it("is_created_with_lists_matched_whatever_the_case_and_the_department_of_their_company", () => {
		const [l] = plan([NEW]);
		expect(l.status).toBe("new");
		expect(l.patch).toMatchObject({
			company: "Manna Rubber Products Private Limited", employee_number: "MRP-600", first_name: "ANU",
			date_of_birth: "1998-03-12", date_of_joining: "2026-11-01", department: "Production - MRPPL",
			designation: "Welder", status: "Active",
		});
		expect(plan([{ ...NEW, Company: "Manna Treads" }])[0].patch.department).toBe("Production - MT");
	});

	it("is_refused_with_the_missing_fields_named", () => {
		const [l] = plan([{ "Emp Code": "MRP-601", "First Name": "X" }]);
		expect(l.status).toBe("problem");
		expect(l.why).toMatch(/Company.*Gender.*Date Of Birth.*Date Of Joining/);
	});

	it("is_refused_for_a_value_not_on_the_site_rather_than_guessed", () => {
		expect(plan([{ ...NEW, Designation: "Astronaut" }])[0].why).toMatch(/Designation "Astronaut"/);
		expect(plan([{ ...NEW, Department: "Closed" }])[0].status).toBe("problem");
	});

	it("is_refused_for_a_machine_code_an_active_person_already_holds", () => {
		expect(plan([{ ...NEW, "Machine Code": "293" }])[0].why).toMatch(/PAUL SUNNY/);
	});

	it("is_refused_for_dates_that_cannot_both_be_true", () => {
		expect(plan([{ ...NEW, "Date Of Birth": "01-01-2027" }])[0].status).toBe("problem");
	});
});

describe("somebody already on file", () => {
	it("is_updated_with_only_what_differs", () => {
		const [l] = plan([{ "Emp Code": "MRP-004", "Mobile Number": "9111111111", Designation: "Production Manager" }]);
		expect(l).toMatchObject({ status: "update", employee: "HR-EMP-00067", patch: { cell_number: "9111111111" } });
	});

	it("an_empty_cell_never_clears_anything", () => {
		expect(plan([{ "Emp Code": "MRP-004", "Mobile Number": "", Designation: "" }])[0].status).toBe("same");
	});

	it("a_reporting_manager_is_written_by_emp_code", () => {
		expect(plan([{ "Emp Code": "MRP-293", "Reporting Manager": "MRP-004" }])[0].patch).toEqual({ reports_to: "HR-EMP-00067" });
	});

	it("a_field_this_login_may_not_set_is_left_out_and_said", () => {
		const [l] = plan([{ "Emp Code": "MRP-004", "Mobile Number": "9111111111" }], { locked: new Set(["cell_number"]) });
		expect(l.status).toBe("same");
		expect(l.notes[0]).toMatch(/Mobile Number left out/);
	});

	it("a_code_twice_in_the_sheet_uses_only_the_first", () => {
		expect(plan([{ "Emp Code": "MRP-004" }, { "Emp Code": "mrp-004" }]).map((l) => l.status)).toEqual(["same", "problem"]);
	});
});

describe("checking what was saved", () => {
	it("a_new_person_found_on_the_site_as_the_sheet_said_is_added", () => {
		const [l] = plan([NEW]);
		const doc = { name: "HR-EMP-00999", ...l.patch, date_of_birth: "1998-03-12" };
		expect(verifyRow(l, doc)).toEqual({ way: "added", employee: "HR-EMP-00999" });
	});

	it("a_value_the_site_stored_differently_is_named_with_both_values", () => {
		const [l] = plan([{ "Emp Code": "MRP-004", "Mobile Number": "9111111111" }]);
		expect(verifyRow(l, { name: "HR-EMP-00067", cell_number: "9000000000" })).toMatchObject({
			way: "differs", differs: [{ label: "Mobile Number", sent: "9111111111", got: "9000000000" }],
		});
	});

	it("a_row_with_no_record_on_the_site_is_said_to_be_missing", () => {
		expect(verifyRow(plan([NEW])[0], null)).toEqual({ way: "missing" });
	});
});

describe("the download", () => {
	it("writes_a_person_back_in_the_columns_the_import_reads", () => {
		const row = sheetRow({ ...SITE.employees[1], reports_to: "HR-EMP-00067", custom_allow_remote_punch: 1 }, SITE.employees);
		expect(row[IMPORT_COLUMNS.indexOf("Emp Code")]).toBe("MRP-293");
		expect(row[IMPORT_COLUMNS.indexOf("Reporting Manager")]).toBe("MRP-004");
		expect(row[IMPORT_COLUMNS.indexOf("Punch From Anywhere")]).toBe("Yes");
	});

	it("counts_what_the_preview_will_do", () => {
		expect(tally(plan([NEW, { "Emp Code": "MRP-004", "Mobile Number": "9111111111" }, { "Emp Code": "X" }])))
			.toEqual({ new: 1, update: 1, same: 0, problem: 1 });
	});
});

/* --------------------------------------------------------------- the writes */

const calls = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: () => Promise.resolve(SITE.employees),
	apiCreate: (label, doc) => { calls.push(["create", label, doc.employee_number]); return Promise.resolve({ name: "HR-EMP-00999" }); },
	apiWrite: (label, name, patch) => {
		calls.push(["write", label, name, patch]);
		return Promise.resolve(name === "HR-EMP-00125" ? { ok: false, error: "Not permitted" } : { ok: true });
	},
}));
const { applyImport, readSheet, verifySaved } = await import("@/api/employeeimport");

describe("uploading and applying", () => {
	beforeEach(() => { calls.length = 0; });

	it("an_uploaded_excel_sheet_is_read_into_the_preview", async () => {
		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet("Employees");
		ws.addRow(["Emp Code", "First Name", "Company", "Gender", "Date Of Birth", "Date Of Joining", "Shoe Size"]);
		ws.addRow(["MRP-600", "ANU", "MRPPL", "Female", new Date(Date.UTC(1998, 2, 12)), "01-11-2026", 7]);
		const buf = await wb.xlsx.writeBuffer();
		const got = await readSheet({ name: "new.xlsx", arrayBuffer: async () => buf }, SITE, {});
		expect(got.unknown).toEqual(["Shoe Size"]);
		expect(got.lines[0]).toMatchObject({ status: "new", patch: { date_of_birth: "1998-03-12", date_of_joining: "2026-11-01" } });
	});

	it("creates_the_new_updates_the_changed_and_a_refusal_stops_only_that_row", async () => {
		const lines = plan([NEW, { "Emp Code": "MRP-004", "Mobile Number": "9111111111" }, { "Emp Code": "MRP-293", "Mobile Number": "9222222222" }]);
		const r = await applyImport(lines);
		expect(calls.map((c) => c.slice(0, 3))).toEqual([
			["create", "Employee", "MRP-600"], ["write", "Employee", "HR-EMP-00067"], ["write", "Employee", "HR-EMP-00125"],
		]);
		expect(r.done.map((d) => d.code)).toEqual(["MRP-600", "MRP-004"]);
		expect(r.failed).toMatchObject([{ code: "MRP-293", error: "Not permitted" }]);
	});

	it("every_saved_row_is_read_back_by_its_emp_code", async () => {
		const [l] = plan([{ "Emp Code": "MRP-004", Designation: "Welder" }]);
		const checked = await verifySaved([l]);
		// The stub site still says Production Manager: the change did not stick.
		expect(checked.get(2)).toMatchObject({ way: "differs", employee: "HR-EMP-00067" });
	});
});
