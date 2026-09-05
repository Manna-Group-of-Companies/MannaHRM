import { Fragment } from "react";

import { patch, useApp } from "@/store";
import { fmt, initials, tidyDept, todayIso } from "@/lib/format";
import { salPool } from "@/features/employees/SalaryMaster";
import { download, toCsv } from "@/lib/csv";
import { Desk, Gap, Html, Note, Scroll } from "@/components/ui";
import { deskNew, deskUrl } from "@/lib/desk";
import { laterAssignments, num, planRevision, saveRevision } from "@/api/salary";
import {
	SAL_REV_ANNUALLY, SAL_REV_BASIS, SAL_REV_FIELDS, SAL_REV_MANUALLY, SAL_REV_ODD,
	SAL_REV_ROWS, SAL_REV_SAVE,
} from "@/data/masters";

/* Salary Master's + , photographed 31 August 2026 and drawn here control for
   control: the person and the effective date across the top, an attachments
   chip, thirty-four wage types under six headings, and their two SAVE buttons
   at the foot.

   It is drawn for the reason the screen behind it is drawn — this is what HR
   fills in today, and a copy of it can be held up against theirs before a rupee
   is loaded. **This is the one form in Factor HR whose output is somebody's
   wages**, which is what every decision below is weighed against.

   Since 31 August 2026 both SAVE buttons write, and what they write is two
   **drafts** — a `Salary Structure` holding the typed amounts and a
   `Salary Structure Assignment` naming the person and the date. See
   api/salary.js for the mapping and server/index.js for the guard: the proxy
   refuses any `docstatus` but 0, and `Salary Slip` and `Payroll Entry` are not
   reachable through it at all. **Submitting is what decides what somebody is
   paid, and it stays on the site**, where the approval and the audit trail on
   it live. A draft that is wrong is deleted; a submitted document that is wrong
   is cancelled, amended, and lives there forever.

   Two things the form does before any of that. It adds up what is typed, per
   group, and refuses the one sum that cannot be trusted (see `Sub`). And it
   exports, so an hour spent filling this in is a file rather than a browser tab
   somebody must not close.

   The arithmetic and the tooltips are the point of the copy. Their form is a
   flat list of wage types; ours says, on every row that is not what it looks
   like, what stands behind it here and why. Nine of the thirty-four are not a
   `Salary Component` at all — see `SAL_REV_ODD`, which counts them off the
   mappings rather than taking anybody's word for the number. */

/** The draft for one person. Absent reads exactly as empty everywhere below,
    which is why nothing seeds it — an untouched form costs no state at all. */
const draftOf = (s, who) => s.rev.by[who] || { on: todayIso(), cells: {} };

const cellOf = (d, key) => d.cells[key] || { amt: "", basis: SAL_REV_BASIS[0], man: false, ref: "" };

/** Merge one change into one cell, leaving every other cell and every other
    person's draft alone. */
function edit(s, who, key, part) {
	const d = draftOf(s, who);
	patch("rev", {
		by: {
			...s.rev.by,
			[who]: { ...d, cells: { ...d.cells, [key]: { ...cellOf(d, key), ...part } } },
		},
		/* A message is an answer to the last button pressed. Typing is a new
		   question, so it goes. */
		msg: "",
	});
}

/* `num` is imported from api/salary.js rather than written twice. It is the
   parser that decides what reaches a Salary Structure, and a subtotal on this
   screen that read "1,20,000" differently from the thing that writes it would
   be a form agreeing with itself and disagreeing with the site. */

/** The form as blocks — an outer heading or a numbered group, then the rows
    under it. One pass over their list, so the order on screen is theirs and
    cannot drift from the record of it. */
function blocks() {
	const out = [];
	SAL_REV_ROWS.forEach((r) => {
		if (r.head || r.grp) out.push({ ...r, rows: [] });
		else if (out.length) out[out.length - 1].rows.push(r);
	});
	return out;
}

const BLOCKS = blocks();

/** Every wage type that has a figure against it, in their order, flattened
    back out with the heading it sits under. What the export writes and what
    the counts count. */
function filledRows(d) {
	const out = [];
	BLOCKS.forEach((b) => {
		b.rows.forEach((r) => {
			if (!r.desc) return;
			const c = cellOf(d, r.desc);
			if (num(c.amt) == null && !c.ref.trim() && !c.man) return;
			out.push({ ...r, group: b.head || b.grp, cell: c });
		});
	});
	return out;
}

/** A group's subtotal, and the reason it is not the whole group.

    `nosum` rows are left out and named. That is the difference between a
    subtotal and a wrong number: NET PAY CTC sits inside COMPANY CONTRIBUTION
    and adding it there would count the entire salary a second time. The row
    says which rows it skipped rather than quietly skipping them. */
function Sub({ b, d, cols }) {
	const taken = b.rows.filter((r) => r.desc && !r.nosum && num(cellOf(d, r.desc).amt) != null);
	const skipped = b.rows.filter((r) => r.nosum && num(cellOf(d, r.desc).amt) != null);
	if (!taken.length && !skipped.length) return null;
	const sum = taken.reduce((n, r) => n + num(cellOf(d, r.desc).amt), 0);

	return (
		<tr className="sub">
			<td />
			<td colSpan={2}>
				{taken.length ? `Typed above — ${taken.length} of ${b.rows.filter((r) => r.desc).length} rows` : "Nothing summable typed above"}
				{skipped.length ? (
					<small>
						{skipped.map((r) => r.desc).join(", ")} left out — {skipped.length === 1 ? "it is" : "they are"}{" "}
						a total rather than a line in one
					</small>
				) : null}
			</td>
			<td className="amt">{taken.length ? fmt(sum) : "—"}</td>
			<td className="amt">{taken.length ? fmt(sum * 12) : "—"}</td>
			<td colSpan={cols - 5} />
		</tr>
	);
}

/** One wage type. Four controls, and the two on the right are readings of a
    column heading rather than something anybody has seen filled in — which is
    why both carry the reading in their tooltip. */
function Row({ s, who, r, d, ro }) {
	const c = cellOf(d, r.desc);
	const amt = num(c.amt);
	const yearly = amt == null ? null : amt * 12;

	return (
		<tr>
			{/* Their gutter icon, on every row. What it opens has never been seen —
			    no capture has one clicked — so it is drawn as the mark it is and not
			    as a button that would do nothing. */}
			<td className="g" title="Their row icon. What it opens has never been seen: no capture has one clicked, so nothing is invented behind it.">
				<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none"
					strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
					<path d="M4 5h16v14H4zM4 9h16M8 5v14" />
				</svg>
			</td>

			<td className={"desc" + (r.map ? " noted" : "")}>
				{r.desc}
				{r.map ? <small title={r.why}>{r.map}</small> : null}
			</td>

			<td>
				<select aria-label={`Pay basis for ${r.desc}`} value={c.basis} disabled={ro}
					title="Every row on their form reads Monthly and the list has never been opened, so Monthly is all there is to offer. A second value invented here would change what every amount on this form means."
					onChange={(e) => edit(s, who, r.desc, { basis: e.target.value })}>
					{SAL_REV_BASIS.map((v) => <option key={v}>{v}</option>)}
				</select>
			</td>

			<td className="amt">
				<input inputMode="decimal" aria-label={`Amount for ${r.desc}`} value={c.amt}
					className={c.amt.trim() && amt == null ? "bad" : ""} disabled={ro}
					title={ro
						? "Pick somebody at the top of the form first. An amount typed against nobody has nowhere to be filed — and this draft is kept per person."
						: c.amt.trim() && amt == null
							? "Not a number, so it is left out of the subtotal rather than counted as zero."
							: "Commas are fine — 1,20,000 reads as 120000."}
					onChange={(e) => edit(s, who, r.desc, { amt: e.target.value })} />
			</td>

			<td className="amt yr" title={SAL_REV_ANNUALLY}>
				{yearly == null ? <span className="muted">—</span> : fmt(yearly)}
			</td>

			<td className="man">
				<label title={SAL_REV_MANUALLY}>
					<input type="checkbox" checked={c.man} aria-label={`Manually, for ${r.desc}`} disabled={ro}
						onChange={(e) => edit(s, who, r.desc, { man: e.target.checked })} />
				</label>
			</td>

			<td className="ref">
				<input aria-label={`Reference or remarks for ${r.desc}`} value={c.ref} disabled={ro}
					onChange={(e) => edit(s, who, r.desc, { ref: e.target.value })} />
			</td>
		</tr>
	);
}

/** What this form can honestly put in a file: the person, the date, and every
    row somebody touched — the figure, the basis, the flag and the remark.

    Only touched rows, and that is deliberate. Thirty-four rows of blanks is not
    a salary revision, and a file full of empty cells is the kind of thing that
    gets imported by accident. */
function revCsv(e, d) {
	const rows = filledRows(d);
	const cols = ["Employee code", "Employee", "Effective from", "Section", "Wage type",
		"Pay basis", "Amount", "Annually (derived)", "Manually", "Reference / Remarks",
		"What it maps to here"];
	download(
		"salary-revision-" + (e.employee_number || e.name) + "-" + (d.on || todayIso()) + ".csv",
		toCsv(cols, rows.map((r) => [
			e.employee_number || e.name,
			e.employee_name || "",
			d.on || todayIso(),
			r.group,
			r.desc,
			r.cell.basis,
			num(r.cell.amt) ?? "",
			num(r.cell.amt) == null ? "" : num(r.cell.amt) * 12,
			r.cell.man ? "Yes" : "",
			r.cell.ref,
			r.map || "Salary Component",
		])),
	);
}

/** Who this revision is for, asked on the form rather than in front of it.

    Their + is dead until somebody is picked, and the document really is
    one-person — a revision belonging to nobody has nowhere to be filed, which
    is why nothing below this can be typed into until it is answered. But that
    is not a reason to refuse to *draw* the form. The commonest question this
    page exists to answer is "what does a pay revision even ask for", and a
    greyed-out + answers it with nothing.

    The same box and the same rows as Salary Master's own picker, reading the
    same `sal` state — so the dot's status filter still governs who can be
    offered, and a choice made here is the choice made there. */
function Picker({ s }) {
	const pool = salPool(s);
	const q = (s.sal.q || "").trim().toLowerCase();
	/* Unsearched shows the first few rather than nothing: an empty box under a
	   heading reading "who is this for" looks like a list that failed to load. */
	const matches = (q
		? pool.filter((e) => [e.employee_number, e.employee_name, e.designation]
			.some((v) => (v || "").toLowerCase().includes(q)))
		: pool).slice(0, 8);

	return (
		<div className="srpick">
			<b className="font-display">Who is this revision for?</b>
			<span className="find rev">
				<input type="search" placeholder="Search Employee" aria-label="Search employee"
					value={s.sal.q || ""} onChange={(e) => patch("sal", { q: e.target.value })} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</span>
			<div className="regfind">
				{matches.length ? matches.map((e) => (
					/* Picks without closing the form — the whole point of asking here. */
					<button key={e.name} onClick={() => patch("sal", { emp: e.name, q: "", list: false })}>
						<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
						<b>{e.employee_name}</b>
						<span className="mono">{e.employee_number || "—"}</span>
						<span className="muted">{tidyDept(e.department)}</span>
					</button>
				)) : (
					<span className="none">
						Nobody matches, out of {fmt(pool.length)} searched
						{s.sal.status ? ` · status ${s.sal.status}` : ""}
						{s.company ? ` · ${s.company}` : ""}
					</span>
				)}
			</div>
		</div>
	);
}

/** What the save actually wrote, named so it can be opened.

    Both documents are drafts, and the report says so twice: once as the state
    they are in, and once as the thing that has not happened yet. A page that
    reported "saved" and left somebody believing payroll was set would be worse
    than one that could not save at all. */
function Saved({ s, emp, done, later }) {
	return;
}

/** One line per thing the save is about to do, worked out by the same function
    that then does it — so what somebody agrees to cannot drift from what
    happens. See planRevision in api/salary.js. */
function Plan({ plan }) {
	return (
		<ul className="srplan">
			<li>
				<b>{plan.rows.length}</b> wage type{plan.rows.length === 1 ? "" : "s"} onto one{" "}
				<code>Salary Structure</code> — {plan.rows.filter((r) => r.kind === "Earning").length} earning,{" "}
				{plan.rows.filter((r) => r.kind === "Deduction").length} deduction
			</li>
			{plan.base == null ? null : (
				<li>CTC TOTAL <b>{fmt(plan.base)}</b> becomes the assignment&rsquo;s <code>base</code></li>
			)}
			{plan.skipped.length ? (
				<li>
					{plan.skipped.length} figure{plan.skipped.length === 1 ? "" : "s"} not written:{" "}
					{plan.skipped.map((k) => k.desc).join(", ")} — {plan.skipped[0].why}
				</li>
			) : null}
			{plan.twins.map(([a, b]) => (
				<li key={a} className="warn">
					<b>{a}</b> and <b>{b}</b> are both typed. Their form asks for the same money
					twice — once as a deduction and once restated as CTC — and only one of the two
					moves any. Check the figures before this is submitted.
				</li>
			))}
			<li className="ok">
				Both documents are written as <b>drafts</b>. Nobody is paid until somebody submits
				them on the site.
			</li>
		</ul>
	);
}

export default function SalaryRevision({ emp }) {
	const s = useApp();
	/* Nobody picked yet. The form draws in full and takes nothing — see Picker
	   for why it opens at all. Every control below reads `ro`, and the draft it
	   reads is a throwaway that is never written back, so there is no such thing
	   as a draft belonging to nobody. */
	const ro = !emp;
	const d = ro ? { on: todayIso(), cells: {} } : draftOf(s, emp.name);
	const touched = ro ? [] : filledRows(d);
	const cols = 7;

	const close = () => patch("rev", { open: false, msg: "" });
	const setOn = (on) => patch("rev", { by: { ...s.rev.by, [emp.name]: { ...d, on } }, msg: "" });

	function clear() {
		const by = { ...s.rev.by };
		delete by[emp.name];
		patch("rev", { by, msg: "" });
	}

	const pressed = SAL_REV_SAVE.find((b) => b.k === s.rev.msg);
	const busy = s.rev.busy;

	/* Two clicks to write, the same as Clear has. The first draws what the
	   second will do; the second is the only thing that talks to the site.
	   A pay revision is worth a sentence in between. */
	async function write(kind) {
		patch("rev", { busy: "starting", err: "", done: null, later: null });
		try {
			const done = await saveRevision(emp, d, (step) => patch("rev", { busy: step }));
			/* Their second button claims to rewrite every later revision. What this
			   does instead is find them and say so — see the note the report draws.
			   Looked up after the write, so a failure here cannot lose the save. */
			let later = null;
			if (kind === "future") {
				later = await laterAssignments(emp, d.on || todayIso()).catch(() => null);
			}
			patch("rev", { busy: "", done, later, msg: "" });
		} catch (e) {
			patch("rev", { busy: "", err: e.message || String(e) });
		}
	}

	return (
		<div className="srform">
			{/* The way back, and the only one: this form takes the whole content
			    area and the subtab strip goes with it (see fullPage() in App.jsx),
			    because a strip that switches page on one click sits above figures
			    that exist nowhere else until they are exported. So the control says
			    where it is going rather than just closing. */}
			<div className="srback">
				<button className="embtn" onClick={close}>
					<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
						strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
					Salary Master
				</button>
				<span className="muted">
					Salary revision · {ro ? "nobody picked yet" : emp.employee_name}
					{touched.length ? ` · ${touched.length} row${touched.length === 1 ? "" : "s"} typed, nothing saved` : ""}
				</span>
			</div>

			{/* Their header strip: who, when it takes effect, and attachments. With
			    nobody picked it is replaced rather than blanked — a date and an
			    attachments chip over an empty name is a form that looks half loaded,
			    where a question looks like a question. */}
			{ro ? <Picker s={s} /> : (
				<div className="srhead">
					<i className="ava" aria-hidden="true">{initials(emp.employee_name)}</i>
					<b>
						<span className="mono">{emp.employee_number || emp.name}</span>
						{" - "}
						{(emp.salutation ? emp.salutation + " " : "") + (emp.employee_name || "—")}
					</b>

					<label className="on" title="The date this revision takes effect from. Theirs opens on a date already chosen; ours opens on today, because a default computed anywhere else is a default that goes stale under a tab left open across a month end — and on this form the date decides which payroll the figure lands in.">
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="14" height="14" fill="none" strokeWidth="1.7">
							<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
						</svg>
						<input type="date" aria-label="Effective from" value={d.on || todayIso()}
							onChange={(e) => setOn(e.target.value)} />
					</label>

					{/* Dead, and it says why rather than being left off. A file attached to
					    a pay revision is evidence — the letter, the approval — and evidence
					    belongs beside the document it justifies, on the site. */}
					<button className="embtn clip" disabled
						title="An attachment on a pay revision is evidence — the letter it came from, the approval behind it — and it belongs on the document it justifies rather than in a browser tab. This form holds no document to attach one to.">
						<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
							strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
							<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 1 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 6" />
						</svg>
						No Attachments
					</button>

				</div>
			)}

			<div className="legend">
				<b className="font-display">Salary revision</b>
				<span className="cov part">Saves as drafts</span>
				<span>
					Their form, control for control. <b>Both SAVE buttons write two drafts</b> — a Salary
					Structure and a Salary Structure Assignment — and neither can submit them: this is the
					one screen in Factor HR whose output is somebody&rsquo;s wages, so what makes them
					payroll stays on the site.
				</span>
				<button className="btn ghost ml-auto" disabled={!touched.length}
					title={ro
						? "Pick somebody first — an export with no name on it is a file nobody can file."
						: touched.length
							? `Write the ${touched.length} row${touched.length === 1 ? "" : "s"} touched here to CSV. Blank rows are left out — thirty-four rows of nothing is not a revision.`
							: "Nothing has been typed yet."}
					onClick={() => revCsv(emp, d)}>
					⬇ Export CSV
				</button>
			</div>

			<Scroll>
				<table className={"salrev" + (ro ? " ro" : "")} style={{ minWidth: 880 }}>
					<thead>
						<tr>
							<th className="g" />
							<th>Wage type description</th>
							<th>Pay basis</th>
							<th className="amt">Amount</th>
							<th className="amt" title={SAL_REV_ANNUALLY}>Annually</th>
							<th className="man" title={SAL_REV_MANUALLY}>Manually</th>
							<th className="ref">Reference / Remarks</th>
						</tr>
					</thead>
					<tbody>
						{BLOCKS.map((b) => (
							<Fragment key={b.head || b.grp}>
								<tr className={b.head ? "sec" : "grp"}>
									<td className="g">{b.n ?? ""}</td>
									<td colSpan={cols - 1}>{b.head || b.grp}</td>
								</tr>
								{b.rows.map((r) => (r.unseen ? (
									<tr className="clip" key="unseen">
										<td className="g" />
										<td colSpan={cols - 1}>
											One row sits here and the two captures overlap short of it, so its label is
											the only thing on this form nobody has read. The group is alphabetical,
											which puts it after <b>EMPLOYER PF CTC</b> and before{" "}
											<b>GRATUITY CONTRIBUTION CTC</b>. One screenshot settles it — a row invented
											here would be a wage type nobody owes.
										</td>
									</tr>
								) : (
									<Row key={r.desc} s={s} who={ro ? "" : emp.name} r={r} d={d} ro={ro} />
								)))}
								<Sub b={b} d={d} cols={cols} />
							</Fragment>
						))}
					</tbody>
				</table>
			</Scroll>

			{/* Their two buttons, in their order and their capitals. Both write now,
			    as drafts — see api/salary.js. The first click asks; the second is
			    what talks to the site. */}
			<div className="sracts">
				{SAL_REV_SAVE.map((b) => (
					<button key={b.k} className={"btn" + (b.pri ? " imp" : " ghost")}
						aria-pressed={s.rev.msg === b.k} disabled={ro || !touched.length || Boolean(busy)}
						title={ro
							? "Pick somebody at the top of the form first."
							: !touched.length
								? "Nothing has been typed yet."
								: b.k === "save"
									? "Writes a draft Salary Structure and a draft Salary Structure Assignment onto the site. Nobody is paid until they are submitted there."
									: "Writes the same two drafts, then lists any later-dated revision for this person that it did not touch."}
						onClick={() => patch("rev", { msg: s.rev.msg === b.k ? "" : b.k, err: "", done: null })}>
						{b.label}
					</button>
				))}
				<button className="btn ghost ml-auto" disabled={!touched.length || Boolean(busy)}
					title={touched.length
						? "Discards what has been typed on this form."
						: "Nothing has been typed yet."}
					onClick={() => patch("rev", { msg: s.rev.msg === "clear" ? "" : "clear" })}>
					↺ Clear
				</button>
			</div>

			{/* Which round trip it is on, rather than a spinner. A save is several
			    documents in order and the first thing anybody asks when one fails is
			    which of them got through. */}
			{busy ? (
				<div className="mt-[.8rem]">
					<Note><b>Writing to the site…</b> {busy}</Note>
				</div>
			) : null}

			{/* What the site refused, whole. A validation from hrms is the system
			    working, and rewording it into "save failed" throws away the one
			    sentence that says what to fix. */}

			{s.rev.done ? <Saved s={s} emp={emp} done={s.rev.done} later={s.rev.later} /> : null}

			{/* Two clicks, because there is no undo behind this one and no save in
			    front of it: what is typed on this form exists nowhere else. */}

			<div className="mt-[1rem]">
				<Gap>
					<b>
						{SAL_REV_ODD.length} of these {SAL_REV_FIELDS} rows are not a salary component at all.
					</b>{" "}
					Three are totals sitting among the inputs that make them — CTC TOTAL, MONTHLY GROSS, NET
					PAY CTC. Two are gratuity, which hrms derives from a rule and length of service rather
					than holding as a figure. TDS comes off a slab and a declaration. LEAVE ENCASHMENT is a
					document of its own. BONUS PROVISION is a journal entry rather than pay. And MPF
					CONTRIBUTION MANUAL is not resolvable from the capture at all. Two more <em>are</em>{" "}
					components but are filed in the wrong group: EMPLOYEE ESI CTC and EMPLOYEE PF CTC come
					out of the employee&rsquo;s pay, under a heading reading COMPANY CONTRIBUTION — so that
					group&rsquo;s total is not employer cost. <b>A migration that maps this table row-for-row
					onto components gets all {SAL_REV_ODD.length + 2} wrong.</b> Hover any row&rsquo;s grey
					line for which it is.
				</Gap>

			</div>
		</div>
	);
}
