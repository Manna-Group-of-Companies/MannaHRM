import { set, useApp } from "@/store";
import { go } from "@/routes/router";
import { load } from "@/api/load";
import { scoped, uniq } from "@/lib/scope";
import { fmt, tally, tidyDept } from "@/lib/format";
import EmployeeCard from "@/components/EmployeeCard";
import { Empty, NO_SITE, Scroll } from "@/components/ui";
import { deskImport, deskUrl } from "@/lib/desk";
import { ONB_BLANK } from "@/data/candidates";
import { openEmployee } from "@/features/employees/openEmployee";
import ExportEmployees from "@/features/employees/ExportEmployees";
import { EMP_IMPORTS, EMP_MORE, EXP_BLANK, IMPORT_ICON, MORE_ICON, STATUS_ROWS } from "@/data/employees";

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

/** The filtered master list. */
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

/** One entry on the Add New Employee caret's list.

    An anchor when there is somewhere on the site to send it and a disabled
    button when there is not — the same bargain `Desk` makes, drawn inside a
    menu rather than as a control of its own. The reason is on the item either
    way, because "Picture Import is greyed out" is a question somebody will ask
    once and should be able to answer by hovering. */
function ImportItem({ row, site, onPick }) {
	const [label, ico, target, why] = row;
	const href = !target ? "" : target === "import" ? deskImport(site) : deskUrl(site, "Holiday List");
	/* Three states, not two. No target at all is a thing this site cannot do; a
	   target with no site yet is a link that will work in a moment. Saying the
	   first when it is the second sends somebody looking for a missing feature. */
	const dead = !target ? why : !site ? NO_SITE : "";

	const glyph = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d={IMPORT_ICON[ico]} />
		</svg>
	);

	if (dead) {
		return (
			<button role="menuitem" disabled title={dead}>
				{glyph}
				{label}
			</button>
		);
	}
	return (
		<a role="menuitem" href={href} target="_blank" rel="noreferrer" title={why}
			/* The document handler leaves anything inside `.empdrop` alone, so a
			   menu that does not close itself here stays open behind the new tab. */
			onClick={onPick}>
			{glyph}
			{label}
		</a>
	);
}

/** One entry on the ⋯ list.

    Three destinations, in the order the table decides them:

      **a page here** — Import From Onboarding, which is a list of who is
      waiting and therefore a read. It navigates like any other page rather than
      opening a tab, so back works and the address is linkable.

      **the desk** — Import From Recruitment. The record that turns an applicant
      into an Employee is an offer with terms on it, and so is the validation
      that guards it; that belongs over there.

      **this page** — the export, which is this screen's own work and which
      nothing on the site does.

    The last of those has a fourth state the others do not: nothing to write. A
    file of headers and no rows is not an empty answer, it is a confusing one. */
function MoreItem({ row, site, empty, onPick, onExport, onGo }) {
	const [label, ico, dt, why, page] = row;

	const glyph = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d={MORE_ICON[ico]} />
		</svg>
	);

	/* A page on this site. A button rather than an anchor, because `go` pushes
	   the URL itself — an <a href> beside it would be a second answer to where
	   this leads, and the two would drift. */
	if (page) {
		return (
			<button role="menuitem" title={why}
				onClick={(e) => {
					e.stopPropagation();
					onGo(page);
					onPick();
				}}>
				{glyph}
				{label}
			</button>
		);
	}

	if (!dt) {
		const dead = empty ? "Nothing to export — nobody is loaded for this company." : "";
		return (
			<button role="menuitem" disabled={!!dead} title={dead || why}
				onClick={(e) => {
					e.stopPropagation();
					onExport();
					onPick();
				}}>
				{glyph}
				{label}
			</button>
		);
	}

	if (!site) {
		return (
			<button role="menuitem" disabled title={NO_SITE}>
				{glyph}
				{label}
			</button>
		);
	}

	return (
		<a role="menuitem" href={deskUrl(site, dt)} target="_blank" rel="noreferrer" title={why}
			/* Same as the import list: `.empdrop` is exempt from the document
			   handler, so the menu has to close itself on the way out. */
			onClick={onPick}>
			{glyph}
			{label}
		</a>
	);
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
					{/* Their split button: the whole control adds one person, the caret
					    on the end of it adds many. Drawn as one button and one caret
					    inside a single `.empdrop`. */}
					<span className="empdrop joined">
						<button
							className="embtn pri"
							title="Factor HR's Create Employee — Basic Details, Job Details, Job Organization."
							onClick={() => go({ section: "employees", subtab: "new" })}
						>
							Add New Employee
						</button>
						<button
							className="embtn pri split"
							aria-haspopup="menu"
							aria-expanded={s.empnew}
							aria-label="Import employees"
							title="File, week-off and picture imports"
							onClick={(e) => {
								e.stopPropagation();
								set({ empnew: !s.empnew });
							}}
						>
							▾
						</button>
						<div className="emmenu end" role="menu" aria-label="Import employees" hidden={!s.empnew}>
							{EMP_IMPORTS.map((row) => (
								<ImportItem key={row[0]} row={row} site={s.site}
									onPick={() => set({ empnew: false })} />
							))}
						</div>
					</span>
					{/* Their overflow: the two ways somebody arrives here from another
					    module, and the way this list leaves as a file. Drawn as ⋯ rather
					    than as a fourth worded button because none of the three is the
					    thing this bar is for — Add New Employee is. */}
					<span className="empdrop">
						<button
							className="embtn dots"
							aria-haspopup="menu"
							aria-expanded={s.empmore}
							aria-label="More employee actions"
							title="Import from Onboarding or Recruitment, or export this list"
							onClick={(e) => {
								e.stopPropagation();
								set({ empmore: !s.empmore });
							}}
						>
							⋯
						</button>
						<div className="emmenu end" role="menu" aria-label="More employee actions"
							hidden={!s.empmore}>
							{EMP_MORE.map((row) => (
								<MoreItem key={row[0]} row={row} site={s.site} empty={!all.length}
									onPick={() => set({ empmore: false })}
									/* Their dialog, seeded with what this page is already
									   narrowed to. Department wins the one Filter By their form
									   has; a designation filter set at the same time is named on
									   the dialog rather than dropped without a word. */
									onExport={() => set({
										exp: {
											...EXP_BLANK(),
											open: true,
											status: s.empstatus,
											filterBy: s.empdept ? "department" : s.empdesig ? "designation" : "",
											filterVal: s.empdept || s.empdesig || "",
											carried: s.empdept && s.empdesig ? s.empdesig : "",
										},
									})}
									/* Cleared on the way in, so a screen opened a second time does
									   not come back holding the last run's ticks and its log —
									   those describe candidates that have since been created. */
									onGo={(page) => go({ section: "employees", subtab: page, onb: ONB_BLANK() })} />
							))}
						</div>
					</span>
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
					<label className="text-fine text-ink-2">
						Designation{" "}
						<select value={s.empdesig} onChange={(e) => set({ empdesig: e.target.value })}>
							<option value="">any</option>
							{uniq(all, "designation").map((d) => (
								<option key={d}>{d}</option>
							))}
						</select>
					</label>
					<label className="text-fine text-ink-2">
						Biometric{" "}
						<select value={s.empdev} onChange={(e) => set({ empdev: e.target.value })}>
							<option value="">any</option>
							<option value="yes">enrolled</option>
							<option value="no">phone or nothing</option>
						</select>
					</label>
					<span className="n text-fine text-ink-3">
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
				<div className="cards">
					{rows.slice(0, 300).map((e) => (
						<EmployeeCard key={e.name} e={e} onOpen={() => openEmployee(e.name)} />
					))}
				</div>
			)}

			{s.exp.open ? (
				<ExportEmployees onClose={() => set({ exp: { ...s.exp, open: false } })} />
			) : null}
		</>
	);
}
