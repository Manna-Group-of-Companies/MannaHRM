/** The strip of pages inside the current module. */

import { useEffect, useRef } from "react";
import { useApp } from "@/store";
import { MODULES, fullPage, offMenu } from "@/routes/registry";
import Link from "@/routes/Link";

export default function SubNav() {
	const s = useApp();
	const { section, subtab } = s;
	const bar = useRef(null);
	const tabs = MODULES[section]?.tabs || [];
	/* A full page takes the strip with it — see fullPage() and OFF_MENU, which
	   are the two ways a page says it is not one of the module's tabs. Read
	   before the effect below so the hook order cannot change with it. */
	const full = Boolean(fullPage(s)) || offMenu(section, subtab);

	/* On a phone this strip is one scrolling row rather than five wrapped ones,
	   which means the selected tab can sit off the right-hand edge — landing on
	   Manage Shift and seeing "Attendance Regularization" highlighted nowhere is
	   worse than the five rows were.

	   `scrollLeft` rather than `scrollIntoView`, which also scrolls the page
	   vertically and would jump the panel you just opened out of view. */
	useEffect(() => {
		const el = bar.current;
		const active = el?.querySelector('[aria-current="page"]');
		if (!el || !active || el.scrollWidth <= el.clientWidth) return;
		const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		el.scrollTo({
			left: Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2),
			behavior: smooth ? "smooth" : "auto",
		});
	}, [section, subtab]);

	if (full || tabs.length === 0) return <div className="subbar" />;
	/* `aria-current="page"`, not `aria-selected`, and a `<nav>` rather than a
	   tablist. Factor HR draws this strip as tabs and so do we, but what it
	   does is move between the pages of a module — the same job the rail does
	   one level up, which already says `aria-current="page"`. Calling it a
	   tablist would promise arrow-key movement between panes that are not
	   panes, and would describe the two halves of the same navigation in two
	   different words. */
	return (
		<nav className="subbar" ref={bar} aria-label="Pages in this module">
			{tabs.map((t) => (
				<Link
					key={t[0]}
					section={section}
					subtab={t[0]}
					className="subtab"
					aria-current={subtab === t[0] ? "page" : undefined}
				>
					{t[1]}
				</Link>
			))}
		</nav>
	);
}
