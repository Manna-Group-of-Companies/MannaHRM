import { MB_LAYOUT, MB_LETTER, MB_PAID } from "@/data/attendance";
import { Cols, Empty, Gap, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { download, toCsv } from "@/lib/csv";
import { DAY, dmy, fmt, nowStamp, ymd } from "@/lib/format";
import { scoped } from "@/lib/scope";
import { listAll } from "@/api/client";
import { getState, patch, set, useApp } from "@/state/store";

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

const mbPeople = (s) =>
	scoped(s)
		.filter((e) => !s.mb.status || e.status === s.mb.status)
		.filter((e) => !s.mb.emp || e.name === s.mb.emp);

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
   this screen is what they can see on it. */
function mbCsv(s) {
	const f = s.mb;
	const [from, till] = mbRange(f);
	const days = mbDays(from, till);
	const people = mbPeople(s);
	if (!days.length || !people.length) return;

	const cols = ["Emp code", "Name"]
		.concat(f.shift ? ["Shift"] : [], days.map((d) => ymd(d)), ["Payable"]);
	const rows = people.map((e) => [e.employee_number || e.name, e.employee_name || ""]
		.concat(
			f.shift ? [e.default_shift || ""] : [],
			days.map((d) => mbCell(s, e, d).letter),
			[mbPayable(s, e, days)],
		));
	download(`monthly-basic-attendance-${from}-to-${till}.csv`, toCsv(cols, rows));
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
					<select disabled aria-label="Filter by"
						title="Never screenshotted open. In the report toolbar it sits where a grouping normally does — company, department, shift — but nobody has seen the list.">
						<option>—</option>
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
					<span className="flex gap-[.35rem]">
						<button className="btn ghost" onClick={() => mbCsv(s)}
							title="Factor HR exports this to Excel. A CSV is the same thing without the formatting, and it opens in Excel.">
							⇩ Excel
						</button>
						<button className="btn ghost" title="Reload from the site" aria-label="Reload from the site"
							onClick={() => void mbGenerate()}>↻</button>
						<button className="btn imp" disabled={f.busy} onClick={() => void mbGenerate()}>
							{f.busy ? "Reading…" : "Generate"}
						</button>
					</span>
				</label>
			</div>

			<div className="tabs mb-[.85rem]">
				<button className="tab" aria-selected={f.tab !== "advance"}
					onClick={() => patch("mb", { tab: "criteria" })}>Report Criteria</button>
				<button className="tab" aria-selected={f.tab === "advance"}
					onClick={() => patch("mb", { tab: "advance" })}>Advance</button>
			</div>

			{f.tab === "advance" ? (
				<Empty title="Never screenshotted">
					The Advance tab is drawn because it is there, and left empty because nobody has opened it.
					Whatever it holds is one screenshot away.
				</Empty>
			) : (
				<div className="repgrid" style={{ maxWidth: 760 }}>
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
		</div>
	);
}

export default function MonthlyBasic() {
	const s = useApp();
	const f = s.mb;
	const [from, till] = mbRange(f);
	const days = mbDays(from, till);
	const people = mbPeople(s);
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
							{people.map((e) => {
								const payable = mbPayable(s, e, days);
								return (
									<tr key={e.name}>
										<td className="mono">{e.employee_number || e.name}</td>
										<td>{e.employee_name || ""}</td>
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

			<div className="mt-[.8rem]">
				<Cols>
					<Panel title="Every cell but Sunday is empty, and correctly so" cov="none" ico="🗓">
						<Gap>
							Shifts, then punches, then the policy engine. In that order — none of the three can be
							skipped.
						</Gap>
						<NoteBelow>
							A cell here is not a fact anybody records; it is the <em>output</em> of measuring a punch
							against a shift and then against a policy. With Employee Checkin empty there is nothing
							to compute and nothing honest to show. <b>A grid of zeros would be worse than a grid of
							dots</b> — an empty attendance table and an empty factory produce identical numbers.
						</NoteBelow>
					</Panel>

					<Panel title="Generate reads the site, and will keep reading it" cov="part" ico="⚡">
						<Note>
							<b>Generate is not a mock.</b> It asks the site for every <code>Attendance</code> row in
							the date range and fills the grid from what comes back — today that is {fmt(f.count || 0)}{" "}
							rows, because the shift job has never run. The day it runs, this page fills itself with
							no further work.
						</Note>
					</Panel>

					<Panel title="Sunday is the one thing we know" cov="live" ico="⛅">
						<Note>
							Week-off is <b>Sunday for 100% of the active workforce</b>, no exceptions, so one Holiday
							List rule covers the group and every Sunday column can be filled today. Factor HR’s own
							dashboard showed all 160 people as <em>Not Yet In</em> on Sunday 23 August, because its
							tile does not net off the weekly off. <code>rules.py</code> treats weekly-off as its own
							state precisely so that a person nobody expected in is not somebody to chase.
						</Note>
					</Panel>

					<Panel title="The last column is the whole point" cov="none" ico="📐">
						<Gap>
							Payable days — present, plus paid leave, plus the weekly off, minus whatever the policy
							deducts.
						</Gap>
						<NoteBelow>
							That single number is what payroll reads off this screen, and it is where 1,300 days of
							Leave Without Pay come from on the leave report. The column adds up what the grid holds;{" "}
							<b>it does not apply a policy, because the policy has not been stated</b>. Any rule that
							turns an unexplained absence into LWP will be exercised hard, so it has to be written
							down before it is coded.
						</NoteBelow>
					</Panel>

					<Panel title="Never write this grid directly" cov="part" ico="⚡">
						<Note>
							<b>Attendance is generated from Employee Checkin by the shift job.</b> A hand-written row
							is invisible to the thing that would have created it, and the two disagree the moment
							anything is reprocessed. A correction on this grid writes the missing <em>punch</em>; the
							job fills the cell in. Carried in <code>regularization.py</code>.
						</Note>
					</Panel>
				</Cols>
			</div>
		</>
	);
}
