import { FH_LEAVE } from "@/data/attendance";
import { Cols, Gap, Note, NoteBelow, Panel, Scroll } from "@/components/ui";

export default function LeaveBalances() {
	return (
		<>
			<div className="legend">
				<b className="font-display">Leave Balance Report</b>
				<span className="cov none">Factor HR, 23 Aug 2026</span>
				<span>
					160 employees, six types defined, <b>two used</b>. Nothing on our side to compare against
					yet.
				</span>
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Leave type</th>
							<th>People with a balance</th>
							<th>Accrued</th>
							<th>Availed</th>
							<th>Balance</th>
						</tr>
					</thead>
					<tbody>
						{FH_LEAVE.map((r) => (
							<tr key={r[0]}>
								{/* A type with no balance and nothing availed is a type nobody
								    has ever used, and it is greyed rather than hidden. */}
								<td className={r[1] === 0 && r[3] === 0 ? "muted" : undefined}>{r[0]}</td>
								<td className="mono">{r[1]}</td>
								<td className="mono">{r[2].toFixed(1)}</td>
								<td className="mono">{r[3].toFixed(1)}</td>
								<td className="mono">{r[4].toFixed(1)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<Cols>
				<Panel title="1,300 days of unpaid leave" cov="part" ico="⚠">
					<Note>
						LWP is the largest number on the report — <b>1,300.5 days</b> across 160 people, roughly
						eight each, dwarfing the 325.5 days of Casual Leave. It is not an exception here, it is
						the main way absence is recorded. Any rule that turns an unexplained absence into LWP
						will be exercised hard, and has to be right.
					</Note>
				</Panel>

				<Panel title="Four of six never used" cov="skip" ico="🌴">
					<Note>
						Company Purpose, Maternity, Privilege and Sick are defined and have never been touched.
						They are not carried across as empty scaffolding.
					</Note>
				</Panel>

				<Panel title="Accrual splits by tenure" cov="none" ico="🧮">
					<Gap>
						The accrual rule itself — eligibility, amount, monthly or annual, and whether the leave
						year runs January or April.
					</Gap>
					<NoteBelow>
						72 people accrue Casual Leave (median joining <b>Aug 2019</b>); 88 accrue nothing
						(median <b>Jan 2026</b>). Not by company and not by designation — Plant Helper appears
						in both. 66 have exactly 8.0 days, which <em>suggests</em> 12 a year accruing monthly
						across Jan–Aug. That is a hypothesis from one number, not a rule anybody has stated.
						ERPNext’s fiscal year is April–March; if the leave year is not, it has to be said
						explicitly.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
