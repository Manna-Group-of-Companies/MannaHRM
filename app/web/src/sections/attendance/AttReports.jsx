import ReportRows from "@/components/ReportRows";
import { Cols, NoteBelow, Panel } from "@/components/ui";

/** Sits at the foot of Attendance → All, where the original put it. */
export default function AttReports() {
	return (
		<Cols>
			<Panel title="Quick Reports · Attendance" cov="live" ico="📊">
				<ReportRows kind="attendance" />
				<NoteBelow>
					All three have been supplied. They are what the employee master and the shift inference
					were built from.
				</NoteBelow>
			</Panel>
		</Cols>
	);
}
