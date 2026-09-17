/** Whichever page the URL names, and the reads a module makes on first sight. */

import { useEffect } from "react";
import { useApp } from "@/store";
import { loadOnBoard, loadShiftAssignments } from "@/api/load";
import { pageFor, fullPage } from "@/routes/registry";
import { USER_HOME, landingFor, sectionFor } from "@/data/menus";
import { navigate, pathFor } from "@/routes/router";

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

	/* A login with a narrowed menu (data/menus.js) that lands on a page off it —
	   the rail's link to a module's overview, or an old bookmark — is moved to
	   its first page, in the address bar too, so the strip and the page agree.
	   A user who is not an admin and lands in a module they are not shown at all
	   goes to Employee Master the same way. */
	const [home, homeTab] = sectionFor(section, s.admin, s.user) ? [section, null] : USER_HOME;
	const shown = homeTab || landingFor(section, subtab, s.user, s.admin);
	useEffect(() => {
		if (home !== section || shown !== subtab) {
			window.history.replaceState({}, "", pathFor(home, shown));
			navigate(home, shown);
		}
	}, [home, section, subtab, shown]);

	const full = fullPage(s);
	const Page = pageFor(home, shown);
	return (
		<main className="content" id="page" tabIndex={-1}>
			{full || <Page />}
		</main>
	);
}
