import { useMemo, useState } from "react";

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
	"Employee": "employees",
	"Company": "companies",
	"Department": "departments",
	"Designation": "designations",
	"Holiday List": "holidayLists",
	"Shift Type": "shiftTypes",
	"Leave Type": "leaveTypes",
	"Letter Type": "letterTypes",
};

/** How a record reads in that list, where its id is not what anybody knows it
    by. `HR-EMP-00042` is the value the site stores and the thing a person
    filling in a correction has no way to know — so the option carries the name
    and the code, and the datalist matches on either. */
const LINK_LABEL = {
	employees: (o) => [o.employee_name, o.employee_number].filter(Boolean).join(" · "),
};

/* ---------------------------------------------------------------------------
   Fetch-from: the fields a doctype says follow from a Link on the same form.

   `from: "employee.employee_name"` in the schema is Frappe's own `fetch_from`,
   generated straight out of the doctype JSON. The site applies it on save, so
   the *stored* value has never been the problem. What was wrong is what the
   person filling the form sees: on a correction — the doctype whose two fields
   are labelled Punch In and Punch Out — you typed an employee id from memory
   into a box with no list on it, and Name and Company sat at "—" until after
   you had saved. There was nothing on the screen that said which person the
   punches you were about to write would belong to, on a form whose whole
   purpose is writing somebody a punch they will be paid for.

   Resolved out of the store rather than by asking the site, because the store
   already holds every employee and a read per keystroke is a read per keystroke.
   Where this app holds no list for the link — `Employee Loan Type`, `Employee
   Document Type` — nothing is filled and the field stays as it was; the site
   still fills it on save, which is the arrangement everywhere else here too.
   --------------------------------------------------------------------------- */

/** `{ sourceField: [[targetField, propertyOnTheSource], …] }` for one doctype. */
function fetchMap(doctype) {
	const out = {};
	for (const f of (SCHEMA[doctype] || {}).fields || []) {
		if (!f.from) continue;
		const [src, prop] = String(f.from).split(".");
		if (!src || !prop) continue;
		(out[src] = out[src] || []).push([f.name, prop]);
	}
	return out;
}

/** What changing `field` to `value` fills in beside it.

    An id this app cannot resolve empties the fields that followed from the old
    one rather than leaving them: a correction showing the previous person's
    name beside a new employee id is worse than one showing nothing, because it
    reads as confirmation. */
function derived(doctype, store, field, value) {
	const targets = fetchMap(doctype)[field];
	if (!targets) return {};

	const spec = (SCHEMA[doctype] || {}).fields || [];
	const link = (spec.find((f) => f.name === field) || {}).link;
	const rows = store[LINK_LIST[link]] || [];
	const row = value ? rows.find((o) => o.name === value) : null;

	const out = {};
	for (const [target, prop] of targets) out[target] = row ? (row[prop] ?? "") : "";
	return out;
}

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
	/* One `setDraft`, not two: the link and everything that follows from it are
	   one change, and applying them in two calls would render the form once with
	   the new employee beside the old employee's name. */
	const set = (f, v) => setDraft((d) => ({ ...d, [f.name]: v, ...derived(doctype, s, f.name, v) }));

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

	/* Memoised on the list itself. This form re-renders on every keystroke in
	   any box, and a site with a factory on it puts a couple of thousand people
	   in this datalist — rebuilding those elements per character is the kind of
	   slow that gets blamed on the network. Not capped: a picker that quietly
	   omits people is the bug it exists to prevent. */
	const options = useMemo(() => {
		const label = LINK_LABEL[list];
		return opts.map((o) => {
			const v = o.name || o;
			const text = label ? label(o) : "";
			return <option key={v} value={v}>{text || undefined}</option>;
		});
	}, [opts, list]);

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
				{opts.length ? <datalist id={`${id}-list`}>{options}</datalist> : null}
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
