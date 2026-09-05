import { useState } from "react";

import { Modal } from "@/components/ui";
import { RunInBackground, SheetDrop, useSheet } from "@/features/onboard/sheet";
import { download, toCsv } from "@/lib/csv";
import { useApp } from "@/store";

/* ---------------------------------------------------------------------------
   Factor HR's **Send Bulk Email to Employee** dialog, photographed 4 September
   2026 — the fourth off their letter register, and the only one of the four
   whose main button cannot work here.

   Six controls: letter type, a To Email Address picker, CC and BCC, an
   Employee radio pair with a file upload behind one of them, and a Send
   Password Protect File tick. Send and Cancel underneath.

   **Send is dead, and it is dead for a reason this screen already states.** The
   envelope on the register beside these buttons has carried it since the page
   was written: nothing here can send mail. The proxy holds a read token and no
   mail path, there is no queue to hand a job to, and a `mailto:` cannot carry
   letters as attachments. Adding an SMTP credential to a dashboard is not a
   feature, it is a decision about where this company's mail comes from.

   So this draws their dialog, resolves every address it would have used, says
   exactly what would go out — and writes that list to a file instead of
   pretending to send it. Which is what the same note on the envelope already
   promised: "Export writes the same rows to a file, which is the part a browser
   can do."

   **The addresses are the finding.** Resolving them is not decoration: it is
   the only way to know, before anybody commits to a mail merge, how many people
   have no address on the field being sent to. On this site that number is zero
   — every employee carries all three — and that is worth seeing rather than
   assuming.
   --------------------------------------------------------------------------- */

/** Their To / CC / BCC dropdowns pick a *field*, not an address: "CompanyEmail"
    means "each person's company email". Three on ERPNext's Employee, and the
    labels are theirs. */
const ADDRESS = [
	["company_email", "CompanyEmail"],
	["prefered_email", "PreferredEmail"],
	["personal_email", "PersonalEmail"],
];

const SEND_DEAD = "Nothing on this dashboard can send mail. The proxy holds a read token and no mail "
	+ "path, there is no queue to hand the job to, and a mailto: cannot carry letters as attachments. "
	+ "Putting an SMTP credential behind this button is a decision about where the company's mail comes "
	+ "from, not a feature to add quietly. Download the send list instead — it is the same job, handed "
	+ "to something that can post it.";

const LOCK_DEAD = "Their tick puts each letter in a password-protected file and mails the password "
	+ "separately. Encrypting a PDF or a ZIP needs a library this app does not carry, and there is "
	+ "nothing to attach it to while Send cannot send — so it is drawn where theirs is and does nothing.";

export default function EmailLetters({ onClose }) {
	const s = useApp();
	const up = useSheet();

	const [type, setType] = useState("");
	const [to, setTo] = useState("company_email");
	const [cc, setCc] = useState("");
	const [bcc, setBcc] = useState("");
	const [pick, setPick] = useState("all");

	const types = s.letterTypes || [];

	/* The people this would mail: everybody with a letter of the chosen type,
	   or the ones named in an uploaded sheet. Keyed off the letters rather than
	   off the directory, because the subject of the mail is a letter — an
	   employee with none has nothing to be sent. */
	const codes = up.sheet
		? new Set(up.sheet.rows.map((r) => String(r.employee_number || "").trim().toUpperCase()).filter(Boolean))
		: null;

	const byName = {};
	for (const e of s.employees) byName[e.name] = e;

	const seen = new Set();
	const rows = [];
	for (const l of s.letters) {
		if (type && l.letter_type !== type) continue;
		const emp = byName[l.employee];
		if (!emp) continue;
		if (pick === "file") {
			if (!codes) continue;
			if (!codes.has(String(emp.employee_number || "").trim().toUpperCase())) continue;
		}
		/* One mail per letter, not per person: two letters to the same employee
		   are two documents and two sends. The set is only used to count how many
		   distinct people are involved, which is the number somebody sanity-checks
		   the job against. */
		seen.add(emp.name);
		rows.push({
			letter: l.name,
			letter_type: l.letter_type || "",
			letter_date: l.letter_date || "",
			employee_number: emp.employee_number || "",
			employee_name: emp.employee_name || emp.name,
			to: emp[to] || "",
			cc: cc ? emp[cc] || "" : "",
			bcc: bcc ? emp[bcc] || "" : "",
		});
	}

	/* The one thing worth knowing before a mail merge: who has no address on the
	   field being sent to. Nobody, on this site — which is itself the answer. */
	const noAddress = rows.filter((r) => !r.to).length;
	const noCode = !!up.sheet && !up.sheet.cols.includes("employee_number");
	const ready = rows.length > 0 && !noCode;

	function list() {
		download(
			`send-list-${(type || "all").toLowerCase().replace(/\s+/g, "-")}.csv`,
			toCsv(
				["letter", "letter_type", "letter_date", "employee_number", "employee_name", "to", "cc", "bcc"],
				rows.map((r) => [r.letter, r.letter_type, r.letter_date, r.employee_number,
					r.employee_name, r.to, r.cc, r.bcc]),
			),
		);
	}

	return (
		<Modal
			title="Send Bulk Email to Employee"
			extra={
				<div className="bulk">
					<div className="bulkcard">
						<div className="dlrange">
							<div>
								<label className="bulklab" htmlFor="em-type">Letter Type</label>
								<select id="em-type" className="dectl" value={type}
									title="Which issued letters this would mail. Left as it is, every type."
									onChange={(e) => setType(e.target.value)}>
									<option value="">select letter type</option>
									{types.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
								</select>
							</div>
							<div>
								<label className="bulklab" htmlFor="em-to">To Email Address</label>
								<select id="em-to" className="dectl" value={to}
									title="Their dropdown picks a field rather than an address: CompanyEmail means each person's own company email. All three are on ERPNext's Employee."
									onChange={(e) => setTo(e.target.value)}>
									{ADDRESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
								</select>
							</div>
							<div>
								<label className="bulklab" htmlFor="em-cc">CC Email</label>
								<select id="em-cc" className="dectl" value={cc}
									title="Copied on every mail. The same three fields — there is no free-text address here, because a bulk send copied to one typed address is one typo away from going somewhere else."
									onChange={(e) => setCc(e.target.value)}>
									<option value="">Select CC Email</option>
									{ADDRESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
								</select>
							</div>
							<div>
								<label className="bulklab" htmlFor="em-bcc">BCC Email</label>
								<select id="em-bcc" className="dectl" value={bcc}
									title="Blind copied on every mail."
									onChange={(e) => setBcc(e.target.value)}>
									<option value="">Select BCC Email</option>
									{ADDRESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
								</select>
							</div>
						</div>

						<span className="bulklab">Employee</span>
						<div className="emwho">
							<label>
								<input type="radio" name="em-pick" checked={pick === "all"}
									title="Everybody who has a letter of the chosen type."
									onChange={() => { setPick("all"); up.clear(); }} />
								All Employees
							</label>
							<label>
								<input type="radio" name="em-pick" checked={pick === "file"}
									title="Only the people named in a CSV of employee codes."
									onChange={() => setPick("file")} />
								File Upload
							</label>
						</div>

						{pick === "file" ? (
							<SheetDrop file={up.file} sheet={up.sheet} onTake={up.take}
								hint={<>A CSV of <span className="mono">employee_number</span> — the people to
									mail. Drag it here or click &ldquo;Browse Files&rdquo;.</>} />
						) : null}

						<RunInBackground />

						<label className="bulkrun" title={LOCK_DEAD}>
							<input type="checkbox" disabled onChange={() => {}} />
							Send Password Protect File
						</label>
					</div>

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{noCode ? (
						<div className="deerr">
							<b>That sheet has no <span className="mono">employee_number</span> column.</b>{" "}
							It carries {up.sheet.cols.join(", ") || "nothing"}.
						</div>
					) : null}

					<div className="rows bulkrows">
						<div className="row">
							<span>
								Would go out{" "}
								<span className="muted">
									One mail per letter — two letters to the same person are two documents and
									two sends.
								</span>
							</span>
							<span className="val">
								<span className={"cov " + (rows.length ? "live" : "none")}>
									{rows.length} to {seen.size} {seen.size === 1 ? "person" : "people"}
								</span>
							</span>
						</div>
						<div className="row">
							<span>
								No address{" "}
								<span className="muted">
									{noAddress
										? "These people have nothing on the field being sent to, so their letter would go nowhere."
										: "Everybody in this list has an address on the field being sent to."}
								</span>
							</span>
							<span className="val">
								<span className={"cov " + (noAddress ? "none" : "live")}>{noAddress}</span>
							</span>
						</div>
					</div>

					{/* Said on the dialog rather than only on the button. Send is the one
					    control on these four screens that cannot be made to work, and
					    somebody who opened this dialog to send mail should learn that
					    here rather than by hovering a greyed button. */}
					<div className="afnote">
						<b>Send cannot work here.</b> Nothing on this dashboard sends mail — the proxy holds a
						read token and no mail path, and a <span className="mono">mailto:</span> cannot carry
						letters as attachments. Putting an SMTP credential behind that button is a decision
						about where the company&rsquo;s mail comes from, not something to add quietly.{" "}
						<b>Download the send list</b> writes exactly what would have gone out — every letter,
						every resolved To, CC and BCC — for something that can post it.
					</div>

					<div className="defoot">
						<button className="btn tpl" disabled title={SEND_DEAD}>Send</button>
						<button className="btn ghost" onClick={onClose}>Cancel</button>
						{/* Ours, not theirs, and it is the reason this dialog is worth
						    opening. Marked as ours by sitting past Cancel rather than
						    beside Send. */}
						<button className="embtn" disabled={!ready}
							title={ready
								? `Write ${rows.length} row(s) — letter, employee, and the resolved To, CC and BCC.`
								: "Nothing matches, so there is no list to write."}
							onClick={list}>
							Download the send list
						</button>
						<span className="bulkwhy">
							Nothing here is sent and nothing is written to the site. The list is a file on this
							machine.
						</span>
					</div>
				</div>
			}
			onClose={onClose}
		/>
	);
}
