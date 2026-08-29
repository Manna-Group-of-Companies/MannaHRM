import { patch, set, useApp } from "@/state/store";
import { scoped } from "@/lib/scope";
import { MON, dayOf, dmy, fmt, thisMonth, tidyDept } from "@/lib/format";
import { FH_REG_COLS } from "@/data/attendance";
import { Desk, Empty, Scroll } from "@/components/ui";
import { deskUrl } from "@/lib/desk";

/* Factor HR's Attendance Regularization screen, photographed 28 Aug 2026:
   the title, then one bar — Attendance Cycle, the status dot, Search Employee,
   Select Categories, and four icons: filter, import, refresh, history. Under
   it, nothing at all until somebody is picked:

       No Employee Selected
       Please select employee for show Regularization

   That empty state is the screen's whole model, so it is copied word for word,
   their grammar included. **This queue is one person at a time.** Ours on
   Dashboard → Approvals is everybody's corrections in one list, which is the
   better screen for an approver working a backlog — but theirs is the one HR
   uses to answer "what happened to my 19th of August", and the two are worth
   seeing side by side rather than one replacing the other quietly. */

/* Their cycle picker reads "Aug-2026". Thirteen months ending one ahead of
   today, which is as far as a correction can be raised for. */
function regCycles() {
	const out = [];
	const now = new Date();
	for (let i = 11; i >= -1; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		out.push([
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
			`${MON[d.getMonth()]}-${d.getFullYear()}`,
		]);
	}
	return out;
}

/** "2026-08" → "Aug-2026", the way their cycle picker writes it. */
const cycleLabel = (cyc) => `${MON[+cyc.slice(5, 7) - 1]}-${cyc.slice(0, 4)}`;

/* Who the search box can offer. Scoped by company like the rest of the page,
   then by the dot and the category box — which is what those two controls are
   for on their screen as well. */
function regMatches(s) {
	const q = (s.reg.q || "").trim().toLowerCase();
	let rows = scoped(s);
	if (s.reg.status) rows = rows.filter((e) => e.status === s.reg.status);
	if (s.reg.cat) rows = rows.filter((e) => e.department === s.reg.cat);
	if (!q) return { rows: [], all: rows.length };
	return {
		rows: rows
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8),
		all: rows.length,
	};
}

/* The same coloured dot as Employee Master, because it is the same control on
   their screen — Active, InActive, All, in that order. Its own selection,
   though: a filter set on one screen is not a filter set on another, and
   sharing them would silently hide people here. */
function RegDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.reg.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.reg.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("reg", { menu: !s.reg.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.reg.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.reg.status}
						onClick={(e) => { e.stopPropagation(); patch("reg", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** One of the bar's four icons. `href` sends it to the site; `dead` draws it
    disabled with the reason on it, which is the point of drawing it at all. */
function BarIcon({ path, label, title, dead, href, onClick }) {
	const ico = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
	if (href !== undefined) {
		return <Desk className="embtn ic" href={href} label={label} title={title}>{ico}</Desk>;
	}
	return (
		<button className="embtn ic" disabled={dead} title={title} aria-label={label} onClick={onClick}>
			{ico}
		</button>
	);
}

function RegBar({ s, cyc }) {
	const depts = [...new Set(scoped(s).map((e) => e.department).filter(Boolean))].sort();

	return (
		<div className="embar regbar">
			<label className="cyc" title="Factor HR calls the month an attendance cycle. Ours is the calendar month until somebody says the payroll month runs to a different day.">
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="1.7">
					<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
				</svg>
				Attendance Cycle :
				<select value={cyc} aria-label="Attendance cycle"
					onChange={(e) => patch("reg", { cycle: e.target.value })}>
					{regCycles().map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
				</select>
			</label>

			<RegDot s={s} />

			<span className="find rev">
				<input type="search" placeholder="Search Employee" aria-label="Search employee"
					value={s.reg.q || ""} onChange={(e) => patch("reg", { q: e.target.value })} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</span>

			<select value={s.reg.cat} aria-label="Select categories"
				title="Factor HR’s Categories is a master of masters — eight category types, three of them ours. Department is the one both systems hold, so it is what this box can offer."
				onChange={(e) => patch("reg", { cat: e.target.value })}>
				<option value="">Select Categories</option>
				{depts.map((d) => <option key={d} value={d}>{tidyDept(d)}</option>)}
			</select>

			<span className="regicons">
				<BarIcon path="M3 5h18l-7 8v6l-4 2v-8Z" label="Filter" dead
					title="Factor HR's filter panel on this screen has never been opened. The two controls it would hold are already on the bar." />
				<BarIcon path="M12 16V4M7 9l5-5 5 5M4 20h16" label="Import" dead
					title="This writes attendance from a spreadsheet — no shift check, no geofence, no approver. Drawn because it exists over there, refused because it is the most dangerous button in any HR system." />
				<BarIcon path="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" label="Refresh"
					title="Reload the queue from the site" onClick={() => void load()} />
				{/* This page reads open requests only — see pendingRegularizations() —
				    so a decided correction vanishes from it entirely. The list on the
				    site still holds every one, decided included, which is where a
				    question about what happened to a request is actually answered. */}
				<BarIcon path="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2" label="History"
					href={s.site && deskUrl(s.site, s.regDoctype)}
					title={`Every correction on the site, decided ones included — opens the ${s.regDoctype} list. This page reads open requests only, so a decided one disappears from it.`} />
			</span>
		</div>
	);
}

export default function Regularization() {
	const s = useApp();
	const pend = (s.approvals.attendance || []).length;
	const emp = s.reg.emp ? s.byName[s.reg.emp] : null;
	const { rows: matches, all } = regMatches(s);
	const cyc = s.reg.cycle || thisMonth();
	const searching = !emp && (s.reg.q || "").trim();

	/* Only requests for the picked person, in the picked cycle. Their screen
	   never shows anybody else's, which is the whole difference from the backlog
	   on Dashboard → Approvals. */
	const mine = emp
		? (s.approvals.attendance || [])
			.filter((r) => r.employee === emp.name && String(r.attendance_date || "").slice(0, 7) === cyc)
			.sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)))
		: [];

	return (
		<>
			<div className="legend">
				<b className="font-display">Attendance Regularization</b>
				<span className={"cov " + (pend ? "live" : "part")}>
					{pend ? `${fmt(pend)} pending` : "queue live, empty"}
				</span>
				<span>
					Factor HR’s screen, and it is <b>one person at a time</b>. The same requests are worked as a
					backlog on <b>Dashboard → Approvals</b>, where the card carries the shift and the hours.
				</span>
			</div>

			<div className="fhscreen">
				<div className="fhtitle">Attendance Regularization</div>
				<RegBar s={s} cyc={cyc} />

				{/* The picker Factor HR opens under its search box. Ours says how many
				    people it is searching, because the dot and the category box can
				    empty it and a search that finds nobody should say which filter did it. */}
				{searching && (
					matches.length ? (
						<div className="regfind">
							{matches.map((e) => (
								<button key={e.name} onClick={() => patch("reg", { emp: e.name, q: "" })}>
									<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
									<b>{e.employee_name}</b>
									<span className="mono">{e.employee_number || "—"}</span>
									<span className="muted">{tidyDept(e.department)}</span>
								</button>
							))}
						</div>
					) : (
						<div className="regfind">
							<span className="none">
								Nobody matches, out of {fmt(all)} searched
								{s.reg.status ? ` · status ${s.reg.status}` : ""}
								{s.reg.cat ? ` · ${tidyDept(s.reg.cat)}` : ""}
							</span>
						</div>
					)
				)}

				{!emp ? (
					/* Their words, their grammar. It is the screen. */
					<div className="regnone">
						<b>No Employee Selected</b>
						<span>Please select employee for show Regularization</span>
					</div>
				) : (
					<>
						<div className="regwho">
							<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
							<b>{emp.employee_name}</b>
							<span className="mono">{emp.employee_number || "—"}</span>
							<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
							<span className="n">{fmt(mine.length)} in {cycleLabel(cyc)}</span>
							<button className="embtn" onClick={() => patch("reg", { emp: "", q: "" })}>Clear</button>
						</div>

						{mine.length ? (
							<Scroll>
								<table style={{ minWidth: 1180 }}>
									<thead>
										<tr>
											<th>Date</th>
											<th>Day</th>
											{FH_REG_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}
										</tr>
									</thead>
									<tbody>
										{mine.map((r) => (
											<tr key={r.name}>
												<td className="mono">{dmy(r.attendance_date)}</td>
												<td className="muted">{dayOf(String(r.attendance_date).slice(0, 10))}</td>
												{FH_REG_COLS.map((c) => (
													<td key={c[0]} className={/In$|Out$|Hours$|On$/.test(c[0]) ? "mono" : undefined}>
														{String(c[1](r))}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</Scroll>
						) : (
							<Empty title={`No corrections for ${emp.employee_name} in ${cycleLabel(cyc)}`}>
								Only <em>open</em> requests are read, so a correction already decided will not appear
								here — which is what the History icon is for, and it has never been asked for.
							</Empty>
						)}
					</>
				)}
			</div>

			<div className="mt-4">
			</div>
		</>
	);
}
