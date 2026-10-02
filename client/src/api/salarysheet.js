/* ---------------------------------------------------------------------------
   The Salary Sheet's reads, and its one write.

   Reads are Frappe HR's own documents and ours (loans). The slips and their
   lines come from api/payroll.js's loadPayroll — one read of a month, shared
   with Salary Process and the Register, so opening this page after either one
   costs nothing.

   **The one write is a draft Additional Salary.** It is how hrms deducts a
   loan: a slip picks up every *submitted* Additional Salary for its month, and
   this file never submits one. A draft deducts nothing and can be deleted, and
   the submit — which decides that somebody's pay changes — stays with HR on the
   desk, where api/client.js draws the line for every other pay document.
   --------------------------------------------------------------------------- */

import { api, apiCreate, getDoc, listAll } from "@/api/client";
import { additionalSalaryDoc, groupForPosting, loanInstalmentsDue } from "@/lib/salarysheet";
import { lastOfMonth } from "@/lib/format";

/** The Company record, cut down to what the sheet's heading says. Anything the
    site would not give is an empty string, so a heading line is dropped rather
    than printed as "undefined". */
export async function loadCompanyInfo(company) {
	if (!company) return null;
	const c = await getDoc("Company", company);
	if (!c) return { name: company, tax_id: "", registration: "", phone: "", email: "", website: "", currency: "" };
	return {
		name: c.company_name || company,
		tax_id: c.tax_id || "",
		registration: c.registration_details || "",
		phone: c.phone_no || "",
		email: c.email || "",
		website: c.website || "",
		currency: c.default_currency || "",
	};
}

/** Additional Salary documents that already stand for the month — a draft or a
    submitted one, not a cancelled one. Asked for with the loan reference and
    again without it: a site on an older hrms has no such field and refuses the
    wider read with a 417, which must not hide that a deduction exists. */
async function existingFor(ym, components) {
	if (!components.length) return [];
	const filters = [["payroll_date", "=", lastOfMonth(ym)], ["docstatus", "<", 2], ["salary_component", "in", components]];
	const wide = ["name", "employee", "salary_component", "amount", "docstatus", "ref_docname"];
	const narrow = ["name", "employee", "salary_component", "amount", "docstatus"];
	try {
		return await listAll("Additional Salary", wide, filters, 500);
	} catch (e) {
		if (e.status === 403) throw e;
		return listAll("Additional Salary", narrow, filters, 500);
	}
}

/** What the loans ask of one month, and whether each deduction is already
    standing. `state` is "ok" or "error"; an error carries the reason so the
    page says it instead of showing an empty list that reads as "no loans". */
export async function loadLoansDue(company, ym) {
	try {
		const r = await api("/api/resource/Employee Loan Repayment Schedule", {
			parent: "Employee Loan Application",
			fields: JSON.stringify(["parent", "period", "total_amount", "paid_amount", "status"]),
			filters: JSON.stringify([["period", "=", ym]]),
			limit_page_length: 0,
		});
		const lines = r.data || [];
		const names = [...new Set(lines.map((l) => l.parent))];

		const loans = [];
		for (let i = 0; i < names.length; i += 60) {
			const co = company ? [["company", "=", company]] : [];
			loans.push(...await listAll("Employee Loan Application",
				["name", "employee", "employee_name", "company", "loan_type", "loan_status", "salary_component", "outstanding_amount"],
				[["name", "in", names.slice(i, i + 60)], ...co], 500));
		}
		const types = await listAll("Employee Loan Type", ["name", "salary_component"], undefined, 500);

		const due = loanInstalmentsDue({ loans, lines, types });
		const groups = groupForPosting(due);
		const existing = await existingFor(ym, [...new Set(groups.map((g) => g.component))]);
		for (const g of groups) {
			const have = existing.find((x) => x.employee === g.employee && x.salary_component === g.component);
			g.existing = have ? { name: have.name, docstatus: Number(have.docstatus), amount: Number(have.amount) || 0 } : null;
		}
		return {
			state: "ok", due, groups, err: "",
			/* The components loans are deducted through — what lets the sheet name
			   a column as a loan's even when its title does not say so. */
			components: [...new Set(types.map((t) => t.salary_component).filter(Boolean))],
		};
	} catch (e) {
		return {
			state: "error", due: [], groups: [], components: [],
			err: e.status === 403
				? "This login may not read loans on the site — it needs HR Manager or HR User."
				: e.message || String(e),
		};
	}
}

/** Create the drafts for every group that does not have one. One at a time and
    each on its own: a refusal on one person's deduction must not stop the rest,
    and the page has to say which one it was.

    @returns {Promise<{made: object[], existed: object[], failed: object[]}>} */
export async function addLoanDeductions(groups, ym) {
	const made = [];
	const existed = [];
	const failed = [];
	for (const g of groups) {
		if (g.existing) { existed.push(g); continue; }
		try {
			let doc;
			try {
				doc = await apiCreate("Additional Salary", additionalSalaryDoc(g, ym));
			} catch (e) {
				/* The reference to the loan is a convenience. A site that does not
				   have the field says so with a 417 naming it; the deduction is
				   still right without it. */
				if (e.status === 417 && /ref_doc/i.test(String(e.message))) {
					doc = await apiCreate("Additional Salary", additionalSalaryDoc(g, ym, { withRef: false }));
				} else {
					throw e;
				}
			}
			made.push({ ...g, name: doc?.name || "" });
		} catch (e) {
			failed.push({ ...g, error: e.message || String(e) });
		}
	}
	return { made, existed, failed };
}
