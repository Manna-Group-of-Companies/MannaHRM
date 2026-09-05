import { useEffect } from "react";
import { patch, useApp } from "@/store";
import { Desk, Modal } from "@/components/ui";
import { loadEmployeeFiles } from "@/api/load";
import { deskUrl } from "@/lib/desk";
import { download, saveFrom, toCsv } from "@/lib/csv";
import { fmt, todayIso } from "@/lib/format";
import { DL_ADVICE, DL_BG_DEAD, DL_CAP, DL_KINDS, DL_OVER } from "@/data/employees";

/* ---------------------------------------------------------------------------
   **Download Document** — Factor HR's dialog, behind Employee Detail's
   *Download Employee Picture / Documents*, photographed 4 September 2026.

   Their instruction line, six radio buttons, and Generate beside Generate In
   Background.

   ## The button used to go somewhere else

   It was a link to the ERPNext desk's File list, carrying a note that said
   attachments were not read through this proxy — a token that can read every
   file on the site being the wrong thing to hand a page on localhost.

   **That note had gone stale.** `File` is on the server's allowlist, the bytes
   are served by `/files/<name>` under a sandbox CSP, and On Board's Document
   register has been opening them for weeks. The safety argument it was making
   is still true of a *Frappe API token*, and is not what this server is: the
   file route serves only from `FILES_DIR`, refuses anything resolving outside
   it, and never caches. So the dialog can do what its name says.

   ## What Generate actually does, and where it stops

   The files for the chosen option, saved. Sequentially, and capped at
   `DL_CAP` — a browser will save a handful of files from one gesture and then
   stop trusting the page, which is not a limit worth pretending around.

   Past the cap it writes **the list instead**: one row per file, who it belongs
   to and a direct link. That is the honest answer to a request for three
   hundred files from a tab, and it is the same answer their own instruction
   line gives — *use Generate in Background* — with the reason that path does
   not exist here written on the button that would have been it.

   ## Who it covers

   The criteria form behind this dialog owns that, not the dialog: **Particular
   Employee** narrows it to one person and empty means everybody. That is
   deliberate rather than a shortcut — their dialog has no employee picker on
   it, so the one on the form behind it is the only thing it could mean, and a
   second picker here would be two answers to one question.
   --------------------------------------------------------------------------- */

/** The files one option covers, out of everything filed against an Employee.

    Narrowed to Particular Employee when the form behind has one, which is the
    only place this dialog takes its population from. */
function filesFor(s, kind) {
	const opt = DL_KINDS.find((k) => k.key === kind);
	if (!opt || (!opt.all && !opt.fields)) return [];

	let rows = s.empFiles;
	if (s.empSel) rows = rows.filter((f) => f.attached_to_name === s.empSel);
	if (!opt.all) rows = rows.filter((f) => opt.fields.includes(f.attached_to_field));

	/* By person, then by what the file is called — so a run of saves arrives in
	   an order somebody can check off against a list rather than in whatever
	   order the collection came back in. */
	return [...rows].sort((a, b) =>
		String(a.attached_to_name).localeCompare(String(b.attached_to_name))
		|| String(a.file_name || "").localeCompare(String(b.file_name || "")));
}

/** The list, when there are too many to save. Every file, who it belongs to and
    a link that works — which is the part of this a page can hand over. */
function writeManifest(s, rows, opt) {
	const cols = ["Employee code", "Name", "Employee", "Document", "File", "Size (bytes)", "Link"];
	const name = `employee-documents-${opt.key}-${todayIso()}.csv`;
	download(name, toCsv(cols, rows.map((f) => {
		const e = s.byName[f.attached_to_name] || {};
		return [
			e.employee_number || "",
			e.employee_name || "",
			f.attached_to_name || "",
			f.attached_to_field || "",
			f.file_name || "",
			f.file_size == null ? "" : f.file_size,
			/* Absolute, because this file is opened somewhere other than the tab
			   that wrote it — a relative path in a spreadsheet is a dead link. */
			f.file_url ? window.location.origin + f.file_url : "",
		];
	})));
	return name;
}

export default function DownloadDocs({ onClose }) {
	const s = useApp();
	const d = s.dl;

	/* Read on open, once. Guarded in the loader rather than here, so the
	   re-render picking a radio causes cannot ask again. */
	useEffect(() => { void loadEmployeeFiles(); }, []);

	const setD = (part) => patch("dl", part);
	const opt = DL_KINDS.find((k) => k.key === d.kind) || DL_KINDS[0];
	const rows = filesFor(s, d.kind);
	const who = s.empSel ? (s.byName[s.empSel]?.employee_name || s.empSel) : "";

	/* How many files each option would produce, so the radio list says what is
	   behind it before anything is pressed. One pass over the same function the
	   run uses, so a count and a run cannot disagree. */
	const counts = Object.fromEntries(DL_KINDS.map((k) => [k.key, filesFor(s, k.key).length]));

	const reading = s.empFilesState === "loading" || !s.empFilesState;
	const failed = s.empFilesState === "error";

	async function generate() {
		if (!rows.length) {
			setD({
				bad: true,
				msg: `Nothing filed under ${opt.label.toLowerCase()}${who ? ` for ${who}` : ""}. `
					+ "Nothing was downloaded — an empty save is not an empty answer, it is a confusing one.",
			});
			return;
		}

		if (rows.length > DL_CAP) {
			const name = writeManifest(s, rows, opt);
			setD({ bad: false, msg: `${fmt(rows.length)} files — too many to save one at a time, so the list went to ${name} instead. ${DL_OVER}` });
			return;
		}

		setD({ busy: true, msg: "", bad: false });
		/* One at a time with a gap. Fired in a loop with no pause, a browser
		   treats the burst as a single misbehaving page and drops all but the
		   first — the delay is what makes the difference between eight files and
		   one. */
		for (const f of rows) {
			saveFrom(f.file_url, f.file_name);
			await new Promise((r) => setTimeout(r, 250));
		}
		setD({
			busy: false,
			bad: false,
			msg: `${fmt(rows.length)} file(s) sent to your downloads${who ? ` for ${who}` : ""}. `
				+ "Your browser may ask once whether to allow several at a time.",
		});
	}

	return (
		<Modal
			title="Download Document"
			extra={
				<div className="dlform">
					{/* Their sentence, in their words. It is also the finding: the path
					    they recommend for everybody is the one this page cannot offer,
					    and the button that would have been it says why. */}
					<p className="dladvice">{DL_ADVICE}</p>

					{failed ? (
						<div className="gap">
							The attachments could not be read: {s.empFilesErr}. Nothing here can say what there is
							to download until that answers.
						</div>
					) : null}

					{who ? (
						<p className="hint">
							Narrowed to <b>{who}</b> by Particular Employee on the form behind this. Clear it there
							to cover everybody.
						</p>
					) : null}

					<div className="dlkinds" role="radiogroup" aria-label="What to download">
						{DL_KINDS.map((k) => {
							const dead = !k.all && !k.fields;
							const n = counts[k.key];
							return (
								<label key={k.key} className={"dlkind" + (dead ? " off" : "")} title={k.why}>
									<input type="radio" name="dlkind" value={k.key}
										checked={d.kind === k.key} disabled={dead || d.busy}
										onChange={() => setD({ kind: k.key, msg: "", bad: false })} />
									<span className="t">{k.label}</span>
									{/* What is behind the option, before anything is pressed.
									    Three states and they are three different sentences: this
									    site has nowhere to put it, the read has not answered, or
									    a number — including nought, which is a real answer and
									    the one the seed is careful to contain. */}
									<span className="n">
										{dead ? "nothing to attach here"
											: reading ? "reading…"
												: failed ? "not read"
													: `${fmt(n)} file${n === 1 ? "" : "s"}`}
									</span>
								</label>
							);
						})}
					</div>

					{d.msg ? <div className={d.bad ? "gap" : "note"}>{d.msg}</div> : null}

					<div className="dlacts">
						<button className="btn imp" disabled={d.busy || reading || failed}
							title={rows.length > DL_CAP
								? `${fmt(rows.length)} files is more than a browser will save in one gesture — this writes the list instead, with a link per file.`
								: `Save ${fmt(rows.length)} file(s), one at a time.`}
							onClick={() => void generate()}>
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
								strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M12 4v10.5M8 11l4 4 4-4M4 20h16" />
							</svg>
							{d.busy ? "Saving…" : "Generate"}
						</button>
						{/* Dead, in the same words the button of that name on the criteria
						    form behind this already uses. One gap, one sentence — two
						    explanations of one missing scheduler is how a repo starts
						    disagreeing with itself. */}
						<button className="btn ghost" disabled title={DL_BG_DEAD}>
							<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
								strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2" />
							</svg>
							Generate In Background
						</button>
					</div>

					{/* Not a third peer button: their dialog has two, and the desk is
					    where these files are maintained rather than another way to do
					    the same job. */}
					<p className="hint">
						{opt.why}{" "}
						<Desk className="dllink" href={s.site && deskUrl(s.site, "File")}
							title="Opens the File list on the ERPNext site, under whoever is logged in there.">
							Open the File list on the site
						</Desk>
					</p>
				</div>
			}
			onClose={onClose}
		/>
	);
}
