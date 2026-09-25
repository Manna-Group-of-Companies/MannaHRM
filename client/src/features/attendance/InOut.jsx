import { getState, patch, set, useApp } from "@/store";
import EmpPick from "@/components/EmpPick";
import { listAll } from "@/api/client";
import { loadWorkLocations } from "@/api/load";
import { clock, dayOf, dmy, fmt, nowStamp, tidyDept, todayIso } from "@/lib/format";
import { coordText, placeText, streamOf } from "@/lib/punchplace";
import { firstLast } from "@/lib/inout";
import { HEAD_FILL, LETTER_FILL, PUNCH_FILL, ZEBRA_FILL } from "@/lib/fills";
import ReportForm, { pickable } from "@/components/ReportForm";
import { LocCell } from "@/components/PunchMap";
import { Fragment } from "react";
import { CAT_FIELDS, CAT_GROUP_BY, IO_MAXDAYS } from "@/data/attendance";
import { Empty, Gap, Modal, Scroll } from "@/components/ui";
import { save } from "@/lib/csv";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { esc, paper, printPaper } from "@/lib/doc";

/* Factor HR's newer report chrome, photographed 28 Aug 2026: the title, a row
   of labelled controls, then REPORT CRITERIA / ADVANCE tabs holding a date
   range, a time window, the selfie switch, layout options and a funnel for
   additional filters.

   Copied control for control, including the four that cannot answer. The date
   range is the one that reaches the site: the dashboard loads today's punches
   on open, and any other day has to be fetched, so Generate is a request and
   the rest of the form is arithmetic on what it returned. */

/* One column list, and the table on screen, the CSV and the printed document
   all read it: `[heading, csv field, class, value, screen?]`. Three lists would
   be three chances for an export to disagree with what somebody read off the
   screen, and the export is the copy that gets argued over. The optional fifth
   draws the same value as something to click; it never says anything the
   fourth does not.

   The value function returns "" for absent rather than a dash — the dash is a
   thing a reader needs and a thing a data file must not have. */
const IO_COLS = [
	["Date", "date", "mono", (r) => String(r.time || "").slice(0, 10)],
	["Time", "time", "mono", (r) => clock(r.time)],
	["Emp code", "emp_code", "mono", (r, e) => e.employee_number || r.employee],
	["Name", "name", "", (r, e) => e.employee_name || r.employee_name || ""],
	["In / Out", "log_type", "", (r) => r.log_type || ""],
	["Terminal", "terminal", "mono", (r) => r.device_id || ""],
	["Stream", "stream", "", (r) => streamOf(r)],
	/* Factor HR's export has a Location column on this report, and it was the
	   one of their four we could not fill until the phone app started sending a
	   coordinate. */
	["Location", "location", "mono", (r) => coordText(r),
		(r, e) => <LocCell r={r} e={e} />],
	["Where", "where", "muted", (r, e, s) => placeText(r, s.workLocs)],
	["Company", "company", "muted", (r, e) => e.company || ""],
];

/* The First & last view: one row per person per day, off the same punches.
   Same shape as IO_COLS, so the table, the file and the paper all read it. */
const DAY_COLS = [
	["Date", "date", "mono", (r) => r.date],
	["Emp code", "emp_code", "mono", (r, e) => e.employee_number || r.employee],
	["Name", "name", "", (r, e) => e.employee_name || r.employee_name || ""],
	["First punch", "first", "mono", (r) => (r.first ? clock(r.first) : "")],
	["Last punch", "last", "mono", (r) => (r.last ? clock(r.last) : "")],
	["Span", "span", "", (r) => r.span],
	["Punches", "punches", "mono", (r) => String(r.punches)],
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
	if (f.view === "day") return DAY_COLS.concat(cats);
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

/* Before anybody presses Generate, the report is today's — and today's punches
   are already in the store, so the page opens generated without asking the
   site again. Any other range is a fetch. */
const ioToday = (s) =>
	!s.ioState && (s.io.from || todayIso()) === todayIso() && (s.io.till || todayIso()) === todayIso();
const ioSource = (s) => (ioToday(s) ? s.checkins || [] : s.ioRows || []);
const ioRanOf = (s) => (ioToday(s) ? `${todayIso()} to ${todayIso()}` : s.ioRan);

/* Everything the form asks of what came back. The date range was already
   applied by the fetch; these are the filters that do not need the site. */
function ioFiltered(s) {
	const f = s.io;
	const q = (f.emp || "").toLowerCase().trim();
	return ioSource(s)
		.filter((r) => {
			const e = s.byName[r.employee] || {};
			const co = f.co || s.company;
			if (co && e.company !== co) return false;
			if (f.who && r.employee !== f.who) return false;
			if (f.status && (e.status || "") !== f.status) return false;
			if (f.logtype && (r.log_type || "") !== f.logtype) return false;
			if (f.stream && streamOf(r) !== f.stream) return false;
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

/** The rows the chosen view draws: every punch, or one per person per day. */
const ioView = (s, punches) => (s.io.view === "day" ? firstLast(punches) : punches);

/* The one request this page makes, tried from the widest field list down: a
   field the site has not got refuses the whole read rather than dropping the
   column, and the report is more useful without a column than absent.

   The widest carries the server's geofence verdict, which only exists once
   `manna_hr` is installed. The next is stock hrms, coordinate included. */
const IO_BASE = ["name", "employee", "employee_name", "time", "log_type", "device_id"];
const IO_GEO = IO_BASE.concat(["latitude", "longitude"]);
const IO_TIERS = [
	IO_GEO.concat(["custom_distance_metres", "custom_geofence_result"]),
	IO_GEO,
	IO_BASE,
];

async function ioGenerate() {
	void loadWorkLocations();
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

	let rows = null;
	for (const fields of IO_TIERS) {
		rows = await listAll("Employee Checkin", fields, range).catch(() => null);
		if (rows !== null) break;
	}
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
		f.view === "day"
			? `${fmt(rows.length)} person-day${rows.length === 1 ? "" : "s"}, first and last punch`
			: `${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"}`,
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
				+ `${esc(dash(c[3](r, e, s), c[2] === "sel" ? "no photo" : ""))}</td>`)
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
				f.selfie && f.view !== "day" ? ", whose selfie column is empty because nothing in Frappe HR captures a photo on punch" : ""
			}. Attendance is generated from these punches by the shift job; this is the punch record, not the day.</td></tr></tfoot>
		</table>`);
}

/* The export's colours, by what a cell says rather than where it is, so a
   sorted or filtered sheet keeps them. Red on an odd punch count: one missing. */
const IO_FILL = (v, head) => {
	if (head === "Punches") return Number(v) % 2 ? LETTER_FILL.A : null;
	if (head === "In / Out" || head === "Stream") return PUNCH_FILL[v] || null;
	return null;
};

/** One of the five formats on their export menu. Excel and PDF are files built
    off the table's own columns; the other three are the one document, handed
    to the print dialog, to Word, or to an iframe on this page. */
function ioRun(s, kind) {
	patch("io", { fmt: kind, fmenu: false });

	const rows = ioView(s, ioFiltered(s));
	if (!rows.length) return set({ ioMsg: IO_NOTHING });

	if (kind === "Excel" || kind === "PDF") {
		/* The CSV's columns — every one but the selfie, which is empty by
		   construction. */
		const cols = ioCols(s.io).filter((c) => c[1]);
		const f = s.io;
		const sheet = {
			title: "In Out Activities Report",
			sub: `${f.co || s.company || "All companies"} · ${dmy(f.from || todayIso())} to ${dmy(f.till || f.from || todayIso())}`,
			headFill: HEAD_FILL,
			zebra: ZEBRA_FILL,
			cellFill: IO_FILL,
			head: cols.map((c) => c[0]),
			rows: rows.map((r) => {
				const e = s.byName[r.employee] || {};
				return cols.map((c) => { const v = c[3](r, e, s); return v == null ? "" : v; });
			}),
		};
		const name = ioStamp(s) + (kind === "PDF" ? ".pdf" : ".xlsx");
		(kind === "PDF" ? sheetsPdf : sheetsXlsx)([sheet], name)
			.then(() => set({ ioMsg: `Exported ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to ${name}.` }))
			.catch((e) => set({ ioMsg: `Could not build ${name}: ${e.message || e}` }));
		return undefined;
	}
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
		ioMsg: "Sent to the print dialog. Landscape A4 on purpose: the table is ten columns wide, eleven with "
			+ "the selfie column, and portrait drops the last of them off the page.",
	});
}

/* A new date is a new question for the site, so it is asked at once rather
   than waiting for Generate. A half-typed date is left alone: the browser hands
   over "" until all three parts are there. Back to today, and the preload
   answers without a read. */
function ioDate(p) {
	if (Object.values(p).some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v || ""))) return;
	patch("io", p);
	const f = getState().io;
	if ((f.from || todayIso()) === todayIso() && (f.till || todayIso()) === todayIso()) {
		return set({ ioState: "", ioRows: null, ioMsg: "" });
	}
	void ioGenerate();
}

/* Download reads the range first when what is on screen is not that range —
   an export of the last range somebody looked at, under this one's dates, is
   the copy that gets argued over. */
async function ioDownload() {
	const f = getState().io;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	const today = from === todayIso() && till === todayIso();
	if (!today && !(getState().ioState === "done" && getState().ioRan === `${from} to ${till}`)) {
		await ioGenerate();
		if (getState().ioState !== "done") return;
	}
	ioRun(getState(), f.fmt === "PDF" ? "PDF" : "Excel");
}

function IoForm({ s }) {
	const f = s.io;
	const co = f.co || s.company || "";
	const live = s.ioState === "done" || ioToday(s);
	return (
		<ReportForm
			title="IN / OUT ACTIVITY REPORT"
			state={s.ioState === "loading" ? "reading the site…" : live ? ioRanOf(s) : "not generated"}
			live={live}
			companies={s.companies} co={co} onCo={(v) => patch("io", { co: v, who: "" })}
			status={f.status} onStatus={(v) => patch("io", { status: v, who: "" })}
			people={pickable(s.employees, co, f.status)} who={f.who} onWho={(v) => patch("io", { who: v })}
			from={f.from || todayIso()} till={f.till || todayIso()} onDates={ioDate}
			format={f.fmt} onFormat={(v) => patch("io", { fmt: v })}
			onDownload={() => void ioDownload()} busy={s.ioState === "loading"}
			msg={s.ioMsg}
		/>
	);
}

function IoReport({ s }) {
	const f = s.io;
	const punches = ioFiltered(s);
	const rows = ioView(s, punches);
	const ran = ioRanOf(s);

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
		const got = ioSource(s).length;
		return (
			<div className="mt-[.9rem]">
				<Empty title="No punches in that range">
					{got
						? `${fmt(got)} came back for ${ran} and the filters on this form removed all of them.`
						: `Employee Checkin is empty for ${ran}. It stays empty until the fingerprint bridge is `
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
				<span className="cov live">
					{f.view === "day"
						? `${fmt(rows.length)} person-day${rows.length === 1 ? "" : "s"}`
						: `${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"}`}
				</span>
				<span>
					{ran}, {f.t1}–{f.t2}
					{f.by ? `, grouped by ${f.by}` : `, ${f.period.toLowerCase()}`}.
				</span>
				<span className="ml-auto flex gap-[.4rem]">
					{[["", "Every punch"], ["day", "First & last"]].map(([v, label]) => (
						<button key={label} type="button" className="embtn" aria-pressed={(f.view || "") === v}
							title={v ? "One row per person per day: the earliest punch, the latest, and the span between" : undefined}
							onClick={() => patch("io", { view: v })}>{label}</button>
					))}
				</span>
			</div>

			{/* No count tiles over this table — taken off 25 Sep 2026, asked for by
			    IT. The report is the punches; Daily Detail and Start Up carry the
			    counts. */}

			<Scroll style={{ marginTop: ".6rem" }}>
				<table className="io" style={{ minWidth: 1240 }}>
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
												{c[4] ? c[4](r, e, s) : dash(c[3](r, e, s), c[2] === "sel" ? "no photo" : "")}
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

	return (
		<>
			<div className="mt-[.8rem]">
				<IoForm s={s} />
			</div>

			{s.ioState || ioToday(s) ? <IoReport s={s} /> : (
				<div className="mt-[.9rem]">
					<Empty title="Not generated">Generate reads the range above from the site.</Empty>
				</div>
			)}

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
