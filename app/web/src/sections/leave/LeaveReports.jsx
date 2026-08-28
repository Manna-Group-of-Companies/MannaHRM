import ReportRows from "@/components/ReportRows";
import { Cols, NoteBelow, Panel } from "@/components/ui";

export default function LeaveReports() {
	return (
		<Cols>
			<Panel title="Quick Reports · Leave" cov="part" ico="📊">
				<ReportRows kind="leave" />
				<NoteBelow>
					<b>One click away in Factor HR.</b> The Leave Balance Report covers most of section D and
					is still outstanding.
				</NoteBelow>
			</Panel>
		</Cols>
	);
}
