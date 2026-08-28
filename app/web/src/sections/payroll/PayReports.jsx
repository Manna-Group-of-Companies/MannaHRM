import ReportRows from "@/components/ReportRows";
import { Cols, NoteBelow, Panel } from "@/components/ui";

export default function PayReports() {
	return (
		<Cols>
			<Panel title="Quick Reports · Payroll" cov="skip" ico="📊">
				<ReportRows kind="payroll" />
				<NoteBelow>
					Background rather than a target — payroll is calculated by hand and is not run in Factor
					HR.
				</NoteBelow>
			</Panel>
		</Cols>
	);
}
