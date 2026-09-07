import { useState } from "react";

import { parseCsv } from "@/lib/csv";

/* ---------------------------------------------------------------------------
   The upload area both of Factor HR's letter dialogs carry, and the tick beside
   it that neither can honour.

   Generate Bulk Letter and Download Existing Letter are the same control twice
   — a dashed drop area with a glyph, an instruction and a Browse Files button,
   then Run In Background under it. Drawn once here rather than in each, because
   two copies of a drop target are two chances for one of them to stop accepting
   a drop and nobody to notice: the bug shows up as "nothing happens", which is
   also what a file of the wrong type looks like.

   What they do with the sheet differs and stays in each dialog. One issues a
   letter per row; the other narrows a search to the people in it.
   --------------------------------------------------------------------------- */

/** Why a spreadsheet is not read here, said the same way in both dialogs. */
export const SHEET_DEAD = "A spreadsheet parser this app does not carry. .xlsx is a ZIP of XML and "
	+ ".xls is a compound binary document; reading either is a library, and two dialogs do not justify "
	+ "it. Save the sheet as CSV — Excel's Save As has it — or start from Download Template, which is one.";

/** Why the tick is dead, said the same way in both. */
export const RUN_DEAD = "Their tick hands the job to a background queue and emails when it finishes. "
	+ "There is no queue on this side and nothing to send mail from — this runs in the tab, so closing "
	+ "it stops it. The count on the button is what the email would have said.";

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const UP = "M12 20V9M8 13l4-4 4 4M4 4h16";

/** The file, the parsed sheet and the reason it is neither.

    A hook rather than state passed down, because both dialogs need the parsed
    rows for their own arithmetic — the count on the button, the matched list —
    and a component that owned them would have to hand them back up. */
export function useSheet() {
	const [file, setFile] = useState(null);
	const [sheet, setSheet] = useState(null);
	const [err, setErr] = useState("");

	function take(f) {
		setErr("");
		setSheet(null);
		setFile(f || null);
		if (!f) return;

		/* Refused by name rather than attempted. A `.xlsx` read as text parses
		   into one row of binary and would otherwise reach the dialog as "no
		   employee codes matched", which blames the data for the tool. */
		if (!/\.csv$/i.test(f.name)) {
			setErr(`"${f.name}" is not a CSV. ${SHEET_DEAD}`);
			return;
		}

		const reader = new FileReader();
		reader.onerror = () => setErr(`Could not read "${f.name}".`);
		reader.onload = () => {
			try {
				const parsed = parseCsv(String(reader.result || ""));
				if (!parsed.rows.length) {
					setErr(`"${f.name}" has a header row and nothing under it.`);
					return;
				}
				setSheet(parsed);
			} catch (e) {
				setErr(String(e.message || e).slice(0, 200));
			}
		};
		reader.readAsText(f);
	}

	const clear = () => { setFile(null); setSheet(null); setErr(""); };
	return { file, sheet, err, take, clear, setErr };
}

/** Their drop area. `hint` is what the dialog wants said when nothing is
    attached yet, since one of them needs a sheet and the other does not. */
export function SheetDrop({ file, sheet, hint, busy, onTake }) {
	const [over, setOver] = useState(false);

	return (
		<div className={"bulkdrop" + (over ? " over" : "") + (file ? " has" : "")}
			onDragOver={(e) => { e.preventDefault(); setOver(true); }}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				onTake(e.dataTransfer.files?.[0]);
			}}>
			<span className="bulkico"><Ic d={UP} /></span>
			<span className="bulksay">
				{file ? (
					<>
						<b>{file.name}</b>
						{sheet ? ` — ${sheet.rows.length} row${sheet.rows.length > 1 ? "s" : ""}` : ""}
					</>
				) : (
					<>
						{hint || <>Drag &amp; Drop files into this area or click on &ldquo;Browse Files&rdquo; to attach.</>}{" "}
						<span className="muted" title={SHEET_DEAD}>(.csv)</span>
					</>
				)}
			</span>
			<label className="bulkbrowse">
				Browse Files
				<input type="file" accept=".csv,text/csv" disabled={busy}
					onChange={(e) => onTake(e.target.files?.[0])} />
			</label>
		</div>
	);
}

/** Their tick, drawn and dead in both dialogs. */
export const RunInBackground = () => (
	<label className="bulkrun" title={RUN_DEAD}>
		<input type="checkbox" disabled onChange={() => {}} />
		Run In Background
	</label>
);
