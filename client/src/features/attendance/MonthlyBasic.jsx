import { getState, patch, set, useApp } from "@/store";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { dailyRows } from "@/lib/dailydetail";
import { useEffect } from "react";
import { scoped } from "@/lib/scope";
import { DAY, dmy, fmt, nowStamp, tidyDept, todayIso, ymd } from "@/lib/format";
import { Fragment } from "react";
import { save } from "@/lib/csv";
import { monthlyBasicXlsx } from "@/lib/xlsx";
import { monthlySummaryRows } from "@/lib/monthlysummary";
import { esc, paper, printPaper } from "@/lib/doc";
import { CAT_FIELDS, CAT_GROUP_BY, MB_LETTER, MB_PAID } from "@/data/attendance";
import { CTC_BY } from "@/data/masters";
import { Empty, Gap, Modal, Scroll } from "@/components/ui";
import { sheetsPdf } from "@/lib/export";
import { HEAD_FILL, LETTER_FILL, ZEBRA_FILL } from "@/lib/fills";
import ReportForm, { Tiles, pickable } from "@/components/ReportForm";

/* Monthly Basic Attendance — the grid payroll reads, one row per person and one
   column per day. Their toolbar and their two tabs; the grid itself is ours,
   because this page has never been screenshotted.

   Every cell but Sunday is empty, and that is the deliverable rather than a
   fault. A cell here is not a fact anybody records — it is the *output* of
   measuring a punch against a shift and then against a policy, and two of those
   three do not exist yet. */

/** The month the picker opens on. Built from local parts rather than
    `toISOString`, which at UTC+5:30 would put midnight on the previous day and
    start the grid a day early. */
function defaultRange() {
	const now = new Date();
	return [
		ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
		ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
	];
}

const mbRange = (f) => {
	const [a, b] = defaultRange();
	return [f.from || a, f.till || b];
};

function mbDays(from, till) {
	const out = [];
	const a = new Date(from + "T00:00:00");
	const b = new Date(till + "T00:00:00");
	if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return out;
	/* Capped rather than validated: a year-long range is a mistake, not a
	   request, and 366 columns would hang the browser rather than say so. */
	for (const d = new Date(a); d <= b && out.length < 62; d.setDate(d.getDate() + 1)) out.push(new Date(d));
	return out;
}

/** Show Categories, from the Advance tab. The muster carries no company,
    department or designation column of its own, so all three are available —
    and they sit beside the name rather than past thirty-one day columns, which
    is the only place a reader would find them. */
const MB_CAT_COLS = CAT_FIELDS.map(([head, field]) => [
	head, field, (e) => (field === "department" ? tidyDept(e[field]) : e[field]) || "",
]);

const mbCats = (f) => MB_CAT_COLS.slice(0, Math.max(0, Math.min(f.cats || 0, MB_CAT_COLS.length)));

/** The section levels, outermost first: Group By from the Advance tab, then
    Filter By from the bar. They stack, as they do on the other two attendance
    reports. Each entry is [heading, the Employee field it reads]. */
function mbKeys(f) {
	const keys = [];
	const g = CAT_GROUP_BY.find((x) => x[0] === f.gby);
	if (g && g[2]) keys.push([g[1], g[2]]);
	if (f.by) keys.push([(CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1], f.by]);
	return keys;
}

/** Which section levels open at row `i` — a heading for each, and for every
    level inside one that opened. One list is sorted by these keys in order, so
    "changed" and "starts a section" are the same test. */
function mbOpens(people, i, keys) {
	const out = [];
	let broke = i === 0;
	keys.forEach(([, field], level) => {
		if (broke || String(people[i][field] || "") !== String(people[i - 1][field] || "")) {
			broke = true;
			out.push(level);
		}
	});
	return out;
}

/* Sorted by the grouping when there is one, so the section heads in the grid and
   the order of the CSV are the same order — a report that groups on screen and
   not in the export is two reports. Blanks sort last: "(not set)" is a finding,
   and a finding at the top of the page reads as the normal case. */
const mbPeople = (s) => {
	const keys = mbKeys(s.mb);
	const co = s.mb.co || s.company;
	return (co ? s.employees.filter((e) => e.company === co) : scoped(s))
		/* A person picked by name is shown whatever Employee Status says: the
		   picker lists everybody, and somebody who left mid-month still has a
		   month to read. */
		.filter((e) => s.mb.emp || !s.mb.status || e.status === s.mb.status)
		.filter((e) => !s.mb.emp || e.name === s.mb.emp)
		.slice()
		.sort((a, b) => {
			for (const [, field] of keys) {
				const d = String(a[field] || "￿").localeCompare(String(b[field] || "￿"));
				if (d) return d;
			}
			return String(a.employee_name || "").localeCompare(String(b.employee_name || ""));
		});
};

/** The heading a section level carries at row `i`, and how many people are in
    it — counted over the levels down to and including this one, so a nested
    heading counts its own section rather than its parent's. */
function mbHead(people, i, keys, level) {
	const [label, field] = keys[level];
	const v = people[i][field] || "";
	const same = (p) => keys.slice(0, level + 1).every(([, f2]) => String(p[f2] || "") === String(people[i][f2] || ""));
	return {
		text: `${label}: ${(field === "department" ? tidyDept(v) : v) || "(not set)"}`,
		n: people.filter(same).length,
	};
}

/* ---------------------------------------------------------------------------
   What a cell says — since 16 September 2026, the same day every other
   attendance report reads (lib/dailydetail.js): hrms's Attendance where the day
   was processed, the day's punches where it was not, approved leave, and the
   holiday list (the person's, else their company's) for weekly offs and
   holidays. Before that the grid waited for Generate, read Attendance a
   hundred rows at a time without its docstatus, and called every Sunday a
   weekly off whatever the calendar said.
   --------------------------------------------------------------------------- */

const STATUS_LETTER = {
	...MB_LETTER, "Weekly Off": "WO", "In Only": "MP", "Out Only": "MP", "Leave Applied": "LA", "—": "",
};

let mbCache = { key: null, map: null };

/** Every person's day in the range, by `employee|YYYY-MM-DD`, built once per read. */
function mbMap(s) {
	const [from, till] = mbRange(s.mb);
	const d = s.ddaData;
	if (d.key !== `${from}|${till}|` || d.state !== "ok") return null;
	const people = mbPeople(s);
	/* Who, not how many. Keyed on the count, picking one employee and then
	   another reused the first one's rows and drew the second as blank dots —
	   and so did switching to a company with the same headcount. */
	const who = people.map((e) => e.name).join("|");
	const key = [d, s.employees, s.companies, s.holidays, s.shiftWindows, who, from, till];
	if (mbCache.key && mbCache.key.every((v, i) => v === key[i])) return mbCache.map;
	const { rows } = dailyRows({
		people, from, to: till, attendance: d.attendance, punches: d.punches, leave: d.leave, overtime: d.overtime,
		holidaysOf: (e) => {
			const co = s.companies.find((c) => c.name === e.company);
			return s.holidays[e.holiday_list || (co && co.default_holiday_list) || ""] || [];
		},
		windows: s.shiftWindows, today: todayIso(), limit: 100000,
	});
	const map = {};
	for (const r of rows) map[r.emp.name + "|" + r.date] = r;
	mbCache = { key, map };
	return map;
}

/** What one cell says, and whether the site told us anything about the day.

    `text` is what the grid now shows in the cell — the actual punch, `in-out`,
    when there is one, and the letter only where there is no punch to show
    (a weekly off, a holiday, or a day nobody has measured yet). `letter` is
    kept alongside it: Payable and the xlsx fill colour still read the letter,
    not the clock times, because a day's pay does not change with the hour
    somebody happened to walk in. */
function mbCell(s, e, d) {
	const map = mbMap(s);
	const r = map && map[e.name + "|" + ymd(d)];
	if (!r) return { letter: "", text: "", known: false };
	let letter = STATUS_LETTER[r.status];
	if (letter == null) letter = r.dayType ? (r.dayType === "weekoff" ? "WO" : "H") : String(r.status).slice(0, 1).toUpperCase();
	if (letter === "WO" && s.mb.weekoff) letter = "";
	const text = r.in || r.out ? `${r.in || "?"}-${r.out || "?"}` : letter;
	return { letter, text, known: r.status !== "—", row: r };
}

/* Only a row that came off the site counts as knowing something. The weekly off
   is paid, but a month with nothing else in it is not a month with five payable
   days — it is a month nobody has measured, and this column is the one payroll
   reads. */
function mbPayable(s, e, days) {
	let paid = 0;
	let real = 0;
	days.forEach((d) => {
		const { letter, known } = mbCell(s, e, d);
		if (known) real++;
		if (letter) paid += MB_PAID[letter] || 0;
	});
	return real ? String(Math.round(paid * 2) / 2) : "";
}

/** Actual/Standard/Deficit hours, one lookup keyed by employee — the same
    arithmetic lib/monthlysummary.js gives Monthly Summary Attendance, read a
    second time here rather than duplicated, so the two reports cannot disagree
    about what a person's hours were. */
function mbSummaryByEmp(s) {
	const [from, till] = mbRange(s.mb);
	const d = s.ddaData;
	if (d.key !== `${from}|${till}|` || d.state !== "ok") return new Map();
	const people = mbPeople(s);
	const rows = monthlySummaryRows({
		people, from, to: till, attendance: d.attendance, punches: d.punches, leave: d.leave, overtime: d.overtime,
		holidaysOf: (e) => {
			const co = s.companies.find((c) => c.name === e.company);
			return s.holidays[e.holiday_list || (co && co.default_holiday_list) || ""] || [];
		},
		windows: s.shiftWindows, today: todayIso(),
	});
	return new Map(rows.map((r) => [r.emp.name, r]));
}

async function mbGenerate(force = true) {
	const [from, till] = mbRange(getState().mb);
	patch("mb", { busy: true, err: "", from, till });
	void loadShiftWindows();
	await loadDda(from, till, "", force);
	const d = getState().ddaData;
	if (d.key === `${from}|${till}|`) {
		patch("mb", { count: d.attendance.length, when: nowStamp(), err: d.err || "" });
	}
	patch("mb", { busy: false });
}

/* The grid as it stands, not the rows behind it: what somebody exports from
   this screen is what they can see on it. One column list for the CSV and the
   printed copy, so the two cannot end up different reports. */
function mbGrid(s) {
	const f = s.mb;
	const [from, till] = mbRange(f);
	const days = mbDays(from, till);
	const people = mbPeople(s);
	const cats = mbCats(f);
	const summary = mbSummaryByEmp(s);

	const cols = ["Emp code", "Name"].concat(
		cats.map((c) => c[0]),
		f.shift ? ["Shift"] : [],
		days.map((d) => ymd(d)),
		["Payable", "Actual Hrs", "Standard Hrs", "Deficit Hrs", "Actual/Day", "Standard/Day"],
	);
	/* The day cells a row shows are `text` — the punch, when there is one — but
	   the fill colour and the WO/P/A/HD legend the xlsx export prints still key
	   off the underlying letter, which a punched day's cell no longer carries.
	   `letters` runs in parallel to `rows`, one entry per day per person, so the
	   xlsx writer can colour and count without re-deriving it from a grid built
	   for display. */
	const letters = people.map((e) => days.map((d) => mbCell(s, e, d).letter));
	const rows = people.map((e) => {
		const sm = summary.get(e.name);
		return [e.employee_number || e.name, e.employee_name || ""].concat(
			cats.map((c) => c[2](e)),
			f.shift ? [e.default_shift || ""] : [],
			days.map((d) => mbCell(s, e, d).text),
			[
				mbPayable(s, e, days),
				sm ? sm.actualHours : "—",
				sm ? sm.standardHours : "—",
				sm ? sm.deficitHours : "—",
				sm ? sm.actualPerDay : "—",
				sm ? sm.standardPerDay : "—",
			],
		);
	});
	return { from, till, days, people, cats, cols, rows, letters };
}

const mbStamp = (s) => {
	const [from, till] = mbRange(s.mb);
	return `monthly-basic-attendance-${from}-to-${till}`;
};

/** The muster as one self-contained document — what Preview shows, Word opens,
    and Print and PDF hand to the print dialog. The section headings the grid
    draws are drawn here too, off the same walk, so the paper and the screen
    break in the same places. */
function mbPaper(s) {
	const f = s.mb;
	const { from, till, days, people, cols, rows } = mbGrid(s);
	const keys = mbKeys(f);

	const crit = [
		`${fmt(people.length)} ${people.length === 1 ? "person" : "people"} × ${fmt(days.length)} days`,
		f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
		keys.map((k) => `by ${k[0].toLowerCase()}`).join(", "),
		f.cats ? `${mbCats(f).map((c) => c[0]).join(" and ")} shown` : "",
		f.count ? `${fmt(f.count)} attendance rows, read ${f.when}` : "nothing generated",
	].filter(Boolean).join(" · ");

	const body = rows.map((cells, i) => {
		const heads = mbOpens(people, i, keys).map((level) => {
			const h = mbHead(people, i, keys, level);
			return `<tr class="${level === 0 && keys.length > 1 ? "sec" : "grp"}">`
				+ `<td colspan="${cols.length}">${esc(h.text)} — ${fmt(h.n)}</td></tr>`;
		}).join("");
		/* Payable plus the five hours columns trail the day columns now — see
		   mbGrid — so the day block ends five short of the row's own end, not at
		   its last cell. */
		const trailing = 6;
		const tds = cells.map((v, j) => {
			/* The day columns are the narrow ones, and a blank cell is drawn as a
			   dot rather than left empty: an empty cell in a printed muster reads
			   as a missing column rather than as a day nobody measured. */
			const day = j >= cols.length - trailing - days.length && j < cols.length - trailing;
			return `<td${day ? ' class="d"' : ""}>${esc(day ? v || "·" : v)}</td>`;
		}).join("");
		return heads + `<tr>${tds}</tr>`;
	}).join("");

	return paper(`Monthly Basic Attendance ${from} to ${till}`, `
		<div class="head">
			${f.logo ? '<div class="mark">MANNA GROUP</div>' : ""}
			<h1>MONTHLY BASIC ATTENDANCE REPORT</h1>
			<p class="sub">${esc(`${dmy(from)} to ${dmy(till)}`)} · ${esc(s.company || "all companies")}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		<table>
			<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr><td colspan="${cols.length}">Generated ${esc(nowStamp())}. P present · A absent · HD half day
				· L leave · LA leave applied · WO weekly off · H holiday · MP one punch only · a dot is a day not yet over.
				<b>Payable is filled only for somebody with at least one real Attendance row</b>, and it adds up
				what the grid holds rather than applying a policy — because the policy has not been
				stated.</td></tr></tfoot>
		</table>`);
}

/** One of the five formats on their export menu. */
async function mbRun(s, kind) {
	const done = (msg) => patch("mb", { fmt: kind, fmenu: false, msg });
	const f = s.mb;
	const grid = mbGrid(s);
	const { days, people, cols, rows } = grid;
	if (!days.length) return done("The range reads backwards — nothing to export.");
	if (!people.length) return done("Nobody matches these criteria, so there is nothing to export.");

	if (kind === "Excel") {
		const name = mbStamp(s) + ".xlsx";
		patch("mb", { fmt: kind, fmenu: false, msg: "Building the spreadsheet…" });
		try {
			const keys = mbKeys(f);
			await monthlyBasicXlsx(grid, {
				company: f.co || s.company || "", shift: !!f.shift, logo: !!f.logo,
				heads: people.map((_, i) => mbOpens(people, i, keys).map((level) => ({ ...mbHead(people, i, keys, level), level }))),
				crit: [
					`${fmt(people.length)} ${people.length === 1 ? "person" : "people"} × ${fmt(days.length)} days`,
					f.status ? `${f.status.toLowerCase()} employees` : "every employee status",
				].filter(Boolean).join(" · "),
				name,
			});
		} catch (e) {
			return done(`Could not build the spreadsheet: ${e && e.message ? e.message : e}. `
				+ `Falling back to ${mbStamp(s)}.csv, which opens in Excel without the formatting.`);
		}
		return done(`Exported the grid as it stands to ${name}, formatted the way Factor HR's own sheet is — `
			+ "company header, day-by-day columns coloured by status, and a legend with counts.");
	}

	if (kind === "PDF") {
		const name = mbStamp(s) + ".pdf";
		/* The status letter in a day cell rather than its punch times: thirty-one
		   columns of "08:01-17:00" do not fit on a page anybody can read. The
		   spreadsheet carries the times. */
		const dayFrom = cols.length - 6 - days.length;
		const letters = grid.letters;
		const sheet = {
			title: "Monthly Basic Attendance Report",
			sub: `${f.co || s.company || "All companies"} · ${dmy(grid.from)} to ${dmy(grid.till)}`,
			head: cols.map((c, j) => (j >= dayFrom && j < dayFrom + days.length ? String(days[j - dayFrom].getDate()) : c)),
			rows: rows.map((cells, i) => cells.map((v, j) => (j >= dayFrom && j < dayFrom + days.length ? letters[i][j - dayFrom] : v))),
			headFill: HEAD_FILL,
			zebra: ZEBRA_FILL,
			cellFill: (v, head, cells, i, j) => (j >= dayFrom && j < dayFrom + days.length ? LETTER_FILL[v] || null : null),
			note: "P present · A absent · HD half day · L leave · LA leave applied · WO weekly off · H holiday · MP one punch only.",
		};
		try {
			await sheetsPdf([sheet], name);
		} catch (e) {
			return done(`Could not build ${name}: ${e && e.message ? e.message : e}`);
		}
		return done(`Exported ${fmt(people.length)} ${people.length === 1 ? "person" : "people"} to ${name}.`);
	}

	const html = mbPaper(s);
	if (kind === "Preview") {
		set({ mbDoc: html });
		return done("");
	}
	if (kind === "Word") {
		const name = mbStamp(s) + ".doc";
		save(name, html, "application/msword");
		return done(`Written to ${name}. <b>It is an HTML document with a Word content type</b> — the same `
			+ "thing Word's own <em>Save as Web Page</em> writes, so Word opens and edits it and no library was "
			+ "shipped to this browser to produce it.");
	}
	printPaper(html);
	done(kind === "PDF"
		? "<b>PDF is the print dialog with <em>Save as PDF</em> as the destination.</b> It is the same document "
			+ "Print and Preview show; a second renderer would only be a second chance to disagree with the screen."
		: `Sent to the print dialog. Landscape A4 — and at ${fmt(days.length)} day columns it is still a `
			+ "wide page. A shorter range prints better than a smaller font reads.");
}

/* A new date only once all three parts are typed; the page reads the range
   itself when it changes. */
function mbDate(p) {
	if (Object.values(p).some((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v || ""))) return;
	patch("mb", { ...p, msg: "" });
}

function MbForm({ s, reading }) {
	const f = s.mb;
	const [from, till] = mbRange(f);
	const co = f.co || s.company || "";
	return (
		<>
			<ReportForm
				title="MONTHLY BASIC ATTENDANCE REPORT"
				state={reading ? "reading the site…" : `${from} to ${till}`}
				live={!reading}
				companies={s.companies} co={co} onCo={(v) => patch("mb", { co: v, emp: "", msg: "" })}
				status={f.status} onStatus={(v) => patch("mb", { status: v, emp: "", msg: "" })}
				people={pickable(s.employees, co, f.status)} who={f.emp} onWho={(v) => patch("mb", { emp: v, msg: "" })}
				from={from} till={till} onDates={mbDate}
				format={f.fmt} onFormat={(v) => patch("mb", { fmt: v })}
				onDownload={() => void mbRun(getState(), f.fmt === "PDF" ? "PDF" : "Excel")} busy={reading}
				msg={f.msg}
			/>
			{f.err && (
				<div className="mt-[.8rem]">
					<Gap>The site refused the report: {f.err}</Gap>
				</div>
			)}
		</>
	);
}

/* The figures over the grid, counted off the same letters the cells and the
   spreadsheet's colours read. */
function MbSummary({ s, days, people }) {
	const c = { P: 0, A: 0, HD: 0, L: 0, LA: 0, WO: 0, H: 0, MP: 0 };
	for (const e of people) for (const d of days) {
		const l = mbCell(s, e, d).letter;
		if (c[l] != null) c[l]++;
	}
	return (
		<Tiles items={[
			["People", people.length], ["Present", c.P, "good"], ["Absent", c.A, c.A ? "bad" : ""],
			["Half Day", c.HD], ["Leave", c.L + c.LA], ["Missed punch", c.MP, c.MP ? "warn" : "good", "Days with one punch only"],
			["Weekly Off", c.WO], ["Holiday", c.H],
		]} />
	);
}

export default function MonthlyBasic() {
	const s = useApp();
	const f = s.mb;
	const [from, till] = mbRange(f);
	const days = mbDays(from, till);
	const people = mbPeople(s);
	const cats = mbCats(f);
	const keys = mbKeys(f);
	const summary = mbSummaryByEmp(s);
	const named = f.emp ? s.byName[f.emp]?.employee_name : "";
	const woDays = days.filter((d) => d.getDay() === 0).length;

	/* Read on open and whenever the range changes, rather than waiting for
	   Generate — an empty grid on arrival read as a broken page. Keyed, so a
	   re-render does not read twice; Generate and ↻ still force a fresh read. */
	useEffect(() => {
		if (days.length) void mbGenerate(false);
	}, [from, till]);
	const reading = f.busy || s.ddaData.key !== `${from}|${till}|` || s.ddaData.state !== "ok";

	return (
		<>
			<div className="legend">
				<b className="font-display">Monthly Basic Attendance Report</b>
				<span className={"cov " + (reading ? "part" : "live")}>
					{reading ? "Reading…" : `${fmt(f.count)} attendance rows`}
				</span>
				<span>
					{named ? <b>{named}</b> : `${fmt(people.length)} ${people.length === 1 ? "person" : "people"}`}
					{" × "}{fmt(days.length)} days
					{f.when ? <> — generated <b>{f.when}</b></> : " — not generated yet"}
					. {fmt(people.length * woDays)} of the cells are the weekly off.
				</span>
			</div>

			<MbForm s={s} reading={reading} />

			{!reading && days.length ? <MbSummary s={s} days={days} people={people} /> : null}

			{/* Their "With Logo" chip, which on a printed report is the letterhead. */}
			{f.logo && (
				<div className="legend mt-[.8rem] justify-center">
					<b className="font-display text-sub">MANNA GROUP</b>
					<span>
						Monthly Basic Attendance — {dmy(from)} to {dmy(till)}
						{s.company ? ` — ${s.company}` : ""}
					</span>
				</div>
			)}

			<div className="legend mt-[.6rem]">
				<span><b>WO</b> weekly off</span>
				<span><b>P</b> present</span>
				<span><b>A</b> absent</span>
				<span><b>HD</b> half day</span>
				<span><b>L</b> leave</span>
				<span><b>H</b> holiday</span>
				<span><b>LA</b> leave applied</span>
				<span><b>MP</b> one punch only</span>
				<span className="muted">· blank: not over yet</span>
			</div>

			{!days.length ? (
				<div className="mt-[.7rem]">
					<Empty title="The range reads backwards">Date Range ends before it starts.</Empty>
				</div>
			) : people.length ? (
				<Scroll style={{ marginTop: ".7rem" }}>
					<table className="muster">
						<thead>
							<tr>
								<th>Emp code</th>
								<th>Name</th>
								{cats.map((c) => <th key={c[0]}>{c[0]}</th>)}
								{f.shift && <th>Shift</th>}
								{days.map((d) => (
									<th className="d" key={ymd(d)}>
										{d.getDate()}
										<small>{DAY[d.getDay()].slice(0, 2)}</small>
									</th>
								))}
								<th>Payable</th>
								<th>Actual Hrs</th>
								<th>Standard Hrs</th>
								<th>Deficit Hrs</th>
								<th>Actual/Day</th>
								<th>Standard/Day</th>
							</tr>
						</thead>
						<tbody>
							{people.map((e, i) => {
								const payable = mbPayable(s, e, days);
								const sm = summary.get(e.name);
								/* A section head wherever a grouped value changes, one per level:
								   Group By outside, Filter By inside. The list is already sorted by
								   them in order, so "changed" and "starts a section" are the same
								   test and no second pass is needed. */
								return (
									<Fragment key={e.name}>
									{mbOpens(people, i, keys).map((level) => {
										const h = mbHead(people, i, keys, level);
										return (
											<tr className={level === 0 && keys.length > 1 ? "sec" : "grp"} key={level}>
												<td colSpan={3 + cats.length + (f.shift ? 1 : 0) + days.length + 5}>
													{h.text}
													<span className="muted">{" · "}{fmt(h.n)} people</span>
												</td>
											</tr>
										);
									})}
									<tr>
										<td className="mono">{e.employee_number || e.name}</td>
										<td>{e.employee_name || ""}</td>
										{cats.map((c) => <td className="muted" key={c[0]}>{c[2](e) || "—"}</td>)}
										{f.shift && <td className="mono muted">{e.default_shift || "—"}</td>}
										{days.map((d) => {
											const { letter, text } = mbCell(s, e, d);
											return (
												<td className={"d " + (letter === "WO" ? "wo" : letter ? "" : "non")} key={ymd(d)}>
													{text || "·"}
												</td>
											);
										})}
										<td className="pay">{payable || "—"}</td>
										<td className="mono">{sm ? sm.actualHours : "—"}</td>
										<td className="mono muted">{sm ? sm.standardHours : "—"}</td>
										<td className="mono">{sm ? sm.deficitHours : "—"}</td>
										<td className="mono muted">{sm ? sm.actualPerDay : "—"}</td>
										<td className="mono muted">{sm ? sm.standardPerDay : "—"}</td>
									</tr>
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</Scroll>
			) : (
				<div className="mt-[.7rem]">
					<Empty title="Nobody matches">No employee is left after these criteria.</Empty>
				</div>
			)}

			{s.mbDoc && (
				<Modal
					title="Report preview"
					wide
					onClose={() => set({ mbDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.mbDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => mbRun(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => mbRun(s, "Excel")}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
						</>
					}
					why={
						<>
							This is the document itself, not a drawing of it — the same HTML that Print, PDF and Word
							are handed, rendered here so it can be read before it goes anywhere. A muster this wide
							prints on landscape A4; a shorter range prints better than a smaller font reads.
						</>
					}
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.mbDoc} />}
				/>
			)}
		</>
	);
}
