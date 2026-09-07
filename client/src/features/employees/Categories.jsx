import { fmt, tally, tidyDept } from "@/lib/format";
import { Fragment, useEffect, useRef } from "react";
import {
	CAT_IMPORT_WHY, CAT_TEMPLATE_WHY, FH_CATEGORY_TYPES, FH_CAT_SEEN, FH_CAT_TOTAL, IMPORT_MENU,
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

/** `catfile` when the picker was opened from the list header rather than from
    one master's drill. Not a category type's key and it cannot be: a key is
    either one of Factor HR's eight names or the document name of a Custom
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

    Both items go dead on a drill with no values to hold — the two pay rules —
    and say why rather than being left off. There is nothing there to write a
    template from and nothing to load a row into. */
const CatImport = ({ s, only }) => {
	const dead = only && !only.dt && !only.cf ? NO_MASTER : "";
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
    and every count this page is actually for is the row itself: which of
    Factor HR's eight category types has a field on this side, which has a
    master, and which two are pay rules filed in a screen shaped for lists. The
    ⓘ on each row says all of that about the row it is on.

    The values that *are* worth reconciling — their list against ours, name by
    name — went with it, and if that comparison is wanted again it belongs on a
    screen of its own rather than nested two levels inside this one. */
function FhCategoryType({ s }) {
	/* Theirs and ours in one list — see `ctTypes`. Opened on `key` rather than on
	   the name, because a category somebody creates here could be labelled
	   "Department" and there is a row called that already. */
	const types = ctTypes(s);
	const ours = types.length - FH_CATEGORY_TYPES.length;
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
			    so a perfectly good HR User session sees Factor HR's eight rows and none
			    of the ones this screen created — which without this line reads as
			    "nobody has ever added one", and sends somebody off to add a second copy
			    of a category that already exists. */}
			{s.empFieldsState === "denied" || s.empFieldsState === "bad" ? (
				<div className="px-[.9rem] pt-[.6rem]">
					<Gap>
						{s.empFieldsState === "denied"
							? "Your session may not read Custom Field, which is System Manager's doctype — so any "
								+ "category type created from this screen is missing from the list below. The rows that "
								+ "are here are Factor HR's own master, held in this app."
							: "The site could not be asked which category types it holds, so the list below is Factor "
								+ "HR's own and nothing of ours. ↻ reads again."}
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
					{/* Their count and ours, added but not merged. Their eight is a number
					    off a photograph of another system and ours is a read of this one;
					    printing one total would make the second look as certain as the
					    first, or the first as live as the second. */}
					{q
						? `Showing ${rows.length} of the ${FH_CAT_SEEN + ours} known here`
						: `Showing 1 to ${FH_CAT_SEEN + ours} of ${FH_CAT_TOTAL + ours} entries`}
					{ours ? ` — ${FH_CAT_SEEN} of theirs, ${ours} created here` : ""}
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
