import { fmt, tally, tidyDept } from "@/lib/format";
import { Fragment } from "react";
import {
	CAT_TEMPLATE_DEAD, FH_CATEGORY_TYPES, FH_CAT_SEEN, FH_CAT_TOTAL, IMPORT_MENU,
} from "@/data/masters";
import { Bars, Desk, Empty, Gap, Html, ImportMenu, Note, Scroll } from "@/components/ui";

import { active } from "@/lib/scope";
import { set, useApp } from "@/store";
import { deskImport, deskNew, deskSlug, deskUrl } from "@/lib/desk";
import { download, toCsv } from "@/lib/csv";
import { todayIso } from "@/lib/format";
import { load } from "@/api/load";
import CreateCategoryType from "@/features/employees/CreateCategoryType";
import { CT_ADD_WHY, CT_BLANK } from "@/data/categorytype";

/* Factor HR's Categories, photographed 28 August 2026 — and it is not the
   screen the name suggested. Behind that menu item is `Category Type`: a master
   of masters, eight rows, each holding its own value list behind a View
   Category button.

   The controls divide three ways, and the division is the point. Search, View
   Category and Refresh act on what is on this page, so they work here. Add,
   Edit and Import act on a master, and a master is a document on the site — so
   they open it there rather than pretending to do it in a browser tab. Delete
   and the pager can do neither, and say so.

   `dt` on a category type is the doctype its values live in on our side. The
   two without one are not lists at all; they are pay rules, which is the whole
   finding of this screen. */

const DEL_DEAD = "There is no Category Type on our side to delete — those eight rows are Factor HR's own master. "
	+ "What each maps to here is a field on Employee, or a rule, and deleting the doctype behind one is a different act entirely.";

const NO_MASTER = "This one has no master on our side to open: it is statutory pay treatment filed as a category over there, "
	+ "and a rule here. View Category says what it would have to be rebuilt as.";

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

/** A row action that cannot be done anywhere — drawn where Factor HR draws it,
    with the reason on it. The other two in that cell do work. */
const Act = ({ d, l, why }) => (
	<span className="fhact" role="img" aria-label={`${l}, not available here`} title={why}>
		<Ic d={d} />
	</span>
);

/** What one View Category opens, answered off our records rather than off a
    category master, because we have no category master — the values are
    whatever the people actually carry. */
function CatValues({ t, s }) {
	const a = active(s);

	if (!t.field) {
		return (
			<>
				<div className="lead">
					<Html html={t.why || ""} />
				</div>
				<Gap>
					<Html html={t.miss || ""} />
				</Gap>
			</>
		);
	}

	const field = t.field;
	const held = a.filter((e) => e[field]);
	const used = tally(held, field)
		.map((r) => [field === "department" ? tidyDept(r[0]) : r[0], r[1]]);
	const defined = t.count ? s.counts[t.count] : null;

	return (
		<>
			<div className="lead">
				<b>{t.name}</b> reads onto <Html html={t.maps || ""} />. There is no category master on our
				side, so these are the values the {fmt(a.length)} active records carry — counted off the
				people rather than off a list.
			</div>
			{used.length ? (
				<>
					<Bars pairs={used.slice(0, 10)} />
					{used.length > 10 && <div className="cnt mt-[.4rem]">and {used.length - 10} more</div>}
					<div className="rows mt-[.7rem]">
						<div className="row">
							<span>In use</span>
							<span className="val">{used.length}</span>
						</div>
						{defined != null && (
							<div className="row">
								<span>Defined on the site</span>
								<span className="val">{fmt(defined)}</span>
							</div>
						)}
						<div className="row">
							<span>People with none</span>
							<span className="val">{fmt(a.length - held.length)}</span>
						</div>
					</div>
				</>
			) : (
				<Empty title="Not set for anybody">
					The field is on every record and blank on all {fmt(a.length)} of them.
				</Empty>
			)}
		</>
	);
}

/* ---------------------------------------------------------------------------
   The screen behind View Category, photographed 29 August 2026.

   That click had never been taken before, and it settles two things this file
   used to hedge on. It opens a **second screen**, not an expansion — back
   arrow, its own toolbar, its own search and its own pager — and the screen is
   a plain value list: Code, Description, Status, and the same three row
   actions. So a category type is a list of values maintained like any other
   master, which is exactly what makes Gratuity Applicable and LWF Applicable
   the finding they are: two pay rules filed in a screen shaped for lists.

   Ours has no Category Type doctype, so the rows come from the doctype the type
   reads onto. Same values, different name over the door.
   --------------------------------------------------------------------------- */

/** Five to a page, which is theirs — their own footer reads *1 to 5 of 6*. */
const CAT_PER = 5;

/** The values behind one category type, as our side holds them.

    `code` is their leftmost column, blank on every row of theirs. Company is the
    one master here with anything to put in it: ERPNext keeps an `abbr`, and it
    is the string that ends up glued to every department name, so it earns the
    column. `status` is null where our side has no such field — drawn as a dash
    with the reason on it, never as Active, because "we did not read a status"
    and "the status is Active" are different claims. */
function catRows(s, t) {
	if (t.dt === "Company") {
		return s.companies.map((c) => ({ name: c.name, code: c.abbr || "", desc: c.name, status: null }));
	}
	if (t.dt === "Department") {
		return s.departments.map((d) => ({
			name: d.name, code: "", desc: tidyDept(d.name),
			status: "disabled" in d ? (d.disabled ? "Disabled" : "Active") : null,
		}));
	}
	if (t.dt === "Designation") {
		return s.designations.map((d) => ({ name: d.name, code: "", desc: d.name, status: null }));
	}
	return [];
}

/** One row action. All three open the same document, because on the site that
    is where all three happen — the tooltips are what differ, and Delete is two
    steps rather than one on purpose. */
function DrillAct({ s, t, r, label, title, d }) {
	return (
		<Desk className={t.dt ? "fhact on" : "fhact"} label={label}
			href={s.site && t.dt && deskUrl(s.site, t.dt, r.name)}
			title={title} dead={t.dt ? undefined : NO_MASTER}>
			<Ic d={d} />
		</Desk>
	);
}

/** Their list against ours, name by name, where a photograph of theirs exists.

    This is the whole reason the screen was worth rebuilding. Their footer says
    six; page 1 held five; ours holds whatever the site holds. A name on their
    side and not on ours is a company somebody is filed under over there with
    nowhere to land here — and it would otherwise show up much later, as one
    employee import that refuses. */
function CatSeen({ t, rows }) {
	const ours = new Set(rows.map((r) => r.desc.toUpperCase()));
	const missing = t.seen.filter((n) => !ours.has(n.toUpperCase()));
	const unseen = t.theirs - t.seen.length;

	return (
		<div className="mb-[.8rem]">
			<div className="rows">
				<div className="row">
					<span>On their screen</span>
					<span className="val">{t.theirs}</span>
				</div>
				<div className="row">
					<span>Photographed of those</span>
					<span className="val">{t.seen.length}</span>
				</div>
				<div className="row">
					<span>On the site</span>
					<span className="val">{fmt(rows.length)}</span>
				</div>
			</div>
			{missing.length ? (
				<div className="mt-[.6rem]">
					<Gap>
						<b>{missing.length} of the {t.seen.length} seen on their page 1 have no match here:</b>{" "}
						{missing.join(", ")}. Matched on the name exactly, so a different spelling reads as
						missing — which is worth knowing either way, because an employee import matches on the
						same string.
					</Gap>
				</div>
			) : null}
		</div>
	);
}

/** Their ↑, which is a menu rather than a button — see IMPORT_MENU.

    Drawn with `.empdrop` / `.emmenu`, which is the shape every other menu on
    this dashboard uses and brings two things this one would otherwise have to
    reinvent: `.emmenu[hidden]` really hides (a `display:flex` menu toggled by
    the `hidden` attribute does not, which is a bug this repo has already had
    once), and the document handler in App.jsx leaves `.empdrop` alone, so a
    click elsewhere closes it and the click that opens it does not.

    `onTemplate` is null on the screen that has no doctype behind it; the item
    is then drawn disabled with the reason on it rather than left off, because a
    control quietly dropped is a difference nobody remembers to ask about. */
/** Their ↑, which is a menu — the shared `ImportMenu`, wired to this screen's
    flag and its own dead reason. Both of Categories' headers draw one, and only
    one of them can write a template: see CAT_TEMPLATE_DEAD. */
const CatImport = ({ s, onTemplate }) => (
	<ImportMenu
		open={s.catimp}
		onToggle={() => set({ catimp: !s.catimp })}
		onClose={() => set({ catimp: false })}
		href={s.site && deskImport(s.site)}
		label="↑"
		items={IMPORT_MENU}
		onTemplate={onTemplate}
		templateDead={CAT_TEMPLATE_DEAD}
	/>
);

/** Download template, for one category type.

    The columns are Frappe's own import shape rather than an invention: `ID` is
    what an *Update Existing Records* import matches on, and the value columns
    are what the drill already draws. Filled with what the site holds, for the
    reason the CTC rating template gives — a template of bare headings makes
    somebody retype a list they already have, and a mistyped name is a new
    master rather than an edit to an old one.

    `Status` only when the doctype carries one. `Department` has `disabled` and
    the other two have nothing, and a column nothing can import is worse on a
    template than a column left off. */
function catTemplate(s, t) {
	const rows = catRows(s, t);
	const hasStatus = rows.some((r) => r.status);
	const cols = ["ID", "Code", "Description"].concat(hasStatus ? ["Status"] : []);

	download(
		`category-${deskSlug(t.dt)}-${todayIso()}.csv`,
		toCsv(cols, rows.map((r) =>
			[r.name, r.code || "", r.desc, ...(hasStatus ? [r.status || ""] : [])])),
	);
	return rows.length;
}

function CatDrill({ s, t }) {
	const all = catRows(s, t).slice().sort((a, b) => a.desc.localeCompare(b.desc));
	const q = (s.catfind || "").trim().toLowerCase();
	const rows = q ? all.filter((r) => (r.code + " " + r.desc).toLowerCase().includes(q)) : all;
	const pages = Math.max(1, Math.ceil(rows.length / CAT_PER));
	const page = Math.min(Math.max(1, s.catpage || 1), pages);
	const shown = rows.slice((page - 1) * CAT_PER, page * CAT_PER);
	const first = rows.length ? (page - 1) * CAT_PER + 1 : 0;
	const back = () => set({ catopen: "", catfind: "", catpage: 1, catmsg: "" });

	return (
		<div className="fhcat">
			<header>
				{/* Their back arrow, and it is the only way out of this screen over
				    there — so it is the first thing in the tab order here. */}
				<button className="fhback" onClick={back} aria-label="Back to Category Type">‹</button>
				<h3>Category Type : {t.name}</h3>
				<span className={"cov " + (t.dt ? "part" : "none")}>
					{t.dt ? "Their screen, our master" : "No master here"}
				</span>
				<span className="right">
					<Desk className="embtn pri" href={s.site && t.dt && deskNew(s.site, t.dt)}
						title={t.dt ? `Add a ${t.dt} on the ERPNext site — the master this list is.` : ""}
						dead={t.dt ? undefined : NO_MASTER}>
						+ Add
					</Desk>
					<button className="embtn" aria-label="Refresh" onClick={() => void load()}
						title="Read the site again.">↻</button>
					<button className="embtn" aria-label="Print" onClick={() => window.print()}
						title="Print this list. The page has a print stylesheet — the chrome drops away and the table stays.">🖨</button>
					{/* Both items work here: this screen has a real doctype behind it. */}
					<CatImport s={s} onTemplate={t.dt ? () => set({
						catmsg: `Template downloaded — ${catTemplate(s, t)} row(s) the site already holds, `
							+ "plus the columns Data Import wants. Add a value as a row with ID left blank.",
					}) : null} />
				</span>
			</header>

			<div className="find">
				<input type="search" placeholder="Search" aria-label={`Search ${t.name}`}
					value={s.catfind}
					/* Back to page 1 on every keystroke: a filter that leaves you on
					   page 3 of one result shows an empty table and blames the data. */
					onChange={(e) => set({ catfind: e.target.value, catpage: 1 })} />
			</div>

			{/* What the last Download template did. Under the bar it came from, and
			    cleared by anything that changes what a template would hold. */}
			{s.catmsg ? (
				<div className="px-[.9rem] pt-[.6rem]">
					<Note>{s.catmsg}</Note>
				</div>
			) : null}

			{t.dt ? (
				<>
					<Scroll>
						<table>
							<thead>
								<tr>
									<th>Code</th><th>Description</th><th>Status</th><th className="act">Action</th>
								</tr>
							</thead>
							<tbody>
								{shown.map((r) => (
									<tr key={r.name}>
										<td className="mono">{r.code || ""}</td>
										<td><span className="fhname">{r.desc}</span></td>
										<td>
											{r.status
												? <span className={"pill " + (r.status === "Active" ? "on" : "off")}>{r.status}</span>
												: <span className="muted" title={`${t.dt} on our side carries no status field, so nothing is claimed here. Factor HR marks every row of theirs Active.`}>—</span>}
										</td>
										<td className="act">
											<DrillAct s={s} t={t} r={r} label="View"
												title={`Open this ${t.dt} on the ERPNext site.`}
												d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
											<DrillAct s={s} t={t} r={r} label="Edit"
												title={`Edit this ${t.dt} on the ERPNext site — renaming it renames it for everybody carrying it.`}
												d="M4 20h4L20 8l-4-4L4 16Z" />
											<DrillAct s={s} t={t} r={r} label="Delete"
												title={`Open this ${t.dt} on the ERPNext site, where Menu → Delete removes it. Two steps rather than one: the site refuses a master anybody still carries, and that refusal is the check.`}
												d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>

					{!rows.length && (
						<Empty title={q ? "Nothing matches" : `No ${t.dt} on the site`}>
							{q
								? `Nothing in this list matches “${s.catfind}”, out of ${fmt(all.length)}.`
								: `The site holds no ${t.dt} at all, so there is nothing for anybody to be filed under.`}
						</Empty>
					)}

					<div className="fhfoot">
						<span className="cnt">
							Showing {fmt(first)} to {fmt((page - 1) * CAT_PER + shown.length)} of {fmt(rows.length)} entries
							{q ? ` (filtered from ${fmt(all.length)})` : ""}
						</span>
						{/* Real, unlike the pager one screen up: these rows are ours, so
						    there is a page 2 to go to. */}
						<span className="fhpage">
							<button className="embtn" disabled={page <= 1} onClick={() => set({ catpage: 1 })}>First</button>
							<button className="embtn" disabled={page <= 1} onClick={() => set({ catpage: page - 1 })}>Previous</button>
							<span className="cnt">Page {page} of {pages}</span>
							<button className="embtn" disabled={page >= pages} onClick={() => set({ catpage: page + 1 })}>Next</button>
							<button className="embtn" disabled={page >= pages} onClick={() => set({ catpage: pages })}>Last</button>
						</span>
					</div>
				</>
			) : null}

			{/* Underneath their screen, the reconciliation: what the values are worth
			    against the people actually carrying them, which is the question a
			    list of names on its own cannot answer. */}
			<div className="drillunder">
				{t.seen ? <CatSeen t={t} rows={all} /> : null}
				<CatValues t={t} s={s} />
			</div>
		</div>
	);
}

/** Their screen, redrawn: title bar, search, table, pager. */
function FhCategoryType({ s }) {
	/* View Category replaces this screen rather than expanding a row — which is
	   what the photograph of 29 August settled. The back arrow over there is the
	   only way out, so it is the only way out here. */
	const open = FH_CATEGORY_TYPES.find((x) => x.name === s.catopen);
	if (open) return <CatDrill s={s} t={open} />;

	const q = (s.catq || "").trim().toLowerCase();
	const rows = q
		? FH_CATEGORY_TYPES.filter((t) => (t.name + " " + t.code).toLowerCase().includes(q))
		: FH_CATEGORY_TYPES;
	return (
		<div className="fhcat">
			<header>
				<h3>Category Type</h3>
				<span className="cov part">Their screen, our data</span>
				<span className="right">
					{/* Their Create Category Type, opened rather than refused.

					    This was drawn dead, and the reason was true as far as it went:
					    there is no `Category Type` doctype here to add a row to. What the
					    form itself settles — and a closed button never could — is that
					    their Category Type *is* a Frappe `Custom Field` on Employee under
					    another name, field for field on six of its twelve controls. So
					    the dialog asks their questions and Save opens Frappe's own form
					    with the answers in it. See data/categorytype.js. */}
					<button className="embtn pri" title={CT_ADD_WHY}
						onClick={() => set({ catnew: { ...CT_BLANK(), open: true } })}>
						+ Add
					</button>
					<button className="embtn" aria-label="Refresh" onClick={() => void load()}
						title="Read the site again. The counts under each type are off the people, so this is the control that picks up somebody's department changing.">↻</button>
					{/* Import works here and the template does not — see
					    CAT_TEMPLATE_DEAD. Passing no `onTemplate` is what says so. */}
					<CatImport s={s} onTemplate={null} />
				</span>
			</header>

			<div className="find">
				<input type="search" placeholder="Search" aria-label="Search category types"
					value={s.catq} onChange={(e) => set({ catq: e.target.value })} />
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Code</th><th>Category Type</th><th>Category</th><th className="act">Action</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((t) => (
							<Fragment key={t.name}>
								<tr>
									<td className="mono">{t.code || ""}</td>
									<td>
										{t.ico} {t.name}
										{!t.field && <> <span className="tag warn">pay</span></>}
									</td>
									<td>
										<button
											className="fhview"
											title="Open this category type — the value list behind it, on the screen Factor HR opens"
											onClick={() => set({ catopen: t.name, catfind: "", catpage: 1 })}
										>
											View Category
										</button>
									</td>
									<td className="act">
										{/* Their View is this page's View Category — the same act, so the
										    same destination rather than a second control that does
										    something almost like it. */}
										<button className="fhact on" aria-label="View the values"
											title="Show what this category type holds on our side"
											onClick={() => set({ catopen: t.name, catfind: "", catpage: 1 })}>
											<Ic d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
										</button>
										<Desk className={t.dt ? "fhact on" : "fhact"} label="Edit"
											href={s.site && t.dt && deskUrl(s.site, t.dt)}
											title={t.dt ? `Open the ${t.dt} list on the ERPNext site, where these values are added, renamed and removed.` : ""}
											dead={t.dt ? undefined : NO_MASTER}>
											<Ic d="M4 20h4L20 8l-4-4L4 16Z" />
										</Desk>
										<Act l="Delete" why={DEL_DEAD} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
									</td>
								</tr>
							</Fragment>
						))}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot">
				<span className="cnt">
					{q
						? `Showing ${rows.length} of the ${FH_CAT_SEEN} known here`
						: `Showing 1 to ${FH_CAT_SEEN} of ${FH_CAT_TOTAL} entries`}
				</span>
				<span className="fhpage">
					{/* Page 1 is the only page there is here, so back is nowhere.
					    The reason is on all four rather than on the two that face
					    the missing page, because a control with no explanation
					    reads as broken next to three that have one. */}
					<button className="embtn" disabled title="This is page 1 — there is nothing behind it.">First</button>
					<button className="embtn" disabled title="This is page 1 — there is nothing behind it.">Previous</button>
					<span className="cnt">Page 1 of 2</span>
					{/* The pager is drawn dead rather than dropped. "1 to 5 of 8" is the
					    shortest way to say that three category types exist and that
					    nobody here knows what they are. */}
					<button className="embtn" disabled
						title="Page 2 has not been screenshotted. Three more category types are on it and none of them is known here.">
						Next
					</button>
					<button className="embtn" disabled
						title="Page 2 has not been screenshotted. Three more category types are on it and none of them is known here.">
						Last
					</button>
				</span>
			</div>

			{/* Their Create Category Type. Rendered here rather than beside the
			    button so it is a sibling of the whole screen: the Modal is a fixed
			    overlay and a dialog nested inside a header would inherit whatever
			    stacking context that header happens to be in. */}
			{s.catnew.open ? (
				<CreateCategoryType onClose={() => set({ catnew: { ...s.catnew, open: false } })} />
			) : null}
		</div>
	);
}

export default function Categories() {
	const s = useApp();
	const a = active(s);

	return (
		<>
			<div className="legend">
				<b className="font-display">Categories</b>
				<span className="cov part">Their screen, our data</span>
				<span>
					Factor HR’s <b>Category Type</b> master as photographed, read against the{" "}
					{fmt(a.length)} active people on our side.
				</span>
			</div>

			{/* Their screen and nothing under it. The grid of per-field cards that used
			    to sit here — Department, Designation, Grade, Branch, Employment type —
			    said the same thing the table already says, one row per field, and said
			    it twice as tall. Every one of those counts is behind View Category, on
			    the row for the field it belongs to, which is where somebody looking for
			    it goes anyway. */}
			<FhCategoryType s={s} />
		</>
	);
}
