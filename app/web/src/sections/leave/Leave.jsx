import { Cols, Gap, NoteBelow, Panel } from "@/components/ui";

export default function Leave() {
	return (
		<Cols>
			<Panel title="Leave types" cov="part" ico="🌴">
				<div className="rows">
					<div className="row">
						<span>Casual Leave</span>
						<span className="val">73 with a balance</span>
					</div>
					<div className="row">
						<span>Leave Without Pay</span>
						<span className="val">1,300.5 days availed</span>
					</div>
					<div className="row">
						<span className="muted">Company Purpose · Maternity · Privilege · Sick</span>
						<span className="val muted">unused</span>
					</div>
				</div>
				<NoteBelow>
					Four of the six types in Factor HR are defined and never used. They are not carried across.
				</NoteBelow>
			</Panel>

			<Panel title="Entitlements and balances" cov="none" ico="🧮">
				<Gap>Opening balances per person per type, and the accrual rule.</Gap>
				<NoteBelow>
					<b>Nobody has a balance yet.</b> No leave type has an entitlement set. 72 people accrue
					Casual Leave and 88 do not, split by tenure — the rule behind that split is still needed.
				</NoteBelow>
			</Panel>
		</Cols>
	);
}
