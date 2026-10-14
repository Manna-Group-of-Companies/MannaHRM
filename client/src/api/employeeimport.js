import { apiCreate, apiWrite, listAll } from "@/api/client";
import { readResponses } from "@/lib/onboardimport";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";
import {
	IMPORT_COLUMNS, IMPORT_FIELDS, IMPORT_READ, mapHeaders, planImport, sheetProblem, sheetRow, verifyRow,
} from "@/lib/employeeimport";

/* ---------------------------------------------------------------------------
   Employees → Import from Excel's reads and writes. Employee only: created
   with `apiCreate`, changed with `apiWrite` as a patch of what differs — the
   same two calls Create Employee and Employee Profile make, under the
   signed-in person's own roles, with the site's validation behind each.
   --------------------------------------------------------------------------- */

/** Everybody, with every importable field — the list the page loads holds
    only some, and comparing against a field it never read would call every
    filled cell a change. A site missing one of our custom fields refuses the
    whole read, so it falls back to the standard ones. */
export async function loadFullEmployees() {
	try {
		return await listAll("Employee", IMPORT_READ, null, 500);
	} catch {
		return listAll("Employee", IMPORT_READ.filter((f) => !f.startsWith("custom_")), null, 500);
	}
}

/** Download the sheet: headers only, or everybody in `people` to correct. */
export async function downloadSheet(people, everybody, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Employees");
	const head = ws.addRow(IMPORT_COLUMNS);
	head.eachCell((c, i) => {
		const req = IMPORT_FIELDS[i - 1].required;
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
		if (req) c.note = "Needed for a new person";
	});
	for (const e of people) ws.addRow(sheetRow(e, everybody));
	IMPORT_FIELDS.forEach((f, i) => {
		ws.getColumn(i + 1).width = Math.max(12, f.label.length + 2);
		if (f.type === "date") ws.getColumn(i + 1).numFmt = "dd-mm-yyyy";
	});
	ws.views = [{ state: "frozen", ySplit: 1 }];
	const what = people.length ? "Employees" : "New employees";
	await downloadWorkbook(wb, `${what}${company ? " " + company : ""}.xlsx`);
}

/** Read an uploaded sheet and plan it against the full records. */
export async function readSheet(file, s, access) {
	const rows = await readResponses(file);
	if (!rows.length) throw new Error("The sheet has no rows under its header.");
	const { map, unknown } = mapHeaders(Object.keys(rows[0]));
	const bad = sheetProblem(map);
	if (bad) throw new Error(bad);
	const full = await loadFullEmployees().catch(() => null);
	const employees = full || s.employees;
	return { unknown, lines: planImport(rows, map, { ...s, employees }, access) };
}

/** Write every new and changed row, one at a time and each on its own.
    @returns {Promise<{done: object[], failed: object[]}>} */
export async function applyImport(lines, onStep = () => {}) {
	const done = [];
	const failed = [];
	for (const l of lines.filter((x) => x.status === "new" || x.status === "update")) {
		try {
			if (l.status === "new") {
				const made = await apiCreate("Employee", l.patch);
				done.push({ ...l, employee: made?.name || "" });
			} else {
				const r = await apiWrite("Employee", l.employee, l.patch);
				if (!r.ok) throw new Error(r.error || "refused");
				done.push(l);
			}
		} catch (e) {
			failed.push({ ...l, error: e.message || String(e) });
		}
		onStep(done.length + failed.length);
	}
	return { done, failed };
}

/** Read back every saved row from the site and say whether it holds what the
    sheet said — a new person found by the Emp Code they were given, a changed
    one by their record. One read for all of them.
    @returns {Promise<Map<number, object>>} row number → verifyRow's answer */
export async function verifySaved(done) {
	const out = new Map();
	if (!done.length) return out;
	const codes = done.map((l) => String(l.code));
	let rows = [];
	try {
		rows = await listAll("Employee", IMPORT_READ, [["employee_number", "in", codes]], 500);
	} catch {
		rows = await listAll("Employee", IMPORT_READ.filter((f) => !f.startsWith("custom_")),
			[["employee_number", "in", codes]], 500).catch(() => []);
	}
	const byCode = new Map(rows.map((r) => [String(r.employee_number).trim().toUpperCase(), r]));
	for (const l of done) out.set(l.row, verifyRow(l, byCode.get(String(l.code).trim().toUpperCase()) || null));
	return out;
}
