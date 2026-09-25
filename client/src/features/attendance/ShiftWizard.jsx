import { useEffect } from "react";

import { getState, patch, set, useApp } from "@/store";
import { Modal } from "@/components/ui";
import { getDoc } from "@/api/client";
import { saveShiftType } from "@/api/shifttype";
import {
	SHW_BLANK, SHW_GRACE, SHW_GRACE_MODES, SHW_KINDS, SHW_STEPS, SHW_TIMING, toInput,
} from "@/data/shiftwizard";

/* ---------------------------------------------------------------------------
   **The shift wizard**, behind the + and the ✎ of SHIFT & WORK PATTERN.
   Photographed 4 September 2026 and drawn step for step.

   The argument for every control is in data/shiftwizard.js, where the tables
   are. What is here is the four things a component decides: how each step is
   laid out, what Next will not let past, what the site is asked for when the
   dialog opens, and whether Save creates or changes.

   ## Their chrome, not the other wizard's

   No numbered stepper. Theirs says `CURRENT SELECTION : TIME BASED` across the
   top of steps 2 and 3 and gives you Previous / Next / Cancel, and that is what
   is drawn — the Schedule Report wizard's numbered strip is on that dialog and
   copying it here would be inventing a screen.

   ## It reads before it draws

   Opened from a row, the dialog asks for that document as it opens, and the
   answer decides whether the boxes are seeded from what the site holds and
   whether Save changes it or creates it. Opened from the +, there is nothing to
   read: it is a new shift, on the opening values in data/shiftwizard.js.
   --------------------------------------------------------------------------- */

/** Read the Shift Type this row names, if the site has one.

    `getDoc` answers null for anything it could not read — a shift that is not
    here and a site that is not answering come back the same, so the dialog says
    "no Shift Type of that name on this site", which is true either way and is
    the thing that decides what Save can do. */
async function loadShift(name) {
	patch("shw", { state: "loading", err: "" });
	const doc = await getDoc("Shift Type", name);
	if (!doc) return patch("shw", { state: "done", ours: false });

	const f = getState().shw.f;
	patch("shw", {
		state: "done",
		ours: true,
		doc,
		/* Seeded from the site, and only for the fields the site actually holds —
		   the rest keep Factor HR's own opening values, because a blank is not
		   what their form shows and an invented number would be worse. */
		f: {
			...f,
			/* The shift's own company, never the top bar's: a shift made before
			   the field existed is blank, and saying so is the truth about it. */
			company: doc.custom_company || "",
			start: toInput(doc.start_time) || f.start,
			end: toInput(doc.end_time) || f.end,
			early: String(doc.begin_check_in_before_shift_start_time ?? f.early),
			late: String(doc.allow_check_out_after_shift_end_time ?? f.late),
			gstart: String(doc.late_entry_grace_period ?? f.gstart),
			gend: String(doc.early_exit_grace_period ?? f.gend),
		},
	});
}

/** Open the wizard for one row of the shift list, or blank for a new shift when
    no name is given. Exported so the +, the ✎ and anything else that ever opens
    it share the one definition of "open" — including the read, which is the
    half a caller would forget. */
export function openShiftWizard(name = "") {
	const blank = SHW_BLANK(name);
	/* A new shift opens on the company the top bar is set to — the one a
	   company-locked login is always on — and on nothing under "All". */
	if (!name) blank.f.company = getState().company || "";
	set({ shw: { ...blank, open: true } });
}

/** Save, and what the dialog does with the answer. The form stays open and
    filled on a refusal — a form that emptied itself on a refusal would cost
    somebody their typing — and closes on success, onto a list that has been
    read back from the site. */
async function save() {
	const w = getState().shw;
	if (w.busy) return;
	patch("shw", { busy: true, msg: "", bad: false });
	try {
		const r = await saveShiftType(w);
		set({ shw: SHW_BLANK() });
		return r;
	} catch (e) {
		patch("shw", { busy: false, bad: true, msg: String(e?.message || e) });
		return null;
	}
}

/** One labelled row. Their layout puts the label to the left of the control,
    upper-case and small, which is `.shwgrid`. */
function Row({ row, children }) {
	const off = row.state === "build";
	return (
		<>
			<label className={off ? "off" : undefined} htmlFor={"shw_" + row.key} title={row.why}>
				{row.label}
			</label>
			<span className="ctl">
				{children}
				{off ? <span className="hint" title={row.why}>no field on the site</span> : null}
				{row.blurb ? <span className="blurb">{row.blurb}</span> : null}
			</span>
		</>
	);
}

export default function ShiftWizard({ onClose }) {
	const s = useApp();
	const w = s.shw;
	const f = w.f;
	const setF = (part) => patch("shw", { f: { ...f, ...part }, msg: "", bad: false });

	/* The read runs as the dialog opens, once. It is what decides which hand-off
	   Save can make, so it is not optional and not deferred to Save — somebody
	   should know which of the two they are about to do while they are still
	   filling the form. */
	useEffect(() => {
		if (getState().shw.open && getState().shw.row) void loadShift(getState().shw.row);
	}, [w.open, w.row]);

	const kind = SHW_KINDS.find((k) => k.key === f.kind) || SHW_KINDS[0];
	const at = SHW_STEPS.findIndex(([k]) => k === w.step);
	/* New is the +, which opens with no row. A row whose read came back empty
	   also creates on Save, and says so, but it is not "new" to the title. */
	const fresh = !w.row;
	const named = Boolean(f.name.trim());
	/* Asked for on a new shift wherever the site can hold the answer. Not on an
	   existing one: every shift made before the field existed is blank, and
	   refusing to save its grace until somebody picks a company for it would be
	   a change nobody asked for. */
	const coField = s.shiftCo !== false;
	const needCo = coField && w.ours !== true && !f.company;
	/** Why Save and Next would refuse, or "" — the one definition of both. */
	const missing = !named
		? "A shift needs a name before the rest of it means anything — Shift Type is named by what "
			+ "is typed here, not by a series."
		: needCo ? "Which company is this shift for? Pick one before going on." : "";

	/** What the site has nowhere to put, gathered once and shown before
	    anything opens. Not silently dropped, and not written into a field that
	    would make it look honoured. */
	const dropped = [
		!coField && f.company && `COMPANY (${f.company}) — this site's Shift Type has no company field `
			+ "yet; `python tools/create_custom_fields.py \"Shift Type\" --apply` adds it",
		f.isdefault && "IS DEFAULT — no such field on Shift Type; their own list shows it blank on "
			+ "every row of the tenant this page was photographed from",
		kind.state !== "live" && `${kind.label} — ${kind.why}`,
		f.hasbreak && SHW_TIMING[0].why,
		f.gmode === "cat" && SHW_GRACE_MODES[1].why,
	].filter(Boolean);

	function go(k) {
		const i = SHW_STEPS.findIndex(([x]) => x === k);
		/* Forward past step 1 needs a name, because the document is named by it —
		   `Shift Type` is prompt-named on this site, so a blank here is a document
		   that cannot be created rather than one named later. */
		if (i > 0 && missing) return patch("shw", { msg: missing, bad: true });
		patch("shw", { step: k, msg: "", bad: false });
	}

	const overnight = f.end <= f.start ? (
		/* Allowed, and said. An overnight shift is a real thing and their form
		   does not stop you either; a form that silently accepted it would be
		   the problem. */
		<div className="note">
			This shift ends at or before it starts, which the site reads as running <b>overnight</b> —
			{" "}{f.start} to {f.end} the next day. Allowed here because it is allowed there; said
			because a typo and a night shift look identical in two boxes.
		</div>
	) : null;

	const stepKind = (
		<>
			{/* Who it is for and when it runs, first and together, so a plain day
			    shift is one screen and a Save. The later steps are tolerances and
			    grace, which open on working values. */}
			<div className="shwgrid">
				<label htmlFor="shw_company"
					title="The company this shift is for — Shift Type's Company field, a Custom Field of ours.">
					Company
				</label>
				<span className="ctl">
					<select id="shw_company" value={f.company}
						onChange={(e) => setF({ company: e.target.value })}>
						<option value="">{w.ours === true ? "— any company —" : "— select company —"}</option>
						{s.companies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
					</select>
					{!coField ? <span className="hint">no field on the site yet</span> : null}
				</span>
				{SHW_TIMING.filter((r) => r.kind === "time").map((r) => (
					<Row key={r.key} row={r}>
						<input id={"shw_" + r.key} type="time" value={f[r.key]}
							onChange={(e) => setF({ [r.key]: e.target.value })} />
					</Row>
				))}
			</div>
			{overnight}

			<div className="shwhead">
				<div className="shwname">
					<label htmlFor="shw_name">Name</label>
					{/* Locked on a shift the site holds: the name is its id, and
					    changing it is Frappe's rename, not a save. */}
					<input id="shw_name" value={f.name} readOnly={w.ours === true}
						title={w.ours === true
							? "The name is this shift's id. Renaming it is done on the ERPNext site, where every assignment that names it is renamed with it."
							: "Shift Type is named by exactly what is typed here."}
						onChange={(e) => setF({ name: e.target.value })} />
				</div>
				{/* Their tick, top right. It has no field, and their own list shows the
				    column blank on every row — so it is drawn where they draw it and
				    answered on the panel below rather than quietly ignored. */}
				<label className="schoff" title={dropped[0] || "No such field on ERPNext's Shift Type."}>
					<input type="checkbox" checked={f.isdefault}
						onChange={(e) => setF({ isdefault: e.target.checked })} />
					Is Default
				</label>
			</div>

			{/* Factor HR's four kinds of shift are not drawn: ERPNext has one kind,
			    Time Based, and the other three had nowhere to land — offering them
			    was a choice that changed nothing. `f.kind` stays "time". The
			    reasoning for each is kept in SHW_KINDS, data/shiftwizard.js. */}
		</>
	);

	const stepTiming = (
		<>
			<label className="schoff" title={SHW_TIMING[0].why}>
				<input type="checkbox" checked={f.hasbreak}
					onChange={(e) => setF({ hasbreak: e.target.checked })} />
				This shift contains break
			</label>
			<p className="blurb">{SHW_TIMING[0].blurb}</p>

			<div className="shwgrid">
				{/* Start and end are on the first step, beside the name. */}
				{SHW_TIMING.filter((r) => r.kind === "mins").map((r) => (
					<Row key={r.key} row={r}>
						<input id={"shw_" + r.key} type="number" min={0} value={f[r.key]}
							onChange={(e) => setF({ [r.key]: e.target.value })} />
						{/* Their label carries no unit and ERPNext's field is minutes.
						    Said on the control, because the difference between 30
						    minutes and 30 hours is a shift nobody is ever late for. */}
						<b className="sfx">minutes</b>
					</Row>
				))}
			</div>

			<div className="note">
				Runs {f.start} to {f.end}{f.end <= f.start ? " the next day" : ""} — set on the first step.
			</div>
		</>
	);

	const stepGrace = (
		<>
			<h4 className="shwtitle">Grace timings</h4>

			<div role="radiogroup" aria-label="Grace timings">
				{SHW_GRACE_MODES.map((m) => (
					<div key={m.key} className="shwmode">
						<label title={m.why}>
							<input type="radio" name="shwgmode" checked={m.key === f.gmode}
								onChange={() => setF({ gmode: m.key })} />
							{m.label}
						</label>

						{/* Their two boxes sit under the first radio and belong to it. */}
						{m.key === "all" && f.gmode === "all" ? (
							<div className="shwgrid indent">
								{SHW_GRACE.map((r) => (
									<Row key={r.key} row={r}>
										<input id={"shw_" + r.key} type="number" min={0} value={f[r.key]}
											onChange={(e) => setF({ [r.key]: e.target.value })} />
										<b className="sfx">minutes</b>
									</Row>
								))}
							</div>
						) : null}

						{m.key === "cat" && f.gmode === "cat" ? (
							<div className="gap">{m.why}</div>
						) : null}
					</div>
				))}
			</div>
		</>
	);

	return (
		<Modal
			title={fresh ? "New Shift" : `Shift — ${w.row}`}
			wide
			onClose={onClose}
			extra={
				<div className="shwform">
					{/* What Save is about to do. Before the form rather than after it:
					    it changes what the button at the bottom means. */}
					{fresh ? (
						<div className="note">
							A new Shift Type. Save <b>creates it on the ERPNext site</b>, as you, and the site's
							own validation decides whether it is accepted.
						</div>
					) : w.state === "loading" ? (
						<div className="note">Asking the site whether it holds a Shift Type called “{w.row}”…</div>
					) : w.ours === true ? (
						<div className="note">
							The site holds <b>{w.row}</b>, and the boxes it has a field for are filled from it.
							Save <b>changes it on the site</b> — only the boxes that were changed are sent.
						</div>
					) : w.ours === false ? (
						<div className="note">
							No Shift Type called <b>{w.row}</b> could be read from this site, so the boxes open
							on the form's own values and Save <b>creates it</b>.
						</div>
					) : null}

					{w.step === "kind" ? stepKind : w.step === "timing" ? stepTiming : stepGrace}

					{w.msg ? <div className={w.bad ? "gap" : "note"}>{w.msg}</div> : null}

					{/* What the site has nowhere to put. Shut by default and printed
					    rather than summarised, the same bargain the schedulers make. */}
					{dropped.length ? (
						<details className="schwhat">
							<summary>
								{dropped.length} {dropped.length === 1 ? "answer" : "answers"} the site has nowhere
								to put
							</summary>
							<ul>
								{dropped.map((d) => <li key={d}>{d}</li>)}
							</ul>
						</details>
					) : null}

					{/* Their foot: Previous where there is one, Next or Save, then
					    Cancel. Close is the Modal shell's own and is not drawn twice. */}
					<div className="shwacts">
						{at > 0 ? (
							<button className="btn ghost" onClick={() => go(SHW_STEPS[at - 1][0])}>
								Previous
							</button>
						) : null}
						{at < SHW_STEPS.length - 1 ? (
							<button className="btn ghost" onClick={() => go(SHW_STEPS[at + 1][0])}>
								Next
							</button>
						) : null}
						{/* On every step, not only the last: the later two open on
						    working values, and a plain day shift should not take three
						    screens to make. */}
						<button className="btn tpl" onClick={() => void save()}
							disabled={Boolean(missing) || w.busy || w.state === "loading"}
							title={missing || (w.ours === true
								? "Changes this Shift Type on the ERPNext site — only the boxes that were changed."
								: "Creates this Shift Type on the ERPNext site, as you, under the site's own validation.")}>
							{w.busy ? "Saving…" : "Save"}
						</button>
						<button className="btn ghost" disabled={w.busy}
							title="Closes the wizard and empties it. Nothing typed since the last Save is sent."
							onClick={() => { onClose(); patch("shw", SHW_BLANK()); }}>
							Cancel
						</button>
					</div>
				</div>
			}
		/>
	);
}
