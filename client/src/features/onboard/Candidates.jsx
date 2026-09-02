import { Empty } from "@/components/ui";


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

			<Empty title="Candidate Master">
				Not built. Recruitment is not run in the system today.
			</Empty>
		</>
	);
}
