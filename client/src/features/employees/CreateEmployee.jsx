import { useState } from "react";

import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { load } from "@/api/load";
import { scoped, uniq } from "@/lib/scope";
import { NEW_EMP_BLANK, appLoginDefault, appLoginProblem, dobPassword, isBlank, makesAppLogin, managerChoices, missing, problemsOf } from "@/lib/newemp";
import { Desk } from "@/components/ui";
import OnMachine from "@/components/OnMachine";
import MachineNumber from "@/components/MachineNumber";
import { deskUrl } from "@/lib/desk";
import { createAppLogin, createEmployee } from "@/api/employee";
import { accessFor, lockedFields } from "@/lib/fieldaccess";
import { markCandidate, wizardFromCandidate } from "@/api/candidate";
import { DEFAULT_SHEET, GOOGLE_CLIENT_ID, JOINING_SHEET, readGoogleSheet } from "@/lib/googlesheet";
import { dateOrder, mapRow } from "@/lib/onboardimport";
import { giveNewJoinerLeave } from "@/api/monthlyleave";
import { todayIso } from "@/lib/format";
import { LEAVE_TYPE_NAME, policyTitle } from "@/lib/monthlyleave";
import { loadCandidates } from "@/api/load";
import { openEmployee } from "@/features/employees/openEmployee";
import HandOverAssets from "@/features/onboard/BoardingAssets";
import {
	ED_STATUSES, PUNCH_METHODS, NEW_EMP_COPIED, NEW_EMP_HINT, NEW_EMP_NOFIELD, NEW_EMP_STEPS, punchesOnApp,
} from "@/data/employees";

/* Factor HR's Create Employee, the wizard their Add New Employee opens.
   Screenshotted 2 September 2026: three circles across the top — Basic Details,
   Job Details, Job Organization — the first page's nine fields under them, and
   a single Next on the right.

   **Only the first page is a copy.** See NEW_EMP_STEPS for what that means and
   for what is under the other two headings instead. The page says it as well,
   under each of those two steps, because the whole value of a screen copy is
   that somebody can hold it against theirs and trust what matches.

   ## Why this is a form here rather than a link to the site

   Every other write on this dashboard opens the ERPNext desk, and this one used
   to as well — the button on Employee Master was a `Desk` link to a blank
   Employee. That is the right trade wherever the site's own form is the thing
   HR should be looking at. It is the wrong one here for two reasons that only
   apply to hiring:

   - The desk's Employee form is one flat page of about ninety fields, and the
     nine a new joiner actually arrives with are scattered down it. Factor HR
     asks nine questions; a straight swap costs whoever does this an afternoon
     of hunting.
   - Two of those nine are the ones this app exists to get right — **Emp Code**
     and **Machine Code** — and the desk will accept a duplicate machine code
     without a word. `clashes()` in lib/newemp.js will not, and it can only
     refuse a duplicate on a form it is standing in front of.

   What it does not do is decide anything. The record is created by the site,
   under the site's own validation, and the checks here are a courtesy in front
   of that rather than a substitute for it — CLAUDE.md §1. The write is made as
   the signed-in person: somebody whose roles do not let them create an Employee
   gets the site's own refusal, and the desk link beside Create is still there.

   ## The way out is one control

   Like Salary Revision, this takes the whole content area and the subtab strip
   goes with it (see `OFF_MENU` in routes/registry.jsx). Three steps of typing
   sit here with nothing behind them until Create writes, and a strip that
   changes page on one click above that is a way to lose a morning's work. So
   there is one labelled way back, and what is typed survives it — `newemp` is
   in the store rather than in this component for exactly that reason. */

/* ERPNext ships these rows in its `Gender` doctype and the site has not been
   read for others, so this offers them rather than asserting them: it is a
   datalist on a text box, not a select. A site that has added a row still
   accepts the word typed into it, and the link validation on the way in is what
   settles whether it exists. Refusing a real value here would be the expensive
   mistake — see CLAUDE.md §4. */
const GENDERS = ["Male", "Female", "Other", "Transgender", "Prefer not to say"];

/** What fills each select or datalist, as `[options, strict]`.

    `strict` is the whole distinction. A list read off the site — Company,
    Department, Designation, Shift Type, Holiday List — is complete, so it is a
    `<select>` and typing something else is a mistake worth stopping. A list
    *derived* from the employees already loaded is not complete: it holds the
    grades and branches in use, which is not the same as the grades and branches
    that exist. Those are datalists, which suggest without refusing.

    An option is a word, or `[value, label]` where the two differ. Only
    Reporting Manager needs the pair — it stores an Employee id and shows a
    name — and it is here rather than in a control of its own so that every
    field on the form is drawn by one function from one table. A second control
    is a second set of decisions about labels, spans and hints. */
function optionsFor(s, all, f) {
	/* Who this person could report to, scoped to the company being typed into
	   the form once there is one rather than to the top bar's filter: the
	   question follows the record being created, not whatever the header
	   happened to be showing when somebody clicked Add New Employee. */
	const managers = managerChoices(f.company ? s.employees.filter((e) => e.company === f.company) : all).list
		.map((e) => [e.name, e.employee_name + (e.designation ? ` · ${e.designation}` : "")]);

	return {
		salutation:      [uniq(all, "salutation"), false],
		gender:          [GENDERS, false],
		employment_type: [uniq(all, "employment_type"), false],
		grade:           [uniq(all, "grade"), false],
		branch:          [uniq(all, "branch"), false],
		status:          [ED_STATUSES, true],
		company:         [s.companies.map((c) => c.name), true],
		punch:           [PUNCH_METHODS, true],
		/* A disabled Department is one somebody closed. Offering it is offering
		   to put a new joiner into a department that no longer takes anybody. */
		department:      [s.departments.filter((d) => !d.disabled).map((d) => d.name), true],
		designation:     [s.designations.map((d) => d.name), true],
		shift:           [s.shiftTypes.map((x) => x.name), true],
		holiday:         [s.holidayLists.map((x) => x.name), true],
		reports_to:      [managers, true],
		/* Casual Leave is offered even on a site that has not got it yet —
		   giving it is what creates it (api/monthlyleave.js). */
		leavetype:       [uniq([{ n: LEAVE_TYPE_NAME }, ...s.leaveTypes.map((t) => ({ n: t.name }))], "n"), true],
		/* A location switched off is a gate that closed — see workLocations in
		   initialState.js, which is already filtered to the active ones. */
		worklocation:    [s.workLocations.map((x) => [x.name, x.location_name || x.name]), true],
	};
}

/** An option as `[value, label]`, however the list wrote it. */
const pair = (o) => (Array.isArray(o) ? o : [o, o]);

/** On the label of a box Settings → Security keeps this login from setting. */
const LOCKED_WHY = "Read only for this login — HR set it in Settings → Security. Whoever enrols this "
	+ "person fills it in, or HR does afterwards.";

/** One field, drawn from its row in the table and nothing else.

    Every control on all three steps comes through here — text, date, email,
    tel, a strict select, a suggesting datalist and a checkbox — because a form
    with two ways of drawing a field is a form where two fields end up a
    different height, and this one is a copy of somebody else's screen. */
function Field({ row, opts, value, onChange, readOnly }) {
	const [name, label, type, req, key, span] = row;
	const dead = NEW_EMP_NOFIELD[label];
	/* Settings → Security: shown, and not this login's to set. Drawn as the same
	   box, disabled, so the form keeps its shape and nobody wonders where it went. */
	const ro = Boolean(readOnly);
	/* On the label rather than under the box. These used to be a grey sentence
	   beneath every second field, which turned a form somebody fills in twice a
	   month into a page of reading — and the sentences people actually need are
	   the ones they go looking for, not the ones sitting there on every visit.
	   Hovering the label still gets them. */
	const why = dead || (ro ? LOCKED_WHY : "") || NEW_EMP_HINT[label] || undefined;
	const id = "ne-" + (name || label.toLowerCase().replace(/\W+/g, "-"));
	const [list, strict] = opts[key] || [[], false];
	const listId = key ? "nelist-" + key : undefined;

	return (
		/* Two decisions in this one element.

		   The span is the field's width in the 24-column grid, measured off Factor
		   HR's own screenshot for step 1 — see NEW_EMP_STEPS. It rides in as a
		   custom property rather than a class because the value is data: a class
		   per width would be a second table of the same numbers.

		   And it is a div wrapping a label, not a label wrapping everything.
		   Clicking anywhere in a <label> activates its control, and one of these
		   fields is a checkbox — so a label around the whole field turned mobile
		   punching on when somebody clicked the empty space beside the tick. The
		   label is the words above the box and nothing else. */
		<div className="lvf wizf" style={{ "--w": span || 8 }}>
			<label className="lab" htmlFor={id} title={why}>
				{label}
				{/* `wizreq`, not `req` — that one is the Approvals request row, and this
				    star inherited its grid and padding. See the stylesheet. */}
				{req ? <b className="wizreq" aria-hidden="true"> *</b> : null}
			</label>
			<span className="ctl">
				{dead ? (
					/* Drawn, disabled, and it says why. Their form has this control and
					   nothing here can store what goes in it; a box that silently
					   discards what is typed into it is the worse of the two. */
					<input id={id} type="text" disabled title={dead} placeholder="no field on this site" />
				) : type === "check" ? (
					/* Unchecked is stored as "" rather than 0, so an untouched box is
					   left out of the document entirely and the site applies its own
					   default. Sending 0 would be this form asserting an answer it was
					   never given. */
					<span className="onoff">
						<input id={id} type="checkbox" checked={value === 1} disabled={ro}
							onChange={(e) => onChange(e.target.checked ? 1 : "")} />
						<span>{value === 1 ? "Yes" : "No"}</span>
					</span>
				) : type === "select" && strict ? (
					<select id={id} required={Boolean(req)} value={value} disabled={ro}
						onChange={(e) => onChange(e.target.value)}>
						<option value="">—</option>
						{list.map(pair).map(([v, text]) => (
							<option key={v} value={v}>{text}</option>
						))}
					</select>
				) : type === "select" ? (
					<>
						<input id={id} type="text" list={listId} value={value} autoComplete="off" disabled={ro}
							required={Boolean(req)} onChange={(e) => onChange(e.target.value)} />
						<datalist id={listId}>
							{list.map(pair).map(([v]) => <option key={v} value={v} />)}
						</datalist>
					</>
				) : (
					<input id={id} type={type} value={value} required={Boolean(req)} disabled={ro}
						/* A negative notice period is not a shorter one. */
						min={type === "number" ? 0 : undefined}
						/* Half days are real leave; nothing else on this form is fractional. */
						step={name === "leaves_a_month" ? 0.5 : undefined}
						onChange={(e) => onChange(e.target.value)} />
				)}
			</span>
		</div>
	);
}

/* "Sync Google Form" — the joining Form's answers, read from its responses
   Sheet as whoever is signed in to Google (lib/googlesheet.js, the same read
   as Onboarding's), newest first. Picking one fills the boxes; nothing is
   written anywhere until Create, and what is already typed — the Emp Code,
   the Machine Code — is kept where the Form has no answer for it. */
function responsesOf(rows) {
	const order = dateOrder(rows);
	/* "Machine Number" is not one of the server's Onboarding fields — it is
	   what Share form fills in, read here only to find the person again. */
	/* Gender and Title too (2 November 2026): asked on the joining Form for
	   the Employee, not for Employee Onboarding, so read here the same way. */
	const ans = (r, q) => String(r[q] || "").trim();
	return rows.map((r) => ({
		...mapRow(r, order),
		machine_number: ans(r, "Machine Number"),
		gender: ans(r, "Gender"),
		salutation: ans(r, "Title"),
		custom_pan_no: ans(r, "PAN Number").toUpperCase(),
	}))
		.filter((d) => d.employee_name)
		.reverse();
}

/** A Sheet row, in the site's field names, as the candidate the wizard is filled from. */
function candidateOf(d) {
	const c = {};
	for (const [k, v] of Object.entries(d)) c[k.replace(/^custom_/, "")] = v;
	return c;
}

function FormSync({ f, extra }) {
	const [st, setSt] = useState({ busy: false, rows: null, err: "", q: "" });
	async function read() {
		setSt({ busy: true, rows: null, err: "", q: "" });
		try {
			/* The joining Form's Sheet, then the older onboarding one. Either can
			   be closed to whoever is signed in to Google; one that can be read
			   is enough, and both refusing is the error shown. */
			const got = await Promise.allSettled([readGoogleSheet(JOINING_SHEET), readGoogleSheet(DEFAULT_SHEET)]);
			const ok = got.filter((x) => x.status === "fulfilled");
			if (!ok.length) throw got[0].reason;
			const rows = ok.flatMap((x) => responsesOf(x.value));
			/* The person this form is for, found without a search: by the Machine
			   Code Share form put in their link, else by first name. One answer
			   by machine number is theirs; anything else is shown to choose from. */
			const pin = String(f.attendance_device_id || "").trim();
			const byPin = pin ? rows.filter((d) => String(d.machine_number || "").trim() === pin) : [];
			if (byPin.length === 1) return pick(byPin[0]);
			setSt({ busy: false, rows: byPin.length ? byPin : rows, err: "", q: byPin.length ? "" : String(f.first_name || "") });
		} catch (e) {
			setSt({ busy: false, rows: null, err: e.message || String(e), q: "" });
		}
	}
	function pick(d) {
		const w = wizardFromCandidate(candidateOf(d));
		/* Only an answer, never a blank over what HR already chose. */
		const own = Object.fromEntries([["gender", d.gender], ["salutation", d.salutation],
			["custom_pan_no", d.custom_pan_no]].filter(([, v]) => v));
		/* A question the Form does not ask — Company, Department and Designation
		   since 2 November 2026 — comes back empty, and must not wipe what New on
		   the machine or HR already put in the box. An answer, never a blank. */
		const answered = Object.fromEntries(Object.entries(w.f).filter(([, v]) => v != null && String(v).trim() !== ""));
		patch("newemp", { f: { ...f, ...answered, ...own }, extra: { ...(extra || {}), ...w.extra }, err: "" });
		setSt({ busy: false, rows: null, err: "", q: "" });
	}
	const q = st.q.trim().toLowerCase();
	const shown = (st.rows || []).filter((d) => !q
		|| [d.employee_name, d.custom_cell_number, d.custom_personal_email].some((x) => String(x || "").toLowerCase().includes(q)));
	return (
		<>
			<button className="embtn" onClick={st.rows ? () => setSt({ ...st, rows: null }) : read}
				disabled={st.busy || !GOOGLE_CLIENT_ID}
				title={GOOGLE_CLIENT_ID
					? "Fill this form from a joining Google Form response. Signs in to Google to read the responses Sheet; nothing is created until Create."
					: "No Google client id is set (VITE_GOOGLE_CLIENT_ID), so the Form's Sheet cannot be read."}>
				{st.busy ? "Reading the Form…" : st.rows ? "Close the list" : "Sync Google Form"}
			</button>
			{st.err && <div className="formsync"><span className="err">{st.err}</span></div>}
			{st.rows && (
				<div className="formsync">
					<input type="search" placeholder="Search name, mobile or email" value={st.q} autoFocus
						onChange={(e) => setSt({ ...st, q: e.target.value })} />
					{shown.length ? (
						<ul>
							{shown.slice(0, 50).map((d, i) => (
								<li key={i}>
									<button onClick={() => pick(d)}>
										<b>{d.employee_name}</b>
										<span className="muted">
											{[d.custom_cell_number, d.designation, d.department, d.custom_form_timestamp?.slice(0, 10)].filter(Boolean).join(" · ")}
										</span>
									</button>
								</li>
							))}
						</ul>
					) : <p className="muted">{st.rows.length ? "No response matches." : "The Form has no responses yet."}</p>}
				</div>
			)}
		</>
	);
}

export default function CreateEmployee() {
	const s = useApp();
	const { step, f, busy, done, err, from, fromName, extra, marked, leave: gave, app } = s.newemp;
	/* The app login and password are this page's own and never `f`: see
	   lib/newemp.js. Kept here, not in the store, so a password is never in
	   anything that outlives the page. The login follows the email boxes until
	   somebody types over it. */
	const [loginDraft, setLoginDraft] = useState({ email: "", password: "", typed: false });
	/* No password typed is the date of birth, DDMMYYYY — the first password HR
	   gives everybody, which the phone app makes them change (dobPassword). */
	const byBirth = !loginDraft.password && Boolean(dobPassword(f.date_of_birth));
	const login = { email: loginDraft.typed ? loginDraft.email : appLoginDefault(f),
		password: loginDraft.password || dobPassword(f.date_of_birth), byBirth };
	const loginProblem = appLoginProblem(f, login);
	const all = scoped(s);
	const opts = optionsFor(s, all, f);
	const { gaps, bad } = problemsOf(f, s.employees, s.leaveTypes);

	const here = NEW_EMP_STEPS[step];
	const last = step === NEW_EMP_STEPS.length - 1;
	const gapsHere = missing(step, f);
	/** "write", "read" or "hidden" for one row — lib/fieldaccess.js. */
	const access = (row) => (row[0] ? accessFor(s.fieldAccess, "new", row[0], s.user) : "write");
	const setF = (k, v) => patch("newemp", { f: { ...f, [k]: v }, err: "" });
	const goStep = (i) =>
		patch("newemp", { step: Math.max(0, Math.min(NEW_EMP_STEPS.length - 1, i)) });

	const blank = isBlank(f);
	const reset = () => { set({ newemp: NEW_EMP_BLANK() }); setLoginDraft({ email: "", password: "", typed: false }); };
	const leave = () => go({ section: "employees", subtab: "overview" });

	async function create() {
		patch("newemp", { busy: "creating", err: "", done: null });
		try {
			const doc = await createEmployee(f, extra, lockedFields(s.fieldAccess, s.user, "new"));
			/* Filled from an onboarding candidate: say so on the candidate, after
			   the Employee exists and never before — api/candidate.js says why
			   that order. A refused mark is reported, not hidden: the person
			   exists and the queue does not know it yet. */
			let mark = null;
			if (from && doc?.name) {
				const r = await markCandidate(from, doc.name);
				mark = r.ok ? "ok" : r.error || "refused";
				void loadCandidates(true);
			}
			/* The leave after the Employee, because the assignment names the
			   Employee — and never throws, because by here the person exists and
			   a refusal is a sentence on the done screen, not a lost hire. 0 is
			   an answer that writes nothing. */
			const perMonth = Number(f.leaves_a_month);
			let leave = { none: true };
			if (doc?.name && perMonth > 0) {
				patch("newemp", { busy: "giving leave" });
				leave = await giveNewJoinerLeave(doc, perMonth, todayIso(), f.leave_type || LEAVE_TYPE_NAME);
			}
			/* The app login last, for the same reason as the leave: the person
			   exists, so a refusal is said rather than thrown. */
			let appLogin = null;
			if (doc?.name && makesAppLogin(f, login)) {
				patch("newemp", { busy: "making the app login" });
				appLogin = { ...(await createAppLogin(doc, login)), byBirth: login.byBirth };
				setLoginDraft((d) => ({ ...d, password: "" }));
			}
			patch("newemp", {
				busy: "", done: doc, marked: mark, app: appLogin,
				leave: { ...leave, perMonth, type: f.leave_type || LEAVE_TYPE_NAME },
			});
			/* The directory behind this page is a list read at startup, and the
			   person just hired is not in it. Re-read rather than splice one row in:
			   the site names the record, fills the naming series and may have
			   defaulted fields this form never asked about, so what it stored is the
			   only version worth showing. */
			void load();
		} catch (e) {
			patch("newemp", { busy: "", err: e.message || String(e) });
		}
	}

	const back = (
		<button className="embtn" onClick={leave}>
			<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
				strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M15 5l-7 7 7 7" />
			</svg>
			Employee Master
		</button>
	);

	/* ------------------------------------------------------------ created */
	if (done) {
		const id = done.name || "";
		return (
			<div className="srform">
				<div className="srback">{back}</div>
				<div className="wizdone">
					<b>{done.employee_name || "Employee"} is on the site.</b>
					<span className="mono">{id}</span>
					{from ? (
						<p>
							{marked === "ok"
								? <>Onboarding candidate <b>{fromName}</b> is marked Completed and linked to this record.</>
								: <>Created, but onboarding candidate <b>{fromName}</b> could not be marked as taken —
									{" "}{marked}. Creating them again from Onboarding would make a second record.</>}
						</p>
					) : null}
					<p>
						Created as <b>{done.status || "Active"}</b>
						{done.company ? <> in <b>{done.company}</b></> : null}.
					</p>
					{gave ? (
						<p>
							{gave.none
								? <>No {gave.type} given — 0 a month was asked for.</>
								: gave.ok
									? <>{gave.type}: <b>{gave.perMonth} a month</b>, credited from <b>{gave.from}</b> and
										carried forward when not taken.</>
									: <>Created, but the {gave.perMonth} a month {gave.type} was not given —
										{" "}{gave.error}. Give it on the site as a Leave Policy Assignment on
										{" "}<b>{policyTitle(gave.perMonth, gave.type)}</b> — Give monthly leave on Apply Leave
										gives 1 Casual Leave a month, whatever was asked for here.</>}
						</p>
					) : null}
					{done.custom_punch_method ? (
						<p>
							Punches on <b>{done.custom_punch_method}</b>.
							{done.custom_punch_method !== "Mobile App" && done.attendance_device_id
								? <> Enrol finger number <b>{done.attendance_device_id}</b> on the machine.</> : null}
							{done.custom_punch_method !== "Fingerprint Machine" ? (
								app?.ok
									? <> App login <b>{app.login}</b> {app.existed ? "was already on the site and is now linked — its password was not changed" : <>is made and linked — they sign in with Emp Code <b>{done.employee_number || "—"}</b>{app.byBirth ? " and their date of birth (DDMMYYYY), and choose a new password the first time" : ""}</>}.</>
									: app
										? <> The app login <b>{app.login}</b> was not made: {app.error}</>
										: <> No app login was made: no app password was typed.</>
							) : null}
						</p>
					) : null}
					{done.custom_punch_method !== "Mobile App" && done.attendance_device_id
						? <OnMachine number={done.attendance_device_id} employee={id}
							employeeName={done.employee_name} /> : null}

					{/* The things that go out with a new joiner, handed over while
					    the person is on screen — each one an Asset Assignment, so the
					    site's handover rules run on every row. */}
					{id ? <HandOverAssets employee={id} employeeName={done.employee_name}
						company={done.company} /> : null}

					{/* What this form did not ask for and hrms needs before the record
					    does anything. Named rather than implied — a new Employee with
					    none of it looks finished and is not. */}
					<div className="wizacts">
						{id ? (
							<button className="btn tpl" onClick={() => openEmployee(id)}
								title="Open this person's Employee Profile, where a photograph and document scans can be attached.">
								Add photo &amp; documents
							</button>
						) : null}
						<Desk className="btn ghost" href={s.site && id && deskUrl(s.site, "Employee", id)}
							title="Open the record that was just created, on the ERPNext site."
							dead={id ? undefined : "The site answered without a record id."}>
							Open on the site
						</Desk>
						<button className="btn ghost" onClick={reset}>Add another</button>
						<button className="btn ghost" onClick={() => { reset(); leave(); }}>
							Employee Master
						</button>
					</div>
				</div>
			</div>
		);
	}

	/* ------------------------------------------------------------- form */
	return (
		<div className="srform">
			{/* The way back, and the only one — the subtab strip is gone while this
			    page is up. It says what leaving costs, which here is nothing: the
			    typing is in the store and survives it. */}
			<div className="srback">
				{back}
				<span className="muted">
					{from ? <>Filled from onboarding candidate <b>{fromName}</b> — check each step, then add the Emp Code and Machine Code · </> : null}
					Create Employee · step {step + 1} of {NEW_EMP_STEPS.length}
					{blank ? "" : " · typed here, nothing created yet — it keeps if you leave"}
				</span>
				<span className="ml-auto" />
				<FormSync f={f} extra={extra} />
				{!blank && (
					<button className="embtn" onClick={reset}
						title="Empty every step of the form. Nothing has been written to the site, so there is nothing there to undo — and nothing here to get back either.">
						Clear the form
					</button>
				)}
			</div>

			<div className="wiz">
				<header className="wizbar">
					<h2>Create Employee</h2>
				</header>

				{/* Their stepper. The circles are buttons: a step already reached can be
				    gone back to, which is what somebody does on realising at step three
				    that they mistyped a code at step one. Forward is not offered past a
				    step with a required field still empty — the same rule Next follows,
				    so the two cannot disagree about where you are allowed to be. */}
				<ol className="wizsteps">
					{NEW_EMP_STEPS.map((st, i) => {
						const ok = i < step && !missing(i, f).length;
						const reachable = i <= step
							|| !NEW_EMP_STEPS.slice(0, i).some((_, j) => missing(j, f).length);
						return (
							<li key={st[0]} className={i === step ? "on" : ok ? "ok" : ""}>
								<button className="wizdot" disabled={!reachable}
									aria-current={i === step ? "step" : undefined}
									title={reachable ? `Go to ${st[1]}` : `Finish ${here[1]} first`}
									onClick={() => goStep(i)}>
									<span aria-hidden="true">{ok ? "✓" : i + 1}</span>
									{/* The circle shows a number; what it means is the label beside
									    it, which is a separate element and would be read as one. */}
									<span className="sr-only">{st[1]}</span>
								</button>
								<span className="wizlab">{st[1]}</span>
							</li>
						);
					})}
				</ol>

				<div className="wizbody">
					<h3 className="fhtitle">{here[1]}</h3>

					{/* One grid per group rather than one for the step, so a group that
					    does not fill its last row cannot pull the next group's first
					    field up beside it. Step 1 has a single group with no heading,
					    which is their screenshot — the step title is the heading there. */}
					{here[2].map(([heading, all]) => [heading, all.filter((r) => access(r) !== "hidden")])
						.filter(([, rows]) => rows.length).map(([heading, rows]) => (
						<section className="wizgroup" key={heading || here[0]}>
							{heading ? <h4>{heading}</h4> : null}
							<div className="wizform">
								{rows.map((row) => (
									<Field key={row[1]} row={row} opts={opts}
										value={row[0] ? (f[row[0]] ?? "") : ""}
										readOnly={access(row) === "read"}
										onChange={(v) => setF(row[0], v)} />
								))}
							</div>
							{/* Under the group holding Machine Code, and only when this person
							    punches on a machine. The number is the one field on this form
							    that can be wrong in a way nobody sees: free here and already
							    somebody's at the gate. */}
							{rows.some((r) => r[0] === "custom_punch_method") && punchesOnApp(f.custom_punch_method) ? (
								<div className="wizform wizlogin">
									<div className="lvf wizf" style={{ "--w": 8 }}>
										<label className="lab" htmlFor="ne-app-login">App login</label>
										<span className="ctl">
											<input id="ne-app-login" type="email" autoComplete="off" value={login.email}
												onChange={(e) => setLoginDraft({ ...loginDraft, email: e.target.value, typed: true })} />
										</span>
									</div>
									<div className="lvf wizf" style={{ "--w": 8 }}>
										<label className="lab" htmlFor="ne-app-password">App password</label>
										<span className="ctl">
											<input id="ne-app-password" type="password" autoComplete="new-password" value={loginDraft.password}
												placeholder="Date of birth, DDMMYYYY"
												onChange={(e) => setLoginDraft({ ...loginDraft, password: e.target.value })} />
										</span>
									</div>
									<p className="wizmgr muted wizlognote">
										They sign in to the phone app with their Emp Code
										{f.employee_number ? <> <b>{f.employee_number}</b></> : null} and, unless you type a
										password, their date of birth as DDMMYYYY. The app makes them choose their own
										password the first time.
									</p>
								</div>
							) : null}
							{/* Under Reporting Manager: when the company has nobody ticked
							    as a Manager yet, the list is everybody, and says so. */}
							{rows.some((r) => r[0] === "reports_to") && f.company
								&& !managerChoices(s.employees.filter((e) => e.company === f.company)).tagged ? (
								<p className="wizmgr muted">
									Nobody in {f.company} is tagged as a Manager yet, so Reporting Manager lists
									everybody. Tick Manager on someone's Employee Profile, or below when creating
									a manager.
								</p>
							) : null}
							{rows.some((r) => r[0] === "attendance_device_id") && f.custom_punch_method !== "Mobile App" ? (
								<MachineNumber value={f.attendance_device_id} employees={all}
									name={[f.first_name, f.middle_name, f.last_name].filter(Boolean).join(" ")}
									onPick={(n) => setF("attendance_device_id", n)} />
							) : null}
						</section>
					))}

					{/* Said on the step it is about rather than once at the top, because
					    the two steps it is about are the two nobody sees until they get
					    there. */}

					{bad.length > 0 || loginProblem ? (
						<div className="gap">
							<b>Check this before creating.</b>
							<ul className="wizlist">{bad.concat(loginProblem ? [loginProblem] : []).map((m) => <li key={m}>{m}</li>)}</ul>
						</div>
					) : null}

					{err && (
						<div className="gap">
							<b>The site refused it.</b>
							{/* Verbatim, and wrapped rather than trimmed. A Frappe traceback
							    names the field it choked on, and that name is the whole answer
							    — a tidied-up "could not save" is a second trip to the site to
							    find out the same thing. */}
							<pre className="wizerr">{err}</pre>
						</div>
					)}
				</div>

				<footer className="wizacts">
					{step > 0 && (
						<button className="btn ghost" onClick={() => goStep(step - 1)}>‹ Back</button>
					)}
					<span className="wizgrow">
						{gapsHere.length > 0 && (
							<span className="muted">Still needed here: <b>{gapsHere.join(", ")}</b></span>
						)}
					</span>
					{last ? (
						<>
							{/* Kept beside Create rather than replaced by it. The desk form is
							    the one place the other eighty fields live, and somebody
							    entering a record that needs one of them should not have to
							    finish this wizard to get there. */}
							<Desk className="btn ghost" href={s.site && deskUrl(s.site, "Employee", "new")}
								title="Open a blank Employee on the ERPNext site instead — every field it has, none of them filled in from here.">
								Use the site&rsquo;s form
							</Desk>
							<button className="btn tpl"
								disabled={Boolean(busy) || gaps.length > 0 || bad.length > 0 || Boolean(loginProblem)}
								title={gaps.length
									? `Still needed: ${gaps.join(", ")}`
									: bad.length
										? "Fix what is listed above first."
										: "Create this Employee on the site, as you and under your own ERPNext roles."}
								onClick={() => void create()}>
								{busy === "giving leave" ? "Giving leave…" : busy === "making the app login" ? "Making the app login…" : busy ? "Creating…" : "Create Employee"}
							</button>
						</>
					) : (
						<button className="btn tpl" disabled={gapsHere.length > 0}
							title={gapsHere.length ? `Still needed: ${gapsHere.join(", ")}` : "Next step"}
							onClick={() => goStep(step + 1)}>
							Next ›
						</button>
					)}
				</footer>
			</div>
		</div>
	);
}
