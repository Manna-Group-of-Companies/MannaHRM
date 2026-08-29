import { useEffect } from "react";

import { listAll } from "@/api/client";
import { load } from "@/api/load";
import { getState, patch, set, useApp } from "@/state/store";
import { scoped } from "@/lib/scope";
import { MONTHS, fmt, nowStamp, tidyDept, todayIso } from "@/lib/format";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { CTC_BY } from "@/data/masters";
import {
	PSL_COLS, PSL_FLAGS, PSL_FORMATS, PSL_OUTPUTS, PSL_PAYROLL_TYPES, PSL_PERIODS,
	PSL_SLIP_DEDUCTIONS, PSL_SLIP_EARNINGS, fyList, fyMonths, fyOf,
} from "@/data/payroll";
import { Desk, Empty, Gap, Html, Modal, Note, Scroll, panelProps, tabProps } from "@/components/ui";

import { PayLegend } from "./shared";

/* Factor HR's Salary Payslip, photographed 29 Aug 2026 — the bar, both tabs and
   the three checkboxes. Copied control for control, including the controls
   nothing here can honour: a missing control hides the gap, a control that says
   why it cannot answer names it. See PSL_FLAGS in data/payroll.js.

   **This page produces the envelope, not the amounts.** Who a payslip would go
   to, for which month, at which address, is answerable off the `Employee`
   master. What would be printed on it is not answerable at all — no payroll
   doctype is on the proxy's allowlist and the site holds no salary structure —
   so the earnings and deductions tables are drawn and left empty rather than
   filled with a number derived from CTC. A payslip that is nearly right is
   worse than a blank one, because somebody will be paid from it.

   The one figure that is real is the annual CTC off `Employee`, and it is
   labelled as what it is: a cost, not a payment.

   That leaves the delivery question, which this page can answer and which their
   own form keeps asking — see the Email column and the first checkbox. "Getting
   it to 160 people is the part nobody has decided" was the whole of this page
   before today; it can now at least say how many of the 160 have an address to
   get it at. */

const monthName = (ym) => {
	const [y, m] = String(ym || "").split("-");
	return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${y}` : "—";
};

/** Whichever address a mailer would actually use, in the order it would try
    them. `prefered_email` is ERPNext's own spelling of the field and is not a
    typo here. */
const addressOf = (rec) =>
	(rec && (rec.company_email || rec.prefered_email || rec.personal_email)) || "";

/* One extra read, and only when Generate is first pressed — not part of the
   load every page pays for. Two reasons it is a probe rather than three more
   fields on EMP_FIELDS: a field this site does not carry would fail the read
   that draws the whole dashboard, and whether `Employee` holds an address here
   at all is itself one of the answers this screen exists to give.

   A refusal is an answer. "absent" means the read came back empty-handed, which
   is a different finding from everybody having no address, and the page says
   which. */
async function pslProbe() {
	if (getState().pslMailState) return;
	set({ pslMailState: "loading" });

	const FULL = ["name", "company_email", "personal_email", "prefered_email"];
	const ONE = ["name", "company_email"];
	const rows = await listAll("Employee", FULL)
		.catch(() => listAll("Employee", ONE))
		.catch(() => null);

	set(rows
		? { pslMail: Object.fromEntries(rows.map((r) => [r.name, r])), pslMailState: "ok" }
		: { pslMail: null, pslMailState: "absent" });
}

/** One row per person a payslip would be produced for, at the criteria on the
    form. */
function pslRows(s) {
	const f = s.psl;
	const label = monthName(f.month);
	const mail = s.pslMail || {};

	let pool = scoped(s);
	if (f.status) pool = pool.filter((e) => e.status === f.status);
	if (f.emp) pool = pool.filter((e) => e.name === f.emp);

	let rows = pool.map((e) => ({
		e,
		month: label,
		email: addressOf(mail[e.name]),
		/* What the slip comes to. Null on every row and it stays null: the number
		   that belongs here is the one no doctype on this site can produce. */
		net: null,
	}));

	/* Their box says *without* email, so unticked means drop them. It is applied
	   only when the addresses were actually read — with nothing to filter on it
	   would silently drop all 160 people and read as an empty payroll. Refusing
	   somebody who is there is the expensive mistake; see CLAUDE.md §4. */
	if (!f.noemail && s.pslMailState === "ok") rows = rows.filter((r) => r.email);

	/* Written as the filter it is rather than as a special case, so it starts
	   doing something real the day a net figure can be read. Today it drops
	   everybody, which is exactly why their capture has the box ticked. */
	if (!f.zero) rows = rows.filter((r) => r.net);

	return rows.sort((a, b) => {
		if (f.by) {
			const key = (r) => (f.by === "department" ? tidyDept(r.e.department) : r.e[f.by]) || "—";
			const d = String(key(a)).localeCompare(String(key(b)));
			if (d) return d;
		}
		return String(a.e.employee_name || "").localeCompare(String(b.e.employee_name || ""));
	});
}

/** Headings and rows in one flat list, so the screen and the printed run
    section identically rather than each doing its own arithmetic. */
function pslFlat(rows, f) {
	if (!f.by) return rows.map((row) => ({ row }));
	const groups = new Map();
	for (const r of rows) {
		const k = (f.by === "department" ? tidyDept(r.e.department) : r.e[f.by]) || "—";
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(r);
	}
	return [...groups.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.flatMap(([head, list]) => [{ head, n: list.length }, ...list.map((row) => ({ row }))]);
}

const pslStamp = (s) => `payslips-${s.psl.month || "no-month"}`;

/** One person's slip, in the shape `Salary Slip` would have to fill. The two
    amount columns are present and empty on purpose — this is what has to be
    filled, drawn at the size it actually is. */
function slipHtml(r) {
	const e = r.e;
	const facts = [
		["Employee code", e.employee_number || e.name],
		["Name", e.employee_name || "—"],
		["Designation", e.designation || "—"],
		["Department", tidyDept(e.department)],
		["Company", e.company || "—"],
		["Date of joining", e.date_of_joining || "—"],
		["Payslip for", r.month],
		["Sent to", r.email || "no address on record"],
	];

	const lines = Math.max(PSL_SLIP_EARNINGS.length, PSL_SLIP_DEDUCTIONS.length);
	const body = Array.from({ length: lines }, (_, i) =>
		`<tr><td>${esc(PSL_SLIP_EARNINGS[i] || "")}</td><td class="amt"></td>`
		+ `<td>${esc(PSL_SLIP_DEDUCTIONS[i] || "")}</td><td class="amt"></td></tr>`).join("");

	return `<div class="slip">
		<div class="head">
			<div class="mark">MANNA GROUP</div>
			<h1>PAYSLIP &mdash; ${esc(r.month)}</h1>
			<p class="sub">${esc(e.company || "")}</p>
		</div>
		<table class="facts">
			${facts.map((p) => `<tr><th>${esc(p[0])}</th><td>${esc(p[1])}</td></tr>`).join("")}
		</table>
		<table>
			<thead><tr><th>Earnings</th><th class="amt">Amount</th>
				<th>Deductions</th><th class="amt">Amount</th></tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr class="grp"><td>Gross</td><td class="amt"></td>
				<td>Total deductions</td><td class="amt"></td></tr></tfoot>
		</table>
		<p class="crit"><b>No amount is printed on this slip.</b> Every figure above comes from a salary
			structure, and this site holds none &mdash; nor is any payroll doctype readable from this page.
			The annual cost on record for this person is
			${e.ctc ? esc(fmt(Math.round(Number(e.ctc)))) : "not recorded"}, which is a cost and not a
			payment. Generated ${esc(nowStamp())}.</p>
	</div>`;
}

/** The whole run — one document, one slip per person, portrait, page-broken.
    The same HTML Print, PDF, Word and Preview are all handed, so none of them
    can disagree with the others or with the screen. */
function pslPaper(s, rows) {
	const f = s.psl;
	const crit = [
		`${fmt(rows.length)} slip${rows.length === 1 ? "" : "s"}`,
		f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
		f.format,
		f.noemail ? "including people with no email address" : "people with an email address only",
	].filter(Boolean).join(" · ");

	return paper(`Payslips ${f.month || ""}`, `
		<div class="head">
			<h1>SALARY PAYSLIP RUN &mdash; ${esc(monthName(f.month))}</h1>
			<p class="sub">${esc(s.company || "all companies")} &middot; ${esc(f.ptype)} &middot; ${esc(f.year)}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		${rows.map(slipHtml).join("")}`, true);
}

/** Every format off the one document, the way the other four reports do it. */
function pslRun(s, kind) {
	const done = (msg) => patch("psl", { msg });
	const rows = pslRows(s);
	if (!rows.length) return done("Nothing to produce — nobody is left after these criteria.");

	if (kind === "Excel") {
		const name = pslStamp(s) + ".csv";
		download(name, toCsv(PSL_COLS.map((c) => c[0]), rows.map((r) => PSL_COLS.map((c) => c[1](r)))));
		return done(`Exported ${fmt(rows.length)} rows to ${name}. Four of its columns are empty on every `
			+ "row, and they are the four payroll would have filled.");
	}

	const html = pslPaper(s, rows);

	if (kind === "Preview") return set({ pslDoc: html });
	if (kind === "Word") {
		const name = pslStamp(s) + ".doc";
		save(name, html, "application/msword");
		return done(`Written to ${name} — ${fmt(rows.length)} slips, one per page. <b>It is an HTML document `
			+ "with a Word content type</b>, which is what Word's own <em>Save as Web Page</em> writes, so no "
			+ "library was shipped to this browser to produce it.");
	}

	printPaper(html);
	done("Sent to the print dialog.");
}

/* Generate honours Report Output, the way Statutory Reports does: the box on
   the form says what pressing it should produce, and a form that ignores its
   own output setting is a form somebody stops reading. */
async function pslGenerate() {
	const f = getState().psl;
	if (!f.month) {
		return patch("psl", {
			run: false, gmenu: false,
			msg: "<b>Pick a month first.</b> A payslip with no period on it is not a payslip. The Month box "
				+ "is empty in their capture too, which is what an unrun form looks like on both sides.",
		});
	}

	patch("psl", { run: true, msg: "", gmenu: false });
	/* Awaited rather than fired off: an export written before the addresses come
	   back would have an empty Email column, and nothing would tell that apart
	   from nobody having one. */
	await pslProbe();
	const now = getState();

	if (f.output === "Excel") return pslRun(now, "Excel");
	if (f.output === "Word") return pslRun(now, "Word");
	if (f.output === "PDF") {
		pslRun(now, "Preview");
		return patch("psl", {
			msg: "<b>PDF opens the preview rather than the printer.</b> It is the same document Print and "
				+ "Word are handed — but this run is one page per person, and a page that sends a hundred "
				+ "and sixty sheets to a printer on one click is a page nobody presses twice. Print or Save "
				+ "as PDF from inside it.",
		});
	}
	return patch("psl", { msg: "" });
}

/** Factor HR's coloured status dot, which on this screen means the same thing
    as the Employee Status box beside it. */
function StatusDot({ f }) {
	const opts = [["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"]];
	const cur = opts.find((o) => o[0] === f.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={f.menu}
				title={`Status: ${cur[2]} — the same filter as the Employee Status box beside it`}
				onClick={(e) => { e.stopPropagation(); patch("psl", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => {
							e.stopPropagation();
							patch("psl", { status: o[0], menu: false, run: false, msg: "" });
						}}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

function PslForm({ s }) {
	const f = s.psl;
	const year = f.year || fyOf(todayIso());
	const picked = f.emp ? s.byName[f.emp] || null : null;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list, which is why touching one clears the
	   last run rather than leaving stale payslips on screen under new criteria. */
	const stale = (part) => patch("psl", { ...part, run: false, msg: "" });

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

	return (
		<div className="fhscreen ddaform">
			<div className="fhtitle">Salary Payslip</div>

			<div className="ddabar">
				<div className="fld wide">
					<span className="lab">Particular Employee</span>
					<div className="ctl">
						<StatusDot f={f} />
						<span className="find rev">
							<input
								type="search"
								placeholder="Search Employee"
								aria-label="Search employee"
								value={picked ? `${picked.employee_name} (${picked.employee_number || picked.name})` : f.q}
								/* Typing over a chosen name clears the choice — otherwise the box
								   names one person and the run produces somebody else's payslip. */
								onChange={(e) => stale({ emp: "", q: e.target.value })}
							/>
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
								strokeWidth="1.8" strokeLinecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="M20 20l-3.6-3.6" />
							</svg>
						</span>
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

				{/* The one control on this bar that none of their other reports carries.
				    One value was in the capture and the list was never opened, so one
				    value is all it offers — see PSL_PERIODS. */}
				<div className="fld">
					<span className="lab">Period Type</span>
					<div className="ctl">
						<select value={f.period} aria-label="Period type"
							title="Their list was never opened. The name implies a multi-period sibling; what that is called is not known, and a guess here would be a guess about what a payslip covers."
							onChange={(e) => stale({ period: e.target.value })}>
							{PSL_PERIODS.map((v) => <option key={v}>{v}</option>)}
						</select>
					</div>
				</div>

				<div className="fld">
					<span className="lab">&nbsp;</span>
					<div className="ctl">
						{/* Their bar carries the import arrow out here rather than inside the
						    employee box, which is where their other reports put it. Drawn
						    where they drew it. There is no Excel button on this bar and none
						    is added: Report Output does that job on this screen. */}
						<Desk className="embtn ic" href={s.site && deskImport(s.site)} label="Import employees from Excel"
							title="Import Employees from Excel. Opens ERPNext's Data Import on the site, which previews the file before it writes — this page proxies GET only, see app/serve.js.">
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
								strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
							</svg>
						</Desk>
						<button className="embtn ic" title="Reload from the site" aria-label="Refresh"
							onClick={() => void load()}>↻</button>

						{/* Their Generate is a split button here too. What is behind the caret
						    on *this* screen was not opened — the three below are the ones
						    their other reports carry, and two of the three have a real home on
						    the site, so they open it rather than explaining that they cannot. */}
						<span className="empdrop">
							<button className="embtn pri" onClick={() => void pslGenerate()}>Generate</button>
							<button className="embtn pri split" aria-haspopup="menu" aria-expanded={f.gmenu}
								aria-label="More ways to run it"
								onClick={(e) => { e.stopPropagation(); patch("psl", { gmenu: !f.gmenu }); }}>
								▾
							</button>
							<div className="emmenu end" role="menu" hidden={!f.gmenu}>
								<button role="menuitem"
									onClick={(e) => {
										e.stopPropagation();
										void pslGenerate().then(() => patch("psl", {
											msg: "<b>Run here instead, because there is no background to run in.</b> On their "
												+ "side this queues the run and mails each slip when it finishes — which is the "
												+ "part of payroll nobody here has costed. This page has no queue, no worker and "
												+ "no mailer: it produces the documents in the browser and hands them back.",
										}));
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
						<span className="none">Nobody matches. The run will cover everybody the filters allow.</span>
					</div>
				)
			)}

			{/* BASIC and ADVANCE — what this screen calls the two tabs their other
			    reports call Report Criteria and Advance. Their words, not tidied into
			    one vocabulary, because which screen says which is itself a fact about
			    the system being replaced. */}
			<div className="ddatabs" role="tablist" aria-label="Payslip criteria">
				{[["basic", "Basic"], ["advance", "Advance"]].map((t) => (
					<button key={t[0]} {...tabProps("psltab-" + t[0], "pslpane", f.tab === t[0])}
						onClick={() => patch("psl", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				<div className="ddapane" {...panelProps("pslpane", "psltab-" + f.tab)}>
					<Note>
						<b>Their Advance tab was not opened.</b> The tab is on the screen and that is the whole
						of what the capture holds, so nothing is drawn under it — an invented control is worse
						than a missing one, and on a payroll form it is worse again. Their other reports put
						Group By here; whether this one does is unknown. <b>Filter By</b> on the bar sections
						this run in the meantime, on screen and in every export alike.
					</Note>
				</div>
			) : (
				<div className="ddapane" {...panelProps("pslpane", "psltab-" + f.tab)}>
					<div className="ddagrid">
						<div className="ddafield">
							<span className="lab">Payroll Type</span>
							<select value={f.ptype} aria-label="Payroll type"
								title="The same control sits on their Adhoc Payments screen, where it was empty. This capture is the first time it has held a value."
								onChange={(e) => stale({ ptype: e.target.value })}>
								{PSL_PAYROLL_TYPES.map((v) => <option key={v}>{v}</option>)}
							</select>
							<span className="hint">
								Monthly is the one value either capture of this control has held.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Year</span>
							<select value={year} aria-label="Payroll year"
								onChange={(e) => stale({ year: e.target.value, month: "" })}>
								{fyList(todayIso()).map((v) => <option key={v}>{v}</option>)}
							</select>
							<span className="hint">
								April to March — the year a return is filed against. Changing it clears the month.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Report Output</span>
							<select value={f.output} aria-label="Report output"
								onChange={(e) => stale({ output: e.target.value })}>
								{PSL_OUTPUTS.map((v) => <option key={v}>{v}</option>)}
							</select>
							<span className="hint">What Generate produces. PDF was their selected value.</span>
						</div>

						<div className="ddafield">
							<span className="lab">Month</span>
							<select value={f.month} aria-label="Month"
								onChange={(e) => stale({ month: e.target.value })}>
								<option value="">Select month</option>
								{fyMonths(year).map((m) => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
							</select>
							<span className="hint">
								{f.month
									? "The period every slip is headed with."
									: "Empty in their capture, and required here — Generate refuses without it."}
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Payslip Format</span>
							<select value={f.format} aria-label="Payslip format"
								onChange={(e) => stale({ format: e.target.value })}>
								{PSL_FORMATS.map((v) => <option key={v}>{v}</option>)}
							</select>
							<span className="hint">
								Format 7 was selected, so there are at least seven of them. Here a payslip layout is
								one Print Format against <code>Salary Slip</code>, and stock ERPNext ships one.
							</span>
						</div>
					</div>

					<div className="ddachks">
						{PSL_FLAGS.map((o) => (
							<label className="chk" key={o[0]}>
								<input type="checkbox" checked={f[o[0]]}
									onChange={(e) => {
										stale({ [o[0]]: e.target.checked });
										/* The answer arrives where the question was asked, and only on
										   the way in — unticking a box is not a question. */
										patch("psl", { msg: e.target.checked ? o[3] : "" });
									}} />
								{o[1]}
							</label>
						))}
					</div>
				</div>
			)}

			{f.msg && <Note><Html html={f.msg} /></Note>}
		</div>
	);
}

/** What Generate produced. */
function PslOut({ s }) {
	const f = s.psl;
	const rows = pslRows(s);
	const known = s.pslMailState === "ok";
	const withMail = rows.filter((r) => r.email).length;

	if (s.pslMailState === "loading") {
		return <Empty title="Reading the addresses…">One request, the first time Generate is pressed.</Empty>;
	}
	if (!rows.length) {
		return (
			<Empty title="Nobody is left">
				{f.zero
					? "No employee matches these criteria."
					: "Include Zero Value Employees is unticked, and every slip here is worth nothing — because "
						+ "no salary structure is readable. That is the whole of why their capture has the box "
						+ "ticked."}
			</Empty>
		);
	}

	const flat = pslFlat(rows, f);
	return (
		<>
			<div className="ddacount">
				{fmt(rows.length)} slip{rows.length === 1 ? "" : "s"} · {monthName(f.month)} · {f.format}
			</div>
			<Scroll>
				{/* `io` so a grouping heading picks up the band that report already
				    defines for exactly this. */}
				<table className="io" style={{ minWidth: 90 * PSL_COLS.length }}>
					<thead>
						<tr>{PSL_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{flat.map((x, i) => (x.head ? (
							<tr className="grp" key={"g" + x.head}>
								<td colSpan={PSL_COLS.length}>{x.head} — {fmt(x.n)}</td>
							</tr>
						) : (
							<tr key={x.row.e.name + i}>
								{PSL_COLS.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](x.row))}</td>
								))}
							</tr>
						)))}
					</tbody>
				</table>
			</Scroll>

			<div className="mt-2">
				<button className="btn tpl" onClick={() => pslRun(s, "Preview")}>
					<i className="fico" aria-hidden="true">🖨</i> Open the payslips
				</button>
			</div>

			{/* The one question this screen can answer, answered where it was asked. */}
			<Gap>
				{known ? (
					<>
						<b>{fmt(withMail)} of {fmt(rows.length)} have an email address on record.</b>{" "}
						{withMail === rows.length
							? "Every one of these slips has somewhere to go, which is the easy half of the delivery "
								+ "question — nothing here sends them."
							: `The other ${fmt(rows.length - withMail)} have nowhere for a payslip to be sent, and `
								+ "their first checkbox is exactly this problem. Collecting those addresses is cheaper "
								+ "than any of the payroll work behind this screen and blocks the same thing."}
					</>
				) : (
					<>
						<b>The address fields could not be read.</b> Neither <code>company_email</code> nor its
						two siblings came back off <code>Employee</code>, so the Email column is empty for a
						reason that has nothing to do with anybody's record — and the first checkbox is left
						unable to filter rather than filtering everybody out.
					</>
				)}
			</Gap>

			<Gap>
				<b>Payment days, Gross, Deductions and Net are blank, and that is the report.</b> All four come
				from a salary structure and a payroll run: <code>Salary Structure</code>,{" "}
				<code>Salary Structure Assignment</code>, <code>Salary Slip</code>. None is on the proxy's
				allowlist and the site holds none of them, so there are two separate reasons and fixing one
				would not be enough. <b>CTC is real</b> — read off <code>Employee</code> — and it is an annual
				cost, not a month's pay; nothing here divides it by twelve and calls the answer a payslip.
			</Gap>
		</>
	);
}

export default function Payslip() {
	const s = useApp();

	/* The year is seeded once, on the way in, for the same reason the calendar's
	   month is: a default computed while rendering changes under somebody who
	   leaves the tab open across 31 March. The month is deliberately not seeded
	   — their capture has it empty, and Generate has to have something to
	   refuse. */
	useEffect(() => {
		if (!getState().psl.year) patch("psl", { year: fyOf(todayIso()) });
	}, []);

	return (
		<>
			<PayLegend what="Salary Payslip" cov="part" tag="Who and where">
				Their form, both tabs. Who a slip goes to and at which address is answered off the{" "}
				<code>Employee</code> master; what would be printed on it is not answerable from this site at
				all, so the document is produced with its amounts blank rather than with amounts invented.
			</PayLegend>

			<PslForm s={s} />

			{s.psl.run && <PslOut s={s} />}

			{s.pslDoc && (
				<Modal
					title="Payslip run"
					wide
					onClose={() => set({ pslDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.pslDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => pslRun(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => pslRun(s, "Excel")}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
						</>
					}
					why={
						<>
							One page per person, and the same HTML that Print, PDF and Word are handed — rendered
							here so it can be read before it goes anywhere near a printer or a person.
						</>
					}
					extra={<iframe className="iopaper" title="Payslip run" srcDoc={s.pslDoc} />}
				/>
			)}
		</>
	);
}
