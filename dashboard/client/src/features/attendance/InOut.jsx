import { getState, patch, set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { clock, dayOf, dmy, fmt, nowStamp, tidyDept, todayIso } from "@/lib/format";
import { Fragment } from "react";
import { CAT_FIELDS, CAT_GROUP_BY, IO_BY, IO_MAXDAYS, IO_PERIODS } from "@/data/attendance";
import { Empty, ExportMenu, Gap, Html, Modal, Note, Panel, Scroll, panelProps, tabProps } from "@/components/ui";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import ScheduleReport, { openSchedule } from "@/features/attendance/ScheduleReport";
import ScheduleList, { openScheduleList } from "@/features/attendance/ScheduleList";

/* Factor HR's newer report chrome, photographed 28 Aug 2026: the title, a row
   of labelled controls, then REPORT CRITERIA / ADVANCE tabs holding a date
   range, a time window, the selfie switch, layout options and a funnel for
   additional filters.

   Copied control for control, including the four that cannot answer. The date
   range is the one that reaches the site: the dashboard loads today's punches
   on open, and any other day has to be fetched, so Generate is a request and
   the rest of the form is arithmetic on what it returned. */

/* Which stream a punch came from. The trusted device-id prefix is still one of
   the open questions, so this reads the weaker version of the same rule: a
   punch carrying a terminal is from a machine, and one carrying none is not.
   Named `Unknown` rather than `Mobile` on purpose — the strong claim needs the
   prefix, and calling it mobile would geofence it in a reader's head. */
const ioStream = (r) => (r.device_id ? "Terminal" : "Unknown");

/* One column list, and the table on screen, the CSV and the printed document
   all read it: `[heading, csv field, class, value]`. Three lists would be three
   chances for an export to disagree with what somebody read off the screen,
   and the export is the copy that gets argued over.

   The value function returns "" for absent rather than a dash — the dash is a
   thing a reader needs and a thing a data file must not have. */
const IO_COLS = [
	["Date", "date", "mono", (r) => String(r.time || "").slice(0, 10)],
	["Time", "time", "mono", (r) => clock(r.time)],
	["Emp code", "emp_code", "mono", (r, e) => e.employee_number || r.employee],
	["Name", "name", "", (r, e) => e.employee_name || r.employee_name || ""],
	["In / Out", "log_type", "", (r) => r.log_type || ""],
	["Terminal", "terminal", "mono", (r) => r.device_id || ""],
	["Stream", "stream", "", (r) => ioStream(r)],
	["Company", "company", "muted", (r, e) => e.company || ""],
];

/* What Show Categories appends here. Company is already a column on this
   report, so the categories it can add are the other two — the number is capped
   at what this report can add rather than at what the master holds, because a
   column repeated under a second heading is worse than a column missing. */
const IO_CAT_COLS = CAT_FIELDS
	.filter(([, field]) => !IO_COLS.some((c) => c[1] === field))
	.map(([head, field]) => [
		head, field, "muted", (r, e) => (field === "department" ? tidyDept(e.department) : e[field]) || "",
	]);

/* Selfie is on the screen and on the paper when the switch is on, because
   their report has the column there and its emptiness is the thing worth
   seeing. It is not in the CSV: a data file with a column that is empty by
   construction is a column somebody later writes a formula against. */
const ioCols = (f) => {
	const cats = IO_CAT_COLS.slice(0, Math.max(0, Math.min(f.cats || 0, IO_CAT_COLS.length)));
	return IO_COLS.concat(cats, f.selfie ? [["Selfie", "", "sel", () => ""]] : []);
};

/** Group By, from the Advance tab: the outer section, above the grouping the
    Report Period and Filter By already do. Empty when no category is chosen, or
    when the one chosen has no field on our side to read. */
function ioCatOf(s, r) {
	const g = CAT_GROUP_BY.find((x) => x[0] === s.io.gby);
	if (!g || !g[2]) return "";
	const v = s.byName[r.employee]?.[g[2]] || "—";
	return `${g[1]}: ${g[2] === "department" ? tidyDept(v) : v}`;
}

const dash = (v, alt) => (v === "" || v == null ? alt || "—" : String(v));

/* Which field heads a group: Filter By first, then the Report Period — the
   same precedence their form implies by putting the two controls side by
   side. Out here rather than in the table, because the printed copy has to
   group the same way or the two are not the same report. */
function ioKeyOf(s, r) {
	const f = s.io;
	if (f.by) return String(s.byName[r.employee]?.[f.by] || "—");
	if (f.period === "Employee Wise") return s.byName[r.employee]?.employee_name || r.employee;
	return String(r.time || "").slice(0, 10);
}

const ioGroupLabel = (s, k) =>
	!s.io.by && s.io.period !== "Employee Wise" ? `${dmy(k)}, ${dayOf(k)}` : k;

/** Today's punches, scoped by the company picker — already loaded, so shown
    without asking. */
const todaysPunches = (s) =>
	s.checkins
		.filter((c) => !s.company || s.byName[c.employee]?.company === s.company)
		.slice()
		.sort((x, y) => String(x.time).localeCompare(String(y.time)));

/* Everything the form asks of what came back. The date range was already
   applied by the fetch; these are the filters that do not need the site. */
function ioFiltered(s) {
	const f = s.io;
	const q = (f.emp || "").toLowerCase().trim();
	return (s.ioRows || [])
		.filter((r) => {
			const e = s.byName[r.employee] || {};
			if (s.company && e.company !== s.company) return false;
			if (f.status && (e.status || "") !== f.status) return false;
			if (f.logtype && (r.log_type || "") !== f.logtype) return false;
			if (f.stream && ioStream(r) !== f.stream) return false;
			const hm = String(r.time || "").slice(11, 16);
			if (f.t1 && hm && hm < f.t1) return false;
			if (f.t2 && hm && hm > f.t2) return false;
			if (q) {
				const hay = `${e.employee_number || ""} ${e.employee_name || r.employee_name || ""} ${r.employee}`
					.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) => {
			/* The outer section first, or its heading rows would be emitted every
			   time the list crossed back into a category it had already left. */
			const ca = ioCatOf(s, a);
			if (ca) {
				const d = ca.localeCompare(ioCatOf(s, b));
				if (d) return d;
			}
			if (f.period === "Employee Wise") {
				const an = s.byName[a.employee]?.employee_name || a.employee;
				const bn = s.byName[b.employee]?.employee_name || b.employee;
				const d = String(an).localeCompare(String(bn));
				if (d) return d;
			}
			return String(a.time || "").localeCompare(String(b.time || ""));
		});
}

/* The one request this page makes. Both field lists are tried in turn: an
   `Employee Checkin` without `device_id` on it would otherwise take the whole
   report down, and the report is more useful without that column than absent. */
async function ioGenerate() {
	const f = getState().io;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	patch("io", { from, till });

	if (from > till) return set({ ioMsg: "The date range ends before it starts." });

	const days = Math.round((new Date(till).getTime() - new Date(from).getTime()) / 86400000) + 1;
	if (days > IO_MAXDAYS) {
		/* The site has a daily compute limit and this is a per-punch table: at 160
		   people a year is on the order of a hundred thousand rows. */
		return set({
			ioMsg: `That is ${fmt(days)} days. This report asks the site for every punch in the range, so it `
				+ `is capped at ${IO_MAXDAYS} days — the site has a daily compute limit and a punch table `
				+ "grows by 320 rows a day once the bridge is running.",
		});
	}

	set({ ioState: "loading", ioMsg: "" });
	const range = [["time", ">=", from + " 00:00:00"], ["time", "<=", till + " 23:59:59"]];

	let rows = await listAll("Employee Checkin",
		["name", "employee", "employee_name", "time", "log_type", "device_id"], range).catch(() => null);
	let err = "";
	if (rows === null) {
		rows = await listAll("Employee Checkin", ["name", "employee", "time", "log_type"], range)
			.catch((e) => { err = String(e.message || e).slice(0, 220); return null; });
	}

	if (err) return set({ ioState: "error", ioMsg: err, ioRows: null });
	set({ ioRows: rows || [], ioState: "done", ioRan: `${from} to ${till}` });
}

/** Nothing to hand over is a message rather than an empty file: a CSV with a
    header and no rows reads, to the person who opens it next week, as a day on
    which nobody punched. */
const IO_NOTHING = "Nothing to export — generate the report first, or widen the filters.";

const ioStamp = (s) => `in-out-activity-${s.io.from || todayIso()}`;

function ioExport(s) {
	const rows = ioFiltered(s);
	if (!rows.length) return set({ ioMsg: IO_NOTHING });
	/* Every column that holds data, which is every one but the selfie — the only
	   column empty by construction, and marked as such by having no field name.
	   The categories Show Categories adds are real values and go in. */
	const cols = ioCols(s.io).filter((c) => c[1]);
	const csv = toCsv(cols.map((c) => c[1]), rows.map((r) => {
		const e = s.byName[r.employee] || {};
		return cols.map((c) => c[3](r, e));
	}));
	const name = ioStamp(s) + ".csv";
	download(name, csv);
	set({
		ioMsg: `Exported ${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"} to ${name}. `
			+ "Written in the browser from what was already read — nothing was sent anywhere.",
	});
}

/** The report as one self-contained document. Preview shows it, Word opens it,
    and Print and PDF hand it to the print dialog — all four the same HTML, so
    what somebody signs is what they previewed. */
function ioPaper(s, rows) {
	const f = s.io;
	const cols = ioCols(f);

	/* Only a category that can actually section the report is named: picking one
	   with no field here leaves the report ungrouped, and a line claiming
	   otherwise would be a filing error waiting to happen. */
	const gby = CAT_GROUP_BY.find((x) => x[0] === f.gby && x[2]);

	/* The criteria line is not decoration. A printed attendance report gets
	   filed and argued over months later, and one that does not say which
	   filters produced it cannot be checked against the site again. */
	const crit = [
		`${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"}`,
		gby ? `sectioned by ${gby[1]}` : "",
		f.by ? `grouped by ${f.by}` : f.period.toLowerCase(),
		f.cats ? `${IO_CAT_COLS.slice(0, f.cats).map((c) => c[0]).join(" and ")} shown` : "",
		f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
		f.logtype || "in and out",
		f.stream ? `${f.stream.toLowerCase()} punches only` : "both streams",
		f.emp ? `matching “${f.emp}”` : "",
	].filter(Boolean).join(" · ");

	let last = null;
	let lastCat = null;
	const body = rows.map((r) => {
		const e = s.byName[r.employee] || {};
		const cat = ioCatOf(s, r);
		/* A new section restarts the grouping inside it, so the first day in each
		   section carries its own heading rather than inheriting the last one. */
		const sec = cat && cat !== lastCat
			? (last = null, `<tr class="sec"><td colspan="${cols.length}">${esc(cat)}</td></tr>`)
			: "";
		lastCat = cat;
		const k = ioKeyOf(s, r);
		const grp = k === last ? ""
			: `<tr class="grp"><td colspan="${cols.length}">${esc(ioGroupLabel(s, k))}</td></tr>`;
		last = k;
		const tds = cols
			.map((c) => `<td${c[2] ? ` class="${c[2]}"` : ""}>`
				+ `${esc(dash(c[3](r, e), c[2] === "sel" ? "no photo" : ""))}</td>`)
			.join("");
		return sec + grp + `<tr>${tds}</tr>`;
	}).join("");

	return paper(`In Out Activity ${f.from} to ${f.till}`, `
		<div class="head">
			${f.logo ? '<div class="mark">MANNA GROUP</div>' : ""}
			<h1>IN / OUT ACTIVITY REPORT</h1>
			<p class="sub">${esc(`${dmy(f.from)} to ${dmy(f.till)}, ${f.t1}–${f.t2}`)}
				· ${esc(s.company || "all companies")}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		<table>
			<thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr><td colspan="${cols.length}">Generated ${esc(nowStamp())} from Employee Checkin${
				f.selfie ? ", whose selfie column is empty because nothing in Frappe HR captures a photo on punch" : ""
			}. Attendance is generated from these punches by the shift job; this is the punch record, not the day.</td></tr></tfoot>
		</table>`);
}

/** One of the five formats on their export menu. Excel is the CSV above; the
    other four are the one document, handed to the print dialog, to Word, or to
    an iframe on this page. */
function ioRun(s, kind) {
	patch("io", { fmt: kind, fmenu: false });
	if (kind === "Excel") return ioExport(s);

	const rows = ioFiltered(s);
	if (!rows.length) return set({ ioMsg: IO_NOTHING });
	const html = ioPaper(s, rows);

	if (kind === "Preview") return set({ ioDoc: html, ioMsg: "" });

	if (kind === "Word") {
		const name = ioStamp(s) + ".doc";
		save(name, html, "application/msword");
		return set({
			ioMsg: `Written to ${name}. <b>It is an HTML document with a Word content type</b> — the same `
				+ "thing Word's own <em>Save as Web Page</em> writes, so Word opens and edits it and no library "
				+ "was shipped to this browser to produce it. Written here from what was already read; nothing "
				+ "was sent anywhere.",
		});
	}

	printPaper(html);
	set({
		ioMsg: kind === "PDF"
			? "<b>PDF is the print dialog with <em>Save as PDF</em> as the destination.</b> The browser writes a "
				+ "better PDF than a library shipped to it would, and it writes it from the same document Print "
				+ "and Preview show — a second renderer would only be a second chance to disagree with the screen."
			: "Sent to the print dialog. Landscape A4 on purpose: the table is eight columns wide, nine with "
				+ "the selfie column, and portrait drops the last of them off the page.",
	});
}

/** Factor HR's coloured status dot, the same control as on Employee Master —
    and here it writes the same value as the Employee Status box beside it. Two
    controls, one filter, which is what a duplicated control has to mean if it
    is not to lie. */
function IoDot({ s }) {
	const f = s.io;
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === f.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={f.menu} title={"Status: " + cur[2]}
				onClick={(e) => { e.stopPropagation(); patch("io", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => { e.stopPropagation(); patch("io", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/* The shared export split button, wired to this page's state. */
const IoExport = ({ s }) => (
	<ExportMenu fmt={s.io.fmt} open={s.io.fmenu}
		onToggle={() => patch("io", { fmenu: !s.io.fmenu, gmenu: false })}
		onPick={(kind) => ioRun(s, kind)} />
);

function IoForm({ s }) {
	const f = s.io;

	function button(k) {
		if (k === "generate") return void ioGenerate();
		if (k === "refresh") {
			if (s.ioState !== "done") {
				return set({ ioMsg: "Nothing has been generated yet — Generate reads the range first." });
			}
			return void ioGenerate();
		}
		if (k === "more") return void (patch("io", { more: !f.more }), set({ ioMsg: "" }));
		if (k === "logo" || k === "nologo") {
			patch("io", { logo: k === "logo" });
			return set({
				ioMsg: k === "logo"
					? "The wordmark now heads the PDF, the Word file and anything printed — it is a letterhead, "
						+ "so it appears where there is a page for it to head. The CSV has no letterhead to carry "
						+ "one, and the screen already has it in the chrome."
					: "",
			});
		}
		if (k === "genmore") {
			patch("io", { gmenu: false });
			void ioGenerate();
			/* Its validation — a backwards range, a range past the cap — runs before the
			   first await and leaves its complaint in `ioMsg`. That complaint is about
			   the range the person just asked for and outranks the standing note on why
			   there is no background, so it is only written when nothing was said. */
			if (getState().ioMsg) return;
			return set({
				ioMsg: "<b>Run here instead, because there is no background to run in.</b> In Factor HR this "
					+ "queues the report and mails it when it finishes. There is no queue behind this page and "
					+ "no worker: Generate is one read against the site and the rest is arithmetic in the "
					+ "browser, which is why it can answer at once. Scheduling lives on the site — the two "
					+ "items below it open it.",
			});
		}
		if (k === "upload") {
			set({
				ioMsg: "<b>That button imports.</b> This page proxies GET only — see <code>server/index.js</code>, "
					+ "where the one write allowed is a decision on an approval. Punches in particular are never "
					+ "typed in: a correction writes a missing <em>punch</em> through Attendance Regularization, "
					+ "so that the shift job stays the only thing generating Attendance.",
			});
		}
	}

	const state = s.ioState === "loading" ? "reading the site…"
		: s.ioState === "done" ? s.ioRan : "not generated";

	return (
		<section className="fhcat">
			<header>
				<h3>IN / OUT ACTIVITY REPORT</h3>
				<span className="right">
					<span className={"cov " + (s.ioState === "done" ? "live" : "part")}>{state}</span>
				</span>
			</header>

			<div className="iotop">
				<div className="iof">
					<span className="lab">Particular Employee</span>
					<span className="ctl">
						<IoDot s={s} />
						<input type="text" className="grow" placeholder="Search Employee" aria-label="Search employee"
							value={f.emp} onChange={(e) => patch("io", { emp: e.target.value })} />
						<button className="embtn" title="Import employees" onClick={() => button("upload")}>↑</button>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Employee Status</span>
					<span className="ctl">
						<select value={f.status} onChange={(e) => patch("io", { status: e.target.value })}>
							{[["Active", "Active"], ["Inactive", "Inactive"], ["", "All"]]
								.map((o) => <option key={o[1]} value={o[0]}>{o[1]}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Filter By</span>
					<span className="ctl">
						<select className="grow" value={f.by} onChange={(e) => patch("io", { by: e.target.value })}>
							{IO_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Report Period</span>
					<span className="ctl">
						<select value={f.period} onChange={(e) => patch("io", { period: e.target.value })}>
							{IO_PERIODS.map((v) => <option key={v}>{v}</option>)}
						</select>
					</span>
				</div>

				<div className="right">
					<IoExport s={s} />
					<button className="embtn" title="Run it again" onClick={() => button("refresh")}>↻</button>

					{/* Their Generate is a split button, and the three items behind it are all
					    about a queue. There is no queue here — but two of the three have a real
					    home on the site, where scheduling a report is one doctype, so they open
					    it rather than explaining that they cannot. Daily Detail's carries the
					    same three for the same reasons.

					    The first of the two was a bare `deskNew` link to that doctype until
					    Factor HR's own SCHEDULE REPORT wizard was photographed on 4 September
					    2026. The hand-off has not changed — a schedule needs something running
					    when nobody is watching and this is a browser tab, so Create Schedule
					    inside the wizard still opens Auto Email Report. What the wizard adds is
					    that the questions are theirs, the form arrives filled in, and the
					    answers the site has nowhere to put are named rather than lost on the
					    way. See features/attendance/ScheduleReport.jsx. */}
					<span className="empdrop">
						<button className="embtn pri"
							onClick={() => { patch("io", { gmenu: false }); button("generate"); }}>Generate</button>
						<button className="embtn pri split" aria-haspopup="menu" aria-expanded={f.gmenu}
							aria-label="More ways to run it" title="More ways to run it"
							onClick={(e) => { e.stopPropagation(); patch("io", { gmenu: !f.gmenu, fmenu: false }); }}>
							▾
						</button>
						<div className="emmenu end" role="menu" hidden={!f.gmenu}>
							<button role="menuitem"
								onClick={(e) => { e.stopPropagation(); button("genmore"); }}>
								Generate in Background
							</button>
							<button role="menuitem"
								title="Factor HR's Schedule Report wizard — Report Detail, then Scheduling Detail. The schedule itself is created on the site, by ERPNext's Auto Email Report, which runs on the site's scheduler — the only clock that keeps time when this browser is closed."
								onClick={(e) => {
									e.stopPropagation();
									patch("io", { gmenu: false });
									openSchedule("io");
								}}>
								Create Schedule Report
							</button>
							{/* Their SCHEDULE REPORT LIST, photographed 4 Sep 2026. This was a
							    second desk link; it is their own screen now, and it makes the
							    read rather than assuming the answer — the site's own list is
							    still one click away inside it. */}
							<button role="menuitem"
								title="Factor HR's Schedule Report List. The rows would be ERPNext's Auto Email Report, which this server does not carry — so the list says why it is empty rather than saying there are none, and opens the site's own where they can be seen."
								onClick={(e) => {
									e.stopPropagation();
									patch("io", { gmenu: false });
									openScheduleList("io");
								}}>
								View Scheduled Reports
							</button>
						</div>
					</span>
				</div>
			</div>

			<div className="iotabs" role="tablist" aria-label="Report criteria">
				{[["criteria", "Report Criteria"], ["advance", "Advance"]].map((t) => (
					<button key={t[0]} className="iotab" {...tabProps("iotab-" + t[0], "iobody", f.tab === t[0])}
						onClick={() => patch("io", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				/* Photographed 29 August 2026, and it holds two controls, not the four
				   on Daily Detail's: Group By and Show Categories. Neither filters —
				   both change the shape of what came back, which is why they need no
				   second Generate. */
				<div className="iobody" {...panelProps("iobody", "iotab-" + f.tab)}>
					<div className="iorow">
						<div className="iof">
							<span className="lab">Group By</span>
							<span className="ctl">
								<select
									className="grow"
									value={f.gby}
									title="Factor HR's categories, not fields — the Category Type master behind the Categories screen."
									onChange={(e) => {
										const g = CAT_GROUP_BY.find((x) => x[0] === e.target.value);
										patch("io", { gby: e.target.value });
										set({ ioMsg: g && g[3] ? g[3] : "" });
									}}
								>
									{CAT_GROUP_BY.map((g) => (
										<option key={g[0] || "none"} value={g[0]}>
											{g[1]}{g[0] && !g[2] ? " — no field here" : ""}
										</option>
									))}
								</select>
							</span>
							<span className="hint text-mini text-ink-3">
								sections the punches by category, above the grouping Report Period and Filter By
								already do
							</span>
						</div>

						<div className="iof">
							<span className="lab">Show Categories</span>
							<span className="ctl">
								<input
									type="number" min="0" max={IO_CAT_COLS.length} value={f.cats}
									title="How many category columns to append to each punch."
									onChange={(e) => {
										const n = Math.max(0, Math.min(Number(e.target.value) || 0, IO_CAT_COLS.length));
										patch("io", { cats: n });
										set({
											ioMsg: Number(e.target.value) > IO_CAT_COLS.length
												? `Capped at ${IO_CAT_COLS.length} on this report. Three of Factor HR's categories `
													+ "read onto a field on our side — Company, Department and Designation — and "
													+ "<b>Company is already a column here</b>, so these two are what is left to add."
												: "",
										});
									}} />
								<span className="hint text-mini text-ink-3">
									{f.cats
										? `${IO_CAT_COLS.slice(0, f.cats).map((c) => c[0]).join(" and ")} appended to every punch`
										: "their field held 0 and the label is a count, so it is read as how many category columns to append"}
								</span>
							</span>
						</div>
					</div>

				</div>
			) : (
				<div className="iobody" {...panelProps("iobody", "iotab-" + f.tab)}>
					<div className="iorow">
						<div className="iof">
							<span className="lab">Date Range</span>
							<span className="ctl">
								<input type="date" aria-label="From date" value={f.from || todayIso()}
									onChange={(e) => patch("io", { from: e.target.value })} />
								<span className="text-ink-3">–</span>
								<input type="date" aria-label="To date" value={f.till || todayIso()}
									onChange={(e) => patch("io", { till: e.target.value })} />
							</span>
						</div>
						<div className="iof">
							<span className="lab">From Time</span>
							<span className="ctl">
								<input type="time" aria-label="From time" value={f.t1}
									onChange={(e) => patch("io", { t1: e.target.value })} />
							</span>
						</div>
						<div className="iof">
							<span className="lab">Till Time</span>
							<span className="ctl">
								<input type="time" aria-label="Till time" value={f.t2}
									onChange={(e) => patch("io", { t2: e.target.value })} />
							</span>
						</div>
					</div>

					<div className="iorow">
						<label className="chk">
							<input type="checkbox" checked={f.selfie}
								onChange={(e) => {
									patch("io", { selfie: e.target.checked });
									set({
										ioMsg: e.target.checked
											? "Nothing in Frappe HR captures a photo on punch, so the column is shown empty "
											+ "rather than dropped. Their export carried 35 images for 34 punches — the selfie "
											+ "is real, it is stored, and at 160 people it is on the order of 5 MB a day."
											: "",
									});
								}} />
							Show Selfie Images in Report
						</label>
					</div>

					<div className="iorow block">
						<span className="lab font-mono text-micro tracking-[.1em] uppercase text-ink-3">
							Layout Options
						</span>
						<div className="chipbox mt-[.3rem]">
							{f.logo ? (
								<span className="chip">
									With Logo
									<button aria-label="Remove With Logo" onClick={() => button("nologo")}>×</button>
								</span>
							) : (
								<button className="embtn" onClick={() => button("logo")}>+ With Logo</button>
							)}
						</div>
					</div>

					<div className="iorow block">
						<button className="iofun" aria-expanded={f.more} onClick={() => button("more")}>
							Additional Filters
							<svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8Z" /></svg>
						</button>
						{f.more && (
							<div className="iorow mt-[.7rem]">
								<div className="iof">
									<span className="lab">In / Out</span>
									<span className="ctl">
										<select value={f.logtype} onChange={(e) => patch("io", { logtype: e.target.value })}>
											<option value="">All</option>
											<option>IN</option>
											<option>OUT</option>
										</select>
									</span>
								</div>
								<div className="iof">
									<span className="lab">Stream</span>
									<span className="ctl">
										<select value={f.stream} onChange={(e) => patch("io", { stream: e.target.value })}>
											<option value="">All</option>
											<option>Terminal</option>
											<option>Unknown</option>
										</select>
										<span className="hint text-mini text-ink-3">
											a punch with no terminal; the trusted prefix is still an open question
										</span>
									</span>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{s.ioMsg && (
				<div className="px-[.9rem] pb-[.9rem]">
					<Note><Html html={s.ioMsg} /></Note>
				</div>
			)}
		</section>
	);
}

/* The generated table. Their export carries Terminal, Location, Punch Info and
   a selfie per row; ours carries the two of those four that Employee Checkin
   has a column for, and says so where the others would be. */
function IoReport({ s }) {
	const f = s.io;
	const rows = ioFiltered(s);

	if (s.ioState === "loading") {
		return (
			<div className="mt-[.9rem]">
				<Empty title="Reading the site">Every punch between {f.from} and {f.till}.</Empty>
			</div>
		);
	}
	if (s.ioState === "error") {
		return (
			<div className="mt-[.9rem]">
				<Gap><b>The site refused the read.</b> {s.ioMsg}</Gap>
			</div>
		);
	}
	if (!rows.length) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="No punches in that range">
					{(s.ioRows || []).length
						? `${fmt(s.ioRows.length)} came back for ${s.ioRan} and the filters on this form removed all of them.`
						: `Employee Checkin is empty for ${s.ioRan}. It stays empty until the fingerprint bridge is `
						+ "running and the phone app is live — shown as nothing recorded rather than as 0%, because "
						+ "an empty attendance table and an empty factory produce identical numbers."}
				</Empty>
			</div>
		);
	}

	/* Section and group headings, emitted as the sorted list is walked — by
	   ioCatOf and ioKeyOf, which the printed copy walks with too. */
	const cols = ioCols(f);
	let last = null;
	let lastCat = null;

	return (
		<>
			<div className="legend mt-[.9rem]">
				<b className="font-display">Generated</b>
				<span className="cov live">{fmt(rows.length)} punch{rows.length === 1 ? "" : "es"}</span>
				<span>
					{s.ioRan}, {f.t1}–{f.t2}
					{f.by ? `, grouped by ${f.by}` : `, ${f.period.toLowerCase()}`}.
				</span>
				<span className="ml-auto"><IoExport s={s} /></span>
			</div>

			{f.selfie && (
				<div className="my-[.6rem]">
					<Gap>
						<b>Show Selfie Images has nothing to show.</b> Nothing in Frappe HR captures a photo on
						punch, so the column is present and empty rather than absent. Their mobile export carried{" "}
						<b>35 images for 34 punches</b> at roughly 14 KB each — on the order of <b>5 MB a day</b> at
						160 people, which is a storage decision as much as a feature.
					</Gap>
				</div>
			)}

			<Scroll style={{ marginTop: ".6rem" }}>
				<table className="io" style={{ minWidth: 980 }}>
					<thead>
						<tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const e = s.byName[r.employee] || {};
							const cat = ioCatOf(s, r);
							const opens = cat && cat !== lastCat;
							/* A new section restarts the grouping inside it, so the first day
							   in each carries its own heading rather than inheriting the last. */
							if (opens) last = null;
							lastCat = cat;
							const k = ioKeyOf(s, r);
							const first = k !== last;
							if (first) last = k;
							return (
								<Fragment key={r.name}>
									{opens && (
										<tr className="sec">
											<td colSpan={cols.length}>{cat}</td>
										</tr>
									)}
									{first && (
										<tr className="grp">
											<td colSpan={cols.length}>{ioGroupLabel(s, k)}</td>
										</tr>
									)}
									<tr>
										{cols.map((c) => (
											<td key={c[0]} className={c[2]}>
												{dash(c[3](r, e), c[2] === "sel" ? "no photo" : "")}
											</td>
										))}
									</tr>
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}

export default function InOut() {
	const s = useApp();
	const p = todaysPunches(s);

	return (
		<>
			<div className="legend">
				<b className="font-display">In Out Activities Report</b>
				<span className={"cov " + (p.length ? "live" : "part")}>
					{p.length ? `${fmt(p.length)} today` : "nothing today"}
				</span>
				<span>
					One Factor HR report, <code>rptInOutActivitiesSelfiePunch</code>, carries both streams.
				</span>
			</div>

			<div className="mt-[.8rem]">
				<IoForm s={s} />
			</div>

			{s.ioState ? <IoReport s={s} /> : (
				<div className="mt-[.9rem]">
					<Panel title="Today's punches, before anybody asks" cov={p.length ? "live" : "part"} ico="👆">
						{p.length ? (
							<Scroll>
								<table>
									<thead>
										<tr>
											<th>Time</th><th>Emp code</th><th>Name</th><th>In / Out</th><th>Company</th>
										</tr>
									</thead>
									<tbody>
										{p.map((c) => {
											const e = s.byName[c.employee] || {};
											return (
												<tr key={c.name}>
													<td className="mono">{clock(c.time)}</td>
													<td className="mono">{e.employee_number || c.employee}</td>
													<td>{e.employee_name || ""}</td>
													<td>{c.log_type || "—"}</td>
													<td className="muted">{e.company || "—"}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</Scroll>
						) : (
							<Empty title="No punches recorded">
								Employee Checkin is empty until the fingerprint bridge is running and the phone app is
								live. Shown as <em>nothing recorded</em> rather than as 0%, because an empty attendance
								table and an empty factory produce identical numbers.
							</Empty>
						)}
					</Panel>
				</div>
			)}

			{s.srep.open ? (
				<ScheduleReport onClose={() => set({ srep: { ...s.srep, open: false } })} />
			) : null}

			{s.sreplist.open ? (
				<ScheduleList onClose={() => set({ sreplist: { ...s.sreplist, open: false } })} />
			) : null}

			{s.ioDoc && (
				<Modal
					title="Report preview"
					wide
					onClose={() => set({ ioDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.ioDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => ioRun(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => ioRun(s, "Excel")}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
						</>
					}
					why={
						<>
							This is the document itself, not a drawing of it — the same HTML that Print, PDF and
							Word are handed, rendered here so it can be read before it goes anywhere.
						</>
					}
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.ioDoc} />}
				/>
			)}
		</>
	);
}
