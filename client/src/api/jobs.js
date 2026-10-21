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

import { apiCreate, apiWrite, listAll } from "@/api/client";
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

/* ---- settings -------------------------------------------------------------- */

export const readSources = () => listAll("Job Applicant Source", ["name", "source_name"]);
export const addSource = (source_name) => apiCreate("Job Applicant Source", { source_name: source_name.trim() });
export const readTemplates = () => listAll("Email Template", ["name", "subject"]).catch(() => []);
