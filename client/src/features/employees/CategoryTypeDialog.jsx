import { patch, set, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { deskCustomize } from "@/lib/desk";
import {
	CT_CUSTOM_WHY, CT_EDIT_WHY, CT_FORM, CT_PARENTS, CT_RCD, CT_VIEW_WHY, CT_VISIBLE,
	catValues, ctTypes, fieldnameFor,
} from "@/data/categorytype";
import { fmt } from "@/lib/format";
import { active } from "@/lib/scope";

/* ---------------------------------------------------------------------------
   **View Category Type** and **Edit Category Type** — the two dialogs behind
   the ⓘ and ✎ on each row of Employees → Categories, photographed 5 September
   2026 and drawn control for control.

   ## One component, two modes

   They are the same form with the boxes off or on, so they are one component
   with a `mode`. Two files would be two layouts, and a read-only copy that has
   fallen one field behind the editable one is a form nobody can check anything
   against — which is the whole job of a View dialog.

   The mapping table is `data/categorytype.js` and every field's `why` comes off
   it, so all three dialogs on this screen — Create, View, Edit — say the same
   thing about the same control.

   ## What View can honestly show, and what it cannot

   Almost nothing, and the dashes are the finding rather than a gap in the work.
   Factor HR's Category Type is a row on a master this site has no equivalent
   of: Report Display Priority, Prompt On Change, Add Category Code In Reports
   and the rest live over there and are not derivable from anything here. So
   they read as "—" with the reason on each.

   What *is* known goes underneath, because a dialog of twelve dashes helps
   nobody: which doctype the values live in, how many there are, and how many of
   the active people carry one. That half is real and it is the half somebody
   opening this actually wants.

   ## What Edit's Save does, and the trap it avoids

   The properties that have somewhere to land here — label, prompt, mandatory,
   visible, filter — are properties of the **field on `Employee`** that this
   category reads onto, and Frappe writes those through **Customize Form** as
   Property Setters. So Save opens Customize Form for `Employee`, on the site.

   It deliberately does *not* open `Custom Field/new` the way + Add does. That
   route is for a category with no field on this side; sending an *edit* down it
   adds a second `department` to Employee beside the one already there, and both
   look like real fields to every import, report and read afterwards.

   A category type with no field at all — the two pay rules — has neither
   destination, and Save says so rather than picking one.
   --------------------------------------------------------------------------- */

/** One labelled control, in their three-column head.

    `off` is a control with nothing on this side, and it is drawn dimmed in both
    modes rather than hidden in one: a form that shows eleven boxes to read and
    twelve to fill is a form whose two halves cannot be compared. */
function Field({ row, mode, children }) {
	const off = row.state === "build";
	return (
		<div className={"ctf" + (off ? " off" : "")}>
			<label className="k" htmlFor={"ctd_" + row.key} title={row.why}>
				{row.label}{row.req && mode === "edit" ? <b className="ctreq"> *</b> : null}
			</label>
			{children}
			{off ? <span className="hint" title={row.why}>no field on the site</span> : null}
		</div>
	);
}

/** A value in read-only mode. An em dash where there is nothing, never an empty
    line: a blank beside a label reads as a value somebody failed to load, and a
    dash reads as a value that is not there. Different claims. */
const Val = ({ v, title }) => (
	<span className={"ctv" + (v === "" || v == null ? " none" : "")} title={title}>
		{v === "" || v == null ? "—" : v}
	</span>
);

/** Their Report Category Display: a closed box that opens onto six tick boxes.

    Exported, because all three dialogs on this screen draw it — Create, View
    and Edit — and the six were unknown when Create was written. Parameterised
    on the value and two callbacks rather than reaching into a store key, so the
    two dialogs can keep their own state and still be one control.

    Built on `.empdrop` / `.emmenu`, which is what every other menu on this
    dashboard is built on and brings two things a fresh pair of classes would
    have to re-earn — `.emmenu[hidden]` really hides, and the document handler
    in App.jsx leaves `.empdrop` alone so a click elsewhere closes it while the
    click that opens it does not. That handler has to be told about `rcdopen`;
    it is. */
export function RcdPicker({ on, open, onToggle, onOpen, readOnly }) {
	const label = on.length ? `${on.length} of ${CT_RCD.length} selected` : "Report Category Display";
	const toggle = (name) => onToggle(on.includes(name) ? on.filter((x) => x !== name) : on.concat(name));

	if (readOnly) {
		/* Nothing has ever been read into this on our side, so the read-only
		   form draws the control their screenshot shows — closed, and inert. */
		return (
			<span className="empdrop">
				<button type="button" className="ctsel" disabled title={CT_VIEW_WHY}>
					Report Category Display <b className="cx" aria-hidden="true">▾</b>
				</button>
			</span>
		);
	}

	return (
		<span className="empdrop">
			<button
				type="button"
				className="ctsel"
				id="ctd_rcd"
				aria-haspopup="listbox"
				aria-expanded={open}
				/* Off the document handler in App, which would otherwise close the
				   list in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); onOpen(!open); }}
			>
				{label} <b className="cx" aria-hidden="true">▾</b>
			</button>
			<div className="emmenu ctrcd" role="listbox" aria-multiselectable="true"
				aria-label="Report Category Display" hidden={!open}>
				{CT_RCD.map((name) => (
					<label key={name} className="ctchk" role="option" aria-selected={on.includes(name)}>
						<input type="checkbox" checked={on.includes(name)}
							onChange={() => toggle(name)} />
						{name}
					</label>
				))}
			</div>
		</span>
	);
}

/** What Save will put in `description`: the prompt message, then every answer
    this form took that has nowhere to go.

    The same bargain Create Category Type makes, and for the same reason — a
    form that quietly rewrites what somebody typed into a comment is worse than
    one that refuses, so the exact string is on the dialog before anything
    opens. */
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
			"Asked for on Factor HR's Category Type and not held by a field here — "
			+ spare.map(([k, v]) => `${k}: ${v}`).join("; ") + ".",
		);
	}
	return lines.join(" ");
}

export default function CategoryTypeDialog({ onClose }) {
	const s = useApp();
	const c = s.catdlg;
	const f = c.f;
	const view = c.mode === "view";

	/* The same list the screen draws — theirs and the ones created here — found
	   on `key`, because two rows may carry the same label and only one of them is
	   the row somebody clicked. Falling back to their first row rather than to
	   nothing: a dialog that renders blank when a lookup misses is a dialog that
	   hides the miss. */
	const types = ctTypes(s);
	const t = types.find((x) => x.key === (c.key || c.name)) || types[0];
	const rows = catValues(s, t);
	const a = active(s);
	const held = t.field ? a.filter((e) => e[t.field]).length : 0;

	const setF = (part) => patch("catdlg", { f: { ...f, ...part }, msg: "" });
	const setCustom = (list) => patch("catdlg", { custom: list, msg: "" });

	const values = c.custom.map((v) => v.trim()).filter(Boolean);
	const description = describe(f, c.rcd);

	/* The two destinations, and only one of them can be right — see the note at
	   the top of this file. A category type that reads onto a field is edited
	   through Customize Form; one that reads onto nothing has no field to
	   customise, and creating one would be + Add's job rather than Edit's. */
	const href = t.field && s.site ? deskCustomize(s.site, "Employee") : "";
	const dead = t.field
		? undefined
		: `${t.name} reads onto no field on this side — it is a pay rule filed as a category over `
			+ "there, so there is no field whose properties this could change. See View Category.";

	const grid = CT_FORM.filter((r) => r.where === "grid");
	const checks = CT_FORM.filter((r) => r.where === "check");
	const wide = CT_FORM.filter((r) => r.where === "wide");

	/** A tick box, live in Edit and inert in View. `disabled` rather than
	    absent, because their read-only screen draws all four and the ticked one
	    is the value being read. */
	const Check = ({ row }) => (
		<label className={"ctchk" + (row.state === "build" ? " off" : "")} title={row.why}>
			<input type="checkbox" checked={Boolean(f[row.key])} disabled={view}
				onChange={(e) => setF({ [row.key]: e.target.checked })} />
			{row.label}
		</label>
	);

	return (
		<Modal
			title={view ? "View Category Type" : "Edit Category Type"}
			wide
			extra={
				<div className={"ctform" + (view ? " ro" : "")}>
					<div className="ctgrid">
						{grid.map((r) => (
							<Field key={r.key} row={r} mode={c.mode}>
								{r.key === "rcd" ? (
									<RcdPicker
										on={c.rcd}
										open={c.rcdopen}
										readOnly={view}
										onToggle={(rcd) => patch("catdlg", { rcd, msg: "" })}
										onOpen={(rcdopen) => patch("catdlg", { rcdopen })}
									/>
								) : view ? (
									<Val v={r.kind === "check" ? (f[r.key] ? "true" : "false") : f[r.key]}
										title={r.state === "build" ? r.why : undefined} />
								) : r.key === "parent" ? (
									<select id="ctd_parent" value={f.parent}
										onChange={(e) => setF({ parent: e.target.value })}>
										<option value="" />
										{CT_PARENTS.map((p) => <option key={p}>{p}</option>)}
									</select>
								) : r.key === "visible" ? (
									<select id="ctd_visible" value={f.visible}
										onChange={(e) => setF({ visible: e.target.value })}>
										{CT_VISIBLE.map((v) => <option key={v}>{v}</option>)}
									</select>
								) : r.kind === "number" ? (
									<input id={"ctd_" + r.key} type="number" value={f[r.key]}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								) : (
									<input id={"ctd_" + r.key} value={f[r.key]}
										onChange={(e) => setF({ [r.key]: e.target.value })} />
								)}
								{/* What Code becomes, as it is typed — the prefix and the
								    lower-casing are not obvious and not negotiable. Only in
								    Edit: on the read-only form it would be a claim about a
								    field that does not exist. */}
								{!view && r.key === "code" && fieldnameFor(f.code) ? (
									<span className="hint mono" title="What Frappe would store it as.">
										{fieldnameFor(f.code)}
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

					{/* Their Custom Field table. In View it is a list; in Edit it is
					    their column of boxes with a bin on each and an Add New under
					    them — the same table Create Category Type draws. */}
					<div className="cttable">
						<div className="cthead">
							<span>Custom Field</span>
							{!view ? <span className="act">Action</span> : null}
						</div>
						{c.custom.length === 0 ? (
							<div className="ctnone">No Custom Field Available</div>
						) : view ? (
							c.custom.map((v, i) => (
								<div className="ctrow" key={i}><span className="ctv">{v}</span></div>
							))
						) : (
							c.custom.map((v, i) => (
								<div className="ctrow" key={i}>
									<input value={v} aria-label={`Custom field ${i + 1}`}
										onChange={(e) => setCustom(c.custom.map((x, j) => (j === i ? e.target.value : x)))} />
									<button className="ctbin" aria-label={`Remove custom field ${i + 1}`}
										title="Remove this row."
										onClick={() => setCustom(c.custom.filter((_, j) => j !== i))}>
										<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
											strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
											<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
										</svg>
									</button>
								</div>
							))
						)}
						{!view ? (
							<button className="ctadd" onClick={() => setCustom(c.custom.concat(""))}>
								<span aria-hidden="true">⊕</span> Add New
							</button>
						) : null}
					</div>
					<p className="hint">{CT_CUSTOM_WHY}</p>

					{/* The half of this record that is real, under the half that is
					    dashes. A dialog of twelve dashes helps nobody; what this side
					    knows about the category is worth more than what Factor HR's
					    master would have said about it. */}
					<div className="ctknown">
						<div className="rows">
							<div className="row">
								<span>Reads onto</span>
								<span className="val">{t.field ? `Employee.${t.field}` : "no field"}</span>
							</div>
							<div className="row">
								<span>Values on the site</span>
								<span className="val">{t.dt ? fmt(rows.length) : "—"}</span>
							</div>
							<div className="row">
								<span>Active people carrying one</span>
								<span className="val">{t.field ? `${fmt(held)} of ${fmt(a.length)}` : "—"}</span>
							</div>
						</div>
						<p className="hint">{view ? CT_VIEW_WHY : CT_EDIT_WHY}</p>
					</div>

					{c.msg ? <div className="note">{c.msg}</div> : null}

					{!view ? (
						<details className="ctwhat">
								<summary>
									What Save opens, and what it carries
								</summary>
								<pre className="mono">
									{[
										`route          = Customize Form → Employee`,
										`field          = ${t.field || "(none)"}`,
										`label          = ${f.desc.trim()}`,
										`reqd           = ${f.mandatory ? 1 : 0}`,
										`hidden         = ${f.visible === "false" ? 1 : 0}`,
										`in_standard_filter = ${f.nofilter ? 0 : 1}`,
										description ? `description    = ${description}` : "",
										values.length ? `values         = ${values.length} on the site` : "",
									].filter(Boolean).join("\n")}
								</pre>
								<p>
									Changing a field's properties changes the shape of every Employee record on the
									site, so it is done there rather than here — this API's whole security model is
									an allowlist of fields, and a dashboard that could change one could walk round
									it. Customize Form writes these as Property Setters, which is the same thing an
									upgrade knows how to leave alone.
								</p>
						</details>
					) : null}
				</div>
			}
			/* Their Save sits beside Close at the foot of the dialog, outside the
			   scrolling middle — see the note on `.foot` in ui.jsx. On the
			   read-only form the same place holds the way into the editable one,
			   because that is what somebody who has just read it wants next. */
			foot={view ? (
				<button type="button" className="btn tpl"
					title="Open the same category type with its boxes live."
					onClick={() => set({ catdlg: { ...c, mode: "edit", rcdopen: false, msg: "" } })}>
					Edit
				</button>
			) : (
				<Desk className="btn tpl" href={href} dead={dead}
					title="Opens Frappe's Customize Form for Employee on the site, where a field's label, prompt, mandatory, hidden and filter properties are set.">
					Save
				</Desk>
			)}
			onClose={onClose}
		/>
	);
}
