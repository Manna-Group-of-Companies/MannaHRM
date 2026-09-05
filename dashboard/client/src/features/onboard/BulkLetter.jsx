import { useState } from "react";

import { Modal } from "@/components/ui";
import { RunInBackground, SheetDrop, useSheet } from "@/features/onboard/sheet";
import { apiCreate } from "@/api/client";
import { download, parseCsv, toCsv } from "@/lib/csv";
import { load } from "@/api/load";
import { patch, useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Generate Bulk Letter** dialog, photographed 4 September 2026 —
   what opens off the button beside their letter register.

   Four controls and two buttons, in their order: a letter type dropdown, a
   Download Template link, a drag-and-drop Upload File area with a Browse Files
   button, and a Run In Background tick. Generate and Cancel underneath.

   **This is the screen their register is for.** One letter has been issued
   through that register in three years against seventeen maintained formats,
   which is the finding the page under this keeps reporting — and a bulk dialog
   is the answer to why: nobody issues letters one at a time, so a register whose
   only entrance is a single-record form stays empty. This is the entrance.

   Three of the four controls do their job here and one cannot:

     Letter Type        the real `Letter Type` master, filtered to the active
                        ones — the same list the single-letter form offers.
     Download Template  a real file, with the columns this dialog reads and one
                        example row. CSV rather than their .xls, and the reason
                        is under Upload File.
     Upload File        reads the sheet, matches every row to an employee by
                        code, and says what matched *before* Generate is pressed.
                        **CSV only.** `.xls` and `.xlsx` are ZIP-and-XML and
                        compound-binary containers; reading either means a
                        spreadsheet parser this app does not carry and would not
                        carry for one screen. A dropped `.xlsx` is refused by
                        name rather than failing halfway through.
     Run In Background  drawn and dead. Theirs hands the job to a queue and
                        emails when it finishes. There is no queue here and
                        nothing to email from: this runs in the tab, which is
                        why the count and the progress line are on the button.

   **Generate writes.** One `Employee Letter` per matched row, created as the
   documents they are — see the note beside `Employee Letter` in the server's
   registry.ts for why bulk creation is allowed where the single-letter form
   still hands off to the site.
   --------------------------------------------------------------------------- */

/** The columns this dialog reads, and the whole of what a sheet needs.

    `employee_number` is the only required one and it is the code rather than
    the record id on purpose: `MRI1042` is what somebody has in the spreadsheet
    they already keep, and `HR-EMP-00042` is what this database calls the same
    person. Asking for the second would mean asking somebody to look up all four
    hundred. */
const COLS = ["employee_number", "letter_date", "reference_number", "remarks"];

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const DOWN = "M12 3v11M8 10l4 4 4-4M4 19h16";

/** Today, as an input[type=date] wants it. The fallback for a sheet that leaves
    `letter_date` blank — a letter with no date on it is a letter nobody can
    order, and refusing the row over it would be worse than dating it today. */
const today = () => new Date().toISOString().slice(0, 10);

export default function BulkLetter({ onClose }) {
	const s = useApp();
	const up = useSheet();

	const [type, setType] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const types = s.letterTypes || [];

	/* Everybody, by code. Built once per render off the list the dashboard
	   already holds rather than asked for again: matching four hundred rows is
	   four hundred lookups, and a linear scan of each would be the slowest thing
	   this app does. */
	const byCode = {};
	for (const e of s.employees) {
		if (e.employee_number) byCode[String(e.employee_number).trim().toUpperCase()] = e;
	}

	/* What the sheet turns into, matched and unmatched split apart. Computed on
	   every render rather than stored, so the two can never disagree with the
	   file that is actually loaded. */
	const matched = [];
	const missed = [];
	for (const row of up.sheet?.rows || []) {
		const code = String(row.employee_number || "").trim().toUpperCase();
		const emp = code && byCode[code];
		if (emp) matched.push({ row, emp });
		else missed.push(row.employee_number || "(blank)");
	}

	const noCode = !!up.sheet && !up.sheet.cols.includes("employee_number");
	const ready = !!type && matched.length > 0 && !noCode;

	function template() {
		/* One example row, filled from a real employee where there is one. A
		   template whose sample row is `AAA111` teaches somebody the shape and
		   not the content; one carrying a code from this site is a row they can
		   check against the register before they edit four hundred of them. */
		const sample = s.employees.find((e) => e.employee_number);
		/* `toCsv` takes rows as arrays of values in column order, not as objects
		   — the same shape the register's own export hands it. */
		download("bulk-letter-template.csv", toCsv(COLS, [
			[sample?.employee_number || "MRI1001", today(), "", ""],
		]));
	}

	async function generate() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		try {
			for (let i = 0; i < matched.length; i++) {
				const { row, emp } = matched[i];
				await apiCreate("Employee Letter", {
					employee: emp.name,
					employee_name: emp.employee_name,
					letter_type: type,
					letter_date: row.letter_date || today(),
					/* Absent rather than empty: a letter with `reference_number: ""`
					   and one that never had a reference read the same on the
					   register and differently to anybody counting which columns get
					   filled — which is what the page under this reports. */
					...(row.reference_number ? { reference_number: row.reference_number } : {}),
					...(row.remarks ? { remarks: row.remarks } : {}),
				});
				setDone(i + 1);
			}
			/* The register is filled by the dashboard's own load, not On Board's —
			   letters come down with the first read. */
			await load();
			setSaid(`Issued ${matched.length} ${type}${matched.length > 1 ? "s" : ""}.`);
			up.clear();
		} catch (e) {
			/* The count is the important half of a bulk failure: the letters
			   already created are real and are on the register. Nothing is rolled
			   back, because a half-written batch that quietly disappeared would be
			   worse than one somebody can see. */
			setErr(`${String(e.message || e).slice(0, 200)} — ${done} of ${matched.length} were issued before this, `
				+ "and those are on the register. Nothing was undone.");
		}
		setBusy(false);
	}

	return (
		<Modal
			title="Generate Bulk Letter"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<label className="bulklab" htmlFor="bl-type">Letter Type</label>
						<select id="bl-type" className="dectl" value={type} disabled={busy}
							title="The active formats on the Letter Type master — the same list the single-letter form offers."
							onChange={(e) => setType(e.target.value)}>
							<option value="">select letter type</option>
							{types.map((t) => (
								<option key={t.name} value={t.name}>{t.name}</option>
							))}
						</select>
						{types.length ? null : (
							<span className="bulkhint">
								No letter types were read, so there is nothing to issue. The register above says
								whether that read failed or the master is empty.
							</span>
						)}

						<button className="bulklink" type="button" disabled={busy}
							title="A CSV with the four columns this dialog reads and one example row, filled from a real employee code off this site."
							onClick={template}>
							<Ic d={DOWN} /> Download Template
						</button>

						<span className="bulklab">Upload File</span>
						<SheetDrop file={up.file} sheet={up.sheet} busy={busy} onTake={up.take} />

						<RunInBackground />
					</div>

					{noCode ? (
						<div className="deerr">
							<b>That sheet has no <span className="mono">employee_number</span> column.</b>{" "}
							It is the one column this needs — it carries {up.sheet.cols.join(", ") || "nothing"}.
							Download Template for the shape.
						</div>
					) : null}

					{up.sheet && !noCode ? (
						<div className="rows bulkrows">
							<div className="row">
								<span>
									Matched <span className="muted">Rows whose code is an employee on this site.</span>
								</span>
								<span className="val">
									<span className={"cov " + (matched.length ? "live" : "none")}>
										{matched.length} of {up.sheet.rows.length}
									</span>
								</span>
							</div>
							{missed.length ? (
								<div className="row">
									<span>
										Not found{" "}
										<span className="muted">
											No employee carries these codes, so no letter is issued for them. They are
											skipped rather than failing the batch.
										</span>
									</span>
									<span className="val bulkmiss">{missed.slice(0, 8).join(", ")}
										{missed.length > 8 ? ` and ${missed.length - 8} more` : ""}</span>
								</div>
							) : null}
						</div>
					) : null}

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{err ? <div className="deerr"><b>Nothing further was issued.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={!type
								? "Pick a letter type first."
								: !up.sheet
									? "Attach a CSV of employees."
									: matched.length
										? `Issue ${matched.length} ${type}${matched.length > 1 ? "s" : ""}, one document each.`
										: "No row in that sheet matches an employee on this site."}
							onClick={() => void generate()}>
							{busy ? `Generating ${done} of ${matched.length}…` : "Generate"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Writes one <span className="mono">Employee Letter</span> per matched row. It runs in
							this tab, so leaving the page stops it part-way — the letters already issued stay.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
