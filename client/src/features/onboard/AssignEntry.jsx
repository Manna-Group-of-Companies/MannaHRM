import { useEffect } from "react";

import { patch, useApp } from "@/store";
import { load } from "@/api/load";
import { scoped } from "@/lib/scope";
import { dmy, dmyTime, fmt, tidyDept, todayIso } from "@/lib/format";
import { deskImport, deskUrl } from "@/lib/desk";
import { ASSIGN_FORM } from "@/data/onboard";
import { Desk, Empty, FieldChip, Scroll } from "@/components/ui";
import { apiCreate } from "@/api/client";
import { loadOnBoard } from "@/api/load";
import { JUDGED, STATUSES, problems, statusFor } from "@/lib/assign";
import { assetRows } from "@/features/onboard/shared";
import { go } from "@/routes/router";
import EmployeeList from "@/features/employees/EmployeeList";

/* ---------------------------------------------------------------------------
   Factor HR's **Assets Assignment**, photographed 3 September 2026 — the same
   day as Assets Details, and the page this one had been saying it had never
   seen.

   It is a *person* screen, and that is the whole shape of it: their employee
   bar at the top — the coloured dot, Search employee, List of Employees, the
   same three controls Salary Master and the regularization screen carry — then
   an ASSETS table of what that person is holding, then the fifteen-box form for
   one handover.

   **Nothing here types into anything.** Every box is filled from the row picked
   in the table above it and is read-only, because this dashboard reads and the
   writes are documents on the site (CLAUDE.md §1). So Save is a link to a new
   Asset Movement over there rather than a button that pretends, and Cancel
   empties the boxes, which is the one thing it can honestly do here.

   Their table has nine columns and two of them have nothing behind them on this
   side — VALID TILL and REMARK — for the same reason seven of the fifteen boxes
   are dead: an ERPNext handover is two rows in a log, an Issue and later a
   Receipt, with no end date and no note on either. See ASSIGN_FORM.
   --------------------------------------------------------------------------- */

/** How many rows of the ASSETS table are on a page. */
const PER = 10;

const Ic = ({ d, w = 17 }) => (
	<svg viewBox="0 0 24 24" width={w} height={w} stroke="currentColor" fill="none"
		strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
		<path d={d} />
	</svg>
);

/* The same coloured dot as Salary Master and the regularization screen, because
   it is the same control on their bar. Its own selection, though: a filter set
   on one screen is not a filter set on another, and sharing them would silently
   hide people here. */
function AsgDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.asg.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.asg.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. See App.jsx. */
				onClick={(e) => { e.stopPropagation(); patch("asg", { menu: !s.asg.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.asg.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.asg.status}
						onClick={(e) => { e.stopPropagation(); patch("asg", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** Picking somebody empties the table's pager and the boxes under it. A page
    number and a picked handover both belong to the person who was on screen,
    and neither means anything against the next one. */
const pickPerson = (name) => patch("asg", { emp: name, q: "", list: false, page: 1, pick: "" });

/** A person, as the search picker and the List of Employees panel both draw
    them — one row shape, so a choice made either way is the same choice. */
const PickRow = ({ e }) => (
	<button onClick={() => pickPerson(e.name)}>
		<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
		<b>{e.employee_name}</b>
		<span className="mono">{e.employee_number || "—"}</span>
		<span className="muted">{tidyDept(e.department)}</span>
	</button>
);

/** Who the two pickers can offer: in scope for the company, then filtered by
    the dot — which is what the dot is for on their screen as well. */
export function asgPool(s) {
	const rows = scoped(s);
	return s.asg.status ? rows.filter((e) => e.status === s.asg.status) : rows;
}

/* Their ASSET ICON column. Nothing on either side stores an icon against an
   asset — theirs draws one per type — so it is derived from the category and
   says so on hover rather than being passed off as a field. A category nobody
   has a glyph for gets the box, which is honest and still lines the column up. */
const ICONS = [
	[/laptop|computer|desktop|cpu|monitor/i, "💻"],
	[/mobile|phone|handset|sim/i, "📱"],
	[/vehicle|car|bike|scooter|truck/i, "🚗"],
	[/furniture|chair|table|desk|cabinet/i, "🪑"],
	[/tool|machine|plant|equip|instrument/i, "🔧"],
	[/print|scanner|copier/i, "🖨"],
	[/software|licen[cs]e/i, "🗝"],
	[/safety|helmet|shoe|glove|uniform/i, "🦺"],
];
const iconFor = (cat) => ICONS.find(([re]) => re.test(cat || ""))?.[1] || "📦";

/** The Issue and the Receipt that put an asset with somebody and took it back.

    Latest of each rather than first: an asset can go out, come back and go out
    again, and the handover on screen is the one running now. `moveTier` decides
    whether this can be asked at all — a site whose movement list came back
    without `asset` and `to_employee` has a history and no way to attribute it,
    which is a different answer from "never issued". */
function handover(s, assetName, emp) {
	if (s.moveTier !== "full" || !assetName) return {};
	const mine = s.assetMoves.filter((m) => m.asset === assetName);
	const last = (rows) => rows.slice().sort((a, b) =>
		String(b.transaction_date || "").localeCompare(String(a.transaction_date || "")))[0];
	return {
		issue: last(mine.filter((m) => m.purpose !== "Receipt" && (!emp || m.to_employee === emp))),
		receipt: last(mine.filter((m) => m.purpose === "Receipt" && (!emp || m.from_employee === emp))),
	};
}

/** The doctype fieldname behind a box, where the two spell it differently.

    Two of the fifteen do: their `Assets` is our `asset`, and their
    `Serial Number` is `serial_number` rather than ERPNext's `serial_no`. Kept
    in one place so a form key and a document key can never be confused at the
    call site. */
const DOC_FIELD = { assets: "asset", serial_no: "serial_number" };

const docKey = (key) => DOC_FIELD[key] || key;

/** Why a dropdown on this form is greyed. */
const NOT_YET = "Pick somebody, or press New handover — this is a choice about a "
	+ "handover being written, and reading one shows what it says instead.";

/** A dropdown's options, with whatever it is *holding* guaranteed to be among
    them.

    A `<select>` whose value is not one of its options renders blank, and the
    value here is not always one: Asset Status falls back to ERPNext's own
    `Asset.status` — `Submitted`, `In Location`, `Partially Depreciated` — none
    of which is a handover state. Showing the record's real word, even an
    unexpected one, beats an empty box that reads as no data. */
const opts = (list, held) =>
	held && !list.includes(held) ? [held, ...list] : list;

/** The way out of an empty Asset Type box.

    Their form has an Add Asset Types link beside this dropdown; ours has the
    same dialog, on the Assets screen, and it already knows which of Factor HR's
    four are missing and offers them on one button. So this goes there and opens
    it rather than growing a second copy of a master editor on a screen about
    handovers — two dialogs writing the same doctype is two places to fix the
    next rule about it.

    The patch lands before the navigation so the page it moves to renders with
    the dialog already open, rather than opening it in a second frame. */
function AddTypes() {
	return (
		<button className="aflink" type="button"
			title="The site's Asset Category master is empty, so this dropdown has nothing to offer. Opens Add Asset Types on Assets Details, where Factor HR's four can be added in one press."
			onClick={() => {
				patch("aform", { types: true });
				go({ section: "onboard", subtab: "assets" });
			}}>
			Add Asset Types
		</button>
	);
}

/** One of their fifteen boxes.

    **All fifteen have somewhere to live now.** Seven of them did not until
    `Asset Assignment` existed — Valid Till, Return Unit, Lost Units, Lost On,
    Recovery Amount, Remarks and Assets Detail — because an ERPNext handover is
    a log and theirs is a little contract. See manna_hr/assets.py.

    The box is a control while a handover is being typed and a statement while
    one is being read, which is the same asymmetry Document Entry uses: a form
    that looks editable over a saved record is a form somebody types into and
    then wonders why nothing happened. */
function Field({ f, ctx, tier, moveTier, edit, form, onSet, bad, assets, cats, catErr }) {
	/* Typed here on a new handover. A box with no `w` is derived or read off the
	   asset — Asset Status most of all, which is computed from the counts on
	   every save rather than chosen, or the register would disagree with the
	   arithmetic printed beside it. */
	const typing = edit && !!f.w;

	const dead = !typing && f.state === "build";
	/* "Not read" is not the same claim as "empty", and only the tier can tell
	   them apart. Two of these read off the Asset fields added on 3 Sep and two
	   off the movement columns added the same day; a site answering the older
	   shape of either comes back absent rather than blank.

	   **It cannot apply to a box being typed into**, and that was a bug: a site
	   whose Asset Movement answers the older shape disabled Assign Date and
	   Returned On, and one whose Asset read fell back disabled Serial Number —
	   on a *new* handover, where there is nothing to have failed to read. A
	   disabled box on a form somebody is filling in is the caret-eating bug this
	   repo has a rule about (CLAUDE.md §3). */
	const unread = !typing && ((f.state === "stock" && tier !== "full")
		|| ((f.key === "assign_date" || f.key === "returned_on") && moveTier !== "full"));
	const raw = ctx.asset && f.get ? f.get(ctx) : undefined;
	const value = raw == null || raw === ""
		? ""
		: f.kind === "date" ? dmyTime(raw)
			: typeof raw === "number" ? fmt(raw)
				: String(raw);

	const key = docKey(f.key);
	const shown = typing ? (form[key] ?? "") : (unread ? "" : value);

	return (
		<div className={"fld" + (f.area ? " area" : "") + (typing ? " live" : "") + (bad ? " bad" : "")}>
			<label className={dead || unread ? "off" : ""} htmlFor={"ag-" + f.key}>{f.label}</label>
			{f.w === "status" ? (
				/* Their first dropdown, and the one with a rule behind it. Every
				   option is offered, because a dropdown that hides the answer
				   somebody is looking for reads as broken — but picking one that
				   the counts contradict is refused by `problems` with both values
				   named, rather than silently rewritten on save. See statusFor.

				   **Drawn as a dropdown even when it cannot be used**, which is the
				   one place this form departs from "controls while typing,
				   statements while reading". On their screen this box has an arrow
				   on it always, and a flat box where somebody is looking for a
				   dropdown reads as a missing feature rather than as a form waiting
				   for a person to be picked. Disabled rather than live, so it still
				   cannot eat a keystroke it would discard. */
				<select id={"ag-" + f.key} disabled={!typing}
					value={typing ? (form.asset_status || "") : (shown || "")}
					title={typing ? `${f.label} — ${f.why}` : NOT_YET}
					onChange={typing ? (e) => onSet("asset_status", e.target.value) : undefined}>
					<option value="">{typing ? "Let the counts decide" : ""}</option>
					{opts(STATUSES, typing ? "" : shown).map((st) => (
						<option key={st} value={st}>
							{st}{typing && !JUDGED.includes(st) ? " — from the counts" : ""}
						</option>
					))}
				</select>
			) : f.w === "type" ? (
				/* Their second. It narrows the one under it and is otherwise a fact
				   about whatever asset ends up picked, so it is never sent as a
				   contradiction: `setBox` clears the asset when the type moves away
				   from under it.

				   Free text only while typing on a site whose Asset Category master
				   could not be *read* — a dropdown with no options is a box that
				   cannot be filled at all. At rest it is their dropdown, holding
				   whatever the record says.

				   **An empty master is a different finding from a failed read**,
				   and the difference is the whole reason this box looked broken:
				   the site has the doctype and nothing in it, so the honest thing
				   is to say so and offer the dialog that fills it rather than a
				   free-text box that would write a category the site does not
				   have. `asset_type` is a Link — a typed word with no record
				   behind it is refused on save, which is a round trip to learn
				   what this box could have said in the first place. */
				catErr && typing ? (
					<input id={"ag-" + f.key} type="text" value={form.asset_type || ""}
						placeholder="Asset Category could not be read"
						title={`${f.label} — ${f.why}`}
						onChange={(e) => onSet("asset_type", e.target.value)} />
				) : (
					<span className="fldrow">
						<select id={"ag-" + f.key} disabled={!typing || !cats.length}
							value={typing ? (form.asset_type || "") : (shown || "")}
							title={!cats.length
								? "The site's Asset Category master is empty, so there is no type to narrow by. Add Asset Types fills it."
								: typing ? `${f.label} — ${f.why}` : NOT_YET}
							onChange={typing ? (e) => onSet("asset_type", e.target.value) : undefined}>
							<option value="">
								{!cats.length ? "No asset types on the site yet" : typing ? "All types" : ""}
							</option>
							{opts(cats, typing ? "" : shown).map((c) => <option key={c} value={c}>{c}</option>)}
						</select>
						{!cats.length && !catErr ? <AddTypes /> : null}
					</span>
				)
			) : typing && f.w === "asset" ? (
				/* Their third dropdown. It has to be a control here rather than a
				   value read off the table: that table lists what this person is
				   *already* holding, and a new handover is nearly always something
				   they are not. */
				<select id={"ag-" + f.key} value={form.asset || ""}
					onChange={(e) => onSet("asset", e.target.value)}>
					<option value="">Select asset</option>
					{(assets || []).map((a) => (
						<option key={a.name} value={a.name}>
							{a.asset_name || a.name}{a.custodian ? " — out" : ""}
						</option>
					))}
				</select>
			) : f.area ? (
				<textarea id={"ag-" + f.key} rows={3} readOnly={!typing} disabled={dead || unread}
					value={shown}
					placeholder={typing ? "" : undefined}
					onChange={typing ? (e) => onSet(key, e.target.value) : undefined}
					title={dead || unread ? f.why : `${f.label} — ${f.why}`} />
			) : (
				<input id={"ag-" + f.key}
					type={typing ? (f.w === "date" ? "date" : f.w === "int" || f.w === "money" ? "number" : "text") : "text"}
					step={f.w === "money" ? "0.01" : undefined}
					min={f.w === "int" || f.w === "money" ? "0" : undefined}
					readOnly={!typing} disabled={dead || unread}
					value={shown}
					placeholder={unread ? "not read" : ""}
					onChange={typing ? (e) => onSet(key, e.target.value) : undefined}
					title={dead || unread ? f.why : `${f.label} — ${f.why}`} />
			)}
			<FieldChip state={unread ? "stock" : f.state} />
		</div>
	);
}

export default function AssignEntry() {
	const s = useApp();
	const pool = asgPool(s);
	const emp = s.asg.emp ? s.byName[s.asg.emp] : null;
	const q = (s.asg.q || "").trim().toLowerCase();

	const matches = q
		? pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	/* What this person is holding. The custodian is on the asset rather than on
	   the movement, which is why the table stands up even on a site whose
	   movement read came back short — the dates are what go missing then, not
	   the rows. */
	const all = assetRows(s);
	const held = emp ? all.filter((a) => a.custodian === emp.name) : [];

	/* The Asset Type dropdown's options, and the Assets dropdown it narrows.

	   From the `Asset Category` master, because that is the authority: a type
	   nobody is holding yet is still a type somebody can hand out, and a list
	   grown from the assets would be missing exactly the option needed for the
	   first one.

	   **An empty master and an unreadable one are different findings**, and only
	   the second may be answered by borrowing the categories the assets name.
	   `Asset.asset_category` is a Link, so on a site whose master reads fine an
	   asset cannot carry a category the master lacks — which means an empty list
	   there really does mean nothing to offer, and dressing it up with a
	   fallback would hide the one thing the person needs to be told. */
	const cats = (s.assetCats || []).length
		? (s.assetCats || []).map((c) => c.asset_category_name || c.name).filter(Boolean)
		: s.assetCatErr
			? [...new Set(all.map((a) => a.asset_category).filter(Boolean))].sort()
			: [];
	const ofType = s.asg.form.asset_type
		? all.filter((a) => a.asset_category === s.asg.form.asset_type)
		: all;
	const pages = Math.max(1, Math.ceil(held.length / PER));
	const page = Math.min(Math.max(1, s.asg.page || 1), pages);
	const shown = held.slice((page - 1) * PER, page * PER);
	const first = held.length ? (page - 1) * PER + 1 : 0;

	const picked = (s.asg.pick && held.find((a) => a.name === s.asg.pick)) || null;

	/* The handover *contract* for the asset on screen, where one has been
	   written. The movement pair is still read alongside it — the log says when
	   the thing physically moved, this says what was agreed — and the form
	   prefers the contract for every box both of them could fill. */
	const asn = picked && emp
		? (s.assignments || []).find((a) => a.asset === picked.name && a.employee === emp.name) || null
		: null;
	const ctx = { asset: picked, asn, ...handover(s, picked?.name, emp?.name) };

	/* **The form is live as soon as somebody is picked**, unless a saved row from
	   the table is being looked at. It used to wait for the New handover button,
	   which meant the ordinary thing — pick a person, start typing — silently
	   discarded every keystroke. A form that takes the caret and does nothing is
	   the failure this repo keeps a test suite for (CLAUDE.md §3); a button in
	   front of it is the same failure with an extra step.

	   **`assignErr` is deliberately not part of this.** It was, and that was the
	   same bug wearing a different hat: on a site without the doctype the read
	   fails, and the whole form went read-only — so the page answered "the site
	   has nothing to write to" by looking broken. A failed *read* must never
	   decide whether a *form* accepts typing. The refusal belongs on Save, where
	   it can be read, and it is on the button and in the panel underneath. */
	const editing = !!emp && (s.asg.new || !picked);
	/* The same arithmetic the server runs, so a box can be named before the
	   round trip rather than after it. The site decides — see lib/assign.js. */
	const said = editing ? problems(s.asg.form) : [];
	const badBoxes = new Set(
		said.flatMap((w) => [
			w.includes("Assign Units") ? "assign_units" : "",
			w.includes("Return Unit") ? "return_unit" : "",
			w.includes("Returned On") ? "returned_on" : "",
			w.includes("Lost Units") ? "lost_units" : "",
			w.includes("Lost On") ? "lost_on" : "",
			w.includes("Recovery Amount") ? "recovery_amount" : "",
			w.includes("Valid Till") ? "valid_till" : "",
			w.includes("Asset Status") ? "asset_status" : "",
			w.includes("went out") ? "return_unit" : "",
		].filter(Boolean)),
	);

	const setBox = (key, value) => {
		const next = { ...s.asg.form, [key]: value };
		/* Picking the asset fills the three boxes that are facts about the thing
		   rather than about the handover. Only when they are empty: somebody who
		   has corrected a serial number should not lose it to a re-pick. */
		if (key === "asset") {
			const a = all.find((x) => x.name === value);
			if (a) {
				if (!next.serial_number) next.serial_number = a.serial_no || "";
				if (!next.assets_code) next.assets_code = a.item_code || a.name;
				if (!next.asset_type) next.asset_type = a.asset_category || "";
			}
		}
		/* Narrowing the type out from under a picked asset drops the asset, and
		   deliberately: the alternative is a form whose Assets box shows nothing
		   (it is no longer in the narrowed list) while still holding a value that
		   would be saved — a box that lies about what it will write is worse than
		   one that empties in front of somebody. */
		if (key === "asset_type" && next.asset) {
			const a = all.find((x) => x.name === next.asset);
			if (value && a && a.asset_category !== value) {
				next.asset = "";
				next.serial_number = "";
				next.assets_code = "";
			}
		}
		patch("asg", { form: next, err: "", said: "" });
	};

	/* Seed the boxes the moment the form goes live, however it got there — the
	   button, or simply picking somebody. Without this the first keystroke lands
	   in a form with no employee on it and the site refuses the save. */
	useEffect(() => {
		if (!editing) return;
		if (s.asg.form.employee === emp.name) return;
		patch("asg", {
			form: {
				employee: emp.name,
				asset: picked ? picked.name : "",
				serial_number: picked ? picked.serial_no || "" : "",
				assets_code: picked ? picked.item_code || picked.name : "",
				asset_type: picked ? picked.asset_category || "" : "",
				assign_units: 1,
				assign_date: todayIso(),
			},
			err: "", said: "",
		});
	}, [editing, emp, picked, s.asg.form.employee]);

	/** Their New. Seeded with the asset already picked, if one is, because the
	    commonest handover is the one somebody is looking at. */
	function startHandover() {
		patch("asg", {
			new: true, err: "", said: "",
			form: {
				employee: emp.name,
				asset: picked ? picked.name : "",
				serial_number: picked ? picked.serial_no || "" : "",
				assets_code: picked ? picked.item_code || picked.name : "",
				asset_type: picked ? picked.asset_category || "" : "",
				assign_units: 1,
				assign_date: todayIso(),
			},
		});
	}

	async function saveHandover() {
		patch("asg", { busy: true, err: "", said: "" });
		try {
			/* Sent as the person types them, minus the empty ones: a Date field
			   given "" is refused by Frappe, where an absent one is simply unset —
			   the same rule every other write on this dashboard follows. */
			const doc = {};
			for (const [k, v] of Object.entries(s.asg.form)) {
				if (v !== "" && v != null) doc[k] = v;
			}
			await apiCreate("Asset Assignment", doc);
			/* Re-read rather than pushed into the list here: `asset_status` is
			   computed on the server and the code and type are filled from the
			   asset there, so a row assembled in the browser would be missing
			   exactly the fields the register shows. */
			await loadOnBoard();
			patch("asg", { new: false, form: {}, said: "Handover saved." });
		} catch (e) {
			patch("asg", { err: String(e.message || e).slice(0, 240) });
		}
		patch("asg", { busy: false });
	}

	return (
		<div className="fhscreen asgscreen">
			<div className="embar asgbar">
				<AsgDot s={s} />

				<span className="find rev">
					<input type="search" placeholder="Search employee..." aria-label="Search employee"
						value={s.asg.q || ""} onChange={(e) => patch("asg", { q: e.target.value })} />
					<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
						strokeWidth="1.8" strokeLinecap="round">
						<circle cx="11" cy="11" r="7" />
						<path d="M20 20l-3.6-3.6" />
					</svg>
				</span>

				<button className="embtn list" aria-pressed={s.asg.list}
					title="Pick from everybody rather than by typing — their second way into the same choice"
					onClick={() => patch("asg", { list: !s.asg.list, q: "" })}>
					List of Employees
				</button>
			</div>

			{/* The picker their search box opens under itself. Ours says how many
			    people it searched, because the dot can empty it and a search that
			    finds nobody should say which filter did that. */}
			{!emp && q ? (
				<div className="regfind">
					{matches.length ? (
						matches.map((e) => <PickRow key={e.name} e={e} />)
					) : (
						<span className="none">
							Nobody matches, out of {fmt(pool.length)} searched
							{s.asg.status ? ` · status ${s.asg.status}` : ""}
						</span>
					)}
				</div>
			) : null}

			{/* Drawn whether or not somebody is already picked — theirs is a way of
			    changing who that is, and a list that vanished the moment it worked
			    would be a list you could never use twice. */}
			{s.asg.list ? (
				<EmployeeList
					pool={pool}
					busy={s.connState === "loading" || s.conn === "loading…"}
					onReload={() => { void load(); }}
					onPick={(e) => pickPerson(e.name)} />
			) : null}

			{emp ? (
				<div className="regwho">
					<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
					<b>{emp.employee_name}</b>
					<span className="mono">{emp.employee_number || "—"}</span>
					<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
					<span className="n">{held.length ? `holding ${fmt(held.length)}` : "holding nothing"}</span>
					<button className="embtn" onClick={() => pickPerson("")}>Clear</button>
				</div>
			) : null}

			<div className="fhtitle row">
				Assets
				<span className="ics">
					{/* Loading handovers from a spreadsheet is a write, and the wizard on
					    the site previews the file before it makes one — so their up-arrow
					    goes there rather than opening a file box that could not finish the
					    job. */}
					<Desk href={s.site && deskImport(s.site)} label="Import"
						title="Loads assignments from a spreadsheet. Opens ERPNext's Data Import on the site — nothing is written until the preview there is accepted.">
						<Ic d="M12 16V4M7 9l5-5 5 5M4 20h16" />
					</Desk>
					<button className="embtn" aria-label="Refresh" title="Read the site again."
						onClick={() => { void load(); }}>
						<Ic d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
					</button>
					{/* Their gear is column settings, and this table has no stored column
					    preference to open — so it is drawn dead with that on it rather than
					    wired to something else that happened to be nearby. */}
					<button className="embtn" disabled aria-label="Settings"
						title="Theirs picks which columns this table shows. Nothing here stores a column preference, so there is nothing to open — the nine columns are always all nine.">
						<Ic d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2.6l1.5 2.5 2.9-.5.5 2.9 2.5 1.5-1.4 2.6 1.4 2.6-2.5 1.5-.5 2.9-2.9-.5-1.5 2.5-1.5-2.5-2.9.5-.5-2.9L4.6 14.2 6 11.6 4.6 9l2.5-1.5.5-2.9 2.9.5z" />
					</button>
				</span>
			</div>

			<Scroll>
				<table className="asgtab">
					<thead>
						<tr>
							<th>Sr.No</th><th>Asset Icon</th><th>Asset Type</th><th>Assets</th>
							<th>Assign Date</th><th>Valid Till</th><th>Asset Status</th>
							<th>Remark</th><th className="act">Action</th>
						</tr>
					</thead>
					<tbody>
						{emp && shown.length ? shown.map((a, i) => {
							const h = handover(s, a.name, emp.name);
							return (
								<tr key={a.name} className={a.name === s.asg.pick ? "on" : ""}>
									<td className="mono">{first + i}</td>
									<td className="ico"
										title={`Drawn from the asset type — ${a.asset_category || "no type on the record"}. Neither side stores an icon against an asset.`}>
										{iconFor(a.asset_category)}
									</td>
									<td>{a.asset_category || "—"}</td>
									<td>{a.asset_name || a.name}</td>
									<td className="mono" title={s.moveTier === "full"
										? "The date of the Asset Movement that issued it."
										: "The movement list came back without the columns that say what moved and to whom, so this cannot be attributed. Not the same as never issued."}>
										{s.moveTier === "full" ? dmy(h.issue?.transaction_date) : "not read"}
									</td>
									<td className="dead"
										title="Nothing holds it. An ERPNext handover ends when a second movement brings the asset back, so there is no date set in advance to read.">
										—
									</td>
									<td>
										<span className={"pill " + (a.status === "In Use" ? "on" : "off")}>
											{a.status || "—"}
										</span>
									</td>
									<td className="dead"
										title="Asset Movement has no remarks field. Frappe hangs Comments off the document instead, which is signed and dated rather than editable into agreement later.">
										—
									</td>
									<td className="act">
										<button className="fhact on" aria-label="View"
											aria-pressed={a.name === s.asg.pick}
											title="Put this handover in the boxes below."
											onClick={() => patch("asg", { pick: a.name === s.asg.pick ? "" : a.name })}>
											<Ic d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" w={15} />
										</button>
										<Desk className="fhact on" label="Edit"
											href={s.site && deskUrl(s.site, "Asset", a.name)}
											title="Open this asset on the ERPNext site, where its custodian can be changed — which is what an assignment is over there.">
											<Ic d="M4 20h4L20 8l-4-4L4 16Z" w={15} />
										</Desk>
									</td>
								</tr>
							);
						}) : (
							/* Their screen draws one row of dashes when there is nothing in
							   it, and so does this one. The count line underneath is the
							   honest half: theirs says "1 to 1 of 1 entries" over that empty
							   row, and a number counting a placeholder is a number somebody
							   will quote back. */
							<tr className="blank">
								{Array.from({ length: 9 }, (_, i) => (
									<td key={i} className="dead"
										title={emp
											? "Nothing is out with this person, so there is no handover to show."
											: "Nobody is picked. Their screen draws this row too."}>
										—
									</td>
								))}
							</tr>
						)}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot asgfoot">
				<span className="cnt">
					{emp && held.length ? (
						<>Showing {fmt(first)} to {fmt((page - 1) * PER + shown.length)} of {fmt(held.length)} entries</>
					) : (
						<>
							Showing 0 to 0 of 0 entries{" "}
							<span className="muted">
								{emp ? "— nothing is out with this person" : "— nobody is picked yet"}
							</span>
						</>
					)}
				</span>
				<span className="fhpage">
					<button className="embtn" disabled={page <= 1}
						onClick={() => patch("asg", { page: page - 1 })}>Previous</button>
					{Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
						<button key={n} className={"embtn" + (n === page ? " pri" : "")}
							aria-current={n === page ? "page" : undefined}
							onClick={() => patch("asg", { page: n })}>
							{n}
						</button>
					))}
					<button className="embtn" disabled={page >= pages}
						onClick={() => patch("asg", { page: page + 1 })}>Next</button>
				</span>
			</div>

			<div className="asgform">
				<div className="asgrid">
					{ASSIGN_FORM.map((f) => (
						<Field key={f.key} f={f} ctx={ctx} tier={s.assetTier} moveTier={s.moveTier}
							edit={editing} form={s.asg.form} onSet={setBox} assets={ofType} cats={cats}
							catErr={s.assetCatErr}
							bad={editing && badBoxes.has(docKey(f.key))} />
					))}
				</div>

				{editing && said.length ? (
					<div className="asgbad" role="alert">
						<b>This handover does not add up.</b>
						<ul>{said.map((w) => <li key={w}>{w}</li>)}</ul>
					</div>
				) : null}

				{s.asg.err ? (
					<div className="asgbad" role="alert">
						<b>The site refused it.</b> {s.asg.err}
					</div>
				) : null}

				<div className="asgact">
					{editing ? (
						<>
							{/* Their Save, and it writes now. `Asset Assignment` holds the
							    seven boxes an Asset Movement has nowhere for, and the same
							    arithmetic runs again on the server — this check is here to
							    name the box before the round trip, not instead of it. */}
							<button className="embtn pri" onClick={saveHandover}
								disabled={s.asg.busy || said.length > 0 || !!s.assignErr}
								title={s.assignErr
									? "The site has no Asset Assignment doctype, so there is nowhere to write this. Everything typed stays on screen."
									: said.length
										? "Every complaint above has to be answered first — the site refuses the same ones."
										: "Write this handover to the site as an Asset Assignment."}>
								{s.asg.busy ? "Saving…" : "Save"}
							</button>
							<button className="embtn" disabled={s.asg.busy}
								title="Throw the handover away. A half-typed one for this person is not a draft for the next."
								onClick={() => patch("asg", { new: false, form: {}, err: "", said: "" })}>
								Cancel
							</button>
							<span className="who">
								Handing <b>{s.asg.form.assign_units || 0}</b> to{" "}
								<b>{emp ? emp.employee_name : "nobody"}</b> —{" "}
								<span className="mono">{statusFor(s.asg.form)}</span>
							</span>
						</>
					) : (
						<>
							<button className="embtn pri" disabled={!emp || !!s.assignErr}
								title={!emp
									? "Pick somebody first — a handover is a thing given to a person."
									: s.assignErr
										? "The site has no Asset Assignment doctype, so there is nowhere to write one."
										: "Type a new handover: what went out, how many, until when."}
								onClick={startHandover}>
								New handover
							</button>
							<button className="embtn" disabled={!picked}
								title={picked
									? "Empty the boxes. Nothing is saved and nothing is lost — every one of them is read from the record."
									: "The boxes are already empty."}
								onClick={() => patch("asg", { pick: "" })}>
								Cancel
							</button>
							<span className="who">
								{s.asg.said ? <b className="ok">{s.asg.said}</b> : picked ? (
									<>Showing <b>{picked.asset_name || picked.name}</b>{" "}
										<span className="mono">{picked.name}</span></>
								) : (
									<span className="muted">
										{emp
											? "No handover picked — the eye in the Action column fills these boxes."
											: "Nobody is picked, so there is nothing to fill these from."}
									</span>
								)}
							</span>
						</>
					)}
				</div>

				{s.assignErr ? (
					<div className="asgbad mt-[.6rem]">
						<b>Asset Assignment could not be read.</b> {s.assignErr} Handovers cannot be written
						until the <span className="mono">manna_hr</span> app is installed on the site — which
						is a different thing from this person having been given nothing.
					</div>
				) : null}
			</div>

			{emp && !held.length ? (
				<Empty title={`Nothing is out with ${emp.employee_name}`}>
					No asset on the register names them as custodian. Where handovers are recorded that is the
					same sentence as &ldquo;they have been given nothing&rdquo;; where they are not, it says
					only that nobody wrote it down. {fmt(all.filter((a) => a.custodian).length)} of{" "}
					{fmt(all.length)} assets name anybody at all.
				</Empty>
			) : null}
		</div>
	);
}
