/* ---------------------------------------------------------------------------
   The reads behind Payroll → Frappe Payroll. See data/frappepayroll.js.

   A count per doctype and the latest few runs and slips — one small request
   each, made when somebody opens the page and not with the first load. Kept
   per company for the rest of the session, because the site has a daily
   compute limit and a page opened twice should not cost it twice; the page's
   Refresh reads again.
   --------------------------------------------------------------------------- */

import { api } from "@/api/client";
import { FRAPPE_PAYROLL_DOCTYPES, hasCompany } from "@/data/frappepayroll";

const cache = new Map();

/** How many of a doctype this login may see, or null when the site will not
    say — a login without read on it, or a doctype the site does not have. A
    null is drawn as "—", never as 0: nought payslips and "not allowed to
    count them" are different answers. */
async function countOf(doctype, filters) {
	try {
		const r = await api("/api/method/frappe.client.get_count", {
			doctype,
			filters: JSON.stringify(filters || []),
		});
		return Number(r && r.message);
	} catch {
		return null;
	}
}

/** The latest `n` rows, newest first, or null when refused. */
async function latest(doctype, fields, filters, n) {
	try {
		const r = await api(`/api/resource/${encodeURIComponent(doctype)}`, {
			fields: JSON.stringify(fields),
			filters: JSON.stringify(filters || []),
			order_by: "creation desc",
			limit_page_length: n,
		});
		return r.data || [];
	} catch {
		return null;
	}
}

/** Everything the page draws, for one company or ("") the whole group. */
export async function loadFrappePayroll(company, { fresh = false } = {}) {
	const key = company || "";
	if (!fresh && cache.has(key)) return cache.get(key);

	const co = (dt) => (company && hasCompany(dt) ? [["company", "=", company]] : []);
	const [counts, runs, slips] = await Promise.all([
		Promise.all(FRAPPE_PAYROLL_DOCTYPES.map((dt) => countOf(dt, co(dt)).then((n) => [dt, n])))
			.then(Object.fromEntries),
		latest("Payroll Entry",
			["name", "company", "start_date", "end_date", "posting_date", "docstatus"], co("Payroll Entry"), 5),
		latest("Salary Slip",
			["name", "employee", "employee_name", "start_date", "end_date", "gross_pay", "net_pay", "status", "docstatus"],
			co("Salary Slip"), 8),
	]);
	const out = { counts, runs, slips };
	cache.set(key, out);
	return out;
}

/** For the tests, which draw the page more than once with different sites. */
export const forgetFrappePayroll = () => cache.clear();
