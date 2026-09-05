import { Empty, Legend } from "@/components/ui";

/* Leave → All: the module index, built the same way Attendance → All is.

   Their menu is three items where Attendance's is eight, and that is the
   finding rather than an omission on our side: leave in this tenant is one
   form and one report. Both are here. */

export default function LeaveAll() {
	return (
		<>
			<Legend
				title="Leave — All"
				states={[
					["live", "built and running on real data"],
					["part", "stock, waiting on a decision or a load"],
					["none", "exists in Factor HR, not here"],
				]}
			/>

			<Empty title="Leave, all pages">
				The Leave pages are on the bar above. This index has nothing of its own to show.
			</Empty>
		</>
	);
}
