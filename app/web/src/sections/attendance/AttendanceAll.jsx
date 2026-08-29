

import { useApp } from "@/state/store";
import { active } from "@/lib/scope";
import { Empty, Legend } from "@/components/ui";

import AttReports from "./AttReports";

/* Attendance → All: the module index. Factor HR's own menu, item for item, with
   what stands behind each item here — and the two engines underneath it that
   have no menu item on either side because they are configuration rather than
   screens. */
export default function AttendanceAll() {
	const s = useApp();
	const a = active(s);
	const shifted = a.filter((e) => e.default_shift).length;
	const pend = (s.approvals.attendance || []).length;
	const shiftTypes = s.counts.shift || 0;
	const attRows = s.counts.attendance || 0;

	return (
		<>
			<Legend
				title="Attendance — All"
				states={[
					["live", "built and running on real data"],
					["part", "stock, waiting on a decision or a load"],
					["none", "exists in Factor HR, not here"],
				]}
			/>

			<AttReports />
			<Empty title="Attendance, all pages">
				The seven Attendance pages are on the bar above. This index has nothing of its own to show.
			</Empty>
		</>
	);
}
