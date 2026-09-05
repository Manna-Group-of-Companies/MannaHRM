import { getState, patch, set, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { deskNewWith } from "@/lib/desk";
import { audienceOf, recipients } from "@/lib/audience";
import { openScheduleList } from "@/features/attendance/ScheduleList";
import { fmt, todayIso } from "@/lib/format";
import { SCHED_FORMATS, SCHED_JOBS, SCHED_PERIODS, SCHED_WEEKDAYS } from "@/data/schedule";
import {
	SREP_ACTS, SREP_AUDIENCE, SREP_BLANK, SREP_DEFAULT, SREP_DISPATCH, SREP_REPORTS, SREP_STEP1,
	SREP_STEP2, SREP_STEPS,
} from "@/data/schedreport";

/* ---------------------------------------------------------------------------
   **SCHEDULE REPORT — In / Out Activity Report**, behind Create Schedule Report
   in the Generate menu on that report's criteria form. Factor HR's newer wizard
   chrome, photographed 4 September 2026: two numbered steps across the top,
   Next and Cancel at the foot.

   The argument for every control is in data/schedreport.js, where the table is.
   What is here is the three things a component decides: how the two steps are
   laid out, what Next will and will not let past, and what Create Schedule
   hands to the site.

   ## Why this is a second scheduler and not an edit to the first

   Employee Detail's Auto Report Scheduler (features/employees/ScheduleReport.jsx)
   is a different screen in Factor HR — one long form, five buttons, no steps —
   and it is photographed as one. Two screens drawn as two screens.

   Nothing is drawn twice, though, and that is the whole care taken here:

     · the frequency list, the date-range periods, the output formats and the
       weekday list come from data/schedule.js, so the two dialogs cannot offer
       one site different answers to the same question;
     · the stepper is `.wizsteps` — the Create Employee wizard's, unchanged;
     · the fields are `.lvform` / `.lvf`, this app's labelled-field grid, whose
       small upper-case label above the box is already what their capture shows;
     · "What the site will hold" is `.schwhat`, the other scheduler's panel.

   Which leaves one new class in the stylesheet, `.srepform`, and one new token,
   `--need` — the pale yellow their form fills a box with when it wants an
   answer in it.

   ## The ticks resolve here, and say so

   Their three Send To boxes name an audience. `Auto Email Report.email_to` is a
   list of addresses. So each tick is resolved against the employee master this
   dashboard already holds, scoped by the company on the top bar, and the count
   and the names are on the dialog before anything opens — see `audienceOf`. A
   rule evaluated at send time is the thing ERPNext has not got, and quietly
   turning one into a snapshot without saying so is how a schedule ends up
   mailing the wrong people for a year.
   --------------------------------------------------------------------------- */

/** The report this dialog was opened for, and never undefined: a wizard with no
    report is a bug rather than a state, and it must not be a blank dialog while
    somebody works out which. */
const reportOf = (key) => SREP_REPORTS[key] || SREP_REPORTS[SREP_DEFAULT];

/** Open the wizard for one report. Exported because both criteria forms open
    it and the interesting half is the guard, which neither of them should be
    holding a copy of: **a wizard opened for a different report starts empty.**
    Otherwise Daily Detail's schedule opens holding the addresses somebody typed
    for In / Out, under Daily Detail's name. */
export function openSchedule(key) {
	const cur = getState().srep;
	const keep = cur.for === key ? cur : SREP_BLANK(key);
	set({ srep: { ...keep, open: true, msg: "", bad: false } });
}

/** What ends up in `description` on the site: the message, the criteria, then
    every answer this wizard took that has no field to go in.

    Built in one place and shown on the dialog before it is sent anywhere, so
    what the site will hold and what somebody was told it would hold are the
    same string. */
function describe(s, f, R) {
	const spare = [...SREP_STEP1, ...SREP_STEP2]
		.filter((r) => r.state === "build" && r.key !== "cc" && r.key !== "bcc")
		.map((r) => [r.label, String(f[r.key] ?? "").trim()])
		.filter(([, v]) => v !== "" && v !== "0");

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
			"Asked for on Factor HR's wizard and not held by Auto Email Report — "
			+ spare.map(([k, v]) => `${k}: ${v}`).join("; ") + ".",
		);
	}
	lines.push(`Written from the Manna HR dashboard on ${todayIso()}.`);
	return lines.join("\n\n");
}

/** One labelled control. `.lvf` is this app's field — small upper-case label
    above the box, which is what their capture shows — and `--w` is which of the
    two columns' worth of width it takes.

    `miss` is only ever set after Next has refused: a form that turns boxes red
    while somebody is still filling the first of them is a form that tells them
    off for typing slowly. */
function Field({ row, miss, children }) {
	const off = row.state === "build";
	return (
		<div className={"lvf" + (row.where === "wide" ? " wide" : "") + (miss ? " miss" : "")}>
			{/* No `htmlFor` on the one row that is not a control: Report Name is
			    text on their form too, and a label pointing at a <b> is a label
			    that does nothing when it is clicked and announces nothing when it
			    is read. */}
			<label className="lab" htmlFor={row.kind === "fixed" ? undefined : "ios_" + row.key}
				title={row.why}>
				{row.label}
				{row.need ? <b className="wizreq" aria-hidden="true"> *</b> : null}
				{row.suffix ? <b className="sfx"> {row.suffix}</b> : null}
			</label>
			<span className="ctl">{children}</span>
			{off ? <span className="hint" title={row.why}>no field on the site</span> : null}
		</div>
	);
}

export default function ScheduleReport({ onClose }) {
	const s = useApp();
	const w = s.srep;
	const f = w.f;
	/* Which report this is for is held in the store rather than passed as a
	   prop: the dialog is opened from a menu and rendered from the page body,
	   and a prop would be a second place for those two to disagree about which
	   report the form on screen belongs to. */
	const R = reportOf(w.for);
	const setF = (part) => patch("srep", { f: { ...f, ...part }, msg: "", bad: false });

	const aud = audienceOf(s, f);
	const to = recipients(s, f);
	const job = SCHED_JOBS.find((j) => j[0] === f.job) || SCHED_JOBS[0];
	const description = describe(s, f, R);
	const dropped = [f.cc.trim() && "CC To", f.bcc.trim() && "BCC To"].filter(Boolean);

	/* Their three yellow boxes, and the one substitution: a Send To tick that
	   resolved to at least one address answers Email To, because it has put
	   addresses in it. */
	const missing = [
		!f.name.trim() && "name",
		!f.subject.trim() && "subject",
		!to.length && "to",
	].filter(Boolean);

	/* Everything the desk form will open holding. Only the fields that exist —
	   `deskNewWith` drops empties, so an untouched box leaves the doctype's own
	   default alone rather than overwriting it with "". */
	const values = {
		report: R.report,
		reference_report: R.report,
		format: f.format === "PDF" ? "HTML" : f.format,
		dynamic_date_period: f.period,
		enabled: f.disabled ? 0 : 1,
		email_to: to.join(", "),
		frequency: job[1],
		description,
		...(job[1] === "Weekly" ? { day_of_week: f.weekday } : {}),
	};
	const href = s.site && deskNewWith(s.site, "Auto Email Report", values);

	/** Next, and the click on step 2's own circle. One gate rather than two ways
	    in and one of them unguarded — and it names the boxes, because "the form
	    is incomplete" is a message that makes somebody hunt. */
	function go(k) {
		if (k === "detail") return void patch("srep", { step: "detail", msg: "", bad: false });
		if (missing.length) {
			const named = missing.map((m) => SREP_STEP1.find((r) => r.key === m).label);
			return patch("srep", {
				msg: `Report Detail wants ${named.join(", ")} before Scheduling Detail.`
					+ (missing.includes("to")
						? " Either type an address or tick one of the Send To boxes — a tick resolves into"
							+ " that box, so a schedule is never made with nowhere to go."
						: ""),
				bad: true,
			});
		}
		patch("srep", { step: "sched", msg: "", bad: false });
	}

	/** One control, drawn from its row. Both steps go through this, so a kind
	    added to either is drawn the same on both. */
	function control(r) {
		const id = "ios_" + r.key;
		const need = r.need ? "need" : undefined;
		if (r.kind === "fixed") return <b className="srepfix">{R.report}</b>;
		if (r.kind === "textarea") {
			return <textarea id={id} rows={3} value={f[r.key]}
				onChange={(e) => setF({ [r.key]: e.target.value })} />;
		}
		if (r.kind === "number") {
			return <input id={id} type="number" value={f[r.key]}
				onChange={(e) => setF({ [r.key]: e.target.value })} />;
		}
		if (r.kind === "select") {
			/* `[value, tooltip]` either way, so one map draws all four. The lists
			   themselves are data/schedule.js's — see the header. */
			const list = r.key === "dispatch" ? SREP_DISPATCH.map((v) => [v, ""])
				: r.key === "format" ? SCHED_FORMATS
				: r.key === "period" ? SCHED_PERIODS.map((v) => [v, ""])
				: SCHED_JOBS.map(([v, , why]) => [v, why]);
			return (
				<select id={id} value={f[r.key]} onChange={(e) => setF({ [r.key]: e.target.value })}>
					{list.map(([v, why]) => <option key={v} value={v} title={why || undefined}>{v}</option>)}
				</select>
			);
		}
		return (
			<input id={id} className={need} value={f[r.key]}
				placeholder={r.key === "to" ? "somebody@example.com, somebody.else@example.com" : undefined}
				onChange={(e) => setF({ [r.key]: e.target.value })} />
		);
	}

	const detail = (
		<>
			{/* Their head: the report's name drawn as text on the left — it is not a
			    control on their form either — and the disable tick on the right. */}
			<div className="srephead">
				<Field row={SREP_STEP1[0]}>{control(SREP_STEP1[0])}</Field>
				<label className="schoff" title={SREP_STEP1[1].why}>
					<input type="checkbox" checked={f.disabled}
						onChange={(e) => setF({ disabled: e.target.checked })} />
					Is Disabled
				</label>
			</div>

			<div className="lvform">
				{SREP_STEP1.filter((r) => ["name", "dispatch", "subject", "to"].includes(r.key)).map((r) => (
					<Field key={r.key} row={r} miss={w.bad && missing.includes(r.key)}>
						{control(r)}
					</Field>
				))}
			</div>

			{/* Their three ticks, which name an audience rather than an address. */}
			<div className="srepticks">
				{SREP_AUDIENCE.map((a) => (
					<label key={a.key} className="schoff" title={a.why}>
						<input type="checkbox" checked={f[a.key]}
							onChange={(e) => setF({ [a.key]: e.target.checked })} />
						{a.label}
					</label>
				))}
			</div>

			{/* What a tick resolved to, right now. The whole finding is in the second
			    sentence: the site takes the list, not the rule that made it. */}
			{aud.people ? (
				<div className="note">
					<b>{fmt(aud.addrs.length)} address{aud.addrs.length === 1 ? "" : "es"}</b>, from{" "}
					{fmt(aud.people)} {aud.people === 1 ? "person" : "people"}
					{s.company ? ` in ${s.company}` : " across every company"}
					{aud.nomail ? `, and the site holds no email for ${fmt(aud.nomail)} of them` : ""}.
					{" "}Resolved <b>now</b> and written into Email To — ERPNext's Auto Email Report takes a
					list of addresses, not a rule it can re-run, so anybody who joins after today is not on
					this schedule until somebody edits it.
					{aud.named.length ? (
						<div className="srepwho">
							{aud.named.slice(0, 12).join(", ")}
							{aud.named.length > 12 ? `, and ${fmt(aud.named.length - 12)} more` : ""}
						</div>
					) : null}
				</div>
			) : null}

			<div className="lvform">
				{SREP_STEP1.filter((r) => ["cc", "bcc", "message"].includes(r.key))
					.map((r) => <Field key={r.key} row={r}>{control(r)}</Field>)}
			</div>
		</>
	);

	const sched = (
		<>
			{/* Said before the controls rather than in a tooltip: this step is
			    assembled and the one before it is photographed, and a reader has to
			    be able to tell those apart without opening the source. */}
			<div className="note">
				<b>This step is not a photograph.</b> Factor HR's second step has never been opened here, so
				what is drawn is the scheduling half of their other scheduler — the one on Employee Detail,
				captured 4 September 2026 — off the same lists. See <code>data/schedreport.js</code>.
			</div>

			<div className="lvform">
				{SREP_STEP2.map((r) => (
					<Field key={r.key} row={r}>
						{control(r)}
						{/* Their default, and the one ERPNext has not got. Said on the
						    control rather than only in the panel below: a substitution
						    somebody has to notice by comparing two boxes is one they will
						    not notice. */}
						{r.key === "format" && f.format === "PDF" ? (
							<span className="hint" title={SCHED_FORMATS[0][1]}>
								the site has no PDF — it will send <b>HTML</b>
							</span>
						) : null}
						{r.key === "job" ? (
							<>
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
						) : null}
					</Field>
				))}
			</div>

			{/* What the site will actually hold, before anything opens. Shut by
			    default — it is the answer to a question somebody asks once — and
			    printed rather than summarised, because the point of it is that the
			    text on screen and the text on the record are the same string.

			    `.schwhat` is the other scheduler's panel, reused rather than copied:
			    two of these drawn two ways is exactly the drift both dialogs are
			    written to avoid. */}
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
						copied in, and a note saying so while nothing mails them would be worse than the field
						being missing.
					</p>
				) : null}
			</details>
		</>
	);

	return (
		<Modal
			title={`Schedule Report — ${R.report}`}
			wide
			extra={
				<div className="srepform">
					{/* The Create Employee wizard's strip, unchanged. A step already
					    passed draws itself `ok` the same way it does there, so the two
					    wizards in this app cannot come to mean different things by the
					    same circle. */}
					<ol className="wizsteps">
						{SREP_STEPS.map(([k, label], i) => (
							<li key={k} className={k === w.step ? "on" : k === "detail" ? "ok" : ""}>
								<button className="wizdot" aria-current={k === w.step ? "step" : undefined}
									title={k === "detail" ? SREP_ACTS.back : SREP_ACTS.next}
									onClick={() => go(k)}>
									<span aria-hidden="true">{k === "detail" && w.step === "sched" ? "✓" : i + 1}</span>
									<span className="sr-only">{label}</span>
								</button>
								<span className="wizlab">{label}</span>
							</li>
						))}
					</ol>

					{w.step === "detail" ? detail : sched}

					{w.msg ? <div className={w.bad ? "gap" : "note"}>{w.msg}</div> : null}

					{/* Their foot, right-aligned: Next and Cancel on the first step, Back
					    and the one control that writes on the second. Close is the Modal
					    shell's own and is not drawn twice — Cancel is theirs, and it
					    empties the wizard on the way out rather than leaving a
					    half-filled form to reopen on somebody else's address list. */}
					<div className="srepacts">
						{w.step === "sched" ? (
							<>
								<button className="btn ghost" title={SREP_ACTS.back} onClick={() => go("detail")}>
									‹ Back
								</button>
								{/* Their List, and it opens their list screen rather than the
								    site's — one destination for both ways in, which is what
								    stops "List" meaning two different things a click apart.

								    The wizard is closed rather than covered: two of these
								    dialogs on screen at once share a backdrop and a z-index,
								    and whichever is on top is on top by accident. Nothing is
								    lost — the form lives in the store, and the menu behind
								    this reopens it still filled in. */}
								<button className="btn ghost" title={SREP_ACTS.list}
									onClick={() => { onClose(); openScheduleList(w.for); }}>
									▤ List
								</button>
								<Desk className="btn tpl" href={href} title={SREP_ACTS.create}>
									⏰ Create Schedule
								</Desk>
							</>
						) : (
							<button className="btn tpl" title={SREP_ACTS.next} onClick={() => go("sched")}>
								Next ›
							</button>
						)}
						{/* Close first, then empty — and that order is the whole of it.
						    `onClose` writes `{...s.srep, open: false}` off the snapshot
						    this render closed over, so emptying first would be undone by
						    the stale copy landing on top of it, and Cancel would reopen
						    holding the last person's address list. */}
						<button className="btn ghost"
							title="Closes the wizard and empties it. Nothing here has been sent anywhere."
							onClick={() => { onClose(); patch("srep", SREP_BLANK(w.for)); }}>
							Cancel
						</button>
					</div>
				</div>
			}
			onClose={onClose}
		/>
	);
}
