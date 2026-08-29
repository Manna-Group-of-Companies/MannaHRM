import { patch, set, useApp } from "@/state/store";
import { scoped } from "@/lib/scope";
import { dmy, fmt, tidyDept, todayIso, ymd } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { deskUrl } from "@/lib/desk";
import {
	LOAN_FIELDS, LOAN_INTEREST, LOAN_SCHED_COLS, LOAN_TABS, LOAN_TYPES, PERK_EXEMPT,
} from "@/data/loans";
import { Desk, Empty, Gap, Html, Note, Scroll, SpecTable, panelProps, tabProps } from "@/components/ui";

/* Loans → Loan Application, photographed 29 August 2026 and drawn here control
   for control: the three buttons and Data Import on the bar, their five tabs,
   the two columns of the form with the four mandatory fields shaded as they
   shade them, the attachment box, and the amortization grid with its two
   spanned column groups.

   Nothing on this page writes. There is no loan doctype on this site to write
   to — `hrms` is not installed, and on v15 and later Loan Management is not
   part of it anyway (§26) — so the form is a specification that can be filled
   in and read back, not a record.

   **What it does do is the one thing on this screen that is arithmetic rather
   than storage: the schedule.** Their Loan Amortization button builds one, and
   a schedule is a pure function of an amount, a rate and a term. Working it
   here costs nothing, needs no site, and answers the question the four
   Perquisites columns are really asking — which is what an interest-free
   advance costs the person who takes it, in tax. Nothing in `hrms` and nothing
   in the `lending` app computes that.

   Two things on this page are ours and are drawn apart from their form for that
   reason: the rate and the term, which are not on their form at all because
   they come off the Loan Type master, and the State Bank rate the perquisite is
   valued at, which is a notification nobody here holds. See `data/loans.js`. */

const num = (v) => {
	const n = Number(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
	return isFinite(n) ? n : 0;
};

/** Two decimals, grouped — the way their grid writes 0.00. */
const amt = (v) => (v == null || !isFinite(v)
	? ""
	: Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** The same day of the month, k months on, clamped to the month's length — a
    loan disbursed on the 31st is recovered on the 28th of February, not on the
    3rd of March. */
function addMonths(iso, k) {
	const [y, m, d] = iso.split("-").map(Number);
	const t = new Date(y, m - 1 + k, 1);
	t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
	return ymd(t);
}

/** The schedule their Loan Amortization button draws.

    One row per instalment: what is repaid, what is still owed after it, and
    what the month is worth as a perquisite. Rounding is absorbed by the last
    row rather than spread, so the principal column sums to the sanctioned
    amount exactly — a schedule that is eleven paise short of the loan is a
    schedule somebody has to reconcile by hand.

    Returns null until there is enough on the form to compute anything, because
    a grid of zeros that looks computed is worse than the empty one theirs
    shows. */
function schedule(f) {
	const p = num(f.sanctioned) || num(f.requested);
	const n = Math.floor(num(f.months));
	if (!p || !n) return null;

	/* Capped rather than validated: 600 months is fifty years and already
	   absurd, and a mistyped term must not hand the browser a million rows. The
	   page says when it has capped. */
	const capped = Math.min(n, 600);
	const annual = f.interest === "free" ? 0 : num(f.rate);
	const r = annual / 1200;
	const flat = f.interest === "flat";
	const start = f.start || f.date || todayIso();

	/* Rule 3(7)(i) exempts an aggregate at or under ₹20,000 outright, so the
	   perquisite columns are nil rather than small. Drawn as zeros with the
	   reason on the page, not left blank: blank reads as "not computed". */
	const perkRate = p <= PERK_EXEMPT ? 0 : num(f.perk);

	const flatInt = flat ? p * (annual / 100) * (capped / 12) : 0;
	const level = flat
		? (p + flatInt) / capped
		: r
			? (p * r * Math.pow(1 + r, capped)) / (Math.pow(1 + r, capped) - 1)
			: p / capped;

	const rows = [];
	let bal = p;
	for (let i = 0; i < capped; i++) {
		const last = i === capped - 1;
		const opening = bal;
		const int = flat ? flatInt / capped : opening * r;
		let prin = last ? opening : Math.min(flat ? p / capped : level - int, opening);
		if (prin < 0) prin = 0;
		bal = Math.max(0, opening - prin);
		rows.push({
			n: i + 1,
			due: addMonths(start, i),
			prin, int,
			emi: prin + int,
			balPrin: bal,
			/* The perquisite is valued on the *maximum outstanding monthly
			   balance*, which is the balance before this instalment lands. */
			perkOn: opening,
			perkVal: (opening * perkRate) / 1200,
		});
	}

	/* Interest still to come, filled backwards — the Loan Balance group's second
	   column is what is left, not what has been paid, so it can only be known
	   once the whole schedule exists. */
	let ahead = 0;
	for (let i = rows.length - 1; i >= 0; i--) {
		rows[i].balInt = ahead;
		ahead += rows[i].int;
		rows[i].balTot = rows[i].balPrin + rows[i].balInt;
		rows[i].perkAmt = Math.max(0, rows[i].perkVal - rows[i].int);
	}

	const tot = (k) => rows.reduce((a, x) => a + x[k], 0);
	return {
		rows, capped, over: n > capped, level, exempt: p <= PERK_EXEMPT, perkRate, p,
		totals: { prin: tot("prin"), int: tot("int"), emi: tot("emi"), perkAmt: tot("perkAmt") },
	};
}

/** Their grid's header is two rows deep: three plain columns of ours, four
    theirs, then LOAN BALANCE over three and PERQUISITES over four. Built from
    the column list so the two header rows and the body cannot disagree about
    how many columns there are. */
function schedGroups() {
	const out = [];
	for (const c of LOAN_SCHED_COLS) {
		const g = c[3];
		const tail = out[out.length - 1];
		if (g && tail && tail.g === g) tail.cols.push(c);
		else out.push({ g, cols: [c] });
	}
	return out;
}

function schedCsv(f, sch) {
	const cols = LOAN_SCHED_COLS.map((c) => (c[3] ? `${c[3]} — ${c[0]}` : c[0]));
	download(
		"loan-amortization-" + todayIso() + ".csv",
		toCsv(cols, sch.rows.map((r) => LOAN_SCHED_COLS.map((c) => {
			if (c[1] === "n") return String(r.n);
			if (c[1] === "due") return r.due;
			if (c[1] === "manual") return "";
			if (c[1] === "perkRate") return String(sch.perkRate);
			return (r[c[1]] ?? 0).toFixed(2);
		}))),
	);
}

/* ---------------------------------------------------------------------------
   The form
   --------------------------------------------------------------------------- */

const RESET = {
	no: "", emp: "", q: "", pick: false, type: "", requested: "", sanctioned: "",
	purpose: "", date: "", start: "", pay: "", required: "", status: "", account: "",
	done: false, noauto: false, doneOn: "",
	interest: "free", rate: "", months: "", perk: "",
	tab: "application", run: false, msg: "",
};

/** One of their fields. `req` draws the yellow their form uses to mark a
    mandatory one — copied because it is the only thing on that screen telling
    somebody which four fields it will refuse to save without. */
function Fld({ id, label, req, children, hint }) {
	return (
		<>
			<label htmlFor={id}>{label}:</label>
			<span className="ctl">
				{children}
				{req ? <span className="hint" title="Shaded yellow on their form">required</span> : null}
				{hint ? <span className="hint">{hint}</span> : null}
			</span>
		</>
	);
}

const YELLOW = "bg-[#FBFBDE]";

function LoanForm({ s }) {
	const f = s.la;
	const emp = f.emp ? s.byName[f.emp] : null;
	const q = (f.q || "").trim().toLowerCase();

	/* Touching anything invalidates the schedule under it, the same way Generate
	   works on every report here. A schedule left on screen under a changed
	   amount is a repayment plan for a loan nobody applied for. */
	const stale = (part) => patch("la", { ...part, run: false });

	const matches = q && !emp
		? scoped(s)
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	const text = (k, extra) => ({
		id: "la-" + k,
		value: f[k],
		onChange: (e) => stale({ [k]: e.target.value }),
		...extra,
	});

	return (
		<div className="repform">
			<div className="grid gap-x-[2.2rem] md:grid-cols-2">
				<div className="repgrid content-start">
					<Fld id="la-no" label="Loan #" req>
						<input className={"wide " + YELLOW} {...text("no")} placeholder="assigned on save" />
					</Fld>

					<label htmlFor="la-q">Employee:</label>
					<span className="ctl">
						{emp ? (
							<span className="regwho !p-0 !border-0 !shadow-none !bg-transparent">
								<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
								<b>{emp.employee_name}</b>
								<span className="mono">{emp.employee_number || "—"}</span>
								<span className="muted">{tidyDept(emp.department)}</span>
								<button className="embtn" onClick={() => stale({ emp: "", q: "" })}>Clear</button>
							</span>
						) : (
							<input id="la-q" type="search" className={"wide " + YELLOW} placeholder="Type to search"
								value={f.q} onChange={(e) => stale({ q: e.target.value })} />
						)}
					</span>

					{matches.length ? (
						<>
							<span />
							<span className="ctl">
								<span className="regfind w-[min(30rem,100%)]">
									{matches.map((e) => (
										<button key={e.name} onClick={() => stale({ emp: e.name, q: "" })}>
											<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
											<b>{e.employee_name}</b>
											<span className="mono">{e.employee_number || "—"}</span>
											<span className="muted">{tidyDept(e.department)}</span>
										</button>
									))}
								</span>
							</span>
						</>
					) : null}

					<Fld id="la-type" label="Loan Type" req
						hint="the two seen in use, off their Projection screen">
						<select className={"wide " + YELLOW} {...text("type")}>
							<option value="">Select loan type</option>
							{LOAN_TYPES.map((t) => <option key={t}>{t}</option>)}
						</select>
					</Fld>

					<Fld id="la-interest" label="Interest Type"
						hint="ours — their list has never been opened">
						<select className="wide" {...text("interest")}>
							{LOAN_INTEREST.map((i) => (
								<option key={i[0]} value={i[0]} title={i[2]}>{i[1]}</option>
							))}
						</select>
					</Fld>

					<Fld id="la-requested" label="Amount Requested">
						<input type="number" min="0" step="1" {...text("requested")} />
					</Fld>

					<Fld id="la-sanctioned" label="Sanctioned Amount"
						hint="what the schedule is computed on">
						<input type="number" min="0" step="1" {...text("sanctioned")} />
					</Fld>

					<label htmlFor="la-purpose">Details of Purpose:</label>
					<span className="ctl">
						<textarea id="la-purpose" rows={4} className="wide"
							value={f.purpose} onChange={(e) => stale({ purpose: e.target.value })} />
					</span>
				</div>

				<div className="repgrid content-start">
					<Fld id="la-date" label="Loan Date" req>
						<input type="date" className={YELLOW} {...text("date")} />
					</Fld>

					<Fld id="la-start" label="Deduction Start From" hint="the first payslip that carries one">
						<input type="date" {...text("start")} />
					</Fld>

					<Fld id="la-pay" label="Payment Date" hint="disbursement — when money moved">
						<input type="date" {...text("pay")} />
					</Fld>

					<Fld id="la-required" label="Loan Required For"
						hint="a tax field: medical treatment is exempt from the perquisite">
						<input type="text" className="wide" {...text("required")} />
					</Fld>

					<Fld id="la-status" label="Loan Status">
						<input type="text" className="wide" {...text("status")}
							placeholder="their list has never been opened" />
					</Fld>

					<Fld id="la-account" label="Loan Account No">
						<input type="text" className="wide" {...text("account")} />
					</Fld>

					<span />
					<span className="ctl flex-col items-start gap-[.35rem]">
						{/* Read-only on their form, so read-only here: it is set by the
						    schedule finishing, not by a person. */}
						<label className="chk off" title="Drawn read-only on their form — the schedule sets it, not a person.">
							<input type="checkbox" checked={f.done} disabled onChange={() => {}} />
							Loan Completed
						</label>
						<label className="chk">
							<input type="checkbox" checked={f.noauto}
								onChange={(e) => patch("la", { noauto: e.target.checked })} />
							Do not auto complete
						</label>
					</span>

					<Fld id="la-doneOn" label="Loan Completed On">
						<input type="date" {...text("doneOn")} />
					</Fld>
				</div>
			</div>

			{/* Their attachment box sits under both columns, boxed and labelled. */}
			<fieldset className="repset mt-[1.1rem] max-w-[440px]">
				<legend>Document Attachment</legend>
				<div className="repgrid">
					<label className="off">Loan Attachment:</label>
					<span className="ctl">
						<button className="btn ghost" onClick={() => patch("la", {
							msg: "<b>Their Browse writes a file.</b> Attaching one here would create a "
								+ "<code>File</code> row on the site and link it to a loan document that does not "
								+ "exist. This page proxies GET only — see <code>app/serve.js</code>.",
						})}>
							📁 Browse
						</button>
					</span>
				</div>
			</fieldset>
		</div>
	);
}

/** The two figures a schedule needs that their form does not carry, and the one
    the perquisite needs that nobody holds. Kept in a box of its own so it can
    never be mistaken for a copy of their screen. */
function OurBox({ s }) {
	const f = s.la;
	const stale = (part) => patch("la", { ...part, run: false });

	return (
		<div className="repform mt-[.7rem]">
			<div className="fhtitle">Not on their form</div>
			<div className="repgrid mt-[.7rem]">
				<label htmlFor="la-rate">Rate (% a year):</label>
				<span className="ctl">
					<input id="la-rate" type="number" min="0" step="0.01" value={f.rate}
						disabled={f.interest === "free"}
						onChange={(e) => stale({ rate: e.target.value })} />
					<span className="hint">
						{f.interest === "free"
							? "nothing charged, so no rate — and this is the case the perquisite is for"
							: "off the Loan Type master over there, and off Loan Product here"}
					</span>
				</span>

				<label htmlFor="la-months">Term (months):</label>
				<span className="ctl">
					<input id="la-months" type="number" min="1" step="1" value={f.months}
						onChange={(e) => stale({ months: e.target.value })} />
					<span className="hint">the instalment count — also off that master</span>
				</span>

				<label htmlFor="la-perk">Perquisite rate (%):</label>
				<span className="ctl">
					<input id="la-perk" type="number" min="0" step="0.01" value={f.perk}
						onChange={(e) => stale({ perk: e.target.value })} />
					<span className="hint">
						the State Bank rate for this kind of loan on 1 April — a notification, held nowhere here
					</span>
				</span>
			</div>

			<div className="mt-[.8rem]">
				<Gap>
					<b>Rate and term are not on their Loan Application at all</b>, which is not an omission:
					they belong to the loan <em>type</em>, and the type is the one field on that form shaded
					mandatory alongside the employee. ERPNext keeps them in the same place —{" "}
					<code>Loan Product</code> — so this is a rare case where the two systems already agree
					about where a number lives, and the migration is a master rather than a mapping.
				</Gap>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
   The amortization grid
   --------------------------------------------------------------------------- */

function Sched({ s }) {
	const f = s.la;
	const sch = f.run ? schedule(f) : null;
	const groups = schedGroups();
	const cols = LOAN_SCHED_COLS;

	const cell = (r, c) => {
		if (c[1] === "n") return r.n;
		if (c[1] === "due") return dmy(r.due);
		if (c[1] === "manual") {
			/* Their column is a tick box, and the tab at the top of this screen says
			   what ticking it means: an instalment typed instead of computed. */
			return <input type="checkbox" disabled checked={false} onChange={() => {}}
				title="Manual EMI Deduction — one month typed rather than computed. Their tab, and nothing here can write one." />;
		}
		if (c[1] === "perkRate") return sch.perkRate ? amt(sch.perkRate) : "0.00";
		return amt(r[c[1]]);
	};

	return (
		<>
			<div className="fhtitle row mt-[.9rem]">
				Loan Amortization
				<span className="ics">
					{sch ? (
						<button className="embtn" onClick={() => schedCsv(f, sch)}
							title="The schedule as computed, column for column, as CSV.">
							⬇ Export
						</button>
					) : null}
					<button className="embtn pri"
						onClick={() => patch("la", { run: true, msg: "" })}>
						⎘ Loan Amortization
					</button>
				</span>
			</div>

			<Scroll>
				<table className="io" style={{ minWidth: 1180 }}>
					<thead>
						<tr>
							{groups.map((g) => (g.g
								? <th key={g.g} colSpan={g.cols.length} className="text-center">{g.g}</th>
								: g.cols.map((c) => <th key={c[1]} rowSpan={2}>{c[0]}</th>)))}
						</tr>
						<tr>
							{groups.filter((g) => g.g).flatMap((g) => g.cols.map((c) => (
								<th key={c[1]}>{c[0]}</th>
							)))}
						</tr>
					</thead>
					<tbody>
						{sch ? (
							<>
								{sch.rows.map((r) => (
									<tr key={r.n}>
										{cols.map((c) => (
											<td key={c[1]} className={c[1] === "manual" ? undefined : "mono"}>
												{cell(r, c)}
											</td>
										))}
									</tr>
								))}
								<tr className="grp">
									<td colSpan={3}>Total — {fmt(sch.rows.length)} instalments</td>
									<td className="mono">{amt(sch.totals.int)}</td>
									<td />
									<td className="mono">{amt(sch.totals.emi)}</td>
									<td colSpan={6} />
									<td className="mono">{amt(sch.totals.perkAmt)}</td>
								</tr>
							</>
						) : (
							/* One row of zeros, which is exactly what their grid holds on an
							   unsaved form. Left as theirs rather than replaced with a
							   sentence: the shape of the grid is part of what was captured. */
							<tr>
								{cols.map((c) => (
									<td key={c[1]} className={c[1] === "manual" ? undefined : "mono"}>
										{c[1] === "manual"
											? <input type="checkbox" disabled checked={false} onChange={() => {}} />
											: c[1] === "n" || c[1] === "due" ? "" : "0.00"}
									</td>
								))}
							</tr>
						)}
					</tbody>
				</table>
			</Scroll>

			{sch ? (
				<div className="mt-[.7rem]">
					{sch.over ? (
						<Note>
							A term of {fmt(Math.floor(num(f.months)))} months was asked for and {fmt(sch.capped)}{" "}
							are drawn. Fifty years is already past anything an employer recovers from payroll, and
							a mistyped term must not be handed to the browser as a million rows.
						</Note>
					) : null}

					<Gap>
						<b>
							{sch.exempt
								? `Nil, because the loan is ₹${fmt(PERK_EXEMPT)} or less.`
								: sch.perkRate
									? `The perquisite over this schedule is ${amt(sch.totals.perkAmt)}.`
									: "The perquisite is not computed, because no rate has been given."}
						</b>{" "}
						Under sec 17(2)(viii) and Rule 3(7)(i) a loan given interest-free or under the notified
						rate is a taxable perquisite in the employee's hands: valued at the State Bank rate on
						the first day of the year, applied to the maximum outstanding balance each month, less
						any interest actually charged. It is exempt in two cases only — an aggregate at or under
						₹{fmt(PERK_EXEMPT)}, and treatment of a specified disease, which is what{" "}
						<b>Loan Required For</b> on their form decides.{" "}
						<b>Nothing in hrms or in the lending app computes this</b>, and an interest-free advance
						of ₹50,000 is not a kindness with no paperwork — it is salary, and it is TDS.
					</Gap>
				</div>
			) : (
				<div className="mt-[.7rem]">
					<Note>
						Their grid holds one row of zeros on an unsaved form, and so does this one. Fill in a
						sanctioned amount and a term, then press <b>Loan Amortization</b> — the schedule is
						arithmetic and needs no site, which is why it is the one thing on this page that works.
					</Note>
				</div>
			)}
		</>
	);
}

/* ---------------------------------------------------------------------------
   The screen
   --------------------------------------------------------------------------- */

export default function LoanApplication() {
	const s = useApp();
	const f = s.la;
	const tab = LOAN_TABS.find((t) => t[0] === f.tab) || LOAN_TABS[0];

	function bar(k) {
		if (k === "new") return set({ la: { ...RESET, msg: "Cleared. Their New does the same thing." } });
		if (k === "close") return set({ subtab: "all" });
		if (k === "search") {
			return patch("la", {
				msg: "<b>There is nothing to search.</b> Their Search finds a saved loan; no doctype on this "
					+ "site can hold one, so there are no rows to find — not an empty result, an absent table. "
					+ "The employee search on the form is live, because <code>Employee</code> is.",
			});
		}
		patch("la", {
			msg: "<b>Data Import needs a doctype to load into, and there is none.</b> When the "
				+ "<code>lending</code> app is installed that is <code>Loan</code>, and ERPNext's own import "
				+ "previews the file before it writes. Until then a loan import has nowhere to land — which is "
				+ "the same blocker as the missing loan register export in §26, arriving from the other end.",
		});
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">Loan Application</b>
				<span className="cov part">Their form, captured 29 Aug 2026</span>
				<span>
					Drawn control for control. <b>Nothing here writes</b> — there is no loan doctype on this
					site to write to. The schedule is the exception: it is arithmetic, so it runs.
				</span>
			</div>

			<div className="fhscreen">
				<div className="fhtitle row">
					Loan Application
					<span className="ics">
						<button className="embtn pri" onClick={() => bar("new")}>⊕ New</button>
						<button className="embtn" onClick={() => bar("search")}>🔍 Search</button>
						<button className="embtn" onClick={() => bar("close")}>✕ Close</button>
						<button className="embtn" onClick={() => bar("import")}>⬇ Data Import ▾</button>
					</span>
				</div>

				<div className="ddatabs" role="tablist" aria-label="Loan">
					{LOAN_TABS.map((t) => (
						<button key={t[0]} {...tabProps("latab-" + t[0], "lapane", f.tab === t[0])}
							title={t[2] ? "Photographed" : "Only the tab label has been seen"}
							onClick={() => patch("la", { tab: t[0], msg: "" })}>
							{t[1]}
							{t[2] ? null : <span className="cov none ml-[.4rem]">unread</span>}
						</button>
					))}
				</div>

				<div className="ddapane" {...panelProps("lapane", "latab-" + f.tab)}>
					{f.tab === "application" ? (
						<>
							<LoanForm s={s} />
							<OurBox s={s} />
							<Sched s={s} />
						</>
					) : (
						<>
							<Empty title={tab[1]}>
								Only the tab label has been seen. What follows is a reading of what that name has to
								mean here, not a copy of their screen.
							</Empty>
							<Gap><Html html={tab[3]} /></Gap>
						</>
					)}
				</div>

				{f.msg ? <Note><Html html={f.msg} /></Note> : null}
			</div>

			<div className="mt-4">
				<Gap>
					<b>The form carries a whole lending product; the two loan types in use are advances.</b>{" "}
					Interest Type, an amortization schedule, a balance split into principal and interest, and
					four perquisite columns — against a Projection screen next door run over{" "}
					<em>Salary Advance</em> and <em>Tour Advance</em> with Include Interest unticked. So the
					machinery is the vendor's and what Manna uses is some subset of it. That is still the open
					question from §26, and it is worth asking precisely, because the answer is a{" "}
					<b>setting</b> over there and an <b>app</b> over here: <code>Employee Advance</code> ships
					with hrms, and interest with a ledger behind it is the separate <code>lending</code> app.
				</Gap>

				<div className="mt-[.7rem]">
					<Gap>
						<b>Sanctioning happens on this form.</b> Amount Requested and Sanctioned Amount are two
						fields on one screen with Loan Status beside them, and none of the seven approval queues
						is a loan. §26 inferred that from the menu; the form confirms it. Whoever can open this
						screen can sanction — which is a policy question before it is a build, and it is the same
						question <code>Additional Salary</code> raises under Payroll.
					</Gap>
				</div>

				<div className="mt-[.7rem]">
					<Gap>
						<b>Four of the five tabs are the recovery lifecycle</b>, and every one of them is a way
						for the schedule and the payslip to stop agreeing: a repayment outside payroll, a
						deduction inside it, a hold, and an instalment typed by hand. They exist over there
						because over there they happen. Any of the four can leave a balance that is neither what
						the schedule says nor what has been recovered — which is exactly the number §26 says
						cannot be derived and has to be loaded.
					</Gap>
				</div>
			</div>

			<div className="fhtitle mt-4">Their form, field by field</div>
			<div className="mt-[.6rem]">
				<SpecTable
					cols={["Field", "What would stand behind it", "State", "Why it is not just a copy"]}
					list={LOAN_FIELDS.map((r) => [
						r[1] ? `${r[0]} <b title="Shaded yellow on their form">*</b>` : r[0], r[2], r[3], r[4],
					])}
				/>
			</div>

			<div className="mt-[.7rem] text-right">
				<Desk href={s.site && deskUrl(s.site, "Employee Advance")} label="Employee Advance list"
					title="The one advance doctype that stayed in hrms. Expect it to be absent until hrms is installed — which is itself the answer to what this module is waiting for.">
					Open Employee Advance on the site
				</Desk>
			</div>
		</>
	);
}
