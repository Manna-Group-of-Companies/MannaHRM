import { lossOfPay, slipLines } from "@/lib/payroll";
import { periodLabel } from "@/lib/salarysheet";

/* ---------------------------------------------------------------------------
   Payroll → Payslips: one slip as a printable page.

   Pure: slip rows and their Salary Detail rows in, an HTML string out, which
   the page shows in a frame and hands to the browser's print dialog
   (lib/doc.js printPaper). **Every figure is the slip's own** — gross,
   deductions and net are what hrms stored, and the lines are its Salary Detail
   rows. Nothing is added up here, so a slip that opted a component out of its
   totals still prints the totals the person was actually paid.
   --------------------------------------------------------------------------- */

const n = (v) => Number(v) || 0;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (v) => n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
	"Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const below1000 = (x) => {
	const h = Math.floor(x / 100), r = x % 100;
	const t = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? " " + ONES[r % 10] : "");
	return [h ? ONES[h] + " Hundred" : "", t].filter(Boolean).join(" ");
};

/** "Rupees Twelve Thousand Five Hundred and Fifty Paise Only", in the lakh and
    crore grouping an Indian payslip is read in. */
export function rupeesInWords(amount) {
	const paise = Math.round(Math.abs(n(amount)) * 100);
	const rupees = Math.floor(paise / 100), ps = paise % 100;
	if (!rupees && !ps) return "Rupees Zero Only";
	const groups = [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]];
	let left = rupees;
	const out = [];
	for (const [size, name] of groups) {
		const q = Math.floor(left / size);
		if (q) out.push(below1000(q) + " " + name);
		left %= size;
	}
	if (left) out.push(below1000(left));
	const words = out.join(" ");
	const tail = ps ? `${rupees ? " and " : ""}${below1000(ps)} Paise` : "";
	return `Rupees ${words}${tail} Only`.replace("Rupees  ", "Rupees ");
}

const CSS = `
@page { size: A4; margin: 14mm; }
body { font: 13px/1.45 Calibri, Arial, sans-serif; color: #1f2937; margin: 0; }
.slip { page-break-after: always; padding: 4px 2px; }
.slip:last-child { page-break-after: auto; }
.head { text-align: center; border-bottom: 2px solid #374151; padding-bottom: 6px; margin-bottom: 8px; position: relative; }
.head h1 { margin: 0; font-size: 18px; }
.head .m { color: #6b7280; font-size: 12px; }
.title { text-align: center; font-weight: 700; margin: 6px 0; letter-spacing: .5px; }
.who { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.who td { padding: 2px 6px; vertical-align: top; }
.who td.k { color: #6b7280; width: 18%; }
.pay { width: 100%; border-collapse: collapse; }
.pay th { background: #374151; color: #fff; text-align: left; padding: 4px 6px; }
.pay td { border-bottom: 1px solid #e5e7eb; padding: 3px 6px; }
.pay td.a, .pay th.a { text-align: right; }
.pay td.sep { border-left: 1px solid #d1d5db; }
.pay tr.tot td { font-weight: 700; border-top: 2px solid #9ca3af; background: #f3f4f6; }
.net { margin: 10px 0 2px; padding: 6px 8px; background: #e2efda; font-size: 15px; font-weight: 700; display: flex; justify-content: space-between; }
.words { color: #4b5563; font-size: 12px; }
.draft { position: absolute; right: 0; top: 0; color: #b45309; border: 1px solid #b45309; padding: 0 6px; font-size: 11px; }
.foot { margin-top: 14px; color: #6b7280; font-size: 11px; }
`;

/** One slip, as a block. @param slip a Salary Slip row  @param details the Salary Detail rows
    @param info loadCompanyInfo's return  @param emp the Employee row (optional) */
export function slipBlock(slip, details, info, emp, ym) {
	const lines = slipLines(details, slip.name);
	const rows = Math.max(lines.earnings.length, lines.deductions.length);
	const body = Array.from({ length: rows }, (_, i) => {
		const e = lines.earnings[i], d = lines.deductions[i];
		return `<tr><td>${e ? esc(e[0]) : ""}</td><td class="a">${e ? inr(e[1]) : ""}</td>`
			+ `<td class="sep">${d ? esc(d[0]) : ""}</td><td class="a">${d ? inr(d[1]) : ""}</td></tr>`;
	}).join("");
	const company = (info && info.name) || slip.company || "";
	const sub = info ? [info.registration && `Reg: ${info.registration}`, info.tax_id && `GSTIN/Tax ID: ${info.tax_id}`, info.phone && `Phone: ${info.phone}`, info.email].filter(Boolean).join("  ·  ") : "";
	const kv = (k, v) => (v ? `<td class="k">${k}</td><td>${esc(v)}</td>` : `<td class="k"></td><td></td>`);
	const code = (emp && (emp.employee_number || emp.name)) || slip.employee;
	return `<section class="slip">
<div class="head">${Number(slip.docstatus) === 0 ? '<span class="draft">DRAFT</span>' : ""}<h1>${esc(company)}</h1>${sub ? `<div class="m">${esc(sub)}</div>` : ""}</div>
<div class="title">PAYSLIP — ${esc(periodLabel(ym).toUpperCase())}</div>
<table class="who"><tr>${kv("Employee", slip.employee_name)}${kv("Code", code)}</tr>
<tr>${kv("Designation", slip.designation)}${kv("Department", slip.department)}</tr>
<tr>${kv("Pay days", slip.payment_days)}${kv("Loss of pay days", lossOfPay(slip) || "")}</tr></table>
<table class="pay"><thead><tr><th>Earnings</th><th class="a">₹</th><th>Deductions</th><th class="a">₹</th></tr></thead><tbody>${body}
<tr class="tot"><td>Gross pay</td><td class="a">${inr(slip.gross_pay)}</td><td class="sep">Total deductions</td><td class="a">${inr(slip.total_deduction)}</td></tr></tbody></table>
<div class="net"><span>Net pay</span><span>₹ ${inr(slip.net_pay)}</span></div>
<div class="words">${esc(rupeesInWords(slip.net_pay))}</div>
<div class="foot">This is a computer-generated payslip.</div>
</section>`;
}

/** A whole printable document of one or many slips, one to a page. */
export function slipsHtml(slips, details, info, employees, ym) {
	const emp = new Map((employees || []).map((e) => [e.name, e]));
	const blocks = (slips || []).map((s) => slipBlock(s, details, info, emp.get(s.employee), ym)).join("\n");
	return `<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${esc(ym)}</title><style>${CSS}</style></head><body>${blocks}</body></html>`;
}
