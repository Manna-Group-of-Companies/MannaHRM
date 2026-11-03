/* ---------------------------------------------------------------------------
   Checklist → Onboarding and Offboarding, started here (29 October 2026, HR:
   "create all the ERPNext doctypes" — not the desk).

   Everything is hrms's own: `Employee Onboarding` and `Employee Separation`,
   their two templates, and the `Task` each activity becomes. **hrms makes the
   Tasks when the document is submitted** (its boarding controller's
   on_submit), so a checklist is made submitted, in one step — a draft would
   list activities that tick nothing. Its activities are copied off the
   template HR picked, then edited; the template is not changed by it.

   An onboarding is for somebody who is not an Employee yet, and hrms will not
   have one without a `Job Applicant` and that applicant's `Job Offer` behind
   it — api/onboarding.js makes or reuses those, as the joining form does.

   Pure: no network, so what is sent can be argued about without a site.
   --------------------------------------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const whole = (v) => Math.max(0, Math.round(Number(v) || 0));

/** One activity as hrms's Employee Boarding Activity row: a task, who does it
    (a login, else everybody with a role), and when — days after the
    checklist begins, and how many it is given. */
export function activityRow(a) {
	const row = { activity_name: String(a.activity_name || "").trim(), begin_on: whole(a.begin_on), duration: whole(a.duration) || 1 };
	if (String(a.user || "").trim()) row.user = String(a.user).trim();
	if (String(a.role || "").trim()) row.role = String(a.role).trim();
	return row;
}

/** A template's activities, as the start form's first draft of them. */
export const activitiesFrom = (template) => (template?.activities || []).map((a) => activityRow(a));

/** What is wrong with a list of activities, or "". */
export function checkActivities(list) {
	if (!list.length) return "Add at least one task.";
	const blank = list.findIndex((a) => !String(a.activity_name || "").trim());
	if (blank >= 0) return `Task ${blank + 1} has no name.`;
	const bad = list.find((a) => String(a.user || "").trim() && !EMAIL.test(String(a.user).trim()));
	if (bad) return `"${bad.user}" is not a login email.`;
	return "";
}

/** What is wrong with the offboarding form, or "". */
export function checkSeparation(f, emp) {
	if (!f.employee || !emp) return "Pick the person who is leaving.";
	if (!ISO.test(f.begins || "")) return "Choose the day the handover begins.";
	if (f.resigned && !ISO.test(f.resigned)) return "The resignation date is not a date.";
	return checkActivities(f.activities || []);
}

/** The Employee Separation to make, submitted. */
export function separationDoc(f, emp) {
	const doc = {
		employee: emp.name,
		employee_name: emp.employee_name || emp.name,
		company: emp.company,
		boarding_begins_on: f.begins,
		activities: (f.activities || []).map(activityRow),
	};
	if (emp.department) doc.department = emp.department;
	if (emp.designation) doc.designation = emp.designation;
	if (f.resigned) doc.resignation_letter_date = f.resigned;
	if (f.template) doc.employee_separation_template = f.template;
	return doc;
}

/** What is wrong with the onboarding form, or "". The email is what hrms
    keys a Job Applicant on, so it is required. */
export function checkOnboarding(f) {
	if (!String(f.name || "").trim()) return "Type the new joiner's name.";
	if (!EMAIL.test(String(f.email || "").trim())) return "Type the new joiner's email.";
	if (!f.company) return "Pick the company.";
	if (!ISO.test(f.joining || "")) return "Choose the joining date.";
	return checkActivities(f.activities || []);
}

/** The Employee Onboarding to make, as api/onboarding.js chainDocs takes it.
    The checklist begins on the joining date. */
export function onboardingDoc(f) {
	const doc = {
		employee_name: String(f.name).trim(),
		custom_personal_email: String(f.email).trim(),
		company: f.company,
		date_of_joining: f.joining,
		boarding_begins_on: f.joining,
		activities: (f.activities || []).map(activityRow),
	};
	if (String(f.phone || "").trim()) doc.custom_cell_number = String(f.phone).trim();
	if (f.department) doc.department = f.department;
	if (f.designation) doc.designation = f.designation;
	if (f.template) doc.employee_onboarding_template = f.template;
	return doc;
}

/** What is wrong with a template, or "". */
export function checkTemplate(f) {
	if (!String(f.title || "").trim()) return "Name the template.";
	return checkActivities(f.activities || []);
}

/** A template as hrms holds it. Who it is for — a company, department or
    designation — is optional; blank is everybody. `title` is the name HR gave
    it; a site whose template has no such field keeps its own name. */
export function templateDoc(f) {
	const doc = { title: String(f.title).trim(), activities: (f.activities || []).map(activityRow) };
	for (const k of ["company", "department", "designation"]) doc[k] = f[k] || "";
	return doc;
}
