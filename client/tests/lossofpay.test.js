import { describe, expect, it } from "vitest";

import { lossOfPay, slipsByEmployee } from "@/lib/payroll";
import { buildSheet } from "@/lib/salarysheet";
import { payrollSummary } from "@/lib/companydash";
import { slipBlock } from "@/lib/payslipdoc";

/* ---------------------------------------------------------------------------
   Loss of pay is absences and leave without pay together. Payroll here is
   based on Attendance (manna_hr/payrollsetup.py), so hrms cuts an Absent day
   through the slip's `absent_days` and an LWP application through
   `leave_without_pay`. The office absence rule's second absence is the first
   kind — a screen reading only the second field shows a cut month as uncut.
   --------------------------------------------------------------------------- */

const slip = (o) => ({ name: "S1", employee: "E1", employee_name: "Anil Kumar", docstatus: 1,
	total_working_days: 30, payment_days: 27, leave_without_pay: 1, absent_days: 2,
	gross_pay: 18000, total_deduction: 0, net_pay: 18000, ...o });

describe("loss of pay", () => {
	it("counts an absent day the slip did not pay as well as a day of leave without pay", () => {
		expect(lossOfPay(slip())).toBe(3);
	});

	it("is the leave without pay alone on a slip that has no absent days field", () => {
		expect(lossOfPay({ leave_without_pay: 2 })).toBe(2);
		expect(lossOfPay(null)).toBe(0);
	});

	it("adds up across a person's slips for the period", () => {
		const by = slipsByEmployee([slip(), slip({ name: "S2", absent_days: 1, leave_without_pay: 0 })]);
		expect(by.E1.loss_of_pay).toBe(4);
	});

	it("is the salary sheet's LWP column, so a second absence shows on it", () => {
		const { rows } = buildSheet({ slips: [slip({ leave_without_pay: 0, absent_days: 1 })], details: [] });
		expect(rows[0].lwp).toBe(1);
	});

	it("is the company dashboard's unpaid-days count", () => {
		expect(payrollSummary([slip(), slip({ name: "S2", absent_days: 1, leave_without_pay: 0 })]).lwp).toBe(4);
	});

	it("is the payslip's loss of pay days", () => {
		const html = slipBlock(slip({ leave_without_pay: 0, absent_days: 1 }), [], null, null, "2026-10");
		expect(html).toMatch(/Loss of pay days<\/td><td>1</);
	});
});
