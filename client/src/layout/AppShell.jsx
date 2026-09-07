/** The chrome every page sits in: the rail, the header, the page strip. */

import { useEffect } from "react";
import Sidebar from "@/layout/Sidebar";
import TopBar from "@/layout/TopBar";
import SubNav from "@/layout/SubNav";
import PageOutlet from "@/layout/PageOutlet";
import { useApp, set } from "@/store";

export default function AppShell() {
	const { rail, drawer } = useApp();

	/* Escape closes the drawer. `drawer` is only ever true on a width where the
	   rail covers the page, so this needs no width test of its own — and on a
	   desktop, where it is always false, this handler does nothing at all.

	   The app's other Escape handler (App.jsx) closes menus and dialogs and runs
	   on the document too; this one returns immediately unless there is a drawer
	   open, so the two cannot both act on one press. */
	useEffect(() => {
		const onKey = (e) => {
			if (e.key === "Escape" && drawer) set({ drawer: false });
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [drawer]);

	return (
		/* Two attributes, and each width reads one of them: the desktop rules key
		   off `data-rail`, and the tablet block ignores it and keys off
		   `data-drawer` instead. */
		<div className="shell" data-rail={rail} data-drawer={drawer ? "open" : undefined}>
			{/* Nine rail links and a header stand between the top of the document
			    and the page, on every page. Somebody driving this by keyboard should
			    not pay for them twice a click. Hidden until focused, which is the one
			    time it is any use. */}
			<a className="skip" href="#page">Skip to page</a>
			<Sidebar />
			{/* The way out of the overlay rail, for a finger. It is a button rather
			    than a div so it is reachable by keyboard as well, and it is only
			    ever drawn — `display: block` — inside the tablet media query; on a
			    desktop the rail displaces the page instead of covering it, and
			    there is nothing to dismiss. */}
			<button
				type="button"
				className="railscrim"
				aria-label="Close the menu"
				tabIndex={drawer ? 0 : -1}
				hidden={!drawer}
				onClick={() => set({ drawer: false })}
			/>
			<div className="main">
				<TopBar />
				<SubNav />
				<PageOutlet />
			</div>
		</div>
	);
}
