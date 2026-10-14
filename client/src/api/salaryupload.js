import { apiCreate, apiCreateSubmitted, apiWrite, listAll } from "@/api/client";
import { parseCsv } from "@/lib/basepayfile";
import { assignmentDoc } from "@/lib/salarysetup";
import {
	UPLOAD_HEADS, cellValue, toSave, uploadComponentDoc, uploadRow, uploadStructureDoc,
} from "@/lib/salaryupload";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";

/* ---------------------------------------------------------------------------
   Salary Setup → Upload salaries: the reads and writes. The rules are in
   lib/salaryupload.js; this file only fetches and saves, under the signed-in
   person's own roles, with the site checking every document.
   --------------------------------------------------------------------------- */

const BASE = ["name", "employee_number", "employee_name", "company", "status", "department", "salary_mode"];
const BANK = ["custom_bank_percent", "custom_bank_amount"];

/** Everybody, with how they are paid. A site without the two bank fields
    refuses the whole read, so it is asked again without them, and the page
    says the split cannot be saved yet instead of saving it nowhere. */
export async function loadUploadPeople() {
	try {
		return { people: await listAll("Employee", [...BASE, ...BANK], null, 500), bankFields: true };
	} catch {
		return { people: await listAll("Employee", BASE, null, 500), bankFields: false };
	}
}

const bytesOf = (file) => (file.arrayBuffer
	? file.arrayBuffer()
	: new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }));

/** The first sheet with anything in it, as rows — a cell formatted as a
    percentage comes back as "12%", not 0.12. */
export async function readUploadTable(file) {
	if (/\.csv$/i.test(file.name || "")) return parseCsv(new TextDecoder().decode(await bytesOf(file)).replace(/^﻿/, ""));
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await bytesOf(file));
	const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
	if (!ws) return [];
	const out = [];
	ws.eachRow({ includeEmpty: true }, (row, r) => {
		const cells = [];
		row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = cellValue(c); });
		out[r - 1] = cells;
	});
	return Array.from(out, (r) => r || []);
}

/** The list to fill in: everybody in the company, with what the site holds. */
export async function downloadUploadList(people, assignments, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Salaries");
	ws.addRow(UPLOAD_HEADS).eachCell((c) => {
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	ws.getCell("E1").note = "Fill Bank ₹ or Cash ₹ (or both, adding up to the salary). A Bank % column works too.";
	ws.getCell("G1").note = "12 for 12%. 0 or empty for somebody who is not in PF.";
	ws.getCell("H1").note = "0.75 for 0.75%. 0 or empty for somebody who is not in ESI.";
	for (const p of people) ws.addRow(uploadRow(p, assignments || []));
	[14, 30, 20, 16, 14, 14, 10, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	for (const c of [4, 5, 6]) ws.getColumn(c).numFmt = "#,##0.00";
	ws.views = [{ state: "frozen", ySplit: 1 }];
	await downloadWorkbook(wb, `Salaries${company ? " " + company : ""}.xlsx`);
}

/** Save a plan: the missing components, then the missing structures, then each
    person on their own — a refusal for one does not stop the rest, and the
    page can say which it was. Nothing is undone on a failure; every document
    made is one hrms accepted.
    @returns {Promise<{made: object[], failed: {employee, name, error}[], setupError?: string}>} */
export async function saveUpload(plan, from, company, comps, onStep = () => {}) {
	const made = [];
	const failed = [];
	const newComps = plan.components.filter((x) => !x.exists);
	const structs = plan.structures.filter((x) => !x.exists);
	const lines = toSave(plan);
	/* The count is every document written, components and structures included,
	   so the percentage does not sit at 0% while those are made. */
	const total = newComps.length + structs.length + lines.length;
	let done = 0;
	const step = (text) => onStep(text, done++, total);

	for (const c of newComps) {
		step(`making the ${c.name} component`);
		try {
			await apiCreate("Salary Component", uploadComponentDoc(c));
		} catch (e) {
			return { made, failed, setupError: `The ${c.name} salary component could not be made — ${e.message || e}. Nothing else was saved.` };
		}
	}

	const broken = new Map();
	for (const s of structs) {
		step(`making ${s.name}`);
		try {
			await apiCreateSubmitted("Salary Structure", uploadStructureDoc(s.pf, s.esi, company, plan.roles, plan.method));
		} catch (e) {
			broken.set(s.name, e.message || String(e));
		}
	}

	for (const l of lines) {
		step(`saving ${l.name}`);
		try {
			if (l.assign) {
				if (broken.has(l.structure)) throw new Error(`${l.structure} could not be made — ${broken.get(l.structure)}`);
				await apiCreateSubmitted("Salary Structure Assignment", assignmentDoc({ employee: l.employee, base: l.salary }, l.structure, from, company));
			}
			if (Object.keys(l.patch).length) {
				const r = await apiWrite("Employee", l.employee, l.patch);
				if (!r.ok) throw new Error(`${l.assign ? "the salary is saved, but " : ""}the bank and cash split was refused — ${r.error || "no reason given"}`);
			}
			made.push(l);
		} catch (e) {
			failed.push({ employee: l.employee, name: l.name, error: e.message || String(e) });
		}
	}
	onStep("reading it back", total, total);
	return { made, failed };
}
