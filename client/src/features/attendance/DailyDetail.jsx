
import { patch, set, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { DAY, MON, fmt, hrsMin, monthEnd, monthStart, nowStamp, spanOf, tidyDept, ymd } from "@/lib/format";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import { CTC_BY } from "@/data/masters";
import {
	CAT_GROUP_BY, DDA_CAT_COLS, DDA_COLS, DDA_LAYOUT, DDA_MONTH_COLS, DDA_PERIODS, DDA_PUNCH_TYPES,
} from "@/data/attendance";
import { Desk, Empty, ExportMenu, Html, Modal, Note, NoteBelow, Scroll, panelProps, tabProps } from "@/components/ui";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { load } from "@/api/load";
import People from "@/components/People";

/* Factor HR's Daily Detail Attendance Report panel, photographed 28 Aug 2026:
   the title, one row of labelled controls — Particular Employee, Employee
   Status, Filter By, Report Period, an Excel split button, refresh, and
   Generate — then two tabs, Report Criteria and Advance, holding a date range,
   layout-option chips and an Additional Filters funnel.

   Two things about it are copied on purpose. **Nothing is listed until Generate
   is pressed**: a report that runs on open is a report nobody chose the filters
   for. And **the status filter appears twice** — the coloured dot beside the
   search box and the Employee Status select — so both are bound to one value
   here. Whether their dot means something else on this screen is unknown. */

const longDate = (iso) => {
	const p = String(iso || "").slice(0, 10).split("-");
	return p.length === 3 && MON[+p[1] - 1] ? `${MON[+p[1] - 1]} ${+p[2]}, ${p[0]}` : "—";
};

/* One row per person per day, which is what the report is. Everything it can
   answer today comes from three places: the holiday list says which days nobody
   was expected, Employee Checkin says who punched, and the shift says what they
   were measured against. Two of the three are empty on this site, so most cells
   come out as a dash — and a dash here is the report working, not failing. */
/** Who the report would run over, before it is run. The same three filters
    ddaRows() starts from — kept beside it so the listing and the report cannot
    disagree about who is in scope. */
function ddaPeople(s) {
	const f = s.dda;
	let people = scoped(s);
	if (f.status) people = people.filter((e) => e.status === f.status);
	if (f.emp) people = people.filter((e) => e.name === f.emp);
	return people.slice().sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
}

function ddaRows(s) {
	const f = s.dda;
	let people = scoped(s);
	if (f.status) people = people.filter((e) => e.status === f.status);
	if (f.emp) people = people.filter((e) => e.name === f.emp);
	const from = f.from || monthStart();
	const to = f.to || monthEnd();
	if (to < from) return { rows: [], people: 0, capped: 0, bad: true };

	/* Punches are loaded for today only — see load(). So In and Out can only ever
	   be filled for today, and the report says which day that was rather than
	   leaving a reader to wonder why one row differs. */
	const punch = {};
	s.checkins.forEach((c) => {
		const k = c.employee + "|" + String(c.time).slice(0, 10);
		(punch[k] ||= []).push(c);
	});

	const rows = [];
	let capped = 0;
	const LIMIT = 1500;

	people.forEach((e) => {
		const hol = {};
		(s.holidays[e.holiday_list] || []).forEach((h) => {
			hol[String(h.holiday_date).slice(0, 10)] = h;
		});
		for (const d = new Date(from + "T00:00:00"); ymd(d) <= to; d.setDate(d.getDate() + 1)) {
			if (rows.length >= LIMIT) {
				capped++;
				continue;
			}
			const k = ymd(d);
			const h = hol[k];

			/* The two Advance filters that can be answered, applied here rather than
			   after the fact: they decide which days exist, and a cap counted over
			   days that were then filtered away would report the wrong number. */
			if (f.dow.length && !f.dow.includes(d.getDay())) continue;
			if (f.punch === "req" && h) continue;
			if (f.punch === "not" && !h) continue;

			const p = punch[e.name + "|" + k] || [];
			const ins = p.filter((x) => x.log_type === "IN").map((x) => x.time).sort();
			const outs = p.filter((x) => x.log_type === "OUT").map((x) => x.time).sort();
			const both = ins.length && outs.length;
			rows.push({
				emp: e,
				date: k,
				in: ins.length ? String(ins[0]).slice(11, 16) : "",
				out: outs.length ? String(outs[outs.length - 1]).slice(11, 16) : "",
				work: both ? spanOf(ins[0], outs[outs.length - 1]) : "",
				/* The same duration as a number, because Month Wise has to add them
				   up and "8 hrs 30 minutes" does not add. */
				ms: both
					? new Date(String(outs[outs.length - 1]).replace(" ", "T")).getTime()
						- new Date(String(ins[0]).replace(" ", "T")).getTime()
					: 0,
				/* Weekly off and holidays are the only day status this site can state.
				   Present, Absent and Half Day are outputs of the policy engine. */
				status: h ? (h.weekly_off ? "Weekly Off" : h.description || "Holiday") : "—",
			});
		}
	});
	return { rows, people: people.length, capped, bad: false };
}

/* ---------------------------------------------------------------------------
   Report Period, Group By, Show Categories — the three Advance controls that
   change the *shape* of the output rather than which days are in it. The two
   that change which days are in it live in ddaRows above.
   --------------------------------------------------------------------------- */

/** Month Wise: the same days, rolled up one row per person per month. It is a
    different set of columns rather than the day columns with a total on the
    end, because a roll-up answers different questions — and the five day
    columns that are dashes for everybody would be five dashes here too.

    Working Days is a calendar fact: days in the range that are neither a weekly
    off nor a holiday. It is not payable days. Payable days needs leave and the
    policy engine, and reporting one as the other is how somebody gets paid for
    the wrong month. */
function ddaMonths(rows) {
	const m = new Map();
	rows.forEach((r) => {
		const key = r.emp.name + "|" + r.date.slice(0, 7);
		const g = m.get(key)
			|| { emp: r.emp, month: r.date.slice(0, 7), days: 0, off: 0, hol: 0, punched: 0, ms: 0 };
		g.days++;
		if (r.status === "Weekly Off") g.off++;
		else if (r.status !== "—") g.hol++;
		if (r.in || r.out) g.punched++;
		g.ms += r.ms || 0;
		m.set(key, g);
	});
	return [...m.values()].map((g) => ({
		...g,
		working: g.days - g.off - g.hol,
		label: `${MON[+g.month.slice(5, 7) - 1] || "?"} ${g.month.slice(0, 4)}`,
		/* Zero worked hours is written as a dash, not as "0 hrs 0 minutes": on this
		   site it means no punches were loaded, not that nobody worked. */
		work: g.ms ? hrsMin(g.ms) : "",
	}));
}

/** Which columns the output carries: the period decides the base list, and Show
    Categories appends that many category columns to it. One list, which the
    table, the CSV and the printed copy all read. */
const ddaColumns = (f) =>
	(f.period === "month" ? DDA_MONTH_COLS : DDA_COLS)
		.concat(DDA_CAT_COLS.slice(0, Math.max(0, Math.min(f.cats || 0, DDA_CAT_COLS.length))));

/** The sections the report breaks into, outermost first: Group By from the
    Advance tab, then Filter By from the bar. They stack, which is what two
    grouping controls on two tabs has to mean if neither is to be ignored. Each
    entry is [heading, the Employee field it reads]. */
function ddaSections(f) {
	const keys = [];
	const g = CAT_GROUP_BY.find((x) => x[0] === f.gby);
	if (g && g[2]) keys.push([g[1], g[2]]);
	if (f.by) keys.push([(CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1], f.by]);
	return keys;
}

function chunk(list, key) {
	const m = new Map();
	list.forEach((r) => {
		const k = key(r);
		const l = m.get(k) || [];
		l.push(r);
		m.set(k, l);
	});
	return [...m.entries()];
}

/** One walk, splitting the rows into nested sections. The screen draws it as
    nested panels and the printed copy flattens it into heading rows — but both
    read this, so the page and the paper cannot come out in different orders. */
function ddaSplit(list, keys) {
	if (!keys.length) return [{ label: "", rows: list, kids: null }];
	const [k, ...rest] = keys;
	return chunk(list, (r) => String(r.emp[k[1]] || "—"))
		.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
		.map(([v, l]) => ({
			label: `${k[0]}: ${k[1] === "department" ? tidyDept(v) : v}`,
			rows: l,
			kids: ddaSplit(l, rest),
		}));
}

/* ---------------------------------------------------------------------------
   The five export formats. Excel is the CSV this screen already wrote; PDF,
   Word, Print and Preview are one HTML document handed to the print dialog, to
   Word, or to an iframe on this page — see lib/doc.js for why there is no PDF
   library here and is not going to be one.
   --------------------------------------------------------------------------- */

const ddaStamp = (s) => `daily-detail-${s.dda.from || monthStart()}-to-${s.dda.to || monthEnd()}`;

/** Every heading and every row, in order, flattened for the printed copy. */
function ddaFlat(blocks, out = []) {
	blocks.forEach((b) => {
		if (b.label) out.push({ head: b.label, n: b.rows.length });
		if (b.kids) ddaFlat(b.kids, out);
		else b.rows.forEach((row) => out.push({ row }));
	});
	return out;
}

function ddaPaper(s, list) {
	const f = s.dda;
	const cols = ddaColumns(f);
	const from = f.from || monthStart();
	const to = f.to || monthEnd();

	/* The criteria line is not decoration. A printed attendance report gets filed
	   and argued over months later, and one that does not say which filters
	   produced it cannot be checked against the site again. */
	const crit = [
		`${fmt(list.length)} row${list.length === 1 ? "" : "s"}`,
		(DDA_PERIODS.find((x) => x[0] === f.period) || ["", ""])[1].toLowerCase(),
		f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
		ddaSections(f).map((k) => `by ${k[0].toLowerCase()}`).join(", "),
		f.dow.length ? f.dow.map((d) => DAY[d]).join(", ") : "",
		f.punch ? (DDA_PUNCH_TYPES.find((x) => x[0] === f.punch) || ["", ""])[1].toLowerCase() : "",
	].filter(Boolean).join(" · ");

	const body = ddaFlat(ddaSplit(list, ddaSections(f)))
		.map((x) => (x.head
			? `<tr class="grp"><td colspan="${cols.length}">${esc(x.head)} — ${fmt(x.n)}</td></tr>`
			: `<tr>${cols.map((c) => `<td${c[2] ? ` class="${c[2]}"` : ""}>`
				+ `${esc(String(c[1](x.row)))}</td>`).join("")}</tr>`))
		.join("");

	return paper(`Daily Detail Attendance ${from} to ${to}`, `
		<div class="head">
			${f.layout.logo ? '<div class="mark">MANNA GROUP</div>' : ""}
			<h1>DAILY DETAIL ATTENDANCE REPORT</h1>
			<p class="sub">${esc(`${longDate(from)} - ${longDate(to)}`)} · ${esc(s.company || "all companies")}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		<table>
			<thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr><td colspan="${cols.length}">Generated ${esc(nowStamp())}. Late Coming By, Early Going By,
				Overtime and the two break columns are outputs of the attendance policy engine and are dashes here
				for everybody. In and Out can only be filled for the one day this page loads punches for. Day Status
				is the holiday list, which is the only part of a day this site can state on its own.</td></tr></tfoot>
		</table>`);
}

/** One of the five formats on their export menu. Nothing is exported before
    Generate: the file would otherwise carry filters nobody has run. */
function ddaRun(s, kind) {
	const f = s.dda;
	const done = (msg) => patch("dda", { fmt: kind, fmenu: false, msg });

	if (!f.run) return done("Press Generate first — there is nothing to export until the report has run.");

	const { rows } = ddaRows(s);
	if (!rows.length) return done("Nothing to export.");

	const cols = ddaColumns(f);
	const list = f.period === "month" ? ddaMonths(rows) : rows;

	if (kind === "Excel") {
		const name = ddaStamp(s) + ".csv";
		download(name, toCsv(cols.map((c) => c[0]), list.map((r) => cols.map((c) => c[1](r)))));
		return done(`Exported ${fmt(list.length)} rows to ${name}. Their button writes .xls; this one writes CSV, `
			+ "which every spreadsheet opens and nothing has to be installed to read.");
	}

	const html = ddaPaper(s, list);

	if (kind === "Preview") {
		set({ ddaDoc: html });
		return done("");
	}
	if (kind === "Word") {
		const name = ddaStamp(s) + ".doc";
		save(name, html, "application/msword");
		return done(`Written to ${name}. <b>It is an HTML document with a Word content type</b> — the same thing `
			+ "Word's own <em>Save as Web Page</em> writes, so Word opens and edits it and no library was shipped "
			+ "to this browser to produce it.");
	}

	printPaper(html);
	done(kind === "PDF"
		? "<b>PDF is the print dialog with <em>Save as PDF</em> as the destination.</b> It is the same document "
			+ "Print and Preview show; a second renderer would only be a second chance to disagree with the screen."
		: "Sent to the print dialog. Landscape A4 — fourteen columns do not fit on a portrait page.");
}

/** Factor HR's coloured status dot, which on this screen means the same thing
    as the Employee Status box beside it. */
function StatusDot({ s }) {
	const f = s.dda;
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === f.status) || opts[2];
	return (
		<span className="empdrop">
			<button
				className="embtn"
				aria-haspopup="listbox"
				aria-label="Filter by status"
				aria-expanded={f.menu}
				title={`Status: ${cur[2]} — the same filter as the Employee Status box beside it`}
				onClick={(e) => {
					e.stopPropagation();
					patch("dda", { menu: !f.menu });
				}}
			>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => {
							e.stopPropagation();
							patch("dda", { status: o[0], menu: false, run: false, msg: "" });
						}}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

function DdaForm({ s }) {
	const f = s.dda;
	const from = f.from || monthStart();
	const to = f.to || monthEnd();
	const picked = f.emp ? s.byName[f.emp] || null : null;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list, which is why touching one clears the
	   last run rather than quietly leaving a stale report on screen. */
	const stale = (part) => patch("dda", { ...part, run: false, msg: "" });

	// The search picker, offered under the bar as it is on their screen.
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
			<div className="fhtitle">Daily Detail Attendance Report</div>

			<div className="ddabar">
				<div className="fld wide">
					<span className="lab">Particular Employee</span>
					<div className="ctl">
						<StatusDot s={s} />
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
						<select value={f.status} onChange={(e) => stale({ status: e.target.value })}>
							{["All", "Active", "Inactive", "Suspended", "Left"].map((v) => (
								<option key={v} value={v === "All" ? "" : v}>{v}</option>
							))}
						</select>
					</div>
				</div>

				<div className="fld grow">
					<span className="lab">Filter By</span>
					<div className="ctl">
						<select className="wide" value={f.by} onChange={(e) => stale({ by: e.target.value })}>
							{CTC_BY.map((b) => (
								<option key={b[0]} value={b[0]}>{b[0] ? b[1] : ""}</option>
							))}
						</select>
					</div>
				</div>

				<div className="fld">
					<span className="lab">Report Period</span>
					<div className="ctl">
						<select
							value={f.period}
							title="Date Wise is one row per person per day. Month Wise rolls those same days up into one row per person per month — the same range, counted rather than listed."
							onChange={(e) => stale({ period: e.target.value })}
						>
							{DDA_PERIODS.map((p) => (
								<option key={p[0]} value={p[0]}>{p[1]}</option>
							))}
						</select>
					</div>
				</div>

				<div className="fld">
					<span className="lab">&nbsp;</span>
					<div className="ctl">
						<ExportMenu fmt={f.fmt} open={f.fmenu}
							onToggle={() => patch("dda", { fmenu: !f.fmenu, gmenu: false })}
							onPick={(kind) => ddaRun(s, kind)} />
						<button className="embtn ic" title="Reload from the site" aria-label="Refresh"
							onClick={() => void load()}>↻</button>

						{/* Their Generate is a split button too, and the three items behind it
						    are all about a queue. There is no queue here — but two of the three
						    have a real home on the site, where scheduling a report is one
						    doctype, so they open it rather than explaining that they cannot. */}
						<span className="empdrop">
							<button className="embtn pri"
								onClick={() => patch("dda", { run: true, msg: "", gmenu: false })}>Generate</button>
							<button className="embtn pri split" aria-haspopup="menu" aria-expanded={f.gmenu}
								aria-label="More ways to run it"
								onClick={(e) => { e.stopPropagation(); patch("dda", { gmenu: !f.gmenu, fmenu: false }); }}>
								▾
							</button>
							<div className="emmenu end" role="menu" hidden={!f.gmenu}>
								<button role="menuitem"
									onClick={(e) => {
										e.stopPropagation();
										patch("dda", {
											run: true, gmenu: false,
											msg: "<b>Run here instead, because there is no background to run in.</b> In Factor HR "
												+ "this queues the report and mails it when it finishes. This page has no queue and "
												+ "no worker: it holds the employees already read and does the arithmetic in the "
												+ "browser, which is why it can answer at once. Scheduling lives on the site — the "
												+ "two items below open it.",
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
					<button key={t[0]} {...tabProps("ddatab-" + t[0], "ddapane", f.tab === t[0])}
						onClick={() => patch("dda", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				/* Photographed 29 August 2026: Group By, Day Of Week, Show Categories,
				   Punch Type. Two of the four are ours to answer outright, one answers
				   for three of its six values, and one answers for three of its four —
				   and each says which it is where it is used, rather than in a footnote
				   nobody scrolls to. */
				<div className="ddapane" {...panelProps("ddapane", "ddatab-" + f.tab)}>
					<div className="ddagrid">
						<div className="ddafield">
							<span className="lab">Group By</span>
							<select
								value={f.gby}
								title="Factor HR's categories, not fields — the Category Type master behind the Categories screen."
								onChange={(e) => {
									const g = CAT_GROUP_BY.find((x) => x[0] === e.target.value);
									stale({ gby: e.target.value });
									patch("dda", { msg: g && g[3] ? g[3] : "" });
								}}
							>
								{CAT_GROUP_BY.map((g) => (
									<option key={g[0] || "none"} value={g[0]}>
										{g[1]}{g[0] && !g[2] ? " — no field here" : ""}
									</option>
								))}
							</select>
							<span className="hint">
								Sections the report by category. Stacks above <b>Filter By</b> on the bar, which is
								what two grouping controls on two tabs has to mean.
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Day Of Week</span>
							<div className="dow">
								{DAY.map((d, i) => (
									<button key={d} type="button" aria-pressed={f.dow.includes(i)}
										title={`Only ${d}s`}
										onClick={() => stale({
											dow: f.dow.includes(i) ? f.dow.filter((x) => x !== i) : f.dow.concat(i).sort(),
										})}>
										{d.slice(0, 3)}
									</button>
								))}
								{f.dow.length ? (
									<button type="button" className="clr" onClick={() => stale({ dow: [] })}>clear</button>
								) : null}
							</div>
							<span className="hint">
								{f.dow.length
									? `${f.dow.map((i) => DAY[i]).join(", ")} only.`
									: "Every day in the range. Answered from the date itself, so this one is exact."}
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Show Categories</span>
							<input type="number" min="0" max={DDA_CAT_COLS.length} value={f.cats}
								title="How many category columns to append to the output."
								onChange={(e) => {
									const n = Math.max(0, Math.min(Number(e.target.value) || 0, DDA_CAT_COLS.length));
									stale({ cats: n });
									patch("dda", {
										msg: Number(e.target.value) > DDA_CAT_COLS.length
											? `Capped at ${DDA_CAT_COLS.length}. Only ${DDA_CAT_COLS.length} of Factor HR's `
												+ "categories read onto a field on our side — Company, Department and "
												+ "Designation. The rest would be columns of dashes, and a column that is "
												+ "empty by construction is one somebody later writes a formula against."
											: "",
									});
								}} />
							<span className="hint">
								{f.cats
									? `${DDA_CAT_COLS.slice(0, f.cats).map((c) => c[0]).join(", ")} appended to every row.`
									: "Their field held 0 and the label is a count, so it is read here as how many category columns to append."}
							</span>
						</div>

						<div className="ddafield">
							<span className="lab">Punch Type</span>
							<select
								value={f.punch}
								onChange={(e) => {
									stale({ punch: e.target.value });
									patch("dda", {
										msg: e.target.value === "single"
											? "<b>Attendance Single Punch Required cannot be answered here.</b> It needs a flag "
												+ "saying one punch is enough for a person or a shift, and nothing on this site "
												+ "holds one — not <code>Employee</code>, not <code>Shift Type</code>. So the "
												+ "report is left unfiltered rather than filtered to nothing: an empty report "
												+ "reads as nobody qualifying, which is a different claim from not knowing."
											: "",
									});
								}}
							>
								{DDA_PUNCH_TYPES.map((t) => (
									<option key={t[0] || "all"} value={t[0]}>{t[1]}</option>
								))}
							</select>
							<span className="hint">
								Read as a property of the <b>day</b>, not of the person: the holiday list is what says a
								punch was expected. A weekly off or a holiday is <em>not required</em>; every other day
								is <em>required</em>.
							</span>
						</div>
					</div>

					<NoteBelow>
						<b>Two of these four are exact and two are a reading.</b> Day Of Week comes off the date and
						Show Categories off fields already loaded. Group By offers Factor HR’s categories, and the two
						that are pay treatment rather than groupings — Gratuity and LWF — have no field here to
						section on. Punch Type is read as a property of the day because that is the only reading this
						site can answer; whether theirs means the day or the person is one screenshot away.
					</NoteBelow>
				</div>
			) : (
				<div className="ddapane" {...panelProps("ddapane", "ddatab-" + f.tab)}>
					<div className="ddafield">
						<span className="lab">Date Range</span>
						<span className="daterange">
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="1.7">
								<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
							</svg>
							<input type="date" value={from} aria-label="From" onChange={(e) => stale({ from: e.target.value })} />
							<span className="sep">-</span>
							<input type="date" value={to} aria-label="To" onChange={(e) => stale({ to: e.target.value })} />
						</span>
						<span className="hint">{longDate(from)} - {longDate(to)}</span>
					</div>

					<div className="ddafield">
						<span className="lab">Layout Options</span>
						<div className="chips">
							{DDA_LAYOUT.filter((o) => f.layout[o[0]]).map((o) => (
								<span className="chip" key={o[0]}>
									{o[1]}
									<button aria-label={"Remove " + o[1]}
										onClick={() => patch("dda", { layout: { ...f.layout, [o[0]]: false } })}>×</button>
								</span>
							))}
							{DDA_LAYOUT.some((o) => !f.layout[o[0]]) && (
								<select
									value=""
									onChange={(e) =>
										e.target.value && patch("dda", { layout: { ...f.layout, [e.target.value]: true } })
									}
								>
									<option value="">+ add</option>
									{DDA_LAYOUT.filter((o) => !f.layout[o[0]]).map((o) => (
										<option key={o[0]} value={o[0]}>{o[1]}</option>
									))}
								</select>
							)}
						</div>
					</div>

					<div className="ddafield">
						<button className="ddamore" aria-expanded={f.more} onClick={() => patch("dda", { more: !f.more })}>
							<span className="lab">Additional Filters</span>
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
								strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
								<path d="M3 5h18l-7 8v6l-4 2v-8Z" />
							</svg>
						</button>
						{f.more && (
							<div className="mt-2">
								<Note>
									<b>Never seen open.</b> On our side the filters that would belong here are shift,
									department and whether the punch was biometric or from a phone — and only the last
									of those can be answered today.
								</Note>
							</div>
						)}
					</div>
				</div>
			)}

			{f.msg && <Note><Html html={f.msg} /></Note>}
		</div>
	);
}

const Table = ({ list, cols }) => (
	<Scroll>
		<table style={{ minWidth: 90 * cols.length }}>
			<thead>
				<tr>
					{cols.map((c) => (
						<th key={c[0]}>{c[0]}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{list.map((r) => (
					<tr key={r.emp.name + (r.date || r.month)}>
						{cols.map((c) => (
							<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	</Scroll>
);

/** The output. Grouped per person when the Show Employee Grouping chip is on,
    flat when it is taken off — which is what that chip does over there. */
function DdaReport({ s }) {
	const f = s.dda;
	const { rows, people, capped, bad } = ddaRows(s);

	if (bad) {
		return (
			<div className="gap mt-[.8rem]">
				<b>The range ends before it starts.</b> Nothing to report.
			</div>
		);
	}
	if (!rows.length) {
		return (
			<Empty title="No rows">
				{f.dow.length || f.punch
					? "The Advance tab's filters removed every day. Widen Day Of Week or Punch Type."
					: "Nobody matches the filters, so there are no days to report on."}
			</Empty>
		);
	}

	const month = f.period === "month";
	const cols = ddaColumns(f);
	const list = month ? ddaMonths(rows) : rows;

	/* Show Employee Grouping is the chip; Filter By is the section above it, and
	   Group By is the section above that. All three are theirs and they stack.
	   Month Wise is the one exception: it is already one row per person, so a
	   per-person panel around a single row is a box drawn round a fact. */
	const body = (rows2) =>
		f.layout.group && !month ? (
			chunk(rows2, (r) => r.emp.name).map(([, rows3]) => {
				const e = rows3[0].emp;
				return (
					<div className="ddagroup" key={e.name}>
						<header>
							<b>{e.employee_name}</b>
							<span className="mono">{e.employee_number || "—"}</span>
							<span className="muted">{tidyDept(e.department)} · {e.company}</span>
							<span className="n">{fmt(rows3.length)} days</span>
						</header>
						<Table list={rows3} cols={cols} />
					</div>
				);
			})
		) : (
			<Table list={rows2} cols={cols} />
		);

	/* One nested walk for any number of section levels, so Group By and Filter By
	   read the same whether one of them is set or both are. */
	const sections = (blocks) =>
		blocks.map((b, i) =>
			b.label ? (
				<div className="ddasection" key={b.label}>
					<h4>
						{b.label}
						<span>{fmt(b.rows.length)} rows</span>
					</h4>
					{b.kids ? sections(b.kids) : body(b.rows)}
				</div>
			) : (
				<div key={"all" + i}>{body(b.rows)}</div>
			),
		);

	const filled = month ? list.filter((r) => r.punched).length : rows.filter((r) => r.in || r.out).length;

	return (
		<div className="ddaout">
			{f.layout.logo && (
				<div className="ddalogo">
					<span className="mark">
						<span className="o">MA</span><span className="c">NN</span><span className="o">A</span>
					</span>
					<span>
						<b>Daily Detail Attendance Report</b>
						{longDate(f.from || monthStart())} - {longDate(f.to || monthEnd())}
						{s.company ? ` · ${s.company}` : " · Manna Group"}
					</span>
				</div>
			)}

			<div className="ddacount">
				{fmt(list.length)} {month ? "months" : "rows"} · {fmt(people)}{people === 1 ? " person" : " people"}
				{capped ? (
					<> · <b>capped</b> — {fmt(capped)} more not drawn, pick a person or a shorter range</>
				) : null}
				{" · "}{fmt(filled)} with a punch
				{f.dow.length ? <> · {f.dow.map((i) => DAY[i]).join(", ")} only</> : null}
			</div>

			{sections(ddaSplit(list, ddaSections(f)))}

			{month ? (
				<NoteBelow>
					<b>Month Wise counts the same days Date Wise lists.</b> Working Days is a calendar fact —
					days in the range that are neither a weekly off nor a holiday — and emphatically not payable
					days, which needs leave and the policy engine. <b>Days Punched can only ever be 0 or 1</b>{" "}
					until the bridge is running: this page loads one day of punches.
				</NoteBelow>
			) : (
				<NoteBelow>
					<b>Five of the fourteen columns are dashes for everybody, and they are the point.</b> Late
					Coming By, Early Going By and Overtime are outputs of the attendance policy engine; the two
					break columns are outputs of a break model nobody has specified.{" "}
					<b>In and Out can only be filled for today</b> — this page loads one day of punches. Day
					Status is the holiday list, which is the only part of a day this site can state on its own.
				</NoteBelow>
			)}
		</div>
	);
}

export default function DailyDetail() {
	const s = useApp();

	return (
		<>
			<div className="legend">
				<b className="font-display">Daily Detail Attendance Report</b>
				<span className="cov part">Export in hand</span>
				<span>
					One row per person per day. Factor HR’s panel, control for control — and this is the report
					the only confirmed shift timing was read out of.
				</span>
			</div>

			<DdaForm s={s} />

			{s.dda.run ? (
				<DdaReport s={s} />
			) : (
				/* Still nothing *generated* — a report that runs on open is a report
				   nobody chose the filters for, and that is Factor HR's model as well as
				   ours. But who it would run over is already in hand, so the screen says
				   that instead of saying nothing. */
				<People people={ddaPeople(s)}
					note="Everybody this report would cover, at the criteria above. Generate turns each of them into a row per day; nothing is read from the site until it is pressed." />
			)}

			{s.ddaDoc && (
				<Modal
					title="Report preview"
					wide
					onClose={() => set({ ddaDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.ddaDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => ddaRun(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => ddaRun(s, "Excel")}>
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
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.ddaDoc} />}
				/>
			)}
		</>
	);
}
