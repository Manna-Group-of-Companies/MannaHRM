/** The side menu, as the HRDashboard reference draws it (21 October 2026):
 *  the company over a green Dashboard button, the reference's groups opening
 *  onto their pages, and a foot with Setting and the Light / Dark switch.
 *
 *  What is in each group is data/nav.js; who may see which page is still
 *  data/menus.js and Settings → Security, read through `pagesOf`. This file
 *  only draws it.
 *
 *  Collapsed (`data-rail="slim"` on `.shell`) it is the reference's 88px strip
 *  of icons, where a group goes straight to its first page. Below 881px it is
 *  a drawer over the page (`data-drawer`), opened from the header's menu
 *  button or the bottom bar's Menu.
 */

import { useEffect, useState } from "react";
import { useApp, set } from "@/store";
import Link from "@/routes/Link";
import { navigate } from "@/routes/router";
import { saveRail } from "@/lib/rail";
import { paletteFor, saveMode } from "@/lib/mode";
import { DASHBOARD, FOOT, groupOfSection, groupsFor, pagesOf, shown } from "@/data/nav";
import { MODULES } from "@/routes/registry";
import KitIcon from "@/components/kit/KitIcon";
import mannaMark from "@/assets/manna-mark.png";

/* Kept exported from here: GoTo and the tests have always imported it from
   the rail, and the rule it states — the rail lists what the strip lists — is
   the rail's. */
export { pagesOf };

/** The menu foot's links, with the reference's icon and word for each. */
const FOOT_LINK = { help: { label: "Help Center", icon: "help" }, settings: { label: "Setting", icon: "gear" } };

export default function Sidebar() {
	const { section, subtab, rail, drawer, user, admin, conn, connState, mode, company, companies } = useApp();
	const slim = rail === "slim";
	const palette = paletteFor(mode);
	const groups = groupsFor(user, admin);
	const current = groupOfSection(section)?.key || "";

	/* Which groups are open. The one holding the current page opens itself and
	   stays open after you leave it, as the reference's do; any other opens and
	   shuts on its own button. Not remembered past the tab — the reference
	   starts each visit with only the current group open. */
	const [open, setOpen] = useState(() => new Set(current ? [current] : []));
	useEffect(() => {
		if (current) setOpen((o) => (o.has(current) ? o : new Set(o).add(current)));
	}, [current]);

	const close = () => set({ drawer: false });
	const toggle = (g) => {
		/* On the icon strip there is no room to open a list under a group, so a
		   group goes to its first page — which is what the reference does. */
		if (slim && !drawer) {
			const first = g.items[0];
			if (first) navigate(first.section, first.subtab);
			return;
		}
		setOpen((o) => {
			const n = new Set(o);
			if (n.has(g.key)) n.delete(g.key);
			else n.add(g.key);
			return n;
		});
	};

	const dash = shown(DASHBOARD, user, admin);
	const dashPages = section === DASHBOARD ? pagesOf(DASHBOARD, user, admin) : [];

	return (
		<aside className="side" aria-label="Main navigation">
			<div className="brand">
				{/* The reference shows the company's own name here (D19): the one the
				    header's picker is scoped to, or the group's when it is all six. */}
				<span className="brand-mark">
					<img src={mannaMark} alt="" />
					<span className="brand-name">{company || "Manna Group"}</span>
				</span>
				<button
					type="button"
					className="railtoggle icon-btn"
					/* Two jobs, because at the two widths there are two things to
					   close. Open as a drawer, it shuts the drawer; otherwise it is
					   the desktop's collapse control. `drawer` is only ever true
					   below 881px, so each width sees one behaviour and never both. */
					aria-label={drawer ? "Close the menu" : slim ? "Expand the menu" : "Collapse the menu"}
					title={drawer ? "Close the menu" : slim ? "Expand the menu" : "Collapse the menu"}
					aria-pressed={drawer ? true : slim}
					onClick={() => (drawer ? close() : set({ rail: saveRail(slim ? "wide" : "slim") }))}
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
						strokeWidth="2" strokeLinecap="round" aria-hidden="true">
						<path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
					</svg>
				</button>
			</div>

			{dash ? (
				<Link
					section={DASHBOARD}
					className="dash-btn"
					title="Dashboard"
					aria-current={section === DASHBOARD ? "page" : undefined}
					onClick={close}
				>
					<span className="t">{MODULES[DASHBOARD]?.label || "Dashboard"}</span>
					<KitIcon name="grid" size={20} stroke={1.8} />
				</Link>
			) : null}
			{/* The Dashboard's own pages — Approvals, the company dashboards —
			    under it while it is open. The reference's button has none; this
			    app's Dashboard does, and they need a way in. */}
			{dashPages.length > 1 ? (
				<div className="sub-in dash-sub" role="group" aria-label="Dashboard pages">
					{dashPages.map(([sub, label]) => (
						<Link
							key={sub}
							section={DASHBOARD}
							subtab={sub}
							className={subtab === sub ? "on" : undefined}
							aria-current={subtab === sub ? "page" : undefined}
							onClick={close}
						>
							{label}
						</Link>
					))}
				</div>
			) : null}

			<nav className="sidenav" aria-label="Modules">
				{groups.map((g) => {
					const isOpen = open.has(g.key);
					const has = g.key === current;
					return (
						<div key={g.key} className={"nav-g" + (isOpen ? " open" : "") + (has ? " has-on" : "")} data-group={g.key}>
							<button
								type="button"
								title={g.label}
								aria-expanded={isOpen}
								aria-controls={"navsub-" + g.key}
								onClick={() => toggle(g)}
							>
								<KitIcon name={g.icon} size={20} stroke={1.7} className="ic" />
								<span className="lbl">{g.label}</span>
								<svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none"
									stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
									<path d="m6 9 6 6 6-6" />
								</svg>
							</button>
							<div className="sub-wrap" id={"navsub-" + g.key}>
								<div className="sub">
									{/* `inert` while shut, so a closed group's links are out of
									    the tab order as well as out of sight. */}
									<div className="sub-in" role="group" aria-label={`${g.label} pages`} inert={isOpen ? undefined : ""}>
										{g.items.map((it) => {
											const on = it.section === section && it.subtab === subtab;
											return (
												<Link
													key={it.section + "/" + it.subtab}
													section={it.section}
													subtab={it.subtab}
													/* The menu is 260px; a long name is cut, and this says the rest. */
													title={it.label}
													className={on ? "on" : undefined}
													aria-current={on ? "page" : undefined}
													onClick={close}
												>
													{it.label}
												</Link>
											);
										})}
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</nav>

			<div className="side-foot">
				{/* The header's company picker, for a screen too narrow to hold it
				    there (index.css shows one or the other, at 880px). */}
				<select
					className="sideco"
					aria-label="Company"
					value={company}
					onChange={(e) => set({ company: e.target.value })}
				>
					<option value="">All companies</option>
					{(companies || []).map((c) => (
						<option key={c.name}>{c.name}</option>
					))}
				</select>
				{FOOT.filter((f) => shown(f, user, admin)).map((f) => (
					<Link
						key={f}
						section={f}
						className={section === f ? "on" : undefined}
						title={FOOT_LINK[f].label}
						aria-current={section === f ? "page" : undefined}
						onClick={close}
					>
						<KitIcon name={FOOT_LINK[f].icon} size={20} stroke={1.8} />
						<span className="t">{FOOT_LINK[f].label}</span>
					</Link>
				))}
				{/* Picking one here is a choice for good. While the choice is still
				    `system`, the palette the device chose is the one shown pressed. */}
				<div className={"theme-sw" + (palette === "dark" ? " dark" : "")} role="group" aria-label="Theme">
					<span className="knob" aria-hidden="true" />
					<button type="button" title="Light" aria-pressed={palette === "light"}
						className={palette === "light" ? "on" : undefined}
						onClick={() => set({ mode: saveMode("light") })}>
						<KitIcon name="sun" size={16} stroke={2} />
						<span className="t">Light</span>
					</button>
					<button type="button" title="Dark" aria-pressed={palette === "dark"}
						className={palette === "dark" ? "on" : undefined}
						onClick={() => set({ mode: saveMode("dark") })}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
						</svg>
						<span className="t">Dark</span>
					</button>
				</div>
				{/* Ours, not the reference's: whether the site is answering, kept
				    beside the thing it describes. `aria-live` because it changes on
				    its own — a read that fails turns it red — and that is worth
				    announcing once. */}
				<div className="railconn" title={"Site connection: " + conn} aria-live="polite">
					<span className={"dot " + connState} aria-hidden="true" />
					<span className="t">{conn}</span>
				</div>
			</div>
		</aside>
	);
}
