import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { scoped } from "@/lib/scope";
import { dmy, fmt, tidyDept, ymd } from "@/lib/format";
import { Empty, Gap, Html, Note, Scroll, SpecTable } from "@/components/ui";
import {
	LOAN_BY, LOAN_CAPTURE, LOAN_REPORT_TYPES, LOAN_TYPES, LP_STATUSES, LP_STATUS_CLIPPED,
	LP_STATUS_SEEN, REGISTER_COLS, monthsBetween,
} from "@/data/loans";

/* Loans → Loan Register. Their criteria panel, photographed 29 Aug 2026 and
   drawn control for control: nine fields down one column and three buttons
   under them. Generate is the whole model, as on Statutory Reports and Prof.
   Tax — nothing is listed until it is pressed, and touching a control puts the
   last run away rather than leaving a stale report above a changed form.

   **What it generates is not their register, and does not pretend to be.**
   Nothing on this site can hold a loan: `Loan` moved out of hrms into a
   separate `lending` app on v15, hrms is not installed here anyway, and no
   payroll doctype is on the proxy allowlist. So every cell of the recovery grid
   is empty, and the grid is drawn at full size rather than replaced by a
   sentence — the shape of what has to be filled is the deliverable, and a
   report that quietly shrinks to fit what it can answer hides how much of it is
   missing.

   Two things on it *are* real: how many people the criteria leave in scope, and
   the month columns, which come off the date range. Both are labelled as what
   they are.

   The findings are in the form rather than in anything this page computes, and
   one of them is that the form is barely a second form: swap Report Type and
   Exclude Zero Balance Loans for Include Principal and Include Interest and
   this *is* the Loan Projection panel. See the LOAN REGISTER block in
   data/loans.js. */

/** From and Till, resolved. Their capture read 01-Apr-2025 to 31-Aug-2026: the
    start of the fiscal year before last, to the end of the current month. Held
    empty in the store and worked out here so a tab left open overnight does not
    sit on yesterday's range. */
function lregRange(f) {
	const now = new Date();
	const fyStart = now.getFullYear() - (now.getMonth() < 3 ? 1 : 0);
	/* `ymd`, not toISOString: this runs at UTC+5:30, where the last day of the
	   month is still the day before in UTC and the range would end a day early. */
	return [
		f.from || `${fyStart - 1}-04-01`,
		f.till || ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
	];
}

/* The month walk is `monthsBetween` in data/loans.js, written for the Loan
   Projection form off the same 01-Apr-2025 window. Two reports over one range
   must not each round a part-month their own way. */

/** Everybody the criteria leave in scope. This is the one population on the
    page that is read rather than assumed, and every count under the form says
    so where it is drawn. */
function lregPool(s) {
	const f = s.lreg;
	const q = (f.emp || "").toLowerCase().trim();
	return scoped(s).filter((e) => {
		if (f.status.length && !f.status.includes(e.status || "")) return false;
		if (q) {
			const hay = `${e.employee_number || ""} ${e.employee_name || ""} ${e.name}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

/** Headcount per value of one field, biggest first — what Filter By and Group
    By can honestly section today. They are meant to section the recovery grid;
    with no recovery to section, they section the population it would have been
    recovered from, and the page says that is what happened. */
function lregBreak(pool, key) {
	const m = new Map();
	for (const e of pool) {
		const k = (key === "department" ? tidyDept(e.department) : e[key]) || "—";
		m.set(k, (m.get(k) || 0) + 1);
	}
	return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function LregForm({ s }) {
	const f = s.lreg;
	const [from, till] = lregRange(f);

	/* Every control changes what Generate *would* list, so touching one clears
	   the last run rather than leaving a stale report under new criteria. */
	const stale = (part) => {
		patch("lreg", part);
		set({ lregRun: false, lregMsg: "" });
	};

	const toggle = (k, v) =>
		stale({ [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : f[k].concat(v) });

	function button(k) {
		if (k === "generate") {
			if (!f.types.length) {
				return set({
					lregMsg: "<b>No loan type is ticked</b>, so there is nothing to report on. Their green tick "
						+ "and red cross beside that box are the two shortcuts for exactly this.",
				});
			}
			return set({ lregRun: true, lregMsg: "" });
		}
		if (k === "reset") {
			return set({
				lreg: {
					status: [...LP_STATUS_SEEN], emp: "", pick: false, from: "", till: "",
					types: [...LOAN_TYPES], by: "", gby: "", type: LOAN_REPORT_TYPES[0], zero: false,
				},
				lregRun: false, lregMsg: "Fields reset — back to the values their capture held.",
			});
		}
		if (k === "close") return go({ lregRun: false, lregMsg: "", subtab: "all" });
		if (k === "pick") return patch("lreg", { pick: !f.pick });
	}

	const ACTS = [["generate", "▤ Generate"], ["reset", "↺ Reset Fields"], ["close", "✕ Close"]];

	return (
		<div className="repform">
			<div className="repgrid">
				<label>Employee Status:</label>
				<span className="ctl">
					{LP_STATUSES.map((v) => (
						<label className="chk" key={v}>
							<input type="checkbox" checked={f.status.includes(v)}
								onChange={() => toggle("status", v)} />
							{v}
						</label>
					))}
					<span className="hint">
						theirs read <b>Active, Inactive, Suspended, {LP_STATUS_CLIPPED}</b> and was cut off
						there — and this site has no status starting "Tempo"
					</span>
				</span>

				<label htmlFor="lregemp">Particular Employee:</label>
				<span className="ctl">
					<input id="lregemp" type="text" className="wide" placeholder="Type to search" value={f.emp}
						onChange={(e) => stale({ emp: e.target.value })} />
					<button className="dots" title="Pick from the list" onClick={() => button("pick")}>…</button>
				</span>
				{f.pick && (
					<>
						<span />
						<span className="ctl">
							{/* Capped at 400: this is a picker, and a select with every employee in
							    it is a scroll rather than a choice. Typing in the box above reaches
							    the rest. */}
							<select size={8} className="wide" aria-label="Pick an employee" value={f.emp}
								onChange={(e) => {
									patch("lreg", { emp: e.target.value, pick: false });
									set({ lregRun: false });
								}}>
								<option value="">— clear —</option>
								{s.employees.slice(0, 400).map((e) => (
									<option key={e.name} value={e.employee_number || e.name}>
										{`${e.employee_number || e.name}  ${e.employee_name || ""}`}
									</option>
								))}
							</select>
						</span>
					</>
				)}

				<label htmlFor="lregfrom">From Date:</label>
				<span className="ctl">
					<input id="lregfrom" type="date" value={from}
						onChange={(e) => stale({ from: e.target.value })} />
					<span className="hint">
						theirs read {dmy(LOAN_CAPTURE.from)} — the start of the fiscal year before last
					</span>
				</span>

				<label htmlFor="lregtill">Till Date:</label>
				<span className="ctl">
					<input id="lregtill" type="date" value={till}
						onChange={(e) => stale({ till: e.target.value })} />
					<span className="hint">
						theirs read {dmy(LOAN_CAPTURE.till)} — the end of the month it was taken in
					</span>
				</span>

				<label>Loan Type:</label>
				<span className="ctl">
					{LOAN_TYPES.map((v) => (
						<label className="chk" key={v}>
							<input type="checkbox" checked={f.types.includes(v)}
								onChange={() => toggle("types", v)} />
							{v}
						</label>
					))}
					{/* Their green tick and red cross sit against this box and nothing else
					    on the form. Against a multi-select, all and none is what a tick and
					    a cross have to mean. */}
					<button className="dots" title="Tick both" aria-label="Select every loan type"
						onClick={() => stale({ types: [...LOAN_TYPES] })}>✓</button>
					<button className="dots" title="Clear both" aria-label="Clear the loan types"
						onClick={() => stale({ types: [] })}>✕</button>
					<span className="hint">
						<b>both of theirs are advances, not loans</b> — the whole shape of this module
					</span>
				</span>

				<label htmlFor="lregby">Filter By:</label>
				<span className="ctl">
					<select id="lregby" className="wide" value={f.by}
						onChange={(e) => stale({ by: e.target.value })}>
						{LOAN_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">empty in the capture and never opened; ours are the six fields</span>
				</span>

				<label htmlFor="lreggby">Group By:</label>
				<span className="ctl">
					<select id="lreggby" className="wide" value={f.gby}
						onChange={(e) => stale({ gby: e.target.value })}>
						{LOAN_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">
						two grouping controls on one form, which is their habit — Daily Detail and the Leave
						Balance Report carry the same pair
					</span>
				</span>

				<label htmlFor="lregtype">Report Type:</label>
				<span className="ctl">
					<select id="lregtype" className="wide" value={f.type}
						onChange={(e) => stale({ type: e.target.value })}>
						{LOAN_REPORT_TYPES.map((v) => <option key={v}>{v}</option>)}
					</select>
					<span className="hint">
						one value, and the list was never opened. <b>The value is the evidence</b>: a month wise
						recovery report only exists if recovery runs over months
					</span>
				</span>
			</div>

			<div className="repchecks">
				<label className="chk">
					<input type="checkbox" checked={f.zero}
						onChange={(e) => {
							stale({ zero: e.target.checked });
							/* The answer arrives where the question was asked, and only on the
							   way in — unticking a box is not a question. */
							if (e.target.checked) {
								set({
									lregMsg: "<b>Every balance here is zero</b>, because there is no loan on this site to "
										+ "hold one — so ticking this empties the report completely. It is left drawn and "
										+ "left working rather than disabled: the day a balance exists, this is the box "
										+ "that hides a loan somebody has finished paying, and it is the difference "
										+ "between a register and a history.",
								});
							}
						}} />
					Exclude Zero Balance Loans
				</label>
			</div>

			<div className="repacts">
				{ACTS.map((a) => (
					<button key={a[0]} className={"btn " + (a[0] === "generate" ? "imp" : "ghost")}
						onClick={() => button(a[0])}>
						{a[1]}
					</button>
				))}
			</div>

			{s.lregMsg && <div className="mt-[.8rem]"><Note><Html html={s.lregMsg} /></Note></div>}
		</div>
	);
}

/** What Generate produced: the recovery grid at full size, empty, over a
    population that is real. */
function LregOut({ s }) {
	const f = s.lreg;
	const [from, till] = lregRange(f);
	const months = monthsBetween(from, till);
	const pool = lregPool(s);

	if (!months.length) {
		return (
			<Empty title="The range runs backwards">
				Till Date is before From Date, so there is no month between them to recover in.
			</Empty>
		);
	}
	if (f.zero) {
		return (
			<Empty title="Nothing is left">
				<b>Exclude Zero Balance Loans</b> is ticked and every balance on this site is zero — because
				there is no loan on it at all. Untick it to see the grid the report would fill.
			</Empty>
		);
	}

	const cols = f.types;
	const breakKey = f.gby || f.by;

	return (
		<>
			<div className="ddacount">
				0 recoveries · {months[0][1]} – {months[months.length - 1][1]}
				{" "}· {fmt(months.length)} month{months.length === 1 ? "" : "s"} · {f.type}
				{" "}· {fmt(pool.length)} employee{pool.length === 1 ? "" : "s"} in scope
			</div>

			<Scroll>
				<table className="io" style={{ minWidth: 120 * (cols.length + 2) }}>
					<thead>
						<tr>
							<th>Month</th>
							{cols.map((c) => <th key={c}>{c}</th>)}
							<th>Total</th>
						</tr>
					</thead>
					<tbody>
						{months.map((m) => (
							<tr key={m[0]}>
								<td className="mono">{m[1]}</td>
								{cols.map((c) => <td key={c} className="mono gone">—</td>)}
								<td className="mono gone">—</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr className="grp">
							<td>Recovered</td>
							{cols.map((c) => <td key={c} className="mono gone">—</td>)}
							<td className="mono gone">—</td>
						</tr>
					</tfoot>
				</table>
			</Scroll>

			<Gap>
				<b>Every cell is empty and the months are real.</b> The columns come off the date range on the
				form, so the grid is the size their report would be — {fmt(months.length)} months across{" "}
				{cols.length === 1 ? "one loan type" : `${cols.length} loan types`}. What cannot be put in it
				is a recovery: an advance is recovered by a payroll deduction, no payroll doctype is on the
				proxy's allowlist, and this site holds no advance to recover in the first place. Those are two
				separate reasons and fixing one would not be enough.
			</Gap>

			{breakKey ? (
				<>
					<div className="fhtitle mt-2">
						{f.gby ? "Group By" : "Filter By"} — {(LOAN_BY.find((b) => b[0] === breakKey) || [])[1]}
					</div>
					<Scroll>
						<table>
							<thead>
								<tr><th>{(LOAN_BY.find((b) => b[0] === breakKey) || [])[1]}</th><th>People in scope</th></tr>
							</thead>
							<tbody>
								{lregBreak(pool, breakKey).map((r) => (
									<tr key={r[0]}>
										<td>{r[0]}</td>
										<td className="mono">{fmt(r[1])}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
					<Gap>
						These two controls are meant to section the recovery grid. With no recovery to section
						they section the population it would have been recovered <em>from</em>, which is the one
						thing under this form that is read off the site. Both are shown when both are set,
						outer first, the way the other reports here stack them.
					</Gap>
				</>
			) : null}

			<div className="fhtitle mt-2">What the register needs, column by column</div>
			<SpecTable
				cols={["Column", "Where it would come from", "State", "Note"]}
				list={REGISTER_COLS}
			/>
		</>
	);
}

export default function LoanRegister() {
	const s = useApp();

	return (
		<>
			<div className="legend">
				<b className="font-display">Loan Register</b>
				<span className="cov part">Their form, empty grid</span>
				<span>
					Their criteria panel, control for control off the capture of 29 August 2026. The scope and
					the months are real; every recovery figure is empty, because nothing on this site can hold
					a loan.
				</span>
			</div>

			<Note>
				<b>This is the Loan Projection form with two controls swapped.</b> Same clipped status box,
				same two loan types — <b>Salary Advance</b> and <b>Tour Advance</b>, both advances rather than
				loans — and the same seventeen-month window. Include Principal and Include Interest are gone;
				Report Type, Group By and Exclude Zero Balance Loans stand where they were. So the two Loans
				reports are one query with a Report Type on it, which is worth knowing before either is quoted
				as a separate build. What this capture adds is that Report Type reads{" "}
				<b>Month Wise Recovery</b>: recovery runs over months, and an <code>Employee Advance</code>{" "}
				carries no schedule. That gap is the build.
			</Note>

			<LregForm s={s} />

			{s.lregRun && <LregOut s={s} />}
		</>
	);
}
