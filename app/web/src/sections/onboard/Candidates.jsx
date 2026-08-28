import { Cols, Note, NoteBelow, Panel, SpecTable } from "@/components/ui";

const WAITING = [
	["Job Opening", "The vacancy, per company and designation", "stock", ""],
	["Job Applicant", "The candidate, their CV and their status", "stock",
		"This is Factor HR&rsquo;s Candidate Master"],
	["Job Offer", "Offer terms, accepted or declined", "stock",
		"Merges into the offer letter format already loaded here"],
	["Employee Onboarding", "The joining checklist that creates the Employee", "stock",
		"One template per joiner type &mdash; factory, staff, contract"],
	["Biometric enrolment", "attendance_device_id on Employee", "build",
		"Not a stock onboarding activity, and it is the one that decides whether day one is recorded at all"],
];

export default function Candidates() {
	return (
		<>
			<div className="legend">
				<b className="font-display">Candidate Master</b>
				<span className="cov skip">Empty in Factor HR, 25 Aug 2026</span>
				<span>
					Nothing has ever been entered on either side, so there is nothing to replicate — only a
					decision to take.
				</span>
			</div>

			<Cols>
				<Panel title="Candidate Master" cov="skip" ico="👤">
					<Note>
						<b>Empty in Factor HR too.</b> Recruitment is not run in the system today. If it ever
						moves across, ERPNext already holds the whole chain and it is configuration rather than
						code.
					</Note>
				</Panel>

				<Panel title="What ERPNext has waiting" cov="part" ico="🚪">
					<SpecTable cols={["Doctype", "What it does", "State", "Note"]} list={WAITING} />
					<NoteBelow>
						Nothing here needs building. It needs somebody to say whether hiring belongs in the HR
						system at all.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
