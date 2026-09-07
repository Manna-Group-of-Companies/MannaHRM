import { useState } from "react";

import { Modal } from "@/components/ui";
import { SheetDrop, useSheet } from "@/features/onboard/sheet";
import { ASSET_WRITABLE } from "@/data/onboard";
import { apiCreate, apiWrite } from "@/api/client";
import { assetRows } from "@/features/onboard/shared";
import { download, toCsv } from "@/lib/csv";
import { loadOnBoard } from "@/api/load";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   **Data import from file** — the menu behind Data Import on Factor HR's Assets
   Details screen, photographed 4 September 2026. Two items: import from a file,
   and download the template.

   Two rather than the three on their Document screen, and the missing one is
   Run In Background — which is the honest count here, because the queue that
   item hands work to does not exist on this side either way.

   That control opened ERPNext's Data Import wizard on the site. The wizard is
   good, and the reason not to send people to it is not that it is bad: it
   imports into a doctype it asks you to name, with a column mapper, and it
   knows nothing about which nine fields this API will accept or that a
   submitted asset cannot be touched. A sheet that maps cleanly there and is
   refused here is the worst of both. So the import lives where the rules are.

   **A row with no `name` creates; a row with one updates.** That is the whole
   of the file format, and it is the shape ERPNext's own exports have, so a
   sheet exported from the site round-trips. Everything created is a **draft** —
   the POST route refuses any other docstatus — which is also what makes an
   import safe to run twice while somebody is still getting the columns right.
   --------------------------------------------------------------------------- */

/** The template's columns: the nine this API will write, with `name` in front.

    Ordered as the form reads rather than alphabetically, because somebody
    filling this in has the form open beside it. */
const COLS = ["name", "item_code", "asset_name", "asset_category", "asset_quantity",
	"gross_purchase_amount", "warranty_expiry_date", "purchase_date", "serial_no", "supplier"];

/** Which of them are numbers on the doctype, so a string from a cell is not
    saved into a Number field. */
const NUMERIC = new Set(["asset_quantity", "gross_purchase_amount"]);

/** Their Download template: the columns, and two example rows that show the one
    thing the format turns on — a blank `name` creates, a filled one updates. */
export function template(s) {
	const rows = assetRows(s);
	const draft = rows.find((a) => a.docstatus === 0);
	download("asset-import-template.csv", toCsv(COLS, [
		["", "FU-CHAIR", "Office Chair 099", draft?.asset_category || "Furniture", "1", "4500", "", "", "", ""],
		[draft?.name || "ACC-ASS-00001", "", "", "", "", "", "", "", "", ""],
	]));
}

export default function AssetImport({ onClose }) {
	const s = useApp();
	const up = useSheet();

	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const rows = assetRows(s);
	const byName = {};
	for (const a of rows) byName[a.name] = a;
	const cats = new Set((s.assetCats || []).map((c) => c.name));

	/* Every row sorted by what will happen to it, before anything happens. The
	   two that will be refused are separated from each other because they are
	   different mistakes: a name that is not on this site is a typo in the
	   sheet, and a submitted asset is a rule of the system. */
	const makes = [];
	const edits = [];
	const missing = [];
	const locked = [];
	const noName = [];
	const strayCat = new Set();

	for (const row of up.sheet?.rows || []) {
		const id = String(row.name || "").trim();
		/* Only the columns this API will accept, and only the ones the sheet
		   actually filled. A blank cell is "leave it alone" rather than "set it to
		   empty": a template is mostly blanks by design, and reading them as
		   values would wipe nine fields off every row it touched. */
		const patch = {};
		for (const c of COLS) {
			if (c === "name" || !ASSET_WRITABLE.has(c)) continue;
			const v = String(row[c] ?? "").trim();
			if (v === "") continue;
			patch[c] = NUMERIC.has(c) ? Number(v) : v;
		}
		if (patch.asset_category && cats.size && !cats.has(patch.asset_category)) {
			strayCat.add(patch.asset_category);
		}

		if (!id) {
			/* A new asset with no name is a row nobody can find afterwards — the
			   register lists by it and Search matches on it. The same guard the New
			   form puts on its Save button. */
			if (!patch.asset_name) { noName.push(row.item_code || "(blank row)"); continue; }
			makes.push({ patch });
			continue;
		}
		const had = byName[id];
		if (!had) { missing.push(id); continue; }
		if (had.docstatus === 1) { locked.push(id); continue; }
		if (!Object.keys(patch).length) continue;
		edits.push({ id, patch });
	}

	const work = makes.length + edits.length;
	const missingCols = up.sheet && !up.sheet.cols.includes("name") ? ["name"] : [];
	const ready = work > 0 && !missingCols.length;

	async function run() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		let n = 0;
		try {
			for (const e of edits) {
				const res = await apiWrite("Asset", e.id, e.patch);
				if (!res.ok) throw new Error(`${e.id}: ${res.error}`);
				n++;
				setDone(n);
			}
			for (const m of makes) {
				/* The company the register is filtered to, so a created asset lands
				   in the list somebody is looking at rather than being real, saved
				   and invisible. Same reason the New form does it. */
				const doc = { ...m.patch };
				if (s.company) doc.company = s.company;
				await apiCreate("Asset", doc);
				n++;
				setDone(n);
			}
			await loadOnBoard();
			setSaid(`Imported ${n} row${n === 1 ? "" : "s"} — ${makes.length} created as draft${makes.length === 1 ? "" : "s"}, ${edits.length} updated.`);
			up.clear();
		} catch (e) {
			setErr(`${String(e.message || e).slice(0, 200)} — ${n} of ${work} were written before this, and `
				+ "those are on the register. Nothing was undone.");
		}
		setBusy(false);
	}

	const Count = ({ label, n, why, bad }) => (
		<div className="row">
			<span>{label} <span className="muted">{why}</span></span>
			<span className="val">
				<span className={"cov " + (n ? (bad ? "none" : "live") : "live")}>{n}</span>
			</span>
		</div>
	);

	return (
		<Modal
			title="Data import from file"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<span className="bulklab">Upload File</span>
						<SheetDrop file={up.file} sheet={up.sheet} busy={busy} onTake={up.take}
							hint={<>A CSV of assets. A blank <span className="mono">name</span> creates a
								draft; a filled one updates that asset. Download template writes one.</>} />

						<button className="bulklink" type="button" disabled={busy}
							title="The ten columns this reads, with two example rows — one that creates and one that updates."
							onClick={() => template(s)}>
							Download template
						</button>
					</div>

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{missingCols.length ? (
						<div className="deerr">
							<b>That sheet has no <span className="mono">name</span> column.</b> It is what tells
							a row that creates from a row that updates — leave the cells blank to create.
							It carries {up.sheet.cols.join(", ") || "nothing"}.
						</div>
					) : null}

					{up.sheet && !missingCols.length ? (
						<div className="rows bulkrows">
							<Count label="Create" n={makes.length}
								why="Rows with no name. Each becomes a draft Asset — nothing is submitted, so nothing goes on the books until somebody does that on the site." />
							<Count label="Update" n={edits.length}
								why="Rows naming a draft asset that is on this site. Only the columns the sheet filled are written; a blank cell leaves the field alone." />
							<Count label="No such asset" n={missing.length} bad={!!missing.length}
								why={missing.length
									? `Nothing on this site is called ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " and others" : ""}. Skipped rather than created under that name, which would be a second asset with the id of one somebody meant to correct.`
									: "Every name in the file is an asset here."} />
							<Count label="Submitted" n={locked.length} bad={!!locked.length}
								why={locked.length
									? "These are on the books and a submitted document is history. The site cancels one before amending it, and that has an approval behind it."
									: "No row names a submitted asset."} />
							<Count label="No name to create with" n={noName.length} bad={!!noName.length}
								why={noName.length
									? "A new asset needs asset_name — the register lists by it and Search matches on it."
									: "Every creating row carries a name."} />
							{strayCat.size ? (
								<div className="row">
									<span>
										Unknown asset type{" "}
										<span className="muted">
											Not on the Asset Type master, so these will be written as typed and
											the master will not match them. Add them from the form&rsquo;s
											&ldquo;Add Asset Types&rdquo;, or expect a category nothing lists.
										</span>
									</span>
									<span className="val bulkmiss">{[...strayCat].slice(0, 5).join(", ")}</span>
								</div>
							) : null}
						</div>
					) : null}

					{err ? <div className="deerr"><b>Nothing further was written.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={!up.sheet
								? "Attach a CSV first."
								: work
									? `Create ${makes.length} and update ${edits.length}.`
									: "No row in that file can be written."}
							onClick={() => void run()}>
							{busy ? `Importing ${done} of ${work}…` : "Import"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Writes the same nine fields the form writes, through the same allowlist. Everything
							created is a draft. It runs in this tab, so leaving the page stops it part-way;
							what is written stays.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
