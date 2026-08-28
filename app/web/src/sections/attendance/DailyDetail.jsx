import { COV_LABEL } from "@/data/sections";
import { CTC_BY } from "@/data/masters";
import { DDA_COLS, DDA_LAYOUT, DDA_PERIODS, FH_DAILY } from "@/data/attendance";
import { Cols, Empty, Gap, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { download, toCsv } from "@/lib/csv";
import { MON, fmt, monthEnd, monthStart, spanOf, tidyDept, ymd } from "@/lib/format";
import { scoped } from "@/lib/scope";
import { load } from "@/api/load";
import { patch, useApp } from "@/state/store";

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
			const p = punch[e.name + "|" + k] || [];
			const ins = p.filter((x) => x.log_type === "IN").map((x) => x.time).sort();
			const outs = p.filter((x) => x.log_type === "OUT").map((x) => x.time).sort();
			rows.push({
				emp: e,
				date: k,
				in: ins.length ? String(ins[0]).slice(11, 16) : "",
				out: outs.length ? String(outs[outs.length - 1]).slice(11, 16) : "",
				work: ins.length && outs.length ? spanOf(ins[0], outs[outs.length - 1]) : "",
				/* Weekly off and holidays are the only day status this site can state.
				   Present, Absent and Half Day are outputs of the policy engine. */
				status: h ? (h.weekly_off ? "Weekly Off" : h.description || "Holiday") : "—",
			});
		}
	});
	return { rows, people: people.length, capped, bad: false };
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

	function exportCsv() {
		if (!f.run) {
			return patch("dda", { msg: "Press Generate first — there is nothing to export until the report has run." });
		}
		const { rows } = ddaRows(s);
		if (!rows.length) return patch("dda", { msg: "Nothing to export." });
		const name = `daily-detail-${from}-to-${to}.csv`;
		download(name, toCsv(DDA_COLS.map((c) => c[0]), rows.map((r) => DDA_COLS.map((c) => c[1](r)))));
		patch("dda", {
			msg: `Exported ${fmt(rows.length)} rows to ${name}. Their button writes .xls; this one writes CSV, `
				+ "which every spreadsheet opens and nothing has to be installed to read.",
		});
	}

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
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="#918D93" fill="none"
								strokeWidth="1.8" strokeLinecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="M20 20l-3.6-3.6" />
							</svg>
						</span>
						<button className="embtn ic" disabled
							title="Import Employees from Excel. It writes, and this page proxies GET only — see app/serve.py.">
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
								strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
							</svg>
						</button>
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
							title="Only Date Wise has ever been seen on this menu. The rest of the list is one screenshot away and is not guessed at here."
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
						<button className="embtn xls" title="Export the generated rows as CSV" onClick={exportCsv}>
							<b>X</b>
						</button>
						<button className="embtn ic" title="Reload from the site" aria-label="Refresh"
							onClick={() => void load()}>↻</button>
						<button className="embtn pri" onClick={() => patch("dda", { run: true, msg: "" })}>Generate</button>
						<button className="embtn pri split" disabled
							title="Generate In Background needs a queue on the site. Nothing here runs anywhere but this browser.">▾</button>
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

			<div className="ddatabs">
				{[["criteria", "Report Criteria"], ["advance", "Advance"]].map((t) => (
					<button key={t[0]} aria-selected={f.tab === t[0]} onClick={() => patch("dda", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				<div className="ddapane">
					<Note>
						<b>Never opened.</b> Factor HR’s Advance tab has not been screenshotted, so nothing is
						invented under it. One screenshot is all it takes — and it is worth taking, because
						everything this report cannot answer would be configured somewhere like here.
					</Note>
				</div>
			) : (
				<div className="ddapane">
					<div className="ddafield">
						<span className="lab">Date Range</span>
						<span className="daterange">
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="#918D93" fill="none" strokeWidth="1.7">
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

			{f.msg && <Note>{f.msg}</Note>}
		</div>
	);
}

const Table = ({ list }) => (
	<Scroll>
		<table style={{ minWidth: 1080 }}>
			<thead>
				<tr>
					{DDA_COLS.map((c) => (
						<th key={c[0]}>{c[0]}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{list.map((r) => (
					<tr key={r.emp.name + r.date}>
						{DDA_COLS.map((c) => (
							<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	</Scroll>
);

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
		return <Empty title="No rows">Nobody matches the filters, so there are no days to report on.</Empty>;
	}

	/* Show Employee Grouping is the chip; Filter By is the section above it. Both
	   are theirs, and they stack: department sections, people inside them. */
	const body = (list) =>
		f.layout.group ? (
			chunk(list, (r) => r.emp.name).map(([, rows2]) => {
				const e = rows2[0].emp;
				return (
					<div className="ddagroup" key={e.name}>
						<header>
							<b>{e.employee_name}</b>
							<span className="mono">{e.employee_number || "—"}</span>
							<span className="muted">{tidyDept(e.department)} · {e.company}</span>
							<span className="n">{fmt(rows2.length)} days</span>
						</header>
						<Table list={rows2} />
					</div>
				);
			})
		) : (
			<Table list={list} />
		);

	const out = f.by
		? chunk(rows, (r) => String(r.emp[f.by] || "—"))
				.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
				.map(([k, list]) => (
					<div className="ddasection" key={k}>
						<h4>
							{(CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1]}: {f.by === "department" ? tidyDept(k) : k}
							<span>{fmt(list.length)} rows</span>
						</h4>
						{body(list)}
					</div>
				))
		: body(rows);

	const filled = rows.filter((r) => r.in || r.out).length;

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
				{fmt(rows.length)} rows · {fmt(people)}{people === 1 ? " person" : " people"}
				{capped ? (
					<> · <b>capped</b> — {fmt(capped)} more not drawn, pick a person or a shorter range</>
				) : null}
				{" · "}{fmt(filled)} with a punch
			</div>

			{out}

			<NoteBelow>
				<b>Five of the fourteen columns are dashes for everybody, and they are the point.</b> Late
				Coming By, Early Going By and Overtime are outputs of the attendance policy engine; the two
				break columns are outputs of a break model nobody has specified.{" "}
				<b>In and Out can only be filled for today</b> — this page loads one day of punches. Day
				Status is the holiday list, which is the only part of a day this site can state on its own.
			</NoteBelow>
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
				<Empty title="Nothing generated yet">
					Factor HR lists nothing until Generate is pressed, and that is copied — a report that runs
					on open is a report nobody chose the filters for.
				</Empty>
			)}

			<Panel title="Column by column" cov="part" ico="🗒">
				<Scroll>
					<table style={{ minWidth: 880 }}>
						<thead>
							<tr>
								<th>Factor HR column</th><th>Filled here by</th><th>State</th><th>Note</th>
							</tr>
						</thead>
						<tbody>
							{FH_DAILY.map((r) => (
								<tr key={r[0]}>
									<td className="mono">{r[0]}</td>
									<td className="muted" style={{ whiteSpace: "normal" }}>{r[1]}</td>
									<td>
										<span className={"cov " + r[2]}>{COV_LABEL[r[2]]}</span>
									</td>
									<td className="muted" style={{ whiteSpace: "normal", minWidth: 260 }}>{r[3]}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
				<NoteBelow>
					<b>Four columns have nothing behind them and one shape of answer.</b> Late Coming By, Early
					Going By and Overtime Duration are all outputs of the attendance policy engine; the two
					break columns are outputs of a break model nobody has specified. None of the five is a
					query — each is a rule about what somebody is paid.
				</NoteBelow>
			</Panel>

			<Cols>
				<Panel title="The one row we can read in full" cov="live" ico="✔">
					<div className="rows">
						{[["Shift", "Manna Treads Office, 09:30–18:30"], ["In", "09:36"],
							["Late Coming By", "00:06"], ["Day Status", "Full Day"]].map((r) => (
							<div className="row" key={r[0]}>
								<span>{r[0]}</span>
								<span className="val">{r[1]}</span>
							</div>
						))}
					</div>
					<NoteBelow>
						Two rules fall straight out of that row. <b>Late is measured to the minute with no
						grace</b> — six minutes is six minutes, not a rounding. And <b>being late does not by
						itself cost the day</b>: the same row still counts as Full Day. Both need confirming as
						policy rather than as one example, but they are the only timings anybody has actually
						seen.
					</NoteBelow>
				</Panel>

				<Panel title="Breaks were not in the plan" cov="none" ico="☕">
					<Gap>
						A break model: <code>Break Out</code> / <code>Break In</code>, and the difference between{" "}
						<code>Break Duration</code> and <code>Personal Break Duration</code>.
					</Gap>
					<NoteBelow>
						Two kinds of break, counted differently, both on this report. They come off worked hours,
						and worked hours decide pay, so this is not a display question.
					</NoteBelow>
				</Panel>

				<Panel title="Where this report already earns its keep" cov="live" ico="📊">
					<Note>
						It is one of the three attendance exports already supplied, and it is what the shift
						inference and the employee master were built from. Nothing about this page is waiting on
						Factor HR — it is waiting on shifts and punches on our side.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
