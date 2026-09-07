import { useState } from "react";

import { Desk, Gap, NoteBelow } from "@/components/ui";
import { apiCreate } from "@/api/client";
import { deskUrl } from "@/lib/desk";
import { dmy, tidyDept, todayIso } from "@/lib/format";
import { load } from "@/api/load";
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
   would try to type into. Once Save has run it is the name the site assigned,
   in the same place, because that is the moment the number starts existing.

   **Save writes the letter. It no longer hands off.** This form used to open a
   pre-filled `Employee Letter` on the ERPNext desk and leave somebody to press
   Save over there — so the letter was issued only if they finished a journey
   through a second application, on a screen that looks nothing like this one,
   and a form abandoned halfway left no record that anybody had tried. It is one
   `apiCreate` now, as the signed-in person and under their own roles, and the
   register behind this form is re-read before the result is shown. Generate
   Bulk Letter has always worked this way; there was never a reason for one
   letter to be harder to issue than four hundred.

   **So this form has to ask who the letter is for, and theirs does not.**
   `employee` is `reqd` on `Employee Letter` — a letter belongs to somebody, and
   a write that omitted it would be refused by the site with a message about a
   field this screen never showed. Their capture has no such box: either their
   flow carries the employee in from the row that was selected, or it sits below
   the fold. Rather than guess at theirs, the picker here is the one this
   dashboard uses on every other screen that needs a person.

   The merge is not done here and must not be. `employee_letter.py` merges the
   template on `before_insert` and *stores* the text, so a letter issued in March
   still says what it said in March — see the note on `body` in the doctype. A
   body composed in a browser would be a second place for that to happen, and
   the two would drift the first time a template changed.
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

const BLANK = {
	employee: "",
	letter_type: "",
	/* Theirs opens on today, formatted 04-Sep-2026. The value here is the ISO
	   string the site stores and the input shows it in the browser's own
	   format; the reading underneath is theirs, so the date on screen can be
	   checked against the date on their screen without translating it. */
	letter_date: todayIso(),
	reference_number: "",
	remarks: "",
};

export default function NewLetter({ onCancel }) {
	const s = useApp();
	const types = s.letterTypes;

	const [f, setF] = useState(BLANK);
	const [q, setQ] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	/* The letter the site made, held so the form can name it. Not looked up on
	   the register afterwards: the re-read can be refused or slow, and "issued
	   as HR-LTR-2026-00004" is a fact the create call already answered with. */
	const [made, setMade] = useState(null);

	const on = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

	const who = s.employees.find((e) => e.name === f.employee) || null;
	const needle = q.trim().toLowerCase();
	const hits = needle
		? s.employees
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(needle)))
			.slice(0, 8)
		: [];

	/* Their two stars and ours. Save stays dead until all three are answered
	   rather than sending a document the site would refuse: these are the three
	   `reqd` fields on the doctype, and a refusal for a missing one reads on
	   this side as a button that does not work. */
	const ready = Boolean(f.employee && f.letter_type && f.letter_date);

	async function save() {
		setBusy(true);
		setErr("");
		try {
			const doc = await apiCreate("Employee Letter", {
				employee: f.employee,
				employee_name: who?.employee_name,
				letter_type: f.letter_type,
				letter_date: f.letter_date,
				/* Absent rather than empty, the same way Generate Bulk Letter sends
				   them: a letter with `reference_number: ""` and one that never had a
				   reference read the same on the register and differently to anybody
				   counting which columns get filled. */
				...(f.reference_number.trim() ? { reference_number: f.reference_number.trim() } : {}),
				...(f.remarks.trim() ? { remarks: f.remarks.trim() } : {}),
			});
			/* The register behind this form is filled by the dashboard's own load —
			   letters come down with the first read — so it is re-read rather than
			   patched locally. A row assembled here would be missing everything the
			   site did on the way in, which for this doctype is most of the letter:
			   the merged body, and the company and name it fetches off the person. */
			await load();
			setMade({
				name: doc?.name || "",
				letter_type: f.letter_type,
				employee_name: who?.employee_name || f.employee,
			});
		} catch (e) {
			/* What the site said, in the site's words. A refusal here is nearly
			   always a permission or a missing master, and both are answered by
			   somebody reading the sentence rather than by pressing Save again. */
			setErr(String(e?.message || e).slice(0, 300));
		}
		setBusy(false);
	}

	/** Issue another. The type and the date stay — somebody issuing letters one
	    at a time is usually issuing the same type on the same day to several
	    people — and everything that is about one person is cleared. */
	function again() {
		setF((p) => ({ ...BLANK, letter_type: p.letter_type, letter_date: p.letter_date }));
		setQ("");
		setErr("");
		setMade(null);
	}

	/* Locked once the letter exists. The boxes stay on screen holding what was
	   sent — a form that emptied itself on save gives somebody no way to check
	   what they just issued — but nothing here edits a saved document: that is
	   the site's form, one click along. */
	const done = Boolean(made);

	return (
		<div className="fhcat letnew">
			<header>
				<h3>Create New Letter</h3>
				<span className="cov live">Their form, our write</span>
			</header>

			<div className="wizform letnewform">
				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-num">
						Letter Number<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					{/* Not a control on their screen either. The dash is theirs, and what
					    replaces it is the name the site assigned rather than a box — the
					    number is still not something anybody types. */}
					<span className="ctl" id="nl-num">
						{done
							? (
								<span className="mono text-read text-brand-deep leading-[2.25rem]"
									title="Assigned by the site from the HR-LTR- naming series when this document was created.">
									{made.name}
								</span>
							)
							: (
								<span className="letdash" title="Assigned on save, from the HR-LTR- naming series. It does not exist until the document does, which is why theirs is a dash rather than an empty box.">
									–
								</span>
							)}
					</span>
				</div>

				{/* Ours, and it has to be: `employee` is required on the doctype, so a
				    letter with nobody behind it is not a document the site will keep.
				    Their form does not ask — see the note under this one. */}
				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-emp">
						Employee<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					<span className="ctl">
						<span className="find">
							<input id="nl-emp" type="search" autoComplete="off" placeholder="Search Employee"
								aria-label="Search employee" disabled={busy || done}
								title="Type a name, a code or a designation. Whose letter this is — the site refuses one without a person, and the template is merged against this record."
								value={who && !q ? `${who.employee_name} (${who.employee_number || who.name})` : q}
								/* Typing over a chosen name clears the choice — otherwise the
								   box says one person and the letter goes to another. */
								onChange={(e) => { setQ(e.target.value); setF((p) => ({ ...p, employee: "" })); }} />
							<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
								strokeWidth="1.8" strokeLinecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="M20 20l-3.6-3.6" />
							</svg>
						</span>
						{needle && !who ? (
							<div className="regfind">
								{hits.length
									? hits.map((e) => (
										<button key={e.name}
											onClick={() => { setF((p) => ({ ...p, employee: e.name })); setQ(""); }}>
											<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
											<b>{e.employee_name}</b>
											<span className="mono">{e.employee_number || "—"}</span>
											<span className="muted">{tidyDept(e.department)}</span>
										</button>
									))
									: <span className="none">Nobody matches.</span>}
							</div>
						) : null}
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-type">
						Letter Type<b className="wizreq" aria-hidden="true"> *</b>
					</label>
					<span className="ctl">
						<select id="nl-type" value={f.letter_type} onChange={on("letter_type")}
							disabled={busy || done}>
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
						<input id="nl-date" type="date" value={f.letter_date} onChange={on("letter_date")}
							disabled={busy || done} />
					</span>
					<span className="hint">{f.letter_date ? dmy(f.letter_date) : "no date"}</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 8 }}>
					<label className="lab" htmlFor="nl-ref">Reference Number</label>
					<span className="ctl">
						<input id="nl-ref" value={f.reference_number} onChange={on("reference_number")}
							disabled={busy || done} placeholder="Enter Reference Number" />
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 11 }}>
					<label className="lab" htmlFor="nl-rem">Remarks</label>
					<span className="ctl">
						<textarea id="nl-rem" rows={4} value={f.remarks} onChange={on("remarks")}
							disabled={busy || done} placeholder="Enter remarks" />
					</span>
				</div>

				<div className="lvf wizf" style={{ "--w": 14 }}>
					<CustomFields />
				</div>
			</div>

			<div className="wizacts">
				{done ? (
					<>
						<button className="embtn pri" onClick={again}>Create another</button>
						<button className="embtn" onClick={onCancel}>Back to the register</button>
						<Desk className="embtn" label="Open this letter on the site"
							href={s.site && made.name ? deskUrl(s.site, "Employee Letter", made.name) : ""}
							title="Open the letter the site has just made, with the merged text on it as it was stored.">
							Open on the site
						</Desk>
					</>
				) : (
					<>
						<button className="embtn pri" onClick={save} disabled={!ready || busy}
							title={ready
								? "Write this letter to the site now, as an Employee Letter. The template is merged and its text stored on the way in, by the site."
								: "Employee, Letter Type and Letter Date are the three the site requires. All three have to be answered before there is a document to make."}>
							{busy ? "Saving…" : "Save"}
						</button>
						<button className="embtn" onClick={onCancel} disabled={busy}>Cancel</button>
					</>
				)}

				<span className="wizgrow text-ink-3">
					{done
						? <>Issued to <b>{made.employee_name}</b> as <b>{made.name || "a new letter"}</b>. It is on the register.</>
						: ready
							? <>Writes one <b>Employee Letter</b> on the site.</>
							: <>Pick an <b>employee</b> and a <b>Letter Type</b> to continue.</>}
				</span>
			</div>

			<div className="px-[1rem] pb-[.9rem]">
				{err && (
					<div className="mb-[.6rem]">
						<Gap>
							<b>The site refused this letter.</b> {err} Nothing was written, and the boxes above
							still hold what was typed — so this can be answered and saved again.
						</Gap>
					</div>
				)}

				<NoteBelow>
					<b>Their form does not ask who the letter is for.</b> The register behind it has Employee
					Name as its second column, so one plainly belongs to somebody — either their flow carries
					it in from the selected row, or the field sits below the fold of the 4 Sep 2026 capture.
					The box is here because the write is here: <span className="mono">employee</span> is
					required on <span className="mono">Employee Letter</span>, and the template is merged
					against that person's record.
				</NoteBelow>

				{done && !s.site && (
					<div className="mt-[.6rem]">
						<Gap>
							The letter is written and on the register; only <b>Open on the site</b> has nowhere to
							go, because the server has not named a desk and <b>DESK_URL</b> is unset.
						</Gap>
					</div>
				)}
			</div>
		</div>
	);
}
