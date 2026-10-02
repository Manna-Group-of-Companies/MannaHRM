/* ---------------------------------------------------------------------------
   Payroll → Bank Transfer: who is paid how much, and where to send it.

   Pure. Each person's **whole net pay** is the Salary Slip's own figure; nothing
   here splits, caps or moves any of it. A person with no bank details on their
   Employee record is listed as such — for HR to fix the record, or to pay by
   another mode — and is never silently dropped from the total.
   --------------------------------------------------------------------------- */

const n = (v) => Number(v) || 0;

/** How a person is paid. `Employee.salary_mode` is the site's own word for it
    when it has one; otherwise a bank account on the record means the bank. */
export function payMode(emp) {
	const mode = String((emp && emp.salary_mode) || "").trim();
	const hasBank = Boolean(emp && String(emp.bank_ac_no || "").trim());
	if (mode && mode !== "Bank") return mode;
	return hasBank ? "Bank" : "No bank details";
}

/** The sheet's rows and totals. @param slips Salary Slip rows  @param emps Employee rows
    (name, employee_name, employee_number, bank_name, bank_ac_no, ifsc_code, salary_mode) */
export function bankSheet(slips, emps) {
	const by = new Map((emps || []).map((e) => [e.name, e]));
	const live = (slips || []).filter((s) => Number(s.docstatus) < 2);
	const rows = live.map((s) => {
		const e = by.get(s.employee) || {};
		return {
			slip: s.name, employee: s.employee, code: e.employee_number || s.employee, name: s.employee_name || e.employee_name || s.employee,
			bank: e.bank_name || "", account: e.bank_ac_no || "", ifsc: e.ifsc_code || "",
			mode: payMode(e), net: n(s.net_pay), state: Number(s.docstatus) === 1 ? "Submitted" : "Draft",
		};
	}).sort((a, b) => String(a.name).localeCompare(String(b.name)));
	const sum = (list) => Math.round(list.reduce((t, r) => t + r.net, 0) * 100) / 100;
	const bank = rows.filter((r) => r.mode === "Bank");
	const other = rows.filter((r) => r.mode !== "Bank");
	return {
		rows,
		totals: { count: rows.length, net: sum(rows), bankCount: bank.length, bank: sum(bank), otherCount: other.length, other: sum(other) },
	};
}

/** Rows for the Excel file, in the column order of the sheet. */
export const bankColumns = ["Employee code", "Name", "Bank", "Account number", "IFSC", "Pay by", "Net pay"];
export const bankLine = (r) => [r.code, r.name, r.bank, r.account, r.ifsc, r.mode, r.net];
