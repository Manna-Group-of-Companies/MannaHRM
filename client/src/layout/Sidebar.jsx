/** The module rail — Factor HR's nine, in its order, as a list you read down.
 *
 *  Three parts, and only the middle one is navigation: the wordmark with the
 *  collapse control, the links under their headings with the open module's
 *  pages beneath it, and a foot saying whether the site is answering.
 *
 *  The collapsed state is `data-rail` on `.shell` rather than a class here,
 *  because the width it changes belongs to the grid the rail sits in — see
 *  AppShell. All this component does is press the button.
 */

import { visibleSections, COV_LABEL, groupOf, isHidden } from "@/data/sections";
import { sectionFor, tabsFor } from "@/data/menus";
import { MODULES } from "@/routes/registry";
import { useApp, set } from "@/store";
import Link from "@/routes/Link";
import { saveRail } from "@/lib/rail";
import mannaLogo from "@/assets/manna-logo.png";
import mannaMark from "@/assets/manna-mark.png";

/* The two glyphs the collapse control uses. Panels rather than arrows: an arrow
   says "go left", which is not what this does — it says how much of the rail is
   showing, and the filled edge is the part that stays. */
const RAIL_GLYPH = {
	wide: "M3 4h18v16H3zM9 4v16",
	slim: "M3 4h18v16H3zM9 4v16M13 9l3 3-3 3",
};

/* The four a phone's bottom bar keeps, in the order it draws them. Nine in a
   390px bar is nine labels cut to "Attend…" and two off the edge; four and a
   More is every label whole. These are the four somebody opens on a phone —
   the rest are one tap further, in the drawer More opens. */
const BAR = ["dashboard", "employees", "attendance", "leave"];

/** The pages of the open module, as the rail draws them under its link.

    **The same list the page strip draws, read the same way** — `tabsFor` for
    who may see what, `isHidden` for what Settings → Security took off — so the
    two can never disagree about which pages a module has. Since 6 October 2026
    this list *is* the navigation on a desktop with the rail open: one column
    to read down, instead of a rail and then a strip of pills that ran off the
    right-hand edge on Attendance. The strip is still drawn wherever this list
    cannot be — a slim rail, a tablet, a phone — see `.navsub` in index.css. */
export function pagesOf(section, user, admin) {
	return tabsFor(section, MODULES[section]?.tabs || [], user, admin)
		.filter((t) => !isHidden(section, t[0]));
}

export default function Sidebar() {
	const { section, subtab, rail, drawer, user, conn, connState, admin } = useApp();
	const slim = rail === "slim";

	const shown = visibleSections().filter((m) => sectionFor(m.key, admin, user));
	/* A login shown fewer than four of BAR has its bar topped up from the rest
	   of the menu, in the menu's order, so the bar is never two items wide. */
	const bar = new Set(shown.filter((m) => BAR.includes(m.key)).map((m) => m.key));
	for (const m of shown) if (bar.size < BAR.length) bar.add(m.key);
	const more = shown.length > bar.size;

	/* The whole rail in one pass, so a heading is drawn by the first item under
	   it rather than by a nested loop. Nine items and their headings read in one
	   list is also what the bottom bar on a phone needs — there the headings are
	   `display: none` and the links are already in the right order. */
	const rows = [];
	let group = "";
	for (const s of shown) {
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
				data-bar={bar.has(s.key) ? "" : undefined}
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
		/* The open module's pages, under its link. Only the open one: nine
		   modules each spilling a dozen pages is a hundred-row menu, and the
		   point of this change was a shorter one. A module with a single page
		   needs no list — its link already goes there. */
		const pages = section === s.key ? pagesOf(s.key, user, admin) : [];
		if (pages.length > 1) {
			rows.push(
				<div className="navsub" role="group" aria-label={`${s.label} pages`} key={s.key + ":pages"}>
					{pages.map((t) => (
						<Link
							key={t[0]}
							section={s.key}
							subtab={t[0]}
							className="navpage"
							onClick={() => set({ drawer: false })}
							aria-current={subtab === t[0] ? "page" : undefined}
						>
							{t[1]}
						</Link>
					))}
				</div>,
			);
		}
	}

	return (
		<aside className="side">
			<div className="brand">
				{/* The Manna logo (14 October 2026): the whole logo where the rail
				    has room, the M alone where it is an icon strip — index.css
				    shows one or the other, by the same rules the labels follow. */}
				<span className="mark" aria-hidden="true">
					<img src={mannaMark} alt="" />
				</span>
				<span className="brandtext">
					<img className="brandlogo" src={mannaLogo} alt="Manna Group" />
					<small>HRMS</small>
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

			<nav className="railnav" aria-label="Modules">
				{rows}
				{/* Only ever drawn on a phone — `.navmore` is hidden everywhere
				    else. It opens the same drawer the tablet's hamburger does, so
				    Escape, the scrim and a followed link all close it the same
				    way. A button and not a `.nav`: it goes nowhere, and the rail's
				    links are counted as the modules. `data-on` rather than
				    `aria-current`, because the page it would claim is not this. */}
				{more ? (
					<button
						type="button"
						className="navmore"
						aria-expanded={drawer}
						aria-label={drawer ? "Close the menu" : "More modules"}
						data-on={bar.has(section) ? undefined : ""}
						onClick={() => set({ drawer: !drawer })}
					>
						<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M5 12h.01M12 12h.01M19 12h.01" />
						</svg>
						<span className="lab">More</span>
					</button>
				) : null}
			</nav>

			{/* **No "signed in as" block here since 29 September 2026.** The header's
			    avatar already says whose account this is, with sign-out under it,
			    and the same address twice on one screen is one too many. */}
			<div className="railfoot">
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
