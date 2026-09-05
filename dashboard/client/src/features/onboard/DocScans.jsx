import { useState } from "react";

import { Modal } from "@/components/ui";
import { DOC_KINDS } from "@/data/onboard";
import { apiUpload } from "@/api/client";
import { docRows } from "@/features/onboard/shared";
import { download, toCsv } from "@/lib/csv";
import { loadOnBoard } from "@/api/load";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   **Upload Document** — the menu behind the import control on Factor HR's
   Document screen, photographed 4 September 2026: Upload Document, Upload
   Document In Background, Download Structure.

   **This is the scans, where the ↑ menu beside it is the numbers.** Two imports
   on one toolbar reads like a duplicate until you notice they carry different
   things: one takes a spreadsheet of passport numbers and writes fields, this
   one takes a folder of photographs and files them against people. The register
   needs both, and the paperclip column is only ever filled by this one.

   That control used to open ERPNext's Data Import on the site, because nothing
   here could load anything. Data Import writes *fields* from a sheet — which
   the ↑ menu now does, with a preview — and it cannot carry a scan at all: a
   Frappe import maps columns to fields, and an attachment is bytes. So the
   hand-off was answering the wrong half of the question, and this replaces it.

   **The filename is the whole of the matching**, and that is a deliberate
   choice rather than a shortcut. A scanner produces a folder of images and
   nothing else; there is no column to read a code out of. So the convention is
   the interface, and Download Structure writes it out per person rather than
   describing it — a sheet naming the exact file each employee's scan should be
   called, which is a list somebody can work down.
   --------------------------------------------------------------------------- */

/** What a scan must be called: the employee code, a space, and the document
    type as the register spells it. `MRI1042 Passport.jpg`.

    The code rather than the name, because two people share a name and nobody
    shares a code — and because a filename carrying somebody's name is a
    filename that leaks who the document belongs to before it is opened. */
const NAMED = /^(\S+)\s+(.+)$/;

const EXT = /\.(jpe?g|png|gif|webp|pdf|svg)$/i;

/** Their Download Structure. Not a blank template — one row per employee per
    document type this side can hold, carrying the exact filename that scan
    should be given. Somebody with four hundred photographs can sort them
    against this. */
export function structure(s) {
	const rows = [];
	for (const e of docRows(s)) {
		if (!e.employee_number) continue;
		for (const k of DOC_KINDS) {
			if (!k.num) continue;
			rows.push([
				e.employee_number,
				e.employee_name || e.name,
				k.label,
				/* The number already on file, so a row with one is a document whose
				   scan is missing rather than a document nobody has recorded. That
				   distinction is the point of the whole register. */
				e[k.num] || "",
				`${e.employee_number} ${k.label}.jpg`,
			]);
		}
	}
	download(
		"document-scan-structure.csv",
		toCsv(["employee_number", "employee_name", "document_type", "number_on_file", "name_the_file"], rows),
	);
}

export default function DocScans({ onClose }) {
	const s = useApp();

	const [files, setFiles] = useState([]);
	const [over, setOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const people = docRows(s);
	const byCode = {};
	for (const e of people) {
		if (e.employee_number) byCode[String(e.employee_number).trim().toUpperCase()] = e;
	}
	const kindOf = {};
	for (const k of DOC_KINDS) if (k.num) kindOf[k.label.toLowerCase()] = k;

	/* Every file sorted by what will happen to it. The names are parsed here on
	   every render rather than when the files are picked, so the counts cannot
	   drift from the list that is actually loaded. */
	const ok = [];
	const badName = [];
	const badType = [];
	const badExt = [];
	const dupe = [];
	for (const f of files) {
		if (!EXT.test(f.name)) { badExt.push(f.name); continue; }
		const base = f.name.replace(EXT, "");
		const m = NAMED.exec(base);
		const emp = m && byCode[m[1].trim().toUpperCase()];
		if (!emp) { badName.push(f.name); continue; }
		const kind = kindOf[m[2].trim().toLowerCase()];
		if (!kind) { badType.push(f.name); continue; }
		/* Already filed under this exact name against this exact document. Skipped
		   rather than added, so running the same folder twice is not four hundred
		   duplicates — which is the mistake somebody makes when an upload is
		   interrupted and they start it again. */
		const held = s.docFiles[emp.name + ":" + kind.num] || [];
		if (held.some((h) => h.file_name === f.name)) { dupe.push(f.name); continue; }
		ok.push({ file: f, emp, kind });
	}

	const ready = ok.length > 0 && !s.fileErr;

	function take(list) {
		setErr("");
		setSaid("");
		/* Added to what is already there rather than replacing it: a folder
		   dropped in two goes is one job, and a picker that forgets the first
		   half is a picker somebody uses once. Keyed by name and size so the same
		   file dropped twice is one file. */
		setFiles((prev) => {
			const seen = new Set(prev.map((f) => f.name + ":" + f.size));
			const add = [...(list || [])].filter((f) => !seen.has(f.name + ":" + f.size));
			return prev.concat(add);
		});
	}

	async function run() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		let wrote = 0;
		try {
			for (let i = 0; i < ok.length; i++) {
				const { file, emp, kind } = ok[i];
				await apiUpload(file, { doctype: "Employee", name: emp.name, field: kind.num });
				wrote++;
				setDone(i + 1);
			}
			await loadOnBoard();
			setSaid(`Filed ${wrote} scan${wrote === 1 ? "" : "s"}.`
				+ (dupe.length ? ` ${dupe.length} were already filed under the same name and were skipped.` : ""));
			setFiles([]);
		} catch (e) {
			setErr(`${String(e.message || e).slice(0, 200)} — ${wrote} of ${ok.length} were filed before this, `
				+ "and those are on the register. Nothing was undone.");
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
			title="Upload Document"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<span className="bulklab">Scans</span>
						<div className={"bulkdrop" + (over ? " over" : "") + (files.length ? " has" : "")}
							onDragOver={(e) => { e.preventDefault(); setOver(true); }}
							onDragLeave={() => setOver(false)}
							onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
							<span className="bulksay">
								{files.length
									? <><b>{files.length} file{files.length === 1 ? "" : "s"}</b> ready</>
									: <>Drag a folder of scans here, or click &ldquo;Browse Files&rdquo;. Each one
										named <span className="mono">CODE Type.jpg</span> — Download Structure
										writes the list.</>}
							</span>
							<label className="bulkbrowse">
								Browse Files
								<input type="file" multiple disabled={busy}
									accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.svg"
									onChange={(e) => take(e.target.files)} />
							</label>
							{files.length ? (
								<button className="embtn" disabled={busy} onClick={() => setFiles([])}
									title="Empty the list. Nothing has been uploaded yet.">
									Clear
								</button>
							) : null}
						</div>

						<button className="bulklink" type="button" disabled={busy}
							title="One row per employee per document type, with the exact filename that scan should be given — and the number already on file, so a row with one is a document whose scan is missing."
							onClick={() => structure(s)}>
							Download Structure
						</button>
					</div>

					{s.fileErr ? (
						<div className="deerr">
							<b>The attachments could not be read.</b> {s.fileErr} Until they can, this cannot
							tell a scan that is already filed from one that is not, and uploading would file
							every one of them a second time.
						</div>
					) : null}

					{files.length ? (
						<div className="rows bulkrows">
							<Count label="Will be filed" n={ok.length}
								why={`Of ${files.length} file${files.length === 1 ? "" : "s"} picked.`} />
							<Count label="Already filed" n={dupe.length}
								why={dupe.length
									? "The same name is already against the same document, so these are skipped — running the same folder twice does not duplicate it."
									: "Nothing here is already on file."} />
							<Count label="No such employee" n={badName.length} bad={!!badName.length}
								why={badName.length
									? `The part before the first space is not an employee code on this site: ${badName.slice(0, 3).join(", ")}${badName.length > 3 ? " and others" : ""}.`
									: "Every filename starts with a code that is somebody here."} />
							<Count label="No such type" n={badType.length} bad={!!badType.length}
								why={badType.length
									? `This side can file ${DOC_KINDS.filter((k) => k.num).map((k) => k.label).join(" and ")}. The rest of the name has to be one of those.`
									: "Every filename names a type this side has a field for."} />
							<Count label="Wrong kind of file" n={badExt.length} bad={!!badExt.length}
								why={badExt.length
									? "A scan is a JPEG, PNG, GIF, WebP, PDF or SVG. Anything else is refused before it is read."
									: "Every file is a kind this can store."} />
						</div>
					) : null}

					{err ? <div className="deerr"><b>Nothing further was filed.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={!files.length
								? "Pick some scans first."
								: ok.length
									? `File ${ok.length} scan${ok.length === 1 ? "" : "s"} against ${ok.length === 1 ? "its document" : "their documents"}.`
									: "Nothing here can be filed — check the names against Download Structure."}
							onClick={() => void run()}>
							{busy ? `Uploading ${done} of ${ok.length}…` : "Upload"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Each scan is filed against the employee <em>and</em> the field its type names, which
							is what puts it on the right row of the register. Five megabytes each. It runs in
							this tab, so leaving the page stops it part-way; what is filed stays.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
