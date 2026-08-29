
import { set, useApp } from "@/state/store";
import { scoped, uniq } from "@/lib/scope";
import { fmt, tally, tidyDept } from "@/lib/format";
import EmployeeCard from "@/components/EmployeeCard";
import { Desk, Empty, Note, Scroll } from "@/components/ui";
import { deskNew } from "@/lib/desk";
import { STATUS_ROWS } from "@/data/employees";

/* Factor HR's status filter, dot for dot: green Active, red InActive, blue All.
   A native <select> cannot colour an option, and on this control the colour is
   what gets read — so it is a button and a listbox rather than a dropdown with
   the words alone. The statuses come off the records, so a site that grows a
   fourth one grows a fourth row here without anybody editing this.

   Factor HR draws Active and InActive whether or not anybody is in them, and so
   does this: a filter that appears only once somebody has that status is a
   filter nobody knows exists, and *nobody is Inactive* is worth being able to
   ask for and see. */
function StatusDrop({ status, cur, menu }) {
	const n = Object.fromEntries(status);
	const fixed = STATUS_ROWS.map((r) => [
		r[0], `${r[0]} (${fmt(n[r[0]] || 0)})`, r[1], !n[r[0]],
	]);
	const rest = status
		.filter((r) => !STATUS_ROWS.some((f) => f[0] === r[0]))
		.map((r) => [r[0], `${r[0]} (${fmt(r[1])})`, "off", false]);
	// All last, where Factor HR puts it — this control is a copy of theirs and
	// the order is part of what is being copied.
	const opts = [...fixed, ...rest, ["", "All", "all", false]];
	const sel = opts.find((o) => o[0] === cur) || opts[opts.length - 1];

	return (
		<span className="empdrop">
			<button
				className="embtn"
				aria-haspopup="listbox"
				aria-label="Filter by status"
				aria-expanded={menu}
				title={"Status: " + sel[1]}
				/* Kept off the document handler in App, which would otherwise
				   close the menu in the same click that opened it. */
				onClick={(e) => {
					e.stopPropagation();
					set({ empmenu: !menu });
				}}
			>
				<i className={"sdot " + sel[2]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!menu}>
				{opts.map((o) => (
					<button
						key={o[0] || "all"}
						role="option"
						className={o[3] ? "zero" : undefined}
						aria-selected={o[0] === cur}
						onClick={(e) => {
							e.stopPropagation();
							set({ empstatus: o[0], empmenu: false });
						}}
					>
						<i className={"sdot " + o[2]} />
						{o[1]}
					</button>
				))}
			</div>
		</span>
	);
}

/** Open one person's whole record — the same jump the list rows make.

    It lands on Employee Profile rather than Employee Detail: the → on these
    cards always read as "open this person", and Employee Detail turned out to
    be a report builder rather than a record page. See FACTOHR_SCREENS §15, §23. */
export const openEmployee = (name) =>
	set({ empSel: name, section: "employees", subtab: "profile" });

/** The filtered master list, shared with the pages that need the same subset. */
export function masterRows(s) {
	const q = s.q.trim().toLowerCase();
	const all = scoped(s);
	let rows = all.filter(
		(e) => !q || [e.employee_number, e.employee_name, e.designation, e.department]
			.some((v) => (v || "").toLowerCase().includes(q)),
	);
	if (s.empstatus) rows = rows.filter((e) => e.status === s.empstatus);
	if (s.empdept) rows = rows.filter((e) => e.department === s.empdept);
	if (s.empdesig) rows = rows.filter((e) => e.designation === s.empdesig);
	if (s.empdev === "yes") rows = rows.filter((e) => e.attendance_device_id);
	if (s.empdev === "no") rows = rows.filter((e) => !e.attendance_device_id);
	return { all, rows };
}

export default function EmployeeMaster() {
	const s = useApp();
	const { all, rows } = masterRows(s);
	const status = tally(all, "status");

	return (
		<>
			<div className="emhead">
				<h2>Employee Master</h2>
				<span className="cov live">Live</span>
				<span className="n">
					{fmt(rows.length)}
					{rows.length === all.length ? "" : " of " + fmt(all.length)} people
				</span>
				<span className="right">
					{/* Hiring happens on the site, so this opens an empty Employee
					    there rather than a form here. That record has a naming series and
					    a page of required fields behind it; a second form for it would be
					    a second opinion about what an employee is. */}
					<Desk
						href={s.site && deskNew(s.site, "Employee")}
						title="Opens a new Employee on the ERPNext site — see app/README.md."
					>
						Add New Employee
					</Desk>
				</span>
			</div>

			<div className="embar">
				<StatusDrop status={status} cur={s.empstatus} menu={s.empmenu} />

				<span className="find">
					<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
						strokeWidth="1.8" strokeLinecap="round">
						<circle cx="11" cy="11" r="7" />
						<path d="M20 20l-3.6-3.6" />
					</svg>
					{/* One search behind two boxes: this writes through to the top
					    bar's, so a filter typed in either is the same filter and the
					    two cannot disagree. */}
					<input
						type="search"
						placeholder="Search employee…"
						aria-label="Search employees"
						value={s.q}
						onChange={(e) => set({ q: e.target.value })}
					/>
				</span>

				<button
					className="embtn"
					aria-pressed={s.empfilters}
					onClick={() => set({ empfilters: !s.empfilters })}
				>
					<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
						strokeWidth="1.8" strokeLinecap="round">
						<path d="M3 5h18l-7 8v6l-4 2v-8Z" />
					</svg>
					Filter
				</button>

				<select value={s.empdept} onChange={(e) => set({ empdept: e.target.value })} aria-label="Department">
					<option value="">All</option>
					{uniq(all, "department").map((d) => (
						<option key={d} value={d}>{tidyDept(d)}</option>
					))}
				</select>

				<button className="embtn" title="Reload from the site" aria-label="Reload from the site"
					onClick={() => void load()}>
					↻
				</button>

				<span className="emview">
					<button className="embtn" aria-pressed={s.empview !== "list"} title="Grid view"
						aria-label="Grid view" onClick={() => set({ empview: "grid" })}>
						<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
					</button>
					<button className="embtn" aria-pressed={s.empview === "list"} title="List view"
						aria-label="List view" onClick={() => set({ empview: "list" })}>
						<svg viewBox="0 0 24 24" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
					</button>
				</span>
			</div>

			{s.empfilters && (
				<div className="embar">
					<label className="text-[.83rem] text-ink-2">
						Designation{" "}
						<select value={s.empdesig} onChange={(e) => set({ empdesig: e.target.value })}>
							<option value="">any</option>
							{uniq(all, "designation").map((d) => (
								<option key={d}>{d}</option>
							))}
						</select>
					</label>
					<label className="text-[.83rem] text-ink-2">
						Biometric{" "}
						<select value={s.empdev} onChange={(e) => set({ empdev: e.target.value })}>
							<option value="">any</option>
							<option value="yes">enrolled</option>
							<option value="no">phone or nothing</option>
						</select>
					</label>
					<span className="n text-[.8rem] text-ink-3">
						Factor HR’s own Filter panel has not been screenshotted open. These two are what this
						site can answer.
					</span>
				</div>
			)}

			{!rows.length ? (
				<Empty title="Nobody matches">
					{fmt(all.length)} people are loaded. Clear the search or the filters.
				</Empty>
			) : s.empview === "list" ? (
				<Scroll>
					<table>
						<thead>
							<tr>
								<th>Code</th><th>Name</th><th>Company</th><th>Department</th>
								<th>Designation</th><th>Device ID</th><th>Reports to</th><th>Joined</th>
							</tr>
						</thead>
						<tbody>
							{rows.slice(0, 400).map((e) => (
								<tr key={e.name} data-emp={e.name} title="Open this record"
									onClick={() => openEmployee(e.name)}>
									<td className="mono">{e.employee_number || "—"}</td>
									<td>{e.employee_name}</td>
									<td className="muted">{e.company}</td>
									<td className="muted">{tidyDept(e.department)}</td>
									<td>{e.designation || "—"}</td>
									<td className="mono">
										{e.attendance_device_id ? e.attendance_device_id : <span className="tag">phone</span>}
									</td>
									<td className="muted">{s.byName[e.reports_to || ""]?.employee_name || "—"}</td>
									<td className="mono muted">{String(e.date_of_joining || "").slice(0, 10)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			) : (
				<>
					<div className="cards">
						{rows.slice(0, 300).map((e) => (
							<EmployeeCard key={e.name} e={e} onOpen={() => openEmployee(e.name)} />
						))}
					</div>
					{rows.length > 300 && (
						<Note>
							Showing the first 300 of {fmt(rows.length)}. <b>Search or filter</b> rather than
							scroll — or use the list view, which holds 400.
						</Note>
					)}
				</>
			)}
		</>
	);
}
