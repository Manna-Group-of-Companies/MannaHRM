import { apiCreate, apiWrite } from "@/api/client";

/* ---------------------------------------------------------------------------
   Pulling one candidate — the write behind Employee Master → Import employee(s)
   from onboarding.

   **It is two writes, and the order matters.** Create the `Employee`, then mark
   the candidate as taken. Not the other way round: a candidate marked Completed
   over an Employee that was refused is a joiner who has vanished from the queue
   without existing anywhere, and nobody would find out until they turned up on
   their first day. The failure this order can produce is the opposite one — a
   real employee whose candidate still says Pending — which is visible, is
   reported by the caller, and costs a duplicate at worst rather than a person.

   So the mark is reported separately rather than folded into the result. The
   page says "created, but the candidate could not be marked" when that happens,
   with the employee's id in the sentence, because the next thing somebody does
   with that sentence is go and look.

   Both writes need the server started with `ERP_WRITE=1`. A read-only run
   refuses the first one and nothing else is attempted.
   --------------------------------------------------------------------------- */

/** The document a candidate becomes.

    Blank fields are left out rather than sent empty, for the reason
    `employeeDoc` in lib/newemp.js gives: an empty string on a Link field is a
    request to link to a record named "", which the site validates and refuses,
    where sending nothing at all simply leaves the field unset.

    Not sent: `employee_name`. The site derives it from the three name parts on
    validate, so a value sent here would be overwritten on the way in — and a
    field that looks set and is not is worse than one that is plainly derived.

    `status: "Active"` is seeded rather than asked. It is what a new hire is,
    and it is true of every record this screen will ever create; the wizard on
    `/employees/new` makes the same call for the same reason.

    `employee_grade` becomes `grade` — the two doctypes spell the same thing
    differently, and this is the one place that has to know it. */
export function employeeFromCandidate(c, code) {
	const doc = {
		status: "Active",
		employee_number: String(code || "").trim(),
		salutation: c.salutation,
		first_name: c.first_name,
		last_name: c.last_name,
		date_of_birth: c.date_of_birth,
		date_of_joining: c.date_of_joining,
		cell_number: c.cell_number,
		personal_email: c.personal_email,
		company: c.company,
		department: c.department,
		designation: c.designation,
		grade: c.employee_grade,
	};

	/* A candidate entered whole-name-only — which is what a site on the stock
	   ERPNext doctype gives us, since `first_name` is ours — still has to become
	   somebody. Split on the first space, which is right for "Ganesh Iyer" and
	   wrong for nobody in a way that loses information: the whole string is
	   preserved across the two fields either way. */
	if (!doc.first_name) {
		const whole = String(c.employee_name || "").trim();
		const cut = whole.indexOf(" ");
		doc.first_name = cut < 0 ? whole : whole.slice(0, cut);
		if (cut >= 0) doc.last_name = whole.slice(cut + 1);
	}

	for (const k of Object.keys(doc)) {
		const v = typeof doc[k] === "string" ? doc[k].trim() : doc[k];
		if (v === "" || v == null) delete doc[k];
		else doc[k] = v;
	}
	return doc;
}

/** Create the employee, then say so on the candidate.

    Throws when the *create* is refused — the caller has a card on screen and
    the site's own refusal is the useful half of that failure, so it is passed
    through whole rather than flattened into a boolean.

    Returns `{emp, marked, markErr}`. `marked` false with the employee present
    is the one outcome worth reading carefully: the person exists and the queue
    does not know it yet.

    @returns {Promise<{emp: object, marked: boolean, markErr: string}>} */
export async function pullCandidate(c, code) {
	const emp = await apiCreate("Employee", employeeFromCandidate(c, code));

	const mark = await apiWrite("Employee Onboarding", c.name, {
		employee: emp.name,
		boarding_status: "Completed",
	});

	return { emp, marked: mark.ok, markErr: mark.ok ? "" : mark.error || "" };
}
