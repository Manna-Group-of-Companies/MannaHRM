import { useState } from "react";
import { set, useApp } from "@/store";
import AssignShift from "@/features/attendance/AssignShift";
import { dmy, fmt, tidyDept } from "@/lib/format";
import { Desk, Empty, Gap, Tile, Tiles } from "@/components/ui";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, Seg } from "@/components/kit/ui";
import { deskNew, deskUrl } from "@/lib/desk";
import { active, scoped } from "@/lib/scope";
import ShiftWizard, { openShiftWizard } from "@/features/attendance/ShiftWizard";

/* SHIFT & WORK PATTERN — Factor HR's screen, over what this site holds.

   This table used to list seven shifts of Hi-Tech Pretreads', transcribed off a
   capture of their page, with a CATEGORY COUNT and an EMPLOYEE COUNT beside
   each that were their numbers and could not be checked against anything. The
   rows and both columns are gone. What is listed is `Shift Type` documents on
   the site, and an empty table is the honest answer on a site that holds none —
   which is the answer today, because `hrms` is not installed and the doctype is
   not there to hold one. See docs/SITE_SURVEY.md. What those seven rows
   actually established is in docs/FACTOHR.md §4a.

   EMPLOYEE COUNT is `default_shift` off the active employee list this dashboard
   already has, so it costs no read. It is a fallback on the record and not a
   roster: who is measured against which shift, between which dates, is `Shift
   Assignment` — the Work Pattern half, read only when somebody asks for that
   half, because the site has a daily compute limit. */

/* A shift is a document on the site — `Shift Type`. Add and ✎ open Factor HR's
   own shift form over it, and its Save writes the document (api/shifttype.js);
   Delete still opens it on the desk, because a shift removed under a roster is
   a day nobody is measured against.

   Work Pattern is the other half of their screen and has never been opened, so
   what is under it is ours. Nothing is invented in its place. */

/* ---------------------------------------------------------------------------
   Work Pattern — the other half of their screen, and the half nobody has ever
   opened. So what is under it is ours rather than theirs, and it is the same
   question asked our way: **who is measured against which shift, between which
   dates**. On our side that is `Shift Assignment`; on theirs it comes down the
   category, which is the finding the Shift half of this screen is about.

   Read once, the first time somebody selects it — see loadShiftAssignments().
   An empty answer is a real answer here and is drawn as one: nothing rostered
   means nothing can be generated from a punch, and that is a readiness gap
   rather than a blank table.
   --------------------------------------------------------------------------- */
function WorkPattern({ s }) {
	const q = (s.shq || "").trim().toLowerCase();
	const per = s.shper || 20;

	/* Scoped like every other page: the company selector in the top bar has to
	   mean the same thing here as it does on the master. An assignment whose
	   employee is not in scope is somebody else's row. */
	const mine = new Set(scoped(s).map((e) => e.name));
	const all = s.shAssign.filter((r) => mine.has(r.employee));
	const rows = q
		? all.filter((r) => `${r.employee_name || ""} ${r.employee} ${r.shift_type || ""}`
			.toLowerCase().includes(q))
		: all;
	const shown = rows.slice(0, per);

	/* The three ways a person can be measured, and only the first is a roster.
	   `default_shift` is a fallback on the record, not a dated assignment, so a
	   night shift that changes in March cannot be expressed in it at all. */
	const people = scoped(s);
	const assigned = new Set(all.map((r) => r.employee));
	const onDefault = people.filter((e) => !assigned.has(e.name) && e.default_shift);
	const neither = people.filter((e) => !assigned.has(e.name) && !e.default_shift);

	if (s.shAssignState === "loading" || !s.shAssignState) {
		return <Empty title="reading the roster…" />;
	}
	if (s.shAssignState !== "ok") {
		return (
			<div className="p-[.9rem]">
				<Gap>
					<b>The roster could not be read.</b> {s.shAssignState}.
				</Gap>
			</div>
		);
	}

	return (
		<>
			<div className="p-[.9rem]">
				<Tiles>
					<Tile k="Rostered" n={fmt(assigned.size)} cls={assigned.size ? "good" : "bad"} />
					<Tile k="Default shift only" n={fmt(onDefault.length)} cls={onDefault.length ? "warn" : ""} />
					<Tile k="Neither" n={fmt(neither.length)} cls={neither.length ? "bad" : "good"} />
				</Tiles>

				<div className="mt-[.7rem]">
					{neither.length ? (
						<Gap>
							<b>{fmt(neither.length)} people have no shift at all</b> — no assignment and no default on
							the record. A punch from any of them has nothing to be measured against, so it
							generates no attendance and the day reads as absence. This is the number that has to
							reach zero before anybody is paid from this system.
						</Gap>
					) : null}
				</div>

			</div>

			{all.length ? (
				<div className="k-tbl-wrap">
					<table className="k-rt">
						<thead>
							<tr>
								<th>Employee</th><th>Department</th><th>Shift</th><th>From</th><th>To</th>
								<th>Status</th><th className="act">Action</th>
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => {
								const who = s.byName[r.employee];
								return (
									<tr key={r.name}>
										<td>{r.employee_name || who?.employee_name || r.employee}</td>
										<td className="muted">{tidyDept(who?.department)}</td>
										<td><span className="fhname">{r.shift_type || "—"}</span></td>
										<td className="mono">{r.start_date ? dmy(r.start_date) : "—"}</td>
										{/* Open-ended is the normal case, not a gap — an assignment with
										    no end runs until another one replaces it. */}
										<td className="mono muted">
											{r.end_date ? dmy(r.end_date)
												: <span title="Open-ended — runs until another assignment replaces it.">ongoing</span>}
										</td>
										<td>{r.status || "—"}</td>
										<td className="act">
											<Desk className="k-btn k-btn-line k-btn-sm" label={`Edit the assignment of ${r.employee_name || r.employee} on the site`}
												href={s.site && deskUrl(s.site, "Shift Assignment", r.name)}
												title="Open this assignment on the ERPNext site.">
												<KitIcon name="edit" size={14} stroke={2} />
											</Desk>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : (
				<Empty title="Nobody is rostered">
					<code>Shift Assignment</code> is empty for everybody in scope.
				</Empty>
			)}

			<div className="k-muted" style={{ fontSize: 13, marginTop: 12 }}>
				<span>
					{rows.length
						? `Showing ${fmt(shown.length)} of ${fmt(rows.length)} assignments`
						: q ? `Nothing matches “${s.shq}”, out of ${fmt(all.length)}.` : ""}
				</span>
			</div>
		</>
	);
}

/* Settings → Manage Shift, drawn as Work schedules is (21 October 2026, asked
   for by HR): one card, a row a shift — the clock, its name, how many people
   fall back to it — and Edit beside it. Search, the page size and the
   Shift / Work Pattern switch act on the list as before; New shift and Edit
   open the shift form, which saves to the site. */
function ShiftPattern({ s }) {
	const pattern = s.shMaster === "pattern";
	/* Assign shift (16 October 2026): several people at once. */
	const [assigning, setAssigning] = useState(false);
	const q = (s.shq || "").trim().toLowerCase();
	const per = s.shper || 20;
	/* Under a company in the top bar, that company's shifts and the ones left
	   blank — blank is "any company may use it", not somebody else's. */
	const coCol = s.shiftCo === true;
	const inScope = coCol && s.company
		? s.shiftTypes.filter((r) => !r.company || r.company === s.company)
		: s.shiftTypes;
	const matched = q
		? inScope.filter((r) => `${r.name || ""} ${r.company || ""}`.toLowerCase().includes(q))
		: inScope;
	const rows = matched.slice(0, per);
	/* How many people fall back to each shift, off the employee list that is
	   already in hand. Scoped like every other page, so the number under a
	   company selector is that company's, and `active` rather than `scoped`:
	   somebody who has left still carries a default shift on their record, and
	   counting them here would say a shift is worked by more people than turn up
	   to it. 344 people have left this group. */
	const byShift = {};
	for (const e of active(s)) {
		if (e.default_shift) byShift[e.default_shift] = (byShift[e.default_shift] || 0) + 1;
	}

	return (
		<div className="k-card">
			<div className="k-sec-h">
				<h3>Manage Shift</h3>
				<span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{s.shiftTypes.length ? (
						<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => setAssigning(true)}>
							<KitIcon name="users" size={14} stroke={2} />Assign shift
						</button>
					) : null}
					{/* New makes whichever master is being shown — the two halves of
					    this page are two doctypes. A Shift Type is made here, in the
					    shift form; a Shift Assignment is still made on the desk. */}
					{pattern ? (
						<Desk className="k-btn k-btn-ink k-btn-sm" label="Roster on the site"
							href={s.site && deskNew(s.site, "Shift Assignment")}
							title="A dated Shift Assignment on the ERPNext site — what a punch is actually measured against.">
							<KitIcon name="plus" size={14} stroke={2} />Roster on the site
						</Desk>
					) : (
						<button type="button" className="k-btn k-btn-ink k-btn-sm" aria-label="New shift"
							onClick={() => openShiftWizard()}>
							<KitIcon name="plus" size={14} stroke={2} />New shift
						</button>
					)}
				</span>
			</div>

			<div className="k-card-h" style={{ margin: "0 0 4px" }}>
				<Seg label="Shifts or roster" value={pattern ? "pattern" : "shift"}
					options={[["shift", "Shifts"], ["pattern", "Work Pattern"]]}
					onChange={(v) => set({ shMaster: v, shq: "" })} />
				<span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<div className="k-inp-ic" style={{ minWidth: 220 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" type="search" placeholder="Search" value={s.shq} aria-label="Search shifts"
							onChange={(e) => set({ shq: e.target.value })} />
					</div>
					<select className="k-sel" aria-label="Entries per page" value={per} style={{ width: "auto" }}
						onChange={(e) => set({ shper: Number(e.target.value) })}>
						{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} a page</option>)}
					</select>
				</span>
			</div>

			{/* The read that fills the list is part of the load in `api/load.js`, so
			    it has answered by the time anybody is here: an empty list is the site
			    saying it holds none, not a read that has not happened. */}
			{pattern ? <WorkPattern s={s} /> : !s.shiftTypes.length ? (
				<EmptyState icon="clock" title="No shifts yet" sub="" />
			) : (
				<>
					{rows.map((r) => (
						<div className="k-list-row" key={r.name}>
							<span className="k-icon-sq"><KitIcon name="clock" size={18} stroke={2} /></span>
							{/* Active people whose own record names this as their default
							    shift: a fallback, not a roster — Work Pattern is the roster. */}
							<div className="k-grow">
								<b>{r.name}</b>
								<small>
									{fmt(byShift[r.name] || 0)} people on it by default
									{coCol ? ` · ${r.company || "any company"}` : ""}
								</small>
							</div>
							<button type="button" className="k-btn k-btn-line k-btn-sm" aria-label={`Edit ${r.name}`}
								onClick={() => openShiftWizard(r.name)}>
								<KitIcon name="edit" size={14} stroke={2} />Edit
							</button>
							{/* Delete is the site's own, and is deliberately not one click
							    from here: a shift removed under a roster is a day nobody is
							    measured against. */}
							<Desk className="k-btn k-btn-line k-btn-sm" label={`Delete ${r.name} on the site`}
								href={s.site && deskUrl(s.site, "Shift Type", r.name)}
								title="Open this Shift Type on the ERPNext site, where Menu → Delete removes it.">
								<KitIcon name="trash" size={14} stroke={2} />
							</Desk>
						</div>
					))}
					{q && !matched.length ? <EmptyState icon="search" title={`Nothing matches “${s.shq}”`} sub="" /> : null}
					<p className="k-muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
						{q && !matched.length
							? `Out of ${fmt(s.shiftTypes.length)} on this site.`
							: `Showing ${fmt(rows.length)} of ${fmt(matched.length)} shifts` + (q ? " matching." : " on this site.")}
					</p>
				</>
			)}

			{s.shw.open ? (
				<ShiftWizard onClose={() => set({ shw: { ...s.shw, open: false } })} />
			) : null}
			{assigning ? <AssignShift onClose={() => setAssigning(false)} /> : null}
		</div>
	);
}

export default function Shifts() {
	const s = useApp();

	return (
		<>
			<ShiftPattern s={s} />
		</>
	);
}
