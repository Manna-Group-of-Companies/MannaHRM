import { patch, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { fmt, monthEnd, tidyDept, todayIso } from "@/lib/format";
import { fyOf } from "@/data/payroll";
import {
	LOAN_BY, LOAN_TYPES, LP_FLAGS, LP_STATUSES, LP_STATUS_CLIPPED, LP_STATUS_SEEN,
	PROJ_COLS, monthsBetween,
} from "@/data/loans";
import { Empty, Gap, Html, Note, Scroll, SpecTable } from "@/components/ui";

/* Loans → Loan Projection, photographed 29 August 2026 and drawn here control
   for control: Employee Status, Particular Employee, From and Till Date, Loan
   Type, Filter By, two checkboxes, and their three buttons.

   **This is the first Loans screen anybody here has seen past the menu**, and
   it answers two of the five questions §26 of docs/FACTOHR_SCREENS.md ends on.
   Their Loan Type box reads *Salary Advance, Tour Advance* — both advances,
   which is the closest thing to an answer we hold on whether Manna lends. And
   Interest is a checkbox that is switched off, which is the difference between
   `Employee Advance` and the whole `lending` app.

   Nothing on this site can hold a loan, so Generate cannot produce a figure and
   does not pretend to. What it can produce is the *shape*: the window their
   dates ask for, unfolded month by month, against the loan types their box
   selects — which is exactly the report somebody has to fill, and it is easier
   to argue about a table with the columns in it than a paragraph about one. */

/** Their From Date, resolved rather than seeded — a literal 01-Apr-2025 typed
    into this file is a stale default by October. The payroll year's April,
    because a recovery comes out of a payroll and the year they file against is
    the year it belongs to. */
const lpFrom = (f) => f.from || `${fyOf(todayIso()).slice(0, 4)}-04-01`;

/** Their Till Date. The end of this month, so the window closes on a whole
    payroll month — an instalment lands in a month, not on a date. */
const lpTill = (f) => f.till || monthEnd();

/** Who the projection covers. Every filter on the form is applied here, so the
    count under Generate and the scope line in the report cannot disagree. */
function lpPeople(s) {
	const f = s.lp;
	let pool = scoped(s);
	/* An empty status box is no filter rather than nobody. That is the safe
	   direction here — CLAUDE.md §4: leaving somebody out of a recovery schedule
	   is how a balance quietly stops being recovered, while listing one person
	   too many is a row a human reads. The box says which it means. */
	if (f.status.length) pool = pool.filter((e) => f.status.includes(e.status));
	if (f.emp) pool = pool.filter((e) => e.name === f.emp);
	return pool;
}

/** The projection's own columns. Principal and Interest come and go with their
    two checkboxes, which is the one thing on this form that changes the shape
    of the output rather than its contents. */
function lpCols(f) {
	const cols = [["Month", (r) => r.label, "mono"], ["Loan Type", (r) => r.type, ""]];
	cols.push(["Employees", () => "—", "mono gone"]);
	if (f.principal) cols.push(["Principal Due", () => "—", "mono gone"]);
	if (f.interest) cols.push(["Interest Due", () => "—", "mono gone"]);
	cols.push(["Closing Balance", () => "—", "mono gone"]);
	return cols;
}

/** One of their two multi-select boxes. The same control twice — Employee
    Status and Loan Type — so it is written once; `tools` is the green tick and
    red cross, which their Loan Type box carries and their status box does not. */
function ChipPick({ label, all, on, onPick, tools, hint, empty }) {
	const off = all.filter((v) => !on.includes(v));
	return (
		<div className="ddafield">
			<span className="lab">{label}</span>
			<div className="chips">
				{on.map((v) => (
					<span className="chip" key={v}>
						{v}
						<button aria-label={"Remove " + v} onClick={() => onPick(on.filter((x) => x !== v))}>
							×
						</button>
					</span>
				))}
				{/* An empty box does not mean the same thing in both of them, so it does
				    not say the same thing in both of them. See `empty`. */}
				{on.length ? null : <span className="text-ink-3 text-[.82rem]">{empty}</span>}
				{off.length ? (
					<select value="" aria-label={"Add to " + label}
						onChange={(e) => e.target.value && onPick(on.concat(e.target.value))}>
						<option value="">+ add</option>
						{off.map((v) => <option key={v}>{v}</option>)}
					</select>
				) : null}
				{tools ? (
					<span className="ml-auto inline-flex gap-[.1rem]">
						<button className="chiptool ok" title={"Select every " + label.toLowerCase()}
							aria-label={"Select every " + label.toLowerCase()}
							onClick={() => onPick(all.slice())}>✓</button>
						<button className="chiptool no" title={"Clear " + label.toLowerCase()}
							aria-label={"Clear " + label.toLowerCase()}
							onClick={() => onPick([])}>✗</button>
					</span>
				) : null}
			</div>
			{hint ? <span className="hint">{hint}</span> : null}
		</div>
	);
}

function LpForm({ s }) {
	const f = s.lp;
	const from = lpFrom(f);
	const till = lpTill(f);
	const picked = f.emp ? s.byName[f.emp] || null : null;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list. So touching one clears the last run
	   rather than leaving a stale schedule on screen under new criteria. */
	const stale = (part) => patch("lp", { ...part, run: false, msg: "" });

	/* Their people-picker: a search box, and the "…" beside it that opens the
	   list without typing. Both land on the same choice. */
	const pool = lpPeople({ ...s, lp: { ...f, emp: "" } });
	const q = (f.q || "").trim().toLowerCase();
	const hits = !picked && (q || f.pick)
		? pool
			.filter((e) => !q || [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 40)
		: [];

	return (
		<div className="fhscreen ddaform">
			<div className="fhtitle">Loan Projection</div>

			{/* Their dialog puts each label to the left of its control. Every form
			    here puts it above instead, for the reason already recorded on the
			    other report panels: at 390px a label beside a select is a select two
			    characters wide. */}
			<div className="ddapane">
				<div className="ddagrid">
					<ChipPick
						label="Employee Status"
						all={LP_STATUSES}
						on={f.status}
						onPick={(v) => stale({ status: v })}
						empty="— every status —"
						hint={
							<>
								Their box held <b>{LP_STATUS_SEEN.join(", ")}</b> and a fourth value clipped at the
								edge of the control, beginning &ldquo;{LP_STATUS_CLIPPED}&rdquo;.{" "}
								<code>Employee.status</code> has no temporary anything on it, so the word is left
								unguessed rather than mapped to something it may not be. <b>Left</b> is offered here
								and was not in their box — 344 people have left, and what happens to a balance when
								somebody does is the question this module ends on.
							</>
						}
					/>

					<div className="ddafield">
						<span className="lab">Particular Employee</span>
						<div className="flex gap-[.35rem] items-center">
							<span className="find rev grow border border-line-ctl rounded px-2 py-[.1rem] bg-white">
								<input
									type="search"
									className="border-0 px-[.1rem] py-[.28rem] min-w-0 grow"
									placeholder="Type to search"
									aria-label="Search employee"
									value={picked ? `${picked.employee_name} (${picked.employee_number || picked.name})` : f.q}
									/* Typing over a chosen name clears the choice — otherwise the
									   box says one person and the projection runs for another. */
									onChange={(e) => stale({ emp: "", q: e.target.value })}
								/>
							</span>
							{/* Their "…", which opens the list rather than filtering it. */}
							<button className="embtn ic" aria-expanded={f.pick} aria-label="Choose from the list"
								title="Open the list instead of typing — everybody the status filter allows."
								onClick={() => patch("lp", { pick: !f.pick, emp: "", run: false, msg: "" })}>
								…
							</button>
						</div>
						{hits.length ? (
							<div className="regfind">
								{hits.map((e) => (
									<button key={e.name} onClick={() => stale({ emp: e.name, q: "", pick: false })}>
										<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
										<b>{e.employee_name}</b>
										<span className="mono">{e.employee_number || "—"}</span>
										<span className="muted">{tidyDept(e.department)}</span>
									</button>
								))}
								<button onClick={() => stale({ emp: "", q: "", pick: false })}>
									<span className="muted">— everybody matching the filters —</span>
								</button>
							</div>
						) : (q || f.pick) && !picked ? (
							<div className="regfind">
								<span className="none">
									Nobody matches, out of {fmt(pool.length)} the status filter allows.
								</span>
							</div>
						) : null}
					</div>

					<div className="ddafield">
						<span className="lab">From Date</span>
						<span className="daterange">
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
								strokeWidth="1.7">
								<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
							</svg>
							<input type="date" value={from} aria-label="From date"
								onChange={(e) => stale({ from: e.target.value })} />
						</span>
					</div>

					<div className="ddafield">
						<span className="lab">Till Date</span>
						<span className="daterange">
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
								strokeWidth="1.7">
								<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
							</svg>
							<input type="date" value={till} aria-label="Till date"
								onChange={(e) => stale({ till: e.target.value })} />
						</span>
						{/* Their window opened seventeen months before the day it was
						    captured, which is the finding their two dates carry. */}
						<span className="hint">
							Their window ran <b>01-Apr-2025 to 31-Aug-2026</b> on a form captured on 29 August
							2026 — most of it already paid. <b>So this is not a forecast</b>: it prints every
							instalment in a window, behind and ahead alike, and &ldquo;projection&rdquo; is their
							word for a schedule.
						</span>
					</div>

					<ChipPick
						label="Loan Type"
						all={LOAN_TYPES}
						on={f.types}
						onPick={(v) => stale({ types: v })}
						empty="nothing selected"
						tools
						hint={
							<>
								<b>Both of theirs are advances.</b> Not a list of what Factor HR offers — that
								dropdown was never opened — but of what somebody actually selected, which is better
								evidence: these are the two an employer recovers out of payroll rather than the two
								an employer charges for.
							</>
						}
					/>

					<div className="ddafield">
						<span className="lab">Filter By</span>
						<select value={f.by} aria-label="Filter by"
							onChange={(e) => stale({ by: e.target.value })}>
							{LOAN_BY.map((b) => (
								<option key={b[0]} value={b[0]}>{b[0] ? b[1] : ""}</option>
							))}
						</select>
						<span className="hint">Empty in their capture, and empty here.</span>
					</div>
				</div>

				<div className="ddafield">
					<span className="lab">&nbsp;</span>
					<div className="flex flex-wrap gap-x-[1.4rem] gap-y-[.4rem]">
						{LP_FLAGS.map((o) => (
							<label className="chk" key={o[0]}>
								<input type="checkbox" checked={!!f[o[0]]}
									onChange={(e) => patch("lp", { [o[0]]: e.target.checked, run: false, msg: o[3] })} />
								{o[1]}
							</label>
						))}
					</div>
					<span className="hint">
						Principal ticked and Interest clear, as their capture had them. The two boxes are the
						cheapest question on this page: an interest-free advance is a deduction component and a
						schedule, and interest is the <code>lending</code> app.
					</span>
				</div>

				{/* Their three buttons, in their order. */}
				<div className="flex flex-wrap gap-[.4rem] items-center">
					<button className="embtn pri" onClick={() => patch("lp", { run: true, msg: "" })}>
						Generate
					</button>
					<button className="embtn"
						title="Put every control back to the state their capture found it in."
						onClick={() => patch("lp", {
							/* Reset restores *the capture*, by construction — the defaults are
							   read off the same constants the form is drawn from, so a value
							   corrected in `data/loans.js` cannot leave this button behind. */
							status: [...LP_STATUS_SEEN], emp: "", q: "", pick: false, from: "", till: "",
							types: LOAN_TYPES.slice(), by: "",
							principal: LP_FLAGS[0][2], interest: LP_FLAGS[1][2],
							run: false,
							msg: "Back to the form as it was photographed — their statuses, both loan types, "
								+ "Principal on and Interest off. The dates go back to being resolved from the "
								+ "clock rather than to their literal 01-Apr-2025, which would be a stale default "
								+ "by October.",
						})}>
						Reset Fields
					</button>
					<button className="embtn"
						title="Their form is a dialog over the list, so Close puts the form away. This page is the form, so it puts the report away instead."
						onClick={() => patch("lp", {
							run: false,
							msg: "<b>Close puts the report away, not the form.</b> Theirs is a dialog over a list "
								+ "and closing it goes back to the list. There is no list behind this one — the "
								+ "page <i>is</i> the form — so the nearest honest thing is to put back what "
								+ "Generate produced.",
						})}>
						Close
					</button>
				</div>

				{f.msg && <Note><Html html={f.msg} /></Note>}
			</div>
		</div>
	);
}

/** What Generate produced: the window unfolded, month by month, against the
    selected loan types. Every figure in it is blank, and each is blank for a
    reason the page names rather than footnotes. */
function LpOut({ s }) {
	const f = s.lp;
	const from = lpFrom(f);
	const till = lpTill(f);
	const months = monthsBetween(from, till);
	const people = lpPeople(s);
	const cols = lpCols(f);

	if (!months.length) {
		return (
			<Empty title="The window is empty">
				From {from} is after Till {till}, so there is no payroll month between them. Their form takes
				two dates; an instalment lands in a month, so a window that closes before it opens has
				nothing to unfold.
			</Empty>
		);
	}
	if (!f.types.length) {
		return (
			<Empty title="No loan type is selected">
				The red cross clears the box, and an empty box is a projection over nothing. Their two are{" "}
				{LOAN_TYPES.join(" and ")}; the green tick puts them both back.
			</Empty>
		);
	}
	if (!people.length) {
		return (
			<Empty title="Nobody is in scope">
				No employee matches the status filter. That is the filter, not the loans — the projection
				would have covered whoever it allowed.
			</Empty>
		);
	}

	const rows = months.flatMap(([ym, label]) =>
		f.types.map((type) => ({ ym, label, type })));

	return (
		<div className="ddaout">
			<div className="ddacount">
				{fmt(people.length)} employee{people.length === 1 ? "" : "s"} in scope
				{f.status.length ? "" : ", every status"} ·{" "}
				{fmt(months.length)} payroll month{months.length === 1 ? "" : "s"} ·{" "}
				{f.types.join(", ")}
			</div>

			<Scroll>
				<table className="io" style={{ minWidth: 110 * cols.length }}>
					<thead>
						<tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.ym + r.type}>
								{cols.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<Gap>
				<b>The months are real and every figure between them is not.</b> The window, the loan types
				and the columns are the ones the form asked for — that much is arithmetic on the controls.
				What cannot be filled is anything about a loan: no doctype on this site can hold one, so
				there is no sanctioned amount to divide, no disbursement to schedule against and no
				recovery to subtract. <b>Blank rather than zero</b>: a zero here reads as an instalment
				somebody has already paid.
			</Gap>

			{!f.principal && !f.interest && (
				<Note>
					<b>Both boxes are clear, so the report has no value column at all</b> — only the schedule
					it would have hung them on. Their form presumably refuses this; ours draws it, because a
					projection with nothing in it is the clearest possible statement of what the two boxes do.
				</Note>
			)}

			<Note>
				<b>Nothing here needs payroll to have started — it needs a loan to exist.</b> That is the
				difference between this page and the payroll reports next door, which are waiting on a
				salary structure. This one is waiting on a decision: whether Manna lends or only advances,
				and whether the balances that are already running get loaded or written off. Neither is a
				build. See <code>docs/FACTOHR_SCREENS.md</code> §26.
			</Note>
		</div>
	);
}

export default function LoanProjection() {
	const s = useApp();

	return (
		<>
			<div className="legend">
				<b className="font-display">Loan Projection</b>
				<span className="cov part">Form captured 29 Aug 2026</span>
				<span>
					Recovery month by month. This one is an <b>output</b>, not a record — but their form is
					the first Loans screen anybody has seen past the menu, and it answers two questions the
					module had left open.
				</span>
			</div>

			<LpForm s={s} />

			{s.lp.run && <LpOut s={s} />}

			<div className="fhtitle mt-4">What a projection row has to carry</div>
			<div className="mt-2">
				<SpecTable cols={["Column", "What it is", "State", "Note"]} list={PROJ_COLS} />
			</div>

			<div className="mt-[.7rem]">
				<Gap>
					<b>Two of §26&rsquo;s five open questions now have an answer, and both came off this one
					form.</b> The loan types in use are <b>Salary Advance</b> and <b>Tour Advance</b> — both
					advances — and <b>Interest is a box somebody left unticked</b>. If that holds, Loans is a
					deduction component and a schedule against <code>Employee Advance</code>, which stayed in
					hrms. If it does not, it is the <code>lending</code> app: a third{" "}
					<code>bench get-app</code> and an accounting build behind it. That is the whole spread of
					the estimate, and one screenshot of their Loan Application would close it.
				</Gap>
			</div>

			<div className="mt-[.7rem]">
				<Gap>
					<b>What is still missing is an export, not a build.</b> None of the nine Factor HR
					exports carries a loan report, so no outstanding balance is held for any running loan.
					Outstanding is <code>disbursed − recovered</code> and we hold neither side of that
					subtraction — it cannot be derived, only loaded. Ask for the loan register the way the
					Leave Balance Report was asked for.
				</Gap>
			</div>
		</>
	);
}
