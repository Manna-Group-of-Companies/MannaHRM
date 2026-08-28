import { Cols, Note, NoteBelow, Panel, Tile, Tiles } from "@/components/ui";

export default function Payroll() {
	return (
		<>
			<div className="legend">
				<b className="font-display">Payroll Summary</b>
				<span className="cov skip">Deferred</span>
				<span>
					Factor HR’s own summary, which defaults to <b>Mar-25</b>.
				</span>
			</div>

			<Cols>
				<Panel title="Payroll Summary · Mar-25" cov="skip" ico="💰">
					<Tiles>
						<Tile k="Salary Proceed" n="134" />
						<Tile k="Salary Not Proceed" n="6" cls="warn" />
						<Tile k="Stop Salary" n="0" />
						<Tile k="Hold Salary" n="0" />
						<Tile k="Pending Arrears" n="0" />
						<Tile k="Stop TDS" n="0" />
					</Tiles>
					<NoteBelow>
						<b>Two things do not add up.</b> The period is Mar-25 against an active headcount of
						160 — seventeen months old. And 134 + 6 = 140, leaving <b>twenty people in neither
						bucket</b>. Left alone by decision: there is no payroll to reconcile them against.
					</NoteBelow>
				</Panel>

				<Panel title="Why this is deferred" cov="skip" ico="✋">
					<Note>
						<b>Payroll is not processed in Factor HR</b> — it is calculated by hand. Decision taken
						23 Aug 2026, and it drops section E out of the initial release entirely. Frappe HR ships
						the whole payroll module when Manna wants it; the Salary Register is background, not a
						target.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
