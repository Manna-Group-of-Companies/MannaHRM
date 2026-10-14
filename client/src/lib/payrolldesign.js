/* The five-sheet payroll workbook from the September 2026 reference. The source
   rows remain the full Salary Slip/register rows; these tabs are views for the
   payment workflow, not alternate wage or ESI calculations.

   The five tabs are Manna Rubber Products' (MRPPL), and Soorya Rubbers is paid
   with it: picking MRPPL in the top bar brings Soorya in too. Every other
   company gets the same tabs under its own abbreviation — never MRPPL's, which
   is where they landed while "Manna" in a name was enough to count as MRPPL
   (12 October 2026). */

const text = (v) => String(v || "").trim().toLowerCase();
const money = (v) => Number(v) || 0;
const has = (v, re) => re.test(text(v));

/** Manna Rubber Products, under any spelling the site or the sheet uses —
    HR has called it "Manna Rubber Park" as well. */
export const isMrppl = (name) => has(name, /manna rubber (products|park)|\bmrppl\b/);
/** Soorya Rubbers — "Surya" too, as HR writes it. */
export const isSoorya = (name) => has(name, /soo?rya|surya/);

/** The companies a 5-tab download covers for the company picked in the top
    bar: every one for "All companies", MRPPL with Soorya, any other on its own. */
export function designCompanies(companies, picked) {
	const all = (companies || []).filter((c) => c && c.name);
	if (!picked) return all;
	if (isMrppl(picked)) return all.filter((c) => c.name === picked || isSoorya(c.name));
	return all.filter((c) => c.name === picked);
}

function sooryaRow(r) {
	return isSoorya(r.company) || isSoorya(r.branch) || isSoorya(r._co);
}

function labourRow(r) {
	return has(`${r.employmentType} ${r.department} ${r.designation} ${r.branch}`, /contract|labou?r|manpower/);
}

/** Whether a person takes any of their net pay home in cash, by their own
    salary structure — what Salary Setup's upload put on their Employee record:
    Salary Mode Cash (all cash), or a bank share or bank amount that leaves some
    of the net over (9 October 2026). Somebody with neither is paid by bank, and
    only the Diff Cash limit can send part of their pay to cash. */
export function paysCash(r) {
	if (text(r.salaryMode) === "cash") return true;
	/* The Cash field on their salary assignment: cash beside the salary. */
	if (Number(r.cashPay) > 0) return true;
	const pct = Number(r.bankPercent);
	if (pct > 0) return pct < 100;
	const amt = Number(r.bankAmount);
	if (!(amt > 0)) return false;
	/* The split is of the salary (registerxlsx `writePaymentSplit`), so there
	   is cash whenever the salary is more than the bank sum — whatever the net,
	   which a preview row does not even have. A row with neither stays on:
	   on Cash-1 its cash comes to 0 by formula, while left off it a person's
	   cash goes unpaid, the expensive way round (13 October 2026, ₹29,000 with
	   ₹21,000 by bank that never reached Cash-1). */
	const known = (v) => v !== undefined && v !== null && v !== "";
	if (known(r.base) && money(r.base) > 0) return money(r.base) > amt;
	if (known(r.net)) return money(r.net) > amt;
	return true;
}

/** Only the people with a salary structure assigned for the month (HR, 14
    October 2026): a submitted Salary Structure Assignment from on or before
    the month's last day. `assignments` is what api/payroll.js reads — those
    already, so the date is checked again only to be safe.
    @returns {{rows: object[], out: number}} */
export function assignedOnly(rows, assignments, end) {
	const has = new Set((assignments || [])
		.filter((a) => Number(a.docstatus ?? 1) === 1 && (!end || String(a.from_date) <= String(end)))
		.map((a) => a.employee));
	const kept = (rows || []).filter((r) => has.has(r.employee));
	return { rows: kept, out: (rows || []).length - kept.length };
}

/** Each row with the person's actual salary (Employee Actual Salary, 14 October
    2026): their latest row from on or before the month's last day. Shown on
    Diff Cash beside the payroll figures and read by nothing that pays. */
export function withActualSalary(rows, actuals, end) {
	const latest = new Map();
	for (const a of actuals || []) {
		if (!a.employee || !(Number(a.actual_salary) > 0) || String(a.from_date) > String(end)) continue;
		const had = latest.get(a.employee);
		if (!had || String(a.from_date) > String(had.from_date)) latest.set(a.employee, a);
	}
	return (rows || []).map((r) => (latest.has(r.employee) ? { ...r, actualSalary: Number(latest.get(r.employee).actual_salary) } : r));
}

/** A short name for a company's tabs: its abbreviation, else its initials. */
const shortOf = (p) => String(p.abbr || "").trim()
	|| String(p.title || p.company || "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0].toUpperCase()).join("").slice(0, 8)
	|| "Co";

/** Salary, Cash and Diff Cash for one set of rows. */
function payTabs(rows, { prefix, company, bankCap, allPreview }) {
	/* Cash-1 is everybody whose own structure pays them some cash, with their
	   take-home cash worked out per person on the sheet (registerxlsx `cashTab`). */
	const cash = rows.filter(paysCash);
	const salary = rows.filter((r) => text(r.salaryMode) !== "cash");
	/* Somebody whose record splits their pay (half by bank, say) is on the split
	   tab whatever their net, as well as anybody the limit splits. */
	const ownSplit = (r) => Number(r.bankPercent) > 0 || Number(r.bankAmount) > 0 || Number(r.cashPay) > 0 || Number(r.actualSalary) > 0;
	const diffCash = rows.filter((r) => r._preview || ownSplit(r) || money(r.net) > bankCap);
	return [
		{ sheet: `${prefix} Salary-1`, company, rows: salary, preview: allPreview(salary) },
		{ sheet: `${prefix} Cash-1`, company, rows: cash, preview: allPreview(cash), paymentSplit: true, cashTab: true, bankCap },
		{ sheet: `${prefix} Diff Cash`, company, rows: diffCash, preview: allPreview(diffCash), paymentSplit: true, bankCap },
	];
}

/** Split the full payroll-register rows into the reference workbook's tabs.
    @param registers [{company, title?, abbr?, preview?, rows}] — one a company read */
export function payrollDesignParts(registers, { bankCap = 20000, pfShare } = {}) {
	/* `pfShare` is the EPF calculation HR chose for this file — 100 or 50, Basic
	   + DA as a share of the pay due — and it decides EPF wages on every tab. */
	const tag = (p) => (r) => ({
		...r,
		company: r.company || p.company || "",
		_co: p.company || r.company || "",
		_preview: Boolean(p.preview),
		...(pfShare === 100 || pfShare === 50 ? { pfShare } : {}),
	});
	const allPreview = (group) => group.length > 0 && group.every((r) => r._preview);
	const inGroup = (p) => isMrppl(p.company) || isSoorya(p.company) || (!p.company && (p.rows || []).some((r) => isMrppl(r.company)));

	const parts = [];
	const group = (registers || []).filter(inGroup);
	if (group.length) {
		const rows = group.flatMap((p) => (p.rows || []).map(tag(p)));
		const mrppl = rows.filter((r) => !sooryaRow(r) && !labourRow(r));
		const soorya = rows.filter((r) => sooryaRow(r) && !labourRow(r));
		const labour = rows.filter(labourRow);
		parts.push(
			...payTabs(mrppl, { prefix: "MRPPL", company: "Manna Rubber Products Pvt.Ltd", bankCap, allPreview }),
			{ sheet: "Soorya Rubbers", company: "Transferred to Soorya Rubbers", rows: soorya, preview: allPreview(soorya) },
			{ sheet: "Labour supply", company: "Manna Rubber Products Pvt.Ltd", rows: labour, preview: allPreview(labour) },
		);
	}
	for (const p of (registers || []).filter((x) => !inGroup(x))) {
		const rows = (p.rows || []).map(tag(p));
		const title = p.title || p.company;
		const prefix = shortOf(p);
		const labour = rows.filter(labourRow);
		parts.push(
			...payTabs(rows.filter((r) => !labourRow(r)), { prefix, company: title, bankCap, allPreview }),
			{ sheet: `${prefix} Labour supply`, company: title, rows: labour, preview: allPreview(labour) },
		);
	}
	return parts.map((p) => ({ ...p, count: p.rows.length }));
}

/** The 5-tab Excel is the month's payment file, so it carries Active people
    only (HR, 12 October 2026). Somebody whose record says Left, Suspended or
    Inactive is taken out and named, so their last pay goes through Full & Final
    rather than missing. A row whose status could not be read stays in: a
    payment file that silently dropped somebody is the costlier mistake.
    @returns {{registers: object[], out: {name, code, status, company}[]}} */
export function activeOnly(registers) {
	const out = [];
	const kept = (registers || []).map((p) => ({
		...p,
		rows: (p.rows || []).filter((r) => {
			if (!r.status || r.status === "Active") return true;
			out.push({ name: r.name, code: r.code, status: r.status, company: p.title || p.company });
			return false;
		}),
	}));
	return { registers: kept, out };
}
