import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { NEW_EMP_BLANK } from "@/lib/newemp";
import { wizardFromCandidate } from "@/api/candidate";
import { loadCandidates } from "@/api/load";
import { go } from "@/routes/router";
import { deskUrl } from "@/lib/desk";
import { apiCall, apiWrite, getDoc } from "@/api/client";
import { createCandidate } from "@/api/onboarding";
import { EXTRA_FIELDS, dateOrder, mapRow, missingQuestions, planImport, readResponses } from "@/lib/onboardimport";
import { DEFAULT_SHEET, GOOGLE_CLIENT_ID, loadGoogle, readGoogleSheet, sheetRef } from "@/lib/googlesheet";
import { dmy, dmyTime, initials } from "@/lib/format";
import { Empty } from "@/components/ui";

/* ---------------------------------------------------------------------------
   Onboarding — an employee's own entry point, a Google Form instead of the
   ERPNext desk.

   **What this page is and is not.** `Employee Onboarding` is the candidate
   queue Employees → Import From Onboarding already reads (`ImportOnboarding.jsx`,
   `api/load.js`'s `loadCandidates`) — this page is a second door into the same
   queue, for a candidate who was never in front of somebody at HR to have their
   details typed in. It draws the queue the same way that page does and adds
   nothing that writes an Employee: pulling a candidate into one stays where it
   was.

   **The sync itself is server-side**, `manna_hr.onboard_sync.sync_onboarding_from_sheet`
   — CLAUDE.md §1: a rule that decided who becomes a candidate must run on the
   server's clock, under the server's own permission check, not in this file.
   Sync Now only asks the site to run it and then re-reads the queue; the hourly
   scheduler runs the same call so nobody has to remember to click it.
   --------------------------------------------------------------------------- */

/** The Form's own share link, as a fallback for a site where `manna_hr` is
    not installed yet — `onboarding_share_info` then answers "App manna_hr is
    not installed" rather than a URL, which is a real and currently-true state
    of the live site (docs/DOCTYPES.md §14) and must not make Share Google
    Form dead while that install is pending. Manna HR Settings' own
    `onboarding_form_url` is still what wins once the site can answer it —
    this is only what the button falls back to when it cannot. */
const FALLBACK_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScGaGc8zpQxruYDDcRMJX1xLjtUFzgdWFr3TGNW9SiA6Nr8tw/viewform";

/** Frappe's answer when the method's app is not on the site at all. */
const notInstalled = (msg) => /not installed|Failed to get method/i.test(String(msg || ""));

/** Where the Share link comes from, in order: the app's method; failing that,
    Manna HR Settings read directly — it is on the site as a custom Single even
    before the install, and a read is only a read; failing that, the Form's own
    link. Only the first can sync — the Sheet is read with an OAuth secret that
    must stay on the server, so without the app there is nothing to run it. */
async function readShareInfo() {
	try {
		const r = await apiCall("manna_hr.onboard_sync.onboarding_share_info");
		return { state: "ok", url: r.form_url || "", lastSync: r.last_sync || "", err: "" };
	} catch (e) {
		const err = e.message || String(e);
		const doc = await getDoc("Manna HR Settings", "Manna HR Settings");
		return {
			state: "fallback",
			url: doc?.onboarding_form_url || FALLBACK_FORM_URL,
			lastSync: doc?.onboarding_last_sync || "",
			sheet: sheetRef(doc?.onboarding_sheet_id),
			err: notInstalled(err) ? "" : err,
		};
	}
}

/** Everything a candidate card shows, in reading order: who they are, how to
    reach them, the job, then the paperwork hrms hangs off every candidate.
    `[label, store key, kind, doctype to link to]` — keys are the store's
    spelling, without the `custom_` prefix (api/load.js). */
const DETAILS = [
	["Full Name", "employee_name"],
	["First Name", "first_name"],
	["Last Name", "last_name"],
	["Date Of Birth", "date_of_birth", "date"],
	["Personal Email", "personal_email"],
	["Mobile No", "cell_number"],
	["Company", "company"],
	["Department", "department"],
	["Designation", "designation"],
	["Grade", "employee_grade"],
	["Date Of Joining", "date_of_joining", "date"],
	["Onboarding Begins On", "boarding_begins_on", "date"],
	["Emp Code", "employee_number"],
	["Job Applicant", "job_applicant", "", "Job Applicant"],
	["Job Offer", "job_offer", "", "Job Offer"],
	["Employee", "employee", "", "Employee"],
	["Onboarding ID", "name", "", "Employee Onboarding"],
	["Submitted On", "creation", "time"],
	/* The rest of the Google Form — stored on the record once its fields
	   exist on the site, and shown from the last Sheet read until then. */
	["Form Submitted At", "form_timestamp", "time"],
	["Current Address", "current_address"],
	["Permanent Address", "permanent_address"],
	["Aadhaar Number", "aadhaar_number"],
	["Other Identity Proof / ID Number", "other_id_proof"],
	["Marital Status", "marital_status"],
	["Family Members", "family_members"],
	["Family Member Details", "family_details"],
	["Covered by Other Insurance?", "other_insurance"],
	["Insurance Provider", "insurance_provider"],
	["Insurance Policy Number", "insurance_policy_no"],
	["Highest Qualification", "highest_qualification"],
];

/** Open Create Employee with this candidate's answers in the boxes, and the
    candidate remembered so it is marked Completed once the Employee exists. */
function toWizard(c) {
	const w = wizardFromCandidate(c);
	const blank = NEW_EMP_BLANK();
	set({ newemp: { ...blank, f: { ...blank.f, ...w.f }, extra: w.extra, from: w.from, fromName: w.fromName } });
	go({ section: "employees", subtab: "new" });
}

export default function Onboarding() {
	const s = useApp();
	const [share, setShare] = useState({ state: "loading", url: "", lastSync: "", err: "" });
	const [sync, setSync] = useState({ busy: false, msg: "", err: "" });
	const [copied, setCopied] = useState(false);

	useEffect(() => { void loadCandidates(); }, []);

	useEffect(() => {
		let dead = false;
		/* Falls back rather than going dead: an install still pending on the
		   site must not cost HR the one button this page exists for. */
		void readShareInfo().then((r) => { if (!dead) setShare(r); });
		return () => { dead = true; };
	}, []);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(share.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			/* Clipboard access can be refused by the browser. The link is still
			   selectable text on the page, so nothing is lost — just the one-click
			   convenience. */
		}
	}

	async function syncNow() {
		setSync({ busy: true, msg: "", err: "" });
		try {
			const r = await apiCall("manna_hr.onboard_sync.sync_onboarding_from_sheet");
			const bits = [];
			if (r.created) bits.push(`${r.created} new`);
			if (r.updated) bits.push(`${r.updated} updated`);
			if (r.skipped) bits.push(`${r.skipped} skipped`);
			setSync({
				busy: false,
				msg: bits.length ? bits.join(", ") + "." : "Nothing new in the sheet.",
				err: r.errors && r.errors.length ? r.errors.join(" ") : "",
			});
			setShare((sh) => ({ ...sh, lastSync: new Date().toISOString() }));
			void loadCandidates(true);
		} catch (e) {
			setSync({ busy: false, msg: "", err: e.message || String(e) });
		}
	}

	/* Upload Responses — the Form's answers as a file, while Sync Now cannot
	   run. See lib/onboardimport.js. `plan` is what the file would do, shown
	   before anything is written. */
	const [up, setUp] = useState({ busy: false, file: "", plan: null, msg: "", err: "" });
	/* The designation for responses that gave none. hrms will not save a Job
	   Offer without one, and a guessed designation is somebody's wrong job
	   title — so HR picks it from the site's own list, and Import waits. */
	const [desig, setDesig] = useState("");
	/* The last Sheet read, by email, in the site's field names — what a card
	   falls back to for an answer the site has no field to hold yet. In this
	   tab only: it is candidates' personal details and is not kept anywhere. */
	const [sheet, setSheet] = useState({});
	function keepSheet(rows) {
		const order = dateOrder(rows);
		const by = {};
		for (const r of rows) {
			const d = mapRow(r, order);
			if (d.custom_personal_email) by[d.custom_personal_email] = { ...(by[d.custom_personal_email] || {}), ...d };
		}
		setSheet(by);
	}

	/* Loaded as the page opens so the sign-in popup opens inside the click. */
	useEffect(() => { if (GOOGLE_CLIENT_ID) loadGoogle().catch(() => {}); }, []);

	/** What the rows would do. Frappe drops a field its doctype does not have
	    without a word, so on a site without the extra Form fields they are
	    left out here — before the preview counts, or it would promise updates
	    that change nothing, every time. */
	function planFor(rows) {
		const plan = { ...planImport(rows, s.cands || []), missing: missingQuestions(rows) };
		if (s.candTier === "extra") return plan;
		const keep = (d) => {
			const out = { ...d };
			for (const f of EXTRA_FIELDS) delete out[f];
			return out;
		};
		return {
			...plan,
			unstored: true,
			creates: plan.creates.map(keep),
			updates: plan.updates.map((u) => ({ ...u, patch: keep(u.patch) }))
				.filter((u) => Object.keys(u.patch).length),
		};
	}

	async function fromGoogle() {
		setUp({ busy: true, file: "", plan: null, msg: "", err: "" });
		try {
			const rows = await readGoogleSheet(share.sheet || DEFAULT_SHEET);
			keepSheet(rows);
			setUp({ busy: false, file: `Google Sheet (${rows.length} responses)`, plan: planFor(rows), msg: "", err: "" });
		} catch (err) {
			setUp({ busy: false, file: "", plan: null, msg: "", err: err.message || String(err) });
		}
	}

	async function pickFile(e) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		try {
			const got = await readResponses(file);
			keepSheet(got);
			const plan = planFor(got);
			setUp({ busy: false, file: file.name, plan, msg: "", err: "" });
		} catch (err) {
			setUp({ busy: false, file: file.name, plan: null, msg: "", err: err.message || String(err) });
		}
	}

	/* One document at a time, and a refusal does not stop the rest: each row is
	   its own candidate, and the site's message is kept against the email it
	   was about. */
	async function runImport() {
		const { plan } = up;
		setUp((u) => ({ ...u, busy: true }));
		let made = 0;
		let changed = 0;
		const errs = [];
		for (const doc of plan.creates.map((d) => (d.designation ? d : { ...d, designation: desig }))) {
			try { await createCandidate(doc); made++; } catch (e) {
				errs.push(`${doc.custom_personal_email}: ${e.message || e}`);
			}
		}
		for (const u of plan.updates) {
			const r = await apiWrite("Employee Onboarding", u.name, u.patch);
			if (r.ok) changed++; else errs.push(`${u.email}: ${r.error}`);
		}
		const bits = [];
		if (made) bits.push(`${made} new`);
		if (changed) bits.push(`${changed} updated`);
		setUp({ busy: false, file: "", plan: null, msg: (bits.join(", ") || "Nothing brought in") + ".", err: errs.join(" · ") });
		void loadCandidates(true);
	}

	/* The match is on Personal Email, which is our Custom Field on the stock
	   doctype. A site without it (`candTier` "standard") cannot tell a new
	   candidate from a repeat, so the upload waits for the field rather than
	   creating a duplicate on every upload. */
	const canUpload = s.candState === "ok" && (s.candTier === "full" || s.candTier === "extra");

	const rows = s.cands || [];
	const noDesig = up.plan ? up.plan.creates.filter((d) => !d.designation).length : 0;

	return (
		<div className="fhcat onbtab">
			<header>
				<h3>Onboarding</h3>
				<span className="n">
					{s.candState === "ok" ? `${rows.length} submission(s)` : null}
				</span>
				{/* Somebody HR is enrolling in person, with no Form to fill in —
				    the same Create Employee wizard Employee Master's Add opens,
				    so there is one way to make an employee and one set of checks
				    on the Emp Code and Machine Code (lib/newemp.js). */}
				<span className="right">
					<button className="embtn pri" aria-label="Add New Employee"
						title="Create Employee — Basic Details, Job Details, Job Organization. Saved to the ERPNext site."
						onClick={() => go({ section: "employees", subtab: "new" })}>
						+ Add New Employee
					</button>
				</span>
			</header>

			<div className="onbbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
				<button
					className="embtn pri out"
					disabled={(share.state !== "ok" && share.state !== "fallback") || !share.url}
					title={share.state === "ok" && !share.url
						? "No Google Form URL is set on Manna HR Settings yet."
						: "Copy the Google Form's share link, to send to an employee."}
					onClick={copyLink}
				>
					{copied ? "Link copied" : "Share Google Form"}
				</button>
				{share.url ? (
					<a className="embtn" href={share.url} target="_blank" rel="noopener noreferrer"
						title="Open the Google Form in a new tab.">
						Open Form
					</a>
				) : null}
				<button
					className="embtn"
					disabled={sync.busy || share.state !== "ok"}
					title={share.state === "fallback"
						? "Sync Now runs on the site, in the Manna HR app, which is not installed there yet. It reads the responses Sheet with a Google login that must stay on the server."
						: share.state === "loading"
							? "Reading Form settings — wait for that first."
							: "Ask the site to read the linked Google Sheet again and bring in anything new."}
					onClick={() => void syncNow()}
				>
					{sync.busy ? "Syncing…" : "Sync Now"}
				</button>
				<button className="embtn pri"
					disabled={!canUpload || up.busy || !GOOGLE_CLIENT_ID}
					title={!GOOGLE_CLIENT_ID
						? "Needs a Google OAuth client id of type Web application, set as VITE_GOOGLE_CLIENT_ID in client/.env — see .env.example. Until then, Upload Responses."
						: !canUpload
							? "Waiting for the onboarding queue — or Employee Onboarding on this site has no Personal Email field yet: python tools/create_custom_fields.py \"Employee Onboarding\" --apply"
							: "Sign in to Google as somebody the responses Sheet is shared with, and read it. Nothing is written until you press Import."}
					onClick={() => void fromGoogle()}>
					{up.busy && !up.plan ? "Reading Sheet…" : "Sync from Google Sheet"}
				</button>
				<label className={"embtn" + (canUpload && !up.busy ? "" : " off")}
					title={canUpload
						? "The Form's responses as a file: in the responses Google Sheet, File → Download → .xlsx or .csv, then choose it here. Nothing is written until you press Import."
						: s.candTier === "standard"
							? "Employee Onboarding on this site has no Personal Email field yet, which is what a response is matched on. Run: python tools/create_custom_fields.py \"Employee Onboarding\" --apply"
							: "Waiting for the onboarding queue to be read."}>
					Upload Responses
					<input type="file" accept=".xlsx,.csv" hidden disabled={!canUpload || up.busy}
						aria-label="Upload Form responses" onChange={(e) => void pickFile(e)} />
				</label>
				<span className="text-fine text-ink-3">
					{share.state === "loading" ? "Reading Form settings…"
						: share.state === "fallback"
							? (share.err
								? `Share works. Sync Now is unavailable — the site answered: ${share.err}`
								: "Sync Now starts working once the Manna HR app is installed on the site — until then, Sync from Google Sheet or Upload Responses.")
							: share.lastSync ? `Last synced ${dmyTime(share.lastSync)}`
								: "Never synced yet"}
				</span>
			</div>

			{up.plan ? (
				<div className="onbmsg">
					<b>{up.file}</b>: {up.plan.creates.length} new, {up.plan.updates.length} to update
					{up.plan.skipped.length ? `, skipped — ${up.plan.skipped.map((k) => k.email ? `${k.email} (${k.why})` : k.why).join("; ")}` : ""}.
					{up.plan.unstored ? (
						<> Addresses, Aadhaar, family, insurance and qualification are shown on the cards from
						the Sheet but <b>not saved</b> — the site has no fields for them yet. Run{" "}
						<code>python tools/create_custom_fields.py "Employee Onboarding" --apply</code>.</>
					) : null}
					{up.plan.missing?.length ? (
						<> No column for: <b>{up.plan.missing.join(", ")}</b> — the Sheet's column titles have to be
						these Form questions word for word.</>
					) : null}
					{" "}
					{noDesig ? (
						<label className="lbl">
							{" "}{noDesig} with no Designation — use:{" "}
							<select aria-label="Designation for responses without one" value={desig}
								onChange={(e) => setDesig(e.target.value)}>
								<option value="">— choose —</option>
								{(s.designations || []).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
							</select>{" "}
						</label>
					) : null}
					<button className="embtn pri"
						disabled={up.busy || !(up.plan.creates.length || up.plan.updates.length) || (noDesig > 0 && !desig)}
						title={noDesig > 0 && !desig ? "Choose a designation for the responses that gave none — a Job Offer cannot be saved without one." : undefined}
						onClick={() => void runImport()}>
						{up.busy ? "Importing…" : "Import"}
					</button>
					{" "}
					<button className="embtn" disabled={up.busy}
						onClick={() => setUp({ busy: false, file: "", plan: null, msg: "", err: "" })}>
						Cancel
					</button>
				</div>
			) : null}
			{up.msg ? <div className="onbmsg">{up.msg}</div> : null}
			{up.err ? <div className="onbmsg">Not brought in: {up.err}</div> : null}

			{sync.msg ? <div className="onbmsg">{sync.msg}</div> : null}
			{sync.err ? (
				<div className="onbmsg">
					Some rows in the sheet could not be brought in: {sync.err}
				</div>
			) : null}

			{s.candState === "loading" ? (
				<Empty title="Reading the onboarding queue…">
					Employee Onboarding is read when this page opens.
				</Empty>
			) : s.candState === "error" ? (
				<Empty title="The onboarding queue could not be read">
					{s.candErr}
				</Empty>
			) : !rows.length ? (
				<Empty title="Nobody has submitted the form yet">
					Share the Google Form with an employee. Once somebody has filled it in, download the
					responses Sheet (File → Download → .xlsx) and use Upload Responses.
				</Empty>
			) : (
				<div className="onblist">
					{rows.map((c) => (
						<article className={"onbcard" + (c.employee ? " done" : "")} key={c.name}>
							<div className="top">
								<i className="onbav" aria-hidden="true">{initials(c.employee_name)}</i>
								<span className="who">
									<b>{c.employee_name || c.name}</b>
									<span className="sub">
										{[c.designation, c.department].filter(Boolean).join(" · ") || "-"}
									</span>
								</span>
								<span className={"cov " + (c.employee ? "live" : c.boarding_status === "In Process" ? "part" : "off")}>
									{c.employee ? "Pulled" : (c.boarding_status || "Pending")}
								</span>
								{/* Gone once they are an employee — a second record for one
								    person is the mistake this queue exists to stop. */}
								{!c.employee ? (
									<button className="embtn pri ml-auto"
										aria-label={`Create Employee from ${c.employee_name || c.name}`}
										title="Open Create Employee filled in from this candidate. Add the Emp Code, Machine Code and anything else missing, then Create."
										onClick={() => toWizard(c)}>
										Create Employee
									</button>
								) : null}
							</div>
							<div className="onbgrid">
								{DETAILS.map(([label, key, kind, doctype]) => {
									const fromSheet = sheet[String(c.personal_email || "").toLowerCase()]?.["custom_" + key];
									const v = c[key] || (EXTRA_FIELDS.includes("custom_" + key) ? fromSheet : "");
									const shown = !v ? null
										: kind === "date" ? dmy(v)
											: kind === "time" ? dmyTime(v)
												: String(v);
									return (
										<div className="onbc" key={key}>
											<span className="k">{label}</span>
											<span className={"v" + (shown && doctype && s.site ? " link" : "")}>
												{!shown ? <i className="dash">-</i>
													: doctype && s.site ? (
														<a href={deskUrl(s.site, doctype, v)} target="_blank"
															rel="noopener noreferrer" title={`Open this ${doctype} on the ERPNext site.`}>
															{shown}
														</a>
													) : shown}
											</span>
										</div>
									);
								})}
							</div>
						</article>
					))}
				</div>
			)}
		</div>
	);
}
