import { FH_SHIFTS, FH_SHIFT_CATS, FH_SHIFT_ROWS, FH_SHIFT_SEEN } from "@/data/attendance";
import { Bars, Cols, Gap, Note, NoteBelow, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import { fmt } from "@/lib/format";
import { useApp } from "@/state/store";

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

const DEAD = "This dashboard only reads. Shifts are defined in Factor HR, and on our side as "
	+ "Shift Type documents on the site.";

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

/* Their screen, redrawn — the same shell as Category Type, because it is the
   same product drawing the same kind of master. Every control writes except the
   sort arrows, so every control is dead. */
function ShiftPattern() {
	return (
		<div className="fhcat">
			<header>
				<h3 className="caps">SHIFT &amp; WORK PATTERN</h3>
				<span className="cov part">Their screen, one company</span>
				<span className="right">
					<button className="embtn pri" disabled title={DEAD} aria-label="Add">+</button>
				</span>
			</header>

			<div className="bar3">
				<label className="lbl">
					Show
					<select disabled title={DEAD} aria-label="Entries per page">
						<option>20</option>
					</select>
					entries
				</label>
				{/* The middle control is the whole reason the title has an "&" in it:
				    one screen, two masters, and only the first of them has been seen. */}
				<label className="lbl mid">
					<select disabled aria-label="Master"
						title="Work Pattern is the other half of this screen and has never been opened.">
						<option>Shift</option>
					</select>
				</label>
				<label className="lbl right">
					Search:
					<input type="search" disabled title={DEAD} />
				</label>
			</div>

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
						{FH_SHIFT_ROWS.map((r) => (
							<tr key={r.name} className={r.clipped ? "clip" : undefined}>
								<td><span className="fhname">{r.name}</span></td>
								<Num v={r.cat} />
								<Num v={r.emp} />
								<td className="num" title="Blank on every row seen: no shift here is the default one." />
								<td className="act">
									<span className="fhact" role="img" aria-label="Edit, not available here" title={DEAD}>
										<svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16Z" /></svg>
									</span>
									<span className="fhact" role="img" aria-label="Delete, not available here" title={DEAD}>
										<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot">
				<span className="cnt">
					At least {FH_SHIFT_SEEN} shifts for this one company. <b>The list is clipped</b>, so their
					total is unknown and no count is claimed here.
				</span>
			</div>
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
				<ShiftPattern />
			</div>

			<div className="mt-4">
				<Cols>
					<Panel title="Employee count is zero on every row" cov="none" ico="🔗">
						<Note>
							<b>This is the finding on the screen</b>, and it changes what has to be migrated. Their
							own attendance export names a shift against people — 36 on one, 25 on another — so the
							shifts are in use. Yet <b>EMPLOYEE COUNT is 0 on every row</b> and CATEGORY COUNT is not.
							Both are true only if a person gets their shift <em>through their category</em> rather
							than by being assigned to one.
						</Note>
						<NoteBelow>
							<b>ERPNext works the other way round.</b> A <code>Shift Assignment</code> is per person,
							with dates. There is no category in it at all. So there is <b>no per-person shift column
							to export</b>: it has to be derived — category, then who is in that category, then a row
							each — and the derivation is only as right as the category master is, which is the screen
							one menu up.
						</NoteBelow>
						<div className="mt-[.7rem]">
							<Gap>
								Which category type carries the shift. <b>{FH_SHIFT_CATS} category links</b> are
								visible on this one company and not one of them says what kind of category it is. One
								click on a shift name settles it.
							</Gap>
						</div>
					</Panel>

					<Panel title="Shift names carry the company" cov="part" ico="🏭">
						<Note>
							Every row reads <code>Hi-Tech Pretreads-…</code>. So this page is one company’s, the same
							way employee codes are per-company (§11), and the group’s 23 shifts are these
							seven-or-more repeated across six companies with the prefix changed.
						</Note>
						<NoteBelow>
							Worth copying rather than tidying. ERPNext’s <code>Shift Type</code> has <b>no company
							field</b> — the name is the only thing keeping two companies’ office shifts apart, and
							they do not have the same timings. <b>Drop the prefix and two companies silently share
							one shift window.</b>
						</NoteBelow>
					</Panel>

					<Panel title="Work Pattern is the other half, and it is unseen" cov="none" ico="🔄">
						<Gap>
							Everything behind the second option in that dropdown. The screen is titled{" "}
							<em>Shift &amp; Work Pattern</em> and only Shift has been opened.
						</Gap>
						<NoteBelow>
							A shift is a window. A <b>work pattern is which shift applies on which day</b> — the
							rotation. With <code>12Hrs-1</code> and <code>12Hrs-2</code> sitting on this list, a
							rotation almost certainly exists, and it is the thing that decides whether somebody on
							nights this week is expected at 08:00 or 20:00 next week. ERPNext has no work-pattern
							object: it is Shift Assignment rows, dated, one per person per stretch.{" "}
							<b>Nothing generates them.</b>
						</NoteBelow>
					</Panel>

					<Panel title="The largest four, from the export" cov="part" ico="⏱">
						<Bars pairs={FH_SHIFTS} />
						<NoteBelow>
							<b>23 distinct shifts</b> across 160 active people, recovered from the attendance export
							rather than from this screen. Two names guessed there are now confirmed on it —{" "}
							<em>Cook shift</em> and <em>Other location</em>.
						</NoteBelow>
						<div className="mt-[.7rem]">
							<Gap>
								<b>The two lists do not spell shifts the same way.</b> The export says{" "}
								<code>Hi-Tech Pretreads — Production shift1</code>; the master says{" "}
								<code>Hi-Tech Pretreads-Production shift-12Hrs-1</code>. They may be the same shift
								renamed, or two different ones. Anything mapping on the shift name has to be checked
								against both.
							</Gap>
						</div>
					</Panel>

					<Panel title="The 22- and 24-hour shifts" cov="part" ico="❓">
						<Gap>
							What <code>Production24hr shift</code> and <code>Production22hr shift</code> actually
							mean.
						</Gap>
						<NoteBelow>
							<b>A lead, from this screen.</b> Hi-Tech Pretreads runs{" "}
							<code>Production shift-12Hrs-1</code> and <code>-12Hrs-2</code> — a numbered pair of
							twelve-hour shifts, which is how a plant covers a whole day. That makes it likely the
							hours in a shift name are the <em>shift</em>, not a window, and that a 24-hour name is a{" "}
							<b>pattern covering the day</b> rather than one person’s span. Likely is not settled: it
							still needs walking through, and the answer configures auto-attendance either way.
						</NoteBelow>
					</Panel>

					<Panel title="The one confirmed timing" cov="live" ico="✓">
						<Note>
							From the Daily Attendance Detail report: <b>Manna Treads Office runs 09:30–18:30</b>, and
							a 09:36 punch is recorded as <code>Late Coming By 00:06</code> while the day still counts
							as Full Day. So late is measured <b>to the minute with no grace</b>, and being late does
							not by itself cost the day.
						</Note>
					</Panel>

					<Panel title="Night shifts crossing midnight" cov="none" ico="🌙">
						<Note>
							<b>A trap, not a finding.</b> A night shift belongs to the day it started. Get the Shift
							Type window wrong and a night worker is marked absent two days running. Test it with real
							punches before anybody is paid from it.
						</Note>
						<NoteBelow>
							<code>12Hrs-2</code> on the list above is almost certainly the night half of that pair, so
							this stopped being hypothetical on 28 August.
						</NoteBelow>
					</Panel>

					<Panel title="Nothing on our side yet" cov="none" ico="⚙">
						<Tiles>
							<Tile k="Shift Types here" n={fmt(mine)} cls={mine ? "warn" : "bad"}
								s={mine ? "of 23" : "none defined"} />
							<Tile k="Theirs, one company" n={FH_SHIFT_SEEN + "+"} s="and six companies" />
							<Tile k="Category links" n={FH_SHIFT_CATS} s="carrying the assignment" />
						</Tiles>
						<NoteBelow>
							<b>This is the first blocker, not the last.</b> No punch becomes attendance without a
							shift to measure it against, so every empty cell on Monthly Basic Attendance is waiting
							on this page and not on the bridge.
						</NoteBelow>
					</Panel>
				</Cols>
			</div>
		</>
	);
}
