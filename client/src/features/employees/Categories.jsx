import { fmt, tally, tidyDept } from "@/lib/format";
import { Fragment, useEffect, useRef } from "react";
import {
	CAT_IMPORT_WHY, CAT_TEMPLATE_WHY, IMPORT_MENU, SITE_CATEGORY_TYPES,
} from "@/data/masters";
import { Bars, Desk, Empty, Gap, Html, ImportMenu, Note, Scroll } from "@/components/ui";

import { active } from "@/lib/scope";
import { set, useApp } from "@/store";
import { deskNew, deskUrl } from "@/lib/desk";
import { writeCatTemplate } from "@/lib/catsheet";
import { load } from "@/api/load";
import CategoryImport from "@/features/employees/CategoryImport";
import CreateCategoryType from "@/features/employees/CreateCategoryType";
import {
	CT_ADD_WHY, CT_BLANK, CT_CF_COUNT_WHY, CT_CF_VALUE_WHY, catValues, ctSeed, ctTypes,
} from "@/data/categorytype";
import CategoryTypeDialog from "@/features/employees/CategoryTypeDialog";

/* Factor HR's Categories, photographed 28 August 2026 — and it is not the
   screen the name suggested. Behind that menu item is `Category Type`: a master
   of masters, each row holding its own value list behind a View Category
   button.

   The rows here are this site's: the masters that group an employee, and the
   Custom Fields this screen has created. Five of Factor HR's eight were once
   listed alongside them, transcribed off a screenshot — see
   SITE_CATEGORY_TYPES for what went and why.

   The controls divide three ways, and the division is the point. Search, View
   Category and Refresh act on what is on this page, so they work here. Add,
   Edit and Import act on a master, and a master is a document on the site — so
   they open it there rather than pretending to do it in a browser tab. Delete
   and the pager can do neither, and say so.

   `dt` on a category type is the doctype its values live in on our side. The
   two without one are not lists at all; they are pay rules, which is the whole
   finding of this screen. */

const DEL_DEAD = "There is no Category Type doctype here to delete a row from — each of these is a master of its own, "
	+ "or a Custom Field on Employee, and deleting the thing behind one is a different act entirely. Every employee "
	+ "filed under it would lose the field, not just the value.";

/** `catfile` when the picker was opened from the list header rather than from
    one master's drill. Not a category type's key and it cannot be: a key is
    either one of the site's master names or the document name of a Custom
    Field, and neither is a star. */
const ALL = "*";

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
    flag. Both of Categories' headers draw one, and both items work on both.

    `only` is the master the header sits on, or null on the list, where a row
    can be any of them. It is what the file is written from *and* what it is
    read against, which is why it is one object rather than two flags: a
    template whose columns differ from what the reader accepts is the one bug
    this arrangement must not have.

    Both items go dead on a drill with nothing behind it to hold values, and say
    why rather than being left off: there is nothing there to write a template
    from and nothing to load a row into. No category type on this site is in
    that state today — every one has a master or is a Custom Field — and the
    check stays because the list is read from the site rather than written down
    here. */
const CatImport = ({ s, only }) => {
	const dead = only && !only.dt && !only.cf
		? "This category type has no master on the site behind it, so there is nothing to write a "
			+ "template from and nothing to load a row into."
		: "";
	return (
		<ImportMenu
			open={s.catimp}
			onToggle={() => set({ catimp: !s.catimp })}
			onClose={() => set({ catimp: false })}
			label="↑"
			items={IMPORT_MENU}
			onImport={dead ? null : () => set({ catfile: only ? only.key : ALL, catmsg: "" })}
			importWhy={CAT_IMPORT_WHY}
			importDead={dead}
			onTemplate={dead ? null : () => set({
				catmsg: `Template downloaded — ${writeCatTemplate(s, only)} row(s) the site already `
					+ "holds, in the columns the import above reads. Add a value as a row with ID left "
					+ "blank and drop the file back on Data import from file.",
			})}
			templateWhy={CAT_TEMPLATE_WHY}
			templateDead={dead}
		/>
	);
};

/** Their screen, redrawn: title bar, search, table, pager.

    **Without their View Category.** Factor HR's opens a second screen listing
    the values a category can take — five companies, a page of departments — and
    it was rebuilt here twice: first as a second screen like theirs, then as a
    panel under this table. It was removed on 5 September 2026, asked for
    directly, and the reason it is no loss is worth writing down so nobody
    rebuilds it a third time by accident:

    **the values are not this screen's finding.** They are on the site already,
    on `Company`, `Department` and `Designation`, where they are maintained —
    and what this page is actually for is the row itself: which field on
    Employee a category reads onto, and what holds its values. The ⓘ on each row
    says that about the row it is on.

    The values that *are* worth reconciling — their list against ours, name by
    name — went with it, and if that comparison is wanted again it belongs on a
    screen of its own rather than nested two levels inside this one, and against
    an export of theirs rather than against a list typed in here. */
function FhCategoryType({ s }) {
	/* Theirs and ours in one list — see `ctTypes`. Opened on `key` rather than on
	   the name, because a category somebody creates here could be labelled
	   "Department" and there is a row called that already. */
	const types = ctTypes(s);
	const ours = types.length - SITE_CATEGORY_TYPES.length;
	const q = (s.catq || "").trim().toLowerCase();
	const rows = q
		? types.filter((t) => (t.name + " " + t.code).toLowerCase().includes(q))
		: types;
	return (
		<>
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
					    the dialog asks their questions and Save creates one — on the site,
					    as the person signed in, under the site's own permissions — and the
					    new category is a row of this list. See data/categorytype.js. */}
					<button className="embtn pri" title={CT_ADD_WHY}
						onClick={() => set({ catnew: { ...CT_BLANK(), open: true } })}>
						+ Add
					</button>
					<button className="embtn" aria-label="Refresh" onClick={() => void load()}
						title="Read the site again. The counts under each type are off the people, so this is the control that picks up somebody's department changing.">↻</button>
					{/* No `only`: on the list a row can be any of the masters, so the
					    template writes all of them and the file says on each row which
					    one it is. */}
					<CatImport s={s} />
				</span>
			</header>

			<div className="find">
				<input type="search" placeholder="Search" aria-label="Search category types"
					value={s.catq} onChange={(e) => set({ catq: e.target.value })} />
			</div>

			{/* What the last + Add created, over the row it created. */}
			{s.catmsg ? (
				<div className="px-[.9rem] pt-[.6rem]">
					<Note>{s.catmsg}</Note>
				</div>
			) : null}

			{/* **An empty list of ours means three things, and this says which.**
			    `Custom Field` is System Manager's doctype to read as well as to write,
			    so a perfectly good HR User session sees the three masters and none of
			    the categories this screen created — which without this line reads as
			    "nobody has ever added one", and sends somebody off to add a second copy
			    of a category that already exists. */}
			{s.empFieldsState === "denied" || s.empFieldsState === "bad" ? (
				<div className="px-[.9rem] pt-[.6rem]">
					<Gap>
						{s.empFieldsState === "denied"
							? "Your session may not read Custom Field, which is System Manager's doctype — so any "
								+ "category type created from this screen is missing from the list below. What is left is "
								+ "the masters the site ships with."
							: "The site could not be asked which categories have been created on it, so the list below "
								+ "is the masters it ships with and nothing else. ↻ reads again."}
					</Gap>
				</div>
			) : null}

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Code</th><th>Category Type</th><th className="act">Action</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((t) => (
							<Fragment key={t.key}>
								<tr>
									<td className="mono">{t.code || ""}</td>
									<td>
										{t.ico} {t.name}
										{!t.field && <> <span className="tag warn">pay</span></>}
										{/* Which half of the list this row came from. Theirs is a
										    photograph of a master on another system; ours is a field
										    that exists on this site right now, and the two are not the
										    same kind of claim. */}
										{t.cf && (
											<> <span className="tag" title={`A Custom Field on Employee, created from this screen — ${t.cf.name}.`}>
												on this site
											</span></>
										)}
									</td>
									<td className="act">
										{/* **Their ⓘ and ✎ open the category type itself**, which is a
										    different thing from the values under it: the row's own
										    properties — code, prompts, priorities, which reports it
										    prints on. The values stay behind View Category, in the
										    column Factor HR puts them in, so nothing moved.

										    Both are live on every row, including the two with no field
										    on this side. A dialog that says "this reads onto nothing,
										    and here is why" is worth opening; a dead icon is not. */}
										<button className="fhact on" aria-label="View this category type"
											title={`Open ${t.name} — its code, prompts and display properties, read-only.`}
											onClick={() => set({ catdlg: ctSeed(s, t, "view") })}>
											<Ic d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v5M12 7.6v.1" />
										</button>
										<button className="fhact on" aria-label="Edit this category type"
											title={`Edit ${t.name} — the same form with its boxes live. Save opens Customize Form on the site.`}
											onClick={() => set({ catdlg: ctSeed(s, t, "edit") })}>
											<Ic d="M4 20h4L20 8l-4-4L4 16Z" />
										</button>
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
					{/* One count, because there is now only one kind of row: what the site
					    holds. Their eight — five transcribed off a screenshot, three never
					    seen — used to be added to ours here, and no arithmetic makes a
					    photograph and a read into one number. */}
					{q
						? `Showing ${fmt(rows.length)} of ${fmt(types.length)} category types`
						: `Showing ${fmt(types.length)} category types on this site`}
					{ours ? ` — ${fmt(types.length - ours)} masters, ${fmt(ours)} created here` : ""}
				</span>
				{/* Their pager was drawn dead with "Page 1 of 2" on it, which was true of
				    their screen and is not of this one. This list is what the site
				    answered with and it is all on one page. */}
			</div>

			{/* Their Create Category Type. Rendered here rather than beside the
			    button so it is a sibling of the whole screen: the Modal is a fixed
			    overlay and a dialog nested inside a header would inherit whatever
			    stacking context that header happens to be in. */}
			{s.catnew.open ? (
				<CreateCategoryType onClose={() => set({ catnew: { ...s.catnew, open: false } })} />
			) : null}

			{/* Their ⓘ and ✎, which are one dialog in two modes. Rendered here for
			    the same reason Create is: the Modal is a fixed overlay, and a
			    dialog nested inside a table cell would inherit whatever stacking
			    context that cell happens to be in. */}
			{s.catdlg.open ? (
				<CategoryTypeDialog
					onClose={() => set({ catdlg: { ...s.catdlg, open: false, rcdopen: false } })} />
			) : null}
		</div>


		{/* **Once, for both headers.** The drill is under the list rather than
		    instead of it, so both ↑ menus are on the page at the same time —
		    mounting this beside either would put two dialogs on one backdrop the
		    moment somebody opened the other. `catfile` carries which master was
		    asked for instead: a type's key, or ALL from the list header. */}
		{s.catfile ? (
			<CategoryImport
				only={s.catfile === ALL ? null : types.find((x) => x.key === s.catfile) || null}
				onClose={() => set({ catfile: "" })} />
		) : null}
		</>
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
					Factor HR’s <b>Category Type</b> screen, over the masters this site holds — read
					against the {fmt(a.length)} active people on it.
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
