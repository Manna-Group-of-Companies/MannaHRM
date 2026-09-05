import { useState } from "react";

import { Modal } from "@/components/ui";
import { RunInBackground, SheetDrop, useSheet } from "@/features/onboard/sheet";
import { api } from "@/api/client";
import { dmy } from "@/lib/format";
import { save } from "@/lib/csv";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Download Existing Letter** dialog, photographed 4 September
   2026 — the second of the two off their letter register, and the sibling of
   Generate Bulk Letter.

   The same shape as that one with a date range cut into it: letter type, From
   Date and Till Date side by side, the upload area, Run In Background, then
   Download and Cancel. Two of those controls are shared code rather than a
   second copy — see sheet.jsx.

   **It is the one dialog on this page that only reads**, which is worth saying
   next to a sibling that issues four hundred documents. Nothing here writes,
   nothing is created, and Cancel and Download differ only in whether a file
   lands in the downloads folder.

   What comes out is **the letters themselves**, not a list of them. Each
   `Employee Letter` carries the merged text as it was issued — that is the
   whole reason `body` is stored rather than re-merged, since re-merging from
   the current record would produce a different document the moment anything on
   that person changes. So this collects the stored text of every letter in
   range and writes one printable HTML file: open it, print it, and the batch is
   the batch that went out.

   The upload is the one control here that is not obvious. Theirs takes a sheet;
   what it can usefully do is *narrow* — a list of employee codes, so a range
   that would return four hundred letters returns the twenty somebody asked
   about. It is optional, and the dialog says the count either way before
   Download is pressed.
   --------------------------------------------------------------------------- */

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const D = { cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" };

/** The printable bundle. One page per letter, their own stored text inside it.

    Self-contained on purpose: it is opened off the filesystem, where a
    stylesheet this app serves is not reachable, so the little CSS it needs
    travels with it. */
function bundle(rows, meta) {
	const esc = (t) => String(t == null ? "" : t)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	const pages = rows.map((r) => `
<article class="pg">
  <header>
    <span>${esc(r.letter_type || "Letter")}</span>
    <span>${esc(r.name)}${r.letter_date ? " · " + esc(dmy(r.letter_date)) : ""}</span>
  </header>
  <h2>${esc(r.employee_name || r.employee || "")}</h2>
  ${r.body
		? `<div class="body">${r.body}</div>`
		: `<p class="none">This letter has no stored text. It is on the register as
       ${esc(r.name)}, issued ${r.letter_date ? esc(dmy(r.letter_date)) : "on no recorded date"} —
       what was handed to this person was written somewhere this record does not keep.</p>`}
</article>`).join("\n");

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(meta.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #eceff1; font: 14px/1.55 Georgia, "Times New Roman", serif; color: #16222c; }
  .meta { max-width: 46rem; margin: 1.4rem auto 0; padding: 0 1rem; font: 13px/1.5 system-ui, sans-serif; color: #55606b; }
  .pg { max-width: 46rem; margin: 1.2rem auto; padding: 2.4rem 2.6rem; background: #fff;
        border: 1px solid #d3d9de; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .pg > header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1.6rem;
        font: 12px/1.4 system-ui, sans-serif; color: #6b7885; border-bottom: 1px solid #e3e7ea; padding-bottom: .5rem; }
  .pg h2 { margin: 0 0 1rem; font-size: 1.15rem; }
  .none { color: #8a5a00; background: #fff6e5; border: 1px solid #f0dcb4; padding: .7rem .9rem; }
  /* One letter to a sheet of paper, which is the point of the file. */
  @media print {
    body { background: #fff; }
    .meta { display: none; }
    .pg { margin: 0; border: 0; box-shadow: none; max-width: none; padding: 0; page-break-after: always; }
    .pg:last-child { page-break-after: auto; }
  }
</style></head>
<body>
<p class="meta">${esc(meta.line)}</p>
${pages}
</body></html>`;
}

export default function DownloadLetters({ onClose }) {
	const s = useApp();
	const up = useSheet();

	const [type, setType] = useState("");
	const [from, setFrom] = useState("");
	const [till, setTill] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const types = s.letterTypes || [];

	/* The codes in the uploaded sheet, if there is one. Upper-cased once here
	   rather than per row per letter. */
	const only = up.sheet
		? new Set(up.sheet.rows
			.map((r) => String(r.employee_number || "").trim().toUpperCase())
			.filter(Boolean))
		: null;

	/* Which employees those codes are, so a letter can be matched on the record
	   id it actually carries. */
	const codeOf = {};
	for (const e of s.employees) if (e.employee_number) codeOf[e.name] = String(e.employee_number).toUpperCase();

	/* Everything in range, computed on every render so the count on the button
	   and the file it writes cannot come from different filters.

	   Dates compare as text, which works because both sides are `YYYY-MM-DD` —
	   the site's own format and what the date boxes hand back. A letter with no
	   date is out of every range rather than in all of them: it has not been
	   dated, so it cannot be said to fall between two days. */
	const rows = s.letters.filter((l) => {
		if (type && l.letter_type !== type) return false;
		const d = String(l.letter_date || "").slice(0, 10);
		if (from && (!d || d < from)) return false;
		if (till && (!d || d > till)) return false;
		if (only && !only.has(codeOf[l.employee] || "")) return false;
		return true;
	});

	const noCode = !!up.sheet && !up.sheet.cols.includes("employee_number");
	const bad = from && till && from > till;
	const ready = rows.length > 0 && !bad && !noCode;

	async function run() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		try {
			/* The text is not on the list read — a register does not carry the
			   letters, only their rows — so each one is fetched. One at a time
			   rather than all at once: forty parallel reads against a site behind a
			   proxy is how a dashboard gets itself rate-limited, and the count on
			   the button is only honest if the requests are ordered. */
			const full = [];
			for (let i = 0; i < rows.length; i++) {
				const doc = await api("/api/resource/Employee Letter/" + encodeURIComponent(rows[i].name))
					.then((r) => r.data)
					/* A letter that cannot be read is still a letter that was issued,
					   so it goes into the file saying so rather than being dropped. */
					.catch(() => null);
				full.push(doc || rows[i]);
				setDone(i + 1);
			}

			const range = from || till
				? `${from ? dmy(from) : "the beginning"} to ${till ? dmy(till) : "today"}`
				: "every date";
			const line = `${full.length} letter${full.length > 1 ? "s" : ""}`
				+ ` · ${type || "every type"} · ${range}`
				+ (only ? ` · narrowed to ${only.size} employee code${only.size > 1 ? "s" : ""}` : "")
				+ ` · taken from the register on ${dmy(new Date().toISOString().slice(0, 10))}`;

			save(
				`existing-letters-${(type || "all").toLowerCase().replace(/\s+/g, "-")}.html`,
				bundle(full, { title: `Existing letters — ${type || "every type"}`, line }),
				"text/html;charset=utf-8",
			);
			const blank = full.filter((r) => !r.body).length;
			setSaid(`Downloaded ${full.length} letter${full.length > 1 ? "s" : ""}.`
				+ (blank ? ` ${blank} of them had no stored text and say so in the file.` : ""));
		} catch (e) {
			setErr(String(e.message || e).slice(0, 220));
		}
		setBusy(false);
	}

	return (
		<Modal
			title="Download Existing Letter"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<label className="bulklab" htmlFor="dl-type">Letter Type</label>
						<select id="dl-type" className="dectl" value={type} disabled={busy}
							title="Narrows to one format. Left as it is, every type is included — the register holds seventeen and most of them have never been issued."
							onChange={(e) => setType(e.target.value)}>
							<option value="">select letter type</option>
							{types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
						</select>

						{/* Their two date boxes, side by side as on the capture. */}
						<div className="dlrange">
							<div>
								<label className="bulklab" htmlFor="dl-from">From Date</label>
								<span className="dldate">
									<input id="dl-from" type="date" className="dectl" value={from} disabled={busy}
										title="The earliest letter date to include. Left empty, there is no lower bound."
										onChange={(e) => setFrom(e.target.value)} />
									<Ic d={D.cal} />
								</span>
							</div>
							<div>
								<label className="bulklab" htmlFor="dl-till">Till Date</label>
								<span className="dldate">
									<input id="dl-till" type="date" className="dectl" value={till} disabled={busy}
										title="The latest letter date to include. Left empty, there is no upper bound."
										onChange={(e) => setTill(e.target.value)} />
									<Ic d={D.cal} />
								</span>
							</div>
						</div>
						{bad ? (
							<span className="dehint warn">
								From Date is after Till Date, so nothing can fall between them.
							</span>
						) : null}

						<span className="bulklab">Upload File</span>
						<SheetDrop file={up.file} sheet={up.sheet} busy={busy} onTake={up.take}
							hint={<>Optional — a CSV of <span className="mono">employee_number</span> to narrow
								this to those people. Drag it here or click &ldquo;Browse Files&rdquo;.</>} />

						<RunInBackground />
					</div>

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{noCode ? (
						<div className="deerr">
							<b>That sheet has no <span className="mono">employee_number</span> column.</b>{" "}
							It carries {up.sheet.cols.join(", ") || "nothing"}, so it cannot narrow anything.
							Remove it, or use the template from Generate Bulk Letter.
						</div>
					) : null}

					<div className="rows bulkrows">
						<div className="row">
							<span>
								In range{" "}
								<span className="muted">
									Letters already on the register that match. Nothing is issued here — this
									dialog only reads.
								</span>
							</span>
							<span className="val">
								<span className={"cov " + (rows.length ? "live" : "none")}>
									{rows.length} of {s.letters.length}
								</span>
							</span>
						</div>
					</div>

					{err ? <div className="deerr"><b>Nothing was downloaded.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={bad
								? "The dates are the wrong way round."
								: rows.length
									? `Collect ${rows.length} letter${rows.length > 1 ? "s" : ""} and write one printable file.`
									: "Nothing on the register matches. Widen the type or the dates."}
							onClick={() => void run()}>
							{busy ? `Collecting ${done} of ${rows.length}…` : "Download"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Writes one HTML file — a page per letter, each carrying the text as it was issued.
							Open it and print, and the batch is the batch that went out.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
