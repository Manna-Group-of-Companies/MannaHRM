import { useState } from "react";

import { Modal } from "@/components/ui";
import { SheetDrop, useSheet } from "@/features/onboard/sheet";
import { DOC_KINDS } from "@/data/onboard";
import { apiWrite } from "@/api/client";
import { docRows } from "@/features/onboard/shared";
import { download, toCsv } from "@/lib/csv";
import { loadOnBoard } from "@/api/load";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   **Data import from file** — the first item behind Factor HR's ↑ on the
   Document screen, photographed 4 September 2026.

   Their arrow is not a button, it is a menu of three: import from a file,
   import in the background, and download the template. The middle one is a
   queue this side has not got; the other two are a spreadsheet of document
   numbers going in, and the shape of that spreadsheet coming out.

   **This is the screen the register exists for.** Eleven documents against 504
   employees on their side, and on this one a passport field that is empty on
   almost everybody — the Document Entry form fills that in one person at a
   time, and nobody fills four hundred that way. A sheet does.

   What it writes is what the form writes: fields on `Employee`, through the
   same five-field allowlist in registry.ts. There is no Document doctype to
   create rows in, so importing a document *is* setting a field on a person,
   and a person who already has one is replaced rather than added to — counted
   before Import is pressed, because "312 rows" and "312 rows, 40 of which
   overwrite something" are different jobs.
   --------------------------------------------------------------------------- */

/** The sheet's columns. `employee_number` and `document_type` decide *where*
    a value goes — the person and the field — and the rest are the value.

    Their own words for the boxes, lower-cased and underscored: somebody
    matching this against the form they filled in yesterday should not have to
    translate. */
const COLS = ["employee_number", "document_type", "document_no",
	"expiry_date", "issue_date", "issue_place"];

/** Their template, and it is the one item on that menu with nothing to explain:
    the columns above, one example row taken from a real employee, and the
    document type spelled the way the type pills spell it. */
export function template(s) {
	const rows = docRows(s);
	const sample = rows.find((e) => e.employee_number);
	const kind = DOC_KINDS.find((k) => k.num) || {};
	download("document-import-template.csv", toCsv(COLS, [[
		sample?.employee_number || "MRI1001",
		kind.label || "Passport",
		"", "", "", "",
	]]));
}

export default function DocImport({ onClose }) {
	const s = useApp();
	const up = useSheet();

	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const people = docRows(s);
	const byCode = {};
	for (const e of people) {
		if (e.employee_number) byCode[String(e.employee_number).trim().toUpperCase()] = e;
	}

	/* The types this side can write, by the label the sheet is expected to
	   carry. Matched case-insensitively: a column typed by hand is typed by
	   hand, and refusing "passport" for not being "Passport" would be a rule
	   about capitals rather than about documents. */
	const kindOf = {};
	for (const k of DOC_KINDS) if (k.num) kindOf[k.label.toLowerCase()] = k;

	/* Every row sorted into what will happen to it. Four outcomes, and each is
	   worth its own count: the two that will not be written are not failures of
	   the file so much as facts about this site, and lumping them into "312 of
	   400 matched" would hide which. */
	const ok = [];
	const noPerson = [];
	const noType = [];
	const noNumber = [];
	for (const row of up.sheet?.rows || []) {
		const emp = byCode[String(row.employee_number || "").trim().toUpperCase()];
		const kind = kindOf[String(row.document_type || "").trim().toLowerCase()];
		if (!emp) { noPerson.push(row.employee_number || "(blank)"); continue; }
		if (!kind) { noType.push(row.document_type || "(blank)"); continue; }
		if (!String(row.document_no || "").trim()) { noNumber.push(emp.employee_number); continue; }
		ok.push({ row, emp, kind, had: emp[kind.num] || "" });
	}
	const replacing = ok.filter((r) => r.had).length;

	const missingCols = COLS.slice(0, 3).filter((c) => up.sheet && !up.sheet.cols.includes(c));
	const ready = ok.length > 0 && !missingCols.length;

	async function run() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		let wrote = 0;
		try {
			for (let i = 0; i < ok.length; i++) {
				const { row, emp, kind } = ok[i];
				/* Only the fields this type has. A passport carries its dates and its
				   place; a PAN is one field, and a sheet that fills an expiry column
				   on a PAN row is describing something this side cannot hold — those
				   values are dropped rather than written somewhere they would be
				   wrong. The count of dropped columns is not reported per row,
				   because it is a property of the type rather than of the row. */
				const patch = { [kind.num]: String(row.document_no).trim() };
				if (kind.exp && row.expiry_date) patch[kind.exp] = String(row.expiry_date).trim();
				if (kind.iss && row.issue_date) patch[kind.iss] = String(row.issue_date).trim();
				if (kind.place && row.issue_place) patch[kind.place] = String(row.issue_place).trim();

				const res = await apiWrite("Employee", emp.name, patch);
				if (!res.ok) throw new Error(`${emp.employee_number || emp.name}: ${res.error}`);
				wrote++;
				setDone(i + 1);
			}
			await loadOnBoard();
			setSaid(`Imported ${wrote} document${wrote === 1 ? "" : "s"}.`
				+ (replacing ? ` ${replacing} replaced a number that was already there.` : ""));
			up.clear();
		} catch (e) {
			/* The count matters more than the message on a partial import: the rows
			   already written are on the register, and nothing is rolled back — a
			   half-finished import that quietly undid itself would be worse than one
			   somebody can see and re-run. */
			setErr(`${String(e.message || e).slice(0, 200)} — ${wrote} of ${ok.length} were written before `
				+ "this, and those are on the register. Nothing was undone.");
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
							hint={<>A CSV of document numbers. Drag it here or click &ldquo;Browse
								Files&rdquo; — Download template on the same menu writes one.</>} />

						<button className="bulklink" type="button" disabled={busy}
							title="The six columns this reads, with one example row taken from a real employee on this site."
							onClick={() => template(s)}>
							Download template
						</button>
					</div>

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{missingCols.length ? (
						<div className="deerr">
							<b>That sheet is missing {missingCols.length === 1 ? "a column" : "columns"}:</b>{" "}
							<span className="mono">{missingCols.join(", ")}</span>. It carries{" "}
							{up.sheet.cols.join(", ") || "nothing"}. Download template for the shape.
						</div>
					) : null}

					{up.sheet && !missingCols.length ? (
						<div className="rows bulkrows">
							<Count label="Will be written" n={ok.length}
								why={`Of ${up.sheet.rows.length} row${up.sheet.rows.length === 1 ? "" : "s"} in the file.`} />
							<Count label="Replacing" n={replacing} bad={!!replacing}
								why={replacing
									? "These people already hold a number of that type. A document here is a field, so there is no second row to add — it is overwritten."
									: "Nothing in this file lands on a document that already exists."} />
							<Count label="No such employee" n={noPerson.length} bad={!!noPerson.length}
								why={noPerson.length
									? `No employee carries ${noPerson.slice(0, 4).join(", ")}${noPerson.length > 4 ? " and others" : ""}. Skipped rather than failing the file.`
									: "Every code in the file is somebody on this site."} />
							<Count label="No such type" n={noType.length} bad={!!noType.length}
								why={noType.length
									? `This site can write ${DOC_KINDS.filter((k) => k.num).map((k) => k.label).join(" and ")}. The file also asks for ${[...new Set(noType)].slice(0, 3).join(", ")}.`
									: "Every type in the file is one this side has a field for."} />
							<Count label="No number" n={noNumber.length} bad={!!noNumber.length}
								why={noNumber.length
									? "A document is its number — a row without one would write nothing and leave no row on the register."
									: "Every row carries a number."} />
						</div>
					) : null}

					{err ? <div className="deerr"><b>Nothing further was written.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={!up.sheet
								? "Attach a CSV first."
								: ok.length
									? `Write ${ok.length} document${ok.length === 1 ? "" : "s"} onto ${ok.length === 1 ? "that employee" : "those employees"}.`
									: "No row in that file can be written."}
							onClick={() => void run()}>
							{busy ? `Importing ${done} of ${ok.length}…` : "Import"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Writes document fields on <span className="mono">Employee</span> — the same five the
							Document Entry form writes, and nothing else about a person. It runs in this tab,
							so leaving the page stops it part-way; what is written stays.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
