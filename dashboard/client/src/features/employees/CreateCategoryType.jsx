import { patch, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { deskNewWith } from "@/lib/desk";
import {
	CT_CUSTOM_WHY, CT_FORM, CT_PARENTS, CT_VISIBLE, fieldnameFor,
} from "@/data/categorytype";

/* ---------------------------------------------------------------------------
   **Create Category Type** — behind the + Add on Employees → Categories,
   photographed 4 September 2026 and drawn control for control.

   The argument for every field is in data/categorytype.js, where the mapping
   table is. What is decided here is the layout, the Custom Field table, and
   what Save does.

   ## Save opens Frappe's own form

   Their Category Type is a `Custom Field` on Employee under another name — see
   the table — so Save hands the answers to `/app/custom-field/new` through
   `deskNewWith`, the same hand-off Create Letter, the asset forms and the
   report scheduler make. The field is created on the site, by whoever is logged
   in there, under the site's validation.

   That is not a fallback here, it is the only honest answer twice over. Adding
   a field to a doctype changes the shape of every Employee record on the site
   and every read this dashboard makes of one; it is a schema change, and a
   schema change from a dashboard button — over an API whose whole security
   model is an allowlist of *fields* — would be the one write that could
   invalidate the allowlist itself.

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
function describe(f) {
	const spare = CT_FORM
		.filter((r) => r.state === "build")
		.map((r) => [r.label, r.kind === "check" ? (f[r.key] ? "yes" : "") : String(f[r.key] ?? "").trim()])
		.filter(([, v]) => v !== "");

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

	const setF = (part) => patch("catnew", { f: { ...f, ...part }, msg: "" });
	const setCustom = (rows) => patch("catnew", { custom: rows, msg: "" });

	/* An empty row is not a value. Dropped here rather than on the way out, so
	   the count on the dialog and the options on the site are the same list. */
	const values = c.custom.map((v) => v.trim()).filter(Boolean);
	const fieldname = fieldnameFor(f.code);
	const description = describe(f);

	/* A field with values is a Select and one without is free text, which is
	   what an empty table honestly means rather than an unfinished form. */
	const fieldtype = values.length ? "Select" : "Data";

	const values_ = values.join("\n");
	const doc = {
		dt: "Employee",
		fieldname,
		label: f.desc.trim() || f.code.trim(),
		fieldtype,
		...(values.length ? { options: values_ } : {}),
		reqd: f.mandatory ? 1 : 0,
		/* Both inverted — see `invert` on the two rows in CT_FORM. */
		hidden: f.visible === "false" ? 1 : 0,
		in_standard_filter: f.nofilter ? 0 : 1,
		...(description ? { description } : {}),
	};

	const bad = !f.code.trim()
		? "Code is what becomes the fieldname, and a field with no name cannot be created."
		: "";
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
									/* Closed in their capture, so it is closed here. A list
									   invented for it would be a guess wired to a schema change. */
									<select id="ct_rcd" disabled title={r.why}>
										<option>Report Category Display</option>
									</select>
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

					{c.msg ? <div className="note">{c.msg}</div> : null}

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
							Adding a field changes the shape of every Employee record on the site, so it is done
							there rather than here — this API's whole security model is an allowlist of fields,
							and a dashboard that could add one could walk round it.
						</p>
					</details>

					<div className="ctacts">
						<Desk className="btn tpl" href={href}
							dead={bad || undefined}
							title="Opens Frappe's Custom Field form on the site with these answers already in it. The field is created there, under the site's own validation.">
							Save
						</Desk>
						{/* Their second button is Close, and the Modal shell already draws
						    one under every dialog in this app. One Close, not two — the
						    same call the report scheduler makes. */}
					</div>
				</div>
			}
			onClose={onClose}
		/>
	);
}
