import { getState, patch, set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { scoped } from "@/lib/scope";
import { DAY, dmy, fmt, nowStamp, tidyDept, ymd } from "@/lib/format";
import { Fragment } from "react";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import { CAT_FIELDS, CAT_GROUP_BY, MB_LAYOUT, MB_LETTER, MB_PAID } from "@/data/attendance";
import { CTC_BY } from "@/data/masters";
import { Desk, Empty, ExportMenu, Gap, Html, Modal, Note, Scroll, panelProps, tabProps } from "@/components/ui";
import { deskNew, deskUrl } from "@/lib/desk";

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
	return scoped(s)
		.filter((e) => !s.mb.status || e.status === s.mb.status)
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

/** What one cell says, and what it is worth. `got` is a row that came off the
    site; anything else is either the weekly off or nothing at all. */
function mbCell(s, e, d) {
	const got = s.mbRows[e.name + "|" + ymd(d)];
	if (got) return { letter: MB_LETTER[got] || String(got).slice(0, 1).toUpperCase(), known: true };
	return { letter: d.getDay() === 0 && !s.mb.weekoff ? "WO" : "", known: false };
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

async function mbGenerate() {
	const [from, till] = mbRange(getState().mb);
	patch("mb", { busy: true, err: "", from, till });
	try {
		const rows = await listAll("Attendance", ["name", "employee", "attendance_date", "status"],
			[["attendance_date", ">=", from], ["attendance_date", "<=", till]]);
		const map = {};
		rows.forEach((r) => {
			map[r.employee + "|" + String(r.attendance_date).slice(0, 10)] = r.status || "";
		});
		set({ mbRows: map });
		patch("mb", { count: rows.length, when: nowStamp() });
	} catch (err) {
		patch("mb", { err: String(err.message || err) });
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

	const cols = ["Emp code", "Name"].concat(
		cats.map((c) => c[0]),
		f.shift ? ["Shift"] : [],
		days.map((d) => ymd(d)),
		["Payable"],
	);
	const rows = people.map((e) => [e.employee_number || e.name, e.employee_name || ""].concat(
		cats.map((c) => c[2](e)),
		f.shift ? [e.default_shift || ""] : [],
		days.map((d) => mbCell(s, e, d).letter),
		[mbPayable(s, e, days)],
	));
	return { from, till, days, people, cats, cols, rows };
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
		const tds = cells.map((v, j) => {
			/* The day columns are the narrow ones, and a blank cell is drawn as a
			   dot rather than left empty: an empty cell in a printed muster reads
			   as a missing column rather than as a day nobody measured. */
			const day = j >= cols.length - 1 - days.length && j < cols.length - 1;
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
			<tfoot><tr><td colspan="${cols.length}">Generated ${esc(nowStamp())}. WO weekly off · P present
				· A absent · HD half day · L leave · a dot is a day nothing was generated for.
				<b>Payable is filled only for somebody with at least one real Attendance row</b>, and it adds up
				what the grid holds rather than applying a policy — because the policy has not been
				stated.</td></tr></tfoot>
		</table>`);
}

/** One of the five formats on their export menu. */
function mbRun(s, kind) {
	const done = (msg) => patch("mb", { fmt: kind, fmenu: false, msg });
	const { days, people, cols, rows } = mbGrid(s);
	if (!days.length) return done("The range reads backwards — nothing to export.");
	if (!people.length) return done("Nobody matches these criteria, so there is nothing to export.");

	if (kind === "Excel") {
		const name = mbStamp(s) + ".csv";
		download(name, toCsv(cols, rows));
		return done(`Exported the grid as it stands to ${name}. Factor HR writes .xls; a CSV is the same thing `
			+ "without the formatting, and it opens in Excel.");
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

function MbForm({ s, days }) {
	const f = s.mb;
	const [from, till] = mbRange(f);
	const everyone = scoped(s).slice()
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));

	return (
		<div className="repform mt-[.7rem]">
			<div className="mbbar">
				<label className="mbf">
					<span>Particular Employee</span>
					<select className="grow" value={f.emp} onChange={(e) => patch("mb", { emp: e.target.value })}>
						<option value="">every employee</option>
						{everyone.map((p) => (
							<option key={p.name} value={p.name}>
								{`${p.employee_name} (${p.employee_number || "-"})`}
							</option>
						))}
					</select>
				</label>

				<label className="mbf">
					<span>Employee Status</span>
					<select value={f.status} onChange={(e) => patch("mb", { status: e.target.value })}>
						{["Active", "Inactive", "Suspended", "Left"].map((v) => <option key={v}>{v}</option>)}
						<option value="">All</option>
					</select>
				</label>

				<label className="mbf">
					<span>Filter By</span>
					{/* Their list has never been screenshotted open, so this one is ours:
					    the same five groupings the CTC and In/Out reports offer. Drawn live
					    rather than dead because what the control *does* — group the muster a
					    level above the person — is not in doubt, only which words they put
					    in it. The tooltip says whose list it is. */}
					<select value={f.by} aria-label="Filter by"
						title="Groups the muster a level above the person. Their own list has never been seen open, so these five are ours — the same ones the CTC and In / Out reports group by."
						onChange={(e) => patch("mb", { by: e.target.value })}>
						{CTC_BY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
					</select>
				</label>

				<label className="mbf">
					<span>Report Period</span>
					<select defaultValue="datewise" aria-label="Report period">
						<option value="datewise">Date Wise</option>
					</select>
				</label>

				<label className="mbf">
					<span>&nbsp;</span>
					<span className="flex gap-[.35rem] items-center">
						<ExportMenu fmt={f.fmt} open={f.fmenu}
							onToggle={() => patch("mb", { fmenu: !f.fmenu, gmenu: false })}
							onPick={(kind) => mbRun(s, kind)} />
						<button className="btn ghost" title="Reload from the site" aria-label="Reload from the site"
							onClick={() => void mbGenerate()}>↻</button>

						{/* Their Generate is a split button, and the three items behind it are
						    all about a queue. There is none here — but two of the three have a
						    real home on the site, so they open it rather than explaining that
						    they cannot. */}
						<span className="empdrop">
							<button className="btn imp" disabled={f.busy}
								onClick={() => { patch("mb", { gmenu: false }); void mbGenerate(); }}>
								{f.busy ? "Reading…" : "Generate"}
							</button>
							<button className="btn imp split" aria-haspopup="menu" aria-expanded={f.gmenu}
								aria-label="More ways to run it"
								onClick={(e) => { e.stopPropagation(); patch("mb", { gmenu: !f.gmenu, fmenu: false }); }}>
								▾
							</button>
							<div className="emmenu end" role="menu" hidden={!f.gmenu}>
								<button role="menuitem"
									onClick={(e) => {
										e.stopPropagation();
										patch("mb", {
											gmenu: false,
											msg: "<b>Run here instead, because there is no background to run in.</b> In Factor HR "
												+ "this queues the report and mails it when it finishes. Generate on this screen is "
												+ "one read of <code>Attendance</code> over the range; the grid is drawn from what "
												+ "comes back. Scheduling lives on the site — the two items below open it.",
										});
										void mbGenerate();
									}}>
									Generate in Background
								</button>
								<Desk href={s.site && deskNew(s.site, "Auto Email Report")} className=""
									label="Create Schedule Report"
									title="ERPNext's Auto Email Report — a report, a frequency, and who it goes to. It runs on the site's scheduler, which is the only clock that keeps time when this browser is closed.">
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
				</label>
			</div>

			<div className="tabs mb-[.85rem]" role="tablist" aria-label="Report criteria">
				<button className="tab" {...tabProps("mbtab-criteria", "mbpane", f.tab !== "advance")}
					onClick={() => patch("mb", { tab: "criteria" })}>Report Criteria</button>
				<button className="tab" {...tabProps("mbtab-advance", "mbpane", f.tab === "advance")}
					onClick={() => patch("mb", { tab: "advance" })}>Advance</button>
			</div>

			{f.tab === "advance" ? (
				/* This report's own Advance tab has still never been screenshotted. What
				   is on it here is carried across from the two whose tabs *have* been
				   opened — In / Out and Daily Detail, which hold exactly these two
				   controls — and it says so rather than implying it was seen. Both do
				   real work; neither is a guess about what their labels mean, only
				   about whether these are the labels. */
				<div className="repgrid" style={{ maxWidth: 760 }}
					{...panelProps("mbpane", f.tab === "advance" ? "mbtab-advance" : "mbtab-criteria")}>
					<label htmlFor="mbGby">Group By:</label>
					<span className="ctl">
						<select
							id="mbGby"
							value={f.gby}
							title="Factor HR's categories, not fields — the Category Type master behind the Categories screen."
							onChange={(e) => {
								const g = CAT_GROUP_BY.find((x) => x[0] === e.target.value);
								patch("mb", { gby: e.target.value, msg: g && g[3] ? g[3] : "" });
							}}
						>
							{CAT_GROUP_BY.map((g) => (
								<option key={g[0] || "none"} value={g[0]}>
									{g[1]}{g[0] && !g[2] ? " — no field here" : ""}
								</option>
							))}
						</select>
						<span className="hint">sections the muster above Filter By, which sections it above the person</span>
					</span>

					<label htmlFor="mbCats">Show Categories:</label>
					<span className="ctl">
						<input
							id="mbCats" type="number" min="0" max={MB_CAT_COLS.length} value={f.cats}
							title="How many category columns to put beside the name."
							onChange={(e) => {
								const n = Math.max(0, Math.min(Number(e.target.value) || 0, MB_CAT_COLS.length));
								patch("mb", {
									cats: n,
									msg: Number(e.target.value) > MB_CAT_COLS.length
										? `Capped at ${MB_CAT_COLS.length}. Only three of Factor HR's categories read onto a `
											+ "field on our side — Company, Department and Designation. The rest are pay "
											+ "treatment with no field behind them, and would be columns of dashes."
										: "",
								});
							}} />
						<span className="hint">
							{f.cats
								? `${mbCats(f).map((c) => c[0]).join(", ")} beside the name`
								: "their field held 0 and the label is a count, so it is read as how many category columns to add"}
						</span>
					</span>

					<span />
					<span className="ctl">
						<Note>
							<b>This tab has not been screenshotted on this report.</b> These are the two controls the
							In / Out and Daily Detail Advance tabs carry, and they behave here as they do there.
							Whatever Factor HR actually puts on this one is still a screenshot away — and if it is
							these two, nothing changes.
						</Note>
					</span>
				</div>
			) : (
				<div className="repgrid" style={{ maxWidth: 760 }}
					{...panelProps("mbpane", f.tab === "advance" ? "mbtab-advance" : "mbtab-criteria")}>
					<label htmlFor="mbFrom">Date Range:</label>
					<span className="ctl">
						<input type="date" id="mbFrom" value={from} onChange={(e) => patch("mb", { from: e.target.value })} />
						<span className="text-ink-2">to</span>
						<input type="date" aria-label="To date" value={till}
							onChange={(e) => patch("mb", { till: e.target.value })} />
						<span className="hint">
							{days.length ? `${fmt(days.length)} days` : "the range reads backwards"}
						</span>
					</span>

					<label>Layout Options:</label>
					<span className="ctl">
						<span className="taglist flex-auto">
							{/* Chips for what is on, buttons for what is off — their control, which
							    is a tag list rather than a row of checkboxes. */}
							{MB_LAYOUT.filter((o) => f[o[0]]).map((o) => (
								<span className="t" key={o[0]}>
									{o[1]}
									<button aria-label={"Remove " + o[1]}
										onClick={() => patch("mb", { [o[0]]: false })}>×</button>
								</span>
							))}
							{MB_LAYOUT.filter((o) => !f[o[0]]).map((o) => (
								<button className="add" key={o[0]} onClick={() => patch("mb", { [o[0]]: true })}>
									+ {o[1]}
								</button>
							))}
						</span>
					</span>

					<span />
					<span className="ctl">
						<label className="chk">
							<input type="checkbox" checked={f.weekoff}
								onChange={(e) => patch("mb", { weekoff: e.target.checked })} />
							Show Day Status on Week Off/Holiday
						</label>
						<span className="hint">
							off: Sunday reads WO. on: Sunday shows whatever the day actually holds.
						</span>
					</span>
				</div>
			)}

			{f.err && (
				<div className="mt-[.8rem]">
					<Gap>The site refused the report: {f.err}</Gap>
				</div>
			)}

			{f.msg && (
				<div className="mt-[.8rem]">
					<Note><Html html={f.msg} /></Note>
				</div>
			)}
		</div>
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
	const named = f.emp ? s.byName[f.emp]?.employee_name : "";
	const woDays = days.filter((d) => d.getDay() === 0).length;

	return (
		<>
			<div className="legend">
				<b className="font-display">Monthly Basic Attendance Report</b>
				<span className={"cov " + (f.count ? "live" : "none")}>
					{f.count ? `${fmt(f.count)} rows` : "Nothing to fill it with"}
				</span>
				<span>
					{named ? <b>{named}</b> : `${fmt(people.length)} ${people.length === 1 ? "person" : "people"}`}
					{" × "}{fmt(days.length)} days
					{f.when ? <> — generated <b>{f.when}</b></> : " — not generated yet"}
					. {fmt(people.length * woDays)} of the cells are the weekly off.
				</span>
			</div>

			<MbForm s={s} days={days} />

			{/* Their "With Logo" chip, which on a printed report is the letterhead. */}
			{f.logo && (
				<div className="legend mt-[.8rem] justify-center">
					<b className="font-display text-[1rem]">MANNA GROUP</b>
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
				<span className="muted">· nothing generated</span>
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
							</tr>
						</thead>
						<tbody>
							{people.map((e, i) => {
								const payable = mbPayable(s, e, days);
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
												<td colSpan={3 + cats.length + (f.shift ? 1 : 0) + days.length}>
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
											const { letter } = mbCell(s, e, d);
											return (
												<td className={"d " + (letter === "WO" ? "wo" : letter ? "" : "non")} key={ymd(d)}>
													{letter || "·"}
												</td>
											);
										})}
										<td className="pay">{payable || "—"}</td>
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
