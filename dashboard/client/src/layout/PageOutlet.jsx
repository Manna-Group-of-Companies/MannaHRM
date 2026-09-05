/** Whichever page the URL names, and the reads a module makes on first sight. */

import { useEffect } from "react";
import { useApp } from "@/store";
import { loadOnBoard, loadShiftAssignments } from "@/api/load";
import { pageFor, fullPage } from "@/routes/registry";

export default function PageOutlet() {
	const s = useApp();
	const { section, subtab, onboardRead, shMaster, shAssignState } = s;

	/* On Board's extra reads are half a dozen requests against a site with a
	   daily compute limit, so they are made the first time somebody opens the
	   module and not once per page load. The flag is set inside loadOnBoard,
	   before the first await, so the re-render it triggers cannot ask again. */
	useEffect(() => {
		if (section === "onboard" && !onboardRead) void loadOnBoard();
	}, [section, onboardRead]);

	/* Work Pattern's read, on the same terms and for the same reason — one
	   request, and only for somebody who has actually asked for that half of
	   Manage Shift. loadShiftAssignments() guards itself against the re-render. */
	useEffect(() => {
		if (section === "attendance" && subtab === "shifts" && shMaster === "pattern" && !shAssignState) {
			void loadShiftAssignments();
		}
	}, [section, subtab, shMaster, shAssignState]);

	const full = fullPage(s);
	const Page = pageFor(section, subtab);
	return (
		<main className="content" id="page" tabIndex={-1}>
			{full || <Page />}
		</main>
	);
}
