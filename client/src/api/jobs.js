/* ---------------------------------------------------------------------------
   Recruitment, as the HRDashboard reference draws it (21 October 2026), on
   hrms's Job Opening and Job Applicant — the records the hierarchy chart's
   Resumes panel already files resumes against (api/recruitment.js).

   **The stages are hrms's, not HR's own (D5).** The reference lets HR name
   the stages of a hiring pipeline; Job Applicant's status is a fixed list —
   Open, Replied, Hold, Accepted, Rejected — and a job is Open or Closed.
   Naming stages needs fields the site does not have, and adding them waits for
   your OK. So the pipeline's columns are hrms's statuses, and moving somebody
   is writing that status.
   --------------------------------------------------------------------------- */

import { apiCreate, apiUpload, apiWrite, listAll } from "@/api/client";
import { getState, set } from "@/store";
import { DETAIL_FIELD, loadOpenings } from "@/api/recruitment";

/** The pipeline, in hrms's order; Rejected is drawn apart, as the reference's. */
export const STAGES = ["Open", "Replied", "Hold", "Accepted"];
export const REJECTED = "Rejected";
/** What each status reads as on the reference's cards. */
export const STAGE_LABEL = { Open: "Applied", Replied: "Contacted", Hold: "On hold", Accepted: "Hired", Rejected: "Rejected" };
export const JOB_STATUS = ["Open", "Closed"];

/* The fields the Resumes panel reads (api/recruitment.js) and no more: a
   field this site's Job Applicant has not got refuses the whole read. */
const APPLICANT = ["name", "applicant_name", "email_id", "phone_number", "job_title", "source", "status",
	"applicant_rating", "resume_attachment", "creation"];

/** Every opening and every applicant, read together. Applicants carry their
    opening's name in `job_title` (a Link, despite its name). */
export async function loadRecruitment({ fresh = false } = {}) {
	const cur = getState().rec;
	if (!fresh && (cur.state === "loading" || cur.state === "ok")) return;
	set({ rec: { ...cur, state: "loading" } });
	try {
		const [openings, apps] = await Promise.all([
			loadOpenings(),
			listAll("Job Applicant", APPLICANT.concat(DETAIL_FIELD), null, 500)
				.then((rows) => ({ rows, detail: true }))
				.catch(() => listAll("Job Applicant", APPLICANT, null, 500).then((rows) => ({ rows, detail: false }))),
		]);
		set({ rec: { state: "ok", jobs: openings.rows, criteria: openings.criteria, apps: apps.rows, detail: apps.detail, err: "" } });
	} catch (e) {
		set({ rec: { ...cur, state: "error", err: String(e?.message || e).slice(0, 240) } });
	}
}

/** Move an applicant: their status, as the signed-in person. */
/** Name, email, phone and source, as HR corrects them. */
export async function editApplicant(name, f) {
	const doc = { applicant_name: f.name.trim(), email_id: f.email.trim().toLowerCase(), phone_number: f.phone.trim(), source: f.source || "" };
	const r = await apiWrite("Job Applicant", name, doc);
	if (!r.ok && /closed Job Opening/i.test(r.error || "")) throw new Error("This job is closed. Set it to Open, then edit the candidate.");
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
	if (f.cv) {
		const up = await apiUpload(f.cv, { doctype: "Job Applicant", name, field: "resume_attachment" });
		const w = await apiWrite("Job Applicant", name, { resume_attachment: up.file_url });
		if (!w.ok) throw new Error(w.error || "The CV was not attached.");
		doc.resume_attachment = up.file_url;
	}
	const { rec } = getState();
	set({ rec: { ...rec, apps: rec.apps.map((a) => (a.name === name ? { ...a, ...doc } : a)) } });
}

export async function setApplicantStatus(name, status) {
	const r = await apiWrite("Job Applicant", name, { status });
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
	const { rec } = getState();
	set({ rec: { ...rec, apps: rec.apps.map((a) => (a.name === name ? { ...a, status } : a)) } });
}

/** Open or close a job. A closed one leaves the hierarchy chart too. */
export async function setJobStatus(name, status) {
	const r = await apiWrite("Job Opening", name, { status });
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
	const { rec } = getState();
	set({ rec: { ...rec, jobs: rec.jobs.map((j) => (j.name === name ? { ...j, status } : j)) } });
}

/** A job's own fields, as the reference's Edit job changes them. */
export async function saveJob(name, patch) {
	const r = await apiWrite("Job Opening", name, patch);
	if (!r.ok) throw new Error(r.error || "The site would not save it.");
	await loadRecruitment({ fresh: true });
}

/* ---- notes: the site's own comments on the applicant ---------------------- */

export const readNotes = (name) => listAll("Comment", ["name", "content", "owner", "creation", "comment_email"],
	[["reference_doctype", "=", "Job Applicant"], ["reference_name", "=", name], ["comment_type", "=", "Comment"]])
	.then((rows) => rows.sort((a, b) => String(b.creation).localeCompare(String(a.creation))));

export const addNote = (name, text) => apiCreate("Comment", {
	comment_type: "Comment", reference_doctype: "Job Applicant", reference_name: name,
	content: String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
});

/** One person added by hand, from a column's +, into that column's stage.
    Job Applicant has no location or experience field, so those two travel as
    a note on the applicant rather than being dropped. The CV is filed after
    the applicant exists, and a CV that will not upload leaves the applicant
    standing — somebody who applied is not undone by a failed attachment. */
export async function addCandidate(f) {
	const doc = {
		applicant_name: f.name.trim(),
		email_id: f.email.trim().toLowerCase(),
		job_title: f.job,
		status: f.stage || "Open",
	};
	if (f.phone.trim()) doc.phone_number = f.phone.trim();
	if (f.source) doc.source = f.source;
	// hrms's own field for the employee who referred them; it shows only for a referral source.
	if (f.referrer && /referral/i.test(f.source)) doc.source_name = f.referrer;
	const app = await apiCreate("Job Applicant", doc);
	const said = [f.location.trim() && `Location: ${f.location.trim()}`, String(f.exp).trim() && `Experience: ${String(f.exp).trim()} years`].filter(Boolean);
	if (said.length) await addNote(app.name, said.join(" · ")).catch(() => null);
	let cvErr = "";
	if (f.cv) {
		try {
			const up = await apiUpload(f.cv, { doctype: "Job Applicant", name: app.name, field: "resume_attachment" });
			const w = await apiWrite("Job Applicant", app.name, { resume_attachment: up.file_url });
			if (!w.ok) cvErr = w.error || "The CV was not attached.";
		} catch (e) {
			cvErr = e.message || String(e);
		}
	}
	await loadRecruitment({ fresh: true });
	return { name: app.name, cvErr };
}

/* ---- settings -------------------------------------------------------------- */

export const readSources = () => listAll("Job Applicant Source", ["name", "source_name"]);
export const addSource = (source_name) => apiCreate("Job Applicant Source", { source_name: source_name.trim() });
export const readTemplates = () => listAll("Email Template", ["name", "subject"]).catch(() => []);
