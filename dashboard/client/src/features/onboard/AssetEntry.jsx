import { useEffect, useState } from "react";

import { ASSET_FORM, ASSET_FORM_GAPS, ASSET_WRITABLE } from "@/data/onboard";
import { Desk, Empty, FieldChip, Modal, Scroll } from "@/components/ui";
import { assetRows } from "@/features/onboard/shared";
import { dmy, fmt } from "@/lib/format";
import { deskNew, deskUrl } from "@/lib/desk";
import AssetImport, { template as assetTemplate } from "@/features/onboard/AssetImport";
import { patch, useApp } from "@/store";
import { apiCreate, apiDelete, apiWrite } from "@/api/client";
import { loadOnBoard } from "@/api/load";

/* ---------------------------------------------------------------------------
   Factor HR's **Assets Details** entry form, photographed 3 September 2026.

   That screenshot is the first anybody has taken of this screen, and it settles
   what the page above it had been saying it did not know. Assets Details is not
   a register with an add button — it is a *record form*: one asset at a time,
   thirteen boxes, and a toolbar of six across the top. The register is behind
   Search.

   So this is drawn as a form and not as a table, and it is now the whole page:
   the register panels and the listing that used to sit under it were taken off
   on 3 Sep 2026, because none of them was on their screen and the register is
   behind Search where they keep it.

   **It is drawn to the capture rather than to this app's house style.** Grey
   ground, white boxes flat on it, three fixed box widths in their proportions,
   a lit toolbar strip with coloured glyphs, and no chip on any row — because
   there is no chip on any row of theirs. What the chips said is in the key
   under the form.

   **Nothing here types into anything.** Every box is filled from the asset
   picked in Search and is read-only, because this dashboard reads and the
   writes are documents on the site (CLAUDE.md §1). That is why New, Edit and
   Delete are links to the desk rather than buttons that pretend: New opens a
   blank Asset there, Edit and Delete open the one in the boxes. Print, Search
   and Close act on this page and so they work here.

   The three boxes with nothing behind them anywhere — Detail, Qty On Hand and
   Attachment — are the finding this screenshot produced and the reason it was
   worth rebuilding rather than filing. They are drawn as the same white box as
   everything else, because that is what their form does with them. What marks
   them is their **label**, greyed, which is their own convention and not one
   invented here: their Attachment label is grey for exactly this reason. The
   reason itself is on the box as a tooltip and in the key underneath.
   --------------------------------------------------------------------------- */

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const D = {
	nu: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 8v8M8 12h8",
	ed: "M4 20h4L20 8l-4-4L4 16Z",
	de: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M8.5 8.5l7 7",
	pr: "M7 9V4h10v5M7 19H5v-7h14v7h-2M7 15h10v5H7Z",
	se: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	cl: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M9 9l6 6M15 9l-6 6",
	fo: "M4 6h6l2 2h8v10H4Z",
	/* Their Data Import glyph, on the right-hand end of the bar: an arrow into
	   a tray, which is the one control up there that brings something in. */
	di: "M12 3v10M8 9l4 4 4-4M4 17v3h16v-3",
	/* Save and Open, which their bar has no equivalent of: theirs edits on the
	   record and ours has to say where the writing happens. A disk and an arrow
	   out of a box. */
	sv: "M5 4h11l3 3v13H5ZM8 4v5h7V4M8 20v-6h8v6",
	ex: "M14 4h6v6M20 4l-8 8M18 14v6H4V6h6",
	dl: "M12 3v11M8 10l4 4 4-4M4 19h16",
};

const NO_PICK = "Nothing is in the boxes. Their form opens on a record; ours asks Search for one first.";

/* Which of the writable boxes are numbers on the doctype. Only needed while
   creating: on an edit the record already holds a value and its type says what
   the box is, but a new asset has nothing to read the type off. */
const NUMERIC = new Set(["asset_quantity", "gross_purchase_amount"]);

/** One of their thirteen boxes.

    A box whose field this side has not got is still drawn, at the width the
    others are, and disabled with the reason on it. That is the same bargain the
    field lists on the unbuilt pages make: a control quietly dropped is a
    control nobody remembers to ask about, and here two of the three turn out to
    be asking for something an asset does not have. */
function Field({ f, asset, tier, edit, making, draft, onType }) {
	const dead = f.state === "build";
	/* "Not read" is not the same claim as "empty", and only the tier can tell
	   them apart — a site on the older Asset schema answers the register read
	   and not the form one, so these four boxes come back absent rather than
	   blank. See AST_FULL in api/load.js. */
	/* A claim about the read that fetched this record — so it cannot be true of
	   one that does not exist yet. On New the four `stock` boxes are typeable
	   even on a site whose Asset schema did not answer for them, which is right:
	   the field is on *our* doctype, and what a read did not carry says nothing
	   about what a create may set. */
	const unread = !making && f.state === "stock" && tier !== "full";
	const raw = asset && f.get ? f.get(asset) : undefined;
	const num = f.kind === "date" || typeof raw === "number";
	const value = raw == null || raw === ""
		? ""
		: f.kind === "date" ? dmy(raw)
			: typeof raw === "number" ? fmt(raw)
				: String(raw);

	/* Three states and the box has to say which without being read: a field
	   this read did not carry, a field that does not exist, and everything
	   else. The chip beside it says the same thing in words. */
	const state = dead ? "build" : unread ? "stock" : "live";

	/* "not read", "empty" and nothing at all are three different answers, and
	   the last one is the honest reply while no record is picked. Only a box
	   with a record behind it and nothing in it may say empty — a box with no
	   field behind it at all is not empty, it is absent, and saying "empty"
	   there would be a claim about a record rather than about the doctype. */
	const hint = dead ? "" : unread ? "not read" : asset && !value ? "empty" : "";

	/* **Whether this box can be typed into.** Three things have to be true: the
	   form is in edit mode, there is a record in it, and the field is one the
	   server will accept — see ASSET_WRITABLE, which mirrors the allowlist in
	   registry.ts and exists so the form does not offer a box the server would
	   refuse.

	   `unread` boxes are excluded even though their field is writable. A site on
	   the older Asset schema did not send those four back, so the box is empty
	   because nothing was read rather than because nothing is there — and
	   saving an empty box over a value that was simply not fetched would delete
	   data this screen never saw. */
	/* `making` stands in for the record while a new one is being typed: there is
	   nothing to read a value off, but the box is still the one that will carry
	   it. Without this every box on New would be read-only, since `asset` is
	   null by construction there. */
	const typeable = edit && (asset || making) && !dead && !unread && ASSET_WRITABLE.has(f.key);

	/* Editing shows what is being typed; not editing shows what the record
	   holds, formatted. A date is the clearest case of why they differ: the box
	   reads `04-09-2026` at rest and has to hold `2026-09-04` while a date
	   picker is attached to it. */
	const typed = draft && Object.prototype.hasOwnProperty.call(draft, f.key)
		? draft[f.key]
		: (raw == null ? "" : String(raw));

	const why = dead || unread
		? f.why
		: typeable
			? `${f.label} — writes \`${f.key}\` on this asset. ${f.why}`
			: edit && asset && !ASSET_WRITABLE.has(f.key)
				? `${f.label} cannot be typed into. ${f.why}`
				: `${f.label} — ${f.why}`;

	/* **A row of the grid or half of one.** `sm` is the eight short boxes that
	   sit in pairs on their form — Quantity beside Rate, Warranty Date beside
	   Purchase Date — so those take one column each and the grid pairs them by
	   falling into the next slot. Everything else takes the row: the three long
	   boxes, Code, and Attachment.

	   Read off `w` rather than off `pair`, which is what the old left-label
	   layout used and got wrong. `pair` marks the *second* field of each couple,
	   so only Rate, Value, Purchase Date and Vendor Name were ever narrowed —
	   Quantity took a full row and Rate wrapped onto the next one, away from the
	   box it belongs beside. Which half of a pair a field is does not decide how
	   wide it is; how wide it is does. */
	const wide = f.w !== "sm";

	return (
		<div className={"afbox" + (wide ? " wide" : "")}>
			<label className={dead || unread ? "off" : ""} htmlFor={"af-" + f.key}>{f.label}</label>
			<div className="ctl">
				{/* Attachment is a Browse button and nothing else on their form —
				    no box beside it — so it is one here too. */}
				{f.key === "attachment" ? null : f.area ? (
					<textarea id={"af-" + f.key} rows={3} readOnly disabled value=""
						className={"w" + (f.w || "lg")} data-state={state} title={f.why} />
				) : (
					<input
						id={"af-" + f.key}
						/* `type` only while editing. A date box at rest shows their
						   `04-09-2026`, and a native date input cannot: it would either
						   show the ISO form or, told to, a picker on a record nobody is
						   changing. */
						type={typeable ? (f.kind === "date" ? "date" : num ? "number" : "text") : "text"}
						className={"w" + (f.w || "lg") + (num && !typeable ? " num" : "")}
						/* Typeable when it can be, read-only when it cannot. `readOnly`
						   rather than `disabled` on a box that merely is not being
						   edited: a disabled input is skipped by the tab key and is not
						   selectable, and a value nobody can copy is a value somebody
						   has to retype somewhere else. */
						readOnly={!typeable}
						disabled={dead || unread}
						data-state={state}
						value={typeable ? typed : unread ? "" : value}
						placeholder={typeable ? "" : hint}
						onChange={typeable ? (e) => onType(f.key, e.target.value) : undefined}
						title={why}
					/>
				)}

				{/* Their one link, beside Asset Type. Ours opens the master it names,
				    which is where an asset type is actually added. */}
				{f.key === "asset_category" ? <AddTypes /> : null}
				{f.key === "attachment" ? (
					<button id={"af-" + f.key} className="embtn browse" disabled title={f.why}>
						<Ic d={D.fo} /> Browse
					</button>
				) : null}
			</div>
		</div>
	);
}

/** Their "Add Asset Types" link. An asset type is a master, and a master is a
    document on the site — so it goes there rather than opening a box here. */
function AddTypes() {
	return (
		<button className="aflink" type="button"
			title="Their link, and it opens their Add Asset Types grid. Types can be added here and unused ones deleted; renaming one is a rewrite of every asset in it, and the dialog says so."
			onClick={() => patch("aform", { types: true })}>
			Add Asset Types
		</button>
	);
}

/** Their Delete, and what deleting an asset is allowed to be here.

    Two things stop it, and both are the server's rules rather than this
    dialog's — it only says them earlier, so nobody presses a button to be told
    no:

      submitted   an asset on the books is history. The site cancels first, and
                  cancelling is an act with an approval behind it.
      movements   an Asset Movement names its asset by string, so deleting one
                  that has been issued leaves a movement recording a handover of
                  nothing. The server counts them and refuses with the number.

    Neither is undoable, which is why this asks. Nothing here keeps a copy of
    what it deleted, so the confirmation is the whole safety net. */
function AssetDelete({ s, asset, onClose }) {
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	const submitted = asset.docstatus === 1;
	const moves = s.assetMoves.filter((m) => m.asset === asset.name);
	const blocked = submitted || moves.length > 0;

	async function remove() {
		setBusy(true);
		setErr("");
		try {
			await apiDelete("Asset", asset.name);
			await loadOnBoard();
			patch("aform", { pick: "", q: "", open: false });
			onClose();
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
			setBusy(false);
		}
	}

	return (
		<div className="dedel">
			<p className="dedelsay">
				This removes <b>{asset.asset_name || asset.name}</b>,{" "}
				<span className="mono">{asset.name}</span>.
			</p>

			<div className="rows">
				<div className="row">
					<span>
						Status{" "}
						<span className="muted">
							{submitted
								? "A submitted asset is on the books. The site cancels one before deleting it, and cancelling has an approval behind it."
								: "A draft is a record on file and nothing else — it is on nobody's books until it is submitted."}
						</span>
					</span>
					<span className="val">
						<span className={"cov " + (submitted ? "none" : "live")}>
							{submitted ? "Submitted — cannot be deleted" : "Draft"}
						</span>
					</span>
				</div>
				<div className="row">
					<span>
						Movements{" "}
						<span className="muted">
							{moves.length
								? "A movement names its asset by string, so deleting this one leaves them recording a handover of nothing."
								: "Nothing has been issued or returned, so no history is left behind."}
						</span>
					</span>
					<span className="val">
						{moves.length
							? <span className="cov none">{fmt(moves.length)} against this asset</span>
							: <span className="cov live">None</span>}
					</span>
				</div>
			</div>

			{blocked ? (
				<p className="dedelwarn">
					{submitted && moves.length
						? "Both of these stand in the way. "
						: null}
					This asset cannot be deleted from here. Open it on the site, where cancelling and
					deleting are one workflow with the checks attached.
				</p>
			) : (
				<p className="dedelwarn">
					There is no undo. Nothing on this dashboard keeps a copy of what it deleted, so this is
					the only place to change your mind.
				</p>
			)}

			{err ? <div className="deerr"><b>Nothing was deleted.</b> {err}</div> : null}

			<div className="defoot">
				<button className="btn bad" disabled={busy || blocked}
					title={blocked
						? "Blocked by the two rows above."
						: `Delete ${asset.name} permanently.`}
					onClick={() => void remove()}>
					{busy ? "Deleting…" : "Delete the asset"}
				</button>
				<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
				<Desk className="embtn" label="Open on the site"
					href={s.site && deskUrl(s.site, "Asset", asset.name)}
					title="Open this asset on the ERPNext site, where a submitted one is cancelled before it is deleted.">
					Open on the site
				</Desk>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
   Factor HR's **Add Asset Types** dialog, photographed 4 September 2026 — what
   opens off the blue link beside the Asset Type box.

   A grid rather than a form: a tick column, a row number, Name, and a column
   headed "Hide out of stock assets". Four types on their capture, then blank
   rows waiting to be typed into. Save and Delete across the top.

   **Three of the four things it offers are real here and one is not, and the
   split is the finding.**

     Add       a blank row typed into and saved creates an Asset Category. This
               is the whole reason the master exists on this side now: the box
               it feeds was free text, so every asset was classified by whatever
               somebody typed.
     Delete    removes a category, and only while no asset is in it. The server
               counts what points at it and refuses with the number — a master
               is pointed at by string here, so deleting one in use leaves those
               assets referencing something that is not there and no database
               constraint notices.
     Rename    **refused, and this is the interesting one.** Their Name cell
               looks editable on every row and ours is not, past the first save.
               A category is prompt-named: the name *is* the id, and every Asset
               carries it as a string rather than as a key. Changing it means
               rewriting every one of them — Frappe calls that `rename_doc` and
               gives it its own machinery. A box that quietly did half of that
               is worse than one that says so.
     Hide out
     of stock  nothing on either side. It is a display rule about a stock level,
               and an Asset is one capitalised thing with no on-hand quantity —
               the same finding the Qty On Hand box on the form behind this
               produces. Drawn and dead, at their width, in their position.
   --------------------------------------------------------------------------- */

/** How many blank rows hang below the real ones. Theirs runs to the bottom of
    the dialog; four is enough to type a handful without the grid becoming
    mostly emptiness, and Save keeps whichever were filled. */
const BLANKS = 4;

function AddTypesDialog({ s, onClose }) {
	const cats = s.assetCats;
	const rows = assetRows(s);

	/* What is typed into the blank rows, and which existing rows are ticked.
	   Local, like every other draft on this screen: a half-typed category that
	   outlived the dialog would come back the next time it opened. */
	const [made, setMade] = useState(Array(BLANKS).fill(""));
	const [ticked, setTicked] = useState([]);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	/* How many assets are in each category, counted here rather than asked for.
	   It is what turns Delete from a button that might fail into one that says
	   what it would take — and it is the same count the server refuses on, so
	   the two cannot disagree about whether a row can go. */
	const used = {};
	for (const a of rows) {
		if (a.asset_category) used[a.asset_category] = (used[a.asset_category] || 0) + 1;
	}

	const adding = made.map((t) => t.trim()).filter(Boolean);
	/* A name already on the master, or typed into two blank rows at once. Caught
	   here because the second one never reaches the server as a conflict: the
	   first create takes the name and the second is refused by it, which reads
	   as a random failure on a row somebody typed correctly. */
	const clash = adding.filter((t, i) =>
		cats.some((c) => c.name.toLowerCase() === t.toLowerCase())
		|| adding.findIndex((o) => o.toLowerCase() === t.toLowerCase()) !== i);

	const canSave = adding.length > 0 && clash.length === 0;
	const canDelete = ticked.length > 0 && ticked.every((n) => !used[n]);

	async function save() {
		setBusy(true); setErr(""); setSaid("");
		try {
			for (const name of adding) {
				await apiCreate("Asset Category", { asset_category_name: name });
			}
			await loadOnBoard();
			setMade(Array(BLANKS).fill(""));
			setSaid(`Added ${adding.length} type${adding.length > 1 ? "s" : ""}.`);
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
		}
		setBusy(false);
	}

	async function remove() {
		setBusy(true); setErr(""); setSaid("");
		try {
			for (const name of ticked) await apiDelete("Asset Category", name);
			await loadOnBoard();
			setSaid(`Deleted ${ticked.length} type${ticked.length > 1 ? "s" : ""}.`);
			setTicked([]);
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
		}
		setBusy(false);
	}

	const toggle = (name) =>
		setTicked((t) => (t.includes(name) ? t.filter((n) => n !== name) : t.concat(name)));

	/* Their header tick selects every row. Only the ones that can actually go,
	   because a select-all that includes rows Delete will refuse turns one click
	   into a refusal about a row nobody chose. */
	const free = cats.filter((c) => !used[c.name]).map((c) => c.name);
	const allOn = free.length > 0 && free.every((n) => ticked.includes(n));

	return (
		<div className="attypes">
			<div className="attbar">
				<button className="embtn" data-act="save" disabled={busy || !canSave}
					title={clash.length
						? `"${clash[0]}" is already a type. A category is named by itself, so two cannot share a name.`
						: canSave
							? `Add ${adding.join(", ")}.`
							: "Type a name into one of the blank rows."}
					onClick={() => void save()}>
					<Ic d={D.sv} /> {busy ? "Saving…" : "Save"}
				</button>
				<button className="embtn" data-act="delete" disabled={busy || !canDelete}
					title={!ticked.length
						? "Tick a type to delete it."
						: canDelete
							? `Delete ${ticked.join(", ")}.`
							: `${ticked.filter((n) => used[n]).map((n) => `${n} has ${used[n]} asset${used[n] > 1 ? "s" : ""} in it`).join(", ")}. Move them first — a category deleted out from under an asset leaves it pointing at nothing.`}
					onClick={() => void remove()}>
					<Ic d={D.de} /> Delete
				</button>
			</div>

			{s.assetCatErr ? (
				<div className="deerr">
					<b>The Asset Type master could not be read.</b> {s.assetCatErr}
				</div>
			) : null}
			{err ? <div className="deerr"><b>Nothing was changed.</b> {err}</div> : null}
			{said ? <div className="afsaid">{said}</div> : null}

			<Scroll>
				<table className="atttab">
					<thead>
						<tr>
							<th className="ck">
								<input type="checkbox" checked={allOn} disabled={busy || !free.length}
									aria-label="Select every type that can be deleted"
									title={free.length
										? "Select every type with no assets in it. The ones in use are left alone — Delete would refuse them."
										: "Every type has assets in it, so none of them can be deleted."}
									onChange={() => setTicked(allOn ? [] : free)} />
							</th>
							<th className="n" />
							<th>Name</th>
							{/* Their second column, at their width, dead. */}
							<th className="empty"
								title="A display rule about a stock level. An Asset is one capitalised thing and has no on-hand quantity — in ERPNext that is Bin against an Item, which an Asset is not. There is nothing on either side to tick.">
								Hide out of stock assets
							</th>
						</tr>
					</thead>
					<tbody>
						{cats.map((c, i) => {
							const n = used[c.name] || 0;
							return (
								<tr key={c.name}>
									<td className="ck">
										<input type="checkbox" checked={ticked.includes(c.name)}
											disabled={busy || n > 0}
											aria-label={`Select ${c.name}`}
											title={n
												? `${n} asset${n > 1 ? "s are" : " is"} in this type, so it cannot be deleted.`
												: "Nothing is in this type, so it can be deleted."}
											onChange={() => toggle(c.name)} />
									</td>
									<td className="n">{i + 1}</td>
									<td>
										{/* Read-only past the first save, and the title says why.
										    Drawn as their box rather than as text so the column
										    still reads as their column. */}
										<input className="attname" readOnly value={c.name}
											title={`A category is named by itself, so this name is the record's id and every asset carries it as a string. Renaming it means rewriting ${n || "every"} asset${n === 1 ? "" : "s"} that point at it — that is rename_doc on the site, not a box here.`} />
										<span className="attuse">
											{n ? `${fmt(n)} asset${n > 1 ? "s" : ""}` : "empty"}
										</span>
									</td>
									<td className="gone" title="Nothing on either side holds this.">-</td>
								</tr>
							);
						})}

						{/* Their blank rows. Numbered on from the real ones, the way theirs
						    are — 5, 6, 7, 8 under four types. */}
						{made.map((t, i) => (
							<tr key={"new" + i} className="attnew">
								<td className="ck" />
								<td className="n">{cats.length + i + 1}</td>
								<td>
									<input className="attname" value={t} disabled={busy}
										placeholder={i === 0 && !cats.length ? "Type a name" : ""}
										aria-label={`New asset type ${i + 1}`}
										title="Type a name and press Save. It creates an Asset Category, which is what the Asset Type box on the form reads."
										onChange={(e) => setMade((m) => m.map((v, j) => (j === i ? e.target.value : v)))} />
								</td>
								<td className="gone">-</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<p className="attwhy">
				Their dialog edits the Name on every row. This one does not, and it is not a shortcut:
				a category is named by itself, so the name is the record&rsquo;s id and every asset points
				at it by that string. Renaming rewrites all of them at once, which is{" "}
				<span className="mono">rename_doc</span> on the site.{" "}
				<Desk className="aflink" label="Open the Asset Category master"
					href={s.site && deskNew(s.site, "Asset Category")}
					title="Open a blank Asset Category on the ERPNext site — where a category also carries its depreciation schedule, which nothing here sets.">
					Open it there
				</Desk>{" "}
				to rename one, or for the depreciation schedule a category carries and this dialog does not.
			</p>
		</div>
	);
}

/** The register, behind their Search. Their form is one record at a time and
    this is how a second one is chosen — so picking closes the panel, the way
    picking from a search box always should. */
function Search({ s, rows }) {
	const q = (s.aform.q || "").trim().toLowerCase();
	const hits = (q
		? rows.filter((a) =>
			`${a.name} ${a.asset_name || ""} ${a.item_code || ""} ${a.asset_category || ""}`
				.toLowerCase().includes(q))
		: rows
	).slice(0, 40);

	return (
		<div className="afsearch">
			<input type="search" autoFocus placeholder="Search the register — name, code or type"
				aria-label="Search assets" value={s.aform.q}
				onChange={(e) => patch("aform", { q: e.target.value })} />
			{hits.length ? (
				<div className="afhits">
					{hits.map((a) => (
						<button key={a.name} onClick={() => patch("aform", { pick: a.name, open: false })}
							title={`Put ${a.asset_name || a.name} in the form`}>
							<b>{a.asset_name || a.name}</b>
							<span className="mono">{a.name}</span>
							<span className="muted">{a.asset_category || "—"}</span>
						</button>
					))}
				</div>
			) : (
				<div className="afnone">
					Nothing matches, out of {fmt(rows.length)} in the register.
				</div>
			)}
			{hits.length === 40 ? (
				<div className="afmore">First 40 shown — narrow the search.</div>
			) : null}
		</div>
	);
}

export default function AssetEntry() {
	const s = useApp();
	const rows = assetRows(s);
	const asset = (s.aform.pick && rows.find((a) => a.name === s.aform.pick)) || null;
	const tier = s.assetTier;

	/* A picked asset the company filter has since excluded is not an error and
	   not a record — the boxes empty and the toolbar goes back to needing a
	   Search, which is what actually happened. */
	const gone = s.aform.pick && !asset;

	/* ------------------------------------------------------------- editing

	   Their Edit button used to open the record on the ERPNext site. It turns
	   these boxes on instead, and the link to the site is still there — on
	   Open, beside Save — because the nine boxes here are not the whole record
	   and the rest of it is still corrected where it lives.

	   The draft is local rather than in the store, for the same reason the
	   Document Entry dialog's is: a half-typed value that outlived the form
	   would reappear on the next asset somebody picked. It is keyed by the
	   form's `key`, which is the Asset field name for every box that can be
	   typed into. */
	/* **A submitted asset cannot be typed into, and that is not this form's
	   rule.** `docstatus` 1 is history: the PUT route refuses one outright,
	   because amending a submitted document changes the basis of a decision
	   somebody may already have acted on. ERPNext says the same thing about the
	   same records. So Edit is offered on a draft and explained on the rest,
	   with Open beside it — amending on the site is a deliberate act with an
	   approval behind it, which is the right shape for this.

	   Read off the record rather than assumed, which is why `docstatus` is on
	   all three asset field lists in api/load.js. */
	const submitted = !!asset && asset.docstatus === 1;

	/* The Data Import menu closes on Escape or on a click outside it; its own
	   button stops propagation so the toggle is not fighting this. */
	useEffect(() => {
		if (!s.aform.dmenu) return undefined;
		const shut = () => patch("aform", { dmenu: false });
		const onKey = (e) => { if (e.key === "Escape") shut(); };
		document.addEventListener("keydown", onKey);
		document.addEventListener("click", shut);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("click", shut);
		};
	}, [s.aform.dmenu]);

	const [edit, setEdit] = useState(false);
	/* **New is the same form with nothing in it.** Their capture of it is this
	   screen with the toolbar down to Save and Cancel and every box empty, which
	   is what `making` produces — rather than a second component that would
	   drift from this one the first time a box moved.

	   It is a separate flag from `edit` because the two differ in three places
	   and only three: the boxes read off a blank rather than off a record, Save
	   POSTs instead of PUTs, and there is no record behind the form to open on
	   the site or to print. */
	const [making, setMaking] = useState(false);
	const [draft, setDraft] = useState({});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	/* The record the boxes read from. Nothing, while a new one is being typed —
	   which is what empties them, since every box falls back to "" when there is
	   no record and no draft key. */
	const on = making ? null : asset;
	const busyForm = edit || making;

	const stop = () => { setEdit(false); setMaking(false); setDraft({}); setErr(""); };
	const onType = (key, v) => {
		setSaid("");
		setDraft((d) => ({ ...d, [key]: v }));
	};

	/* Only what changed, compared against the record rather than against a
	   remembered copy of it — a PUT carrying all nine would move `modified` on
	   assets nobody touched. Numbers go over as numbers: the boxes hand back
	   strings, and `asset_quantity: "3"` saved into a Number field is a value
	   Mongo will cast today and somebody will be confused by later. */
	const changes = {};
	if (on || making) {
		for (const f of ASSET_FORM) {
			if (!ASSET_WRITABLE.has(f.key)) continue;
			if (!Object.prototype.hasOwnProperty.call(draft, f.key)) continue;
			const was = on ? on[f.key] : undefined;
			const now = draft[f.key];
			/* On a create there is nothing to compare against, so an empty box is
			   simply not sent — a new Asset with `serial_no: ""` and one without
			   the key are the same record, and the shorter payload is the one that
			   does not claim somebody typed a blank. */
			if (making && String(now ?? "") === "") continue;
			if (!making && String(was ?? "") === String(now ?? "")) continue;
			/* Numbers go over as numbers. The boxes hand back strings, and
			   `asset_quantity: "3"` in a Number field is a value Mongo casts today
			   and somebody is confused by later. `kind: "date"` and the two known
			   text fields stay text; the rest are numeric on the doctype. */
			const numeric = f.kind !== "date"
				&& (typeof was === "number" || (making && NUMERIC.has(f.key)));
			changes[f.key] = numeric && now !== "" ? Number(now) : now;
		}
	}
	const dirty = Object.keys(changes).length > 0;
	/* A new asset needs a name to be findable afterwards — the register lists by
	   it and Search matches on it. Their form leaves it to the site to complain;
	   this says so on the button before the round trip. */
	const missing = making && !String(draft.asset_name || "").trim();

	async function save() {
		setBusy(true);
		setErr("");
		try {
			if (making) {
				/* The company the register is filtered to, so the new asset lands in
				   the list somebody is looking at. Without it a created asset is
				   real, saved, and invisible — `assetRows` filters on exactly this
				   and the form would look as though nothing had happened. */
				const doc = { ...changes };
				if (s.company) doc.company = s.company;
				const created = await apiCreate("Asset", doc);
				await loadOnBoard();
				/* Straight into the form, which is where their New leaves you: the
				   record now exists and the next thing anybody does is look at it. */
				patch("aform", { pick: created?.name || "", open: false });
				setSaid(`Created ${created?.name || "the asset"} as a draft. It is not submitted, so it can still be edited here.`);
				setMaking(false);
				setDraft({});
				setBusy(false);
				return;
			}

			const res = await apiWrite("Asset", asset.name, changes);
			/* The server keeps its own allowlist and answers by name when a field
			   is not on it. Shown as it arrived rather than reworded: if the two
			   lists ever drift apart, the sentence that says which field was
			   refused is the one worth reading. */
			if (!res.ok) throw new Error(res.error || "The site refused the change.");
			await loadOnBoard();
			setSaid(`Saved ${Object.keys(changes).length} field${Object.keys(changes).length > 1 ? "s" : ""}.`);
			setEdit(false);
			setDraft({});
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
		}
		setBusy(false);
	}

	return (
		<div className="afform">
			<div className="afbar">
				{busyForm ? (
					/* **Their toolbar while the form is open, and it is two buttons.**
					   The capture of New shows exactly this: Save, Cancel, and nothing
					   else. Which is right rather than merely faithful — Search would
					   throw away what has been typed, Delete and Print have no record
					   to act on while one is being made, and New inside New is
					   nothing. A toolbar that keeps offering six ways out of a form is
					   how work gets lost. */
					<>
						<button className="embtn" data-act="save" disabled={busy || !dirty || missing}
							title={missing
								? "A new asset needs a Name. The register lists by it and Search matches on it."
								: dirty
									? (making
										? `Create a draft Asset with ${Object.keys(changes).join(", ")}.`
										: `Write ${Object.keys(changes).join(", ")} to ${asset.name}.`)
									: "Nothing has been typed."}
							onClick={() => void save()}>
							<Ic d={D.sv} /> {busy ? "Saving…" : "Save"}
						</button>
						<button className="embtn" data-act="cancel" disabled={busy}
							title={making
								? "Throw the new asset away. Nothing has been created yet."
								: "Put the boxes back to what the record holds. Nothing has been written yet."}
							onClick={stop}>
							<Ic d={D.cl} /> Cancel
						</button>
						<span className="afwho">
							{making
								? <b>New asset — not saved yet</b>
								: <>Editing <b>{asset.asset_name || asset.name}</b> <span className="mono">{asset.name}</span></>}
						</span>
					</>
				) : (
					<>
						{/* Their New, and it now opens this form empty rather than the
						    site. What it creates is a **draft** — the POST route refuses
						    any other docstatus — which is the right shape for it: an
						    asset at docstatus 0 is a record on file and nothing else, and
						    submitting it is the act that puts it on the books. */}
						<button className="embtn" data-act="new"
							title="A blank Asset, typed in here. It saves as a draft — an asset only goes on the books when it is submitted, and submitting is done on the site."
							onClick={() => { setMaking(true); setDraft({}); setSaid(""); setErr(""); patch("aform", { open: false }); }}>
							<Ic d={D.nu} /> New
						</button>

						<button className="embtn" data-act="edit" disabled={!asset || submitted}
							title={!asset
								? NO_PICK
								: submitted
									? "This asset is submitted, and a submitted document is history — amending one changes the basis of a decision somebody may already have acted on. The site refuses it too. Open it there, where amending has an approval behind it."
									: "Type into the boxes. Nine of the thirteen can be changed here; the other four say why not when you hover them."}
							onClick={() => { setEdit(true); setSaid(""); }}>
							<Ic d={D.ed} /> Edit
						</button>

						{/* Still a link to the site, and still needed: these nine boxes
						    are not the whole Asset. Status, custodian and the
						    depreciation schedule are on the record and are not typed
						    into here. */}
						<Desk className="embtn" data-act="open" label="Open on the site"
							href={asset && s.site ? deskUrl(s.site, "Asset", asset.name) : ""}
							dead={asset ? undefined : NO_PICK}
							title="Open this asset on the ERPNext site — for the fields this form does not carry, and for the ones it will not write: status and custodian move by submitting an Asset Movement, not by typing.">
							<Ic d={D.ex} /> Open
						</Desk>

						<button className="embtn" data-act="delete" disabled={!asset}
							title={asset
								? "Delete this asset. It asks first, and says what stands in the way — a submitted asset is history, and one that has been moved has movements that would be left recording a handover of nothing."
								: NO_PICK}
							onClick={() => patch("aform", { del: true })}>
							<Ic d={D.de} /> Delete
						</button>
						<button className="embtn" data-act="print" onClick={() => window.print()}
							title="Print this form. The page has a print stylesheet — the chrome drops away and the record stays.">
							<Ic d={D.pr} /> Print
						</button>
						<button className="embtn" data-act="search" aria-pressed={s.aform.open}
							title="Their form is one record at a time; this is how the register chooses which one."
							onClick={() => patch("aform", { open: !s.aform.open, q: "" })}>
							<Ic d={D.se} /> Search
						</button>
						<button className="embtn" data-act="close" disabled={!asset && !s.aform.open}
							title={asset || s.aform.open
								? "Empty the form. Nothing is saved and nothing is lost — every box here is read from the record."
								: "The form is already empty."}
							onClick={() => { stop(); patch("aform", { pick: "", q: "", open: false }); }}>
							<Ic d={D.cl} /> Close
						</button>

						<span className="afwho">
							{asset
								? <>Showing <b>{asset.asset_name || asset.name}</b> <span className="mono">{asset.name}</span></>
								: <span className="muted">
									{gone ? "That asset is not in the current company filter." : "No record — press Search."}
								</span>}
						</span>

						{/* Their Data Import, at the right-hand end of the bar on its own,
						    which is where it is on the capture — **and their caret now has
						    a menu behind it**: import from a file, and download the
						    template. Two items, which is what their Assets menu carries;
						    the Document screen's third, Run In Background, is a queue this
						    side has not got either way.

						    It opened ERPNext's Data Import wizard until now. The wizard is
						    good, and the reason not to send people there is not that it is
						    bad: it knows nothing about which nine fields this API accepts
						    or that a submitted asset cannot be touched, so a sheet that
						    maps cleanly there and is refused here is the worst of both.
						    The import belongs where the rules are. */}
						<span className="empdrop afimport">
							<button className="embtn" data-act="import" aria-haspopup="menu"
								aria-expanded={s.aform.dmenu}
								title="Load assets from a spreadsheet, or download the template first."
								onClick={(e) => { e.stopPropagation(); patch("aform", { dmenu: !s.aform.dmenu }); }}>
								<Ic d={D.di} /> Data Import <b className="cx">▾</b>
							</button>
							<div className="emmenu end" role="menu" aria-label="Data Import"
								hidden={!s.aform.dmenu}>
								<button role="menuitem"
									title="Read a CSV of assets. A blank name creates a draft, a filled one updates that asset, and the dialog says what it found before writing anything."
									onClick={(e) => { e.stopPropagation(); patch("aform", { dmenu: false, imp: true }); }}>
									<Ic d={D.di} /> Data import from file
								</button>
								<button role="menuitem"
									title="The ten columns the import reads, with two example rows — one that creates and one that updates."
									onClick={(e) => { e.stopPropagation(); patch("aform", { dmenu: false }); assetTemplate(s); }}>
									<Ic d={D.dl} /> Download template
								</button>
							</div>
						</span>
					</>
				)}
			</div>

			{s.aform.open && !busyForm ? <Search s={s} rows={rows} /> : null}

			{s.aform.imp ? <AssetImport onClose={() => patch("aform", { imp: false })} /> : null}

			{s.aform.del && asset ? (
				<Modal title="Delete this asset?"
					extra={<AssetDelete s={s} asset={asset} onClose={() => patch("aform", { del: false })} />}
					onClose={() => patch("aform", { del: false })} />
			) : null}

			{s.aform.types ? (
				<Modal title="Add Asset Types" wide
					extra={<AddTypesDialog s={s} onClose={() => patch("aform", { types: false })} />}
					onClose={() => patch("aform", { types: false })} />
			) : null}

			{err ? <div className="deerr"><b>Nothing was saved.</b> {err}</div> : null}
			{said ? <div className="afsaid">{said}</div> : null}

			{/* Said on the form rather than only in a tooltip on a greyed Edit. A
			    disabled button explains itself to whoever hovers it; this is the
			    reason most people will meet, because most assets are submitted. */}
			{submitted && !busyForm ? (
				<div className="afnote">
					<b>Submitted — read only.</b> This asset is at docstatus 1, so its record is history and
					neither this form nor the site will let it be typed into. A draft one can be. Open it on
					the site to amend it, where that act has an approval behind it.
				</div>
			) : null}

			<div className={"afgrid" + (busyForm ? " editing" : "")}>
				{ASSET_FORM.map((f) => (
					<Field key={f.key} f={f} asset={on} tier={tier}
						edit={busyForm} making={making} draft={draft} onType={onType} />
				))}
			</div>

			{/* Their form carries no chip on any box, so neither does this one. What
			    the chips used to say is here instead, and the boxes keep the one
			    signal their own form already uses for it: Attachment's label is grey
			    on their screen because there is nothing behind it, and every label
			    here that has nothing behind it is grey for the same reason. Hover
			    any box for the field it reads, or why there is none. */}
			<div className="afkey">
				<span><FieldChip state="live" /> read off the record</span>
				<span><FieldChip state="stock" /> ERPNext&rsquo;s own field{tier === "full" ? "" : ", not in this read"}</span>
				<span>
					<FieldChip state="build" /> {ASSET_FORM_GAPS} with nothing behind them anywhere —{" "}
					{ASSET_FORM.filter((f) => f.state === "build").map((f) => f.label).join(", ")}
				</span>
				<span className="afkeynote">Grey label = one of the last two.</span>
			</div>

			{rows.length ? null : (
				<div className="mt-[.7rem]">
					<Empty title="Search has nothing to offer">
						The register is empty, so no record can be put in the boxes. The form is drawn anyway —
						it is what their screen looks like before anything is loaded too.
					</Empty>
				</div>
			)}
		</div>
	);
}
