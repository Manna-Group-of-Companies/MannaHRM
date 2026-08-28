import { Cols, Gap, Note, NoteBelow, Panel, Tile, Tiles } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useApp } from "@/state/store";

const ERPNEXT_HAS = [
	["Salary Component", "the earning and deduction heads"],
	["Salary Structure", "the template"],
	["Salary Structure Assignment", "one person’s structure, from a date"],
	["Payroll Entry", "the monthly run"],
];

export default function SalaryMaster() {
	const s = useApp();
	const withCtc = s.employees.filter((e) => e.ctc);

	return (
		<>
			<div className="legend">
				<b className="font-display">Salary Master</b>
				<span className="cov none">Not built</span>
				<span>Payroll has not been started, and this page will not imply otherwise.</span>
			</div>

			<Cols>
				<Panel title="What Factor HR holds" cov="none" ico="₹">
					<Gap>
						A salary structure per employee — the earning heads and their amounts, the deductions,
						the employer contributions, and the date each version takes effect from.
					</Gap>
					<NoteBelow>
						<b>One click away.</b> The <em>Salary Register Report</em> in Factor HR’s Quick Reports is
						this whole page as an export, and it is open question <b>E1</b>. Nothing can be built
						here until somebody runs it.
					</NoteBelow>
				</Panel>

				<Panel title="What ERPNext already has" cov="part" ico="📦">
					<div className="rows">
						{ERPNEXT_HAS.map((r) => (
							<div className="row" key={r[0]}>
								<span>{r[0]}</span>
								<span className="val muted">{r[1]}</span>
							</div>
						))}
					</div>
					<NoteBelow>
						Frappe HR ships all four and they are installed and empty. <b>This is data entry, not a
						build</b> — which is why it is the right thing to do last: attendance decides what
						payroll multiplies, so a structure loaded before the attendance rules are settled is a
						structure loaded twice.
					</NoteBelow>
				</Panel>

				<Panel title="On the site right now" cov="live" ico="◉">
					<Tiles>
						<Tile k="With a CTC" n={fmt(withCtc.length)} cls={withCtc.length ? "good" : "warn"}
							s={`of ${fmt(s.employees.length)} loaded`} />
						{/* Not a zero: a zero here would be a measurement, and this page
						    cannot measure payroll. See the allowlist panel below. */}
						<Tile k="Structures" n="—" s="not readable from here" />
					</Tiles>
					<NoteBelow>
						The CTC count is read live from the <code>ctc</code> field on <code>Employee</code>. It is
						the only pay figure the master carries, and it is not a structure: it says what somebody
						costs, not how they are paid.
					</NoteBelow>
				</Panel>

				<Panel title="Why this page cannot read payroll" cov="skip" ico="🔒">
					<Note>
						The dashboard’s proxy runs an allowlist and no payroll doctype is on it. That is
						deliberate rather than pending: this process holds a System Manager token, and{" "}
						<b>salary is the one table where a read-only window is still a leak</b>. See{" "}
						<code>app/serve.py</code>.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
