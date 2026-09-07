import { useState } from "react";

import { patch, set, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { deskNewWith } from "@/lib/desk";
import {
	CT_BLANK, CT_CUSTOM_WHY, CT_FORM, CT_PARENTS, CT_VISIBLE, ctDoc, fieldnameFor,
} from "@/data/categorytype";
import { createCategoryType } from "@/api/categorytype";
import { RcdPicker } from "@/features/employees/CategoryTypeDialog";

/* ---------------------------------------------------------------------------
   **Create Category Type** — behind the + Add on Employees → Categories,
   photographed 4 September 2026 and drawn control for control.

   The argument for every field is in data/categorytype.js, where the mapping
   table is. What is decided here is the layout, the Custom Field table, and
   what Save does.

   ## Save creates the field, on the site, as the person

   Their Category Type is a `Custom Field` on Employee under another name — see
   the table — so Save posts one and the new category appears on the list
   behind this dialog, read back off the site rather than pushed into the store.

   **This was a hand-off to `/app/custom-field/new` and is not any more.** The
   argument for the hand-off was that adding a field to a doctype changes the
   shape of every Employee record on the site, which is true and is why the
   payload is still shown in full before anything is sent. What it got wrong is
   who decides: Frappe refuses a `Custom Field` insert from anybody without
   System Manager, the request carries the person's own session, and the refusal
   arrives here as a sentence this dialog prints. A form that opened a second
   form somewhere else was not adding a check — it was making the person do the
   same typing twice and calling that safety.

   The desk link is still on the dialog, under Save, because there are things
   only the desk can do: place the field after a named one, pick a fieldtype
   this form does not offer, or add it as a System Manager who is not the person
   signed in here.

   ## Six answers land in a field and six land in a sentence

   The six with nothing on this side go into `description` alongside the prompt
   message, as text that says what was asked for, and **the exact string is on
   the dialog before anything opens.** A form that quietly rewrites what
   somebody typed into a comment is worse than one that refuses.
   --------------------------------------------------------------------------- */

/** One labelled control. Their layout puts the label above the box in three
    columns, which is what `.ctgrid` draws. */
function Field({ row, children }) {
	const off = row.state === "build";
	return (
		<div className={"ctf" + (off ? " off" : "")}>
			<label className="k" htmlFor={"ct_" + row.key} title={row.why}>
				{row.label}{row.req ? <b className="ctreq"> *</b> : null}
			</label>
			{children}
			{off ? <span className="hint" title={row.why}>no field on the site</span> : null}
		</div>
	);
}

/** What Save will put in `description`: the prompt message, then every answer
    this form took that has nowhere to go.

    Built once and shown before it is sent, so what the site holds and what
    somebody was told it would hold are the same string. */
function describe(f, rcd) {
	const spare = CT_FORM
		.filter((r) => r.state === "build" && r.key !== "rcd")
		.map((r) => [r.label, r.kind === "check" ? (f[r.key] ? "yes" : "") : String(f[r.key] ?? "").trim()])
		.filter(([, v]) => v !== "");
	if (rcd.length) spare.push(["Report Category Display", rcd.join(", ")]);

	const lines = [];
	if (f.prompt.trim()) lines.push(f.prompt.trim());
	if (spare.length) {
		lines.push(
			"Asked for on Factor HR's Create Category Type and not held by a Custom Field — "
			+ spare.map(([k, v]) => `${k}: ${v}`).join("; ") + ".",
		);
	}
	return lines.join(" ");
}

export default function CreateCategoryType({ onClose }) {
	const s = useApp();
	const c = s.catnew;
	const f = c.f;

	/* Local, unlike everything the person typed: a re-render must not be able to
	   lose a half-filled form, and it may certainly lose the fact that a request
	   was in flight — because this dialog unmounts when that request succeeds. */
	const [busy, setBusy] = useState(false);

	const setF = (part) => patch("catnew", { f: { ...f, ...part }, msg: "", bad: false });
	const setCustom = (rows) => patch("catnew", { custom: rows, msg: "", bad: false });

	/* An empty row is not a value. Dropped here rather than on the way out, so
	   the count on the dialog and the options on the site are the same list. */
	const values = c.custom.map((v) => v.trim()).filter(Boolean);
	const fieldname = fieldnameFor(f.code);
	const description = describe(f, c.rcd);

	/* One expression, in data/categorytype.js — so what the panel below previews
	   is the object that goes over the wire rather than a second copy of it built
	   to look like one. */
	const doc = ctDoc(f, values, description);

	/* A name the site already holds. Caught here rather than left to the round
	   trip because Frappe's refusal for this names the *document* —
	   "Employee-custom_cat_grade already exists" — which reads as a system fault
	   rather than as "you already have a category called Grade". */
	const taken = Boolean(fieldname)
		&& (s.empFields || []).some((cf) => cf.fieldname === fieldname);

	const bad = !f.code.trim()
		? "Code is what becomes the fieldname, and a field with no name cannot be created."
		: taken
			? `This site already holds a category type stored as ${fieldname}. Open that one from the list `
				+ "rather than adding a second field beside it — two fields meaning the same thing is how "
				+ "half the company ends up filed under the other one."
			: "";

	/** Save. The field is created on the site, as the signed-in person, under
	    the site's own permissions: Frappe refuses a `Custom Field` insert to
	    anybody without System Manager, and that refusal is printed rather than
	    swallowed or pre-empted by a check of our own. */
	async function save() {
		if (bad || busy) return;
		setBusy(true);
		patch("catnew", { msg: "", bad: false });
		try {
			const made = await createCategoryType(f, values, description);
			/* Closed on success, with the note left on the list rather than in a
			   dialog nobody is looking at any more — the point of the note is the
			   new row underneath it. `CT_BLANK()` rather than a cleared copy of
			   this one, so the next + Add opens the form somebody expects. */
			set({
				catnew: { ...CT_BLANK(), open: false },
				catmsg: `Created ${doc.label} on Employee as ${fieldname}`
					+ (values.length ? ` with ${values.length} value(s)` : " — free text, no value list")
					+ `${made && made.name ? ` (${made.name})` : ""}. It is on this list now.`,
			});
		} catch (e) {
			/* As the site said it, trimmed but not reworded. A refusal here is
			   almost always permissions or one of Frappe's own validation rules,
			   and both are answers somebody can act on — unlike "could not save". */
			patch("catnew", { msg: String((e && e.message) || e).slice(0, 300), bad: true });
		}
		setBusy(false);
	}

	const href = !bad && s.site ? deskNewWith(s.site, "Custom Field", doc) : "";

	const grid = CT_FORM.filter((r) => r.where === "grid");
	const checks = CT_FORM.filter((r) => r.where === "check");
	const wide = CT_FORM.filter((r) => r.where === "wide");

	const Check = ({ row }) => (
		<label className={"ctchk" + (row.state === "build" ? " off" : "")} title={row.why}>
			<input type="checkbox" checked={f[row.key]}
				onChange={(e) => setF({ [row.key]: e.target.checked })} />
			{row.label}
		</label>
	);

	return (
		<Modal
			title="Create Category Type"
			wide
			extra={
				<div className="ctform">
					<div className="ctgrid">
						{grid.map((r) => (
							<Field key={r.key} row={r}>
								{r.key === "parent" ? (
									<select id="ct_parent" value={f.parent}
										onChange={(e) => setF({ parent: e.target.value })}>
										<option value="" />
										{CT_PARENTS.map((p) => <option key={p}>{p}</option>)}
									</select>
								) : r.key === "visible" ? (
									<select id="ct_visible" value={f.visible}
										onChange={(e) => setF({ visible: e.target.value })}>
										{CT_VISIBLE.map((v) => <option key={v}>{v}</option>)}
									</select>
								) : r.key === "rcd" ? (
									/* It was drawn closed and inert here, on the argument that a
									   list invented for it would be a guess. The list was
									   screenshotted on 5 September 2026 — see CT_RCD — so it is
									   live, and what it collects goes into the description with
									   the other five that have nowhere to land. */
									<RcdPicker
										on={c.rcd}
										open={c.rcdopen}
										onToggle={(rcd) => patch("catnew", { rcd, msg: "" })}
										onOpen={(rcdopen) => patch("catnew", { rcdopen })}
									/>
								) : r.kind === "number" ? (
									<input id={"ct_" + r.key} type="number" value={f[r.key]}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								) : (
									<input id={"ct_" + r.key} value={f[r.key]}
										aria-invalid={r.key === "code" && bad ? "true" : undefined}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								)}
								{/* What Code becomes, as it is typed. The prefix and the
								    lower-casing are not obvious and are not negotiable — see
								    `fieldnameFor` — so they are shown rather than applied
								    behind somebody's back. */}
								{r.key === "code" && fieldname ? (
									<span className="hint mono" title="What Frappe will store it as.">
										{fieldname}
									</span>
								) : null}
							</Field>
						))}
					</div>

					<div className="ctchecks">
						{checks.map((r) => <Check key={r.key} row={r} />)}
					</div>
					<div className="ctchecks">
						{wide.map((r) => <Check key={r.key} row={r} />)}
					</div>

					{/* Their Custom Field table: a column of boxes, a bin on each row,
					    and Add New under them. */}
					<div className="cttable">
						<div className="cthead">
							<span>Custom Field</span>
							<span className="act">Action</span>
						</div>
						{c.custom.map((v, i) => (
							<div className="ctrow" key={i}>
								<input value={v} aria-label={`Custom field ${i + 1}`}
									onChange={(e) => setCustom(c.custom.map((x, j) => (j === i ? e.target.value : x)))} />
								{/* Their bin. It removes the row rather than clearing it — and
								    on the last one it clears instead, because a table with no
								    rows at all has no Add New to get back from. */}
								<button className="ctbin" aria-label={`Remove custom field ${i + 1}`}
									title={c.custom.length > 1 ? "Remove this row." : "Clear this row — it is the only one."}
									onClick={() => setCustom(c.custom.length > 1
										? c.custom.filter((_, j) => j !== i)
										: [""])}>
									<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
										strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
										<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
									</svg>
								</button>
							</div>
						))}
						<button className="ctadd" onClick={() => setCustom(c.custom.concat(""))}>
							<span aria-hidden="true">⊕</span> Add New
						</button>
					</div>
					<p className="hint">{CT_CUSTOM_WHY}</p>

					{/* A refusal is not a note. `bad` is what the site said no to and it
					    is the one thing on this dialog somebody has to read, so it is
					    announced to a screen reader rather than only coloured. */}
					{c.msg ? (
						<div className={c.bad ? "gap" : "note"} role={c.bad ? "alert" : undefined}>
							{c.msg}
						</div>
					) : null}
					{bad ? <p className="hint">{bad}</p> : null}

					{/* What the site will actually hold, before anything opens. */}
					<details className="ctwhat">
						<summary>
							What the site will hold — a <b>Custom Field</b> on Employee
							{values.length ? <> with {values.length} option(s)</> : <> as free text</>}
						</summary>
						{/* A <pre>, not a <dd>: this is the document as it will be sent,
						    newlines and all, and a `dd` outside a `dl` is markup that
						    happens to render rather than markup that means anything. */}
						<pre className="mono">
							{Object.entries(doc).map(([k, v]) =>
								`${k} = ${String(v).replace(/\n/g, " | ")}`).join("\n")}
						</pre>
						<p>
							Adding a field changes the shape of every Employee record on the site, which is why the
							whole document is printed here before anything is sent. It goes as you, on your own
							session, and the site decides: Frappe refuses a Custom Field to anybody without System
							Manager, and whatever it says comes back onto this dialog.
						</p>
					</details>

				</div>
			}
			/* Their Save sits beside Close at the foot of the dialog, outside the
			   scrolling middle. It was the last thing inside the body until
			   5 September 2026, which put it under however tall this form happened
			   to be — and a Save somebody has to scroll to find is a dialog that
			   looks stuck. Their Close is the Modal shell's own; one Close, not
			   two, which is the same call the report scheduler makes. */
			foot={
				<>
					<button className="btn tpl" onClick={save} disabled={Boolean(bad) || busy}
						title={bad || "Create the field on the site, as you. The new category appears on the list behind this dialog."}>
						{busy ? "Saving…" : "Save"}
					</button>
					{/* The desk, still, and not as a fallback: it can place the field
					    after a named one, offer a fieldtype this form does not, and be
					    used by a System Manager who is not the person signed in here. */}
					<Desk className="btn ghost" href={href}
						dead={bad || undefined}
						title="Opens Frappe's own Custom Field form on the site with these answers already in it — for the things this form does not ask, such as which field it sits after.">
						Open on the site
					</Desk>
				</>
			}
			onClose={onClose}
		/>
	);
}
