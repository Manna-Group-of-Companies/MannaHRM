import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { load } from "@/api/load";
import { scoped, uniq } from "@/lib/scope";
import { NEW_EMP_BLANK, isBlank, missing, problemsOf } from "@/lib/newemp";
import { Desk } from "@/components/ui";
import { deskUrl } from "@/lib/desk";
import { createEmployee } from "@/api/employee";
import {
	ED_STATUSES, NEW_EMP_COPIED, NEW_EMP_HINT, NEW_EMP_NOFIELD, NEW_EMP_STEPS,
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
   of that rather than a substitute for it — CLAUDE.md §1. The write needs the
   proxy started with `ERP_WRITE=1`; without it the site answers the refusal and
   the desk link beside Create is still there.

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
	const managers = (f.company ? s.employees.filter((e) => e.company === f.company) : all)
		.filter((e) => e.status === "Active")
		.map((e) => [e.name, e.employee_name + (e.designation ? ` · ${e.designation}` : "")]);

	return {
		salutation:      [uniq(all, "salutation"), false],
		gender:          [GENDERS, false],
		employment_type: [uniq(all, "employment_type"), false],
		grade:           [uniq(all, "grade"), false],
		branch:          [uniq(all, "branch"), false],
		status:          [ED_STATUSES, true],
		company:         [s.companies.map((c) => c.name), true],
		/* A disabled Department is one somebody closed. Offering it is offering
		   to put a new joiner into a department that no longer takes anybody. */
		department:      [s.departments.filter((d) => !d.disabled).map((d) => d.name), true],
		designation:     [s.designations.map((d) => d.name), true],
		shift:           [s.shiftTypes.map((x) => x.name), true],
		holiday:         [s.holidayLists.map((x) => x.name), true],
		reports_to:      [managers, true],
	};
}

/** An option as `[value, label]`, however the list wrote it. */
const pair = (o) => (Array.isArray(o) ? o : [o, o]);

/** One field, drawn from its row in the table and nothing else.

    Every control on all three steps comes through here — text, date, email,
    tel, a strict select, a suggesting datalist and a checkbox — because a form
    with two ways of drawing a field is a form where two fields end up a
    different height, and this one is a copy of somebody else's screen. */
function Field({ row, opts, value, onChange }) {
	const [name, label, type, req, key, span] = row;
	const dead = NEW_EMP_NOFIELD[label];
	/* On the label rather than under the box. These used to be a grey sentence
	   beneath every second field, which turned a form somebody fills in twice a
	   month into a page of reading — and the sentences people actually need are
	   the ones they go looking for, not the ones sitting there on every visit.
	   Hovering the label still gets them. */
	const why = dead || NEW_EMP_HINT[label] || undefined;
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
						<input id={id} type="checkbox" checked={value === 1}
							onChange={(e) => onChange(e.target.checked ? 1 : "")} />
						<span>{value === 1 ? "Yes" : "No"}</span>
					</span>
				) : type === "select" && strict ? (
					<select id={id} required={Boolean(req)} value={value}
						onChange={(e) => onChange(e.target.value)}>
						<option value="">—</option>
						{list.map(pair).map(([v, text]) => (
							<option key={v} value={v}>{text}</option>
						))}
					</select>
				) : type === "select" ? (
					<>
						<input id={id} type="text" list={listId} value={value} autoComplete="off"
							required={Boolean(req)} onChange={(e) => onChange(e.target.value)} />
						<datalist id={listId}>
							{list.map(pair).map(([v]) => <option key={v} value={v} />)}
						</datalist>
					</>
				) : (
					<input id={id} type={type} value={value} required={Boolean(req)}
						/* A negative notice period is not a shorter one. */
						min={type === "number" ? 0 : undefined}
						onChange={(e) => onChange(e.target.value)} />
				)}
			</span>
		</div>
	);
}

export default function CreateEmployee() {
	const s = useApp();
	const { step, f, busy, done, err } = s.newemp;
	const all = scoped(s);
	const opts = optionsFor(s, all, f);
	const { gaps, bad } = problemsOf(f, s.employees);

	const here = NEW_EMP_STEPS[step];
	const last = step === NEW_EMP_STEPS.length - 1;
	const gapsHere = missing(step, f);
	const setF = (k, v) => patch("newemp", { f: { ...f, [k]: v }, err: "" });
	const goStep = (i) =>
		patch("newemp", { step: Math.max(0, Math.min(NEW_EMP_STEPS.length - 1, i)) });

	const blank = isBlank(f);
	const reset = () => set({ newemp: NEW_EMP_BLANK() });
	const leave = () => go({ section: "employees", subtab: "overview" });

	async function create() {
		patch("newemp", { busy: "creating", err: "", done: null });
		try {
			const doc = await createEmployee(f);
			patch("newemp", { busy: "", done: doc });
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
					<p>
						Created as <b>{done.status || "Active"}</b>
						{done.company ? <> in <b>{done.company}</b></> : null}. The directory is being
						re-read, so they appear in Employee Master in a moment.
					</p>
					{/* What this form did not ask for and hrms needs before the record
					    does anything. Named rather than implied — a new Employee with
					    none of it looks finished and is not. */}
					<div className="wizacts">
						<Desk className="btn tpl" href={s.site && id && deskUrl(s.site, "Employee", id)}
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
					Create Employee · step {step + 1} of {NEW_EMP_STEPS.length}
					{blank ? "" : " · typed here, nothing created yet — it keeps if you leave"}
				</span>
				{!blank && (
					<button className="embtn ml-auto" onClick={reset}
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
					{here[2].map(([heading, rows]) => (
						<section className="wizgroup" key={heading || here[0]}>
							{heading ? <h4>{heading}</h4> : null}
							<div className="wizform">
								{rows.map((row) => (
									<Field key={row[1]} row={row} opts={opts}
										value={row[0] ? (f[row[0]] ?? "") : ""}
										onChange={(v) => setF(row[0], v)} />
								))}
							</div>
						</section>
					))}

					{/* Said on the step it is about rather than once at the top, because
					    the two steps it is about are the two nobody sees until they get
					    there. */}

					{bad.length > 0 && (
						<div className="gap">
							<b>Check this before creating.</b>
							<ul className="wizlist">{bad.map((m) => <li key={m}>{m}</li>)}</ul>
						</div>
					)}

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
								disabled={Boolean(busy) || gaps.length > 0 || bad.length > 0}
								title={gaps.length
									? `Still needed: ${gaps.join(", ")}`
									: bad.length
										? "Fix what is listed above first."
										: "Create this Employee on the site. Needs the proxy started with ERP_WRITE=1."}
								onClick={() => void create()}>
								{busy ? "Creating…" : "Create Employee"}
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
