import { getState, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { loadOnBoard } from "@/api/load";
import { forgetEmployeeDoc, useEmployeeDoc } from "@/features/employees/useEmployeeDoc";
import { scoped } from "@/lib/scope";
import { clock, dmy, filled, fmt, initials, tidyDept } from "@/lib/format";
import { Fragment, useEffect, useState } from "react";

import { Desk, Empty, Html, Scroll } from "@/components/ui";
import { saveEmployee } from "@/api/employee";
import {
	CHOICES, LINK_LISTS, boxValue, changedCount, controlFor, patchFrom, whyNotEditable, withEdit,
} from "@/lib/profedit";
import { deskUrl } from "@/lib/desk";
import People from "@/components/People";
import { LocCell } from "@/components/PunchMap";
import { DATE_FIELD } from "@/data/employees";
import { fieldLabel, PROFILE_CHECKS, PROFILE_CHIPS, PROFILE_FIRST_CHILD, PROFILE_HEAD, PROFILE_LONG, PROFILE_MAPPED, PROFILE_PANES, PROFILE_PLUMBING, PROFILE_TABS } from "@/data/profile";

/* Factor HR's **Employee Profile** — the record page, screenshotted 29 Aug 2026.
   See docs/FACTOHR_SCREENS.md §23 and the field map in `src/data/profile.js`.

   §15 established that Employee Detail is a *report builder* and not a record
   page. This is the record page: the header card, the thirteen-item sidebar,
   and one pane at a time on the right. Clicking a card on Employee Master lands
   here, which is what the → on those cards always looked like it did. */

/** Whether a missing key in this document means anything.

    Frappe's document endpoint returns every column of the doctype, `null`
    included — so a key that is *absent* means the site has no such field, which
    is a different finding from a field that is merely empty and the one this
    screen exists to show. That inference is only safe while nulls are actually
    coming back, so it is checked rather than assumed: a document with no null
    in it anywhere is one we cannot read that way, and every missing key is
    reported as unknown instead. */
const keepsNulls = (doc) => Object.values(doc).some((v) => v === null);

/** The first of a row's fieldnames that holds something, else the first that
    exists at all. Rows carry alternatives because the 25 Aug backfill landed
    Factor HR's own values under `custom_`, beside ERPNext's empty ones. */
function pick(doc, field) {
	const names = field == null ? [] : Array.isArray(field) ? field : [field];
	for (const k of names) {
		const v = doc[k];
		if (v != null && v !== "") return { how: "set", key: k, v };
	}
	for (const k of names) if (k in doc) return { how: "blank", key: k };
	return { how: "absent", key: names[0] || null };
}

/** One value, written the way the rest of the app writes that kind of value. */
function say(key, v) {
	if (PROFILE_CHECKS.has(key)) return v ? "Yes" : "No";
	if (key === "reports_to") return getState().byName[v]?.employee_name || String(v);
	if (key === "department") return tidyDept(v);
	if (key === "ctc") return fmt(v);
	if (DATE_FIELD.test(key)) return dmy(v);
	return String(v);
}

function Field({ doc, row, nulls, edit }) {
	const [label, field, why] = row;
	const got = pick(doc, field);
	const long = got.key && PROFILE_LONG.has(got.key);

	/* In edit mode a field is either a box or the same read-only line it always
	   was, with the reason on it. **A field the site has no column for never
	   gets a box**, and that is the whole reason this screen tells "not set"
	   from "no such field here": Frappe accepts a key its doctype does not have
	   and drops it, so the box would look saved and be gone on reload. */
	if (edit) {
		const kind = controlFor(got.key, got.how);
		if (kind) return <EditField doc={doc} label={label} why={why} field={got.key} kind={kind} edit={edit} />;
	}

	/* Three states, and telling the last two apart is the point of the screen.
	   *Not set* is the migration's finding — it loaded the master and not the
	   paperwork. *No such field* is ERPNext's, and it is a decision waiting to
	   be taken about what Manna needs built. */
	let cls = "v";
	let text;
	let hint = why || undefined;
	if (got.how === "set") {
		text = say(got.key, got.v);
	} else if (got.how === "blank" || (got.how === "absent" && !nulls && field)) {
		cls = "v off";
		text = "not set";
		hint = why || "The field is on this site and nothing is in it.";
	} else {
		cls = "v gone";
		text = field ? "no such field here" : "not on this site";
		hint = why || "ERPNext's Employee has no field by this name.";
	}

	/* Why there is no box here, for somebody looking for one.

	   Only where the row does not already say it. "no such field here" is its
	   own explanation and three of them in a header is three paragraphs saying
	   the same thing — so `absent` keeps its line and carries the rest in the
	   tooltip. What is written out is the case nothing on the row explains:
	   a field that exists, holds a value, and still cannot be typed. */
	const locked = edit ? whyNotEditable(got.key, got.how) : "";
	const sayLocked = locked && got.how !== "absent";

	return (
		<div className={"profield" + (long ? " long" : "") + (locked ? " locked" : "")}>
			<span className="k">{label}</span>
			<span className={cls} title={locked || hint}>{text}</span>
			{sayLocked && <span className="lockwhy">{locked}</span>}
		</div>
	);
}

/** One field as a box.

    Built on `.lvf`, the form field the rest of the app uses, so a profile in
    edit mode looks like Apply Leave rather than like a second design. The
    marker beside the label is the only addition: thirteen panes are one
    document and one Save, so a change made two panes ago has to be findable
    without remembering where it was made. */
function EditField({ doc, label, why, field, kind, edit }) {
	const { draft, lists, onSet } = edit;
	const changed = field in draft;
	const value = changed ? draft[field] : boxValue(doc, field, kind);
	const id = "pe-" + field;
	const put = (v) => onSet(field, v);
	const box = { id, value, onChange: (e) => put(e.target.value) };

	let control;
	if (kind === "check") {
		control = (
			<label className="onoff">
				<input id={id} type="checkbox" checked={!!Number(value)}
					onChange={(e) => put(e.target.checked ? 1 : 0)} />
				<span>{Number(value) ? "Yes" : "No"}</span>
			</label>
		);
	} else if (kind === "long") {
		control = <textarea rows={3} {...box} />;
	} else if (kind === "date") {
		control = <input type="date" {...box} />;
	} else if (kind === "number") {
		control = <input type="number" {...box} />;
	} else if (kind === "choice") {
		control = (
			<select {...box}>
				{CHOICES[field].map((o) => <option key={o} value={o}>{o || "—"}</option>)}
			</select>
		);
	} else if (kind === "employee") {
		/* A real select, because the value is a record id and the screen shows a
		   name. A box that took the name would post the name. */
		control = (
			<select {...box}>
				<option value="">— nobody —</option>
				{lists.employees.map((e) => (
					<option key={e.name} value={e.name}>{e.employee_name || e.name}</option>
				))}
			</select>
		);
	} else if (kind === "link") {
		/* A datalist and not a select: the list this dashboard holds is what one
		   read returned, and a select built from it could not express a
		   department that read did not include. The site refuses a Link that
		   names nothing, which is where that belongs. */
		const listId = "pel-" + field;
		return (
			<div className={"lvf pefield" + (changed ? " changed" : "")}>
				<label className="lab" htmlFor={id}>
					{label}{changed && <i className="dot" title="Changed, not yet saved" />}
				</label>
				<div className="ctl">
					<input type="text" list={listId} {...box} />
					<datalist id={listId}>
						{(lists[LINK_LISTS[field]] || []).map((o) => <option key={o.name} value={o.name} />)}
					</datalist>
				</div>
				<span className="hint">{why || <span className="fn">{field}</span>}</span>
			</div>
		);
	} else {
		control = <input type="text" {...box} />;
	}

	return (
		<div className={"lvf pefield" + (PROFILE_LONG.has(field) ? " wide" : "") + (changed ? " changed" : "")}>
			<label className="lab" htmlFor={id}>
				{label}{changed && <i className="dot" title="Changed, not yet saved" />}
			</label>
			<div className="ctl">{control}</div>
			<span className="hint">{why || <span className="fn">{field}</span>}</span>
		</div>
	);
}

/** One row of the pane list, at either level. */
function Tab({ t, tab, child, assets }) {
	return (
		<button
			className={"protab" + (child ? " pchild" : "")}
			aria-current={tab === t[0] ? "page" : undefined}
			onClick={() => set({ proftab: t[0] })}
		>
			<span className="ico">{t[2]}</span>
			<span className="lb">{t[1]}</span>
			{t[0] === "assets" && assets != null && (
				<span className={"cnt" + (assets ? " hot" : "")}>{assets}</span>
			)}
		</button>
	);
}

/** A pane's card: the heading Factor HR puts there, and its two icons.

    **The pencil edits here now.** It used to open the record on the desk in
    another tab, which answered "where do I change this" with "somewhere else" —
    and left whoever followed it reading a Frappe form laid out nothing like the
    pane they were looking at. It opens the boxes on this page instead.

    One pencil, one edit mode, one Save. The thirteen panes are one document, so
    a pencil per card that saved only its own card would be thirteen writes to
    one record and thirteen chances for one of them to be refused halfway.

    `deskHref` is the record on the site, still — the ✎ on the photograph and
    History both go there, because a photograph is a crop-and-file form the site
    already has and the timeline is a doctype nothing here reads. */
function Card({ title, children, onRefresh, editing, onEdit, deskHref }) {
	return (
		<section className={"procard" + (editing ? " editing" : "")}>
			<header>
				<h3>{title}</h3>
				<span className="proico">
					{!editing && (
						<button title="Edit this record" aria-label="Edit this record" onClick={onEdit}>
							✎
						</button>
					)}
					<button title="Read this record from the site again" aria-label="Reload this record"
						onClick={onRefresh} disabled={editing}>
						↻
					</button>
					<Desk className="" href={deskHref} label="Open on the site"
						title="Open this record on the ERPNext site — the whole form, including what this page does not draw.">
						↗
					</Desk>
				</span>
			</header>
			<div className="probody">{children}</div>
		</section>
	);
}

/** The bar above the pane while the record is being edited.

    Sticky, and it carries the count rather than a bare Save, because the count
    is the only thing that says a change made on another pane is still waiting.
    Somebody who edits Bank on the Salary pane, wanders to Personal Details and
    presses Save should not be surprised by what goes. */
function EditBar({ n, saving, msg, onSave, onCancel }) {
	return (
		<div className="probar" role="region" aria-label="Editing this record">
			<b>Editing</b>
			<span className={"pecount" + (n ? " hot" : "")}>
				{n ? `${n} field${n === 1 ? "" : "s"} changed` : "nothing changed yet"}
			</span>
			{/* Said here rather than only in a tooltip: the write is made as the
			    signed-in person, so what may be changed is what their roles say
			    and a refusal will name the field. CLAUDE.md §1. */}
			<span className="pewho">Saved to the site as you, on the site’s clock.</span>
			<span className="right">
				<button className="embtn" onClick={onCancel} disabled={saving}>Cancel</button>
				<button className="embtn pri" onClick={onSave} disabled={saving || !n}>
					{saving ? "Saving…" : "Save"}
				</button>
			</span>
			{msg && <div className={"pemsg" + (msg.ok ? " ok" : " bad")}>{msg.text}</div>}
		</div>
	);
}

/** A child table off the document. These are the only place the profile can
    show what the report screens cannot: a list call never reaches a child
    table, but the document read this page already makes carries them whole. */
function ChildTable({ doc, spec }) {
	const [field, title, cols] = spec;
	const rows = Array.isArray(doc[field]) ? doc[field] : null;

	if (!rows) {
		return (
			<Empty title={title}>
				This site's <code>Employee</code> has no <code>{field}</code> table.
			</Empty>
		);
	}
	if (!rows.length) {
		return (
			<Empty title={title}>
				The table is on the record and it is empty. That is the migration rather than the screen — it
				loaded the master and not the paperwork behind it.
			</Empty>
		);
	}
	return (
		<Scroll>
			<table style={{ minWidth: 520 }}>
				<thead>
					<tr>
						{cols.map((c) => (
							<th key={c[0]}>{c[1]}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={r.name || i}>
							{cols.map((c) => {
								const v = r[c[0]];
								if (v == null || v === "") return <td className="muted" key={c[0]}>—</td>;
								const isDate = DATE_FIELD.test(c[0]);
								return (
									<td key={c[0]} className={isDate ? "mono" : undefined}>
										{isDate ? dmy(v) : String(v)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

/** Any child table on the record, drawn without a column list.

    `ChildTable` above draws the two tables a pane names, with Factor HR's own
    headings on the columns they chose. This one is for All Fields, where the
    point is that nothing is chosen: the columns are whatever the rows turned
    out to hold, in the order the site returned them. */
function AnyTable({ field, rows }) {
	const cols = [];
	for (const r of rows) {
		for (const k of Object.keys(r)) {
			if (k !== "name" && !PROFILE_PLUMBING.has(k) && !cols.includes(k)) cols.push(k);
		}
	}
	if (!rows.length) {
		return (
			<Empty title={fieldLabel(field)}>
				The table is on the record and it is empty.
			</Empty>
		);
	}
	return (
		<Scroll>
			<table style={{ minWidth: Math.min(1100, 160 * cols.length) }}>
				<thead>
					<tr>{cols.map((c) => <th key={c}>{fieldLabel(c)}</th>)}</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={r.name || i}>
							{cols.map((c) => {
								const v = r[c];
								if (v == null || v === "") return <td className="muted" key={c}>—</td>;
								const isDate = DATE_FIELD.test(c);
								return (
									<td key={c} className={isDate ? "mono" : undefined}>
										{isDate ? dmy(v) : String(v)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

/** The record itself, every column of it.

    **Why this pane exists.** The other thirteen are lists somebody wrote — the
    right shape for a screen that is being compared against Factor HR's, and
    the wrong one for the question "the site holds this, where is it on your
    page". A field nobody mapped is read on every open of this page and drawn
    nowhere, and a custom field added to `Employee` next month would be
    invisible here until somebody edited `data/profile.js`. So this one is
    generated from the document.

    **In the site's own order, not alphabetical.** Frappe builds the document
    in the doctype's field order, so scrolling this pane is walking down the
    form on the site — which is what somebody holding both screens is doing.
    Finding one field is what the search box is for.

    **Empty fields are counted before they are hidden.** Most of a stock
    `Employee` is blank on this site, so showing all of it by default would
    bury the forty that are filled; but "92 empty" is itself the finding this
    whole screen keeps reporting, so the number is on the toggle rather than
    left for somebody to discover by turning it on. */
function AllFields({ doc }) {
	const [q, setQ] = useState("");
	const [empties, setEmpties] = useState(false);

	const entries = Object.entries(doc);
	const tables = entries.filter(([, v]) => Array.isArray(v));
	const plain = entries.filter(([k, v]) => !Array.isArray(v) && !PROFILE_PLUMBING.has(k));
	const plumbing = entries.filter(([k, v]) => !Array.isArray(v) && PROFILE_PLUMBING.has(k));

	const has = (v) => v != null && v !== "";
	const filled = plain.filter(([, v]) => has(v));
	/* Fields on the record that no pane above claims. The count is the honest
	   measure of how much of this person the curated screens leave out, which is
	   why it is said out loud rather than only implied by a marker per row. */
	const spare = filled.filter(([k]) => !PROFILE_MAPPED.has(k));

	const needle = q.trim().toLowerCase();
	/* On the fieldname as well as the label, because somebody comparing this
	   page against the site — or against a script — is holding the fieldname. */
	const match = ([k]) => !needle
		|| k.toLowerCase().includes(needle)
		|| fieldLabel(k).toLowerCase().includes(needle);

	const rows = plain.filter(match).filter(([, v]) => empties || has(v));
	/* Frappe's own columns are filtered by the same box. A search that left
	   seven of them standing under a result of one would read as seven fields
	   that matched. */
	const under = plumbing.filter(match).filter(([, v]) => has(v));

	return (
		<>
			<div className="proall">
				<span className="find">
					<input type="search" value={q} onChange={(e) => setQ(e.target.value)}
						placeholder="Find a field" aria-label="Find a field"
						title="Matches the fieldname as well as the label — the fieldname is what somebody comparing this against the site or against a script is holding." />
				</span>
				<label className="proallck">
					<input type="checkbox" checked={empties} onChange={(e) => setEmpties(e.target.checked)} />
					Show the {fmt(plain.length - filled.length)} empty
				</label>
				<span className="proallsum">
					{fmt(plain.length)} fields, {fmt(filled.length)} filled
					{spare.length
						? <> · <b>{fmt(spare.length)}</b> of them on no pane above</>
						: null}
					{tables.length ? <> · {fmt(tables.length)} child tables</> : null}
				</span>
			</div>

			{rows.length ? (
				<div className="profields">
					{rows.map(([k, v]) => {
						const long = PROFILE_LONG.has(k) || String(v ?? "").length > 90;
						return (
							<div className={"profield" + (long ? " long" : "")} key={k}>
								<span className="k">
									{fieldLabel(k)} <span className="fn">{k}</span>
									{!PROFILE_MAPPED.has(k) && (
										<span className="only" title="No pane above draws this field. It is on the record, and this is the only place on this page it appears.">
											only here
										</span>
									)}
								</span>
								{has(v)
									? <span className="v">{say(k, v)}</span>
									: <span className="v off" title="The field is on this site and nothing is in it.">not set</span>}
							</div>
						);
					})}
				</div>
			) : under.length ? null : (
				<Empty title="Nothing matches">
					No field on this record is called <code>{q}</code>
					{empties ? "" : " and holds anything"}.
				</Empty>
			)}

			{/* Frappe's own columns, under a rule of their own. `modified_by` and
			    `creation` answer "who typed this and when", which is a real question
			    about somebody's record — but listed among their salary and their
			    passport they are noise, so they sit at the foot rather than in the
			    grid above. */}
			{under.length ? (
				<div className="profields mt-[1.1rem] pt-[.9rem] border-t border-line">
					{under.map(([k, v]) => (
						<div className="profield" key={k}>
							<span className="k">
								{fieldLabel(k)} <span className="fn">{k}</span>
							</span>
							<span className="v muted">{String(v)}</span>
						</div>
					))}
				</div>
			) : null}
		</>
	);
}

/** Today's punches for this person, off the same read the dashboard already
    made. Attendance Info. lists the settings; this says whether they worked. */
function TodayPunches({ s, emp }) {
	const mine = s.checkins
		.filter((c) => c.employee === emp)
		.sort((a, b) => String(a.time).localeCompare(String(b.time)));
	if (!mine.length) {
		return;
	}
	return (
		<div className="proline mt-[.7rem]">
			{mine.map((c) => (
				<span className="chip" key={c.name}>
					{clock(c.time)} {c.log_type || "—"} <LocCell r={c} e={s.byName[emp]} compact />
				</span>
			))}
		</div>
	);
}

function AssetsPane({ s, emp }) {
	/* On Board's reads are half a dozen requests against a site with a daily
	   compute limit, so they are made when somebody opens this tab rather than
	   on every page load. */
	useEffect(() => {
		if (!s.onboardRead) void loadOnBoard();
	}, [s.onboardRead]);

	if (!s.onboardRead || s.onboardBusy) return <Empty title="reading the asset register…" />;
	if (s.assetErr) {
		return (
			<Empty title="The asset register could not be read">
				{s.assetErr}
			</Empty>
		);
	}

	const mine = s.assets.filter((a) => a.custodian === emp);
	if (!mine.length) {
		return (
			<Empty title="Nothing issued to this person">
				ERPNext's <code>Asset</code> is installed and empty — {fmt(s.assets.length)} assets on the whole
				site. Factor HR shows 0 here too. Issuing an asset is an Asset Movement, and this page only
				reads.
			</Empty>
		);
	}
	return (
		<Scroll>
			<table style={{ minWidth: 560 }}>
				<thead>
					<tr>
						<th>Asset</th><th>Category</th><th>Status</th><th>Location</th><th>Purchased</th>
					</tr>
				</thead>
				<tbody>
					{mine.map((a) => (
						<tr key={a.name}>
							<td>{a.asset_name || a.name}</td>
							<td className="muted">{a.asset_category || "—"}</td>
							<td>{a.status || "—"}</td>
							<td className="muted">{a.location || "—"}</td>
							<td className="mono muted">{a.purchase_date ? dmy(a.purchase_date) : "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

function Header({ doc, onRefresh, deskHref, editing, edit, onEdit }) {
	const nulls = keepsNulls(doc);
	const on = doc.status === "Active";
	const chip = (row) => {
		const got = pick(doc, row[1]);
		return got.how === "set" ? say(got.key, got.v) : null;
	};

	return (
		<section className="prohead">
			<div className="proava">
				{initials(doc.employee_name)}
				{/* A photograph is filed on the record, and filing one is a write with a
				    crop, a size and a default beside it — which is a form, and the
				    site already has that form. So the ✎ opens it there rather than
				    growing a second one here. */}
				<Desk className="pen" href={deskHref} label="Add a photograph"
					title="Attach a photograph on the ERPNext site, where the form that crops and files one already exists.">
					✎
				</Desk>
			</div>

			<div className="prowho">
				<div className="proname">
					<b>
						{doc.employee_number ? doc.employee_number + " - " : ""}
						{doc.employee_name || doc.name}
					</b>
					<span className="proacts">
						<button className="embtn" title="Read this record from the site again"
							aria-label="Reload this record" onClick={onRefresh}>↻</button>
						<button className="embtn" title="Print this profile" aria-label="Print"
							onClick={() => window.print()}>🖨</button>
						{/* The same edit mode the pencils open, reachable from the top —
						    somebody who came here to change a phone number should not
						    have to find the card it is on first. */}
						{!editing && (
							<button className="embtn" title="Edit this record" onClick={onEdit}>✎ Edit</button>
						)}
						{/* Who changed what lives on the Version doctype, which nothing
						    here reads — but it is also the timeline at the foot of the
						    record on the site, which is where this goes. */}
						<Desk href={deskHref} title="Who changed what, on the ERPNext site — the timeline at the foot of the record, which nothing here reads.">
							History
						</Desk>
					</span>
				</div>

				<div className="prochips">
					<span className="prostat">
						<i className={"sdot " + (on ? "on" : "off")} />
						{doc.status || "—"}
					</span>
					{PROFILE_CHIPS.map((c) => {
						const v = chip(c);
						return (
							<span className={"prochip" + (v ? "" : " off")} key={c[0]}>
								<b>{c[0]}</b> {v || "—"}
							</span>
						);
					})}
					<span className={"prochip" + (doc.designation ? "" : " off")}>
						{(doc.designation || "—").toUpperCase()}
					</span>
					<span className={"prochip" + (doc.department ? "" : " off")}>
						{tidyDept(doc.department).toUpperCase()}
					</span>
					{/* Blank for everybody in Factor HR too — a field nobody there has
					    ever filled, rather than a gap in the migration. */}
					<span className={"prochip" + (doc.branch ? "" : " off")}>{doc.branch || "—"}</span>
				</div>

				<div className={"prokeys" + (editing ? " lvform" : "")}>
					{PROFILE_HEAD.map((row) => (
						<Field doc={doc} row={row} nulls={nulls} edit={edit} key={row[0]} />
					))}
				</div>
			</div>
		</section>
	);
}

export default function EmployeeProfile() {
	const s = useApp();

	const people = scoped(s)
		.slice()
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
	const picked = s.empSel && people.some((p) => p.name === s.empSel) ? s.empSel : "";
	const tab = PROFILE_PANES[s.proftab] ? s.proftab : "about";

	useEmployeeDoc(picked);
	const doc = picked ? s.empDoc[picked] : null;

	const refresh = () => {
		if (picked) forgetEmployeeDoc(picked);
	};

	/* Leaving the record leaves the edit. A draft belongs to one document, and
	   carrying it to the next person would put somebody's typing on somebody
	   else's record — which is the one mistake on this page nothing downstream
	   would catch, because both values are legal. */
	useEffect(() => {
		set({ profedit: false, profdraft: {}, profmsg: "", profsaving: false });
	}, [picked]);

	const startEdit = () => set({ profedit: true, profdraft: {}, profmsg: "" });
	const cancelEdit = () => set({ profedit: false, profdraft: {}, profmsg: "" });

	const onSet = (field, value) =>
		set({ profdraft: withEdit(getState().empDoc[picked] || {}, getState().profdraft, field, value) });

	async function save() {
		const record = getState().empDoc[picked];
		const patch = patchFrom(record, getState().profdraft);
		if (!Object.keys(patch).length) return;

		set({ profsaving: true, profmsg: "" });
		const r = await saveEmployee(picked, patch);
		if (!r.ok) {
			/* The site's own words. A Link that names nothing, a mandatory field,
			   a permission this reader has not got — every one of those is a
			   different thing to do next, and a tidied "could not save" hides
			   which. */
			set({ profsaving: false, profmsg: { ok: false, text: `The site refused this: ${r.error}` } });
			return;
		}
		/* Read the record back rather than patching the copy here. The site names
		   the document, fills what it derives — `employee_name` from the three
		   name parts, the fetch-froms — and normalises what it was sent, and a
		   screen that keeps its own idea of the answer disagrees with the site by
		   one character until somebody reloads. */
		forgetEmployeeDoc(picked);
		set({
			profedit: false,
			profdraft: {},
			profsaving: false,
			profmsg: { ok: true, text: `Saved. ${Object.keys(patch).length} field(s) written to the site.` },
		});
	}

	const chooser = (
		<label className="prochoose">
			Employee{" "}
			<select value={picked} onChange={(e) => set({ empSel: e.target.value })}>
				<option value="">— pick somebody —</option>
				{people.map((p) => (
					<option key={p.name} value={p.name}>
						{p.employee_name} ({p.employee_number || "-"})
					</option>
				))}
			</select>
		</label>
	);

	if (!picked) {
		return (
			<>
				<div className="legend">
					<b className="font-display">Employee Profile</b>
					<span className="cov live">Live</span>
					<span>One person's whole record, in Factor HR's own thirteen panes.</span>
					<span className="right">{chooser}</span>
				</div>
				{/* Their screen opens on whoever was last looked at. Ours cannot know
				    that on a fresh load, so it lists the people it could open instead of
				    asking somebody to go back to another page to choose. */}
				<People people={people}
					note="Click anybody to open their record. The chooser above and the cards on Employee Master do the same thing." />
			</>
		);
	}

	if (!doc) return <Empty title="reading the record…" />;
	if (doc.__err) {
		return (
			<>
				<div className="legend">
					<b className="font-display">Employee Profile</b>
					<span className="right">{chooser}</span>
				</div>
				<div className="gap">
					<b>Could not read {picked}.</b> {String(doc.__err)}
				</div>
			</>
		);
	}

	const pane = PROFILE_PANES[tab];
	const nulls = keepsNulls(doc);
	const assetsMine = s.onboardRead ? s.assets.filter((a) => a.custodian === picked).length : null;
	/* The record on the site. The photograph, History and ↗ open this one
	   document over there; everything this page writes, it writes itself. */
	const deskHref = s.site && picked ? deskUrl(s.site, "Employee", picked) : "";

	const editing = s.profedit;
	/* The one object every box on the page reads. Assembled here so that a card
	   deep in a pane needs no more of this component than "what did somebody
	   type" and "tell me when they type". */
	const edit = editing
		? {
			draft: s.profdraft,
			onSet,
			lists: {
				employees: people,
				companies: s.companies,
				departments: s.departments,
				designations: s.designations,
				holidayLists: s.holidayLists,
				shiftTypes: s.shiftTypes,
			},
		}
		: null;
	const changed = editing ? changedCount(doc, s.profdraft) : 0;
	const card = { onRefresh: refresh, editing, onEdit: startEdit, deskHref };

	return (
		<>
			<div className="legend">
				<button className="embtn" onClick={() => go({ section: "employees", subtab: "overview" })}>
					← Employee Master
				</button>
				<b className="font-display">Employee Profile</b>
				<span className="cov live">Live</span>
				{!nulls && (
					<span>
						This record came back with no empty field in it, so <b>“no such field here”</b> cannot be
						told from “not set” — every gap below is reported as the second.
					</span>
				)}
				<span className="right">{chooser}</span>
			</div>

			<Header doc={doc} onRefresh={refresh} deskHref={deskHref}
				editing={editing} edit={edit} onEdit={startEdit} />

			{/* Outside the pane rather than inside it, because the draft is the
			    whole record: switching panes while editing must not look like the
			    edit ended. */}
			{editing && (
				<EditBar n={changed} saving={s.profsaving} msg={s.profmsg}
					onSave={save} onCancel={cancelEdit} />
			)}
			{!editing && s.profmsg && s.profmsg.ok && (
				<div className="probar done"><span className="pemsg ok">{s.profmsg.text}</span></div>
			)}

			<div className="probody-grid">
				<nav className="protabs" aria-label="Profile sections">
					{PROFILE_TABS.map((t) => {
						const kids = t[3];
						if (!kids) return <Tab t={t} tab={tab} assets={assetsMine} key={t[0]} />;

						const open = s.profopen.includes(t[0]);
						const holds = kids.some((k) => k[0] === tab);
						return (
							<Fragment key={t[0]}>
								<button
									className="protab pgroup"
									aria-expanded={open}
									/* Marked current only while shut: otherwise the group and the
									   child open inside it would both read as selected, and while
									   it is shut nothing else on the list would. */
									aria-current={holds && !open ? "page" : undefined}
									onClick={() =>
										set({
											profopen: open
												? s.profopen.filter((k) => k !== t[0])
												: s.profopen.concat([t[0]]),
											/* Opening lands on the first sub-item, so the click does
											   something on the right as well as on the left. Closing
											   leaves the pane alone \— collapsing a menu is not a
											   request to be taken somewhere else. */
											proftab: open || holds ? tab : PROFILE_FIRST_CHILD[t[0]],
										})
									}
								>
									<span className="ico">{t[2]}</span>
									<span className="lb">{t[1]}</span>
									<span className="caret" aria-hidden="true">{open ? "\u2303" : "\u2304"}</span>
								</button>
								{open && kids.map((k) => <Tab t={k} tab={tab} child key={k[0]} />)}
							</Fragment>
						);
					})}
				</nav>

				<div className="propane">
					{(pane.groups || []).map((g) => (
						<Card key={g[0]} title={g[0]} {...card}>
							<div className={editing ? "lvform" : "profields"}>
								{g[1].map((row) => (
									<Field doc={doc} row={row} nulls={nulls} edit={edit} key={row[0]} />
								))}
							</div>
							{tab === "attendance" && g === pane.groups[0] && (
								<TodayPunches s={s} emp={picked} />
							)}
						</Card>
					))}

					{(pane.tables || []).map((spec) => (
						<Card key={spec[0]} title={spec[1]} {...card}>
							<ChildTable doc={doc} spec={spec} />
						</Card>
					))}

					{tab === "assets" && (
						<Card title="Assets" {...card}>
							<AssetsPane s={s} emp={picked} />
						</Card>
					)}

					{tab === "all" && (
						<>
							<Card title="Every field on this record" {...card}>
								<AllFields doc={doc} />
							</Card>
							{/* Every child table the document carries, including the two a
							    pane above already draws: this pane's promise is the whole
							    record, and a table left out of it because it happens to be
							    drawn elsewhere is exactly the omission somebody comes here
							    to rule out. */}
							{Object.entries(doc)
								.filter(([, v]) => Array.isArray(v))
								.map(([field, rows]) => (
									<Card key={field} title={`${fieldLabel(field)} · ${fmt(rows.length)} rows`}
										{...card}>
										<AnyTable field={field} rows={rows} />
									</Card>
								))}
						</>
					)}

					{/* What this pane is, and where it is a guess rather than a
					    comparison. Written per pane in data/profile.js — several of them
					    are the finding itself, like Separation's "344 people have left
					    and none of them came across". */}
					{pane.note && (
						<div className="pronote">
							<Html html={pane.note} />
						</div>
					)}
				</div>
			</div>
		</>
	);
}
