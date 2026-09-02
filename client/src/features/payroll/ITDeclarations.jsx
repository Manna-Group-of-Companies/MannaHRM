import { getState, patch, set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept } from "@/lib/format";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { Cols, Desk, Empty, Gap, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { fyOf } from "@/data/payroll";

import { NotReadable, PayLegend } from "./shared";

/* IT DECLARATIONS, photographed 29 August 2026 and drawn here control for
   control: one bar — the status dot, Search Employee, and a Select Options list
   — then the IT DECLARATION HISTORY heading with two file icons pinned to its
   right edge, and under it a table of three columns, FINANCIAL YEAR, TOTAL
   INVESTMENT and ACTION, with no rows in it.

   **Their table is empty because nobody is picked.** This is one of their
   one-person-at-a-time screens, like Salary Master and Adhoc Payments, and that
   is the model being reproduced rather than a report of everybody at once. The
   emptiness is copied honestly: nothing is invented to fill it, and once
   somebody *is* picked it stays empty for a different reason, which the row
   says.

   The finding this page exists for is not on the screen at all. §27 of
   docs/FACTOHR_SCREENS.md put it in one line: **PAN is on 2 of 504 people, so
   IT Declarations is a collection exercise before it is a build.** No PAN means
   no TDS computation and a flat 20% under §206AA, which lands on the person
   rather than on the employer. That check is offered below, live, behind a
   button — it costs a read and this screen has no Generate to hang one on. */

/** One of the two icons on their history bar. Same control as Adhoc's and
    Salary Master's, kept local for the same reason theirs are: this is a
    different bar with a different set of jobs on it. */
function TitleIcon({ path, label, title, href, onClick }) {
	const ico = (
		<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
	if (href !== undefined) {
		return <Desk className="embtn" href={href} label={label} title={title}>{ico}</Desk>;
	}
	return (
		<button className="embtn" disabled={!onClick} title={title} aria-label={label} onClick={onClick}>
			{ico}
		</button>
	);
}

/* The same coloured dot as Employee Master, Regularization and Adhoc, because
   it is the same control on their screen. Its own selection, though: a filter
   set on one screen is not a filter set on another, and sharing them would
   silently hide people here. Blue — All — is how the capture found it. */
function ItdDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.itd.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.itd.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("itd", { menu: !s.itd.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.itd.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.itd.status}
						onClick={(e) => { e.stopPropagation(); patch("itd", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** A person, as the picker draws them — the same row shape as Adhoc's and
    Salary Master's, because it is the same choice being made. */
const PickRow = ({ e }) => (
	<button onClick={() => patch("itd", { emp: e.name, q: "" })}>
		<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
		<b>{e.employee_name}</b>
		<span className="mono">{e.employee_number || "—"}</span>
		<span className="muted">{tidyDept(e.department)}</span>
	</button>
);

/* Factor HR fills Pan No for all 504 rows and 502 of them read PANNOTAVBL,
   which is their placeholder for "none on record" — docs/FACTOHR_SCREENS.md
   §11. Anything that counts PANs has to know that, or it counts 504 and reports
   that the problem is solved. Matched loosely because a placeholder typed by
   hand into a few hundred rows is a placeholder somebody has spaced or cased
   differently at least once. */
const NOT_A_PAN = /^\s*(pannotavbl|na|n\/a|nil|none|-+)?\s*$/i;
const hasPan = (v) => !NOT_A_PAN.test(String(v || ""));

/** One read, once, and only when somebody asks: whether a real PAN exists
    against these people. A refusal is an answer rather than an error — "the
    field is not on this site" is exactly what a readiness check wants to
    know. */
async function panProbe() {
	if (getState().itdPanState) return;
	set({ itdPanState: "loading" });
	const rows = await listAll("Employee", ["name", "custom_pan_no"]).catch(() => null);
	set(rows
		? { itdPan: Object.fromEntries(rows.map((r) => [r.name, r.custom_pan_no || ""])), itdPanState: "ok" }
		: { itdPan: null, itdPanState: "absent" });
}

/** The PAN readiness panel. Its whole job is to turn §27's one line into a
    number somebody can act on, for the people actually in scope. */
function PanPanel({ s }) {
	const people = scoped(s);
	const st = s.itdPanState;
	const held = st === "ok" ? people.filter((e) => hasPan((s.itdPan || {})[e.name])) : [];
	const cov = st !== "ok" ? "skip" : held.length === people.length ? "live" : held.length ? "part" : "none";

	return (
		<Panel title="PAN, which comes before any of this" cov={cov} ico="🪪">
			{st === "ok" ? (
				<div className="rows">
					<div className="row">
						<span>People in scope</span>
						<span className="val">{fmt(people.length)}</span>
					</div>
					<div className="row">
						<span>Carrying a real PAN</span>
						<span className="val">
							<span className={"cov " + (held.length ? "part" : "none")}>{fmt(held.length)}</span>
						</span>
					</div>
					<div className="row">
						<span>Carrying <code>PANNOTAVBL</code>, blank, or nothing</span>
						<span className="val">{fmt(people.length - held.length)}</span>
					</div>
				</div>
			) : (
				<>
					<p className="muted">
						{st === "loading" ? "Reading…" : st === "absent"
							? "The read was refused, or `custom_pan_no` is not a field on this site. Either way "
								+ "nothing here holds a PAN, which is the same answer for this page."
							: "Not read yet. It is one request against Employee, and this screen has no Generate "
								+ "to hang it on — so it is asked for rather than taken."}
					</p>
					{st !== "ok" && st !== "loading" && (
						<button className="btn imp mt-[.6rem]" onClick={() => void panProbe()}>
							▤ Check PAN coverage
						</button>
					)}
				</>
			)}
			<NoteBelow>
				<b>No PAN, no TDS computation — and a flat 20% under §206AA</b>, which comes out of the
				person&rsquo;s pay rather than the employer&rsquo;s. A declaration screen is worth nothing
				until this number is close to the headcount, which is why §27 calls IT Declarations a
				collection exercise before it is a build. <code>PANNOTAVBL</code> counts as no PAN here:
				it is Factor HR&rsquo;s placeholder for &ldquo;none on record&rdquo;, it was filled on 502
				of their 504 rows, and anything that counts it as a PAN reports that the problem is
				solved.
			</NoteBelow>
		</Panel>
	);
}

export default function ITDeclarations() {
	const s = useApp();
	const a = s.itd;
	const emp = a.emp ? s.byName[a.emp] : null;
	const q = (a.q || "").trim().toLowerCase();

	const pool = a.status ? scoped(s).filter((e) => e.status === a.status) : scoped(s);
	const matches = q
		? pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	const pan = emp && s.itdPanState === "ok" ? (s.itdPan || {})[emp.name] : null;

	return (
		<>
			<PayLegend what="IT Declarations">
				What somebody claims against tax, and what they later produce for it. Frappe HR ships both
				halves and an Income Tax Slab to compute against. Theirs is drawn below as photographed;{" "}
				<b>no declaration exists on this site for anybody.</b>
			</PayLegend>

			<div className="fhscreen">
				<div className="embar itdbar">
					<ItdDot s={s} />

					<span className="find rev">
						<input type="search" placeholder="Search Employee" aria-label="Search employee"
							value={a.q || ""} onChange={(e) => patch("itd", { q: e.target.value })} />
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
							strokeWidth="1.8" strokeLinecap="round">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.6-3.6" />
						</svg>
					</span>

					{/* Their second control, and the capture caught it closed on its own
					    placeholder. A select filled with plausible options would be a list
					    nobody has seen — and there is nothing under it to filter either
					    way, so it is drawn as found and disabled. */}
					<span className="adf">
						<label htmlFor="itdopt" className="sr-only">Select Options</label>
						<select id="itdopt" className="wide" disabled value="" onChange={() => {}}
							title="Empty in the capture and never opened. What it offers is unknown and nothing is invented in its place — and there is no declaration on this side for it to narrow.">
							<option value="">Select Options</option>
						</select>
					</span>
				</div>

				{/* Their search box opens the picker under itself. Ours says how many
				    people it searched, because the dot can empty it and a search that
				    finds nobody should say which filter did that. */}
				{!emp && q ? (
					<div className="regfind">
						{matches.length ? (
							matches.map((e) => <PickRow key={e.name} e={e} />)
						) : (
							<span className="none">
								Nobody matches, out of {fmt(pool.length)} searched
								{a.status ? ` · status ${a.status}` : ""}
							</span>
						)}
					</div>
				) : null}

				{emp ? (
					<div className="regwho">
						<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
						<b>{emp.employee_name}</b>
						<span className="mono">{emp.employee_number || "—"}</span>
						<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
						{/* Their screen carries no PAN. It is shown here when it has been
						    read, because it is the one field that decides whether a
						    declaration from this person can be used at all. */}
						<span className="n">
							{s.itdPanState === "ok"
								? hasPan(pan) ? `PAN ${pan}` : "no PAN on record"
								: "no declarations — none exist for anybody"}
						</span>
						<button className="embtn" onClick={() => patch("itd", { emp: "", q: "" })}>Clear</button>
					</div>
				) : null}

				<div className="fhtitle row">
					IT Declaration History
					<span className="ics">
						{/* Two file icons, and **their labels were not captured** — no tooltip
						    was opened and neither was clicked. Both glyphs are upward arrows,
						    so both are a file going in; which of them takes the declaration
						    form and which takes the proof is not resolvable from the picture,
						    and is not guessed at here. They are drawn as they look and dead,
						    with the import that would actually do this job linked below where
						    it can be labelled honestly. */}
						<TitleIcon path="M12 16V4M7 9l5-5 5 5M4 20h16" label="Upload"
							title="Their first icon. The glyph is an upload; its label was not captured and neither icon was opened, so what it uploads is unknown. Nothing on this page writes — the Data Import that would load declarations is linked below." />
						<TitleIcon path="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5M12 18v-6M9.6 14.4L12 12l2.4 2.4"
							label="Upload document"
							title="Their second icon. A document with an upward arrow in it — again a file going in, again unlabelled in the capture. Proof submission is the half of this that arrives as documents, but the picture does not say so and this page will not either." />
					</span>
				</div>

				<Scroll>
					<table className="itd">
						<thead>
							<tr>
								<th>Financial Year</th>
								<th className="amt">Total Investment</th>
								<th className="act">Action</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td colSpan={3} className="none">
									{emp ? (
										<>
											No declaration for {emp.employee_name}, and none for anybody else either:{" "}
											<code>Employee Tax Exemption Declaration</code> holds no rows on this site,
											payroll is deferred, and no payroll doctype is on the proxy&rsquo;s
											allowlist. The financial year this would sit under is <b>{fyOf()}</b>.
										</>
									) : (
										<>
											Nobody is picked — and their table is empty in the capture for the same
											reason. This screen is one person at a time. The picker above is live
											because <code>Employee</code> is: {fmt(pool.length)} people are in scope
											for it.
										</>
									)}
								</td>
							</tr>
						</tbody>
					</table>
				</Scroll>
			</div>

			<div className="mt-4">
				<Note>
					<b>Their one row per financial year is two documents here.</b>{" "}
					<code>Employee Tax Exemption Declaration</code> is what somebody claims, made at the top
					of the year; <code>Employee Tax Exemption Proof Submission</code> is what they produce
					for it, months later, against the same year. Their history table shows one line and an
					ACTION, which hides that this has two deadlines and two states — declared, and proved —
					and that the second one is the one payroll has to compute from.
				</Note>

				<div className="mt-[.7rem]">
					<Gap>
						<b>TOTAL INVESTMENT is a sum, and the things it sums do not exist yet.</b> A
						declaration on our side is a parent document with a child row per exemption category,
						each pointing at an <code>Employee Tax Exemption Sub Category</code> — 80C, 80D, the
						HRA heads — and the total is the sum of those rows. Those masters have to be created
						before anybody can declare anything. The mechanism ships and the master does not,
						which is the same shape as the Prof. Tax slab finding one tab over.
					</Gap>
				</div>

				<div className="mt-[.7rem]">
					<Gap>
						<b>Which tax regime the group is on decides whether this screen matters at all.</b> A
						declaration only buys anything under the old regime; the new one trades nearly all of
						these exemptions for lower rates. Frappe HR carries that as a flag on{" "}
						<code>Income Tax Slab</code> and a slab chosen per person on their Salary Structure
						Assignment — so it is one master and one field, not a build. But it is a decision
						nobody has made, and it comes before the collection exercise rather than after it:
						there is no point chasing 80C proofs from people who are on the new regime.
					</Gap>
				</div>

				<div className="mt-[.7rem]">
					<NotReadable />
				</div>

				<Cols>
					<PanPanel s={s} />

					<Panel title="What would stand behind this screen" cov="skip" ico="🧾">
						<div className="rows">
							<div className="row">
								<span><code>Employee Tax Exemption Declaration</code></span>
								<span className="val muted">what is claimed — stock</span>
							</div>
							<div className="row">
								<span><code>Employee Tax Exemption Proof Submission</code></span>
								<span className="val muted">what is produced for it — stock</span>
							</div>
							<div className="row">
								<span><code>Employee Tax Exemption Sub Category</code></span>
								<span className="val muted">the master, and it is empty</span>
							</div>
							<div className="row">
								<span><code>Income Tax Slab</code></span>
								<span className="val muted">old regime or new — undecided</span>
							</div>
						</div>
						<NoteBelow>
							Four doctypes for one of their screens, and three of the four ship with Frappe HR —
							§27 files IT Declarations under <b>stock</b> for exactly that reason. What is
							missing is not code: it is the sub-category master, the regime decision, and 502
							PANs.
						</NoteBelow>
					</Panel>
				</Cols>

				<div className="mt-[.7rem] flex flex-wrap gap-[.6rem] justify-end">
					<Desk href={s.site && deskImport(s.site)} label="Data Import"
						title="Load declarations from a spreadsheet. Opens ERPNext's Data Import on the site — nothing is written until the preview there is accepted. One document per person per financial year, with a child row per category.">
						Import declarations on the site
					</Desk>
					<Desk href={s.site && deskNew(s.site, "Employee Tax Exemption Sub Category")}
						label="New sub category"
						title="The master a declaration's child rows point at. It is empty on this site, and nothing can be declared until it is not.">
						Create a sub category
					</Desk>
					<Desk href={s.site && deskUrl(s.site, "Employee Tax Exemption Declaration")}
						label="Declaration list"
						title="Every declaration on the site. Expect it to be empty until payroll is started.">
						Open the list on the site
					</Desk>
				</div>

				<div className="mt-[.7rem]">
					<Empty title="No declaration exists, for anybody">
						Not a filter that found nothing. Payroll is deferred, the sub-category master is empty,
						and the regime is undecided — so there is nothing to list under any person or any
						financial year, and this page states no total.
					</Empty>
				</div>
			</div>
		</>
	);
}
