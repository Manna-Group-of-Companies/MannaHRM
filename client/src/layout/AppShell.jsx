/** The chrome every page sits in: the rail, the top bar, the page strip. */

import Sidebar from "@/layout/Sidebar";
import TopBar from "@/layout/TopBar";
import SubNav from "@/layout/SubNav";
import PageOutlet from "@/layout/PageOutlet";

export default function AppShell() {
	return (
		<div className="shell">
			{/* Nine rail links and a toolbar stand between the top of the document
			    and the page, on every page. Somebody driving this by keyboard should
			    not pay for them twice a click. Hidden until focused, which is the one
			    time it is any use. */}
			<a className="skip" href="#page">Skip to page</a>
			<Sidebar />
			<div className="main">
				<TopBar />
				<SubNav />
				<PageOutlet />
			</div>
		</div>
	);
}
