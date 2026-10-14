/* A sample of Payroll → step 4 → "Download 5-tab Excel", built through the
   app's own code with made-up people, for showing what the file looks like.
   Run: npx vite-node scripts/sample5tab.mjs <out.xlsx> */
import { payrollDesignParts } from "@/lib/payrolldesign";
import { registerBook } from "@/lib/registerxlsx";

const out = process.argv[2] || "sample-5-tab.xlsx";
/* September 2026: Sundays the 6th, 13th, 20th and 27th, a holiday on the 2nd
   (Onam), and `marks` putting leave (L), half days (0.5) or absences (0) on
   given dates. */
const month = (marks = {}) => Array.from({ length: 30 }, (_, i) => {
	const d = i + 1;
	if ([6, 13, 20, 27].includes(d)) return "SNDY";
	if (d === 2) return "HOL";
	return marks[d] ?? 1;
});
const MRPPL = "Manna Rubber Products Pvt.Ltd";
let srl = 0;
const person = (code, name, net, extra = {}) => {
	const esi = extra.esi ?? 0;
	const pf = extra.pf ?? 0;
	return {
		srl: ++srl, code, name, days: month(extra.marks), paymentDays: 30, clBrought: 1, clEarned: 1,
		state: "Submitted", branch: MRPPL, company: MRPPL,
		gross: net + esi + pf, deduction: esi + pf, net, esi, pf, agreed: net + esi + pf,
		salaryMode: "Bank", employmentType: "Full-time", ...extra,
	};
};
const rows = [
	person("MR001", "Anand Raghavan", 18500, { esi: 140, pf: 1800, bankAmount: 15000, marks: { 8: "L", 9: "L", 10: "L", 11: 0, 12: 0, 14: 0, 15: 0 }, paymentDays: 24 }),
	person("MR002", "Priya Menon", 32000, { pf: 1800, marks: { 16: "L" } }),
	person("MR003", "Rahul Nair", 45000, { pf: 1800, bankAmount: 25000, clBrought: 2 }),
	person("MR004", "Sneha Thomas", 26000, { pf: 1800, bankPercent: 50, marks: { 3: 0.5, 21: "L", 22: "L", 23: 0, 24: 0, 25: 0, 26: 0, 28: 0, 29: 0, 30: 0 }, paymentDays: 21.5 }),
	person("MR005", "Joseph Varghese", 12000, { salaryMode: "Cash", marks: { 17: "L", 18: 0 }, paymentDays: 29 }),
	person("SR001", "Bindu Kurian", 21000, { company: "Soorya Rubbers", branch: "Soorya Rubbers", pf: 1800 }),
	person("LS001", "Suresh Kumar", 15000, { employmentType: "Contract", department: "Labour supply" }),
];
const parts = payrollDesignParts([{ company: MRPPL, rows }], { bankCap: 20000 });
const wb = await registerBook(parts, { ym: "2026-09", address: "Perumbavoor, Kerala", bankCap: 20000 });
await wb.xlsx.writeFile(out);
console.log(parts.map((p) => `${p.sheet}: ${p.count}`).join("\n"));
console.log("written", out);
