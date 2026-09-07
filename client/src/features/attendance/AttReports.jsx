import ReportRows from "@/components/ReportRows";
import { Cols, Panel } from "@/components/ui";

/** Sits at the foot of Attendance → All, where the original put it. */
export default function AttReports() {
	return (
		<Cols>
			<Panel title="Quick Reports · Attendance" cov="live" ico="📊">
				<ReportRows kind="attendance" />
			</Panel>
		</Cols>
	);
}
