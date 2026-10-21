/** The bar over every page, as the HRDashboard reference draws it
 *  (21 October 2026): the menu button on a narrow screen, the search that
 *  finds people, pages and actions (press "/"), the company picker (D19), the
 *  header's links, what is waiting, and who is signed in.
 *
 *  **Nothing here reads the site.** The search looks through the employee list
 *  the first load already holds, and the pages list is GoTo's — the same one
 *  Ctrl+K offers, read through the same menus. The two menus are built on
 *  `.empdrop` / `.emmenu` so they close with every other menu in the app — see
 *  the document handler in App.jsx, which closes `tbnotif` and `tbme`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, set } from "@/store";
import { logout } from "@/api/client";
import Link from "@/routes/Link";
import { navigate } from "@/routes/router";
import { destinations, rank } from "@/layout/GoTo";
import { headerLinks, shown } from "@/data/nav";
import { employeesLocked } from "@/data/menus";
import { paletteFor, saveMode } from "@/lib/mode";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";

/** Everything waiting on somebody, newest first.
 *
 *  Two queues have documents behind them on this site — attendance corrections
 *  and open leave applications — so those are what is counted. A count that
 *  invents a number is one nobody trusts the second time. */
export function pending(s) {
	const rows = [];
	for (const r of s.approvals.attendance || []) {
		rows.push({
			id: "att:" + (r.name || r.employee),
			what: "Attendance correction",
			who: (s.byName[r.employee] || {}).employee_name || r.employee_name || r.employee || "—",
			when: String(r.creation || r.attendance_date || ""),
		});
	}
	for (const r of s.approvals.leave || []) {
		rows.push({
			id: "lv:" + (r.name || r.employee),
			what: `Leave — ${r.leave_type || "request"}`,
			who: r.employee_name || (s.byName[r.employee] || {}).employee_name || r.employee || "—",
			when: String(r.creation || r.posting_date || r.from_date || ""),
		});
	}
	return rows.sort((a, b) => b.when.localeCompare(a.when));
}

/** The search's answers, in the reference's groups and at its counts: four
    people, five pages, three actions. A person matches on name, code,
    designation or department; a page on its name or its module's. */
export function searchResults(s, typed, actions) {
	const q = typed.trim().toLowerCase();
	if (!q) return [];
	const people = (s.employees || [])
		.filter((e) => [e.employee_name, e.name, e.employee_number, e.designation, e.department]
			.join(" ").toLowerCase().includes(q))
		.slice(0, 4)
		.map((e) => ({
			group: "People", id: "emp:" + e.name, name: e.employee_name || e.name,
			sub: [e.designation, e.department].filter(Boolean).join(" · "),
			run: () => openEmployee(e.name),
		}));
	const pages = rank(destinations(s.user, s.admin), q).slice(0, 5).map((d) => ({
		group: "Pages", id: "page:" + d.id, label: d.label, sub: d.top ? "" : d.module,
		run: () => navigate(d.section, d.subtab),
	}));
	const acts = actions.filter((a) => a.label.toLowerCase().includes(q)).slice(0, 3)
		.map((a) => ({ group: "Actions", id: "act:" + a.label, label: a.label, icon: a.icon, run: a.run }));
	return [...people, ...pages, ...acts];
}

/** The part of a login before the @, as a name to put beside the avatar:
    these logins are addresses, and the reference shows a first name there. */
/** What the account button calls somebody: the first name on their User
    record, else the part of the login before the @ — never a sample name. */
export const firstName = (user, me) => {
	if (me?.first_name) return me.first_name;
	const local = String(user || "").split("@")[0];
	return local ? local[0].toUpperCase() + local.slice(1) : "";
};

/** The signed-in person's own Employee code, for the header's Payslip link;
    "" for a login no Employee carries, which opens everybody's. */
export const ownCode = (employees, user) =>
	(employees || []).find((e) => e.user_id && e.user_id === user)?.name || "";

export default function TopBar() {
	const s = useApp();
	const { companies, company, user, drawer, tbnotif, tbme, mode, section, subtab } = s;
	const [typed, setTyped] = useState("");
	const [at, setAt] = useState(0);
	const [focused, setFocused] = useState(false);
	const box = useRef(null);

	const signOut = async () => {
		await logout();
		set({ user: "", tbme: false });
	};

	/* The reference's actions, as far as this app has them. Each is offered
	   only to a login that could do it from the menu. */
	const actions = useMemo(() => {
		const out = [];
		if (shown("employees", user, s.admin) && !employeesLocked(user)) {
			out.push({ label: "Add employee", icon: "plus", run: () => navigate("employees", "new") });
		}
		if (shown("leave", user, s.admin)) {
			out.push({ label: "Request time off", icon: "clock", run: () => navigate("leave", "overview") });
		}
		out.push({ label: "Go to a page", icon: "arrow", run: () => set({ palette: true }) });
		out.push({
			label: "Switch light / dark mode", icon: "sun",
			run: () => set({ mode: saveMode(paletteFor(mode) === "dark" ? "light" : "dark") }),
		});
		out.push({ label: "Sign out", icon: "logout", run: signOut });
		return out;
	}, [user, s.admin, mode]);

	const results = searchResults(s, typed, actions);
	const showing = focused && typed.trim() !== "";
	const waiting = pending(s);

	/* "/" goes to the search from anywhere, as in the reference — unless
	   somebody is typing in a box already, a dialog is open, or a modifier is
	   held (Ctrl+/ is the browser's and the editors'). */
	useEffect(() => {
		const onKey = (e) => {
			if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
			const t = e.target;
			if (t?.closest?.("input, textarea, select, [contenteditable='true'], .modal, .goto")) return;
			e.preventDefault();
			box.current?.focus();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const clear = () => {
		setTyped("");
		setAt(0);
		box.current?.blur();
	};
	const run = (r) => {
		clear();
		r.run();
	};
	const onKeyDown = (e) => {
		if (e.key === "Escape") { e.preventDefault(); clear(); }
		else if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(results.length - 1, i + 1)); }
		else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
		else if (e.key === "Enter" && results[at]) { e.preventDefault(); run(results[at]); }
	};

	let lastGroup = "";
	return (
		<header className="topbar">
			{/* Only drawn at 880px and under, where the side menu is a drawer. */}
			<button
				type="button"
				className="tbrail icon-btn"
				aria-label={drawer ? "Close the menu" : "Open menu"}
				title={drawer ? "Close the menu" : "Menu"}
				aria-expanded={drawer}
				onClick={() => set({ drawer: !drawer })}
			>
				<KitIcon name="list" size={22} stroke={2} />
			</button>

			<div className="tbfind">
				<KitIcon name="search" size={20} stroke={2} />
				<input
					ref={box}
					type="search"
					placeholder="Search anything…"
					autoComplete="off"
					aria-label="Search people, pages or actions"
					role="combobox"
					aria-expanded={showing}
					aria-controls="tbres"
					aria-activedescendant={showing && results[at] ? "tbres-" + at : undefined}
					value={typed}
					onChange={(e) => { setTyped(e.target.value); setAt(0); }}
					onKeyDown={onKeyDown}
					onFocus={() => setFocused(true)}
					/* Late enough that a click on a result lands before the list goes. */
					onBlur={() => setTimeout(() => setFocused(false), 150)}
				/>
				<span className="kbd" aria-hidden="true">/</span>
				<div className={"search-res" + (showing ? " show" : "")} id="tbres" role="listbox">
					{showing && results.length === 0 ? (
						<div className="empty-res">Nothing matches “{typed.trim()}”.</div>
					) : null}
					{showing ? results.map((r, i) => {
						const head = r.group !== lastGroup ? <div className="sr-g" key={"g:" + r.group}>{r.group}</div> : null;
						lastGroup = r.group;
						return [
							head,
							<button
								key={r.id}
								id={"tbres-" + i}
								type="button"
								role="option"
								aria-selected={i === at}
								className={i === at ? "hi" : undefined}
								onMouseDown={(e) => e.preventDefault()}
								onMouseMove={() => { if (i !== at) setAt(i); }}
								onClick={() => run(r)}
							>
								{r.group === "People"
									? <KitAvatar name={r.name} />
									: <span className="sr-ic"><KitIcon name={r.icon || "arrow"} size={16} stroke={2} /></span>}
								<span className="sr-t">
									<b>{r.group === "People" ? r.name : r.label}</b>
									{r.sub ? <small>{r.sub}</small> : null}
								</span>
							</button>,
						];
					}) : null}
				</div>
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

			<nav className="toplinks" aria-label="Shortcuts">
				{headerLinks(user, s.admin).map((l) => {
					const on = !l.near && l.section === section && (l.subtab === "overview" || l.subtab === subtab);
					return (
						<Link key={l.label} section={l.section} subtab={l.subtab}
							className={on ? "on" : undefined} aria-current={on ? "page" : undefined}
							onClick={l.mine ? () => set({ slipFind: ownCode(s.employees, user) }) : undefined}>
							{l.label}
						</Link>
					);
				})}
			</nav>

			<div className="tbacts">
				{/* What is waiting. The reference's envelope and red dot; the count is
				    the menu's heading and the button's name. Only for a login that
				    can act on it (data/menus.js USER_ONLY). */}
				{s.admin !== false && <span className="empdrop">
					<button
						type="button"
						className="tbicon icon-btn"
						aria-haspopup="menu"
						aria-expanded={tbnotif}
						aria-label={waiting.length ? `${waiting.length} waiting` : "Nothing waiting"}
						title={waiting.length ? `${waiting.length} waiting on somebody` : "Nothing waiting"}
						/* Off the document handler in App, which would otherwise close
						   the menu in the same click that opened it. */
						onClick={(e) => { e.stopPropagation(); set({ tbnotif: !tbnotif, tbme: false }); }}
					>
						<KitIcon name="mail" size={22} stroke={1.8} />
						{waiting.length ? <span className="dot-n" aria-hidden="true" /> : null}
					</button>
					<div className="emmenu end tbmenu" role="menu" aria-label="Waiting on somebody" hidden={!tbnotif}>
						<h4>
							Waiting on somebody
							<span className="n">{waiting.length}</span>
						</h4>
						{waiting.length === 0 ? (
							<p className="tbnone">Nothing is waiting.</p>
						) : (
							waiting.slice(0, 6).map((r) => (
								<Link
									key={r.id}
									section="dashboard"
									subtab="approvals"
									role="menuitem"
									className="tbnote"
									onClick={() => set({ tbnotif: false })}
								>
									<KitAvatar name={r.who} />
									<span className="tbnote-t">
										<b>{r.what}</b>
										<span>{r.who}</span>
									</span>
								</Link>
							))
						)}
						{waiting.length > 6 ? (
							<Link section="dashboard" subtab="approvals" role="menuitem"
								className="tbnote foot" onClick={() => set({ tbnotif: false })}>
								<b>All {waiting.length} in Approvals</b>
							</Link>
						) : null}
					</div>
				</span>}

				<span className="empdrop">
					<button
						type="button"
						className="tbme"
						aria-haspopup="menu"
						aria-expanded={tbme}
						aria-label="Account menu"
						title={user || "Not signed in"}
						onClick={(e) => { e.stopPropagation(); set({ tbme: !tbme, tbnotif: false }); }}
					>
						<KitAvatar name={s.me?.full_name || user || "?"} src={s.me?.user_image || ""} className="tbava" />
						<span className="nm">{firstName(user, s.me)}</span>
						<KitIcon name="chev" size={16} stroke={2} className="cx" />
					</button>
					<div className="emmenu end tbmenu tbmemenu" role="menu" aria-label="This account" hidden={!tbme}>
						<h4>{s.me?.full_name || user || "Not signed in"}</h4>
						<Link section="employees" subtab="profile" role="menuitem" className="tbnote"
							onClick={() => set({ tbme: false })}>
							<KitIcon name="user" size={16} stroke={2} />
							<b>My profile</b>
						</Link>
						{s.admin !== false && <Link section="settings" role="menuitem" className="tbnote"
							onClick={() => set({ tbme: false })}>
							<KitIcon name="gear" size={16} stroke={2} />
							<b>Settings</b>
						</Link>}
						<button type="button" role="menuitem" className="tbnote foot danger" onClick={signOut}>
							<KitIcon name="logout" size={16} stroke={2} />
							<b>Sign out</b>
						</button>
					</div>
				</span>
			</div>
		</header>
	);
}
