/* ---------------------------------------------------------------------------
   Payroll on the site: what a period holds, and the two steps of a run the
   dashboard takes. lib/payroll.js says what the reads mean.

   **Every document here is hrms's.** Payroll Entry, Salary Slip and its Salary
   Detail rows, and Salary Structure Assignment are stock, and the arithmetic
   on them is hrms's own on the site. Salary Slip is on lib/write.js's
   NEVER_WRITE list and stays there: a slip is made by a run.

   The run, and where each step happens:

   1. Start Salary Process — here. A draft Payroll Entry for one company and
      one month, and hrms's `fill_employee_details` to pick the people.
   2. Create Salary Slips — here. Submits the entry; hrms makes a draft slip
      per person (in the background, past thirty people). Nothing is paid.
   3. Finalize — on the desk, against the entry: Submit Salary Slip, which
      books the pay. See apiSubmitDraft in api/client.js for why the line is
      drawn there.
   --------------------------------------------------------------------------- */

import { api, apiCreate, apiDocMethod, apiSubmitDraft, apiWrite, getDoc, listAll } from "@/api/client";
import { employeeRows, payrollEntryDoc } from "@/lib/payroll";
import { getState, set } from "@/store";

export const payKey = (company, start, end) => `${company || ""}|${start}|${end}`;

/** A list read that falls back to fewer fields rather than failing: hrms
    versions differ in what these doctypes carry, and a field the site does
    not have fails the whole read with a 417. */
async function listSome(label, wide, narrow, filters) {
	try {
		return await listAll(label, wide, filters, 500);
	} catch (e) {
		if (e.status === 403) throw e;
		return listAll(label, narrow, filters, 500);
	}
}

const ENTRY_WIDE = ["name", "company", "start_date", "end_date", "posting_date", "docstatus", "status",
	"number_of_employees", "owner", "creation"];
const ENTRY_NARROW = ["name", "company", "start_date", "end_date", "posting_date", "docstatus", "owner", "creation"];
const SLIP_WIDE = ["name", "employee", "employee_name", "company", "department", "designation", "start_date",
	"end_date", "posting_date", "docstatus", "status", "payroll_entry", "salary_structure", "payment_days",
	"total_working_days", "leave_without_pay", "absent_days", "gross_pay", "total_deduction", "net_pay"];
const SLIP_NARROW = ["name", "employee", "employee_name", "company", "start_date", "end_date", "docstatus",
	"payroll_entry", "gross_pay", "total_deduction", "net_pay"];
const SSA = ["name", "employee", "salary_structure", "from_date", "base", "company", "docstatus"];

/** Salary Detail rows for these slips. A child table is read with its parent
    named, or Frappe refuses it; in pieces, so the address stays a size every
    proxy on the way will carry. */
async function detailsFor(slips) {
	const out = [];
	for (let i = 0; i < slips.length; i += 60) {
		const names = slips.slice(i, i + 60).map((s) => s.name);
		const r = await api("/api/resource/Salary Detail", {
			parent: "Salary Slip",
			fields: JSON.stringify(["parent", "parentfield", "salary_component", "amount", "idx"]),
			filters: JSON.stringify([["parent", "in", names]]),
			limit_page_length: 0,
		});
		out.push(...(r.data || []));
	}
	return out.sort((a, b) => a.idx - b.idx);
}

/** Read one period — a month, or a whole payroll year for the register — into
    `pay[key]`, and return it. Read again only when asked to (`fresh`). */
export async function loadPayroll(company, start, end, { fresh = false, details = false } = {}) {
	const key = payKey(company, start, end);
	const had = getState().pay[key];
	if (had && !fresh && had.state !== "error" && (!details || had.details)) return had;

	const put = (v) => { set({ pay: { ...getState().pay, [key]: v } }); return v; };
	put({ ...(had || {}), state: "loading" });

	const co = company ? [["company", "=", company]] : [];
	try {
		const [entries, slips, assignments] = await Promise.all([
			listSome("Payroll Entry", ENTRY_WIDE, ENTRY_NARROW,
				[["start_date", "=", start], ["end_date", "=", end], ["docstatus", "<", 2], ...co]),
			listSome("Salary Slip", SLIP_WIDE, SLIP_NARROW,
				[["start_date", ">=", start], ["end_date", "<=", end], ["docstatus", "<", 2], ...co]),
			listSome("Salary Structure Assignment", [...SSA, "custom_cash_amount"], SSA, [["docstatus", "=", 1], ["from_date", "<=", end], ...co]),
		]);
		const lines = details && slips.length ? await detailsFor(slips) : details ? [] : null;
		return put({ state: "ok", entries, slips, assignments, details: lines, err: "" });
	} catch (e) {
		return put({
			state: "error", entries: [], slips: [], assignments: [], details: null,
			err: e.status === 403
				? "This login may not read payroll on the site — it needs HR Manager or HR User."
				: e.message || String(e),
		});
	}
}

/** Step 1: a draft Payroll Entry for one company's month, with its people.
    @returns {Promise<string>} the entry's name */
export async function startSalaryProcess(company, start, end, posting) {
	const co = await getDoc("Company", company);
	const { doc, missing } = payrollEntryDoc({ company, start, end, posting, co });
	if (missing.length) {
		throw new Error(`${company} has no ${missing.join(", ")} on its Company record. Set it on the site `
			+ "(Company → Accounts and HR defaults) — a Payroll Entry cannot be made without it.");
	}
	const made = await apiCreate("Payroll Entry", doc);

	/* hrms's own Get Employees: who is active in the period and has a salary
	   structure for it. It answers with the entry as it left it and does not
	   save — the desk saves straight after, and so does this. */
	const r = await apiDocMethod("Payroll Entry", made.name, "fill_employee_details");
	const rows = employeeRows(r.docs?.[0]?.employees);
	if (!rows.length) {
		throw new Error(`${made.name} was made, but hrms found nobody to pay: nobody in ${company} has a `
			+ "salary structure assignment for this month. It is a draft and can be deleted on the site.");
	}
	const w = await apiWrite("Payroll Entry", made.name, { employees: rows });
	if (!w.ok) throw new Error(`${made.name} was made, but its employees could not be saved: ${w.error}`);
	return made.name;
}

/** Step 2: submit the entry, which makes the draft slips. */
export const createSalarySlips = (name) => apiSubmitDraft("Payroll Entry", name);
