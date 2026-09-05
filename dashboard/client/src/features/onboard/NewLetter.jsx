import { useState } from "react";

import { Desk, Gap, NoteBelow } from "@/components/ui";
import { deskNewWith } from "@/lib/desk";
import { dmy, todayIso } from "@/lib/format";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Create New Letter**, photographed 4 September 2026 — the form
   their blue Create Letter opens, drawn control for control.

   Five fields and two buttons, in their order and at their widths: a Letter
   Number that is not an input, Letter Type and Letter Date on the same row and
   both starred, Reference Number under them, Remarks under that, then a
   two-column Custom Fields table and Save / Cancel.

   Three things about it are worth writing down, because each is a finding
   rather than a detail of the drawing.

   **Their Letter Number is a dash.** It is not a disabled box and not a
   placeholder — the number does not exist yet, because it comes off the naming
   series when the document is saved (`HR-LTR-`, see the registry). Drawn as
   they draw it, with the reason on it, rather than as an empty input somebody
   would try to type into.

   **Their form has no employee field.** The register behind it has EMPLOYEE
   NAME as its second column, so a letter plainly belongs to somebody; the form
   as photographed never asks who. Either their flow carries the employee in
   from the row that was selected, or the field is below the fold of the
   capture. Not invented here either way — the note under the form says so, and
   the site's own form is where the letter is actually made.

   **Save is a handoff, not a write.** `Employee Letter` is `creatable: false`
   on this API (server/src/doctypes/registry.ts) and this dashboard reads —
   so Save opens the same new document on the ERPNext site with everything
   typed here already in it, via Frappe's `new` route (lib/desk.js). Nothing is
   retyped and nothing is written from a browser tab holding a read token. With
   no site configured it is a dead button that says why, which is what every
   other write on this dashboard does.
   --------------------------------------------------------------------------- */

/** Their two-column Custom Fields table, which is empty in the capture.

    Drawn rather than left out for the same reason the ⋮ on the register is
    drawn: a control quietly dropped is one nobody remembers to ask about. What
    is *in* it on their side is unknown — the capture shows the headings and no
    rows, which is either a site with no custom fields defined or a letter type
    that carries none. */
function CustomFields() {
	return (
		<div className="letcf">
			<table>
				<thead>
					<tr><th>Custom Fields</th><th>Input</th></tr>
				</thead>
				<tbody>
					<tr>
						<td colSpan={2} className="none">
							None defined. Their capture shows this table with its headings and no rows.
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}

export default function NewLetter({ onCancel }) {
	const s = useApp();
	const types = s.letterTypes;

	const [f, setF] = useState({
		letter_type: "",
		/* Theirs opens on today, formatted 04-Sep-2026. The value here is the ISO
		   string the site stores and the input shows it in the browser's own
		   format; the reading underneath is theirs, so the date on screen can be
		   checked against the date on their screen without translating it. */
		letter_date: todayIso(),
		reference_number: "",
		remarks: "",
	});
	const on = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

	/* Their two stars. Save stays dead until both are answered rather than
	   opening a document on the site that the site would then refuse. */
	const ready = Boolean(f.letter_type && f.letter_date);

	return (
		<div className="fhcat letnew">
			<header>
				<h3>Create New Letter</h3>
				<span className="cov part">Their form, our handoff</span>
			</header>

			<div className="wizform letnewform">
				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-num">
						Letter Number<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					{/* Not a control on their screen either. The dash is theirs. */}
					<span className="ctl" id="nl-num">
						<span className="letdash" title="Assigned on save, from the HR-LTR- naming series. It does not exist until the document does, which is why theirs is a dash rather than an empty box.">
							–
						</span>
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-type">
						Letter Type<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					<span className="ctl">
						<select id="nl-type" value={f.letter_type} onChange={on("letter_type")}>
							<option value="">Select letter type</option>
							{types.map((t) => (
								<option key={t.name} value={t.name}>{t.name}</option>
							))}
						</select>
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-date">
						Letter Date<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					<span className="ctl">
						<input id="nl-date" type="date" value={f.letter_date} onChange={on("letter_date")} />
					</span>
					<span className="hint">{f.letter_date ? dmy(f.letter_date) : "no date"}</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-ref">Reference Number</label>
					<span className="ctl">
						<input id="nl-ref" value={f.reference_number} onChange={on("reference_number")}
							placeholder="Enter Reference Number" />
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 11 }}>
					<label className="lab" htmlFor="nl-rem">Remarks</label>
					<span className="ctl">
						<textarea id="nl-rem" rows={4} value={f.remarks} onChange={on("remarks")}
							placeholder="Enter remarks" />
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 14 }}>
					<CustomFields />
				</div>
			</div>

			<div className="wizacts">
				<Desk
					className="embtn pri"
					label="Save this letter on the site"
					href={ready && s.site
						? deskNewWith(s.site, "Employee Letter", {
							letter_type: f.letter_type,
							letter_date: f.letter_date,
							reference_number: f.reference_number,
							remarks: f.remarks,
						})
						: ""}
					dead={!ready
						? "Letter Type and Letter Date are their two required fields. Both have to be answered before there is a document to make."
						: undefined}
					title="Opens a new Employee Letter on the ERPNext site with everything typed here already in it — the employee, the template and the save itself happen there, where the validation that guards them runs."
				>
					Save
				</Desk>
				<button className="embtn" onClick={onCancel}>Cancel</button>
				<span className="wizgrow text-ink-3">
					{ready
						? <>Opens on the site as a new <b>Employee Letter</b>, pre-filled.</>
						: <>Pick a <b>Letter Type</b> to continue.</>}
				</span>
			</div>

			<div className="px-[1rem] pb-[.9rem]">
				<NoteBelow>
					<b>Their form does not ask who the letter is for.</b> The register behind it has Employee
					Name as its second column, so one plainly belongs to somebody — either their flow carries
					it in from the selected row, or the field sits below the fold of the 4 Sep 2026 capture.
					Nothing is guessed here: the employee is picked on the site, on the document this Save
					opens.
				</NoteBelow>
				{!s.site && (
					<div className="mt-[.6rem]">
						<Gap>
							Save has nowhere to go: the API has not named an ERPNext site, so
							<b> SITE_URL</b> is unset. The form still works — it is the last step that needs
							somewhere to put the document.
						</Gap>
					</div>
				)}
			</div>
		</div>
	);
}
