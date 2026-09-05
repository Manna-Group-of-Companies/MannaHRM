import { useState } from "react";

import { Modal } from "@/components/ui";
import { RunInBackground } from "@/features/onboard/sheet";
import { api, apiDeleteFile, apiUpload } from "@/api/client";
import { dmy } from "@/lib/format";
import { loadOnBoard } from "@/api/load";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Push Letter Into Document** dialog, photographed 4 September
   2026 — the third off their letter register, and the one that explains what
   the other two are for.

   Four controls: a letter type, a Process For dropdown, Run In Background, and
   Override Already Pushed Document. Push and Cancel underneath.

   **What pushing is.** A letter that has been issued lives on the letter
   register, which is a list of issues rather than a filing cabinet. Pushing
   files it against the *person* — so it turns up in that employee's documents
   beside their passport and their PAN, which is where somebody looks when they
   want to know what has been given to whom. Their two screens, Create Letter
   and Document, are joined by exactly this button.

   Here that is a `File` attached to the `Employee`, carrying the letter's
   stored text. Frappe's File hangs off a document, optionally off one field of
   it — a passport scan is filed against `passport_number`, and a letter is
   filed against the person and no field, which is the ordinary case. That the
   route accepts the second at all is a change this dialog needed; see the note
   on `attached_to_field` in server/src/routes/attachments.ts.

   **The file is the letter's own HTML**, as it was merged and stored. Not a
   PDF, which needs a renderer this app does not carry, and not plain text,
   which would throw the document away to gain nothing.

     Letter Type      narrows to one format. Empty is every type.
     Process For      All Employee, or the rows ticked on the register behind
                      this. Their dropdown has the same two ideas in it and this
                      is the honest reading of the second: a register with
                      checkboxes down its left is a selection, and pushing "for
                      selected" should mean those.
     Override         off, a letter already filed is skipped; on, the file
                      already there is deleted and written again. Both counted
                      before Push is pressed, because "43 letters" and "43
                      letters, 40 of which are already filed" are different
                      jobs.
     Run In Background  drawn and dead, for the reason it is dead on the other
                      two dialogs — see sheet.jsx.
   --------------------------------------------------------------------------- */

/** What a pushed letter is called, and it is deterministic on purpose.

    There is no field on Frappe's `File` recording which letter a file came
    from, so the name is the record of it: `Offer Letter HR-LTR-00003.html` is
    matched back to `HR-LTR-00003` exactly, and that is what makes "already
    pushed" a fact rather than a guess. A file somebody renames on the site
    stops being matched and is pushed again, which is the failure worth having:
    a duplicate is visible, and a letter silently never filed is not. */
const fileName = (letter) =>
	`${letter.letter_type || "Letter"} ${letter.name}.html`;

/** The letter as a document: its stored text, in a page that stands alone.

    Self-contained, because this is opened from the employee's documents rather
    than inside the app — a stylesheet this dashboard serves is not reachable
    from a file the browser opens on its own. */
function page(letter) {
	const esc = (t) => String(t == null ? "" : t)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(letter.letter_type || "Letter")} — ${esc(letter.employee_name || letter.employee || "")}</title>
<style>
  body { margin: 0; background: #fff; font: 14px/1.6 Georgia, "Times New Roman", serif; color: #16222c; }
  main { max-width: 46rem; margin: 0 auto; padding: 2.6rem; }
  header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1.6rem;
           padding-bottom: .5rem; border-bottom: 1px solid #e3e7ea;
           font: 12px/1.4 system-ui, sans-serif; color: #6b7885; }
  h2 { margin: 0 0 1.1rem; font-size: 1.15rem; }
  .none { color: #8a5a00; background: #fff6e5; border: 1px solid #f0dcb4; padding: .7rem .9rem; }
  @media print { main { padding: 0; max-width: none; } header { display: none; } }
</style></head>
<body><main>
  <header>
    <span>${esc(letter.letter_type || "Letter")}</span>
    <span>${esc(letter.name)}${letter.letter_date ? " · " + esc(dmy(letter.letter_date)) : ""}</span>
  </header>
  <h2>${esc(letter.employee_name || letter.employee || "")}</h2>
  ${letter.body
		? `<div>${letter.body}</div>`
		: `<p class="none">This letter has no stored text. It is on the register as ${esc(letter.name)} —
       what was handed to this person was written somewhere this record does not keep.</p>`}
</main></body></html>`;
}

export default function PushLetters({ onClose }) {
	const s = useApp();

	const [type, setType] = useState("");
	const [scope, setScope] = useState("all");
	const [over, setOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const types = s.letterTypes || [];
	const ticked = s.llist.sel || [];

	/* Which letters this would act on. `scope` is their Process For, and the
	   selection option is only offered when there is one — a dropdown entry that
	   resolves to nothing is a job that reports "0 pushed" and looks broken. */
	const chosen = s.letters.filter((l) => {
		if (type && l.letter_type !== type) return false;
		if (scope === "sel" && !ticked.includes(l.name)) return false;
		return true;
	});

	/* Every file already filed against an employee, by name. `docFiles` is keyed
	   by record *and* field, which is what the Document register needs; a pushed
	   letter has no field, so the index is flattened back to the person. */
	const filedFor = {};
	for (const key of Object.keys(s.docFiles)) {
		const emp = key.split(":")[0];
		(filedFor[emp] ||= []).push(...s.docFiles[key]);
	}

	const already = [];
	const fresh = [];
	for (const l of chosen) {
		const want = fileName(l);
		const hit = (filedFor[l.employee] || []).find((f) => f.file_name === want);
		(hit ? already : fresh).push({ letter: l, had: hit });
	}

	/* With Override off the job is the ones not yet filed; with it on it is all
	   of them, the already-filed ones being deleted and written again. */
	const work = over ? already.concat(fresh) : fresh;
	const ready = work.length > 0 && !s.fileErr;

	async function push() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		let wrote = 0;
		try {
			for (let i = 0; i < work.length; i++) {
				const { letter, had } = work[i];

				/* The text is not on the register's list read, so the letter is
				   fetched before it can be filed. A letter that cannot be read is
				   still filed, with a page saying so — see `page`. */
				const doc = await api("/api/resource/Employee Letter/" + encodeURIComponent(letter.name))
					.then((r) => r.data)
					.catch(() => letter);

				/* Override deletes first. The other order would leave two files with
				   the same name against one person for as long as the upload takes,
				   and if the upload failed it would leave two for good. */
				if (had) await apiDeleteFile(had.name);

				const html = page(doc);
				const blob = new File([html], fileName(letter), { type: "text/html" });
				await apiUpload(blob, {
					doctype: "Employee",
					name: letter.employee,
					/* No field. A letter belongs to the person, not to one box on
					   their record — which is the ordinary shape of a Frappe
					   attachment and the reason the route stopped insisting on one. */
					field: "",
				});
				wrote++;
				setDone(i + 1);
			}
			await loadOnBoard();
			setSaid(`Pushed ${wrote} letter${wrote === 1 ? "" : "s"} into documents.`
				+ (!over && already.length
					? ` ${already.length} were already filed and were left alone.`
					: ""));
		} catch (e) {
			setErr(`${String(e.message || e).slice(0, 200)} — ${wrote} of ${work.length} were pushed before `
				+ "this, and those are filed. Nothing was undone.");
		}
		setBusy(false);
	}

	return (
		<Modal
			title="Push Letter Into Document"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<div className="dlrange">
							<div>
								<label className="bulklab" htmlFor="pl-type">Letter Type</label>
								<select id="pl-type" className="dectl" value={type} disabled={busy}
									title="Narrows to one format. Left as it is, every issued letter is considered."
									onChange={(e) => setType(e.target.value)}>
									<option value="">select letter type</option>
									{types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
								</select>
							</div>
							<div>
								<label className="bulklab" htmlFor="pl-scope">Process For</label>
								<select id="pl-scope" className="dectl" value={scope} disabled={busy}
									title="Everybody with a letter of this type, or only the rows ticked on the register behind this dialog."
									onChange={(e) => setScope(e.target.value)}>
									<option value="all">All Employee</option>
									<option value="sel" disabled={!ticked.length}>
										{ticked.length
											? `Ticked on the register (${ticked.length})`
											: "Ticked on the register — none ticked"}
									</option>
								</select>
							</div>
						</div>

						<RunInBackground />

						<label className="bulkrun live" title={already.length
							? `${already.length} of these ${already.length === 1 ? "has" : "have"} been pushed before. Off, they are left alone; on, the file already filed is deleted and written again from the letter as it stands now.`
							: "Nothing in this selection has been pushed before, so this changes nothing."}>
							<input type="checkbox" checked={over} disabled={busy || !already.length}
								onChange={(e) => setOver(e.target.checked)} />
							Override Already Pushed Document
						</label>
					</div>

					{s.fileErr ? (
						<div className="deerr">
							<b>The attachments could not be read.</b> {s.fileErr} Until they can, this cannot
							tell a letter that has already been filed from one that has not — and pushing
							would file every one of them a second time.
						</div>
					) : null}

					<div className="rows bulkrows">
						<div className="row">
							<span>
								To push{" "}
								<span className="muted">
									One file each, carrying the letter&rsquo;s own text, filed against the person
									it was issued to.
								</span>
							</span>
							<span className="val">
								<span className={"cov " + (work.length ? "live" : "none")}>
									{work.length} of {chosen.length}
								</span>
							</span>
						</div>
						<div className="row">
							<span>
								Already filed{" "}
								<span className="muted">
									{already.length
										? (over
											? "Override is on, so these are deleted and written again."
											: "Skipped. Tick Override to replace them.")
										: "Nothing in this selection has been pushed before."}
								</span>
							</span>
							<span className="val">
								<span className={"cov " + (already.length ? "part" : "live")}>
									{already.length}
								</span>
							</span>
						</div>
					</div>

					{err ? <div className="deerr"><b>Nothing further was pushed.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={busy || !ready}
							title={s.fileErr
								? "The attachments could not be read, so what is already filed is unknown."
								: work.length
									? `File ${work.length} letter${work.length === 1 ? "" : "s"} against ${work.length === 1 ? "its" : "their"} employee.`
									: chosen.length
										? "Every one of these is already filed. Tick Override to replace them."
										: "No issued letter matches."}
							onClick={() => void push()}>
							{busy ? `Pushing ${done} of ${work.length}…` : "Push"}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						<span className="bulkwhy">
							Writes one <span className="mono">File</span> per letter against the employee. It
							runs in this tab, so leaving the page stops it part-way — what is filed stays filed.
						</span>
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
