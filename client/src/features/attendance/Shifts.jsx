import { set, useApp } from "@/store";
import { dmy, fmt, tidyDept } from "@/lib/format";
import { FH_SHIFT_ROWS, FH_SHIFT_SEEN } from "@/data/attendance";
import { Desk, Empty, Gap, Note, Scroll, Tile, Tiles } from "@/components/ui";
import { deskNew, deskUrl } from "@/lib/desk";
import { scoped } from "@/lib/scope";

/* SHIFT & WORK PATTERN, photographed 28 August 2026 — Hi-Tech Pretreads only,
   because the names are company-prefixed and this is one company's page.

   `cat` is their CATEGORY COUNT, `emp` their EMPLOYEE COUNT. Both are copied
   exactly, and the second one is the finding: it is zero on every row of a
   tenant whose own attendance export names a shift against all 160 people. So
   the assignment is not stored against the person here — it comes down the
   category, which is the master photographed one menu up.

   The last row is clipped by the bottom of the capture: the name is legible and
   the two counts are not, so they are null and are drawn as such. A number
   guessed off a half-visible row would be indistinguishable from one that was
   read, and this table is the evidence for the paragraph above. */

/* A shift is a document on the site — `Shift Type` — so Add and the two row
   actions open it there. The row actions can only do that for a shift that
   exists on our side, and on a site with none of them yet that is every row;
   they say which it is rather than looking broken.

   Work Pattern is the other half of their screen and has never been opened, so
   that one control stays dead. Nothing is invented in its place. */
const NOT_OURS = "This is Factor HR's shift, and no Shift Type of that name exists on our site yet — "
	+ "which is what the count in the heading is about. Add it with + and this opens it.";

/** A count that may not have been readable. Clipped is drawn as a dash with the
    reason on it rather than as a zero — the two mean opposite things here. */
function Num({ v }) {
	if (v === null) {
		return (
			<td className="num clip" title="Clipped by the bottom of the capture — not read">—</td>
		);
	}
	return <td className={"num" + (v ? "" : " zero")}>{v}</td>;
}

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
					) : (
						<Note>
							Everybody in scope has a shift, by assignment or by default on the record. That is the
							check that stops a punch arriving with nothing to measure it against.
						</Note>
					)}
				</div>

				{onDefault.length ? (
					<div className="mt-[.7rem]">
						<Note>
							{fmt(onDefault.length)} are on <code>default_shift</code> alone. It is a fallback rather
							than a roster: it has no dates, so a shift that changes in March cannot be said in it,
							and the change has to be remembered by whoever edits the record.
						</Note>
					</div>
				) : null}
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
	const matched = q ? FH_SHIFT_ROWS.filter((r) => r.name.toLowerCase().includes(q)) : FH_SHIFT_ROWS;
	const rows = matched.slice(0, per);
	/* Which of their shifts we actually hold. A name match is the only link there
	   is between the two lists, and it is worth having: it turns "23 defined
	   somewhere" into "this row, yes; that row, not yet". */
	const ours = new Set(s.shiftTypes.map((x) => x.name));

	return (
		<div className="fhcat">
			<header>
				<h3 className="caps">SHIFT &amp; WORK PATTERN</h3>
				<span className="cov part">Their screen, one company</span>
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

			{pattern ? <WorkPattern s={s} /> : (
			<>
			<Scroll>
				<table>
					<thead>
						<tr>
							{["NAME", "CATEGORY COUNT", "EMPLOYEE COUNT", "IS DEFAULT", "ACTION"].map((h, i) => (
								<th key={h} className={i ? "num" : undefined}>
									{h} <span className="sort">⇵</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.name} className={r.clipped ? "clip" : undefined}>
								<td><span className="fhname">{r.name}</span></td>
								<Num v={r.cat} />
								<Num v={r.emp} />
								<td className="num" title="Blank on every row seen: no shift here is the default one." />
								<td className="act">
									{/* Both open the same document. Delete is Menu → Delete once it is
									    open, which is deliberately not one click from here: a shift
									    removed under a roster is a day nobody is measured against. */}
									<Desk className={ours.has(r.name) ? "fhact on" : "fhact"} label="Edit"
										href={s.site && ours.has(r.name) && deskUrl(s.site, "Shift Type", r.name)}
										title="Open this Shift Type on the ERPNext site."
										dead={ours.has(r.name) ? undefined : NOT_OURS}>
										<svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16Z" /></svg>
									</Desk>
									<Desk className={ours.has(r.name) ? "fhact on" : "fhact"} label="Delete"
										href={s.site && ours.has(r.name) && deskUrl(s.site, "Shift Type", r.name)}
										title="Open this Shift Type on the ERPNext site, where Menu → Delete removes it."
										dead={ours.has(r.name) ? undefined : NOT_OURS}>
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
					{q || rows.length < matched.length
						? `Showing ${rows.length} of ${matched.length} matching rows.`
						: null}{" "}
					At least {FH_SHIFT_SEEN} shifts for this one company. <b>The list is clipped</b>, so their
					total is unknown and no count is claimed here.
				</span>
			</div>
			</>
			)}
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
				<span className="cov none">{fmt(mine)} of 23 defined</span>
				<span>
					Nothing can generate attendance until these are stated — a shift is what a punch is measured
					against.
				</span>
			</div>

			<div className="mt-[.8rem]">
				<ShiftPattern s={s} />
			</div>

			<div className="mt-4">
			</div>
		</>
	);
}
