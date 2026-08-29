import { patch, useApp } from "@/state/store";
import { useEffect } from "react";
import { loadLeaveFor } from "@/api/load";
import { deskImport, deskNew } from "@/lib/desk";
import { CAL_MONTHS } from "@/data/masters";
import { DAY, dmy, fmt, monthCells, thisMonth, todayIso, tidyDept, ymd } from "@/lib/format";
import { APPLY_FIELDS, LEAVE_HISTORY_COLS, LEAVE_VALUES, LV_LEGEND } from "@/data/leave";
import { Desk, Empty, Html, Note, NoteBelow, Panel, Scroll, SpecTable } from "@/components/ui";
import { scoped } from "@/lib/scope";

/* Apply Leave, photographed 29 August 2026 — two columns, the application on
   the left and a month calendar on the right, with Leave History underneath.
   Copied control for control.

   Two of their controls are the finding rather than the feature. **Available
   Balance reads 0 on their screen too**, and for the same reason it reads 0
   here: nothing has been allocated. And **Leave Value is asked per date** —
   Full Day / First Half / Second Half against each end of the range — where
   Frappe HR's Leave Application carries one `half_day` flag and one
   `half_day_date`. A range that is half a day at both ends has nowhere to go on
   the doctype, and the form says so rather than rounding somebody's leave.

   It does not submit, and the button says so rather than being greyed out — a
   disabled control never fires, so somebody on a screen reader would get
   silence where the reason should be. */

/** Inclusive, and deliberately not net of holidays or weekly offs.

    Frappe HR deducts both from the employee's holiday list when the application
    is saved. 88 people have no list, so a net figure computed here would be
    right for some of the workforce and quietly wrong for the rest — and this
    number is days of pay. It is the gross span, and the form says so. */
function spanDays(from, to) {
	if (!from || !to) return 0;
	const a = Date.parse(from + "T00:00:00");
	const b = Date.parse(to + "T00:00:00");
	if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
	return Math.round((b - a) / 86400000) + 1;
}

/** Their two Leave Value dropdowns, turned into days. A half at one end takes
    half a day off the gross span; a half at both ends takes a whole one — and
    is the shape the doctype cannot hold. */
function totalDays(f) {
	const gross = spanDays(f.from, f.till);
	if (!gross) return 0;
	if (gross === 1) return f.fromval === "1" ? 1 : 0.5;
	return gross - (f.fromval === "1" ? 0 : 0.5) - (f.tillval === "1" ? 0 : 0.5);
}

/** Which of their seven colours a day is, for one person. Highest priority
    first, and the order is theirs: a day that is both a holiday and an approved
    leave reads as leave, because leave is the thing somebody applied for.

    Absent is last of the answerable ones for the opposite reason — an Absent
    row on a day somebody's leave was approved is a disagreement between two
    doctypes, and it is the approval that was deliberate. */
function dayState(s, iso, hol) {
	const app = (s.applyHist || []).find(
		(r) => r.from_date <= iso && iso <= r.to_date
			&& (r.status === "Open" || r.status === "Approved"),
	);
	if (app) {
		if (app.half_day && String(app.half_day_date || "").slice(0, 10) === iso) return "partial";
		return app.status === "Approved" ? "appr" : "unappr";
	}
	const h = hol[iso];
	if (h) return h.weekly_off ? "weekoff" : "holiday";
	if ((s.applyAtt || {})[iso] === "Absent") return "absent";
	return "";
}

/** Everybody this person shares a manager with, falling back to the department
    when nobody has one — 88 people have no `reports_to`, and a team of one is
    not an answer. Factor HR's own definition of a team has not been seen; this
    one is stated on the panel rather than left to be assumed. */
function teamOf(s, emp) {
	if (!emp) return [];
	const pool = scoped(s).filter((e) => e.name !== emp.name && e.status === "Active");
	if (emp.reports_to) return pool.filter((e) => e.reports_to === emp.reports_to);
	if (emp.department) return pool.filter((e) => e.department === emp.department);
	return [];
}

/** Their coloured status dot, the same control as on every other screen. */
function LvDot({ open, status, onOpen, onPick, label }) {
	const opts = [["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"]];
	const cur = opts.find((o) => o[0] === status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label={label}
				aria-expanded={open} title={`Status: ${cur[2]}`}
				onClick={(e) => { e.stopPropagation(); onOpen(); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label={label} hidden={!open}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === status}
						onClick={(e) => { e.stopPropagation(); onPick(o[0]); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** Their `Search Employee` box: type, pick from what matches. A select of 500
    names is not the same control and does not behave like one. */
function EmpFind({ s, q, status, chosen, onQ, onPick, id }) {
	const picked = chosen ? s.byName[chosen] : null;
	const typing = !picked && (q || "").trim();
	let hits = [];
	if (typing) {
		const needle = q.trim().toLowerCase();
		hits = scoped(s)
			.filter((e) => !status || e.status === status)
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(needle)))
			.slice(0, 8);
	}
	return (
		<>
			{/* The magnifier sits to the right of the box on their screen, and the
			    input is first in the DOM so a keyboard reaches the field rather than
			    the decoration. Both of those come out of plain source order here —
			    which is why this box, alone among the four `Search Employee` boxes in
			    this build, does not carry `.rev`. */}
			<span className="find">
				<input id={id} type="search" placeholder="Search Employee" aria-label="Search employee"
					value={picked ? `${picked.employee_name} (${picked.employee_number || picked.name})` : q}
					/* Typing over a chosen name clears the choice — otherwise the box
					   says one person and the form is filled for another. */
					onChange={(e) => onQ(e.target.value)} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</span>
			{typing ? (
				<div className="regfind">
					{hits.length ? (
						<>
							{hits.map((e) => (
								<button key={e.name} onClick={() => onPick(e.name)}>
									<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
									<b>{e.employee_name}</b>
									<span className="mono">{e.employee_number || "—"}</span>
									<span className="muted">{tidyDept(e.department)}</span>
								</button>
							))}
							<button onClick={() => onPick("")}>
								<span className="muted">— nobody —</span>
							</button>
						</>
					) : (
						<span className="none">Nobody matches.</span>
					)}
				</div>
			) : null}
		</>
	);
}

/** The month grid. Always six weeks, as their screen draws it: a grid that
    changes height with the month makes the arrows move under the pointer. */
function LvCalendar({ s, hol }) {
	const f = s.apply;
	const ym = f.month || (f.from || todayIso()).slice(0, 7);
	const [y, m] = ym.split("-").map(Number);
	const today = todayIso();
	const cells = monthCells(ym);

	const step = (n) => {
		const d = new Date(y, m - 1 + n, 1);
		patch("apply", { month: ymd(d).slice(0, 7) });
	};

	return (
		<div className="lvcal">
			<div className="lvcalbar">
				<b>{CAL_MONTHS[m - 1]} {y}</b>
				<span className="nav">
					<button className="embtn" onClick={() => patch("apply", { month: thisMonth() })}>Today</button>
					<button className="embtn step" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
					<button className="embtn step" aria-label="Next month" onClick={() => step(1)}>›</button>
				</span>
			</div>

			<div className="lvgrid" role="grid" aria-label={`${CAL_MONTHS[m - 1]} ${y}`}>
				{DAY.map((d) => <span className="dow" key={d}>{d.slice(0, 3)}</span>)}
				{cells.map((d) => {
					const iso = ymd(d);
					const out = d.getMonth() !== m - 1;
					const st = out ? "" : dayState(s, iso, hol);
					return (
						<span key={iso} className={"cell" + (out ? " out" : "") + (iso === today ? " now" : "")}>
							<i>{d.getDate()}</i>
							{st ? <em className={"lvdot " + st} title={LV_LEGEND.find((l) => l[0] === st)[1]} /> : null}
						</span>
					);
				})}
			</div>

			<div className="lvkey">
				{LV_LEGEND.map((l) => (
					<span key={l[0]} title={l[3].replace(/<[^>]*>/g, "")}>
						<i className={"lvdot " + l[0]} />
						{l[1]}
					</span>
				))}
			</div>
		</div>
	);
}

export default function ApplyLeave() {
	const s = useApp();
	const f = s.apply;
	const emp = f.emp ? s.byName[f.emp] : null;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	const ym = f.month || from.slice(0, 7);

	/* One read per person and per month on screen. Their form fills the calendar
	   and the history the moment somebody is picked, and so does this. */
	useEffect(() => {
		void loadLeaveFor(f.emp, ym);
	}, [f.emp, ym]);

	/* Their leave_approver is a field nobody has set, so the reporting manager is
	   offered in its place and labelled as the inference it is. A blank approver
	   is an application with nowhere to go. */
	const mgr = emp?.reports_to ? s.byName[emp.reports_to] : null;
	const hol = {};
	(s.holidays[emp?.holiday_list] || []).forEach((h) => {
		hol[String(h.holiday_date).slice(0, 10)] = h;
	});

	const total = totalDays({ ...f, from, till });
	const single = from === till;
	/* The one shape Frappe HR's Leave Application cannot hold: it carries one
	   half_day_date, so only one end of a range can be half a day. */
	const bothHalves = !single && f.fromval !== "1" && f.tillval !== "1";

	const team = teamOf(s, emp);
	const away = team
		.map((e) => ({
			e,
			leave: (s.approvals.leave || []).find(
				(r) => r.employee === e.name && r.from_date <= till && from <= r.to_date,
			),
		}))
		.filter((x) => x.leave);

	const put = (part) => patch("apply", { msg: "", ...part });

	/* The same checks the server would make, made here only to answer quickly and
	   kindly — never as the thing that decides. CLAUDE.md §1. */
	const missing = [
		!f.emp && "an employee",
		!f.type && "a leave type",
		!spanDays(from, till) && "a till date that is not before the from date",
	].filter(Boolean);

	const submit = () => {
		if (missing.length) {
			return patch("apply", { msg: "Needs " + missing.join(", ") + ". Nothing has been sent." });
		}
		patch("apply", {
			msg: `<b>${total} day${total === 1 ? "" : "s"} of ${f.type} for `
				+ `${emp?.employee_name || f.emp} — not submitted.</b> This page cannot create a Leave `
				+ "Application: the proxy is read-only apart from one allowlisted decision, and the type has "
				+ "no entitlement for a balance to be checked against. "
				+ (bothHalves
					? "<b>This one could not be written even from the site:</b> half a day at both ends needs two "
					+ "<code>half_day_date</code> values and the doctype has one."
					: "Raised for real it would land as <b>Open</b> on Dashboard → Approvals → Leave."),
		});
	};

	const cancel = () =>
		patch("apply", {
			emp: "", q: "", type: "", from: "", till: "", fromval: "1", tillval: "1",
			remarks: "", file: "", notify: "", notifyq: "", month: "", msg: "",
		});

	return (
		<>
			<div className="legend">
				<b className="font-display">Apply Leave</b>
				<span className="cov part">Partial</span>
				<span>
					Their form, control for control, on stock Frappe HR's <b>Leave Application</b>. It is live
					and it does not submit.{" "}
					{s.counts.leavetype ? (
						<><b>{fmt(s.counts.leavetype)}</b> leave types on the site</>
					) : (
						<b>No leave type on the site yet</b>
					)}
					, and <b>none of them has an entitlement</b> — which is why Available Balance reads 0 on
					their screen too.
				</span>
			</div>

			{/* Their search sits above the panel, not in it. */}
			<div className="lvtop">
				<LvDot open={f.menu} status={f.status} label="Filter by status"
					onOpen={() => patch("apply", { menu: !f.menu })}
					onPick={(v) => patch("apply", { status: v, menu: false })} />
				<EmpFind s={s} id="lv-emp" q={f.q} status={f.status} chosen={f.emp}
					onQ={(v) => put({ emp: "", q: v })}
					onPick={(name) => put({ emp: name, q: "", month: "" })} />
			</div>

			<div className="lvsplit">
				<section className="fhscreen">
					<div className="fhtitle row">
						Apply Leave
						<span className="ics">
							<button className="embtn" aria-label="Search" title="Jump to the employee search above it."
								onClick={() => document.getElementById("lv-emp")?.focus()}>
								<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
									strokeWidth="1.7" strokeLinecap="round">
									<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
								</svg>
							</button>
							<button className="embtn" aria-label="Refresh" disabled={!f.emp || f.busy}
								title="Re-reads this person's leave history and the month on the calendar."
								onClick={() => void loadLeaveFor(f.emp, ym)}>↻</button>
							<Desk href={s.site && deskImport(s.site)} label="Import"
								title="Imports leave from a spreadsheet. Opens ERPNext's Data Import on the site, which previews the file before it writes — this page proxies GET only, see app/serve.js.">
								<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
									strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
									<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
								</svg>
							</Desk>
						</span>
					</div>

					<div className="lvform">
						<div className="lvf">
							<span className="lab">Document No</span>
							<b className="mono">—</b>
							<span className="hint">
								assigned from the naming series when the row is saved. Their own unsaved form reads{" "}
								<b>-</b> here too
							</span>
						</div>

						<div className="lvf">
							<span className="lab">Date Of Application</span>
							<b>{dmy(todayIso())}</b>
							<span className="hint">today, as <code>posting_date</code></span>
						</div>

						<div className="lvf">
							<span className="lab" id="lv-type-l">Leave Type</span>
							<select aria-labelledby="lv-type-l" value={f.type}
								onChange={(e) => put({ type: e.target.value })}>
								<option value="">Select Leave Type</option>
								{s.leaveTypes.map((t) => <option key={t.name}>{t.name}</option>)}
							</select>
							<span className="hint">
								{s.leaveTypes.length ? "read off the site" : "the site answered with none"}
							</span>
						</div>

						<div className="lvf">
							<span className="lab">Available Balance</span>
							<b className="mono">0</b>
							<span className="hint">
								<b>0 on their screen and 0 here.</b> Frappe HR computes it from a Leave Allocation, and
								no leave type has an entitlement — so there is nothing to allocate and nothing for an
								application to be measured against. This is the blocker the Balance report ends on.
							</span>
						</div>

						<div className="lvf">
							<span className="lab" id="lv-from-l">From Date</span>
							<input type="date" aria-labelledby="lv-from-l" value={from}
								onChange={(e) => put({ from: e.target.value, month: "" })} />
						</div>

						<div className="lvf">
							<span className="lab" id="lv-fromv-l">Leave Value</span>
							<select aria-labelledby="lv-fromv-l" value={f.fromval}
								onChange={(e) => put({ fromval: e.target.value })}>
								{LEAVE_VALUES.map((v) => <option key={v[0]} value={v[0]}>{v[1]}</option>)}
							</select>
						</div>

						<div className="lvf">
							<span className="lab" id="lv-till-l">Till Date</span>
							<input type="date" aria-labelledby="lv-till-l" value={till}
								onChange={(e) => put({ till: e.target.value })} />
						</div>

						<div className="lvf">
							<span className="lab" id="lv-tillv-l">Leave Value</span>
							<select aria-labelledby="lv-tillv-l" value={single ? f.fromval : f.tillval}
								disabled={single}
								title={single ? "One day, one value — the box above it." : undefined}
								onChange={(e) => put({ tillval: e.target.value })}>
								{LEAVE_VALUES.map((v) => <option key={v[0]} value={v[0]}>{v[1]}</option>)}
							</select>
							<span className="hint">
								{spanDays(from, till)
									? <><b>{total}</b> day{total === 1 ? "" : "s"}, both ends included — weekly offs and
										holidays are <b>not</b> deducted, because 88 people have no holiday list to deduct
										them from</>
									: "the range ends before it starts"}
							</span>
						</div>

						{bothHalves && (
							<div className="lvf wide">
								<Note>
									<b>Half a day at both ends has nowhere to go on the doctype.</b> Frappe HR's Leave
									Application carries one <code>half_day</code> flag and one{" "}
									<code>half_day_date</code>. Factor HR asks for a value per date, so this is a shape
									their form can hold and ERPNext cannot — it would have to be two applications, or a
									field added. Counted as <b>{total}</b> days here so the arithmetic is not silently
									wrong; it is the writing that cannot happen.
								</Note>
							</div>
						)}

						<div className="lvf wide">
							<span className="lab" id="lv-rem-l">Remarks</span>
							<textarea aria-labelledby="lv-rem-l" rows={3} placeholder="Remarks" value={f.remarks}
								onChange={(e) => put({ remarks: e.target.value })} />
							<span className="hint"><code>description</code> on the doctype</span>
						</div>

						<div className="lvf wide">
							<span className="lab" id="lv-file-l">Attachment</span>
							<input type="file" aria-labelledby="lv-file-l"
								onChange={(e) => put({
									file: e.target.files?.[0]?.name || "",
									msg: e.target.files?.[0]
										? `<b>${e.target.files[0].name} was read by this browser and goes no further.</b> `
											+ "Attaching it for real writes a <code>File</code> row on the site and links it "
											+ "to the application; this page proxies GET only — see <code>app/serve.js</code>."
										: "",
								})} />
							<span className="hint">
								{f.file ? <><b>{f.file}</b> chosen — held in this browser only</> : "their form takes a file"}
							</span>
						</div>

						<div className="lvf wide">
							<span className="lab">Email Notification To</span>
							<span className="ctl">
								<LvDot open={f.notifymenu} status={f.status} label="Filter by status"
									onOpen={() => patch("apply", { notifymenu: !f.notifymenu })}
									onPick={(v) => patch("apply", { status: v, notifymenu: false })} />
								<EmpFind s={s} q={f.notifyq} status={f.status} chosen={f.notify}
									onQ={(v) => put({ notify: "", notifyq: v })}
									onPick={(name) => put({ notify: name, notifyq: "" })} />
							</span>
							<span className="hint">
								ERPNext notifies the <code>leave_approver</code>, which nobody has set.{" "}
								{mgr ? (
									<>Their reporting manager is <b>{mgr.employee_name}</b>{" "}
										<span className="cov none">inferred</span>.</>
								) : f.emp ? (
									<b>No reporting manager on this record, so this application would have nobody to go to.</b>
								) : (
									"Follows from the employee."
								)}
							</span>
						</div>
					</div>

					<div className="repacts">
						<button className="btn tpl" onClick={submit}>Submit</button>
						<button className="btn ghost" onClick={cancel}>Cancel</button>
					</div>

					{f.msg ? (
						<div className="mt-[.7rem]">
							<Note><Html html={f.msg} /></Note>
						</div>
					) : null}
					{f.err ? (
						<div className="mt-[.7rem]">
							<Note><b>The site refused the read.</b> {f.err}</Note>
						</div>
					) : null}
				</section>

				<aside className="lvside">
					<LvCalendar s={s} hol={hol} />

					{!f.emp && (
						<Note>
							<b>Nobody is chosen, so the month is empty.</b> Pick somebody above and the calendar
							fills from their holiday list, their leave and their attendance.
						</Note>
					)}
					{f.emp && !emp?.holiday_list && (
						<Note>
							<b>{emp?.employee_name || "This person"} has no holiday list.</b> So no weekly off and no
							holiday can be drawn for them — 88 people on this site are in the same position, and it
							is the same gap that stops leave days being netted.
						</Note>
					)}

					<div className="fhscreen">
						<div className="fhtitle">Other Team Member On Leave</div>
						{!f.emp ? (
							<Empty title="Nobody chosen">The team follows from the person.</Empty>
						) : away.length ? (
							<ul className="lvteam">
								{away.map(({ e, leave }) => (
									<li key={e.name}>
										<b>{e.employee_name}</b>
										<span className="muted">{tidyDept(e.department)}</span>
										<span className="mono">{dmy(leave.from_date)} – {dmy(leave.to_date)}</span>
										<span className="cov part">{leave.status}</span>
									</li>
								))}
							</ul>
						) : (
							<Empty title="No team member on leave">
								{team.length
									? `Over ${dmy(from)} – ${dmy(till)}, none of the ${fmt(team.length)} people in this team has an open application.`
									: "Nobody shares a reporting manager or a department with this person, so there is no team to answer for."}
							</Empty>
						)}
						<NoteBelow>
							<b>Team is read as everybody reporting to the same manager</b>, falling back to the same
							department where nobody has one — 88 people have no <code>reports_to</code>. Factor HR's
							own definition of a team has not been seen, so this one is stated rather than assumed,
							and it reads the open applications the approval queue reads.
						</NoteBelow>
					</div>
				</aside>
			</div>

			<Panel title="Leave History" cov={f.emp ? "part" : "none"} ico="🗓">
				{!f.emp ? (
					<Empty title="Nobody chosen">
						Their history table fills from the person picked above. It is read from the site at that
						moment — every application, any status, not only the ones still open.
					</Empty>
				) : (s.applyHist || []).length ? (
					<Scroll>
						<table style={{ minWidth: 900 }}>
							<thead>
								<tr>{LEAVE_HISTORY_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
							</thead>
							<tbody>
								{(s.applyHist || [])
									.slice()
									.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))
									.map((r) => (
										<tr key={r.name}>
											{LEAVE_HISTORY_COLS.map((c) => (
												<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
											))}
										</tr>
									))}
							</tbody>
						</table>
					</Scroll>
				) : (
					<Empty title="No leave on record">
						{f.busy
							? "Reading the site…"
							: `Nothing has ever been applied for by ${emp?.employee_name || "this person"} on this site. `
								+ "Factor HR was holding 3 open applications across the group on 28 Aug 2026 — none of "
								+ "them has been migrated, so an empty history is the honest answer rather than a "
								+ "disagreement."}
					</Empty>
				)}
				<NoteBelow>
					<b>Last Action By and On are the doctype's own <code>modified_by</code> and{" "}
					<code>modified</code></b> — who touched the row last, which on an application edited after
					approval is not who approved it. Their column reads as an approval trail; this one is
					labelled as what it actually holds.
				</NoteBelow>
			</Panel>

			<Panel title="Apply Leave, field by field" cov="part" ico="🗂">
				<SpecTable cols={["Field", "Type", "State", "Note"]} list={APPLY_FIELDS} />
				<NoteBelow>
					<b>Nothing on this form reaches the site.</b> The same doctype the Leave approval queue
					reads, from the other end — see Dashboard → Approvals → Leave for what an approver sees of
					these fields. Until the proxy's allowlist widens (<code>app/serve.js</code>), an application
					that has to be raised today is{" "}
					<Desk href={s.site && deskNew(s.site, "Leave Application")} className="lnk"
						label="Raise a Leave Application on the site"
						title="A new Leave Application on the site, where the validation that guards it runs and where the balance would be checked.">
						raised on the site
					</Desk>, which is where the rules live.
				</NoteBelow>
			</Panel>
		</>
	);
}
