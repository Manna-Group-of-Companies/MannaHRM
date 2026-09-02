

import { useApp } from "@/store";
import { assetRows } from "@/features/onboard/shared";
import { Empty, Legend } from "@/components/ui";

export default function OnboardAll() {
	const s = useApp();
	const rows = assetRows(s);
	const unread = s.onboardBusy || s.assetErr;

	return (
		<>
			<Legend
				title="On Board — All"
				states={[
					["live", "built and running on real data"],
					["part", "stock and waiting on a decision or a load"],
					["none", "exists in Factor HR, not here"],
					["skip", "empty on both sides"],
				]}
			/>

			<Empty title="On Board, all pages">
				The five On Board pages are on the bar above. This index has nothing of its own to show.
			</Empty>
		</>
	);
}
