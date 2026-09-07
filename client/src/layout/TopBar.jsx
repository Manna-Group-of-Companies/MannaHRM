/** The bar over every page: where you are, what you are looking for, which
 *  company, and the three controls that belong to the person rather than to the
 *  page — what is waiting, settings, and who is signed in.
 *
 *  **Nothing here reads the site.** The bell counts rows the first load already
 *  fetched, and the two menus are built on `.empdrop` / `.emmenu` so they close
 *  with every other menu in the app — see the document handler in App.jsx,
 *  which has to be told about `tbnotif` and `tbme` or they stay open behind the
 *  next click.
 */

import { useApp, set } from "@/store";
import { logout } from "@/api/client";
import { MODULES } from "@/routes/registry";
import { initials } from "@/lib/format";
import Link from "@/routes/Link";

/* One flat icon set, drawn at 24 and stroked. Inline rather than a font or a
   package: five glyphs is five paths, and a webfont is a request that has to
   land before the header stops looking broken. */
const ICON = {
	menu: "M4 6h16M4 12h16M4 18h16",
	find: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	bell: "M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4",
	gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z",
	out: "M15 12H4M8 8l-4 4 4 4M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",
};

const Glyph = ({ d }) => (
	<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
		<path d={d} />
	</svg>
);

/** Everything waiting on somebody, newest first.
 *
 *  Two queues have documents behind them on this site — attendance corrections
 *  and open leave applications — and the other five are field lists, so they
 *  are counted as zero rather than guessed at. A bell that invents a number is
 *  a bell nobody trusts the second time. */
function pending(s) {
	const rows = [];
	for (const r of s.approvals.attendance || []) {
		rows.push({
			id: "att:" + (r.name || r.employee),
			section: "dashboard",
			subtab: "approvals",
			what: "Attendance correction",
			who: (s.byName[r.employee] || {}).employee_name || r.employee_name || r.employee || "—",
			when: String(r.creation || r.attendance_date || ""),
		});
	}
	for (const r of s.approvals.leave || []) {
		rows.push({
			id: "lv:" + (r.name || r.employee),
			section: "dashboard",
			subtab: "approvals",
			what: `Leave — ${r.leave_type || "request"}`,
			who: r.employee_name || (s.byName[r.employee] || {}).employee_name || r.employee || "—",
			when: String(r.creation || r.posting_date || r.from_date || ""),
		});
	}
	return rows.sort((a, b) => b.when.localeCompare(a.when));
}

export default function TopBar() {
	const s = useApp();
	const { companies, company, q, user, section, subtab, drawer, tbnotif, tbme } = s;

	const mod = MODULES[section];
	const page = (mod?.tabs || []).find((t) => t[0] === subtab);
	const waiting = pending(s);

	const signOut = async () => {
		await logout();
		set({ user: "", tbme: false });
	};

	return (
		<header className="topbar">
			{/* Only ever visible on a narrow window, where the rail is icons and
			    this is the way to its labels. It opens the rail *over* the page —
			    a different key from how wide the rail is on a desktop, because at
			    this width those are different things. */}
			<button
				type="button"
				className="tbrail"
				aria-label={drawer ? "Close the menu" : "Menu"}
				title={drawer ? "Close the menu" : "Menu"}
				aria-expanded={drawer}
				onClick={() => set({ drawer: !drawer })}
			>
				<Glyph d={ICON.menu} />
			</button>

			<span className="tbwhere">
				<b>{mod?.label || "Dashboard"}</b>
				<span>{page ? page[1] : "Overview"}</span>
			</span>

			{/* The search the employee screens read. `type="search"` rather than
			    text, so a phone offers the right keyboard and the browser its own
			    clear control — ours is beside it for the browsers that draw none. */}
			<div className="tbfind">
				<Glyph d={ICON.find} />
				<input
					type="search"
					placeholder="Search name, code, designation…"
					aria-label="Search"
					value={q}
					onChange={(e) => set({ q: e.target.value })}
				/>
				{q ? (
					<button type="button" className="clear" aria-label="Clear the search"
						title="Clear the search" onClick={() => set({ q: "" })}>×</button>
				) : null}
			</div>

			<select
				className="tbco"
				aria-label="Company"
				title="Scope every screen to one company"
				value={company}
				onChange={(e) => set({ company: e.target.value })}
			>
				<option value="">All companies</option>
				{companies.map((c) => (
					<option key={c.name}>{c.name}</option>
				))}
			</select>

			<div className="tbacts">
				<span className="empdrop">
					<button
						type="button"
						className="tbicon"
						aria-haspopup="menu"
						aria-expanded={tbnotif}
						aria-label={waiting.length ? `${waiting.length} waiting` : "Nothing waiting"}
						title={waiting.length ? `${waiting.length} waiting on somebody` : "Nothing waiting"}
						/* Off the document handler in App, which would otherwise close
						   the menu in the same click that opened it. */
						onClick={(e) => { e.stopPropagation(); set({ tbnotif: !tbnotif, tbme: false }); }}
					>
						<Glyph d={ICON.bell} />
						{waiting.length ? <span className="n">{waiting.length > 99 ? "99+" : waiting.length}</span> : null}
					</button>
					<div className="emmenu end tbmenu" role="menu" aria-label="Waiting on somebody" hidden={!tbnotif}>
						<h4>
							Waiting on somebody
							<span className="n">{waiting.length}</span>
						</h4>
						{waiting.length === 0 ? (
							<p className="tbnone">
								Nothing is waiting. Corrections and leave applications appear here
								as they are raised.
							</p>
						) : (
							waiting.slice(0, 6).map((r) => (
								<Link
									key={r.id}
									section={r.section}
									subtab={r.subtab}
									role="menuitem"
									className="tbnote"
									onClick={() => set({ tbnotif: false })}
								>
									<b>{r.what}</b>
									<span>{r.who}</span>
								</Link>
							))
						)}
						{waiting.length > 6 ? (
							<Link section="dashboard" subtab="approvals" role="menuitem"
								className="tbnote foot" onClick={() => set({ tbnotif: false })}>
								<b>All {waiting.length} in Approvals →</b>
							</Link>
						) : null}
					</div>
				</span>

				<Link section="settings" className="tbicon" aria-label="Settings" title="Settings">
					<Glyph d={ICON.gear} />
				</Link>

				<span className="empdrop">
					<button
						type="button"
						className="tbme"
						aria-haspopup="menu"
						aria-expanded={tbme}
						title={user || "Not signed in"}
						onClick={(e) => { e.stopPropagation(); set({ tbme: !tbme, tbnotif: false }); }}
					>
						<span className="tbava" aria-hidden="true">{initials(user || "?")}</span>
						<span className="who">
							<b>{user || "Not signed in"}</b>
							<span>{company || "All companies"}</span>
						</span>
						<b className="cx" aria-hidden="true">▾</b>
					</button>
					<div className="emmenu end tbmenu" role="menu" aria-label="This account" hidden={!tbme}>
						<h4>{user || "Not signed in"}</h4>
						<Link section="employees" subtab="profile" role="menuitem" className="tbnote"
							onClick={() => set({ tbme: false })}>
							<b>Employee profile</b>
							<span>The record behind a person</span>
						</Link>
						<Link section="settings" role="menuitem" className="tbnote"
							onClick={() => set({ tbme: false })}>
							<b>Settings</b>
							<span>Appearance, and what this site is set up for</span>
						</Link>
						<button type="button" role="menuitem" className="tbnote foot" onClick={signOut}>
							<b>Sign out</b>
							<span>Ends the Frappe session on this site</span>
						</button>
					</div>
				</span>
			</div>
		</header>
	);
}
