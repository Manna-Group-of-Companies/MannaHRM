import { api, apiCall, apiCreate, apiDelete, apiUpload, apiWrite, http, listAll, whoami } from "@/api/client";
import { CRITERIA_FIELDS, criteriaOf, explain, fromRating, guessSource, readContact, scoreResume, toRating } from "@/lib/resumescore";
import { kindOf, resumeText } from "@/lib/resumetext";

/* ---------------------------------------------------------------------------
   Recruitment on the site (12 October 2026): resumes from LinkedIn and Indeed,
   each one a `Job Applicant` on a `Job Opening`, scored out of ten. Added from
   an open seat on the hierarchy chart — features/employees/SeatResumes.jsx.

   **All stock hrms, and three fields of ours.** The position is a Job
   Opening; an applicant is a Job Applicant, `job_title` naming the opening and
   `source` naming LinkedIn or Indeed; the resume is the applicant's own
   `resume_attachment`, filed private; the score is hrms's `applicant_rating`,
   which the desk draws as stars. What hrms has no field for is what the score
   is measured against and why it came out as it did — `CRITERIA_FIELDS` on the
   opening and `custom_score_detail` on the applicant, in `manna_hr/install.py`.
   A site without them still takes resumes and keeps a rating; it cannot hold a
   position's criteria, so nothing is scored until they are applied.

   The score is advisory and is worked out here, in the browser, because it
   decides nobody's pay and rejects nobody — every applicant is created Open,
   and moving them on is HR's, on the site. What the site does enforce, it
   enforces: the required fields, a valid email, and a position's own
   "prevent duplicate applicant".
   --------------------------------------------------------------------------- */

/** Where these resumes come from, as `Job Applicant Source` records. */
export const SOURCES = ["LinkedIn", "Indeed"];

export const DETAIL_FIELD = "custom_score_detail";

const OPENING = ["name", "job_title", "designation", "company", "department", "status", "posted_on"];
const APPLICANT = ["name", "applicant_name", "email_id", "phone_number", "job_title", "source", "status",
	"applicant_rating", "resume_attachment", "creation"];

/** Every position, open ones first. `criteria` says whether the site has the
    fields a position's criteria are kept in — the long read is refused when
    it does not, and the short one is the stock doctype. */
export async function loadOpenings() {
	const order = (rows) => [...rows].sort((a, b) => (a.status === "Closed") - (b.status === "Closed")
		|| String(b.posted_on || "").localeCompare(String(a.posted_on || ""))
		|| String(a.job_title || "").localeCompare(String(b.job_title || "")));
	try {
		const rows = await listAll("Job Opening", OPENING.concat(Object.values(CRITERIA_FIELDS)));
		return { rows: order(rows), criteria: true };
	} catch {
		const rows = await listAll("Job Opening", OPENING);
		return { rows: order(rows), criteria: false };
	}
}

/** One position's applicants, best score first; unscored at the foot. */
export async function loadApplicants(opening) {
	const filters = [["job_title", "=", opening]];
	let rows;
	let detail = true;
	try {
		rows = await listAll("Job Applicant", APPLICANT.concat(DETAIL_FIELD), filters);
	} catch {
		rows = await listAll("Job Applicant", APPLICANT, filters);
		detail = false;
	}
	return { rows: rankApplicants(rows), detail };
}

/** An applicant's score out of ten, or null for one never scored.

    The site answers an unset Rating as 0, the same as a score of nought, so
    a zero is only believed when the breakdown beside it is a breakdown — each
    of its lines ends in points, "— 0/5". Without the breakdown field a zero
    is read as unscored: the safer of the two, since it puts nobody at the
    foot of the list for a number that may never have been worked out. */
export function storedScore(row) {
	const r = Number(row?.applicant_rating);
	if (!Number.isFinite(r)) return null;
	if (r > 0) return fromRating(r);
	return /— [\d.]+\/[\d.]+$/m.test(String(row?.[DETAIL_FIELD] || "")) ? 0 : null;
}

/** Best first; equal scores by who applied first; no score last. */
export function rankApplicants(rows) {
	const score = (r) => storedScore(r) ?? -1;
	return [...rows].sort((a, b) => score(b) - score(a) || String(a.creation || "").localeCompare(String(b.creation || "")));
}

/** A new position. hrms requires the title, designation and company. */
export async function createOpening({ job_title, designation, company, department }) {
	const doc = { job_title: job_title.trim(), designation, company, status: "Open" };
	if (department) doc.department = department;
	return apiCreate("Job Opening", doc);
}

/** How many resumes each opening holds, by opening name — one read for the
    whole chart rather than one per seat. */
export async function applicantCounts(openings) {
	const names = (openings || []).map((o) => o.name);
	if (!names.length) return {};
	const rows = await listAll("Job Applicant", ["job_title"], [["job_title", "in", names]], 500);
	const out = {};
	for (const r of rows) out[r.job_title] = (out[r.job_title] || 0) + 1;
	return out;
}

/* ---------------------------------------------------------------------------
   Criteria on a site without the fields (13 October 2026).

   The five `custom_*` fields need `tools/create_custom_fields.py --apply` and
   a System Manager key, and until somebody has run it HR could upload resumes
   and score none of them. So where the fields are missing, the criteria are a
   comment on the Job Opening — stock Frappe, written and read as the signed-in
   person, and readable by anybody who opens the opening on the desk. The latest
   one wins. Once the fields exist they are used instead, and these are ignored.
   --------------------------------------------------------------------------- */

export const NOTE_HEAD = "Resume scoring criteria";

const NOTE_LABEL = {
	must: "Must have",
	good: "Good to have",
	experience: "Minimum experience (years)",
	qualification: "Qualification",
	location: "Location",
};

/** The criteria as the comment's lines. */
export function criteriaNote(draft) {
	const lines = [NOTE_HEAD];
	for (const [key, label] of Object.entries(NOTE_LABEL)) lines.push(`${label}: ${String(draft[key] ?? "").trim()}`);
	return lines.join("\n");
}

const unhtml = (t) => String(t || "")
	.replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
	.replace(/<[^>]+>/g, "")
	.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
	.replace(/&quot;/g, "\"").replace(/&#39;/g, "'");

/** One comment back into the opening's criteria fields, or null when it is not
    a criteria comment. Frappe keeps a comment as HTML, so tags are read as the
    line breaks they stand for. */
export function parseCriteriaNote(content) {
	const lines = unhtml(content).split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines[0] !== NOTE_HEAD) return null;
	const out = {};
	for (const [key, label] of Object.entries(NOTE_LABEL)) {
		const line = lines.find((l) => l.startsWith(label + ":"));
		const v = line ? line.slice(label.length + 1).trim() : "";
		out[CRITERIA_FIELDS[key]] = key === "experience" ? Number(v) || 0 : v;
	}
	return out;
}

/** The latest criteria comment on an opening, as fields, or {} for none. */
export async function readCriteriaNote(name) {
	const r = await api("/api/method/frappe.desk.form.load.getdoc", { doctype: "Job Opening", name });
	const notes = (r?.docinfo?.comments || [])
		.map((c) => ({ at: String(c.creation || ""), fields: parseCriteriaNote(c.content) }))
		.filter((c) => c.fields)
		.sort((a, b) => b.at.localeCompare(a.at));
	return notes[0]?.fields || {};
}

/** The position's criteria, as typed. Only what changed is sent. `inFields`
    false writes them as a comment instead — see above. */
export async function saveCriteria(opening, draft, inFields = true) {
	const patch = {};
	for (const [key, field] of Object.entries(CRITERIA_FIELDS)) {
		const v = key === "experience" ? (Number(draft[key]) || 0) : String(draft[key] || "").trim();
		const was = key === "experience" ? (Number(opening[field]) || 0) : String(opening[field] || "");
		if (v !== was) patch[field] = v;
	}
	if (!Object.keys(patch).length) return { ok: true, patch };
	if (!inFields) {
		try {
			const user = await whoami();
			await apiCall("frappe.desk.form.utils.add_comment", {
				reference_doctype: "Job Opening", reference_name: opening.name,
				content: criteriaNote(draft).split("\n").join("<br>"), comment_email: user, comment_by: user,
			});
			return { ok: true, patch };
		} catch (e) {
			return { ok: false, error: e.message || String(e), patch };
		}
	}
	const r = await apiWrite("Job Opening", opening.name, patch);
	return { ...r, patch };
}

/** Remove one applicant (asked for 14 October 2026). Frappe deletes the
    resume filed against it with it, so nothing is left behind. hrms lets HR
    Manager delete an applicant and not HR User; a refusal is the site's own
    and is thrown for the panel to show. Somebody already interviewed or
    offered is linked from those records, and the site refuses them too. */
export async function removeApplicant(name) {
	await apiDelete("Job Applicant", name);
}

/** LinkedIn and Indeed as `Job Applicant Source`s, made if missing — `source`
    is a Link, and the site refuses an applicant naming a source it lacks. */
export async function ensureSources() {
	const have = new Set((await listAll("Job Applicant Source", ["name"])).map((r) => r.name));
	for (const s of SOURCES) if (!have.has(s)) await apiCreate("Job Applicant Source", { source_name: s });
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Why a row cannot be added, or "". `taken` is the emails already on this
    position, lower-cased; the site refuses a repeat on a position that
    prevents duplicates, and on any position it is the same person twice. */
export function problemOf(row, taken, batch) {
	if (!String(row.name || "").trim()) return "Name needed";
	const email = String(row.email || "").trim().toLowerCase();
	if (!email) return "Email needed";
	if (!EMAIL_OK.test(email)) return "Email not valid";
	if (taken.has(email)) return "Already applied";
	if (batch.filter((r) => String(r.email || "").trim().toLowerCase() === email).length > 1) return "Twice in this upload";
	return "";
}

/** One file, read and scored, as a row the page can show and correct. */
export async function readResume(file, opening, picked) {
	const { text, error } = await resumeText(file);
	const contact = readContact(text, file.name);
	const criteria = criteriaOf(opening);
	const result = error ? { score: null, why: error, parts: [] } : scoreResume(text, criteria);
	return {
		key: `${file.name}:${file.size}:${file.lastModified || 0}`,
		file,
		name: contact.name,
		email: contact.email,
		phone: contact.phone,
		source: guessSource(text, contact.email, picked),
		score: result.score,
		parts: result.parts,
		detail: explain(result, criteria),
	};
}

/**
 * Create the applicant, then file the resume on them.
 *
 * In that order because the resume is filed *against* the applicant. An
 * applicant whose resume failed to upload is still somebody who applied, and
 * is reported by name so the file can be attached on the desk.
 *
 * @returns {Promise<{name: string, attached: boolean, attachErr: string}>}
 */
export async function addApplicant(row, opening, detail) {
	const doc = {
		applicant_name: row.name.trim(),
		email_id: row.email.trim().toLowerCase(),
		job_title: opening.name,
		source: row.source,
		status: "Open",
	};
	if (String(row.phone || "").trim()) doc.phone_number = row.phone.trim();
	if (row.score != null) doc.applicant_rating = toRating(row.score);
	if (detail && row.detail) doc[DETAIL_FIELD] = row.detail;
	const app = await apiCreate("Job Applicant", doc);
	try {
		const f = await apiUpload(row.file, { doctype: "Job Applicant", name: app.name, field: "resume_attachment" });
		const w = await apiWrite("Job Applicant", app.name, { resume_attachment: f.file_url });
		return { name: app.name, attached: w.ok, attachErr: w.ok ? "" : w.error || "" };
	} catch (e) {
		return { name: app.name, attached: false, attachErr: e.message || String(e) };
	}
}

/** A filed resume, back as something `resumeText` can read. */
async function fetchResume(url) {
	const r = await http.get(url, { responseType: "arraybuffer", timeout: 120000 });
	const bytes = r.data;
	const name = decodeURIComponent(String(url).split("/").pop() || "resume");
	return { name, size: bytes.byteLength, arrayBuffer: async () => bytes };
}

/**
 * Score a position's applicants again, from the resumes filed on them —
 * after its criteria change. An applicant whose resume cannot be read keeps
 * the score they had: nothing new was learned about them.
 *
 * @returns {Promise<{changed: number, same: number, unread: string[], details: object}>}
 *   `details` is each breakdown by applicant, for a site with no field to keep it.
 */
export async function rescore(opening, rows, detail, onStep) {
	const criteria = criteriaOf(opening);
	let changed = 0;
	let same = 0;
	const unread = [];
	const details = {};
	let i = 0;
	for (const r of rows) {
		onStep?.(++i);
		if (!r.resume_attachment || !kindOf(r.resume_attachment)) { unread.push(r.applicant_name || r.name); continue; }
		let text;
		try {
			({ text } = await resumeText(await fetchResume(r.resume_attachment)));
		} catch { text = ""; }
		const result = scoreResume(text, criteria);
		if (result.score == null) { unread.push(r.applicant_name || r.name); continue; }
		details[r.name] = explain(result, criteria);
		const patch = { applicant_rating: toRating(result.score) };
		if (detail) patch[DETAIL_FIELD] = explain(result, criteria);
		if (Number(r.applicant_rating) === patch.applicant_rating && (!detail || r[DETAIL_FIELD] === patch[DETAIL_FIELD])) {
			same++;
			continue;
		}
		const w = await apiWrite("Job Applicant", r.name, patch);
		if (w.ok) changed++; else unread.push(`${r.applicant_name || r.name} (${w.error})`);
	}
	return { changed, same, unread, details };
}
