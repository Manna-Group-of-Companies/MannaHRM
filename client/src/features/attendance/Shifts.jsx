import { set, useApp } from "@/store";
import { dmy, fmt, tidyDept } from "@/lib/format";
import { Desk, Empty, Gap, Scroll, Tile, Tiles } from "@/components/ui";
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

/* A shift is a document on the site — `Shift Type` — so Add and the two row
   actions open it there. Every row here is one, so neither action can be dead
   any more: the case they used to guard against was a row we did not hold, and
   there are none of those left.

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
		return <Empty title="reading the roster…">Shift Assignment, once — not on every page load.</Empty>;
	}
	if (s.shAssignState !== "ok") {
		return (
			<div className="p-[.9rem]">
				<Gap>
					<b>The roster could not be read.</b> {s.shAssignState}. Which is not the same as nobody
					being rostered — the two look identical on a screen and mean opposite things, so this page
					will not claim either until the read answers.
				</Gap>
			</div>
		);
	}

	return (
		<>
			<div className="p-[.9rem]">
				<Tiles>
					<Tile k="Rostered" n={fmt(assigned.size)} cls={assigned.size ? "good" : "bad"}
						s="have a dated Shift Assignment" />
					<Tile k="Default shift only" n={fmt(onDefault.length)} cls={onDefault.length ? "warn" : ""}
						s="a fallback on the record" />
					<Tile k="Neither" n={fmt(neither.length)} cls={neither.length ? "bad" : "good"}
						s="nothing to measure a punch against" />
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
				<Scroll>
					<table>
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
											<Desk className="fhact on" label="Edit"
												href={s.site && deskUrl(s.site, "Shift Assignment", r.name)}
												title="Open this assignment on the ERPNext site.">
												<svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16Z" /></svg>
											</Desk>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</Scroll>
			) : (
				<Empty title="Nobody is rostered">
					<code>Shift Assignment</code> is empty for everybody in scope. Nothing here is broken — it
					is the state of the site, and it is the work the Shift half of this screen is counting.
				</Empty>
			)}

			<div className="fhfoot">
				<span className="cnt">
					{rows.length
						? `Showing ${fmt(shown.length)} of ${fmt(rows.length)} assignments`
						: q ? `Nothing matches “${s.shq}”, out of ${fmt(all.length)}.` : ""}
					{" "}Ours, not theirs: their Work Pattern has never been opened.
				</span>
			</div>
		</>
	);
}

/* Their screen, redrawn — the same shell as Category Type, because it is the
   same product drawing the same kind of master. Show, Search and the sort
   arrows act on this table, so they work here; Add and the row actions act on a
   Shift Type, so they open it on the site. */
function ShiftPattern({ s }) {
	const pattern = s.shMaster === "pattern";
	const q = (s.shq || "").trim().toLowerCase();
	const per = s.shper || 20;
	const matched = q
		? s.shiftTypes.filter((r) => (r.name || "").toLowerCase().includes(q))
		: s.shiftTypes;
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
		<div className="fhcat">
			<header>
				<h3 className="caps">SHIFT &amp; WORK PATTERN</h3>
				<span className="cov part">Their screen, our data</span>
				<span className="right">
					{/* Add makes whichever master is being shown — the two halves of this
					    screen are two doctypes, and one + that always made a Shift Type
					    would be wrong half the time. */}
					<Desk className="embtn pri" label="Add"
						href={s.site && deskNew(s.site, pattern ? "Shift Assignment" : "Shift Type")}
						title={pattern
							? "Roster somebody on the ERPNext site — a dated Shift Assignment, which is what a punch is actually measured against."
							: "Define a Shift Type on the ERPNext site. Nothing generates attendance until these exist — a shift is what a punch is measured against."}>+</Desk>
				</span>
			</header>

			<div className="bar3">
				<label className="lbl">
					Show
					<select aria-label="Entries per page" value={per}
						onChange={(e) => set({ shper: Number(e.target.value) })}>
						{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
					</select>
					entries
				</label>
				{/* The middle control is the whole reason the title has an "&" in it:
				    one screen, two masters, and only the first of them has been seen. */}
				{/* The middle control is the whole reason the title has an "&" in it:
				    one screen, two masters. Theirs has never been opened, so the second
				    half is ours — the roster, which is the same question asked our way. */}
				<label className="lbl mid">
					<select value={s.shMaster} aria-label="Master"
						title="Their Work Pattern has never been screenshotted open, so what is under it here is ours: the Shift Assignment rows — who is measured against which shift, between which dates."
						onChange={(e) => set({ shMaster: e.target.value, shq: "" })}>
						<option value="shift">Shift</option>
						<option value="pattern">Work Pattern</option>
					</select>
				</label>
				<label className="lbl right">
					Search:
					<input type="search" value={s.shq} aria-label="Search shifts"
						onChange={(e) => set({ shq: e.target.value })} />
				</label>
			</div>

			{/* The read that fills the table is part of the load in `api/load.js`, so
			    it has answered by the time anybody is here: an empty list is the site
			    saying it holds none, not a read that has not happened. The cause is not
			    asserted — `hrms` being absent is the likely one and a session that may
			    not read the doctype is another, and the two are not distinguishable
			    from here. */}
			{pattern ? <WorkPattern s={s} /> : !s.shiftTypes.length ? (
				<Empty title="This site holds no shifts">
					<code>Shift Type</code> came back empty. Until a shift exists there is nothing for a punch
					to be measured against, so nothing generates attendance and every day reads as absence —
					which makes this the first thing that has to change. The doctype arrives with
					<code> hrms</code>, and docs/SITE_SURVEY.md records that as not installed.
				</Empty>
			) : (
			<>
			<Scroll>
				<table>
					<thead>
						<tr>
							{["NAME", "EMPLOYEE COUNT", "ACTION"].map((h, i) => (
								<th key={h} className={i ? "num" : undefined}>
									{h} <span className="sort">⇵</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.name}>
								<td><span className="fhname">{r.name}</span></td>
								{/* Their CATEGORY COUNT and IS DEFAULT columns are not drawn: a
								    category is not how anybody is put on a shift here, and no
								    field on Shift Type says one of them is the default. A column
								    of dashes would read as data nobody has filled in. */}
								<td className={"num" + (byShift[r.name] ? "" : " zero")}
									title="Active employees whose own record names this as their default shift. A fallback, not a roster — Work Pattern is the roster.">
									{fmt(byShift[r.name] || 0)}
								</td>
								<td className="act">
									{/* ✎ opens Factor HR's own three-step shift form — photographed
									    4 Sep 2026 — over this document, so the window and its
									    tolerances are read and shown in their layout rather than
									    the desk's. See ShiftWizard.jsx.

									    Delete is the site's own, and is deliberately not one click
									    from here: a shift removed under a roster is a day nobody is
									    measured against. */}
									<button className="fhact on" aria-label="Edit"
										title="Factor HR's shift form — a name and a kind, then the window and its tolerances, then grace timings. The document itself is made on the ERPNext site; nothing here writes."
										onClick={() => openShiftWizard(r.name)}>
										<svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16Z" /></svg>
									</button>
									<Desk className="fhact on" label="Delete"
										href={s.site && deskUrl(s.site, "Shift Type", r.name)}
										title="Open this Shift Type on the ERPNext site, where Menu → Delete removes it.">
										<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
									</Desk>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot">
				<span className="cnt">
					{q && !matched.length
						? `Nothing matches “${s.shq}”, out of ${fmt(s.shiftTypes.length)} on this site.`
						: `Showing ${fmt(rows.length)} of ${fmt(matched.length)} shifts` + (q ? " matching." : " on this site.")}
				</span>
			</div>
			</>
			)}

			{s.shw.open ? (
				<ShiftWizard onClose={() => set({ shw: { ...s.shw, open: false } })} />
			) : null}
		</div>
	);
}

export default function Shifts() {
	const s = useApp();
	const mine = s.counts.shift || 0;

	return (
		<>
			<div className="legend">
				<b className="font-display">Manage Shift</b>
				{/* Their 23 was a count off a screenshot of one company's page, and a
				    denominator nothing here could ever reach. What is defined is what
				    the site answered with. */}
				<span className={"cov " + (mine ? "part" : "none")}>
					{mine ? `${fmt(mine)} defined` : "none defined"}
				</span>
				<span>
					Nothing can generate attendance until these are stated — a shift is what a punch is measured
					against.
				</span>
			</div>

			<div className="mt-[.8rem]">
				<ShiftPattern s={s} />
			</div>

			<div className="mt-[1rem]">
			</div>
		</>
	);
}
