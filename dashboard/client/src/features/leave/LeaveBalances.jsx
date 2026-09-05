import { useEffect } from "react";

import { patch, set, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { fmt, nowStamp, tidyDept, todayIso } from "@/lib/format";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { CTC_BY } from "@/data/masters";
import { CAT_GROUP_BY } from "@/data/attendance";
import { FH_LEAVE } from "@/data/attendance";
import { LVB_COLS, LVB_LAYOUT } from "@/data/leave";
import { Desk, Empty, ExportMenu, Gap, Html, Modal, Note, Scroll, panelProps, tabProps } from "@/components/ui";
import { load, loadLeaveBalances } from "@/api/load";

/* Factor HR's Leave Balance Report, photographed 29 Aug 2026 — both tabs.

   The toolbar is the one the three attendance reports already carry, control
   for control: Particular Employee with its status dot and import arrow,
   Employee Status, Filter By, an Excel split button, refresh, and a Generate
   split button. That is not a coincidence to be tidied away — it is their own
   report chrome, reused across their reports, and copying it here is what lets
   somebody compare the two screens without first working out which control is
   which. Report Criteria then holds As On Date, Leave Type and Layout Options;
   Advance holds Group By and nothing else.

   **What separates this report from those three is the date.** They take a
   range and total what happened inside it. A balance is not a total over a
   period — it is a position on a day — so this form asks for one date, and
   every figure under it is "as at" that date. Getting that wrong would produce
   a number that looks like a balance and is not one.

   What can honestly be filled is Availed, and only Availed. See LVB_COLS. */

/** Days of one application that fall on or before the As On Date.

    Whole applications are taken at their own `total_leave_days`, which is the
    site's number and already accounts for the half-day flag — recomputing it
    here would be a second opinion about somebody's leave, and the site's is the
    one payroll would use.

    An application still running on the As On Date is clipped instead, because
    leave not yet taken is not yet availed. The clip counts whole days and then
    gives back the half if the half-day falls inside the window. */
function availedUpTo(row, ason) {
	const from = String(row.from_date || "").slice(0, 10);
	const to = String(row.to_date || from).slice(0, 10);
	if (!from || from > ason) return 0;
	if (to <= ason) return Number(row.total_leave_days) || 0;

	const days = Math.round((Date.parse(ason) - Date.parse(from)) / 86400000) + 1;
	const half = String(row.half_day_date || "").slice(0, 10);
	const halved = row.half_day && half && half >= from && half <= ason ? 0.5 : 0;
	return Math.max(0, days - halved);
}

/** One row per person per leave type they have taken any of, at the criteria on
    the form. A type somebody has never taken is not a row: Factor HR's report
    lists a person against a type they hold a balance in, and we cannot know
    what anybody holds — so listing every type against every person would be
    160 × 6 rows of dashes claiming to be a report. */
function lvbRows(s) {
	const f = s.lvb;
	const ason = f.ason || todayIso();

	let pool = scoped(s);
	if (f.status) pool = pool.filter((e) => e.status === f.status);
	if (f.emp) pool = pool.filter((e) => e.name === f.emp);

	const inScope = new Set(pool.map((e) => e.name));
	/* Keyed by a Map on a joined string, with the row kept as the *value* rather
	   than parsed back out of the key. Every leave type on this site has a space
	   in its name, so a key that has to be split again is a bug waiting for
	   "Casual Leave". */
	const tally = new Map();

	for (const r of s.lvbRows) {
		if (!inScope.has(r.employee)) continue;
		if (f.ltype && r.leave_type !== f.ltype) continue;
		const days = availedUpTo(r, ason);
		if (!days) continue;
		const k = r.employee + "\0" + (r.leave_type || "—");
		const cur = tally.get(k);
		if (cur) cur.availed += days;
		else tally.set(k, { emp: s.byName[r.employee], type: r.leave_type || "—", availed: days });
	}

	return [...tally.values()]
		.filter((r) => r.emp)
		.sort((a, b) =>
			(a.emp.employee_name || "").localeCompare(b.emp.employee_name || "") || a.type.localeCompare(b.type));
}

/** The two controls that section this report, outer first: Group By on the
    Advance tab, then Filter By on the bar. Stacking them is what two grouping
    controls on two tabs has to mean if neither is to be ignored — the same
    reading Daily Detail makes of the same pair. */
function lvbSections(f) {
	const keys = [];
	const g = CAT_GROUP_BY.find((x) => x[0] === f.gby);
	if (g && g[2]) keys.push([g[1], g[2]]);
	if (f.by) keys.push([(CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1], f.by]);
	return keys;
}

/** Headings and rows in one flat list, so the screen and the printed document
    section identically rather than each doing its own arithmetic.

    `lvl` counts down from the outer key, which is what the two heading styles
    are picked from: two levels of heading that look alike are one level as far
    as a reader is concerned. */
function lvbFlat(rows, keys) {
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
			...lvbFlat(list, rest),
		]);
}

const lvbStamp = (s) => `leave-balance-${s.lvb.ason || todayIso()}`;

/** The printed document — the same HTML Print, PDF, Word and Preview are all
    handed, so none of them can disagree with the others or with the screen. */
function lvbPaper(s, rows) {
	const f = s.lvb;
	const ason = f.ason || todayIso();

	/* A printed leave report gets filed and argued over later, so it carries the
	   criteria that produced it — and the caveat, because a balance report with
	   no balance in it is the kind of thing somebody quotes six months on. */
	const crit = [
		`${fmt(rows.length)} row${rows.length === 1 ? "" : "s"}`,
		f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
		f.ltype || "all leave types",
		(CAT_GROUP_BY.find((g) => g[0] === f.gby) || [])[2] ? `by ${f.gby}` : "",
	].filter(Boolean).join(" · ");

	const body = lvbFlat(rows, lvbSections(f))
		.map((x) => (x.head
			? `<tr class="${x.lvl > 1 ? "sec" : "grp"}"><td colspan="${LVB_COLS.length}">`
				+ `${esc(x.head)} — ${fmt(x.n)}</td></tr>`
			: `<tr>${LVB_COLS.map((c) => `<td${c[2] ? ` class="${c[2].replace(" gone", " muted")}"` : ""}>`
				+ `${esc(String(c[1](x.row)))}</td>`).join("")}</tr>`))
		.join("");

	return paper(`Leave Balance as at ${ason}`, `
		<div class="head">
			${f.layout.logo ? '<div class="mark">MANNA GROUP</div>' : ""}
			<h1>LEAVE BALANCE REPORT</h1>
			<p class="sub">As at ${esc(ason)} · ${esc(s.company || "all companies")}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		<table>
			<thead><tr>${LVB_COLS.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr><td colspan="${LVB_COLS.length}">
				Entitled and Balance are blank because no leave entitlement is readable from this site —
				Leave Allocation is not on the proxy allowlist and the site holds none. Availed is approved
				leave, clipped at the As On Date. Generated ${esc(nowStamp())}.
			</td></tr></tfoot>
		</table>`);
}

function lvbRun(s, kind) {
	const f = s.lvb;
	const done = (msg) => patch("lvb", { fmt: kind, fmenu: false, msg });

	if (!f.run) return done("Press Generate first — there is nothing to export until the report has run.");

	const rows = lvbRows(s);
	if (!rows.length) return done("Nothing to export.");

	if (kind === "Excel") {
		const name = lvbStamp(s) + ".csv";
		download(name, toCsv(LVB_COLS.map((c) => c[0]), rows.map((r) => LVB_COLS.map((c) => c[1](r)))));
		return done(`Exported ${fmt(rows.length)} rows to ${name}. Their button writes .xls; this one writes CSV, `
			+ "which every spreadsheet opens and nothing has to be installed to read.");
	}

	const html = lvbPaper(s, rows);

	if (kind === "Preview") {
		set({ lvbDoc: html });
		return done("");
	}
	if (kind === "Word") {
		const name = lvbStamp(s) + ".doc";
		save(name, html, "application/msword");
		return done(`Written to ${name}. <b>It is an HTML document with a Word content type</b> — the same thing `
			+ "Word's own <em>Save as Web Page</em> writes, so Word opens and edits it and no library was shipped "
			+ "to this browser to produce it.");
	}

	printPaper(html);
	done(kind === "PDF"
		? "<b>PDF is the print dialog with <em>Save as PDF</em> as the destination.</b> It is the same document "
			+ "Print and Preview show; a second renderer would only be a second chance to disagree with the screen."
		: "Sent to the print dialog.");
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
				onClick={(e) => { e.stopPropagation(); patch("lvb", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => {
							e.stopPropagation();
							patch("lvb", { status: o[0], menu: false, run: false, msg: "" });
						}}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

function LvbForm({ s }) {
	const f = s.lvb;
	const ason = f.ason || todayIso();
	const picked = f.emp ? s.byName[f.emp] || null : null;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list, which is why touching one clears the
	   last run rather than leaving a stale report on screen under new criteria. */
	const stale = (part) => patch("lvb", { ...part, run: false, msg: "" });

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
			<div className="fhtitle">Leave Balance Report</div>

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
								/* Typing over a chosen name clears the choice — otherwise the
								   box says one person and the report runs for another. */
								onChange={(e) => stale({ emp: "", q: e.target.value })}
							/>
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
								strokeWidth="1.8" strokeLinecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="M20 20l-3.6-3.6" />
							</svg>
						</span>
						<Desk className="embtn ic" href={s.site && deskImport(s.site)} label="Import employees from Excel"
							title="Import Employees from Excel. Opens ERPNext's Data Import on the site, which previews the file before it writes — this page proxies GET only, see server/index.js.">
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

				<div className="fld">
					<span className="lab">&nbsp;</span>
					<div className="ctl">
						<ExportMenu fmt={f.fmt} open={f.fmenu}
							onToggle={() => patch("lvb", { fmenu: !f.fmenu, gmenu: false })}
							onPick={(kind) => lvbRun(s, kind)} />
						<button className="embtn ic" title="Reload from the site" aria-label="Refresh"
							onClick={() => void load()}>↻</button>

						{/* Their Generate is a split button, and the three items behind it are
						    all about a queue. There is no queue here — but two of the three
						    have a real home on the site, where scheduling a report is one
						    doctype, so they open it rather than explaining that they cannot. */}
						<span className="empdrop">
							<button className="embtn pri"
								onClick={() => patch("lvb", { run: true, msg: "", gmenu: false })}>Generate</button>
							<button className="embtn pri split" aria-haspopup="menu" aria-expanded={f.gmenu}
								aria-label="More ways to run it"
								onClick={(e) => { e.stopPropagation(); patch("lvb", { gmenu: !f.gmenu, fmenu: false }); }}>
								▾
							</button>
							<div className="emmenu end" role="menu" hidden={!f.gmenu}>
								<button role="menuitem"
									onClick={(e) => {
										e.stopPropagation();
										patch("lvb", {
											run: true, gmenu: false,
											msg: "<b>Run here instead, because there is no background to run in.</b> In Factor HR "
												+ "this queues the report and mails it when it finishes. This page has no queue and "
												+ "no worker: the approved applications are already read and the arithmetic is done "
												+ "in the browser, which is why it can answer at once. Scheduling lives on the site "
												+ "— the two items below open it.",
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
						<span className="none">Nobody matches. The report will run over everybody the filters allow.</span>
					</div>
				)
			)}

			<div className="ddatabs" role="tablist" aria-label="Report criteria">
				{[["criteria", "Report Criteria"], ["advance", "Advance"]].map((t) => (
					<button key={t[0]} {...tabProps("lvbtab-" + t[0], "lvbpane", f.tab === t[0])}
						onClick={() => patch("lvb", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				/* Photographed 29 Aug 2026, and it holds one control. Their other
				   reports put four or two here; this one puts Group By and stops. */
				<div className="ddapane" {...panelProps("lvbpane", "lvbtab-" + f.tab)}>
					<div className="ddafield">
						<span className="lab">Group By</span>
						<select
							className="w-[min(22rem,100%)]"
							value={f.gby}
							aria-label="Group by"
							title="Factor HR's categories, not fields — the Category Type master behind the Categories screen."
							onChange={(e) => {
								const g = CAT_GROUP_BY.find((x) => x[0] === e.target.value);
								stale({ gby: e.target.value });
								patch("lvb", { msg: g && g[3] ? g[3] : "" });
							}}
						>
							{CAT_GROUP_BY.map((g) => (
								<option key={g[0] || "none"} value={g[0]}>
									{g[1]}{g[0] && !g[2] ? " — no field here" : ""}
								</option>
							))}
						</select>
						<span className="hint">Sections the report by category, on screen and in the export alike.</span>
					</div>
				</div>
			) : (
				<div className="ddapane" {...panelProps("lvbpane", "lvbtab-" + f.tab)}>
					<div className="ddafield">
						<span className="lab">As On Date</span>
						<span className="daterange">
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="1.7">
								<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
							</svg>
							<input type="date" value={ason} aria-label="As on date"
								onChange={(e) => stale({ ason: e.target.value })} />
						</span>
						{/* Their form takes one date where the attendance reports take a
						    range, and the difference is the point: leave still running on
						    this date is not availed on it. */}
						<span className="hint">
							A position, not a total. Leave that starts after this date is not counted, and an
							application still running on it counts only up to here.
						</span>
					</div>

					<div className="ddafield">
						<span className="lab">Leave Type</span>
						<select
							className="w-[min(22rem,100%)]"
							value={f.ltype}
							aria-label="Leave type"
							onChange={(e) => stale({ ltype: e.target.value })}
						>
							<option value="">Select leave type</option>
							{s.leaveTypes.map((t) => (
								<option key={t.name} value={t.name}>{t.name}</option>
							))}
						</select>
						<span className="hint">
							{s.leaveTypes.length
								? `The ${s.leaveTypes.length} types defined on the site, not Factor HR's six. Blank runs every type.`
								: "No Leave Type has been read from the site yet."}
						</span>
					</div>

					<div className="ddafield">
						<span className="lab">Layout Options</span>
						<div className="chips">
							{LVB_LAYOUT.filter((o) => f.layout[o[0]]).map((o) => (
								<span className="chip" key={o[0]}>
									{o[1]}
									<button aria-label={"Remove " + o[1]}
										onClick={() => patch("lvb", { layout: { ...f.layout, [o[0]]: false } })}>×</button>
								</span>
							))}
							{LVB_LAYOUT.some((o) => !f.layout[o[0]]) && (
								<select
									value=""
									aria-label="Add a layout option"
									onChange={(e) =>
										e.target.value && patch("lvb", { layout: { ...f.layout, [e.target.value]: true } })}
								>
									<option value="">+ add</option>
									{LVB_LAYOUT.filter((o) => !f.layout[o[0]]).map((o) => (
										<option key={o[0]} value={o[0]}>{o[1]}</option>
									))}
								</select>
							)}
						</div>
					</div>
				</div>
			)}

			{f.msg && <Note><Html html={f.msg} /></Note>}
		</div>
	);
}

/** What Generate produced. */
function LvbOut({ s }) {
	const rows = lvbRows(s);
	const ason = s.lvb.ason || todayIso();

	if (s.lvbState === "error") {
		return (
			<Empty title="The approved leave could not be read">
				{/* The proxy's own hint, which is a sentence fragment rather than a
				    sentence — so it is punctuated here rather than run into the next
				    one. */}
				<span className="block">{s.lvbErr || "The site refused the request"}.</span>
				Nothing here is stale: no figure is shown at all rather than one that might be wrong.
			</Empty>
		);
	}
	if (s.lvbState !== "done") {
		return <Empty title="Reading approved leave from the site…">One request, made the first time this page is opened.</Empty>;
	}
	if (!rows.length) {
		return (
			<Empty title="Nothing availed">
				No approved leave falls on or before {ason} for anybody the criteria allow.
				{s.lvbRows.length ? "" : " The site holds no approved Leave Application at all."}
			</Empty>
		);
	}

	const flat = lvbFlat(rows, lvbSections(s.lvb));
	return (
		<>
			<div className="ddacount">
				{fmt(rows.length)} row{rows.length === 1 ? "" : "s"} · as at {ason}
			</div>
			<Scroll>
				{/* `io` so the two heading levels pick up the bands the In / Out report
				    already defines for exactly this — a `sec` above a `grp`. */}
				<table className="io" style={{ minWidth: 90 * LVB_COLS.length }}>
					<thead>
						<tr>{LVB_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{flat.map((x, i) => (x.head ? (
							<tr className={x.lvl > 1 ? "sec" : "grp"} key={"g" + x.lvl + x.head}>
								<td colSpan={LVB_COLS.length}>{x.head} — {fmt(x.n)}</td>
							</tr>
						) : (
							<tr key={x.row.emp.name + x.row.type + i}>
								{LVB_COLS.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](x.row))}</td>
								))}
							</tr>
						)))}
					</tbody>
				</table>
			</Scroll>

			<Gap>
				<b>Entitled and Balance are empty, and that is the finding.</b> A balance needs an entitlement
				per person per type — <code>Leave Allocation</code> and the ledger under it. That doctype is
				not on the proxy allowlist, and the site holds none of it either, so there are two separate
				reasons and fixing one would not be enough. <b>Availed is real</b>: approved applications,
				clipped at the As On Date, off the site.
			</Gap>
		</>
	);
}

export default function LeaveBalances() {
	const s = useApp();

	/* One request, the first time somebody opens this page — the same terms On
	   Board and Work Pattern read on. loadLeaveBalances() guards itself against
	   the re-render it causes. */
	useEffect(() => { void loadLeaveBalances(); }, []);

	return (
		<>
			<div className="legend">
				<b className="font-display">Leave Balance Report</b>
				<span className="cov part">Availed only</span>
				<span>
					Factor HR's form, both tabs. Availed is read from the site; entitlement is not readable
					from either side yet, and the table at the foot is the target to reconcile against.
				</span>
			</div>

			<LvbForm s={s} />

			{s.lvb.run && <LvbOut s={s} />}

			<div className="fhtitle mt-[.5rem]">Factor HR, as read on 23 August 2026</div>
			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Leave type</th>
							<th>People with a balance</th>
							<th>Accrued</th>
							<th>Availed</th>
							<th>Balance</th>
						</tr>
					</thead>
					<tbody>
						{FH_LEAVE.map((r) => (
							<tr key={r[0]}>
								{/* A type with no balance and nothing availed is a type nobody
								    has ever used, and it is greyed rather than hidden. */}
								<td className={r[1] === 0 && r[3] === 0 ? "muted" : undefined}>{r[0]}</td>
								<td className="mono">{r[1]}</td>
								<td className="mono">{r[2].toFixed(1)}</td>
								<td className="mono">{r[3].toFixed(1)}</td>
								<td className="mono">{r[4].toFixed(1)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			{s.lvbDoc && (
				<Modal
					title="Report preview"
					wide
					onClose={() => set({ lvbDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.lvbDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => lvbRun(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => lvbRun(s, "Excel")}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
						</>
					}
					why={
						<>
							This is the document itself, not a drawing of it — the same HTML that Print, PDF and Word
							are handed, rendered here so it can be read before it goes anywhere.
						</>
					}
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.lvbDoc} />}
				/>
			)}
		</>
	);
}
