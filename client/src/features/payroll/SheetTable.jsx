import { Note, Scroll } from "@/components/ui";

/* The salary sheet's table — one row a person, a column for every earning and
   every deduction, the slip's own gross, deductions and net, and a total at the
   foot. Shared by Payroll → Payroll and Payroll → Salary Sheet so the two
   cannot drift. It draws what lib/salarysheet.js `buildSheet` made and
   computes nothing. */

/** Rupees the way a payroll is read — 1,25,000.00 — and nothing for zero, so a
    column that does not apply to somebody is empty rather than a row of zeros. */
export const money = (v) => (Number(v) ? Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export const KIND_TAG = { encash: "leave encashment", advance: "advance", loan: "loan EMI" };

export default function SheetTable({ sheet, label }) {
	return (
		<>
			<Scroll>
				<table className="fptable" aria-label={`Salary sheet, ${label}`}>
					<thead>
						<tr>
							<th>Employee</th><th>Pay days</th>
							{sheet.earnCols.map((c) => (
								<th key={"e" + c.name}>{c.name}{c.kind ? <small className="block">{KIND_TAG[c.kind]}</small> : null}</th>
							))}
							<th>Gross</th>
							{sheet.dedCols.map((c) => (
								<th key={"d" + c.name}>{c.name}{c.kind ? <small className="block">{KIND_TAG[c.kind]}</small> : null}</th>
							))}
							<th>Deductions</th><th>Net pay</th><th>Slip</th>
						</tr>
					</thead>
					<tbody>
						{sheet.rows.map((r) => (
							<tr key={r.slip}>
								<td>{r.name}<small className="block muted">{r.employee}</small></td>
								<td className="num">{r.paymentDays}{r.lwp ? <small className="block muted">{r.lwp} LWP</small> : null}</td>
								{sheet.earnCols.map((c) => <td className="num" key={"e" + c.name}>{money(r.earn[c.name])}</td>)}
								<td className="num"><b>{money(r.gross)}</b></td>
								{sheet.dedCols.map((c) => <td className="num" key={"d" + c.name}>{money(r.ded[c.name])}</td>)}
								<td className="num"><b>{money(r.deduction)}</b></td>
								<td className="num"><b>{money(r.net)}</b></td>
								<td>
									<span className={"fpstate " + r.state.toLowerCase()}>{r.state}</span>
									{r.off ? <small className="block muted" title="The lines on this slip do not add to its own total — a component opted out of it, or rounding.">lines ≠ total</small> : null}
								</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td><b>Total</b></td><td />
							{sheet.earnCols.map((c) => <td className="num" key={"e" + c.name}><b>{money(sheet.totals.earn[c.name])}</b></td>)}
							<td className="num"><b>{money(sheet.totals.gross)}</b></td>
							{sheet.dedCols.map((c) => <td className="num" key={"d" + c.name}><b>{money(sheet.totals.ded[c.name])}</b></td>)}
							<td className="num"><b>{money(sheet.totals.deduction)}</b></td>
							<td className="num"><b>{money(sheet.totals.net)}</b></td>
							<td />
						</tr>
					</tfoot>
				</table>
			</Scroll>
			{sheet.totals.submitted < sheet.totals.count && (
				<Note>
					Slips marked Draft are included so the month can be checked before it is finalized.
					Nothing is paid until they are submitted.
				</Note>
			)}
		</>
	);
}
