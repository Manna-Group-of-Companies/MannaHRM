

import { useApp } from "@/state/store";
import { active } from "@/lib/scope";
import { Empty, Legend } from "@/components/ui";

/* Loans → All. Their last menu item, read here as the module index: every page
   on the menu, what stands behind it, and what it is waiting for. */
export default function LoansAll() {
	const s = useApp();
	const a = active(s);
	const left = s.counts.left || 0;

	return (
		<>
			<Legend
				title="Loans — All"
				states={[
					["part", "read against their menu, on real data"],
					["none", "exists in Factor HR, not here"],
					["skip", "deferred with payroll"],
				]}
			/>

			<Empty title="Loans, all pages">
				The four Loans pages are on the bar above. This index has nothing of its own to show.
			</Empty>
		</>
	);
}
