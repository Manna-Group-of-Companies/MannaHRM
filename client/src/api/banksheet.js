import { listAll } from "@/api/client";

/* Payroll → Bank Transfer's one read beyond the month's slips: where each person
   is paid. Stock Employee fields; a site without one of them refuses the wider
   read, so it falls back to fewer rather than showing nobody. */
const WIDE = ["name", "employee_name", "employee_number", "bank_name", "bank_ac_no", "ifsc_code", "salary_mode"];
const NARROW = ["name", "employee_name", "employee_number", "bank_name", "bank_ac_no"];

export async function loadBankDetails(company) {
	const co = company ? [["company", "=", company]] : [];
	try {
		return await listAll("Employee", WIDE, co, 2000);
	} catch (e) {
		if (e.status === 403) throw e;
		return listAll("Employee", NARROW, co, 2000);
	}
}
