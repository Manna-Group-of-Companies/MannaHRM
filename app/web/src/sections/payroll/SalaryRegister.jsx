import { patch, useApp } from "@/state/store";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept, todayIso } from "@/lib/format";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { CTC_BY } from "@/data/masters";
import { CAT_GROUP_BY } from "@/data/attendance";
import {
	REGISTER_COLS, SREG_COLS, SREG_MASTER_COLS, SREG_OPTIONS, SREG_PAYROLL_TYPES,
	fyList, fyMonths, fyOf,
} from "@/data/payroll";
import { Desk, Empty, Gap, Html, Note, Scroll, SpecTable, panelProps, tabProps } from "@/components/ui";
import { load } from "@/api/load";
import { NotReadable, PayLegend } from "./shared";

/* SALARY REGISTER, photographed 29 August 2026 and drawn here control for
   control: two tabs with refresh and a Generate split button pinned to the tab
   row, eight fields under Basic Option, and one box of five chips.

   Drawn even though payroll is deferred, and for a sharper reason than the
   other payroll screens have. **This is the report the whole module is waiting
   on.** It is the one export Factor HR has been asked for (E1), it is the shape
   every migration has to land in, and it is the document somebody will hold up
   beside ours on the first parallel run to decide whether we are right. A form
   that can be filled in and pressed — and that then says, column by column,
   which figures are answerable and which are not — is worth more before payroll
   starts than after.

   What it must never do is imply it computed a payslip. Every money column is
   blank, none of them is a zero, and the difference is drawn rather than
   footnoted: see SREG_COLS. */

/** The payroll year on the form. Empty means the one today falls in, resolved
    here rather than seeded, so a tab left open across 31 March does not go on
    offering last year's months. */
const sregYear = (f) => f.year || fyOf(todayIso());

/** The register's columns, plus the master's if Include Employee Master is on —
    which is the one chip on this form with data behind it. */
const sregCols = (f) => SREG_COLS.concat(f.opts.master ? SREG_MASTER_COLS : []);

/** Which period the register covers, said in words. A month is a month; no
    month is the whole payroll year, which is a different report and is named as
    one rather than left to be assumed from an empty box. */
function sregPeriod(f) {
	const year = sregYear(f);
	const m = fyMonths(year).find((x) => x[0] === f.month);
	return m ? m[1] : `the whole of ${year}`;
}

/** Who the register would run for. Every filter on the form is applied here, so
    the count under Generate and the rows in the table cannot disagree. */
function sregRows(s) {
	const f = s.sreg;
	let pool = scoped(s);
	if (f.status) pool = pool.filter((e) => e.status === f.status);
	if (f.emp) pool = pool.filter((e) => e.name === f.emp);
	/* Include Zero Value Employees, against the only value this side holds. On
	   their register it means somebody whose net pay came to nothing; here it can
	   only mean somebody with no CTC on the master, and the chip says so. */
	if (!f.opts.zeroemps) pool = pool.filter((e) => Number(e.ctc) > 0);

	return pool
		.map((emp) => ({ emp }))
		.sort((a, b) =>
			(a.emp.employee_name || "").localeCompare(b.emp.employee_name || ""));
}

/** The two controls that section this report, outer first: Group By on the
    form, then Filter By on the bar. The same stacking the leave and daily
    reports make of the same pair — two grouping controls means one inside the
    other, or one of them is being ignored. */
function sregSections(f) {
	const keys = [];
	const g = CAT_GROUP_BY.find((x) => x[0] === f.gby);
	if (g && g[2]) keys.push([g[1], g[2]]);
	if (f.by) keys.push([(CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1], f.by]);
	return keys;
}

/** Headings and rows in one flat list, so a section heading is drawn in exactly
    one place. `lvl` counts down from the outer key, which is what the two
    heading styles are picked from. */
function sregFlat(rows, keys) {
	if (!keys.length) return rows.map((row) => ({ row }));
	const [outer, ...rest] = keys;
	const groups = new Map();
	for (const r of rows) {
		const k = (outer[1] === "department" ? tidyDept(r.emp[outer[1]]) : r.emp[outer[1]]) || "—";
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(r);
	}
	return [...groups.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.flatMap(([head, list]) => [
			{ head, n: list.length, lvl: keys.length },
			...sregFlat(list, rest),
		]);
}

/** Factor HR's coloured status dot, which on this screen means the same thing
    as the Employee Status box beside it. Blue — All — is how the capture found
    it, and it is its own selection: a filter set on the leave report is not a
    filter set here, and sharing them would silently hide people. */
function SregDot({ f }) {
	const opts = [["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"]];
	const cur = opts.find((o) => o[0] === f.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={f.menu}
				title={`Status: ${cur[2]} — the same filter as the Employee Status box beside it`}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("sreg", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => {
							e.stopPropagation();
							patch("sreg", { status: o[0], menu: false, run: false, msg: "" });
						}}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

function SregForm({ s }) {
	const f = s.sreg;
	const year = sregYear(f);
	const picked = f.emp ? s.byName[f.emp] || null : null;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list. So touching one clears the last run
	   rather than leaving a stale register on screen under new criteria — on
	   this page more than any other, since somebody will read these rows as a
	   month's pay. */
	const stale = (part) => patch("sreg", { ...part, run: false, msg: "" });

	let hits = [];
	const typing = !picked && (f.q || "").trim();
	if (typing) {
		const q = f.q.trim().toLowerCase();
		let pool = scoped(s);
		if (f.status) pool = pool.filter((e) => e.status === f.status);
		hits = pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8);
	}

	const off = SREG_OPTIONS.filter((o) => !f.opts[o[0]]);

	return (
		<div className="fhscreen ddaform">
			<div className="fhtitle">Salary Register</div>

			{/* Their tabs and their two buttons on one line, which is where their form
			    puts them — the other reports carry the same two on the bar below. */}
			<div className="fhtabrow">
				<div className="ddatabs" role="tablist" aria-label="Report options">
					{[["basic", "Basic Option"], ["extra", "Add Additional Column"]].map((t) => (
						<button key={t[0]} {...tabProps("sregtab-" + t[0], "sregpane", f.tab === t[0])}
							onClick={() => patch("sreg", { tab: t[0] })}>
							{t[1]}
						</button>
					))}
				</div>
				<span className="right">
					<button className="embtn ic" title="Reload from the site" aria-label="Refresh"
						onClick={() => void load()}>↻</button>

					{/* Their Generate is a split button and the items behind it are all
					    about a queue. There is no queue here — but two of them have a real
					    home on the site, where scheduling a report is one doctype, so they
					    open it rather than explaining that they cannot. */}
					<span className="empdrop">
						<button className="embtn pri"
							onClick={() => patch("sreg", { run: true, msg: "", gmenu: false })}>Generate</button>
						<button className="embtn pri split" aria-haspopup="menu" aria-expanded={f.gmenu}
							aria-label="More ways to run it"
							onClick={(e) => { e.stopPropagation(); patch("sreg", { gmenu: !f.gmenu }); }}>
							▾
						</button>
						<div className="emmenu end" role="menu" hidden={!f.gmenu}>
							<button role="menuitem"
								onClick={(e) => {
									e.stopPropagation();
									patch("sreg", {
										run: true, gmenu: false,
										msg: "<b>Run here instead, because there is no background to run in.</b> In Factor HR "
											+ "this queues the register and mails it when it finishes — which for 160 people over "
											+ "twelve months is exactly the kind of job that needs a queue. This page has no worker: "
											+ "the employee master is already read and there is no payroll arithmetic to do, which "
											+ "is why it can answer at once and why that is not the good news it looks like.",
									});
								}}>
								Generate in Background
							</button>
							<Desk href={s.site && deskNew(s.site, "Auto Email Report")} className=""
								label="Create Schedule Report"
								title="ERPNext's Auto Email Report — a query or report, a frequency, and who it goes to. It runs on the site's scheduler, which is the only clock that keeps time when this browser is closed.">
								Create Schedule Report
							</Desk>
							<Desk href={s.site && deskUrl(s.site, "Auto Email Report")} className=""
								label="View Scheduled Reports"
								title="Every Auto Email Report on the site, with who receives it and when. Empty until one is made.">
								View Scheduled Reports
							</Desk>
						</div>
					</span>
				</span>
			</div>

			{f.tab === "extra" ? (
				/* Their second tab, by name only — it was never opened, so what is on
				   it is unknown and nothing is drawn in its place. The name is worth
				   keeping anyway: it says their register's columns are configurable per
				   run, which is a different thing from ours having a fixed set. */
				<div className="ddapane" {...panelProps("sregpane", "sregtab-" + f.tab)}>
					<Empty title="Add Additional Column was not opened">
						Only the tab&rsquo;s name has been seen. Whatever it offers — extra salary components,
						master fields, a statutory column — is a list nobody here has read, and a plausible one
						invented on this side would be worse than an empty tab, because somebody would compare
						against it.
						<span className="block mt-2">
							What is known is what it implies: <b>their register&rsquo;s columns are chosen per run.</b>{" "}
							On our side that is a Query Report with its own column set, or a Script Report — so
							matching this tab is a decision about how configurable the register has to be, and it
							has to be taken before E1 is unpacked rather than after.
						</span>
					</Empty>
				</div>
			) : (
				<div className="ddapane" {...panelProps("sregpane", "sregtab-" + f.tab)}>
					{/* Their first row is the toolbar every one of their reports carries,
					    control for control, so it is drawn the same way here. */}
					<div className="ddabar">
						<div className="fld wide">
							<span className="lab">Select Employee</span>
							<div className="ctl">
								<SregDot f={f} />
								<span className="find rev">
									<input
										type="search"
										placeholder="Search Employee"
										aria-label="Search employee"
										value={picked ? `${picked.employee_name} (${picked.employee_number || picked.name})` : f.q}
										/* Typing over a chosen name clears the choice — otherwise the
										   box says one person and the register runs for another. */
										onChange={(e) => stale({ emp: "", q: e.target.value })}
									/>
									<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
										strokeWidth="1.8" strokeLinecap="round">
										<circle cx="11" cy="11" r="7" />
										<path d="M20 20l-3.6-3.6" />
									</svg>
								</span>
								<Desk className="embtn ic" href={s.site && deskImport(s.site)}
									label="Import employees from Excel"
									title="Import Employees from Excel. Opens ERPNext's Data Import on the site, which previews the file before it writes — this page proxies GET only, see app/serve.js.">
									<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
										strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
										<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
									</svg>
								</Desk>
							</div>
						</div>

						<div className="fld">
							<span className="lab">Employee Status</span>
							<div className="ctl">
								<select value={f.status} aria-label="Employee status"
									onChange={(e) => stale({ status: e.target.value })}>
									{["All", "Active", "Inactive", "Suspended", "Left"].map((v) => (
										<option key={v} value={v === "All" ? "" : v}>{v}</option>
									))}
								</select>
							</div>
						</div>

						<div className="fld grow">
							<span className="lab">Filter By</span>
							<div className="ctl">
								<select className="wide" value={f.by} aria-label="Filter by"
									onChange={(e) => stale({ by: e.target.value })}>
									{CTC_BY.map((b) => (
										<option key={b[0]} value={b[0]}>{b[0] ? b[1] : ""}</option>
									))}
								</select>
							</div>
						</div>
					</div>

					{typing && (
						hits.length ? (
							<div className="regfind">
								{hits.map((e) => (
									<button key={e.name} onClick={() => stale({ emp: e.name, q: "" })}>
										<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
										<b>{e.employee_name}</b>
										<span className="mono">{e.employee_number || "—"}</span>
										<span className="muted">{tidyDept(e.department)}</span>
									</button>
								))}
								<button onClick={() => stale({ emp: "", q: "" })}>
									<span className="muted">— everybody matching the filters —</span>
								</button>
							</div>
						) : (
							<div className="regfind">
								<span className="none">
									Nobody matches. The register will run over everybody the filters allow.
								</span>
							</div>
						)
					)}

					<div className="ddagrid">
						<div className="ddafield">
							<span className="lab">Payroll Type</span>
							<select value={f.ptype} aria-label="Payroll type"
								onChange={(e) => stale({ ptype: e.target.value })}>
								{SREG_PAYROLL_TYPES.map((t) => <option key={t}>{t}</option>)}
							</select>
							<span className="hint">
								Monthly is the only value their list has been seen holding, so it is the only one
								offered. Whether the factories run a weekly or a fortnightly payroll is a question
								nobody has answered — and it is a policy answer, not a dropdown.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Year</span>
							<select value={year} aria-label="Payroll year"
								/* Changing the year moves the months under it, so a March
								   picked in one year is not silently kept in the next. */
								onChange={(e) => stale({ year: e.target.value, month: "" })}>
								{fyList(todayIso()).map((y) => <option key={y}>{y}</option>)}
							</select>
							<span className="hint">
								April to March — the year every Indian payroll return is filed against. It stops at
								the current one: a register for a month that has not happened is not a document
								anybody should be able to ask for.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Month</span>
							<select value={f.month} aria-label="Month"
								onChange={(e) => stale({ month: e.target.value })}>
								<option value="">Select month</option>
								{fyMonths(year).map((m) => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
							</select>
							{/* Their box was empty, and an empty month is not a missing filter
							    — it is a different report. Said here rather than left to be
							    worked out from a register twelve times too long. */}
							<span className="hint">
								{f.month
									? <>One month, <b>{sregPeriod(f)}</b> — a pay run, which is what a register
										normally means.</>
									: <>Empty in their capture and empty here, which is not nothing: with no month
										this covers <b>{sregPeriod(f)}</b>, and a year is a different document from
										a pay run.</>}
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Output Currency</span>
							<select value={f.currency} aria-label="Output currency"
								onChange={(e) => stale({ currency: e.target.value })}>
								<option>Default</option>
							</select>
							{/* Not a dead control padded out with plausible currencies. What it
							    is short of is a fact about the site, and the fact is the finding. */}
							<span className="hint">
								Default is all this can offer, and that is a gap rather than a preference:{" "}
								<code>Company</code> is read here without <code>default_currency</code>, and{" "}
								<b>one of the group&rsquo;s companies is in another country</b>. A register that
								adds a dirham column to a rupee column is wrong in a way no total shows.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Group By</span>
							<select
								value={f.gby}
								aria-label="Group by"
								title="Factor HR's categories, not fields — the Category Type master behind the Categories screen."
								onChange={(e) => {
									const g = CAT_GROUP_BY.find((x) => x[0] === e.target.value);
									stale({ gby: e.target.value });
									patch("sreg", { msg: g && g[3] ? g[3] : "" });
								}}
							>
								{CAT_GROUP_BY.map((g) => (
									<option key={g[0] || "none"} value={g[0]}>
										{g[1]}{g[0] && !g[2] ? " — no field here" : ""}
									</option>
								))}
							</select>
							<span className="hint">
								Sections the register by category. Stacks above <b>Filter By</b> on the bar, which is
								what two grouping controls on one form has to mean.
							</span>
						</div>
					</div>

					<div className="ddafield">
						<span className="lab">Other Options</span>
						<div className="chips">
							{SREG_OPTIONS.filter((o) => f.opts[o[0]]).map((o) => (
								<span className={"chip" + (o[2] ? "" : " dim")} key={o[0]}
									title={o[2]
										? "This one changes the register. Take it off to see what it does."
										: "Theirs, and nothing on this side can do it. Take it off or put it back to read why."}>
									{o[1]}
									<button aria-label={"Remove " + o[1]}
										onClick={() => patch("sreg", {
											opts: { ...f.opts, [o[0]]: false }, run: false, msg: o[3],
										})}>×</button>
								</span>
							))}
							{off.length ? (
								<select
									value=""
									aria-label="Add an option"
									onChange={(e) => {
										const o = SREG_OPTIONS.find((x) => x[0] === e.target.value);
										if (o) {
											patch("sreg", { opts: { ...f.opts, [o[0]]: true }, run: false, msg: o[3] });
										}
									}}
								>
									<option value="">+ add</option>
									{off.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
								</select>
							) : null}
						</div>
						{/* Which of their five chips do anything, said on the form rather
						    than found out by pressing Generate twice and seeing no change. */}
						<span className="hint">
							Two of the five change this report — Include Employee Master and Include Zero Value
							Employees. The other three are drawn because they are theirs, and each says what it is
							short of when it is picked up or put down.
						</span>
					</div>
				</div>
			)}

			{f.msg && <Note><Html html={f.msg} /></Note>}
		</div>
	);
}

/** What Generate produced. */
function SregOut({ s }) {
	const f = s.sreg;
	const rows = sregRows(s);
	const cols = sregCols(f);

	if (!rows.length) {
		return (
			<Empty title="Nobody is in scope">
				No employee matches the filters on the form. That is the filters, not the payroll: the
				register would have listed whoever they allowed.
			</Empty>
		);
	}

	const flat = sregFlat(rows, sregSections(f));
	const withCtc = rows.filter((r) => Number(r.emp.ctc) > 0).length;

	return (
		<div className="ddaout">
			<div className="ddacount">
				{fmt(rows.length)} employee{rows.length === 1 ? "" : "s"} · {sregPeriod(f)}
				{" · "}{fmt(withCtc)} with a CTC on the master
			</div>

			<Scroll>
				{/* `io` so the two heading levels pick up the bands the In / Out report
				    already defines for exactly this — a `sec` above a `grp`. */}
				<table className="io" style={{ minWidth: 92 * cols.length }}>
					<thead>
						<tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{flat.map((x, i) => (x.head ? (
							<tr className={x.lvl > 1 ? "sec" : "grp"} key={"g" + x.lvl + x.head}>
								<td colSpan={cols.length}>{x.head} — {fmt(x.n)}</td>
							</tr>
						) : (
							<tr key={x.row.emp.name + i}>
								{cols.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](x.row))}</td>
								))}
							</tr>
						)))}
					</tbody>
				</table>
			</Scroll>

			<Gap>
				<b>Six columns are empty, and they are the six the register exists for.</b> Payment Days is
				attendance — <code>Attendance</code> holds no rows on this site — and Gross, the deductions
				and Net Pay are all arithmetic on it, off a <code>Salary Structure</code> nobody has built
				and a <code>Salary Slip</code> this page is not allowed to read. Two independent reasons per
				column, so fixing either alone would change nothing. <b>They are blank rather than zero</b>,
				and the difference matters: a zero is a figure somebody can be paid.
			</Gap>

			<Note>
				<b>CTC ÷ 12 is not a salary.</b> It is the annual figure on the employee master divided by
				twelve — what somebody is contracted for, not what a month paid them. The two differ by
				exactly the thing this register is for: unpaid leave, part months, arrears, adhoc lines and
				every statutory deduction. It is here because it is the one money figure on this site that
				is real, and it is labelled so nobody lifts it into a payslip.
			</Note>

			<NotReadable />
		</div>
	);
}

export default function SalaryRegister() {
	const s = useApp();

	return (
		<>
			<PayLegend what="Salary Register">
				The same report, under the same name, on both sides — and the one Factor HR export the whole
				of payroll is waiting on.
			</PayLegend>

			<SregForm s={s} />

			{s.sreg.run && <SregOut s={s} />}

			<div className="fhtitle mt-4">What the register has to carry, column for column</div>
			<div className="mt-2">
				<SpecTable cols={["Columns", "What it is", "State", "Note"]} list={REGISTER_COLS} />
			</div>

			<div className="mt-[.7rem]">
				<Gap>
					<b>This list is the acceptance test for E1.</b> Every row of it is a column their register
					prints today, and stock <code>Salary Register</code> in Frappe HR produces most of them
					the moment a salary structure exists — which is why the estimate for this screen is not
					the screen. It is the structure behind it, and the attendance policy behind{" "}
					<i>that</i>. Compare the two column for column when the file lands, before anybody agrees
					a go-live date.
				</Gap>
			</div>
		</>
	);
}
