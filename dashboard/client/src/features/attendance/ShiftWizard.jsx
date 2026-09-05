import { useEffect } from "react";

import { getState, patch, set, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { getDoc } from "@/api/client";
import { deskNewWith, deskUrl } from "@/lib/desk";
import {
	SHW_BLANK, SHW_GRACE, SHW_GRACE_MODES, SHW_KINDS, SHW_STEPS, SHW_TIMING,
} from "@/data/shiftwizard";

/* ---------------------------------------------------------------------------
   **The shift wizard**, behind the ✎ on every row of SHIFT & WORK PATTERN.
   Photographed 4 September 2026 and drawn step for step.

   The argument for every control is in data/shiftwizard.js, where the tables
   are. What is here is the four things a component decides: how each step is
   laid out, what Next will not let past, what the site is asked for when the
   dialog opens, and which hand-off Save makes.

   ## Their chrome, not the other wizard's

   No numbered stepper. Theirs says `CURRENT SELECTION : TIME BASED` across the
   top of steps 2 and 3 and gives you Previous / Next / Cancel, and that is what
   is drawn — the Schedule Report wizard's numbered strip is on that dialog and
   copying it here would be inventing a screen.

   ## It reads before it draws

   The ✎ is on a row of *Factor HR's* list, and about half those shifts do not
   exist on this site — which is what the count in that heading is about. So the
   dialog asks for the document as it opens, and the answer decides two things:
   whether the boxes are seeded from what the site holds or from Factor HR's own
   defaults, and which hand-off Save can make. Both are said on the dialog
   rather than left for somebody to discover on the site.
   --------------------------------------------------------------------------- */

/** `HH:MM:SS` on the site, `HH:MM` in an `<input type="time">`. Both directions
    in one place, because a shift that came back as 08:30:00 and went out as
    08:30 would look like an edit nobody made. */
const toInput = (t) => String(t || "").slice(0, 5);
const toSite = (t) => (t && t.length === 5 ? t + ":00" : t || "");

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
		/* Seeded from the site, and only for the fields the site actually holds —
		   the rest keep Factor HR's own opening values, because a blank is not
		   what their form shows and an invented number would be worse. */
		f: {
			...f,
			start: toInput(doc.start_time) || f.start,
			end: toInput(doc.end_time) || f.end,
			early: String(doc.begin_check_in_before_shift_start_time ?? f.early),
			late: String(doc.allow_check_out_after_shift_end_time ?? f.late),
			gstart: String(doc.late_entry_grace_period ?? f.gstart),
			gend: String(doc.early_exit_grace_period ?? f.gend),
		},
	});
}

/** Open the wizard for one row of the shift list. Exported so the ✎ and
    anything else that ever opens it share the one definition of "open" —
    including the read, which is the half a caller would forget. */
export function openShiftWizard(name) {
	set({ shw: { ...SHW_BLANK(name), open: true } });
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
	const gmode = SHW_GRACE_MODES.find((m) => m.key === f.gmode) || SHW_GRACE_MODES[0];
	const at = SHW_STEPS.findIndex(([k]) => k === w.step);

	/* Everything the desk form would open holding. Only the fields that exist —
	   `deskNewWith` drops empties, so an untouched box leaves the doctype's own
	   default alone rather than overwriting it with "". */
	const values = {
		name: f.name.trim(),
		start_time: toSite(f.start),
		end_time: toSite(f.end),
		begin_check_in_before_shift_start_time: f.early,
		allow_check_out_after_shift_end_time: f.late,
		/* Grace by category has nowhere to land, so the two numbers only go over
		   when they are meant to apply to everybody — which is what the field
		   means on the site. Picking their other mode says so on the form. */
		...(f.gmode === "all"
			? { late_entry_grace_period: f.gstart, early_exit_grace_period: f.gend }
			: {}),
	};

	/** What the site has nowhere to put, gathered once and shown before
	    anything opens. Not silently dropped, and not written into a field that
	    would make it look honoured. */
	const dropped = [
		f.isdefault && "IS DEFAULT — no such field on Shift Type; their own list shows it blank on "
			+ "every row of the tenant this page was photographed from",
		kind.state !== "live" && `${kind.label} — ${kind.why}`,
		f.hasbreak && SHW_TIMING[0].why,
		f.gmode === "cat" && SHW_GRACE_MODES[1].why,
	].filter(Boolean);

	const href = s.site && (w.ours
		? deskUrl(s.site, "Shift Type", w.row)
		: deskNewWith(s.site, "Shift Type", values));

	function go(k) {
		const i = SHW_STEPS.findIndex(([x]) => x === k);
		/* Forward past step 1 needs a name, because the document is named by it —
		   `Shift Type` is prompt-named on this site, so a blank here is a document
		   that cannot be created rather than one named later. */
		if (i > 0 && !f.name.trim()) {
			return patch("shw", {
				msg: "A shift needs a name before the rest of it means anything — Shift Type is named by "
					+ "what is typed here, not by a series.",
				bad: true,
			});
		}
		patch("shw", { step: k, msg: "", bad: false });
	}

	const stepKind = (
		<>
			<div className="shwhead">
				<div className="shwname">
					<label htmlFor="shw_name">Name</label>
					<input id="shw_name" value={f.name} onChange={(e) => setF({ name: e.target.value })} />
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

			{/* Their four kinds, each with its italic question under it. The ⓘ is
			    theirs; what is behind it is ours — see data/shiftwizard.js. */}
			<div className="shwkinds" role="radiogroup" aria-label="Kind of shift">
				{SHW_KINDS.map((k) => (
					<div key={k.key} className={"shwkind" + (k.key === f.kind ? " on" : "")}>
						<label>
							<input type="radio" name="shwkind" checked={k.key === f.kind}
								onChange={() => setF({ kind: k.key })} />
							{k.label}
						</label>
						<p>
							{k.blurb}
							<b className="shwi" title={k.why} aria-label={k.why} role="note">ⓘ</b>
						</p>
						{/* The finding, on the control rather than in a footnote: three of
						    their four are a different answer to "what is a shift" than
						    ERPNext has, and somebody choosing one should be told then. */}
						{k.key === f.kind && k.state !== "live" ? (
							<div className={k.state === "build" ? "gap" : "note"}>{k.why}</div>
						) : null}
					</div>
				))}
			</div>
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
				{SHW_TIMING.filter((r) => r.kind !== "check").map((r) => (
					<Row key={r.key} row={r}>
						{r.kind === "time" ? (
							<input id={"shw_" + r.key} type="time" value={f[r.key]}
								onChange={(e) => setF({ [r.key]: e.target.value })} />
						) : (
							<>
								<input id={"shw_" + r.key} type="number" min={0} value={f[r.key]}
									onChange={(e) => setF({ [r.key]: e.target.value })} />
								{/* Their label carries no unit and ERPNext's field is minutes.
								    Said on the control, because the difference between 30
								    minutes and 30 hours is a shift nobody is ever late for. */}
								<b className="sfx">minutes</b>
							</>
						)}
					</Row>
				))}
			</div>

			{/* Allowed, and said. An overnight shift is a real thing and their form
			    does not stop you either; a form that silently accepted it would be
			    the problem. */}
			{f.end <= f.start ? (
				<div className="note">
					This shift ends at or before it starts, which the site reads as running <b>overnight</b> —
					{" "}{f.start} to {f.end} the next day. Allowed here because it is allowed there; said
					because a typo and a night shift look identical in two boxes.
				</div>
			) : null}
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
			title={w.row ? `Shift — ${w.row}` : "Shift"}
			wide
			onClose={onClose}
			extra={
				<div className="shwform">
					{/* Their line, on steps 2 and 3. Step 1 is where the selection is
					    made, so it does not need telling. */}
					{at > 0 ? (
						<div className="shwsel">Current selection : <b>{kind.label}</b></div>
					) : null}

					{/* What the site holds for this row, and therefore what Save can do.
					    Before the form rather than after it: it changes what the buttons
					    at the bottom mean. */}
					{w.state === "loading" ? (
						<div className="note">Asking the site whether it holds a Shift Type called “{w.row}”…</div>
					) : w.ours === true ? (
						<div className="note">
							The site holds <b>{w.row}</b>, and the boxes it has a field for are filled from it.
							Save opens that document — Frappe takes these answers as defaults on a <em>new</em>
							{" "}Shift Type and not on one that already exists, so on this row Save is
							{" "}<b>open it and type them there</b>.
						</div>
					) : w.ours === false ? (
						<div className="note">
							No Shift Type called <b>{w.row}</b> on this site — which is what the count in that
							heading is about. So the boxes open on Factor HR's own values, and Save
							{" "}<b>creates it</b>, with everything here already in it.
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
							<button className="btn tpl" onClick={() => go(SHW_STEPS[at + 1][0])}>
								Next
							</button>
						) : (
							<Desk className="btn tpl" href={f.name.trim() ? href : ""}
								dead={f.name.trim() ? undefined : "A shift needs a name — Shift Type is named by it."}
								title={w.ours
									? "Opens this Shift Type on the ERPNext site. Nothing on this dashboard writes, and an existing document takes no defaults from a link — so the answers here are typed there."
									: "Creates this Shift Type on the ERPNext site, with everything typed here already in it. The document is made there, by whoever is logged in there, under the site's own validation."}>
								Save
							</Desk>
						)}
						<button className="btn ghost"
							title="Closes the wizard and empties it. Nothing here has been sent anywhere."
							onClick={() => { onClose(); patch("shw", SHW_BLANK()); }}>
							Cancel
						</button>
					</div>
				</div>
			}
		/>
	);
}
