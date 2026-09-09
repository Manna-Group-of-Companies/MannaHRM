import { useState } from "react";

import { useApp } from "@/store";
import { Gap, Html, Modal, Note } from "@/components/ui";
import { create, remove, update } from "@/api/crud";
import {
	blankDoc, canDelete, canEdit, fieldWarning, formFields, missingRequired, namingField, patchOf,
} from "@/lib/write";
import { SCHEMA } from "@/data/schema";

/* ---------------------------------------------------------------------------
   One form, for creating or changing any record this app installs.

   The fields come from `data/schema.js`, which is generated from the same
   doctype JSON the server installs — so a form cannot offer a field the table
   has not got. That is the failure this whole path exists to remove: **Frappe
   accepts a key its doctype does not have and drops it silently**, so a
   hand-written form with one stale field takes a value, saves, reports success,
   and shows nothing on reload.

   What it will not do is as much of the design as what it will:

   - **It sends only what changed.** A whole-document write re-sends columns
     this reader may not write — an edited phone number refused over a salary
     field nobody touched — and re-sends values that were current when the page
     loaded, so the second of two people saving quietly undoes the first.
   - **It does not offer Delete where deleting is the wrong answer.** A punch, a
     person, a loan, a repayment, an issued letter: `lib/write.NEVER_DELETE`
     names each and says why, and the page prints the reason rather than a
     greyed-out button that looks like a permission problem.
   - **It never claims a save the site did not make.** A refusal is shown in the
     site's own words and the typing stays where it is — a form that emptied
     itself on a refusal would be a form that cost somebody their work.
   --------------------------------------------------------------------------- */

/** Which store list a Link field can be picked from, where this app holds one.

    A datalist, never a select: the list here is what one read returned, and a
    select built from it cannot express a department that read did not include.
    The site is what refuses a Link naming nothing, and that is the right place
    for it to fail. */
const LINK_LIST = {
	"Company": "companies",
	"Department": "departments",
	"Designation": "designations",
	"Holiday List": "holidayLists",
	"Shift Type": "shiftTypes",
	"Leave Type": "leaveTypes",
	"Letter Type": "letterTypes",
};

export default function RecordForm({ doctype, doc, onDone, onCancel }) {
	const s = useApp();
	const spec = SCHEMA[doctype];
	const making = !doc || !doc.name;

	const [draft, setDraft] = useState(() => (making ? blankDoc(doctype) : {}));
	const [msg, setMsg] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState("");

	if (!spec) {
		return <Gap>This app does not install a doctype called <b>{doctype}</b>.</Gap>;
	}

	const base = doc || {};
	const value = (f) => (draft[f.name] !== undefined ? draft[f.name] : base[f.name] ?? "");
	const set = (f, v) => setDraft({ ...draft, [f.name]: v });

	const editable = making ? { ok: true, why: "" } : canEdit(doctype, base);
	const deletable = making ? { ok: false } : canDelete(doctype, base);

	const merged = { ...base, ...draft };
	const missing = missingRequired(doctype, merged);
	const patch = patchOf(base, draft);
	const changed = Object.keys(patch).length;

	async function save() {
		setBusy(true);
		setMsg("");
		const r = making
			? await create(doctype, { ...blankDoc(doctype), ...draft })
			: await update(doctype, base.name, patch);
		setBusy(false);
		if (!r.ok) { setMsg(r.error || "The site refused the write."); return; }
		/* The site names the record, fills what it derives and normalises what it
		   was sent. A screen that patched its own copy would disagree with the
		   site by one character until somebody reloaded — so the caller re-reads
		   rather than being handed this form's idea of the document. */
		onDone(r.name || base.name);
	}

	async function destroy() {
		setBusy(true);
		setMsg("");
		const r = await remove(doctype, base.name);
		setBusy(false);
		setConfirming("");
		if (!r.ok) { setMsg(r.error || "The site refused the delete."); return; }
		onDone("");
	}

	/* `foot` rather than `actions`: on this Modal, `actions` is a toolbar at the
	   top of the body and `foot` is the row beside Close, outside the scroll. A
	   Save somebody has to scroll a long form to reach is a dialog that looks
	   stuck — see the note in components/ui.jsx. */
	const buttons = (
		<>
			{deletable.ok ? (
				<button type="button" className="embtn bad" disabled={busy}
					onClick={() => setConfirming(deletable.warn || "This cannot be undone.")}>
					Delete
				</button>
			) : null}
			<button type="button" className="embtn pri"
				disabled={busy || !editable.ok || (!making && !changed) || missing.length > 0}
				onClick={save}>
				{busy ? "Saving…" : making ? "Create" : `Save${changed ? ` · ${changed}` : ""}`}
			</button>
		</>
	);

	const body = (
		<>
			{!editable.ok ? <Gap>{editable.why}</Gap> : null}

			{/* Said before the first box rather than after the refusal. On a master
			    the id is a field on this form, so what somebody types in one box
			    decides what every other record has to name it. */}
			{making && namingField(doctype) ? (
				<Note>
					The <b>{labelOf(spec, namingField(doctype))}</b> is this record's id — other records
					will name it by exactly what is typed there, so it is worth getting right now
					rather than renaming later.
				</Note>
			) : null}

			<div className="recform">
				{formFields(doctype).map((f) => (
					<Field key={f.name} f={f} doctype={doctype} store={s}
						value={value(f)} onChange={(v) => set(f, v)}
						disabled={!editable.ok || busy} />
				))}
			</div>

			{missing.length ? (
				<Note>
					The site will refuse this until <b>{missing.join(", ")}</b>{" "}
					{missing.length === 1 ? "has" : "have"} a value.
				</Note>
			) : null}

			{!deletable.ok && !making && deletable.why ? (
				<Note>
					{/* A reason, not a greyed-out button. A disabled Delete reads as a
					    permission this reader has not got, and every one of these is a
					    decision about the record instead. */}
					<b>This record is not deleted from here.</b> {deletable.why}
				</Note>
			) : null}

		</>
	);

	return (
		<>
			<Modal
				title={making ? `New ${doctype}` : base.name}
				wide
				msg={msg}
				onClose={onCancel}
				extra={body}
				foot={buttons}
			/>
			{confirming ? (
				<Modal
					title={`Delete ${base.name}?`}
					onClose={() => setConfirming("")}
					extra={<p className="text-read">{confirming}</p>}
					foot={
						<button type="button" className="embtn bad" onClick={destroy} disabled={busy}>
							{busy ? "Deleting…" : "Delete it"}
						</button>
					}
				/>
			) : null}
		</>
	);
}

const labelOf = (spec, name) => (spec.fields.find((f) => f.name === name) || {}).label || name;

/** One control, chosen by what the doctype says the field is. */
function Field({ f, doctype, store, value, onChange, disabled }) {
	const id = `rf-${f.name}`;
	const warn = fieldWarning(doctype, f.name);
	const list = LINK_LIST[f.link];
	const opts = list ? (store[list] || []) : [];

	const common = { id, disabled, "aria-describedby": warn ? `${id}-w` : undefined };

	let control;
	if (f.kind === "readonly") {
		control = <span className="ro">{value === "" ? "—" : String(value)}</span>;
	} else if (f.kind === "check") {
		control = (
			<input type="checkbox" {...common} checked={Boolean(Number(value))}
				onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
		);
	} else if (f.kind === "long") {
		control = <textarea rows={3} {...common} value={value} onChange={(e) => onChange(e.target.value)} />;
	} else if (f.kind === "select") {
		control = (
			<select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
				{(f.choices || []).map((c) => <option key={c} value={c}>{c || "—"}</option>)}
			</select>
		);
	} else if (f.kind === "link") {
		control = (
			<>
				<input type="text" {...common} list={opts.length ? `${id}-list` : undefined}
					value={value} onChange={(e) => onChange(e.target.value)} />
				{opts.length ? (
					<datalist id={`${id}-list`}>
						{opts.map((o) => <option key={o.name || o} value={o.name || o} />)}
					</datalist>
				) : null}
			</>
		);
	} else {
		const type = f.kind === "date" ? "date"
			: f.kind === "datetime" ? "datetime-local"
				: f.kind === "time" ? "time"
					: f.kind === "int" || f.kind === "float" || f.kind === "currency" ? "number"
						: f.kind === "password" ? "password" : "text";
		control = (
			<input type={type} {...common}
				step={f.kind === "float" || f.kind === "currency" ? "any" : undefined}
				value={value} onChange={(e) => onChange(e.target.value)} />
		);
	}

	return (
		<label className={"rfield" + (f.kind === "long" ? " wide" : "")} htmlFor={id}>
			<span className="k">
				{f.label}{f.reqd ? <b className="req" aria-hidden="true"> *</b> : null}
			</span>
			{control}
			{f.hint ? <span className="hint">{f.hint}</span> : null}
			{warn ? <span className="hint warn" id={`${id}-w`}><Html html={warn} /></span> : null}
		</label>
	);
}
