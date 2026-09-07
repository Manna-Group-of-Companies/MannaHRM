/** The module rail — Factor HR's nine, in its order, as a list you read down.
 *
 *  Three parts, and only the middle one is navigation: the wordmark with the
 *  collapse control, the nine links under four headings, and a foot saying who
 *  is signed in and whether the site is answering.
 *
 *  The collapsed state is `data-rail` on `.shell` rather than a class here,
 *  because the width it changes belongs to the grid the rail sits in — see
 *  AppShell. All this component does is press the button.
 */

import { NAV_GROUPS, SECTIONS, COV_LABEL, groupOf } from "@/data/sections";
import { useApp, set } from "@/store";
import { initials } from "@/lib/format";
import Link from "@/routes/Link";
import { saveRail } from "@/lib/rail";

/* The two glyphs the collapse control uses. Panels rather than arrows: an arrow
   says "go left", which is not what this does — it says how much of the rail is
   showing, and the filled edge is the part that stays. */
const RAIL_GLYPH = {
	wide: "M3 4h18v16H3zM9 4v16",
	slim: "M3 4h18v16H3zM9 4v16M13 9l3 3-3 3",
};

export default function Sidebar() {
	const { section, rail, drawer, user, conn, connState } = useApp();
	const slim = rail === "slim";

	/* The whole rail in one pass, so a heading is drawn by the first item under
	   it rather than by a nested loop. Nine items and four headings read in one
	   list is also what the bottom bar on a phone needs — there the headings are
	   `display: none` and the links are already in the right order. */
	const rows = [];
	let group = "";
	for (const s of SECTIONS) {
		const g = groupOf(s.key);
		if (g && g !== group) {
			group = g;
			rows.push(
				<div className="navgroup" key={"g:" + g} aria-hidden="true">{g}</div>,
			);
		}
		rows.push(
			<Link
				key={s.key}
				section={s.key}
				className="nav"
				/* On a tablet this rail is an overlay over the page, so following a
				   link has to close it — a menu that stays open over the screen it
				   just navigated to is a menu people press the scrim to escape. On
				   a desktop `drawer` is always false and this writes false again,
				   which the store ignores. */
				onClick={() => set({ drawer: false })}
				/* The label is `sr-only` when the rail is slim, so the only thing
				   naming the link for a pointer is this. It is set either way: a
				   tooltip on a labelled link costs nothing and answers "what is
				   Deferred?" on the dot beside it. */
				title={`${s.label} — ${COV_LABEL[s.cov]}`}
				aria-current={section === s.key ? "page" : undefined}
			>
				<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<path d={s.icon} />
				</svg>
				<span className="lab">{s.label}</span>
				{/* An attribute rather than a class: `skip` is one of the four
				    coverage states *and* the name of this app's skip-to-content
				    link, which is a fixed pill parked off the top of the page. */}
					<span className="cdot" data-cov={s.cov} aria-hidden="true" />
			</Link>,
		);
	}

	return (
		<aside className="side">
			<div className="brand">
				<span className="mark" aria-hidden="true">
					<span className="o">M</span>
					<span className="c">H</span>
				</span>
				<span className="brandtext">
					<b>Manna HR</b>
					<small>Group HRMS</small>
				</span>
				<button
					type="button"
					className="railtoggle"
					/* Two jobs, because at the two widths there are two things to
					   close. Open as a drawer, it shuts the drawer; otherwise it is
					   the desktop's collapse control. `drawer` is only ever true
					   below 900px, so each width sees one behaviour and never both. */
					aria-label={drawer ? "Close the menu" : slim ? "Expand the menu" : "Collapse the menu"}
					title={drawer ? "Close the menu" : slim ? "Expand the menu" : "Collapse the menu"}
					aria-pressed={drawer ? true : slim}
					onClick={() => (drawer
						? set({ drawer: false })
						: set({ rail: saveRail(slim ? "wide" : "slim") }))}
				>
					<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d={slim && !drawer ? RAIL_GLYPH.slim : RAIL_GLYPH.wide} />
					</svg>
				</button>
			</div>

			<nav className="railnav" aria-label="Modules">{rows}</nav>

			<div className="railfoot">
				<div className="railwho">
					<span className="railava" aria-hidden="true">{initials(user || "?")}</span>
					<span className="who">
						<b>{user || "Not signed in"}</b>
						<span>Signed in on this site</span>
					</span>
				</div>
				{/* The same two words the status line always said, kept beside the
				    thing they describe. `aria-live` because this one changes on its
				    own: a read that fails turns it red without anybody pressing
				    anything, and that is worth announcing once. */}
				<div className="railconn" title={"Site connection: " + conn} aria-live="polite">
					<span className={"dot " + connState} aria-hidden="true" />
					<span>{conn}</span>
				</div>
			</div>
		</aside>
	);
}
