import { useEffect, useState } from "react";

import { Empty, Modal } from "@/components/ui";
import { apiWrite, getDoc } from "@/api/client";
import { dmy } from "@/lib/format";
import { load } from "@/api/load";
import { mergeLetter } from "@/lib/letter";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Edit Letter**, photographed 7 September 2026 — drawn control
   for control, and opened by the pencil on the letter register.

   Their form, in their order: Letter Number and Letter Type as *values* rather
   than boxes, Letter Date beside them, Employee and Reference Number under, a
   Remarks box, a two-column Custom Fields table, and Save / Cancel. The pencil
   used to be a link to `…/app/employee-letter/HR-LTR-…` on the ERPNext desk,
   from when nothing on this dashboard wrote anything.

   ## Their Custom Fields table is the point of this screen

   It is not a list of extra fields somebody defined. It is **the tokens in this
   letter type's template that nothing could fill in** — their capture shows
   `employeesfathername`, `currentdate` and `dol` against an Experience
   Certificate, which are exactly the three an ERPNext record has no answer for
   on a person whose father's name and leaving date were never migrated. Every
   other token in that template resolved and so is not in the table.

   That is why the New Letter form's version of this table is empty and says so:
   nothing has been chosen yet, so there is no template to read tokens out of.

   So the rows here are computed, not stored: merge the type's template against
   this person, and whatever comes back as missing is the table. Type a value
   and the gap closes.

   ## What a typed value does

   It is merged into the letter and the **text is saved**, because that is what
   a letter is here — `employee_letter.py` stores the merged body on insert
   precisely so that a letter issued in March still reads as it did in March.
   There is nowhere on the doctype to keep a token value on its own, and adding
   one would mean the same fact in two places with only the second one printed.

   **The body is only rewritten when somebody actually typed something.**
   Opening this dialog and pressing Save must never silently re-merge: the
   stored text may carry values typed on an earlier edit, and a fresh merge
   would replace them with `[[Token]]` again. So the merge runs only over the
   values in this table, and only when one of them is filled.

   ## What cannot be changed here

   `letter_type`, exactly as on their form, where it is a value and not a
   control. Changing the type means a different template and therefore a
   different letter; the honest way to do that is to issue one.

   `employee` is a control on their form and is a value on ours, which is the
   one place this drawing departs from the photograph. Moving a letter to
   somebody else re-merges every token in it against a different person — the
   letter that was handed over does not become a different letter because a
   dropdown changed. Issue them one instead.
   --------------------------------------------------------------------------- */

/** The fields this dialog owns, `body` aside — it is derived, never typed. */
const FIELDS = ["letter_date", "reference_number", "remarks"];

/** Tokens their form draws as a date box. Off the capture, where `currentdate`
    and `dol` both read `dd-mm-yyyy` rather than as empty text boxes. */
const DATEISH = /^(doj|dol|dateof|currentdate|pastdate|confirmation)/;

const isDate = (token) => DATEISH.test(String(token).toLowerCase().replace(/[\s._\-/]/g, ""));

export default function EditLetter({ name, onClose }) {
	const s = useApp();

	const [doc, setDoc] = useState(null);
	const [emp, setEmp] = useState(null);
	const [tmpl, setTmpl] = useState("");
	const [f, setF] = useState(null);
	/** What has been typed into the Custom Fields table, by normalised token. */
	const [cf, setCf] = useState({});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	/* Three reads, and each is needed for a different half of the form. The
	   letter, because the register's row does not carry the body. The person,
	   because the register's row is the list's fields and the merge reads
	   twenty. The type, because the tokens live in its template and nowhere
	   else. */
	useEffect(() => {
		let live = true;
		setErr("");
		getDoc("Employee Letter", name).then(async (got) => {
			if (!live) return;
			if (!got) {
				setErr("The site would not answer for this letter.");
				return;
			}
			setDoc(got);
			setF(Object.fromEntries(FIELDS.map((k) => [k, got[k] == null ? "" : String(got[k])])));

			const [person, type] = await Promise.all([
				got.employee ? getDoc("Employee", got.employee) : Promise.resolve(null),
				got.letter_type ? getDoc("Letter Type", got.letter_type) : Promise.resolve(null),
			]);
			if (!live) return;
			setEmp(person || {});
			setTmpl((type && type.body) || "");
		});
		return () => { live = false; };
	}, [name]);

	const on = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

	/* What the letter knows that the person's record does not — the same four
	   `employee_letter.py` passes as `extra`, so a token resolves here the way
	   it resolved when the letter was made. */
	const context = doc ? {
		letternumber: doc.letter_number,
		referencenumber: f ? f.reference_number : doc.reference_number,
		letterdate: doc.letter_date,
		remarks: f ? f.remarks : doc.remarks,
	} : {};

	/* Their Custom Fields rows: merge the template against this person and take
	   what came back unanswered. Recomputed as values are typed, so a row leaves
	   the table the moment it is filled — which is the feedback their form gives
	   by having drawn the row in the first place. */
	const merged = tmpl ? mergeLetter(tmpl, emp || {}, { ...context, ...cf }) : null;
	const gaps = merged ? merged.missing : [];
	/* The rows to draw: everything that was missing before anything was typed,
	   kept in the table after it is filled so a box does not vanish under the
	   caret. */
	const [rows, setRows] = useState(null);
	useEffect(() => {
		if (tmpl && rows === null && merged) setRows(merged.missing);
	}, [tmpl, rows, merged]);

	const typed = Object.entries(cf).filter(([, v]) => String(v || "").trim() !== "");
	const changed = f && doc
		? FIELDS.filter((k) => f[k] !== (doc[k] == null ? "" : String(doc[k])))
		: [];
	const ready = (changed.length > 0 || typed.length > 0) && !busy;

	async function save() {
		setBusy(true);
		setErr("");
		setSaid("");

		const patch = {};
		for (const k of changed) {
			/* An emptied box goes as "" rather than being dropped: clearing a
			   reference number is something somebody did on purpose. */
			patch[k] = f[k];
		}
		/* Only when a token was actually answered. See the note at the top —
		   a merge on every save would undo the last one. */
		if (typed.length && tmpl) {
			patch.body = mergeLetter(tmpl, emp || {}, { ...context, ...cf }).html;
		}

		const r = await apiWrite("Employee Letter", name, patch);
		if (!r.ok) {
			setErr(r.error || "The site refused this change.");
			setBusy(false);
			return;
		}
		await load();
		const fresh = await getDoc("Employee Letter", name);
		if (fresh) {
			setDoc(fresh);
			setF(Object.fromEntries(FIELDS.map((k) => [k, fresh[k] == null ? "" : String(fresh[k])])));
		}
		setSaid(`Saved. ${typed.length ? "The letter was merged again with what you filled in." : ""}`);
		setBusy(false);
	}

	const who = doc
		? [doc.employee_number || (emp && emp.employee_number), doc.employee_name || doc.employee]
			.filter(Boolean).join(" - ")
		: "";

	return (
		<Modal
			title="Edit Letter"
			wide
			msg={doc ? `${doc.name}${doc.letter_date ? ` · issued ${dmy(doc.letter_date)}` : ""}` : name}
			why="Their Edit Letter form. The Custom Fields table is the tokens this letter type's template could not fill from the record — answer one and the letter is merged again and the text saved, which is what the document stores."
			actions={
				<>
					<button className="embtn pri" onClick={save} disabled={!ready}
						title={ready
							? "Write the changes to the site."
							: "Nothing has changed. A save that writes an identical document still lands in the version history."}>
						{busy ? "Saving…" : "Save"}
					</button>
					<button className="embtn" onClick={onClose} disabled={busy}>Cancel</button>
					<span className="wizgrow text-ink-3">
						{said || (ready
							? <>{changed.length + typed.length} change{changed.length + typed.length > 1 ? "s" : ""} to write.</>
							: <>Nothing changed yet.</>)}
					</span>
				</>
			}
			extra={
				err && !f ? <div className="gap">{err}</div>
					: !f ? <Empty title="reading the letter…" />
						: (
							<div className="letedit">
								{err ? <div className="gap" role="alert"><b>The site refused this.</b> {err}</div> : null}

								<div className="letegrid">
									{/* A value on their form, not a box. Theirs reads `2` — their own
									    running number, which is not the document's name. */}
									<div className="letef">
										<span className="lab">Letter Number<b className="wizreq" aria-hidden="true"> *</b></span>
										<span className="val">{doc.letter_number || <i className="muted">not set</i>}</span>
									</div>

									{/* A value on theirs too, and for a reason worth keeping: the type
									    is the template, and a different template is a different
									    letter. */}
									<div className="letef">
										<span className="lab">Letter Type<b className="wizreq" aria-hidden="true"> *</b></span>
										<span className="val">{doc.letter_type || <i className="muted">not set</i>}</span>
									</div>

									<div className="letef">
										<label className="lab" htmlFor="el-date">
											Letter Date<b className="wizreq" aria-hidden="true"> *</b>
										</label>
										<input id="el-date" type="date" value={String(f.letter_date).slice(0, 10)}
											onChange={on("letter_date")} disabled={busy} />
									</div>

									{/* Theirs is a picker. Ours is a value — the one place this drawing
									    departs from the photograph, and the note at the top says why. */}
									<div className="letef">
										<span className="lab">Employee<b className="wizreq" aria-hidden="true"> *</b></span>
										<span className="val emp">{who || <i className="muted">not set</i>}</span>
									</div>

									<div className="letef">
										<label className="lab" htmlFor="el-ref">Reference Number</label>
										<input id="el-ref" value={f.reference_number} onChange={on("reference_number")}
											disabled={busy} placeholder="Enter Reference Number" />
									</div>

									<div className="letef wide">
										<label className="lab" htmlFor="el-rem">Remarks</label>
										<textarea id="el-rem" rows={4} value={f.remarks} onChange={on("remarks")}
											disabled={busy} placeholder="Enter remarks" />
									</div>
								</div>

								<div className="letcf">
									<table>
										<thead>
											<tr><th>Custom Fields</th><th>Input</th></tr>
										</thead>
										<tbody>
											{!tmpl ? (
												<tr>
													<td colSpan={2} className="none">
														{doc.letter_type
															? <>The <b>{doc.letter_type}</b> type carries no template on this site, so there are
																no tokens to fill. The letter still holds the text it was issued with.</>
															: "This letter names no type, so there is no template to read tokens from."}
													</td>
												</tr>
											) : !rows || !rows.length ? (
												<tr>
													<td colSpan={2} className="none">
														Every token in this template resolved against {doc.employee_name || "this person"}.
														Nothing is waiting to be filled in.
													</td>
												</tr>
											) : rows.map((token) => {
												const key = token.toLowerCase().replace(/[\s._\-/]/g, "");
												const filled = String(cf[key] || "").trim() !== "";
												return (
													<tr key={token}>
														<td className={"tok" + (filled ? " done" : "")}>{token}</td>
														<td>
															<input
																id={"el-cf-" + key}
																type={isDate(token) ? "date" : "text"}
																value={cf[key] || ""}
																aria-label={token}
																disabled={busy}
																placeholder={isDate(token) ? "dd-mm-yyyy" : "Enter " + token}
																onChange={(e) => setCf((p) => ({ ...p, [key]: e.target.value }))} />
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
									{rows && rows.length ? (
										<p className="cfnote">
											{gaps.length
												? <>{gaps.length} of {rows.length} still unanswered. Anything left blank stays
													<span className="mono"> [[Token]]</span> in the letter — visible, rather than a gap that
													looks finished.</>
												: <>All filled. Save merges the letter again and stores the text.</>}
										</p>
									) : null}
								</div>
							</div>
						)
			}
			onClose={onClose}
		/>
	);
}
