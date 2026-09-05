import { useEffect } from "react";
import { patch, useApp } from "@/store";
import { go } from "@/routes/router";
import { load, loadCandidates } from "@/api/load";
import { pullCandidate } from "@/api/candidate";
import { deskUrl } from "@/lib/desk";
import { dmy, dmyTime, fmt, initials } from "@/lib/format";
import { Desk, Empty, Modal } from "@/components/ui";
import {
	BULK_WHY, EDIT_WHY, NOT_READ, ONB_CELLS, ONB_ICON, ONB_STATE, PULL_BLOCKS, SERIES_WHY,
} from "@/data/candidates";

/* ---------------------------------------------------------------------------
   **Import employee(s) from onboarding** — Factor HR's own screen, behind
   Employee Master's ⋯ → Import From Onboarding, at `/employees/import`.

   That menu item was a link to the ERPNext desk until 4 Sep 2026, and the swap
   is the point of this file. Opening the desk is the right answer for a *write*
   and the wrong one for a *list*: what somebody means by "import from
   onboarding" is show me who is waiting, and that is a read this site can now
   answer — see `Employee Onboarding` in server/src/doctypes/onboard.ts, and
   data/candidates.js for the columns.

   ## What is a copy and what is not

   The layout is theirs, photographed and drawn back: a bar with a select-all
   box, a wide search and Bulk Import on the right; then one card per candidate,
   each with a tick, a round of initials, `[#n]- code - Salutation Name`, a
   Pull Candidate button and two icon actions; and under that a row of eight
   labelled cells. The labels are their labels and the order is their order.

   **Pull Candidate is ours.** Nobody has photographed what theirs does after
   the click, so this does the honest thing the name means on this site: create
   the `Employee`, then mark the candidate as taken. Both writes are described
   on the button and in api/candidate.js, including the order and why it is that
   way round.

   ## Why it asks for an employee code

   Their EMPLOYEE CODE SERIES column reads "Manual Entry" on every row, and on
   this site that is the only value it could honestly read: nothing here
   allocates an employee code. So the pull asks for one rather than inventing
   it, and refuses a code somebody already has — which the site would accept,
   because `employee_number` is the field this whole dashboard exists to keep
   people from colliding on. See SERIES_WHY.

   ## The way out is one control

   Off-menu like Create Employee, so the subtab strip goes with it (`OFF_MENU`
   in routes/registry.jsx) and there is one labelled way back. The reason is
   weaker here than on the wizard — there is no half-typed form to lose — but
   the shape of the two screens should not differ for no reason, and a strip
   above a page reached from a menu item on another page reads as a page that
   belongs to the strip.
   --------------------------------------------------------------------------- */

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

/** Their name line: `[#1]- 1 - Mr A`.

    A reading of their format rather than a documented one. The middle token is
    what identifies the person to whoever entered them — the employee code once
    there is one, and the first name before that, which is what both of their
    captured rows show. The serial is the row's position in the queue, not the
    record id: theirs counts 1, 2 and ours is `HR-ONB-00001`. */
const cardTitle = (c, n) =>
	`[#${n}]- ${c.employee_number || c.first_name || "—"} - `
	+ `${[c.salutation, c.employee_name].filter(Boolean).join(" ") || "(no name)"}`;

/** Why this candidate cannot be pulled, or "". First reason only — see
    PULL_BLOCKS for why one rather than all of them. */
function blockedBy(c) {
	if (c.employee) {
		return `Already pulled — this candidate is ${c.employee} on the site. Pulling again would `
			+ "create a second record for the same person.";
	}
	if (c.docstatus === 1) {
		return "This onboarding record is submitted. A submitted document is history on the system of "
			+ "record, and this API refuses to change one — so the candidate cannot be marked as taken.";
	}
	const hit = PULL_BLOCKS.find(([field]) => !String(c[field] ?? "").trim());
	return hit ? hit[1] : "";
}

/** Everything the search box leaves, in the order the site sent — which is the
    order their `[#n]` counts in, so the numbering is stable while somebody
    types. The serial is therefore assigned before filtering, not after. */
function filtered(s) {
	const q = (s.onb.q || "").trim().toLowerCase();
	const rows = s.cands.map((c, i) => ({ c, n: i + 1 }));
	if (!q) return rows;
	return rows.filter(({ c }) =>
		[c.employee_name, c.employee_number, c.personal_email, c.cell_number, c.designation,
			c.department, c.name]
			.some((v) => String(v || "").toLowerCase().includes(q)));
}

/** One labelled cell under a card. */
function Cell({ c, col, full }) {
	if (col.late && !full) {
		return (
			<div className="onbc">
				<span className="k">{col.label}</span>
				<span className="v gone" title={NOT_READ}>not read</span>
			</div>
		);
	}
	const raw = c[col.key];
	const val = raw == null || raw === "" ? ""
		: col.kind === "date" ? dmy(raw)
			: col.kind === "stamp" ? dmyTime(raw)
				: String(raw);

	return (
		<div className="onbc">
			<span className="k">{col.label}</span>
			<span className={"v" + (val && col.link ? " link" : "")}
				title={col.kind === "series" && val ? SERIES_WHY : undefined}>
				{val || <i className="dash">-</i>}
			</span>
		</div>
	);
}

/** The box every code is typed into, single pull and bulk alike.

    The clash check is against the employees this page already holds rather than
    against the site, which is a real limit and the same one `clashes()` in
    lib/newemp.js documents: a record created in another tab since this page
    loaded will not be seen. It is worth having anyway — the site's own unique
    constraint refuses the duplicate, and being told before the write which
    person owns the code is the difference between a fixable mistake and a
    refusal somebody has to go and investigate. */
function CodeBox({ s, cand, value, onChange }) {
	const code = String(value || "").trim();
	const twin = code && s.employees.find((e) => String(e.employee_number || "").trim() === code);

	return (
		<label className="onbcode">
			<span className="who">
				<i className="letav" aria-hidden="true">{initials(cand.employee_name)}</i>
				{cand.employee_name || cand.name}
			</span>
			<input
				type="text"
				value={value || ""}
				aria-label={`Employee code for ${cand.employee_name || cand.name}`}
				placeholder="Emp Code"
				aria-invalid={twin ? "true" : undefined}
				onChange={(e) => onChange(e.target.value)}
			/>
			{twin ? (
				<span className="bad">
					{code} is already {twin.employee_name} ({twin.name}).
				</span>
			) : null}
		</label>
	);
}

export default function ImportOnboarding() {
	const s = useApp();
	const full = s.candTier === "full";

	/* Read on arrival, once. The guard is in the loader rather than here so a
	   re-render — a keystroke in the search box is one — cannot ask twice. */
	useEffect(() => { void loadCandidates(); }, []);

	const rows = filtered(s);
	const sel = s.onb.sel;
	const picked = new Set(sel);
	/* Ticking is only offered on rows something can be done to. A select-all
	   that quietly includes six already-pulled candidates makes Bulk Import
	   report six failures for pressing one button. */
	const pullable = rows.filter(({ c }) => !blockedBy(c));
	const onPage = pullable.filter(({ c }) => picked.has(c.name)).length;
	const ticked = s.cands.filter((c) => picked.has(c.name) && !blockedBy(c));

	const setOnb = (part) => patch("onb", part);
	const setCode = (name, v) => setOnb({ code: { ...s.onb.code, [name]: v } });

	const toggle = (name) =>
		setOnb({ sel: picked.has(name) ? sel.filter((x) => x !== name) : sel.concat(name) });

	const toggleAll = () =>
		setOnb({
			sel: onPage === pullable.length
				? sel.filter((n) => !pullable.some(({ c }) => c.name === n))
				: [...new Set(sel.concat(pullable.map(({ c }) => c.name)))],
		});

	/** One candidate, created and marked. Shared by the single pull and by the
	    bulk run, so the two cannot come to different conclusions about what a
	    pull is — the bulk dialog is a loop over this and nothing else. */
	async function pullOne(c) {
		const code = String(s.onb.code[c.name] || "").trim();
		try {
			const { emp, marked, markErr } = await pullCandidate(c, code);
			return {
				name: c.name,
				who: c.employee_name || c.name,
				ok: true,
				text: marked
					? `Created as ${emp.name}.`
					: `Created as ${emp.name}, but the candidate could not be marked as taken — ${markErr}. `
						+ "Pulling them again would make a second record.",
			};
		} catch (e) {
			return { name: c.name, who: c.employee_name || c.name, ok: false, text: e.message || String(e) };
		}
	}

	/** The single Pull Candidate, after the code dialog. */
	async function runOne(c) {
		setOnb({ busy: c.name, ask: "" });
		const out = await pullOne(c);
		setOnb({
			busy: "",
			log: [out, ...s.onb.log].slice(0, 40),
			msg: out.ok ? `${out.who}: ${out.text}` : `${out.who} was not created — ${out.text}`,
			sel: sel.filter((n) => n !== c.name),
		});
		/* Both lists are stale now: the directory has a person it did not have,
		   and the queue has a candidate that is no longer waiting. Re-read rather
		   than splice — the site names the record and may default fields nothing
		   here asked about, and what it stored is the only version worth showing. */
		if (out.ok) { void load(); void loadCandidates(true); }
	}

	/** Bulk Import: the same act down the ticked list.

	    Sequential rather than in parallel, deliberately. Each create takes a
	    name off the same naming series, and a screen that fired six at once
	    would report them in whatever order they finished — which is not the
	    order somebody ticked them, and not an order the log can be read in. */
	async function runBulk() {
		setOnb({ busy: "bulk" });
		const out = [];
		for (const c of ticked) out.push(await pullOne(c));

		const made = out.filter((r) => r.ok).length;
		setOnb({
			busy: "",
			bulk: false,
			log: [...out].reverse().concat(s.onb.log).slice(0, 40),
			msg: `${fmt(made)} of ${fmt(out.length)} candidate(s) created.`
				+ (made === out.length ? "" : " The ones that were refused are listed below."),
			sel: sel.filter((n) => !out.some((r) => r.ok && r.name === n)),
		});
		if (made) { void load(); void loadCandidates(true); }
	}

	const asking = s.onb.ask && s.cands.find((c) => c.name === s.onb.ask);
	const askCode = asking ? String(s.onb.code[asking.name] || "").trim() : "";
	const askTwin = askCode
		&& s.employees.some((e) => String(e.employee_number || "").trim() === askCode);

	const blankCodes = ticked.filter((c) => !String(s.onb.code[c.name] || "").trim()).length;
	const clashCodes = ticked.filter((c) => {
		const v = String(s.onb.code[c.name] || "").trim();
		return v && s.employees.some((e) => String(e.employee_number || "").trim() === v);
	}).length;
	/* Two codes typed the same in one dialog. The site would refuse the second
	   and the first would already be written, which is the worst shape a bulk
	   run can fail in — half done, and the half that failed blamed on a code
	   that looks fine on its own row. */
	const dupCodes = (() => {
		const seen = new Set();
		return ticked.some((c) => {
			const v = String(s.onb.code[c.name] || "").trim();
			if (!v) return false;
			if (seen.has(v)) return true;
			seen.add(v);
			return false;
		});
	})();

	return (
		<div className="srform">
			<div className="srback">
				<button className="embtn" onClick={() => go({ section: "employees", subtab: "overview" })}>
					<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
						strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
					Employee Master
				</button>
			</div>

			<div className="fhcat onbtab">
				<header>
					<h3>Import employee(s) from onboarding</h3>
					<span className={"cov " + (s.candState === "ok" ? (full ? "live" : "part") : "part")}>
						{s.candState === "ok"
							? (full ? "Their screen, our queue" : "ERPNext's fields only")
							: s.candState === "error" ? "Not read" : "Reading…"}
					</span>
					<span className="n">
						{s.candState === "ok"
							? <>{fmt(rows.length)}
								{rows.length === s.cands.length ? "" : " of " + fmt(s.cands.length)} candidate(s)
								{sel.length ? ` · ${fmt(sel.length)} ticked` : ""}</>
							: null}
					</span>
				</header>

				{/* Their bar: the select-all box, a wide search, then the refresh and
				    Bulk Import on the right. */}
				<div className="onbbar">
					<input
						type="checkbox"
						className="letck"
						aria-label="Select every candidate that can be pulled"
						checked={pullable.length > 0 && onPage === pullable.length}
						disabled={!pullable.length}
						ref={(el) => { if (el) el.indeterminate = onPage > 0 && onPage < pullable.length; }}
						onChange={toggleAll}
					/>
					<span className="letfind onbfind">
						<Ic d={ONB_ICON.search} />
						<input type="search" aria-label="Search candidates" placeholder="Search"
							value={s.onb.q}
							onChange={(e) => setOnb({ q: e.target.value })} />
					</span>
					<span className="right">
						<button className="embtn ic" aria-label="Reload the candidates"
							title="Read Employee Onboarding again. Candidates are entered where the hire was agreed, so this is how one entered since the page opened turns up."
							disabled={s.candState === "loading" || !!s.onb.busy}
							onClick={() => void loadCandidates(true)}>
							<Ic d={ONB_ICON.refresh} />
						</button>
						<button className="embtn pri out" title={BULK_WHY}
							disabled={!ticked.length || !!s.onb.busy}
							onClick={() => setOnb({ bulk: true })}>
							<Ic d={ONB_ICON.bulk} />
							Bulk Import{ticked.length ? ` (${fmt(ticked.length)})` : ""}
						</button>
					</span>
				</div>

				{s.onb.msg ? (
					<div className="onbmsg">
						{s.onb.msg}
						<button className="x" aria-label="Dismiss" onClick={() => setOnb({ msg: "", log: [] })}>
							×
						</button>
					</div>
				) : null}

				{s.onb.log.length ? (
					<ul className="onblog">
						{s.onb.log.map((r, i) => (
							<li key={r.name + i} className={r.ok ? "ok" : "bad"}>
								<b>{r.who}</b> {r.text}
							</li>
						))}
					</ul>
				) : null}

				{/* Four states, and they are four different sentences. A queue that is
				    empty because everybody has been pulled, a queue that is empty
				    because the search excluded everybody, a doctype this site has not
				    got, and a read still in flight are not the same answer. */}
				{s.candState === "loading" ? (
					<Empty title="Reading the onboarding queue…">
						Employee Onboarding is read when this page opens rather than with the dashboard —
						a screen nobody has opened must not be able to hold up the one everybody does.
					</Empty>
				) : s.candState === "error" ? (
					<Empty title="The onboarding queue could not be read">
						A site running an older copy of this schema has no <b>Employee Onboarding</b> at all
						and answers 417 — the same code a missing field answers, deliberately, so a caller
						cannot tell the two apart by probing. The server said:
						<span className="onberr">{s.candErr}</span>
					</Empty>
				) : !s.cands.length ? (
					<Empty title="Nobody is waiting">
						The site holds no <b>Employee Onboarding</b> record. A candidate is entered where the
						hire was agreed, so an empty queue here means nobody has been taken on since the last
						person was pulled — not that anything failed.
					</Empty>
				) : !rows.length ? (
					<Empty title="Nothing matches">
						{fmt(s.cands.length)} candidate(s) are loaded. Clear the search.
					</Empty>
				) : (
					<div className="onblist">
						{rows.map(({ c, n }) => {
							const dead = blockedBy(c);
							const [label, cls] = ONB_STATE[c.boarding_status] || ONB_STATE.Pending;
							const busy = s.onb.busy === c.name;

							return (
								<article className={"onbcard" + (c.employee ? " done" : "")} key={c.name}>
									<div className="top">
										<input
											type="checkbox"
											className="letck"
											checked={picked.has(c.name)}
											disabled={!!dead}
											aria-label={`Select ${c.employee_name || c.name}`}
											title={dead || undefined}
											onChange={() => toggle(c.name)}
										/>
										<i className="onbav" aria-hidden="true">{initials(c.employee_name)}</i>
										<span className="who">
											<b>{cardTitle(c, n)}</b>
											{/* Their second line, which is a dash on both of their rows.
											    Ours says what the candidate is being hired as when the
											    record carries it — the one thing on this card that
											    decides whether the right person is being pulled. */}
											<span className="sub">
												{[c.designation, c.department].filter(Boolean).join(" · ") || "-"}
											</span>
										</span>

										<span className={"cov " + cls} title={`Boarding status: ${label}`}>{label}</span>

										<span className="acts">
											<button className="embtn pri out"
												disabled={!!dead || !!s.onb.busy}
												title={dead || "Create this person as an Employee on the site, then mark the candidate as taken. It asks for an employee code first — nothing here allocates one."}
												onClick={() => setOnb({ ask: c.name, msg: "" })}>
												{busy ? "Pulling…" : "Pull Candidate"}
											</button>
											<Desk className="fhact on" label="Edit this candidate"
												href={s.site && deskUrl(s.site, "Employee Onboarding", c.name)}
												title={EDIT_WHY}>
												<Ic d={ONB_ICON.pencil} />
											</Desk>
											{/* Their box-and-arrow. Once somebody has been pulled it is
											    the more useful of the two: it opens the *employee* the
											    pull created rather than the candidate they came from. */}
											<Desk className="fhact on"
												label={c.employee ? "Open the employee" : "Open on the site"}
												href={s.site && (c.employee
													? deskUrl(s.site, "Employee", c.employee)
													: deskUrl(s.site, "Employee Onboarding", c.name))}
												title={c.employee
													? `Open ${c.employee} — the employee this candidate became — on the ERPNext site.`
													: "Open this onboarding record on the ERPNext site."}>
												<Ic d={ONB_ICON.out} />
											</Desk>
										</span>
									</div>

									<div className="onbgrid">
										{ONB_CELLS.map((col) => (
											<Cell key={col.key} c={c} col={col} full={full} />
										))}
									</div>
								</article>
							);
						})}
					</div>
				)}
			</div>

			{/* One candidate: the code, and what the pull will do with it. */}
			{asking ? (
				<Modal
					title={`Pull ${asking.employee_name || asking.name}`}
					msg="Creating an Employee on the site, under the site's own validation, and marking this candidate as taken."
					why="Their EMPLOYEE CODE SERIES column reads Manual Entry, and on this site that is the only honest value: nothing here allocates an employee code. So it is typed, and a code somebody already holds is refused here rather than discovered later — the site accepts a duplicate machine code without a word, and this is the field every screen joins people on."
					extra={
						<>
							<CodeBox s={s} cand={asking} value={s.onb.code[asking.name]}
								onChange={(v) => setCode(asking.name, v)} />
							<div className="onbacts">
								<button className="btn tpl" disabled={!askCode || askTwin || !!s.onb.busy}
									title={!askCode ? "Type the employee code this person will be created under."
										: askTwin ? "That code is already somebody else's."
											: "Create the Employee, then mark this candidate as taken."}
									onClick={() => void runOne(asking)}>
									{s.onb.busy ? "Pulling…" : "Pull Candidate"}
								</button>
								<button className="btn ghost" onClick={() => setOnb({ ask: "" })}>Cancel</button>
							</div>
						</>
					}
					onClose={() => setOnb({ ask: "" })}
				/>
			) : null}

			{/* Bulk Import: the ticked rows, a code each, one run.

			    A code box per row rather than one file picker, because this control
			    takes no file — see BULK_WHY. It is the same dialog as the single
			    pull repeated, which is what the button means. */}
			{s.onb.bulk ? (
				<Modal
					title={`Bulk Import — ${fmt(ticked.length)} candidate(s)`}
					wide
					msg={BULK_WHY}
					why="One employee code each, and they have to differ: two rows sharing a code would write the first and be refused on the second, which is the worst shape a bulk run can fail in. The run is sequential, so the list below it reads in the order the rows were ticked."
					extra={
						<>
							<div className="onbcodes">
								{ticked.map((c) => (
									<CodeBox key={c.name} s={s} cand={c} value={s.onb.code[c.name]}
										onChange={(v) => setCode(c.name, v)} />
								))}
							</div>
							{blankCodes || clashCodes || dupCodes ? (
								<div className="gap">
									{blankCodes ? <>{fmt(blankCodes)} row(s) have no employee code. </> : null}
									{clashCodes ? <>{fmt(clashCodes)} code(s) are already somebody else's. </> : null}
									{dupCodes ? <>Two rows are asking for the same code. </> : null}
								</div>
							) : null}
							<div className="onbacts">
								<button className="btn tpl"
									disabled={!ticked.length || !!blankCodes || !!clashCodes || dupCodes || !!s.onb.busy}
									onClick={() => void runBulk()}>
									{s.onb.busy === "bulk" ? "Importing…" : `Import ${fmt(ticked.length)}`}
								</button>
								<button className="btn ghost" disabled={s.onb.busy === "bulk"}
									onClick={() => setOnb({ bulk: false })}>
									Cancel
								</button>
							</div>
						</>
					}
					onClose={() => { if (s.onb.busy !== "bulk") setOnb({ bulk: false }); }}
				/>
			) : null}
		</div>
	);
}
