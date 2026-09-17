import { patch, useApp } from "@/store";
import { load, REG_DOCTYPE } from "@/api/load";
import { scoped } from "@/lib/scope";
import { useEffect, useRef, useState } from "react";
import { saveDayEdit, saveOvertime } from "@/api/punchedit";
import { addShiftForDates, setWorkingTime } from "@/api/shiftassign";
import { isSupervisor, shiftChoices } from "@/lib/worktime";
import { MON, clock, dayOf, dmy, fmt, thisMonth, tidyDept, todayIso } from "@/lib/format";
import { REGISTER_CODE, ROSTER_STATES, daysOf, minutesText, monthRegister, monthRoster, spanHours } from "@/lib/roster";
import { loadRegGrid, loadRegMonth, loadShiftWindows, shiftLabel } from "@/api/attendance";
import { editPlan } from "@/lib/punchedit";
import { Desk, Modal, Note, Scroll } from "@/components/ui";
import { deskUrl } from "@/lib/desk";
import { decideCorrection } from "@/features/approvals/decide";
import { ATTENDANCE_APPROVER, isAttendanceApprover } from "@/data/approver";

/* Factor HR's Attendance Regularization screen, photographed 28 Aug 2026:
   the title, then one bar — Attendance Cycle, the status dot, Search Employee,
   Select Categories, and four icons: filter, import, refresh, history. Under
   it, nothing at all until somebody is picked:

       No Employee Selected
       Please select employee for show Regularization

   **Ours does not stay empty.** Until 11 September 2026 that empty state was
   copied word for word; it is now the register — everybody down the side, the
   days across — because HR's first question on this page is rarely about one
   person. Picking somebody still opens their screen: the month a row per day,
   which is the one HR uses to answer "what happened to my 19th of August". */

/* Their cycle picker reads "Aug-2026". Thirteen months ending one ahead of
   today, which is as far as a correction can be raised for. */
function regCycles() {
	const out = [];
	const now = new Date();
	for (let i = 11; i >= -1; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		out.push([
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
			`${MON[d.getMonth()]}-${d.getFullYear()}`,
		]);
	}
	return out;
}

/** "2026-08" → "Aug-2026", the way their cycle picker writes it. */
const cycleLabel = (cyc) => `${MON[+cyc.slice(5, 7) - 1]}-${cyc.slice(0, 4)}`;

/* Who the search box can offer. Scoped by company like the rest of the page,
   then by the dot and the category box — which is what those two controls are
   for on their screen as well. */
function regMatches(s) {
	const q = (s.reg.q || "").trim().toLowerCase();
	let rows = scoped(s);
	if (s.reg.status) rows = rows.filter((e) => e.status === s.reg.status);
	if (s.reg.cat) rows = rows.filter((e) => e.department === s.reg.cat);
	if (!q) return { rows: [], all: rows.length };
	return {
		rows: rows
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8),
		all: rows.length,
	};
}

/* The same coloured dot as Employee Master, because it is the same control on
   their screen — Active, InActive, All, in that order. Its own selection,
   though: a filter set on one screen is not a filter set on another, and
   sharing them would silently hide people here. */
function RegDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.reg.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.reg.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("reg", { menu: !s.reg.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.reg.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.reg.status}
						onClick={(e) => { e.stopPropagation(); patch("reg", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** One of the bar's four icons. `href` sends it to the site; `dead` draws it
    disabled with the reason on it, which is the point of drawing it at all. */
function BarIcon({ path, label, title, dead, href, onClick }) {
	const ico = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
	if (href !== undefined) {
		return <Desk className="embtn ic" href={href} label={label} title={title}>{ico}</Desk>;
	}
	return (
		<button className="embtn ic" disabled={dead} title={title} aria-label={label} onClick={onClick}>
			{ico}
		</button>
	);
}

function RegBar({ s, cyc }) {
	const depts = [...new Set(scoped(s).map((e) => e.department).filter(Boolean))].sort();

	return (
		<div className="embar regbar">
			<label className="cyc" title="Factor HR calls the month an attendance cycle. Ours is the calendar month until somebody says the payroll month runs to a different day.">
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none" strokeWidth="1.7">
					<path d="M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" />
				</svg>
				Attendance Cycle :
				<select value={cyc} aria-label="Attendance cycle"
					onChange={(e) => patch("reg", { cycle: e.target.value })}>
					{regCycles().map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
				</select>
			</label>

			<RegDot s={s} />

			<span className="find rev">
				<input type="search" placeholder="Search Employee" aria-label="Search employee"
					value={s.reg.q || ""} onChange={(e) => patch("reg", { q: e.target.value })} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</span>

			<select value={s.reg.cat} aria-label="Select categories"
				title="Factor HR’s Categories is a master of masters — eight category types, three of them ours. Department is the one both systems hold, so it is what this box can offer."
				onChange={(e) => patch("reg", { cat: e.target.value })}>
				<option value="">Select Categories</option>
				{depts.map((d) => <option key={d} value={d}>{tidyDept(d)}</option>)}
			</select>

			<span className="regicons">
				<BarIcon path="M3 5h18l-7 8v6l-4 2v-8Z" label="Filter" dead
					title="Factor HR's filter panel on this screen has never been opened. The two controls it would hold are already on the bar." />
				<BarIcon path="M12 16V4M7 9l5-5 5 5M4 20h16" label="Import" dead
					title="This writes attendance from a spreadsheet — no shift check, no geofence, no approver. Drawn because it exists over there, refused because it is the most dangerous button in any HR system." />
				<BarIcon path="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" label="Refresh"
					title="Reload from the site"
					onClick={() => {
						void load();
						if (s.reg.emp) void loadRegMonth(s.reg.emp, cyc, true);
						else void loadRegGrid(cyc, true);
					}} />
				{/* This page reads open requests only — see pendingRegularizations() —
				    so a decided correction vanishes from it entirely. The list on the
				    site still holds every one, decided included, which is where a
				    question about what happened to a request is actually answered. */}
				<BarIcon path="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2" label="History"
					href={s.site && deskUrl(s.site, s.regDoctype)}
					title={`Every correction on the site, decided ones included — opens the ${s.regDoctype} list. This page reads open requests only, so a decided one disappears from it.`} />
			</span>
		</div>
	);
}

/* ---------------------------------------------------------------------------
   The month, once somebody is picked.

   Factor HR's screen draws every day of the cycle — roster, punches, hours,
   and the correction sitting against the day — with a count per state along
   the top. That is the screen HR opens to answer "what happened to my 19th of
   August", and until now this page drew only the *open corrections*, which is
   the one row on the month somebody already knows about.

   The arithmetic is `lib/roster.js` and the read is `api/attendance.js`. What
   is decided here is only how it is drawn.

   **The dots carry a label as well as a colour.** Eight states down a column of
   thirty-one rows is exactly the chart the `dataviz` rules refuse: identity by
   colour alone, at 8px, on a screen somebody is reading to check a wage. So
   every row's dot has its state in a `title`, the count strip spells all eight
   out, and the status column prints the word beside it.
   --------------------------------------------------------------------------- */
function RosterCounts({ counts }) {
	return (
		<div className="rcounts">
			{ROSTER_STATES.map((st) => (
				<span key={st.key} className={counts[st.key] ? "" : "off"}>
					<i className={"rdot " + st.key} aria-hidden="true" />
					{st.label}
					<b>{fmt(counts[st.key] || 0)}</b>
				</span>
			))}
		</div>
	);
}

/** One day. Their columns, in their order, plus the two this side can answer
    that theirs cannot: how many punches the day actually holds, and what the
    correction was decided as.

    **Clicking a time opens the day in a popup** (17 September 2026): the clock,
    the reason and Save together, rather than boxes and a button spread across
    a table wider than the screen. Save changes the time at once — see
    api/punchedit.js, and lib/punchedit.js for why it has to be that shape. A day that has not happened yet is not offered. */
function RosterRow({ r, label, onOpen }) {
	const st = ROSTER_STATES.find((x) => x.key === r.display) || ROSTER_STATES[7];
	const time = (field, text, name) => (onOpen ? (
		<button type="button" className="rtbtn" aria-label={`${name}, ${dmy(r.iso)}`}
			title={`Change ${name} for ${dmy(r.iso)}`} onClick={() => onOpen(field)}>
			{text || "—"}
		</button>
	) : text);
	return (
		<tr className={r.display === "absent" ? "bad" : undefined}>
			<td className="mono">
				{dmy(r.iso)} <span className="muted">{dayOf(r.iso).slice(0, 3).toUpperCase()}</span>
			</td>
			<td>
				<i className={"rdot " + r.display} title={st.label} aria-hidden="true" />
				<span className="rlab">{st.label}</span>
			</td>
			<td className="rshift">
				{label ? <b>{label}</b> : <span className="muted">no shift on the record</span>}
				{r.holiday ? <span className="rnote">{r.holiday}</span> : null}
				{r.leave ? (
					<span className="rnote">
						{r.leave.leave_type || "Leave"} · {r.leave.status}
					</span>
				) : null}
			</td>
			<td className="mono">{time("in", clock(r.inAt).replace("—", ""), "Time In")}</td>
			<td className="mono">{time("out", clock(r.outAt).replace("—", ""), "Time Out")}</td>
			<td className="mono">{r.hours}</td>
			<td className="mono">{minutesText(r.lateMin)}</td>
			<td className="mono">{minutesText(r.earlyMin)}</td>
			<td className="mono">{time("ot", otText(r.otSec), "OT hours")}</td>
			{/* Their four AR columns. Empty on a day nobody asked about, which is
			    most of them — a dash on thirty rows reads as data. */}
			<td className="mono">{r.ar ? clock(r.ar.requested_in).replace("—", "") : ""}</td>
			<td className="mono">{r.ar ? dmy(r.ar.attendance_date) : ""}</td>
			<td className="mono">{r.ar ? clock(r.ar.requested_out).replace("—", "") : ""}</td>
			<td className="mono">{r.ar ? spanHours(r.ar.requested_in, r.ar.requested_out) : ""}</td>
			<td>
				{r.ar ? <span className={"cov " + (r.ar.status === "Approved" ? "live" : r.ar.status === "Rejected" ? "none" : "part")}>{r.ar.status}</span> : null}
			</td>
		</tr>
	);
}

/** The calendar a person is measured against: their own where the record names
    one, otherwise their company's default. "" when neither says. */
function holidayListOf(s, emp) {
	const co = s.companies.find((c) => c.name === emp.company);
	return emp.holiday_list || (co && co.default_holiday_list) || "";
}

/** Everybody the register draws: the company scope, then the status dot, the
    category box and whatever is typed in Search — the same three controls that
    narrow the picker, narrowing the rows. */
function gridPeople(s) {
	const q = (s.reg.q || "").trim().toLowerCase();
	return scoped(s)
		.filter((e) => !s.reg.status || e.status === s.reg.status)
		.filter((e) => !s.reg.cat || e.department === s.reg.cat)
		.filter((e) => !q || [e.employee_number, e.employee_name, e.designation]
			.some((v) => (v || "").toLowerCase().includes(q)))
		.slice()
		.sort((a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/** What a cell's title says — the day in words, because the code alone is a
    letter somebody has to remember. */
function cellTitle(d) {
	const st = ROSTER_STATES.find((x) => x.key === d.display) || ROSTER_STATES[7];
	return [
		`${dmy(d.iso)} ${dayOf(d.iso)}`,
		st.label,
		d.inAt || d.outAt ? `In ${clock(d.inAt)} · Out ${clock(d.outAt)}` : "",
		d.hours ? `${d.hours} hrs` : "",
		d.lateMin ? `Late ${minutesText(d.lateMin)}` : "",
		d.earlyMin ? `Early out ${minutesText(d.earlyMin)}` : "",
		d.otMin ? `OT ${minutesText(d.otMin)} (entered by HR)` : "",
		d.holiday || "",
		d.leave ? `${d.leave.leave_type || "Leave"} · ${d.leave.status}` : "",
		d.ar ? `Correction ${d.ar.status}` : "",
	].filter(Boolean).join("\n");
}

/* The four totals at the end of a row. Present is a full day only — a day with
   a punch-in and nothing after it is counted in its own column, because
   whether it is paid is the policy question nobody has answered yet. */
const GRID_TOTALS = [
	["P", "Fullday", (c) => fmt(c.full)],
	["½", "Partial — a punch-in with no punch-out", (c) => fmt(c.partial)],
	["A", "Absent", (c) => fmt(c.absent)],
	["L", "Approved leave", (c) => fmt(c.leave)],
	["Off", "Holiday and weekly off", (c) => fmt(c.holiday + c.weekoff)],
	/* Time, asked for on 16 September 2026: hours worked, overtime past the
	   shift's end, and the days that started late. Blank for somebody with no
	   shift window — there is nothing to measure them against. */
	["Hrs", "Hours worked — first punch-in to last punch-out, each day, added up", (c) => minutesText(c.workMin)],
	["OT", "Overtime HR has entered for the month — click a day to add it", (c) => minutesText(c.otMin)],
	["Late", "Days the first punch-in was after the shift's start (total late time in the tooltip)", (c) => (c.lateDays ? fmt(c.lateDays) : "")],
];

/* OT is picked on a clock, to the second, asked for on 17 September 2026 —
   `01:30:00` rather than typing `1.5`. The clock reads as a duration here, not a
   time of day, and the site stores decimal hours to six places; these two are
   the only conversion. */

const two = (n) => String(n).padStart(2, "0");

/** Open the clock on a click anywhere in a time box, asked for on 17 September
    2026 — Chrome otherwise opens it only from the small icon at the end, and
    clicking the time itself just moves the caret. Typing still works. A browser
    without showPicker, or one that refuses it, keeps its own behaviour. */
const openClock = (e) => {
	try { if (e.currentTarget.showPicker) e.currentTarget.showPicker(); } catch { /* typing still works */ }
};

/** A day's OT, in seconds, as the clock shows it: `01:30:00`, or "" for none. */
const otText = (sec) => (sec > 0
	? `${two(Math.floor(sec / 3600))}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`
	: "");

/** The clock's `hh:mm` or `hh:mm:ss` as seconds; 0 for empty, NaN for anything else. */
const otSeconds = (v) => {
	if (v === "" || v == null) return 0;
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v));
	return m && Number(m[2]) < 60 && Number(m[3] || 0) < 60
		? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0)
		: NaN;
};

/** What an edited day needs saving: its times, its OT, both or neither.
    A reason is optional for both (17 September 2026) — see api/punchedit.js. */
function dayChanges(f, base) {
	const times = f.in !== base.in || f.out !== base.out;
	const ot = otSeconds(f.ot) !== otSeconds(base.ot);
	return { times, ot, any: times || ot };
}

const otBadText = (v) => !(otSeconds(v) >= 0 && otSeconds(v) <= 16 * 3600);

/** Save an edited day: the punches first (they may be refused), then the OT. */
async function saveDay(emp, iso, f, base) {
	const c = dayChanges(f, base);
	const said = [];
	if (c.times) {
		const r = await saveDayEdit(emp, iso, f);
		if (!r.ok) return r;
		said.push(r.msg);
	}
	if (c.ot) {
		const r = await saveOvertime(emp, iso, otSeconds(f.ot) / 3600, f.reason);
		if (!r.ok) return { ok: false, msg: said.concat(r.msg).join(" ") };
		said.push(r.msg);
	}
	/* The month is re-read by whoever closes the popup, once and in the
	   background — not here, where it held the popup open. */
	return { ok: true, msg: said.filter(Boolean).join(" ") };
}

/* One person's day in a popup, opened by clicking a time on their month or a
   cell on the register (17 September 2026). Time In, Time Out, OT, the reason
   and Save in one box, saved through api/punchedit.js. */
function DayPopup({ pick, onClose, onDone }) {
	const [f, setF] = useState({ in: pick.in, out: pick.out, ot: pick.ot, reason: "" });
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState("");
	const clicked = useRef(null);
	const c = dayChanges(f, pick);
	const dirty = c.any;
	/* Only the shape is checked here — whether the times make a day. The punches
	   themselves are read again on Save. */
	const why = c.times ? editPlan(pick.iso, [], f).why : "";
	const otBad = otBadText(f.ot);
	const focus = pick.focus || "in";

	/* The click that opened the popup still counts as the person's gesture, so
	   the clock on the time they clicked can open straight away. */
	useEffect(() => {
		const el = clicked.current;
		if (!el) return;
		el.focus();
		try { if (el.showPicker) el.showPicker(); } catch { /* focused is enough */ }
	}, []);

	async function save() {
		setBusy(true);
		setMsg("");
		const res = await saveDay(pick.emp, pick.iso, f, pick);
		setBusy(false);
		if (res.ok) onDone(res.msg);
		else setMsg(res.msg);
	}

	const field = (key, label, extra = {}) => (
		<label>
			<span>{label}</span>
			<input type="time" className="rtime" aria-label={label} value={f[key]} disabled={busy}
				ref={focus === key ? clicked : null} onClick={openClock}
				onChange={(e) => setF({ ...f, [key]: e.target.value })} {...extra} />
		</label>
	);

	return (
		<Modal
			title={`Change time — ${pick.emp.employee_name}`}
			onClose={() => { if (!busy) onClose(); }}
			extra={
				<div className="daypop" role="group" aria-label={`Edit ${pick.emp.employee_name}, ${dmy(pick.iso)}`}>
					<p>
						<b className="mono">{dmy(pick.iso)} {dayOf(pick.iso).slice(0, 3).toUpperCase()}</b>{" "}
						<span className="mono muted">{pick.emp.employee_number || pick.emp.name}</span>{" "}
						<span className="muted">{pick.emp.company}</span>
					</p>
					<p className="muted">
						Recorded: In {pick.in || "—"} · Out {pick.out || "—"}
						{pick.ar ? ` · correction ${pick.ar.status}` : ""}
					</p>
					<div className="dpgrid">
						{field("in", "Time In")}
						{field("out", "Time Out")}
						{/* Overtime HR grants for this day — the only OT the reports show. */}
						{field("ot", "OT hours", { className: "rtime rot", step: "1", title: "OT as hours:minutes:seconds, up to 16:00:00" })}
					</div>
					<label className="dpreason">
						<span>Reason (optional)</span>
						<input type="text" aria-label="Reason" placeholder="Why the time is being changed"
							value={f.reason} disabled={busy} onChange={(e) => setF({ ...f, reason: e.target.value })} />
					</label>
					{/* Whenever Save is grey, the popup says why. A grey button with no
					    sentence beside it read as "Save does nothing" (17 September 2026). */}
					{!dirty && !busy ? <p className="rnote" role="status">Pick a new time to turn Save on.</p> : null}
					{why && why !== "Nothing changed." ? <p className="rnote bad">{why}</p> : null}
					{otBad ? <p className="rnote bad">OT is hours, minutes and seconds up to 16:00:00, e.g. 01:30:00.</p> : null}
					{msg ? <p className="rnote bad" role="alert">{msg}</p> : null}
					<p className="muted">
						Save writes the new time to ERPNext now. The machine's punch is kept on record, set aside.
					</p>
				</div>
			}
			foot={
				<button type="button" className="btn tpl" onClick={save}
					disabled={busy || !dirty || otBad || Boolean(why && why !== "Nothing changed.")}>
					{busy ? "Saving…" : "Save"}
				</button>
			}
		/>
	);
}

/* ---------------------------------------------------------------------------
   The register: everybody down the side, the days of the cycle across.

   What the page shows before anybody is picked. It used to show nothing —
   Factor HR's "No Employee Selected" — and HR's first question on opening
   Attendance is rarely about one person; it is who is missing this month. A
   name opens that person's month underneath, which is the screen theirs goes
   straight to.

   Every cell is `monthRoster`, the same function the one-person month runs,
   over one read of everybody's punches. So a cell and that person's row for
   the day cannot disagree.
   --------------------------------------------------------------------------- */
function RegGrid({ s, cyc, onPick }) {
	const g = s.regGrid;
	const mine = g.key === cyc ? g : null;
	const people = gridPeople(s);
	const days = daysOf(cyc);
	const today = todayIso();

	if (!mine || mine.state === "loading") {
		return <div className="regload">Reading {cycleLabel(cyc)} for everybody…</div>;
	}

	const reg = monthRegister({
		ym: cyc,
		people,
		punches: mine.punches,
		leave: mine.leave,
		corrections: mine.ar,
		overtime: mine.overtime,
		holidaysOf: (e) => s.holidays[holidayListOf(s, e)] || [],
		today,
		windowOf: (e) => (s.shiftWindows || {})[e.default_shift] || null,
	});

	/* Nobody on the list has a calendar at all: every Sunday is an absence to
	   the rule. Said once, above the grid, rather than once per row. */
	const noCal = people.filter((e) => !holidayListOf(s, e)).length;

	return (
		<>
			{mine.err ? <div className="deerr" role="alert"><b>{mine.err}</b></div> : null}

			{noCal ? (
				<Note>
					<b>{fmt(noCal)} of {fmt(people.length)} have no holiday list</b> on their record or their
					company. Their Sundays and holidays read as working days, and a day nobody punched on reads
					as absent — fix the list before anybody is paid from this.
				</Note>
			) : null}

			<div className="rgkey">
				{ROSTER_STATES.filter((st) => REGISTER_CODE[st.key]).map((st) => (
					<span key={st.key}>
						<b className={"rgc " + st.key}>{REGISTER_CODE[st.key]}</b>
						{st.label}
					</span>
				))}
				<span><b className="rgc full ar">P</b>a correction is filed for the day</span>
			</div>

			{people.length ? (
				<Scroll>
					<table className="muster rgrid">
						<thead>
							<tr>
								<th className="rgname">Employee</th>
								{days.map((iso) => (
									<th className={"d" + (iso === today ? " now" : "")} key={iso}>
										{+iso.slice(8)}
										<small>{dayOf(iso).slice(0, 2)}</small>
									</th>
								))}
								{GRID_TOTALS.map((t) => <th className="d tot" key={t[0]} title={t[1]}>{t[0]}</th>)}
							</tr>
						</thead>
						<tbody>
							{reg.map(({ emp, rows, counts }) => {
								const list = holidayListOf(s, emp);
								const waiting = list && !s.holidays[list];
								return (
									<tr key={emp.name}>
										<td className="rgname">
											<button type="button" className="rgwho"
												title={`Open ${emp.employee_name}'s month`}
												onClick={() => patch("reg", { emp: emp.name, q: "" })}>
												<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
												<b>{emp.employee_name}</b>
												<span className="mono">{emp.employee_number || emp.name}</span>
											</button>
										</td>
										{/* Until this person's calendar is read, every Sunday is a day
										    nobody punched on. The row waits rather than calling four
										    of them absent. */}
										{waiting ? (
											<td className="muted" colSpan={days.length + GRID_TOTALS.length}>
												Reading the {list} calendar…
											</td>
										) : (
											<>
												{rows.map((d) => (
													<td key={d.iso} title={cellTitle(d)}
														className={"d rgc " + d.display + (d.ar ? " ar" : "")
															+ (d.iso === today ? " now" : "")}>
														{/* A past day opens its Time In / Time Out editor. */}
														{d.iso <= today ? (
															<button type="button" className="rgedit"
																aria-label={`Edit ${emp.employee_name}, ${dmy(d.iso)}`}
																onClick={() => onPick({
																	emp, iso: d.iso, focus: "in", ar: d.ar,
																	in: clock(d.inAt).replace("—", ""),
																	out: clock(d.outAt).replace("—", ""),
																	ot: otText(d.otSec),
																})}>
																{REGISTER_CODE[d.display] || "·"}
															</button>
														) : REGISTER_CODE[d.display]}
													</td>
												))}
												{GRID_TOTALS.map((t) => (
													<td className="d tot" key={t[0]} title={t[0] === "Late" && counts.lateMin ? `${minutesText(counts.lateMin)} late in all` : undefined}>{t[2](counts)}</td>
												))}
											</>
										)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</Scroll>
			) : (
				<div className="regnone">
					<b>Nobody matches</b>
					<span>No employee is left after the status, category and search on the bar.</span>
				</div>
			)}

			<div className="regfoot">
				<span className="cnt">
					{fmt(people.length)} people · {fmt(days.length)} days · {fmt(mine.punches.length)} punches ·{" "}
					{fmt(mine.ar.length)} correction(s), every status. Click a name for that person's month.
				</span>
			</div>
		</>
	);
}

/* Give the picked person a shift — their working time, or a shift for dates.
   See api/shiftassign.js for the difference. */
function ShiftPanel({ s, emp, cyc }) {
	/* Day and Night — and General too for a supervisor — of this person's company. */
	const names = shiftChoices(emp, s.shiftTypes, s.companies, s.employees);
	const [f, setF] = useState({ shift: emp.default_shift || "", from: todayIso(), to: "" });
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState({ text: "", bad: false });
	useEffect(() => { setF({ shift: emp.default_shift || "", from: todayIso(), to: "" }); setMsg({ text: "", bad: false }); }, [emp.name]);
	const mine = s.regMonth.key === `${emp.name}|${cyc}` ? s.regMonth.assignments || [] : [];

	const run = async (fn) => {
		setBusy(true);
		const r = await fn();
		setBusy(false);
		setMsg({ text: r.msg, bad: !r.ok });
	};

	return (
		<div className="regwho regedit" role="group" aria-label={`Shift for ${emp.employee_name}`}>
			<b>Shift</b>
			<span className="muted">{isSupervisor(emp) ? "Supervisor — Day, Night or General" : "Day or Night"} · now: {shiftLabel(emp.default_shift, s.shiftWindows) || "none"}</span>
			<label>Shift{" "}
				<select value={f.shift} disabled={busy} aria-label="Shift" onChange={(e) => setF({ ...f, shift: e.target.value })}>
					<option value="">— choose —</option>
					{names.map((n) => <option key={n} value={n}>{shiftLabel(n, s.shiftWindows)}</option>)}
				</select>
			</label>
			<button type="button" className="embtn" disabled={busy || f.shift === (emp.default_shift || "")}
				title="Every day from now on, unless a shift for dates says otherwise"
				onClick={() => run(() => setWorkingTime(emp, f.shift, cyc))}>Set as working time</button>
			<span className="muted">or for dates</span>
			<label>From <input type="date" value={f.from} disabled={busy} aria-label="Shift from" onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
			<label>To <input type="date" value={f.to} disabled={busy} aria-label="Shift to" onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
			<button type="button" className="btn tpl" disabled={busy || !f.shift || !f.from}
				title="A Shift Assignment between these dates; leave To empty for open-ended"
				onClick={() => run(() => addShiftForDates(emp, f, cyc))}>{busy ? "Saving…" : "Add shift"}</button>
			{mine.length ? (
				<span className="rnote">
					Dated shifts: {mine.map((a) => `${a.shift_type} ${dmy(a.start_date)}${a.end_date ? `–${dmy(a.end_date)}` : " →"}`).join(" · ")}
				</span>
			) : null}
			{msg.text ? <span className={"rnote" + (msg.bad ? " bad" : "")} role="status">{msg.text}</span> : null}
		</div>
	);
}

/** The whole month for one person. */
function RegMonth({ s, emp, cyc, onPick }) {
	const m = s.regMonth;
	const mine = m.key === `${emp.name}|${cyc}` ? m : null;

	/* The holiday list this person is measured against: their own where the
	   record names one, otherwise their company's default. A site that names
	   neither leaves every Sunday looking like an absence, which is worth
	   saying rather than drawing. */
	const co = s.companies.find((c) => c.name === emp.company);
	const listName = emp.holiday_list || (co && co.default_holiday_list) || "";
	const holidays = s.holidays[listName] || [];

	const label = shiftLabel(emp.default_shift, s.shiftWindows);

	const { rows, counts } = monthRoster({
		ym: cyc,
		punches: mine ? mine.punches : [],
		leave: mine ? mine.leave : [],
		corrections: mine ? mine.ar : [],
		overtime: mine ? mine.overtime : [],
		assignments: mine ? mine.assignments : [],
		windows: s.shiftWindows,
		holidays,
		shift: emp.default_shift || "",
		today: todayIso(),
		window: (s.shiftWindows || {})[emp.default_shift] || null,
	});

	if (!mine || mine.state === "loading") {
		return <div className="regload">Reading {cycleLabel(cyc)} for {emp.employee_name}…</div>;
	}

	/* **The calendar is read after the first paint**, one holiday list at a
	   time — see `loadHolidayDates`. Until this person's has arrived, every
	   Sunday is a day nobody punched on, and this table would call four of them
	   absent. Waiting is the honest answer: a month of wrong absences on a
	   screen somebody is paid from is worse than a second of nothing. */
	if (listName && !s.holidays[listName]) {
		return <div className="regload">Reading the {listName} calendar…</div>;
	}

	return (
		<>
			<RosterCounts counts={counts} />

			{mine.err ? <div className="deerr" role="alert"><b>{mine.err}</b></div> : null}

			{!listName ? (
				<Note>
					<b>No holiday list on this record or on {emp.company}.</b> Every Sunday and every
					holiday therefore reads as an ordinary working day, and a day nobody punched on
					reads as absent. That is the list to fix before anybody is paid from this.
				</Note>
			) : null}

			<Scroll>
				<table style={{ minWidth: 1640 }}>
					<thead>
						<tr>
							<th>Date</th><th>Status</th><th>Shift</th>
							<th>Time In</th><th>Time Out</th><th>Total Hrs</th>
							<th>Late By</th><th>Early Out</th><th>OT</th>
							<th>AR In</th><th>AR Date</th><th>AR Out</th><th>AR Hrs</th><th>AR Status</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<RosterRow key={r.iso} r={r} label={r.assigned ? shiftLabel(r.shift, s.shiftWindows) : label}
								onOpen={r.iso <= todayIso() ? (focus) => onPick({
									emp, iso: r.iso, focus, ar: r.ar,
									in: clock(r.inAt).replace("—", ""),
									out: clock(r.outAt).replace("—", ""),
									ot: otText(r.otSec),
								}) : null} />
						))}
					</tbody>
				</table>
			</Scroll>

			<div className="regfoot">
				<span className="cnt">
					{fmt(rows.length)} days · {fmt(mine.punches.length)} punches ·{" "}
					{counts.workMin ? `${minutesText(counts.workMin)} hrs worked · ` : ""}
					{counts.otMin ? `${minutesText(counts.otMin)} OT · ` : ""}
					{counts.lateDays ? `${fmt(counts.lateDays)} late (${minutesText(counts.lateMin)}) · ` : ""}
					{fmt(mine.ar.length)} correction(s), every status
				</span>
			</div>
		</>
	);
}

/* ---------------------------------------------------------------------------
   Waiting for approval — corrections raised from the phone app, or left over
   from before Save changed a time directly, decided on
   the page they were raised from (17 September 2026). The same decision as the
   card on Dashboard → Approvals, through the same decideCorrection: approving
   writes the punch and sets aside the one it replaces; rejecting writes nothing.

   Narrowed like the rest of the page: the company scope, the cycle, and the
   picked person when there is one.
   --------------------------------------------------------------------------- */
function PendingPanel({ s, emp, cyc }) {
	const [notes, setNotes] = useState({});
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState({ text: "", bad: false });
	const inScope = new Set(scoped(s).map((e) => e.name));
	const all = s.approvals.attendance || [];
	const visible = all.filter((r) => inScope.has(r.employee));
	const forWho = visible.filter((r) => !emp || r.employee === emp.name);
	const rows = forWho
		.filter((r) => String(r.attendance_date || "").slice(0, 7) === cyc)
		.sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)));

	/* Always drawn. An empty box that says why is the difference between "nothing
	   is waiting" and "the request went somewhere else" — hiding it made both
	   look like the feature was missing. */
	const otherMonths = [...new Set(forWho.map((r) => String(r.attendance_date || "").slice(0, 7)))]
		.filter((m) => m && m !== cyc).sort();
	const empty = !s.regDoctype
		? `The correction queue could not be read, so requests waiting for approval cannot be shown. The site said: ${s.regQueueErr || `no read permission on ${REG_DOCTYPE}`}.`
		: otherMonths.length
			? `Nothing in ${cycleLabel(cyc)}. Waiting in: ${otherMonths.map(cycleLabel).join(", ")} — change the Attendance Cycle.`
			: all.length > visible.length
				? `Nothing for the companies you are looking at; ${fmt(all.length - visible.length)} waiting for other companies.`
				: `Nothing waiting${emp ? ` for ${emp.employee_name}` : ""}. A time changed on this page is saved at once and never waits here.`;

	const reread = async () => {
		setBusy("reload");
		await load();
		setBusy("");
	};

	async function decide(r, action) {
		setBusy(r.name + action);
		setMsg({ text: "", bad: false });
		const res = await decideCorrection(r, action, notes[r.name] || "");
		setBusy("");
		setMsg({ text: res.msg, bad: !res.ok });
		if (res.ok) {
			if (emp) void loadRegMonth(emp.name, cyc, true);
			else void loadRegGrid(cyc, true);
		}
	}

	const approver = isAttendanceApprover(s.user);

	return (
		<div className="regwho regedit" role="region" aria-label="Waiting for approval">
			<b>Waiting for approval</b>
			<span className="muted">
				{approver ? "You approve these — approving saves the time." : `Sent to ${ATTENDANCE_APPROVER}, who approves them. The time is saved once approved.`}
			</span>
			<span className="n">{fmt(rows.length)} in {cycleLabel(cyc)}</span>
			<button type="button" className="embtn" disabled={Boolean(busy)} onClick={reread}>
				{busy === "reload" ? "Reading…" : "Refresh queue"}
			</button>
			{!rows.length ? <span className="rnote" style={{ flexBasis: "100%" }}>{empty}</span> : null}
			{rows.length ? (
				<Scroll>
					<table>
						<thead>
							<tr>
								<th>Date</th><th>Employee</th><th>Request</th><th>Requested In</th><th>Requested Out</th>
								<th>Reason</th><th>Raised by</th>{approver ? <><th>Note</th><th>Decide</th></> : <th>Approver</th>}
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => {
								const who = s.byName[r.employee] || {};
								const mineToo = Boolean(s.user && r.owner === s.user);
								const off = Boolean(busy) || mineToo;
								const why = mineToo ? "You raised this correction, so deciding it is somebody else's job." : "";
								return (
									<tr key={r.name}>
										<td className="mono">{dmy(r.attendance_date)}</td>
										<td>
											<b>{r.employee_name || who.employee_name || r.employee}</b>{" "}
											<span className="mono muted">{who.employee_number || r.employee}</span>
										</td>
										<td className="mono muted">{r.name}</td>
										<td className="mono">{clock(r.requested_in).replace("—", "")}</td>
										<td className="mono">{clock(r.requested_out).replace("—", "")}</td>
										<td>{r.reason || ""}</td>
										<td className="muted">{r.owner || ""}</td>
										{approver ? (<>
										<td>
											<input type="text" className="rreason" placeholder="Note (optional)"
												aria-label={`Decision note, ${r.name}`} value={notes[r.name] || ""} disabled={off}
												onChange={(e) => setNotes({ ...notes, [r.name]: e.target.value })} />
										</td>
										<td>
											<button type="button" className="btn tpl" disabled={off} title={why || "Writes the requested punch"}
												aria-label={`Approve ${r.name}`} onClick={() => decide(r, "Approve")}>
												{busy === r.name + "Approve" ? "Approving…" : "Approve"}
											</button>{" "}
											<button type="button" className="embtn" disabled={off} title={why || "Writes nothing to attendance"}
												aria-label={`Reject ${r.name}`} onClick={() => decide(r, "Reject")}>
												{busy === r.name + "Reject" ? "Rejecting…" : "Reject"}
											</button>
											{why ? <span className="rnote">{why}</span> : null}
										</td>
										</>) : (
											<td className="muted">Waiting for {ATTENDANCE_APPROVER}</td>
										)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</Scroll>
			) : null}
			{msg.text ? <span className={"rnote" + (msg.bad ? " bad" : "")} role="status">{msg.text}</span> : null}
		</div>
	);
}

export default function Regularization() {
	const s = useApp();
	/* The register cell being edited, and the site's answer to the last save. */
	const [pick, setPick] = useState(null);
	const [saved, setSaved] = useState("");
	const pend = (s.approvals.attendance || []).length;
	const emp = s.reg.emp ? s.byName[s.reg.emp] : null;
	const { rows: matches, all } = regMatches(s);
	const cyc = s.reg.cycle || thisMonth();
	const searching = !emp && (s.reg.q || "").trim();

	/* The month is read when somebody is picked and again when the cycle
	   changes, and not before: most people who open this page open it to look
	   somebody up, and the ones who do not never pay for four reads. The loader
	   is keyed on `employee|month` and guards itself, so the re-render it causes
	   cannot ask twice. */
	useEffect(() => {
		if (emp) void loadRegMonth(emp.name, cyc);
	}, [emp && emp.name, cyc]);

	/* The register, when nobody is picked — the page's resting state, so it is
	   read on arrival and again when the cycle changes. Keyed on the month, so
	   coming back from somebody's month does not read it again. */
	useEffect(() => {
		if (!emp) void loadRegGrid(cyc);
	}, [Boolean(emp), cyc]);

	/* The shift windows, once, and only for somebody who has actually opened a
	   roster — they are what turn `Office Shift` into `Office Shift
	   (08:30-17:30)`, and nothing else on this dashboard needs them. */
	useEffect(() => {
		void loadShiftWindows();
	}, []);

	/* Only requests for the picked person, in the picked cycle. Their screen
	   never shows anybody else's, which is the whole difference from the backlog
	   on Dashboard → Approvals. */
	/* The open corrections for this person and cycle — the queue's population,
	   which is a narrower thing than the roster below shows. */
	const mine = emp
		? (s.approvals.attendance || [])
			.filter((r) => r.employee === emp.name && String(r.attendance_date || "").slice(0, 7) === cyc)
			.sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)))
		: [];

	return (
		<>
			<div className="legend">
				<b className="font-display">Attendance Regularization</b>
				<span className={"cov " + (pend ? "live" : "part")}>
					{pend ? `${fmt(pend)} pending` : "queue live, empty"}
				</span>
				<span>
					<b>Everybody’s month</b> until somebody is picked — click a day, or a time on somebody's month, to change it in a popup.
					A changed <b>Time In / Time Out</b> is saved at once, with the reason; the machine's punch is kept on record. Requests from the phone app still wait for approval, below and on <b>Dashboard → Approvals</b>.
				</span>
			</div>

			<div className="fhscreen">
				<div className="fhtitle">Attendance Regularization</div>
				<RegBar s={s} cyc={cyc} />
				<PendingPanel s={s} emp={emp} cyc={cyc} />

				{/* The picker Factor HR opens under its search box. Ours says how many
				    people it is searching, because the dot and the category box can
				    empty it and a search that finds nobody should say which filter did it. */}
				{searching && (
					matches.length ? (
						<div className="regfind">
							{matches.map((e) => (
								<button key={e.name} onClick={() => patch("reg", { emp: e.name, q: "" })}>
									<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
									<b>{e.employee_name}</b>
									<span className="mono">{e.employee_number || "—"}</span>
									<span className="muted">{tidyDept(e.department)}</span>
								</button>
							))}
						</div>
					) : (
						<div className="regfind">
							<span className="none">
								Nobody matches, out of {fmt(all)} searched
								{s.reg.status ? ` · status ${s.reg.status}` : ""}
								{s.reg.cat ? ` · ${tidyDept(s.reg.cat)}` : ""}
							</span>
						</div>
					)
				)}

				{pick ? (
					<DayPopup key={pick.emp.name + pick.iso} pick={pick} onClose={() => setPick(null)}
						onDone={(m) => {
							setPick(null);
							setSaved(m);
							if (emp) void loadRegMonth(emp.name, cyc, "quiet");
							else void loadRegGrid(cyc, "quiet");
						}} />
				) : null}
				{saved ? (
					<Note>{saved} <button type="button" className="embtn" onClick={() => setSaved("")}>OK</button></Note>
				) : null}

				{!emp ? (
					<RegGrid s={s} cyc={cyc} onPick={(p) => { setSaved(""); setPick(p); }} />
				) : (
					<>
						<div className="regwho">
							<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
							<b>{emp.employee_name}</b>
							<span className="mono">{emp.employee_number || "—"}</span>
							<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
							{/* The *open* ones, which is what the approval queue holds. The
							    roster below shows every correction on the month, decided
							    included, so the two numbers differ on purpose and this one
							    says which it is. */}
							<span className="n">{fmt(mine.length)} open in {cycleLabel(cyc)}</span>
							<button className="embtn" onClick={() => patch("reg", { emp: "", q: "" })}>Clear</button>
						</div>

						{/* **The month, not the backlog.** This drew only the open
						    corrections until 5 September 2026 — one row on a month, the
						    one row somebody already knew about. Their screen draws every
						    day of the cycle, which is what makes it the screen HR opens
						    to answer "what happened to my 19th of August"; a correction
						    is one column of that answer rather than the whole of it. */}
						<ShiftPanel s={s} emp={emp} cyc={cyc} />
						<RegMonth s={s} emp={emp} cyc={cyc} onPick={(p) => { setSaved(""); setPick(p); }} />
					</>
				)}
			</div>

			<div className="mt-[1rem]">
			</div>
		</>
	);
}
