import { Fragment } from "react";

import { getState, patch, set, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { deskNewWith } from "@/lib/desk";
import { scoped } from "@/lib/scope";
import { fmt, todayIso } from "@/lib/format";
import { audienceOf, recipients } from "@/lib/audience";
import { openScheduleList } from "@/features/attendance/ScheduleList";
import {
	SCHED_ACTS, SCHED_BLANK, SCHED_DISPATCH, SCHED_FORM, SCHED_FORMATS, SCHED_JOBS, SCHED_PERIODS,
	SCHED_WEEKDAYS,
} from "@/data/schedule";
import { SREP_AUDIENCE, SREP_REPORTS } from "@/data/schedreport";

/* ---------------------------------------------------------------------------
   **Auto Report Scheduler — Employee Detail Report**, behind ⏰ Schedule Report
   on the criteria form. Photographed 4 September 2026 and drawn control for
   control.

   The argument for every field is in data/schedule.js, where the table is.
   What is here is the two things a component decides: how the form is laid out,
   and what the five buttons do.

   ## The one that writes writes on the site

   Create/Update Schedule opens ERPNext's `Auto Email Report` with this form's
   answers already in it, through `deskNewWith`. That is the same hand-off
   Create Letter and the asset forms make, and it is not a fallback here — it is
   the only honest answer. A schedule needs something running when nobody is
   watching; this is a browser tab. The ⌛ Generate In Background button on the
   form behind this dialog already says exactly that, and this dialog does not
   get to say it differently.

   ## Six of their controls land in fields, seven land in a sentence

   The seven with no field on `Auto Email Report` are gathered into
   `description` — the day, the hour, the minute, the offset, the name, the
   subject and the remarks — as a block of text that says what was asked for.
   **Not silently.** The exact text is on the dialog before anything opens, in
   the panel under the buttons, because a form that quietly rewrites what
   somebody typed into a comment is worse than one that refuses.

   Two are deliberately *not* carried over even into that text: CC and BCC. An
   address list is not a note — somebody copied in believes they were copied in
   — and writing them into a description would look like they had been while
   nothing mailed them. They are named as dropped instead.
   --------------------------------------------------------------------------- */

/** The report this dialog was opened for, and never undefined: a scheduler
    with no report is a bug rather than a state, and it must not be a blank
    dialog while somebody works out which. Its criteria line lives with it, in
    data/schedreport.js — the one registry both schedulers read. */
const reportOf = (key) => SREP_REPORTS[key] || SREP_REPORTS.ed;

/** Open this dialog for one report. Exported because two criteria forms open
    it — Employee Detail's and Attendance Statutory's — and the guard belongs in
    one of them rather than both: **a scheduler opened for a different report
    starts empty.** Otherwise Statutory's schedule opens holding the addresses
    somebody typed for Employee Detail, under Statutory's name. */
export function openScheduler(key) {
	const cur = getState().sched;
	const keep = cur.for === key ? cur : SCHED_BLANK(key);
	set({ sched: { ...keep, open: true, msg: "" } });
}

/** What ends up in `description` on the site: the message, then every answer
    this form took that has no field to go in.

    Built in one place and shown on the dialog before it is sent anywhere, so
    what the site will hold and what somebody was told it would hold are the
    same string. */
function describe(s, f, R) {
	const spare = SCHED_FORM
		.filter((r) => r.state === "build" && r.key !== "cc" && r.key !== "bcc")
		.map((r) => [r.label, String(f[r.key] ?? "").trim()])
		.filter(([, v]) => v !== "");

	const ticked = SREP_AUDIENCE.filter((a) => f[a.key]).map((a) => a.label);

	const lines = [];
	if (f.message.trim()) lines.push(f.message.trim());
	lines.push(`Criteria: ${R.criteria(s)}.`);
	if (ticked.length) {
		lines.push(
			`Addresses resolved from the employee master on ${todayIso()} for — ${ticked.join("; ")}. `
			+ "That is a list, not a rule: anybody who joins or leaves after today is not on it until "
			+ "somebody edits the schedule.",
		);
	}
	if (spare.length) {
		lines.push(
			"Asked for on Factor HR's scheduler and not held by Auto Email Report — "
			+ spare.map(([k, v]) => `${k}: ${v}`).join("; ") + ".",
		);
	}
	lines.push(`Written from the Manna HR dashboard on ${todayIso()}.`);
	return lines.join("\n\n");
}

/** One labelled row. Their layout puts the label to the left of the control and
    right-aligned, which is what `.schgrid` draws — the same shape the criteria
    form behind it uses, because the two are the same screen a click apart. */
function Row({ row, children }) {
	const off = row.state === "build";
	return (
		<>
			<label className={off ? "off" : undefined} htmlFor={"sch_" + row.key} title={row.why}>
				{row.label}:
			</label>
			<span className="ctl">
				{children}
				{row.suffix ? <b className="sfx">{row.suffix}</b> : null}
				{off ? <span className="hint" title={row.why}>no field on the site</span> : null}
			</span>
		</>
	);
}

export default function ScheduleReport({ onClose }) {
	const s = useApp();
	const f = s.sched.f;
	const setF = (part) => patch("sched", { f: { ...f, ...part }, msg: "" });

	/* Which report this is for is held in the store rather than passed as a
	   prop: the dialog is opened from a button and rendered from the page body,
	   and a prop would be a second place for those two to disagree. */
	const R = reportOf(s.sched.for);
	const aud = audienceOf(s, f);
	const to = recipients(s, f);
	const job = SCHED_JOBS.find((j) => j[0] === f.job) || SCHED_JOBS[0];
	const description = describe(s, f, R);
	const dropped = [f.cc.trim() && "CC To", f.bcc.trim() && "BCC To"].filter(Boolean);

	/* Everything the desk form will open holding. Only the six that have a field
	   — `deskNewWith` drops empties, so an untouched box leaves the doctype's own
	   default alone rather than overwriting it with "". */
	const values = {
		report: R.report,
		reference_report: R.report,
		format: f.format === "PDF" ? "HTML" : f.format,
		dynamic_date_period: f.period,
		enabled: f.disabled ? 0 : 1,
		/* Typed addresses and resolved ones, as one list — see lib/audience.js,
		   which both schedulers share so they cannot come to disagree about who
		   "every active employee" is. */
		email_to: to.join(", "),
		frequency: job[1],
		description,
		...(job[1] === "Weekly" ? { day_of_week: f.weekday } : {}),
	};
	const href = s.site && deskNewWith(s.site, "Auto Email Report", values);

	/** Their Fetch Updated Data: restate the schedule from the criteria as they
	    stand right now. The only source of criteria here is the form this dialog
	    was opened from, so that is what it reads. */
	function fetchData() {
		const rows = scoped(s).length;
		patch("sched", {
			f: {
				...f,
				subject: `${R.report} — ${R.criteria(s)}`,
				message: f.message.trim() || `${R.report}, generated automatically.`,
			},
			msg: `Restated from the criteria form: ${R.criteria(s)}. `
				+ `${fmt(rows)} people are loaded for the company on the top bar; what the schedule `
				+ "actually sends is decided on the site when it runs, not here.",
		});
	}

	return (
		<Modal
			title={`Auto Report Scheduler — ${R.report}`}
			wide
			extra={
				<div className="schform">
					{/* Their two-column head: what the schedule is, and the window of
					    data each run covers. */}
					<div className="schtop">
						<div className="schgrid">
							{SCHED_FORM.filter((r) => r.where === "left").map((r) => (
								<Row key={r.key} row={r}>
									{r.kind === "fixed" ? (
										<input id={"sch_" + r.key} value={R.report} readOnly
											title="The report this schedule sends, fixed by the form it was opened from." />
									) : r.kind === "select" && r.key === "format" ? (
										<>
											<select id="sch_format" value={f.format}
												onChange={(e) => setF({ format: e.target.value })}>
												{SCHED_FORMATS.map(([v, why]) => (
													<option key={v} value={v} title={why}>{v}</option>
												))}
											</select>
											{/* Their default, and the one ERPNext has not got. Said here
											    rather than only in the panel below: a substitution a
											    person has to notice by comparing two boxes is one they
											    will not notice. */}
											{f.format === "PDF" ? (
												<span className="hint" title={SCHED_FORMATS[0][1]}>
													the site has no PDF — it will send <b>HTML</b>
												</span>
											) : null}
										</>
									) : r.kind === "select" ? (
										<select id="sch_dispatch" value={f.dispatch}
											onChange={(e) => setF({ dispatch: e.target.value })}>
											{SCHED_DISPATCH.map((v) => <option key={v}>{v}</option>)}
										</select>
									) : (
										<input id={"sch_" + r.key} value={f[r.key]}
											onChange={(e) => setF({ [r.key]: e.target.value })} />
									)}
								</Row>
							))}
						</div>

						<div className="schright">
						{/* Their tick sits above the date-range group and is half out of
						    the capture. Drawn where it reads rather than where it is
						    cropped. */}
						<label className="schoff" title={SCHED_FORM.find((r) => r.key === "disabled").why}>
							<input type="checkbox" checked={f.disabled}
								onChange={(e) => setF({ disabled: e.target.checked })} />
							Disable Schedule
						</label>

						{/* Their boxed group, legend and all. */}
						<fieldset className="schset">
							<legend>Report Generate Date Range Criteria</legend>
							<div className="schgrid">
								{SCHED_FORM.filter((r) => r.where === "right" && r.kind !== "check").map((r) => (
									<Row key={r.key} row={r}>
										{r.kind === "select" ? (
											<select id="sch_period" value={f.period}
												onChange={(e) => setF({ period: e.target.value })}>
												{SCHED_PERIODS.map((v) => <option key={v}>{v}</option>)}
											</select>
										) : (
											<input id={"sch_" + r.key} type="number" value={f[r.key]}
												onChange={(e) => setF({ [r.key]: e.target.value })} />
										)}
									</Row>
								))}
							</div>
						</fieldset>
						</div>
					</div>

					<div className="schgrid wide">
						{SCHED_FORM.filter((r) => r.where === "wide").map((r) => (
							<Fragment key={r.key}>
							<Row row={r}>
								{r.kind === "textarea" ? (
									<textarea id="sch_message" rows={3} value={f.message}
										onChange={(e) => setF({ message: e.target.value })} />
								) : r.key === "job" ? (
									<>
										<select id="sch_job" value={f.job} onChange={(e) => setF({ job: e.target.value })}>
											{SCHED_JOBS.map(([v, , why]) => (
												<option key={v} value={v} title={why}>{v}</option>
											))}
										</select>
										{/* ERPNext's own, and only when it means anything: `day_of_week`
										    exists for a weekly frequency and for nothing else. */}
										{job[1] === "Weekly" ? (
											<select aria-label="Day of week" value={f.weekday}
												onChange={(e) => setF({ weekday: e.target.value })}>
												{SCHED_WEEKDAYS.map((d) => <option key={d}>{d}</option>)}
											</select>
										) : null}
										<span className="hint" title={job[2]}>
											the site runs this as <b>{job[1]}</b>
										</span>
									</>
								) : r.kind === "number" ? (
									<input id={"sch_" + r.key} type="number" value={f[r.key]}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								) : (
									<input id={"sch_" + r.key} value={f[r.key]}
										placeholder={r.key === "to" ? "somebody@example.com, somebody.else@example.com" : undefined}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								)}
							</Row>

							{/* Their three Send To ticks, and this is where the Attendance
							    Statutory capture puts them: under Email To, indented to the
							    control column, before CC To. The newer wizard has the same
							    three in the same place — one dialog is not more or less
							    theirs than the other, so both draw them.

							    What each resolves to is `SREP_AUDIENCE`, and the resolving
							    is `lib/audience.js`. Neither is duplicated here: two
							    schedulers disagreeing about who "every active employee" is
							    would be worse than either being wrong on its own. */}
							{r.key === "to" ? (
								<>
									<span />
									<span className="ctl schaud">
										<span className="ticks">
											{SREP_AUDIENCE.map((a) => (
												<label key={a.key} className="schoff" title={a.why}>
													<input type="checkbox" checked={f[a.key]}
														onChange={(e) => setF({ [a.key]: e.target.checked })} />
													{a.label}
												</label>
											))}
										</span>
										{aud.people ? (
											<span className="hint">
												<b>{fmt(aud.addrs.length)} address{aud.addrs.length === 1 ? "" : "es"}</b>,
												{" "}from {fmt(aud.people)} {aud.people === 1 ? "person" : "people"}
												{s.company ? ` in ${s.company}` : " across every company"}
												{aud.nomail
													? `, and the site holds no email for ${fmt(aud.nomail)} of them` : ""}.
												{" "}Resolved now and written into Email To — Auto Email Report takes a list
												of addresses, not a rule it can re-run, so anybody who joins after today is
												not on this schedule until somebody edits it.
											</span>
										) : null}
									</span>
								</>
							) : null}
							</Fragment>
						))}
					</div>

					{s.sched.msg ? <div className="note">{s.sched.msg}</div> : null}

					{/* What the site will actually hold, before anything opens. The
					    seven controls with no field of their own end up in one text
					    box, and somebody should be able to read that text rather than
					    discover it on the record afterwards. */}
					<details className="schwhat">
						<summary>What the site will hold</summary>
						<dl>
							<dt>Auto Email Report</dt>
							<dd className="mono">
								{Object.entries(values).filter(([k]) => k !== "description")
									.map(([k, v]) => `${k} = ${v}`).join("\n")}
							</dd>
							<dt>description</dt>
							<dd className="mono">{description}</dd>
						</dl>
						{dropped.length ? (
							<p className="gap">
								<b>{dropped.join(" and ")}</b> {dropped.length > 1 ? "are" : "is"} not carried over.
								ERPNext's Auto Email Report has one address list and no copies — and these are not
								written into the description either, because somebody copied in believes they were
								copied in, and a note saying so while nothing mails them would be worse than the
								field being missing.
							</p>
						) : null}
					</details>

					{/* Their five, in their order. */}
					<div className="schacts">
						<button className="btn ghost" title={SCHED_ACTS.fetch} onClick={fetchData}>
							⟳ Fetch Updated Data
						</button>
						<Desk className="btn tpl" href={href} title={SCHED_ACTS.create}>
							⏰ Create/Update Schedule
						</Desk>
						{/* Their List, and it opens Factor HR's own list screen rather than
						    the site's — the same one the wizard's List opens, keyed to this
						    report. One destination for every way in.

						    The scheduler is closed rather than covered: two dialogs on
						    screen at once share a backdrop and a z-index, and whichever is
						    on top is on top by accident. Nothing is lost — the form lives
						    in the store and reopens still filled in. */}
						<button className="btn ghost" title={SCHED_ACTS.list}
							onClick={() => { onClose(); openScheduleList(s.sched.for); }}>
							▤ List
						</button>
						<button className="btn ghost" disabled title={SCHED_ACTS.remove}>
							🗑 Delete Schedule
						</button>
						{/* Their fifth button is Close, and the Modal shell already draws
						    one under every dialog in this app. One Close, not two — a
						    second copy of a control is worse than a control an inch from
						    where the original screen puts it. */}
					</div>
				</div>
			}
			onClose={onClose}
		/>
	);
}
