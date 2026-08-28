import { FH_REPORTS } from "@/data/attendance";

/* Factor HR's Quick Reports, split by module. Tagged by whether the file is
   already in hand, because that is the only thing deciding whether a report is
   a task or a footnote. */
const BADGE = {
	have: ["live", "have it"],
	want: ["none", "needed"],
	bg: ["skip", "background"],
};

export default function ReportRows({ kind }) {
	return (
		<div className="rows">
			{FH_REPORTS.filter((r) => r[1] === kind).map((r) => {
				const b = BADGE[r[2]];
				return (
					<div className="row" key={r[0]}>
						<span>
							{r[0]} <span className={"cov " + b[0]}>{b[1]}</span>
						</span>
						<span className="val muted">{r[3]}</span>
					</div>
				);
			})}
		</div>
	);
}
