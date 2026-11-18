
import { getState, patch, set, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { DAY, MON, fmt, nowStamp, tidyDept, todayIso } from "@/lib/format";
import { save } from "@/lib/csv";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { esc, paper, printPaper } from "@/lib/doc";
import { CTC_BY } from "@/data/masters";
import { CAT_GROUP_BY, DDA_CAT_COLS, DDA_COLS, DDA_MONTH_COLS } from "@/data/attendance";
import { Empty, Modal, Scroll } from "@/components/ui";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { dailyRows, daySummary, monthRollup } from "@/lib/dailydetail";
import { useEffect, useState } from "react";
import { decideOvertime } from "@/api/overtime";
import { hm } from "@/lib/dailydetail";
import { parseOtInput } from "@/lib/overtime";
import { LocCell } from "@/components/PunchMap";
import ReportForm, { Tiles, pickable } from "@/components/ReportForm";
import { HEAD_FILL, LATE_FILL, ZEBRA_FILL, statusFill } from "@/lib/fills";
import mannaLogo from "@/assets/manna-logo.png";

/* Factor HR's Daily Detail Attendance Report panel, photographed 28 Aug 2026:
   the title, one row of labelled controls — Particular Employee, Employee
   Status, Filter By, Report Period, an Excel split button, refresh, and
   Generate — then two tabs, Report Criteria and Advance, holding a date range,
   layout-option chips and an Additional Filters funnel.

   Since 24 September 2026 the form is the same five questions as In / Out and
   Monthly Basic — company, status, employee, dates, a file — and the report
   reads on open, for today, the way those two do. */

const longDate = (iso) => {
	const p = String(iso || "").slice(0, 10).split("-");
	return p.length === 3 && MON[+p[1] - 1] ? `${MON[+p[1] - 1]} ${+p[2]}, ${p[0]}` : "—";
};

/* One row per person per day, which is what the report is. The arithmetic is
   lib/dailydetail.js: hrms's Attendance where the day has been processed, the
   day's punches where it has not, and leave and the holiday list for why a day
   with no punch is not an absence. Read for the whole range on Generate —
   api/attendance.js loadDda. */
/** Who the report would run over, before it is run. The same three filters
    ddaRows() starts from — kept beside it so the listing and the report cannot
    disagree about who is in scope. */
function ddaPeople(s) {
	const f = s.dda;
	const co = f.co || s.company;
	let people = co ? s.employees.filter((e) => e.company === co) : scoped(s);
	if (f.status) people = people.filter((e) => e.status === f.status);
	if (f.emp) people = people.filter((e) => e.name === f.emp);
	return people.slice().sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
}

function ddaRows(s) {
	const f = s.dda;
	const from = f.from || todayIso();
	const to = f.to || todayIso();
	const d = s.ddaData;
	/* Nothing is drawn from a read made for other criteria — a report headed
	   September over August's punches is worse than "reading…". */
	if (to < from) return { rows: [], people: 0, capped: 0, bad: true };
	if (d.key !== `${from}|${to}|${f.emp || ""}` || d.state !== "ok") {
		return { rows: [], people: 0, capped: 0, bad: false, waiting: true };
	}
	const people = ddaPeople(s);
	const out = dailyRows({
		people, from, to,
		attendance: d.attendance, punches: d.punches, leave: d.leave, overtime: d.overtime,
		holidaysOf: (e) => {
			const co = s.companies.find((c) => c.name === e.company);
			return s.holidays[e.holiday_list || (co && co.default_holiday_list) || ""] || [];
		},
		windows: s.shiftWindows,
		today: todayIso(),
		dow: f.dow, punch: f.punch,
	});
	return { ...out, people: people.length, err: d.err };
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
const ddaMonths = (rows) => monthRollup(rows).map((g) => ({
	...g,
	label: `${MON[+g.month.slice(5, 7) - 1] || "?"} ${g.month.slice(0, 4)}`,
}));

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

const ddaStamp = (s) => `daily-detail-${s.dda.from || todayIso()}-to-${s.dda.to || todayIso()}`;

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
	const from = f.from || todayIso();
	const to = f.to || todayIso();

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
			<tfoot><tr><td colspan="${cols.length}">Generated ${esc(nowStamp())}. Day Status, In, Out and Work Duration are hrms's Attendance where the day has been processed; a status marked * comes from the day's punches because it has not been processed yet. Late, Early and Overtime are against the shift's window.</td></tr></tfoot>
		</table>`);
}

/* The export's colours, off what a cell says: Day Status by status, and a late
   arrival or an early leaving in orange. */
const DDA_FILL = (v, head) => {
	if (head === "Day Status") return statusFill(v);
	if ((head === "Late Coming By" || head === "Early Going By") && v && v !== "—") return LATE_FILL;
	return null;
};

/** Daily Detail as a file for a range, from the Download report dialog: the
    page's own criteria set to that range, its own read, its own export —
    so the file is the one the page would have written. */
export async function ddaDownload(from, to, kind) {
	patch("dda", { from, to, emp: "" });
	void loadShiftWindows();
	await loadDda(from, to, "");
	await ddaRun(getState(), kind);
	return getState().dda.msg || "Done.";
}

/** One of the five formats on their export menu. */
function ddaRun(s, kind) {
	const f = s.dda;
	const done = (msg) => patch("dda", { fmt: kind, fmenu: false, msg });

	const { rows, waiting } = ddaRows(s);
	if (waiting) return done("Still reading the range — download again in a moment.");
	if (!rows.length) return done("Nothing to export.");

	const cols = ddaColumns(f);
	const list = f.period === "month" ? ddaMonths(rows) : rows;

	if (kind === "Excel" || kind === "PDF") {
		const name = ddaStamp(s) + (kind === "PDF" ? ".pdf" : ".xlsx");
		const sheet = {
			title: "Daily Detail Attendance Report",
			sub: `${f.co || s.company || "All companies"} · ${f.from || todayIso()} to ${f.to || todayIso()}`,
			headFill: HEAD_FILL,
			zebra: ZEBRA_FILL,
			cellFill: DDA_FILL,
			head: cols.map((c) => c[0]),
			rows: list.map((r) => cols.map((c) => { const v = c[1](r); return v == null ? "" : v; })),
		};
		return (kind === "PDF" ? sheetsPdf : sheetsXlsx)([sheet], name)
			.then(() => done(`Exported ${fmt(list.length)} rows to ${name}.`))
			.catch((e) => done(`Could not build ${name}: ${e.message || e}`));
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
	done("Sent to the print dialog. Landscape A4 — fifteen columns do not fit on a portrait page.");
}

/* A new date only once all three parts are typed — the browser hands over ""
   until then, and a half-date would read a range nobody asked for. */
function ddaDate(p) {
	if (Object.values(p).some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v || ""))) return;
	patch("dda", { ...p, msg: "" });
}

function DdaForm({ s }) {
	const f = s.dda;
	const co = f.co || s.company || "";
	const { waiting } = ddaRows(s);
	const from = f.from || todayIso();
	const to = f.to || todayIso();
	return (
		<ReportForm
			title="DAILY DETAIL ATTENDANCE REPORT"
			state={waiting ? "reading the site…" : `${from} to ${to}`}
			live={!waiting}
			companies={s.companies} co={co} onCo={(v) => patch("dda", { co: v, emp: "", msg: "" })}
			status={f.status} onStatus={(v) => patch("dda", { status: v, emp: "", msg: "" })}
			people={pickable(s.employees, co, f.status)} who={f.emp} onWho={(v) => patch("dda", { emp: v, msg: "" })}
			from={from} till={to} onDates={(p) => ddaDate(p.till !== undefined ? { to: p.till } : p)}
			format={f.fmt} onFormat={(v) => patch("dda", { fmt: v })}
			onDownload={() => ddaRun(getState(), f.fmt === "PDF" ? "PDF" : "Excel")} busy={waiting}
			msg={f.msg}
		/>
	);
}

/* ---------------------------------------------------------------------------
   Approving overtime, on the report payroll is read from (asked for 18 Nov
   2026). Overtime is the approved figure and the only one paid; OT Pending is
   what the punches earned and nobody has decided. Both are cells of the one
   table, so the decision is made beside the day it is about — its in, out and
   hours — rather than on a page that has to repeat them. The buttons are on
   the screen only: the file and the printout carry the figures.

   Anybody signed in here may decide: a company login is locked to its own
   company by the site (docs/COMPANY_USERS.md), so it can only write its own
   people's overtime, and that is the rule HR asked for.
   --------------------------------------------------------------------------- */

/** The saved row into the read the report is drawn from, so the cell changes
    without reading the whole range again. One row per person per day. */
function putOt(row) {
	const d = getState().ddaData;
	const day = String(row.ot_date).slice(0, 10);
	const rest = (d.overtime || []).filter((x) => !(x.employee === row.employee && String(x.ot_date).slice(0, 10) === day));
	set({ ddaData: { ...d, overtime: rest.concat([{ ...row, ot_date: day }]) } });
}

/** Decide one day and say how it went on the form's message line. */
async function otDecide(r, minutes, reason) {
	const res = await decideOvertime(r.emp, r.date, { minutes, autoMin: r.otAutoMin, reason });
	if (res.ok && res.row) putOt(res.row);
	patch("dda", { msg: res.msg });
	return res.ok;
}

function OtCell({ r, head, busy, onBusy, onEdit }) {
	const run = async (minutes) => {
		onBusy(r.emp.name + r.date);
		await otDecide(r, minutes, "");
		onBusy("");
	};
	const mine = busy === r.emp.name + r.date;
	const who = `${r.emp.employee_name} on ${r.date}`;
	if (head === "Overtime") {
		return (
			<span className="otcell">
				<span>{r.ot || "—"}</span>
				{r.otState === "approved" || r.otState === "rejected" ? (
					<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => onEdit(r)}
						title="Change the approved OT for this day" aria-label={`Edit OT for ${who}`}>✎</button>
				) : null}
			</span>
		);
	}
	if (r.otState === "rejected") return <span className="otcell otno" title="OT for this day was rejected">rejected</span>;
	if (r.otState !== "pending") return <span>—</span>;
	return (
		<span className="otcell">
			<span className="otwait" title="Worked out from the punches: time beyond the shift, in half hours. Not paid until approved.">{r.otPending}</span>
			<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => run(r.otPendingMin)}
				title={`Approve ${r.otPending} OT`} aria-label={`Approve ${r.otPending} OT for ${who}`}>{mine ? "…" : "✓"}</button>
			<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => onEdit(r)}
				title="Change the hours, then approve" aria-label={`Edit OT for ${who}`}>✎</button>
			<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => run(0)}
				title="Reject this OT" aria-label={`Reject OT for ${who}`}>✗</button>
		</span>
	);
}

/** Change a day's OT: type the hours, then approve them. 0 rejects. */
function OtDialog({ r, onClose }) {
	const start = r.otState === "approved" ? r.otMin : r.otPendingMin;
	const [text, setText] = useState(hm(start) || "0:00");
	const [reason, setReason] = useState((r.otEntry && r.otEntry.reason) || "");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const mins = parseOtInput(text);
	const save = async (m) => {
		setBusy(true);
		const ok = await otDecide(r, m, reason);
		setBusy(false);
		if (ok) onClose();
		else setErr(getState().dda.msg);
	};
	return (
		<Modal
			title={`Overtime — ${r.emp.employee_name}, ${r.date.split("-").reverse().join("-")}`}
			onClose={onClose}
			why={`In ${r.in || "—"} · Out ${r.out || "—"} · Worked ${r.work || "—"} · Shift ${r.shift || "—"}${r.shiftWindow ? ` (${r.shiftWindow})` : ""}`
				+ ` · From the punches: ${hm(r.otAutoMin) || "none"}`}
			msg={err || undefined}
			extra={
				<div className="otform">
					<div className="lvf">
						<label className="lab" htmlFor="ot-hours">OT hours (H:MM)</label>
						<span className="ctl">
							<input id="ot-hours" type="text" inputMode="decimal" value={text} autoFocus
								onChange={(e) => setText(e.target.value)} aria-invalid={mins == null} />
						</span>
					</div>
					<div className="lvf">
						<label className="lab" htmlFor="ot-reason">Reason (optional)</label>
						<span className="ctl">
							<input id="ot-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
						</span>
					</div>
					{mins == null ? <p className="otno">Type the hours as 2:30 or 2.5.</p> : null}
				</div>
			}
			foot={
				<>
					<button type="button" className="embtn" disabled={busy} onClick={() => save(0)}>Reject</button>
					<button type="button" className="btn tpl" disabled={busy || mins == null || mins > 16 * 60} onClick={() => save(mins)}>
						{busy ? "Saving…" : mins ? `Approve ${hm(mins)}` : "Save as no OT"}
					</button>
				</>
			}
		/>
	);
}

/** Approve every pending day shown, at the punches' figure. Asked once, then
    one at a time, so a refusal halfway says which day it stopped on. */
function OtBulk({ rows, onDone }) {
	const pend = rows.filter((r) => r.otState === "pending");
	const total = pend.reduce((n, r) => n + r.otPendingMin, 0);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const go = async () => {
		setBusy(true);
		let n = 0;
		for (const r of pend) {
			if (!(await otDecide(r, r.otPendingMin, ""))) break;
			n++;
			setDone(n);
		}
		setBusy(false);
		if (n === pend.length) patch("dda", { msg: `Approved OT on ${fmt(n)} days, ${hm(total)} in all.` });
		onDone();
	};
	return (
		<Modal
			title="Approve all pending OT"
			onClose={busy ? () => {} : onDone}
			why={`${fmt(pend.length)} days, ${hm(total)} in all, each at the figure the punches earned. `
				+ "It goes on the pay register as approved overtime. Edit or reject the days you want to change first."}
			msg={busy ? `Approving… ${fmt(done)} of ${fmt(pend.length)}` : undefined}
			foot={
				<button type="button" className="btn tpl" disabled={busy || !pend.length} onClick={go}>
					{busy ? "Approving…" : `Approve ${fmt(pend.length)} days`}
				</button>
			}
		/>
	);
}

const OT_HEADS = new Set(["Overtime", "OT Pending"]);

const Table = ({ list, cols, ot }) => (
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
							<td key={c[0]} className={c[2] || undefined}>
								{c[3] ? <LocCell r={c[3](r)} e={r.emp} />
									: ot && r.date && OT_HEADS.has(c[0]) ? <OtCell r={r} head={c[0]} {...ot} />
									: String(c[1](r))}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	</Scroll>
);

function DdaSummary({ rows }) {
	const n = daySummary(rows);
	return (
		<Tiles items={[
			["People", n.people], ["Present", n.present, "good"], ["Absent", n.absent, n.absent ? "bad" : ""],
			["Half Day", n.half], ["On Leave", n.leave, "", "Approved leave, and leave applied for and not yet decided"], ["Late", n.late, n.late ? "warn" : ""],
			["Missed punch", n.missed, n.missed ? "warn" : "good", "Days with only an in or only an out"],
			["Off / Holiday", n.off],
		]} />
	);
}

/** The output, as one table — sections only when Group By or Filter By is set. */
function DdaReport({ s }) {
	const f = s.dda;
	const from = f.from || todayIso();
	const to = f.to || todayIso();
	useEffect(() => {
		void loadShiftWindows();
		if (to >= from) void loadDda(from, to, f.emp);
	}, [from, to, f.emp]);
	const { rows, people, capped, bad, waiting, err } = ddaRows(s);
	const [otBusy, setOtBusy] = useState("");
	const [otEdit, setOtEdit] = useState(null);
	const [otAll, setOtAll] = useState(false);

	if (waiting) {
		return <div className="regload">Reading attendance and punches for {longDate(from)} – {longDate(to)}…</div>;
	}

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

	/* **One table: every person-day a row, every field a column** (asked for
	   25 Sep 2026). It used to be a boxed table per person, each with its own
	   header row, so the columns wandered from box to box and a status cell
	   could fall off the right edge of one box and not the next. The chip that
	   turned the boxes off went with the form on 24 Sep, which left them stuck
	   on. The Excel, PDF and printed copies were always one table; now the
	   screen matches them. Emp Code and Employee lead every row, so a person's
	   days still read together. */
	const ot = month ? null : { busy: otBusy, onBusy: setOtBusy, onEdit: setOtEdit };
	const body = (rows2) => <Table list={rows2} cols={cols} ot={ot} />;
	const pending = month ? [] : rows.filter((r) => r.otState === "pending");

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
					<img className="brandlogo" src={mannaLogo} alt="Manna Group" />
					<span>
						<b>Daily Detail Attendance Report</b>
						{longDate(f.from || todayIso())} - {longDate(f.to || todayIso())}
						{s.company ? ` · ${s.company}` : " · Manna Group"}
					</span>
				</div>
			)}

			{err ? <div className="deerr" role="alert"><b>{err}</b></div> : null}
			<div className="ddacount">
				{fmt(list.length)} {month ? "months" : "rows"} · {fmt(people)}{people === 1 ? " person" : " people"}
				{capped ? (
					<> · <b>capped</b> — {fmt(capped)} more not drawn, pick a person or a shorter range</>
				) : null}
				{" · "}{fmt(filled)} with a punch
				{f.dow.length ? <> · {f.dow.map((i) => DAY[i]).join(", ")} only</> : null}
			</div>

			<DdaSummary rows={rows} />

			{pending.length ? (
				<div className="otbar">
					<span>
						<b>{fmt(pending.length)}</b> {pending.length === 1 ? "day has" : "days have"} OT from the punches waiting
						for approval ({hm(pending.reduce((n, r) => n + r.otPendingMin, 0))}). It is not paid until approved.
					</span>
					<button type="button" className="embtn" disabled={Boolean(otBusy)} onClick={() => setOtAll(true)}>
						Approve all pending OT
					</button>
				</div>
			) : null}

			{sections(ddaSplit(list, ddaSections(f)))}

			{otEdit ? <OtDialog r={otEdit} onClose={() => setOtEdit(null)} /> : null}
			{otAll ? <OtBulk rows={rows} onDone={() => setOtAll(false)} /> : null}

		</div>
	);
}

export default function DailyDetail() {
	const s = useApp();

	return (
		<>
			<DdaForm s={s} />

			<DdaReport s={s} />

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
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.ddaDoc} />}
				/>
			)}
		</>
	);
}
