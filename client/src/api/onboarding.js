import { apiCreate, listAll } from "@/api/client";
import { todayIso } from "@/lib/format";

/* ---------------------------------------------------------------------------
   One Form response → a candidate on the site, which on hrms is three
   documents and not one.

   hrms' `Employee Onboarding` requires a `Job Applicant` and that applicant's
   `Job Offer` (found 24 September 2026, when the first upload was refused with
   "Value missing: Job Applicant, Job Offer, Onboarding Begins On"). A Form
   candidate never went through recruitment on the site, so both are made here
   from the Form's own answers — the applicant from the name, email and phone,
   the offer from the company and designation — and reused when they already
   exist, matched the way hrms itself keys them: an applicant by email (hrms
   refuses a second applicant with the same one), an offer by applicant.

   **The offer is a draft, marked Accepted.** Accepting is what the candidate
   did by filling in the joining form; *submitting* an offer is an HR decision
   and stays on the desk. manna_hr/onboard_sync.py makes the same three.
   --------------------------------------------------------------------------- */

/** The three documents one mapped response becomes. Pure. */
export function chainDocs(doc, today = todayIso()) {
	const applicant = {
		applicant_name: doc.employee_name || doc.custom_personal_email,
		email_id: doc.custom_personal_email,
		status: "Accepted",
	};
	if (doc.custom_cell_number) applicant.phone_number = doc.custom_cell_number;
	if (doc.designation) applicant.designation = doc.designation;

	const offer = {
		applicant_name: applicant.applicant_name,
		status: "Accepted",
		offer_date: today,
	};
	if (doc.designation) offer.designation = doc.designation;
	if (doc.company) offer.company = doc.company;

	/* Onboarding begins on the day they join; a response with no joining date
	   begins today, which HR can move. */
	const onboarding = { ...doc, boarding_begins_on: doc.date_of_joining || today };
	return { applicant, offer, onboarding };
}

async function firstName(doctype, filters) {
	const rows = await listAll(doctype, ["name"], filters);
	return rows?.[0]?.name || "";
}

/** Create one candidate, reusing the applicant and offer when they exist.
    Throws the site's own message, which the page prints against the email. */
export async function createCandidate(doc) {
	const { applicant, offer, onboarding } = chainDocs(doc);

	const applicantName = await firstName("Job Applicant", [["email_id", "=", applicant.email_id]])
		|| (await apiCreate("Job Applicant", applicant)).name;

	const offerName = await firstName("Job Offer", [["job_applicant", "=", applicantName], ["docstatus", "<", 2]])
		|| (await apiCreate("Job Offer", { ...offer, job_applicant: applicantName })).name;

	return apiCreate("Employee Onboarding", { ...onboarding, job_applicant: applicantName, job_offer: offerName });
}
