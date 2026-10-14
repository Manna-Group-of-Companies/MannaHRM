import { describe, expect, it } from "vitest";

import { bankShareOf } from "@/lib/register";
import { registerWorkbook } from "@/lib/registerxlsx";
import { activeOnly, assignedOnly, designCompanies, payrollDesignParts, paysCash, withActualSalary } from "@/lib/payrolldesign";

/* ---------------------------------------------------------------------------
   How a person's net pay is handed over — part to their bank account, the rest
   in cash — recorded on the register (9 October 2026). The rule pinned here is
   that the split is only that: the wage, ESI, PF and PT on the register stay the
   full figures, whatever share goes by bank.
   --------------------------------------------------------------------------- */

const days = Array.from({ length: 30 }, () => 1);
const slip = (code, net, extra = {}) => ({
	srl: 1, code, name: `Person ${code}`, days, paymentDays: 30, state: "Submitted",
	gross: net + 200, deduction: 200, net, esi: 150, company: "Manna Rubber Products Pvt.Ltd", ...extra,
});

describe("a person's bank share", () => {
	it("is a percentage when the record has one, never above 100", () => {
		expect(bankShareOf({ custom_bank_percent: 50 })).toEqual({ bankPercent: 50, bankAmount: "" });
		expect(bankShareOf({ custom_bank_percent: 150 }).bankPercent).toBe(100);
	});

	it("is a fixed amount when there is no percentage, and nothing when neither is set", () => {
		expect(bankShareOf({ custom_bank_amount: 20000 })).toEqual({ bankPercent: "", bankAmount: 20000 });
		expect(bankShareOf({ custom_bank_percent: 50, custom_bank_amount: 20000 }).bankAmount).toBe("");
		expect(bankShareOf({})).toEqual({ bankPercent: "", bankAmount: "" });
	});
});

describe("the bank and cash columns", () => {
	it("take the person's own cash share off the salary due, so PF and ESI come out of the bank part; the sheet's limit splits the net for everybody else", async () => {
		const rows = [slip("A1", 30000, { bankPercent: 50 }), slip("A2", 30000, { bankAmount: 10000 }), slip("A3", 30000)];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("CV2").value).toBe(20000);
		expect(ws.getCell("CW6").value).toEqual({ formula: "MIN(MAX(0,CR6),ROUND(BL6*50%,2))" });
		expect(ws.getCell("CV6").value).toEqual({ formula: "MAX(0,MAX(0,CR6)-CW6)" });
		expect(ws.getCell("CW7").value).toEqual({ formula: "IF(BE7>0,MIN(MAX(0,CR7),ROUND(BL7*MAX(0,BE7-10000)/BE7,2)),MAX(0,MAX(0,CR7)-10000))" });
		expect(ws.getCell("CV8").value).toEqual({ formula: "MIN(MAX(0,CR8),$CV$2)" });
		expect(ws.getCell("CW8").value).toEqual({ formula: "MAX(0,CR8-CV8)" });
	});

	it("lay Diff Cash out as HR's sheet — Net Payable, Paid by Bank, and Diff to be paid by Cash in yellow — one row a person", async () => {
		const rows = [slip("A1", 29664, { bankAmount: 19630 }), slip("A2", 15000)];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect([ws.getCell("CU5").value, ws.getCell("CV5").value, ws.getCell("CW5").value])
			.toEqual(["Net Payable After Round up", "Paid by Bank", "Diff to be paid by Cash"]);
		expect(ws.getCell("CW5").fill.fgColor.argb).toBe("FFFFFF00");
		expect(ws.getCell("CW6").fill.fgColor.argb).toBe("FFFFFF00");
		expect(ws.getCell("C6").value).toBe("A1");
		expect(ws.getCell("C7").value).toBe("A2");
	});

	it("carry no separate Actual Salary column — Net Payable is the actual salary", async () => {
		const ws = (await registerWorkbook([slip("A1", 18000, { actualSalary: 29000 })], { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("CX5").value).toBe(null);
		expect(ws.getCell("CU5").value).toBe("Net Payable After Round up");
	});

	it("show the actual salary as Net Payable on Diff Cash only, the payroll net by bank, and the rest as cash", async () => {
		const paul = slip("MRP-293", 18322, { base: 21000, cashPay: 8000, actualSalary: 29000 });
		const diff = (await registerWorkbook([paul], { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(diff.getCell("CU6").value).toEqual({ formula: "ROUND(29000*IF(BE6>0,MIN(1,BL6/BE6),1),2)" });
		expect(diff.getCell("CV6").value).toEqual({ formula: "MIN(MAX(0,CR6),CU6)" });
		expect(diff.getCell("CW6").value).toEqual({ formula: "MAX(0,CU6-CV6)" });
		/* Cash-1 keeps the payroll net, and its cash is the Cash field. */
		const cash1 = (await registerWorkbook([paul], { ym: "2026-09", company: "C", paymentSplit: true, cashTab: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(cash1.getCell("CU6").value).toEqual({ formula: "CR6" });
		expect(cash1.getCell("CW6").value).toEqual({ formula: "ROUND(8000*IF(BE6>0,MIN(1,BL6/BE6),1),2)" });
	});

	it("leave the actual salary off Cash-1", async () => {
		const ws = (await registerWorkbook([slip("A1", 18000, { cashPay: 8000, actualSalary: 29000 })], { ym: "2026-09", company: "C", paymentSplit: true, cashTab: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("CX5").value).toBe(null);
	});

	it("leave ESI and the net at the full figures, whatever share goes by bank", async () => {
		const rows = [slip("A1", 30000, { bankPercent: 50 }), slip("A2", 30000)];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C", paymentSplit: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("BW6").value).toBe(150);
		expect(ws.getCell("BW7").value).toBe(150);
		expect(ws.getCell("CR6").value).toBe(30000);
		expect(ws.getCell("CU6").value).toEqual({ formula: "CR6" });
	});
});

describe("the five-tab workbook's split tab", () => {
	it("carries anybody whose record splits their pay, even with a net under the limit", () => {
		const parts = payrollDesignParts([{ company: "Manna Rubber Products Pvt.Ltd", rows: [
			slip("H1", 15000, { bankPercent: 50 }), slip("U1", 15000), slip("O1", 30000),
		] }], { bankCap: 20000 });
		const diff = parts.find((p) => p.sheet === "MRPPL Diff Cash");
		expect(diff.rows.map((r) => r.code)).toEqual(["H1", "O1"]);
		expect(parts.find((p) => p.sheet === "MRPPL Salary-1").rows.map((r) => r.code)).toEqual(["H1", "U1", "O1"]);
	});
});

describe("MRPPL Cash-1, by each person's own salary structure", () => {
	const MR = "Manna Rubber Products Pvt.Ltd";
	const people = [
		slip("ALLCASH", 12000, { salaryMode: "Cash" }),
		slip("HALF", 26000, { salaryMode: "Bank", bankPercent: 50 }),
		slip("FIXED", 20000, { salaryMode: "Bank", bankAmount: 15000 }),
		slip("ALLBANK", 30000, { salaryMode: "Bank", bankPercent: 100 }),
		slip("NOSPLIT", 30000, { salaryMode: "Bank" }),
		slip("BANKCOVERS", 14000, { salaryMode: "Bank", bankAmount: 15000 }),
	];

	it("takes everybody whose structure pays them some cash, and nobody it pays wholly by bank", () => {
		expect(people.filter(paysCash).map((r) => r.code)).toEqual(["ALLCASH", "HALF", "FIXED"]);
		const parts = payrollDesignParts([{ company: MR, rows: people }], { bankCap: 20000 });
		expect(parts.find((x) => x.sheet === "MRPPL Cash-1").rows.map((r) => r.code)).toEqual(["ALLCASH", "HALF", "FIXED"]);
		expect(parts.find((x) => x.sheet === "MRPPL Salary-1").rows.map((r) => r.code)).toEqual(["HALF", "FIXED", "ALLBANK", "NOSPLIT", "BANKCOVERS"]);
	});

	it("puts a preview row with a fixed bank sum on Cash-1 by its salary, since a preview has no net yet", () => {
		const preview = [
			{ code: "MRP-293", name: "PAUL SUNNY", salaryMode: "Bank", bankAmount: 12000, base: 21000 },
			{ code: "COVERED", name: "Covered", salaryMode: "Bank", bankAmount: 15000, base: 14000 },
			{ code: "NOBASE", name: "No base", salaryMode: "Bank", bankAmount: 12000 },
		];
		expect(preview.filter(paysCash).map((r) => r.code)).toEqual(["MRP-293", "NOBASE"]);
		const parts = payrollDesignParts([{ company: MR, preview: true, rows: preview }], { bankCap: 20000 });
		expect(parts.find((x) => x.sheet === "MRPPL Cash-1").rows.map((r) => r.code)).toEqual(["MRP-293", "NOBASE"]);
	});

	it("works each person's cash take-home out of their own share, never the limit, and none by bank for an all-cash person", async () => {
		const parts = payrollDesignParts([{ company: MR, rows: people }], { bankCap: 20000 });
		const cash = parts.find((x) => x.sheet === "MRPPL Cash-1");
		const ws = (await registerWorkbook(cash.rows, { ym: "2026-09", company: MR, paymentSplit: true, cashTab: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("CW5").value).toBe("Cash take-home (₹)");
		expect(ws.getCell("CV2").value).toBe(null);
		expect(ws.getCell("CV6").value).toEqual({ formula: "0" });
		expect(ws.getCell("CW7").value).toEqual({ formula: "MIN(MAX(0,CR7),ROUND(BL7*50%,2))" });
		expect(ws.getCell("CW8").value).toEqual({ formula: "IF(BE8>0,MIN(MAX(0,CR8),ROUND(BL8*MAX(0,BE8-15000)/BE8,2)),MAX(0,MAX(0,CR8)-15000))" });
		expect(ws.getCell("CW6").value).toEqual({ formula: "MAX(0,CR6-CV6)" });
	});

	it("keeps the cash at the sheet's own figure — ₹29,000 with ₹21,000 by bank is ₹8,000 cash, and PF and ESI come out of the bank part", async () => {
		const paul = { code: "MRP-293", name: "PAUL SUNNY", salaryMode: "Bank", bankAmount: 21000, base: 29000, kind: "Salary", days: [] };
		const ws = (await registerWorkbook([paul], { ym: "2026-09", company: MR, paymentSplit: true, cashTab: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("BE6").value).toBe(29000);
		/* A full month: BL (salary due) is 29,000, so the cash is 29,000 × 8,000 / 29,000. */
		expect(ws.getCell("CW6").value).toEqual({ formula: "IF(BE6>0,MIN(MAX(0,CR6),ROUND(BL6*MAX(0,BE6-21000)/BE6,2)),MAX(0,MAX(0,CR6)-21000))" });
		expect(ws.getCell("CV6").value).toEqual({ formula: "MAX(0,MAX(0,CR6)-CW6)" });
	});

	it("shows the Cash field from the salary assignment on Cash-1, beside a net that all goes by bank", async () => {
		const paul = { code: "MRP-293", name: "PAUL SUNNY", salaryMode: "Bank", base: 21000, cashPay: 8000, kind: "Salary", days: [] };
		expect(paysCash(paul)).toBe(true);
		const parts = payrollDesignParts([{ company: MR, preview: true, rows: [paul] }], { bankCap: 20000 });
		expect(parts.find((x) => x.sheet === "MRPPL Cash-1").rows.map((r) => r.code)).toEqual(["MRP-293"]);
		const ws = (await registerWorkbook([paul], { ym: "2026-09", company: MR, paymentSplit: true, cashTab: true, bankCap: 20000 })).getWorksheet("Wages Register");
		expect(ws.getCell("CV6").value).toEqual({ formula: "MAX(0,CR6)" });
		/* ₹8,000 on a full month, cut like the salary for days not worked. */
		expect(ws.getCell("CW6").value).toEqual({ formula: "ROUND(8000*IF(BE6>0,MIN(1,BL6/BE6),1),2)" });
	});

	it("leaves the wage, ESI and net on Cash-1 at the full Salary Slip figures", async () => {
		const ws = (await registerWorkbook([slip("HALF", 26000, { bankPercent: 50 })], { ym: "2026-09", company: MR, paymentSplit: true, cashTab: true })).getWorksheet("Wages Register");
		expect(ws.getCell("BW6").value).toBe(150);
		expect(ws.getCell("CR6").value).toBe(26000);
	});
});

describe("EPF wages in the 5-tab Excel, by the calculation asked for on download", () => {
	it("puts the chosen calculation on every row of every tab", () => {
		const parts = payrollDesignParts([{ company: "Manna Rubber Products Pvt.Ltd", rows: [slip("A1", 30000), slip("A2", 10000)] }], { pfShare: 50 });
		expect(parts.flatMap((p) => p.rows).every((r) => r.pfShare === 50)).toBe(true);
		const none = payrollDesignParts([{ company: "Manna Rubber Products Pvt.Ltd", rows: [slip("A1", 30000)] }], {});
		expect(none.flatMap((p) => p.rows).some((r) => "pfShare" in r)).toBe(false);
	});

	it("works EPF wages out of the pay due for a PF member on a month with slips, and nothing for anybody else", async () => {
		const rows = [slip("PF", 20000, { pfMember: true, due: 19500, pfShare: 50 }), slip("NOPF", 20000, { pfMember: false, due: 19500, pfShare: 50 })];
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C" })).getWorksheet("Wages Register");
		expect(ws.getCell("BM6").model).toMatchObject({ formula: 'IF(BQ6="Yes",BL6*50%,0)', result: 9750 });
		expect(ws.getCell("BM7").model).toMatchObject({ formula: 'IF(BQ7="Yes",BL7*50%,0)', result: 0 });
		const full = (await registerWorkbook([slip("PF", 20000, { pfMember: true, due: 19500, pfShare: 100 })], { ym: "2026-09", company: "C" })).getWorksheet("Wages Register");
		expect(full.getCell("BM6").model).toMatchObject({ formula: 'IF(BQ6="Yes",BL6*100%,0)', result: 19500 });
	});

	it("leaves EPF wages empty on a month with slips when the file was not asked for a calculation", async () => {
		const ws = (await registerWorkbook([slip("PF", 20000, { pfMember: true, due: 19500 })], { ym: "2026-09", company: "C" })).getWorksheet("Wages Register");
		expect(ws.getCell("BM6").value).toBe(null);
	});
});

describe("which companies the 5-tab Excel covers, by the company in the top bar", () => {
	const companies = [
		{ name: "Manna Rubber Products Private Limited", abbr: "MRPPL" }, { name: "Soorya Rubbers", abbr: "SR" },
		{ name: "Manna Treads", abbr: "MT" }, { name: "Manna Tyre UAE", abbr: "MTU" },
	];

	it("takes every company for All companies", () => {
		expect(designCompanies(companies, "").map((c) => c.abbr)).toEqual(["MRPPL", "SR", "MT", "MTU"]);
	});

	it("takes Soorya Rubbers with Manna Rubber Products, since they are paid together", () => {
		expect(designCompanies(companies, "Manna Rubber Products Private Limited").map((c) => c.abbr)).toEqual(["MRPPL", "SR"]);
		expect(designCompanies([...companies, { name: "Surya Rubber", abbr: "SU" }], "Manna Rubber Products Private Limited").map((c) => c.abbr))
			.toEqual(["MRPPL", "SR", "SU"]);
	});

	it("takes any other company on its own", () => {
		expect(designCompanies(companies, "Manna Treads").map((c) => c.abbr)).toEqual(["MT"]);
	});

	it("gives another company its own tabs under its abbreviation, never MRPPL's", () => {
		const parts = payrollDesignParts([
			{ company: "Manna Rubber Products Private Limited", title: "Manna Rubber Products Pvt.Ltd", abbr: "MRPPL", rows: [slip("M1", 15000)] },
			{ company: "Soorya Rubbers", title: "Soorya Rubbers", abbr: "SR", rows: [slip("S1", 15000, { company: "Soorya Rubbers" })] },
			{ company: "Manna Treads", title: "Manna Treads Pvt.Ltd", abbr: "MT", rows: [slip("T1", 15000, { company: "Manna Treads Pvt.Ltd" })] },
		]);
		const where = (code) => parts.filter((p) => p.rows.some((r) => r.code === code)).map((p) => p.sheet);
		expect(where("M1")).toEqual(["MRPPL Salary-1"]);
		expect(where("S1")).toEqual(["Soorya Rubbers"]);
		expect(where("T1")).toEqual(["MT Salary-1"]);
		expect(parts.map((p) => p.sheet)).toEqual([
			"MRPPL Salary-1", "MRPPL Cash-1", "MRPPL Diff Cash", "Soorya Rubbers", "Labour supply",
			"MT Salary-1", "MT Cash-1", "MT Diff Cash", "MT Labour supply",
		]);
		expect(parts.find((p) => p.sheet === "MT Salary-1").company).toBe("Manna Treads Pvt.Ltd");
	});

	it("makes no MRPPL tabs for a file of another company alone", () => {
		const parts = payrollDesignParts([{ company: "Manna Treads", abbr: "MT", rows: [slip("T1", 15000, { company: "Manna Treads" })] }]);
		expect(parts.some((p) => p.sheet.startsWith("MRPPL") || p.sheet === "Soorya Rubbers")).toBe(false);
	});
});

describe("only Active people in the 5-tab Excel", () => {
	it("leaves out anybody whose record is not Active, and names them", () => {
		const { registers, out } = activeOnly([{ company: "MRPPL", title: "Manna Rubber Products Pvt.Ltd", rows: [
			slip("A1", 15000, { status: "Active" }), slip("L1", 15000, { status: "Left" }), slip("S1", 15000, { status: "Suspended" }),
		] }]);
		expect(registers[0].rows.map((r) => r.code)).toEqual(["A1"]);
		expect(out).toEqual([
			{ name: "Person L1", code: "L1", status: "Left", company: "Manna Rubber Products Pvt.Ltd" },
			{ name: "Person S1", code: "S1", status: "Suspended", company: "Manna Rubber Products Pvt.Ltd" },
		]);
	});

	it("keeps somebody whose status could not be read, rather than dropping them from a payment file", () => {
		const { registers, out } = activeOnly([{ company: "C", rows: [slip("U1", 15000)] }]);
		expect(registers[0].rows.map((r) => r.code)).toEqual(["U1"]);
		expect(out).toEqual([]);
	});
});

describe("the actual salary on the 5-tab", () => {
	it("is each person's latest Employee Actual Salary from on or before the month's end", () => {
		const actuals = [
			{ employee: "E1", from_date: "2026-01-01", actual_salary: 25000 },
			{ employee: "E1", from_date: "2026-09-01", actual_salary: 29000 },
			{ employee: "E1", from_date: "2026-10-01", actual_salary: 31000 },
		];
		const [r] = withActualSalary([{ employee: "E1" }], actuals, "2026-09-30");
		expect(r.actualSalary).toBe(29000);
		expect(withActualSalary([{ employee: "E2" }], actuals, "2026-09-30")[0].actualSalary).toBe(undefined);
	});
});

describe("who the 5-tab carries", () => {
	it("is only the people with a salary structure assigned by the month's end", () => {
		const rows = [{ employee: "AMAL" }, { employee: "PAUL" }, { employee: "NOSALARY" }, { employee: "LATER" }];
		const assignments = [
			{ employee: "AMAL", from_date: "2026-09-01", docstatus: 1 },
			{ employee: "PAUL", from_date: "2026-09-01", docstatus: 1 },
			{ employee: "LATER", from_date: "2026-10-01", docstatus: 1 },
			{ employee: "NOSALARY", from_date: "2026-09-01", docstatus: 2 },
		];
		const { rows: kept, out } = assignedOnly(rows, assignments, "2026-09-30");
		expect(kept.map((r) => r.employee)).toEqual(["AMAL", "PAUL"]);
		expect(out).toBe(2);
	});
});
